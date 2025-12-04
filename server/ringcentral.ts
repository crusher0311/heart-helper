import { SDK } from "@ringcentral/sdk";
import { storage } from "./storage";
import type { InsertCallRecording, InsertRingcentralUser } from "@shared/schema";

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
