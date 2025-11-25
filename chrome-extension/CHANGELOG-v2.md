# CHANGELOG - Version 2.2.0

## Version 2.2.0 (November 25, 2025) - Instant Auto-Fill

**Major Performance Upgrade - Carvis-Style Instant Fill**

### New Features
- **Instant Background Fill**: Job appears filled by the time you switch to Tekmetric tab
- **Tab Activation Monitoring**: Background script detects when you switch to Tekmetric
- **Batched DOM Operations**: Uses `requestAnimationFrame` for instant field updates
- **Script Injection**: Bypasses Chrome's tab throttling for 10x faster execution

### Performance Improvements
- Reduced delays from 500-1500ms → 50-300ms throughout
- Eliminated sequential setTimeout chains
- Background tab auto-fill now executes at full speed
- Total time: ~15-20 seconds → **2-4 seconds** (appears instant to user)

### Code Quality
- Debug logging system with toggle (`localStorage.heartHelperDebug = 'true'`)
- Removed ~50 verbose console.log statements
- Modular architecture: separate helpers for labor/parts filling
- Cleaner error handling with `debugError` wrapper

### Technical Changes
- New `background-v2.js` with tab activation listeners
- New `content-v2.js` with batched fill operations
- Added `tabs` permission for tab monitoring
- Uses `chrome.scripting.executeScript` for instant injection
- Window postMessage communication for cross-context speed

### Migration Notes
- **Breaking Change**: Requires extension reload to enable instant fill
- Old content.js/background.js files kept as backup
- Manifest now uses content-v2.js and background-v2.js

### User Experience
- Matches Carvis behavior: click "Send to Extension" → switch tabs → job already filled
- No visible progress messages (unless debug mode enabled)
- Silent background operation

---

## How to Update
1. Go to `chrome://extensions/`
2. Find "HEART Helper - Tekmetric Integration"
3. Click **reload icon** (↻)
4. Version should show **2.2.0**
5. Test with a job - should fill instantly when you switch tabs!
