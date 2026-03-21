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
  // Evict old entries if cache grows too large
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

// Listen for settings changes
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'settingsChanged') {
    const previousMaxComments = extensionSettings.maxComments;
    extensionSettings = message.settings;
    log('Settings updated:', extensionSettings);

    if (extensionSettings.maxComments === 0 && previousMaxComments > 0) {
      // Remove existing comments if they were being displayed
      document.querySelectorAll('.hn-comments-container').forEach(c => c.remove());
    } else if (extensionSettings.maxComments > 0) {
      processCommentLinks();
    }
  }
});

// CSS styles — injected once
const STYLES = `
  .hn-comment-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 5px;
    border-radius: 3px;
    background-color: #ff6600;
    color: white;
    font-size: 11px;
    font-weight: bold;
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

    // Small delay between batches to avoid rate limiting
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

    // Filter valid top-level comments
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

    // Annotate with score/reply info
    for (const comment of validComments) {
      comment.hasScore = typeof comment.score === 'number';
      comment.displayScore = comment.hasScore ? comment.score : 0;
      comment.replyCount = comment.kids ? comment.kids.length : 0;
    }

    // Sort: by score (if available) > reply count > recency
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
function createCommentsElement(comments, totalComments = 0) {
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

  return container;
}

// Process HN comment links — two-phase: badges first, then comments
async function processCommentLinks() {
  addStyles();

  const commentLinks = Array.from(
    document.querySelectorAll('.content-body a[href*="news.ycombinator.com/item"]')
  ).filter(link => link.dataset.hnProcessed !== 'true' && !link.parentNode.querySelector('.hn-comment-badge'));

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

      // Add badge immediately
      const badge = document.createElement('span');
      badge.className = 'hn-comment-badge';
      badge.textContent = commentCount;
      link.parentNode.insertBefore(badge, link.nextSibling);

      storyResults.push({ link, itemData, commentCount });
    }
  }

  // Phase 2: Load comments asynchronously (non-blocking for badges)
  if (extensionSettings.maxComments > 0) {
    for (const { link, itemData, commentCount } of storyResults) {
      if (commentCount === 0) continue;

      // Add loading indicator
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
          const commentsElement = createCommentsElement(topComments, itemData.validCommentsCount || topComments.length);
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

// Configure MutationObserver for dynamic content
let observerConfigured = false;

function setupObserver() {
  if (observerConfigured) return;

  const postsContainer = document.querySelector('.posts');
  if (!postsContainer) {
    log('Posts container not found');
    return;
  }

  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    let hasNewPosts = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.querySelectorAll &&
            node.querySelectorAll('a[href*="news.ycombinator.com/item"]').length > 0) {
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

  observer.observe(postsContainer, { childList: true, subtree: true });
  observerConfigured = true;
  log('Observer configured');
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