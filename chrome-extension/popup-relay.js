// This popup is opened briefly to relay the user gesture and open the side panel
// It runs as an extension page, so sidePanel.open() works here

(async () => {
  try {
    // Get the current window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Open the side panel - this works because we're in an extension page with user gesture
    await chrome.sidePanel.open({ windowId: tab.windowId });
    
    // Close this popup immediately
    window.close();
  } catch (error) {
    console.error('Failed to open side panel:', error);
    // Show error briefly before closing
    document.body.innerHTML = '<div style="color: #ff6b6b;">Failed to open. Click extension icon.</div>';
    setTimeout(() => window.close(), 2000);
  }
})();
