import { useMemo, useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { deleteMyData } from '../services/community';
import { connectZotero, disconnectZotero } from '../platform/zoteroClient';
import { secretsAreDeviceProtected } from '../platform/secrets';
import { shareTextFile } from '../platform/files';
import { milestones, weekRhythm } from '../logic/progress';
import { effectiveStreak, streakSummary } from '../logic/streak';
import { fromDayKey } from '../logic/date';
import { config } from '../config';
import { Avatar, Button, Card, Chip, ListRow, Screen, SectionTitle, Segmented, Sheet, T, TextField } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { useToast } from '../ui/Toast';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function YouScreen() {
  const nav = useNav();
  const { c } = useTheme();
  const toast = useToast();
  const { user, isAdmin, signOut, deleteAuthAccount } = useAuth();
  const { profile } = useCommunity();
  const app = useAppState();
  const { state, today } = app;

  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroKey, setZoteroKey] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
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
  const activeDays = dots.filter((d) => d.active).length;

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
      </View>
      {user ? (
        profile ? (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" label="View profile" onPress={() => nav.navigate('Profile', { uid: profile.uid })} style={{ flex: 1 }} />
            <Button kind="secondary" label="Edit" icon="edit-2" onPress={() => nav.navigate('EditProfile')} style={{ flex: 1 }} />
          </View>
        ) : (
          <Button label="Create your researcher profile" onPress={() => nav.navigate('EditProfile')} />
        )
      ) : (
        <Button label="Sign in to sync and join the community" onPress={() => nav.navigate('SignIn')} />
      )}

      <SectionTitle>This week</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {dots.map((d) => (
            <View key={d.day} style={{ alignItems: 'center', gap: space.xs }} accessibilityLabel={`${d.day}: ${d.active ? 'active' : 'no reading'}`}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: d.active ? c.accent : c.surfaceAlt,
                  borderWidth: d.day === today ? 2 : 0,
                  borderColor: c.ink,
                }}
              />
              <T v="caption" tone="muted">{DAY_LETTERS[fromDayKey(d.day).getDay()]}</T>
            </View>
          ))}
        </View>
        <T style={{ marginTop: space.m }}>
          {activeDays} of 7 days · {streak > 0 ? `${streak}-day streak` : 'no streak running'} · longest {state.streak.longest}
        </T>
        <T v="small" tone="muted" style={{ marginTop: space.xs }}>
          {streakSummary(state.streak, today)}
          {state.streak.freezes > 0 ? ` ${state.streak.freezes} freeze${state.streak.freezes === 1 ? '' : 's'} saved for a missed day.` : ''}
        </T>
      </Card>

      <SectionTitle>Milestones</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {ms.map((m) => (
          <Chip key={m.id} label={`${m.label} · ${m.progress}`} icon={m.done ? 'check-circle' : 'circle'} tone={m.done ? 'good' : 'muted'} filled={m.done} />
        ))}
      </View>

      <SectionTitle>Reading</SectionTitle>
      <ListRow icon="list" title="Topics" subtitle={`${state.followedTopics.length} followed`} onPress={() => nav.navigate('Topics')} />
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

      <SectionTitle>Connected tools</SectionTitle>
      <ListRow
        icon="book-open"
        title="Zotero"
        subtitle={state.zotero ? `Connected as ${state.zotero.username || state.zotero.userId}` : 'Send papers straight to your Zotero library'}
        onPress={() => setZoteroOpen(true)}
      />
      <ListRow icon="edit-3" title="Overleaf" subtitle="Library > Survey > Export opens a ready survey project" />
      <ListRow
        icon="download"
        title="Download all my data"
        subtitle="Library, notes, matrix and settings as JSON"
        onPress={async () => {
          try {
            await shareTextFile(`reopsy-backup-${today}.json`, 'application/json', JSON.stringify(state, null, 2));
          } catch {
            toast('Could not export. Try again.');
          }
        }}
      />

      <SectionTitle>About</SectionTitle>
      <ListRow icon="shield" title="Community guidelines" onPress={() => nav.navigate('Guidelines')} />
      <ListRow icon="lock" title="Privacy policy" onPress={() => legal('privacy-policy')} />
      <ListRow icon="file-text" title="Terms of use" onPress={() => legal('terms-of-use')} />
      <ListRow icon="info" title="Data sources" subtitle="arXiv, OpenAlex (CC0), Crossref, Unpaywall. Summaries are AI-written; check the abstract." />
      {isAdmin ? <ListRow icon="flag" title="Moderation queue" onPress={() => nav.navigate('Moderation')} /> : null}
      {isAdmin ? <ListRow icon="sliders" title="Mission Control (admin)" onPress={() => nav.navigate('Admin')} /> : null}

      {user ? (
        <View style={{ gap: space.s, marginTop: space.xl }}>
          <Button kind="secondary" icon="log-out" label="Sign out" onPress={signOut} />
          <Button kind="danger" icon="trash-2" label="Delete account" onPress={() => setDeleteOpen(true)} />
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

      <Sheet visible={deleteOpen} title="Delete your account" onClose={() => setDeleteOpen(false)}>
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
              setDeleteOpen(false);
              toast('Your account and data are deleted.');
            } catch {
              toast('Deletion did not finish. Try again to remove what is left.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </Screen>
  );
}
