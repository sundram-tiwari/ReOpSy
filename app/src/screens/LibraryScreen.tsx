import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { LibraryEntry, LibraryStatus, MatrixRow } from '../types';
import { useAppState } from '../state/AppState';
import { useAuth } from '../hooks/useAuth';
import { useNav } from '../navigation/types';
import { cleanText, formatAuthors } from '../logic/cardView';
import { EMPTY_MATRIX, MATRIX_COLUMNS, shortCitation, toBibTeX, toMarkdown, toMatrixCSV, toRIS } from '../logic/exporters';
import { buildSurveyTex } from '../logic/overleaf';
import { shareTextFile } from '../platform/files';
import { openInOverleaf } from '../platform/overleaf';
import { sendToZotero } from '../platform/zoteroClient';
import { Button, Chip, EmptyState, ListRow, Screen, Segmented, Sheet, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

const TABS: { key: LibraryStatus; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'later', label: 'Read later' },
  { key: 'survey', label: 'Survey' },
];

function filledCount(e: LibraryEntry): number {
  const m = e.matrix || e.paper.matrixRow;
  return m ? Object.values(m).filter(Boolean).length : 0;
}

export function LibraryScreen() {
  const nav = useNav();
  const tabs = useNavigation<any>();
  const toast = useToast();
  const { user } = useAuth();
  const { state, updateEntry, noteExport, setSurveyTitle } = useAppState();
  const [tab, setTab] = useState<LibraryStatus>('saved');
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryEntry | null>(null);
  const [draft, setDraft] = useState<MatrixRow>(EMPTY_MATRIX);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<LibraryStatus, number> = { saved: 0, later: 0, survey: 0 };
    for (const e of state.library) c[e.status]++;
    return c;
  }, [state.library]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.library
      .filter((e) => e.status === tab)
      .filter((e) => !q || `${e.paper.originalTitle} ${e.paper.headline || ''} ${(e.paper.authors || []).join(' ')} ${e.note || ''}`.toLowerCase().includes(q));
  }, [state.library, tab, search]);

  const openEditor = (e: LibraryEntry) => {
    setEditing(e);
    setDraft({ ...EMPTY_MATRIX, ...(e.matrix || e.paper.matrixRow || {}) });
    setNote(e.note || '');
  };

  const run = async (key: string, fn: () => Promise<void> | void, done: string) => {
    if (entries.length === 0) {
      toast('Nothing to export in this tab.');
      return;
    }
    setBusy(key);
    try {
      await fn();
      noteExport();
      toast(done);
    } catch (err) {
      toast((err as Error)?.message || 'Export failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const papers = entries.map((e) => e.paper);
  const tabLabel = TABS.find((t) => t.key === tab)!.label;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.m }}>
        <T v="title" accessibilityRole="header" style={{ flex: 1 }}>
          Library
        </T>
        <Button kind="secondary" icon="download" label="Export" onPress={() => setExportOpen(true)} />
      </View>
      <Segmented options={TABS.map((t) => ({ key: t.key, label: `${t.label} ${counts[t.key]}` }))} value={tab} onChange={setTab} />
      <View style={{ marginTop: space.l }}>
        <TextField label="Search your library" value={search} onChangeText={setSearch} placeholder="Title, author or note" autoCapitalize="none" />
      </View>

      {tab === 'survey' && (
        <TextField label="Survey title (used for Overleaf)" value={state.surveyTitle} onChangeText={setSurveyTitle} maxLength={120} />
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={tab === 'survey' ? 'grid' : 'bookmark'}
          title={search ? 'No matches' : tab === 'survey' ? 'Your survey is empty' : `Nothing in ${tabLabel.toLowerCase()} yet`}
          body={
            search
              ? 'Try another word.'
              : tab === 'survey'
                ? 'Tap Survey on a card in Today. Each paper becomes a row in your literature matrix.'
                : 'Tap Save on a card in Today to keep it here.'
          }
        />
      ) : (
        entries.map((e) => (
          <ListRow
            key={e.paper.id}
            title={cleanText(e.paper.headline || e.paper.originalTitle)}
            subtitle={`${formatAuthors(e.paper.authors, e.paper.authorCount)}${e.paper.year ? ` · ${e.paper.year}` : ''}${
              tab === 'survey' ? ` · matrix ${filledCount(e)}/6` : ''
            }${e.note ? ' · has note' : ''}`}
            onPress={() => nav.navigate('Paper', { paperId: e.paper.id })}
            right={
              <Pressable onPress={() => openEditor(e)} accessibilityRole="button" accessibilityLabel="Edit notes and matrix" hitSlop={8}>
                <Chip label={tab === 'survey' ? 'Matrix' : 'Note'} icon="edit-2" />
              </Pressable>
            }
          />
        ))
      )}

      <Sheet visible={exportOpen} title={`Export ${tabLabel} (${entries.length})`} onClose={() => setExportOpen(false)}>
        <T tone="muted" style={{ marginBottom: space.m }}>
          Citations come from paper metadata, never from AI, so every link and ID is real.
        </T>
        <View style={{ gap: space.s }}>
          <Button kind="secondary" icon="file-text" label="BibTeX (.bib) for LaTeX" loading={busy === 'bib'}
            onPress={() => run('bib', () => shareTextFile(`reopsy-${tab}-${stamp}.bib`, 'application/x-bibtex', toBibTeX(papers)), 'BibTeX exported.')} />
          <Button kind="secondary" icon="file-text" label="RIS for Zotero, Mendeley, EndNote" loading={busy === 'ris'}
            onPress={() => run('ris', () => shareTextFile(`reopsy-${tab}-${stamp}.ris`, 'application/x-research-info-systems', toRIS(entries)), 'RIS exported.')} />
          <Button kind="secondary" icon="grid" label="Literature matrix (.csv) for Sheets/Excel" loading={busy === 'csv'}
            onPress={() => run('csv', () => shareTextFile(`reopsy-matrix-${stamp}.csv`, 'text/csv', toMatrixCSV(entries)), 'Matrix exported.')} />
          <Button kind="secondary" icon="hash" label="Markdown for Notion or Obsidian" loading={busy === 'md'}
            onPress={() => run('md', () => shareTextFile(`reopsy-${tab}-${stamp}.md`, 'text/markdown', toMarkdown(entries, tabLabel)), 'Markdown exported.')} />
          <Button kind="secondary" icon="copy" label="Copy citations" loading={busy === 'copy'}
            onPress={() => run('copy', () => Clipboard.setStringAsync(papers.map(shortCitation).join('\n')).then(() => undefined), 'Citations copied.')} />
          <Button icon="edit-3" label="Open as a survey in Overleaf" loading={busy === 'overleaf'}
            onPress={() =>
              run('overleaf', () => openInOverleaf(buildSurveyTex(entries, { title: state.surveyTitle, author: user?.displayName || undefined })), 'Opening Overleaf…')
            } />
          {state.zotero ? (
            <Button icon="upload-cloud" label={`Send to Zotero (${state.zotero.username || 'connected'})`} loading={busy === 'zotero'}
              onPress={() =>
                run('zotero', async () => {
                  const r = await sendToZotero(state.zotero!, entries);
                  if (r.failed > 0) throw new Error(`${r.saved} sent, ${r.failed} rejected by Zotero.`);
                }, 'Sent to your Zotero library.')
              } />
          ) : (
            <Button kind="ghost" icon="link" label="Connect Zotero to send directly" onPress={() => { setExportOpen(false); tabs.navigate('You'); }} />
          )}
        </View>
      </Sheet>

      <Sheet visible={Boolean(editing)} title="Notes and matrix" onClose={() => setEditing(null)}>
        {editing ? (
          <View>
            <T v="small" tone="muted" style={{ marginBottom: space.l }}>
              {cleanText(editing.paper.headline || editing.paper.originalTitle)}
            </T>
            <TextField label="Your note" value={note} onChangeText={setNote} multiline maxLength={1000} />
            {MATRIX_COLUMNS.map((col) => (
              <TextField
                key={col.key}
                label={col.label}
                value={draft[col.key]}
                onChangeText={(v) => setDraft((d) => ({ ...d, [col.key]: v }))}
                maxLength={200}
              />
            ))}
            <Button
              label="Save"
              onPress={() => {
                updateEntry(editing.paper.id, { note: note.trim(), matrix: draft });
                setEditing(null);
                toast('Saved.');
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
