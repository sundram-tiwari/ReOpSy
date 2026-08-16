import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedScreen } from '../screens/FeedScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { PersonalizationScreen } from '../screens/PersonalizationScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { DrawerContent } from '../components/DrawerContent';
import { colors } from '../theme';

export type RootStackParamList = {
  MainDrawer: undefined;
  Personalization: undefined;
  Saved: undefined;
  Settings: undefined;
  Admin: undefined;
};

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const DrawerNavigator = () => {
  return (
    <Drawer.Navigator 
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: colors.bg,
          width: '80%',
        }
      }}
    >
      <Drawer.Screen name="Feed" component={FeedScreen} />
    </Drawer.Navigator>
  );
};

export const RootNavigator = () => {
  return (
    <NavigationContainer theme={{
      dark: true,
      colors: {
        primary: colors.primary,
        background: colors.bg,
        card: colors.card,
        text: colors.text,
        border: colors.cardBorder,
        notification: colors.danger,
      },
      fonts: {
        regular: { fontFamily: '', fontWeight: 'normal' },
        medium: { fontFamily: '', fontWeight: '500' },
        bold: { fontFamily: '', fontWeight: 'bold' },
        heavy: { fontFamily: '', fontWeight: '900' },
      }
    }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainDrawer" component={DrawerNavigator} />
        <Stack.Screen 
          name="Personalization" 
          component={PersonalizationScreen} 
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="Saved" component={SavedScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

