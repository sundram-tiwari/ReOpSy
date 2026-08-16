'use strict';

/**
 * Hardcoded default system prompt for title generation.
 * Line 120 requirement: Dynamic retrieval from Firestore config/system_prompt with fallback to this default.
 */
const DEFAULT_SYSTEM_PROMPT = 'Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: {{originalTitle}}\nSummary: {{summary}}';

/**
 * Sanitize error message to prevent accidental credential leakage in logs.
 * @param {string|Error} error
 * @returns {string|null}
 */
function sanitizeError(error) {
  if (!error) return null;
  const str = typeof error === 'string' ? error : (error.message || String(error));
  return str
    .replace(/key=[A-Za-z0-9_-]+/g, 'key=***')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***')
    .replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi, 'Authorization: Basic ***')
    .replace(/x-api-key:\s*[A-Za-z0-9_-]+/gi, 'x-api-key: ***');
}

/**
 * Log LLM API invocation to Firestore api_usage collection.
 * Zero-failure propagation: errors are caught and logged as non-fatal warnings.
 * @param {Object} db - Firestore instance (mock, SDK, or null)
 * @param {Object} usageData - { provider, success, error, tokenCount, model }
 * @returns {Promise<Object|undefined>}
 */
async function logApiUsage(db, { provider, success, error = null, tokenCount = null, model = null }) {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const usageId = `usage_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const sanitizedError = sanitizeError(error);

    const docData = {
      id: usageId,
      timestamp: now.toISOString(),
      date: dateStr,
      provider,
      success: Boolean(success),
      ...(sanitizedError ? { error: sanitizedError } : {}),
      ...(typeof tokenCount === 'number' ? { tokenCount } : {})
    };

    if (db) {
      if (typeof db.setDoc === 'function' && typeof db.doc === 'function') {
        await db.setDoc(db.doc('api_usage', usageId), docData);
      } else if (typeof db.collection === 'function') {
        const col = db.collection('api_usage');
        if (typeof col.doc === 'function') {
          await col.doc(usageId).set(docData);
        } else if (typeof db.addDoc === 'function') {
          await db.addDoc(col, docData);
        }
      }
      return docData;
    }

    // Try REST fallback if FIREBASE_PROJECT_ID / EXPO_PUBLIC_FIREBASE_PROJECT_ID is present
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/api_usage?documentId=${usageId}`;
      const fields = {
        id: { stringValue: docData.id },
        timestamp: { stringValue: docData.timestamp },
        date: { stringValue: docData.date },
        provider: { stringValue: docData.provider },
        success: { booleanValue: docData.success }
      };
      if (sanitizedError) fields.error = { stringValue: sanitizedError };
      if (typeof tokenCount === 'number') fields.tokenCount = { integerValue: String(tokenCount) };

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
    }

    return docData;
  } catch (err) {
    console.warn('[logApiUsage] Non-fatal logging error:', err.message || err);
  }
}

/**
 * Dynamically retrieve the system prompt from Firestore config/system_prompt document.
 * Falls back gracefully to DEFAULT_SYSTEM_PROMPT if document does not exist, prompt is empty,
 * or network/db is offline or errors.
 * @param {Object|null} db - Firestore database instance or null
 * @returns {Promise<string>}
 */
async function getSystemPrompt(db = null) {
  if (!db) {
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/system_prompt`;
        const res = await fetch(url);
        if (res.ok) {
          const docJson = await res.json();
          const p = docJson.fields?.prompt?.stringValue || docJson.fields?.promptTemplate?.stringValue;
          if (p && typeof p === 'string' && p.trim().length > 0) {
            return p.trim();
          }
        }
      } catch (err) {
        console.warn(`[getSystemPrompt] Failed to load prompt via REST: ${err.message}`);
      }
    }
    return DEFAULT_SYSTEM_PROMPT;
  }

  try {
    let docSnap;
    if (typeof db.getDoc === 'function' && typeof db.doc === 'function') {
      docSnap = await db.getDoc(db.doc('config', 'system_prompt'));
    } else if (typeof db.collection === 'function') {
      const docRef = db.collection('config').doc('system_prompt');
      if (typeof docRef.get === 'function') {
        docSnap = await docRef.get();
      }
    }

    if (docSnap) {
      const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
      const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : Boolean(data);
      if (exists && data) {
        const promptText = data.prompt || data.promptTemplate;
        if (promptText && typeof promptText === 'string' && promptText.trim().length > 0) {
          return promptText.trim();
        }
      }
    }
  } catch (err) {
    console.warn('[getSystemPrompt] Failed to load prompt from Firestore, using default:', err.message || err);
  }

  return DEFAULT_SYSTEM_PROMPT;
}

/**
 * Format prompt template with paper title and summary variables.
 * Supports {{originalTitle}} / {originalTitle} and {{summary}} / {summary}.
 * Appends title and summary if template lacks placeholders.
 * @param {string} template
 * @param {string} originalTitle
 * @param {string} summary
 * @returns {string}
 */
function formatPrompt(template, originalTitle = '', summary = '') {
  let text = (template && typeof template === 'string' && template.trim().length > 0)
    ? template
    : DEFAULT_SYSTEM_PROMPT;
  const title = String(originalTitle || '');
  const summ = String(summary || '');
  let hasPlaceholder = false;

  if (text.includes('{{originalTitle}}')) {
    text = text.replace(/\{\{originalTitle\}\}/g, () => title);
    hasPlaceholder = true;
  }
  if (text.includes('{originalTitle}')) {
    text = text.replace(/\{originalTitle\}/g, () => title);
    hasPlaceholder = true;
  }

  if (text.includes('{{summary}}')) {
    text = text.replace(/\{\{summary\}\}/g, () => summ);
    hasPlaceholder = true;
  }
  if (text.includes('{summary}')) {
    text = text.replace(/\{summary\}/g, () => summ);
    hasPlaceholder = true;
  }

  if (!hasPlaceholder && !text.includes(title)) {
    text = `${text}\n\nOriginal Title: ${title}\nSummary: ${summ}`;
  }

  return text;
}

/**
 * Generate a catchy title using Gemini with token usage logging.
 * @param {string} prompt
 * @param {string} apiKey
 * @param {Object} options - { db, firestore }
 * @returns {Promise<string>}
 */
async function callGemini(prompt, apiKey, options = {}) {
  const db = options.db || options.firestore || null;
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
        lastError = new Error(`Gemini (${model}) Error: ${response.status} - ${errText}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = new Error(`No text returned from Gemini (${model})`);
        continue;
      }

      const tokenCount = data.usageMetadata?.totalTokenCount ||
        (data.usageMetadata?.promptTokenCount ? ((data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0)) : null);

      await logApiUsage(db, {
        provider: 'Gemini',
        success: true,
        tokenCount: typeof tokenCount === 'number' ? tokenCount : null,
        model
      });

      return text.trim().replace(/^["']|["']$/g, '');
    } catch (err) {
      lastError = err;
    }
  }

  await logApiUsage(db, {
    provider: 'Gemini',
    success: false,
    error: lastError ? lastError.message : 'All Gemini models failed'
  });

  throw lastError || new Error('All Gemini models failed');
}

