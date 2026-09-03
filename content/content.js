// content/content.js
// Runs in the isolated content script world for YouTube pages.
// Extracts video metadata and captures captions/transcripts.

(function () {
  'use strict';

  function getVideoId() {
    const url = new URL(window.location.href);
    if (url.hostname.includes('youtube.com')) {
      if (url.searchParams.has('v')) {
        return url.searchParams.get('v');
      }
      const match = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    return null;
  }

  function getMetadata() {
    const videoId = getVideoId();
    if (!videoId) return null;

    // Title extraction with fallbacks
    let title = '';
    const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
                    document.querySelector('h1.ytd-watch-metadata') ||
                    document.querySelector('h1.title yt-formatted-string');
    if (titleEl && titleEl.textContent.trim()) {
      title = titleEl.textContent.trim();
    } else {
      const metaTitle = document.querySelector('meta[name="title"]');
      if (metaTitle && metaTitle.content) {
        title = metaTitle.content.trim();
      } else {
        title = document.title.replace(/ - YouTube$/, '').trim();
      }
    }

    // Channel extraction with fallbacks
    let channel = '';
    const channelEl = document.querySelector('ytd-channel-name yt-formatted-string a') ||
                      document.querySelector('#owner #channel-name a') ||
                      document.querySelector('ytd-video-owner-renderer #channel-name a');
    if (channelEl && channelEl.textContent.trim()) {
      channel = channelEl.textContent.trim();
    } else {
      const metaChannel = document.querySelector('link[itemprop="name"]');
      if (metaChannel && metaChannel.content) {
        channel = metaChannel.content.trim();
      }
    }

    // Description extraction
    let description = '';
    const descEl = document.querySelector('#description-inline-expander yt-attributed-string') ||
                   document.querySelector('#description-text') ||
                   document.querySelector('#description .ytd-video-secondary-info-renderer');
    if (descEl && descEl.textContent.trim()) {
      description = descEl.textContent.trim();
    } else {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && metaDesc.content) {
        description = metaDesc.content.trim();
      }
    }

    // Keywords / Tags from meta & description hashtags
    const rawKeywords = document.querySelector('meta[name="keywords"]')?.content || '';
    const tagSet = new Set(
      rawKeywords
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0 && !t.toLowerCase().includes('video') && !t.toLowerCase().includes('sharing'))
    );

    // Extract hashtags like #AI #Tech from description or title
    const hashtagRegex = /#([a-zA-Z0-9_\u00C0-\u017F]+)/g;
    let match;
    while ((match = hashtagRegex.exec(title + ' ' + description)) !== null) {
      tagSet.add(match[1]);
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      videoId,
      videoUrl,
      title,
      channel,
      description: description.slice(0, 4000), // Cap description size
      thumbnailUrl,
      tags: Array.from(tagSet).slice(0, 15)
    };
  }

  // Request player response from main-world.js via CustomEvent
  function requestPlayerResponseFromMainWorld() {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        window.removeEventListener('YOUTUBE_EXTENSION_PLAYER_RESPONSE_RESULT', handler);
        resolve(null);
      }, 500);

      function handler(event) {
        if (event.detail?.requestId === requestId) {
          clearTimeout(timeout);
          window.removeEventListener('YOUTUBE_EXTENSION_PLAYER_RESPONSE_RESULT', handler);
          resolve(event.detail.playerResponse);
        }
      }

      window.addEventListener('YOUTUBE_EXTENSION_PLAYER_RESPONSE_RESULT', handler);
      window.dispatchEvent(
        new CustomEvent('YOUTUBE_EXTENSION_GET_PLAYER_RESPONSE', {
          detail: { requestId }
        })
      );
    });
  }

  // Fetch and parse captions into readable text
  async function fetchTranscript(captionTracks) {
    if (!captionTracks || !captionTracks.length) return null;

    // Prioritize English or user language track, or take first
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    let track = captionTracks.find(t => t.languageCode?.toLowerCase() === lang) ||
                captionTracks.find(t => t.languageCode?.toLowerCase().startsWith('en')) ||
                captionTracks[0];

    if (!track?.baseUrl) return null;

    // Try JSON3 format first
    try {
      const jsonUrl = track.baseUrl.includes('fmt=')
        ? track.baseUrl
        : track.baseUrl + '&fmt=json3';
      const res = await fetch(jsonUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events)) {
          const text = data.events
            .filter(e => e.segs && Array.isArray(e.segs))
            .map(e => e.segs.map(s => s.utf8 || '').join(''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length > 20) return text;
        }
      }
    } catch (e) {
      // Fall through to XML format
    }

    // Try XML format
    try {
      const res = await fetch(track.baseUrl);
      if (res.ok) {
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const nodes = Array.from(xmlDoc.getElementsByTagName('text'));
        const text = nodes
          .map(n => n.textContent || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 20) return text;
      }
    } catch (e) {
      console.warn('[YT-Notion] Failed to fetch caption XML:', e);
    }

    return null;
  }

  // Fetch page HTML fallback if player response was not accessible
  async function fetchCaptionsViaPageHtmlFallback() {
    try {
      const res = await fetch(window.location.href);
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (match && match[1]) {
        const captionTracks = JSON.parse(match[1]);
        return await fetchTranscript(captionTracks);
      }
    } catch (e) {
      console.warn('[YT-Notion] Captions fallback failed:', e);
    }
    return null;
  }

  // Full extraction handler
  async function extractAllVideoData() {
    const meta = getMetadata();
    if (!meta) {
      return { success: false, error: 'Not a YouTube video page or video ID not found.' };
    }

    let transcript = null;
    let hasTranscript = false;

    try {
      const playerResponse = await requestPlayerResponseFromMainWorld();
      const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (captionTracks && captionTracks.length > 0) {
        transcript = await fetchTranscript(captionTracks);
      }

      // If main world failed to give transcript, try page HTML fallback
      if (!transcript) {
        transcript = await fetchCaptionsViaPageHtmlFallback();
      }

      if (transcript && transcript.length > 30) {
        hasTranscript = true;
      }
    } catch (err) {
      console.warn('[YT-Notion] Caption extraction error:', err);
    }

    return {
      success: true,
      data: {
        ...meta,
        hasTranscript,
        transcript: transcript ? transcript.slice(0, 150000) : '' // Handle up to ~150k chars
      }
    };
  }

  // Listen for messages from extension popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'EXTRACT_YOUTUBE_DATA') {
      (async () => {
        try {
          const result = await extractAllVideoData();
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // Keep message channel open for async response
    }
  });
})();
