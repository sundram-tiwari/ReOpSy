import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Paper } from '../types';
import { useAppState } from '../state/AppState';
import { colors, spacing, typography } from '../theme';

interface Props {
  paper: Paper;
}

export const ActionBar: React.FC<Props> = ({ paper }) => {
  const { toggleSavePaper, isSaved, toggleLikePaper, isLiked } = useAppState();

  const saved = isSaved(paper.id);
  const liked = isLiked(paper.id);
  const baseLikes = paper.likes || 0;
  const displayLikes = liked ? baseLikes + 1 : baseLikes;

  const handleShare = async () => {
    try {
      const message = `${paper.catchyTitle}\n\nRead more: ${paper.url}`;
      await Share.share({
        message,
        url: paper.url, // iOS only
        title: paper.catchyTitle // Android only
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.iconButton} 
        onPress={() => toggleLikePaper(paper)}
        activeOpacity={0.7}
      >
        <Feather 
          name="thumbs-up" 
          size={24} 
          color={liked ? colors.primary : colors.textDim} 
        />
        <Text style={[styles.likeLabel, liked && styles.activeLabel]}>
          {displayLikes}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.iconButton} 
        onPress={() => toggleSavePaper(paper)}
        activeOpacity={0.7}
      >
        <Feather 
          name="bookmark" 
          size={24} 
          color={saved ? colors.primary : colors.textDim} 
        />
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.iconButton} 
        onPress={handleShare}
        activeOpacity={0.7}
      >
        <Feather name="share-2" size={24} color={colors.textDim} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.m,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 20,
    backgroundColor: colors.accent,
    minWidth: 60,
  },
  likeLabel: {
    ...typography.bodyDim,
    fontWeight: '500',
    marginLeft: spacing.s,
  },
  activeLabel: {
    color: colors.primary,
  }
});
