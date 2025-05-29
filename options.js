// Default settings
const DEFAULT_SETTINGS = {
    maxComments: 3
};

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        document.getElementById('maxComments').value = settings.maxComments;
    });
}

// Save settings
function saveSettings() {
    const maxComments = parseInt(document.getElementById('maxComments').value);
    
    // Validation
    if (isNaN(maxComments) || maxComments < 0 || maxComments > 10) {
        showStatus('Please enter a number between 0 and 10.', 'error');
        return;
    }
    
    const settings = {
        maxComments: maxComments
    };
    
    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showStatus('Error saving settings: ' + chrome.runtime.lastError.message, 'error');
        } else {
            showStatus('Settings saved successfully!', 'success');
            // Notify content scripts about the change
            chrome.tabs.query({url: "*://theoldreader.com/*"}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'settingsChanged',
                        settings: settings
                    }, (response) => {
                        // Callback to handle response or errors
                        if (chrome.runtime.lastError) {
                            // Ignore errors if tab doesn't have content script
                            console.log('Tab does not have content script:', chrome.runtime.lastError.message);
                        }
                    });
                });
            });
        }
    });
}

// Show status message
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    // Remove message after 3 seconds
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('save').addEventListener('click', saveSettings);

// Save when pressing Enter in field
document.getElementById('maxComments').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveSettings();
    }
}); 