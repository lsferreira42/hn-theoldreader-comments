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

// Extrai o ID do item do Hacker News a partir da URL
function extractHNId(href) {
  if (!href) return null;
  const match = href.match(/item\?id=(\d+)/);
  return match ? match[1] : null;
}

// Busca os dados do item na API do Hacker News
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
    
    // Verifica se é erro de CORS ou rede
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.error('This might be a CORS issue or network connectivity problem');
    }
    
    return null;
  }
}

// Busca os dados de um comentário específico com retry
async function fetchComment(commentId, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Pequeno delay para evitar rate limiting
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
      
      // Log do comentário para debug
      if (comment) {
        console.log(`✅ Successfully fetched comment ${commentId}: parent=${comment.parent}, type=${comment.type}, text_length=${comment.text ? comment.text.length : 0}`);
      } else {
        console.log(`❌ Comment ${commentId} returned null`);
      }
      
      return comment;
    } catch (error) {
      console.error(`❌ Attempt ${attempt + 1} failed for comment ${commentId}:`, error.message);
      
      // Mais detalhes sobre o erro
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

// Busca comentários com controle de rate
async function fetchCommentsWithDelay(commentIds) {
  const comments = [];
  const batchSize = 3; // Processa 3 por vez
  
  for (let i = 0; i < commentIds.length; i += batchSize) {
    const batch = commentIds.slice(i, i + batchSize);
    const batchPromises = batch.map(id => fetchComment(id));
    
    try {
      const batchResults = await Promise.all(batchPromises);
      comments.push(...batchResults);
      
      // Delay entre batches
      if (i + batchSize < commentIds.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
      // Continua com o próximo batch mesmo se um falhar
    }
  }
  
  return comments;
}

// Busca e processa os top comentários
async function fetchTopComments(itemData, maxComments = 3) {
  if (!itemData.kids || itemData.kids.length === 0) {
    return [];
  }

  // Busca menos comentários para reduzir carga
  const commentIds = itemData.kids.slice(0, Math.min(10, itemData.kids.length));
  console.log(`📝 Story ${itemData.id} has ${itemData.kids.length} total comments, fetching first ${commentIds.length}: [${commentIds.join(', ')}]`);
  
  try {
    const comments = await fetchCommentsWithDelay(commentIds);
    
    // Log dos comentários recebidos
    console.log(`📥 Received ${comments.length} comment responses (including nulls)`);
    const validResponses = comments.filter(c => c !== null);
    console.log(`📊 Valid responses: ${validResponses.length}`);
    
    // Log detalhado de cada comentário
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
    
    // Filtra comentários válidos - top-level têm o story ID como parent
    const validComments = comments.filter(comment => 
      comment && 
      comment.text && 
      !comment.deleted && 
      !comment.dead &&
      comment.parent === itemData.id && // Top-level: parent é o próprio story
      comment.text.length > 30 // Comentários mais substantivos
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
    
    // Para comentários top-level, score pode estar presente ou não
    validComments.forEach(comment => {
      if (typeof comment.score === 'number') {
        comment.displayScore = comment.score;
        comment.hasScore = true;
      } else {
        comment.displayScore = 0;
        comment.hasScore = false;
      }
      
      // Conta replies para usar como fator de qualidade quando não há score
      comment.replyCount = comment.kids ? comment.kids.length : 0;
      
      // Log dos scores para debug
      console.log(`Comment ${comment.id}: score=${comment.score}, displayScore=${comment.displayScore}, hasScore=${comment.hasScore}, replies=${comment.replyCount}, by=${comment.by}`);
    });
    
    // Estatísticas dos scores
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
    
    // Melhor ordenação considerando replies quando não há scores
    validComments.sort((a, b) => {
      // Se ambos têm score, ordena por score (maior primeiro)
      if (a.hasScore && b.hasScore) {
        if (b.displayScore !== a.displayScore) {
          return b.displayScore - a.displayScore;
        }
        // Se scores iguais, ordena por replies, depois por tempo (mais recente)
        if (b.replyCount !== a.replyCount) {
          return b.replyCount - a.replyCount;
        }
        return b.time - a.time;
      }
      
      // Prioriza comentários com score sobre os sem score
      if (a.hasScore && !b.hasScore) return -1;
      if (!a.hasScore && b.hasScore) return 1;
      
      // Se ambos não têm score, ordena por número de replies (mais atividade = melhor)
      if (b.replyCount !== a.replyCount) {
        return b.replyCount - a.replyCount;
      }
      
      // Se mesmo número de replies, ordena por tempo (mais recente primeiro)
      return b.time - a.time;
    });
    
    // Log da ordenação final para debug
    console.log('🏆 Final ranking:');
    validComments.slice(0, maxComments).forEach((comment, index) => {
      const scoreInfo = comment.hasScore ? `Score: ${comment.displayScore}` : 'no score';
      const replyInfo = comment.replyCount > 0 ? `, ${comment.replyCount} replies` : ', no replies';
      console.log(`${index + 1}. ${comment.by} - ${scoreInfo}${replyInfo} - Time: ${new Date(comment.time * 1000).toLocaleString()}`);
    });
    
    console.log(`🎯 Returning top ${Math.min(maxComments, validComments.length)} comments`);
    
    // Armazena o total de comentários válidos encontrados para exibição
    itemData.validCommentsCount = validComments.length;
    
    return validComments.slice(0, maxComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

// Converte HTML básico para texto limpo
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

// Cria o elemento com os comentários
function createCommentsElement(comments, totalComments = 0) {
  const container = document.createElement('div');
  container.className = 'hn-comments-container';
  
  if (comments.length === 0) {
    container.innerHTML = '<div class="hn-loading">No top-level comments found</div>';
    return container;
  }
  
  // Adiciona cabeçalho com informações
  const header = document.createElement('div');
  header.style.cssText = 'font-weight: bold; color: #ff6600; margin-bottom: 6px; font-size: 11px;';
  
  // Verifica se há comentários com score para ajustar a mensagem
  const hasScores = comments.some(c => c.hasScore);
  const sortCriteria = hasScores ? 'by score' : 'by activity & recency';
  
  header.textContent = `Top ${comments.length} Comments (${totalComments} total valid) - sorted ${sortCriteria}`;
  container.appendChild(header);
  
  comments.forEach((comment, index) => {
    const commentElement = document.createElement('div');
    commentElement.className = 'hn-comment-item';
    
    const meta = document.createElement('div');
    meta.className = 'hn-comment-meta';
    
    // Calcula tempo aproximado em inglês
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
    
    // Formata a exibição - mostra score sempre que disponível
    let displayText;
    
    if (comment.hasScore) {
      const score = comment.displayScore;
      const scoreText = score === 1 ? '1 point' : `${score} points`;
      displayText = `<span class="rank">#${index + 1}</span> ${comment.by || 'Anonymous'} (<span class="score">${scoreText}</span> • ${timeText})`;
    } else {
      // Quando não há score, mostra número de replies se houver
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
    // Limita o texto para não ficar muito longo
    const truncatedText = cleanText.length > 300 ? 
      cleanText.substring(0, 300) + '...' : cleanText;
    
    text.textContent = truncatedText;
    
    commentElement.appendChild(meta);
    commentElement.appendChild(text);
    container.appendChild(commentElement);
  });
  
  return container;
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
    
    // Cria o badge com o número de comentários
    const badge = document.createElement('span');
    badge.className = 'hn-comment-badge';
    badge.textContent = commentCount;
    
    // Insere o badge
    link.parentNode.insertBefore(badge, link.nextSibling);
    
    // Busca e exibe os top comentários se houver
    if (commentCount > 0) {
      // Mostra indicador de carregamento
      const loadingElement = document.createElement('div');
      loadingElement.className = 'hn-comments-container';
      loadingElement.innerHTML = '<div class="hn-loading">Loading comments...</div>';
      link.parentNode.insertBefore(loadingElement, link.nextSibling.nextSibling);
      
      try {
        const topComments = await fetchTopComments(itemData);
        
        if (topComments.length === 0) {
          // Se não encontrou comentários válidos
          loadingElement.innerHTML = '<div class="hn-loading">No comments available or connection issues</div>';
        } else {
          // Busca o número de comentários válidos processados na função fetchTopComments
          const commentsElement = createCommentsElement(topComments, itemData.validCommentsCount || topComments.length);
          // Substitui o indicador de carregamento pelos comentários
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