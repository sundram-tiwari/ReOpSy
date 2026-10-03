import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAppState } from '../state/AppState';
import { dueItems, recallPrompt } from '../logic/recall';
import { cleanText } from '../logic/cardView';
import { RecallGrade } from '../types';
import { useNav } from '../navigation/types';
import { Button, Card, EmptyState, IconButton, Screen, T } from '../ui/kit';
import { space } from '../ui/theme';

/** Three questions at most, then done. Grading moves each paper between Leitner boxes. */
export function RecallScreen() {
  const nav = useNav();
  const { state, today, findPaper, gradeRecall, finishRecallSession } = useAppState();
  // Fix the session's questions when the screen opens, so grading does not reshuffle them.
  const [session] = useState(() => dueItems(state.recallQueue, today));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);

  const items = useMemo(
    () => session.map((q) => ({ q, paper: findPaper(q.paperId) })).filter((x) => x.paper),
    [session, findPaper],
  );

  const back = <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />;

  if (items.length === 0 || finished) {
    return (
      <Screen title="Recall" left={back}>
        <EmptyState
          icon="check-circle"
          title={finished ? 'Session done' : 'Nothing to recall today'}
          body={
            finished
              ? 'Papers you knew come back later; ones you forgot return tomorrow.'
              : 'Save or survey papers in Today. They come back here as questions, spaced out over days.'
          }
          action={<Button label="Back to Today" onPress={() => nav.goBack()} />}
        />
      </Screen>
    );
  }

  const { q, paper } = items[index];
  const prompt = recallPrompt(paper!);

  const grade = (g: RecallGrade) => {
    gradeRecall(q.paperId, g);
    if (index + 1 >= items.length) {
      finishRecallSession();
      setFinished(true);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  };

  return (
    <Screen title={`Recall · ${index + 1} of ${items.length}`} left={back}>
      <Card style={{ marginTop: space.m }}>
        <T v="label" tone="muted" style={{ marginBottom: space.s }}>
          Question
        </T>
        <T v="heading">{prompt.question}</T>
        {revealed ? (
          <View style={{ marginTop: space.l }}>
            <T v="label" tone="muted" style={{ marginBottom: space.s }}>
              Answer
            </T>
            <T>{prompt.answer}</T>
            <T v="small" tone="faint" style={{ marginTop: space.m }}>
              {cleanText(paper!.originalTitle)}
            </T>
          </View>
        ) : null}
      </Card>
      {revealed ? (
        <View style={{ gap: space.s, marginTop: space.l }}>
          <T v="small" tone="muted" style={{ textAlign: 'center' }}>
            How well did you remember it?
          </T>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" label="Forgot" onPress={() => grade('forgot')} style={{ flex: 1 }} />
            <Button kind="secondary" label="Fuzzy" onPress={() => grade('fuzzy')} style={{ flex: 1 }} />
            <Button label="Knew it" onPress={() => grade('knew')} style={{ flex: 1 }} />
          </View>
          <Button kind="ghost" label="Open the paper" onPress={() => nav.navigate('Paper', { paperId: q.paperId })} />
        </View>
      ) : (
        <Button label="Show answer" onPress={() => setRevealed(true)} style={{ marginTop: space.l }} />
      )}
    </Screen>
  );
}
