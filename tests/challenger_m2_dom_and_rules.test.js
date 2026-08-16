'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { AuthEmulator, FirestoreMock, DomInspector } = require('./e2e/harness');

describe('Empirical Challenger 2: Non-Admin DOM Isolation & Firestore Security Rules Verification', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const regularUserEmail = 'regular.student@university.edu';
  const attackerEmail = 'attacker@evil.com';

  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  // --------------------------------------------------------------------------
  // SECTION 1: STRICT DOM ISOLATION & ZERO LEAKAGE
  // --------------------------------------------------------------------------
  describe('1. DOM Isolation & Zero Leakage Verification', () => {
    test('1.1 Unauthenticated state: Zero "Mission Control" or admin artifacts in rendered DOM', () => {
      const rendered = inspector.simulateDrawerRender({ user: null, isAdmin: false, isSuperAdmin: false });
      assert.equal(rendered.visibleItems.includes('Mission Control'), false, 'Mission Control must not be in visible items');
      assert.equal(rendered.icons.includes('shield'), false, 'Shield icon must not be in visible icons');
      assert.equal(rendered.domString.includes('Mission Control'), false, 'DOM string must not contain Mission Control');

      const audit = inspector.auditZeroDomLeakage(rendered.domString);
      assert.equal(audit.hasAdminLeak, false, 'auditZeroDomLeakage must report zero leaks');
      assert.deepEqual(audit.leakedTerms, []);
    });

    test('1.2 Authenticated regular non-admin user: Zero "Mission Control" or admin artifacts in rendered DOM', async () => {
      await auth.signInWithGoogle(regularUserEmail, 'Regular Student');
      const authState = await auth.getAuthContextState();

      assert.equal(authState.isAdmin, false);
      assert.equal(authState.isSuperAdmin, false);

      const rendered = inspector.simulateDrawerRender(authState);
      assert.equal(rendered.visibleItems.includes('Mission Control'), false);
      assert.equal(rendered.icons.includes('shield'), false);
      assert.equal(rendered.domString.includes('Mission Control'), false);

      const audit = inspector.auditZeroDomLeakage(rendered.domString);
      assert.equal(audit.hasAdminLeak, false);
      assert.deepEqual(audit.leakedTerms, []);
    });

    test('1.3 Adversarial user with spoofed claims in email name: Still 0 occurrences in DOM', async () => {
      await auth.signInWithGoogle('admin.impostor@notadmin.com', 'Admin Impostor');
      const authState = await auth.getAuthContextState();

      assert.equal(authState.isAdmin, false);
      const rendered = inspector.simulateDrawerRender(authState);
      assert.equal(rendered.visibleItems.includes('Mission Control'), false);
      assert.equal(rendered.domString.includes('Mission Control'), false);
      const audit = inspector.auditZeroDomLeakage(rendered.domString);
      assert.equal(audit.hasAdminLeak, false);
    });

    test('1.4 Source code inspection of DrawerContent.tsx: Strict conditional guard on Mission Control', () => {
      const drawerAudit = inspector.auditDrawerContentSource();
      assert.equal(drawerAudit.isProperlyGuarded, true, 'DrawerContent must guard Mission Control with isAdmin');
      assert.equal(drawerAudit.hasIsAdminGuard, true, 'DrawerContent must have isAdmin guard');
    });

    test('1.5 Direct navigation simulation: Non-admin navigation to "Admin" route is intercepted and redirected', () => {
      const unauthNav = inspector.simulateNavigate({ user: null, isAdmin: false }, 'Admin');
      assert.equal(unauthNav.accessible, false);
      assert.equal(unauthNav.redirectedTo, 'MainDrawer');

      const regularNav = inspector.simulateNavigate({ user: { uid: 'u1', email: regularUserEmail }, isAdmin: false }, 'Admin');
      assert.equal(regularNav.accessible, false);
      assert.equal(regularNav.redirectedTo, 'MainDrawer');
    });

    test('1.6 Direct navigation simulation: Admin navigation to "Admin" route is allowed', () => {
      const adminNav = inspector.simulateNavigate({ user: { uid: 'a1', email: superAdminEmail }, isAdmin: true }, 'Admin');
      assert.equal(adminNav.accessible, true);
      assert.equal(adminNav.renderedScreen, 'AdminScreen');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: FIRESTORE SECURITY RULES VERIFICATION
  // --------------------------------------------------------------------------
  describe('2. Firestore Security Rules Enforcement', () => {
    const restrictedCollections = ['admins', 'config', 'pipeline_runs', 'pipeline_queue', 'api_usage'];

    test('2.1 Unauthenticated actors: Blocked from read and write on all 5 restricted collections', async () => {
      for (const col of restrictedCollections) {
        const readEval = await firestore.evaluateSecurityRule('read', col, 'doc_123', null);
        assert.equal(readEval.allowed, false, `Unauthenticated read on ${col} must be blocked`);

        const writeEval = await firestore.evaluateSecurityRule('write', col, 'doc_123', null, { malicious: true });
        assert.equal(writeEval.allowed, false, `Unauthenticated write on ${col} must be blocked`);
      }
    });

    test('2.2 Authenticated non-admin user: Blocked from read and write on all 5 restricted collections', async () => {
      const regularUser = { uid: 'student_uid_456', email: regularUserEmail };

      for (const col of restrictedCollections) {
        const readEval = await firestore.evaluateSecurityRule('read', col, 'doc_123', regularUser);
        assert.equal(readEval.allowed, false, `Non-admin read on ${col} must be blocked`);

        const writeEval = await firestore.evaluateSecurityRule('write', col, 'doc_123', regularUser, { dummy: 'test' });
        assert.equal(writeEval.allowed, false, `Non-admin write on ${col} must be blocked`);
      }
    });

    test('2.3 Authenticated attacker attempting unauthorized admin whitelist manipulation: Blocked', async () => {
      const attacker = { uid: 'attacker_uid', email: attackerEmail };

      // Attempt to read admin whitelist
      const readAdmins = await firestore.evaluateSecurityRule('read', 'admins', attackerEmail, attacker);
      assert.equal(readAdmins.allowed, false, 'Attacker cannot read admin collection');

      // Attempt to insert self into admin whitelist
      const writeAdmins = await firestore.evaluateSecurityRule('write', 'admins', attackerEmail, attacker, { email: attackerEmail, role: 'admin' });
      assert.equal(writeAdmins.allowed, false, 'Attacker cannot write to admin collection');
    });

    test('2.4 Authenticated admin user: Allowed read and write on all 5 restricted collections', async () => {
      const adminUser = { uid: 'superadmin_uid', email: superAdminEmail };

      for (const col of restrictedCollections) {
        const readEval = await firestore.evaluateSecurityRule('read', col, 'doc_123', adminUser);
        assert.equal(readEval.allowed, true, `Admin read on ${col} must be allowed`);

        const writeEval = await firestore.evaluateSecurityRule('write', col, 'doc_123', adminUser, { field: 'val' });
        assert.equal(writeEval.allowed, true, `Admin write on ${col} must be allowed`);
      }
    });

    test('2.5 Public feed and User Profile access rules compliance', async () => {
      const regularUser = { uid: 'student_uid_456', email: regularUserEmail };
      const otherUser = { uid: 'other_uid_789', email: 'other@university.edu' };

      // Content collection: public read allowed for unauth and regular
      const unauthContentRead = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', null);
      assert.equal(unauthContentRead.allowed, true, 'Public read of content must be allowed');

      const regularContentRead = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', regularUser);
      assert.equal(regularContentRead.allowed, true, 'User read of content must be allowed');

      // Content write: denied to regular user, allowed to admin
      const regularContentWrite = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', regularUser, { test: 1 });
      assert.equal(regularContentWrite.allowed, false, 'Non-admin content write must be denied');

      const adminContentWrite = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', { uid: 'admin_1', email: superAdminEmail }, { test: 1 });
      assert.equal(adminContentWrite.allowed, true, 'Admin content write must be allowed');

      // User profile isolation: owner only
      const ownerRead = await firestore.evaluateSecurityRule('read', 'users', regularUser.uid, regularUser);
      assert.equal(ownerRead.allowed, true, 'Owner read must be allowed');

      const crossUserRead = await firestore.evaluateSecurityRule('read', 'users', regularUser.uid, otherUser);
      assert.equal(crossUserRead.allowed, false, 'Cross-user read must be denied');

      const unauthUserRead = await firestore.evaluateSecurityRule('read', 'users', regularUser.uid, null);
      assert.equal(unauthUserRead.allowed, false, 'Unauthenticated user read must be denied');
    });

    test('2.6 Actual firestore.rules file syntax and rule structure validation', () => {
      const rulesPath = path.resolve(__dirname, '../app/firestore.rules');
      assert.equal(fs.existsSync(rulesPath), true, 'app/firestore.rules file must exist');

      const rulesContent = fs.readFileSync(rulesPath, 'utf8');

      // Check rules version
      assert.match(rulesContent, /rules_version\s*=\s*'2';/);

      // Check isAdmin definition
      assert.match(rulesContent, /function\s+isAdmin\(\)/);
      assert.match(rulesContent, /exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.token\.email/);

      // Check matched collections
      for (const col of restrictedCollections) {
        const regex = new RegExp(`match\\s+\\/${col}\\/\\{[^}]+\\}\\s*\\{\\s*allow\\s+read,\\s*write:\\s*if\\s+isAdmin\\(\\);`, 'm');
        assert.match(rulesContent, regex, `firestore.rules must enforce isAdmin() for /${col}/{doc}`);
      }

      // Check users collection isOwner
      assert.match(rulesContent, /match\s+\/users\/\{userId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isOwner\(userId\);/);

      // Check content collection
      assert.match(rulesContent, /match\s+\/content\/\{contentId\}\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+isAdmin\(\);/);
    });
  });
});
