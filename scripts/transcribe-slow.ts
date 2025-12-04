import { smartTranscribeCall } from "../server/ringcentral";
import { storage } from "../server/storage";

async function transcribeSlow() {
  console.log('=== SLOW TRANSCRIPTION MODE ===');
  console.log('Processing ONE call at a time with 15-second delays to respect RingCentral rate limits');
  console.log('');
  
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let consecutiveErrors = 0;
  
  while (true) {
    // Get just 1 call at a time
    const calls = await storage.getCallsNeedingTranscription(1);
    
    if (calls.length === 0) {
      console.log('\nNo more calls to process!');
      break;
    }
    
    const call = calls[0];
    console.log(`\n[${new Date().toLocaleTimeString()}] Processing call ${call.id} (${call.durationSeconds}s, ${call.customerName || 'Unknown'})`);
    
    if (!call.ringcentralRecordingId) {
      console.log('  Skipping: No recording ID');
      totalSkipped++;
      await storage.updateCallTranscript(call.id, {
        transcript: null,
        transcriptJson: { skipped: true, reason: 'No recording ID' },
        isSalesCall: false,
      });
      continue;
    }
    
    try {
      const result = await smartTranscribeCall(
        call.id,
        call.ringcentralRecordingId,
        call.durationSeconds,
        call.customerName || null
      );
      
      if (result.skipped) {
        console.log(`  Skipped: ${result.skipReason}`);
        totalSkipped++;
        await storage.updateCallTranscript(call.id, {
          transcript: null,
          transcriptJson: { skipped: true, reason: result.skipReason },
          isSalesCall: false,
        });
        consecutiveErrors = 0;
      } else if (result.success) {
        console.log(`  SUCCESS! Transcribed ${result.transcriptText?.length || 0} chars, Sales call: ${result.isSalesCall}`);
        totalProcessed++;
        await storage.updateCallTranscript(call.id, {
          transcript: result.transcriptText,
          transcriptJson: { 
            source: "whisper", 
            sampleOnly: result.sampleOnly,
            isSalesCall: result.isSalesCall,
          },
          isSalesCall: result.isSalesCall,
        });
        consecutiveErrors = 0;
      } else {
        console.log(`  ERROR: ${result.skipReason}`);
        totalErrors++;
        consecutiveErrors++;
        
        // Mark as failed so we don't retry immediately
        await storage.updateCallTranscript(call.id, {
          transcript: null,
          transcriptJson: { failed: true, reason: result.skipReason, timestamp: new Date().toISOString() },
          isSalesCall: false,
        });
      }
    } catch (error: any) {
      console.log(`  EXCEPTION: ${error.message}`);
      totalErrors++;
      consecutiveErrors++;
      
      // Mark as failed
      await storage.updateCallTranscript(call.id, {
        transcript: null,
        transcriptJson: { failed: true, reason: error.message, timestamp: new Date().toISOString() },
        isSalesCall: false,
      });
    }
    
    // Progress update
    if ((totalProcessed + totalSkipped + totalErrors) % 10 === 0) {
      console.log(`\n=== Progress: ${totalProcessed} transcribed, ${totalSkipped} skipped, ${totalErrors} errors ===\n`);
    }
    
    // Exponential backoff on consecutive errors
    let delay = 15000; // 15 seconds base delay
    if (consecutiveErrors > 0) {
      delay = Math.min(delay * Math.pow(2, consecutiveErrors), 300000); // Max 5 minutes
      console.log(`  Backing off for ${delay/1000}s due to ${consecutiveErrors} consecutive errors...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Total transcribed: ${totalProcessed}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);
}

transcribeSlow().catch(console.error);
