import { Paper, UserApiConfig } from '../types';
import { sanitizeLogMessage } from './apiValidator';

interface RawArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  publishedYear: number;
  url: string;
  pdfUrl: string | null;
}

function cleanXmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses Atom XML from arXiv API feed into structured paper entries.
 */
function parseArxivAtomXml(xml: string): RawArxivEntry[] {
  const entries: RawArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entryBlock = entryMatch[1];

    // Extract ID
    const idMatch = entryBlock.match(/<id>([\s\S]*?)<\/id>/);
    const rawId = idMatch ? idMatch[1].trim() : `arxiv:${Date.now()}`;
    const cleanId = rawId.replace(/^http:\/\/arxiv\.org\/abs\//, 'arxiv:');

    // Extract Title
    const titleMatch = entryBlock.match(/<title>([\s\S]*?)<\/title>/);
    const rawTitle = titleMatch ? cleanXmlEntities(titleMatch[1]) : 'Untitled Paper';

    // Extract Summary / Abstract
    const summaryMatch = entryBlock.match(/<summary>([\s\S]*?)<\/summary>/);
    const rawSummary = summaryMatch ? cleanXmlEntities(summaryMatch[1]) : 'No summary available.';

    // Extract Published Year
    const publishedMatch = entryBlock.match(/<published>([\s\S]*?)<\/published>/);
    let year = new Date().getFullYear();
    if (publishedMatch) {
      const parsedDate = new Date(publishedMatch[1].trim());
      if (!isNaN(parsedDate.getFullYear())) {
        year = parsedDate.getFullYear();
      }
    }

    // Extract Authors
    const authors: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entryBlock)) !== null) {
      const name = cleanXmlEntities(authorMatch[1]);
      if (name) authors.push(name);
    }

    // Extract Links (Abstract URL & PDF URL)
    let url = `https://arxiv.org/abs/${cleanId.replace(/^arxiv:/, '')}`;
    let pdfUrl: string | null = null;

    const linkRegex = /<link([\s\S]*?)\/>/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(entryBlock)) !== null) {
      const linkTag = linkMatch[1];
      const hrefMatch = linkTag.match(/href="([^"]+)"/);
      const titleMatchAttr = linkTag.match(/title="([^"]+)"/);
      const typeMatch = linkTag.match(/type="([^"]+)"/);

      if (hrefMatch) {
        const href = hrefMatch[1];
        if (titleMatchAttr && titleMatchAttr[1] === 'pdf') {
          pdfUrl = href;
        } else if (typeMatch && typeMatch[1] === 'application/pdf') {
          pdfUrl = href;
        } else if (!url && linkTag.includes('rel="alternate"')) {
          url = href;
        }
      }
    }

    entries.push({
      id: cleanId,
      title: rawTitle,
      summary: rawSummary,
      authors: authors.length > 0 ? authors : ['Unknown authors'],
      publishedYear: year,
      url,
      pdfUrl
    });
  }

  return entries;
}

function clampSummaryWords(text: string, maxWords: number = 30): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Synthesizes a catchy title and flashcard summary for a paper using the user's configured LLM provider.
 * Gracefully falls back to original title/summary if the request fails.
 */
async function synthesizeWithLlm(
  title: string,
  summary: string,
  apiConfig: UserApiConfig
): Promise<{ catchyTitle: string; summary: string }> {
  const { provider, apiKey, endpoint } = apiConfig;

  if (!apiKey || apiKey.trim() === '') {
    return { catchyTitle: title, summary: clampSummaryWords(summary, 30) };
  }

  const cleanKey = apiKey.trim();
  const prompt = `You are a research summarizer for mobile flashcards. Given the research paper title and abstract, produce:
1. A catchy, engaging title (under 10 words).
2. A concise flashcard summary strictly under 30 words capturing the core contribution.

Paper Title: ${title}
Abstract: ${summary}

Respond ONLY in valid JSON format with keys "catchyTitle" and "summary":
{"catchyTitle": "...", "summary": "..."}`;

  try {
    if (provider === 'Gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            return {
              catchyTitle: parsed.catchyTitle || title,
              summary: clampSummaryWords(parsed.summary || summary, 30)
            };
          } catch {
            return { catchyTitle: text.slice(0, 100).trim(), summary: clampSummaryWords(summary, 30) };
          }
        }
      }
    } else if (provider === 'Mistral') {
      const url = 'https://api.mistral.ai/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            return {
              catchyTitle: parsed.catchyTitle || title,
              summary: clampSummaryWords(parsed.summary || summary, 30)
            };
          } catch {
            return { catchyTitle: content.slice(0, 100).trim(), summary: clampSummaryWords(summary, 30) };
          }
        }
      }
    } else if (provider === 'Grok') {
      const url = 'https://api.x.ai/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            return {
              catchyTitle: parsed.catchyTitle || title,
              summary: clampSummaryWords(parsed.summary || summary, 30)
            };
          } catch {
            return { catchyTitle: content.slice(0, 100).trim(), summary: clampSummaryWords(summary, 30) };
          }
        }
      }
    } else if (provider === 'Custom') {
      const targetUrl = endpoint?.trim() || 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            return {
              catchyTitle: parsed.catchyTitle || title,
              summary: clampSummaryWords(parsed.summary || summary, 30)
            };
          } catch {
            return { catchyTitle: content.slice(0, 100).trim(), summary: clampSummaryWords(summary, 30) };
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[CustomTopicFetcher] LLM synthesis fallback triggered: ${sanitizeLogMessage(err?.message || '', cleanKey)}`);
  }

  // Graceful fallback
  return { catchyTitle: title, summary: clampSummaryWords(summary, 30) };
}

/**
 * Searches arXiv for the user's custom topic query, synthesizes flashcard summaries via LLM,
 * and produces Level 4 custom papers.
 */
export async function fetchCustomTopicPapers(
  topicQuery: string,
  apiConfig: UserApiConfig,
  limit: number = 5
): Promise<Paper[]> {
  if (!topicQuery || topicQuery.trim() === '') {
    return [];
  }

  const cleanQuery = topicQuery.trim();
  const arxivUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}&start=0&max_results=${Math.max(1, limit)}`;

  const res = await fetch(arxivUrl);
  if (!res.ok) {
    throw new Error(`arXiv API query returned HTTP ${res.status}`);
  }

  const xmlText = await res.text();
  const entries = parseArxivAtomXml(xmlText);

  const papers: Paper[] = [];

  for (const entry of entries) {
    const { catchyTitle, summary } = await synthesizeWithLlm(entry.title, entry.summary, apiConfig);

    papers.push({
      id: entry.id,
      originalTitle: entry.title,
      catchyTitle,
      summary,
      authors: entry.authors,
      source: 'arxiv',
      year: entry.publishedYear,
      venue: 'arXiv',
      url: entry.url,
      pdfUrl: entry.pdfUrl,
      topics: ['custom'],
      likes: 0,
      contentLevel: 4
    });
  }

  return papers;
}
