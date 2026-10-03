import { LibraryEntry } from '../types';
import { ZOTERO_API, ZOTERO_BATCH, chunk, toZoteroItem } from '../logic/zotero';
import { deleteSecret, getSecret, setSecret } from './secrets';

/**
 * Zotero Web API v3. The user creates a private key at
 * zotero.org/settings/keys with "Allow library access" and "Allow write access".
 */
const KEY_NAME = 'reopsy_zotero_key';

export interface ZoteroAccount {
  userId: string;
  username: string;
}

function writeToken(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** Checks the key, confirms write access, and stores it on this device. */
export async function connectZotero(apiKey: string): Promise<ZoteroAccount> {
  const key = apiKey.trim();
  const res = await fetch(`${ZOTERO_API}/keys/${encodeURIComponent(key)}`, {
    headers: { 'Zotero-API-Version': '3' },
  });
  if (res.status === 404 || res.status === 403) throw new Error('Zotero did not recognise that key.');
  if (!res.ok) throw new Error(`Zotero returned an error (${res.status}). Try again later.`);
  const info = await res.json();
  if (!info?.access?.user?.write) {
    throw new Error('This key cannot write. Create a key with "Allow write access" ticked.');
  }
  await setSecret(KEY_NAME, key);
  return { userId: String(info.userID), username: String(info.username || '') };
}

export async function disconnectZotero(): Promise<void> {
  await deleteSecret(KEY_NAME);
}

/** Sends entries to the user's Zotero library. Returns how many were saved. */
export async function sendToZotero(account: ZoteroAccount, entries: LibraryEntry[]): Promise<{ saved: number; failed: number }> {
  const key = await getSecret(KEY_NAME);
  if (!key) throw new Error('Connect Zotero again in You > Zotero.');
  let saved = 0;
  let failed = 0;
  for (const batch of chunk(entries.map(toZoteroItem), ZOTERO_BATCH)) {
    const res = await fetch(`${ZOTERO_API}/users/${account.userId}/items`, {
      method: 'POST',
      headers: {
        'Zotero-API-Key': key,
        'Zotero-API-Version': '3',
        'Zotero-Write-Token': writeToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });
    if (res.status === 403) throw new Error('Zotero refused the key. Reconnect it with write access.');
    if (!res.ok) throw new Error(`Zotero returned an error (${res.status}).`);
    const body = await res.json();
    saved += Object.keys(body?.successful || body?.success || {}).length;
    failed += Object.keys(body?.failed || {}).length;
  }
  return { saved, failed };
}
