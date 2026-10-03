import { LibraryEntry } from '../types';
import { cleanText } from './cardView';
import { arxivId, doiOf } from './exporters';

/**
 * Maps library entries to Zotero Web API v3 items.
 * Field names follow Zotero's item schema; unknown fields are rejected by the
 * API, so each item type only gets the fields it supports.
 */
export const ZOTERO_API = 'https://api.zotero.org';
export const ZOTERO_BATCH = 50;

export interface ZoteroItem {
  itemType: 'journalArticle' | 'preprint';
  title: string;
  creators: { creatorType: 'author'; name: string }[];
  date: string;
  url: string;
  DOI: string;
  abstractNote: string;
  tags: { tag: string }[];
  publicationTitle?: string;
  repository?: string;
  archiveID?: string;
  extra?: string;
}

export function toZoteroItem(entry: LibraryEntry): ZoteroItem {
  const p = entry.paper;
  const venue = p.venue && !/arxiv preprint/i.test(p.venue) ? p.venue : null;
  const ax = arxivId(p);
  const base = {
    title: cleanText(p.originalTitle),
    creators: (p.authors || []).map((name) => ({ creatorType: 'author' as const, name })),
    date: p.published || (p.year ? String(p.year) : ''),
    url: p.url,
    DOI: doiOf(p) || '',
    abstractNote: cleanText(p.summary),
    tags: [{ tag: 'ReOpSy' }, ...(p.topics || []).map((t) => ({ tag: t }))],
    extra: entry.note ? `ReOpSy note: ${entry.note}` : undefined,
  };
  if (venue) return { itemType: 'journalArticle', ...base, publicationTitle: venue };
  return {
    itemType: 'preprint',
    ...base,
    repository: ax ? 'arXiv' : p.source || '',
    archiveID: ax ? `arXiv:${ax}` : '',
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
