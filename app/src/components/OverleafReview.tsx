import { useState } from 'react';
import { Switch, View } from 'react-native';
import type { SurveyOptions } from '../logic/overleaf';
import { Button, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';

/** This form mounts per review. No account name, opt-in, or external title is persisted. */
export function OverleafReview({ title, count, busy, onBack, onSend }: {
  title: string;
  count: number;
  busy: boolean;
  onBack: () => void;
  onSend: (options: SurveyOptions) => void;
}) {
  const [exportTitle, setExportTitle] = useState(title);
  const [author, setAuthor] = useState('');
  const [include, setInclude] = useState(false);
  const cleanTitle = exportTitle.trim() || 'Literature survey';
  return (
    <View style={{ gap: space.m }}>
      <T tone="muted">{`Overleaf will receive the title below and ${count} citation${count === 1 ? '' : 's'}. Nothing is sent until you confirm.`}</T>
      <TextField label="Export title" value={exportTitle} onChangeText={setExportTitle} maxLength={120} placeholder="Literature survey" />
      <TextField label="Document author (optional)" value={author} onChangeText={setAuthor} maxLength={100} placeholder="Leave blank for no byline" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T>Include notes and matrix</T>
          <T v="small" tone="muted">{include ? 'These will be visible in the shared TeX source.' : 'Off: your working notes and matrix stay out of this export.'}</T>
        </View>
        <Switch accessibilityLabel="Include notes and matrix" value={include} onValueChange={setInclude} disabled={busy} />
      </View>
      <Button label="Send to Overleaf" icon="external-link" disabled={busy || count === 0} loading={busy}
        onPress={() => onSend({ title: cleanTitle, author, workingMaterial: include })} />
      <Button label="Back to export options" kind="ghost" onPress={onBack} disabled={busy} />
    </View>
  );
}
