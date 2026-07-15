// HN Comments Counter for The Old Reader
// Debug flag — set to true for verbose logging
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }

// Global settings
let extensionSettings = {
  maxComments: 3 // default value
};

// In-memory cache for HN API responses (TTL: 10 minutes)
const apiCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
  if (apiCache.size > 200) {
    const oldest = apiCache.keys().next().value;
    apiCache.delete(oldest);
  }
}

// Load saved settings
async function loadExtensionSettings() {
  try {
    const result = await browserAPI.storage.sync.get({ maxComments: 3 });
    extensionSettings = result;
    log('Extension settings loaded:', extensionSettings);
  } catch (error) {
    console.error('Error loading settings:', error);
    extensionSettings = { maxComments: 3 };
  }
}

// Listen for messages (settings changes + prefetched data from background)
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'settingsChanged') {
    const previousMaxComments = extensionSettings.maxComments;
    extensionSettings = message.settings;
    log('Settings updated:', extensionSettings);

    if (extensionSettings.maxComments === 0 && previousMaxComments > 0) {
      document.querySelectorAll('.hn-comments-container').forEach(c => c.remove());
    } else if (extensionSettings.maxComments > 0) {
      processCommentLinks();
    }
  }

  if (message.type === 'prefetchedData') {
    // Background script sent us prefetched data — merge into local cache
    if (message.data) {
      for (const [id, data] of Object.entries(message.data)) {
        setCache(`item-${id}`, data);
      }
    }
    if (message.commentCache) {
      for (const [id, entry] of Object.entries(message.commentCache)) {
        if (entry.data && !getCached(`comment-${id}`)) {
          setCache(`comment-${id}`, entry.data);
        }
      }
    }
    log('Received prefetched data from background');
  }
});

// =============================================
// Suggestion 5: Comment Scoring & Highlight
// =============================================
// Badge color/icon thresholds
const BADGE_THRESHOLDS = [
  { min: 200, color: '#cc0000', icon: '🔥🔥', label: 'mega-hot' },
  { min: 100, color: '#e53000', icon: '🔥',   label: 'hot' },
  { min: 50,  color: '#f04000', icon: '🔥',   label: 'warm' },
  { min: 20,  color: '#ff5500', icon: '',      label: 'active' },
  { min: 0,   color: '#ff6600', icon: '',      label: 'normal' }
];

function getBadgeStyle(commentCount) {
  for (const threshold of BADGE_THRESHOLDS) {
    if (commentCount >= threshold.min) {
      return threshold;
    }
  }
  return BADGE_THRESHOLDS[BADGE_THRESHOLDS.length - 1];
}

// CSS styles — injected once
const STYLES = `
  .hn-comment-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 5px;
    border-radius: 3px;
    color: white;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    text-decoration: none;
    transition: opacity 0.15s, transform 0.15s;
  }
  .hn-comment-badge:hover {
    opacity: 0.85;
    transform: scale(1.08);
  }

  /* Suggestion 5: Scoring tiers */
  .hn-badge-normal  { background-color: #ff6600; }
  .hn-badge-active  { background-color: #ff5500; }
  .hn-badge-warm    { background-color: #f04000; box-shadow: 0 0 4px rgba(240,64,0,0.4); }
  .hn-badge-hot     { background-color: #e53000; box-shadow: 0 0 6px rgba(229,48,0,0.5); }
  .hn-badge-mega-hot {
    background: linear-gradient(135deg, #e53000, #cc0000);
    box-shadow: 0 0 8px rgba(204,0,0,0.6);
    animation: hn-pulse 2s ease-in-out infinite;
  }

  @keyframes hn-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(204,0,0,0.6); }
    50% { box-shadow: 0 0 14px rgba(204,0,0,0.9); }
  }

  .hn-comments-container {
    margin-top: 8px;
    margin-left: 20px;
    padding: 8px;
    background-color: #f6f6f0;
    border-left: 3px solid #ff6600;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
    max-width: 600px;
  }
  .hn-comment-item {
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ddd;
  }
  .hn-comment-item:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  .hn-comment-meta {
    font-weight: bold;
    color: #666;
    margin-bottom: 4px;
    font-size: 11px;
  }
  .hn-comment-meta .rank { color: #ff6600; font-weight: bold; }
  .hn-comment-meta .score { color: #2e7d32; font-weight: bold; }
  .hn-comment-text { color: #333; }
  .hn-comment-text p { margin: 0 0 4px 0; }
  .hn-loading { color: #999; font-style: italic; }

  /* Suggestion 3: View on HN link */
  .hn-view-all-link {
    display: block;
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid #ddd;
    font-size: 11px;
    font-weight: bold;
    color: #ff6600;
    text-decoration: none;
    transition: color 0.15s;
  }
  .hn-view-all-link:hover {
    color: #cc5200;
    text-decoration: underline;
  }
`;

