// popup/popup.js
import { summarizeVideoWithGemini } from '../utils/gemini.js';
import { fetchDatabaseSchema, createNotionVideoPage, extractDatabaseId } from '../utils/notion.js';

// State variables
let currentTab = null;
let currentVideoData = null;
let currentSummaryData = null;
let currentTags = [];
let userConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-3.6-flash',
  summaryStyle: 'bullet_points',
  notionToken: '',
  notionDbId: '',
  notionDbTitle: '',
  mapping: {
    titleProp: 'Name',
    urlProp: 'URL',
    tagsProp: 'Tags',
    summaryProp: ''
  }
};

// DOM Elements
const tabBtnSaver = document.getElementById('tab-btn-saver');
const tabBtnSettings = document.getElementById('tab-btn-settings');
const viewSaver = document.getElementById('view-saver');
const viewSettings = document.getElementById('view-settings');

const globalAlert = document.getElementById('global-alert');
const alertIcon = document.getElementById('alert-icon');
const alertText = document.getElementById('alert-text');
const alertClose = document.getElementById('alert-close');

const configBanner = document.getElementById('config-banner');
const bannerSettingsBtn = document.getElementById('banner-settings-btn');
const notYtBanner = document.getElementById('not-yt-banner');

const videoCard = document.getElementById('video-card');
const videoThumbnail = document.getElementById('video-thumbnail');
const videoTitle = document.getElementById('video-title');
const videoChannel = document.getElementById('video-channel');
const transcriptBadge = document.getElementById('transcript-badge');

const aiActionBar = document.getElementById('ai-action-bar');
const generateSummaryBtn = document.getElementById('generate-summary-btn');
const generateBtnText = document.getElementById('generate-btn-text');

const loadingState = document.getElementById('loading-state');
const loadingText = document.getElementById('loading-text');

const reviewSection = document.getElementById('review-section');
const regenerateBtn = document.getElementById('regenerate-btn');
const summaryOverview = document.getElementById('summary-overview');
const summaryTakeaways = document.getElementById('summary-takeaways');
const tagsChipContainer = document.getElementById('tags-chip-container');
const newTagInput = document.getElementById('new-tag-input');
const addTagBtn = document.getElementById('add-tag-btn');
const targetDbName = document.getElementById('target-db-name');
const saveToNotionBtn = document.getElementById('save-to-notion-btn');
const saveBtnText = document.getElementById('save-btn-text');
const saveSuccessBox = document.getElementById('save-success-box');
const openNotionLink = document.getElementById('open-notion-link');

// Settings Elements
const inputGeminiKey = document.getElementById('gemini-api-key');
const selectGeminiModel = document.getElementById('gemini-model');
const selectSummaryStyle = document.getElementById('summary-style');
const inputNotionToken = document.getElementById('notion-token');
const inputNotionDbId = document.getElementById('notion-db-id');
const testNotionBtn = document.getElementById('test-notion-btn');
const notionStatus = document.getElementById('notion-status');
const selectMapTitle = document.getElementById('map-title');
const selectMapUrl = document.getElementById('map-url');
const selectMapTags = document.getElementById('map-tags');
const selectMapSummary = document.getElementById('map-summary');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// --- Helper Functions ---

function showAlert(message, type = 'info') {
  globalAlert.className = `alert ${type}`;
  alertIcon.textContent = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  alertText.textContent = message;
  globalAlert.classList.remove('hidden');
}

function hideAlert() {
  globalAlert.classList.add('hidden');
}

function switchTab(tab) {
  if (tab === 'saver') {
    tabBtnSaver.classList.add('active');
    tabBtnSettings.classList.remove('active');
    viewSaver.classList.add('active');
    viewSettings.classList.remove('active');
  } else {
    tabBtnSettings.classList.add('active');
    tabBtnSaver.classList.remove('active');
    viewSettings.classList.add('active');
    viewSaver.classList.remove('active');
  }
}

function renderTags() {
  tagsChipContainer.innerHTML = '';
  currentTags.forEach((tag, index) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove tag';
    removeBtn.addEventListener('click', () => {
      currentTags.splice(index, 1);
      renderTags();
    });

    chip.appendChild(removeBtn);
    tagsChipContainer.appendChild(chip);
  });
}

