import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { colors, spacing, typography } from '../theme';

export const PersonalizationScreen = ({ navigation }: any) => {
  const { followedTopics, toggleTopic } = useAppState();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Personalization</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.alertsRow}>
          <View>
            <Text style={typography.body}>Alerts</Text>
            <Text style={typography.caption}>Big updates only</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <Text style={styles.sectionTitle}>Topics for you</Text>
        
        {config.topics.map(topic => {
          const isFollowing = followedTopics.includes(topic.slug);
          
          return (
            <View key={topic.slug} style={styles.topicRow}>
              <View style={styles.topicInfo}>
                <Text style={styles.topicName}>{topic.emoji} {topic.label}</Text>
                <Text style={styles.topicFollowers}>{topic.blurb}</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={() => toggleTopic(topic.slug)}
              >
                <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
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
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    ...typography.h3,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.m,
    top: spacing.xl,
    padding: spacing.s,
  },
  closeIcon: {
    color: colors.text,
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  alertsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  chevron: {
    color: colors.textDim,
    fontSize: 24,
  },
  sectionTitle: {
    ...typography.h2,
    padding: spacing.l,
    paddingBottom: spacing.s,
  },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
    paddingHorizontal: spacing.l,
  },
  topicInfo: {
    flex: 1,
    paddingRight: spacing.m,
  },
  topicName: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  topicFollowers: {
    ...typography.caption,
  },
  followBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 20,
    backgroundColor: colors.text,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  followBtnText: {
    ...typography.body,
    color: colors.bg,
    fontWeight: '600',
  },
  followingBtnText: {
    color: colors.text,
  }
});
