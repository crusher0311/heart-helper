// HEART Helper - Optimized Tekmetric Auto-Fill
// V2: Instant background fill with batched DOM operations

// Debug logger (toggle with localStorage.heartHelperDebug = 'true')
const debug = (...args) => {
  if (localStorage.getItem('heartHelperDebug') === 'true') {
    console.log('[HEART Helper]', ...args);
  }
};

const debugError = (...args) => console.error('[HEART Helper ERROR]', ...args);

let checkHistoryButton = null;
let isFillingJob = false;

// =================================================================
// UTILITY: Wait for element with timeout
// =================================================================
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

// =================================================================
// UTILITY: Wait for modal dialog to appear
// =================================================================
function waitForModal(timeout = 15000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkForModal = () => {
      const dialogs = document.querySelectorAll('[role="dialog"], .modal, [class*="Modal"]');
      
      for (const dialog of dialogs) {
        const inputs = dialog.querySelectorAll('input, textarea, [contenteditable="true"]');
        if (inputs.length >= 1) {
          return resolve(dialog);
        }
      }
      
      if (Date.now() - startTime > timeout) {
        return resolve(document.body);
      }
      
      requestAnimationFrame(checkForModal);
    };
    
    checkForModal();
  });
}

// =================================================================
// CORE: Batch fill field values with events
// =================================================================
function batchFillFields(fields) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      fields.forEach(({ element, value }) => {
        if (!element) return;
        
        element.focus();
        if (element.contentEditable === 'true') {
          element.textContent = value;
        } else {
          element.value = value;
        }
        
        // Dispatch events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
      });
      
      // Small settle time
      setTimeout(resolve, 50);
    });
  });
}

// =================================================================
// MAIN: Instant Tekmetric Auto-Fill
// =================================================================
async function fillTekmetricEstimate(jobData) {
  if (isFillingJob) return;
  isFillingJob = true;

  // Clear pending job immediately
  chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" });

  try {
    if (!window.location.href.includes('shop.tekmetric.com')) {
      isFillingJob = false;
      return;
    }

    debug('Starting instant auto-fill for:', jobData.jobName);

    // Step 1: Click Job button
    const jobButton = Array.from(document.querySelectorAll('button')).find(btn =>
      btn.textContent.trim() === 'Job' || btn.getAttribute('aria-label')?.includes('Job')
    );

    if (!jobButton) {
      throw new Error('Job button not found');
    }

    jobButton.click();
    const modal = await waitForModal();

    // Step 2: Fill job name
    const jobNameField = findJobNameField(modal);
    if (jobNameField) {
      await batchFillFields([{ element: jobNameField, value: jobData.jobName }]);
      await new Promise(r => setTimeout(r, 100));
    }

    // Step 3: Batch fill all labor items
    for (const laborItem of jobData.laborItems) {
      await fillLaborItem(laborItem);
    }

    // Step 4: Batch fill all parts
    for (const part of jobData.parts) {
      await fillPart(part);
    }

    debug('Auto-fill complete!');
    isFillingJob = false;

  } catch (error) {
    debugError('Auto-fill failed:', error);
    isFillingJob = false;
  }
}

// =================================================================
// HELPER: Find job name field in modal
// =================================================================
function findJobNameField(modal) {
  const textareas = Array.from(modal.querySelectorAll('textarea'));
  const contentEditables = Array.from(modal.querySelectorAll('[contenteditable]'));
  const inputs = Array.from(modal.querySelectorAll('input'));

  return textareas.find(t => !t.value) ||
         contentEditables.find(c => c.contentEditable === 'true' && !c.textContent.trim()) ||
         inputs.find(i => !i.value && i.type !== 'hidden' && i.type !== 'checkbox');
}

