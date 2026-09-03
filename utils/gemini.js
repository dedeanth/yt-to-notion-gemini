// utils/gemini.js
// Handles communication with Google Gemini API for video summarization and tag generation.

export async function summarizeVideoWithGemini({
  apiKey,
  model = 'gemini-2.5-flash',
  style = 'bullet_points',
  videoData
}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key is required. Please set it in the extension settings.');
  }

  const {
    title,
    channel,
    description,
    tags,
    transcript,
    hasTranscript
  } = videoData;

  const styleDescriptions = {
    bullet_points: 'A concise 2-sentence overview followed by 4-6 high-impact key takeaways in bullet points.',
    detailed: 'A comprehensive summary covering all core concepts, chapters, insights, and actionable advice.',
    concise: 'A brief executive summary (TL;DR) capturing the main point in 2-3 sentences and 3 brief takeaways.'
  };

  const selectedStyle = styleDescriptions[style] || styleDescriptions.bullet_points;

  const systemInstruction = `You are an expert AI video analyst and knowledge organizer.
Your task is to analyze YouTube videos and generate high-quality summaries and relevant categorization tags for saving to a Notion database.
Always write clearly, objectively, and highlight the most valuable insights.`;

  let contentText = `YouTube Video Details:
- Title: ${title || 'Untitled'}
- Channel/Creator: ${channel || 'Unknown'}
- Existing Keywords/Tags: ${(tags || []).join(', ')}
`;

  if (hasTranscript && transcript && transcript.trim().length > 50) {
    contentText += `\nFull Video Transcript:\n"""\n${transcript}\n"""\n`;
  } else {
    contentText += `\nNote: The video transcript was unavailable. Here is the video description provided by the creator:\n"""\n${description || 'No description provided.'}\n"""\n`;
  }

  contentText += `
Instructions:
1. Target Style: ${selectedStyle}
2. Extract 3 to 7 concise, high-value tags suitable for indexing in Notion (e.g. "AI", "Productivity", "Coding", "Tutorial", "Finance"). Use PascalCase or clean capitalized words, without commas or '#' symbols.
3. Respond ONLY in valid JSON matching this exact structure:
{
  "overview": "A clear, compelling summary of the video.",
  "key_takeaways": [
    "First core takeaway or insight",
    "Second core takeaway or insight",
    "Third core takeaway or insight",
    "Fourth core takeaway or insight"
  ],
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4"]
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: contentText }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || response.statusText;
    } catch (e) {
      errorDetail = response.statusText;
    }
    throw new Error(`Gemini API Error (${response.status}): ${errorDetail}`);
  }

  const result = await response.json();
  const rawOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawOutput) {
    throw new Error('No summary text returned by Gemini.');
  }

  try {
    // Strip possible markdown fences if returned
    const cleaned = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      overview: parsed.overview || 'Summary generated.',
      keyTakeaways: Array.isArray(parsed.key_takeaways) ? parsed.key_takeaways : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : (tags || [])
    };
  } catch (err) {
    console.warn('[Gemini] JSON parse fallback triggered:', err, rawOutput);
    return {
      overview: rawOutput.slice(0, 1000),
      keyTakeaways: [],
      tags: tags || []
    };
  }
}
