// HN Comments Counter for The Old Reader
console.log('Starting HN Comments Counter extension');

// Adiciona os estilos CSS
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
  `;
  document.head.appendChild(style);
  console.log('Styles added');
}

// Extrai o ID do item do Hacker News a partir da URL
function extractHNId(href) {
  if (!href) return null;
  const match = href.match(/item\?id=(\d+)/);
  return match ? match[1] : null;
}

// Busca os dados do item na API do Hacker News
async function fetchHNData(itemId) {
  try {
    const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${itemId}.json`);
    if (!response.ok) {
      throw new Error(`Error in response: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching data for item ${itemId}:`, error);
    return null;
  }
}

// Processa os links de comentários do Hacker News na página
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
    // Verificação mais robusta para evitar duplicação
    if (link.dataset.hnProcessed === 'true') {
      continue;
    }
    
    // Verifica se já existe um badge próximo
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
    
    // Marca o link como sendo processado para evitar múltiplas requisições
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
    updatedCount++;
  }
  
  console.log(`Processing complete! Counters added: ${updatedCount}, Failures: ${failedCount}`);
}

// Variável para controlar se o observer já foi configurado
let observerConfigured = false;

// Configura o observer para monitorar novos posts
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
  
  // Debounce para evitar múltiplas execuções rápidas
  let timeoutId = null;
  
  const observer = new MutationObserver((mutations) => {
    let hasNewPosts = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Verifica se os nós adicionados contêm links do HN
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
      
      // Cancela timeout anterior se existir
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Agenda processamento com delay para evitar múltiplas execuções
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

// Função principal
async function main() {
  console.log('Running initial processing');
  await processCommentLinks();
  setupObserver();
}

// Executa a função principal quando a página estiver pronta
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}