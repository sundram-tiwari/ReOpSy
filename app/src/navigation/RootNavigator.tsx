import React from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { useTheme } from '../ui/theme';
import { RootStackParamList, TabParamList } from './types';
import { TodayScreen } from '../screens/TodayScreen';
import { CirclesScreen } from '../screens/CirclesScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { YouScreen } from '../screens/YouScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PaperScreen } from '../screens/PaperScreen';
import { RecallScreen } from '../screens/RecallScreen';
import { CircleScreen } from '../screens/CircleScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { TopicsScreen } from '../screens/TopicsScreen';
import { ModerationScreen } from '../screens/ModerationScreen';
import { GuidelinesScreen } from '../screens/GuidelinesScreen';
import { AdminScreen } from '../screens/AdminScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

type FeatherName = React.ComponentProps<typeof Feather>['name'];
const TAB_ICONS: Record<keyof TabParamList, FeatherName> = {
  Today: 'sun',
  Circles: 'users',
  Library: 'book',
  You: 'user',
};

/** Four tabs, one job each: read today, talk with people, keep what matters, see your progress. */
function Tabs() {
  const { c } = useTheme();
  const { unread } = useCommunity();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.rule },
        tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen
        name="Circles"
        component={CirclesScreen}
        options={{
          title: 'Community',
          // A dot, never a number: it says "something new", not "you are behind".
          tabBarBadge: unread ? '' : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, minWidth: 10, maxHeight: 10, borderRadius: 5, top: 4 },
        }}
      />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="You" component={YouScreen} />
    </Tab.Navigator>
  );
}

export const RootNavigator = () => {
  const { c, dark } = useTheme();
  const { state } = useAppState();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.surface, text: c.ink, border: c.rule, notification: c.accent },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        {state.onboardingComplete ? (
          <Stack.Screen name="Tabs" component={Tabs} />
        ) : (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        )}
        <Stack.Screen name="Paper" component={PaperScreen} />
        <Stack.Screen name="Recall" component={RecallScreen} />
        <Stack.Screen name="Circle" component={CircleScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="Inbox" component={InboxScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Topics" component={TopicsScreen} />
        <Stack.Screen name="Guidelines" component={GuidelinesScreen} />
        <Stack.Screen name="Moderation" component={ModerationScreen} />
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
