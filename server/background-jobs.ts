import { storage } from "./storage";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRANSCRIBE_DELAY_MS = 15 * 1000; // 15 seconds between transcriptions (RingCentral rate limit)

let isRunning = false;
let lastSyncTime: Date | null = null;
let lastTranscribeTime: Date | null = null;

async function syncAndTranscribe() {
  if (isRunning) {
    console.log("[Background] Skipping - previous job still running");
    return;
  }

  isRunning = true;
  const startTime = new Date();
  console.log(`[Background] Starting sync job at ${startTime.toLocaleTimeString()}`);

  try {
    // Step 1: Sync new calls from RingCentral (last 24 hours)
    const { syncCallRecords, smartTranscribeCall, isSalesCall } = await import("./ringcentral");
    const dateFrom = new Date();
    dateFrom.setHours(dateFrom.getHours() - 24); // Last 24 hours
    
    const syncStats = await syncCallRecords(dateFrom);
    lastSyncTime = new Date();
    console.log(`[Background] Synced: ${syncStats.synced} new, ${syncStats.skipped} existing, ${syncStats.errors} errors`);

    // Step 2: Transcribe calls that need it (one at a time with delays)
    // Get up to 20 calls to transcribe in this batch
    const callsToTranscribe = await storage.getCallsNeedingTranscription(20);
    
    if (callsToTranscribe.length === 0) {
      console.log("[Background] No calls need transcription");
    } else {
      console.log(`[Background] Transcribing ${callsToTranscribe.length} calls...`);
      
      let transcribed = 0;
      let skipped = 0;
      let errors = 0;

      for (const call of callsToTranscribe) {
        try {
          // Use the smart transcribe function which handles everything
          const result = await smartTranscribeCall(
            call.id,
            call.ringcentralRecordingId || "",
            call.durationSeconds || 0,
            call.customerName || null
          );
          
          if (result.transcriptText) {
            // Determine if it's a sales call
            const salesCall = isSalesCall(result.transcriptText);
            
            await storage.updateCallRecording(call.id, {
              transcriptText: result.transcriptText,
              transcript: {
                transcribedAt: new Date().toISOString(),
                source: "whisper",
                durationSeconds: call.durationSeconds,
                isSalesCall: salesCall
              }
            });
            transcribed++;
            console.log(`[Background] Transcribed call ${call.id.slice(0, 8)}... (${result.transcriptText.length} chars, sales: ${salesCall})`);
          } else if (result.skipReason) {
            await storage.updateCallRecording(call.id, {
              transcript: { skipped: true, reason: result.skipReason }
            });
            skipped++;
          } else {
            await storage.updateCallRecording(call.id, {
              transcript: { failed: true, reason: "Unknown error" }
            });
            errors++;
          }

          // Wait between calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, TRANSCRIBE_DELAY_MS));
          
        } catch (error: any) {
          console.error(`[Background] Error transcribing call ${call.id}:`, error.message);
          await storage.updateCallRecording(call.id, {
            transcript: { failed: true, reason: error.message }
          });
          errors++;
        }
      }

      lastTranscribeTime = new Date();
      console.log(`[Background] Transcription complete: ${transcribed} done, ${skipped} skipped, ${errors} errors`);
    }

  } catch (error: any) {
    console.error("[Background] Job error:", error.message);
  } finally {
    isRunning = false;
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    console.log(`[Background] Job completed in ${duration}s`);
  }
}

export function startBackgroundJobs() {
  console.log("[Background] Starting background jobs (sync every 5 minutes)");
  
  // Run immediately on startup
  setTimeout(() => {
    console.log("[Background] Running initial sync...");
    syncAndTranscribe();
  }, 10000); // Wait 10 seconds after server starts
  
  // Then run every 5 minutes
  setInterval(syncAndTranscribe, SYNC_INTERVAL_MS);
}

export function getBackgroundJobStatus() {
  return {
    isRunning,
    lastSyncTime: lastSyncTime?.toISOString() || null,
    lastTranscribeTime: lastTranscribeTime?.toISOString() || null,
    intervalMinutes: SYNC_INTERVAL_MS / 60000
  };
}
