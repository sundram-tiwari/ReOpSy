import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Milestone } from '../logic/progress';
import { T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

type Icon = React.ComponentProps<typeof Feather>['name'];
type Shape = 'rosette' | 'tag' | 'pebble' | 'seal';
type Sticker = { name: string; icon: Icon; shape: Shape; color: string; ink: string; criteria?: string; detail?: string };

// Original paper cutouts using the icon pack already used in ReOpSy.
const CUTOUTS: Record<Shape, string> = {
  rosette: 'M32 6 39 10 47 10 51 17 57 23 55 31 58 39 51 45 47 53 39 52 32 57 25 52 17 53 13 45 6 39 9 31 7 23 13 17 17 10 25 10Z',
  tag: 'M18 8h28a8 8 0 0 1 8 8v27a9 9 0 0 1-7 9l-13 5a7 7 0 0 1-4 0l-13-5a9 9 0 0 1-7-9V16a8 8 0 0 1 8-8Z',
  pebble: 'M32 7c7 0 8 4 13 5s9 3 10 9c1 5-1 6 1 10s0 10-4 13c-4 4-5 7-10 9-5 2-7 0-11 1s-9-1-13-2-5-5-8-8S6 37 7 32s-1-7 1-11 6-4 8-8 8-5 16-6Z',
  seal: 'M32 6c6 0 9 5 14 6s9 4 10 9c1 4-1 7 0 11 1 5 0 10-4 13-4 3-5 7-10 9-4 2-6 1-10 1s-6 1-10-1c-5-2-6-6-10-9-4-3-5-8-4-13 1-4-1-7 0-11 1-5 5-8 10-9S26 6 32 6Z',
};

const STICKERS: Record<string, Sticker> = {
  triage10: { name: 'Paper Scout', icon: 'compass', shape: 'rosette', color: '#FFDBA8', ink: '#74421C' },
  survey1: { name: 'Survey Sprout', icon: 'bookmark', shape: 'pebble', color: '#C3EBC0', ink: '#235136', criteria: 'Add a paper to your literature review' },
  recall7: { name: 'Recall Loop', icon: 'repeat', shape: 'seal', color: '#C5E9F3', ink: '#174E68' },
  matrix5: { name: 'Matrix Maker', icon: 'grid', shape: 'tag', color: '#E5D8FC', ink: '#52357D', detail: 'A row in your survey counts once at least four of its fields are filled.' },
  export1: { name: 'Packed to Go', icon: 'download', shape: 'pebble', color: '#F9CFCB', ink: '#743D35', criteria: 'Complete an export from the Library' },
  discuss1: { name: 'Conversation Spark', icon: 'message-circle', shape: 'seal', color: '#F9D3EA', ink: '#793252', criteria: 'Post a comment on a paper or publish a post in Community' },
  triage100: { name: 'Century Club', icon: 'layers', shape: 'rosette', color: '#FFEA9F', ink: '#634915' },
  survey20: { name: 'Survey Builder', icon: 'book-open', shape: 'tag', color: '#BCEAE1', ink: '#245A56', criteria: 'Add 20 papers to your literature review' },
};
const FALLBACK: Sticker = { name: 'Research milestone', icon: 'star', shape: 'seal', color: '#FFEA9F', ink: '#634915' };

function StickerArt({ badge, earned }: { badge: Sticker; earned: boolean }) {
  const { c } = useTheme();
  const edge = earned ? c.surface : c.rule;
  const color = earned ? badge.ink : c.muted;
  const outline = CUTOUTS[badge.shape];

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.art}
    >
      <Svg width={62} height={62} viewBox="0 0 64 64">
        <Path d={outline} fill={color} opacity={earned ? 0.22 : 0.12} transform="translate(0 2)" />
        <Path d={outline} fill={earned ? badge.color : c.surfaceAlt} stroke={edge} strokeWidth={3} strokeLinejoin="round" />
        <Path d={outline} fill={badge.color} fillOpacity={earned ? 0 : 0.19} />
        <Path d="M20 18v8m-4-4h8m19 17v6m-3-3h6" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={earned ? 0.65 : 0.42} />
        <Circle cx={44} cy={20} r={1.6} fill={color} opacity={0.45} />
        <Circle cx={21} cy={44} r={1.4} fill={color} opacity={0.36} />
      </Svg>
      <View style={styles.emblem}>
        <Feather name={badge.icon} size={23} color={color} />
      </View>
      <View style={[styles.status, { backgroundColor: earned ? c.good : c.surface, borderColor: c.surface }]}>
        <Feather name={earned ? 'check' : 'lock'} size={11} color={earned ? c.bg : c.muted} />
      </View>
    </View>
  );
}