// =================================================================
// HELPER: Fill single labor item
// =================================================================
async function fillLaborItem(laborItem) {
  const addLaborButton = Array.from(document.querySelectorAll('button')).find(btn =>
    btn.textContent.trim().toLowerCase().includes('add labor')
  );

  if (!addLaborButton) throw new Error('Add Labor button not found');

  const inputsBefore = new Set(document.querySelectorAll('input, textarea'));
  addLaborButton.click();
  await new Promise(r => setTimeout(r, 300));

  const inputsAfter = Array.from(document.querySelectorAll('input, textarea'));
  const newInputs = inputsAfter.filter(inp => !inputsBefore.has(inp));

  if (newInputs.length === 0) throw new Error('No new labor fields appeared');

  // Find and batch fill fields
  const descField = newInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    return (ph.includes('description') || ph.includes('labor')) && !ph.includes('part');
  });

  const hoursField = newInputs.find(inp =>
    inp.type === 'number' && inp.placeholder?.toLowerCase().includes('hour')
  );

  const rateField = newInputs.find(inp =>
    inp.type === 'number' && inp.placeholder?.toLowerCase().includes('rate')
  );

  const fieldsToFill = [];
  if (descField) fieldsToFill.push({ element: descField, value: laborItem.name });
  if (hoursField) fieldsToFill.push({ element: hoursField, value: laborItem.hours.toString() });
  if (rateField) fieldsToFill.push({ element: rateField, value: laborItem.rate.toString() });

  await batchFillFields(fieldsToFill);
  await new Promise(r => setTimeout(r, 100));
}

// =================================================================
// HELPER: Fill single part
// =================================================================
async function fillPart(part) {
  const addPartsButton = Array.from(document.querySelectorAll('button')).find(btn =>
    btn.textContent.trim().toLowerCase().includes('add part')
  );

  if (!addPartsButton) throw new Error('Add Parts button not found');

  addPartsButton.click();
  await new Promise(r => setTimeout(r, 200));

  // Find "Add part manually" option
  let addManuallyOption = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 100));
    const elements = Array.from(document.querySelectorAll('button, a, li, div[role="option"], span'));
    addManuallyOption = elements.find(el =>
      el.textContent?.toLowerCase().includes('add part manually')
    );
    if (addManuallyOption) break;
  }

  if (!addManuallyOption) throw new Error('Add part manually not found');

  const elementsBefore = new Set(document.querySelectorAll('input, textarea'));
  addManuallyOption.click();
  await new Promise(r => setTimeout(r, 300));

  const elementsAfter = Array.from(document.querySelectorAll('input, textarea'));
  const newInputs = elementsAfter.filter(el =>
    !elementsBefore.has(el) && el.type !== 'hidden'
  );

  if (newInputs.length === 0) throw new Error('No new part fields appeared');

  // Find and batch fill part fields
  const textInputs = newInputs.filter(inp => inp.type === 'text' || inp.tagName === 'TEXTAREA');
  const numberInputs = newInputs.filter(inp => inp.type === 'number');

  const fieldsToFill = [];
  
  // Part name (usually 2nd text field)
  if (textInputs[1]) fieldsToFill.push({ element: textInputs[1], value: part.name });
  
  // Quantity
  const qtyField = numberInputs.find(inp =>
    inp.placeholder?.toLowerCase().includes('quantity') ||
    inp.getAttribute('aria-label')?.toLowerCase().includes('quantity')
  );
  if (qtyField) fieldsToFill.push({ element: qtyField, value: (part.quantity || 1).toString() });

  // Cost
  const costField = numberInputs.find(inp =>
    inp.placeholder?.toLowerCase().includes('cost') ||
    inp.getAttribute('aria-label')?.toLowerCase().includes('cost')
  );
  if (costField) {
    const costValue = (part.cost / 100).toFixed(2);
    fieldsToFill.push({ element: costField, value: costValue });
  }

  await batchFillFields(fieldsToFill);
  await new Promise(r => setTimeout(r, 100));
}

// =================================================================
// MESSAGE LISTENER: Trigger from background script
// =================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "FILL_ESTIMATE") {
    debug('Received fill request from background');
    fillTekmetricEstimate(message.jobData)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        debugError(error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }

  if (message.action === "CHECK_PENDING_ON_LOAD") {
    // Check for pending job when page loads
    chrome.runtime.sendMessage({ action: "GET_PENDING_JOB" }, (response) => {
      if (response && response.jobData) {
        debug('Found pending job on page load, filling now');
        fillTekmetricEstimate(response.jobData);
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

// Listen for postMessage from injected script (for instant fill)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'HEART_HELPER_FILL') {
    debug('Received fill request via postMessage (instant mode)');
    fillTekmetricEstimate(event.data.jobData);
  }
});

// Auto-check for pending jobs when Tekmetric page loads
if (window.location.href.includes('shop.tekmetric.com')) {
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: "GET_PENDING_JOB" }, (response) => {
      if (response && response.jobData) {
        debug('Auto-filling pending job on page load');
        fillTekmetricEstimate(response.jobData);
      }
    });
  }, 1000);
}

debug('Content script v2 loaded - instant fill enabled');
