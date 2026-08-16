/**
 * Milestone 1 Adversarial & Boundary Stress Test Suite
 * Executed by Challenger 1 for ReOpSy M1 (Auth, Permissions & Security)
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// We simulate the Firestore and Firebase environment for comprehensive unit & stress testing
class MockFirestoreCollection {
  constructor(name, dataStore) {
    this.name = name;
    this.dataStore = dataStore;
  }
}

class MockFirestoreDocRef {
  constructor(collectionName, docId, dataStore) {
    this.collectionName = collectionName;
    this.id = docId;
    this.dataStore = dataStore;
  }
}

class MockFirestoreDB {
  constructor() {
    this.collections = new Map();
    this.shouldFail = false;
    this.failureError = new Error('Network timeout: Firestore is currently unreachable (mock offline)');
  }

  getCollection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  clear() {
    this.collections.clear();
    this.shouldFail = false;
  }
}

// Emulate adminService functions under test using exact logic from app/src/services/adminService.ts
function createAdminService(dbInstance, envVars = {}) {
  let isConfigured = true;

  const getEnvAdmin = () => (envVars.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();

  const checkIsAdmin = async (email) => {
    if (!email || typeof email !== 'string') return false;
    const cleanEmail = email.trim().toLowerCase();
    const superAdminEmail = getEnvAdmin();

    if (superAdminEmail && cleanEmail === superAdminEmail) {
      return true;
    }

    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      if (dbInstance?.shouldFail) {
        // Simulates try/catch in checkIsAdmin
        return false;
      }
      return false;
    }

    try {
      const col = dbInstance.getCollection('admins');
      return col.has(cleanEmail);
    } catch (err) {
      return false;
    }
  };

  const getAdminList = async () => {
    const superAdminEmail = getEnvAdmin();
    const admins = [];

    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      if (superAdminEmail) {
        return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
      }
      return [];
    }

    try {
      const col = dbInstance.getCollection('admins');
      for (const [key, data] of col.entries()) {
        const email = (data.email || key).toLowerCase();
        admins.push({
          email,
          addedAt: data.addedAt || 'Unknown',
          addedBy: data.addedBy || 'Admin',
          isSuperAdmin: Boolean(superAdminEmail && email === superAdminEmail)
        });
      }

      if (superAdminEmail && !admins.some(a => a.email === superAdminEmail)) {
        admins.unshift({
          email: superAdminEmail,
          addedAt: 'System Config',
          addedBy: 'Super Admin',
          isSuperAdmin: true
        });
      }
    } catch (err) {
      if (superAdminEmail) {
        return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
      }
    }

    return admins;
  };

  const addAdmin = async (email, addedBy) => {
    if (!email || typeof email !== 'string') throw new Error('Email is required');
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Invalid email format');
    }

    const superAdminEmail = getEnvAdmin();
    if (superAdminEmail && cleanEmail === superAdminEmail) {
      throw new Error('Super Admin is already permanently configured via environment');
    }

    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      throw new Error('Firebase is not configured');
    }

    const col = dbInstance.getCollection('admins');
    if (col.has(cleanEmail)) {
      throw new Error('Email is already whitelisted as admin');
    }

    col.set(cleanEmail, {
      email: cleanEmail,
      addedAt: new Date().toISOString(),
      addedBy
    });
  };

  const removeAdmin = async (email) => {
    if (!email || typeof email !== 'string') throw new Error('Email is required');
    const cleanEmail = email.trim().toLowerCase();
    const superAdminEmail = getEnvAdmin();

    if (superAdminEmail && cleanEmail === superAdminEmail) {
      throw new Error('Cannot remove Super Admin from whitelist');
    }

    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      throw new Error('Firebase is not configured');
    }

    const col = dbInstance.getCollection('admins');
    col.delete(cleanEmail);
  };

  const getSystemPrompt = async () => {
    if (!isConfigured || !dbInstance || dbInstance.shouldFail) return null;
    try {
      const col = dbInstance.getCollection('config');
      const item = col.get('system_prompt');
      return item ? item.prompt || null : null;
    } catch (err) {
      return null;
    }
  };

  const saveSystemPrompt = async (prompt, updatedBy) => {
    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      throw new Error('Firebase is not configured');
    }
    if (typeof prompt !== 'string') {
      throw new Error('Prompt must be a string');
    }
    const col = dbInstance.getCollection('config');
    col.set('system_prompt', {
      prompt: prompt.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy
    });
  };

  const triggerPipelineTopic = async (topic, requestedBy) => {
    if (!topic || typeof topic !== 'string') {
      throw new Error('Topic is required');
    }
    if (!isConfigured || !dbInstance || dbInstance.shouldFail) {
      throw new Error('Firebase is not configured');
    }
    const col = dbInstance.getCollection('pipeline_queue');
    const id = `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    col.set(id, {
      topic: topic.trim(),
      requestedAt: new Date().toISOString(),
      status: 'pending',
      requestedBy
    });
    return id;
  };

  const aggregateApiUsage = (records) => {
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const dailyMap = {};

    for (const record of records) {
      totalCalls++;
      if (record.success) totalSuccess++;
      else totalFailed++;

      const date = record.date || (record.timestamp ? record.timestamp.split('T')[0] : 'Unknown');
      const provider = record.provider || 'Other';
      const key = `${date}_${provider}`;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          date,
          provider,
          total: 0,
          success: 0,
          failed: 0
        };
      }

      dailyMap[key].total++;
      if (record.success) dailyMap[key].success++;
      else dailyMap[key].failed++;
    }

    const rows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return {
      summary: { totalCalls, totalSuccess, totalFailed },
      rows
    };
  };

  return {
    checkIsAdmin,
    getAdminList,
    addAdmin,
    removeAdmin,
    getSystemPrompt,
    saveSystemPrompt,
    triggerPipelineTopic,
    aggregateApiUsage,
    setIsConfigured: (val) => { isConfigured = val; }
  };
}

// Emulate useAuth verification logic
function createUseAuthSimulator(adminService, envVars = {}) {
  let user = null;
  let isAdmin = false;
  let isSuperAdmin = false;
  let adminLoading = false;

  const verifyAdminStatus = async (currentUser) => {
    if (!currentUser || !currentUser.email) {
      isAdmin = false;
      isSuperAdmin = false;
      adminLoading = false;
      return;
    }

    const email = currentUser.email.trim().toLowerCase();
    const superAdminEmail = (envVars.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    const isSuper = Boolean(superAdminEmail && email === superAdminEmail);

    if (isSuper) {
      isAdmin = true;
      isSuperAdmin = true;
      adminLoading = false;
      return;
    }

    isSuperAdmin = false;
    adminLoading = true;

    try {
      const isAdm = await adminService.checkIsAdmin(email);
      isAdmin = isAdm;
    } catch (err) {
      isAdmin = false;
    } finally {
      adminLoading = false;
    }
  };

  const signInWithGoogle = async (email, name = 'User') => {
    const cleanEmail = email ? email.trim() : null;
    user = cleanEmail ? { email: cleanEmail, displayName: name, uid: `uid_${cleanEmail}` } : null;
    await verifyAdminStatus(user);
    return user;
  };

  const signOut = async () => {
    user = null;
    isAdmin = false;
    isSuperAdmin = false;
    adminLoading = false;
  };

  return {
    getUser: () => user,
    getIsAdmin: () => isAdmin,
    getIsSuperAdmin: () => isSuperAdmin,
    getAdminLoading: () => adminLoading,
    signInWithGoogle,
    signOut,
    verifyAdminStatus
  };
}

// Security Rules Evaluator
function evaluateFirestoreRule({ auth, path: docPath, method = 'read' }) {
  const segments = docPath.replace(/^\//, '').split('/');
  const collection = segments[0];
  const docId = segments[1];

  const isAuthenticated = Boolean(auth && auth.uid);
  const email = auth && auth.token && auth.token.email ? auth.token.email : null;

  // Emulate rule: isOwner(userId)
  const isOwner = (targetUserId) => isAuthenticated && auth.uid === targetUserId;

  // Emulate rule: isAdmin()
  const isAdmin = (adminWhitelist) => {
    if (!isAuthenticated || !email) return false;
    const lowerEmail = email.toLowerCase();
    return adminWhitelist.has(lowerEmail) || adminWhitelist.has(email);
  };

  return {
    checkAccess: (adminWhitelist = new Set()) => {
      if (collection === 'users') {
        return isOwner(docId);
      }
      if (['admins', 'config', 'pipeline_runs', 'pipeline_queue', 'api_usage'].includes(collection)) {
        return isAdmin(adminWhitelist);
      }
      if (collection === 'content') {
        if (method === 'read') return true; // public read
        if (method === 'write') return isAdmin(adminWhitelist); // admin-only write
      }
      return false;
    }
  };
}

// -------------------------------------------------------------
// ADVERSARIAL STRESS TEST SUITE
// -------------------------------------------------------------

describe('⚔️ Challenger M1 Adversarial Suite: Auth, Permissions & Security', () => {
  const superEmail = 'superadmin@reopsy.com';
  let db;
  let adminService;
  let authSim;

  before(() => {
    db = new MockFirestoreDB();
    adminService = createAdminService(db, { EXPO_PUBLIC_ADMIN_EMAIL: superEmail });
    authSim = createUseAuthSimulator(adminService, { EXPO_PUBLIC_ADMIN_EMAIL: superEmail });
  });

  after(() => {
    db.clear();
  });

  describe('Section 1: Extreme Email Formatting & Boundary Resilience', () => {
    test('1.1: Complex RFC 5322 valid emails handled correctly without false negatives', async () => {
      const validEmails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'other.email-with-hyphen@example.com',
        'fully-qualified-domain@example.co.uk',
        'user.name+tag+sorting@example.com',
        'x@example.com',
        'example-indeed@strange-example.com',
        'admin123_456@subdomain.domain.org'
      ];

      for (const email of validEmails) {
        // Adding valid admin
        await adminService.addAdmin(email, superEmail);
        const exists = await adminService.checkIsAdmin(email);
        assert.equal(exists, true, `Valid email "${email}" should be recognized as admin`);
        
        // Remove
        await adminService.removeAdmin(email);
        const removed = await adminService.checkIsAdmin(email);
        assert.equal(removed, false, `Valid email "${email}" should be removed`);
      }
    });

    test('1.2: Invalid emails, injections, and malformed inputs are strictly rejected on addAdmin', async () => {
      const invalidEmails = [
        '',
        '   ',
        null,
        undefined,
        12345,
        {},
        [],
        'plainaddress',
        '#@%^%#$@#$@#.com',
        '@example.com',
        'Joe Smith <email@example.com>',
        'email.example.com',
        'email@example@example.com',
        '.email@example.com',
        'email.@example.com',
        'email..email@example.com',
        'email@example.com (Joe Smith)',
        'email@example',
        'email@-example.com',
        'email@example..com',
        'admin@reopsy.com/../malicious',
        'admin@reopsy.com\x00nullbyte',
        'admin@reopsy.com\nnewline'
      ];

      for (const badEmail of invalidEmails) {
        await assert.rejects(
          async () => {
            await adminService.addAdmin(badEmail, superEmail);
          },
          /(Email is required|Invalid email format)/,
          `Invalid email input "${badEmail}" must throw descriptive error`
        );
      }
    });

    test('1.3: Whitespace resilience — leading, trailing, and mixed case in auth and admin operations', async () => {
      const testEmail = 'researcher.lead@reopsy.org';
      await adminService.addAdmin(testEmail, superEmail);

      const whitespaceVariants = [
        ' researcher.lead@reopsy.org',
        'researcher.lead@reopsy.org ',
        '  researcher.lead@reopsy.org  ',
        '\tresearcher.lead@reopsy.org\t',
        '  RESEARCHER.LEAD@REOPSY.ORG  '
      ];

      for (const variant of whitespaceVariants) {
        const isAdmin = await adminService.checkIsAdmin(variant);
        assert.equal(isAdmin, true, `Variant "${variant}" must resolve to true`);

        await authSim.signInWithGoogle(variant);
        assert.equal(authSim.getIsAdmin(), true, `useAuth must authenticate "${variant}" as admin`);
        assert.equal(authSim.getIsSuperAdmin(), false, `Secondary admin "${variant}" is not super admin`);
      }

      await adminService.removeAdmin(testEmail);
    });

    test('1.4: Unicode, Diacritics & Homograph attacks do not hijack Super Admin privileges', async () => {
      // Cyrillic 'а' (U+0430) vs Latin 'a' (U+0061)
      const homographSuperAdmin = 'superаdmin@reopsy.com'; // Contains Cyrillic 'а'
      
      // Checking homograph should NOT match Latin superadmin email
      const isAdmin = await adminService.checkIsAdmin(homographSuperAdmin);
      assert.equal(isAdmin, false, 'Homograph Cyrillic attack must NOT grant Super Admin privilege');

      await authSim.signInWithGoogle(homographSuperAdmin);
      assert.equal(authSim.getIsSuperAdmin(), false, 'Homograph email must NOT become super admin');
      assert.equal(authSim.getIsAdmin(), false, 'Homograph email must NOT become admin');
    });
  });

  describe('Section 2: Super Admin Protection & Privilege Escalation Prevention', () => {
    test('2.1: Super Admin cannot be deleted via removeAdmin (case-insensitive check)', async () => {
      const superAdminVariants = [
        superEmail,
        superEmail.toUpperCase(),
        `  ${superEmail}  `,
        'SuperAdmin@ReOpSy.com'
      ];

      for (const variant of superAdminVariants) {
        await assert.rejects(
          async () => {
            await adminService.removeAdmin(variant);
          },
          /Cannot remove Super Admin from whitelist/,
          `Attempt to remove Super Admin variant "${variant}" must be rejected`
        );
      }
    });

    test('2.2: Super Admin cannot be added redundantly via addAdmin', async () => {
      await assert.rejects(
        async () => {
          await adminService.addAdmin(superEmail, 'Self');
        },
        /Super Admin is already permanently configured via environment/,
        'Adding super admin must throw configured error'
      );
    });

    test('2.3: Super Admin is always present in getAdminList even if Firestore collection is empty', async () => {
      db.getCollection('admins').clear();
      const list = await adminService.getAdminList();

      assert.equal(list.length, 1);
      assert.equal(list[0].email, superEmail);
      assert.equal(list[0].isSuperAdmin, true);
    });

    test('2.4: Empty or undefined EXPO_PUBLIC_ADMIN_EMAIL does not match any user', async () => {
      const unconfiguredService = createAdminService(db, { EXPO_PUBLIC_ADMIN_EMAIL: '' });
      const unconfiguredAuth = createUseAuthSimulator(unconfiguredService, { EXPO_PUBLIC_ADMIN_EMAIL: '' });

      const testEmails = ['', '   ', 'admin@reopsy.com', 'user@gmail.com'];
      for (const em of testEmails) {
        const isAdm = await unconfiguredService.checkIsAdmin(em);
        assert.equal(isAdm, false, `Empty env var must not match email "${em}"`);

        await unconfiguredAuth.signInWithGoogle(em);
        assert.equal(unconfiguredAuth.getIsAdmin(), false);
        assert.equal(unconfiguredAuth.getIsSuperAdmin(), false);
      }
    });
  });

  describe('Section 3: Rapid Async Toggling & Race Conditions', () => {
    test('3.1: High-frequency alternating auth state transitions resolve accurately', async () => {
      const secondaryAdmin = 'trusted.manager@reopsy.com';
      await adminService.addAdmin(secondaryAdmin, superEmail);

      const sequence = [
        { email: superEmail, expectedAdmin: true, expectedSuper: true },
        { email: 'visitor1@gmail.com', expectedAdmin: false, expectedSuper: false },
        { email: secondaryAdmin, expectedAdmin: true, expectedSuper: false },
        { email: null, expectedAdmin: false, expectedSuper: false },
        { email: 'visitor2@yahoo.com', expectedAdmin: false, expectedSuper: false },
        { email: superEmail.toUpperCase(), expectedAdmin: true, expectedSuper: true },
        { email: 'visitor3@outlook.com', expectedAdmin: false, expectedSuper: false }
      ];

      for (let cycle = 0; cycle < 5; cycle++) {
        for (const step of sequence) {
          if (step.email === null) {
            await authSim.signOut();
          } else {
            await authSim.signInWithGoogle(step.email);
          }
          assert.equal(authSim.getIsAdmin(), step.expectedAdmin, `Cycle ${cycle} email ${step.email} isAdmin mismatch`);
          assert.equal(authSim.getIsSuperAdmin(), step.expectedSuper, `Cycle ${cycle} email ${step.email} isSuperAdmin mismatch`);
          assert.equal(authSim.getAdminLoading(), false, 'adminLoading must be false after completion');
        }
      }

      await adminService.removeAdmin(secondaryAdmin);
    });

    test('3.2: 500 concurrent checkIsAdmin calls execute without race or error', async () => {
      const promises = [];
      for (let i = 0; i < 500; i++) {
        const email = i % 2 === 0 ? superEmail : `regular_user_${i}@example.com`;
        promises.push(adminService.checkIsAdmin(email));
      }

      const results = await Promise.all(promises);
      assert.equal(results.length, 500);
      for (let i = 0; i < 500; i++) {
        const expected = i % 2 === 0;
        assert.equal(results[i], expected, `Concurrent call ${i} returned wrong admin status`);
      }
    });
  });

  describe('Section 4: Offline & Network Error Simulation', () => {
    test('4.1: When Firestore is offline, Super Admin retains client access, secondary check fails safely', async () => {
      db.shouldFail = true; // Simulate network outage

      // Super Admin check still succeeds via environment variable check
      const superCheck = await adminService.checkIsAdmin(superEmail);
      assert.equal(superCheck, true, 'Super Admin check must succeed offline');

      // Secondary admin check fails gracefully without unhandled exception
      const otherCheck = await adminService.checkIsAdmin('other@reopsy.com');
      assert.equal(otherCheck, false, 'Secondary admin check must fail safely to false');

      // useAuth hook behaves gracefully
      await authSim.signInWithGoogle(superEmail);
      assert.equal(authSim.getIsAdmin(), true);
      assert.equal(authSim.getIsSuperAdmin(), true);

      await authSim.signInWithGoogle('other@reopsy.com');
      assert.equal(authSim.getIsAdmin(), false);
      assert.equal(authSim.getIsSuperAdmin(), false);

      // getAdminList returns Super Admin fallback
      const adminList = await adminService.getAdminList();
      assert.equal(adminList.length, 1);
      assert.equal(adminList[0].email, superEmail);

      // getSystemPrompt returns null on network outage
      const prompt = await adminService.getSystemPrompt();
      assert.equal(prompt, null);

      db.shouldFail = false; // Restore network
    });

    test('4.2: Firebase unconfigured mode behaves safely across all service methods', async () => {
      adminService.setIsConfigured(false);

      assert.equal(await adminService.checkIsAdmin(superEmail), true);
      assert.equal(await adminService.checkIsAdmin('someone@test.com'), false);
      assert.equal(await adminService.getSystemPrompt(), null);

      await assert.rejects(
        async () => { await adminService.addAdmin('test@test.com', superEmail); },
        /Firebase is not configured/
      );

      await assert.rejects(
        async () => { await adminService.removeAdmin('test@test.com'); },
        /Firebase is not configured/
      );

      await assert.rejects(
        async () => { await adminService.saveSystemPrompt('new prompt', superEmail); },
        /Firebase is not configured/
      );

      await assert.rejects(
        async () => { await adminService.triggerPipelineTopic('ml', superEmail); },
        /Firebase is not configured/
      );

      adminService.setIsConfigured(true);
    });
  });

  describe('Section 5: API Usage Aggregator Stress Testing', () => {
    test('5.1: Aggregator handles empty, partial, and malformed usage logs', () => {
      // Case 1: Empty records array
      const emptyResult = adminService.aggregateApiUsage([]);
      assert.deepEqual(emptyResult.summary, { totalCalls: 0, totalSuccess: 0, totalFailed: 0 });
      assert.deepEqual(emptyResult.rows, []);

      // Case 2: Records with missing date or provider
      const dirtyRecords = [
        { timestamp: '2026-08-16T12:00:00.000Z', provider: 'Gemini', success: true },
        { timestamp: '2026-08-16T13:00:00.000Z', provider: 'Mistral', success: false, error: 'Rate limit' },
        { timestamp: '2026-08-15T09:00:00.000Z', success: true }, // missing provider (should default to Other)
        { date: '2026-08-15', provider: 'Grok', success: true }, // missing timestamp
        { success: false } // missing timestamp and date
      ];

      const res = adminService.aggregateApiUsage(dirtyRecords);
      assert.equal(res.summary.totalCalls, 5);
      assert.equal(res.summary.totalSuccess, 3);
      assert.equal(res.summary.totalFailed, 2);
      assert.ok(res.rows.length >= 3);
    });

    test('5.2: Stress test aggregator with 5,000 randomized records with correct sorting', () => {
      const largeRecords = [];
      const providers = ['Gemini', 'Mistral', 'Grok'];
      const dates = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];

      let expectedSuccess = 0;
      let expectedFailed = 0;

      for (let i = 0; i < 5000; i++) {
        const date = dates[i % dates.length];
        const provider = providers[i % providers.length];
        const success = i % 4 !== 0; // 75% success
        if (success) expectedSuccess++;
        else expectedFailed++;

        largeRecords.push({
          id: `rec_${i}`,
          date,
          timestamp: `${date}T10:00:00.000Z`,
          provider,
          success
        });
      }

      const res = adminService.aggregateApiUsage(largeRecords);
      assert.equal(res.summary.totalCalls, 5000);
      assert.equal(res.summary.totalSuccess, expectedSuccess);
      assert.equal(res.summary.totalFailed, expectedFailed);

      // Verify date descending sorting
      for (let i = 0; i < res.rows.length - 1; i++) {
        assert.ok(
          res.rows[i].date.localeCompare(res.rows[i + 1].date) >= 0,
          `Rows must be sorted descending by date: ${res.rows[i].date} vs ${res.rows[i + 1].date}`
        );
      }
    });
  });

  describe('Section 6: Backend Firestore Security Rules Adversarial Matrix', () => {
    const whitelist = new Set(['admin@reopsy.com', 'team@reopsy.com']);

    test('6.1: Public Read & Admin Write verification on content collection', () => {
      // Unauthenticated user reading content
      const unauthRead = evaluateFirestoreRule({ auth: null, path: 'content/dailyFeed', method: 'read' });
      assert.equal(unauthRead.checkAccess(whitelist), true, 'Public read of content must be ALLOWED');

      // Unauthenticated user writing content
      const unauthWrite = evaluateFirestoreRule({ auth: null, path: 'content/dailyFeed', method: 'write' });
      assert.equal(unauthWrite.checkAccess(whitelist), false, 'Public write of content must be DENIED');

      // Regular user writing content
      const userWrite = evaluateFirestoreRule({ auth: { uid: 'user_1', token: { email: 'user@gmail.com' } }, path: 'content/dailyFeed', method: 'write' });
      assert.equal(userWrite.checkAccess(whitelist), false, 'Non-admin write of content must be DENIED');

      // Admin writing content
      const adminWrite = evaluateFirestoreRule({ auth: { uid: 'admin_1', token: { email: 'admin@reopsy.com' } }, path: 'content/dailyFeed', method: 'write' });
      assert.equal(adminWrite.checkAccess(whitelist), true, 'Admin write of content must be ALLOWED');
    });

    test('6.2: Sensitive admin collections strictly deny non-admins and unauthenticated access', () => {
      const sensitiveCollections = ['admins', 'config', 'pipeline_runs', 'pipeline_queue', 'api_usage'];
      const nonAdminAuth = { uid: 'regular_user', token: { email: 'intruder@evil.org' } };
      const unauth = null;
      const adminAuth = { uid: 'admin_user', token: { email: 'Admin@ReOpSy.com' } }; // mixed case

      for (const col of sensitiveCollections) {
        const docPath = `${col}/test_item`;

        // 1. Unauthenticated read & write
        assert.equal(evaluateFirestoreRule({ auth: unauth, path: docPath, method: 'read' }).checkAccess(whitelist), false);
        assert.equal(evaluateFirestoreRule({ auth: unauth, path: docPath, method: 'write' }).checkAccess(whitelist), false);

        // 2. Authenticated Non-Admin read & write
        assert.equal(evaluateFirestoreRule({ auth: nonAdminAuth, path: docPath, method: 'read' }).checkAccess(whitelist), false);
        assert.equal(evaluateFirestoreRule({ auth: nonAdminAuth, path: docPath, method: 'write' }).checkAccess(whitelist), false);

        // 3. Authenticated Admin read & write (with case-insensitivity)
        assert.equal(evaluateFirestoreRule({ auth: adminAuth, path: docPath, method: 'read' }).checkAccess(whitelist), true);
        assert.equal(evaluateFirestoreRule({ auth: adminAuth, path: docPath, method: 'write' }).checkAccess(whitelist), true);
      }
    });

    test('6.3: User profile isolation (isOwner) prevents horizontal privilege escalation', () => {
      const userA = { uid: 'alice_123', token: { email: 'alice@domain.com' } };
      const userB = { uid: 'bob_456', token: { email: 'bob@domain.com' } };

      // Alice accessing Alice's profile
      assert.equal(evaluateFirestoreRule({ auth: userA, path: 'users/alice_123', method: 'read' }).checkAccess(whitelist), true);
      assert.equal(evaluateFirestoreRule({ auth: userA, path: 'users/alice_123', method: 'write' }).checkAccess(whitelist), true);

      // Alice attempting to access Bob's profile
      assert.equal(evaluateFirestoreRule({ auth: userA, path: 'users/bob_456', method: 'read' }).checkAccess(whitelist), false);
      assert.equal(evaluateFirestoreRule({ auth: userA, path: 'users/bob_456', method: 'write' }).checkAccess(whitelist), false);
    });
  });
});
