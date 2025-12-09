import { SDK } from "@ringcentral/sdk";
import { storage } from "./storage";
import { db } from "./db";
import { callRecordings, type InsertCallRecording, type InsertRingcentralUser } from "@shared/schema";
import { isNull, isNotNull } from "drizzle-orm";
import OpenAI from "openai";
import { AssemblyAI } from "assemblyai";
import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// OpenAI client for Whisper transcription (fallback)
const whisperClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// AssemblyAI client for high-quality transcription
const assemblyClient = process.env.ASSEMBLYAI_API_KEY 
  ? new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  : null;

// Deepgram client for high-quality transcription
const deepgramClient = process.env.DEEPGRAM_API_KEY
  ? createDeepgramClient(process.env.DEEPGRAM_API_KEY)
  : null;

// Transcription provider: 'deepgram', 'assemblyai', or 'whisper'
// Default from env, but can be overridden by database settings
const DEFAULT_TRANSCRIPTION_PROVIDER = process.env.TRANSCRIPTION_PROVIDER || 'deepgram';

// Get transcription provider from database settings with env fallback
async function getTranscriptionProvider(): Promise<string> {
  try {
    const settings = await storage.getSettings();
    return settings?.transcriptionProvider || DEFAULT_TRANSCRIPTION_PROVIDER;
  } catch (error) {
    console.log(`[Transcribe] Failed to get settings, using default provider: ${DEFAULT_TRANSCRIPTION_PROVIDER}`);
    return DEFAULT_TRANSCRIPTION_PROVIDER;
  }
}

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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const maxRetries = 3;

  try {
    while (true) {
      let retries = 0;
      let response;
      
      while (retries < maxRetries) {
        try {
          response = await platform.get(endpoint, { ...params, page });
          break; // Success, exit retry loop
        } catch (error: any) {
          if (error.response?.status === 429 || error.message?.includes('rate exceeded')) {
            const retryAfter = error.retryAfter || 60000;
            console.log(`[RingCentral] Rate limited on page ${page}, waiting ${retryAfter/1000}s before retry ${retries + 1}/${maxRetries}...`);
            await sleep(retryAfter);
            retries++;
          } else {
            throw error;
          }
        }
      }
      
      if (!response) {
        throw new Error(`Failed to fetch page ${page} after ${maxRetries} retries`);
      }
      
      const data = await response.json();
      
      if (data.records && data.records.length > 0) {
        allRecords.push(...data.records);
        if (page % 5 === 0) {
          console.log(`[RingCentral] Fetched ${allRecords.length} records so far (page ${page})...`);
        }
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

        // Determine the HEART employee's extension ID based on call direction
        // Inbound: employee is the recipient (to.extensionId)
        // Outbound: employee is the caller (from.extensionId)
        const employeeExtensionId = call.direction === "Inbound" 
          ? call.to.extensionId 
          : call.from.extensionId;

        // Look up the user ID from our RingCentral extension mappings
        let userId: string | null = null;
        let shopId: string | null = null;
        if (employeeExtensionId) {
          const rcUser = await storage.getRingcentralUserByExtensionId(employeeExtensionId);
          if (rcUser) {
            userId = rcUser.userId;
            shopId = rcUser.shopId || null;
          }
        }

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
          userId: userId,
          shopId: shopId,
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

export async function backfillSessionIds(
  daysBack: number = 90
): Promise<{ updated: number; notFound: number; alreadySet: number; errors: number; message: string }> {
  const stats = { updated: 0, notFound: 0, alreadySet: 0, errors: 0, message: '' };
  
  // Process in 7-day chunks to avoid rate limits
  const chunkDays = 7;
  const now = new Date();
  
  // Get all calls without sessionId from our database first
  const callsWithoutSession = await db
    .select({ 
      id: callRecordings.id, 
      ringcentralCallId: callRecordings.ringcentralCallId,
      callStartTime: callRecordings.callStartTime 
    })
    .from(callRecordings)
    .where(isNull(callRecordings.ringcentralSessionId));
  
  console.log(`[RingCentral] Found ${callsWithoutSession.length} calls in DB without sessionId`);
  
  if (callsWithoutSession.length === 0) {
    // Count already-set calls
    const callsWithSession = await db
      .select({ id: callRecordings.id })
      .from(callRecordings)
      .where(isNotNull(callRecordings.ringcentralSessionId));
    stats.alreadySet = callsWithSession.length;
    stats.message = `All ${stats.alreadySet} calls already have session IDs linked.`;
    return stats;
  }
  
  // Build a set of ringcentralCallIds we need to find
  const neededCallIds = new Set<string>();
  for (const call of callsWithoutSession) {
    if (call.ringcentralCallId) {
      neededCallIds.add(call.ringcentralCallId);
    }
  }
  
  console.log(`[RingCentral] Need to find sessionIds for ${neededCallIds.size} unique RingCentral call IDs`);
  
  // Build sessionId map by fetching in chunks
  const sessionMap = new Map<string, string>();
  let chunksProcessed = 0;
  let rateLimitHits = 0;
  
  for (let daysAgo = 0; daysAgo < daysBack; daysAgo += chunkDays) {
    const dateTo = new Date(now);
    dateTo.setDate(dateTo.getDate() - daysAgo);
    
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - Math.min(daysAgo + chunkDays, daysBack));
    
    try {
      console.log(`[RingCentral] Fetching calls from ${dateFrom.toLocaleDateString()} to ${dateTo.toLocaleDateString()}...`);
      const callLogs = await fetchCallLogs(dateFrom, dateTo);
      
      for (const call of callLogs) {
        if (call.sessionId && neededCallIds.has(call.id)) {
          sessionMap.set(call.id, call.sessionId);
        }
      }
      
      chunksProcessed++;
      console.log(`[RingCentral] Chunk ${chunksProcessed}: Found ${sessionMap.size} matching sessionIds so far`);
      
      // Small delay between chunks to avoid rate limiting
      await sleep(1000);
      
    } catch (error: any) {
      if (error.message?.includes('rate') || error.message?.includes('Rate')) {
        rateLimitHits++;
        console.log(`[RingCentral] Rate limit hit on chunk ${chunksProcessed + 1}, continuing with data collected so far...`);
        // Wait 2 minutes before trying next chunk
        if (rateLimitHits < 2) {
          console.log(`[RingCentral] Waiting 2 minutes before continuing...`);
          await sleep(120000);
        } else {
          console.log(`[RingCentral] Multiple rate limits, stopping fetch and processing what we have...`);
          break;
        }
      } else {
        console.error(`[RingCentral] Error fetching chunk: ${error.message}`);
        break;
      }
    }
  }
  
  console.log(`[RingCentral] Total: Found ${sessionMap.size} sessionIds from RingCentral`);
  
  // Update calls with the sessionIds we found
  for (const call of callsWithoutSession) {
    try {
      if (!call.ringcentralCallId) {
        stats.notFound++;
        continue;
      }
      const sessionId = sessionMap.get(call.ringcentralCallId);
      
      if (sessionId) {
        await storage.updateCallRecording(call.id, {
          ringcentralSessionId: sessionId
        });
        stats.updated++;
      } else {
        stats.notFound++;
      }
    } catch (error: any) {
      console.error(`[RingCentral] Error updating call ${call.id}:`, error.message);
      stats.errors++;
    }
  }
  
  // Count calls that already have sessionId
  const callsWithSession = await db
    .select({ id: callRecordings.id })
    .from(callRecordings)
    .where(isNotNull(callRecordings.ringcentralSessionId));
  stats.alreadySet = callsWithSession.length;
  
  stats.message = `Updated ${stats.updated} calls with session IDs. ${stats.notFound} not found in RingCentral (may be older than 90 days). ${stats.alreadySet} total calls now have session IDs.`;
  
  console.log(`[RingCentral] Backfill complete: ${stats.updated} updated, ${stats.notFound} not found in RC, ${stats.alreadySet} already had sessionId, ${stats.errors} errors`);
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

// =====================================================
// SPEAKER PERSONALIZATION
// =====================================================

// Patterns to detect employee name from greeting phrases
const NAME_DETECTION_PATTERNS = [
  /(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))[\s,!.]*(?:this\s+is|i'm|my\s+name\s+is|it's)\s+([a-z]+)/i,
  /(?:thank\s+you\s+for\s+calling|thanks\s+for\s+calling)[^,]*,?\s*(?:this\s+is|i'm|my\s+name\s+is)\s+([a-z]+)/i,
  /heart\s+(?:certified\s+)?(?:auto\s+)?(?:care)?[^,]*,?\s*(?:this\s+is|i'm)\s+([a-z]+)/i,
  /^(?:this\s+is|i'm)\s+([a-z]+)(?:\s+(?:with|at|from)\s+heart)?/i,
];

/**
 * Detect speaker name from greeting phrases in transcript
 */
export function detectSpeakerNameFromTranscript(
  utterances: Array<{ speaker: string; text: string }>
): { detectedName: string | null; speakerLabel: string | null } {
  // Check the first few utterances for greeting patterns
  const firstUtterances = utterances.slice(0, 6);
  
  for (const utterance of firstUtterances) {
    const text = utterance.text || '';
    
    for (const pattern of NAME_DETECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Validate it looks like a name (2-15 chars, starts with letter)
        if (name.length >= 2 && name.length <= 15 && /^[a-z]/i.test(name)) {
          // Capitalize first letter
          const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
          console.log(`[Speaker] Detected name "${formattedName}" from phrase: "${text.substring(0, 50)}..."`);
          return { detectedName: formattedName, speakerLabel: utterance.speaker };
        }
      }
    }
  }
  
  return { detectedName: null, speakerLabel: null };
}

/**
 * Determine which speaker is the HEART employee based on:
 * 1. Name detection from greeting (most reliable)
 * 2. Keyword analysis of what each speaker says
 * 3. Call direction heuristics as last resort
 */
export function identifyEmployeeSpeaker(
  utterances: Array<{ speaker: string; text: string }>,
  direction: string,
  detectedSpeakerLabel: string | null
): string | null {
  if (!utterances || utterances.length === 0) return null;
  
  // If we detected a name from greeting, that's the employee speaker - most reliable
  if (detectedSpeakerLabel) {
    return detectedSpeakerLabel;
  }
  
  // Get unique speaker labels
  const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)));
  if (uniqueSpeakers.length < 2) {
    // Only one speaker, can't reliably differentiate - don't guess
    return null;
  }
  
  // Build text corpus for each speaker
  const speakerTexts = new Map<string, string[]>();
  for (const u of utterances) {
    if (!speakerTexts.has(u.speaker)) {
      speakerTexts.set(u.speaker, []);
    }
    speakerTexts.get(u.speaker)!.push(u.text);
  }
  
  // Look for HEART-specific professional language patterns
  const employeeKeywords = [
    'heart', 'certified', 'auto care', 'appointment', 'inspection',
    'bring it in', 'drop off', 'pick up', 'estimate', 'authorize',
    'technician', 'mechanic', 'service advisor', 'shop', 'bay',
    'parts', 'labor', 'warranty', 'we can', 'we\'ll', 'our technician'
  ];
  
  // Customer-like patterns
  const customerKeywords = [
    'my car', 'my vehicle', 'my truck', 'how much', 'when can',
    'can you', 'do you', 'is it ready', 'what\'s wrong'
  ];
  
  let bestEmployee: string | null = null;
  let bestEmployeeScore = 0;
  
  for (const [speaker, texts] of Array.from(speakerTexts.entries())) {
    const allText = texts.join(' ').toLowerCase();
    
    // Count employee-like vs customer-like keywords
    const employeeScore = employeeKeywords.filter(kw => allText.includes(kw)).length;
    const customerScore = customerKeywords.filter(kw => allText.includes(kw)).length;
    
    // Net score: positive = likely employee, negative = likely customer
    const netScore = employeeScore - customerScore;
    
    if (netScore > bestEmployeeScore) {
      bestEmployeeScore = netScore;
      bestEmployee = speaker;
    }
  }
  
  // Only return if we have reasonable confidence (at least 2 employee keywords matched)
  if (bestEmployeeScore >= 2) {
    return bestEmployee;
  }
  
  // Last resort: use call direction heuristic
  // Inbound: Customer calls, so customer speaks first → employee is second speaker
  // Outbound: Employee calls, so employee speaks first → employee is first speaker
  const sortedSpeakers = Array.from(speakerTexts.keys());
  
  if (direction === 'outbound' && sortedSpeakers.length >= 1) {
    // On outbound, employee is likely first speaker
    return sortedSpeakers[0];
  } else if (direction === 'inbound' && sortedSpeakers.length >= 2) {
    // On inbound, customer calls first, so employee is likely second speaker
    // But only if we can clearly identify two distinct speakers
    return sortedSpeakers[1];
  }
  
  // If uncertain, return null - better to not label than label wrong
  return null;
}

/**
 * Personalize speaker labels in transcript, replacing generic labels with actual names.
 * Only returns personalized utterances if we successfully identify the employee speaker.
 * Returns wasPersonalized flag to indicate if labels were actually changed.
 */
export async function personalizeSpeakerLabels(
  utterances: Array<{ speaker: string; text: string }>,
  callId: string,
  direction: string
): Promise<{
  personalizedUtterances: Array<{ speaker: string; text: string }>;
  detectedEmployeeName: string | null;
  employeeSpeakerLabel: string | null;
  wasPersonalized: boolean;
}> {
  if (!utterances || utterances.length === 0) {
    return { 
      personalizedUtterances: utterances, 
      detectedEmployeeName: null,
      employeeSpeakerLabel: null,
      wasPersonalized: false
    };
  }
  
  // Get the call record to find the userId
  const call = await storage.getCallRecordingById(callId);
  let employeeName: string | null = null;
  
  // Try to get employee name from user record (via RingCentral extension mapping)
  if (call?.userId) {
    const user = await storage.getUser(call.userId);
    if (user) {
      // Use first name only for cleaner display
      const firstName = user.firstName || user.email?.split('@')[0] || null;
      employeeName = firstName;
      console.log(`[Speaker] Found employee name from user record: ${employeeName}`);
    }
  }
  
  // Try to detect name from transcript greeting
  const { detectedName, speakerLabel: detectedSpeakerLabel } = detectSpeakerNameFromTranscript(utterances);
  
  // If we detected a name from audio and don't have one from user record, use detected
  if (detectedName && !employeeName) {
    employeeName = detectedName;
  }
  
  // Identify which speaker label corresponds to the employee
  const employeeSpeakerLabel = identifyEmployeeSpeaker(utterances, direction, detectedSpeakerLabel);
  
  if (!employeeSpeakerLabel) {
    console.log(`[Speaker] Could not confidently identify employee speaker for call ${callId} - keeping original labels`);
    return { 
      personalizedUtterances: utterances, 
      detectedEmployeeName: null,  // Don't persist if we didn't personalize
      employeeSpeakerLabel: null,
      wasPersonalized: false
    };
  }
  
  // Get unique speakers to verify we have two distinct speakers
  const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)));
  if (uniqueSpeakers.length < 2) {
    console.log(`[Speaker] Only ${uniqueSpeakers.length} speaker(s) detected - cannot personalize`);
    return { 
      personalizedUtterances: utterances, 
      detectedEmployeeName: null,
      employeeSpeakerLabel: null,
      wasPersonalized: false
    };
  }
  
  // Replace speaker labels
  const finalEmployeeName = employeeName || "Advisor";
  const personalizedUtterances = utterances.map(u => ({
    ...u,
    speaker: u.speaker === employeeSpeakerLabel ? finalEmployeeName : "Customer"
  }));
  
  console.log(`[Speaker] Personalized transcript: ${employeeSpeakerLabel} → ${finalEmployeeName}, others → Customer`);
  
  return { 
    personalizedUtterances, 
    detectedEmployeeName: detectedName,  // Only persist if we successfully personalized
    employeeSpeakerLabel,
    wasPersonalized: true
  };
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
 * Transcribe audio file using AssemblyAI (primary, high quality)
 */
