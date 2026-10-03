import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Sheet, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { REPORT_REASONS, ReportReason, SUMMARY_REPORT_REASONS, SummaryReportReason, LIMITS } from '../logic/social';
import { ReportTarget, reportContent, reportSummary } from '../services/community';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../ui/Toast';

/** Flag an AI summary. Works signed out so any reader can report an error. */
export function ReportSummarySheet({ paperId, visible, onClose }: { paperId: string; visible: boolean; onClose: () => void }) {
  const { user, isConfigured } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState<SummaryReportReason>('wrong_number');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await reportSummary({ paperId, reason, note, uid: user?.uid || null });
      toast('Thanks. The summary is flagged for review.');
      setNote('');
      onClose();
    } catch {
      toast('Could not send the report. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Report this summary" onClose={onClose}>
      <T tone="muted" style={{ marginBottom: space.m }}>
        What is wrong? Reports are checked against the abstract, and corrected summaries replace the old one.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginBottom: space.l }}>
        {SUMMARY_REPORT_REASONS.map((r) => (
          <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>
      <TextField label="Details (optional)" value={note} onChangeText={setNote} multiline maxLength={LIMITS.reportNote} />
      {!isConfigured ? (
        <T v="small" tone="warn" style={{ marginBottom: space.m }}>
          Reporting needs an internet-connected build.
        </T>
      ) : null}
      <Button label="Send report" onPress={submit} loading={busy} disabled={!isConfigured} />
    </Sheet>
  );
}

export interface ReportTargetInfo {
  type: ReportTarget;
  path: string;
  uid: string;
  name: string;
}

/** Report a person's content, and optionally block them, in one place. */
export function ReportSheet({
  target,
  onClose,
  onBlock,
}: {
  target: ReportTargetInfo | null;
  onClose: () => void;
  onBlock?: (uid: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user || !target) return;
    setBusy(true);
    try {
      await reportContent({
        reporterUid: user.uid,
        targetType: target.type,
        targetPath: target.path,
        targetUid: target.uid,
        reason,
        note,
      });
      toast('Reported. A moderator will review it.');
      setNote('');
      onClose();
    } catch {
      toast('Could not send the report. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={Boolean(target)} title="Report" onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginBottom: space.l }}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>
      <TextField label="Details (optional)" value={note} onChangeText={setNote} multiline maxLength={LIMITS.reportNote} />
      <Button label="Send report" onPress={submit} loading={busy} disabled={!user} />
      {target && onBlock && target.uid !== user?.uid ? (
        <Button
          kind="ghost"
          label={`Block ${target.name}`}
          icon="slash"
          style={{ marginTop: space.s }}
          onPress={() => {
            onBlock(target.uid);
            toast(`${target.name} is blocked. You will not see their posts.`);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}
