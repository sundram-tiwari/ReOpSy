import { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { colors, spacing, typography } from '../theme';

export const TopicTabs = () => {
  const { followedTopics, activeTopic, setActiveTopic } = useAppState();
  const scrollViewRef = useRef<ScrollView>(null);

  // Filter available config topics down to what user follows
  const visibleTopics = config.topics.filter(t => followedTopics.includes(t.slug));

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
            >
              <Feather 
                name={topic.icon as any} 
                size={14} 
                color={isActive ? colors.primary : colors.textDim} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
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
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 20,
    backgroundColor: colors.accent,
    marginRight: spacing.s,
    borderWidth: 1,
    borderColor: 'transparent',
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
