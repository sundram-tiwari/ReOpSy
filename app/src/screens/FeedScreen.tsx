import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, Platform, LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { PaperCard } from '../components/PaperCard';
import { TopicTabs } from '../components/TopicTabs';
import { colors, spacing, typography } from '../theme';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type FeedScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<any, 'Feed'>,
  NativeStackNavigationProp<any>
>;

interface Props {
  navigation: FeedScreenNavigationProp;
}

export const FeedScreen: React.FC<Props> = ({ navigation }) => {
  const { feedData, activeTopic, followedTopics, recordRead, customFeedData } = useAppState();
  const flatListRef = useRef<FlatList>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // If active topic isn't followed (and not custom or global), fallback handled if needed
  useEffect(() => {
    if (activeTopic !== 'custom' && activeTopic !== 'global' && !followedTopics.includes(activeTopic) && followedTopics.length > 0) {
      // Handled gracefully
    }
  }, [followedTopics, activeTopic]);

  // When changing topics, scroll to top
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  }, [activeTopic]);

  const activePapers = activeTopic === 'custom' ? (customFeedData || []) : (feedData[activeTopic] || []);

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      recordRead();
    }
  }).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && Math.abs(height - containerHeight) > 1) {
      setContainerHeight(height);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => navigation.openDrawer()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Open navigation menu"
        >
          <Feather name="menu" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ReOpSy</Text>
        <View style={styles.placeholder} />
      </View>

      <TopicTabs />

      <View style={styles.feedContainer} onLayout={handleLayout}>
        {activeTopic === 'custom' && activePapers.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="target" size={36} color={colors.primary} style={{ marginBottom: spacing.m }} />
            <Text style={styles.emptyTitle}>Custom Research Topic Feed</Text>
            <Text style={styles.emptyText}>
              No custom papers fetched yet. Enter your research topic in Settings to fetch live arXiv papers with AI flashcard summaries!
            </Text>
            <TouchableOpacity
              style={styles.configureButton}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.8}
            >
              <Feather name="settings" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.configureButtonText}>Configure in Settings</Text>
            </TouchableOpacity>
          </View>
        ) : activePapers.length > 0 ? (
            <FlatList
              ref={flatListRef}
              data={activePapers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PaperCard paper={item} cardHeight={containerHeight > 0 ? containerHeight : undefined} />
              )}
              pagingEnabled={true}
              snapToInterval={containerHeight > 0 ? containerHeight : undefined}
              snapToAlignment="start"
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              style={Platform.OS === 'web' ? { scrollSnapType: 'y mandatory', overflowY: 'auto' } as any : undefined}
              getItemLayout={containerHeight > 0 ? (_, index) => ({
              length: containerHeight,
              offset: containerHeight * index,
              index,
            }) : undefined}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No papers found for this topic today.</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    backgroundColor: colors.bg,
  },
  menuButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.primary,
  },
  placeholder: {
    width: 48,
  },
  feedContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.s,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyDim,
    textAlign: 'center',
    marginBottom: spacing.l,
    maxWidth: 320,
  },
  configureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: 8,
    minHeight: 48,
    minWidth: 48,
  },
  configureButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: 'bold',
  }
});
