// Default settings
const DEFAULT_SETTINGS = {
  maxComments: 3
};

// Load saved settings
async function loadSettings() {
  try {
    const settings = await browserAPI.storage.sync.get(DEFAULT_SETTINGS);
    document.getElementById('maxComments').value = settings.maxComments;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings
async function saveSettings() {
  const maxComments = parseInt(document.getElementById('maxComments').value, 10);

  if (isNaN(maxComments) || maxComments < 0 || maxComments > 10) {
    showStatus('Please enter a number between 0 and 10.', 'error');
    return;
  }

  const settings = { maxComments };

  try {
    await browserAPI.storage.sync.set(settings);
    showStatus('Settings saved successfully!', 'success');

    // Notify content scripts about the change
    try {
      const tabs = await browserAPI.tabs.query({ url: "*://theoldreader.com/*" });
      for (const tab of tabs) {
        await browserAPI.tabs.sendMessage(tab.id, {
          type: 'settingsChanged',
          settings
        });
      }
    } catch (tabError) {
      // Non-fatal: tab might not have content script loaded
      console.log('Could not notify tabs:', tabError.message);
    }
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

// Show status message
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('save').addEventListener('click', saveSettings);

document.getElementById('maxComments').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveSettings();
});