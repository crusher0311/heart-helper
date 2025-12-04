import { SDK } from "@ringcentral/sdk";
import { storage } from "./storage";
import type { InsertCallRecording, InsertRingcentralUser } from "@shared/schema";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// OpenAI client for Whisper transcription - uses direct OpenAI API (not Replit integration)
// because Replit's AI integration doesn't support the /audio/transcriptions endpoint
const whisperClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // Direct OpenAI API key for Whisper
});

const RC_SERVER = process.env.RINGCENTRAL_SERVER || "https://platform.ringcentral.com";
const RC_CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID;
const RC_CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET;
const RC_JWT_TOKEN = process.env.RINGCENTRAL_JWT_TOKEN;

let sdkInstance: SDK | null = null;
let platformInstance: any = null;

export async function getRingCentralPlatform() {
  if (platformInstance) {
    try {
      const isValid = await platformInstance.loggedIn();
      if (isValid) return platformInstance;
    } catch (e) {
      console.log("[RingCentral] Session expired, re-authenticating...");
    }
  }

  if (!RC_CLIENT_ID || !RC_CLIENT_SECRET || !RC_JWT_TOKEN) {
    throw new Error("RingCentral credentials not configured. Please set RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, and RINGCENTRAL_JWT_TOKEN");
  }

  sdkInstance = new SDK({
    server: RC_SERVER,
    clientId: RC_CLIENT_ID,
    clientSecret: RC_CLIENT_SECRET,
  });

  platformInstance = sdkInstance.platform();
  
  await platformInstance.login({
    jwt: RC_JWT_TOKEN,
  });

  console.log("[RingCentral] Successfully authenticated");
  return platformInstance;
}

export interface RCCallRecord {
  id: string;
  sessionId: string;
  startTime: string;
  duration: number;
  type: string;
  direction: string;
  from: {
    phoneNumber?: string;
    extensionId?: string;
    name?: string;
  };
  to: {
    phoneNumber?: string;
    extensionId?: string;
    name?: string;
  };
  recording?: {
    id: string;
    contentUri: string;
    type: string;
  };
  result: string;
}

