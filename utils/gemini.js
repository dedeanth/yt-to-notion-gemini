// utils/gemini.js
// Handles communication with Google Gemini API for high-depth video analysis,
// factual extraction (numbers, multiples, timestamps), and tag generation.

export async function summarizeVideoWithGemini({
  apiKey,
  model = 'gemini-3.6-flash',
  style = 'detailed',
  videoData
}) {
  let targetModel = (model || 'gemini-3.6-flash').trim();
  if (targetModel === 'gemini-2.5-flash') {
    targetModel = 'gemini-3.6-flash';
  }

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key is required. Please set it in the extension settings.');
  }

  const {
    title,
    channel,
    description,
    tags,
    transcript,
    hasTranscript,
    videoUrl
  } = videoData;

  const systemInstruction = `Tu es un analyste expert de haut niveau spécialisé dans la synthèse vidéo stratégique, financière et technologique.
Ton objectif est de produire une analyse extrêmement riche, précise, factuelle et structurée, équivalente à une note exécutive de cabinet d'analyse.

RÈGLES IMPÉRATIVES ABSOLUES :
1. LANGUE : Réponds TOUJOURS dans la langue principale de la vidéo (ex: si la vidéo est en français, tout le résumé, les sections, les chiffres et les tags DOIVENT être en français). Ne traduis JAMAIS une vidéo francophone en anglais.
2. DONNÉES CHIFFRÉES ET FAITS PRÉCIS : Tu DOIS obligatoirement extraire tous les chiffres clés mentionnés : montants d'acquisition/financement, valorisations, multiples de revenus, chiffre d'affaires (ARR), volumes de tokens ou d'utilisateurs, effectifs de l'équipe, pourcentages, dates et noms propres. Ne résume JAMAIS par des phrases vagues quand des chiffres précis sont donnés.
3. HORODATAGES (TIMESTAMPS) : Indique impérativement les horodatages précis du type [MM:SS] (ex: [03:02], [04:14]) pour chaque chiffre clé, annonce majeure et changement de thématique.
4. STRUCTURE ANALYTIQUE EN SECTIONS : Découpe l'analyse en sections thématiques numérotées claires (ex: "1. Les chiffres clés de l'opération", "2. Analyse du produit / service", "3. Logique stratégique et impact", etc.).`;

  let userPrompt = `Analyse cette vidéo YouTube :
- Titre : ${title || 'Sans titre'}
- Chaîne / Créateur : ${channel || 'Inconnu'}
- Mots-clés initiaux : ${(tags || []).join(', ')}
`;

  if (hasTranscript && transcript && transcript.trim().length > 50) {
    userPrompt += `\nTranscription intégrale avec horodatages :\n"""\n${transcript}\n"""\n`;
  } else {
    userPrompt += `\nDescription de la vidéo :\n"""\n${description || ''}\n"""\n`;
  }

  userPrompt += `
INSTRUCTIONS DE RESTITUTION :
Fournis une réponse UNIQUEMENT au format JSON valide respectant rigoureusement ce schéma :
{
  "overview": "Paragraphe de synthèse complet présentant le sujet, le contexte, l'enjeu central et la conclusion principale.",
  "detailed_breakdown": [
    {
      "section_title": "1. Les chiffres clés de l'opération (ou titre de section pertinent)",
      "points": [
        "Montant de l'acquisition / valorisation : Chiffre précis ([MM:SS]) avec détail des sources citées.",
        "Multiples financiers : Détail du multiple de revenu et chiffre d'affaires ([MM:SS]).",
        "Dynamique de croissance : Évolution récente et valorisation précédente ([MM:SS]).",
        "Métriques clés : Nombre de personnes dans l'équipe, volume d'activité/tokens, modèles gérés ([MM:SS])."
      ]
    },
    {
      "section_title": "2. Définition et fonctionnement (ou titre de section pertinent)",
      "points": [
        "Point d'analyse concret avec métaphores ou explications des intervenants ([MM:SS]).",
        "Détail technique ou fonctionnel essentiel ([MM:SS])."
      ]
    },
    {
      "section_title": "3. Logique stratégique et implications (ou titre de section pertinent)",
      "points": [
        "Positionnement stratégique et impact sur l'écosystème ([MM:SS]).",
        "Synergies avec les précédents rachats ou perspectives futures (IPO, marché) ([MM:SS])."
      ]
    }
  ],
  "key_takeaways": [
    "Synthèse percutante du point 1 avec chiffre clé ([MM:SS])",
    "Synthèse percutante du point 2 avec chiffre clé ([MM:SS])",
    "Synthèse percutante du point 3 avec chiffre clé ([MM:SS])",
    "Synthèse percutante du point 4 avec chiffre clé ([MM:SS])",
    "Synthèse percutante du point 5 avec chiffre clé ([MM:SS])"
  ],
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"]
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  // Helper to execute request
  async function callGemini(parts) {
    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts
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

    return await response.json();
  }

  let result = null;

  // Attempt 1: If YouTube video URL is available, use native multimodal video input via fileData
  if (videoUrl && (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/'))) {
    try {
      const partsWithVideo = [
        {
          fileData: {
            fileUri: videoUrl
          }
        },
        {
          text: userPrompt
        }
      ];
      result = await callGemini(partsWithVideo);
    } catch (err) {
      console.warn('[Gemini] Native YouTube video input failed or was restricted, falling back to text prompt:', err);
      result = null;
    }
  }

  // Attempt 2: Text-only prompt with transcript or metadata
  if (!result) {
    result = await callGemini([{ text: userPrompt }]);
  }

  const rawOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawOutput) {
    throw new Error('No summary text returned by Gemini.');
  }

  try {
    const cleaned = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      overview: parsed.overview || 'Résumé généré.',
      detailedBreakdown: Array.isArray(parsed.detailed_breakdown) ? parsed.detailed_breakdown : [],
      keyTakeaways: Array.isArray(parsed.key_takeaways) ? parsed.key_takeaways : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : (tags || [])
    };
  } catch (err) {
    console.warn('[Gemini] JSON parse fallback triggered:', err, rawOutput);
    return {
      overview: rawOutput.slice(0, 1500),
      detailedBreakdown: [],
      keyTakeaways: [],
      tags: tags || []
    };
  }
}
