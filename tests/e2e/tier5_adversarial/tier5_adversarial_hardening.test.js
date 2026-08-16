'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { FirestoreMock } = require('../harness/firestoreMock');
const { AuthEmulator } = require('../harness/authEmulator');
const { DomInspector } = require('../harness/domInspector');
const {
  formatPrompt,
  getSystemPrompt,
  logApiUsage,
  sanitizeError,
  DEFAULT_SYSTEM_PROMPT
} = require('../../../backend/pipeline/llm');
const {
  logPipelineRun,
  processPipelineQueue,
  applyContentOverrides
} = require('../../../backend/pipeline/fetchAndSummarize');

describe('Tier 5 — Adversarial Coverage Hardening & Chaos Testing Suite', () => {
  const SUPER_ADMIN = 'superadmin@reopsy.com';
  const WHITELISTED_ADMIN = 'authorized.curator@reopsy.com';
  const REGULAR_USER = 'hacker.curious@untrusted.org';

  // =========================================================================
  // 1. CORRUPTED & MALFORMED FIRESTORE PAYLOADS
  // =========================================================================
  describe('T5.1: Corrupted & Malformed Firestore Payload Resilience', () => {
    test('T5.1.1: applyContentOverrides survives corrupted dailyFeed schema (null topics, non-array papers, missing IDs)', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });

      // Corrupted content/dailyFeed documents
      const malformedPayloads = [
        null,
        {},
        { topics: null },
        { topics: 'not-an-object' },
        { topics: { ml: null, nlp: 'string-instead-of-array', cv: 12345 } },
        {
          topics: {
            ml: [
              null,
              undefined,
              {},
              { noId: true, originalTitle: 'Missing ID' },
              { id: 'p1', catchyTitle: null, summary: null },
              { id: 'p2', authors: 'not-an-array', year: 'two-thousand-twenty-four' }
            ]
          }
        }
      ];

      for (const payload of malformedPayloads) {
        if (payload) {
          await firestore.setDoc(firestore.doc('content', 'dailyFeed'), payload);
        }

        const baseFeed = {
          generatedAt: new Date().toISOString(),
          topics: {
            ml: [
              {
                id: 'p1',
                originalTitle: 'Original P1',
                catchyTitle: 'Catchy P1',
                summary: 'Summary P1',
                source: 'arxiv',
                url: 'https://arxiv.org/abs/1'
              }
            ],
            cv: [
              {
                id: 'cv1',
                originalTitle: 'CV 1',
                catchyTitle: 'Catchy CV',
                summary: 'Summary CV',
                source: 'openalex',
                url: 'https://openalex.org/1'
              }
            ]
          }
        };

        const result = await applyContentOverrides(baseFeed, firestore);
        assert.ok(result, 'applyContentOverrides must return feedData object');
        assert.ok(result.topics, 'feedData must preserve topics object');
        assert.ok(Array.isArray(result.topics.ml), 'ml topic must remain an array');
        assert.ok(result.topics.ml.length > 0, 'ml topic must contain papers');
      }
    });

    test('T5.1.2: logPipelineRun handles extreme numbers, non-array errors, circular structures, and huge payloads', async () => {
      const firestore = new FirestoreMock();

      const extremeRuns = [
        {
          runId: 'corrupted_1',
          topicCounts: { ml: -50, cv: NaN, nlp: Infinity, robotics: 'five' },
          totalPapers: -100,
          errors: 'single string instead of array'
        },
        {
          runId: 'corrupted_2',
          topicCounts: null,
          totalPapers: undefined,
          errors: [
            { error: 'Standard error object' },
            { nested: { deep: 'error structure' } },
            'A'.repeat(5000) // Giant error message
          ]
        },
        {
          runId: 'corrupted_3',
          timestamp: 'invalid-date-string-xyz',
          status: 'unknown_status_code',
          durationMs: 'not-a-number'
        }
      ];

      for (const runData of extremeRuns) {
        const logged = await logPipelineRun(firestore, runData);
        assert.ok(logged, 'Must return logged docData');
        assert.ok(logged.runId, 'Must have runId');
        assert.ok(Array.isArray(logged.errors), 'errors must be normalized to array');

        // Check in Firestore
        const saved = (await firestore.getDoc(firestore.doc('pipeline_runs', logged.runId))).data();
        assert.ok(saved, 'Saved document must exist in pipeline_runs');
        assert.ok(Array.isArray(saved.errors), 'errors in firestore must be an array');
        assert.ok(['success', 'partial', 'failed', 'unknown_status_code'].includes(saved.status));
      }
    });

    test('T5.1.3: logApiUsage handles malformed data, non-boolean success, negative token counts, and unknown providers', async () => {
      const firestore = new FirestoreMock();

      const malformedUsage = [
        { provider: 'UnknownProviderXYZ', success: 'yes', tokenCount: -50 },
        { provider: '', success: 1, tokenCount: NaN },
        { provider: null, success: 0, error: 'Database timeout at host: https://api.reopsy.com?key=SECRET_AIZA_KEY_123' },
        { provider: 12345, success: false, error: new Error('Runtime error with Bearer super_secret_token_abc') }
      ];

      for (const usage of malformedUsage) {
        const logged = await logApiUsage(firestore, usage);
        assert.ok(logged, 'logApiUsage must return logged record');
        assert.equal(typeof logged.success, 'boolean', 'success must be boolean');

        // Check error credential sanitization
        if (logged.error) {
          assert.equal(logged.error.includes('SECRET_AIZA_KEY_123'), false, 'API key must be sanitized');
          assert.equal(logged.error.includes('super_secret_token_abc'), false, 'Bearer token must be sanitized');
          assert.ok(logged.error.includes('***'), 'Sanitized error must contain mask asterisks');
        }
      }
    });

    test('T5.1.4: Prototype pollution & reserved keyword injection in admins collection documents', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });
      const auth = new AuthEmulator({ superAdminEmail: SUPER_ADMIN, firestore });

      const maliciousKeys = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        'admin@reopsy.com/../../../etc/passwd'
      ];

      for (const key of maliciousKeys) {
        await firestore.setDoc(firestore.doc('admins', key), {
          email: key,
          addedAt: new Date().toISOString(),
          addedBy: 'attacker'
        });

        // Test that resolving a normal user does not get polluted
        const regularState = await auth.resolveAdminStatus({ email: 'normal.user@gmail.com' });
        assert.equal(regularState.isAdmin, false, `Prototype key ${key} must not elevate normal user`);

        // Test security rules
        const ruleEval = await firestore.evaluateSecurityRule('read', 'admins', key, { uid: 'u1', email: 'normal.user@gmail.com' });
        assert.equal(ruleEval.allowed, false, `Normal user must be denied access to admins/${key}`);
      }
    });
  });

  // =========================================================================
  // 2. RAPID AUTH STATE CHANGES & RE-RENDERS
  // =========================================================================
  describe('T5.2: Rapid Auth State Transitions & Zero-Leakage Resilience', () => {
    test('T5.2.1: 50 rapid auth state flip-flops between Anonymous, Regular, Admin, SuperAdmin, and LoggedOut', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });
      await firestore.setDoc(firestore.doc('admins', WHITELISTED_ADMIN), {
        email: WHITELISTED_ADMIN,
        addedAt: new Date().toISOString(),
        addedBy: SUPER_ADMIN
      });

      const auth = new AuthEmulator({ superAdminEmail: SUPER_ADMIN, firestore });
      const inspector = new DomInspector();

      const userStates = [
        { type: 'anon', email: null },
        { type: 'regular', email: REGULAR_USER },
        { type: 'whitelisted', email: WHITELISTED_ADMIN },
        { type: 'super', email: SUPER_ADMIN },
        { type: 'logout', email: null },
        { type: 'regular', email: 'other.regular@university.edu' },
        { type: 'whitelisted', email: WHITELISTED_ADMIN },
        { type: 'logout', email: null }
      ];

      // Execute 50 rapid state changes
      for (let i = 0; i < 50; i++) {
        const target = userStates[i % userStates.length];
        if (target.email) {
          await auth.signInWithGoogle(target.email, `User ${i}`);
        } else {
          await auth.signOut();
        }

        const state = await auth.getAuthContextState();
        const drawerDom = inspector.simulateDrawerRender(state);
        const navResult = inspector.simulateNavigate(state, 'Admin');

        if (target.type === 'super') {
          assert.equal(state.isAdmin, true, `Cycle ${i}: Super admin must be isAdmin`);
          assert.equal(state.isSuperAdmin, true, `Cycle ${i}: Super admin must be isSuperAdmin`);
          assert.ok(drawerDom.domString.includes('Mission Control'), `Cycle ${i}: Drawer must render Mission Control`);
          assert.equal(navResult.accessible, true, `Cycle ${i}: Admin route must be accessible`);
        } else if (target.type === 'whitelisted') {
          assert.equal(state.isAdmin, true, `Cycle ${i}: Whitelisted admin must be isAdmin`);
          assert.equal(state.isSuperAdmin, false, `Cycle ${i}: Whitelisted admin must NOT be isSuperAdmin`);
          assert.ok(drawerDom.domString.includes('Mission Control'), `Cycle ${i}: Drawer must render Mission Control`);
          assert.equal(navResult.accessible, true, `Cycle ${i}: Admin route must be accessible`);
        } else {
          // Regular or LoggedOut / Anon
          assert.equal(state.isAdmin, false, `Cycle ${i}: Non-admin must NOT have isAdmin`);
          assert.equal(state.isSuperAdmin, false, `Cycle ${i}: Non-admin must NOT have isSuperAdmin`);
          assert.equal(
            drawerDom.domString.includes('Mission Control'),
            false,
            `Cycle ${i}: ZERO DOM LEAKAGE: Mission Control must NOT appear for non-admin`
          );
          assert.equal(navResult.accessible, false, `Cycle ${i}: Admin route must NOT be accessible`);
          assert.equal(navResult.redirectedTo, 'MainDrawer', `Cycle ${i}: Non-admin must redirect to MainDrawer`);
        }
      }
    });

    test('T5.2.2: Dynamic revoking of admin privileges takes effect on next auth resolution', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });
      const revokedAdminEmail = 'temporary.admin@reopsy.com';

      // 1. Add to whitelist
      await firestore.setDoc(firestore.doc('admins', revokedAdminEmail), {
        email: revokedAdminEmail,
        addedAt: new Date().toISOString(),
        addedBy: SUPER_ADMIN
      });

      const auth = new AuthEmulator({ superAdminEmail: SUPER_ADMIN, firestore });
      await auth.signInWithGoogle(revokedAdminEmail, 'Temp Admin');

      let state = await auth.getAuthContextState();
      assert.equal(state.isAdmin, true, 'User should initially be admin');

      // 2. Remove from whitelist in Firestore
      await firestore.deleteDoc(firestore.doc('admins', revokedAdminEmail));

      // 3. Re-resolve admin status
      state = await auth.getAuthContextState();
      assert.equal(state.isAdmin, false, 'User must immediately lose admin access once removed from Firestore');
    });
  });

  // =========================================================================
  // 3. FLASHCARD XSS / HTML INJECTION IN TITLES AND SUMMARIES
  // =========================================================================
  describe('T5.3: Flashcard XSS & HTML Injection Inoculation', () => {
    const adversarialPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror="alert(\'XSS\')" />',
      '"><svg onload=alert(document.cookie)>',
      'javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>',
      '"><iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
      '"><a href="javascript:alert(1)">Click for Free Crypto</a>',
      '\u0000<script>alert(1)</script>',
      '{{constructor.constructor("alert(1)")()}}',
      '${7*7}',
      '\u202E\u202D\uFEFF<bdo dir="rtl">Hebrew/Arabic text</bdo>',
      'DROP TABLE papers; -- <script>test</script>'
    ];

    test('T5.3.1: applyContentOverrides safely handles XSS payloads in titles, summaries, and URLs without execution or corruption', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });

      for (let i = 0; i < adversarialPayloads.length; i++) {
        const payload = adversarialPayloads[i];
        const paperId = `xss-paper-${i}`;

        const baseFeed = {
          generatedAt: new Date().toISOString(),
          topics: {
            cybersecurity: [
              {
                id: paperId,
                originalTitle: `Vulnerability Research ${i}`,
                catchyTitle: `Catchy Title ${i}`,
                summary: `Standard Summary ${i}`,
                authors: ['Security Researcher'],
                source: 'arxiv',
                year: 2024,
                venue: 'IEEE S&P',
                url: 'https://arxiv.org/abs/2401.0001'
              }
            ]
          }
        };

        // Admin injects raw XSS payload as catchy title and summary
        await firestore.setDoc(firestore.doc('content', 'dailyFeed'), {
          topics: {
            cybersecurity: [
              {
                id: paperId,
                catchyTitle: payload,
                summary: `Injected Summary: ${payload}`,
                url: `javascript:alert(${i})`,
                authors: [`Author <script>${i}</script>`]
              }
            ]
          }
        });

        const overriddenFeed = await applyContentOverrides(baseFeed, firestore);
        const paper = overriddenFeed.topics.cybersecurity.find(p => p.id === paperId);

        assert.ok(paper, `Paper ${paperId} must exist in overridden feed`);
        assert.equal(paper.catchyTitle, payload, 'Payload must be preserved as literal string');
        assert.equal(paper.summary, `Injected Summary: ${payload}`);

        // Verify JSON round-trip serialization safety
        const serialized = JSON.stringify(overriddenFeed);
        const deserialized = JSON.parse(serialized);
        assert.ok(deserialized.topics.cybersecurity[0].catchyTitle);
      }
    });

    test('T5.3.2: XSS in paper fields does not cause DOM leakage or break DOM inspector', () => {
      const inspector = new DomInspector();
      for (const payload of adversarialPayloads) {
        const simulatedContext = {
          user: { uid: 'u1', email: payload },
          isAdmin: false,
          isSuperAdmin: false
        };

        const drawer = inspector.simulateDrawerRender(simulatedContext);
        assert.equal(
          drawer.domString.includes('Mission Control'),
          false,
          `Payload in email (${payload}) must NOT cause Mission Control to render`
        );
      }
    });
  });

  // =========================================================================
  // 4. EMPTY, OVERSIZED, OR SPECIAL-CHARACTER PROMPT TEMPLATES
  // =========================================================================
  describe('T5.4: System Prompt Template Extremes & Format Robustness', () => {
    test('T5.4.1: formatPrompt handles empty, whitespace, null, and missing parameters', () => {
      const testTitle = 'Quantum Machine Learning Advances';
      const testSummary = 'We present quantum algorithms for deep learning speedup.';

      // Empty string -> fallback to default
      const r1 = formatPrompt('', testTitle, testSummary);
      assert.ok(r1.includes(testTitle), 'Must include title when template is empty');
      assert.ok(r1.includes(testSummary), 'Must include summary when template is empty');

      // Whitespace only
      const r2 = formatPrompt('   \n\t  ', testTitle, testSummary);
      assert.ok(r2.includes(testTitle));

      // Null template
      const r3 = formatPrompt(null, testTitle, testSummary);
      assert.ok(r3.includes(testTitle));

      // Missing title and summary
      const r4 = formatPrompt('Rewrite: {{originalTitle}} - {{summary}}');
      assert.equal(r4, 'Rewrite:  - ');
    });

    test('T5.4.2: formatPrompt handles templates without explicit placeholders by appending context', () => {
      const templateNoPlaceholders = 'Create a punchy headline in 5 words.';
      const testTitle = 'Graph Neural Networks in 2026';
      const testSummary = 'A comprehensive survey on GNN architectures.';

      const formatted = formatPrompt(templateNoPlaceholders, testTitle, testSummary);
      assert.ok(formatted.startsWith(templateNoPlaceholders));
      assert.ok(formatted.includes(`Original Title: ${testTitle}`));
      assert.ok(formatted.includes(`Summary: ${testSummary}`));
    });

    test('T5.4.3: formatPrompt survives RegExp replacement tokens ($$, $&, $1, $`, $\') without corruption', () => {
      const template = 'Template: {{originalTitle}} with summary: {{summary}}';
      const dangerousTitle = 'Title with $1 and $& and $$ and $\' and $` symbols';
      const dangerousSummary = 'Summary with $2 and $100 and $$$$ dollars';

      const formatted = formatPrompt(template, dangerousTitle, dangerousSummary);
      assert.ok(formatted.includes('Title with $1 and $& and $$ and $\' and $` symbols'));
      assert.ok(formatted.includes('Summary with $2 and $100 and $$$$ dollars'));
    });

    test('T5.4.4: formatPrompt handles 100KB giant prompts and multi-byte Unicode scripts', () => {
      const giantPrefix = 'A'.repeat(100000);
      const multiByteTitle = '人工知能과 量子コンピューティング: العربية & Русский';
      const multiByteSummary = 'Resumen en español con caracteres acentuados y símbolos matemáticos: ∑ ∫ √ π ∛ ⊕';

      const template = `${giantPrefix}\n\nTitle: {{originalTitle}}\nSummary: {{summary}}`;
      const formatted = formatPrompt(template, multiByteTitle, multiByteSummary);

      assert.ok(formatted.length > 100000);
      assert.ok(formatted.includes(multiByteTitle));
      assert.ok(formatted.includes(multiByteSummary));
    });

    test('T5.4.5: getSystemPrompt falls back gracefully when Firestore is offline, corrupted, or empty', async () => {
      const firestore = new FirestoreMock();

      // Case A: Document does not exist -> DEFAULT_SYSTEM_PROMPT
      const promptA = await getSystemPrompt(firestore);
      assert.equal(promptA, DEFAULT_SYSTEM_PROMPT);

      // Case B: Document exists with whitespace prompt -> DEFAULT_SYSTEM_PROMPT
      await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
        prompt: '    \n  '
      });
      const promptB = await getSystemPrompt(firestore);
      assert.equal(promptB, DEFAULT_SYSTEM_PROMPT);

      // Case C: Document has valid prompt
      const customPrompt = 'Custom AI Flashcard generator: {{originalTitle}}';
      await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
        prompt: customPrompt
      });
      const promptC = await getSystemPrompt(firestore);
      assert.equal(promptC, customPrompt);

      // Case D: Null Firestore instance (offline)
      const promptD = await getSystemPrompt(null);
      assert.equal(promptD, DEFAULT_SYSTEM_PROMPT);
    });

    test('T5.4.6: sanitizeError prevents ReDoS and strips multiple sensitive header patterns', () => {
      const rawErrors = [
        'Failed fetch: https://generativelanguage.googleapis.com?key=AIzaSyD9876543210ABCDEF&other=123',
        'Authorization: Bearer ya29.a0AfH6SMD_secret_google_oauth_token_123456',
        'Header x-api-key: xai-99887766554433221100aabbcc',
        'Authorization: Basic dXNlcjpwYXNzd29yZDEyMw=='
      ];

      for (const raw of rawErrors) {
        const sanitized = sanitizeError(raw);
        assert.ok(sanitized.includes('***'), `Must contain masked stars for: ${raw}`);
        assert.equal(sanitized.includes('AIzaSyD9876543210ABCDEF'), false);
        assert.equal(sanitized.includes('ya29.a0AfH6SMD_secret_google_oauth_token_123456'), false);
        assert.equal(sanitized.includes('xai-99887766554433221100aabbcc'), false);
        assert.equal(sanitized.includes('dXNlcjpwYXNzd29yZDEyMw=='), false);
      }
    });
  });

  // =========================================================================
  // 5. EXTREME QUEUE VOLUME AND CONCURRENT TRIGGERS
  // =========================================================================
  describe('T5.5: Extreme Queue Concurrency & Fault-Tolerant Processing', () => {
    test('T5.5.1: 50 concurrent trigger additions to pipeline_queue execute without race conditions or data loss', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });
      const topics = ['ml', 'cv', 'nlp', 'ai-health', 'robotics', 'cybersecurity', 'bio', 'dl', 'llm', 'data-science'];

      const triggerPromises = [];
      for (let i = 0; i < 50; i++) {
        const topic = topics[i % topics.length];
        triggerPromises.push(
          firestore.addDoc(firestore.collection('pipeline_queue'), {
            topic,
            requestedAt: new Date().toISOString(),
            status: 'pending',
            requestedBy: `admin_${i % 3}@reopsy.com`
          })
        );
      }

      const createdDocs = await Promise.all(triggerPromises);
      assert.equal(createdDocs.length, 50, 'All 50 queue items must be successfully written');

      // Verify total items in queue
      const queueSnap = await firestore.getDocs(firestore.collection('pipeline_queue'));
      assert.equal(queueSnap.size, 50, 'Queue collection must contain exactly 50 items');
    });

    test('T5.5.2: processPipelineQueue handles invalid topic slugs and transitions items accurately', async () => {
      const firestore = new FirestoreMock();

      // Enqueue mix of valid topics and malicious/invalid slugs
      const testItems = [
        { topic: 'ml', status: 'pending' },
        { topic: 'invalid_slug_xyz', status: 'pending' },
        { topic: '../../../etc/passwd', status: 'pending' },
        { topic: '', status: 'pending' },
        { topic: 'cv', status: 'pending' }
      ];

      for (const item of testItems) {
        await firestore.addDoc(firestore.collection('pipeline_queue'), item);
      }

      const processed = await processPipelineQueue(firestore, { dryRun: true });
      assert.ok(Array.isArray(processed), 'processPipelineQueue must return array of processed items');

      // Check all items in queue
      const allDocs = await firestore.getDocs(firestore.collection('pipeline_queue'));
      for (const doc of allDocs.docs) {
        const data = doc.data();
        if (data.topic === 'ml' || data.topic === 'cv') {
          assert.equal(data.status, 'completed', `Valid topic ${data.topic} should be completed`);
        } else {
          assert.equal(data.status, 'failed', `Invalid topic ${data.topic} should be marked failed`);
        }
      }
    });

    test('T5.5.3: Security rules strictly prevent non-admins from enqueueing or modifying pipeline_queue', async () => {
      const firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });

      const nonAdmin = { uid: 'attacker_uid', email: 'mallory@evil.com' };
      const superAdmin = { uid: 'super_uid', email: SUPER_ADMIN };

      // Non-admin tries to write to queue
      const nonAdminWrite = await firestore.evaluateSecurityRule('create', 'pipeline_queue', 'item_1', nonAdmin, {
        topic: 'ml'
      });
      assert.equal(nonAdminWrite.allowed, false, 'Non-admin MUST be denied writing to pipeline_queue');

      // Super admin writes to queue
      const adminWrite = await firestore.evaluateSecurityRule('create', 'pipeline_queue', 'item_1', superAdmin, {
        topic: 'ml'
      });
      assert.equal(adminWrite.allowed, true, 'Super admin MUST be allowed writing to pipeline_queue');
    });
  });
});
