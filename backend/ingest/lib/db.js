'use strict';

/**
 * The thinnest possible Supabase client: PostgREST over fetch.
 *
 * Pulling in @supabase/supabase-js would add ~40 transitive packages to a job
 * that does two things — upsert rows and write a log line. Node 18's global
 * fetch covers it.
 */

class Db {
  constructor({ url, serviceKey, fetchImpl = fetch }) {
    if (!url) throw new Error('SUPABASE_URL is not set. Copy backend/.env.example to backend/.env.');
    if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is not set.');

    this.base = String(url).replace(/\/+$/, '') + '/rest/v1';
    this.key = serviceKey;
    this.fetchImpl = fetchImpl;
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async request(path, options = {}) {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...options,
      headers: this.headers(options.headers),
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 400)}`);
    }
    if (!body) return null;
    try { return JSON.parse(body); } catch { return body; }
  }

  /**
   * Upsert papers in chunks. `on_conflict=id` means a re-ingest updates the
   * existing row (citation counts move) instead of erroring.
   */
  async upsertPapers(papers, { chunkSize = 100 } = {}) {
    let written = 0;

    for (let i = 0; i < papers.length; i += chunkSize) {
      const chunk = papers.slice(i, i + chunkSize);
      const rows = await this.request('/papers?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(chunk),
      });
      written += Array.isArray(rows) ? rows.length : chunk.length;
    }

    return written;
  }

  async startRun(topics) {
    const rows = await this.request('/ingest_runs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ topics }]),
    });
    return Array.isArray(rows) && rows[0] ? rows[0].id : null;
  }

  async finishRun(id, patch) {
    if (!id) return;
    await this.request(`/ingest_runs?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ finished_at: new Date().toISOString(), ...patch }),
    });
  }
}

module.exports = { Db };
