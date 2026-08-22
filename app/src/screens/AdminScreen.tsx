import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, typography } from '../theme';
import { config } from '../config';
import { Paper } from '../types';
import dailyFeedJson from '../data/dailyFeed.json';
import {
  getFeedOverrides,
  saveFeedOverrides,
  getLatestPipelineRun,
  getPipelineRuns,
  triggerPipelineTopic,
  getApiUsageLogs,
  aggregateApiUsage,
  getSystemPrompt,
  saveSystemPrompt,
  getAdminList,
  addAdmin,
  removeAdmin,
  AdminRecord,
  PipelineRunRecord,
  ApiUsageRecord
} from '../services/adminService';

type AdminTab = 'flashcards' | 'pipeline' | 'usage' | 'settings';

const DEFAULT_SYSTEM_PROMPT =
  'Rewrite the following research paper title into a catchy, engaging title in under 10 words, and summarize the core finding in strictly under 30 words for a mobile flashcard. Only return the new title, without quotes or additional text.\n\nOriginal Title: {{originalTitle}}\nSummary: {{summary}}';

export const AdminScreen = () => {
  const navigation = useNavigation<any>();
  const { user, isAdmin, isSuperAdmin, adminLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('flashcards');

  // Flashcard Manager state
  const [feedData, setFeedData] = useState<Record<string, Paper[]>>({});
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isSavingFeed, setIsSavingFeed] = useState<boolean>(false);
  const [feedDirty, setFeedDirty] = useState<boolean>(false);

  // Pipeline Control state
  const [latestRun, setLatestRun] = useState<PipelineRunRecord | null>(null);
  const [recentRuns, setRecentRuns] = useState<PipelineRunRecord[]>([]);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState<boolean>(false);
  const [triggeringTopic, setTriggeringTopic] = useState<string | null>(null);

  // API Usage state
  const [usageRecords, setUsageRecords] = useState<ApiUsageRecord[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState<boolean>(false);

  // Settings state
  const [systemPromptText, setSystemPromptText] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState<boolean>(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState<boolean>(false);

  const [adminList, setAdminList] = useState<AdminRecord[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [isLoadingAdmins, setIsLoadingAdmins] = useState<boolean>(false);
  const [isAddingAdmin, setIsAddingAdmin] = useState<boolean>(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  // Load Feed Data
  const loadFeedData = useCallback(async () => {
    setIsLoadingFeed(true);
    try {
      const baseTopics = (dailyFeedJson?.topics as Record<string, Paper[]>) || {};
      const overrides = await getFeedOverrides();

      if (overrides && Object.keys(overrides).length > 0) {
        const merged: Record<string, Paper[]> = { ...baseTopics };
        for (const [tSlug, papers] of Object.entries(overrides)) {
          merged[tSlug] = papers;
        }
        setFeedData(merged);
      } else {
        setFeedData(JSON.parse(JSON.stringify(baseTopics)));
      }
      setFeedDirty(false);
    } catch (err) {
      console.warn('[AdminScreen] Error loading feed:', err);
      const baseTopics = (dailyFeedJson?.topics as Record<string, Paper[]>) || {};
      setFeedData(JSON.parse(JSON.stringify(baseTopics)));
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  // Load Pipeline Data
  const loadPipelineData = useCallback(async () => {
    setIsLoadingPipeline(true);
    try {
      const [latest, runs] = await Promise.all([
        getLatestPipelineRun(),
        getPipelineRuns(5)
      ]);
      setLatestRun(latest);
      setRecentRuns(runs);
    } catch (err) {
      console.warn('[AdminScreen] Error loading pipeline data:', err);
    } finally {
      setIsLoadingPipeline(false);
    }
  }, []);

  // Load API Usage Data
  const loadUsageData = useCallback(async () => {
    setIsLoadingUsage(true);
    try {
      const logs = await getApiUsageLogs(100);
      setUsageRecords(logs);
    } catch (err) {
      console.warn('[AdminScreen] Error loading API usage:', err);
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  // Load Settings & Config Data
  const loadSettingsData = useCallback(async () => {
    setIsLoadingPrompt(true);
    setIsLoadingAdmins(true);
    try {
      const [prompt, admins] = await Promise.all([
        getSystemPrompt(),
        getAdminList()
      ]);
      setSystemPromptText(prompt && prompt.trim().length > 0 ? prompt : DEFAULT_SYSTEM_PROMPT);
      setAdminList(admins);
    } catch (err) {
      console.warn('[AdminScreen] Error loading settings:', err);
    } finally {
      setIsLoadingPrompt(false);
      setIsLoadingAdmins(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadFeedData();
      loadPipelineData();
      loadUsageData();
      loadSettingsData();
    }
  }, [isAdmin, loadFeedData, loadPipelineData, loadUsageData, loadSettingsData]);

  // Flashcard Handlers
  const handleUpdatePaperField = (
    topicSlug: string,
    paperId: string,
    field: keyof Paper,
    value: string
  ) => {
    setFeedData((prev) => {
      const topicPapers = prev[topicSlug] || [];
      const updated = topicPapers.map((p) => {
        if (p.id === paperId) {
          return { ...p, [field]: value };
        }
        return p;
      });
      return { ...prev, [topicSlug]: updated };
    });
    setFeedDirty(true);
  };

  const handleDeletePaper = (topicSlug: string, paperId: string) => {
    Alert.alert(
      'Delete Flashcard',
      'Are you sure you want to delete this paper from the feed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setFeedData((prev) => {
              const topicPapers = prev[topicSlug] || [];
              const filtered = topicPapers.filter((p) => p.id !== paperId);
              return { ...prev, [topicSlug]: filtered };
            });
            setFeedDirty(true);
          }
        }
      ]
    );
  };

  const handleSaveFeed = async () => {
    setIsSavingFeed(true);
    try {
      await saveFeedOverrides(feedData, user?.email || 'admin');
      setFeedDirty(false);
      Alert.alert('Success', 'Flashcard feed changes have been saved to Firestore.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not persist feed changes to Firestore.');
    } finally {
      setIsSavingFeed(false);
    }
  };

  // Pipeline Handlers
  const handleTriggerTopic = async (topicSlug: string, topicLabel: string) => {
    setTriggeringTopic(topicSlug);
    try {
      await triggerPipelineTopic(topicSlug, user?.email || 'admin');
      Alert.alert(
        'Trigger Queued',
        `Topic "${topicLabel}" has been submitted to the pipeline trigger queue.`
      );
      loadPipelineData();
    } catch (err: any) {
      Alert.alert('Trigger Failed', err?.message || 'Could not queue pipeline trigger.');
    } finally {
      setTriggeringTopic(null);
    }
  };

  // Settings Handlers
  const handleSavePrompt = async () => {
    setIsSavingPrompt(true);
    try {
      await saveSystemPrompt(systemPromptText, user?.email || 'admin');
      Alert.alert('Success', 'AI Title Generation System Prompt saved to Firestore.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not save system prompt.');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPrompt = () => {
    Alert.alert(
      'Reset Prompt',
      'Reset system prompt to the standard default template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => setSystemPromptText(DEFAULT_SYSTEM_PROMPT)
        }
      ]
    );
  };

  const handleAddAdmin = async () => {
    const emailToClean = newAdminEmail.trim().toLowerCase();
    if (!emailToClean) {
      Alert.alert('Validation Error', 'Please enter an admin email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToClean)) {
      Alert.alert('Validation Error', 'Please enter a valid email format.');
      return;
    }

    setIsAddingAdmin(true);
    try {
      await addAdmin(emailToClean, user?.email || 'superadmin');
      setNewAdminEmail('');
      Alert.alert('Admin Added', `${emailToClean} has been granted administrator access.`);
      const updatedList = await getAdminList();
      setAdminList(updatedList);
    } catch (err: any) {
      Alert.alert('Failed to Add Admin', err?.message || 'Could not whitelist email.');
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = (email: string) => {
    Alert.alert(
      'Remove Admin',
      `Revoke administrator access for ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Access',
          style: 'destructive',
          onPress: async () => {
            setRemovingEmail(email);
            try {
              await removeAdmin(email);
              Alert.alert('Access Revoked', `${email} has been removed from admin whitelist.`);
              const updatedList = await getAdminList();
              setAdminList(updatedList);
            } catch (err: any) {
              Alert.alert('Revoke Failed', err?.message || 'Could not remove admin email.');
            } finally {
              setRemovingEmail(null);
            }
          }
        }
      ]
    );
  };

  // Filtered Flashcards
  const filteredPapers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result: Array<{ topicSlug: string; paper: Paper }> = [];

    const topicsToSearch =
      selectedTopic === 'all'
        ? Object.keys(feedData)
        : Object.keys(feedData).filter((t) => t === selectedTopic);

    for (const tSlug of topicsToSearch) {
      const papers = feedData[tSlug] || [];
      for (const p of papers) {
        if (!query) {
          result.push({ topicSlug: tSlug, paper: p });
        } else {
          const catchyMatch = p.catchyTitle?.toLowerCase().includes(query);
          const origMatch = p.originalTitle?.toLowerCase().includes(query);
          const authorsMatch = Array.isArray(p.authors)
            ? p.authors.some((a) => a.toLowerCase().includes(query))
            : false;
          const topicMatch = tSlug.toLowerCase().includes(query);

          if (catchyMatch || origMatch || authorsMatch || topicMatch) {
            result.push({ topicSlug: tSlug, paper: p });
          }
        }
      }
    }

    return result;
  }, [feedData, selectedTopic, searchQuery]);

  // Aggregated API Usage
  const aggregatedUsage = useMemo(() => {
    return aggregateApiUsage(usageRecords);
  }, [usageRecords]);

  // Authorization Guard
  if (adminLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying administrator credentials...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <Feather name="shield-off" size={56} color={colors.danger} style={{ marginBottom: spacing.m }} />
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.deniedBody}>
          You do not have administrator permissions to view Mission Control.
        </Text>
        <TouchableOpacity
          style={styles.deniedButton}
          onPress={() => navigation.navigate('MainDrawer')}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={18} color="#fff" style={{ marginRight: spacing.s }} />
          <Text style={styles.deniedButtonText}>Return to Feed</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { id: 'flashcards', label: 'Flashcards', icon: 'file-text' },
    { id: 'pipeline', label: 'Pipeline', icon: 'activity' },
    { id: 'usage', label: 'API Usage', icon: 'bar-chart-2' },
    { id: 'settings', label: 'Settings', icon: 'sliders' }
  ];

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back to application"
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={styles.titleRow}>
            <Feather name="shield" size={20} color={colors.primary} style={{ marginRight: spacing.s }} />
            <Text style={styles.headerTitle}>Mission Control</Text>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {user?.email || 'Administrator'}
          </Text>
        </View>

        <View style={[styles.roleBadge, isSuperAdmin && styles.superAdminBadge]}>
          <Text style={[styles.roleBadgeText, isSuperAdmin && styles.superAdminBadgeText]}>
            {isSuperAdmin ? 'Super Admin' : 'Admin'}
          </Text>
        </View>
      </View>

      {/* Segmented Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
              accessibilityLabel={tab.label}
            >
              <Feather
                name={tab.icon}
                size={18}
                color={isActive ? colors.primary : colors.textDim}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content 1: Flashcard Manager */}
      {activeTab === 'flashcards' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.scrollContent}>
          {/* Header Action Bar */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionHeading}>Flashcard Manager</Text>
              <Text style={styles.sectionSubheading}>
                Curate daily research flashcards and persist overrides.
              </Text>
            </View>
            <View style={styles.actionButtonRow}>
              <TouchableOpacity
                style={styles.refreshIconButton}
                onPress={loadFeedData}
                disabled={isLoadingFeed}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Reload flashcards"
              >
                {isLoadingFeed ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="refresh-cw" size={18} color={colors.text} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!feedDirty || isSavingFeed) && styles.saveButtonDisabled
                ]}
                onPress={handleSaveFeed}
                disabled={!feedDirty || isSavingFeed}
                activeOpacity={0.8}
              >
                {isSavingFeed ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={18} color={colors.textDim} style={{ marginLeft: spacing.m }} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by catchy title, original title, or authors..."
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearSearchButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color={colors.textDim} />
              </TouchableOpacity>
            )}
          </View>

          {/* Topic Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.topicFilterScroll}
            contentContainerStyle={styles.topicFilterContent}
          >
            <TouchableOpacity
              style={[
                styles.topicPill,
                selectedTopic === 'all' && styles.topicPillActive
              ]}
              onPress={() => setSelectedTopic('all')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.topicPillText,
                  selectedTopic === 'all' && styles.topicPillTextActive
                ]}
              >
                All Topics ({Object.values(feedData).reduce((sum, list) => sum + list.length, 0)})
              </Text>
            </TouchableOpacity>

            {config.topics.map((t) => {
              const count = feedData[t.slug]?.length || 0;
              const isSelected = selectedTopic === t.slug;
              return (
                <TouchableOpacity
                  key={t.slug}
                  style={[styles.topicPill, isSelected && styles.topicPillActive]}
                  onPress={() => setSelectedTopic(t.slug)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.topicPillText, isSelected && styles.topicPillTextActive]}
                  >
                    {t.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Card List */}
          {isLoadingFeed ? (
            <View style={styles.centerPadded}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.dimText}>Loading flashcard database...</Text>
            </View>
          ) : filteredPapers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="file-text" size={36} color={colors.textDim} style={{ marginBottom: spacing.s }} />
              <Text style={styles.emptyCardTitle}>No matching flashcards found</Text>
              <Text style={styles.dimText}>Try adjusting your search query or topic filter.</Text>
            </View>
          ) : (
            filteredPapers.map(({ topicSlug, paper }, idx) => (
              <View key={`${topicSlug}_${paper.id}_${idx}`} style={styles.paperCard}>
                <View style={styles.paperCardHeader}>
                  <View style={styles.paperBadgeRow}>
                    <View style={styles.topicTag}>
                      <Text style={styles.topicTagText}>{topicSlug.toUpperCase()}</Text>
                    </View>
                    <View style={styles.sourceTag}>
                      <Text style={styles.sourceTagText}>{paper.source || 'arxiv'}</Text>
                    </View>
                    {paper.year && (
                      <Text style={styles.paperYear}>{paper.year}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteIconButton}
                    onPress={() => handleDeletePaper(topicSlug, paper.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Delete paper"
                  >
                    <Feather name="trash-2" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>

                {/* Catchy Title (Editable) */}
                <Text style={styles.fieldLabel}>Catchy Title (Display Title)</Text>
                <TextInput
                  style={styles.inputEditable}
                  value={paper.catchyTitle}
                  onChangeText={(val) =>
                    handleUpdatePaperField(topicSlug, paper.id, 'catchyTitle', val)
                  }
                  placeholder="Enter catchy title..."
                  placeholderTextColor={colors.textDim}
                />

                {/* Original Title */}
                <Text style={styles.fieldLabel}>Original Research Title</Text>
                <Text style={styles.originalTitleText}>{paper.originalTitle}</Text>

                {/* Summary (Editable) */}
                <Text style={styles.fieldLabel}>Executive Summary</Text>
                <TextInput
                  style={[styles.inputEditable, styles.textArea]}
                  value={paper.summary}
                  onChangeText={(val) =>
                    handleUpdatePaperField(topicSlug, paper.id, 'summary', val)
                  }
                  multiline
                  numberOfLines={4}
                  placeholder="Enter summary..."
                  placeholderTextColor={colors.textDim}
                />

                {/* Source URL (Editable) */}
                <Text style={styles.fieldLabel}>Source URL</Text>
                <TextInput
                  style={styles.inputEditable}
                  value={paper.url}
                  onChangeText={(val) =>
                    handleUpdatePaperField(topicSlug, paper.id, 'url', val)
                  }
                  placeholder="https://..."
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Authors */}
                <Text style={styles.fieldLabel}>Authors</Text>
                <Text style={styles.authorsText}>
                  {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Tab Content 2: Pipeline Control */}
      {activeTab === 'pipeline' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionHeading}>Pipeline Control</Text>
              <Text style={styles.sectionSubheading}>
                Monitor data ingestion health and manually trigger topic fetches.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshIconButton}
              onPress={loadPipelineData}
              disabled={isLoadingPipeline}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Refresh pipeline status"
            >
              {isLoadingPipeline ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="refresh-cw" size={18} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          {/* Status Summary Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeaderTitle}>Latest Pipeline Execution</Text>
            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Last Run</Text>
                <Text style={styles.metricValueSmall}>
                  {latestRun?.timestamp
                    ? new Date(latestRun.timestamp).toLocaleDateString() +
                      ' ' +
                      new Date(latestRun.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'No recorded run'}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Status</Text>
                <View style={styles.statusBadgeRow}>
                  <Feather
                    name={
                      latestRun?.status === 'success'
                        ? 'check-circle'
                        : latestRun?.status === 'partial'
                        ? 'alert-circle'
                        : 'x-circle'
                    }
                    size={14}
                    color={
                      latestRun?.status === 'success'
                        ? colors.success
                        : latestRun?.status === 'partial'
                        ? '#ffb300'
                        : colors.danger
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color:
                          latestRun?.status === 'success'
                            ? colors.success
                            : latestRun?.status === 'partial'
                            ? '#ffb300'
                            : colors.danger
                      }
                    ]}
                  >
                    {latestRun?.status?.toUpperCase() || 'IDLE'}
                  </Text>
                </View>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Total Papers Ingested</Text>
                <Text style={styles.metricValueLarge}>{latestRun?.totalPapers || 0}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Topics Processed</Text>
                <Text style={styles.metricValueLarge}>
                  {latestRun?.topicsProcessed ||
                    (latestRun?.topicCounts ? Object.keys(latestRun.topicCounts).length : 0)}
                </Text>
              </View>
            </View>

            {/* Error Log Section */}
            {latestRun?.errors && latestRun.errors.length > 0 && (
              <View style={styles.errorLogBox}>
                <View style={styles.errorLogHeader}>
                  <Feather name="alert-triangle" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.errorLogTitle}>Pipeline Warnings & Errors</Text>
                </View>
                {latestRun.errors.map((errItem, idx) => (
                  <Text key={idx} style={styles.errorLogText}>
                    • {typeof errItem === 'string' ? errItem : errItem.error || JSON.stringify(errItem)}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* Predefined Topics Trigger Grid */}
          <Text style={styles.subheadingLabel}>Predefined Research Topics</Text>
          <View style={styles.topicGrid}>
            {config.topics.map((t) => {
              const isTriggering = triggeringTopic === t.slug;
              const lastPaperCount =
                latestRun?.topicCounts?.[t.slug] ?? latestRun?.perTopicCounts?.[t.slug] ?? '-';

              return (
                <View key={t.slug} style={styles.topicCard}>
                  <View style={styles.topicCardTop}>
                    <View style={styles.topicIconContainer}>
                      <Feather
                        name={(t.icon as keyof typeof Feather.glyphMap) || 'cpu'}
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topicCardLabel}>{t.label}</Text>
                      <Text style={styles.topicCardSlug}>slug: {t.slug}</Text>
                    </View>
                  </View>
                  <Text style={styles.topicCardBlurb} numberOfLines={2}>
                    {t.blurb}
                  </Text>
                  <View style={styles.topicCardFooter}>
                    <Text style={styles.topicLastCount}>
                      Last Ingestion: <Text style={{ color: colors.text }}>{lastPaperCount} papers</Text>
                    </Text>
                    <TouchableOpacity
                      style={styles.triggerButton}
                      onPress={() => handleTriggerTopic(t.slug, t.label)}
                      disabled={isTriggering}
                      activeOpacity={0.8}
                    >
                      {isTriggering ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="play" size={14} color="#fff" style={{ marginRight: 6 }} />
                          <Text style={styles.triggerButtonText}>Trigger Fetch</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Recent Runs History */}
          {recentRuns.length > 0 && (
            <View style={[styles.card, { marginTop: spacing.l }]}>
              <Text style={styles.cardHeaderTitle}>Recent Execution History</Text>
              {recentRuns.map((run, idx) => (
                <View key={run.id || idx} style={styles.historyRow}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyTimeText}>
                      {run.timestamp ? new Date(run.timestamp).toLocaleString() : 'Unknown date'}
                    </Text>
                    <Text style={styles.historyMetaText}>
                      {run.totalPapers ?? 0} papers ingested • {run.topicsProcessed ?? 0} topics
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          run.status === 'success'
                            ? colors.success + '20'
                            : run.status === 'partial'
                            ? '#ffb30020'
                            : colors.danger + '20'
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            run.status === 'success'
                              ? colors.success
                              : run.status === 'partial'
                              ? '#ffb300'
                              : colors.danger
                        }
                      ]}
                    >
                      {run.status?.toUpperCase() || 'UNKNOWN'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Tab Content 3: API Usage Dashboard */}
      {activeTab === 'usage' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionHeading}>API Usage Dashboard</Text>
              <Text style={styles.sectionSubheading}>
                Telemetry and invocation logs across Gemini, Mistral, and Grok.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshIconButton}
              onPress={loadUsageData}
              disabled={isLoadingUsage}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Refresh usage data"
            >
              {isLoadingUsage ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="refresh-cw" size={18} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          {/* Metric Summary Cards */}
          <View style={styles.metricSummaryRow}>
            <View style={styles.metricSummaryCard}>
              <Feather name="activity" size={20} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.metricSummaryValue}>{aggregatedUsage.summary.totalCalls}</Text>
              <Text style={styles.metricSummaryLabel}>Total API Calls</Text>
            </View>
            <View style={styles.metricSummaryCard}>
              <Feather name="check-circle" size={20} color={colors.success} style={{ marginBottom: 6 }} />
              <Text style={[styles.metricSummaryValue, { color: colors.success }]}>
                {aggregatedUsage.summary.totalSuccess}
              </Text>
              <Text style={styles.metricSummaryLabel}>Successful Calls</Text>
            </View>
            <View style={styles.metricSummaryCard}>
              <Feather name="x-circle" size={20} color={colors.danger} style={{ marginBottom: 6 }} />
              <Text style={[styles.metricSummaryValue, { color: colors.danger }]}>
                {aggregatedUsage.summary.totalFailed}
              </Text>
              <Text style={styles.metricSummaryLabel}>Failed Calls</Text>
            </View>
          </View>

          {/* Daily Breakdown Table */}
          <Text style={styles.subheadingLabel}>Daily Breakdown by Provider</Text>
          {isLoadingUsage ? (
            <View style={styles.centerPadded}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.dimText}>Loading API usage telemetry...</Text>
            </View>
          ) : aggregatedUsage.rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="bar-chart-2" size={36} color={colors.textDim} style={{ marginBottom: spacing.s }} />
              <Text style={styles.emptyCardTitle}>No API usage records logged yet</Text>
              <Text style={styles.dimText}>
                LLM calls executed by the pipeline will log telemetry here.
              </Text>
            </View>
          ) : (
            <View style={styles.tableCard}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Date</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Provider</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Total</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Success</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Failed</Text>
              </View>

              {/* Table Rows */}
              {aggregatedUsage.rows.map((row, idx) => (
                <View
                  key={`${row.date}_${row.provider}_${idx}`}
                  style={[styles.tableBodyRow, idx % 2 === 1 && styles.tableBodyRowAlt]}
                >
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>
                    {row.date}
                  </Text>
                  <View style={[styles.providerTagContainer, { flex: 2 }]}>
                    <Text style={styles.providerTagText}>{row.provider}</Text>
                  </View>
                  <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'center', fontWeight: 'bold' }]}>
                    {row.total}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      { flex: 1.5, textAlign: 'center', color: colors.success, fontWeight: 'bold' }
                    ]}
                  >
                    {row.success}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        flex: 1.5,
                        textAlign: 'center',
                        color: row.failed > 0 ? colors.danger : colors.textDim,
                        fontWeight: row.failed > 0 ? 'bold' : 'normal'
                      }
                    ]}
                  >
                    {row.failed}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Tab Content 4: Settings & Config */}
      {activeTab === 'settings' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionHeading}>Settings & Configurations</Text>
              <Text style={styles.sectionSubheading}>
                Manage AI prompts and administrator access control.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshIconButton}
              onPress={loadSettingsData}
              disabled={isLoadingPrompt || isLoadingAdmins}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Refresh settings"
            >
              {isLoadingPrompt || isLoadingAdmins ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="refresh-cw" size={18} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          {/* AI System Prompt Editor */}
          <View style={styles.card}>
            <View style={styles.cardHeaderWithAction}>
              <View style={styles.rowAlign}>
                <Feather name="edit-3" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.cardHeaderTitle}>AI Title Generation Prompt</Text>
              </View>
              <TouchableOpacity
                onPress={handleResetPrompt}
                style={styles.smallOutlineButton}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.smallOutlineButtonText}>Reset Default</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardDescription}>
              This prompt instructs the LLM during background pipeline execution to rewrite academic titles into catchy flashcards. Must include {'{{originalTitle}}'} and {'{{summary}}'} interpolations.
            </Text>

            <TextInput
              style={[styles.inputEditable, styles.codeTextArea]}
              value={systemPromptText}
              onChangeText={setSystemPromptText}
              multiline
              numberOfLines={6}
              placeholder="Enter system prompt template..."
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.saveButton, { marginTop: spacing.m, alignSelf: 'flex-end' }]}
              onPress={handleSavePrompt}
              disabled={isSavingPrompt}
              activeOpacity={0.8}
            >
              {isSavingPrompt ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="save" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveButtonText}>Save Prompt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Dynamic Admin Whitelist Manager */}
          <View style={[styles.card, { marginTop: spacing.l }]}>
            <View style={styles.rowAlign}>
              <Feather name="users" size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.cardHeaderTitle}>Admin Whitelist Manager</Text>
            </View>
            <Text style={styles.cardDescription}>
              Users with whitelisted emails gain full access to Mission Control upon Google Sign-In.
            </Text>

            {/* Add Admin Form (Super Admin only) */}
            {isSuperAdmin ? (
              <View style={styles.addAdminContainer}>
                <TextInput
                  style={styles.addAdminInput}
                  value={newAdminEmail}
                  onChangeText={setNewAdminEmail}
                  placeholder="new.admin@reopsy.com"
                  placeholderTextColor={colors.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.addAdminButton}
                  onPress={handleAddAdmin}
                  disabled={isAddingAdmin}
                  activeOpacity={0.8}
                >
                  {isAddingAdmin ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="user-plus" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.addAdminButtonText}>Add Admin</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoBanner}>
                <Feather name="info" size={16} color={colors.textDim} style={{ marginRight: 6 }} />
                <Text style={styles.infoBannerText}>
                  Only the Super Admin can grant or revoke administrator access.
                </Text>
              </View>
            )}

            {/* Admin List */}
            <View style={styles.adminListContainer}>
              {isLoadingAdmins ? (
                <View style={styles.centerPadded}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : adminList.length === 0 ? (
                <Text style={styles.dimText}>No admin records found.</Text>
              ) : (
                adminList.map((admin, idx) => {
                  const isSuper = admin.isSuperAdmin;
                  const isRemoving = removingEmail === admin.email;

                  return (
                    <View key={`${admin.email}_${idx}`} style={styles.adminRow}>
                      <View style={styles.adminInfo}>
                        <View style={styles.rowAlign}>
                          <Text style={styles.adminEmailText}>{admin.email}</Text>
                          {isSuper && (
                            <View style={styles.superBadgeInline}>
                              <Text style={styles.superBadgeInlineText}>Super Admin</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.adminMetaText}>
                          Added {admin.addedAt ? new Date(admin.addedAt).toLocaleDateString() : 'System'} • by {admin.addedBy}
                        </Text>
                      </View>

                      {isSuperAdmin && !isSuper && (
                        <TouchableOpacity
                          style={styles.removeAdminButton}
                          onPress={() => handleRemoveAdmin(admin.email)}
                          disabled={isRemoving}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Remove admin ${admin.email}`}
                        >
                          {isRemoving ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                          ) : (
                            <Feather name="trash-2" size={18} color={colors.danger} />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  loadingText: {
    ...typography.bodyDim,
    marginTop: spacing.m
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  deniedTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.s
  },
  deniedBody: {
    ...typography.bodyDim,
    textAlign: 'center',
    marginBottom: spacing.l,
    maxWidth: 400
  },
  deniedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: 8,
    minHeight: 48
  },
  deniedButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: 'bold'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.card
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: spacing.s
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: 2
  },
  roleBadge: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: 16,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center'
  },
  roleBadgeText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: 'bold'
  },
  superAdminBadge: {
    backgroundColor: '#ffb30020',
    borderColor: '#ffb300'
  },
  superAdminBadgeText: {
    color: '#ffb300'
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.bg
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.m,
    minHeight: 48,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
    backgroundColor: colors.card
  },
  tabButtonText: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: '600'
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: 'bold'
  },
  tabContent: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.l,
    paddingBottom: spacing.xxl
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.l
  },
  sectionHeading: {
    ...typography.h2,
    color: colors.text
  },
  sectionSubheading: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: 2
  },
  actionButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s
  },
  refreshIconButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: 8,
    minHeight: 48
  },
  saveButtonDisabled: {
    opacity: 0.5
  },
  saveButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: 'bold'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    marginBottom: spacing.m,
    minHeight: 48
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingHorizontal: spacing.m,
    minHeight: 48
  },
  clearSearchButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topicFilterScroll: {
    marginBottom: spacing.l
  },
  topicFilterContent: {
    flexDirection: 'row',
    gap: spacing.s
  },
  topicPill: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center'
  },
  topicPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  topicPillText: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: '600'
  },
  topicPillTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  paperCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.l,
    marginBottom: spacing.l
  },
  paperCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m
  },
  paperBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s
  },
  topicTag: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 4
  },
  topicTagText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: 'bold'
  },
  sourceTag: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 4
  },
  sourceTagText: {
    ...typography.small,
    color: colors.textDim
  },
  paperYear: {
    ...typography.small,
    color: colors.textDim
  },
  deleteIconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fieldLabel: {
    ...typography.small,
    color: colors.textDim,
    marginBottom: spacing.xs,
    marginTop: spacing.s,
    fontWeight: '600'
  },
  inputEditable: {
    ...typography.body,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: spacing.m,
    color: colors.text,
    minHeight: 48
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top'
  },
  codeTextArea: {
    minHeight: 140,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20
  },
  originalTitleText: {
    ...typography.bodyDim,
    marginBottom: spacing.xs
  },
  authorsText: {
    ...typography.caption,
    color: colors.textDim
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.l,
    marginBottom: spacing.l
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s
  },
  cardHeaderTitle: {
    ...typography.h3,
    color: colors.text
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textDim,
    marginBottom: spacing.m
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.m,
    marginTop: spacing.s
  },
  metricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.bg,
    padding: spacing.m,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  metricLabel: {
    ...typography.small,
    color: colors.textDim,
    marginBottom: 4
  },
  metricValueLarge: {
    ...typography.h1,
    color: colors.primary,
    fontSize: 24
  },
  metricValueSmall: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600'
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusBadgeText: {
    ...typography.caption,
    fontWeight: 'bold'
  },
  errorLogBox: {
    marginTop: spacing.l,
    padding: spacing.m,
    backgroundColor: colors.danger + '10',
    borderWidth: 1,
    borderColor: colors.danger + '40',
    borderRadius: 8
  },
  errorLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  errorLogTitle: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: 'bold'
  },
  errorLogText: {
    ...typography.small,
    color: colors.danger,
    marginTop: 2
  },
  subheadingLabel: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.m,
    marginTop: spacing.s
  },
  topicGrid: {
    gap: spacing.m
  },
  topicCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.m
  },
  topicCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s
  },
  topicIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m
  },
  topicCardLabel: {
    ...typography.body,
    fontWeight: 'bold',
    color: colors.text
  },
  topicCardSlug: {
    ...typography.small,
    color: colors.textDim
  },
  topicCardBlurb: {
    ...typography.caption,
    color: colors.textDim,
    marginBottom: spacing.m
  },
  topicCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.s
  },
  topicLastCount: {
    ...typography.caption,
    color: colors.textDim
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: 8,
    minHeight: 48
  },
  triggerButtonText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: 'bold'
  },
  metricSummaryRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.l
  },
  metricSummaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: spacing.m,
    alignItems: 'center',
    justifyContent: 'center'
  },
  metricSummaryValue: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 2
  },
  metricSummaryLabel: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center'
  },
  tableCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder
  },
  tableHeaderCell: {
    ...typography.small,
    fontWeight: 'bold',
    color: colors.text
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder
  },
  tableBodyRowAlt: {
    backgroundColor: colors.bg + '40'
  },
  tableCell: {
    ...typography.caption,
    color: colors.text
  },
  providerTagContainer: {
    alignItems: 'flex-start'
  },
  providerTagText: {
    ...typography.small,
    backgroundColor: colors.primary + '15',
    color: colors.primary,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600'
  },
  smallOutlineButton: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    minHeight: 32,
    justifyContent: 'center'
  },
  smallOutlineButtonText: {
    ...typography.small,
    color: colors.textDim
  },
  addAdminContainer: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.l
  },
  addAdminInput: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    color: colors.text,
    minHeight: 48
  },
  addAdminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.l,
    borderRadius: 8,
    minHeight: 48
  },
  addAdminButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: 'bold'
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    padding: spacing.m,
    borderRadius: 8,
    marginBottom: spacing.l
  },
  infoBannerText: {
    ...typography.caption,
    color: colors.textDim,
    flex: 1
  },
  adminListContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.m
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder + '60'
  },
  adminInfo: {
    flex: 1,
    marginRight: spacing.s
  },
  adminEmailText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600'
  },
  superBadgeInline: {
    backgroundColor: '#ffb30020',
    borderColor: '#ffb300',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.s,
    paddingVertical: 1,
    marginLeft: spacing.s
  },
  superBadgeInlineText: {
    ...typography.small,
    color: '#ffb300',
    fontSize: 10,
    fontWeight: 'bold'
  },
  adminMetaText: {
    ...typography.small,
    color: colors.textDim,
    marginTop: 2
  },
  removeAdminButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  emptyCardTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4
  },
  centerPadded: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dimText: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: spacing.s
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder + '60'
  },
  historyInfo: {
    flex: 1,
    marginRight: spacing.s
  },
  historyTimeText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600'
  },
  historyMetaText: {
    ...typography.small,
    color: colors.textDim,
    marginTop: 2
  },
  statusPill: {
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: 4
  },
  statusPillText: {
    ...typography.small,
    fontWeight: 'bold'
  }
});

