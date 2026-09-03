// background/service-worker.js
// Manifest V3 Background Service Worker

chrome.runtime.onInstalled.addListener(async (details) => {
  // Initialize default options if not already present
  const existing = await chrome.storage.local.get(['geminiModel', 'summaryStyle', 'mapping']);

  const defaults = {};
  if (!existing.geminiModel || existing.geminiModel === 'gemini-2.5-flash') defaults.geminiModel = 'gemini-3.6-flash';
  if (!existing.summaryStyle) defaults.summaryStyle = 'bullet_points';
  if (!existing.mapping) {
    defaults.mapping = {
      titleProp: 'Name',
      urlProp: 'URL',
      tagsProp: 'Tags',
      summaryProp: ''
    };
  }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }

  if (details.reason === 'install') {
    // Open options page on fresh install for easy setup
    chrome.runtime.openOptionsPage();
  }
});
