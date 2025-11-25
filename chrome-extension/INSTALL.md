# Quick Installation Guide

**Current Version: 2.2.0** - Instant Auto-Fill (Carvis-style) - See [CHANGELOG.md](CHANGELOG.md) for version history

## Install the Chrome Extension

1. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)

2. **Load the Extension**
   - Click **Load unpacked**
   - Select the `chrome-extension` folder from this project

3. **Verify Installation**
   - You should see "Tekmetric Job Importer" in your extensions list
   - Pin the extension to your toolbar for easy access

## How to Use

### Step 1: Search for a Job
1. Open your repair search tool
2. Search for a vehicle and repair type (e.g., "2005 Honda CR-V" + "front struts")
3. Click on a search result to view details

### Step 2: Send to Tekmetric
1. In the job detail panel, click **"Send to Tekmetric"**
2. You'll see a confirmation: "Sent to Tekmetric Extension"

### Step 3: Auto-Fill in Tekmetric (Instant Background Fill)
1. Navigate to Tekmetric (https://shop.tekmetric.com)
2. Open or create an estimate/repair order
3. **Switch tabs** - by the time you return, the job is already filled in!
4. The extension uses instant background fill:
   - Detects when you switch to the Tekmetric tab
   - Fills in labor items (description, hours, rate)
   - Fills in parts (name, quantity, cost)
   - **No visible delays** - appears instantly filled

**Note:** This is similar to how Carvis works - instant auto-fill by the time you switch tabs.

## Check Extension Status

Click the extension icon in Chrome to see:
- Current pending job (ready to import)
- Last imported job details
- Import timestamp

## Advanced: Debug Mode

To see detailed logging of the auto-fill process:

1. Open DevTools on the Tekmetric page (F12)
2. Go to Console tab
3. Run: `localStorage.setItem('heartHelperDebug', 'true')`
4. Refresh the page
5. You'll now see detailed logs prefixed with `[HEART Helper]`

To disable debug mode:
```javascript
localStorage.removeItem('heartHelperDebug')
```

## Troubleshooting

### Extension Not Auto-Filling?
1. Make sure you're on a Tekmetric estimate/repair order page
2. Try refreshing the Tekmetric page
3. Check the extension popup to verify data was received
4. Enable debug mode (see above) and check the Console for detailed logs

### Data Not Sending?
1. Verify the extension is installed and enabled
2. Reload the repair search tool page
3. Try searching for a job again

## Updating the Extension

When a new version is released:

1. **Check Current Version**
   - Click the extension icon
   - Look at the top-right corner of the popup (e.g., "v1.1.0")

2. **Update to Latest Version**
   - Go to `chrome://extensions/`
   - Find "Tekmetric Job Importer"
   - Click the **reload icon** (↻) to reload the extension
   - The version number in the popup will update

3. **Download New Version** (if needed)
   - Pull latest changes from git repository
   - Follow installation steps above
   - No need to uninstall - just reload!

## Version History

See [CHANGELOG.md](CHANGELOG.md) for full version history and release notes.

## Notes

- The extension stores the last imported job in Chrome storage for reference
- Icon files can be customized (see create-icons.md)
- All data is processed locally - nothing is sent to external servers
- Version number is displayed in the extension popup (top-right corner)

For detailed documentation, see README.md
