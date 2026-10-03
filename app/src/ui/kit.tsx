import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Palette, radius, space, type, useTheme } from './theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type Tone = 'ink' | 'muted' | 'faint' | 'accent' | 'bad' | 'good' | 'warn';

export function T({
  v = 'body',
  tone = 'ink',
  style,
  children,
  ...rest
}: {
  v?: keyof typeof type;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
  accessibilityRole?: 'header' | 'text' | 'link';
}) {
  const { c } = useTheme();
  const color = c[tone];
  const upper = v === 'label' ? { textTransform: 'uppercase' as const } : null;
  return (
    <Text style={[type[v], { color }, upper, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Screen({
  title,
  left,
  right,
  children,
  scroll = true,
  padded = true,
}: {
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const { c } = useTheme();
  const body = padded ? { paddingHorizontal: space.l, paddingBottom: space.xxl } : null;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      {(title || left || right) && (
        <View style={styles.header}>
          <View style={styles.headerSide}>{left}</View>
          {title ? (
            <T v="heading" accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
              {title}
            </T>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, body]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'ink',
  size = 22,
  dot = false,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
  dot?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
    >
      <Feather name={icon} size={size} color={c[tone]} />
      {dot && <View style={[styles.dot, { backgroundColor: c.accent, borderColor: c.bg }]} />}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: FeatherName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentInk : kind === 'danger' ? c.bad : kind === 'ghost' ? c.accent : c.ink;
  const border = kind === 'danger' ? c.bad : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: kind === 'danger' ? 1 : 0 },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={18} color={fg} style={{ marginRight: label ? space.s : 0 }} />}
          {label ? <Text style={[type.small, { color: fg, fontWeight: '600' }]}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  icon,
  tone = 'muted',
  filled = false,
  onPress,
  selected,
}: {
  label: string;
  icon?: FeatherName;
  tone?: Tone;
  filled?: boolean;
  onPress?: () => void;
  selected?: boolean;
}) {
  const { c } = useTheme();
  const active = selected ?? filled;
  const content = (
    <View
      style={[
        styles.chip,
        { backgroundColor: active ? c.accentSoft : c.surfaceAlt, borderColor: selected ? c.accent : 'transparent' },
      ]}
    >
      {icon && <Feather name={icon} size={12} color={c[active ? 'accent' : tone]} style={{ marginRight: 4 }} />}
      <Text style={[type.caption, { color: c[active ? 'accent' : tone], fontWeight: '600' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      hitSlop={6}
    >
      {content}
    </Pressable>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: c.surface }]}
          >
            <Text style={[type.small, { color: on ? c.ink : c.muted, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={styles.sheetHead}>
            <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </T>
            <IconButton icon="x" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.l }}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  tone = 'ink',
}: {
  title: string;
  subtitle?: string;
  icon?: FeatherName;
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: Tone;
}) {
  const { c } = useTheme();
  const body = (
    <View style={[styles.row, { borderBottomColor: c.rule }]}>
      {icon && <Feather name={icon} size={20} color={c[tone === 'ink' ? 'muted' : tone]} style={{ marginRight: space.m }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T tone={tone} numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={c.faint} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  secure,
  error,
  autoCapitalize = 'sentences',
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  secure?: boolean;
  error?: string | null;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address' | 'number-pad';
}) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: space.l }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs }}>
        <T v="label" tone="muted">
          {label}
        </T>
        {maxLength ? (
          <T v="caption" tone="faint">
            {value.length}/{maxLength}
          </T>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        multiline={multiline}
        maxLength={maxLength}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={[
          type.body,
          styles.input,
          { color: c.ink, backgroundColor: c.surface, borderColor: error ? c.bad : c.rule },
          multiline && { minHeight: 96, textAlignVertical: 'top' },
        ]}
      />
      {error ? (
        <T v="small" tone="bad" style={{ marginTop: space.xs }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.rule }, style]}>{children}</View>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: FeatherName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={32} color={c.accent} />
      <T v="heading" style={{ textAlign: 'center', marginTop: space.m }}>
        {title}
      </T>
      {body ? (
        <T tone="muted" style={{ textAlign: 'center', marginTop: space.s, maxWidth: 340 }}>
          {body}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: space.l }}>{action}</View> : null}
    </View>
  );
}

const AVATAR_TONES = ['#0E5D6C', '#6B4E9B', '#9B5B2F', '#2C6A44', '#8A3B5A', '#3E5C8A'];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: AVATAR_TONES[h % AVATAR_TONES.length],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

export function ProgressRing({ done, total, size = 44 }: { done: number; total: number; size?: number }) {
  const { c } = useTheme();
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} cards done today`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.rule} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - frac)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[type.caption, { color: c.ink, fontWeight: '700' }]}>
        {done}/{total}
      </Text>
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.rule, marginVertical: space.l }} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <T v="label" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
        {children}
      </T>
      {right}
    </View>
  );
}

export function paletteFor(c: Palette, tone: Tone): string {
  return c[tone];
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s, minHeight: 52 },
  headerSide: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  btn: {
    minHeight: 48,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 260,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.m, padding: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.s, paddingHorizontal: 6 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    paddingHorizontal: space.l,
    maxHeight: '88%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingTop: space.m, paddingBottom: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { borderWidth: 1, borderRadius: radius.s, paddingHorizontal: space.m, paddingVertical: 10 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.l, padding: space.l },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, paddingHorizontal: space.l },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.s },
});
