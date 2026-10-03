import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { useAppState } from '../state/AppState';
import { deckProgress, todaySummary } from '../logic/triage';
import { dueItems } from '../logic/recall';
import { effectiveStreak } from '../logic/streak';
import { formatDay } from '../logic/date';
import { shortCitation } from '../logic/exporters';
import { NotRelevantReason } from '../types';
import { useNav } from '../navigation/types';
import { PaperCardView } from '../components/PaperCardView';
import { TriageBar, TriageChoice } from '../components/TriageBar';
import { ReportSummarySheet } from '../components/ReportSheets';
import { Button, Card, Chip, EmptyState, ProgressRing, Screen, Sheet, T } from '../ui/kit';
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
  const { deck, state, today, triagePaper, undoLastTriage } = useAppState();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const progress = deckProgress(deck, state.triage, today);
  const current = progress.nextIndex >= 0 ? deck[progress.nextIndex] : null;
  const streak = effectiveStreak(state.streak, today);
  const recallDue = useMemo(() => dueItems(state.recallQueue, today).length, [state.recallQueue, today]);

  const decide = (choice: TriageChoice, reason?: NotRelevantReason) => {
    if (!current) return;
    if (choice === 'not_relevant' && !reason) {
      setReasonOpen(true);
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    const action = choice === 'skip' ? 'seen' : choice === 'save' ? 'saved' : choice === 'survey' ? 'survey' : 'not_relevant';
    triagePaper(current.paper, action, reason);
    const msg =
      action === 'saved' ? 'Saved. You will get a recall question tomorrow.'
      : action === 'survey' ? 'Added to your survey.'
      : action === 'not_relevant' ? 'Hidden. Your feed will lean away from this.'
      : 'Skipped.';
    toast(msg, { label: 'Undo', onPress: undoLastTriage });
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

  if (!current) {
    const s = todaySummary(state.triage, today);
    return (
      <Screen>
        {header}
        <EmptyState icon="check-circle" title="You're caught up" body="That's today's deck. New papers arrive tomorrow." />
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
      <View style={{ paddingHorizontal: space.l }}>{header}</View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xl }}>
        <PaperCardView paper={paper} serendipity={current.serendipity} onReportSummary={() => setReportOpen(true)} />
        <View style={styles.links}>
          <Button kind="ghost" icon="external-link" label="Open paper" onPress={() => WebBrowser.openBrowserAsync(paper.url)} />
          <Button kind="ghost" icon="message-circle" label="Discuss" onPress={() => nav.navigate('Paper', { paperId: paper.id })} />
          <Button
            kind="ghost"
            icon="share-2"
            label="Share"
            onPress={() => Share.share({ message: `${shortCitation(paper)}\n${paper.url}` }).catch(() => {})}
          />
        </View>
      </ScrollView>
      <TriageBar onChoose={(c) => decide(c)} />

      <Sheet visible={reasonOpen} title="Why is this not for you?" onClose={() => setReasonOpen(false)}>
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
                setReasonOpen(false);
                decide('not_relevant', r.key);
              }}
            />
          ))}
        </View>
      </Sheet>
      <ReportSummarySheet paperId={paper.id} visible={reportOpen} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.m },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: space.s },
});
