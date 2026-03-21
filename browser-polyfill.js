// Lightweight browser API polyfill for Chrome/Firefox compatibility
// Firefox uses `browser.*` (Promise-based), Chrome uses `chrome.*` (callback-based)
const browserAPI = (() => {
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) {
    // Firefox: native Promise-based API
    return browser;
  }

  // Chrome: wrap callback APIs into Promise-based equivalents
  const api = {
    storage: {
      sync: {
        get: (defaults) => new Promise((resolve, reject) => {
          chrome.storage.sync.get(defaults, (result) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(result);
          });
        }),
        set: (items) => new Promise((resolve, reject) => {
          chrome.storage.sync.set(items, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        })
      }
    },
    runtime: {
      onMessage: chrome.runtime.onMessage,
      lastError: null,
      get id() { return chrome.runtime.id; }
    },
    tabs: {
      query: (queryInfo) => new Promise((resolve, reject) => {
        chrome.tabs.query(queryInfo, (tabs) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(tabs);
        });
      }),
      sendMessage: (tabId, message) => new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            // Ignore "receiving end does not exist" errors — tab may not have content script
            console.log('Tab message error (non-fatal):', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      })
    }
  };

  return api;
})();
