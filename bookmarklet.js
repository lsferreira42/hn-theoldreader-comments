// HN Comments Counter Bookmarklet for The Old Reader
// Based on the Chrome extension version
// To use: Create a bookmark with this code as the URL, then click it when on theoldreader.com

javascript:(function() {
  // Settings (can be modified directly in the bookmarklet)
  const extensionSettings = {
    maxComments: 3 // Change this to adjust number of comments (0 = disabled)
  };

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
    console.log('HN Counter: Styles added');
  }

  // Extract HN ID from URL
  function extractHNId(href) {
    if (!href) return null;
    const match = href.match(/item\?id=(\d+)/);
    return match ? match[1] : null;
  }

  // Fetch story data from HN API
  async function fetchHNData(itemId) {
    try {
      const url = `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`;
      console.log(`HN Counter: Fetching story data for item ${itemId}...`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error in response: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data) {
        console.log(`HN Counter: Successfully fetched story ${itemId}: type=${data.type}, descendants=${data.descendants}`);
      }
      
      return data;
    } catch (error) {
      console.error(`HN Counter: Error fetching data for item ${itemId}:`, error);
      return null;
    }
  }

  // Fetch comment data with retry
  async function fetchComment(commentId, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        const url = `https://hacker-news.firebaseio.com/v0/item/${commentId}.json`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        
        const comment = await response.json();
        return comment;
      } catch (error) {
        console.error(`HN Counter: Attempt ${attempt + 1} failed for comment ${commentId}:`, error.message);
        
        if (attempt === retries) {
          console.error(`HN Counter: Failed to fetch comment ${commentId} after ${retries + 1} attempts`);
          return null;
        }
      }
    }
    return null;
  }

  // Fetch comments with rate control
  async function fetchCommentsWithDelay(commentIds) {
    const comments = [];
    const batchSize = 3;
    
    for (let i = 0; i < commentIds.length; i += batchSize) {
      const batch = commentIds.slice(i, i + batchSize);
      const batchPromises = batch.map(id => fetchComment(id));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        comments.push(...batchResults);
        
        if (i + batchSize < commentIds.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('HN Counter: Batch fetch error:', error);
      }
    }
    
    return comments;
  }

  // Fetch and process top comments
  async function fetchTopComments(itemData, maxComments = 3) {
    if (!itemData.kids || itemData.kids.length === 0) {
      return [];
    }

    const commentIds = itemData.kids.slice(0, Math.min(10, itemData.kids.length));
    console.log(`HN Counter: Story ${itemData.id} has ${itemData.kids.length} total comments, fetching first ${commentIds.length}`);
    
    try {
      const comments = await fetchCommentsWithDelay(commentIds);
      const validResponses = comments.filter(c => c !== null);
      console.log(`HN Counter: Valid responses: ${validResponses.length}`);
      
      const validComments = comments.filter(comment => 
        comment && 
        comment.text && 
        !comment.deleted && 
        !comment.dead &&
        comment.parent === itemData.id &&
        comment.text.length > 30
      );
      
      console.log(`HN Counter: Found ${validComments.length} valid top-level comments`);
      
      if (validComments.length === 0) {
        return [];
      }
      
      validComments.forEach(comment => {
        if (typeof comment.score === 'number') {
          comment.displayScore = comment.score;
          comment.hasScore = true;
        } else {
          comment.displayScore = 0;
          comment.hasScore = false;
        }
        comment.replyCount = comment.kids ? comment.kids.length : 0;
      });
      
      validComments.sort((a, b) => {
        if (a.hasScore && b.hasScore) {
          if (b.displayScore !== a.displayScore) {
            return b.displayScore - a.displayScore;
          }
          if (b.replyCount !== a.replyCount) {
            return b.replyCount - a.replyCount;
          }
          return b.time - a.time;
        }
        
        if (a.hasScore && !b.hasScore) return -1;
        if (!a.hasScore && b.hasScore) return 1;
        
        if (b.replyCount !== a.replyCount) {
          return b.replyCount - a.replyCount;
        }
        
        return b.time - a.time;
      });
      
      itemData.validCommentsCount = validComments.length;
      
      return validComments.slice(0, maxComments);
    } catch (error) {
      console.error('HN Counter: Error fetching comments:', error);
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
    
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; color: #ff6600; margin-bottom: 6px; font-size: 11px;';
    
    const hasScores = comments.some(c => c.hasScore);
    const sortCriteria = hasScores ? 'by score' : 'by activity & recency';
    
    header.textContent = `Top ${comments.length} Comments (${totalComments} total valid) - sorted ${sortCriteria}`;
    container.appendChild(header);
    
    comments.forEach((comment, index) => {
      const commentElement = document.createElement('div');
      commentElement.className = 'hn-comment-item';
      
      const meta = document.createElement('div');
      meta.className = 'hn-comment-meta';
      
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
      
      let displayText;
      
      if (comment.hasScore) {
        const score = comment.displayScore;
        const scoreText = score === 1 ? '1 point' : `${score} points`;
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
      const truncatedText = cleanText.length > 300 ? 
        cleanText.substring(0, 300) + '...' : cleanText;
      
      text.textContent = truncatedText;
      
      commentElement.appendChild(meta);
      commentElement.appendChild(text);
      container.appendChild(commentElement);
    });
    
    return container;
  }

  // Process HN comment links on the page
  async function processCommentLinks() {
    addStyles();
    
    const commentLinks = Array.from(document.querySelectorAll('.content-body a[href*="news.ycombinator.com/item"]'));
    
    if (commentLinks.length === 0) {
      console.log('HN Counter: No Hacker News comment links found on this page.');
      alert('No Hacker News links found on this page. Make sure you are on The Old Reader and there are HN links in the feed.');
      return;
    }
    
    console.log(`HN Counter: Found ${commentLinks.length} comment links`);
    
    let updatedCount = 0;
    let failedCount = 0;
    
    for (const link of commentLinks) {
      if (link.dataset.hnProcessed === 'true') {
        continue;
      }
      
      const existingBadge = link.parentNode.querySelector('.hn-comment-badge');
      if (existingBadge) {
        link.dataset.hnProcessed = 'true';
        continue;
      }
      
      const itemId = extractHNId(link.href);
      if (!itemId) {
        console.log(`HN Counter: Could not extract ID from: ${link.href}`);
        failedCount++;
        continue;
      }
      
      link.dataset.hnProcessed = 'true';
      
      const itemData = await fetchHNData(itemId);
      if (!itemData) {
        failedCount++;
        continue;
      }
      
      const commentCount = itemData.descendants || 0;
      
      const badge = document.createElement('span');
      badge.className = 'hn-comment-badge';
      badge.textContent = commentCount;
      
      link.parentNode.insertBefore(badge, link.nextSibling);
      
      if (commentCount > 0 && extensionSettings.maxComments > 0) {
        const loadingElement = document.createElement('div');
        loadingElement.className = 'hn-comments-container';
        loadingElement.innerHTML = '<div class="hn-loading">Loading comments...</div>';
        link.parentNode.insertBefore(loadingElement, link.nextSibling.nextSibling);
        
        try {
          const topComments = await fetchTopComments(itemData, extensionSettings.maxComments);
          
          if (topComments.length === 0) {
            loadingElement.innerHTML = '<div class="hn-loading">No comments available or connection issues</div>';
          } else {
            const commentsElement = createCommentsElement(topComments, itemData.validCommentsCount || topComments.length);
            link.parentNode.replaceChild(commentsElement, loadingElement);
          }
        } catch (error) {
          console.error('HN Counter: Error loading comments:', error);
          loadingElement.innerHTML = '<div class="hn-loading">Error loading comments - try refreshing</div>';
        }
      }
      
      updatedCount++;
    }
    
    console.log(`HN Counter: Processing complete! Counters added: ${updatedCount}, Failures: ${failedCount}`);
    alert(`HN Counter: Processing complete!\nCounters added: ${updatedCount}\nFailures: ${failedCount}`);
  }

  // Main execution
  if (window.location.hostname !== 'theoldreader.com') {
    alert('This bookmarklet only works on The Old Reader (theoldreader.com)');
    return;
  }
  
  console.log('HN Counter: Starting HN Comments Counter bookmarklet');
  processCommentLinks();
})(); 