import { profileLoadMessage } from '../logic/profileLoad';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { RouteProp, useRoute } from '@react-navigation/native';
import { Paper, LibraryStatus } from '../types';
import { useAppState } from '../state/AppState';
import { useCommunity, useContributor } from '../state/Community';
import { useAuth } from '../hooks/useAuth';
import { RootStackParamList, useNav } from '../navigation/types';
import { PaperCardView } from '../components/PaperCardView';
import { ReportSheet, ReportSummarySheet, ReportTargetInfo } from '../components/ReportSheets';
import {
  Circle,
  Comment,
  addComment,
  addPost,
  deleteComment,
  hasRecommended,
  listComments,
  myCircles,
  myHelpful,
  recommend,
  setHelpful,
  unrecommend,
} from '../services/community';
import { shortCitation } from '../logic/exporters';
import { paperKey } from '../logic/cardView';
import { LIMITS, cleanPostText, rateLimit } from '../logic/social';
import { relativeTime } from '../logic/date';
import { Avatar, Button, Chip, Divider, EmptyState, IconButton, ListRow, Screen, SectionTitle, Sheet, T, TextField } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { useToast } from '../ui/Toast';

const STATUS: { key: LibraryStatus | 'none'; label: string }[] = [
  { key: 'none', label: 'Not in library' },
  { key: 'saved', label: 'Saved' },
  { key: 'later', label: 'Read later' },
  { key: 'survey', label: 'In survey' },
];

let postStamps: number[] = [];

type DiscussionError = 'access' | 'connection' | 'other';

function discussionError(error: unknown): DiscussionError {
  switch ((error as { code?: string } | null)?.code) {
    case 'permission-denied':
    case 'unauthenticated':
      return 'access';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'cancelled':
      return 'connection';
    default:
      return 'other';
  }
}

export function PaperScreen() {
  const { paperId } = useRoute<RouteProp<RootStackParamList, 'Paper'>>().params;
  const { user } = useAuth();

  // Do not carry cached comments, drafts, or personal reaction state across
  // a change of paper or authenticated account.
  return <PaperContent key={JSON.stringify([paperId, user?.uid])} />;
}

