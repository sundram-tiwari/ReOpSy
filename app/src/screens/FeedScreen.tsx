import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, Dimensions } from 'react-native';
import { useAppState } from '../state/AppState';
import { PaperCard } from '../components/PaperCard';
import { TopicTabs } from '../components/TopicTabs';
import { colors, spacing, typography } from '../theme';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_OFFSET = 120; // Exact height of the card component

type FeedScreenNavigationProp = CompositeNavigationProp<
  DrawerNavigationProp<any, 'Feed'>,
  NativeStackNavigationProp<any>
>;

interface Props {
  navigation: FeedScreenNavigationProp;
}

export const FeedScreen: React.FC<Props> = ({ navigation }) => {
  const { feedData, activeTopic, followedTopics, recordRead } = useAppState();
  const flatListRef = useRef<FlatList>(null);

  // If active topic isn't followed (e.g. after unfollowing), switch to first followed
  useEffect(() => {
    if (!followedTopics.includes(activeTopic) && followedTopics.length > 0) {
      // setActiveTopic(followedTopics[0]); // Usually handled by AppState, but good fallback
    }
  }, [followedTopics, activeTopic]);

  // When changing topics, scroll to top
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  }, [activeTopic]);

  const activePapers = feedData[activeTopic] || [];

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      // They are looking at a card, record it towards their streak
      recordRead();
    }
  }).current;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => navigation.openDrawer()}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ReOpSy</Text>
        <View style={styles.placeholder} />
      </View>

      <TopicTabs />

      {activePapers.length > 0 ? (
        <FlatList
          ref={flatListRef}
          data={activePapers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PaperCard paper={item} />}
          pagingEnabled={true}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No papers found for this topic today.</Text>
        </View>
      )}
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
    padding: spacing.s,
  },
  menuIcon: {
    color: colors.text,
    fontSize: 24,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.primary,
  },
  placeholder: {
    width: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.bodyDim,
    textAlign: 'center',
  }
});
