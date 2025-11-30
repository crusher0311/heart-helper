// This page opens the side panel for the original tab and then closes itself
// It's a workaround for the user gesture requirement in chrome.sidePanel.open()

(async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const tabId = parseInt(params.get('tabId'), 10);
    const windowId = parseInt(params.get('windowId'), 10);
    
    console.log('Side panel opener: tabId =', tabId, 'windowId =', windowId);
    
    // Get the current tab ID so we can close it later
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const selfTabId = currentTab?.id;
    
    if (windowId) {
      // Try opening for the window first (this might work better)
      console.log('Attempting to open side panel for window:', windowId);
      try {
        await chrome.sidePanel.open({ windowId: windowId });
        console.log('Side panel opened successfully for window');
      } catch (err) {
        console.log('Window approach failed, trying tab:', err.message);
        // Fall back to tab approach
        if (tabId) {
          await chrome.sidePanel.open({ tabId: tabId });
          console.log('Side panel opened successfully for tab');
        }
      }
    } else if (tabId) {
      console.log('Attempting to open side panel for tab:', tabId);
      await chrome.sidePanel.open({ tabId: tabId });
      console.log('Side panel opened successfully for tab');
    }
    
    // Switch back to the original tab
    if (tabId) {
      await chrome.tabs.update(tabId, { active: true });
    }
    
    // Close this relay tab
    if (selfTabId) {
      await chrome.tabs.remove(selfTabId);
    }
  } catch (error) {
    console.error('Side panel opener failed:', error);
    document.body.innerHTML = `
      <div style="color: white; text-align: center; padding: 20px;">
        <p>Could not open side panel</p>
        <p style="font-size: 12px; opacity: 0.8;">${error.message}</p>
        <p style="font-size: 12px; margin-top: 20px;">Use the extension icon or right-click menu instead.</p>
        <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">Close</button>
      </div>
    `;
  }
})();
