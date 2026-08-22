import { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { colors, spacing, typography } from '../theme';

export const TopicTabs = () => {
  const { followedTopics, activeTopic, setActiveTopic, userApiConfig, customFeedData } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);

  // Map followed default topics
  const defaultFollowed = followedTopics
    .filter((slug) => slug !== 'custom')
    .map((slug) => {
      const found = config.topics.find((t) => t.slug === slug);
      if (found) return found;
      return {
        slug,
        label: slug,
        icon: 'hash',
        blurb: null,
      };
    });

  // Dynamically render custom tab if user has a custom topic or custom papers or followed custom
  const hasCustom = Boolean(
    userApiConfig?.customTopic ||
    (customFeedData && customFeedData.length > 0) ||
    followedTopics.includes('custom')
  );

  // Global Feed tab
  const globalTab = {
    slug: 'global',
    label: 'Global Feed',
    icon: 'globe',
    blurb: 'Consolidated feed of all research topics'
  };

  const visibleTopics = [globalTab, ...defaultFollowed];
  if (hasCustom) {
    visibleTopics.push({
      slug: 'custom',
      label: userApiConfig?.customTopic || 'Custom',
      icon: 'target',
      blurb: 'Live custom research topic feed'
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleTopics.map((topic) => {
          const isActive = activeTopic === topic.slug;
          return (
            <TouchableOpacity
              key={topic.slug}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => setActiveTopic(topic.slug)}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Feather
                name={(topic.icon || 'hash') as any}
                size={14}
                color={isActive ? colors.primary : colors.textDim}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.pillText, isActive && styles.pillTextActive]}
                numberOfLines={1}
              >
                {topic.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {visibleTopics.length === 0 && (
          <Text style={styles.emptyText}>You aren't following any topics.</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 24,
    backgroundColor: colors.accent,
    marginRight: spacing.s,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 48,
    minWidth: 48,
    maxWidth: 240,
  },
  pillActive: {
    backgroundColor: colors.primary + '20', // 20% opacity primary
    borderColor: colors.primary,
  },
  pillText: {
    ...typography.bodyDim,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.primary,
  },
  emptyText: {
    ...typography.caption,
    fontStyle: 'italic',
  }
});
