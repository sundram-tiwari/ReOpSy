import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { useNav } from '../navigation/types';
import {
  Circle,
  Profile,
  Recommendation,
  createCircle,
  follow,
  followingFeed,
  getCircle,
  joinCircle,
  myCircles,
  publicCircles,
  searchPeople,
  suggestPeople,
  unfollow,
} from '../services/community';
import { config, topicLabel } from '../config';
import { LIMITS } from '../logic/social';
import { relativeTime } from '../logic/date';
import { Avatar, Button, Card, Chip, EmptyState, IconButton, ListRow, Screen, SectionTitle, Segmented, Sheet, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

type Seg = 'circles' | 'following' | 'people';

export function CirclesScreen() {
  const nav = useNav();
  const toast = useToast();
  const { user } = useAuth();
  const { state } = useAppState();
  const { enabled, me, profile, profileLoading, following, unread, refreshUnread, setFollowingLocal } = useCommunity();
  const [seg, setSeg] = useState<Seg>('circles');

  const [mine, setMine] = useState<Circle[] | null>(null);
  const [discover, setDiscover] = useState<Circle[]>([]);
  const [feed, setFeed] = useState<Recommendation[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ name: '', description: '', visibility: 'public' as 'public' | 'private', topic: '' });
  const [busy, setBusy] = useState(false);

  const loadCircles = useCallback(async () => {
    if (!user || !enabled) return;
    try {
      const [m, d] = await Promise.all([myCircles(user.uid), publicCircles()]);
      setMine(m);
      setDiscover(d.filter((c) => !c.memberUids.includes(user.uid)));
    } catch {
      setMine([]);
      toast('Could not load circles. Check your connection.');
    }
  }, [user, enabled, toast]);

  const loadFeed = useCallback(async () => {
    if (!user || !enabled) return;
    try {
      const recs = await followingFeed([...following]);
      setFeed(recs.filter((r) => !state.blockedUids.includes(r.uid)));
    } catch {
      setFeed([]);
    }
  }, [user, enabled, following, state.blockedUids]);

  const loadPeople = useCallback(async () => {
    if (!user || !enabled || !profile) return;
    try {
      const q = query.trim();
      const list = q.length >= 2 ? await searchPeople(q) : await suggestPeople(profile.interests, user.uid);
      setPeople(list.filter((p) => p.uid !== user.uid && !state.blockedUids.includes(p.uid)));
    } catch {
      setPeople([]);
    }
  }, [user, enabled, profile, query, state.blockedUids]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
      if (seg === 'circles') loadCircles();
      if (seg === 'following') loadFeed();
      if (seg === 'people') loadPeople();
    }, [seg, loadCircles, loadFeed, loadPeople, refreshUnread]),
  );

  useEffect(() => {
    const t = setTimeout(() => seg === 'people' && loadPeople(), 350);
    return () => clearTimeout(t);
  }, [query, seg, loadPeople]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.m }}>
      <T v="title" accessibilityRole="header" style={{ flex: 1 }}>
        Community
      </T>
      {user ? <IconButton icon="bell" label={unread ? 'Notifications, new activity' : 'Notifications'} dot={unread} onPress={() => nav.navigate('Inbox')} /> : null}
    </View>
  );

  if (!enabled) {
    return (
      <Screen>
        {header}
        <EmptyState icon="wifi-off" title="Community is offline in this build" body="Reading, recall and your library work fully offline. Discussions and circles need the online build." />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="users"
          title="Read with other researchers"
          body="Join circles for your lab or journal club, follow researchers in your field, and see the papers they recommend. Reading stays free and works without an account."
          action={<Button label="Sign in or create an account" onPress={() => nav.navigate('SignIn')} />}
        />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="user-plus"
          title={profileLoading ? 'Loading your profile…' : 'Create your researcher profile'}
          body="Your name, role and research interests help the right people find you. It takes a minute."
          action={profileLoading ? undefined : <Button label="Create profile" onPress={() => nav.navigate('EditProfile')} />}
        />
      </Screen>
    );
  }

  const toggleFollow = async (p: Profile) => {
    if (!me) return;
    const on = !following.has(p.uid);
    setFollowingLocal(p.uid, on);
    try {
      if (on) await follow(me, p.uid);
      else await unfollow(me.uid, p.uid);
    } catch {
      setFollowingLocal(p.uid, !on);
      toast('Could not update. Try again.');
    }
  };

  const circleRow = (c: Circle, joined: boolean) => (
    <ListRow
      key={c.id}
      title={c.name}
      subtitle={[
        `${c.memberUids.length} member${c.memberUids.length === 1 ? '' : 's'}`,
        c.topic ? topicLabel(c.topic) : null,
        c.lastActivityAt ? `active ${relativeTime(c.lastActivityAt.getTime())}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      icon={c.visibility === 'private' ? 'lock' : 'users'}
      onPress={() => nav.navigate('Circle', { circleId: c.id })}
      right={
        joined ? undefined : (
          <Button
            kind="secondary"
            label="Join"
            onPress={async () => {
              if (!me) return;
              try {
                await joinCircle(c, me);
                toast(`Joined ${c.name}.`);
                loadCircles();
              } catch {
                toast('Could not join. Try again.');
              }
            }}
          />
        )
      }
    />
  );

  return (
    <Screen>
      {header}
      <Segmented
        options={[
          { key: 'circles', label: 'Circles' },
          { key: 'following', label: 'Following' },
          { key: 'people', label: 'People' },
        ]}
        value={seg}
        onChange={setSeg}
      />

      {seg === 'circles' && (
        <View>
          <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.l }}>
            <Button icon="plus" label="New circle" onPress={() => setCreateOpen(true)} style={{ flex: 1 }} />
            <Button kind="secondary" icon="key" label="Join with code" onPress={() => setJoinOpen(true)} style={{ flex: 1 }} />
          </View>
          <SectionTitle>Your circles</SectionTitle>
          {mine === null ? (
            <T tone="muted">Loading…</T>
          ) : mine.length === 0 ? (
            <T tone="muted">Circles are small groups for a lab, a course or a journal club. Create one or join below.</T>
          ) : (
            mine.map((c) => circleRow(c, true))
          )}
          <SectionTitle>Public circles</SectionTitle>
          {discover.length === 0 ? <T tone="muted">No other public circles yet.</T> : discover.map((c) => circleRow(c, false))}
        </View>
      )}

      {seg === 'following' && (
        <View style={{ marginTop: space.l }}>
          {feed === null ? (
            <T tone="muted">Loading…</T>
          ) : following.size === 0 ? (
            <EmptyState icon="user-check" title="Follow researchers to see what they recommend" action={<Button label="Find people" onPress={() => setSeg('people')} />} />
          ) : feed.length === 0 ? (
            <EmptyState icon="coffee" title="No recommendations in the last 14 days" body="When people you follow recommend a paper, it shows up here." />
          ) : (
            <View style={{ gap: space.m }}>
              {feed.map((r) => (
                <Card key={r.id}>
                  <Pressable onPress={() => nav.navigate('Profile', { uid: r.uid })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    <Avatar name={r.name} size={28} />
                    <T v="small" tone="muted" style={{ flex: 1 }}>
                      <T v="small" style={{ fontWeight: '600' }}>{r.name}</T> recommends{r.createdAt ? ` · ${relativeTime(r.createdAt.getTime())}` : ''}
                    </T>
                  </Pressable>
                  <Pressable onPress={() => nav.navigate('Paper', { paperId: r.paper.id, ref: r.paper })} accessibilityRole="button">
                    <T v="heading" style={{ marginTop: space.s }}>{r.paper.title}</T>
                    {r.note ? <T tone="muted" style={{ marginTop: space.xs }}>“{r.note}”</T> : null}
                  </Pressable>
                </Card>
              ))}
              <T v="small" tone="faint" style={{ textAlign: 'center', marginTop: space.m }}>
                That's everything from the last 14 days.
              </T>
            </View>
          )}
        </View>
      )}

      {seg === 'people' && (
        <View style={{ marginTop: space.l }}>
          <TextField label="Search by handle" value={query} onChangeText={setQuery} placeholder="@handle" autoCapitalize="none" />
          {query.trim().length < 2 ? <SectionTitle>Shares your interests</SectionTitle> : null}
          {people.length === 0 ? (
            <T tone="muted">{query.trim().length >= 2 ? 'No one with that handle.' : 'Add interests to your profile to get suggestions.'}</T>
          ) : (
            people.map((p) => (
              <ListRow
                key={p.uid}
                title={p.name}
                subtitle={[`@${p.handle}`, p.role, p.affiliation].filter(Boolean).join(' · ')}
                onPress={() => nav.navigate('Profile', { uid: p.uid })}
                right={<Button kind={following.has(p.uid) ? 'secondary' : 'primary'} label={following.has(p.uid) ? 'Following' : 'Follow'} onPress={() => toggleFollow(p)} />}
              />
            ))
          )}
        </View>
      )}

      <Sheet visible={createOpen} title="New circle" onClose={() => setCreateOpen(false)}>
        <TextField label="Name" value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} maxLength={LIMITS.circleName} placeholder="e.g. EEG reading group" />
        <TextField label="What it is for" value={form.description} onChangeText={(description) => setForm((f) => ({ ...f, description }))} maxLength={LIMITS.circleDescription} multiline />
        <T v="label" tone="muted" style={{ marginBottom: space.s }}>Who can find it</T>
        <View style={{ flexDirection: 'row', gap: space.s, marginBottom: space.l }}>
          <Chip label="Public: anyone can join" selected={form.visibility === 'public'} onPress={() => setForm((f) => ({ ...f, visibility: 'public' }))} />
          <Chip label="Private: invite code only" selected={form.visibility === 'private'} onPress={() => setForm((f) => ({ ...f, visibility: 'private' }))} />
        </View>
        <T v="label" tone="muted" style={{ marginBottom: space.s }}>Topic (optional)</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginBottom: space.l }}>
          {config.topics.map((t) => (
            <Chip key={t.slug} label={t.label} selected={form.topic === t.slug} onPress={() => setForm((f) => ({ ...f, topic: f.topic === t.slug ? '' : t.slug }))} />
          ))}
        </View>
        <Button
          label="Create circle"
          loading={busy}
          disabled={form.name.trim().length < 3}
          onPress={async () => {
            if (!me) return;
            setBusy(true);
            try {
              const id = await createCircle(me, form);
              setCreateOpen(false);
              setForm({ name: '', description: '', visibility: 'public', topic: '' });
              nav.navigate('Circle', { circleId: id });
            } catch {
              toast('Could not create the circle. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={joinOpen} title="Join with an invite code" onClose={() => setJoinOpen(false)}>
        <TextField label="Invite code" value={code} onChangeText={setCode} autoCapitalize="none" placeholder="Paste the code you were sent" />
        <Button
          label="Join"
          loading={busy}
          disabled={code.trim().length < 10}
          onPress={async () => {
            if (!me) return;
            setBusy(true);
            try {
              const c = await getCircle(code.trim());
              if (!c) {
                toast('No circle with that code.');
                return;
              }
              if (!c.memberUids.includes(me.uid)) await joinCircle(c, me);
              setJoinOpen(false);
              setCode('');
              nav.navigate('Circle', { circleId: c.id });
            } catch {
              toast('Could not join. Check the code and try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </Screen>
  );
}
