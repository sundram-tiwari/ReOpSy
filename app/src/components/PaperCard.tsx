import React from 'react';
import { View, Text, StyleSheet, Dimensions, Linking, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Paper } from '../types';
import { config } from '../config';
import { ActionBar } from './ActionBar';
import { colors, spacing, typography } from '../theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Approximate header + tabs + bottom nav height
const HEADER_OFFSET = 120; 

interface Props {
  paper: Paper;
  cardHeight?: number;
}

export const PaperCard: React.FC<Props> = ({ paper, cardHeight }) => {
  const topicConfig = config.topics.find(t => paper.topics.includes(t.slug));
  const topicLabel = topicConfig ? topicConfig.label : (paper.topics[0] ? (paper.topics[0] === 'custom' ? 'Custom Topic' : paper.topics[0]) : 'Research');
  const topicIcon = topicConfig?.icon || 'book-open';

  const formatAuthors = (authors: string[]) => {
    if (!authors || authors.length === 0) return 'Unknown authors';
    if (authors.length <= 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  const handleOpenLink = () => {
    if (paper.url) {
      Linking.openURL(paper.url);
    }
  };

  return (
    <View style={[
      styles.cardContainer, 
      cardHeight ? { height: cardHeight } : { minHeight: SCREEN_HEIGHT - HEADER_OFFSET },
      Platform.OS === 'web' ? { scrollSnapAlign: 'start' } as any : {}
    ]}>
      <View style={styles.cardInner}>
        <View style={styles.content}>
          
          <View style={styles.topSection}>
            <View style={styles.tagContainer}>
              <Feather name={topicIcon as any} size={12} color={colors.textDim} style={{ marginRight: 4 }} />
              <Text style={styles.tagText}>{topicLabel}</Text>
            </View>

            <Text style={styles.title}>
              {paper.catchyTitle || paper.originalTitle}
            </Text>

            <Text style={styles.summary}>
              {paper.summary}
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.metadataContainer}>
              <Text style={styles.metadataText}>
                {formatAuthors(paper.authors)}{paper.year ? ` · ${paper.year}` : ''}{paper.venue ? ` · ${paper.venue}` : ''}
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.linkRow} 
              onPress={handleOpenLink}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Credits and Paper Link"
            >
              <Feather name="external-link" size={16} color={colors.textDim} />
              <Text style={[styles.linkText, { marginLeft: spacing.s }]}>Credits & Paper Link</Text>
            </TouchableOpacity>
          </View>

        </View>
        
        <ActionBar paper={paper} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.bg,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  cardInner: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: spacing.l,
    justifyContent: 'space-between',
  },
  topSection: {
    flexShrink: 1,
  },
  bottomSection: {
    marginTop: spacing.s,
  },
  tagContainer: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: spacing.s,
  },
  tagText: {
    ...typography.small,
    fontWeight: '600',
  },
  title: {
    ...typography.h1,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: spacing.s,
  },
  summary: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 'normal',
    color: colors.textDim,
    marginBottom: spacing.m,
  },
  metadataContainer: {
    marginBottom: spacing.xs,
  },
  metadataText: {
    ...typography.caption,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 48,
    paddingVertical: spacing.s,
  },
  linkText: {
    ...typography.caption,
    color: colors.textDim,
  },
});
