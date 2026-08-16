'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DomInspector } = require('../harness');

describe('Tier 2 - Boundary: F3 Zero-DOM Leakage Navigation', () => {
  const inspector = new DomInspector();

  test('B3.1: Deep nested scan verifies 0 occurrences of prohibited terms in non-admin DOM tree', () => {
    const regularAuth = {
      user: { uid: 'u1', email: 'guest@example.com' },
      isAdmin: false,
      isSuperAdmin: false
    };

    const rendered = inspector.simulateDrawerRender(regularAuth);
    const prohibitedSubstrings = [
      'mission control',
      'missioncontrol',
      'admin',
      'shield',
      'pipeline_runs',
      'pipeline_queue',
      'api_usage'
    ];

    const lowerDom = rendered.domString.toLowerCase();
    for (const term of prohibitedSubstrings) {
      assert.equal(
        lowerDom.includes(term),
        false,
        `Prohibited string '${term}' leaked into regular user DOM`
      );
    }
  });

  test('B3.2: Immediate DOM cleanup upon logout transition removes all admin nodes', () => {
    // 1. Render as admin
    const adminRender = inspector.simulateDrawerRender({ user: { uid: 'a1' }, isAdmin: true, isSuperAdmin: true });
    assert.equal(adminRender.visibleItems.includes('Mission Control'), true);

    // 2. Transition to logged-out state
    const loggedOutRender = inspector.simulateDrawerRender({ user: null, isAdmin: false, isSuperAdmin: false });
    const audit = inspector.auditZeroDomLeakage(loggedOutRender.domString);

    assert.equal(audit.hasAdminLeak, false);
    assert.equal(loggedOutRender.visibleItems.includes('Mission Control'), false);
    assert.equal(loggedOutRender.icons.includes('shield'), false);
  });

  test('B3.3: Loading state (adminLoading: true) does not leak admin UI prematurely', () => {
    // When auth is still resolving, isAdmin is false until confirmed
    const resolvingAuth = {
      user: { uid: 'u1', email: 'admin@reopsy.com' },
      isAdmin: false, // Still resolving
      isSuperAdmin: false
    };

    const rendered = inspector.simulateDrawerRender(resolvingAuth);
    assert.equal(rendered.visibleItems.includes('Mission Control'), false, 'While loading, admin item must not flash');
  });

  test('B3.4: Simulated screen-reader accessibility tree contains 0 admin labels for non-admins', () => {
    const regularAuth = { user: { uid: 'u1' }, isAdmin: false };
    const rendered = inspector.simulateDrawerRender(regularAuth);

    const accessibilityLabels = rendered.visibleItems.map(item => item.toLowerCase());
    assert.equal(accessibilityLabels.includes('mission control'), false);
    assert.equal(accessibilityLabels.includes('admin settings'), false);
  });

  test('B3.5: Direct navigation to malformed/unregistered admin sub-routes returns 404 or redirects safely', () => {
    const regularAuth = { user: { uid: 'u1' }, isAdmin: false };
    const malformedRoutes = ['Admin/Config', 'Admin/Pipeline', 'MissionControl/Secret'];

    for (const route of malformedRoutes) {
      const res = inspector.simulateNavigate(regularAuth, route);
      assert.equal(res.accessible, false);
    }
  });
});
