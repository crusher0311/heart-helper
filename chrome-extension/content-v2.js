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

  try {
    if (!window.location.href.includes('shop.tekmetric.com')) {
      isFillingJob = false;
      return;
    }

    debug('Starting instant auto-fill for:', jobData.jobName);

    // Step 1: Find and verify Job button exists
    const jobButton = Array.from(document.querySelectorAll('button')).find(btn =>
      btn.textContent.trim() === 'Job' || btn.getAttribute('aria-label')?.includes('Job')
    );

    if (!jobButton) {
      throw new Error('Job button not found - may already be in modal or page structure changed');
    }

    jobButton.click();
    const modal = await waitForModal();

    if (!modal) {
      throw new Error('Modal failed to appear after clicking Job button');
    }

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

    debug('Auto-fill complete - clearing pending job');
    
    // Clear pending job ONLY after successful fill
    chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" });
    
    isFillingJob = false;

  } catch (error) {
    debugError('Auto-fill failed:', error);
    debugError('Job data will remain pending for retry');
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
  
  // Wait for new fields to appear (deterministic check)
  let newInputs = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 50));
    const inputsAfter = Array.from(document.querySelectorAll('input, textarea'));
    newInputs = inputsAfter.filter(inp => !inputsBefore.has(inp) && inp.type !== 'hidden');
    if (newInputs.length > 0) break;
  }

  if (newInputs.length === 0) throw new Error('No new labor fields appeared after 1 second');

  // Find fields by placeholder, aria-label, or nearby label
  const descField = newInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return (ph.includes('description') || ph.includes('labor') || label.includes('description')) && 
           !ph.includes('part') && !label.includes('part');
  });

  const hoursField = newInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return inp.type === 'number' && (ph.includes('hour') || label.includes('hour'));
  });

  const rateField = newInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return inp.type === 'number' && (ph.includes('rate') || label.includes('rate') || ph.includes('price'));
  });

  const fieldsToFill = [];
  if (descField) fieldsToFill.push({ element: descField, value: laborItem.name });
  if (hoursField) fieldsToFill.push({ element: hoursField, value: laborItem.hours.toString() });
  if (rateField) fieldsToFill.push({ element: rateField, value: laborItem.rate.toString() });

  if (fieldsToFill.length === 0) {
    debugError('Could not identify labor fields, filling first available fields as fallback');
    // Fallback: fill first text, first two numbers
    const textInputs = newInputs.filter(i => i.type === 'text' || i.tagName === 'TEXTAREA');
    const numInputs = newInputs.filter(i => i.type === 'number');
    if (textInputs[0]) fieldsToFill.push({ element: textInputs[0], value: laborItem.name });
    if (numInputs[0]) fieldsToFill.push({ element: numInputs[0], value: laborItem.hours.toString() });
    if (numInputs[1]) fieldsToFill.push({ element: numInputs[1], value: laborItem.rate.toString() });
  }

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
  
  // Wait deterministically for "Add part manually" option
  let addManuallyOption = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 50));
    const elements = Array.from(document.querySelectorAll('button, a, li, div[role="option"], span, [role="menuitem"]'));
    addManuallyOption = elements.find(el =>
      el.textContent?.toLowerCase().includes('add part manually') ||
      el.textContent?.toLowerCase().includes('manual')
    );
    if (addManuallyOption) break;
  }

  if (!addManuallyOption) {
    debugError('Add part manually option not found - may need to update selector');
    throw new Error('Add part manually not found');
  }

  const elementsBefore = new Set(document.querySelectorAll('input, textarea'));
  addManuallyOption.click();
  
  // Wait for new part fields to appear
  let newInputs = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 50));
    const elementsAfter = Array.from(document.querySelectorAll('input, textarea'));
    newInputs = elementsAfter.filter(el =>
      !elementsBefore.has(el) && el.type !== 'hidden'
    );
    if (newInputs.length > 0) break;
  }

  if (newInputs.length === 0) throw new Error('No new part fields appeared after 1 second');

  // Find fields using multiple strategies
  const textInputs = newInputs.filter(inp => inp.type === 'text' || inp.tagName === 'TEXTAREA');
  const numberInputs = newInputs.filter(inp => inp.type === 'number');

  const fieldsToFill = [];
  
  // Part name - try to find by label/placeholder first, fallback to position
  const nameField = textInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('name') || ph.includes('description') || 
           label.includes('name') || label.includes('description');
  }) || textInputs[1] || textInputs[0];
  
  if (nameField) fieldsToFill.push({ element: nameField, value: part.name });
  
  // Quantity
  const qtyField = numberInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('quantity') || ph.includes('qty') || 
           label.includes('quantity') || label.includes('qty');
  });
  if (qtyField) fieldsToFill.push({ element: qtyField, value: (part.quantity || 1).toString() });

  // Cost
  const costField = numberInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('cost') || ph.includes('price') || 
           label.includes('cost') || label.includes('price');
  });
  if (costField) {
    const costValue = (part.cost / 100).toFixed(2);
    fieldsToFill.push({ element: costField, value: costValue });
  }

  if (fieldsToFill.length === 0) {
    debugError('Could not identify part fields, using fallback positional strategy');
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
  // Validate source is same window (from our injected script)
  if (event.source !== window) return;
  
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
