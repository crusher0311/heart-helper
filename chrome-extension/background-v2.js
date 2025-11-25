// HEART Helper - Background Service Worker V2
// Instant auto-fill via tab activation monitoring

let pendingJobData = null;

// =================================================================
// MONITOR: Detect when user switches to Tekmetric tab
// =================================================================
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    if (tab.url && tab.url.includes('shop.tekmetric.com')) {
      // User switched to Tekmetric tab - check for pending job
      chrome.storage.local.get(['lastJobData'], async (result) => {
        if (result.lastJobData) {
          console.log('[HEART Helper] Tekmetric tab activated with pending job - injecting auto-fill');
          
          // Inject auto-fill script at full speed (bypasses tab throttling)
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (jobData) => {
                // This runs in the page context with full speed
                window.postMessage({
                  type: 'HEART_HELPER_FILL',
                  jobData: jobData
                }, '*');
              },
              args: [result.lastJobData]
            });
          } catch (error) {
            console.error('[HEART Helper] Failed to inject script:', error);
          }
        }
      });
    }
  } catch (error) {
    // Tab may have closed, ignore
  }
});

// =================================================================
// MONITOR: Detect when Tekmetric page finishes loading
// =================================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('shop.tekmetric.com')) {
    // Page finished loading - check for pending job
    chrome.storage.local.get(['lastJobData'], async (result) => {
      if (result.lastJobData) {
        console.log('[HEART Helper] Tekmetric page loaded with pending job - triggering auto-fill');
        
        // Send message to content script
        try {
          await chrome.tabs.sendMessage(tabId, {
            action: 'FILL_ESTIMATE',
            jobData: result.lastJobData
          });
        } catch (error) {
          // Content script may not be ready yet, will auto-check on load
          console.log('[HEART Helper] Content script not ready, will auto-fill when loaded');
        }
      }
    });
  }
});

// =================================================================
// MESSAGE HANDLERS
// =================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SEND_TO_TEKMETRIC") {
    console.log("[HEART Helper] Received job from web app");
    
    pendingJobData = message.payload;
    
    chrome.storage.local.set({ 
      lastJobData: message.payload,
      timestamp: new Date().toISOString()
    }, () => {
      sendResponse({ success: true });
    });
    
    return true;
  }
  
  if (message.action === "STORE_PENDING_JOB") {
    console.log("[HEART Helper] Storing pending job");
    pendingJobData = message.jobData;
    
    chrome.storage.local.set({ 
      lastJobData: message.jobData,
      timestamp: new Date().toISOString()
    }, () => {
      sendResponse({ success: true });
    });
    
    return true;
  }
  
  if (message.action === "GET_PENDING_JOB") {
    chrome.storage.local.get(['lastJobData'], (result) => {
      sendResponse({ jobData: result.lastJobData || null });
    });
    return true;
  }
  
  if (message.action === "CLEAR_PENDING_JOB") {
    console.log("[HEART Helper] Clearing pending job");
    pendingJobData = null;
    chrome.storage.local.remove(['lastJobData'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === "GET_LAST_JOB") {
    chrome.storage.local.get(['lastJobData', 'timestamp'], (result) => {
      sendResponse({ 
        jobData: result.lastJobData,
        timestamp: result.timestamp
      });
    });
    return true;
  }
});

console.log("[HEART Helper] Background service worker v2 loaded - instant fill enabled");
