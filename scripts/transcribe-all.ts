import { batchSmartTranscribe } from "../server/ringcentral";
import { storage } from "../server/storage";

async function transcribeAll() {
  // Get count of calls needing transcription
  const calls = await storage.getCallsNeedingTranscription(5000);
  console.log('Total calls needing transcription:', calls.length);
  
  if (calls.length === 0) {
    console.log('All calls are already transcribed!');
    return;
  }
  
  // Process in smaller batches to avoid rate limiting
  const BATCH_SIZE = 10;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let batchNum = 1;
  
  while (true) {
    console.log(`\n--- Batch ${batchNum} (${new Date().toLocaleTimeString()}) ---`);
    const result = await batchSmartTranscribe(BATCH_SIZE);
    console.log(`Processed: ${result.processed}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
    
    // If we hit rate limits (many errors), pause longer
    if (result.errors > result.processed) {
      console.log('Hit rate limits, pausing for 30 seconds...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    if (result.processed === 0 && result.skipped === 0 && result.errors === 0) {
      console.log('No more calls to process');
      break;
    }
    
    totalProcessed += result.processed;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
    batchNum++;
    
    // Progress update every 5 batches
    if (batchNum % 5 === 0) {
      console.log(`\n=== Progress: ${totalProcessed} transcribed, ${totalSkipped} skipped, ${totalErrors} errors ===\n`);
    }
    
    // Pause between batches to avoid rate limiting
    console.log('Pausing 10 seconds between batches...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Total transcribed: ${totalProcessed}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);
}

transcribeAll().catch(console.error);
