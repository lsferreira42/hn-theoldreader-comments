// HN Comments Counter for The Old Reader
console.log('Starting HN Comments Counter extension');

// Global settings
let extensionSettings = {
    maxComments: 3 // default value
};

// Load saved settings
async function loadExtensionSettings() {
    try {
        const result = await chrome.storage.sync.get({ maxComments: 3 });
        extensionSettings = result;
        console.log('Extension settings loaded:', extensionSettings);
        if (extensionSettings.maxComments === 0) {
            console.log('📝 Comment display is disabled (maxComments = 0). Only counters will be shown.');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        // Use default settings if fails
        extensionSettings = { maxComments: 3 };
    }
}

// Listen for settings changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settingsChanged') {
        const previousMaxComments = extensionSettings.maxComments;
        extensionSettings = message.settings;
        console.log('Settings updated:', extensionSettings);
        
        if (extensionSettings.maxComments === 0) {
            console.log('📝 Comment display disabled. Only counters will be shown.');
            // Remove existing comments if they were being displayed
            if (previousMaxComments > 0) {
                const existingComments = document.querySelectorAll('.hn-comments-container');
                existingComments.forEach(container => container.remove());
            }
        } else {
            console.log(`📝 Comment display enabled. Showing top ${extensionSettings.maxComments} comments.`);
            // Reprocess existing links with new settings
            processCommentLinks();
        }
    }
});

// Add CSS styles
function addStyles() {
  if (document.getElementById('hn-counter-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'hn-counter-styles';
  style.textContent = `
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
    
    .hn-comment-meta .rank {
      color: #ff6600;
      font-weight: bold;
    }
    
    .hn-comment-meta .score {
      color: #2e7d32;
      font-weight: bold;
    }
    
    .hn-comment-text {
      color: #333;
    }
    
    .hn-comment-text p {
      margin: 0 0 4px 0;
    }
    
    .hn-loading {
      color: #999;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
  console.log('Styles added');
}

// Extract HN ID from the URL
function extractHNId(href) {
  if (!href) return null;
  const match = href.match(/item\?id=(\d+)/);
  return match ? match[1] : null;
}

// Fetch story data from the Hacker News API
async function fetchHNData(itemId) {
  try {
    const url = `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`;
    console.log(`Fetching story data for item ${itemId}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error in response: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data) {
      console.log(`Successfully fetched story ${itemId}: type=${data.type}, descendants=${data.descendants}, kids_count=${data.kids ? data.kids.length : 0}`);
    } else {
      console.log(`Story ${itemId} returned null`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching data for item ${itemId}:`, error);
    
    // Check if it's a CORS or network issue
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error('This might be a CORS issue or network connectivity problem');
    }
    
    return null;
  }
}

// Fetch comment data from the Hacker News API with retry
async function fetchComment(commentId, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Small delay to avoid rate limiting
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      const url = `https://hacker-news.firebaseio.com/v0/item/${commentId}.json`;
      console.log(`Fetching comment ${commentId} (attempt ${attempt + 1})...`);
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      
      const comment = await response.json();
      
      // Log comment for debug
      if (comment) {
        console.log(`✅ Successfully fetched comment ${commentId}: parent=${comment.parent}, type=${comment.type}, text_length=${comment.text ? comment.text.length : 0}`);
      } else {
        console.log(`❌ Comment ${commentId} returned null`);
      }
      
      return comment;
    } catch (error) {
      console.error(`❌ Attempt ${attempt + 1} failed for comment ${commentId}:`, error.message);
      
      // More details about the error
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.error(`Network/CORS error for comment ${commentId}. This might be due to:
        1. Network connectivity issues
        2. Browser blocking the request
        3. Extension permissions
        4. API rate limiting`);
      }
      
      if (attempt === retries) {
        console.error(`🚫 Failed to fetch comment ${commentId} after ${retries + 1} attempts`);
        return null;
      }
    }
  }
  return null;
}

