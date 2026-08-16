import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useAppState } from '../state/AppState';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography } from '../theme';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { validateApiConnection } from '../services/apiValidator';

export const SettingsScreen = () => {
  const { user, signInWithGoogle, signOut } = useAuth();
  const {
    userApiConfig,
    setUserApiConfig,
    clearUserApiConfig,
    clearCache,
    fetchCustomPapers,
    setActiveTopic
  } = useAppState();
  const navigation = useNavigation<any>();

  const [isApiExpanded, setIsApiExpanded] = useState(true);
  const [provider, setProvider] = useState<'Gemini' | 'Mistral' | 'Grok' | 'Custom'>(
    (userApiConfig?.provider as any) || 'Gemini'
  );
  const [apiKey, setApiKey] = useState(userApiConfig?.apiKey || '');
  const [endpoint, setEndpoint] = useState(userApiConfig?.endpoint || '');
  const [customTopic, setCustomTopic] = useState(userApiConfig?.customTopic || '');
  const [showApiKey, setShowApiKey] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isFetchingCustom, setIsFetchingCustom] = useState(false);

  const providers: Array<'Gemini' | 'Mistral' | 'Grok' | 'Custom'> = ['Gemini', 'Mistral', 'Grok', 'Custom'];

  const getMaskedPreview = (key: string): string => {
    if (!key || key.trim().length === 0) return '';
    if (key.length <= 4) return '••••';
    return '••••••••' + key.slice(-4);
  };

  const handleSaveApiConfig = () => {
    if (!apiKey || apiKey.trim() === '') {
      Alert.alert('Missing Key', 'Please enter your API key to save.');
      return;
    }

    setUserApiConfig({
      provider,
      apiKey: apiKey.trim(),
      endpoint: provider === 'Custom' ? endpoint.trim() : undefined,
      customTopic: customTopic.trim() || undefined
    });
    Alert.alert('Configuration Saved', `${provider} API settings updated successfully.`);
  };

  const handleRemoveApiConfig = () => {
    Alert.alert(
      'Remove API Configuration',
      'This will clear your API keys and custom topic papers. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setProvider('Gemini');
            setApiKey('');
            setEndpoint('');
            setCustomTopic('');
            setValidationResult(null);
            clearUserApiConfig();
            Alert.alert('Cleared', 'API credentials and custom topic removed.');
          }
        }
      ]
    );
  };

  const handleTestConnection = async () => {
    if (!apiKey || apiKey.trim() === '') {
      Alert.alert('Error', 'Please enter an API key to test.');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await validateApiConnection({
        provider,
        apiKey: apiKey.trim(),
        endpoint: provider === 'Custom' ? endpoint.trim() : undefined
      });
      setValidationResult(result);
      if (result.success) {
        Alert.alert('Connection Verified', result.message);
      } else {
        Alert.alert('Connection Failed', result.message);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to connect to API.';
      setValidationResult({ success: false, message: msg });
      Alert.alert('Error', msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveTopic = () => {
    if (!customTopic || customTopic.trim() === '') {
      Alert.alert('Topic Required', 'Please enter a research topic.');
      return;
    }

    const currentConfig = userApiConfig || {
      provider,
      apiKey: apiKey.trim(),
      endpoint: provider === 'Custom' ? endpoint.trim() : undefined
    };

    setUserApiConfig({
      ...currentConfig,
      customTopic: customTopic.trim()
    });
    Alert.alert('Topic Saved', `Custom topic set to: "${customTopic.trim()}"`);
  };

  const handleFetchTopicPapers = async () => {
    const query = customTopic.trim();
    if (!query) {
      Alert.alert('Topic Required', 'Please enter a research topic to search for papers.');
      return;
    }

    setIsFetchingCustom(true);
    try {
      // Auto-save topic to config
      const currentConfig = userApiConfig || {
        provider,
        apiKey: apiKey.trim(),
        endpoint: provider === 'Custom' ? endpoint.trim() : undefined
      };
      setUserApiConfig({
        ...currentConfig,
        customTopic: query
      });

      const res = await fetchCustomPapers(query);
      if (res.success) {
        Alert.alert(
          'Live Papers Fetched',
          `Found ${res.count} research papers for "${query}". Would you like to view them now in your feed?`,
          [
            { text: 'Stay Here', style: 'cancel' },
            {
              text: 'View Feed',
              onPress: () => {
                setActiveTopic('custom');
                navigation.navigate('Feed');
              }
            }
          ]
        );
      } else {
        Alert.alert('Fetch Error', res.error || 'Could not fetch papers for topic.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to fetch topic papers.');
    } finally {
      setIsFetchingCustom(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear App Data',
      'This will remove all your saved papers, likes, custom feeds, and streak history. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearCache();
            setApiKey('');
            setEndpoint('');
            setCustomTopic('');
            setValidationResult(null);
            navigation.goBack();
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back"
        >
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
                  {user.photoURL ? null : (
                    <Text style={styles.avatarText}>
                      {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </Text>
                  )}
                </View>
                <View style={{ flexShrink: 1, marginRight: spacing.s }}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {user.displayName || 'Researcher'}
                  </Text>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.buttonOutline}
                onPress={signOut}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="log-out" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.buttonOutlineText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={signInWithGoogle}
              activeOpacity={0.8}
            >
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
          activeOpacity={0.7}
        >
          <View style={styles.rowAlign}>
            <Feather name="key" size={20} color={colors.primary} style={{ marginRight: spacing.s }} />
            <Text style={styles.sectionTitleNoMargin}>Connect Your LLM API</Text>
          </View>
          <Feather name={isApiExpanded ? 'chevron-up' : 'chevron-down'} size={24} color={colors.text} />
        </TouchableOpacity>

        {isApiExpanded && (
          <View style={styles.cardExpanded}>
            <Text style={styles.label}>Provider</Text>
            <View style={styles.providerRow}>
              {providers.map((p) => {
                const isSelected = provider === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.providerChip, isSelected && styles.providerChipActive]}
                    onPress={() => {
                      setProvider(p);
                      setValidationResult(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.providerChipText, isSelected && styles.providerChipTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>API Key</Text>
            <View style={styles.inputWithIconContainer}>
              <TextInput
                style={styles.inputWithIcon}
                value={apiKey}
                onChangeText={(text) => {
                  setApiKey(text);
                  setValidationResult(null);
                }}
                placeholder={`Enter your ${provider} API key`}
                placeholderTextColor={colors.textDim}
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setShowApiKey(!showApiKey)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={showApiKey ? 'Hide API Key' : 'Show API Key'}
              >
                <Feather name={showApiKey ? 'eye-off' : 'eye'} size={20} color={colors.textDim} />
              </TouchableOpacity>
            </View>

            {apiKey.length > 0 && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>Masked Preview: </Text>
                <Text style={styles.previewValue}>{getMaskedPreview(apiKey)}</Text>
              </View>
            )}

            {provider === 'Custom' && (
              <>
                <Text style={styles.label}>Custom Endpoint (OpenAI-compatible URL)</Text>
                <TextInput
                  style={styles.input}
                  value={endpoint}
                  onChangeText={setEndpoint}
                  placeholder="https://api.your-endpoint.com/v1/chat/completions"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            {validationResult && (
              <View
                style={[
                  styles.statusBanner,
                  validationResult.success ? styles.statusBannerSuccess : styles.statusBannerError
                ]}
              >
                <Feather
                  name={validationResult.success ? 'check-circle' : 'alert-circle'}
                  size={16}
                  color={validationResult.success ? colors.primary : colors.danger}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: validationResult.success ? colors.primary : colors.danger }
                  ]}
                >
                  {validationResult.message}
                </Text>
              </View>
            )}

            <View style={styles.apiActions}>
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={handleTestConnection}
                disabled={isValidating}
                activeOpacity={0.8}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Feather name="activity" size={16} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.buttonSecondaryText}>Test Connection</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonPrimary}
                onPress={handleSaveApiConfig}
                activeOpacity={0.8}
              >
                <Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.buttonPrimaryText}>Save Config</Text>
              </TouchableOpacity>
            </View>

            {userApiConfig && (
              <TouchableOpacity
                style={styles.buttonDanger}
                onPress={handleRemoveApiConfig}
                activeOpacity={0.8}
              >
                <Feather name="trash-2" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={styles.buttonDangerText}>Remove / Disconnect API</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Section 3: Custom Research Topic */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Custom Research Topic</Text>
        <View style={styles.card}>
          <Text style={styles.subhead}>
            Fetch live research papers directly from arXiv and generate AI flashcards.
          </Text>
          <TextInput
            style={[styles.input, { marginTop: spacing.s }]}
            value={customTopic}
            onChangeText={setCustomTopic}
            placeholder="e.g. Explainable AI for Depression Detection"
            placeholderTextColor={colors.textDim}
          />
          <Text style={styles.caption}>
            Live papers will be displayed in your dedicated "Custom" topic tab.
          </Text>

          <View style={styles.topicActionRow}>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={handleFetchTopicPapers}
              disabled={isFetchingCustom}
              activeOpacity={0.8}
            >
              {isFetchingCustom ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="search" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.buttonPrimaryText}>Fetch Topic Papers</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buttonOutlineOnly}
              onPress={handleSaveTopic}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonOutlineOnlyText}>Save Topic</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Section 4: App & Storage */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App & Storage</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleClearData}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={20} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Clear App Data & Cache</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.actionRow}>
            <Feather name="info" size={20} color={colors.textDim} />
            <Text style={styles.versionText}>ReOpSy Version 2.0.0</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.text,
  },
  section: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.s,
    color: colors.textDim,
  },
  sectionTitleNoMargin: {
    ...typography.h3,
    color: colors.text,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
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
    minHeight: 48,
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
    minHeight: 48,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
    color: colors.text,
  },
  accountEmail: {
    ...typography.small,
    color: colors.textDim,
  },
  buttonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minHeight: 48,
    minWidth: 48,
  },
  buttonOutlineText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  buttonOutlineOnly: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonOutlineOnlyText: {
    ...typography.body,
    color: colors.text,
  },
  googleButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.m,
    borderRadius: 8,
    minHeight: 48,
  },
  googleButtonText: {
    ...typography.body,
    color: '#000',
    fontWeight: 'bold',
  },
  subhead: {
    ...typography.small,
    color: colors.textDim,
    lineHeight: 18,
  },
  label: {
    ...typography.small,
    color: colors.textDim,
    marginBottom: spacing.xs,
    marginTop: spacing.m,
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: spacing.m,
    color: colors.text,
    minHeight: 48,
  },
  inputWithIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    minHeight: 48,
  },
  inputWithIcon: {
    ...typography.body,
    flex: 1,
    padding: spacing.m,
    color: colors.text,
    minHeight: 48,
  },
  eyeIconButton: {
    padding: spacing.m,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  previewLabel: {
    ...typography.caption,
    color: colors.textDim,
  },
  previewValue: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: 'monospace',
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  providerChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  providerChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  providerChipText: {
    ...typography.small,
    color: colors.textDim,
    fontWeight: '600',
  },
  providerChipTextActive: {
    color: '#fff',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: 8,
    marginTop: spacing.m,
    borderWidth: 1,
  },
  statusBannerSuccess: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  statusBannerError: {
    backgroundColor: colors.danger + '15',
    borderColor: colors.danger,
  },
  statusText: {
    ...typography.caption,
    flex: 1,
    fontWeight: '500',
  },
  apiActions: {
    flexDirection: 'row',
    marginTop: spacing.l,
    gap: spacing.m,
  },
  topicActionRow: {
    flexDirection: 'row',
    marginTop: spacing.m,
    gap: spacing.m,
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  buttonPrimaryText: {
    ...typography.body,
    color: '#fff',
    fontWeight: 'bold',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: colors.cardBorder,
    borderRadius: 8,
    padding: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  buttonSecondaryText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  buttonDanger: {
    marginTop: spacing.m,
    padding: spacing.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  buttonDangerText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
  caption: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.textDim,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
    minHeight: 48,
  },
  actionText: {
    ...typography.body,
    marginLeft: spacing.m,
    fontWeight: '500',
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
