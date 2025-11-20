let pendingJobData = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SEND_TO_TEKMETRIC") {
    console.log("Background: Received job data from web app", message.payload);
    
    pendingJobData = message.payload;
    
    chrome.storage.local.set({ 
      lastJobData: message.payload,
      timestamp: new Date().toISOString()
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === "GET_PENDING_JOB") {
    console.log("Background: Content script requesting pending job");
    sendResponse({ jobData: pendingJobData });
    return true;
  }
  
  if (message.action === "CLEAR_PENDING_JOB") {
    console.log("Background: Clearing pending job");
    pendingJobData = null;
    sendResponse({ success: true });
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

console.log("Tekmetric Job Importer: Background service worker loaded");
