# Chrome Extension v2.2.0 - Testing Guide

## What's New: Carvis-Style Instant Auto-Fill

This version completely redesigns the auto-fill architecture to achieve **instant background filling** like Carvis.

### User Experience

**Before (v1.x):**
- Click "Send to Extension" → Switch to Tekmetric → Wait 15-20 seconds → Watch fields fill slowly
- Visible progress messages for every step
- Noticeable delays between each field

**Now (v2.2.0):**
- Click "Send to Extension" → Switch to Tekmetric → **Job already filled!**
- Total time: 2-4 seconds (appears instant)
- No visible delays or progress messages
- Silent background operation

## How to Install & Test

### Step 1: Update Extension
1. Go to `chrome://extensions/`
2. Find "HEART Helper - Tekmetric Integration"  
3. Click the **reload icon** (↻)
4. Verify version shows **2.2.0**

### Step 2: Test the Workflow

1. **On Tekmetric RO page:** Click "Check History" button
2. **In search tool:** Find a matching job and click on it
3. **In job detail:** Click "Send to Extension"
4. **Switch back to Tekmetric tab**
5. **Verify:** Job should already be filled in!

### Step 3: What to Check

**Labor Items Should Show:**
- Description (job name)
- Hours
- Rate/hour

**Parts Should Show:**
- Part name
- Part number
- Brand
- Quantity
- Cost (wholesale)
- Retail price

## Troubleshooting

### If Auto-Fill Doesn't Work

**Enable Debug Mode:**
1. Open DevTools on Tekmetric page (F12)
2. Go to Console tab
3. Run: `localStorage.setItem('heartHelperDebug', 'true')`
4. Refresh the page
5. Try again and check console logs

**Common Issues:**
- **Wrong modal opens:** Debug logs will show "Modal does not contain job form markers"
- **Fields not found:** Debug logs will show which selectors failed
- **Tab throttling:** Make sure you actually switch to the Tekmetric tab (background script detects activation)

### Debug Logs Format

When debug mode is enabled, you'll see:
```
[HEART Helper] Starting instant auto-fill for: Front Strut Replacement
[HEART Helper] Auto-fill complete - clearing pending job
```

On errors:
```
[HEART Helper ERROR] Auto-fill failed: Modal failed to appear within timeout
[HEART Helper ERROR] Job data will remain pending for retry
```

## Performance Benchmarks

**Expected Timings:**
- Tab switch detection: <100ms
- Script injection: <200ms
- Modal verification: <500ms
- Labor items (2-3): ~1 second
- Parts (3-5): ~2 seconds
- **Total: 2-4 seconds** (appears instant to user)

## Known Limitations

1. **Tekmetric UI changes:** If Tekmetric updates their form fields, selectors may need adjustment
2. **Modal detection:** Relies on finding "Add Labor" or "Add Parts" buttons to verify correct dialog
3. **Field matching:** Uses placeholder text and aria-labels - may vary by Tekmetric version

## Feedback Needed

Please test and report:
- ✅ Does it feel instant like Carvis?
- ✅ Are all fields filled correctly?
- ✅ Does it work across multiple jobs?
- ⚠️ Any errors in debug mode?
- ⚠️ Any missing or incorrect data?

---

**Version:** 2.2.0  
**Date:** November 25, 2025  
**Architecture:** Background tab monitoring + script injection + batched DOM ops
