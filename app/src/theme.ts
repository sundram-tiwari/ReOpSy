export const colors = {
  bg: '#000000',
  card: '#121212',
  cardBorder: '#2a2a2a',
  text: '#ffffff',
  textDim: '#a0a0a0',
  primary: '#1d9bf0',
  accent: '#292929',
  followGreen: '#4caf50',
  danger: '#ff5252',
  success: '#4caf50',
  divider: '#333333',
};

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: { fontSize: 16, fontWeight: 'bold' as const, color: colors.text, lineHeight: 24 },
  h2: { fontSize: 22, fontWeight: 'bold' as const, color: colors.text, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 24 },
  bodyDim: { fontSize: 16, color: colors.textDim, lineHeight: 24 },
  caption: { fontSize: 14, color: colors.textDim, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textDim },
};
