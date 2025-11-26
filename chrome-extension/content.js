console.log("Tekmetric Job Importer: Content script loaded");

let checkHistoryButton = null;
let injectedIcons = new Set(); // Track which textareas already have icons

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
  
  // CRITICAL: Clear job data immediately to prevent duplicate runs
  chrome.runtime.sendMessage({ action: "CLEAR_PENDING_JOB" }, () => {
    console.log("🧹 Cleared pending job data from storage");
  });
  
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
    for (const [partIndex, part] of jobData.parts.entries()) {
      console.log(`\n🔧 Adding part ${partIndex + 1}/${jobData.parts.length}: ${part.name}`);
      
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
      
      // Tekmetric field order: Brand → Part Name → Part Number → Details → Quantity → Cost
      // Note: TAB simulation doesn't work - we must focus each field manually
      
      // Separate text inputs from number inputs
      const textInputs = inputs.filter(inp => inp.type === 'text' && inp.offsetParent !== null);
      const numberInputs = inputs.filter(inp => inp.type === 'number' && inp.offsetParent !== null);
      
      console.log('Found text inputs:', textInputs.length, 'number inputs:', numberInputs.length);
      console.log('Text input details:', textInputs.map(inp => ({placeholder: inp.placeholder, type: inp.type})));
      console.log('Number input details:', numberInputs.map(inp => ({placeholder: inp.placeholder, type: inp.type})));
      
      // Helper to fill text field character-by-character
      async function fillTextField(element, text, label) {
        element.focus();
        await new Promise(resolve => setTimeout(resolve, 50));
        element.value = '';
        for (let i = 0; i < text.length; i++) {
          element.value = text.substring(0, i + 1);
          element.dispatchEvent(new InputEvent('input', { 
            bubbles: true,
            data: text[i]
          }));
          if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 5));
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log(`✓ Filled ${label}:`, text);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Helper to fill number field
      async function fillNumberField(element, value, label) {
        element.focus();
        await new Promise(resolve => setTimeout(resolve, 50));
        element.value = value.toString();
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log(`✓ Filled ${label}:`, value);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Fill text fields in order: Brand (0), Part Name (1), Part Number (2), Details (3)
      console.log('Starting text field fills...');
      try {
        if (textInputs.length >= 4) {
          // Field 1: Brand
          if (part.brand) {
            console.log('About to fill brand:', part.brand);
            await fillTextField(textInputs[0], part.brand, 'brand');
          }
          
          // Field 2: Part Name (description)
          console.log('About to fill part name:', part.name);
          await fillTextField(textInputs[1], part.name, 'part name');
          
          // Field 3: Part Number
          if (part.partNumber) {
            console.log('About to fill part number:', part.partNumber);
            await fillTextField(textInputs[2], part.partNumber, 'part number');
          }
          
          // Field 4: Additional Details - skip (textInputs[3])
        } else {
          console.error('❌ Expected at least 4 text inputs, found:', textInputs.length);
        }
      } catch (error) {
        console.error('❌ Error filling text fields:', error);
      }
      
      // Fill number fields in order: Quantity (0), Cost (1)
      console.log('Starting number field fills...');
      try {
        if (numberInputs.length >= 2) {
          // Field 5: Quantity
          console.log('About to fill quantity:', part.quantity);
          await fillNumberField(numberInputs[0], part.quantity, 'quantity');
          
          // Field 6: Cost
          if (part.cost) {
            console.log('About to fill cost:', part.cost);
            await fillNumberField(numberInputs[1], part.cost, 'cost');
          }
        } else {
          console.error('❌ Expected at least 2 number inputs, found:', numberInputs.length);
        }
      } catch (error) {
        console.error('❌ Error filling number fields:', error);
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
      
      // Don't click save yet - wait until all parts are filled!
      console.log(`✓ Part ${partIndex + 1}/${jobData.parts.length} filled successfully`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Find and click the final SAVE button (multiple attempts with better detection)
    console.log('\n💾 Looking for final SAVE button in modal...');
    let finalSaveButton = null;
    let saveAttempts = 0;
    const maxSaveAttempts = 5;
    
    while (!finalSaveButton && saveAttempts < maxSaveAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // CRITICAL: Search only within modal to avoid clicking BUILD button at bottom of page
      const buttons = Array.from(modal.querySelectorAll('button'));
      finalSaveButton = buttons.find(btn => {
        const text = btn.textContent?.trim().toUpperCase() || '';
        const isVisible = btn.offsetParent !== null; // Check if visible
        return isVisible && (
          text === 'SAVE' || 
          text.includes('SAVE') ||
          (btn.getAttribute('type') === 'submit' && text.length < 15)
        );
      });
      
      saveAttempts++;
      if (!finalSaveButton && saveAttempts % 2 === 0) {
        console.log(`⏳ Still looking for SAVE button in modal... (attempt ${saveAttempts})`);
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

// No need for SVG - we'll use ❤️ emoji!

// Inject HEART icon next to 3-dot menu for a concern line item
function injectHeartIconForConcern(concernRow, concernText) {
  // Check if already injected for this element
  if (injectedIcons.has(concernRow)) {
    return;
  }
  
  // Create the icon button with ♥ in HEART Red
  const iconButton = document.createElement('button');
  iconButton.className = 'heart-helper-icon';
  iconButton.innerHTML = '♥'; // Use HTML heart entity that can be colored with CSS
  iconButton.style.cssText = `
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    margin-left: 4px;
    margin-right: 4px;
    padding: 0;
    vertical-align: middle;
    opacity: 0.8;
    color: #ED1C24;
    font-weight: bold;
  `;
  
  // Hover effects
  iconButton.addEventListener('mouseenter', () => {
    iconButton.style.transform = 'scale(1.2)';
    iconButton.style.opacity = '1';
  });
  
  iconButton.addEventListener('mouseleave', () => {
    iconButton.style.transform = 'scale(1)';
    iconButton.style.opacity = '0.7';
  });
  
  // Click handler - open search with this specific concern
  iconButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!concernText || !concernText.trim()) {
      showErrorNotification('No concern text found.');
      return;
    }
    
    const vehicleData = extractVehicleData();
    
    const params = new URLSearchParams();
    if (vehicleData.make) params.set('make', vehicleData.make);
    if (vehicleData.model) params.set('model', vehicleData.model);
    if (vehicleData.year) params.set('year', vehicleData.year);
    if (vehicleData.engine) params.set('engine', vehicleData.engine);
    params.set('search', concernText.trim().substring(0, 200)); // Use THIS concern text
    if (vehicleData.repairOrderId) params.set('roId', vehicleData.repairOrderId);
    
    chrome.storage.local.get(['appUrl'], (result) => {
      if (!result.appUrl) {
        showErrorNotification('Extension not configured. Click the extension icon and set your app URL in Settings.');
        return;
      }
      
      const searchUrl = `${result.appUrl}/?${params.toString()}`;
      
      console.log("Opening HEART Helper with concern:", concernText.substring(0, 50));
      console.log("Search URL:", searchUrl);
      window.open(searchUrl, '_blank');
    });
  });
  
  // Find the 3-dot menu button in this row and insert HEART icon before it
  const threeDotsButton = concernRow.querySelector('button[aria-label*="menu" i], button[aria-label*="more" i], button[aria-label*="options" i]') ||
                          Array.from(concernRow.querySelectorAll('button')).find(btn => {
                            const svg = btn.querySelector('svg');
                            return svg && btn.children.length === 1; // Likely icon-only button
                          });
  
  if (threeDotsButton) {
    threeDotsButton.parentElement.insertBefore(iconButton, threeDotsButton);
    console.log("✓ HEART icon injected next to 3-dot menu");
  } else {
    // Fallback: append to end of row
    concernRow.appendChild(iconButton);
    console.log("✓ HEART icon injected at end of concern row");
  }
  
  injectedIcons.add(concernRow);
}

// Create floating HEART Helper button for general searches (always visible on RO pages)
let floatingButtonInjected = false;

function injectFloatingHeartButton() {
  if (floatingButtonInjected) return;
  if (!window.location.href.includes('/repair-orders/')) return;
  
  // Check if already exists
  if (document.getElementById('heart-helper-floating-btn')) {
    floatingButtonInjected = true;
    return;
  }
  
  const floatingBtn = document.createElement('button');
  floatingBtn.id = 'heart-helper-floating-btn';
  floatingBtn.innerHTML = '♥ HEART Helper';
  
  // Get saved position or use defaults
  const savedPos = localStorage.getItem('heartHelperBtnPos');
  let startX = window.innerWidth - 160;
  let startY = window.innerHeight - 60;
  
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      startX = Math.min(pos.x, window.innerWidth - 140);
      startY = Math.min(pos.y, window.innerHeight - 50);
    } catch (e) {}
  }
  
  floatingBtn.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    background: #ED1C24;
    color: white;
    border: none;
    border-radius: 25px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: bold;
    cursor: grab;
    box-shadow: 0 4px 12px rgba(237, 28, 36, 0.4);
    z-index: 999999;
    transition: box-shadow 0.2s ease;
    font-family: Arial, sans-serif;
    user-select: none;
  `;
  
  // Dragging functionality
  let isDragging = false;
  let dragStartX, dragStartY, btnStartX, btnStartY;
  let hasMoved = false;
  
  floatingBtn.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    btnStartX = floatingBtn.offsetLeft;
    btnStartY = floatingBtn.offsetTop;
    floatingBtn.style.cursor = 'grabbing';
    floatingBtn.style.transition = 'none';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      hasMoved = true;
    }
    
    let newX = btnStartX + deltaX;
    let newY = btnStartY + deltaY;
    
    // Keep within viewport
    newX = Math.max(0, Math.min(newX, window.innerWidth - floatingBtn.offsetWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - floatingBtn.offsetHeight));
    
    floatingBtn.style.left = newX + 'px';
    floatingBtn.style.top = newY + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      floatingBtn.style.cursor = 'grab';
      floatingBtn.style.transition = 'box-shadow 0.2s ease';
      
      // Save position
      localStorage.setItem('heartHelperBtnPos', JSON.stringify({
        x: floatingBtn.offsetLeft,
        y: floatingBtn.offsetTop
      }));
    }
  });
  
  floatingBtn.addEventListener('mouseenter', () => {
    if (!isDragging) {
      floatingBtn.style.boxShadow = '0 6px 16px rgba(237, 28, 36, 0.5)';
    }
  });
  
  floatingBtn.addEventListener('mouseleave', () => {
    floatingBtn.style.boxShadow = '0 4px 12px rgba(237, 28, 36, 0.4)';
  });
  
  floatingBtn.addEventListener('click', (e) => {
    // Only trigger click if we didn't drag
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // Open side panel for concern intake and phone script
    console.log("Opening HEART Helper side panel...");
    chrome.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to open side panel:", chrome.runtime.lastError);
        showErrorNotification('Could not open side panel. Try clicking the extension icon.');
      } else if (response?.success) {
        console.log("Side panel opened successfully");
      } else {
        console.error("Side panel failed to open:", response?.error);
        showErrorNotification('Side panel failed to open. Try reloading the page.');
      }
    });
  });
  
  document.body.appendChild(floatingBtn);
  floatingButtonInjected = true;
  console.log("✅ Floating HEART Helper button injected (draggable)");
}

// Create a heart button with click handler
function createHeartButton(searchText) {
  const heartBtn = document.createElement('span');
  heartBtn.className = 'heart-helper-inline';
  heartBtn.innerHTML = '♥';
  heartBtn.title = 'Search HEART Helper for: ' + searchText.substring(0, 50);
  heartBtn.style.cssText = `
    color: #ED1C24;
    font-size: 18px;
    cursor: pointer;
    margin-right: 8px;
    opacity: 0.85;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `;
  
  heartBtn.addEventListener('mouseenter', () => {
    heartBtn.style.transform = 'scale(1.2)';
    heartBtn.style.opacity = '1';
  });
  
  heartBtn.addEventListener('mouseleave', () => {
    heartBtn.style.transform = 'scale(1)';
    heartBtn.style.opacity = '0.85';
  });
  
  heartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const vehicleData = extractVehicleData();
    const params = new URLSearchParams();
    if (vehicleData.make) params.set('make', vehicleData.make);
    if (vehicleData.model) params.set('model', vehicleData.model);
    if (vehicleData.year) params.set('year', vehicleData.year);
    if (vehicleData.engine) params.set('engine', vehicleData.engine);
    params.set('search', searchText.substring(0, 200));
    if (vehicleData.repairOrderId) params.set('roId', vehicleData.repairOrderId);
    
    chrome.storage.local.get(['appUrl'], (result) => {
      if (!result.appUrl) {
        showErrorNotification('Extension not configured.');
        return;
      }
      const searchUrl = `${result.appUrl}/?${params.toString()}`;
      console.log("Opening HEART Helper:", searchText.substring(0, 50));
      window.open(searchUrl, '_blank');
    });
  });
  
  return heartBtn;
}

// Find and inject icons for concern items - SIMPLE APPROACH
// Just find 3-dot menu buttons and put hearts to their left
function injectHeartIcons() {
  if (!window.location.href.includes('/repair-orders/')) {
    console.log("❌ Not on repair orders page, skipping HEART icons");
    return;
  }
  
  // Always inject floating button - this is the primary way to search
  injectFloatingHeartButton();
  
  // Floating button is the primary interface - no inline hearts needed
  console.log("✅ HEART Helper floating button ready");
}

function observePageChanges() {
  const checkAndInject = () => {
    if (window.location.href.includes('/repair-orders/')) {
      // Try immediately
      injectHeartIcons();
      // Re-check after delays (fields load asynchronously in Tekmetric)
      setTimeout(injectHeartIcons, 1000);
      setTimeout(injectHeartIcons, 2000);
      setTimeout(injectHeartIcons, 3000);
      setTimeout(injectHeartIcons, 5000);
    } else {
      // Clear tracked icons when leaving repair order page
      injectedIcons.clear();
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
      console.log(`🔄 URL changed: ${lastUrl} → ${window.location.href}`);
      // IMPORTANT: Clear tracked icons when navigating between ANY pages (including different ROs)
      injectedIcons.clear();
      floatingButtonInjected = false; // Reset floating button flag for new page
      // Remove old floating button if exists
      const oldBtn = document.getElementById('heart-helper-floating-btn');
      if (oldBtn) oldBtn.remove();
      lastUrl = window.location.href;
      checkAndInject();
    }
  }, 500); // Check more frequently for faster detection
  
  // Also observe for dynamically added textareas - check every 3 seconds
  setInterval(() => {
    if (window.location.href.includes('/repair-orders/')) {
      injectHeartIcons();
    }
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observePageChanges);
} else {
  observePageChanges();
}

// ==========================================
// Side Panel Message Handlers
// ==========================================

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get current vehicle info for side panel
  if (message.type === 'GET_VEHICLE_INFO') {
    const vehicleInfo = extractVehicleInfo();
    sendResponse({ vehicleInfo });
    return true;
  }
  
  // Add cleaned concern text to the repair order
  if (message.type === 'ADD_CONCERN_TO_RO') {
    const concernText = message.concernText;
    
    // Find concern/complaint textarea on the page
    const concernField = findConcernField();
    
    if (concernField) {
      // Append to existing content if any
      const existingValue = concernField.value || concernField.textContent || '';
      const newValue = existingValue 
        ? `${existingValue}\n\n${concernText}` 
        : concernText;
      
      if (concernField.tagName === 'TEXTAREA' || concernField.tagName === 'INPUT') {
        concernField.value = newValue;
        concernField.dispatchEvent(new Event('input', { bubbles: true }));
        concernField.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        concernField.textContent = newValue;
        concernField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      console.log("✓ Added concern text to RO:", concernText.substring(0, 50) + '...');
      sendResponse({ success: true });
    } else {
      console.log("❌ Could not find concern field on page");
      sendResponse({ success: false, error: 'Concern field not found' });
    }
    return true;
  }
});

// Extract vehicle info from Tekmetric page
function extractVehicleInfo() {
  let vehicleInfo = { year: null, make: null, model: null, engine: null };
  
  try {
    // Look for vehicle info in various common locations
    // Strategy 1: Look for vehicle header text
    const headerElements = document.querySelectorAll('h1, h2, h3, h4, .vehicle-info, [class*="vehicle"], [class*="Vehicle"]');
    for (const el of headerElements) {
      const text = el.textContent?.trim() || '';
      // Look for pattern like "2018 Toyota Sienna"
      const match = text.match(/(\d{4})\s+([A-Za-z]+)\s+([A-Za-z0-9\s-]+)/);
      if (match) {
        vehicleInfo = {
          year: parseInt(match[1]),
          make: match[2],
          model: match[3].trim(),
          engine: null
        };
        break;
      }
    }
    
    // Strategy 2: Look for data attributes
    if (!vehicleInfo.year) {
      const vehicleEl = document.querySelector('[data-vehicle-year], [data-year]');
      if (vehicleEl) {
        vehicleInfo.year = parseInt(vehicleEl.getAttribute('data-vehicle-year') || vehicleEl.getAttribute('data-year'));
      }
      const makeEl = document.querySelector('[data-vehicle-make], [data-make]');
      if (makeEl) {
        vehicleInfo.make = makeEl.getAttribute('data-vehicle-make') || makeEl.getAttribute('data-make');
      }
      const modelEl = document.querySelector('[data-vehicle-model], [data-model]');
      if (modelEl) {
        vehicleInfo.model = modelEl.getAttribute('data-vehicle-model') || modelEl.getAttribute('data-model');
      }
    }
    
    // Strategy 3: Look for labeled fields
    if (!vehicleInfo.year) {
      const labels = document.querySelectorAll('label, span, div');
      for (const label of labels) {
        const text = label.textContent?.toLowerCase() || '';
        const nextEl = label.nextElementSibling;
        if (text.includes('year') && nextEl) {
          const yearText = nextEl.textContent?.match(/\d{4}/)?.[0];
          if (yearText) vehicleInfo.year = parseInt(yearText);
        }
        if (text.includes('make') && nextEl) {
          vehicleInfo.make = nextEl.textContent?.trim();
        }
        if (text.includes('model') && nextEl) {
          vehicleInfo.model = nextEl.textContent?.trim();
        }
      }
    }
  } catch (error) {
    console.error('Error extracting vehicle info:', error);
  }
  
  return vehicleInfo;
}

// Find concern/complaint text field on the page
function findConcernField() {
  // Look for textareas with concern-related placeholders or labels
  const textareas = document.querySelectorAll('textarea');
  for (const textarea of textareas) {
    const placeholder = textarea.placeholder?.toLowerCase() || '';
    const label = textarea.getAttribute('aria-label')?.toLowerCase() || '';
    const id = textarea.id?.toLowerCase() || '';
    const name = textarea.name?.toLowerCase() || '';
    
    if (placeholder.includes('concern') || placeholder.includes('complaint') ||
        placeholder.includes('customer') || placeholder.includes('issue') ||
        label.includes('concern') || label.includes('complaint') ||
        id.includes('concern') || id.includes('complaint') ||
        name.includes('concern') || name.includes('complaint')) {
      return textarea;
    }
  }
  
  // Fallback: look for any visible textarea that might be a notes field
  for (const textarea of textareas) {
    const style = window.getComputedStyle(textarea);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      // Check parent for concern-related classes
      const parent = textarea.closest('[class*="concern"], [class*="complaint"], [class*="note"]');
      if (parent) {
        return textarea;
      }
    }
  }
  
  return null;
}
