import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { AuthProvider } from './src/hooks/useAuth';
import { AppStateProvider } from './src/state/AppState';
import { CommunityProvider } from './src/state/Community';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastProvider } from './src/ui/Toast';
import { useTheme } from './src/ui/theme';

/**
 * ReOpSy: triage today's papers, recall what you saved, build your survey,
 * and read with other researchers.
 *
 * Provider order matters:
 *   AuthProvider       one Firebase auth subscription for the whole app
 *   AppStateProvider   local-first state; syncs when signed in; provides the theme preference
 *   CommunityProvider  the signed-in user's public profile, follows and inbox state
 *   ToastProvider      reads theme tokens, so it sits inside AppStateProvider
 */
function Themed() {
  const { dark } = useTheme();
  return (
    <CommunityProvider>
      <ToastProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <RootNavigator />
      </ToastProvider>
    </CommunityProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppStateProvider>
            <Themed />
          </AppStateProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
