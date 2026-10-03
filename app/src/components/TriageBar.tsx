import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../ui/kit';
import { space, useTheme } from '../ui/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export type TriageChoice = 'not_relevant' | 'skip' | 'save' | 'survey';

const ACTIONS: { key: TriageChoice; label: string; icon: FeatherName; hint: string }[] = [
  { key: 'not_relevant', label: 'Not for me', icon: 'x', hint: 'Hide this paper and tune your feed' },
  { key: 'skip', label: 'Skip', icon: 'chevron-right', hint: 'Move on without saving' },
  { key: 'save', label: 'Save', icon: 'bookmark', hint: 'Save to your library and recall it later' },
  { key: 'survey', label: 'Survey', icon: 'plus-square', hint: 'Add to your literature survey' },
];

/** One decision per card. Every option is a button, so no gesture is required. */
export function TriageBar({ onChoose }: { onChoose: (choice: TriageChoice) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.surface, borderTopColor: c.rule, paddingBottom: Math.max(insets.bottom, space.s) },
      ]}
    >
      {ACTIONS.map((a) => {
        const primary = a.key === 'save' || a.key === 'survey';
        return (
          <Pressable
            key={a.key}
            onPress={() => onChoose(a.key)}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityHint={a.hint}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.icon, { backgroundColor: primary ? c.accentSoft : c.surfaceAlt }]}>
              <Feather name={a.icon} size={20} color={primary ? c.accent : c.muted} />
            </View>
            <T v="caption" tone={primary ? 'accent' : 'muted'} style={{ fontWeight: '600', marginTop: 4 }}>
              {a.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.s, paddingHorizontal: space.s },
  btn: { flex: 1, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  icon: { width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
