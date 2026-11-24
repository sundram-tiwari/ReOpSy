import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.surface, borderTopColor: c.rule },
      ]}
    >
      {ACTIONS.map((a) => {
        const primary = a.key === 'save';
        return (
          <Pressable
            key={a.key}
            onPress={() => onChoose(a.key)}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityHint={a.hint}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.icon, primary && { backgroundColor: c.accentSoft }]}>
              <Feather name={a.icon} size={18} color={primary ? c.accent : c.muted} />
            </View>
            <T v="caption" numberOfLines={1} tone={primary ? 'accent' : 'muted'} style={{ fontWeight: '600', marginTop: 2 }}>
              {a.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs, paddingHorizontal: space.s },
  btn: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  icon: { width: 36, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
