# Tekmetric Job Importer - Changelog

All notable changes to this extension will be documented in this file.

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
