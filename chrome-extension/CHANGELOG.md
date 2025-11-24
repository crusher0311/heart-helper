# Tekmetric Job Importer - Changelog

All notable changes to this extension will be documented in this file.

## [1.5.2] - 2024-11-24

### 🐛 CRITICAL FIX: Infinite Loop Prevention
- **Fixed**: Extension kept trying to fill job repeatedly, never stopping
- **Root cause**: Job data was cleared on success but NOT on error
- **Solution**: Now clears job data from storage in BOTH success and error paths
- Added callback logging to confirm job data clearing

### Impact
Previous version would get stuck in infinite loop if automation hit any error.
Job data stayed in chrome.storage.local and extension kept retrying every 2 seconds.
Page refresh didn't help because storage persists across refreshes.

## [1.5.1] - 2024-11-22

### 🐛 CRITICAL FIX: Job Name Field Detection
- **Fixed**: Was filling global search box instead of job title input
- **Root cause**: Code was finding first visible text input (the search bar)
- **Solution**: Now specifically looks for input with placeholder containing "title" or "job"
- **Solution**: Excludes inputs with "search" in placeholder
- Shows first 10 inputs instead of 5 for better debugging

### Impact
Previous version filled the search box at top of page, causing "Name is required" error.
Labor items were being added to nameless jobs.

## [1.5.0] - 2024-11-22

### 🎉 MAJOR MILESTONE: Labor Items Working!
The automation now successfully:
- ✅ Retrieves job data from background storage
- ✅ Fills job name in dialog
- ✅ Clicks Save to create job
- ✅ Finds and clicks ADD LABOR button
- ✅ Fills labor description
- ✅ Fills labor hours
- ✅ Saves labor item

### Added
- **ADD PART button detection**: Same flexible matching as ADD LABOR
  - Searches for "ADD PART", "ADD_PART", or just "PART"
  - Case-insensitive search
  - Better error logging shows buttons containing "PART" or "ADD"

### Progress
This is the final piece! After this, the complete automation flow works end-to-end.

## [1.4.2] - 2024-11-22

### Fixed
- **Job name input detection**: Better logging and field detection
  - Now shows first 5 visible inputs to debug field selection
  - Added blur event after filling (helps trigger React/validation)
  - Clear field before setting value (fixes some form validation)
  - Shows confirmation of filled value
  - Better error messages showing all visible inputs

### Changed
- Added step number (3️⃣) to job name filling logs
- More detailed logging of input field properties

## [1.4.1] - 2024-11-22

### 🐛 CRITICAL FIX: Service Worker Persistence
- **Fixed**: Content script getting `{jobData: null}` despite background receiving data
- **Root cause**: Chrome unloads service workers after ~30 seconds, resetting in-memory variables
- **Solution**: GET_PENDING_JOB now reads from chrome.storage.local instead of memory
- **Solution**: CLEAR_PENDING_JOB now removes from chrome.storage.local
- Both actions now return `true` for async responses

### Impact
This was preventing the automation from ever starting on the Tekmetric page!
Background would receive and store job data, but content script would always get null.

## [1.4.0] - 2024-11-22

### 🎉 MILESTONE: Job Creation Working!
The automation successfully:
- ✅ Receives job data from search tool
- ✅ Clicks Job button
- ✅ Fills job name
- ✅ Clicks Save to create the job

### Fixed
- **ADD LABOR button search**: More flexible matching
  - Now searches for "ADD LABOR", "ADD_LABOR", or just "LABOR"
  - Case-insensitive search
  - Better error logging shows buttons containing "LABOR" or "ADD"
  - Shows first 50 button texts to help identify the right button

### Changed
- Enhanced button search logging
- Filters out long button texts (>50 chars) for cleaner logs
- Shows button count before searching

## [1.3.3] - 2024-11-22

### Fixed
- **Timeout hanging bug**: Added detailed logging around setTimeout
  - Logs when timeout is SET
  - Logs timeout ID
  - Logs when timeout COMPLETES  
  - Added try/catch around wait
  - Will show if setTimeout is being called but never completing

### Debug
Previous version showed automation starts, waits 2 seconds, then STOPS.
Never reached "2️⃣ Wait complete" log.
This version will show if setTimeout fires at all.

## [1.3.2] - 2024-11-22

### Added
- **Ultra-verbose debugging**: Step-by-step logging with emoji markers
  - Shows current URL when checking Tekmetric page
  - Logs each stage: URL check → wait → button search → input search
  - Numbered steps (1️⃣ 2️⃣ 3️⃣) to track execution flow
  - Will identify exactly where automation stops

### Purpose
Data IS flowing to Tekmetric tab, automation STARTS, but then stops silently.
These logs will show exactly which line is failing.

Expected console output:
```
🚀 Starting to fill Tekmetric estimate with job data...
1️⃣ Checking if on Tekmetric page...
Current URL: https://shop.tekmetric.com/admin/shop/469/repair-orders/...
✅ On Tekmetric page, waiting 2 seconds...
2️⃣ Wait complete, now looking for Job button...
```

