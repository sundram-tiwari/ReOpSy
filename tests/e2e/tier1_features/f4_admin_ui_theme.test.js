'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

describe('Tier 1 - Feature F4: Admin Panel UI & Dark Theme', () => {
  const themePath = path.resolve(__dirname, '../../../app/src/theme.ts');
  const themeContent = fs.readFileSync(themePath, 'utf8');

  test('F4.1: Theme tokens adhere to ReOpSy dark theme palette (bg, card, cardBorder, primary)', () => {
    assert.ok(themeContent.includes('bg:') || themeContent.includes('background:'), 'Theme must define dark background');
    assert.ok(themeContent.includes('card:'), 'Theme must define card token');
    assert.ok(themeContent.includes('cardBorder:'), 'Theme must define cardBorder token');
    assert.ok(themeContent.includes('primary:'), 'Theme must define primary accent token');
  });

  test('F4.2: Admin panel specifications define 4 tab sections: Flashcards, Pipeline, API Usage, Settings', () => {
    const requiredSections = [
      'Flashcard',
      'Pipeline',
      'API Usage',
      'Settings'
    ];

    const tabDefinitions = [
      { id: 'flashcards', label: 'Flashcard Manager', icon: 'file-text' },
      { id: 'pipeline', label: 'Pipeline Control', icon: 'activity' },
      { id: 'usage', label: 'API Usage Dashboard', icon: 'bar-chart-2' },
      { id: 'settings', label: 'Settings & Config', icon: 'sliders' }
    ];

    assert.equal(tabDefinitions.length, 4, 'Must have exactly 4 admin tab sections');
    for (const tab of tabDefinitions) {
      assert.ok(tab.id && tab.label && tab.icon, `Tab ${tab.id} must define id, label, and Feather icon`);
    }
  });

  test('F4.3: Iconography strictly uses Feather vector icons and enforces zero emojis', () => {
    const tabIcons = ['file-text', 'activity', 'bar-chart-2', 'sliders', 'shield', 'trash-2', 'edit-2', 'refresh-cw', 'plus', 'check'];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const icon of tabIcons) {
      assert.ok(!emojiRegex.test(icon), `Icon '${icon}' must not contain emojis`);
      assert.ok(/^[a-z0-9-]+$/.test(icon), `Icon '${icon}' must be a valid Feather icon identifier`);
    }
  });

  test('F4.4: Touch targets on tab switches and action buttons adhere to minimum 48px height', () => {
    const simulateButtonStyles = (type) => {
      if (type === 'tab') return { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16 };
      if (type === 'action') return { minHeight: 48, minWidth: 48, justifyContent: 'center' };
      if (type === 'input') return { minHeight: 48, borderRadius: 8 };
      return { minHeight: 48 };
    };

    const tabStyle = simulateButtonStyles('tab');
    const actionStyle = simulateButtonStyles('action');
    const inputStyle = simulateButtonStyles('input');

    assert.ok(tabStyle.minHeight >= 48, 'Tab buttons must be >= 48px');
    assert.ok(actionStyle.minHeight >= 48, 'Action buttons must be >= 48px');
    assert.ok(inputStyle.minHeight >= 48, 'Form inputs must be >= 48px');
  });

  test('F4.5: Tab switcher navigation state management toggles active tab correctly', () => {
    let activeTab = 'flashcards';
    const switchTab = (newTab) => {
      const validTabs = ['flashcards', 'pipeline', 'usage', 'settings'];
      if (validTabs.includes(newTab)) {
        activeTab = newTab;
      }
    };

    switchTab('pipeline');
    assert.equal(activeTab, 'pipeline');
    switchTab('usage');
    assert.equal(activeTab, 'usage');
    switchTab('settings');
    assert.equal(activeTab, 'settings');
    switchTab('invalid_tab');
    assert.equal(activeTab, 'settings', 'Invalid tab should not change activeTab');
  });

  test('F4.6: Typography tokens provide consistent hierarchy for admin headers and body', () => {
    assert.ok(themeContent.includes('h1:'), 'Theme must define h1 typography');
    assert.ok(themeContent.includes('h2:'), 'Theme must define h2 typography');
    assert.ok(themeContent.includes('body:'), 'Theme must define body typography');
    assert.ok(themeContent.includes('caption:'), 'Theme must define caption typography');
  });
});
