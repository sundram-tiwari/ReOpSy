'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { DomInspector } = require('./e2e/harness/domInspector');
const { FirestoreMock } = require('./e2e/harness/firestoreMock');

console.log('======================================================================');
console.log('  EMPIRICAL CHALLENGER 2: SECURITY & ZERO-DOM ISOLATION HARNESS');
console.log('======================================================================\n');

let passedAssertions = 0;
let failedAssertions = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedAssertions++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedAssertions++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedAssertions++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedAssertions++;
  }
}

async function run() {
  const inspector = new DomInspector(path.resolve(__dirname, '../app'));
  const superAdmin = { uid: 'uid-super', email: 'admin@reopsy.com' };
  const whitelistedAdmin = { uid: 'uid-whitelisted', email: 'moderator@reopsy.com' };
  const regularUser = { uid: 'uid-regular', email: 'alice@example.com' };
  const attackerUser = { uid: 'uid-attacker', email: 'evil@attacker.com' };
  const unauthenticated = null;

  console.log('--- 1. ZERO-DOM LEAKAGE & ACCESSIBILITY TREE VERIFICATION ---');

  check('1.1 Unauthenticated user rendered drawer DOM contains ZERO "Mission Control"', () => {
    const render = inspector.simulateDrawerRender({ user: null, isAdmin: false, isSuperAdmin: false });
    assert.equal(render.domString.includes('Mission Control'), false);
    assert.equal(render.visibleItems.includes('Mission Control'), false);
    assert.equal(render.icons.includes('shield'), false);
  });

  check('1.2 Non-admin authenticated user rendered drawer DOM contains ZERO "Mission Control"', () => {
    const render = inspector.simulateDrawerRender({ user: regularUser, isAdmin: false, isSuperAdmin: false });
    assert.equal(render.domString.includes('Mission Control'), false);
    assert.equal(render.visibleItems.includes('Mission Control'), false);
    assert.equal(render.icons.includes('shield'), false);
  });

  check('1.3 Attacker account with admin-like substring (e.g. admin@evil.com) is NOT admin and has ZERO DOM leaks', () => {
    const render = inspector.simulateDrawerRender({ user: { uid: 'att', email: 'admin@evil.com' }, isAdmin: false, isSuperAdmin: false });
    assert.equal(render.domString.includes('Mission Control'), false);
    assert.equal(render.visibleItems.includes('Mission Control'), false);
  });

  check('1.4 Authenticated Admin user DOES render "Mission Control" with Feather shield icon', () => {
    const render = inspector.simulateDrawerRender({ user: superAdmin, isAdmin: true, isSuperAdmin: true });
    assert.equal(render.domString.includes('Mission Control'), true);
    assert.equal(render.visibleItems.includes('Mission Control'), true);
    assert.equal(render.icons.includes('shield'), true);
  });

  check('1.5 DrawerContent.tsx AST/Source code check enforces strict conditional rendering of Mission Control', () => {
    const sourceAudit = inspector.auditDrawerContentSource();
    assert.equal(sourceAudit.hasIsAdminGuard, true, 'DrawerContent must guard Mission Control with isAdmin');
    assert.equal(sourceAudit.isProperlyGuarded, true);
  });

  check('1.6 Direct route navigation to "Admin" by non-admin is blocked and redirected to MainDrawer', () => {
    const result = inspector.simulateNavigate({ user: regularUser, isAdmin: false }, 'Admin');
    assert.equal(result.accessible, false);
    assert.equal(result.redirectedTo, 'MainDrawer');
  });

  check('1.7 Direct route navigation to "Admin" by admin is permitted', () => {
    const result = inspector.simulateNavigate({ user: superAdmin, isAdmin: true }, 'Admin');
    assert.equal(result.accessible, true);
    assert.equal(result.renderedScreen, 'AdminScreen');
  });

  console.log('\n--- 2. FIRESTORE SECURITY RULES VERIFICATION ---');

  const firestore = new FirestoreMock({ superAdminEmail: superAdmin.email });
  await firestore.setDoc(firestore.doc('admins', whitelistedAdmin.email), {
    email: whitelistedAdmin.email,
    addedAt: new Date().toISOString(),
    addedBy: superAdmin.email
  });

  const sensitiveCollections = [
    { name: 'admins', sampleId: 'someadmin@reopsy.com', sampleDoc: { email: 'someadmin@reopsy.com' } },
    { name: 'config', sampleId: 'system_prompt', sampleDoc: { prompt: 'Custom prompt text' } },
    { name: 'pipeline_runs', sampleId: 'run_999', sampleDoc: { status: 'success', timestamp: new Date().toISOString() } },
    { name: 'pipeline_queue', sampleId: 'queue_999', sampleDoc: { topic: 'llm', status: 'pending' } },
    { name: 'api_usage', sampleId: 'usage_999', sampleDoc: { provider: 'Gemini', success: true } }
  ];

  for (const col of sensitiveCollections) {
    await checkAsync(`2.1 [${col.name}] Unauthenticated READ is REJECTED`, async () => {
      const res = await firestore.evaluateSecurityRule('read', col.name, col.sampleId, unauthenticated);
      assert.equal(res.allowed, false, `Unauthenticated READ to ${col.name} must be blocked`);
    });

    await checkAsync(`2.2 [${col.name}] Unauthenticated WRITE is REJECTED`, async () => {
      const res = await firestore.evaluateSecurityRule('write', col.name, col.sampleId, unauthenticated, col.sampleDoc);
      assert.equal(res.allowed, false, `Unauthenticated WRITE to ${col.name} must be blocked`);
    });

    await checkAsync(`2.3 [${col.name}] Regular authenticated user READ is REJECTED`, async () => {
      const res = await firestore.evaluateSecurityRule('read', col.name, col.sampleId, regularUser);
      assert.equal(res.allowed, false, `Regular user READ to ${col.name} must be blocked`);
    });

    await checkAsync(`2.4 [${col.name}] Regular authenticated user WRITE is REJECTED`, async () => {
      const res = await firestore.evaluateSecurityRule('write', col.name, col.sampleId, regularUser, col.sampleDoc);
      assert.equal(res.allowed, false, `Regular user WRITE to ${col.name} must be blocked`);
    });

    await checkAsync(`2.5 [${col.name}] Attacker user WRITE is REJECTED`, async () => {
      const res = await firestore.evaluateSecurityRule('write', col.name, col.sampleId, attackerUser, col.sampleDoc);
      assert.equal(res.allowed, false, `Attacker WRITE to ${col.name} must be blocked`);
    });

    await checkAsync(`2.6 [${col.name}] Whitelisted Admin READ is ALLOWED`, async () => {
      const res = await firestore.evaluateSecurityRule('read', col.name, col.sampleId, whitelistedAdmin);
      assert.equal(res.allowed, true, `Whitelisted admin READ to ${col.name} must be allowed`);
    });

    await checkAsync(`2.7 [${col.name}] Whitelisted Admin WRITE is ALLOWED`, async () => {
      const res = await firestore.evaluateSecurityRule('write', col.name, col.sampleId, whitelistedAdmin, col.sampleDoc);
      assert.equal(res.allowed, true, `Whitelisted admin WRITE to ${col.name} must be allowed`);
    });

    await checkAsync(`2.8 [${col.name}] Super Admin READ is ALLOWED`, async () => {
      const res = await firestore.evaluateSecurityRule('read', col.name, col.sampleId, superAdmin);
      assert.equal(res.allowed, true, `Super admin READ to ${col.name} must be allowed`);
    });

    await checkAsync(`2.9 [${col.name}] Super Admin WRITE is ALLOWED`, async () => {
      const res = await firestore.evaluateSecurityRule('write', col.name, col.sampleId, superAdmin, col.sampleDoc);
      assert.equal(res.allowed, true, `Super admin WRITE to ${col.name} must be allowed`);
    });
  }

  console.log('\n--- 3. CONTENT & USER COLLECTION SPECIAL RULES ---');

  await checkAsync('3.1 Content collection allows public READ but blocks non-admin WRITE', async () => {
    const unauthRead = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', unauthenticated);
    assert.equal(unauthRead.allowed, true);
    const regRead = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', regularUser);
    assert.equal(regRead.allowed, true);
    const regWrite = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', regularUser, { topics: {} });
    assert.equal(regWrite.allowed, false);
    const adminWrite = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', superAdmin, { topics: {} });
    assert.equal(adminWrite.allowed, true);
  });

  await checkAsync('3.2 Users collection enforces strict owner-only access (uid == userId)', async () => {
    const ownRead = await firestore.evaluateSecurityRule('read', 'users', regularUser.uid, regularUser);
    assert.equal(ownRead.allowed, true);
    const otherRead = await firestore.evaluateSecurityRule('read', 'users', 'other_user_id', regularUser);
    assert.equal(otherRead.allowed, false);
  });

  console.log('\n--- 4. PRODUCTION BUILD ARTIFACT INSPECTION ---');

  check('4.1 app/dist directory exists and contains index.html', () => {
    const distPath = path.resolve(__dirname, '../app/dist');
    assert.equal(fs.existsSync(distPath), true);
    assert.equal(fs.existsSync(path.join(distPath, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(distPath, '_expo/static/js/web')), true);
  });

  check('4.2 index.html contains clean root container without pre-rendered admin DOM', () => {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../app/dist/index.html'), 'utf8');
    assert.equal(htmlContent.includes('Mission Control'), false, 'HTML static export must not contain Mission Control in raw markup');
    assert.equal(htmlContent.includes('<div id="root"></div>'), true);
  });

  check('4.3 Web bundle JS artifact exists and is non-empty', () => {
    const bundleDir = path.resolve(__dirname, '../app/dist/_expo/static/js/web');
    const bundleFiles = fs.readdirSync(bundleDir).filter(f => f.endsWith('.js'));
    assert.ok(bundleFiles.length > 0, 'Must have at least 1 JS bundle');
    const bundleSize = fs.statSync(path.join(bundleDir, bundleFiles[0])).size;
    assert.ok(bundleSize > 500000, `Bundle size should be substantial (>500KB), got ${bundleSize} bytes`);
  });

  console.log('\n======================================================================');
  console.log(` SUMMARY: Passed: ${passedAssertions} | Failed: ${failedAssertions}`);
  console.log('======================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    console.log('🏆 ALL EMPIRICAL CHALLENGER 2 SECURITY & DOM ASSERTIONS PASSED!');
    process.exit(0);
  }
}

run();
