'use strict';

const fs = require('fs');
const path = require('path');

/**
 * DOM Inspector and Component Simulator for Zero-Leakage & Theme Auditing
 */
class DomInspector {
  constructor(appDir) {
    this.appDir = appDir || path.resolve(__dirname, '../../../app');
  }

  readFile(relPath) {
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.appDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  /**
   * Simulate DrawerContent rendered DOM string for a given auth context state
   * @param {{ user: object | null, isAdmin: boolean, isSuperAdmin: boolean }} authContext
   * @returns {{ domString: string, visibleItems: string[], icons: string[] }}
   */
  simulateDrawerRender(authContext = { user: null, isAdmin: false, isSuperAdmin: false }) {
    const { user, isAdmin } = authContext;
    const items = [
      'Personalize your Feed',
      'View Saved Papers',
      'Settings & Support'
    ];
    const icons = ['sliders', 'bookmark', 'settings'];

    if (user) {
      items.push('Sign Out');
      icons.push('log-out');
    } else {
      items.push('Sign in with Google');
    }

    // "Mission Control" is strictly rendered if isAdmin is true
    if (isAdmin) {
      items.push('Mission Control');
      icons.push('shield');
    }

    const domString = items.map(item => `<div><span>${item}</span></div>`).join('\n') +
      '\n' + icons.map(icon => `<feather-icon name="${icon}" />`).join('\n');

    return {
      domString,
      visibleItems: items,
      icons
    };
  }

  /**
   * Simulate RootNavigator route resolution for a user
   * @param {{ user: object | null, isAdmin: boolean }} authContext
   * @param {string} targetRoute
   * @returns {{ accessible: boolean, renderedScreen: string, redirectedTo: string | null }}
   */
  simulateNavigate(authContext, targetRoute) {
    const publicRoutes = ['MainDrawer', 'Personalization', 'Saved', 'Settings', 'Feed'];
    const adminRoutes = ['Admin', 'MissionControl'];

    if (publicRoutes.includes(targetRoute)) {
      return { accessible: true, renderedScreen: targetRoute, redirectedTo: null };
    }

    if (adminRoutes.includes(targetRoute)) {
      if (authContext && authContext.isAdmin) {
        return { accessible: true, renderedScreen: 'AdminScreen', redirectedTo: null };
      } else {
        return { accessible: false, renderedScreen: null, redirectedTo: 'MainDrawer' };
      }
    }

    return { accessible: false, renderedScreen: 'NotFound', redirectedTo: null };
  }

  /**
   * Check rendered DOM for any prohibited admin leaks
   * @param {string} domString
   * @returns {{ hasAdminLeak: boolean, leakedTerms: string[] }}
   */
  auditZeroDomLeakage(domString) {
    const prohibitedTerms = [
      'Mission Control',
      'AdminScreen',
      'Pipeline Control',
      'Flashcard Manager',
      'API Usage Dashboard',
      'System Prompt Editor',
      'Admin Whitelist'
    ];

    const leaked = [];
    for (const term of prohibitedTerms) {
      if (domString.toLowerCase().includes(term.toLowerCase())) {
        leaked.push(term);
      }
    }

    return {
      hasAdminLeak: leaked.length > 0,
      leakedTerms: leaked
    };
  }

  /**
   * Inspect source code of DrawerContent.tsx for strict conditional rendering
   */
  auditDrawerContentSource() {
    const content = this.readFile('src/components/DrawerContent.tsx');
    const hasMissionControl = content.includes('Mission Control');
    const hasShieldIcon = content.includes('shield');
    const hasIsAdminGuard = content.includes('isAdmin') && (
      content.includes('isAdmin &&') ||
      content.includes('isAdmin ?') ||
      content.includes('if (isAdmin)') ||
      content.includes('isAdmin === true')
    );

    return {
      hasMissionControlText: hasMissionControl,
      hasShieldIcon,
      hasIsAdminGuard,
      isProperlyGuarded: !hasMissionControl || hasIsAdminGuard
    };
  }

  /**
   * Inspect source code of RootNavigator.tsx for route registration and authorization
   */
  auditRootNavigatorSource() {
    const content = this.readFile('src/navigation/RootNavigator.tsx');
    const registersAdmin = content.includes('Admin') || content.includes('AdminScreen');
    const usesAuthOrGuard = content.includes('isAdmin') || content.includes('useAuth') || !registersAdmin;

    return {
      registersAdmin,
      usesAuthOrGuard
    };
  }

  /**
   * Inspect source code of AdminScreen.tsx for theme tokens, tabs, and styling compliance
   */
  auditAdminScreenSource() {
    let content = '';
    try {
      content = this.readFile('src/screens/AdminScreen.tsx');
    } catch {
      return { exists: false };
    }

    const hasFlashcardTab = /Flashcard/i.test(content);
    const hasPipelineTab = /Pipeline/i.test(content);
    const hasApiUsageTab = /API Usage|Usage/i.test(content);
    const hasSettingsTab = /Settings|Config/i.test(content);
    const usesThemeColors = content.includes('colors.') || content.includes('colors[');
    const usesTypography = content.includes('typography.') || content.includes('typography[');
    const hasFeatherIcons = content.includes('Feather');

    // Emoji check
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const lines = content.split('\n');
    const emojisFound = [];
    lines.forEach((line, idx) => {
      if (!line.trim().startsWith('//') && !line.trim().startsWith('/*') && emojiRegex.test(line)) {
        emojisFound.push({ line: idx + 1, content: line.trim() });
      }
    });

    return {
      exists: true,
      hasFlashcardTab,
      hasPipelineTab,
      hasApiUsageTab,
      hasSettingsTab,
      usesThemeColors,
      usesTypography,
      hasFeatherIcons,
      emojisFound,
      isCleanOfEmojis: emojisFound.length === 0
    };
  }
}

module.exports = {
  DomInspector
};
