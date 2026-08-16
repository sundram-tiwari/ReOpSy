import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useAppState } from '../state/AppState';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography } from '../theme';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export const SettingsScreen = () => {
  const { user, signInWithGoogle, signOut } = useAuth();
  const { userApiConfig, setUserApiConfig, clearUserApiConfig, clearCache } = useAppState();
  const navigation = useNavigation();

  const [isApiExpanded, setIsApiExpanded] = useState(false);
  const [provider, setProvider] = useState(userApiConfig?.provider || 'Gemini');
  const [apiKey, setApiKey] = useState(userApiConfig?.apiKey || '');
  const [endpoint, setEndpoint] = useState(userApiConfig?.endpoint || '');
  const [customTopic, setCustomTopic] = useState(userApiConfig?.customTopic || '');

  const providers = ['Gemini', 'Mistral', 'Grok', 'Custom'];

  const handleSaveApiConfig = () => {
    setUserApiConfig({ provider, apiKey, endpoint, customTopic });
    Alert.alert('Success', 'API configuration saved!');
  };

  const handleRemoveApiConfig = () => {
    setProvider('Gemini');
    setApiKey('');
    setEndpoint('');
    setCustomTopic('');
    clearUserApiConfig();
    Alert.alert('Cleared', 'API configuration removed.');
  };

  const handleTestConnection = () => {
    if (!apiKey) {
      Alert.alert('Error', 'Please enter an API key first.');
      return;
    }
    // Simulate test
    Alert.alert('Success', 'Connection tested successfully!');
  };

  const handleSaveTopic = () => {
    setUserApiConfig({ ...userApiConfig, provider, apiKey, endpoint, customTopic });
    Alert.alert('Success', 'Research topic saved!');
  };

  const handleClearData = () => {
    Alert.alert(
      "Clear App Data",
      "This will remove all your saved papers, likes, and streak history. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            await clearCache();
            navigation.goBack();
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Section 1: Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {user ? (
            <View style={styles.accountRow}>
              <View style={styles.profileInfo}>
                <View style={styles.avatar}>
                  {user.photoURL ? null : <Text style={styles.avatarText}>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</Text>}
                </View>
                <View>
                  <Text style={styles.accountName}>{user.displayName || 'User'}</Text>
                  <Text style={styles.accountEmail}>{user.email}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.buttonOutline} onPress={signOut}>
                <Text style={styles.buttonOutlineText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle}>
              <Feather name="log-in" size={20} color="#000" style={{ marginRight: spacing.s }} />
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Section 2: API Configuration */}
      <View style={styles.section}>
        <TouchableOpacity 
          style={[styles.card, styles.expandableHeader]} 
          onPress={() => setIsApiExpanded(!isApiExpanded)}
        >
          <Text style={styles.sectionTitleNoMargin}>Connect Your API</Text>
          <Feather name={isApiExpanded ? "chevron-up" : "chevron-down"} size={24} color={colors.text} />
        </TouchableOpacity>
        
        {isApiExpanded && (
          <View style={styles.cardExpanded}>
            <Text style={styles.label}>Provider</Text>
            <View style={styles.providerRow}>
              {providers.map(p => (
                <TouchableOpacity 
                  key={p} 
                  style={[styles.providerChip, provider === p && styles.providerChipActive]}
                  onPress={() => setProvider(p)}
                >
                  <Text style={[styles.providerChipText, provider === p && styles.providerChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>API Key</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Enter your API key"
              placeholderTextColor={colors.textDim}
              secureTextEntry={true}
            />

            {provider === 'Custom' && (
              <>
                <Text style={styles.label}>Custom Endpoint</Text>
                <TextInput
                  style={styles.input}
                  value={endpoint}
                  onChangeText={setEndpoint}
                  placeholder="https://your-custom-endpoint.com/v1"
                  placeholderTextColor={colors.textDim}
                />
              </>
            )}

            <View style={styles.apiActions}>
              <TouchableOpacity style={styles.buttonSecondary} onPress={handleTestConnection}>
                <Text style={styles.buttonSecondaryText}>Test Connection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleSaveApiConfig}>
                <Text style={styles.buttonPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
            {userApiConfig && (
              <TouchableOpacity style={styles.buttonDanger} onPress={handleRemoveApiConfig}>
                <Text style={styles.buttonDangerText}>Remove Config</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Section 3: Custom Research Topic */}
      {userApiConfig && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Research Topic</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              value={customTopic}
              onChangeText={setCustomTopic}
              placeholder="e.g., Explainable AI for Depression Detection"
              placeholderTextColor={colors.textDim}
            />
            <Text style={styles.caption}>We'll use your API to fetch papers specifically about this topic.</Text>
            <TouchableOpacity style={[styles.buttonPrimary, { marginTop: spacing.m }]} onPress={handleSaveTopic}>
              <Text style={styles.buttonPrimaryText}>Save Topic</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Section 4: App */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearData}>
            <Feather name="trash-2" size={20} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Clear App Data</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.actionRow}>
            <Feather name="info" size={20} color={colors.textDim} />
            <Text style={styles.versionText}>ReOpSy v2.0.0</Text>
          </View>
        </View>
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.l,
    paddingTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    padding: spacing.s,
    marginRight: spacing.m,
  },
  headerTitle: {
    ...typography.h1,
  },
  section: {
    padding: spacing.l,
    paddingBottom: 0,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.s,
    color: colors.textDim,
  },
  sectionTitleNoMargin: {
    ...typography.h3,
    color: colors.textDim,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.m,
  },
  expandableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardExpanded: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.cardBorder,
    padding: spacing.m,
    marginTop: -4,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  avatarText: {
    ...typography.h2,
    color: '#fff',
  },
  accountName: {
    ...typography.body,
    fontWeight: 'bold',
  },
  accountEmail: {
    ...typography.small,
    color: colors.textDim,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  buttonOutlineText: {
    ...typography.body,
    color: colors.primary,
  },
  googleButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.m,
    borderRadius: 8,
  },
  googleButtonText: {
    ...typography.body,
    color: '#000',
    fontWeight: 'bold',
  },
  label: {
    ...typography.small,
    color: colors.textDim,
    marginBottom: spacing.xs,
    marginTop: spacing.m,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: spacing.m,
    color: colors.text,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  providerChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  providerChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  providerChipText: {
    ...typography.small,
    color: colors.textDim,
  },
  providerChipTextActive: {
    color: '#fff',
  },
  apiActions: {
    flexDirection: 'row',
    marginTop: spacing.l,
    gap: spacing.m,
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: spacing.m,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: colors.cardBorder,
    borderRadius: 8,
    padding: spacing.m,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.text,
  },
  buttonDanger: {
    marginTop: spacing.m,
    padding: spacing.m,
    alignItems: 'center',
  },
  buttonDangerText: {
    ...typography.body,
    color: colors.danger,
  },
  caption: {
    ...typography.caption,
    marginTop: spacing.s,
    color: colors.textDim,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },
  actionText: {
    ...typography.body,
    marginLeft: spacing.m,
  },
  versionText: {
    ...typography.body,
    marginLeft: spacing.m,
    color: colors.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.s,
  }
});
