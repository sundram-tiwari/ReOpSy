import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Platform, Share, StyleSheet, View, ViewToken } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppState } from '../state/AppState';
import { DeckCard, deckProgress, todaySummary } from '../logic/triage';
import { dueItems } from '../logic/recall';
import { effectiveStreak } from '../logic/streak';
import { formatDay } from '../logic/date';
import { shortCitation } from '../logic/exporters';
import { NotRelevantReason, Paper } from '../types';
import { useNav } from '../navigation/types';
import { ShortAction, ShortCard, WEB_SNAP } from '../components/ShortCard';
import { ReportSummarySheet } from '../components/ReportSheets';
import { Button, Card, Chip, EmptyState, ProgressRing, Screen, Sheet, T } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { useToast } from '../ui/Toast';

const REASONS: { key: NotRelevantReason; label: string }[] = [
  { key: 'off_topic', label: 'Off-topic for me' },
  { key: 'low_quality', label: 'Low quality' },
  { key: 'already_know', label: 'Already read it' },
];

type Page = { kind: 'card'; card: DeckCard } | { kind: 'end' };

/**
 * Today as a vertical pager: one paper per screen, swipe up for the next,
 * like short-video apps. Unlike them, it ends: after today's deck the last
 * page says you're caught up, and there is nothing further to scroll.
 */
