// Bookmarklet para HN Comments Counter
// Para usar: copie e cole este código no console do navegador ou crie um bookmark com este código

javascript:(function(){
  console.log('Starting HN Comments Counter bookmarklet');
  
  function addStyles(){
    if(document.getElementById('hn-counter-styles')) return;
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
    `;
    document.head.appendChild(style);
    console.log('Styles added');
  }
  
  function extractHNId(href){
    if(!href) return null;
    const match = href.match(/item\?id=(\d+)/);
    return match ? match[1] : null;
  }
  
  async function fetchHNData(itemId){
    try{
      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${itemId}.json`);
      if(!response.ok){
        throw new Error(`Error in response: ${response.status}`);
      }
      return await response.json();
    }catch(error){
      console.error(`Error fetching data for item ${itemId}:`, error);
      return null;
    }
  }
  
  async function processCommentLinks(){
    addStyles();
    const commentLinks = Array.from(document.querySelectorAll('.content-body a[href*="news.ycombinator.com/item"]'));
    
    if(commentLinks.length === 0){
      console.log('No Hacker News comment links found on this page.');
      return;
    }
    
    console.log(`Found ${commentLinks.length} comment links`);
    let updatedCount = 0;
    let failedCount = 0;
    
    for(const link of commentLinks){
      if(link.dataset.hnProcessed === 'true'){
        continue;
      }
      
      const existingBadge = link.parentNode.querySelector('.hn-comment-badge');
      if(existingBadge){
        link.dataset.hnProcessed = 'true';
        continue;
      }
      
      const itemId = extractHNId(link.href);
      if(!itemId){
        console.log(`Could not extract ID from: ${link.href}`);
        failedCount++;
        continue;
      }
      
      link.dataset.hnProcessed = 'true';
      
      const itemData = await fetchHNData(itemId);
      if(!itemData){
        failedCount++;
        continue;
      }
      
      const commentCount = itemData.descendants || 0;
      const badge = document.createElement('span');
      badge.className = 'hn-comment-badge';
      badge.textContent = commentCount;
      link.parentNode.insertBefore(badge, link.nextSibling);
      updatedCount++;
    }
    
    console.log(`Processing complete! Counters added: ${updatedCount}, Failures: ${failedCount}`);
  }
  
  let observerConfigured = false;
  
  function setupObserver(){
    if(observerConfigured){
      console.log('Observer already configured, skipping...');
      return;
    }
    
    const postsContainer = document.querySelector('.posts');
    if(!postsContainer){
      console.log('Posts container not found');
      return null;
    }
    
    let timeoutId = null;
    
    const observer = new MutationObserver((mutations) => {
      let hasNewPosts = false;
      
      for(const mutation of mutations){
        if(mutation.addedNodes.length > 0){
          for(const node of mutation.addedNodes){
            if(node.nodeType === Node.ELEMENT_NODE){
              const hnLinks = node.querySelectorAll ? node.querySelectorAll('a[href*="news.ycombinator.com/item"]') : [];
              if(hnLinks.length > 0){
                hasNewPosts = true;
                break;
              }
            }
          }
          if(hasNewPosts) break;
        }
      }
      
      if(hasNewPosts){
        console.log('New HN links detected, processing comments...');
        
        if(timeoutId){
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          processCommentLinks();
        }, 500);
      }
    });
    
    observer.observe(postsContainer, {childList: true, subtree: true});
    observerConfigured = true;
    console.log('Observer configured for new posts');
    return observer;
  }
  
  async function main(){
    console.log('Running initial processing');
    await processCommentLinks();
    setupObserver();
  }
  
  main();
})(); 