## [1.3.1] - 2024-11-22

### Fixed
- **Background script message handling bug**: Fixed async/sync response mismatch
  - `SEND_TO_TEKMETRIC` now properly waits for storage.set() before responding
  - Removed `return true` from synchronous handlers to prevent channel closure errors
  - Added `STORE_PENDING_JOB` handler for content script storage requests
  - No more "message channel closed" errors

### Changed
- Background script now logs when job data is stored successfully
- Only returns `true` for truly async operations (storage.get/set with callbacks)

## [1.3.0] - 2024-11-22

### Fixed
- **CRITICAL BUG**: Added missing window message listener!
  - Extension was checking for pending jobs but never received them
  - Search tool sends via `window.postMessage()` but extension wasn't listening
  - Added `window.addEventListener('message')` to receive job data

### Added
- Origin validation for security (only accepts messages from same origin)
- Logs when receiving messages from search tool
- Confirmation when job data is stored in extension storage

### How It Works Now
1. User clicks "Send to Extension" in search tool
2. Search tool sends job data via `window.postMessage()`
3. **Extension NOW listens and receives the message** ← This was missing!
4. Extension stores job data via `chrome.runtime.sendMessage()`
5. User switches to Tekmetric tab
6. Extension auto-fills the job

Expected console output in search tool:
```
📬 Received window message: {action: "SEND_TO_TEKMETRIC", payload: {...}}
✅ Received job data from search tool!
📦 Job data stored in extension storage
```

## [1.2.2] - 2024-11-22

### Added
- **Critical Debugging**: Logs every step of pending job detection
- Shows when content script initializes
- Shows when checking for pending jobs (even if none found)
- Shows GET_PENDING_JOB message response
- Logs whether job data exists or not

### Purpose
Diagnose why automation isn't starting - logs will show:
1. If content script loads properly
2. If it's checking for pending jobs
3. What the background script returns
4. Why fillTekmetricEstimate isn't being called

Expected console output:
```
📋 Tekmetric Job Importer initialized
📄 Document already loaded - checking for pending jobs in 2s...
🔍 Checking for pending job data...
📬 GET_PENDING_JOB response: {jobData: {...}}
✅ Found pending job data, auto-filling...
```

## [1.2.1] - 2024-11-22

### Added
- **Enhanced Debugging**: Shows all available inputs after clicking Job button
- Detailed error stack traces and error details in console
- Logs what inputs are found (type, placeholder, disabled status, visibility)
- Better error messages showing exactly what elements are available

### Changed
- Increased timeout after Job button click to 1.5s (from 1.2s)
- Errors now re-thrown to ensure they appear in console
- More descriptive success message (✅ instead of ✓)

### Purpose
This debugging release helps identify why automation gets stuck after clicking Job button. Console will show exactly what inputs are found and why job name input isn't being detected.

## [1.2.0] - 2024-11-22

### Fixed
- **Critical**: Added missing Save/Create button click after filling job name
- **Critical**: Added Save button clicks after each labor item and part to ensure data persists
- Fixed "ADD LABOR button not found" error by properly saving the job first

### Added
- Comprehensive debugging output showing available buttons when elements can't be found
- Better console logging with ✓ success and ⚠️ warning indicators
- Shows all available buttons in console when Save/ADD LABOR/ADD PART buttons not found

### Changed
- Increased timeout after clicking job save button to 1.5s for reliability
- Added 1s delays after saving each labor item and part
- Better error messages showing exactly which buttons are available

### Notes
- This should fix the issue where changes weren't visible without refreshing Tekmetric
- The extension now properly saves at each step: Job → Labor Items → Parts

## [1.1.0] - 2024-11-22

### Fixed
- **Critical**: Fixed automation creating multiple empty jobs instead of filling data
- **Critical**: Fixed silent failures when form fields couldn't be found
- Added concurrency lock to prevent duplicate executions
- Increased timeouts for more reliable Tekmetric UI interaction (2s initial delay, 1.2s modal wait)
- Extension now stops immediately with clear error message if critical elements missing

### Added
- Detailed console logging with ✓ checkmarks for successful field fills
- Debug output showing available inputs when description field not found
- Better error messages showing exactly which element couldn't be found

### Changed
- Longer delays between automation steps for reliability
- Changed silent `continue` to hard stops with error messages
- Improved field detection with more detailed logging

## [1.0.0] - 2024-11-21

### Added
- Initial release
- "Check History" button injection on Tekmetric RO pages
- Vehicle data extraction (make, model, year, engine, VIN)
- Customer concern/complaint extraction for auto-fill search
- Auto-fill labor items and parts into Tekmetric via UI automation
- Click "Job" button → fill job name → add labor → add parts → save
- Popup UI showing pending job status
- Success/error notifications
- Secure message passing with origin validation

### Workflow
1. Extract vehicle data and concerns from Tekmetric RO
2. Open search tool with pre-filled data
3. User selects matching job
4. Extension automates Tekmetric UI to import job