function addTag(tag) {
  const cleaned = tag.replace(/,/g, '').trim();
  if (cleaned && !currentTags.includes(cleaned)) {
    currentTags.push(cleaned);
    renderTags();
  }
}

// Populate property mapping dropdowns in settings
function populatePropertyDropdowns(properties, currentMapping = {}) {
  const populate = (selectEl, allowedTypes, selectedVal, allowEmpty = false) => {
    selectEl.innerHTML = '';
    if (allowEmpty) {
      const optNone = document.createElement('option');
      optNone.value = '';
      optNone.textContent = '(None - use page body only)';
      selectEl.appendChild(optNone);
    }
    properties
      .filter(p => allowedTypes.includes(p.type))
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = `${p.name} (${p.type})`;
        if (p.name === selectedVal) opt.selected = true;
        selectEl.appendChild(opt);
      });
  };

  populate(selectMapTitle, ['title'], currentMapping.titleProp || 'Name');
  populate(selectMapUrl, ['url'], currentMapping.urlProp || 'URL');
  populate(selectMapTags, ['multi_select', 'select'], currentMapping.tagsProp || 'Tags');
  populate(selectMapSummary, ['rich_text'], currentMapping.summaryProp || '', true);
}

// --- Video Data Extraction ---

async function loadActiveVideo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (!tab || !tab.url || !tab.url.includes('youtube.com/watch') && !tab.url.includes('youtube.com/shorts')) {
    notYtBanner.classList.remove('hidden');
    videoCard.classList.add('hidden');
    aiActionBar.classList.add('hidden');
    return;
  }

  notYtBanner.classList.add('hidden');

  let response = null;
  try {
    // Send message to content script
    response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_YOUTUBE_DATA' });
  } catch (err) {
    // Content script might not be injected yet (e.g. extension reloaded). Inject manually!
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/main-world.js'],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      });
      response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_YOUTUBE_DATA' });
    } catch (injectErr) {
      console.error('Failed to extract video data:', injectErr);
      showAlert('Could not connect to YouTube page. Please refresh the YouTube tab.', 'error');
      return;
    }
  }

  if (response && response.success && response.data) {
    currentVideoData = response.data;
    displayVideoPreview(currentVideoData);
  } else {
    showAlert(response?.error || 'Failed to extract video data.', 'error');
  }
}

function displayVideoPreview(video) {
  videoTitle.textContent = video.title || 'Untitled YouTube Video';
  videoChannel.textContent = video.channel || 'YouTube';
  videoThumbnail.src = video.thumbnailUrl;

  if (video.hasTranscript) {
    transcriptBadge.textContent = 'Transcript Ready';
    transcriptBadge.style.color = '#10b981';
  } else {
    transcriptBadge.textContent = 'Description Only';
    transcriptBadge.style.color = '#f59e0b';
  }

  videoCard.classList.remove('hidden');

  // Check if API keys are configured
  if (!userConfig.geminiApiKey || !userConfig.notionToken || !userConfig.notionDbId) {
    configBanner.classList.remove('hidden');
    aiActionBar.classList.add('hidden');
  } else {
    configBanner.classList.add('hidden');
    aiActionBar.classList.remove('hidden');
    targetDbName.textContent = userConfig.notionDbTitle || 'Connected Database';
  }
}

// --- Gemini AI Summarization ---

