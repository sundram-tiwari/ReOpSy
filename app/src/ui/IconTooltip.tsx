import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { radius, type, useTheme } from './theme';

/** Reuses the button's accessible name; the tooltip itself is visual only. */
export function useIconTooltip(label: string, position: 'top' | 'bottom-end' = 'bottom-end') {
  const { c } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visible = Platform.OS === 'web' && !dismissed && (hovered || focused);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const handlers: Pick<PressableProps, 'onHoverIn' | 'onHoverOut' | 'onFocus' | 'onBlur'> =
    Platform.OS === 'web'
      ? {
          onHoverIn: () => {
            if (!window.matchMedia('(any-hover: hover)').matches) return;
            clearTimeout(timer.current);
            setDismissed(false);
            timer.current = setTimeout(() => setHovered(true), 250);
          },
          onHoverOut: () => {
            clearTimeout(timer.current);
            setHovered(false);
          },
          onFocus: (event) => {
            const target = event.currentTarget as unknown as HTMLElement;
            if (target.matches?.(':focus-visible')) {
              setDismissed(false);
              setFocused(true);
            }
          },
          onBlur: () => setFocused(false),
        }
      : {};

  return {
    handlers,
    tooltip: visible ? (
      <View
        aria-hidden
        style={[styles.tip, position === 'top' ? styles.top : styles.bottomEnd]}
      >
        <Text numberOfLines={1} style={[styles.label, { backgroundColor: c.ink, color: c.bg }]}>{label}</Text>
      </View>
    ) : null,
  };
}

const styles = StyleSheet.create({
  tip: { position: 'absolute', zIndex: 20 },
  top: { bottom: '100%', alignSelf: 'center' },
  bottomEnd: { top: '100%', right: 0 },
  label: { ...type.caption, fontWeight: '600', borderRadius: radius.s, paddingHorizontal: 8, paddingVertical: 4 },
});
