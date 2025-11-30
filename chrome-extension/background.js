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

// Create context menu on install - context menus preserve user gesture properly
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openHeartHelper',
    title: 'Open HEART Helper',
    contexts: ['all']
  });
  console.log('Context menu created: Open HEART Helper');
});

// Handle context menu clicks - use tabId for proper side panel opening
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openHeartHelper' && tab?.id) {
    console.log('Context menu clicked - opening side panel for tab:', tab.id);
    chrome.sidePanel.open({ tabId: tab.id })
      .then(() => console.log('Context menu: Side panel opened'))
      .catch((err) => console.error('Context menu: Failed to open side panel:', err));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log ALL messages for debugging
  console.log("📨 Message received:", message.action, "from tab:", sender.tab?.id);
  
  // Open side panel directly from service worker
  if (message.action === "OPEN_SIDE_PANEL") {
    console.log("🚀 OPEN_SIDE_PANEL handler triggered for tab:", sender.tab?.id);
    
    if (sender.tab && sender.tab.id) {
      // Use promise chain, not await (can't use async on message listener)
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => console.log("Side panel opened successfully for tab:", sender.tab.id))
        .catch((error) => console.error("Failed to open side panel:", error));
    } else {
      console.error("No tab ID available from sender");
    }
    // No response needed, don't return true
    return false;
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

console.log("Tekmetric Job Importer: Background service worker loaded (v3.9.7)");
