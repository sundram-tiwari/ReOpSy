import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNav } from '../navigation/types';
import { MilestoneStickers } from '../components/MilestoneStickers';
import { ReadingStreak } from '../components/ReadingStreak';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { deleteMyData } from '../services/community';
import { connectZotero, disconnectZotero } from '../platform/zoteroClient';
import { secretsAreDeviceProtected } from '../platform/secrets';
import { shareTextFile } from '../platform/files';
import { milestones, weekRhythm } from '../logic/progress';
import { effectiveStreak, streakSummary } from '../logic/streak';
import { config } from '../config';
import { Avatar, Button, IconButton, ListRow, Screen, SectionTitle, Segmented, Sheet, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

type SettingsPage = 'settings' | 'account' | 'delete';

export function YouScreen() {
  const nav = useNav();
  const toast = useToast();
  const { user, loading: authLoading, isAdmin, signOut, deleteAuthAccount } = useAuth();
  const { profile, profileLoading, profileLoadFailed, refreshProfile } = useCommunity();
  useFocusEffect(useCallback(() => { void refreshProfile(); }, [refreshProfile]));
  const app = useAppState();
  const { state, today } = app;

  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroKey, setZoteroKey] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const dots = useMemo(() => weekRhythm(state.triage, today, state.recallDays), [state.triage, today, state.recallDays]);
  const ms = useMemo(
    () =>
      milestones({
        triage: state.triage,
        library: state.library,
        recallSessions: state.recallSessions,
        exports: state.exportsCount,
        posts: state.postsCount,
      }),
    [state],
  );
  const streak = effectiveStreak(state.streak, today);

  const legal = (page: string) => WebBrowser.openBrowserAsync(`${config.legalBaseUrl}${page}`);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
        <Avatar name={profile?.name || user?.displayName || 'You'} size={52} />
        <View style={{ flex: 1 }}>
          <T v="title" accessibilityRole="header">{profile?.name || user?.displayName || 'You'}</T>
          <T v="small" tone="muted">
            {profile ? `@${profile.handle}${profile.role ? ` · ${profile.role}` : ''}` : user ? user.email || '' : 'Reading offline, no account'}
          </T>
        </View>
        <IconButton icon="settings" label="Settings" onPress={() => setSettingsPage('settings')} />
      </View>
      {authLoading ? (
        <T tone="muted">Checking sign-in…</T>
      ) : user ? (
        profile ? (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" label="View profile" onPress={() => nav.navigate('Profile', { uid: profile.uid })} style={{ flex: 1 }} />
            <Button kind="secondary" label="Edit Profile" icon="edit-2" onPress={() => nav.navigate('EditProfile')} style={{ flex: 1 }} />
          </View>
        ) : profileLoading ? (
          <View accessibilityLiveRegion="polite"><T tone="muted">Checking your profile…</T></View>
        ) : profileLoadFailed ? (
          <View style={{ gap: space.s }} accessibilityLiveRegion="polite">
            <T tone="muted">Could not load your profile. We won’t create a second one.</T>
            <Button kind="secondary" label="Retry loading profile" onPress={() => refreshProfile()} />
          </View>
        ) : (
          <Button kind="secondary" label="Create your researcher profile" onPress={() => nav.navigate('EditProfile')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }} />
        )
      ) : (
        <Button label="Sign in to sync and join the community" onPress={() => nav.navigate('SignIn')} />
      )}

      <SectionTitle>This week</SectionTitle>
      <ReadingStreak
        days={dots}
        today={today}
        current={streak}
        longest={state.streak.longest}
        freezes={state.streak.freezes}
        summary={streakSummary(state.streak, today)}
      />

      <SectionTitle>Milestones</SectionTitle>
      <MilestoneStickers items={ms} />

      <SectionTitle>Connected tools</SectionTitle>
      <ListRow
        icon="book-open"
        title="Zotero"
        subtitle={state.zotero ? `Connected as ${state.zotero.username || state.zotero.userId}` : 'Send papers straight to your Zotero library'}
        onPress={() => setZoteroOpen(true)}
      />
      <ListRow
        icon="edit-3"
        title="Overleaf"
        subtitle="Open Survey exports in Library"
        onPress={() => nav.navigate('Tabs', { screen: 'Library', params: { openSurveyExport: true } })}
      />
      <ListRow
        icon="download"
        title="Download all my data"
        subtitle="Library, notes, matrix and settings as JSON"
        onPress={() => setDownloadOpen(true)}
      />

      <SectionTitle>About</SectionTitle>
      <ListRow icon="info" title="About / Legal" onPress={() => setAboutOpen(true)} />
      {isAdmin ? <ListRow icon="flag" title="Moderation queue" onPress={() => nav.navigate('Moderation')} /> : null}
      {isAdmin ? <ListRow icon="sliders" title="Mission Control (admin)" onPress={() => nav.navigate('Admin')} /> : null}

      {user ? (
        <View style={{ gap: space.s, marginTop: space.xl }}>
          <Button kind="secondary" icon="log-out" label="Sign out" onPress={signOut} />
        </View>
      ) : null}
      <T v="caption" tone="faint" style={{ textAlign: 'center', marginTop: space.xl }}>
        ReOpSy 2.1 · © {new Date().getFullYear()} {config.copyrightHolder}. All rights reserved.
      </T>

      <Sheet visible={zoteroOpen} title="Zotero" onClose={() => setZoteroOpen(false)}>
        {state.zotero ? (
          <View style={{ gap: space.m }}>
            <T>Connected as {state.zotero.username || state.zotero.userId}. Library exports now include Send to Zotero.</T>
            <Button
              kind="danger"
              label="Disconnect"
              onPress={async () => {
                await disconnectZotero().catch(() => {});
                app.setZotero(null);
                setZoteroOpen(false);
              }}
            />
          </View>
        ) : (
          <View>
            <T tone="muted" style={{ marginBottom: space.m }}>
              Create a private key at zotero.org/settings/keys with "Allow library access" and "Allow write access", then paste it here.
              {secretsAreDeviceProtected ? ' The key is stored in your device keystore.' : ' On the web the key is stored in this browser only.'}
            </T>
            <Button kind="ghost" icon="external-link" label="Open zotero.org/settings/keys" onPress={() => WebBrowser.openBrowserAsync('https://www.zotero.org/settings/keys/new')} />
            <TextField label="API key" value={zoteroKey} onChangeText={setZoteroKey} autoCapitalize="none" secure />
            <Button
              label="Connect"
              loading={busy}
              disabled={zoteroKey.trim().length < 10}
              onPress={async () => {
                setBusy(true);
                try {
                  const acct = await connectZotero(zoteroKey);
                  app.setZotero(acct);
                  setZoteroKey('');
                  setZoteroOpen(false);
                  toast('Zotero connected.');
                } catch (err) {
                  toast((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        )}
      </Sheet>

      <Sheet visible={aboutOpen} title="About / Legal" onClose={() => setAboutOpen(false)}>
        <ListRow icon="shield" title="Community Guidelines" onPress={() => { setAboutOpen(false); nav.navigate('Guidelines'); }} />
        <ListRow icon="lock" title="Privacy Policy" onPress={() => legal('privacy-policy')} />
        <ListRow icon="file-text" title="Terms of Use" onPress={() => legal('terms-of-use')} />
        <ListRow icon="info" title="Data Sources" subtitle="arXiv, OpenAlex (CC0), Crossref, Unpaywall. Summaries are AI-written; check the abstract." />
      </Sheet>

      <Sheet visible={downloadOpen} title="Download all your data?" onClose={() => setDownloadOpen(false)}>
        <T tone="muted">Save a JSON backup of your library, notes, matrix and settings.</T>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s, marginTop: space.l }}>
          <Button kind="secondary" label="Cancel" onPress={() => setDownloadOpen(false)} />
          <Button
            label="Download"
            onPress={async () => {
              setDownloadOpen(false);
              try {
                await shareTextFile(`reopsy-backup-${today}.json`, 'application/json', JSON.stringify(state, null, 2));
              } catch {
                toast('Could not export. Try again.');
              }
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={settingsPage !== null}
        title={settingsPage === 'delete' ? 'Delete your account' : settingsPage === 'account' ? 'Account' : 'Settings'}
        onClose={() => setSettingsPage(null)}
      >
        {settingsPage === 'settings' ? (
          <>
            <ListRow icon="user" title="Account" onPress={() => setSettingsPage('account')} />
            <SectionTitle>Reading</SectionTitle>
            <ListRow icon="list" title="Topics" subtitle={`${state.followedTopics.length} followed`} onPress={() => { setSettingsPage(null); nav.navigate('Topics'); }} />
            <View style={{ paddingVertical: space.m }}>
              <T v="small" tone="muted" style={{ marginBottom: space.s }}>Cards per day</T>
              <Segmented
                options={config.dailyGoals.map((g) => ({ key: String(g), label: `${g}` }))}
                value={String(state.dailyGoal)}
                onChange={(g) => app.setDailyGoal(Number(g))}
              />
            </View>
            <View style={{ paddingVertical: space.m }}>
              <T v="small" tone="muted" style={{ marginBottom: space.s }}>Appearance</T>
              <Segmented
                options={[
                  { key: 'system', label: 'System' },
                  { key: 'light', label: 'Light' },
                  { key: 'dark', label: 'Dark' },
                ]}
                value={state.themePref}
                onChange={app.setThemePref}
              />
            </View>
          </>
        ) : settingsPage === 'account' ? (
          <>
            <ListRow icon="arrow-left" title="Back to Settings" onPress={() => setSettingsPage('settings')} />
            {user ? (
              <ListRow icon="trash-2" tone="bad" title="Delete account" onPress={() => { setConfirmText(''); setSettingsPage('delete'); }} />
            ) : (
              <T tone="muted" style={{ marginTop: space.m }}>You’re not signed in.</T>
            )}
          </>
        ) : settingsPage === 'delete' ? (
          <>
            <T>
              This permanently deletes your profile, comments, posts, replies, recommendations, follows, circles you own, notifications and synced library. It cannot be undone.
            </T>
            <T tone="muted" style={{ marginVertical: space.m }}>Download your data first if you want a copy. Type DELETE to confirm.</T>
            <TextField label="Confirmation" value={confirmText} onChangeText={setConfirmText} autoCapitalize="none" />
            <Button
              kind="danger"
              label="Delete everything"
              loading={busy}
              disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
              onPress={async () => {
                if (!user) return;
                setBusy(true);
                try {
                  await deleteMyData(user.uid, profile?.handle || null);
                  const err = await deleteAuthAccount();
                  if (err) {
                    toast(err);
                    return;
                  }
                  await app.resetLocalData();
                  setSettingsPage(null);
                  toast('Your account and data are deleted.');
                } catch {
                  toast('Deletion did not finish. Try again to remove what is left.');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
