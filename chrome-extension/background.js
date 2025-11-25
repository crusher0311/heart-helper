let pendingJobData = null;

// Enable side panel for Tekmetric pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.log('Side panel behavior not set:', error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Open side panel for concern intake
  if (message.action === "OPEN_SIDE_PANEL") {
    chrome.sidePanel.open({ tabId: sender.tab.id })
      .then(() => {
        console.log("Side panel opened");
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Failed to open side panel:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
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
