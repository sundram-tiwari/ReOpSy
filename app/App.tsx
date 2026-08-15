import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { AppStateProvider } from './src/state/AppState';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

/**
 * ReOpSy — research, one swipe at a time.
 *
 * The provider order matters:
 *   GestureHandlerRootView  must wrap everything that might receive a gesture
 *   SafeAreaProvider        must be outside anything that reads insets
 *   AppStateProvider        must be outside the navigator, because the
 *                           navigator itself branches on onboarding state
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppStateProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
