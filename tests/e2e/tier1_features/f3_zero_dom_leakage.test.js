'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DomInspector } = require('../harness');

describe('Tier 1 - Feature F3: Zero-DOM Leakage Navigation', () => {
  const inspector = new DomInspector();

  test('F3.1: Non-admin logged-in user produces 0 occurrences of "Mission Control" in drawer DOM', () => {
    const regularAuth = {
      user: { uid: 'user_123', email: 'regular@example.com' },
      isAdmin: false,
      isSuperAdmin: false
    };

    const rendered = inspector.simulateDrawerRender(regularAuth);
    const audit = inspector.auditZeroDomLeakage(rendered.domString);

    assert.equal(audit.hasAdminLeak, false, 'Non-admin user DOM must have ZERO admin leaks');
    assert.equal(rendered.visibleItems.includes('Mission Control'), false);
    assert.equal(rendered.icons.includes('shield'), false);
  });

  test('F3.2: Unauthenticated user produces 0 occurrences of "Mission Control" in drawer DOM', () => {
    const unauth = {
      user: null,
      isAdmin: false,
      isSuperAdmin: false
    };

    const rendered = inspector.simulateDrawerRender(unauth);
    const audit = inspector.auditZeroDomLeakage(rendered.domString);

    assert.equal(audit.hasAdminLeak, false);
    assert.equal(rendered.visibleItems.includes('Mission Control'), false);
    assert.equal(rendered.icons.includes('shield'), false);
  });

  test('F3.3: Admin logged-in user renders "Mission Control" with Feather "shield" icon in drawer DOM', () => {
    const adminAuth = {
      user: { uid: 'admin_123', email: 'admin@reopsy.com' },
      isAdmin: true,
      isSuperAdmin: true
    };

    const rendered = inspector.simulateDrawerRender(adminAuth);
    assert.equal(rendered.visibleItems.includes('Mission Control'), true, 'Admin must see Mission Control');
    assert.equal(rendered.icons.includes('shield'), true, 'Mission Control item must use Feather shield icon');
  });

  test('F3.4: Direct navigation attempt to "Admin" route by non-admin is blocked and redirected', () => {
    const regularAuth = {
      user: { uid: 'user_123', email: 'regular@example.com' },
      isAdmin: false
    };

    const navResult = inspector.simulateNavigate(regularAuth, 'Admin');
    assert.equal(navResult.accessible, false, 'Non-admin must not access Admin route');
    assert.equal(navResult.redirectedTo, 'MainDrawer', 'Unauthorized access should redirect to MainDrawer');
  });

  test('F3.5: Direct navigation attempt to "Admin" route by admin resolves successfully to AdminScreen', () => {
    const adminAuth = {
      user: { uid: 'admin_123', email: 'admin@reopsy.com' },
      isAdmin: true
    };

    const navResult = inspector.simulateNavigate(adminAuth, 'Admin');
    assert.equal(navResult.accessible, true);
    assert.equal(navResult.renderedScreen, 'AdminScreen');
  });

  test('F3.6: Public routes (Feed, Saved, Personalization, Settings) remain accessible to both regular and admin users', () => {
    const regularAuth = { user: { uid: '1' }, isAdmin: false };
    const adminAuth = { user: { uid: '2' }, isAdmin: true };

    const routes = ['Feed', 'Saved', 'Personalization', 'Settings'];
    for (const route of routes) {
      assert.equal(inspector.simulateNavigate(regularAuth, route).accessible, true, `Regular user should access ${route}`);
      assert.equal(inspector.simulateNavigate(adminAuth, route).accessible, true, `Admin user should access ${route}`);
    }
  });
});
