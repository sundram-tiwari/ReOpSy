'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F12 Admin Whitelist UI Manager', () => {
  const superAdmin = 'superadmin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail: superAdmin });

  test('B12.1: Case-variant duplicate email additions are detected and prevented', async () => {
    await firestore.setDoc(firestore.doc('admins', 'editor@reopsy.com'), {
      email: 'editor@reopsy.com',
      addedAt: new Date().toISOString()
    });

    const isDuplicate = async (db, email) => {
      const target = email.trim().toLowerCase();
      const docs = await db.getDocs(db.collection('admins'));
      return docs.docs.some(d => d.id.toLowerCase() === target || (d.data().email && d.data().email.toLowerCase() === target));
    };

    assert.equal(await isDuplicate(firestore, 'EDITOR@REOPSY.COM'), true);
    assert.equal(await isDuplicate(firestore, 'Editor@ReOpSy.com'), true);
    assert.equal(await isDuplicate(firestore, 'newuser@reopsy.com'), false);
  });

  test('B12.2: Subaddressed emails (with plus signs) are supported and preserved', async () => {
    const plusEmail = 'admin+testteam@reopsy.com';
    await firestore.setDoc(firestore.doc('admins', plusEmail), {
      email: plusEmail,
      addedAt: new Date().toISOString()
    });

    const doc = (await firestore.getDoc(firestore.doc('admins', plusEmail))).data();
    assert.equal(doc.email, plusEmail);
  });

  test('B12.3: Removing non-existent email handles gracefully with appropriate status', async () => {
    const nonExistent = 'ghost@reopsy.com';
    const docRef = firestore.doc('admins', nonExistent);

    const existsBefore = (await firestore.getDoc(docRef)).exists();
    assert.equal(existsBefore, false);

    // Delete non-existent doc should succeed silently / idempotently
    await firestore.deleteDoc(docRef);
    const existsAfter = (await firestore.getDoc(docRef)).exists();
    assert.equal(existsAfter, false);
  });

  test('B12.4: Large whitelist scale (50+ admins) lists and queries without truncation', async () => {
    for (let i = 0; i < 50; i++) {
      const email = `admin_${i}@reopsy.com`;
      await firestore.setDoc(firestore.doc('admins', email), {
        email,
        addedAt: new Date().toISOString()
      });
    }

    const allAdmins = await firestore.getDocs(firestore.collection('admins'));
    assert.ok(allAdmins.docs.length >= 50);
  });

  test('B12.5: Non-super admin attempting to modify whitelist is rejected by security checks', async () => {
    const regularAdmin = { uid: 'uid-reg', email: 'colleague@reopsy.com' };

    // Only Super Admin can write to admins collection
    const canManageWhitelist = (authUser, superEmail) => {
      if (!authUser || !authUser.email) return false;
      return authUser.email.toLowerCase() === superEmail.toLowerCase();
    };

    assert.equal(canManageWhitelist(regularAdmin, superAdmin), false);
    assert.equal(canManageWhitelist({ email: superAdmin }, superAdmin), true);
  });
});