function PaperContent() {
  const nav = useNav();
  const route = useRoute<RouteProp<RootStackParamList, 'Paper'>>();
  const { paperId, ref } = route.params;
  const { findPaper, libraryEntry, setLibraryStatus, state, blockUser, notePost } = useAppState();
  const { user, loading: authLoading } = useAuth();
  const { enabled, me, profileLoading, profileLoadError, refreshProfile } = useCommunity();
  const canPost = !!user && me?.uid === user.uid;
  const toast = useToast();
  const { c: colors } = useTheme();
  const contributor = useContributor((s) => nav.navigate(s));

  const paper: Paper | undefined =
    findPaper(paperId) ||
    (ref
      ? {
          id: ref.id,
          originalTitle: ref.title,
          catchyTitle: ref.title,
          summary: '',
          authors: [],
          source: '',
          year: null,
          url: ref.url,
          venue: null,
          pdfUrl: null,
          topics: ref.topic ? [ref.topic] : [],
          likes: 0,
        }
      : undefined);

  const entry = libraryEntry(paperId);
  const [comments, setComments] = useState<Comment[]>([]);
  const [helpful, setHelpfulSet] = useState<Set<string> | null>(null);
  const [helpfulFailed, setHelpfulFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoadedComments, setHasLoadedComments] = useState(false);
  const [loadError, setLoadError] = useState<DiscussionError | null>(null);
  const commentRequest = useRef(0);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);
  const [recommended, setRecommended] = useState<boolean | null>(null);
  const [recommendationFailed, setRecommendationFailed] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [recNote, setRecNote] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTargetInfo | null>(null);
  const [summaryReportOpen, setSummaryReportOpen] = useState(false);

  const uid = user?.uid;
  const loadDiscussion = useCallback(async () => {
    if (!enabled || !uid) return;
    const request = ++commentRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listComments(paperId);
      if (request !== commentRequest.current) return;
      setComments(list);
      setHasLoadedComments(true);
    } catch (error) {
      if (request === commentRequest.current) {
        const failure = discussionError(error);
        if (failure === 'access') {
          setComments([]);
          setHasLoadedComments(false);
        }
        setLoadError(failure);
      }
    } finally {
      if (request === commentRequest.current) setLoading(false);
    }
  }, [enabled, uid, paperId]);

  const loadHelpful = useCallback(async () => {
    if (!enabled || !uid) return;
    setHelpfulSet(null);
    setHelpfulFailed(false);
    try {
      setHelpfulSet(await myHelpful(paperId, uid));
    } catch {
      setHelpfulFailed(true);
    }
  }, [enabled, uid, paperId]);

  const loadRecommendation = useCallback(async () => {
    if (!enabled || !uid) return;
    setRecommendationFailed(false);
    try {
      setRecommended(await hasRecommended(uid, paperId));
    } catch {
      setRecommendationFailed(true);
    }
  }, [enabled, uid, paperId]);

  useEffect(() => {
    void loadDiscussion();
    void loadHelpful();
    void loadRecommendation();
    return () => {
      ++commentRequest.current;
    };
  }, [loadDiscussion, loadHelpful, loadRecommendation]);

  const visible = useMemo(() => comments.filter((c) => !state.blockedUids.includes(c.uid)), [comments, state.blockedUids]);
  const threads = useMemo(() => {
    const top = visible.filter((c) => !c.parentId);
    return top.map((t) => ({ top: t, replies: visible.filter((c) => c.parentId === t.id) }));
  }, [visible]);

  if (!paper) {
    return (
      <Screen title="Paper" left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
        <EmptyState icon="file" title="Paper not found" body="It may have left the feed. Saved papers stay in your library." />
      </Screen>
    );
  }

  const sharePaper = async () => {
    const message = `${shortCitation(paper)}
${paper.url}`;
    if (Platform.OS !== 'web' || typeof navigator.share === 'function') {
      try {
        await Share.share({ message });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
        if (Platform.OS !== 'web') {
          toast('Could not share this paper.');
          return;
        }
        // Web Share may be unavailable or blocked by browser permissions.
        // Fall back to the same citation-and-link clipboard action as Today.
      }
    }
    try {
      const copied = await Clipboard.setStringAsync(message);
      toast(copied ? 'Citation and link copied.' : 'Could not copy the citation.');
    } catch {
      toast('Could not copy the citation.');
    }
  };

  const post = async () => {
    if (!canPost) return;
    const me = contributor();
    if (!me) return;
    const clean = cleanPostText(text, LIMITS.comment);
    if (!clean) return;
    const next = rateLimit(postStamps, Date.now());
    if (!next) {
      toast('You are posting quickly. Wait a moment and try again.');
      return;
    }
    postStamps = next;
    setPosting(true);
    try {
      await addComment(me, paper, clean, replyTo ? { id: replyTo.id, uid: replyTo.uid } : null);
      setText('');
      setReplyTo(null);
      notePost();
      await loadDiscussion();
    } catch (error) {
      const failure = discussionError(error);
      if (failure === 'access') {
        toast('Your comment was not posted. Check that you still have a researcher profile and try again.');
        void refreshProfile();
      } else if (failure === 'connection') {
        toast('Could not post. Check your connection and try again.');
      } else {
        toast('Could not post your comment. Try again.');
      }
    } finally {
      setPosting(false);
    }
  };

  const toggleHelpful = async (c: Comment) => {
    const me = contributor();
    if (!me) return;
    if (!helpful) return;
    const on = !helpful.has(c.id);
    setHelpfulSet((s) => {
      const n = new Set(s);
      if (on) n.add(c.id);
      else n.delete(c.id);
      return n;
    });
    setComments((list) => list.map((x) => (x.id === c.id ? { ...x, helpfulCount: x.helpfulCount + (on ? 1 : -1) } : x)));
    try {
      await setHelpful(me.uid, paper.id, c.id, on);
    } catch {
      toast('Could not save that. Try again.');
      void loadDiscussion();
      void loadHelpful();
    }
  };

  const remove = async (c: Comment) => {
    try {
      await deleteComment(paper.id, c.id);
      setComments((list) => list.filter((x) => x.id !== c.id));
      toast('Comment deleted.');
    } catch {
      toast('Could not delete. Try again.');
    }
  };

  const toggleRecommend = async () => {
    const me = contributor();
    if (!me || recommended === null) return;
    if (recommended) {
      try {
        await unrecommend(me.uid, paper.id);
        setRecommended(false);
        toast('Removed from your recommendations.');
      } catch {
        toast('Could not remove that recommendation. Try again.');
      }
    } else {
      setRecOpen(true);
    }
  };

  const openShare = async () => {
    const me = contributor();
    if (!me) return;
    setShareOpen(true);
    try {
      setCircles(await myCircles(me.uid));
    } catch {
      setCircles([]);
    }
  };

  const renderComment = (c: Comment, isReply: boolean) => {
    const mine = user?.uid === c.uid;
    const markedHelpful = !!helpful?.has(c.id);
    return (
      <View key={c.id} style={{ flexDirection: 'row', gap: space.m, marginTop: space.m, marginLeft: isReply ? 44 : 0 }}>
        <Pressable onPress={() => nav.navigate('Profile', { uid: c.uid })} accessibilityRole="button" accessibilityLabel={`Open ${c.name}'s profile`}>
          <Avatar name={c.name} size={isReply ? 28 : 36} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="small" tone="muted">
            <T v="small" style={{ fontWeight: '600' }}>
              {c.name}
            </T>{' '}
            @{c.handle}
            {c.createdAt ? ` · ${relativeTime(c.createdAt.getTime())}` : ''}
          </T>
          <T selectable style={{ marginTop: 2 }}>
            {c.text}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.l, marginTop: space.xs }}>
            <Pressable
              onPress={() => toggleHelpful(c)}
              disabled={!helpful}
              accessibilityRole="button"
              accessibilityLabel={markedHelpful ? 'Remove helpful reaction' : 'Mark comment helpful'}
              accessibilityHint={c.helpfulCount ? `${c.helpfulCount} helpful reactions` : undefined}
              accessibilityState={{ selected: markedHelpful, disabled: !helpful }}
              style={{ minHeight: 44, flexDirection: 'row', gap: space.xs, alignItems: 'center' }}
            >
              <Feather name="thumbs-up" size={15} color={markedHelpful ? colors.accent : colors.muted} />
              <T v="caption" tone={markedHelpful ? 'accent' : 'muted'} style={{ fontWeight: '600' }}>
                Helpful{c.helpfulCount > 0 ? ` · ${c.helpfulCount}` : ''}
              </T>
            </Pressable>
            {!isReply ? (
              <Pressable onPress={() => {
                if (canPost) setReplyTo(c);
                else if (profileLoadError) void refreshProfile();
                else if (!profileLoading) contributor();
              }} accessibilityRole="button" hitSlop={8}>
                <T v="caption" tone="muted" style={{ fontWeight: '600' }}>
                  Reply
                </T>
              </Pressable>
            ) : null}
            {mine ? (
              <Pressable onPress={() => remove(c)} accessibilityRole="button" hitSlop={8}>
                <T v="caption" tone="muted">
                  Delete
                </T>
              </Pressable>
            ) : (
              <Pressable
                onPress={() =>
                  setReportTarget({ type: 'comment', path: `papers/${paperKey(paper.id)}/comments/${c.id}`, uid: c.uid, name: c.name })
                }
                accessibilityRole="button"
                hitSlop={8}
              >
                <T v="caption" tone="muted">
                  Report
                </T>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Screen title="Paper" left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
      <PaperCardView paper={paper} onReportSummary={() => setSummaryReportOpen(true)} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l }}>
        <Button kind="secondary" icon="external-link" label="Abstract" onPress={() => WebBrowser.openBrowserAsync(paper.url)} />
        {paper.pdfUrl ? (
          <Button kind="secondary" icon="file-text" label="PDF" onPress={() => WebBrowser.openBrowserAsync(paper.pdfUrl!)} />
        ) : null}
        {paper.codeUrl ? (
          <Button kind="secondary" icon="code" label="Code" onPress={() => WebBrowser.openBrowserAsync(paper.codeUrl!)} />
        ) : null}
        <Button
          kind="secondary"
          icon="copy"
          label="Cite"
          onPress={async () => {
            await Clipboard.setStringAsync(shortCitation(paper));
            toast('Citation copied.');
          }}
        />
        <Button kind="secondary" icon="share-2" label="Share" onPress={sharePaper} />
      </View>

      <SectionTitle>In your library</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {STATUS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={(entry?.status || 'none') === s.key}
            onPress={() => setLibraryStatus(paper, s.key === 'none' ? null : s.key)}
          />
        ))}
      </View>

      <SectionTitle>Community</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        <Button
          kind={recommended ? 'primary' : 'secondary'}
          icon="award"
          label={recommendationFailed ? 'Retry recommendation status' : recommended ? 'Recommended' : 'Recommend to followers'}
          onPress={recommendationFailed ? loadRecommendation : toggleRecommend}
          disabled={!enabled || (!!user && recommended === null && !recommendationFailed)}
        />
        <Button kind="secondary" icon="users" label="Share to a circle" onPress={openShare} disabled={!enabled} />
      </View>

      <Divider />
      <T v="heading" accessibilityRole="header">
        Discussion
      </T>
      {!enabled ? (
        <T tone="muted" style={{ marginTop: space.s }}>
          Discussions need an internet-connected build.
        </T>
      ) : authLoading ? (
        <T tone="muted" style={{ marginTop: space.m }}>Checking sign-in…</T>
      ) : !user ? (
        <View style={{ marginTop: space.m, alignItems: 'flex-start' }}>
          <T tone="muted">Sign in to read and join the discussion on this paper.</T>
          <Button label="Sign in" style={{ marginTop: space.m }} onPress={() => nav.navigate('SignIn')} />
        </View>
      ) : (
        <View>
          {loadError ? (
            <View style={{ marginTop: space.m, alignItems: 'flex-start', gap: space.s }} accessibilityLiveRegion="polite">
              <T tone="muted">
                {loadError === 'access'
                  ? 'Discussion access was denied. Sign out and back in, then try again.'
                  : loadError === 'connection'
                    ? 'Could not reach the discussion service. Check your connection and try again.'
                    : 'Could not load comments right now. Try again.'}
              </T>
              <Button kind="secondary" label="Retry discussion" icon="refresh-cw" onPress={loadDiscussion} />
            </View>
          ) : loading ? (
            <View style={{ marginTop: space.m }} accessibilityLiveRegion="polite">
              <T tone="muted">{hasLoadedComments ? 'Refreshing comments…' : 'Loading comments…'}</T>
            </View>
          ) : threads.length === 0 ? (
            <T tone="muted" style={{ marginTop: space.m }}>
              No comments yet. Ask a question about the method, or note a limitation others should know.
            </T>
          ) : null}
          {threads.map((t) => (
            <View key={t.top.id}>
              {renderComment(t.top, false)}
              {t.replies.map((r) => renderComment(r, true))}
            </View>
          ))}
          {helpfulFailed && threads.length > 0 ? (
            <View style={{ marginTop: space.m, alignItems: 'flex-start' }}>
              <Button kind="secondary" label="Retry helpful reactions" icon="refresh-cw" onPress={loadHelpful} />
            </View>
          ) : null}

          {canPost ? (
            <View style={{ marginTop: space.xl }}>
              {replyTo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s }}>
                  <T v="small" tone="muted" style={{ flex: 1 }}>
                    Replying to {replyTo.name}
                  </T>
                  <IconButton icon="x" label="Cancel reply" size={18} onPress={() => setReplyTo(null)} />
                </View>
              ) : null}
              <TextField
                label={replyTo ? 'Your reply' : 'Add to the discussion'}
                value={text}
                onChangeText={setText}
                placeholder="Be specific: cite sections, numbers, or other papers."
                multiline
                maxLength={LIMITS.comment}
              />
              <Button label="Post" icon="send" onPress={post} loading={posting} disabled={!text.trim()} />
              <Pressable onPress={() => nav.navigate('Guidelines')} accessibilityRole="link" style={{ marginTop: space.s }}>
                <T v="caption" tone="muted" style={{ textAlign: 'center' }}>
                  Posts follow the community guidelines.
                </T>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: space.xl, alignItems: 'flex-start', gap: space.s }}>
              {profileLoading ? (
                <T tone="muted">Checking your researcher profile…</T>
              ) : profileLoadError ? (
                <>
                  <T tone="muted">{profileLoadMessage(profileLoadError)}</T>
                  <Button kind="secondary" label="Retry profile check" icon="refresh-cw" onPress={refreshProfile} />
                </>
              ) : (
                <>
                  <T tone="muted">You can read comments while signed in. Create a researcher profile to post or reply.</T>
                  <Button label="Create researcher profile" icon="user-plus" onPress={() => nav.navigate('EditProfile')} />
                </>
              )}
            </View>
          )}
        </View>
      )}

      <Sheet visible={recOpen} title="Recommend this paper" onClose={() => setRecOpen(false)}>
        <T tone="muted" style={{ marginBottom: space.m }}>
          It appears on your profile and in your followers' Following tab. A one-line reason helps them decide.
        </T>
        <TextField label="Why it is worth reading (optional)" value={recNote} onChangeText={setRecNote} maxLength={LIMITS.note} multiline />
        <Button
          label="Recommend"
          icon="award"
          onPress={async () => {
            const me = contributor();
            if (!me) return;
            try {
              await recommend(me, paper, recNote);
              setRecommended(true);
              setRecOpen(false);
              setRecNote('');
              toast('Recommended to your followers.');
            } catch {
              toast('Could not save. Try again.');
            }
          }}
        />
      </Sheet>

      <Sheet visible={shareOpen} title="Share to a circle" onClose={() => setShareOpen(false)}>
        <TextField label="Message (optional)" value={shareNote} onChangeText={setShareNote} maxLength={LIMITS.post} multiline />
        {circles === null ? (
          <T tone="muted">Loading your circles…</T>
        ) : circles.length === 0 ? (
          <View>
            <T tone="muted">You are not in any circle yet.</T>
            <Button
              kind="secondary"
              label="Find or create a circle"
              style={{ marginTop: space.m }}
              onPress={() => {
                setShareOpen(false);
                nav.navigate('Tabs');
              }}
            />
          </View>
        ) : (
          circles.map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`${c.memberUids.length} member${c.memberUids.length === 1 ? '' : 's'}`}
              icon={c.visibility === 'private' ? 'lock' : 'users'}
              onPress={async () => {
                const me = contributor();
                if (!me) return;
                try {
                  await addPost(c.id, me, cleanPostText(shareNote, LIMITS.post) || 'Shared a paper', paper);
                  notePost();
                  setShareOpen(false);
                  setShareNote('');
                  toast(`Shared to ${c.name}.`);
                } catch {
                  toast('Could not share. Try again.');
                }
              }}
            />
          ))
        )}
      </Sheet>

      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} onBlock={blockUser} />
      <ReportSummarySheet paperId={paper.id} visible={summaryReportOpen} onClose={() => setSummaryReportOpen(false)} />
    </Screen>
  );
}
