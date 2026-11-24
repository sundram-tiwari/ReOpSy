import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { space, useTheme } from '../ui/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export type TriageChoice = 'not_relevant' | 'skip' | 'save' | 'survey';

const ACTIONS: { key: TriageChoice; label: string; accessibleName?: string; icon: FeatherName; hint: string }[] = [
  { key: 'not_relevant', label: 'Not for me', icon: 'x', hint: 'Hide this paper and tune your feed' },
  { key: 'skip', label: 'Skip', icon: 'skip-forward', hint: 'Move on without saving' },
  { key: 'survey', label: 'Review', accessibleName: 'Add to literature review', icon: 'book-open', hint: 'Store this paper in your survey list' },
  { key: 'save', label: 'Save', icon: 'bookmark', hint: 'Save to your library and recall it later' },
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
            accessibilityLabel={a.accessibleName || a.label}
            accessibilityHint={a.hint}
            style={({ pressed }) => [styles.btn, pressed && { backgroundColor: c.surfaceAlt, opacity: 0.75 }]}
          >
            <View style={[styles.icon, primary && { backgroundColor: c.accentSoft }]}>
              <Feather name={a.icon} size={20} color={primary ? c.accent : c.muted} />
            </View>

          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs, paddingHorizontal: space.s },
  btn: { flex: 1, alignItems: 'center', minHeight: 48, borderRadius: 12, justifyContent: 'center' },
  icon: { width: 36, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