function readProgress(progress: string) {
  const [count, target] = progress.split('/').map(Number);
  return { count, target, text: `${count} of ${target}` };
}

export function MilestoneStickers({ items }: { items: Milestone[] }) {
  const { c } = useTheme();
  const [selected, select] = useState<string>();
  const milestone = items.find((m) => m.id === selected);
  const selectedBadge = milestone ? STICKERS[milestone.id] || FALLBACK : null;
  const earned = items.filter((m) => m.done).length;
  const progress = milestone ? readProgress(milestone.progress) : null;

  return (
    <View style={styles.shelf}>
      <T v="small" tone="muted" style={styles.count}>{earned} of {items.length} earned</T>
      <View style={styles.grid}>
        {items.map((m) => {
          const badge = STICKERS[m.id] || FALLBACK;
          const isSelected = m.id === selected;
          return (
            <Pressable
              key={m.id}
              onFocus={() => select(m.id)}
              onPress={() => select(m.id)}
              accessibilityRole="button"
              accessibilityLabel={`${badge.name}, ${m.done ? 'earned' : 'locked'}. ${badge.criteria || m.label}. Progress: ${readProgress(m.progress).text}.`}
              aria-expanded={isSelected}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              <View style={[
                styles.tileFrame,
                { borderColor: isSelected ? c.accent : 'transparent', backgroundColor: isSelected ? c.accentSoft : 'transparent' },
              ]}>
                <StickerArt badge={badge} earned={m.done} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {milestone && selectedBadge && progress ? (
        <View
          aria-live="polite"
          style={[styles.detail, { backgroundColor: c.surface, borderColor: c.rule }]}
        >
          <T v="heading" accessibilityRole="header">{selectedBadge.name}</T>
          <T v="small">{selectedBadge.criteria || milestone.label}{selectedBadge.detail ? `. ${selectedBadge.detail}` : '.'}</T>
          <View style={styles.progressRow}>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel={`${selectedBadge.name} progress`}
              aria-valuemin={0}
              aria-valuemax={progress.target}
              aria-valuenow={progress.count}
              aria-valuetext={progress.text}
              style={[styles.track, { backgroundColor: c.surfaceAlt }]}
            >
              <View style={[styles.fill, {
                backgroundColor: milestone.done ? c.good : c.accent,
                width: `${Math.round(100 * progress.count / progress.target)}%`,
              }]} />
            </View>
            <T v="caption" tone={milestone.done ? 'good' : 'muted'}>
              {milestone.done ? 'Earned' : 'Locked'} · {progress.text}
            </T>
          </View>
        </View>
      ) : (
        <T v="caption" tone="muted" style={styles.hint}>Select a sticker to see how to earn it.</T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { width: '100%', maxWidth: 400, gap: space.s },
  count: { paddingHorizontal: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '25%', minHeight: 72, padding: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.m },
  tileFrame: { width: '100%', minHeight: 68, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.m },
  pressed: { opacity: 0.65 },
  art: { width: 62, height: 62, position: 'relative' },
  emblem: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', height: 19, width: 19, right: 2, bottom: 2, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  hint: { paddingHorizontal: space.xs, marginBottom: space.xs },
  detail: { borderRadius: radius.m, borderWidth: 1, padding: space.m, gap: space.xs },
  progressRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.xs },
  track: { height: 6, minWidth: 45, flex: 1, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
