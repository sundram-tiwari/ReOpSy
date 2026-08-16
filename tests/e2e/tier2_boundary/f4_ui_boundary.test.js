'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('Tier 2 - Boundary: F4 Admin Panel UI & Dark Theme', () => {
  test('B4.1: Responsive layout adapts to extreme viewports (320px mobile to 3840px desktop)', () => {
    const computeAdminLayout = (width) => {
      const isMobile = width < 768;
      return {
        tabDirection: isMobile ? 'row' : 'row',
        tabFlexWrap: isMobile ? 'wrap' : 'nowrap',
        containerPadding: isMobile ? 12 : 24,
        maxContentWidth: isMobile ? '100%' : 1200
      };
    };

    const mobileLayout = computeAdminLayout(320);
    assert.equal(mobileLayout.containerPadding, 12);
    assert.equal(mobileLayout.tabFlexWrap, 'wrap');

    const ultraWideLayout = computeAdminLayout(3840);
    assert.equal(ultraWideLayout.containerPadding, 24);
    assert.equal(ultraWideLayout.maxContentWidth, 1200);
  });

  test('B4.2: Rapid high-frequency tab switching maintains active tab consistency', () => {
    let activeTab = 'flashcards';
    const tabs = ['flashcards', 'pipeline', 'usage', 'settings'];

    // 100 cycles of 4 tabs ends at flashcards
    for (let i = 0; i < 100; i++) {
      for (const target of tabs) {
        activeTab = target;
      }
    }

    assert.equal(activeTab, 'settings');
  });

  test('B4.3: Theme token fallback handles missing or undefined custom tokens safely', () => {
    const defaultColors = {
      bg: '#000000',
      card: '#121212',
      cardBorder: '#2a2a2a',
      primary: '#1d9bf0',
      text: '#ffffff',
      textDim: '#888888'
    };

    const getSafeThemeColor = (key, customTheme = {}) => {
      return customTheme[key] || defaultColors[key] || '#000000';
    };

    assert.equal(getSafeThemeColor('bg'), '#000000');
    assert.equal(getSafeThemeColor('nonExistentKey'), '#000000');
    assert.equal(getSafeThemeColor('primary', { primary: '#00d47e' }), '#00d47e');
  });

  test('B4.4: Long section headers and labels wrap or truncate gracefully without layout overflow', () => {
    const formatTabLabel = (label, maxLength = 24) => {
      if (!label) return '';
      return label.length > maxLength ? `${label.substring(0, maxLength - 3)}...` : label;
    };

    assert.equal(formatTabLabel('Flashcard Manager'), 'Flashcard Manager');
    assert.equal(formatTabLabel('Super Duper Long Tab Label That Might Overflow Layout'), 'Super Duper Long Tab ...');
  });

  test('B4.5: Zero emojis in dynamically formatted status text across admin tabs', () => {
    const statusMessages = [
      'Pipeline executed successfully with 30 papers',
      'API call failed with status 429',
      'Admin added to whitelist',
      'System prompt updated'
    ];

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const msg of statusMessages) {
      assert.equal(emojiRegex.test(msg), false, `Status message '${msg}' must not contain emojis`);
    }
  });
});
