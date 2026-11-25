import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { topicLabel } from '../config';
import { buildDailyBrief, FEED_LABELS, feedStatus } from '../logic/dailyBrief';
import { formatDay } from '../logic/date';
import { Paper } from '../types';
import { Button, Card, Sheet, T } from '../ui/kit';
import { space } from '../ui/theme';

export function DailyBriefSheet({ visible, today, topics, followed, isLive, generatedAt, onClose, onSource }: {
  visible: boolean;
  today: string;
  topics: Record<string, Paper[]>;
  followed: string[];
  isLive: boolean;
  generatedAt: string | null;
  onClose: () => void;
  onSource: (url: string) => void;
}) {
  const brief = useMemo(() => buildDailyBrief(topics, followed, today), [topics, followed, today]);
  const status = feedStatus(isLive ? 'live' : 'sample', generatedAt, today);
  const freshLabel = FEED_LABELS[status].detail;
  return (
    <Sheet visible={visible} title="Research brief" onClose={onClose}>
      <View style={styles.content}>
        <T v="caption" tone="muted">{freshLabel}</T>
        <T accessibilityRole="header" v="heading">
          {brief.today > 0
            ? `${brief.today} ${brief.today === 1 ? 'paper' : 'papers'} published today`
            : 'No papers dated today in this feed'}
        </T>
        <T tone="muted">
          {brief.recent > 0
            ? `Across your followed topics · ${brief.recent} dated in the past 7 days. Check the linked paper before citing its summary.`
            : 'Nothing with a verified recent publication date is available for your followed topics in this snapshot.'}
        </T>
        {brief.entries.map(({ paper, topic, published, finding }) => (
          <Card key={paper.id}>
            <View style={styles.paper}>
              <T v="caption" tone="muted">{topicLabel(topic)} · {formatDay(published)}</T>
              <T v="heading" accessibilityRole="header">{paper.originalTitle}</T>
              {finding ? <T>{finding}</T> : <T tone="muted">No verified finding is available in this feed.</T>}
              {!!finding && !!paper.excerptLicense && <T v="caption" tone="muted">Source excerpt · {paper.excerptLicense}</T>}
              <Button label="Open cited paper" kind="ghost" icon="external-link" onPress={() => onSource(paper.url)} />
            </View>
          </Card>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.m },
  paper: { gap: space.s },
});
