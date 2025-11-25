# HEART Helper - Extension Troubleshooting Guide

## Auto-Fill Not Working? Follow These Steps

### Step 1: Reload the Chrome Extension

**IMPORTANT:** After any code changes to the extension, you MUST reload it in Chrome:

1. Open Chrome and go to `chrome://extensions`
2. Find "HEART Helper - Tekmetric Integration"  
3. Click the **refresh/reload icon** (circular arrow)
4. Verify it says "Version 2.2.0"

### Step 2: Enable Debug Mode

Open the browser console on the HEART Helper search page:

1. Press `F12` or right-click → "Inspect"
2. Go to the "Console" tab
3. Type this command and press Enter:
   ```javascript
   localStorage.heartHelperDebug = 'true'
   ```
4. Refresh the page

### Step 3: Test the Message Flow

With debug mode enabled, follow this exact workflow:

#### On HEART Helper Page:
1. Search for a job (e.g., "2017 Toyota Corolla rear strut")
2. Click on a result to view details
3. Click **"Send to Extension"** button
4. **Watch the console** - you should see:
   ```
   [HEART Helper Web] Sending job data to extension: {jobName: "...", laborItems: 2, parts: 3}
   [HEART Helper Inject] Received message: {source: "same-window", origin: "...", action: "SEND_TO_TEKMETRIC"}
   ✅ [HEART Helper Inject] Valid SEND_TO_TEKMETRIC message received
   ✅ [HEART Helper Inject] Stored job data directly to chrome.storage.local
   ✅ [HEART Helper Inject] Background acknowledged: {success: true}
   ```

#### On Tekmetric Page:
5. Switch to your Tekmetric repair order tab
6. **Watch the console** - you should see:
   ```
   [HEART Helper] Tekmetric tab activated with pending job - injecting auto-fill
   [HEART Helper] Starting instant auto-fill for: REAR STRUT ASSEMBLIES
   [HEART Helper] Auto-fill complete - clearing pending job
   ```

### Step 4: Common Issues & Fixes

#### Issue: No inject.js logs appear
**Symptom:** You don't see `[HEART Helper Inject]` messages  
**Fix:** Reload the Chrome extension (Step 1)

#### Issue: "Blocked message from untrusted origin"
**Symptom:** Console shows origin mismatch error  
**Fix:** The inject.js is checking origins. Current allowed origins:
- `http://localhost:5000`
- `https://localhost:5000`
- Any `*.replit.dev` domain

If you're using a different URL, the extension needs to be updated.

#### Issue: Extension says "no pending job"
**Symptom:** Switching to Tekmetric doesn't trigger auto-fill  
**Fix:** Check chrome.storage manually:
```javascript
chrome.storage.local.get(['lastJobData'], (result) => {
  console.log('Stored job data:', result);
});
```

#### Issue: Modal doesn't appear or wrong modal opens
**Symptom:** Auto-fill script can't find the job modal  
**Fix:** Make sure you're on a Tekmetric **Estimate** page, not a different page type

### Step 5: Manual Test of Extension Storage

You can manually check if data is being stored:

1. Open the extension popup (click extension icon in Chrome toolbar)
2. Look for "Last Job" information
3. Or check the background service worker console:
   - Go to `chrome://extensions`
   - Click "service worker" under HEART Helper
   - Type: `chrome.storage.local.get(['lastJobData'], console.log)`

### Step 6: Test Auto-Fill Manually

If automatic fill isn't working, you can trigger it manually:

1. Store test data:
   ```javascript
   chrome.storage.local.set({
     lastJobData: {
       jobName: "TEST JOB",
       laborItems: [{name: "Test Labor", hours: 1, rate: 100}],
       parts: [{name: "Test Part", brand: "OEM", partNumber: "12345", quantity: 1, cost: 50, retail: 100}],
       totals: {labor: 100, parts: 100, total: 200}
     }
   });
   ```

2. Refresh the Tekmetric page - it should auto-fill

### Need More Help?

If none of these steps work, provide the following in a bug report:

1. **Console logs** from HEART Helper page (after clicking "Send to Extension")
2. **Console logs** from Tekmetric page (after switching tabs)
3. **Extension console logs** (from background service worker)
4. **Chrome extension version** (from chrome://extensions)
5. **URL of HEART Helper page** you're using
