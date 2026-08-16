'use strict';

/**
 * Mock Firebase Auth State Emulator for ReOpSy
 * Simulates user sessions, Google Sign-In, and admin status resolution.
 */
class AuthEmulator {
  constructor(options = {}) {
    this.superAdminEmail = (options.superAdminEmail || process.env.EXPO_PUBLIC_ADMIN_EMAIL || 'admin@reopsy.com').toLowerCase();
    this.firestore = options.firestore || null;
    this.currentUser = null;
    this.listeners = new Set();
    this.isConfigured = options.isConfigured !== undefined ? options.isConfigured : true;
    this.lastError = null;
  }

  setFirestore(firestore) {
    this.firestore = firestore;
  }

  setSuperAdminEmail(email) {
    this.superAdminEmail = (email || '').toLowerCase();
  }

  onAuthStateChanged(callback) {
    this.listeners.add(callback);
    // Immediately invoke with current state
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser);
      } catch (err) {
        console.error('[AuthEmulator] Listener error:', err);
      }
    }
  }

  async signInWithGoogle(email, displayName = 'Test User', uid = null) {
    if (!this.isConfigured) {
      this.lastError = 'Firebase is not configured';
      throw new Error(this.lastError);
    }
    const cleanEmail = (email || '').trim().toLowerCase();
    const userUid = uid || `uid-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    this.currentUser = {
      uid: userUid,
      email: cleanEmail,
      displayName: displayName || cleanEmail.split('@')[0],
      photoURL: null
    };
    this.lastError = null;
    this._notify();
    return this.currentUser;
  }

  async signOut() {
    this.currentUser = null;
    this.lastError = null;
    this._notify();
  }

  async resolveAdminStatus(user = null) {
    const targetUser = user !== undefined ? user : this.currentUser;
    if (!targetUser || !targetUser.email) {
      return { isAdmin: false, isSuperAdmin: false };
    }

    const email = targetUser.email.trim().toLowerCase();
    const isSuperAdmin = Boolean(this.superAdminEmail && email === this.superAdminEmail);

    if (isSuperAdmin) {
      return { isAdmin: true, isSuperAdmin: true };
    }

    // Check Firestore admins collection if available
    let isWhitelisted = false;
    if (this.firestore) {
      try {
        const adminDoc = await this.firestore.getDoc(this.firestore.doc('admins', email));
        if (adminDoc && adminDoc.exists()) {
          isWhitelisted = true;
        } else {
          // Case-insensitive check across admins collection
          const allAdmins = await this.firestore.getDocs(this.firestore.collection('admins'));
          isWhitelisted = allAdmins.docs.some(d => {
            const data = d.data();
            return (data.email && data.email.toLowerCase() === email) || d.id.toLowerCase() === email;
          });
        }
      } catch (err) {
        console.warn('[AuthEmulator] Firestore admin check error:', err);
      }
    }

    return {
      isAdmin: isWhitelisted,
      isSuperAdmin: false
    };
  }

  async getAuthContextState() {
    const adminStatus = await this.resolveAdminStatus(this.currentUser);
    return {
      user: this.currentUser,
      loading: false,
      adminLoading: false,
      isAdmin: adminStatus.isAdmin,
      isSuperAdmin: adminStatus.isSuperAdmin,
      error: this.lastError,
      isConfigured: this.isConfigured,
      signInWithGoogle: (email) => this.signInWithGoogle(email),
      signOut: () => this.signOut()
    };
  }
}

module.exports = {
  AuthEmulator
};
