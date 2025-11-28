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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Open HEART Helper as a popup window (side panel can't be opened from content script)
  if (message.action === "OPEN_SIDE_PANEL") {
    // Get the current window to position the popup on the right side
    chrome.windows.getCurrent().then((currentWindow) => {
      // Calculate position on right side of current window
      const windowWidth = currentWindow.width || 1920;
      const windowLeft = currentWindow.left || 0;
      const popupWidth = 420;
      const popupHeight = 700;
      
      chrome.windows.create({
        url: chrome.runtime.getURL('sidepanel.html'),
        type: 'popup',
        width: popupWidth,
        height: popupHeight,
        top: (currentWindow.top || 0) + 50,
        left: windowLeft + windowWidth - popupWidth - 20
      }).then((newWindow) => {
        console.log("HEART Helper popup window opened:", newWindow.id);
        sendResponse({ success: true, windowId: newWindow.id });
      }).catch((error) => {
        console.error("Failed to open popup window:", error);
        sendResponse({ success: false, error: error.message });
      });
    }).catch((error) => {
      // Fallback without positioning
      chrome.windows.create({
        url: chrome.runtime.getURL('sidepanel.html'),
        type: 'popup',
        width: 420,
        height: 700
      }).then((newWindow) => {
        console.log("HEART Helper popup window opened (fallback):", newWindow.id);
        sendResponse({ success: true, windowId: newWindow.id });
      }).catch((err) => {
        console.error("Failed to open popup window:", err);
        sendResponse({ success: false, error: err.message });
      });
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