// Fetch comments with rate control
async function fetchCommentsWithDelay(commentIds) {
  const comments = [];
  const batchSize = 3; // Process 3 at a time
  
  for (let i = 0; i < commentIds.length; i += batchSize) {
    const batch = commentIds.slice(i, i + batchSize);
    const batchPromises = batch.map(id => fetchComment(id));
    
    try {
      const batchResults = await Promise.all(batchPromises);
      comments.push(...batchResults);
      
      // Delay between batches
      if (i + batchSize < commentIds.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
      // Continue with next batch even if one fails
    }
  }
  
  return comments;
}

// Fetch and process top comments
async function fetchTopComments(itemData, maxComments = 3) {
  if (!itemData.kids || itemData.kids.length === 0) {
    return [];
  }

  // Fetch fewer comments to reduce load
  const commentIds = itemData.kids.slice(0, Math.min(10, itemData.kids.length));
  console.log(`📝 Story ${itemData.id} has ${itemData.kids.length} total comments, fetching first ${commentIds.length}: [${commentIds.join(', ')}]`);
  
  try {
    const comments = await fetchCommentsWithDelay(commentIds);
    
    // Log received comments
    console.log(`📥 Received ${comments.length} comment responses (including nulls)`);
    const validResponses = comments.filter(c => c !== null);
    console.log(`📊 Valid responses: ${validResponses.length}`);
    
    // Detailed log of each comment
    validResponses.forEach((comment, index) => {
      if (comment) {
        console.log(`Comment ${index + 1}/${validResponses.length}: 
        - ID: ${comment.id}
        - Parent: ${comment.parent} (story is ${itemData.id})
        - Type: ${comment.type}
        - Deleted: ${comment.deleted}
        - Dead: ${comment.dead}
        - Text length: ${comment.text ? comment.text.length : 0}
        - Is top-level: ${comment.parent === itemData.id}
        - Has sufficient text: ${comment.text && comment.text.length > 30}`);
      }
    });
    
    // Filter valid comments - top-level have story ID as parent
    const validComments = comments.filter(comment => 
      comment && 
      comment.text && 
      !comment.deleted && 
      !comment.dead &&
      comment.parent === itemData.id && // Top-level: parent is the story itself
      comment.text.length > 30 // More substantial comments
    );
    
    console.log(`✅ Found ${validComments.length} valid top-level comments from ${comments.length} fetched`);
    
    if (validComments.length === 0) {
      console.log(`❌ No valid comments found. Criteria:
      - Must not be null
      - Must have text content
      - Must not be deleted
      - Must not be dead
      - Parent must be ${itemData.id}
      - Text must be > 30 characters`);
      return [];
    }
    
    // For top-level comments, score may be present or not
    validComments.forEach(comment => {
      if (typeof comment.score === 'number') {
        comment.displayScore = comment.score;
        comment.hasScore = true;
      } else {
        comment.displayScore = 0;
        comment.hasScore = false;
      }
      
      // Count replies for use as quality factor when no score
      comment.replyCount = comment.kids ? comment.kids.length : 0;
      
      // Log scores for debug
      console.log(`Comment ${comment.id}: score=${comment.score}, displayScore=${comment.displayScore}, hasScore=${comment.hasScore}, replies=${comment.replyCount}, by=${comment.by}`);
    });
    
    // Score statistics
    const withScore = validComments.filter(c => c.hasScore);
    const withoutScore = validComments.filter(c => !c.hasScore);
    console.log(`📊 Score stats: ${withScore.length} comments with scores, ${withoutScore.length} without scores`);
    
    if (withScore.length > 0) {
      const scores = withScore.map(c => c.displayScore).sort((a, b) => b - a);
      console.log(`📈 Score range: ${scores[0]} (highest) to ${scores[scores.length - 1]} (lowest)`);
    } else {
      console.log(`💡 No scores available from HN API - sorting by engagement (replies) and recency`);
      const withReplies = validComments.filter(c => c.replyCount > 0);
      if (withReplies.length > 0) {
        const replies = withReplies.map(c => c.replyCount).sort((a, b) => b - a);
        console.log(`💬 Reply range: ${replies[0]} (most active) to ${replies[replies.length - 1]} (least active)`);
      }
    }
    
    // Best ordering considering replies when no scores
    validComments.sort((a, b) => {
      // If both have score, order by score (higher first)
      if (a.hasScore && b.hasScore) {
        if (b.displayScore !== a.displayScore) {
          return b.displayScore - a.displayScore;
        }
        // If scores equal, order by replies, then by time (more recent)
        if (b.replyCount !== a.replyCount) {
          return b.replyCount - a.replyCount;
        }
        return b.time - a.time;
      }
      
      // Prioritize comments with score over those without score
      if (a.hasScore && !b.hasScore) return -1;
      if (!a.hasScore && b.hasScore) return 1;
      
      // If both don't have score, order by reply count (more activity = better)
      if (b.replyCount !== a.replyCount) {
        return b.replyCount - a.replyCount;
      }
      
      // If same reply count, order by time (more recent first)
      return b.time - a.time;
    });
    
    // Log final ordering for debug
    console.log('🏆 Final ranking:');
    validComments.slice(0, maxComments).forEach((comment, index) => {
      const scoreInfo = comment.hasScore ? `Score: ${comment.displayScore}` : 'no score';
      const replyInfo = comment.replyCount > 0 ? `, ${comment.replyCount} replies` : ', no replies';
      console.log(`${index + 1}. ${comment.by} - ${scoreInfo}${replyInfo} - Time: ${new Date(comment.time * 1000).toLocaleString()}`);
    });
    
    console.log(`🎯 Returning top ${Math.min(maxComments, validComments.length)} comments`);
    
    // Store total valid comments found for display
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

// Create element with comments
function createCommentsElement(comments, totalComments = 0) {
  const container = document.createElement('div');
  container.className = 'hn-comments-container';
  
  if (comments.length === 0) {
    container.innerHTML = '<div class="hn-loading">No top-level comments found</div>';
    return container;
  }
  
  // Add header with information
  const header = document.createElement('div');
  header.style.cssText = 'font-weight: bold; color: #ff6600; margin-bottom: 6px; font-size: 11px;';
  
  // Check if there are comments with score to adjust message
  const hasScores = comments.some(c => c.hasScore);
  const sortCriteria = hasScores ? 'by score' : 'by activity & recency';
  
  header.textContent = `Top ${comments.length} Comments (${totalComments} total valid) - sorted ${sortCriteria}`;
  container.appendChild(header);
  
  comments.forEach((comment, index) => {
    const commentElement = document.createElement('div');
    commentElement.className = 'hn-comment-item';
    
    const meta = document.createElement('div');
    meta.className = 'hn-comment-meta';
    
    // Calculate approximate time in English
    let timeText = '';
    if (comment.time) {
      const now = Math.floor(Date.now() / 1000);
      const diff = now - comment.time;
      const hours = Math.floor(diff / 3600);
      const days = Math.floor(hours / 24);
      const minutes = Math.floor(diff / 60);
      
      if (days > 0) {
        timeText = `${days} day${days !== 1 ? 's' : ''} ago`;
      } else if (hours > 0) {
        timeText = `${hours}h ago`;
      } else if (minutes > 0) {
        timeText = `${minutes}m ago`;
      } else {
        timeText = 'now';
      }
    }
    
    // Format display - show score whenever available
    let displayText;
    
    if (comment.hasScore) {
      const score = comment.displayScore;
      const scoreText = score === 1 ? '1 point' : `${score} points`;
      displayText = `<span class="rank">#${index + 1}</span> ${comment.by || 'Anonymous'} (<span class="score">${scoreText}</span> • ${timeText})`;
    } else {
      // When no score, show reply count if there is one
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
    // Limit text to not get too long
    const truncatedText = cleanText.length > 300 ? 
      cleanText.substring(0, 300) + '...' : cleanText;
    
    text.textContent = truncatedText;
    
    commentElement.appendChild(meta);
    commentElement.appendChild(text);
    container.appendChild(commentElement);
  });
  
  return container;
}

// Process Hacker News comment links on the page
async function processCommentLinks() {
  addStyles();
  
  const commentLinks = Array.from(document.querySelectorAll('.content-body a[href*="news.ycombinator.com/item"]'));
  
  if (commentLinks.length === 0) {
    console.log('No Hacker News comment links found on this page.');
    return;
  }
  
  console.log(`Found ${commentLinks.length} comment links`);
  
  let updatedCount = 0;
  let failedCount = 0;
  
  for (const link of commentLinks) {
    // More robust check to avoid duplication
    if (link.dataset.hnProcessed === 'true') {
      continue;
    }
    
    // Check if there's already a badge nearby
    const existingBadge = link.parentNode.querySelector('.hn-comment-badge');
    if (existingBadge) {
      link.dataset.hnProcessed = 'true';
      continue;
    }
    
    const itemId = extractHNId(link.href);
    if (!itemId) {
      console.log(`Could not extract ID from: ${link.href}`);
      failedCount++;
      continue;
    }
    
    // Mark link as being processed to avoid multiple requests
    link.dataset.hnProcessed = 'true';
    
    const itemData = await fetchHNData(itemId);
    if (!itemData) {
      failedCount++;
      continue;
    }
    
    const commentCount = itemData.descendants || 0;
    
    // Create badge with comment count
    const badge = document.createElement('span');
    badge.className = 'hn-comment-badge';
    badge.textContent = commentCount;
    
    // Insert badge
    link.parentNode.insertBefore(badge, link.nextSibling);
    
    // Fetch and display top comments if there are any
    if (commentCount > 0 && extensionSettings.maxComments > 0) {
      // Show loading indicator
      const loadingElement = document.createElement('div');
      loadingElement.className = 'hn-comments-container';
      loadingElement.innerHTML = '<div class="hn-loading">Loading comments...</div>';
      link.parentNode.insertBefore(loadingElement, link.nextSibling.nextSibling);
      
      try {
        const topComments = await fetchTopComments(itemData, extensionSettings.maxComments);
        
        if (topComments.length === 0) {
          // If no valid comments found
          loadingElement.innerHTML = '<div class="hn-loading">No comments available or connection issues</div>';
        } else {
          // Fetch number of valid comments processed in fetchTopComments function
          const commentsElement = createCommentsElement(topComments, itemData.validCommentsCount || topComments.length);
          // Replace loading indicator with comments
          link.parentNode.replaceChild(commentsElement, loadingElement);
        }
      } catch (error) {
        console.error('Error loading comments:', error);
        loadingElement.innerHTML = '<div class="hn-loading">Error loading comments - try refreshing</div>';
      }
    }
    
    updatedCount++;
  }
  
  console.log(`Processing complete! Counters added: ${updatedCount}, Failures: ${failedCount}`);
}

// Variable to control if observer has already been configured
let observerConfigured = false;

// Configure observer to monitor new posts
function setupObserver() {
  if (observerConfigured) {
    console.log('Observer already configured, skipping...');
    return;
  }
  
  const postsContainer = document.querySelector('.posts');
  if (!postsContainer) {
    console.log('Posts container not found');
    return null;
  }
  
  // Debounce to avoid multiple rapid executions
  let timeoutId = null;
  
  const observer = new MutationObserver((mutations) => {
    let hasNewPosts = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Check if added nodes contain HN links
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const hnLinks = node.querySelectorAll ? node.querySelectorAll('a[href*="news.ycombinator.com/item"]') : [];
            if (hnLinks.length > 0) {
              hasNewPosts = true;
              break;
            }
          }
        }
        if (hasNewPosts) break;
      }
    }
    
    if (hasNewPosts) {
      console.log('New HN links detected, processing comments...');
      
      // Cancel previous timeout if exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Schedule processing with delay to avoid multiple executions
      timeoutId = setTimeout(() => {
        processCommentLinks();
      }, 500);
    }
  });
  
  observer.observe(postsContainer, { 
    childList: true, 
    subtree: true 
  });
  
  observerConfigured = true;
  console.log('Observer configured for new posts');
  return observer;
}

// Main function
async function main() {
  console.log('Loading extension settings...');
  await loadExtensionSettings();
  console.log('Running initial processing');
  await processCommentLinks();
  setupObserver();
}

// Execute main function when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}