export interface RCExtension {
  id: number;
  extensionNumber: string;
  name: string;
  type: string;
  status: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

export async function fetchCallLogs(
  dateFrom?: Date,
  dateTo?: Date,
  extensionId?: string
): Promise<RCCallRecord[]> {
  const platform = await getRingCentralPlatform();
  
  const params: Record<string, any> = {
    type: "Voice",
    view: "Detailed",
    perPage: 250,
    dateFrom: dateFrom?.toISOString() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  };

  if (dateTo) {
    params.dateTo = dateTo.toISOString();
  }

  const endpoint = extensionId 
    ? `/restapi/v1.0/account/~/extension/${extensionId}/call-log`
    : "/restapi/v1.0/account/~/call-log";

  const allRecords: RCCallRecord[] = [];
  let page = 1;

  try {
    while (true) {
      const response = await platform.get(endpoint, { ...params, page });
      const data = await response.json();
      
      if (data.records && data.records.length > 0) {
        allRecords.push(...data.records);
      }

      if (!data.navigation?.nextPage) {
        break;
      }
      page++;
    }
  } catch (error: any) {
    console.error("[RingCentral] Error fetching call logs:", error.message);
    throw error;
  }

  console.log(`[RingCentral] Fetched ${allRecords.length} call records`);
  return allRecords;
}

export async function fetchExtensions(): Promise<RCExtension[]> {
  const platform = await getRingCentralPlatform();
  
  try {
    const response = await platform.get("/restapi/v1.0/account/~/extension", {
      type: ["User"],
      status: "Enabled",
      perPage: 250,
    });
    
    const data = await response.json();
    console.log(`[RingCentral] Fetched ${data.records?.length || 0} extensions`);
    return data.records || [];
  } catch (error: any) {
    console.error("[RingCentral] Error fetching extensions:", error.message);
    throw error;
  }
}

export async function fetchRecordingContent(recordingId: string): Promise<Buffer> {
  const platform = await getRingCentralPlatform();
  
  try {
    const response = await platform.get(
      `/restapi/v1.0/account/~/recording/${recordingId}/content`
    );
    
    const buffer = await response.buffer();
    return buffer;
  } catch (error: any) {
    console.error("[RingCentral] Error fetching recording:", error.message);
    throw error;
  }
}

// Fetch transcript from RingSense API (if available)
export async function fetchRingSenseTranscript(recordingId: string): Promise<{
  transcript: string | null;
  summary: string | null;
  speakers: Array<{ name: string; text: string }>;
} | null> {
  const platform = await getRingCentralPlatform();
  
  try {
    // Try RingSense API for AI-generated transcript
    const response = await platform.get(
      `/ai/ringsense/v1/public/accounts/~/domains/pbx/records/${recordingId}/insights`
    );
    
    const data = await response.json();
    
    // Extract transcript text from RingSense response
    let transcriptText = "";
    const speakers: Array<{ name: string; text: string }> = [];
    
    if (data.transcript && Array.isArray(data.transcript)) {
      // RingSense returns transcript as array of utterances
      transcriptText = data.transcript.map((u: any) => {
        const speaker = u.speakerName || u.speaker || "Unknown";
        const text = u.text || u.content || "";
        speakers.push({ name: speaker, text });
        return `${speaker}: ${text}`;
      }).join("\n");
    } else if (data.transcription) {
      transcriptText = data.transcription;
    }
    
    console.log(`[RingCentral] Fetched RingSense transcript for recording ${recordingId}`);
    
    return {
      transcript: transcriptText || null,
      summary: data.summary || data.abstractiveSummary || null,
      speakers,
    };
  } catch (error: any) {
    // RingSense might not be available - this is expected for some accounts
    if (error.message?.includes("404") || error.message?.includes("403")) {
      console.log(`[RingCentral] RingSense not available for recording ${recordingId}`);
    } else {
      console.log(`[RingCentral] RingSense error for ${recordingId}:`, error.message);
    }
    return null;
  }
}

// Fetch transcript using RingCentral's AI Speech-to-Text API (fallback)
export async function fetchSpeechToTextTranscript(recordingId: string): Promise<string | null> {
  const platform = await getRingCentralPlatform();
  
  try {
    // Get the recording content URI first
    const recordingResponse = await platform.get(
      `/restapi/v1.0/account/~/recording/${recordingId}`
    );
    const recordingData = await recordingResponse.json();
    const contentUri = recordingData.contentUri;
    
    if (!contentUri) {
      console.log(`[RingCentral] No content URI for recording ${recordingId}`);
      return null;
    }
    
    // Submit for async transcription
    const transcribeResponse = await platform.post(
      "/ai/audio/v1/async/speech-to-text",
      {
        contentUri: contentUri,
        encoding: "Mpeg",
        languageCode: "en-US",
        enableSpeakerDiarization: true,
        enablePunctuation: true,
      }
    );
    
    const jobData = await transcribeResponse.json();
    const jobId = jobData.jobId;
    
    if (!jobId) {
      console.log(`[RingCentral] No job ID returned for transcription`);
      return null;
    }
    
    // Poll for completion (max 60 seconds)
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await platform.get(`/ai/audio/v1/async/speech-to-text/${jobId}`);
      const statusData = await statusResponse.json();
      
      if (statusData.status === "completed" || statusData.status === "Completed") {
        // Build transcript from utterances
        if (statusData.utterances && Array.isArray(statusData.utterances)) {
          const transcriptText = statusData.utterances.map((u: any) => {
            const speaker = u.speakerId ? `Speaker ${u.speakerId}` : "Speaker";
            return `${speaker}: ${u.text}`;
          }).join("\n");
          
          console.log(`[RingCentral] Speech-to-text completed for recording ${recordingId}`);
          return transcriptText;
        }
        return statusData.transcript || null;
      } else if (statusData.status === "failed" || statusData.status === "Failed") {
        console.log(`[RingCentral] Speech-to-text failed for recording ${recordingId}`);
        return null;
      }
    }
    
    console.log(`[RingCentral] Speech-to-text timeout for recording ${recordingId}`);
    return null;
  } catch (error: any) {
    console.log(`[RingCentral] Speech-to-text error for ${recordingId}:`, error.message);
    return null;
  }
}