export function TodayScreen() {
  const nav = useNav();
  const tabs = useNavigation<any>();
  const toast = useToast();
  const { c } = useTheme();
  const { deck, state, today, triagePaper, markSeen, undoLastTriage, setLibraryStatus, libraryEntry } = useAppState();

  const [height, setHeight] = useState(0);
  const [reasonFor, setReasonFor] = useState<Paper | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const listRef = useRef<FlatList<Page>>(null);

  const pages = useMemo<Page[]>(() => [...deck.map((card) => ({ kind: 'card' as const, card })), { kind: 'end' as const }], [deck]);
  const progress = deckProgress(deck, state.triage, today);
  const streak = effectiveStreak(state.streak, today);
  const recallDue = useMemo(() => dueItems(state.recallQueue, today).length, [state.recallQueue, today]);

  // Open on the first paper not decided today; fixed for this visit.
  const [startIndex] = useState(() => (progress.nextIndex >= 0 ? progress.nextIndex : deck.length));
  const indexRef = useRef(startIndex);
  // Where the pager is heading; lets repeated key presses queue up pages.
  const targetRef = useRef(startIndex);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const markSeenRef = useRef(markSeen);
  markSeenRef.current = markSeen;

  // Swiping forward past a card counts as "seen" (a skip), never overriding a decision.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i !== 'number') return;
    for (let k = indexRef.current; k < i; k++) {
      const page = pagesRef.current[k];
      if (page && page.kind === 'card') markSeenRef.current(page.card.paper);
    }
    indexRef.current = i;
    targetRef.current = i;
  }).current;

  const goTo = useCallback((i: number) => {
    const target = Math.max(0, Math.min(i, pagesRef.current.length - 1));
    targetRef.current = target;
    listRef.current?.scrollToIndex({ index: target, animated: true });
  }, []);

  // Keyboard paging in the web build: arrows, Page Up/Down, j/k.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) {
        e.preventDefault();
        goTo(targetRef.current + 1);
      } else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) {
        e.preventDefault();
        goTo(targetRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  const act = (paper: Paper, action: ShortAction) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const status = libraryEntry(paper.id)?.status;
    switch (action) {
      case 'save':
        if (status === 'saved') {
          setLibraryStatus(paper, null);
          toast('Removed from your library.');
        } else {
          triagePaper(paper, 'saved');
          toast('Saved. It comes back tomorrow as a recall question.', { label: 'Undo', onPress: undoLastTriage });
        }
        break;
      case 'survey':
        if (status === 'survey') {
          setLibraryStatus(paper, null);
          toast('Removed from your survey.');
        } else {
          triagePaper(paper, 'survey');
          toast('Added to your survey.', { label: 'Undo', onPress: undoLastTriage });
        }
        break;
      case 'discuss':
        nav.navigate('Paper', { paperId: paper.id });
        break;
      case 'share':
        Share.share({ message: `${shortCitation(paper)}\n${paper.url}` }).catch(() => {});
        break;
      case 'not_relevant':
        setReasonFor(paper);
        break;
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="heading" accessibilityRole="header">
          Today
        </T>
        <T v="caption" tone="muted">
          {formatDay(today)}
        </T>
      </View>
      {streak > 0 ? <Chip label={`${streak}-day streak`} icon="zap" tone="accent" onPress={() => tabs.navigate('You')} /> : null}
      {deck.length > 0 ? (
        <View style={{ marginLeft: space.m }}>
          <ProgressRing done={progress.done} total={progress.total} size={40} />
        </View>
      ) : null}
    </View>
  );

  if (deck.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="inbox"
          title="Nothing new for your topics today"
          body="Every paper here passed a quality check, so some days are quiet. Add a topic to widen your deck."
          action={<Button label="Choose topics" icon="list" onPress={() => nav.navigate('Topics')} />}
        />
      </Screen>
    );
  }

  const endPage = () => {
    const s = todaySummary(state.triage, today);
    return (
      <View style={[{ height, paddingHorizontal: space.l, justifyContent: 'center' }, WEB_SNAP]}>
        <EmptyState icon="check-circle" title="You're caught up" body="That's today's papers. New ones arrive tomorrow." />
        <Card>
          <T>
            {s.saved} saved · {s.survey} in your survey · {s.notRelevant} not for you · {s.seen} skipped
          </T>
        </Card>
        <View style={{ gap: space.m, marginTop: space.l }}>
          {recallDue > 0 ? (
            <Button label={`Answer ${recallDue} recall question${recallDue === 1 ? '' : 's'}`} icon="repeat" onPress={() => nav.navigate('Recall')} />
          ) : null}
          <Button kind="secondary" label="What people you follow recommend" icon="users" onPress={() => tabs.navigate('Circles')} />
          <Button kind="ghost" label="Open your library" icon="book" onPress={() => tabs.navigate('Library')} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: space.l }}>{header}</View>
      <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height))}>
        {height > 0 ? (
          <FlatList
            ref={listRef}
            data={pages}
            keyExtractor={(p) => (p.kind === 'card' ? p.card.paper.id : 'end')}
            renderItem={({ item, index }) =>
              item.kind === 'end' ? (
                endPage()
              ) : (
                <ShortCard
                  paper={item.card.paper}
                  height={height}
                  serendipity={item.card.serendipity}
                  status={libraryEntry(item.card.paper.id)?.status}
                  showSwipeHint={index === 0 && progress.done === 0}
                  onAction={(a) => act(item.card.paper, a)}
                  onOpenPaper={() => WebBrowser.openBrowserAsync(item.card.paper.pdfUrl || item.card.paper.url)}
                  onDetails={() => nav.navigate('Paper', { paperId: item.card.paper.id })}
                  onReport={() => setReportFor(item.card.paper.id)}
                />
              )
            }
            pagingEnabled
            snapToInterval={height}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
            initialScrollIndex={Math.min(startIndex, pages.length - 1)}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            windowSize={3}
            style={Platform.OS === 'web' ? ({ scrollSnapType: 'y mandatory' } as object) : undefined}
          />
        ) : null}
      </View>

      <Sheet visible={Boolean(reasonFor)} title="Why is this not for you?" onClose={() => setReasonFor(null)}>
        <T tone="muted" style={{ marginBottom: space.m }}>
          Your answer tunes future decks. It stays on your device and in your private sync.
        </T>
        <View style={{ gap: space.s }}>
          {REASONS.map((r) => (
            <Button
              key={r.key}
              kind="secondary"
              label={r.label}
              onPress={() => {
                const paper = reasonFor;
                setReasonFor(null);
                if (!paper) return;
                triagePaper(paper, 'not_relevant', r.key);
                toast('Hidden. Your feed will lean away from this.', { label: 'Undo', onPress: undoLastTriage });
                goTo(targetRef.current + 1);
              }}
            />
          ))}
        </View>
      </Sheet>
      {reportFor ? <ReportSummarySheet paperId={reportFor} visible onClose={() => setReportFor(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.s },
});
