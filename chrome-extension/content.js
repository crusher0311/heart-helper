console.log("Tekmetric Job Importer: Content script loaded");

let checkHistoryButton = null;

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

function fillInput(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return false;
  
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  
  return true;
}

function clickElement(selector) {
  const element = document.querySelector(selector);
  if (!element) return false;
  
  element.click();
  return true;
}

async function fillTekmetricEstimate(jobData) {
  console.log("Starting to fill Tekmetric estimate with job data:", jobData);
  
  try {
    if (!window.location.href.includes('shop.tekmetric.com')) {
      console.log("Not on Tekmetric page, skipping auto-fill");
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const laborItem of jobData.laborItems) {
      console.log(`Adding labor item: ${laborItem.name}`);
      
      const addLaborButton = document.querySelector('[data-testid="add-labor-button"]') || 
                             Array.from(document.querySelectorAll('button')).find(btn => {
                               const text = btn.textContent.toLowerCase();
                               return text.includes('labor') || text.includes('add labor');
                             });
      
      if (addLaborButton) {
        console.log('Found Add Labor button, clicking...');
        addLaborButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn('Add Labor button not found');
      }

      const filled = fillInput('input[name="labor-description"]', laborItem.name) ||
                     fillInput('input[placeholder*="escription" i]', laborItem.name) ||
                     fillInput('textarea[name="labor-description"]', laborItem.name);
      
      fillInput('input[name="labor-hours"]', laborItem.hours.toString()) ||
        fillInput('input[placeholder*="ours" i]', laborItem.hours.toString());
        
      fillInput('input[name="labor-rate"]', laborItem.rate.toString()) ||
        fillInput('input[placeholder*="ate" i]', laborItem.rate.toString());
      
      if (!filled) {
        console.warn('Could not find labor input fields');
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    for (const part of jobData.parts) {
      console.log(`Adding part: ${part.name}`);
      
      const addPartButton = document.querySelector('[data-testid="add-part-button"]') ||
                            Array.from(document.querySelectorAll('button')).find(btn => {
                              const text = btn.textContent.toLowerCase();
                              return text.includes('part') || text.includes('add part');
                            });
      
      if (addPartButton) {
        console.log('Found Add Part button, clicking...');
        addPartButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn('Add Part button not found');
      }

      fillInput('input[name="part-number"]', part.partNumber || '') ||
        fillInput('input[placeholder*="umber" i]', part.partNumber || '');
        
      fillInput('input[name="part-description"]', part.name) ||
        fillInput('input[placeholder*="escription" i]', part.name) ||
        fillInput('textarea[name="part-description"]', part.name);
        
      fillInput('input[name="part-quantity"]', part.quantity.toString()) ||
        fillInput('input[placeholder*="uantity" i]', part.quantity.toString());
        
      fillInput('input[name="part-cost"]', part.cost.toString()) ||
        fillInput('input[placeholder*="ost" i]', part.cost.toString());
        
      fillInput('input[name="part-retail"]', part.retail.toString()) ||
        fillInput('input[placeholder*="etail" i]', part.retail.toString()) ||
        fillInput('input[placeholder*="rice" i]', part.retail.toString());
        
      if (part.brand) {
        fillInput('input[name="part-brand"]', part.brand) ||
          fillInput('input[placeholder*="rand" i]', part.brand);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log("Successfully filled Tekmetric estimate");
    
    chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" });
    
    showSuccessNotification(jobData);
    
  } catch (error) {
    console.error("Error filling Tekmetric estimate:", error);
    showErrorNotification(error.message);
  }
}

function showSuccessNotification(jobData) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
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
  title.textContent = '✓ Job Imported Successfully';
  
  const details = document.createElement('div');
  details.textContent = `${jobData.jobName} - ${jobData.laborItems.length} labor items, ${jobData.parts.length} parts`;
  
  notification.appendChild(title);
  notification.appendChild(details);
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
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
  
  const details = document.createElement('div');
  details.textContent = message;
  
  notification.appendChild(title);
  notification.appendChild(details);
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 7000);
}

function checkForPendingJob() {
  chrome.runtime.sendMessage({ action: "GET_PENDING_JOB" }, (response) => {
    if (response && response.jobData) {
      console.log("Found pending job data, auto-filling...");
      fillTekmetricEstimate(response.jobData);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkForPendingJob, 2000);
  });
} else {
  setTimeout(checkForPendingJob, 2000);
}

const observer = new MutationObserver(() => {
  if (window.location.href.includes('/estimates/') || window.location.href.includes('/repair-orders/')) {
    checkForPendingJob();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

function extractVehicleData() {
  const data = {
    make: '',
    model: '',
    year: '',
    engine: '',
    concerns: ''
  };

  const allText = document.body.innerText;
  
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

  const concernsElements = document.querySelectorAll('[class*="concern" i], [class*="customer" i] textarea, [class*="issue" i] textarea');
  if (concernsElements.length > 0) {
    data.concerns = Array.from(concernsElements)
      .map(el => el.value || el.textContent)
      .filter(text => text && text.length > 5)
      .join(', ')
      .substring(0, 200);
  }

  if (!data.concerns) {
    const textAreas = document.querySelectorAll('textarea');
    for (const textarea of textAreas) {
      const text = textarea.value || textarea.textContent;
      if (text && text.length > 10 && text.length < 500) {
        data.concerns = text.substring(0, 200);
        break;
      }
    }
  }

  console.log("Extracted vehicle data:", data);
  return data;
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
