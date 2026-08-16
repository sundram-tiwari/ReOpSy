'use strict';

/**
 * Mock AsyncStorage implementation for testing AppState persistence
 */
class MockAsyncStorage {
  constructor() {
    this.store = new Map();
  }

  async getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async setItem(key, value) {
    this.store.set(key, String(value));
  }

  async removeItem(key) {
    this.store.delete(key);
  }

  async clear() {
    this.store.clear();
  }

  async getAllKeys() {
    return Array.from(this.store.keys());
  }

  dump() {
    const obj = {};
    for (const [k, v] of this.store.entries()) {
      obj[k] = v;
    }
    return obj;
  }
}

/**
 * Mock Firestore implementation for testing cloud synchronization
 */
class MockFirestore {
  constructor() {
    this.collections = new Map();
  }

  _getDocRef(collectionPath, docId) {
    if (!this.collections.has(collectionPath)) {
      this.collections.set(collectionPath, new Map());
    }
    return { collectionPath, docId };
  }

  async setDoc(docRef, data, options = {}) {
    const col = this.collections.get(docRef.collectionPath);
    if (options.merge && col.has(docRef.docId)) {
      const existing = col.get(docRef.docId);
      col.set(docRef.docId, { ...existing, ...data, lastSyncedAt: new Date().toISOString() });
    } else {
      col.set(docRef.docId, { ...data, lastSyncedAt: new Date().toISOString() });
    }
  }

  async getDoc(docRef) {
    const col = this.collections.get(docRef.collectionPath);
    const data = col ? col.get(docRef.docId) : undefined;
    return {
      exists: () => data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      id: docRef.docId
    };
  }

  async deleteDoc(docRef) {
    const col = this.collections.get(docRef.collectionPath);
    if (col) {
      col.delete(docRef.docId);
    }
  }

  clear() {
    this.collections.clear();
  }
}

module.exports = {
  MockAsyncStorage,
  MockFirestore
};
