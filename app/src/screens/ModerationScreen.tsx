import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { ReportRecord, openReports, resolveReport } from '../services/community';
import { relativeTime } from '../logic/date';
import { Button, Card, EmptyState, IconButton, Screen, T } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

/** Admin-only queue of open reports. Firestore rules restrict reads to admins. */
export function ModerationScreen() {
  const nav = useNav();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [reports, setReports] = useState<ReportRecord[] | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await openReports());
    } catch {
      setReports([]);
      toast('Could not load reports.');
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const back = <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />;
  if (!isAdmin) return <Screen title="Moderation" left={back}><EmptyState icon="lock" title="Moderators only" /></Screen>;

  return (
    <Screen title="Moderation" left={back}>
      {reports === null ? (
        <T tone="muted">Loading…</T>
      ) : reports.length === 0 ? (
        <EmptyState icon="check-circle" title="No open reports" />
      ) : (
        <View style={{ gap: space.m }}>
          {reports.map((r) => (
            <Card key={r.id}>
              <T v="label" tone="muted">{`${r.targetType} · ${r.reason}${r.createdAt ? ` · ${relativeTime(r.createdAt.getTime())}` : ''}`}</T>
              <T v="mono" style={{ marginTop: space.s }} selectable>{r.targetPath}</T>
              {r.note ? <T style={{ marginTop: space.s }}>{r.note}</T> : null}
              <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
                <Button kind="danger" label="Remove content" onPress={async () => { await resolveReport(r, true).catch(() => toast('Failed.')); load(); }} style={{ flex: 1 }} />
                <Button kind="secondary" label="Dismiss" onPress={async () => { await resolveReport(r, false).catch(() => toast('Failed.')); load(); }} style={{ flex: 1 }} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
