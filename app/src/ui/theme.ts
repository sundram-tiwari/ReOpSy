import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';

/**
 * ReOpSy v2 design tokens.
 *
 * Direction: "field notebook". Paper and ink, a teal pen for actions, and a
 * highlighter yellow used only where a reader would highlight a PDF (key
 * numbers, your own marks). Light and dark are designed separately rather
 * than inverted.
 */
export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  highlight: string;
  highlightInk: string;
  good: string;
  warn: string;
  bad: string;
  overlay: string;
}

export const light: Palette = {
  bg: '#F5F6F2',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEFE8',
  ink: '#16202A',
  muted: '#56616B',
  faint: '#8A949C',
  rule: '#DCE0D7',
  accent: '#0E5D6C',
  accentInk: '#FFFFFF',
  accentSoft: '#DCEDEF',
  highlight: '#F1E05A',
  highlightInk: '#16202A',
  good: '#2C6A44',
  warn: '#8A5200',
  bad: '#A3271F',
  overlay: 'rgba(10, 15, 20, 0.45)',
};

export const dark: Palette = {
  bg: '#0F1316',
  surface: '#171C20',
  surfaceAlt: '#1F262B',
  ink: '#E6E9E4',
  muted: '#9DA6AE',
  faint: '#6E7880',
  rule: '#2B3238',
  accent: '#7CC8D6',
  accentInk: '#0F1316',
  accentSoft: '#1E3A40',
  highlight: '#5A5320',
  highlightInk: '#F7F1C9',
  good: '#82CBA0',
  warn: '#E4AA55',
  bad: '#F2948A',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 16, pill: 999 };

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' });

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  headline: { fontSize: 21, lineHeight: 28, fontWeight: '600' as const, fontFamily: serif },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.6 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: mono },
};

export type ThemePref = 'system' | 'light' | 'dark';

export interface Theme {
  c: Palette;
  dark: boolean;
}

export const ThemePrefContext = createContext<ThemePref>('system');

export function useTheme(): Theme {
  const pref = useContext(ThemePrefContext);
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return { c: isDark ? dark : light, dark: isDark };
}
