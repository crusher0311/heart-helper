let pendingJobData = null;

// Open side panel when extension icon is clicked
// This is the ONLY way to handle icon clicks - do NOT add chrome.action.onClicked
// as they are mutually exclusive
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log('Side panel behavior set: opens on action click'))
  .catch((error) => console.error('Failed to set side panel behavior:', error));

// Also set the side panel to be enabled for all tabs
chrome.sidePanel.setOptions({
  enabled: true
}).then(() => console.log('Side panel enabled for all tabs'))
  .catch((error) => console.error('Failed to enable side panel:', error));

chrome.runtime.onMessage.addListener((message, sender) => {
  // Open side panel - use Chrome's official pattern (async IIFE, return falsy)
  if (message.action === "OPEN_SIDE_PANEL") {
    console.log("OPEN_SIDE_PANEL received from tab:", sender.tab?.id, "window:", sender.tab?.windowId);
    
    // Chrome's official pattern: async IIFE, call sidePanel.open() FIRST, return nothing
    (async () => {
      try {
        // CRITICAL: sidePanel.open() must be the FIRST await - this preserves user gesture
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        console.log("Side panel opened successfully!");
      } catch (error) {
        console.error("Side panel open failed:", error.message);
      }
    })();
    // Return nothing (falsy) - this is Chrome's official pattern
  }
  
  if (message.action === "SEND_TO_TEKMETRIC") {
    console.log("Background: Received job data from web app", message.payload);
    
    pendingJobData = message.payload;
    
    chrome.storage.local.set({ 
      lastJobData: message.payload,
      timestamp: new Date().toISOString()
    }, () => {
      console.log("Background: Job data stored successfully");
      sendResponse({ success: true });
    });
    
    return true; // Keep this because storage.set is async
  }
  
  if (message.action === "STORE_PENDING_JOB") {
    console.log("Background: Storing pending job from content script", message.jobData);
    pendingJobData = message.jobData;
    
    // CRITICAL: Store in chrome.storage.local, not just memory!
    // Service worker goes to sleep and memory is wiped
    chrome.storage.local.set({ 
      lastJobData: message.jobData,
      timestamp: new Date().toISOString()
    }, () => {
      console.log("Background: Job data stored in persistent storage");
      sendResponse({ success: true });
    });
    
    return true; // Async response
  }
  
  if (message.action === "GET_PENDING_JOB") {
    console.log("Background: Content script requesting pending job");
    // Get from storage instead of memory (service worker may have been reloaded)
    chrome.storage.local.get(['lastJobData'], (result) => {
      console.log("Background: Retrieved from storage:", result.lastJobData ? "Job found" : "No job");
      sendResponse({ jobData: result.lastJobData || null });
    });
    return true; // Async response
  }
  
  if (message.action === "CLEAR_PENDING_JOB") {
    console.log("Background: Clearing pending job");
    pendingJobData = null;
    chrome.storage.local.remove(['lastJobData'], () => {
      console.log("Background: Cleared job data from storage");
      sendResponse({ success: true });
    });
    return true; // Async response
  }
  
  if (message.action === "GET_LAST_JOB") {
    chrome.storage.local.get(['lastJobData', 'timestamp'], (result) => {
      sendResponse({ 
        jobData: result.lastJobData,
        timestamp: result.timestamp
      });
    });
    return true; // Keep this because storage.get is async
  }
});

console.log("Tekmetric Job Importer: Background service worker loaded");
