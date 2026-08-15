import { View, Text, FlatList, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { useAppState } from '../state/AppState';
import { colors, typography, spacing } from '../theme';

export const SavedScreen = ({ navigation }: any) => {
  const { savedPapers, toggleSavePaper } = useAppState();

  const handleOpenLink = (url: string) => {
    if (url) Linking.openURL(url);
  };

  const handleUnsave = (paper: any) => {
    Alert.alert(
      "Remove Bookmark",
      "Remove this paper from your saved list?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => toggleSavePaper(paper) }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Papers</Text>
      </View>

      <FlatList
        data={savedPapers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.title} numberOfLines={2}>
              {item.catchyTitle || item.originalTitle}
            </Text>
            <Text style={styles.summary} numberOfLines={3}>{item.summary}</Text>
            <Text style={styles.authors} numberOfLines={1}>
              {item.authors.join(', ')} · {item.source}
            </Text>
            
            <View style={styles.actions}>
              <TouchableOpacity 
                style={styles.linkBtn} 
                onPress={() => handleOpenLink(item.url)}
              >
                <Text style={styles.linkText}>Read full paper ↗</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => handleUnsave(item)}>
                <Text style={styles.deleteIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No saved papers yet.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.m,
    paddingHorizontal: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    padding: spacing.s,
    marginRight: spacing.s,
  },
  backIcon: {
    color: colors.text,
    fontSize: 24,
  },
  headerTitle: {
    ...typography.h3,
  },
  listContent: {
    padding: spacing.m,
  },
  item: { 
    padding: spacing.l, 
    backgroundColor: colors.card, 
    marginBottom: spacing.m, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  title: { ...typography.h3, marginBottom: spacing.s },
  summary: { ...typography.bodyDim, marginBottom: spacing.m },
  authors: { ...typography.caption, marginBottom: spacing.m },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.s,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.m,
  },
  linkBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 8,
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteIcon: {
    fontSize: 20,
  },
  empty: { ...typography.bodyDim, textAlign: 'center', marginTop: spacing.xxl }
});
