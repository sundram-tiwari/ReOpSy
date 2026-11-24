import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { topicLabel } from '../config';
import { toCardView } from '../logic/cardView';
import { fitPreviewText } from '../logic/previewText';
import { Paper } from '../types';
import { T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';
import { useFeedLike } from './FeedLikeFeedback';

type Icon = React.ComponentProps<typeof Feather>['name'];
type Action = { label: string; icon: Icon; run: () => void; primary?: boolean };

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
  const { width, fontScale } = useWindowDimensions();
  const { liked, tapEvents, cancelTap, toggle, heart } = useFeedLike(paper.id, isCurrent);
  const [excerptBox, setExcerptBox] = useState({ height: 0, width: 0 });
  const small = height / Math.max(1, fontScale) < 415;
  const tiny = height / Math.max(1, fontScale) < 275;
  const v = toCardView(paper, { serendipity });
  const [excerptLabel, excerpt] = v.parts
    ? v.parts.result ? ['Key finding', v.parts.result] : ['Research question', v.parts.problem || v.parts.approach || v.parts.limits]
    : [v.summaryIsPartial ? 'Abstract excerpt' : 'At a glance', v.summary];
  const lineHeight = small ? 20 : 24;
  const scale = Math.max(fontScale, 1);
  const excerptLines = Math.min(tiny ? 2 : small ? 5 : 7, Math.floor((excerptBox.height + 0.5) / (lineHeight * scale)));
  const excerptText = fitPreviewText(excerpt ?? '', excerptBox.width, excerptLines, (small ? 14 : 16) * scale);
  const actions: Action[] = [
    { label: 'Read full card', icon: 'file-text', run: onDetails, primary: true },
    { label: 'Open paper', icon: 'external-link', run: onOpen },
    { label: 'Discuss', icon: 'message-circle', run: onDiscuss },
    { label: 'Share', icon: 'share-2', run: onShare },
    ...(v.aiWritten ? [{ label: 'Report summary', icon: 'flag' as const, run: onReport }] : []),
  ];

  return (
    <View style={[styles.page, small && styles.smallPage, width < 310 && styles.narrowPage]}>
      <View style={[styles.card, small && styles.smallCard, width < 310 && styles.narrowCard, { backgroundColor: c.surface, borderColor: c.rule }]}>
        <View {...tapEvents} style={[styles.tapBody, touchBody]} collapsable={false} testID="feed-like-target">
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
          {excerpt ? (
            <View style={[styles.finding, small && styles.smallFinding]}>
              {!tiny && excerptLabel !== 'At a glance' && <T v="label" tone="muted" numberOfLines={1}>{excerptLabel}</T>}
              <View testID="feed-excerpt" style={styles.excerpt} onLayout={(e) => {
                const { height: measuredHeight, width: measuredWidth } = e.nativeEvent.layout;
                setExcerptBox((last) => Math.abs(last.height - measuredHeight) <= 0.5 && Math.abs(last.width - measuredWidth) <= 0.5
                  ? last : { height: measuredHeight, width: measuredWidth });
              }}>
                {!!excerptText && <T v={small ? 'small' : 'body'} numberOfLines={excerptLines}>{excerptText}</T>}
              </View>
            </View>
          ) : <View style={styles.spacer} />}
          {v.aiWritten && !tiny && <T v="caption" tone="muted" numberOfLines={1} style={styles.disclosure}>AI summary · check before citing</T>}
          {heart}
        </View>
        <View onTouchStart={cancelTap} style={[styles.actions, { borderTopColor: c.rule }]}>
          <Pressable
            onPress={toggle}
            disabled={!isCurrent}
            accessibilityRole={Platform.OS === 'web' ? 'button' : 'togglebutton'}
            accessibilityLabel="Like paper"
            accessibilityHint="Private to you"
            accessibilityState={Platform.OS === 'web' ? undefined : { checked: liked }}
            {...(Platform.OS === 'web' ? { 'aria-pressed': liked } : {})}
            style={({ pressed }) => [
              styles.action,
              width < 282 && styles.narrowAction,
              liked && { backgroundColor: c.accentSoft },
              pressed && { backgroundColor: c.surfaceAlt },
            ]}
          >
            <Ionicons name={liked ? 'heart' : 'heart-outline'} color={liked ? c.accent : c.muted} size={21} />
          </Pressable>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.run}
              disabled={!isCurrent}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => [
                styles.action,
                width < 282 && styles.narrowAction,
                a.primary && { backgroundColor: c.accentSoft },
                pressed && { backgroundColor: c.surfaceAlt },
              ]}
            >
              <Feather name={a.icon} color={a.primary ? c.accent : c.muted} size={19} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const touchBody = Platform.OS === 'web' ? ({ touchAction: 'none' } as ViewStyle) : null;
const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, paddingHorizontal: space.m, paddingVertical: space.s },
  narrowPage: { paddingHorizontal: space.xs },
  narrowCard: { paddingHorizontal: space.xs },
  smallPage: { paddingHorizontal: space.s, paddingVertical: space.xs },
  card: { flex: 1, minHeight: 0, overflow: 'hidden', paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xs, borderWidth: 1, borderRadius: radius.l },
  smallCard: { paddingHorizontal: space.m, paddingTop: space.s },
  tapBody: { flex: 1, minHeight: 0 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.xs },
  topic: { flex: 1, minWidth: 0 },
  headline: { marginBottom: space.xs, flexShrink: 1 },
  finding: { flex: 1, minHeight: 0, gap: space.xs, marginTop: space.m },
  smallFinding: { marginTop: space.s },
  excerpt: { flex: 1, minHeight: 0 },
  disclosure: { paddingTop: space.xs, paddingBottom: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.s },
  narrowAction: { minWidth: 0 },
  spacer: { flex: 1, minHeight: 0 },
});
