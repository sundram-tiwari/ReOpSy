import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import type { DeckCard } from '../logic/triage';
import type { FeedAnchor } from '../logic/feedPager';
import { desktopPaperWindow, desktopTodayColumns } from '../logic/desktopToday';
import { PaperCardView } from './PaperCardView';
import { TriageBar } from './TriageBar';
import type { TriageChoice } from './TriageBar';
import { useAppState } from '../state/AppState';
import { T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

export type TodayPaper = DeckCard & FeedAnchor;

function pointerIsCoarse() {
  if (Platform.OS !== 'web') return true;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export function useTodayColumns() {
  const { width, height } = useWindowDimensions();
  const [coarse, setCoarse] = useState(pointerIsCoarse);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(pointer: coarse)');
    const change = () => setCoarse(query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return desktopTodayColumns(width, height, coarse);
}

type Action = { label: string; text: string; icon: React.ComponentProps<typeof Feather>['name']; run: () => void };
type DesktopTodayProps = {
  header: ReactNode;
  cards: TodayPaper[];
  columns: 2 | 3;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
  onFocusCard: (card: TodayPaper) => void;
  onDetails: (card: TodayPaper) => void;
  onOpen: (card: TodayPaper) => void;
  onDiscuss: (card: TodayPaper) => void;
  onShare: (card: TodayPaper) => void;
  onReport: (card: TodayPaper) => void;
  onDecide: (card: TodayPaper, choice: TriageChoice) => void;
};

export function DesktopToday({
  header, cards, columns, index, active, onSelect, onFocusCard, onDetails, onOpen, onDiscuss, onShare, onReport, onDecide,
}: DesktopTodayProps) {
  const { c } = useTheme();
  const { state, setPaperLiked } = useAppState();
  const desk = useRef<View>(null);
  const wheelZone = useRef<View>(null);
  const reader = useRef<ScrollView>(null);
  const count = cards.length;
  const page = desktopPaperWindow(index, count, columns);
  const controls = useRef({ index, count, page, onSelect });

  useLayoutEffect(() => {
    controls.current = { index, count, page, onSelect };
  }, [index, count, page, onSelect]);

  useEffect(() => {
    reader.current?.scrollTo({ y: 0, animated: false });
  }, [page.start]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    const root = desk.current as unknown as HTMLElement | null;
    const pager = wheelZone.current as unknown as HTMLElement | null;
    if (!root?.contains || !pager?.addEventListener) return;

    // Wheel over papers scrolls their content. Only wheel over the paginator
    // changes the set, so an inertia tail never skips multiple sets.
    let last = -Infinity;
    let travel = 0;
    let turned = false;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      if (event.timeStamp - last > 180) {
        travel = 0;
        turned = false;
      }
      last = event.timeStamp;
      const { page: current, onSelect: select } = controls.current;
      if (current.previous === null && current.next === null) return;
      event.preventDefault();
      if (turned) return;
      travel += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pager.clientHeight : 1);
      if (Math.abs(travel) >= 34) {
        turned = true;
        const target = travel < 0 ? current.previous : current.next;
        if (target !== null) select(target);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target && target !== document.body && target !== document.documentElement && !root.contains(target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const { index: current, count: length, onSelect: select } = controls.current;
      const next = current + (event.key === 'ArrowLeft' ? -1 : 1);
      if (next < 0 || next >= length) return;
      event.preventDefault();
      select(next);
    };
    pager.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('keydown', key);
    return () => {
      pager.removeEventListener('wheel', wheel);
      document.removeEventListener('keydown', key);
    };
  }, [active]);

  return (
    <View ref={desk} style={styles.desk} testID="desktop-today">
      <View style={styles.top}>
        {header}
        <View style={[styles.toolbar, { borderBottomColor: c.rule }]}>
          <T v="label" tone="muted">Reading desk</T>
          <View ref={wheelZone} style={styles.pager} testID="desktop-deck-pager">
            {([['Previous papers', 'chevron-left', page.previous], ['Next papers', 'chevron-right', page.next]] as const).map(
              ([label, icon, target], position) => (
                <View key={label} style={styles.pagerItem}>
                  {position === 1 && (
                    <T v="small" tone="muted" style={styles.pageCount}>
                      {`Papers ${page.start + 1}–${page.end} of ${count}`}
                    </T>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    disabled={target === null}
                    accessibilityState={{ disabled: target === null }}
                    onPress={() => target !== null && onSelect(target)}
                    style={({ pressed }) => [
                      styles.arrow,
                      { borderColor: c.rule },
                      pressed && { backgroundColor: c.accentSoft },
                      target === null && styles.disabled,
                    ]}
                  >
                    <Feather name={icon} size={19} color={c.ink} />
                  </Pressable>
                </View>
              ),
            )}
          </View>
        </View>
      </View>
      <ScrollView ref={reader} contentContainerStyle={styles.scrollContent} testID="desktop-paper-scroll">
        <View style={styles.grid} testID="desktop-paper-grid">
          {Array.from({ length: columns }, (_, column) => {
            const paperIndex = page.start + column;
            const card = cards[paperIndex];
            if (!card) return <View key={`empty-${column}`} style={styles.column} />;
            const actions: Action[] = [
              { label: 'Read full card', text: 'Details', icon: 'file-text', run: () => onDetails(card) },
              { label: 'Open paper', text: 'Open', icon: 'external-link', run: () => onOpen(card) },
              { label: 'Discuss', text: 'Discuss', icon: 'message-circle', run: () => onDiscuss(card) },
              { label: 'Share', text: 'Share', icon: 'share-2', run: () => onShare(card) },
            ];
            const focusCard = () => onFocusCard(card);
            const liked = state.paperLikes[card.paperId]?.liked === true;
            return (
              <View key={card.paperId} style={styles.column} testID="desktop-paper-card">
                <PaperCardView
                  paper={card.paper}
                  serendipity={card.serendipity}
                  desk
                  current={paperIndex === index}
                  onReportSummary={() => onReport(card)}
                  onFocus={focusCard}
                  footer={
                    <>
                      <View style={[styles.links, { borderTopColor: c.rule }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Like paper"
                          accessibilityState={Platform.OS === 'web' ? undefined : { checked: liked }}
                          {...(Platform.OS === 'web' ? { 'aria-pressed': liked } : {})}
                          onFocus={focusCard}
                          onPress={() => setPaperLiked(card.paperId, !liked)}
                          style={({ pressed }) => [styles.action, pressed && { backgroundColor: c.surfaceAlt }]}
                        >
                          <Ionicons name={liked ? 'heart' : 'heart-outline'} color={c.accent} size={17} />
                          <T v="caption" tone="accent" style={styles.actionText}>{liked ? 'Liked' : 'Like'}</T>
                        </Pressable>
                        {actions.map((action) => (
                          <Pressable
                            key={action.label}
                            accessibilityRole="button"
                            accessibilityLabel={action.label}
                            onPress={action.run}
                            onFocus={focusCard}
                            style={({ pressed }) => [
                              styles.action,
                              pressed && { backgroundColor: c.surfaceAlt },
                            ]}
                          >
                            <Feather name={action.icon} size={16} color={c.accent} />
                            <T v="caption" tone="accent" style={styles.actionText} numberOfLines={1}>{action.text}</T>
                          </Pressable>
                        ))}
                      </View>
                      <TriageBar showLabels onFocus={focusCard} onChoose={(choice) => onDecide(card, choice)} />
                    </>
                  }
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  desk: { flex: 1, minHeight: 0 },
  top: { width: '100%', maxWidth: 1544, alignSelf: 'center', paddingHorizontal: space.xl },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  pager: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  pagerItem: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  pageCount: { minWidth: 108, textAlign: 'center', fontVariant: ['tabular-nums'] },
  arrow: { width: 44, height: 44, borderRadius: radius.s, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.33 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.m, paddingBottom: space.xl },
  grid: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: space.l, maxWidth: 1496, alignSelf: 'center' },
  column: { flex: 1, minWidth: 0 },
  links: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs, marginTop: space.m },
  action: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.s, gap: 2 },
  actionText: { maxWidth: '100%', fontWeight: '600' },
});