/**
 * Generate a catchy title using Mistral with token usage logging.
 * @param {string} prompt
 * @param {string} apiKey
 * @param {Object} options - { db, firestore }
 * @returns {Promise<string>}
 */
async function callMistral(prompt, apiKey, options = {}) {
  const db = options.db || options.firestore || null;
  const url = 'https://api.mistral.ai/v1/chat/completions';
  const payload = {
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  };

  try {
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

    const tokenCount = data.usage?.total_tokens || null;
    await logApiUsage(db, {
      provider: 'Mistral',
      success: true,
      tokenCount: typeof tokenCount === 'number' ? tokenCount : null,
      model: 'mistral-small-latest'
    });

    return text.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    await logApiUsage(db, {
      provider: 'Mistral',
      success: false,
      error: err.message
    });
    throw err;
  }
}

/**
 * Generate a catchy title using Grok (xAI) with token usage logging.
 * @param {string} prompt
 * @param {string} apiKey
 * @param {Object} options - { db, firestore }
 * @returns {Promise<string>}
 */
async function callGrok(prompt, apiKey, options = {}) {
  const db = options.db || options.firestore || null;
  const url = 'https://api.x.ai/v1/chat/completions';
  const payload = {
    model: 'grok-3-mini-fast',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  };

  try {
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

    const tokenCount = data.usage?.total_tokens || null;
    await logApiUsage(db, {
      provider: 'Grok',
      success: true,
      tokenCount: typeof tokenCount === 'number' ? tokenCount : null,
      model: 'grok-3-mini-fast'
    });

    return text.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    await logApiUsage(db, {
      provider: 'Grok',
      success: false,
      error: err.message
    });
    throw err;
  }
}

/**
 * Try providers in order to generate a catchy title.
 * Cascades Gemini -> Mistral -> Grok (xAI) -> Original Title.
 * Dynamically loads system prompt from Firestore config/system_prompt if available.
 * @param {string} originalTitle
 * @param {string} summary
 * @param {Object} apiKeys { gemini?: string, mistral?: string, xai?: string }
 * @param {Object} options { db?: Object, firestore?: Object }
 * @returns {Promise<{ catchyTitle: string, provider: string }>}
 */
async function generateCatchyTitle(originalTitle, summary, apiKeys = {}, options = {}) {
  const db = options.db || options.firestore || null;
  const promptTemplate = await getSystemPrompt(db);
  const prompt = formatPrompt(promptTemplate, originalTitle, summary);

  if (apiKeys.gemini) {
    try {
      const catchyTitle = await callGemini(prompt, apiKeys.gemini, { db });
      return { catchyTitle, provider: 'gemini' };
    } catch (err) {
      console.warn(`[Gemini fallback] ${err.message}`);
    }
  }

  if (apiKeys.mistral) {
    try {
      const catchyTitle = await callMistral(prompt, apiKeys.mistral, { db });
      return { catchyTitle, provider: 'mistral' };
    } catch (err) {
      console.warn(`[Mistral fallback] ${err.message}`);
    }
  }

  if (apiKeys.xai) {
    try {
      const catchyTitle = await callGrok(prompt, apiKeys.xai, { db });
      return { catchyTitle, provider: 'xai' };
    } catch (err) {
      console.warn(`[Grok fallback] ${err.message}`);
    }
  }

  return { catchyTitle: originalTitle, provider: 'original' };
}

module.exports = {
  callGemini,
  callMistral,
  callGrok,
  generateCatchyTitle,
  getSystemPrompt,
  formatPrompt,
  logApiUsage,
  sanitizeError,
  DEFAULT_SYSTEM_PROMPT
};
