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

// Wait for Job modal to appear after clicking Job button
function waitForModal(timeout = 15000) {
  console.log('⏳ Waiting for Job modal to appear...');
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkForModal = () => {
      // Look for modal dialog or any container with text inputs
      // Modal appears fast, just need to find it
      const dialogs = document.querySelectorAll('[role="dialog"], .modal, [class*="Modal"], [class*="dialog"]');
      
      for (const dialog of dialogs) {
        // Check if dialog has input fields (job name field)
        const inputs = dialog.querySelectorAll('input, textarea, [contenteditable="true"]');
        if (inputs.length >= 1) {
          const elapsed = Date.now() - startTime;
          console.log(`✓ Found modal with ${inputs.length} input fields (${elapsed}ms)`);
          return resolve(dialog);
        }
      }
      
      // Fallback: Look for any container with multiple inputs that appeared recently
      const allContainers = document.querySelectorAll('div[style*="z-index"], section');
      for (const container of allContainers) {
        const zIndex = parseInt(window.getComputedStyle(container).zIndex) || 0;
        if (zIndex > 100) {
          const inputs = container.querySelectorAll('input, textarea, [contenteditable="true"]');
          if (inputs.length >= 1 && inputs.length < 200) {
            const elapsed = Date.now() - startTime;
            console.log(`✓ Found high z-index container with ${inputs.length} inputs (${elapsed}ms)`);
            return resolve(container);
          }
        }
      }
      
      // Check if timeout exceeded
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        console.log('⚠️ Modal detection timed out, using document.body as fallback');
        return resolve(document.body);
      }
      
      // Log progress every 1 second
      if (elapsed % 1000 < 100) {
        console.log(`⏳ Still waiting for modal... (${Math.floor(elapsed / 1000)}s elapsed)`);
      }
      
      // Keep polling every 100ms
      setTimeout(checkForModal, 100);
    };
    
    // Start checking immediately
    checkForModal();
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
    console.log("⏸️ Already filling a job, skipping duplicate request");
    return;
  }
  
  isFillingJob = true;
  console.log("🚀 Starting to fill Tekmetric estimate with job data:", jobData);
  
  try {
    console.log("1️⃣ Checking if on Tekmetric page...");
    console.log("Current URL:", window.location.href);
    
    if (!window.location.href.includes('shop.tekmetric.com')) {
      console.log("❌ Not on Tekmetric page, skipping auto-fill");
      isFillingJob = false;
      return;
    }
    
    console.log("✅ On Tekmetric page, starting automation immediately...");
    // No artificial delay needed - page is already loaded when user switches to tab
    // Chrome throttles setTimeout in background tabs, causing 2.5min+ delays

    const jobButton = Array.from(document.querySelectorAll('button')).find(btn => {
      const icon = btn.querySelector('svg');
      return btn.textContent.trim() === 'Job' || (icon && btn.getAttribute('aria-label')?.includes('Job'));
    });
    
    if (!jobButton) {
      isFillingJob = false;
      throw new Error('Could not find Job button. Make sure you are on the Estimate tab.');
    }
    
    console.log('✓ Clicking Job button...');
    jobButton.click();
    
    console.log('3️⃣ Waiting for Job modal to fully render...');
    // Use waitForModal to explicitly wait for the dialog to render (can take 10-12 seconds!)
    const modal = await waitForModal(); // Uses default 15 second timeout
    
    console.log('✓ Found modal:', {tag: modal.tagName, role: modal.getAttribute('role'), className: modal.className});
    console.log('4️⃣ Searching for inputs INSIDE the modal only...');
    
    // Search for inputs ONLY inside the modal
    const modalInputs = Array.from(modal.querySelectorAll('input'));
    const modalTextareas = Array.from(modal.querySelectorAll('textarea'));
    const modalContentEditables = Array.from(modal.querySelectorAll('[contenteditable]'));
    
    console.log(`Found ${modalInputs.length} inputs, ${modalTextareas.length} textareas, ${modalContentEditables.length} contenteditable in modal`);
    console.log('Modal inputs:', modalInputs.map(i => ({tag: 'INPUT', type: i.type, value: i.value, placeholder: i.placeholder, id: i.id, name: i.name})));
    console.log('Modal textareas:', modalTextareas.map(t => ({tag: 'TEXTAREA', value: t.value, placeholder: t.placeholder})));
    console.log('Modal contentEditables:', modalContentEditables.map(c => ({tag: c.tagName, text: c.textContent})));
    
    // Try to find job name field
    let jobNameInput = null;
    
    // Strategy 1: Look for empty textarea first
    jobNameInput = modalTextareas.find(t => !t.value);
    
    // Strategy 2: Look for empty contenteditable
    if (!jobNameInput) {
      jobNameInput = modalContentEditables.find(c => 
        c.contentEditable && 
        c.contentEditable !== 'false' &&
        !c.textContent.trim()
      );
    }
    
    // Strategy 3: Look for ANY text-like input (exclude checkboxes, radios, hidden)
    if (!jobNameInput) {
      jobNameInput = modalInputs.find(i => 
        !i.value &&
        i.type !== 'hidden' &&
        i.type !== 'checkbox' &&
        i.type !== 'radio' &&
        !i.placeholder?.toLowerCase().includes('search')
      );
    }
    
    // Strategy 4: If still nothing, just use the FIRST visible text input
    if (!jobNameInput) {
      jobNameInput = modalInputs.find(i => 
        i.type !== 'hidden' &&
        i.type !== 'checkbox' &&
        i.type !== 'radio'
      );
    }
    
    if (!jobNameInput) {
      console.error('❌ Job name field not found');
      console.log('Tried textareas, contenteditable divs, and text inputs');
      isFillingJob = false;
      throw new Error('Could not find job name field after clicking Job button');
    }
    
    console.log('✓ Found job name field:', {
      tagName: jobNameInput.tagName,
      type: jobNameInput.type,
      id: jobNameInput.id,
      className: jobNameInput.className,
      contentEditable: jobNameInput.contentEditable,
      placeholder: jobNameInput.placeholder
    });
    console.log('✓ Filling job name:', jobData.jobName);
    
    try {
      // Check if it's a contenteditable element or an input
      if (jobNameInput.contentEditable === 'true') {
        console.log('Using contenteditable approach...');
        jobNameInput.textContent = jobData.jobName;
        jobNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (jobNameInput.tagName === 'INPUT' || jobNameInput.tagName === 'TEXTAREA') {
        console.log('Using input/textarea approach...');
        jobNameInput.value = '';
        jobNameInput.value = jobData.jobName;
        jobNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        jobNameInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.log('Using simple typing simulation...');
        // Just type the text character by character
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, jobData.jobName);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('✓ Job name filled successfully');
    } catch (err) {
      console.error('❌ Error filling job name:', err);
      throw err;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // NEW WORKFLOW: No Save needed! Immediately click "Add Labor" button in modal
    console.log('🆕 Looking for "Add Labor" button in modal (no Save needed!)...');
    
    for (const laborItem of jobData.laborItems) {
      console.log(`\n📋 Adding labor item: ${laborItem.name}`);
      
      // Find "Add Labor" button in the modal
      const addLaborButton = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = btn.textContent.trim().toLowerCase();
        return text.includes('add labor') || text === 'labor';
      });
      
      if (!addLaborButton) {
        console.error('❌ "Add Labor" button not found in modal');
        console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
        isFillingJob = false;
        throw new Error('Could not find "Add Labor" button');
      }
      
      // Snapshot inputs BEFORE clicking to detect new ones
      const inputsBefore = new Set(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      
      console.log('✓ Clicking "Add Labor" button');
      addLaborButton.click();
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for UI to fully render

      // Find NEW inputs that appeared after the click
      const inputsAfter = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      const newInputs = inputsAfter.filter(inp => !inputsBefore.has(inp));
      
      console.log(`✓ Detected ${newInputs.length} new input fields after clicking Add Labor`);
      
      if (newInputs.length === 0) {
        console.error('❌ No new inputs detected after Add Labor click');
        isFillingJob = false;
        throw new Error('Add Labor did not create new input fields - UI may have changed');
      }

      const inputs = newInputs;
      
      // Find labor description field - be VERY specific to avoid part fields
      const descriptionField = inputs.find(inp => {
        const placeholder = inp.placeholder?.toLowerCase() || '';
        const label = inp.getAttribute('aria-label')?.toLowerCase() || '';
        const name = inp.name?.toLowerCase() || '';
        const id = inp.id?.toLowerCase() || '';
        
        // MUST contain description/labor keywords AND NOT contain part/brand/number keywords
        const hasLaborKeyword = placeholder.includes('description') || 
                                label.includes('description') ||
                                placeholder.includes('labor') || 
                                label.includes('labor') || 
                                name.includes('labor') ||
                                name.includes('description');
        
        const hasPartKeyword = placeholder.includes('part') || 
                              label.includes('part') ||
                              name.includes('part') ||
                              placeholder.includes('brand') ||
                              name.includes('brand') ||
                              placeholder.includes('number') ||
                              id.includes('part');
        
        return hasLaborKeyword && !hasPartKeyword;
      });
      
      if (!descriptionField) {
        console.error('❌ Labor description field not found');
        console.log('Available inputs:', inputs.map(i => ({
          tag: i.tagName, 
          type: i.type, 
          placeholder: i.placeholder, 
          label: i.getAttribute('aria-label'),
          name: i.name
        })));
        isFillingJob = false;
        throw new Error('Could not find labor description field');
      }
      
      // Clear and fill the field, then blur to prevent autocomplete interference
      descriptionField.focus();
      descriptionField.value = '';
      await new Promise(resolve => setTimeout(resolve, 200));
      descriptionField.value = laborItem.name;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
      descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait before blur
      descriptionField.blur(); // Blur to commit the value and avoid autocomplete
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait after blur to ensure commit
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
      
      // No Save button needed - labor stays in modal
      console.log('✓ Labor item filled (no save needed)');
      await new Promise(resolve => setTimeout(resolve, 800)); // Longer wait before moving to parts
    }

    // Now add parts - each part needs "Add Parts" → "Add part manually" flow
    for (const part of jobData.parts) {
      console.log(`\n🔧 Adding part: ${part.name}`);
      
      // Find "Add Parts" button in modal
      const addPartsButton = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = btn.textContent.trim().toLowerCase();
        return text.includes('add part') || text === 'parts';
      });
      
      if (!addPartsButton) {
        console.error('❌ "Add Parts" button not found in modal');
        console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
        isFillingJob = false;
        throw new Error('Could not find "Add Parts" button');
      }
      
      console.log('✓ Clicking "Add Parts" button');
      addPartsButton.click();
      
      // Wait for dropdown to appear and find "Add part manually" option
      console.log('⏳ Waiting for "Add part manually" option to appear...');
      let addManuallyOption = null;
      let attempts = 0;
      const maxAttempts = 20; // 20 attempts x 250ms = 5 seconds max
      
      while (!addManuallyOption && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // Try to find the most specific clickable element
        const allElements = Array.from(document.querySelectorAll('button, a, li, div[role="option"], div[role="menuitem"], span'));
        const candidates = allElements.filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('add part manually') || (text.includes('manually') && text.length < 50);
        });
        
        // Prefer buttons/links over divs/spans
        addManuallyOption = candidates.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || 
                           candidates.find(el => el.getAttribute('role') === 'option' || el.getAttribute('role') === 'menuitem') ||
                           candidates[0];
        
        attempts++;
        if (!addManuallyOption && attempts % 4 === 0) {
          console.log(`⏳ Still waiting for dropdown... (${attempts * 250}ms elapsed)`);
        }
      }
      
      if (!addManuallyOption) {
        console.log('⚠️ "Add part manually" not found after 5 seconds');
        isFillingJob = false;
        throw new Error('Could not find "Add part manually" option in dropdown');
      }
      
      // Snapshot BEFORE clicking "Add part manually"
      const elementsBefore = new Set(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
      console.log(`📊 Snapshot before Add part manually: ${elementsBefore.size} total form elements`);
      
      // Helper function to click element with multiple strategies
      function clickElement(element, description) {
        console.log(`🖱️ Clicking ${description}:`, {
          tag: element.tagName,
          className: element.className,
          text: element.textContent?.substring(0, 50),
          role: element.getAttribute('role')
        });
        
        // Strategy 1: Regular click
        element.click();
        
        // Strategy 2: Dispatch mouse events (more realistic)
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        
        console.log(`✓ Dispatched click events on ${description}`);
      }
      
      // Try clicking "Add part manually" with retry logic
      let newInputs = [];
      const maxClickRetries = 3;
      
      for (let clickAttempt = 1; clickAttempt <= maxClickRetries; clickAttempt++) {
        console.log(`\n🔄 Attempt ${clickAttempt}: Finding and clicking "Add part manually"...`);
        clickElement(addManuallyOption, '"Add part manually" option');
        
        // Wait progressively longer and check for new inputs
        console.log('⏳ Waiting for part form to render...');
        let waitAttempts = 0;
        const maxWaitAttempts = 10; // 10 attempts x 400ms = 4 seconds max per attempt
        
        while (newInputs.length === 0 && waitAttempts < maxWaitAttempts) {
          await new Promise(resolve => setTimeout(resolve, 400));
          const elementsAfter = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
          const newElements = elementsAfter.filter(el => !elementsBefore.has(el));
          
          // Filter to only visible, non-hidden inputs
          newInputs = newElements.filter(el => {
            if (el.type === 'hidden') return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });
          
          waitAttempts++;
          if (waitAttempts % 3 === 0) {
            console.log(`⏳ Still waiting for part inputs... (${waitAttempts * 400}ms elapsed, ${newInputs.length} visible inputs so far)`);
          }
        }
        
        if (newInputs.length > 0) {
          console.log(`✓ Detected ${newInputs.length} new visible input fields after ${waitAttempts * 400}ms on attempt ${clickAttempt}`);
          break; // Success! Exit retry loop
        }
        
        // No inputs found, try again if we have retries left
        if (clickAttempt < maxClickRetries) {
          console.log(`⚠️ No inputs appeared after ${waitAttempts * 400}ms. Retrying click...`);
          // Re-find the "Add part manually" option in case dropdown closed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const allElements = Array.from(document.querySelectorAll('button, a, li, div[role="option"], div[role="menuitem"], span'));
          const candidates = allElements.filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('add part manually') || (text.includes('manually') && text.length < 50);
          });
          addManuallyOption = candidates.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || 
                             candidates.find(el => el.getAttribute('role') === 'option' || el.getAttribute('role') === 'menuitem') ||
                             candidates[0];
          
          if (!addManuallyOption) {
            console.log('⚠️ "Add part manually" option disappeared, clicking "Add Parts" again...');
            clickElement(addPartsButton, '"Add Parts" button (retry)');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const allElements2 = Array.from(document.querySelectorAll('button, a, li, div[role="option"], div[role="menuitem"], span'));
            const candidates2 = allElements2.filter(el => {
              const text = el.textContent?.toLowerCase() || '';
              return text.includes('add part manually') || (text.includes('manually') && text.length < 50);
            });
            addManuallyOption = candidates2.find(el => el.tagName === 'BUTTON' || el.tagName === 'A') || 
                               candidates2.find(el => el.getAttribute('role') === 'option' || el.getAttribute('role') === 'menuitem') ||
                               candidates2[0];
            
            if (!addManuallyOption) {
              console.error('❌ Could not re-find "Add part manually" option');
              break;
            }
          }
        }
      }
      
      if (newInputs.length === 0) {
        console.error(`❌ No new visible inputs detected after ${maxClickRetries} attempts`);
        isFillingJob = false;
        throw new Error(`Add part manually did not create new input fields after ${maxClickRetries} attempts - UI may have changed`);
      }

      const inputs = newInputs;
      
      console.log(`\n📝 Filling part: ${part.name}`);
      console.log('Available new input fields:', inputs.map(inp => ({
        tag: inp.tagName,
        type: inp.type,
        placeholder: inp.placeholder,
        name: inp.name,
        id: inp.id
      })));
      
      const partNumberField = inputs.find(inp => 
        inp.placeholder?.toLowerCase().includes('part number') ||
        inp.placeholder?.toLowerCase().includes('number')
      );
      if (partNumberField && part.partNumber) {
        partNumberField.focus();
        partNumberField.value = part.partNumber;
        partNumberField.dispatchEvent(new Event('input', { bubbles: true }));
        partNumberField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled part number:', part.partNumber);
      }
      
      // Look for description/brand/name field - try multiple strategies
      const descriptionField = inputs.find(inp => {
        const placeholder = inp.placeholder?.toLowerCase() || '';
        const name = inp.name?.toLowerCase() || '';
        const id = inp.id?.toLowerCase() || '';
        
        return placeholder.includes('part name') ||
               placeholder.includes('description') ||
               placeholder.includes('brand') ||
               (placeholder.includes('name') && !placeholder.includes('customer')) ||
               name.includes('description') ||
               name.includes('brand') ||
               name.includes('partname') ||
               id.includes('description') ||
               id.includes('partname');
      });
      
      if (descriptionField) {
        const description = part.brand ? `${part.brand} ${part.name}` : part.name;
        
        // React-compatible filling strategy
        descriptionField.focus();
        
        // Use React's internal setter if available
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(descriptionField, description);
        
        // Trigger React's onChange handler
        const inputEvent = new Event('input', { bubbles: true });
        descriptionField.dispatchEvent(inputEvent);
        
        const changeEvent = new Event('change', { bubbles: true });
        descriptionField.dispatchEvent(changeEvent);
        
        // Additional events for good measure
        descriptionField.dispatchEvent(new Event('blur', { bubbles: true }));
        
        console.log('✓ Filled description using React setter:', description);
        console.log('  Field value after filling:', descriptionField.value);
      } else {
        console.log('⚠️ Could not find description field');
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
      
      // Fill cost price field
      const costField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('cost') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('cost')
        )
      );
      if (costField && part.cost) {
        costField.focus();
        costField.value = part.cost.toString();
        costField.dispatchEvent(new Event('input', { bubbles: true }));
        costField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled cost price:', part.cost);
      }
      
      // Fill sale/retail price field
      const retailField = inputs.find(inp => 
        inp.type === 'number' && (
          inp.placeholder?.toLowerCase().includes('retail') ||
          inp.placeholder?.toLowerCase().includes('sale') ||
          inp.placeholder?.toLowerCase().includes('price') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('sale') ||
          inp.getAttribute('aria-label')?.toLowerCase().includes('retail')
        )
      );
      if (retailField && part.retail) {
        retailField.focus();
        retailField.value = part.retail.toString();
        retailField.dispatchEvent(new Event('input', { bubbles: true }));
        retailField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✓ Filled sale price:', part.retail);
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
    
    // Find and click the final SAVE button (multiple attempts with better detection)
    console.log('\n💾 Looking for final SAVE button...');
    let finalSaveButton = null;
    let saveAttempts = 0;
    const maxSaveAttempts = 5;
    
    while (!finalSaveButton && saveAttempts < maxSaveAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Look for SAVE button with various criteria
      const buttons = Array.from(document.querySelectorAll('button'));
      finalSaveButton = buttons.find(btn => {
        const text = btn.textContent?.trim().toUpperCase() || '';
        const isVisible = btn.offsetParent !== null; // Check if visible
        return isVisible && (
          text === 'SAVE' || 
          text === 'BUILD' ||
          text.includes('SAVE') ||
          (btn.getAttribute('type') === 'submit' && text.length < 15)
        );
      });
      
      saveAttempts++;
      if (!finalSaveButton && saveAttempts % 2 === 0) {
        console.log(`⏳ Still looking for SAVE button... (attempt ${saveAttempts})`);
      }
    }
    
    if (finalSaveButton) {
      console.log('✓ Found SAVE button, clicking now...');
      clickElement(finalSaveButton, 'final SAVE button');
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log("✅ Successfully filled and saved Tekmetric job!");
    } else {
      console.log('⚠️ Could not find SAVE button - user may need to click it manually');
      console.log("✅ Successfully filled Tekmetric job (manual save required)!");
    }
    
    chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" }, (response) => {
      console.log("📦 Cleared pending job after success:", response);
    });
    
    showSuccessNotification(jobData);
    isFillingJob = false;
    
  } catch (error) {
    console.error("❌ Error filling Tekmetric estimate:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // CRITICAL: Clear job data even on error to prevent infinite loop
    chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" }, (response) => {
      console.log("📦 Cleared pending job after error:", response);
    });
    
    showErrorNotification(error.message);
    isFillingJob = false;
    throw error; // Re-throw to ensure it appears in console
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
  console.log("🔍 Checking for pending job data...");
  chrome.runtime.sendMessage({ action: "GET_PENDING_JOB" }, (response) => {
    console.log("📬 GET_PENDING_JOB response:", response);
    if (response && response.jobData) {
      console.log("✅ Found pending job data, auto-filling...");
      console.log("Job data:", response.jobData);
      fillTekmetricEstimate(response.jobData);
    } else {
      console.log("⚠️ No pending job data found");
    }
  });
}

