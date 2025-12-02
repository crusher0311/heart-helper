let pendingJobData = null;

// ==================== LABOR RATE AUTO-UPDATE SECTION ====================
let tekmetricAuthToken = null;
let currentTekmetricShopId = null;
let currentTekmetricBaseUrl = null;
let lastProcessedRoId = null;

// Capture Tekmetric auth token, shop ID, and base URL from network requests
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Capture the base URL from the request (shop, sandbox, or cba)
    try {
      const url = new URL(details.url);
      currentTekmetricBaseUrl = url.origin;
      console.log("[Labor Rate] Base URL captured:", currentTekmetricBaseUrl);
    } catch (e) {
      // Ignore URL parsing errors
    }
    
    // Match shop ID from URL patterns like /api/token/shop/123 or /api/shop/123
    const shopMatch = details.url.match(/\/(?:token\/)?shop\/(\d+)/);
    if (shopMatch) {
      currentTekmetricShopId = shopMatch[1];
      console.log("[Labor Rate] Shop ID captured:", currentTekmetricShopId);
    }

    // Capture auth token from header
    const tokenHeader = details.requestHeaders.find(
      (h) => h.name.toLowerCase() === "x-auth-token"
    );
    if (tokenHeader && tokenHeader.value) {
      tekmetricAuthToken = tokenHeader.value;
      console.log("[Labor Rate] Auth token captured");
    }
  },
  {
    urls: [
      "https://shop.tekmetric.com/api/*",
      "https://sandbox.tekmetric.com/api/*",
      "https://cba.tekmetric.com/api/*"
    ],
    types: ["xmlhttprequest"]
  },
  ["requestHeaders"]
);

// Listen for repair order navigation/creation
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!tekmetricAuthToken || !currentTekmetricShopId) {
      console.log("[Labor Rate] Skipping - no auth token or shop ID");
      return;
    }

    let roId = null;
    let shopId = currentTekmetricShopId;

    // Match patterns for repair order URLs
    // Pattern 1: /shop/123/repair-order/456 or /sandbox/123/repair-order/456 or /cba/123/repair-order/456
    const shopRoMatch = details.url.match(/\/(?:sandbox|shop|cba)\/(\d+)\/repair-order\/(\d+)/);
    if (shopRoMatch) {
      shopId = shopRoMatch[1];
      roId = shopRoMatch[2];
    }

    // Pattern 2: /repair-order/456/estimate (new RO created)
    const newRoMatch = details.url.match(/\/repair-order\/(\d+)\/estimate/);
    if (newRoMatch) {
      roId = newRoMatch[1];
    }

    // Pattern 3: /api/shop/123/repair-order/456 (API calls for all environments)
    const apiRoMatch = details.url.match(/\/api\/(?:shop|sandbox|cba)\/(\d+)\/repair-order\/(\d+)/);
    if (apiRoMatch) {
      shopId = apiRoMatch[1];
      roId = apiRoMatch[2];
    }
    
    // Pattern 4: Generic repair-order API pattern (fallback with shopId from captured data)
    if (!roId) {
      const genericRoMatch = details.url.match(/\/repair-order\/(\d+)(?:\/|$)/);
      if (genericRoMatch && currentTekmetricShopId) {
        roId = genericRoMatch[1];
        shopId = currentTekmetricShopId;
        console.log(`[Labor Rate] Using fallback pattern with captured shopId: ${shopId}`);
      }
    }

    if (!roId) return;

    // Prevent duplicate processing
    if (lastProcessedRoId === roId) {
      console.log(`[Labor Rate] Skipping duplicate RO: ${roId}`);
      return;
    }
    lastProcessedRoId = roId;

    console.log("[Labor Rate] Repair order detected:", roId, "Shop:", shopId);
    await processLaborRateUpdate(shopId, roId);
  },
  {
    urls: [
      "https://shop.tekmetric.com/api/shop/*/repair-order/*",
      "https://sandbox.tekmetric.com/api/shop/*/repair-order/*",
      "https://cba.tekmetric.com/api/shop/*/repair-order/*",
      "https://shop.tekmetric.com/api/repair-order/*/estimate",
      "https://sandbox.tekmetric.com/api/repair-order/*/estimate",
      "https://cba.tekmetric.com/api/repair-order/*/estimate"
    ],
    types: ["xmlhttprequest"]
  }
);

