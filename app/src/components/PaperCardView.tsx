import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Paper } from '../types';
import { toCardView } from '../logic/cardView';
import { topicLabel } from '../config';
import { Chip, T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

const PART_LABELS: [keyof NonNullable<ReturnType<typeof toCardView>['parts']>, string][] = [
  ['problem', 'Problem'],
  ['approach', 'Approach'],
  ['result', 'Result'],
  ['limits', 'Limits'],
];

/**
 * The paper card. Order follows how a researcher triages: what was found
 * (headline), is it real (four-part summary with limits), can I read it
 * (chips), why am I seeing it, and where did the words come from.
 */
export function PaperCardView({
  paper,
  serendipity,
  onReportSummary,
}: {
  paper: Paper;
  serendipity?: boolean;
  onReportSummary?: () => void;
}) {
  const { c } = useTheme();
  const v = toCardView(paper, { serendipity });

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.rule }]}>
      <T v="label" tone="muted" style={{ marginBottom: space.s }}>
        {topicLabel(paper.topics?.[0] || '')}
      </T>
      <T v="headline" accessibilityRole="header">
        {v.headline}
      </T>
      {v.originalTitle ? (
        <T v="small" tone="muted" style={{ marginTop: space.xs }}>
          {v.originalTitle}
        </T>
      ) : null}

      <View style={{ marginTop: space.l, gap: space.m }}>
        {v.parts ? (
          PART_LABELS.map(([key, label]) =>
            v.parts![key] ? (
              <View key={key} style={styles.part}>
                <T v="label" tone={key === 'limits' ? 'warn' : 'faint'} style={styles.partLabel}>
                  {label}
                </T>
                <T style={{ flex: 1 }}>{v.parts![key]}</T>
              </View>
            ) : null,
          )
        ) : v.summary ? (
          <View>
            <T>{v.summary}</T>
            {v.summaryIsPartial ? (
              <T v="small" tone="warn" style={{ marginTop: space.s }}>
                This text is cut short. Open the abstract for the full version.
              </T>
            ) : null}
          </View>
        ) : null}
      </View>

      {v.keyNumbers.length > 0 && (
        <View style={styles.numbers}>
          {v.keyNumbers.slice(0, 3).map((k) => (
            <View key={k.value + k.label} style={[styles.number, { backgroundColor: c.highlight }]}>
              <T v="mono" style={{ color: c.highlightInk, fontWeight: '700' }}>
                {k.value}
              </T>
              <T v="caption" style={{ color: c.highlightInk }} numberOfLines={2}>
                {k.label}
              </T>
            </View>
          ))}
        </View>
      )}

      <View style={styles.chips}>
        {v.chips.map((chip) => (
          <Chip
            key={chip.kind + chip.label}
            label={chip.label}
            icon={chip.kind === 'open' ? 'unlock' : chip.kind === 'code' ? 'code' : chip.kind === 'serendipity' ? 'compass' : undefined}
            tone={chip.kind === 'open' ? 'good' : 'muted'}
          />
        ))}
      </View>

      <T v="small" tone="muted" style={{ marginTop: space.m }}>
        {v.authorsLine}
        {v.metaLine ? ` · ${v.metaLine}` : ''}
      </T>

      {v.whyShown || serendipity ? (
        <View style={[styles.why, { borderTopColor: c.rule }]}>
          <Feather name="info" size={14} color={c.muted} style={{ marginTop: 3, marginRight: space.s }} />
          <T v="small" tone="muted" style={{ flex: 1 }}>
            {serendipity
              ? 'Outside your topics, picked to keep your feed broad.'
              : v.whyShown}
          </T>
        </View>
      ) : null}

      {v.aiWritten ? (
        <View style={styles.aiRow}>
          <T v="caption" tone="faint" style={{ flex: 1 }}>
            AI-written summary. Check the abstract before citing.
          </T>
          {onReportSummary ? (
            <Pressable onPress={onReportSummary} accessibilityRole="button" hitSlop={8}>
              <T v="caption" tone="accent" style={{ fontWeight: '600' }}>
                Report
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.l, padding: space.l },
  part: { flexDirection: 'row', gap: space.m },
  partLabel: { width: 72, paddingTop: 5 },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  number: { borderRadius: radius.s, paddingHorizontal: space.m, paddingVertical: space.s, maxWidth: 160 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  why: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.m, paddingTop: space.m },
  aiRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.m },
});
