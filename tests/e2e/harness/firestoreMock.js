'use strict';

/**
 * In-Memory Firestore Document Store with Security Rules Evaluator
 * Supports ReOpSy collections: admins, config, pipeline_runs, pipeline_queue, api_usage, content, users.
 */
class FirestoreMock {
  constructor(options = {}) {
    this.collections = new Map();
    this.superAdminEmail = (options.superAdminEmail || process.env.EXPO_PUBLIC_ADMIN_EMAIL || 'admin@reopsy.com').toLowerCase();
  }

  setSuperAdminEmail(email) {
    this.superAdminEmail = (email || '').toLowerCase();
  }

  _getCollectionMap(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  doc(collectionName, docId) {
    if (!docId) {
      throw new Error(`FirestoreMock: docId required for collection ${collectionName}`);
    }
    return {
      type: 'docRef',
      collection: collectionName,
      id: String(docId),
      path: `${collectionName}/${docId}`
    };
  }

  collection(collectionName) {
    return {
      type: 'colRef',
      collection: collectionName,
      path: collectionName
    };
  }

  async getDoc(docRef) {
    const col = this._getCollectionMap(docRef.collection);
    const data = col.get(docRef.id);
    return {
      id: docRef.id,
      ref: docRef,
      exists: () => data !== undefined,
      data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  }

  async setDoc(docRef, data, options = {}) {
    const col = this._getCollectionMap(docRef.collection);
    if (options.merge && col.has(docRef.id)) {
      const existing = col.get(docRef.id);
      col.set(docRef.id, { ...existing, ...data });
    } else {
      col.set(docRef.id, { ...data });
    }
    return true;
  }

  async updateDoc(docRef, data) {
    const col = this._getCollectionMap(docRef.collection);
    if (!col.has(docRef.id)) {
      throw new Error(`Document ${docRef.path} does not exist for update`);
    }
    const existing = col.get(docRef.id);
    col.set(docRef.id, { ...existing, ...data });
    return true;
  }

  async deleteDoc(docRef) {
    const col = this._getCollectionMap(docRef.collection);
    col.delete(docRef.id);
    return true;
  }

  async addDoc(colRef, data) {
    const col = this._getCollectionMap(colRef.collection);
    const autoId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    col.set(autoId, { ...data });
    return this.doc(colRef.collection, autoId);
  }

  async getDocs(queryOrColRef) {
    const colName = queryOrColRef.collection;
    const col = this._getCollectionMap(colName);
    let items = Array.from(col.entries()).map(([id, data]) => ({
      id,
      data: () => JSON.parse(JSON.stringify(data)),
      ref: this.doc(colName, id),
      exists: () => true
    }));

    // Apply constraints if it's a query
    if (queryOrColRef.constraints && Array.isArray(queryOrColRef.constraints)) {
      for (const constraint of queryOrColRef.constraints) {
        if (constraint.type === 'where') {
          items = items.filter(item => {
            const val = item.data()[constraint.field];
            if (constraint.op === '==') return val === constraint.val;
            if (constraint.op === '!=') return val !== constraint.val;
            if (constraint.op === '>=') return val >= constraint.val;
            if (constraint.op === '<=') return val <= constraint.val;
            if (constraint.op === '>') return val > constraint.val;
            if (constraint.op === '<') return val < constraint.val;
            if (constraint.op === 'array-contains') return Array.isArray(val) && val.includes(constraint.val);
            return true;
          });
        }
        if (constraint.type === 'orderBy') {
          items.sort((a, b) => {
            const valA = a.data()[constraint.field];
            const valB = b.data()[constraint.field];
            if (valA < valB) return constraint.dir === 'desc' ? 1 : -1;
            if (valA > valB) return constraint.dir === 'desc' ? -1 : 1;
            return 0;
          });
        }
        if (constraint.type === 'limit') {
          items = items.slice(0, constraint.limit);
        }
      }
    }

    return {
      docs: items,
      size: items.length,
      empty: items.length === 0,
      forEach: (cb) => items.forEach(cb)
    };
  }

  query(colRef, ...constraints) {
    return {
      type: 'queryRef',
      collection: colRef.collection,
      constraints
    };
  }

  where(field, op, val) {
    return { type: 'where', field, op, val };
  }

  orderBy(field, dir = 'asc') {
    return { type: 'orderBy', field, dir };
  }

  limit(num) {
    return { type: 'limit', limit: num };
  }

  clear() {
    this.collections.clear();
  }

  // =========================================================================
  // Security Rules Evaluation Engine
  // =========================================================================

  /**
   * Check if a given auth user has admin rights
   */
  async isUserAdmin(authUser) {
    if (!authUser || !authUser.email) return false;
    const email = authUser.email.trim().toLowerCase();
    if (this.superAdminEmail && email === this.superAdminEmail) {
      return true;
    }
    const adminCol = this._getCollectionMap('admins');
    if (adminCol.has(email)) return true;

    for (const [id, data] of adminCol.entries()) {
      if (id.toLowerCase() === email) return true;
      if (data && data.email && data.email.toLowerCase() === email) return true;
    }
    return false;
  }

  /**
   * Evaluate whether a read/write operation complies with Firestore Security Rules
   * @param {'read' | 'write' | 'create' | 'update' | 'delete'} action
   * @param {string} collection
   * @param {string} docId
   * @param {object} authUser
   * @param {object} data
   */
  async evaluateSecurityRule(action, collection, docId, authUser = null, data = {}) {
    const isAuth = Boolean(authUser && authUser.uid);
    const isAdmin = await this.isUserAdmin(authUser);

    // Rule: users/{userId} -> request.auth != null && request.auth.uid == userId
    if (collection === 'users') {
      if (!isAuth) {
        return { allowed: false, reason: 'Unauthenticated user denied access to users collection' };
      }
      if (authUser.uid !== docId) {
        return { allowed: false, reason: `User ${authUser.uid} denied access to /users/${docId}` };
      }
      return { allowed: true };
    }

    // Rule: content -> read is public, write is admin-only
    if (collection === 'content') {
      if (action === 'read') {
        return { allowed: true }; // public read
      }
      if (!isAdmin) {
        return { allowed: false, reason: 'Non-admin denied write access to content collection' };
      }
      return { allowed: true };
    }

    // Rule: admins, config, pipeline_runs, pipeline_queue, api_usage -> admin-only read and write
    if (['admins', 'config', 'pipeline_runs', 'pipeline_queue', 'api_usage'].includes(collection)) {
      if (!isAuth) {
        return { allowed: false, reason: `Unauthenticated access denied to ${collection}` };
      }
      if (!isAdmin) {
        return { allowed: false, reason: `Non-admin user ${authUser.email} denied ${action} access to ${collection}` };
      }
      return { allowed: true };
    }

    // Default deny for unhandled collections
    return { allowed: false, reason: `No matching rule for collection ${collection}` };
  }
}

module.exports = {
  FirestoreMock
};
