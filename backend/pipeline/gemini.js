'use strict';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

/**
 * Summarizes a batch of papers using Gemini.
 * Expects an array of papers with `title` and `abstract`.
 * Returns an array of { catchyTitle, summary }.
 */
async function summarizeBatch(papers, apiKey, maxRetries = 3) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const prompt = `For each paper below, produce:
1. catchyTitle: A short, engaging rewrite of the title (max 15 words)
2. summary: 2-3 sentence summary of the abstract (max 50 words)

${papers.map((p, i) => `Paper ${i + 1}:\nTitle: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n')}

Return the result as a JSON array of objects with keys "catchyTitle" and "summary", matching the order of the provided papers. Do not include markdown formatting or backticks around the JSON.`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
    }
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 503 || res.status === 429) {
          if (attempt < maxRetries) {
             console.log(`[Gemini] Attempt ${attempt} failed with ${res.status}. Retrying in ${attempt * 2} seconds...`);
             await new Promise(r => setTimeout(r, attempt * 2000));
             continue;
          }
        }
        throw new Error(`Gemini API Error: ${res.status} - ${err}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error('No text returned from Gemini');
      }

      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length !== papers.length) {
         console.warn('Gemini returned mismatched results, returning fallbacks');
         return null;
      }
      
      return parsed;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error('Gemini summarization failed after retries:', error.message);
        return null;
      }
    }
  }
}

module.exports = { summarizeBatch };
