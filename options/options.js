// options/options.js
import { fetchDatabaseSchema, extractDatabaseId } from '../utils/notion.js';

const inputGeminiKey = document.getElementById('gemini-api-key');
const selectGeminiModel = document.getElementById('gemini-model');
const selectSummaryStyle = document.getElementById('summary-style');

const inputNotionToken = document.getElementById('notion-token');
const inputNotionDbId = document.getElementById('notion-db-id');
const testBtn = document.getElementById('test-connection-btn');
const connectionResult = document.getElementById('connection-result');

const mapTitle = document.getElementById('map-title');
const mapUrl = document.getElementById('map-url');
const mapTags = document.getElementById('map-tags');
const mapSummary = document.getElementById('map-summary');

const saveBtn = document.getElementById('save-btn');
const statusToast = document.getElementById('status-toast');

let currentDbTitle = '';

function showToast(message, type = 'success') {
  statusToast.className = `toast ${type}`;
  statusToast.textContent = message;
  statusToast.classList.remove('hidden');
  setTimeout(() => {
    statusToast.classList.add('hidden');
  }, 3500);
}

function populateDropdowns(properties, currentMapping = {}) {
  const fill = (el, types, selected, allowEmpty = false) => {
    el.innerHTML = '';
    if (allowEmpty) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Save in Page Body only)';
      el.appendChild(opt);
    }
    properties
      .filter(p => types.includes(p.type))
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = `${p.name} (${p.type})`;
        if (p.name === selected) opt.selected = true;
        el.appendChild(opt);
      });
  };

  fill(mapTitle, ['title'], currentMapping.titleProp || 'Name');
  fill(mapUrl, ['url'], currentMapping.urlProp || 'URL');
  fill(mapTags, ['multi_select', 'select'], currentMapping.tagsProp || 'Tags');
  fill(mapSummary, ['rich_text'], currentMapping.summaryProp || '', true);
}

async function loadSavedSettings() {
  const data = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiModel',
    'summaryStyle',
    'notionToken',
    'notionDbId',
    'notionDbTitle',
    'mapping'
  ]);

  if (data.geminiApiKey) inputGeminiKey.value = data.geminiApiKey;
  if (data.geminiModel) selectGeminiModel.value = data.geminiModel;
  if (data.summaryStyle) selectSummaryStyle.value = data.summaryStyle;
  if (data.notionToken) inputNotionToken.value = data.notionToken;
  if (data.notionDbId) inputNotionDbId.value = data.notionDbId;
  if (data.notionDbTitle) currentDbTitle = data.notionDbTitle;

  if (data.notionToken && data.notionDbId) {
    // Optionally auto-fetch schema
    try {
      const schema = await fetchDatabaseSchema(data.notionToken, data.notionDbId);
      populateDropdowns(schema.properties, data.mapping || {});
    } catch (e) {
      // ignore silent background fail
    }
  }
}

async function handleTest() {
  const token = inputNotionToken.value.trim();
  const rawDbId = inputNotionDbId.value.trim();

  if (!token || !rawDbId) {
    connectionResult.className = 'connection-status error';
    connectionResult.textContent = 'Please provide both the Notion Token and Database ID or URL.';
    connectionResult.classList.remove('hidden');
    return;
  }

  testBtn.disabled = true;
  connectionResult.className = 'connection-status info';
  connectionResult.textContent = 'Testing connection and inspecting database properties...';
  connectionResult.classList.remove('hidden');

  try {
    const schema = await fetchDatabaseSchema(token, rawDbId);
    currentDbTitle = schema.databaseTitle;
    populateDropdowns(schema.properties, schema.detectedMapping);

    connectionResult.className = 'connection-status success';
    connectionResult.textContent = `Connected successfully to "${schema.databaseTitle}"! Identified ${schema.properties.length} properties.`;
  } catch (err) {
    connectionResult.className = 'connection-status error';
    connectionResult.textContent = err.message;
  } finally {
    testBtn.disabled = false;
  }
}

async function handleSave() {
  const geminiApiKey = inputGeminiKey.value.trim();
  const geminiModel = selectGeminiModel.value;
  const summaryStyle = selectSummaryStyle.value;

  const notionToken = inputNotionToken.value.trim();
  const rawDbId = inputNotionDbId.value.trim();
  const notionDbId = extractDatabaseId(rawDbId);

  const mapping = {
    titleProp: mapTitle.value || 'Name',
    urlProp: mapUrl.value || 'URL',
    tagsProp: mapTags.value || 'Tags',
    summaryProp: mapSummary.value || ''
  };

  await chrome.storage.local.set({
    geminiApiKey,
    geminiModel,
    summaryStyle,
    notionToken,
    notionDbId,
    notionDbTitle: currentDbTitle,
    mapping
  });

  showToast('All settings saved successfully!', 'success');
}

testBtn.addEventListener('click', handleTest);
saveBtn.addEventListener('click', handleSave);
document.addEventListener('DOMContentLoaded', loadSavedSettings);
