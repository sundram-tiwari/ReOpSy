import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { topicLabel } from '../config';
import { toCardView } from '../logic/cardView';
import { Paper } from '../types';
import { T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

type Icon = React.ComponentProps<typeof Feather>['name'];
type Action = { label: string; text?: string; icon: Icon; run: () => void; primary?: boolean };

export function FeedPaperPreview({
  paper, serendipity, height, isCurrent, onDetails, onOpen, onDiscuss, onShare, onReport,
}: {
  paper: Paper;
  serendipity: boolean;
  height: number;
  isCurrent: boolean;
  onDetails: () => void;
  onOpen: () => void;
  onDiscuss: () => void;
  onShare: () => void;
  onReport: () => void;
}) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [excerptHeight, setExcerptHeight] = useState(0);
  const small = height / Math.max(1, fontScale) < 415;
  const tiny = height / Math.max(1, fontScale) < 275;
  const v = toCardView(paper, { serendipity });
  const [excerptLabel, excerpt] = v.parts
    ? v.parts.result ? ['Key finding', v.parts.result] : ['Research question', v.parts.problem || v.parts.approach || v.parts.limits]
    : [v.summaryIsPartial ? 'Abstract excerpt' : 'At a glance', v.summary];
  const lineHeight = small ? 20 : 24;
  const excerptLines = Math.min(small ? 5 : 7, Math.floor((excerptHeight + 0.5) / (lineHeight * Math.max(fontScale, 1))));
  const actions: Action[] = [
    { label: 'Read full card', text: 'Details', icon: 'file-text', run: onDetails, primary: true },
    { label: 'Open paper', text: 'Open', icon: 'external-link', run: onOpen },
    { label: 'Discuss', text: 'Discuss', icon: 'message-circle', run: onDiscuss },
    { label: 'Share', icon: 'share-2', run: onShare },
  ];

  return (
    <View style={[styles.page, small && styles.smallPage]}>
      <View style={[styles.card, small && styles.smallCard, { backgroundColor: c.surface, borderColor: c.rule }]}>
        <View style={styles.topicRow}>
          <T v="label" tone="muted" numberOfLines={1} style={styles.topic}>{topicLabel(paper.topics?.[0] || '')}</T>
          {serendipity ? <Feather name="compass" color={c.muted} size={15} accessibilityLabel="Outside your topics" /> : null}
        </View>
        <T v={tiny ? 'heading' : 'headline'} accessibilityRole="header" numberOfLines={tiny ? 2 : small ? 3 : 4} style={styles.headline}>
          {v.headline}
        </T>
        {!tiny && (
          <T v="caption" tone="muted" numberOfLines={1}>
            {v.authorsLine}{v.metaLine ? ` · ${v.metaLine}` : ''}
          </T>
        )}
        {!tiny && excerpt ? (
          <View style={[styles.finding, small && styles.smallFinding]}>
            <T v="label" tone="muted" numberOfLines={1}>{excerptLabel}</T>
            <View style={styles.excerpt} onLayout={(e) => setExcerptHeight((h) => {
              const next = e.nativeEvent.layout.height;
              return Math.abs(next - h) > 0.5 ? next : h;
            })}>
              {excerptLines > 0 ? <T v={small ? 'small' : 'body'} numberOfLines={excerptLines}>{excerpt}</T> : null}
            </View>
          </View>
        ) : <View style={styles.spacer} />}
        {v.aiWritten && !tiny ? (
          <View style={styles.disclosure}>
            <T v="caption" tone="muted" numberOfLines={1} style={styles.topic}>AI-written · check before citing</T>
            <Pressable
              onPress={onReport}
              disabled={!isCurrent}
              accessibilityRole="button"
              accessibilityLabel="Report summary"
              style={({ pressed }) => [styles.report, pressed && styles.pressed]}
            >
              <T v="caption" tone="muted" numberOfLines={1} style={styles.reportLabel}>Report</T>
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.actions, { borderTopColor: c.rule }]}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.run}
              disabled={!isCurrent}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => [
                styles.action,
                !tiny && a.text ? styles.labeledAction : styles.iconAction,
                a.primary && { backgroundColor: c.accentSoft },
                pressed && { backgroundColor: c.surfaceAlt },
              ]}
            >
              <Feather name={a.icon} color={a.primary ? c.accent : c.muted} size={16} />
              {!tiny && a.text ? (
                <T v="caption" tone={a.primary ? 'accent' : 'muted'} numberOfLines={1} style={styles.actionLabel}>
                  {a.text}
                </T>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, paddingHorizontal: space.m, paddingVertical: space.s },
  smallPage: { paddingHorizontal: space.s, paddingVertical: space.xs },
  card: { flex: 1, minHeight: 0, overflow: 'hidden', paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xs, borderWidth: 1, borderRadius: radius.l },
  smallCard: { paddingHorizontal: space.m, paddingTop: space.s },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.xs },
  topic: { flex: 1, minWidth: 0 },
  headline: { marginBottom: space.xs },
  finding: { flex: 1, minHeight: 0, gap: space.xs, marginTop: space.l, overflow: 'hidden' },
  smallFinding: { marginTop: space.s },
  excerpt: { flex: 1, minHeight: 0, overflow: 'hidden' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  report: { minHeight: 36, paddingHorizontal: space.xs, justifyContent: 'center' },
  reportLabel: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: radius.s },
  labeledAction: { flex: 1, minWidth: 0 },
  iconAction: { flexGrow: 0.75, minWidth: 44 },
  actionLabel: { flexShrink: 1, fontWeight: '600' },
  spacer: { flex: 1, minHeight: 0 },
});
