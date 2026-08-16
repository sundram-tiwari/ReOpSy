import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { config } from '../config';
import { colors, spacing, typography } from '../theme';

export const PersonalizationScreen = ({ navigation }: any) => {
  const { followedTopics, toggleTopic } = useAppState();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Personalization</Text>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Close personalization"
        >
          <Feather name="x" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.alertsRow}>
          <View>
            <Text style={typography.body}>Alerts</Text>
            <Text style={typography.caption}>Big updates only</Text>
          </View>
          <Feather name="chevron-right" size={24} color={colors.textDim} />
        </View>

        <Text style={styles.sectionTitle}>Topics for you</Text>
        
        {config.topics.map(topic => {
          const isFollowing = followedTopics.includes(topic.slug);
          
          return (
            <View key={topic.slug} style={styles.topicRow}>
              <View style={styles.topicInfo}>
                <Text style={styles.topicName}>{topic.label}</Text>
                <Text style={styles.topicFollowers}>{topic.blurb}</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={() => toggleTopic(topic.slug)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`${isFollowing ? 'Unfollow' : 'Follow'} ${topic.label}`}
              >
                <Feather 
                  name={isFollowing ? "check" : "plus"} 
                  size={16} 
                  color={isFollowing ? colors.text : colors.bg} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                  {isFollowing ? 'Following' : 'Follow'}
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
    minHeight: 48,
  },
  headerTitle: {
    ...typography.h3,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.m,
    top: spacing.xl - 4,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 48,
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
    minHeight: 48,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 20,
    backgroundColor: colors.text,
    minHeight: 48,
    minWidth: 48,
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