async function handleGenerateSummary() {
  if (!userConfig.geminiApiKey) {
    showAlert('Please configure your Gemini API Key in Settings.', 'error');
    switchTab('settings');
    return;
  }

  hideAlert();
  aiActionBar.classList.add('hidden');
  reviewSection.classList.add('hidden');
  loadingState.classList.remove('hidden');
  loadingText.textContent = currentVideoData.hasTranscript
    ? 'Reading full transcript & synthesizing with Gemini...'
    : 'Synthesizing video metadata & description with Gemini...';

  try {
    const summary = await summarizeVideoWithGemini({
      apiKey: userConfig.geminiApiKey,
      model: userConfig.geminiModel,
      style: userConfig.summaryStyle,
      videoData: currentVideoData
    });

    currentSummaryData = summary;

    // Populate review section with structured breakdown and numbers
    summaryOverview.value = summary.overview || '';

    let formattedSections = '';
    if (Array.isArray(summary.detailedBreakdown) && summary.detailedBreakdown.length > 0) {
      formattedSections = summary.detailedBreakdown.map(sec => {
        const heading = sec.section_title ? `📌 ${sec.section_title}\n` : '';
        const pts = (sec.points || []).map(p => `• ${p}`).join('\n');
        return `${heading}${pts}`;
      }).join('\n\n');
    }

    if (Array.isArray(summary.keyTakeaways) && summary.keyTakeaways.length > 0) {
      if (formattedSections) formattedSections += '\n\n💡 Synthèse des Enjeux :\n';
      formattedSections += summary.keyTakeaways.map(k => `• ${k}`).join('\n');
    }

    summaryTakeaways.value = formattedSections || (summary.keyTakeaways || []).map(k => `• ${k}`).join('\n');

    currentTags = [...(summary.tags || [])];
    renderTags();

    loadingState.classList.add('hidden');
    reviewSection.classList.remove('hidden');
    saveSuccessBox.classList.add('hidden');
  } catch (err) {
    loadingState.classList.add('hidden');
    aiActionBar.classList.remove('hidden');
    showAlert(err.message, 'error');
  }
}

// --- Notion Saving ---

async function handleSaveToNotion() {
  if (!userConfig.notionToken || !userConfig.notionDbId) {
    showAlert('Please configure your Notion token and Database ID in Settings.', 'error');
    switchTab('settings');
    return;
  }

  saveToNotionBtn.disabled = true;
  saveBtnText.textContent = 'Saving to Notion...';
  hideAlert();

  // Parse takeaways lines from textarea
  const takeawaysList = summaryTakeaways.value
    .split('\n')
    .map(line => line.replace(/^[•\-\*\d\.]+\s*/, '').trim())
    .filter(line => line.length > 0);

  const finalSummaryData = {
    overview: summaryOverview.value.trim(),
    detailedBreakdown: currentSummaryData?.detailedBreakdown || [],
    keyTakeaways: takeawaysList,
    tags: currentTags
  };

  try {
    const result = await createNotionVideoPage({
      notionToken: userConfig.notionToken,
      databaseId: userConfig.notionDbId,
      mapping: userConfig.mapping,
      videoData: currentVideoData,
      summaryData: finalSummaryData
    });

    saveBtnText.textContent = 'Saved!';
    saveSuccessBox.classList.remove('hidden');
    openNotionLink.href = result.pageUrl;
    showAlert('Saved to Notion successfully!', 'success');
  } catch (err) {
    saveBtnText.textContent = 'Save to Notion';
    saveToNotionBtn.disabled = false;
    showAlert(err.message, 'error');
  }
}

// --- Settings Handling ---

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiModel',
    'summaryStyle',
    'notionToken',
    'notionDbId',
    'notionDbTitle',
    'mapping'
  ]);

  if (stored.geminiApiKey) userConfig.geminiApiKey = stored.geminiApiKey;
  if (stored.geminiModel) {
    userConfig.geminiModel = stored.geminiModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : stored.geminiModel;
    if (stored.geminiModel === 'gemini-2.5-flash') {
      await chrome.storage.local.set({ geminiModel: 'gemini-3.6-flash' });
    }
  } else {
    userConfig.geminiModel = 'gemini-3.6-flash';
  }
  if (stored.summaryStyle) userConfig.summaryStyle = stored.summaryStyle;
  if (stored.notionToken) userConfig.notionToken = stored.notionToken;
  if (stored.notionDbId) userConfig.notionDbId = stored.notionDbId;
  if (stored.notionDbTitle) userConfig.notionDbTitle = stored.notionDbTitle;
  if (stored.mapping) userConfig.mapping = { ...userConfig.mapping, ...stored.mapping };

  // Fill form inputs
  inputGeminiKey.value = userConfig.geminiApiKey || '';
  selectGeminiModel.value = userConfig.geminiModel || 'gemini-3.6-flash';
  selectSummaryStyle.value = userConfig.summaryStyle || 'bullet_points';
  inputNotionToken.value = userConfig.notionToken || '';
  inputNotionDbId.value = userConfig.notionDbId || '';

  if (userConfig.notionDbTitle) {
    targetDbName.textContent = userConfig.notionDbTitle;
  }
}

