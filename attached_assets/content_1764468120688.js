/**
 * Section 1: Load and Inject addAIconcern.js
 */
console.log("Content Script: Loading addAIconcern.js");

const script = document.createElement('script');
script.src = chrome.runtime.getURL('addAIconcern.js');
(document.head || document.documentElement).appendChild(script);

console.log("Content Script: Listening for messages...");

/**
 * Section 2: Handle Messages from Background Script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content Script: Message received:", message);

    if (message.action === 'insertConversation') {
        let targetTextarea = null;

        // Determine which page we're on by matching the URL
        const repairOrderUrlPattern = /https:\/\/shop\.tekmetric\.com\/admin\/shop\/.*\/repair-orders\/.*\/.*/;
        const appointmentUrlPattern = /https:\/\/shop\.tekmetric\.com\/admin\/shop\/.*\/appointments\/create/;

        if (repairOrderUrlPattern.test(window.location.href)) {
            // Repair order page - target the #concern text area
            targetTextarea = document.querySelector('textarea#concern');
        } else if (appointmentUrlPattern.test(window.location.href)) {
            // Appointment creation page - target the #description text area
            targetTextarea = document.querySelector('textarea#description');
        }

        // Insert the conversation if the target text area is found
        if (targetTextarea) {
            console.log(`Content Script: Found target text area, inserting cleaned conversation...`);
            setNativeValue(targetTextarea, message.cleanedConversation); 
            console.log('Content Script: Cleaned conversation inserted:', message.cleanedConversation);

            // Send success response back to background script
            sendResponse({status: 'success'});
            console.log("Content Script: Sent success response to background script.");
        } else {
            console.error('Content Script: Target textarea not found on this page.');
            sendResponse({status: 'failed'});
        }
    }
});

/**
 * Section 3: Function to Insert Text into Textarea
 */
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  }

  // Dispatch events to ensure the framework sees the change
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('Content Script: Dispatched input and change events for the textarea.');
}
