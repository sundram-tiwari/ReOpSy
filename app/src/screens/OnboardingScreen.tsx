import { useState } from 'react';
import { View } from 'react-native';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { Button, Card, Screen, Segmented, T } from '../ui/kit';
import { space } from '../ui/theme';
import { TopicsList } from './TopicsScreen';

/** Three short steps: what this is, how many cards a day, which topics. */
export function OnboardingScreen() {
  const { state, setDailyGoal, completeOnboarding } = useAppState();
  const [step, setStep] = useState(0);

  return (
    <Screen>
      <T v="label" tone="muted" style={{ marginTop: space.l }}>{`Step ${step + 1} of 3`}</T>

      {step === 0 && (
        <View style={{ gap: space.l, marginTop: space.m }}>
          <T v="title" accessibilityRole="header">Ten minutes a day, a literature review by the end of term</T>
          <Card>
            <View style={{ gap: space.m }}>
              <T>
                <T style={{ fontWeight: '700' }}>Triage. </T>A short deck of new papers in your topics. It ends, so you can finish it.
              </T>
              <T>
                <T style={{ fontWeight: '700' }}>Recall. </T>Papers you save come back as quick questions, spaced over days.
              </T>
              <T>
                <T style={{ fontWeight: '700' }}>Synthesize. </T>Your survey grows into a literature matrix you can export to Overleaf, Zotero or a spreadsheet.
              </T>
            </View>
          </Card>
          <T v="small" tone="muted">No account needed. Summaries are AI-written from abstracts and labelled; the original is one tap away.</T>
          <Button label="Start" onPress={() => setStep(1)} />
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: space.l, marginTop: space.m }}>
          <T v="title" accessibilityRole="header">How many cards a day?</T>
          <T tone="muted">Small is sustainable. You can change this any time in You.</T>
          <Segmented
            options={config.dailyGoals.map((g) => ({ key: String(g), label: `${g} cards` }))}
            value={String(state.dailyGoal)}
            onChange={(g) => setDailyGoal(Number(g))}
          />
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" label="Back" onPress={() => setStep(0)} style={{ flex: 1 }} />
            <Button label="Next" onPress={() => setStep(2)} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: space.l, marginTop: space.m }}>
          <T v="title" accessibilityRole="header">Pick your topics</T>
          <T tone="muted">Tap a topic to preview real papers before following it.</T>
          <TopicsList />
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" label="Back" onPress={() => setStep(1)} style={{ flex: 1 }} />
            <Button label="Deal me in" onPress={completeOnboarding} disabled={state.followedTopics.length === 0} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </Screen>
  );
}
