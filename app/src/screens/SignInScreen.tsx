import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { Button, Divider, IconButton, Screen, Segmented, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

export function SignInScreen() {
  const nav = useNav();
  const toast = useToast();
  const { user, isConfigured, googleAvailable, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, error } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav.goBack();
  }, [user, nav]);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const err = mode === 'in' ? await signInWithEmail(email, password) : await signUpWithEmail(name, email, password);
    setBusy(false);
    if (err) setMessage(err);
  };

  return (
    <Screen title="Sign in" left={<IconButton icon="x" label="Close" onPress={() => nav.goBack()} />}>
      <T tone="muted" style={{ marginBottom: space.l }}>
        Reading, recall and your library work without an account. Sign in to sync across devices and to join discussions and circles.
      </T>
      {!isConfigured ? (
        <T tone="warn">This build has no account server configured. Everything else works offline.</T>
      ) : (
        <View>
          {googleAvailable ? (
            <>
              <Button kind="secondary" icon="log-in" label="Continue with Google" onPress={() => signInWithGoogle()} />
              {error ? <T v="small" tone="bad" style={{ marginTop: space.s }}>{error}</T> : null}
              <Divider />
            </>
          ) : null}
          <Segmented
            options={[
              { key: 'in', label: 'Sign in' },
              { key: 'up', label: 'Create account' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setMessage(null);
            }}
          />
          <View style={{ marginTop: space.l }}>
            {mode === 'up' ? <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" /> : null}
            <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextField label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" />
            {message ? <T tone="bad" style={{ marginBottom: space.m }}>{message}</T> : null}
            <Button
              label={mode === 'in' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={busy}
              disabled={!email.trim() || password.length < (mode === 'up' ? 8 : 1)}
            />
            {mode === 'in' ? (
              <Button
                kind="ghost"
                label="Forgot password?"
                style={{ marginTop: space.s }}
                onPress={async () => {
                  if (!email.trim()) return setMessage('Enter your email first.');
                  const err = await resetPassword(email);
                  if (err) setMessage(err);
                  else toast('Check your email for a reset link.');
                }}
              />
            ) : (
              <T v="small" tone="faint" style={{ marginTop: space.m }}>
                By creating an account you agree to the Terms and Privacy Policy. Use at least 8 characters for your password.
              </T>
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}