async function processLaborRateUpdate(shopId, roId) {
  try {
    // Use the captured base URL (shop, sandbox, or cba) or fallback to shop.tekmetric.com
    const baseUrl = currentTekmetricBaseUrl || "https://shop.tekmetric.com";
    console.log("[Labor Rate] Using base URL:", baseUrl);
    
    // Fetch the repair order details
    const getRes = await fetch(`${baseUrl}/api/shop/${shopId}/repair-order/${roId}`, {
      headers: {
        "x-auth-token": tekmetricAuthToken,
        "content-type": "application/json"
      }
    });

    if (!getRes.ok) {
      console.error(`[Labor Rate] Failed to fetch RO: ${getRes.status}`);
      return;
    }

    const roData = await getRes.json();
    const currentRate = roData.laborRate;
    const make = roData.vehicle?.make?.toLowerCase();
    
    console.log(`[Labor Rate] Current rate: ${currentRate}, Vehicle make: ${make}`);

    if (!make) {
      console.log("[Labor Rate] No vehicle make found, skipping");
      return;
    }

    // Load saved labor rate groups from storage
    const data = await chrome.storage.local.get("laborRateGroups");
    const groups = data.laborRateGroups || [];

    if (groups.length === 0) {
      console.log("[Labor Rate] No labor rate groups configured");
      return;
    }

    // Find matching rate group
    let matchedRate = null;
    let matchedGroupName = null;

    for (const group of groups) {
      if (group.makes.some(m => m.toLowerCase() === make)) {
        matchedRate = group.laborRate;
        matchedGroupName = group.name;
        console.log(`[Labor Rate] Matched group '${group.name}' with rate: ${matchedRate}`);
        break;
      }
    }

    if (matchedRate === null) {
      console.log(`[Labor Rate] No matching group found for make: ${make}`);
      return;
    }

    // Apply labor rate if different
    if (currentRate !== matchedRate) {
      const payload = {
        laborRate: matchedRate,
        appointmentOption: roData.appointmentOption,
        customerTimeIn: roData.customerTimeIn,
        customerTimeOut: roData.customerTimeOut,
        defaultTechnicianId: roData.defaultTechnicianId,
        keytag: roData.keytag,
        leadSource: roData.leadSource,
        notes: roData.notes,
        poNumber: roData.poNumber,
        referrerId: roData.referrerId,
        referrerName: roData.referrerName,
        saveCustomerParts: roData.saveCustomerParts,
        serviceWriterId: roData.serviceWriterId
      };

      const putRes = await fetch(`${baseUrl}/api/repair-order/${roId}/summary`, {
        method: "PUT",
        headers: {
          "x-auth-token": tekmetricAuthToken,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (putRes.ok) {
        console.log(`[Labor Rate] Updated to $${(matchedRate / 100).toFixed(2)} (${matchedGroupName}) for RO: ${roId}`);

        // Notify content scripts to refresh UI
        chrome.tabs.query({ url: "*://*.tekmetric.com/*" }, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { 
              type: "REFRESH_LABOR_RATE_UI",
              rate: matchedRate,
              groupName: matchedGroupName
            }).catch(() => {
              // Content script may not be ready
            });
          }
        });
      } else {
        console.error(`[Labor Rate] Failed to update: ${putRes.status}`);
      }
    } else {
      console.log(`[Labor Rate] No change needed - rate already correct`);
    }
  } catch (err) {
    console.error("[Labor Rate] Error processing RO:", err);
  }
}

// ==================== END LABOR RATE SECTION ====================

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

// Handle keyboard shortcut - this preserves user gesture!
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel' && tab?.id) {
    console.log('Keyboard shortcut pressed - opening side panel for tab:', tab.id);
    chrome.sidePanel.open({ tabId: tab.id })
      .then(() => console.log('Keyboard shortcut: Side panel opened'))
      .catch((err) => console.error('Keyboard shortcut: Failed to open side panel:', err));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log ALL messages for debugging
  console.log("📨 Message received:", message.action, "from tab:", sender.tab?.id);
  
  // Open side panel via extension page (workaround for user gesture requirement)
  if (message.action === "OPEN_SIDE_PANEL") {
    console.log("🚀 OPEN_SIDE_PANEL handler triggered for tab:", sender.tab?.id);
    
    if (sender.tab && sender.tab.id && sender.tab.windowId) {
      // Create a new tab with our extension page that will open the side panel
      // This is a workaround for the user gesture requirement
      const relayUrl = chrome.runtime.getURL(`sidepanel-opener.html?tabId=${sender.tab.id}&windowId=${sender.tab.windowId}`);
      console.log("Creating relay tab:", relayUrl);
      
      chrome.tabs.create({ 
        url: relayUrl, 
        active: false,
        index: 0 // Put at beginning so it's less intrusive
      }).then((tab) => {
        console.log("Relay tab created:", tab.id);
      }).catch((error) => {
        console.error("Failed to create relay tab:", error);
      });
    } else {
      console.error("No tab ID or window ID available from sender");
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

console.log("Tekmetric Job Importer: Background service worker loaded (v3.10.3)");