function addStyles() {
  if (document.getElementById('hn-counter-styles')) return;
  const style = document.createElement('style');
  style.id = 'hn-counter-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

// Extract HN ID from the URL
function extractHNId(href) {
  if (!href) return null;
  const match = href.match(/item\?id=(\d+)/);
  return match ? match[1] : null;
}

// =============================================
// Suggestion 4: Request background prefetch
// =============================================
function requestPrefetch(itemIds) {
  try {
    if (typeof browserAPI !== 'undefined' && browserAPI.runtime && browserAPI.runtime.id) {
      // Use chrome.runtime.sendMessage for the background script
      const api = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome : browser;
      api.runtime.sendMessage({
        type: 'prefetchRequest',
        itemIds: itemIds
      });
      log(`Requested background prefetch for ${itemIds.length} items`);
    }
  } catch {
    // Background script may not be available (e.g. bookmarklet mode)
    log('Background prefetch not available');
  }
}

// Fetch item data from HN API with caching
async function fetchHNData(itemId) {
  const cached = getCached(`item-${itemId}`);
  if (cached) {
    log(`Cache hit for item ${itemId}`);
    return cached;
  }

  try {
    const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${itemId}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data) setCache(`item-${itemId}`, data);
    log(`Fetched item ${itemId}: descendants=${data?.descendants}`);
    return data;
  } catch (error) {
    console.error(`Error fetching item ${itemId}:`, error.message);
    return null;
  }
}

// Fetch a single comment with retry and caching
async function fetchComment(commentId, retries = 1) {
  const cached = getCached(`comment-${commentId}`);
  if (cached) return cached;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));

      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${commentId}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const comment = await response.json();
      if (comment) setCache(`comment-${commentId}`, comment);
      return comment;
    } catch (error) {
      log(`Attempt ${attempt + 1} failed for comment ${commentId}:`, error.message);
      if (attempt === retries) return null;
    }
  }
  return null;
}

