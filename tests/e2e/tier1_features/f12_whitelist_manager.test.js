'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F12: Admin Whitelist UI Manager', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  /**
   * Helper simulating whitelist manager service
   */
  class WhitelistService {
    constructor(db, superEmail) {
      this.db = db;
      this.superEmail = superEmail.toLowerCase();
    }

    validateEmail(email) {
      if (!email || typeof email !== 'string') return false;
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email.trim());
    }

    async listAdmins() {
      const docs = await this.db.getDocs(this.db.collection('admins'));
      return docs.docs.map(d => d.data());
    }

    async addAdmin(email, addedBy = this.superEmail) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!this.validateEmail(cleanEmail)) {
        throw new Error('Invalid email format');
      }
      if (cleanEmail === this.superEmail) {
        throw new Error('Super Admin is already permanently configured via environment');
      }

      const docRef = this.db.doc('admins', cleanEmail);
      const existing = await this.db.getDoc(docRef);
      if (existing && existing.exists()) {
        throw new Error('Email is already whitelisted as admin');
      }

      const payload = {
        email: cleanEmail,
        addedAt: new Date().toISOString(),
        addedBy
      };
      await this.db.setDoc(docRef, payload);
      return payload;
    }

    async removeAdmin(email) {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (cleanEmail === this.superEmail) {
        throw new Error('Cannot remove Super Admin from whitelist');
      }
      const docRef = this.db.doc('admins', cleanEmail);
      await this.db.deleteDoc(docRef);
      return { success: true, removedEmail: cleanEmail };
    }
  }

  const service = new WhitelistService(firestore, superAdminEmail);

  test('F12.1: Super Admin can list all admin emails from Firestore admins collection', async () => {
    await firestore.setDoc(firestore.doc('admins', 'user1@reopsy.com'), {
      email: 'user1@reopsy.com',
      addedAt: new Date().toISOString(),
      addedBy: superAdminEmail
    });

    const admins = await service.listAdmins();
    assert.ok(admins.length > 0);
    assert.ok(admins.some(a => a.email === 'user1@reopsy.com'));
  });

  test('F12.2: Super Admin can add a new valid admin email to Firestore', async () => {
    const newAdmin = 'researcher@reopsy.com';
    const result = await service.addAdmin(newAdmin, superAdminEmail);

    assert.equal(result.email, newAdmin);
    assert.equal(result.addedBy, superAdminEmail);

    const doc = (await firestore.getDoc(firestore.doc('admins', newAdmin))).data();
    assert.equal(doc.email, newAdmin);
  });

  test('F12.3: Super Admin can remove an admin email from Firestore', async () => {
    const toRemove = 'user1@reopsy.com';
    const result = await service.removeAdmin(toRemove);

    assert.equal(result.success, true);
    const doc = await firestore.getDoc(firestore.doc('admins', toRemove));
    assert.equal(doc.exists(), false);
  });

  test('F12.4: Super Admin email is protected and cannot be removed or added redundantly', async () => {
    // Attempt to remove super admin
    await assert.rejects(
      async () => service.removeAdmin(superAdminEmail),
      /Cannot remove Super Admin/
    );

    // Attempt to add super admin
    await assert.rejects(
      async () => service.addAdmin(superAdminEmail),
      /already permanently configured/
    );
  });

  test('F12.5: Adding duplicate admin email is rejected with descriptive error', async () => {
    const email = 'duplicate@reopsy.com';
    await service.addAdmin(email);

    await assert.rejects(
      async () => service.addAdmin(email),
      /already whitelisted/
    );
  });

  test('F12.6: Invalid email format is rejected by email validation parser', async () => {
    const invalidEmails = ['invalid-email', 'no-domain@', '@no-local.com', 'spaces in@email.com', ''];
    for (const bad of invalidEmails) {
      await assert.rejects(
        async () => service.addAdmin(bad),
        /Invalid email format/
      );
    }
  });
});
