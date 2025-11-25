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
  return new Promise((resolve, reject) => {
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
        return reject(new Error('Modal failed to appear within timeout'));
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

    // Verify we got a Tekmetric job modal (not settings/other dialogs)
    const hasJobFormMarkers = modal.querySelector('button[aria-label*="labor"], button[aria-label*="Labor"]') ||
                              Array.from(modal.querySelectorAll('button')).some(btn => 
                                btn.textContent.toLowerCase().includes('add labor') || 
                                btn.textContent.toLowerCase().includes('add part')
                              );

    if (!hasJobFormMarkers) {
      throw new Error('Modal appeared but does not contain job form markers - may be wrong dialog type');
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
    return (ph.includes('name') || ph.includes('description')) && 
           !ph.includes('part') && !ph.includes('number') &&
           (label.includes('name') || label.includes('description'));
  }) || textInputs[1] || textInputs[0];
  
  if (nameField) fieldsToFill.push({ element: nameField, value: part.name });
  
  // Part number
  const partNumberField = textInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('part') && (ph.includes('number') || ph.includes('num') || ph.includes('#')) ||
           label.includes('part') && (label.includes('number') || label.includes('num'));
  });
  if (partNumberField && part.partNumber) {
    fieldsToFill.push({ element: partNumberField, value: part.partNumber });
  }
  
  // Brand
  const brandField = textInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('brand') || ph.includes('manufacturer') ||
           label.includes('brand') || label.includes('manufacturer');
  });
  if (brandField && part.brand) {
    fieldsToFill.push({ element: brandField, value: part.brand });
  }
  
  // Quantity
  const qtyField = numberInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('quantity') || ph.includes('qty') || 
           label.includes('quantity') || label.includes('qty');
  });
  if (qtyField) fieldsToFill.push({ element: qtyField, value: (part.quantity || 1).toString() });

  // Cost (already in dollars from payload)
  const costField = numberInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return (ph.includes('cost') || ph.includes('wholesale')) && !ph.includes('retail') ||
           (label.includes('cost') || label.includes('wholesale')) && !label.includes('retail');
  });
  if (costField && part.cost != null) {
    fieldsToFill.push({ element: costField, value: part.cost.toFixed(2) });
  }
  
  // Retail price (already in dollars from payload)
  const retailField = numberInputs.find(inp => {
    const ph = inp.placeholder?.toLowerCase() || '';
    const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
    return ph.includes('retail') || ph.includes('sell') || ph.includes('price') ||
           label.includes('retail') || label.includes('sell') || label.includes('price');
  });
  if (retailField && part.retail != null) {
    fieldsToFill.push({ element: retailField, value: part.retail.toFixed(2) });
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
  // Strict validation: source must be same window, origin must match current page
  if (event.source !== window) return;
  if (event.origin && event.origin !== window.location.origin) return;
  
  // Validate message structure
  if (!event.data || event.data.type !== 'HEART_HELPER_FILL') return;
  if (!event.data.jobData || typeof event.data.jobData !== 'object') return;
  
  debug('Received fill request via postMessage (instant mode)');
  fillTekmetricEstimate(event.data.jobData);
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

// =================================================================
// CHECK HISTORY BUTTON: Extract vehicle data from Tekmetric RO page
// =================================================================

function extractVehicleData() {
  const data = {
    make: '',
    model: '',
    year: '',
    engine: '',
    concerns: '',
    repairOrderId: ''
  };

  const allText = document.body.innerText;
  
  const urlMatch = window.location.href.match(/repair-orders\/(\d+)/);
  if (urlMatch) {
    data.repairOrderId = urlMatch[1];
    console.log("Extracted RO ID from URL:", data.repairOrderId);
  }
  
  const vinMatch = allText.match(/VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
  if (vinMatch) {
    data.vin = vinMatch[1];
  }

  const yearMatch = allText.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    data.year = yearMatch[0];
  }

  const makeModelRegex = /(Toyota|Honda|Ford|Chevrolet|Nissan|Hyundai|Kia|Jeep|Ram|GMC|Subaru|Mazda|Volkswagen|BMW|Mercedes-Benz|Audi|Lexus|Acura|Infiniti|Cadillac|Buick|Lincoln|Chrysler|Dodge|Mitsubishi|Volvo|Porsche|Tesla|Land Rover|Jaguar|Mini|Fiat|Alfa Romeo)\s+([A-Za-z0-9\s-]+?)(?=\s+\d{4}|\s+Sport|\s+\d\.\d)/i;
  const makeModelMatch = allText.match(makeModelRegex);
  if (makeModelMatch) {
    data.make = makeModelMatch[1];
    data.model = makeModelMatch[2].trim();
  }

  const engineMatch = allText.match(/(\d\.\d+L)\s*(V\d+|I\d+|H\d+)?/i);
  if (engineMatch) {
    data.engine = engineMatch[0].trim();
  }

  const concernsElements = document.querySelectorAll('[class*="concern" i], [class*="customer" i] textarea, [class*="complaint" i] textarea, [class*="issue" i] textarea');
  if (concernsElements.length > 0) {
    data.concerns = Array.from(concernsElements)
      .map(el => el.value || el.textContent)
      .filter(text => text && text.trim().length > 5)
      .join(', ')
      .trim()
      .substring(0, 200);
  }

  if (!data.concerns) {
    const labels = Array.from(document.querySelectorAll('label, div'));
    for (const label of labels) {
      const labelText = label.textContent.toLowerCase();
      if (labelText.includes('concern') || labelText.includes('complaint') || labelText.includes('customer') || labelText.includes('reason for visit')) {
        const nextElement = label.nextElementSibling;
        if (nextElement && (nextElement.tagName === 'TEXTAREA' || nextElement.tagName === 'INPUT')) {
          const text = nextElement.value || nextElement.textContent;
          if (text && text.trim().length > 5) {
            data.concerns = text.trim().substring(0, 200);
            break;
          }
        }
        
        const textarea = label.querySelector('textarea') || label.querySelector('input[type="text"]');
        if (textarea) {
          const text = textarea.value || textarea.textContent;
          if (text && text.trim().length > 5) {
            data.concerns = text.trim().substring(0, 200);
            break;
          }
        }
      }
    }
  }

  if (!data.concerns) {
    const textAreas = document.querySelectorAll('textarea');
    for (const textarea of textAreas) {
      const text = textarea.value || textarea.textContent;
      if (text && text.trim().length > 10 && text.trim().length < 500) {
        const trimmedText = text.trim();
        if (!trimmedText.toLowerCase().includes('internal note') && 
            !trimmedText.toLowerCase().includes('technician note')) {
          data.concerns = trimmedText.substring(0, 200);
          break;
        }
      }
    }
  }

  console.log("Extracted vehicle data:", data);
  return data;
}

function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 400px;
  `;
  
  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '4px';
  title.textContent = '⚠ Import Failed';
  
  const messageDiv = document.createElement('div');
  messageDiv.textContent = message;
  
  notification.appendChild(title);
  notification.appendChild(messageDiv);
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

function injectCheckHistoryButton() {
  if (checkHistoryButton || !window.location.href.includes('/repair-orders/')) {
    return;
  }

  const targetContainer = document.querySelector('[data-testid="ro-header"]') ||
                          document.querySelector('header') ||
                          document.querySelector('[class*="header" i]');

  if (!targetContainer) {
    console.log("Could not find suitable container for Check History button");
    return;
  }

  checkHistoryButton = document.createElement('button');
  checkHistoryButton.textContent = 'Check History';
  checkHistoryButton.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    transition: all 0.2s ease;
    margin-left: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 9999;
  `;

  checkHistoryButton.addEventListener('mouseenter', () => {
    checkHistoryButton.style.transform = 'translateY(-1px)';
    checkHistoryButton.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });

  checkHistoryButton.addEventListener('mouseleave', () => {
    checkHistoryButton.style.transform = 'translateY(0)';
    checkHistoryButton.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
  });

  checkHistoryButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const vehicleData = extractVehicleData();
    
    const params = new URLSearchParams();
    if (vehicleData.make) params.set('make', vehicleData.make);
    if (vehicleData.model) params.set('model', vehicleData.model);
    if (vehicleData.year) params.set('year', vehicleData.year);
    if (vehicleData.engine) params.set('engine', vehicleData.engine);
    if (vehicleData.concerns) params.set('search', vehicleData.concerns);
    if (vehicleData.repairOrderId) params.set('roId', vehicleData.repairOrderId);
    
    chrome.storage.local.get(['appUrl'], (result) => {
      if (!result.appUrl) {
        showErrorNotification('Extension not configured. Click the extension icon and set your app URL in Settings.');
        return;
      }
      
      const searchUrl = `${result.appUrl}/?${params.toString()}`;
      
      console.log("Opening search with URL:", searchUrl);
      console.log("Vehicle data:", vehicleData);
      window.open(searchUrl, '_blank');
    });
  });

  targetContainer.appendChild(checkHistoryButton);
  console.log("Check History button injected");
}

function observePageChanges() {
  const checkAndInject = () => {
    if (window.location.href.includes('/repair-orders/') && !checkHistoryButton) {
      setTimeout(injectCheckHistoryButton, 1000);
    } else if (!window.location.href.includes('/repair-orders/') && checkHistoryButton) {
      checkHistoryButton?.remove();
      checkHistoryButton = null;
    }
  };

  checkAndInject();

  const urlObserver = new MutationObserver(checkAndInject);
  urlObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  let lastUrl = window.location.href;
  setInterval(() => {
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      checkAndInject();
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observePageChanges);
} else {
  observePageChanges();
}
