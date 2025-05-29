# HN Comments Counter for The Old Reader

Esta extensão do Chrome adiciona automaticamente contadores de comentários aos links do Hacker News no The Old Reader, além de exibir os 3 melhores comentários de cada post.

## Funcionalidades Principais

✅ **Contador de comentários**: Mostra o número total de comentários ao lado dos links do HN
✅ **Top 3 comentários**: Exibe os 3 comentários com maior pontuação abaixo do contador
✅ **Detecção automática**: Funciona automaticamente ao carregar e navegar pela página
✅ **Monitoramento dinâmico**: Detecta novos posts carregados durante o scroll
✅ **Prevenção de duplicatas**: Evita processar o mesmo link múltiplas vezes

## Problemas Corrigidos

A extensão foi corrigida para resolver os seguintes problemas:

1. **Regex incorreta**: Corrigida a expressão regular para extrair IDs dos links do HN
2. **Permissões do manifest**: Atualizadas as permissões necessárias
3. **Timing de carregamento**: Melhorado o timing de execução do script
4. **Background script desnecessário**: Removido para simplificar a extensão
5. **Duplicação de badges**: Corrigido sistema de verificação para evitar badges duplicados
6. **Observer otimizado**: Melhor controle do observer para evitar execuções excessivas

## Como Funciona

### Contador de Comentários
- Busca o número total de comentários na API oficial do Hacker News
- Exibe um badge laranja com o número ao lado do link

### Top Comentários
- Analisa os primeiros 20 comentários do post
- Filtra comentários válidos (não deletados, com texto suficiente)
- Ordena por pontuação e mostra os 3 melhores
- Remove HTML e formata o texto para melhor legibilidade
- Limita o texto a 300 caracteres para manter a página organizada

## Instalação

1. Baixe ou clone este repositório
2. Abra o Chrome e vá para `chrome://extensions/`
3. Ative o "Modo do desenvolvedor" no canto superior direito
4. Clique em "Carregar extensão expandida"
5. Selecione a pasta desta extensão

## Como usar

1. Visite [The Old Reader](https://theoldreader.com)
2. A extensão funcionará automaticamente, adicionando:
   - Badges laranja com o número de comentários
   - Caixas com os 3 melhores comentários abaixo dos links
3. Os comentários mostram autor, pontuação e texto truncado

## Bookmarklet Alternativo

Se preferir usar um bookmarklet em vez da extensão, você pode:

1. Copiar o código do arquivo `bookmarklet.js`
2. Criar um novo bookmark no seu navegador
3. Colar o código como URL do bookmark
4. Clicar no bookmark quando estiver no The Old Reader

Ou simplesmente copiar e colar o código no console do navegador enquanto estiver no The Old Reader.

## Funcionalidades

- ✅ Detecta automaticamente links do Hacker News no The Old Reader
- ✅ Busca o número de comentários da API oficial do HN
- ✅ Adiciona badges visuais com o número de comentários
- ✅ **NOVO**: Exibe os 3 comentários com maior pontuação
- ✅ **NOVO**: Remove HTML e formata texto dos comentários
- ✅ **NOVO**: Mostra autor e pontuação de cada comentário
- ✅ Monitora novos posts carregados dinamicamente
- ✅ Evita duplicar badges em links já processados
- ✅ Indicador de carregamento para comentários

## Interface Visual

### Badge de Comentários
- Cor: Laranja (#ff6600) - cor oficial do Hacker News
- Tamanho: 11px, em negrito
- Posição: Ao lado direito do link

### Caixa de Comentários
- Fundo: Bege claro (#f6f6f0)
- Borda esquerda: Laranja para destacar
- Fonte: 12px para boa legibilidade
- Largura máxima: 600px para não quebrar o layout

### Cada Comentário Mostra:
- **Autor** e **pontuação** em negrito
- **Texto** limitado a 300 caracteres
- **Separação visual** entre comentários

## Troubleshooting

Se a extensão não estiver funcionando:

1. Verifique se você está no The Old Reader (theoldreader.com)
2. Abra o console do navegador (F12) e verifique se há erros
3. Certifique-se de que a extensão está ativada em `chrome://extensions/`
4. Tente recarregar a página
5. Verifique se há links do Hacker News na página atual

## Performance

A extensão foi otimizada para:
- **Requisições limitadas**: Máximo 20 comentários analisados por post
- **Debouncing**: Evita múltiplas execuções durante scroll rápido
- **Cache de processamento**: Links já processados não são reprocessados
- **Carregamento assíncrono**: Não bloqueia a interface durante o carregamento

## Desenvolvimento

Esta extensão usa:
- Manifest V3
- Content Scripts
- Fetch API para acessar a API do Hacker News
- MutationObserver para detectar conteúdo carregado dinamicamente
- Promise.all para carregar comentários em paralelo
- Regex para parsing de HTML básico

## Estrutura de arquivos

- `manifest.json`: Configuração da extensão
- `content.js`: Script principal que executa no theoldreader.com
- `bookmarklet.js`: Versão em bookmarklet do mesmo código
- `README.md`: Esta documentação
- `icons/`: Pasta com ícones da extensão (você precisa criar os ícones)

## Notas para desenvolvimento

Para os ícones, você precisa criar imagens nos tamanhos 16x16, 48x48 e 128x128 pixels com o tema laranja do Hacker News. Você pode usar ferramentas online de criação de ícones para isso.