// Configurações padrão
const DEFAULT_SETTINGS = {
    maxComments: 3
};

// Carrega as configurações salvas
function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        document.getElementById('maxComments').value = settings.maxComments;
    });
}

// Salva as configurações
function saveSettings() {
    const maxComments = parseInt(document.getElementById('maxComments').value);
    
    // Validação
    if (isNaN(maxComments) || maxComments < 1 || maxComments > 10) {
        showStatus('Por favor, insira um número entre 1 e 10.', 'error');
        return;
    }
    
    const settings = {
        maxComments: maxComments
    };
    
    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showStatus('Erro ao salvar configurações: ' + chrome.runtime.lastError.message, 'error');
        } else {
            showStatus('Configurações salvas com sucesso!', 'success');
            // Notifica os content scripts sobre a mudança
            chrome.tabs.query({url: "*://theoldreader.com/*"}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'settingsChanged',
                        settings: settings
                    }, (response) => {
                        // Callback para tratar resposta ou erros
                        if (chrome.runtime.lastError) {
                            // Ignora erros se a aba não tem o content script
                            console.log('Tab does not have content script:', chrome.runtime.lastError.message);
                        }
                    });
                });
            });
        }
    });
}

// Mostra mensagem de status
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    // Remove a mensagem após 3 segundos
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('save').addEventListener('click', saveSettings);

// Salva quando pressiona Enter no campo
document.getElementById('maxComments').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveSettings();
    }
}); 