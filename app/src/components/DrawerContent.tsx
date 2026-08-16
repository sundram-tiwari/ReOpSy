import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAppState } from '../state/AppState';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography } from '../theme';
import { Feather } from '@expo/vector-icons';

export const DrawerContent = (props: DrawerContentComponentProps) => {
  const { streak, savedPapers, likedPapers, clearCache } = useAppState();
  const { user, signInWithGoogle } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      "Clear Data",
      "This will remove all your saved papers, likes, and streak history. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            await clearCache();
            props.navigation.closeDrawer();
          }
        }
      ]
    );
  };

  return (
    <DrawerContentScrollView {...props} style={styles.container}>
      <View style={styles.profileHeader}>
        {user ? (
          <>
            <View style={styles.avatar}>
              {user.photoURL ? null : <Text style={styles.avatarText}>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</Text>}
            </View>
            <View>
              <Text style={styles.appName}>{user.displayName || 'User'}</Text>
              <Text style={styles.profileEmail}>{user.email}</Text>
            </View>
          </>
        ) : (
          <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle}>
            <Feather name="log-in" size={20} color="#000" style={{ marginRight: spacing.s }} />
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Digest</Text>
        <Text style={styles.cardBody}>
          {streak.current > 0 
            ? <><Feather name="zap" size={14} color={colors.primary} /> {streak.current} day streak! Keep it up.</> 
            : 'Read a paper today to start your streak.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Activity</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{likedPapers.size}</Text>
            <Text style={styles.statLabel}>Likes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{savedPapers.length}</Text>
            <Text style={styles.statLabel}>Saves</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.menuItem} 
        onPress={() => props.navigation.navigate('Personalization')}
      >
        <Text style={styles.menuItemText}>Personalize your Feed</Text>
        <Text style={styles.badge}>Top picks</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.menuItem} 
        onPress={() => props.navigation.navigate('Saved')}
      >
        <Text style={styles.menuItemText}>View Saved Papers</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity 
        style={styles.menuItem}
        onPress={() => props.navigation.navigate('Settings')}
      >
        <Feather name="settings" size={20} color={colors.text} style={{ marginRight: spacing.m }} />
        <Text style={styles.menuItemText}>Settings & Support</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
        <Feather name="trash-2" size={20} color={colors.danger} style={{ marginRight: spacing.m }} />
        <Text style={[styles.menuItemText, { color: colors.danger }]}>Clear App Data</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerLink}>Contact Us</Text>
        <Text style={styles.footerLink}>Terms & Conditions</Text>
        <Text style={styles.footerLink}>Privacy Policy</Text>
        <Text style={styles.version}>v2.0.0</Text>
      </View>
    </DrawerContentScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  avatarText: {
    ...typography.h2,
    color: '#fff',
  },
  appName: {
    ...typography.h2,
    marginBottom: 2,
  },
  profileEmail: {
    ...typography.caption,
  },
  googleButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: 8,
    flex: 1,
  },
  googleButtonText: {
    ...typography.body,
    color: '#000',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: colors.card,
    margin: spacing.m,
    padding: spacing.m,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.s,
  },
  cardBody: {
    ...typography.bodyDim,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.s,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    ...typography.h2,
    color: colors.primary,
  },
  statLabel: {
    ...typography.small,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.l,
    paddingHorizontal: spacing.l,
  },
  menuItemText: {
    ...typography.body,
    flex: 1,
  },
  badge: {
    backgroundColor: colors.primary + '20',
    color: colors.primary,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 12,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.m,
  },
  footer: {
    padding: spacing.l,
    marginTop: spacing.xl,
  },
  footerLink: {
    ...typography.caption,
    marginBottom: spacing.m,
  },
  version: {
    ...typography.small,
    marginTop: spacing.l,
  }
});