// Listen for storage changes to trigger automation instantly
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.lastJobData) {
    console.log("🔔 Storage changed - job data added!");
    if (changes.lastJobData.newValue) {
      console.log("⚡ Triggering automation immediately!");
      fillTekmetricEstimate(changes.lastJobData.newValue);
    }
  }
});

// Listen for messages from the search tool (cross-tab communication)
window.addEventListener('message', (event) => {
  console.log("📬 Received window message:", event.data);
  
  // Verify origin for security
  if (event.origin !== window.location.origin) {
    console.log("⚠️ Ignoring message from different origin:", event.origin);
    return;
  }
  
  // Check if it's a job data message
  if (event.data && event.data.action === 'SEND_TO_TEKMETRIC' && event.data.payload) {
    console.log("✅ Received job data from search tool!");
    console.log("Job data:", event.data.payload);
    
    // Store the job data for cross-tab access
    chrome.runtime.sendMessage({
      action: "STORE_PENDING_JOB",
      jobData: event.data.payload
    }, (response) => {
      console.log("📦 Job data stored in extension storage:", response);
    });
  }
});

console.log("📋 Tekmetric Job Importer initialized, document ready state:", document.readyState);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log("📄 DOMContentLoaded - checking for pending jobs in 2s...");
    setTimeout(checkForPendingJob, 2000);
  });
} else {
  console.log("📄 Document already loaded - checking for pending jobs in 2s...");
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