async function transcribeWithAssemblyAI(audioPath: string): Promise<{
  text: string | null;
  utterances?: Array<{ speaker: string; text: string }>;
}> {
  if (!assemblyClient) {
    console.log(`[AssemblyAI] Client not configured, skipping`);
    return { text: null };
  }
  
  try {
    console.log(`[AssemblyAI] Transcribing ${audioPath}...`);
    
    const transcript = await assemblyClient.transcripts.transcribe({
      audio: audioPath,
      speaker_labels: true,  // Enable speaker diarization
      punctuate: true,
      format_text: true,
    });
    
    if (transcript.status === 'error') {
      console.error(`[AssemblyAI] Transcription failed:`, transcript.error);
      return { text: null };
    }
    
    // Build utterances array for speaker diarization
    // AssemblyAI returns speaker as a string like "A", "B", etc.
    const rawUtterances = transcript.utterances || [];
    const uniqueSpeakers = Array.from(new Set(rawUtterances.map(u => u.speaker)));
    console.log(`[AssemblyAI] Found ${rawUtterances.length} utterances with ${uniqueSpeakers.length} unique speakers: ${uniqueSpeakers.join(', ')}`);
    
    const utterances = rawUtterances.map(u => ({
      speaker: `Speaker ${u.speaker}`,
      text: u.text
    }));
    
    console.log(`[AssemblyAI] Transcribed successfully: ${transcript.text?.substring(0, 100)}...`);
    return { 
      text: transcript.text || null,
      utterances: utterances.length > 0 ? utterances : undefined
    };
  } catch (error: any) {
    console.error(`[AssemblyAI] Transcription failed:`, error.message);
    return { text: null };
  }
}

