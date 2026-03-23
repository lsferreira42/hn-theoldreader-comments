// HN Comments Counter — Background Service Worker / Script
// Prefetches HN data for links found in The Old Reader tabs

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0/item/';
const PREFETCH_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Clean expired cache entries periodically
function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of PREFETCH_CACHE) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      PREFETCH_CACHE.delete(key);
    }
  }
}

// Fetch and cache a single HN item
async function prefetchItem(itemId) {
  const existing = PREFETCH_CACHE.get(itemId);
  if (existing && (Date.now() - existing.timestamp < CACHE_TTL_MS)) {
    return existing.data;
  }

  try {
    const response = await fetch(`${HN_API_BASE}${itemId}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data) {
      PREFETCH_CACHE.set(itemId, { data, timestamp: Date.now() });
    }
    return data;
  } catch {
    return null;
  }
}

// Prefetch comments for a story
async function prefetchComments(storyData) {
  if (!storyData.kids || storyData.kids.length === 0) return;

  const commentIds = storyData.kids.slice(0, 10);
  const BATCH_SIZE = 5;

  for (let i = 0; i < commentIds.length; i += BATCH_SIZE) {
    const batch = commentIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(id => prefetchItem(id)));

    if (i + BATCH_SIZE < commentIds.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

// Handle messages from content script
const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'prefetchRequest') {
    // Content script is asking us to prefetch a list of item IDs
    const { itemIds } = message;
    if (!itemIds || itemIds.length === 0) return;

    (async () => {
      const results = {};

      for (const itemId of itemIds) {
        const data = await prefetchItem(itemId);
        if (data) {
          results[itemId] = data;
          // Also prefetch comments for stories with discussions
          if (data.descendants && data.descendants > 0) {
            await prefetchComments(data);
          }
        }
      }

      // Send prefetched data back to content script
      try {
        if (sender.tab && sender.tab.id) {
          api.tabs.sendMessage(sender.tab.id, {
            type: 'prefetchedData',
            data: results,
            commentCache: Object.fromEntries(PREFETCH_CACHE)
          });
        }
      } catch {
        // Tab may have been closed
      }
    })();

    // Return true to indicate async response
    return true;
  }

  if (message.type === 'getCachedData') {
    // Content script is requesting cached data for specific IDs
    const { itemIds } = message;
    const results = {};
    const now = Date.now();

    for (const id of (itemIds || [])) {
      const entry = PREFETCH_CACHE.get(id);
      if (entry && (now - entry.timestamp < CACHE_TTL_MS)) {
        results[id] = entry.data;
      }
    }

    sendResponse({ data: results });
    return false;
  }

  // Forward settingsChanged to content scripts (from options page)
  if (message.type === 'settingsChanged') {
    api.tabs.query({ url: "*://theoldreader.com/*" }, (tabs) => {
      if (tabs) {
        tabs.forEach(tab => {
          api.tabs.sendMessage(tab.id, message).catch(() => {});
        });
      }
    });
  }
});

// Periodic cache cleanup (every 5 minutes)
setInterval(cleanCache, 5 * 60 * 1000);