// Fetch comments in batches with controlled concurrency
async function fetchCommentsInBatches(commentIds, batchSize = 5) {
  const comments = [];

  for (let i = 0; i < commentIds.length; i += batchSize) {
    const batch = commentIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(id => fetchComment(id)));

    for (const result of results) {
      comments.push(result.status === 'fulfilled' ? result.value : null);
    }

    if (i + batchSize < commentIds.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return comments;
}

// Fetch and rank top comments for a story
async function fetchTopComments(itemData, maxComments = 3) {
  if (!itemData.kids || itemData.kids.length === 0) return [];

  const commentIds = itemData.kids.slice(0, Math.min(10, itemData.kids.length));
  log(`Fetching ${commentIds.length} comments for story ${itemData.id}`);

  try {
    const comments = await fetchCommentsInBatches(commentIds);

    const validComments = comments.filter(c =>
      c &&
      c.text &&
      !c.deleted &&
      !c.dead &&
      c.parent === itemData.id &&
      c.text.length > 30
    );

    log(`Found ${validComments.length} valid top-level comments`);
    if (validComments.length === 0) return [];

    for (const comment of validComments) {
      comment.hasScore = typeof comment.score === 'number';
      comment.displayScore = comment.hasScore ? comment.score : 0;
      comment.replyCount = comment.kids ? comment.kids.length : 0;
    }

    validComments.sort((a, b) => {
      if (a.hasScore && b.hasScore) {
        if (b.displayScore !== a.displayScore) return b.displayScore - a.displayScore;
        if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
        return b.time - a.time;
      }
      if (a.hasScore && !b.hasScore) return -1;
      if (!a.hasScore && b.hasScore) return 1;
      if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
      return b.time - a.time;
    });

    itemData.validCommentsCount = validComments.length;
    return validComments.slice(0, maxComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

// Convert basic HTML to clean text
function stripBasicHtml(html) {
  if (!html) return '';
  return html
    .replace(/<p>/g, '\n')
    .replace(/<\/p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]*>/g, '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}

// Format relative time string
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor(diff / 60);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'now';
}

// Create comments DOM element
function createCommentsElement(comments, totalComments = 0, storyId = null) {
  const container = document.createElement('div');
  container.className = 'hn-comments-container';

  if (comments.length === 0) {
    container.innerHTML = '<div class="hn-loading">No top-level comments found</div>';
    return container;
  }

  const hasScores = comments.some(c => c.hasScore);
  const sortCriteria = hasScores ? 'by score' : 'by activity & recency';

  const header = document.createElement('div');
  header.style.cssText = 'font-weight: bold; color: #ff6600; margin-bottom: 6px; font-size: 11px;';
  header.textContent = `Top ${comments.length} Comments (${totalComments} total valid) - sorted ${sortCriteria}`;
  container.appendChild(header);

  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    const commentElement = document.createElement('div');
    commentElement.className = 'hn-comment-item';

    const meta = document.createElement('div');
    meta.className = 'hn-comment-meta';

    const timeText = formatTimeAgo(comment.time);
    let displayText;

    if (comment.hasScore) {
      const scoreText = comment.displayScore === 1 ? '1 point' : `${comment.displayScore} points`;
      displayText = `<span class="rank">#${index + 1}</span> ${comment.by || 'Anonymous'} (<span class="score">${scoreText}</span> • ${timeText})`;
    } else {
      let extraInfo = '';
      if (comment.replyCount > 0) {
        const replyText = comment.replyCount === 1 ? '1 reply' : `${comment.replyCount} replies`;
        extraInfo = ` • <span class="score">${replyText}</span>`;
      }
      displayText = `<span class="rank">#${index + 1}</span> ${comment.by || 'Anonymous'} (${timeText}${extraInfo})`;
    }

    meta.innerHTML = displayText;

    const text = document.createElement('div');
    text.className = 'hn-comment-text';
    const cleanText = stripBasicHtml(comment.text);
    text.textContent = cleanText.length > 300 ? cleanText.substring(0, 300) + '...' : cleanText;

    commentElement.appendChild(meta);
    commentElement.appendChild(text);
    container.appendChild(commentElement);
  }

  // Suggestion 3: "View all on HN →" link at bottom
  if (storyId) {
    const viewAllLink = document.createElement('a');
    viewAllLink.className = 'hn-view-all-link';
    viewAllLink.href = `https://news.ycombinator.com/item?id=${storyId}`;
    viewAllLink.target = '_blank';
    viewAllLink.rel = 'noopener noreferrer';
    viewAllLink.textContent = 'View all comments on HN →';
    viewAllLink.dataset.hnProcessed = 'true';
    container.appendChild(viewAllLink);
  }

  return container;
}

// Process HN comment links — two-phase: badges first, then comments
async function processCommentLinks() {
  addStyles();

  const commentLinks = Array.from(
    document.querySelectorAll('.content-body a[href*="news.ycombinator.com/item"]')
  ).filter(link => {
    // Basic checks
    if (link.dataset.hnProcessed === 'true') return false;
    if (link.classList.contains('hn-comment-badge') || link.classList.contains('hn-view-all-link')) return false;
    if (link.parentNode.querySelector('.hn-comment-badge')) return false;

    // Ensure we are not inside a comments container we created
    if (link.closest('.hn-comments-container')) return false;

    return true;
  });

  if (commentLinks.length === 0) {
    log('No new HN links found.');
    return;
  }

  log(`Processing ${commentLinks.length} links`);

  // Mark all links as processed immediately to prevent duplicates
  commentLinks.forEach(link => { link.dataset.hnProcessed = 'true'; });

  // Extract item IDs and pair with links
  const linkItems = commentLinks.map(link => ({
    link,
    itemId: extractHNId(link.href)
  })).filter(item => item.itemId);

  // Suggestion 4: Request background prefetch for all IDs we're about to process
  // The background will cache data so subsequent requests may hit cache
  const allIds = linkItems.map(item => item.itemId);
  requestPrefetch(allIds);

  // Phase 1: Fetch all story data in parallel batches and add badges
  const STORY_BATCH_SIZE = 5;
  const storyResults = [];

  for (let i = 0; i < linkItems.length; i += STORY_BATCH_SIZE) {
    const batch = linkItems.slice(i, i + STORY_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(item => fetchHNData(item.itemId)));

    for (let j = 0; j < batch.length; j++) {
      const itemData = results[j].status === 'fulfilled' ? results[j].value : null;
      if (!itemData) continue;

      const { link } = batch[j];
      const commentCount = itemData.descendants || 0;

      // Suggestion 5: Get badge style based on comment count
      const badgeStyle = getBadgeStyle(commentCount);

      // Suggestion 3: Make badge a clickable link to HN
      const badge = document.createElement('a');
      badge.className = `hn-comment-badge hn-badge-${badgeStyle.label}`;
      badge.href = `https://news.ycombinator.com/item?id=${itemData.id}`;
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.title = `View ${commentCount} comments on Hacker News`;
      badge.textContent = `${badgeStyle.icon ? badgeStyle.icon + ' ' : ''}${commentCount}`;
      badge.dataset.hnProcessed = 'true';
      badge.addEventListener('click', (e) => e.stopPropagation());

      link.parentNode.insertBefore(badge, link.nextSibling);

      storyResults.push({ link, itemData, commentCount });
    }
  }

  // Phase 2: Load comments asynchronously (non-blocking for badges)
  if (extensionSettings.maxComments > 0) {
    for (const { link, itemData, commentCount } of storyResults) {
      if (commentCount === 0) continue;

      const loadingElement = document.createElement('div');
      loadingElement.className = 'hn-comments-container';
      loadingElement.innerHTML = '<div class="hn-loading">Loading comments...</div>';

      const badge = link.nextSibling;
      if (badge && badge.nextSibling) {
        link.parentNode.insertBefore(loadingElement, badge.nextSibling);
      } else {
        link.parentNode.appendChild(loadingElement);
      }

      try {
        const topComments = await fetchTopComments(itemData, extensionSettings.maxComments);
        if (topComments.length === 0) {
          loadingElement.innerHTML = '<div class="hn-loading">No comments available</div>';
        } else {
          const commentsElement = createCommentsElement(
            topComments,
            itemData.validCommentsCount || topComments.length,
            itemData.id // pass story ID for "View on HN" link
          );
          loadingElement.replaceWith(commentsElement);
        }
      } catch (error) {
        console.error('Error loading comments:', error);
        loadingElement.innerHTML = '<div class="hn-loading">Error loading comments</div>';
      }
    }
  }

  log(`Processing complete! ${storyResults.length} badges added.`);
}

// Configure MutationObserver for dynamic content.
//
// The Old Reader is a SPA: on every in-app navigation it REPLACES the whole
// `.posts` node with a freshly fetched one (no full page reload). Observing
// `.posts` directly leaves us watching a detached, orphaned node that never
// fires again — which is why comments only showed up after a hard reload.
// We instead observe a stable ancestor that survives navigation (`.content-cell`),
// falling back to progressively broader containers so we always attach.
let observerConfigured = false;

function setupObserver() {
  if (observerConfigured) return;

  const target =
    document.querySelector('.content-cell') ||
    document.querySelector('.main-container') ||
    document.body;

  if (!target) {
    // DOM shell not ready yet — retry shortly.
    setTimeout(setupObserver, 500);
    return;
  }

  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    let hasNewPosts = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // A new post list / post / HN link appeared somewhere in this subtree.
        if ((node.matches && node.matches('.posts, .post, .content-body')) ||
            (node.querySelector &&
             node.querySelector('.post, a[href*="news.ycombinator.com/item"]'))) {
          hasNewPosts = true;
          break;
        }
      }
      if (hasNewPosts) break;
    }

    if (hasNewPosts) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => processCommentLinks(), 500);
    }
  });

  observer.observe(target, { childList: true, subtree: true });
  observerConfigured = true;
  log('Observer configured on', target.className || target.tagName);
}

// Main entry point
async function main() {
  await loadExtensionSettings();
  await processCommentLinks();
  setupObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}