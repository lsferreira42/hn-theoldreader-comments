# HN Comments Counter for The Old Reader

A browser extension (Chrome & Firefox) that automatically adds comment counts and displays top comments for Hacker News links in The Old Reader RSS feed.

![Screenshot](screenshot.png)

## Why This Extension?

I love reading Hacker News through [The Old Reader](https://theoldreader.com) RSS aggregator, but I always missed the comment counts and discussion context. This extension bridges that gap by:

- **📊 Adding comment badges** next to HN links with live counts from the official API
- **💬 Showing top comments** directly in the feed (configurable 0-10 comments)
- **🔄 Working automatically** as you scroll and load new posts
- **⚡ Being lightweight** with smart caching and minimal API calls

## Features

✅ **Live comment counts**: Orange badges showing total comments  
✅ **Top comments display**: See the best-scored comments without leaving your reader  
✅ **Configurable**: Choose how many comments to show (0 disables, just shows counts)  
✅ **Smart sorting**: Comments ranked by score, activity, and recency  
✅ **Clean formatting**: HTML stripped and text truncated for readability  
✅ **Dynamic detection**: Works with infinite scroll and new posts  
✅ **No duplicates**: Prevents reprocessing the same links  
✅ **Cross-browser**: Works on Chrome and Firefox  
✅ **API caching**: In-memory cache avoids redundant API calls  

## How It Works

The extension:
1. Scans The Old Reader for HN item links (`news.ycombinator.com/item?id=...`)
2. Fetches comment count from the official HN Firebase API
3. Adds orange badges with the count next to each link
4. If enabled, fetches and displays top-level comments sorted by score
5. Monitors for new posts loaded during scrolling

## Installation

### Option 1: Chrome Extension
1. Run `make chrome` (or download a release)
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked extension"
5. Select the `dist/chrome/` folder (or unzip the zip file)

### Option 2: Firefox Add-on
1. Run `make firefox` (or download a release)
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select the `manifest.json` inside `dist/firefox/` (or the zip file)

### Option 3: Bookmarklet
If you prefer not to install the extension, you can use the bookmarklet version:

1. **Copy the bookmarklet code** from `bookmarklet.js` in this repository
2. **Create a new bookmark** in your browser
3. **Set the bookmark name** to something like "HN Counter"
4. **Paste the entire code** from `bookmarklet.js` as the bookmark URL
5. **Visit The Old Reader** and click the bookmark to activate

## Building

Requires `make` and `zip`.

```bash
make all       # Build both Chrome and Firefox extensions
make chrome    # Build Chrome extension only
make firefox   # Build Firefox extension only
make clean     # Remove build artifacts
```

Output:
- `dist/hn-comments-chrome.zip` — Chrome extension package
- `dist/hn-comments-firefox.zip` — Firefox extension package
- `dist/chrome/` / `dist/firefox/` — Unpacked extension directories

## Configuration

Access the extension settings through the browser's extension menu:

- **Comment display**: Choose 0-10 comments to show
- **0 = disabled**: Only shows comment counts, no comment text
- **Default**: 3 comments
- Changes apply immediately to open tabs

## Technical Details

**Built with:**
- Manifest V3 (Chrome) / Manifest V2 (Firefox)
- Lightweight browser API polyfill for cross-browser compatibility
- Official Hacker News Firebase API
- MutationObserver for dynamic content detection
- Promise-based async/await for clean API handling

**Performance optimizations:**
- In-memory API response cache (10 min TTL)
- Two-phase processing — badges appear first, comments load after
- Parallel story data fetching (batches of 5)
- Parallel comment fetching (batches of 5)
- Debounced scroll detection
- Link deduplication tracking
- Debug logging behind a flag (off by default)
- Truncated comment text (300 chars max)
- Only fetches first 10 comments per story for analysis

## Code Structure

```
manifest.json           # Chrome MV3 manifest
manifest.firefox.json   # Firefox MV2 manifest
browser-polyfill.js     # Cross-browser API shim
content.js              # Main script (runs on theoldreader.com)
options.html            # Settings page
options.js              # Settings logic
bookmarklet.js          # Standalone bookmarklet version
icons/                  # Extension icons (16x16, 48x48, 128x128)
Makefile                # Build system for Chrome/Firefox packages
```

## API Usage

The extension uses the public Hacker News API:
- Story data: `https://hacker-news.firebaseio.com/v0/item/{id}.json`
- No authentication required
- Rate limited to be respectful to the service

## Privacy

The extension:
- Only runs on theoldreader.com
- Makes requests only to the official HN API
- Stores only your comment count preference locally
- No data collection, tracking, or external services

## License

MIT License - Feel free to use, modify, and distribute.

---

*Built by someone who loves both RSS feeds and Hacker News discussions. Hope it helps other Old Reader users stay connected to the HN community!*