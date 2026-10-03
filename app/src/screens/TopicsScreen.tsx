import { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNav } from '../navigation/types';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { cleanText } from '../logic/cardView';
import { Button, Card, IconButton, ListRow, Screen, Sheet, T } from '../ui/kit';
import { space, useTheme } from '../ui/theme';

/** Topic list with a preview of real papers before you follow, so you know what you are signing up for. */
export function TopicsList() {
  const nav = useNav();
  const { c } = useTheme();
  const { state, feed, toggleTopic } = useAppState();
  const [preview, setPreview] = useState<string | null>(null);
  const topic = config.topics.find((t) => t.slug === preview);
  const papers = preview ? (feed[preview] || []).slice(0, 5) : [];

  return (
    <View>
      {config.topics.map((t) => {
        const on = state.followedTopics.includes(t.slug);
        const n = (feed[t.slug] || []).length;
        return (
          <ListRow
            key={t.slug}
            title={t.label}
            subtitle={`${t.blurb} · ${n} paper${n === 1 ? '' : 's'} now`}
            onPress={() => setPreview(t.slug)}
            right={
              <Button
                kind={on ? 'secondary' : 'primary'}
                label={on ? 'Following' : 'Follow'}
                icon={on ? 'check' : 'plus'}
                onPress={() => toggleTopic(t.slug)}
              />
            }
          />
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s, marginTop: space.l }}>
        <Feather name="info" size={16} color={c.muted} style={{ marginTop: 2 }} />
        <T v="small" tone="muted" style={{ flex: 1 }}>
          Every topic shows only papers that pass a quality check, so counts are small on purpose.
        </T>
      </View>

      <Sheet visible={Boolean(topic)} title={topic?.label || ''} onClose={() => setPreview(null)}>
        <T tone="muted" style={{ marginBottom: space.m }}>A sample of what this topic sends you.</T>
        {papers.length === 0 ? (
          <T tone="muted">No papers pass the quality check for this topic right now.</T>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {papers.map((p) => (
              <ListRow
                key={p.id}
                title={cleanText(p.headline || p.originalTitle)}
                subtitle={p.year ? String(p.year) : undefined}
                onPress={() => {
                  setPreview(null);
                  nav.navigate('Paper', { paperId: p.id });
                }}
              />
            ))}
          </Card>
        )}
        {topic ? (
          <Button
            style={{ marginTop: space.l }}
            label={state.followedTopics.includes(topic.slug) ? 'Unfollow' : 'Follow this topic'}
            kind={state.followedTopics.includes(topic.slug) ? 'secondary' : 'primary'}
            onPress={() => toggleTopic(topic.slug)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

export function TopicsScreen() {
  const nav = useNav();
  return (
    <Screen title="Topics" left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
      <TopicsList />
    </Screen>
  );
}
