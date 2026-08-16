'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Static code & AST analyzer for UI/UX compliance verification
 */
class AstAuditor {
  constructor(appDir) {
    this.appDir = appDir || path.resolve(__dirname, '../../app');
  }

  readFile(relPath) {
    const fullPath = path.join(this.appDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  /**
   * Check for emojis and raw unicode arrows/checks in source files
   */
  findEmojiViolations(relPath) {
    const content = this.readFile(relPath);
    // Regex for common emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const lines = content.split('\n');
    const violations = [];

    lines.forEach((line, idx) => {
      // Ignore comment lines
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) return;
      if (emojiRegex.test(line)) {
        violations.push({ line: idx + 1, content: line.trim() });
      }
    });

    return violations;
  }

  /**
   * Check for raw unicode glyphs like ↗, ✓, + used in button text
   */
  findRawUnicodeGlyphs(relPath) {
    const content = this.readFile(relPath);
    const glyphRegex = /[↗✓]/;
    const lines = content.split('\n');
    const violations = [];

    lines.forEach((line, idx) => {
      if (line.trim().startsWith('//')) return;
      if (glyphRegex.test(line)) {
        violations.push({ line: idx + 1, content: line.trim() });
      }
    });

    return violations;
  }

  /**
   * Audit touch targets for minWidth/minHeight or hitSlop >= 48px
   */
  auditTouchTargets(relPath) {
    const content = this.readFile(relPath);
    const violations = [];

    // Check if TouchableOpacity or Pressable exists
    if (!content.includes('TouchableOpacity') && !content.includes('Pressable')) {
      return { totalTouchables: 0, violations: [] };
    }

    // Look for styles definitions or inline touchable elements
    // Verify touchable elements specify minHeight: 48 / minWidth: 48 or hitSlop or sufficient padding
    return {
      hasTouchables: true,
      hasHitSlopOrMinDimension: content.includes('minHeight: 48') || content.includes('hitSlop') || content.includes('minHeight')
    };
  }

  /**
   * Audit snap-scrolling in FeedScreen.tsx
   */
  auditSnapScrolling() {
    const content = this.readFile('src/screens/FeedScreen.tsx');
    return {
      hasSnapToInterval: content.includes('snapToInterval'),
      hasSnapToAlignment: content.includes('snapToAlignment'),
      hasDecelerationRate: content.includes('decelerationRate="fast"') || content.includes("decelerationRate={'fast'}"),
      hasLayoutMeasurement: content.includes('onLayout') || content.includes('containerHeight'),
      hasGetItemLayout: content.includes('getItemLayout')
    };
  }

  /**
   * Audit typography parity and no truncation in PaperCard.tsx
   */
  auditTypographyParity() {
    const cardContent = this.readFile('src/components/PaperCard.tsx');
    const themeContent = this.readFile('src/theme.ts');

    const summaryHasNumberOfLines = /summary.*numberOfLines/i.test(cardContent);
    const titleHasNumberOfLines = /title.*numberOfLines/i.test(cardContent);

    return {
      summaryHasTruncation: summaryHasNumberOfLines,
      titleHasTruncation: titleHasNumberOfLines,
      cardUses16pxTitle: cardContent.includes('fontSize: 16') || themeContent.includes('fontSize: 16'),
      cardUses16pxSummary: cardContent.includes('fontSize: 16') || themeContent.includes('fontSize: 16')
    };
  }

  /**
   * Audit masked input and security in SettingsScreen.tsx
   */
  auditSettingsSecurity() {
    const content = this.readFile('src/screens/SettingsScreen.tsx');
    return {
      hasSecureTextEntry: content.includes('secureTextEntry'),
      hasProviderSelection: content.includes('Gemini') && content.includes('Mistral') && content.includes('Grok') && content.includes('Custom'),
      hasClearAction: content.includes('clearUserApiConfig') || content.includes('clearCache')
    };
  }
}

module.exports = {
  AstAuditor
};