// Main function to get transcript - tries RingSense first, then Speech-to-Text
export async function fetchTranscript(recordingId: string): Promise<{
  transcriptText: string | null;
  transcriptJson: any | null;
  summary: string | null;
}> {
  // Try RingSense first (fastest if available)
  const ringSenseResult = await fetchRingSenseTranscript(recordingId);
  if (ringSenseResult?.transcript) {
    return {
      transcriptText: ringSenseResult.transcript,
      transcriptJson: { speakers: ringSenseResult.speakers, source: "ringsense" },
      summary: ringSenseResult.summary,
    };
  }
  
  // Fall back to Speech-to-Text API
  const sttTranscript = await fetchSpeechToTextTranscript(recordingId);
  if (sttTranscript) {
    return {
      transcriptText: sttTranscript,
      transcriptJson: { source: "speech-to-text" },
      summary: null,
    };
  }
  
  return { transcriptText: null, transcriptJson: null, summary: null };
}

export async function fetchCallRecordingUri(recordingId: string): Promise<string | null> {
  const platform = await getRingCentralPlatform();
  
  try {
    const response = await platform.get(
      `/restapi/v1.0/account/~/recording/${recordingId}`
    );
    
    const data = await response.json();
    return data.contentUri || null;
  } catch (error: any) {
    console.error("[RingCentral] Error fetching recording URI:", error.message);
    return null;
  }
}

export interface ShopLocationMapping {
  extensionPattern?: string;
  phoneNumberPrefix?: string;
  shopId: string;
  shopName: string;
}

const SHOP_MAPPINGS: ShopLocationMapping[] = [
  { shopId: "EV", shopName: "Evanston", phoneNumberPrefix: "" },
  { shopId: "WM", shopName: "Wilmette", phoneNumberPrefix: "" },
  { shopId: "NB", shopName: "Northbrook", phoneNumberPrefix: "" },
];

export function determineShopFromExtension(extensionId: string): string | null {
  for (const mapping of SHOP_MAPPINGS) {
    if (mapping.extensionPattern && extensionId.match(new RegExp(mapping.extensionPattern))) {
      return mapping.shopId;
    }
  }
  return null;
}

export async function syncCallRecords(
  dateFrom?: Date,
  dateTo?: Date
): Promise<{ synced: number; skipped: number; errors: number }> {
  const stats = { synced: 0, skipped: 0, errors: 0 };
  
  try {
    const callLogs = await fetchCallLogs(dateFrom, dateTo);
    
    for (const call of callLogs) {
      try {
        const existing = await storage.getCallRecordingByRingcentralId(call.id);
        if (existing) {
          stats.skipped++;
          continue;
        }

        const customerPhone = call.direction === "Inbound" 
          ? call.from.phoneNumber 
          : call.to.phoneNumber;

        const callRecord: InsertCallRecording = {
          ringcentralCallId: call.id,
          ringcentralRecordingId: call.recording?.id || null,
          ringcentralSessionId: call.sessionId || null,
          direction: call.direction.toLowerCase(),
          customerPhone: customerPhone || null,
          customerName: call.direction === "Inbound" ? call.from.name : call.to.name,
          durationSeconds: call.duration,
          recordingUrl: call.recording?.contentUri || null,
          recordingStatus: call.recording ? "available" : "none",
          callStartTime: new Date(call.startTime),
          callEndTime: new Date(new Date(call.startTime).getTime() + call.duration * 1000),
        };

        await storage.createCallRecording(callRecord);
        stats.synced++;
      } catch (error: any) {
        console.error(`[RingCentral] Error syncing call ${call.id}:`, error.message);
        stats.errors++;
      }
    }
  } catch (error: any) {
    console.error("[RingCentral] Error in syncCallRecords:", error.message);
    throw error;
  }

  console.log(`[RingCentral] Sync complete: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`);
  return stats;
}

