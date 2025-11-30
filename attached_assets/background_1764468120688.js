chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
    }).catch((error) => console.error("Failed to set panel behavior:", error));
});

chrome.action.onClicked.addListener(() => {
    chrome.windows.getCurrent({populate: true}, (currentWindow) => {
        chrome.sidePanel.open({
            windowId: currentWindow.id
        }).catch((error) => {
            console.error("Error opening side panel:", error);
        });
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openSidePanel") {
        chrome.windows.getCurrent({populate: true}, (currentWindow) => {
            chrome.sidePanel.open({
                windowId: currentWindow.id
            }).catch((error) => {
                console.error("Error opening side panel:", error);
            });
        });
    }

    if (message.action === 'sendToTekmetric') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'insertConversation',
                    cleanedConversation: message.cleanedConversation
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error forwarding message to content script:', chrome.runtime.lastError);
                    } else if (response && response.status === 'success') {
                        sendResponse({status: 'message delivered'});
                    }
                });
            } else {
                sendResponse({status: 'failed', reason: 'No active tab'});
            }
        });

        return true;
    }

    // New logic: Trigger form clearing in the side panel
    if (message.action === 'clearFormInSidePanel') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'clearFormInSidePanel'
                });
            }
        });
    }
});
