'use strict';

/**
 * Generate a catchy title using Gemini.
 */
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No text returned from Gemini');
  return text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Generate a catchy title using Mistral.
 */
async function callMistral(prompt, apiKey) {
  const url = 'https://api.mistral.ai/v1/chat/completions';
  const payload = {
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No text returned from Mistral');
  return text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Generate a catchy title using Grok (xAI).
 */
async function callGrok(prompt, apiKey) {
  const url = 'https://api.x.ai/v1/chat/completions';
  const payload = {
    model: 'grok-3-mini-fast',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Grok Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No text returned from Grok');
  return text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Try providers in order to generate a catchy title.
 * @param {string} originalTitle
 * @param {string} summary
 * @param {Object} apiKeys { gemini?: string, mistral?: string, xai?: string }
 * @returns {Promise<{ catchyTitle: string, provider: string }>}
 */
async function generateCatchyTitle(originalTitle, summary, apiKeys) {
  const prompt = `Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: ${originalTitle}\nSummary: ${summary}`;

  if (apiKeys.gemini) {
    try {
      const catchyTitle = await callGemini(prompt, apiKeys.gemini);
      return { catchyTitle, provider: 'gemini' };
    } catch (err) {
      console.warn(`[Gemini fallback] ${err.message}`);
    }
  }

  if (apiKeys.mistral) {
    try {
      const catchyTitle = await callMistral(prompt, apiKeys.mistral);
      return { catchyTitle, provider: 'mistral' };
    } catch (err) {
      console.warn(`[Mistral fallback] ${err.message}`);
    }
  }

  if (apiKeys.xai) {
    try {
      const catchyTitle = await callGrok(prompt, apiKeys.xai);
      return { catchyTitle, provider: 'xai' };
    } catch (err) {
      console.warn(`[Grok fallback] ${err.message}`);
    }
  }

  return { catchyTitle: originalTitle, provider: 'original' };
}

module.exports = {
  generateCatchyTitle
};
