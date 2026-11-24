import { useCallback, useMemo, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAppState } from '../state/AppState';
import { deckProgress, todaySummary } from '../logic/triage';
import { dueItems } from '../logic/recall';
import { effectiveStreak } from '../logic/streak';
import { formatDay } from '../logic/date';
import { shortCitation } from '../logic/exporters';
import { FeedAnchor, feedIndex } from '../logic/feedPager';
import { NotRelevantReason } from '../types';
import { useNav } from '../navigation/types';
import { DailyBriefSheet } from '../components/DailyBriefSheet';
import { FeedPager } from '../components/FeedPager';
import { FeedPaperPreview } from '../components/FeedPaperPreview';
import { PaperCardView } from '../components/PaperCardView';
import { TriageBar, TriageChoice } from '../components/TriageBar';
import { ReportSummarySheet } from '../components/ReportSheets';
import { Button, Card, Chip, EmptyState, IconButton, ProgressRing, Screen, Sheet, T } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

const REASONS: { key: NotRelevantReason; label: string }[] = [
  { key: 'off_topic', label: 'Off-topic for me' },
  { key: 'low_quality', label: 'Low quality' },
  { key: 'already_know', label: 'Already read it' },
];

export function TodayScreen() {
  const nav = useNav();
  const tabs = useNavigation<any>();
  const toast = useToast();
  const focused = useIsFocused();
  const { deck, state, today, feed, liveFeed, triagePaper, undoLastTriage } = useAppState();
  const [anchor, setAnchor] = useState<(FeedAnchor & { day: string }) | undefined>();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);

  const progress = deckProgress(deck, state.triage, today);
  const unread = useMemo(
    () => deck.map((card, deckIndex) => ({ ...card, deckIndex, paperId: card.paper.id }))
      .filter((card) => state.triage[card.paperId]?.day !== today),
    [deck, state.triage, today],
  );
  const index = feedIndex(unread, anchor?.day === today ? anchor : undefined);
  const current = index >= 0 ? unread[index] : null;
  const paperIds = useMemo(() => unread.map((card) => card.paperId), [unread]);
  const goTo = useCallback((page: number) => {
    const next = unread[page];
    if (next) setAnchor({ day: today, paperId: next.paperId, deckIndex: next.deckIndex });
  }, [today, unread]);
  const streak = effectiveStreak(state.streak, today);
  const recallDue = useMemo(() => dueItems(state.recallQueue, today).length, [state.recallQueue, today]);

  const decide = (choice: TriageChoice, reason?: NotRelevantReason) => {
    if (!current) return;
    if (choice === 'not_relevant' && !reason) {
      setReasonFor(current.paperId);
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const action = choice === 'skip' ? 'seen' : choice === 'save' ? 'saved' : choice === 'survey' ? 'survey' : 'not_relevant';
    goTo(index);
    triagePaper(current.paper, action, reason);
    const msg =
      action === 'saved' ? 'Saved. You will get a recall question tomorrow.'
      : action === 'survey' ? 'Added to your survey.'
      : action === 'not_relevant' ? 'Hidden. Your feed will lean away from this.'
      : 'Skipped.';
    toast(msg, { label: 'Undo', onPress: () => {
      goTo(index);
      undoLastTriage();
    } });
  };

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="title" accessibilityRole="header">
          Today
        </T>
        <T v="small" tone="muted">
          {formatDay(today)}
        </T>
      </View>
      <IconButton icon="file-text" label="Open research brief" onPress={() => setBriefOpen(true)} />
      {streak > 0 ? (
        <Chip label={`${streak}-day streak`} icon="zap" tone="accent" onPress={() => tabs.navigate('You')} />
      ) : null}
      {deck.length > 0 ? (
        <View style={{ marginLeft: space.m }}>
          <ProgressRing done={progress.done} total={progress.total} />
        </View>
      ) : null}
    </View>
  );

  const researchBrief = (
    <DailyBriefSheet
      visible={briefOpen}
      today={today}
      topics={feed}
      followed={state.followedTopics}
      isLive={!!liveFeed}
      generatedAt={liveFeed?.generatedAt ?? null}
      onClose={() => setBriefOpen(false)}
      onSource={(url) => WebBrowser.openBrowserAsync(url).catch(() => toast('Could not open that link.'))}
    />
  );

  if (deck.length === 0) {
    return (
      <Screen>
        {header}
        {researchBrief}
        <EmptyState
          icon="inbox"
          title="No unread papers for your topics"
          body="Try another topic to widen your deck, or open the research brief to check feed freshness."
          action={<Button label="Choose topics" icon="list" onPress={() => nav.navigate('Topics')} />}
        />
      </Screen>
    );
  }

  if (!current) {
    const s = todaySummary(state.triage, today);
    return (
      <Screen>
        {header}
        {researchBrief}
        <EmptyState icon="check-circle" title="You're caught up" body="That's today's deck. Check the research brief for the latest papers available." />
        <Card>
          <T v="label" tone="muted" style={{ marginBottom: space.s }}>
            Today
          </T>
          <T>
            {s.saved} saved · {s.survey} added to your survey · {s.notRelevant} not for you · {s.seen} skipped
          </T>
        </Card>
        <View style={{ gap: space.m, marginTop: space.l }}>
          {recallDue > 0 ? (
            <Button
              label={`Answer ${recallDue} recall question${recallDue === 1 ? '' : 's'}`}
              icon="repeat"
              onPress={() => nav.navigate('Recall')}
            />
          ) : (
            <T v="small" tone="muted" style={{ textAlign: 'center' }}>
              No recall questions due. Saved papers come back tomorrow as questions.
            </T>
          )}
          <Button kind="secondary" label="See what people you follow recommend" icon="users" onPress={() => tabs.navigate('Circles')} />
          <Button kind="ghost" label="Open your library" icon="book" onPress={() => tabs.navigate('Library')} />
        </View>
      </Screen>
    );
  }

  const paper = current.paper;
  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.feed}>
        <View style={styles.feedHeader}>{header}</View>
        <FeedPager
          index={index}
          paperIds={paperIds}
          active={focused && !briefOpen && ![reasonFor, reportFor, detailsFor].includes(paper.id)}
          onChange={goTo}
          render={(page, height, isCurrent) => {
            const card = unread[page];
            return (
              <FeedPaperPreview
                paper={card.paper}
                serendipity={card.serendipity}
                height={height}
                isCurrent={isCurrent}
                onDetails={() => setDetailsFor(card.paperId)}
                onOpen={() => WebBrowser.openBrowserAsync(card.paper.url)}
                onDiscuss={() => nav.navigate('Paper', { paperId: card.paperId })}
                onShare={() => {
                  const message = `${shortCitation(card.paper)}\n${card.paper.url}`;
                  if (Platform.OS === 'web') {
                    Clipboard.setStringAsync(message).then((copied) => toast(copied ? 'Citation and link copied.' : 'Could not copy the citation.')).catch(() => toast('Could not copy the citation.'));
                  } else {
                    Share.share({ message }).catch(() => {});
                  }
                }}
                onReport={() => setReportFor(card.paperId)}
              />
            );
          }}
        />
        <View
          style={styles.pagePosition}
          accessible
          accessibilityLabel={`Unread paper ${index + 1} of ${unread.length}`}
          accessibilityRole={Platform.OS === 'web' ? undefined : 'adjustable'}
          accessibilityValue={{ min: 1, max: unread.length, now: index + 1 }}
          accessibilityActions={[{ name: 'increment', label: 'Next paper' }, { name: 'decrement', label: 'Previous paper' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') goTo(index + 1);
            if (nativeEvent.actionName === 'decrement') goTo(index - 1);
          }}
        >
          <T v="caption" tone="muted" numberOfLines={1}>{`${index + 1} / ${unread.length}`}</T>
        </View>
        <TriageBar onChoose={decide} />
      </View>

      {researchBrief}
      <Sheet visible={reasonFor === paper.id} title="Why is this not for you?" onClose={() => setReasonFor(null)}>
        <T tone="muted" style={{ marginBottom: space.m }}>
          Your answer tunes future decks. It is stored on your device and in your private sync.
        </T>
        <View style={{ gap: space.s }}>
          {REASONS.map((r) => (
            <Button
              key={r.key}
              kind="secondary"
              label={r.label}
              onPress={() => {
                setReasonFor(null);
                decide('not_relevant', r.key);
              }}
            />
          ))}
        </View>
      </Sheet>
      <Sheet visible={detailsFor === paper.id} title="Paper details" onClose={() => setDetailsFor(null)}>
        <PaperCardView paper={paper} serendipity={current.serendipity} />
      </Sheet>
      <ReportSummarySheet paperId={paper.id} visible={reportFor === paper.id} onClose={() => setReportFor(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.m },
  feed: { flex: 1, minHeight: 0, width: '100%', maxWidth: 500, alignSelf: 'center', overflow: 'hidden' },
  feedHeader: { paddingHorizontal: space.l },
  pagePosition: { minHeight: 20, alignItems: 'center', justifyContent: 'center' },
});
