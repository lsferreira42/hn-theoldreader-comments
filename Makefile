.PHONY: all chrome firefox clean

SHARED_FILES = browser-polyfill.js content.js options.js options.html background.js
ICON_DIR = icons
DIST_DIR = dist

all: chrome firefox

chrome: clean-chrome
	@echo "📦 Building Chrome extension..."
	@mkdir -p $(DIST_DIR)/chrome/icons
	@cp manifest.json $(DIST_DIR)/chrome/manifest.json
	@for f in $(SHARED_FILES); do cp $$f $(DIST_DIR)/chrome/; done
	@cp $(ICON_DIR)/* $(DIST_DIR)/chrome/icons/
	@cd $(DIST_DIR)/chrome && zip -r ../hn-comments-chrome.zip . -x '.*'
	@echo "✅ Chrome build: $(DIST_DIR)/hn-comments-chrome.zip"

firefox: clean-firefox
	@echo "📦 Building Firefox extension..."
	@mkdir -p $(DIST_DIR)/firefox/icons
	@cp manifest.firefox.json $(DIST_DIR)/firefox/manifest.json
	@for f in $(SHARED_FILES); do cp $$f $(DIST_DIR)/firefox/; done
	@cp $(ICON_DIR)/* $(DIST_DIR)/firefox/icons/
	@cd $(DIST_DIR)/firefox && zip -r ../hn-comments-firefox.zip . -x '.*'
	@echo "✅ Firefox build: $(DIST_DIR)/hn-comments-firefox.zip"

clean: clean-chrome clean-firefox
	@rm -rf $(DIST_DIR)
	@echo "🧹 Cleaned dist/"

clean-chrome:
	@rm -rf $(DIST_DIR)/chrome $(DIST_DIR)/hn-comments-chrome.zip

clean-firefox:
	@rm -rf $(DIST_DIR)/firefox $(DIST_DIR)/hn-comments-firefox.zip
