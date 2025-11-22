# Tekmetric Job Importer - Changelog

All notable changes to this extension will be documented in this file.

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