/**
 * Transcribe audio file using Deepgram (high accuracy with speaker diarization)
 */
async function transcribeWithDeepgram(audioPath: string): Promise<{
  text: string | null;
  utterances?: Array<{ speaker: string; text: string }>;
}> {
  if (!deepgramClient) {
    console.log(`[Deepgram] Client not configured, skipping`);
    return { text: null };
  }
  
  try {
    console.log(`[Deepgram] Transcribing ${audioPath}...`);
    
    const audioBuffer = fs.readFileSync(audioPath);
    
    const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2",
        smart_format: true,
        punctuate: true,
        diarize: true,
        utterances: true,
        language: "en",
      }
    );
    
    if (error) {
      console.error(`[Deepgram] Transcription failed:`, error);
      return { text: null };
    }
    
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    const rawUtterances = result?.results?.utterances || [];
    
    // Build utterances array for speaker diarization
    const uniqueSpeakers = Array.from(new Set(rawUtterances.map((u: any) => u.speaker)));
    console.log(`[Deepgram] Found ${rawUtterances.length} utterances with ${uniqueSpeakers.length} unique speakers: ${uniqueSpeakers.join(', ')}`);
    
    const utterances = rawUtterances.map((u: any) => ({
      speaker: `Speaker ${u.speaker}`,
      text: u.transcript
    }));
    
    console.log(`[Deepgram] Transcribed successfully: ${transcript?.substring(0, 100)}...`);
    return { 
      text: transcript || null,
      utterances: utterances.length > 0 ? utterances : undefined
    };
  } catch (error: any) {
    console.error(`[Deepgram] Transcription failed:`, error.message);
    return { text: null };
  }
}

