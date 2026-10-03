import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PaperRef } from '../services/community';

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: undefined;
  Paper: { paperId: string; ref?: PaperRef };
  Recall: undefined;
  Circle: { circleId: string };
  Profile: { uid: string };
  EditProfile: undefined;
  Inbox: undefined;
  SignIn: undefined;
  Topics: undefined;
  Moderation: undefined;
  Guidelines: undefined;
  Admin: undefined;
};

export type TabParamList = {
  Today: undefined;
  Circles: undefined;
  Library: undefined;
  You: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;

export function useNav(): Nav {
  return useNavigation<Nav>();
}