export async function syncExtensionMappings(): Promise<{ synced: number; updated: number }> {
  const stats = { synced: 0, updated: 0 };
  
  try {
    const extensions = await fetchExtensions();
    
    for (const ext of extensions) {
      const existing = await storage.getRingcentralUserByExtensionId(ext.id.toString());
      
      if (existing) {
        stats.updated++;
      } else {
        console.log(`[RingCentral] Found unmapped extension: ${ext.extensionNumber} - ${ext.name}`);
        stats.synced++;
      }
    }
  } catch (error: any) {
    console.error("[RingCentral] Error syncing extensions:", error.message);
    throw error;
  }

  return stats;
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  accountInfo?: any;
}> {
  try {
    const platform = await getRingCentralPlatform();
    const response = await platform.get("/restapi/v1.0/account/~");
    const accountInfo = await response.json();
    
    return {
      success: true,
      message: "Successfully connected to RingCentral",
      accountInfo: {
        id: accountInfo.id,
        mainNumber: accountInfo.mainNumber,
        operator: accountInfo.operator,
        serviceInfo: accountInfo.serviceInfo,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to connect: ${error.message}`,
    };
  }
}

export async function getCallsForUser(
  userId: string,
  dateFrom?: Date,
  dateTo?: Date,
  limit?: number
) {
  return storage.getCallRecordingsForUser(userId, dateFrom, dateTo, limit);
}

export async function getCallsForShop(
  shopId: string,
  dateFrom?: Date,
  dateTo?: Date,
  limit?: number
) {
  return storage.getCallRecordingsForShop(shopId, dateFrom, dateTo, limit);
}

export async function getAllCalls(
  dateFrom?: Date,
  dateTo?: Date,
  limit?: number
) {
  return storage.getAllCallRecordings(dateFrom, dateTo, limit);
}

// =====================================================
// SMART TRANSCRIPTION WITH OPENAI WHISPER
// =====================================================

// Keywords that indicate a sales/customer call worth coaching
const SALES_KEYWORDS = [
  'inspection', 'repair', 'estimate', 'warranty', 'brake', 'oil change',
  'appointment', 'vehicle', 'car', 'truck', 'service', 'maintenance',
  'diagnostic', 'check engine', 'tire', 'alignment', 'transmission',
  'engine', 'customer', 'price', 'cost', 'quote', 'authorize', 'approval',
  'pick up', 'drop off', 'ready', 'parts', 'labor', 'technician', 'mechanic',
  'schedule', 'bring it in', 'look at it', 'fix', 'problem', 'noise', 'issue'
];

// Keywords that indicate non-coaching calls (vendors, spam, etc)
const SKIP_KEYWORDS = [
  'parts order', 'delivery', 'fedex', 'ups', 'vendor', 'supplier',
  'sales call', 'solicitation', 'insurance', 'warranty company',
  'wrong number', 'robo', 'press 1', 'survey', 'political'
];

// Customer name patterns that suggest vendor/spam calls
const VENDOR_NAME_PATTERNS = [
  /zone\s*(il|in|wi|oh|mi)/i,  // Chicago Zone IL, etc.
  /parts\s*(plus|authority|source)/i,
  /napa/i, /autozone/i, /o'reilly/i, /advance\s*auto/i,
  /worldpac/i, /carquest/i,
  /insurance/i, /warranty/i, /solicitor/i
];

export function isLikelyVendorCall(customerName: string | null): boolean {
  if (!customerName) return false;
  return VENDOR_NAME_PATTERNS.some(pattern => pattern.test(customerName));
}

export function isSalesCall(transcript: string): boolean {
  const lowerTranscript = transcript.toLowerCase();
  
  // Check for skip keywords first
  const hasSkipKeyword = SKIP_KEYWORDS.some(kw => lowerTranscript.includes(kw));
  if (hasSkipKeyword) return false;
  
  // Count sales keywords - need at least 2 to be considered a sales call
  const salesKeywordCount = SALES_KEYWORDS.filter(kw => 
    lowerTranscript.includes(kw)
  ).length;
  
  return salesKeywordCount >= 2;
}

/**
 * Download recording from RingCentral and save to temp file
 */
async function downloadRecording(recordingId: string): Promise<string | null> {
  try {
    const buffer = await fetchRecordingContent(recordingId);
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `rc_recording_${recordingId}.mp3`);
    await fs.promises.writeFile(tempFile, buffer);
    console.log(`[Whisper] Downloaded recording to ${tempFile} (${buffer.length} bytes)`);
    return tempFile;
  } catch (error: any) {
    console.error(`[Whisper] Failed to download recording ${recordingId}:`, error.message);
    return null;
  }
}

/**
 * Trim audio file to first N seconds using ffmpeg
 */
async function trimAudio(inputPath: string, durationSeconds: number): Promise<string> {
  const outputPath = inputPath.replace('.mp3', `_trimmed_${durationSeconds}s.mp3`);
  
  try {
    await execAsync(
      `ffmpeg -y -i "${inputPath}" -t ${durationSeconds} -acodec copy "${outputPath}" 2>/dev/null`
    );
    console.log(`[Whisper] Trimmed audio to ${durationSeconds}s: ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    // If copy fails, try re-encoding
    try {
      await execAsync(
        `ffmpeg -y -i "${inputPath}" -t ${durationSeconds} -acodec libmp3lame -q:a 4 "${outputPath}" 2>/dev/null`
      );
      return outputPath;
    } catch (e: any) {
      console.error(`[Whisper] Failed to trim audio:`, e.message);
      throw e;
    }
  }
}

/**
 * Transcribe audio file using OpenAI Whisper API
 */
async function transcribeWithWhisper(audioPath: string): Promise<string | null> {
  try {
    const audioFile = fs.createReadStream(audioPath);
    
    const transcription = await whisperClient.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
      response_format: "text",
    });
    
    console.log(`[Whisper] Transcribed ${audioPath}: ${transcription.substring(0, 100)}...`);
    return transcription;
  } catch (error: any) {
    console.error(`[Whisper] Transcription failed:`, error.message);
    return null;
  }
}