/**
 * Transcribe audio file using OpenAI Whisper API (fallback)
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
  transcriptSource?: string;  // 'assemblyai' or 'whisper'
  utterances?: Array<{ speaker: string; text: string }>;  // Speaker diarization
  sampleOnly: boolean;  // true if we only transcribed the sample
  skipped: boolean;     // true if skipped due to vendor/duration
  skipReason?: string;
  costSaved?: number;   // estimated cents saved by not transcribing full call
}

/**
 * Transcribe call recording using configured provider (deepgram, assemblyai, or whisper)
 * Deepgram and AssemblyAI provide higher accuracy and speaker diarization
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
  const actualDuration = durationSeconds ?? 60; // Assume 60s if unknown
  if (actualDuration < 10) {
    result.skipped = true;
    result.skipReason = "Call too short (under 10 seconds)";
    console.log(`[Transcribe] Skipping call ${callId}: too short (${actualDuration}s)`);
    return result;
  }
  
  // Download the recording
  const audioPath = await downloadRecording(recordingId);
  if (!audioPath) {
    result.skipReason = "Failed to download recording";
    return result;
  }
  
  try {
    // Get the configured transcription provider from DB settings
    const transcriptionProvider = await getTranscriptionProvider();
    console.log(`[Transcribe] Processing ${durationSeconds}s recording for call ${callId} using ${transcriptionProvider}...`);
    
    // Build provider chain based on configured primary provider
    const providerChain: Array<'deepgram' | 'assemblyai' | 'whisper'> = [];
    
    if (transcriptionProvider === 'deepgram') {
      providerChain.push('deepgram', 'assemblyai', 'whisper');
    } else if (transcriptionProvider === 'assemblyai') {
      providerChain.push('assemblyai', 'whisper');
    } else {
      providerChain.push('whisper');
    }
    
    for (const provider of providerChain) {
      if (provider === 'deepgram' && deepgramClient) {
        const deepgramResult = await transcribeWithDeepgram(audioPath);
        if (deepgramResult.text) {
          result.success = true;
          result.transcriptText = deepgramResult.text;
          result.transcriptSource = 'deepgram';
          result.utterances = deepgramResult.utterances;
          result.isSalesCall = isSalesCall(deepgramResult.text);
          result.sampleOnly = false;
          console.log(`[Transcribe] Deepgram succeeded for call ${callId}`);
          return result;
        }
        console.log(`[Transcribe] Deepgram failed for call ${callId}, trying next provider...`);
      }
      
      if (provider === 'assemblyai' && assemblyClient) {
        const assemblyResult = await transcribeWithAssemblyAI(audioPath);
        if (assemblyResult.text) {
          result.success = true;
          result.transcriptText = assemblyResult.text;
          result.transcriptSource = 'assemblyai';
          result.utterances = assemblyResult.utterances;
          result.isSalesCall = isSalesCall(assemblyResult.text);
          result.sampleOnly = false;
          console.log(`[Transcribe] AssemblyAI succeeded for call ${callId}`);
          return result;
        }
        console.log(`[Transcribe] AssemblyAI failed for call ${callId}, trying next provider...`);
      }
      
      if (provider === 'whisper') {
        const whisperTranscript = await transcribeWithWhisper(audioPath);
        if (whisperTranscript) {
          result.success = true;
          result.transcriptText = whisperTranscript;
          result.transcriptSource = 'whisper';
          result.isSalesCall = isSalesCall(whisperTranscript);
          result.sampleOnly = false;
          console.log(`[Transcribe] Whisper succeeded for call ${callId}`);
          return result;
        }
        console.log(`[Transcribe] Whisper failed for call ${callId}`);
      }
    }
    
    result.skipReason = "All transcription providers failed";
    return result;
  } finally {
    // Clean up temp files
    await cleanupTempFiles(audioPath, "");
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
  console.log(`[Transcribe] Processing ${calls.length} calls for transcription`);
  
  for (const call of calls) {
    if (!call.ringcentralRecordingId) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await smartTranscribeCall(
        call.id,
        call.ringcentralRecordingId,
        call.durationSeconds,
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
        
        // Personalize speaker labels if we have utterances (diarization data)
        let finalUtterances = result.utterances;
        let detectedSpeakerName: string | null = null;
        let wasPersonalized = false;
        
        if (result.utterances && result.utterances.length > 0) {
          const personalizationResult = await personalizeSpeakerLabels(
            result.utterances,
            call.id,
            call.direction || 'inbound'
          );
          finalUtterances = personalizationResult.personalizedUtterances;
          wasPersonalized = personalizationResult.wasPersonalized;
          // Only store detected name if personalization was successful
          if (wasPersonalized) {
            detectedSpeakerName = personalizationResult.detectedEmployeeName;
          }
        }
        
        // Save the transcript with personalized utterances (or original if personalization failed)
        await storage.updateCallTranscript(call.id, {
          transcript: result.transcriptText,
          transcriptJson: { 
            source: result.transcriptSource || "unknown", 
            sampleOnly: result.sampleOnly,
            isSalesCall: result.isSalesCall,
            utterances: finalUtterances,
            wasPersonalized: wasPersonalized,  // Track if we successfully personalized
          },
          isSalesCall: result.isSalesCall,
          detectedSpeakerName: detectedSpeakerName,  // Only set if personalization succeeded
        });
      } else {
        stats.errors++;
        console.error(`[Transcribe] Failed to transcribe call ${call.id}: ${result.skipReason}`);
      }
    } catch (error: any) {
      stats.errors++;
      console.error(`[Transcribe] Error processing call ${call.id}:`, error.message);
    }
    
    // Delay between calls to avoid RingCentral rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`[Transcribe] Batch complete: ${stats.processed} processed, ${stats.salesCalls} sales calls, ${stats.skipped} skipped, ${stats.errors} errors`);
  
  return stats;
}
