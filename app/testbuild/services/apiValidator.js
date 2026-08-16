"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeLogMessage = sanitizeLogMessage;
exports.validateApiConnection = validateApiConnection;
/**
 * Strips/sanitizes API keys from URLs, headers, and error messages
 * so credentials are never leaked in logs, network exceptions, or UI alerts.
 */
function sanitizeLogMessage(message, apiKey) {
    if (!message)
        return '';
    let sanitized = String(message)
        .replace(/(key=)[a-zA-Z0-9_\-]+/g, '$1***')
        .replace(/(Bearer\s+)[a-zA-Z0-9_\-]+/g, '$1***');
    if (apiKey && apiKey.length >= 4) {
        sanitized = sanitized.split(apiKey).join('***');
    }
    return sanitized;
}
/**
 * Validates connection to the specified LLM provider with the given API key and optional endpoint.
 */
async function validateApiConnection(config) {
    const { provider, apiKey, endpoint } = config;
    if (!apiKey || apiKey.trim() === '') {
        return {
            success: false,
            message: 'API key cannot be empty.'
        };
    }
    const cleanKey = apiKey.trim();
    try {
        if (provider === 'Gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Ping' }] }]
                })
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errJson = JSON.parse(errText);
                    if (errJson.error?.message) {
                        errMsg = errJson.error.message;
                    }
                }
                catch {
                    if (errText)
                        errMsg = errText;
                }
                return {
                    success: false,
                    message: sanitizeLogMessage(`Gemini validation failed: ${errMsg}`, cleanKey)
                };
            }
            return {
                success: true,
                message: 'Successfully connected to Google Gemini API.'
            };
        }
        if (provider === 'Mistral') {
            const url = 'https://api.mistral.ai/v1/chat/completions';
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cleanKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'mistral-small-latest',
                    messages: [{ role: 'user', content: 'Ping' }]
                })
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errJson = JSON.parse(errText);
                    if (errJson.message) {
                        errMsg = errJson.message;
                    }
                }
                catch {
                    if (errText)
                        errMsg = errText;
                }
                return {
                    success: false,
                    message: sanitizeLogMessage(`Mistral validation failed: ${errMsg}`, cleanKey)
                };
            }
            return {
                success: true,
                message: 'Successfully connected to Mistral AI API.'
            };
        }
        if (provider === 'Grok') {
            const url = 'https://api.x.ai/v1/chat/completions';
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cleanKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'grok-beta',
                    messages: [{ role: 'user', content: 'Ping' }]
                })
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errJson = JSON.parse(errText);
                    if (errJson.message) {
                        errMsg = errJson.message;
                    }
                }
                catch {
                    if (errText)
                        errMsg = errText;
                }
                return {
                    success: false,
                    message: sanitizeLogMessage(`Grok validation failed: ${errMsg}`, cleanKey)
                };
            }
            return {
                success: true,
                message: 'Successfully connected to Grok (xAI) API.'
            };
        }
        if (provider === 'Custom') {
            const targetUrl = endpoint?.trim() || 'https://api.openai.com/v1/chat/completions';
            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cleanKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Ping' }]
                })
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                return {
                    success: false,
                    message: sanitizeLogMessage(`Custom endpoint returned HTTP ${res.status}: ${errText}`, cleanKey)
                };
            }
            return {
                success: true,
                message: 'Successfully connected to Custom Endpoint.'
            };
        }
        return {
            success: false,
            message: `Unknown provider: ${provider}`
        };
    }
    catch (err) {
        const errorMsg = err?.message || String(err) || 'Network request failed';
        return {
            success: false,
            message: sanitizeLogMessage(`Connection error: ${errorMsg}`, cleanKey)
        };
    }
}
