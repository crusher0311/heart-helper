const allowedOrigins = [
  'http://localhost:5000',
  'https://localhost:5000',
];

if (window.location.hostname.endsWith('.replit.dev')) {
  allowedOrigins.push(window.location.origin);
}

chrome.storage.local.get(['appUrl'], (result) => {
  if (!result.appUrl) {
    chrome.storage.local.set({ 
      appUrl: window.location.origin 
    }, () => {
      console.log("Inject: Saved app URL to storage (first time):", window.location.origin);
    });
  } else {
    console.log("Inject: App URL already configured, not overwriting:", result.appUrl);
  }
});

window.addEventListener("message", (event) => {
  console.log('[HEART Helper Inject] Received message:', {
    source: event.source === window ? 'same-window' : 'different-window',
    origin: event.origin,
    action: event.data?.action,
    hasPayload: !!event.data?.payload,
  });
  
  if (event.source !== window) {
    console.log('[HEART Helper Inject] Ignoring: not from same window');
    return;
  }
  
  const isAllowedOrigin = allowedOrigins.some(origin => 
    event.origin === origin || event.origin.endsWith('.replit.dev')
  );
  
  if (!isAllowedOrigin) {
    console.warn('[HEART Helper Inject] Blocked message from untrusted origin:', event.origin, 'Allowed:', allowedOrigins);
    return;
  }
  
  if (event.data.action === "SEND_TO_TEKMETRIC") {
    console.log("[HEART Helper Inject] ✅ Valid SEND_TO_TEKMETRIC message received");
    console.log("[HEART Helper Inject] Forwarding job data to background:", {
      jobName: event.data.payload?.jobName,
      laborItems: event.data.payload?.laborItems?.length,
      parts: event.data.payload?.parts?.length,
    });
    
    // BACKUP: Also store directly to chrome.storage in case service worker is asleep
    chrome.storage.local.set({ 
      lastJobData: event.data.payload,
      timestamp: new Date().toISOString()
    }, () => {
      console.log("✅ [HEART Helper Inject] Stored job data directly to chrome.storage.local (backup)");
    });
    
    // Forward to background script (primary method)
    chrome.runtime.sendMessage(event.data, (response) => {
      if (chrome.runtime.lastError) {
        console.error("❌ [HEART Helper Inject] Error sending to background:", chrome.runtime.lastError);
      } else {
        console.log("✅ [HEART Helper Inject] Background acknowledged:", response);
      }
    });
  } else {
    console.log('[HEART Helper Inject] Ignoring: action is not SEND_TO_TEKMETRIC, got:', event.data?.action);
  }
});

console.log("Tekmetric Job Importer: Inject script loaded on repair search app");
