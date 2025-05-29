# HN Comments Counter for The Old Reader

Esta extensão do Chrome adiciona automaticamente contadores de comentários aos links do Hacker News no The Old Reader.

## Problemas Corrigidos

A extensão foi corrigida para resolver os seguintes problemas:

1. **Regex incorreta**: Corrigida a expressão regular para extrair IDs dos links do HN
2. **Permissões do manifest**: Atualizadas as permissões necessárias
3. **Timing de carregamento**: Melhorado o timing de execução do script
4. **Background script desnecessário**: Removido para simplificar a extensão

## Instalação

1. Baixe ou clone este repositório
2. Abra o Chrome e vá para `chrome://extensions/`
3. Ative o "Modo do desenvolvedor" no canto superior direito
4. Clique em "Carregar extensão expandida"
5. Selecione a pasta desta extensão

## Como usar

1. Visite [The Old Reader](https://theoldreader.com)
2. A extensão funcionará automaticamente, adicionando badges com o número de comentários ao lado dos links do Hacker News
3. Os badges aparecem como números laranja ao lado dos links

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
- ✅ Monitora novos posts carregados dinamicamente
- ✅ Evita duplicar badges em links já processados

## Troubleshooting

Se a extensão não estiver funcionando:

1. Verifique se você está no The Old Reader (theoldreader.com)
2. Abra o console do navegador (F12) e verifique se há erros
3. Certifique-se de que a extensão está ativada em `chrome://extensions/`
4. Tente recarregar a página

## Desenvolvimento

Esta extensão usa:
- Manifest V3
- Content Scripts
- Fetch API para acessar a API do Hacker News
- MutationObserver para detectar conteúdo carregado dinamicamente

## Estrutura de arquivos

- `manifest.json`: Configuração da extensão
- `content.js`: Script principal que executa no theoldreader.com
- `background.js`: Service worker para manter a extensão ativa
- `icons/`: Pasta com ícones da extensão (você precisa criar os ícones)

## Notas para desenvolvimento

Para os ícones, você precisa criar imagens nos tamanhos 16x16, 48x48 e 128x128 pixels com o tema laranja do Hacker News. Você pode usar ferramentas online de criação de ícones para isso.