// utils/notion.js
// Handles communication with Notion REST API: database inspection and page creation.

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';

/**
 * Extracts clean 32-character or UUID database ID from a raw ID or full Notion URL.
 */
export function extractDatabaseId(rawInput) {
  if (!rawInput) return '';
  const trimmed = rawInput.trim();

  // If user pasted a full Notion URL
  // e.g. https://www.notion.so/workspace/3a8f5b8219504c5bb182f0c763e0258d?v=...
  // or https://notion.so/3a8f5b82-1950-4c5b-b182-f0c763e0258d
  const urlMatch = trimmed.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (urlMatch) {
    return urlMatch[1].replace(/-/g, '');
  }

  // Fallback: strip hyphens and spaces
  return trimmed.replace(/-/g, '').replace(/\s+/g, '');
}

/**
 * Validates credentials and fetches schema & property details for a Notion database.
 */
export async function fetchDatabaseSchema(notionToken, rawDatabaseId) {
  const cleanId = extractDatabaseId(rawDatabaseId);
  if (!notionToken || !notionToken.trim()) {
    throw new Error('Notion Integration Token is required.');
  }
  if (!cleanId || cleanId.length !== 32) {
    throw new Error('Invalid Notion Database ID. Expected a 32-character ID or database URL.');
  }

  const endpoint = `${NOTION_BASE_URL}/databases/${cleanId}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${notionToken.trim()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err.message || response.statusText;
    } catch (e) {
      detail = response.statusText;
    }
    if (response.status === 404) {
      throw new Error(`Database not found (404). Make sure you have shared/invited your integration to this database!`);
    } else if (response.status === 401) {
      throw new Error(`Unauthorized (401). Please verify your Notion Internal Integration Token.`);
    }
    throw new Error(`Notion API Error (${response.status}): ${detail}`);
  }

  const db = await response.json();

  let databaseTitle = 'Untitled Database';
  if (Array.isArray(db.title) && db.title.length > 0) {
    databaseTitle = db.title.map(t => t.plain_text || '').join('').trim() || 'Untitled Database';
  }

  const propertyList = [];
  let detectedTitle = null;
  let detectedUrl = null;
  let detectedTags = null;
  let detectedSummary = null;

  for (const [name, prop] of Object.entries(db.properties || {})) {
    propertyList.push({
      name,
      type: prop.type,
      id: prop.id
    });

    if (prop.type === 'title' && !detectedTitle) {
      detectedTitle = name;
    } else if (prop.type === 'url' && !detectedUrl) {
      detectedUrl = name;
    } else if ((prop.type === 'multi_select' || prop.type === 'select') && !detectedTags) {
      detectedTags = name;
    } else if (prop.type === 'rich_text' && !detectedSummary) {
      if (/summary|description|notes/i.test(name)) {
        detectedSummary = name;
      }
    }
  }

  return {
    databaseId: cleanId,
    databaseTitle,
    properties: propertyList,
    detectedMapping: {
      titleProp: detectedTitle,
      urlProp: detectedUrl,
      tagsProp: detectedTags,
      summaryProp: detectedSummary
    }
  };
}

/**
 * Splits long text strings into safe <= 2000 character Notion rich text objects.
 */
function chunkToRichText(str) {
  if (!str) return [];
  const MAX_CHUNK = 1950;
  const chunks = [];
  let remaining = str;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK) {
      chunks.push({
        type: 'text',
        text: { content: remaining }
      });
      break;
    }

    // Split at last space or punctuation before limit
    let splitIdx = remaining.lastIndexOf(' ', MAX_CHUNK);
    if (splitIdx < MAX_CHUNK / 2) {
      splitIdx = MAX_CHUNK;
    }

    chunks.push({
      type: 'text',
      text: { content: remaining.slice(0, splitIdx) }
    });
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/**
 * Creates a new page in the Notion database with properties and formatted blocks.
 */
export async function createNotionVideoPage({
  notionToken,
  databaseId,
  mapping,
  videoData,
  summaryData
}) {
  const cleanId = extractDatabaseId(databaseId);
  if (!notionToken) throw new Error('Notion token is missing.');
  if (!cleanId) throw new Error('Notion Database ID is missing.');

  const { titleProp, urlProp, tagsProp, summaryProp } = mapping || {};

  const propertiesPayload = {};

  // Title property
  if (titleProp) {
    propertiesPayload[titleProp] = {
      title: [
        {
          type: 'text',
          text: { content: (videoData.title || 'Untitled Video').slice(0, 2000) }
        }
      ]
    };
  }

  // URL property
  if (urlProp && videoData.videoUrl) {
    propertiesPayload[urlProp] = {
      url: videoData.videoUrl
    };
  }

  // Tags property (multi-select)
  if (tagsProp && summaryData.tags && summaryData.tags.length > 0) {
    // Notion tag names cannot contain commas and max 100 chars
    const formattedTags = summaryData.tags
      .map(t => String(t).replace(/,/g, '').trim())
      .filter(t => t.length > 0)
      .slice(0, 50)
      .map(t => ({ name: t.slice(0, 100) }));

    propertiesPayload[tagsProp] = {
      multi_select: formattedTags
    };
  }

  // Optional Rich Text summary property
  if (summaryProp && summaryData.overview) {
    propertiesPayload[summaryProp] = {
      rich_text: chunkToRichText(summaryData.overview)
    };
  }

  // Children blocks to build page content body
  const childrenBlocks = [];

  // 1. Header Callout with metadata
  childrenBlocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '📺' },
      rich_text: [
        {
          type: 'text',
          text: { content: `${videoData.channel ? `Channel: ${videoData.channel} • ` : ''}` }
        },
        {
          type: 'text',
          text: { content: 'Watch on YouTube', link: { url: videoData.videoUrl } }
        }
      ]
    }
  });

  // 2. Summary Overview Section
  childrenBlocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: '✨ Résumé & Vue d\'ensemble' } }]
    }
  });

  if (summaryData.overview) {
    childrenBlocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: chunkToRichText(summaryData.overview)
      }
    });
  }

  // 3. Detailed Thematic Sections (Chiffres clés, Analyse, Stratégie...)
  if (Array.isArray(summaryData.detailedBreakdown) && summaryData.detailedBreakdown.length > 0) {
    for (const section of summaryData.detailedBreakdown) {
      if (section.section_title) {
        childrenBlocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: chunkToRichText(section.section_title)
          }
        });
      }
      if (Array.isArray(section.points)) {
        for (const pt of section.points) {
          childrenBlocks.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: chunkToRichText(pt)
            }
          });
        }
      }
    }
  }

  // 4. Key Takeaways Section
  if (summaryData.keyTakeaways && summaryData.keyTakeaways.length > 0) {
    childrenBlocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '💡 Points Clés & Enjeux Stratégiques' } }]
      }
    });

    for (const item of summaryData.keyTakeaways) {
      childrenBlocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: chunkToRichText(item)
        }
      });
    }
  }

  // 4. Optional Collapsible Full Transcript toggle
  if (videoData.hasTranscript && videoData.transcript) {
    const transcriptParagraphs = [];
    // Chunk transcript into 1800 char blocks for Notion
    const tChunks = chunkToRichText(videoData.transcript).slice(0, 50); // limit to first 50 chunks if very long
    for (const chunk of tChunks) {
      transcriptParagraphs.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [chunk]
        }
      });
    }

    childrenBlocks.push({
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: '📝 Full Video Transcript' } }],
        children: transcriptParagraphs
      }
    });
  }

  const payload = {
    parent: { database_id: cleanId },
    icon: {
      type: 'external',
      external: {
        url: 'https://www.youtube.com/s/desktop/f17e06a3/img/favicon_144x144.png'
      }
    },
    properties: propertiesPayload,
    children: childrenBlocks.slice(0, 95) // Notion limit is 100 children per page creation
  };

  // Add cover if thumbnail available
  if (videoData.thumbnailUrl) {
    payload.cover = {
      type: 'external',
      external: { url: videoData.thumbnailUrl }
    };
  }

  const endpoint = `${NOTION_BASE_URL}/pages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken.trim()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err.message || response.statusText;
    } catch (e) {
      detail = response.statusText;
    }
    throw new Error(`Failed to create Notion page (${response.status}): ${detail}`);
  }

  const createdPage = await response.json();
  const pageUrl = createdPage.url || `https://www.notion.so/${createdPage.id.replace(/-/g, '')}`;

  return {
    success: true,
    pageId: createdPage.id,
    pageUrl
  };
}
