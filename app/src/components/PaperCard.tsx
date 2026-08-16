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
}

export const PaperCard: React.FC<Props> = ({ paper }) => {
  const topicConfig = config.topics.find(t => paper.topics.includes(t.slug));
  const topicLabel = topicConfig ? topicConfig.label : 'Research';

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
    <View style={styles.cardContainer}>
      <View style={styles.content}>
        
        <View style={styles.tagContainer}>
          <Feather name={(topicConfig?.icon || 'hash') as any} size={12} color={colors.textDim} style={{ marginRight: 4 }} />
          <Text style={styles.tagText}>{topicLabel}</Text>
        </View>

        <Text style={styles.title}>
          {paper.catchyTitle || paper.originalTitle}
        </Text>

        <Text style={styles.summary}>
          {paper.summary}
        </Text>

        <View style={styles.metadataContainer}>
          <Text style={styles.metadataText} numberOfLines={1}>
            {formatAuthors(paper.authors)}{paper.year ? ` · ${paper.year}` : ''}{paper.venue ? ` · ${paper.venue}` : ''}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.linkRow} 
          onPress={handleOpenLink}
          activeOpacity={0.7}
        >
          <Feather name="external-link" size={16} color={colors.textDim} />
          <Text style={[styles.linkText, { marginLeft: spacing.s }]}>Credits & Paper Link</Text>
        </TouchableOpacity>

      </View>
      
      <ActionBar paper={paper} />
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    height: SCREEN_HEIGHT - HEADER_OFFSET,
    backgroundColor: colors.bg,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: spacing.m,
    justifyContent: 'space-evenly',
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
    marginBottom: spacing.s,
  },
  summary: {
    ...typography.body,
    fontSize: 16,
    fontWeight: 'normal',
    color: colors.textDim,
    lineHeight: 28,
    marginBottom: spacing.m,
  },
  metadataContainer: {
    marginBottom: spacing.m,
  },
  metadataText: {
    ...typography.caption,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: spacing.s,
    marginTop: spacing.m,
  },
  linkText: {
    ...typography.caption,
    color: colors.textDim,
  },
});