async function handleTestNotionConnection() {
  const token = inputNotionToken.value.trim();
  const dbId = inputNotionDbId.value.trim();

  if (!token || !dbId) {
    notionStatus.className = 'test-status error';
    notionStatus.textContent = 'Please enter both Notion Token and Database ID / URL.';
    notionStatus.classList.remove('hidden');
    return;
  }

  testNotionBtn.disabled = true;
  notionStatus.className = 'test-status info';
  notionStatus.textContent = 'Testing connection & fetching schema...';
  notionStatus.classList.remove('hidden');

  try {
    const schema = await fetchDatabaseSchema(token, dbId);
    userConfig.notionDbTitle = schema.databaseTitle;
    userConfig.notionDbId = schema.databaseId;

    populatePropertyDropdowns(schema.properties, schema.detectedMapping);

    notionStatus.className = 'test-status success';
    notionStatus.textContent = `Connected to "${schema.databaseTitle}"! Detected ${schema.properties.length} properties.`;
  } catch (err) {
    notionStatus.className = 'test-status error';
    notionStatus.textContent = err.message;
  } finally {
    testNotionBtn.disabled = false;
  }
}

async function handleSaveSettings() {
  userConfig.geminiApiKey = inputGeminiKey.value.trim();
  userConfig.geminiModel = selectGeminiModel.value;
  userConfig.summaryStyle = selectSummaryStyle.value;
  userConfig.notionToken = inputNotionToken.value.trim();
  userConfig.notionDbId = extractDatabaseId(inputNotionDbId.value.trim());

  userConfig.mapping = {
    titleProp: selectMapTitle.value || 'Name',
    urlProp: selectMapUrl.value || 'URL',
    tagsProp: selectMapTags.value || 'Tags',
    summaryProp: selectMapSummary.value || ''
  };

  await chrome.storage.local.set({
    geminiApiKey: userConfig.geminiApiKey,
    geminiModel: userConfig.geminiModel,
    summaryStyle: userConfig.summaryStyle,
    notionToken: userConfig.notionToken,
    notionDbId: userConfig.notionDbId,
    notionDbTitle: userConfig.notionDbTitle,
    mapping: userConfig.mapping
  });

  showAlert('Settings saved successfully!', 'success');

  // Update target DB badge
  if (userConfig.notionDbTitle) {
    targetDbName.textContent = userConfig.notionDbTitle;
  }

  // If video is loaded and keys are now set, show action bar
  if (currentVideoData && userConfig.geminiApiKey && userConfig.notionToken && userConfig.notionDbId) {
    configBanner.classList.add('hidden');
    aiActionBar.classList.remove('hidden');
  }

  setTimeout(() => {
    switchTab('saver');
  }, 700);
}

// --- Event Listeners ---

tabBtnSaver.addEventListener('click', () => switchTab('saver'));
tabBtnSettings.addEventListener('click', () => switchTab('settings'));
bannerSettingsBtn.addEventListener('click', () => switchTab('settings'));
alertClose.addEventListener('click', hideAlert);

generateSummaryBtn.addEventListener('click', handleGenerateSummary);
regenerateBtn.addEventListener('click', handleGenerateSummary);
saveToNotionBtn.addEventListener('click', handleSaveToNotion);

testNotionBtn.addEventListener('click', handleTestNotionConnection);
saveSettingsBtn.addEventListener('click', handleSaveSettings);

addTagBtn.addEventListener('click', () => {
  addTag(newTagInput.value);
  newTagInput.value = '';
});

newTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTag(newTagInput.value);
    newTagInput.value = '';
  }
});

// Initialize on popup open
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadActiveVideo();
});
