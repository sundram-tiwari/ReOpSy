import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList, useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { Profile, Recommendation, follow, followCounts, getProfile, recommendationsBy, unfollow } from '../services/community';
import { topicLabel } from '../config';
import { ReportSheet, ReportTargetInfo } from '../components/ReportSheets';
import { Avatar, Button, Card, Chip, EmptyState, IconButton, ListRow, Screen, SectionTitle, T } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

export function ProfileScreen() {
  const nav = useNav();
  const { uid } = useRoute<RouteProp<RootStackParamList, 'Profile'>>().params;
  const { user } = useAuth();
  const { me, following, setFollowingLocal } = useCommunity();
  const { state, blockUser, unblockUser } = useAppState();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [report, setReport] = useState<ReportTargetInfo | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getProfile(uid);
        if (!alive) return;
        setProfile(p);
        if (p) {
          const [c, r] = await Promise.all([followCounts(uid), recommendationsBy(uid)]);
          if (alive) {
            setCounts(c);
            setRecs(r);
          }
        }
      } catch {
        if (alive) setProfile(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  const back = <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />;
  if (profile === undefined) return <Screen title="Profile" left={back}><T tone="muted">Loading…</T></Screen>;
  if (profile === null) return <Screen title="Profile" left={back}><EmptyState icon="user-x" title="Profile not found" /></Screen>;

  const self = user?.uid === uid;
  const blocked = state.blockedUids.includes(uid);
  const isFollowing = following.has(uid);

  return (
    <Screen
      title={`@${profile.handle}`}
      left={back}
      right={!self ? <IconButton icon="flag" label="Report or block" onPress={() => setReport({ type: 'profile', path: `profiles/${uid}`, uid, name: profile.name })} /> : undefined}
    >
      <View style={{ alignItems: 'center', marginTop: space.m }}>
        <Avatar name={profile.name} size={72} />
        <T v="title" style={{ marginTop: space.m, textAlign: 'center' }}>{profile.name}</T>
        <T tone="muted" style={{ textAlign: 'center' }}>
          {[profile.role, profile.affiliation].filter(Boolean).join(' · ')}
        </T>
        {counts ? (
          <T v="small" tone="muted" style={{ marginTop: space.s }}>
            {counts.followers} follower{counts.followers === 1 ? '' : 's'} · {counts.following} following
          </T>
        ) : null}
      </View>

      {profile.bio ? <T style={{ marginTop: space.l }}>{profile.bio}</T> : null}

      {profile.orcid ? (
        <Button kind="ghost" icon="external-link" label={`ORCID ${profile.orcid}`} onPress={() => WebBrowser.openBrowserAsync(`https://orcid.org/${profile.orcid}`)} />
      ) : null}

      {profile.interests.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m }}>
          {profile.interests.map((i) => <Chip key={i} label={topicLabel(i)} />)}
        </View>
      ) : null}

      {!self ? (
        <View style={{ marginTop: space.l, gap: space.s }}>
          {blocked ? (
            <Button kind="secondary" label="Unblock" onPress={() => unblockUser(uid)} />
          ) : (
            <Button
              kind={isFollowing ? 'secondary' : 'primary'}
              label={isFollowing ? 'Following' : 'Follow'}
              onPress={async () => {
                if (!me) return nav.navigate(user ? 'EditProfile' : 'SignIn');
                setFollowingLocal(uid, !isFollowing);
                try {
                  if (isFollowing) await unfollow(me.uid, uid);
                  else await follow(me, uid);
                } catch {
                  setFollowingLocal(uid, isFollowing);
                  toast('Could not update. Try again.');
                }
              }}
            />
          )}
        </View>
      ) : (
        <Button kind="secondary" icon="edit-2" label="Edit profile" style={{ marginTop: space.l }} onPress={() => nav.navigate('EditProfile')} />
      )}

      <SectionTitle>Recommends</SectionTitle>
      {recs.length === 0 ? (
        <T tone="muted">No recommendations yet.</T>
      ) : (
        <Card style={{ paddingVertical: 0 }}>
          {recs.map((r) => (
            <ListRow key={r.id} title={r.paper.title} subtitle={r.note || undefined} onPress={() => nav.navigate('Paper', { paperId: r.paper.id, ref: r.paper })} />
          ))}
        </Card>
      )}

      <ReportSheet target={report} onClose={() => setReport(null)} onBlock={blockUser} />
    </Screen>
  );
}