/**
 * Clean up temp files
 */
async function cleanupTempFiles(...files: string[]) {
  for (const file of files) {
    try {
      if (file && fs.existsSync(file)) {
        await fs.promises.unlink(file);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export interface SmartTranscriptionResult {
  success: boolean;
  callId: string;
  isSalesCall: boolean;
  transcriptText: string | null;
  sampleOnly: boolean;  // true if we only transcribed the sample
  skipped: boolean;     // true if skipped due to vendor/duration
  skipReason?: string;
  costSaved?: number;   // estimated cents saved by not transcribing full call
}

/**
 * Transcribe call recording - transcribes ALL calls to build training dataset
 * Users can mark non-sales calls manually, which helps train future AI detection
 */
export async function smartTranscribeCall(
  callId: string,
  recordingId: string,
  durationSeconds: number | null,
  customerName: string | null
): Promise<SmartTranscriptionResult> {
  const result: SmartTranscriptionResult = {
    success: false,
    callId,
    isSalesCall: false,
    transcriptText: null,
    sampleOnly: false,
    skipped: false,
  };
  
  // Pre-filter: Skip very short calls (under 10 seconds - these are typically hang-ups)
  // Treat unknown duration as "try it anyway"
  const actualDuration = durationSeconds ?? 60; // Assume 60s if unknown
  if (actualDuration < 10) {
    result.skipped = true;
    result.skipReason = "Call too short (under 10 seconds)";
    console.log(`[Whisper] Skipping call ${callId}: too short (${actualDuration}s)`);
    return result;
  }
  
  // NOTE: We intentionally do NOT filter by vendor name anymore
  // We want to transcribe everything to build training data
  // Users will mark non-sales calls manually
  
  // Download the recording
  const audioPath = await downloadRecording(recordingId);
  if (!audioPath) {
    result.skipReason = "Failed to download recording";
    return result;
  }
  
  let trimmedPath: string | null = null;
  
  try {
    // Transcribe the full recording - we'll let users mark non-sales calls manually
    // This builds training data for future AI learning
    console.log(`[Whisper] Transcribing full ${durationSeconds}s recording...`);
    const fullTranscript = await transcribeWithWhisper(audioPath);
    
    if (fullTranscript) {
      result.success = true;
      result.transcriptText = fullTranscript;
      // Still detect if it looks like a sales call for stats, but transcribe everything
      result.isSalesCall = isSalesCall(fullTranscript);
      result.sampleOnly = false;
    } else {
      result.skipReason = "Failed to transcribe recording";
    }
    
    return result;
  } finally {
    // Clean up temp files
    await cleanupTempFiles(audioPath, trimmedPath || "");
  }
}

/**
 * Batch smart transcription for multiple calls
 */
export async function batchSmartTranscribe(
  limit: number = 25
): Promise<{
  processed: number;
  salesCalls: number;
  skipped: number;
  errors: number;
  totalCostSaved: number;
  results: SmartTranscriptionResult[];
}> {
  const stats = {
    processed: 0,
    salesCalls: 0,
    skipped: 0,
    errors: 0,
    totalCostSaved: 0,
    results: [] as SmartTranscriptionResult[],
  };
  
  // Get calls that need transcription
  const calls = await storage.getCallsNeedingTranscription(limit);
  console.log(`[Whisper] Processing ${calls.length} calls for smart transcription`);
  
  for (const call of calls) {
    if (!call.ringcentralRecordingId) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await smartTranscribeCall(
        call.id,
        call.ringcentralRecordingId,
        call.durationSeconds, // Pass null if undefined, function will handle it
        call.customerName || null
      );
      
      stats.results.push(result);
      
      if (result.skipped) {
        stats.skipped++;
        // Mark as processed but not a sales call
        await storage.updateCallTranscript(call.id, {
          transcript: null,
          transcriptJson: { skipped: true, reason: result.skipReason },
          isSalesCall: false,
        });
      } else if (result.success) {
        stats.processed++;
        if (result.isSalesCall) stats.salesCalls++;
        if (result.costSaved) stats.totalCostSaved += result.costSaved;
        
        // Save the transcript
        await storage.updateCallTranscript(call.id, {
          transcript: result.transcriptText,
          transcriptJson: { 
            source: "whisper", 
            sampleOnly: result.sampleOnly,
            isSalesCall: result.isSalesCall,
          },
          isSalesCall: result.isSalesCall,
        });
      } else {
        stats.errors++;
        console.error(`[Whisper] Failed to transcribe call ${call.id}: ${result.skipReason}`);
      }
    } catch (error: any) {
      stats.errors++;
      console.error(`[Whisper] Error processing call ${call.id}:`, error.message);
    }
    
    // Longer delay between calls to avoid RingCentral rate limiting
    // RingCentral has strict rate limits on recording downloads
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`[Whisper] Batch complete: ${stats.processed} processed, ${stats.salesCalls} sales calls, ${stats.skipped} skipped, ${stats.errors} errors`);
  console.log(`[Whisper] Estimated savings: $${(stats.totalCostSaved / 100).toFixed(2)}`);
  
  return stats;
}
