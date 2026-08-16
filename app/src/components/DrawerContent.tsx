import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAppState } from '../state/AppState';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography } from '../theme';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

const GoogleLogo = () => (
  <Svg width="20" height="20" viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    <Path fill="none" d="M0 0h48v48H0z" />
  </Svg>
);

export const DrawerContent = (props: DrawerContentComponentProps) => {
  const { streak, savedPapers, likedPapers } = useAppState();
  const { user, isAdmin, signInWithGoogle, signOut } = useAuth();



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
          <TouchableOpacity 
            style={styles.googleButton} 
            onPress={signInWithGoogle}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Sign in with Google"
          >
            <View style={{ marginRight: spacing.s }}>
              <GoogleLogo />
            </View>
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
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel="Personalize your feed"
      >
        <Feather name="sliders" size={20} color={colors.text} style={{ marginRight: spacing.m }} />
        <Text style={styles.menuItemText}>Personalize your Feed</Text>
        <Text style={styles.badge}>Top picks</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.menuItem} 
        onPress={() => props.navigation.navigate('Saved')}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel="View saved papers"
      >
        <Feather name="bookmark" size={20} color={colors.text} style={{ marginRight: spacing.m }} />
        <Text style={styles.menuItemText}>View Saved Papers</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity 
        style={styles.menuItem}
        onPress={() => props.navigation.navigate('Settings')}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel="Settings and support"
      >
        <Feather name="settings" size={20} color={colors.text} style={{ marginRight: spacing.m }} />
        <Text style={styles.menuItemText}>Settings & Support</Text>
      </TouchableOpacity>

      {isAdmin && (
        <TouchableOpacity 
          style={styles.menuItem} 
          onPress={() => props.navigation.navigate('Admin')}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Mission Control"
        >
          <Feather name="shield" size={20} color={colors.primary} style={{ marginRight: spacing.m }} />
          <Text style={styles.menuItemText}>Mission Control</Text>
          <Text style={styles.badge}>Admin</Text>
        </TouchableOpacity>
      )}

      {user && (
        <TouchableOpacity 
          style={styles.menuItem} 
          onPress={signOut}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Sign out of account"
        >
          <Feather name="log-out" size={20} color={colors.text} style={{ marginRight: spacing.m }} />
          <Text style={styles.menuItemText}>Sign Out</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerLinkTouch} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.footerLink}>Contact Us</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerLinkTouch} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.footerLink}>Terms & Conditions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerLinkTouch} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </TouchableOpacity>
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
    minHeight: 48,
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
    justifyContent: 'center',
    padding: spacing.m,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
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
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    minHeight: 48,
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
  footerLinkTouch: {
    minHeight: 48,
    justifyContent: 'center',
  },
  footerLink: {
    ...typography.caption,
  },
  version: {
    ...typography.small,
    marginTop: spacing.l,
  }
});
