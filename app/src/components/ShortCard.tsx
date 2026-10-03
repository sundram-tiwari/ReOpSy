import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LibraryStatus, Paper } from '../types';
import { cleanText, formatAuthors, isPartialSummary, summaryBullets } from '../logic/cardView';
import { topicLabel } from '../config';
import { Button, Chip, T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

/** On the web, CSS scroll-snap makes one wheel or swipe move exactly one page. */
export const WEB_SNAP = Platform.OS === 'web' ? ({ scrollSnapAlign: 'start', scrollSnapStop: 'always' } as object) : null;
export type ShortAction = 'save' | 'survey' | 'discuss' | 'share' | 'not_relevant';

function RailButton({
  icon,
  label,
  active,
  onPress,
  hint,
}: {
  icon: FeatherName;
  label: string;
  active?: boolean;
  onPress: () => void;
  hint: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: Boolean(active) }}
      style={({ pressed }) => [styles.railBtn, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.railIcon, { backgroundColor: active ? c.accent : c.surfaceAlt }]}>
        <Feather name={icon} size={20} color={active ? c.accentInk : c.ink} />
      </View>
      <T v="caption" tone={active ? 'accent' : 'muted'} style={{ marginTop: 3, fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

/**
 * One paper, one screen, a few bullets. Limited on purpose: the headline and
 * bullets decide whether the paper is worth opening; "Open paper" and
 * "Details" are there for when it is.
 */
export function ShortCard({
  paper,
  height,
  serendipity,
  status,
  showSwipeHint,
  onAction,
  onOpenPaper,
  onDetails,
  onReport,
}: {
  paper: Paper;
  height: number;
  serendipity?: boolean;
  status?: LibraryStatus;
  showSwipeHint?: boolean;
  onAction: (a: ShortAction) => void;
  onOpenPaper: () => void;
  onDetails: () => void;
  onReport: () => void;
}) {
  const { c } = useTheme();
  const compact = height < 620;
  const bullets = summaryBullets(paper, compact ? 3 : 4);
  // Fewer bullets get more room each, so a single excerpt is not clipped.
  const bulletLines = compact ? 2 : bullets.length <= 2 ? 6 : 3;
  const partial = !paper.summaryParts && isPartialSummary(paper.summary);
  const isArxiv = paper.id.startsWith('arxiv:');
  const venue = paper.venue && !/arxiv preprint/i.test(paper.venue) ? paper.venue : isArxiv ? 'Preprint' : null;
  const meta = [formatAuthors(paper.authors, paper.authorCount), paper.year ? String(paper.year) : null, venue]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.page, { height }, WEB_SNAP]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.rule }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.topRow}>
            <T v="label" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {topicLabel(paper.topics?.[0] || '')}
            </T>
            {serendipity ? <Chip label="Outside your topics" icon="compass" /> : null}
          </View>

          <Pressable onPress={onDetails} accessibilityRole="button" accessibilityHint="Opens details and discussion">
            <T v="headline" numberOfLines={compact ? 3 : 5} style={styles.headline}>
              {cleanText(paper.headline || paper.catchyTitle || paper.originalTitle)}
            </T>
          </Pressable>
          <T v="small" tone="muted" numberOfLines={1} style={{ marginTop: space.xs }}>
            {meta}
          </T>

          <View style={{ marginTop: space.l, gap: compact ? space.s : space.m }}>
            {bullets.map((b, i) => (
              <View key={i} style={styles.bullet}>
                <View style={[styles.dot, { backgroundColor: b.label === 'Limits' ? c.warn : c.accent }]} />
                <T numberOfLines={bulletLines} style={{ flex: 1 }}>
                  {b.label ? (
                    <T style={{ fontWeight: '700' }} tone={b.label === 'Limits' ? 'warn' : 'ink'}>
                      {`${b.label}: `}
                    </T>
                  ) : null}
                  {b.text}
                </T>
              </View>
            ))}
            {partial ? (
              <T v="small" tone="faint">Short excerpt. Open the paper for the full abstract.</T>
            ) : null}
          </View>

          {paper.keyNumbers && paper.keyNumbers.length > 0 && !compact ? (
            <View style={styles.numbers}>
              {paper.keyNumbers.slice(0, 2).map((k) => (
                <View key={k.value + k.label} style={[styles.number, { backgroundColor: c.highlight }]}>
                  <T v="mono" style={{ color: c.highlightInk, fontWeight: '700' }}>
                    {k.value}
                  </T>
                  <T v="caption" style={{ color: c.highlightInk }} numberOfLines={1}>
                    {k.label}
                  </T>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flex: 1 }} />

          <View style={{ gap: space.s }}>
            <Button icon="external-link" label="Open paper" onPress={onOpenPaper} />
            <View style={styles.footerRow}>
              <Pressable onPress={onDetails} accessibilityRole="button" hitSlop={8}>
                <T v="small" tone="accent" style={{ fontWeight: '600' }}>
                  Details & discussion
                </T>
              </Pressable>
              {paper.summaryParts || paper.headline ? (
                <Pressable onPress={onReport} accessibilityRole="button" accessibilityLabel="Report this AI summary" hitSlop={8}>
                  <T v="caption" tone="faint">
                    AI summary · Report
                  </T>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.rail}>
          <RailButton icon="bookmark" label={status === 'saved' ? 'Saved' : 'Save'} active={status === 'saved'} onPress={() => onAction('save')} hint="Save to your library and get a recall question" />
          <RailButton icon="plus-square" label="Survey" active={status === 'survey'} onPress={() => onAction('survey')} hint="Add to your literature survey" />
          <RailButton icon="message-circle" label="Discuss" onPress={() => onAction('discuss')} hint="Open the discussion" />
          <RailButton icon="share-2" label="Share" onPress={() => onAction('share')} hint="Share the citation" />
          <RailButton icon="x" label="Not for me" onPress={() => onAction('not_relevant')} hint="Hide it and tune your feed" />
        </View>
      </View>

      {showSwipeHint ? (
        <View style={styles.hint} pointerEvents="none">
          <Feather name="chevrons-up" size={16} color={c.muted} />
          <T v="caption" tone="muted">
            Swipe up for the next paper
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.m, paddingTop: space.xs, paddingBottom: space.l },
  card: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.l,
    paddingVertical: space.l,
    paddingLeft: space.l,
    paddingRight: space.s,
    gap: space.s,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  headline: { marginTop: space.s, fontSize: 19, lineHeight: 25 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  number: { borderRadius: radius.s, paddingHorizontal: space.m, paddingVertical: space.xs, maxWidth: 150 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rail: { width: 64, justifyContent: 'flex-end', alignItems: 'center', gap: space.m },
  railBtn: { alignItems: 'center', minWidth: 56 },
  railIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
});
