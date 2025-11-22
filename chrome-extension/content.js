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

let isFillingJob = false;

async function fillTekmetricEstimate(jobData) {
  if (isFillingJob) {
    console.log("Already filling a job, skipping duplicate request");
    return;
  }
  
  isFillingJob = true;
  console.log("Starting to fill Tekmetric estimate with job data:", jobData);
  
  try {
    if (!window.location.href.includes('shop.tekmetric.com')) {
      console.log("Not on Tekmetric page, skipping auto-fill");
      isFillingJob = false;
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const jobButton = Array.from(document.querySelectorAll('button')).find(btn => {
      const icon = btn.querySelector('svg');
      return btn.textContent.trim() === 'Job' || (icon && btn.getAttribute('aria-label')?.includes('Job'));
    });
    
    if (!jobButton) {
      isFillingJob = false;
      throw new Error('Could not find Job button. Make sure you are on the Estimate tab.');
    }
    
    console.log('Clicking Job button...');
    jobButton.click();
    await new Promise(resolve => setTimeout(resolve, 1200));

    const jobNameInput = document.querySelector('input[type="text"]') || 
                         Array.from(document.querySelectorAll('input')).find(inp => 
                           inp.type === 'text' && !inp.disabled && inp.offsetParent !== null
                         );
    
    if (!jobNameInput) {
      isFillingJob = false;
      throw new Error('Could not find job name input field');
    }
    
    console.log('✓ Filling job name:', jobData.jobName);
    jobNameInput.focus();
    jobNameInput.value = jobData.jobName;
    jobNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    jobNameInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 800));

    // After filling job name, we need to SAVE/CREATE the job
    console.log('Looking for Save/Create/Add button...');
    const jobSaveButton = Array.from(document.querySelectorAll('button')).find(btn => {
      const text = btn.textContent.trim().toLowerCase();
      return text === 'save' || text === 'create' || text === 'add' || text === 'ok' || text.includes('create job');
    });
    
    if (jobSaveButton) {
      console.log('✓ Clicking save button:', jobSaveButton.textContent.trim());
      jobSaveButton.click();
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      console.log('⚠️ No save button found, trying to proceed anyway...');
      console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t));
    }

    for (const laborItem of jobData.laborItems) {
      console.log(`Adding labor item: ${laborItem.name}`);
      
      const addLaborButton = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent.includes('ADD LABOR')
      );
      
      if (!addLaborButton) {
        console.error('❌ ADD LABOR button not found - stopping automation');
        console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t));
        isFillingJob = false;
        throw new Error('Could not find ADD LABOR button');
      }
      
      console.log('Clicking ADD LABOR button...');
      addLaborButton.click();
      await new Promise(resolve => setTimeout(resolve, 800));

      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      
      const descriptionField = inputs.find(inp => 
        inp.placeholder?.toLowerCase().includes('description') || 
        inp.getAttribute('aria-label')?.toLowerCase().includes('description')
      );
      if (!descriptionField) {
        console.error('Labor description field not found - stopping automation');
        console.log('Available inputs:', inputs.map(i => ({tag: i.tagName, type: i.type, placeholder: i.placeholder, label: i.getAttribute('aria-label')})));
        isFillingJob = false;
        throw new Error('Could not find labor description field');
      }
      descriptionField.focus();
      descriptionField.value = laborItem.name;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
      descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('✓ Filled labor description:', laborItem.name);
      
      const hoursField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('hour') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('hour')
        )
      );
      if (hoursField) {
        hoursField.focus();
        hoursField.value = laborItem.hours.toString();
        hoursField.dispatchEvent(new Event('input', { bubbles: true }));
        hoursField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled hours:', laborItem.hours);
      }
      
      const rateField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('rate') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('rate')
        )
      );
      if (rateField) {
        rateField.focus();
        rateField.value = laborItem.rate.toString();
        rateField.dispatchEvent(new Event('input', { bubbles: true }));
        rateField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled rate:', laborItem.rate);
      }
      
      // Look for and click Save button after filling each labor item
      await new Promise(resolve => setTimeout(resolve, 600));
      const laborSaveBtn = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = btn.textContent.trim().toLowerCase();
        return text === 'save' || text === 'add' || text === 'ok';
      });
      if (laborSaveBtn) {
        console.log('✓ Saving labor item...');
        laborSaveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('⚠️ No save button found for labor item');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    for (const part of jobData.parts) {
      console.log(`Adding part: ${part.name}`);
      
      const addPartButton = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent.includes('ADD PART')
      );
      
      if (!addPartButton) {
        console.error('ADD PART button not found - stopping automation');
        isFillingJob = false;
        throw new Error('Could not find ADD PART button');
      }
      
      console.log('Clicking ADD PART button...');
      addPartButton.click();
      await new Promise(resolve => setTimeout(resolve, 800));

      const addManuallyOption = Array.from(document.querySelectorAll('div, button, li')).find(el => 
        el.textContent.includes('Add part manually')
      );
      
      if (addManuallyOption) {
        console.log('Clicking "Add part manually"...');
        addManuallyOption.click();
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      
      const partNumberField = inputs.find(inp => 
        inp.placeholder?.toLowerCase().includes('part number') ||
        inp.placeholder?.toLowerCase().includes('number')
      );
      if (partNumberField && part.partNumber) {
        partNumberField.focus();
        partNumberField.value = part.partNumber;
        partNumberField.dispatchEvent(new Event('input', { bubbles: true }));
        partNumberField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const brandField = inputs.find(inp => 
        inp.placeholder?.toLowerCase().includes('brand') ||
        inp.placeholder?.toLowerCase().includes('description')
      );
      if (brandField) {
        const brandName = part.brand ? `${part.brand} ${part.name}` : part.name;
        brandField.focus();
        brandField.value = brandName;
        brandField.dispatchEvent(new Event('input', { bubbles: true }));
        brandField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const qtyField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('qty') ||
          inp.placeholder?.toLowerCase().includes('quantity')
        )
      );
      if (qtyField) {
        qtyField.focus();
        qtyField.value = part.quantity.toString();
        qtyField.dispatchEvent(new Event('input', { bubbles: true }));
        qtyField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const costField = inputs.find(inp => 
        inp.type === 'number' && inp.placeholder?.toLowerCase().includes('cost')
      );
      if (costField) {
        costField.focus();
        costField.value = part.cost.toString();
        costField.dispatchEvent(new Event('input', { bubbles: true }));
        costField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      const retailField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('retail') ||
          inp.placeholder?.toLowerCase().includes('price')
        )
      );
      if (retailField) {
        retailField.focus();
        retailField.value = part.retail.toString();
        retailField.dispatchEvent(new Event('input', { bubbles: true }));
        retailField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled retail:', part.retail);
      }
      
      // Look for and click Save button after filling each part
      await new Promise(resolve => setTimeout(resolve, 600));
      const partSaveBtn = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = btn.textContent.trim().toLowerCase();
        return text === 'save' || text === 'add' || text === 'ok';
      });
      if (partSaveBtn) {
        console.log('✓ Saving part...');
        partSaveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('⚠️ No save button found for part');
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    
    const finalSaveButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.trim() === 'SAVE'
    );
    
    if (finalSaveButton) {
      console.log('Clicking final SAVE button...');
      finalSaveButton.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("✓ Successfully filled and saved Tekmetric job");
    
    chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" });
    
    showSuccessNotification(jobData);
    isFillingJob = false;
    
  } catch (error) {
    console.error("❌ Error filling Tekmetric estimate:", error);
    showErrorNotification(error.message);
    isFillingJob = false;
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
