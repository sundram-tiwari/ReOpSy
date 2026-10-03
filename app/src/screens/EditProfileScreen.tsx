import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { CommunityError, saveProfile } from '../services/community';
import { config } from '../config';
import { LIMITS, ROLES, normalizeOrcid, suggestHandle, validateHandle } from '../logic/social';
import { Button, Chip, IconButton, Screen, SectionTitle, T, TextField } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { useToast } from '../ui/Toast';

export function EditProfileScreen() {
  const nav = useNav();
  const { c } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { state } = useAppState();
  const { profile, refreshProfile } = useCommunity();
  const isNew = !profile;

  const [name, setName] = useState(profile?.name || user?.displayName || '');
  const [handle, setHandle] = useState(profile?.handle || suggestHandle(user?.displayName || user?.email?.split('@')[0] || ''));
  const [role, setRole] = useState(profile?.role || '');
  const [affiliation, setAffiliation] = useState(profile?.affiliation || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [interests, setInterests] = useState<string[]>(profile?.interests || state.followedTopics.slice(0, LIMITS.interests));
  const [orcid, setOrcid] = useState(profile?.orcid || '');
  const [accepted, setAccepted] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = isNew ? validateHandle(handle) : null;
  const orcidNorm = orcid.trim() ? normalizeOrcid(orcid) : '';
  const orcidError = orcid.trim() && !orcidNorm ? 'That is not a valid ORCID iD (check the last digit).' : null;
  const canSave = name.trim().length >= 1 && !handleError && !orcidError && accepted && Boolean(user);

  const save = async () => {
    if (!user) return nav.navigate('SignIn');
    setBusy(true);
    setError(null);
    try {
      await saveProfile(user.uid, { name, handle, role, affiliation, bio, interests, orcid: orcidNorm || '' }, isNew);
      await refreshProfile();
      toast(isNew ? 'Profile created. Welcome to the community.' : 'Profile saved.');
      nav.goBack();
    } catch (err) {
      setError(err instanceof CommunityError ? err.message : 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={isNew ? 'Create profile' : 'Edit profile'} left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={LIMITS.name} autoCapitalize="words" />
      {isNew ? (
        <TextField
          label="Handle (cannot be changed later)"
          value={handle}
          onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          maxLength={LIMITS.handleMax}
          autoCapitalize="none"
          error={handle ? handleError : null}
        />
      ) : (
        <T tone="muted" style={{ marginBottom: space.l }}>@{handle}</T>
      )}

      <T v="label" tone="muted" style={{ marginBottom: space.s }}>Role</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginBottom: space.l }}>
        {ROLES.map((r) => <Chip key={r} label={r} selected={role === r} onPress={() => setRole(role === r ? '' : r)} />)}
      </View>

      <TextField label="Affiliation (optional)" value={affiliation} onChangeText={setAffiliation} maxLength={LIMITS.affiliation} placeholder="University, lab or company" />
      <TextField label="About (optional)" value={bio} onChangeText={setBio} maxLength={LIMITS.bio} multiline placeholder="What you work on, in a line or two" />
      <TextField label="ORCID iD (optional)" value={orcid} onChangeText={setOrcid} autoCapitalize="none" placeholder="0000-0002-1825-0097" error={orcidError} />

      <SectionTitle>Research interests</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {config.topics.map((t) => {
          const on = interests.includes(t.slug);
          return (
            <Chip
              key={t.slug}
              label={t.label}
              selected={on}
              onPress={() => setInterests((list) => (on ? list.filter((x) => x !== t.slug) : [...list, t.slug].slice(0, LIMITS.interests)))}
            />
          );
        })}
      </View>

      {isNew ? (
        <Pressable
          onPress={() => setAccepted(!accepted)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m, marginTop: space.xl }}
        >
          <Feather name={accepted ? 'check-square' : 'square'} size={22} color={accepted ? c.accent : c.muted} />
          <T style={{ flex: 1 }}>
            I agree to the community guidelines: be respectful, cite sources, no spam, no plagiarism, and no medical advice.
          </T>
        </Pressable>
      ) : null}
      {isNew ? (
        <Button kind="ghost" label="Read the community guidelines" onPress={() => nav.navigate('Guidelines')} />
      ) : null}

      {error ? <T tone="bad" style={{ marginTop: space.m }}>{error}</T> : null}
      <Button label={isNew ? 'Create profile' : 'Save'} onPress={save} loading={busy} disabled={!canSave} style={{ marginTop: space.l }} />
      <T v="small" tone="faint" style={{ marginTop: space.m }}>
        Your profile, posts and recommendations are visible to signed-in members. Your library stays private.
      </T>
    </Screen>
  );
}
