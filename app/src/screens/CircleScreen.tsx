import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList, useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity, useContributor } from '../state/Community';
import {
  Circle,
  Post,
  addPost,
  addReply,
  deleteCircle,
  deletePost,
  deleteReply,
  getCircle,
  joinCircle,
  leaveCircle,
  listPosts,
  listReplies,
} from '../services/community';
import { Paper } from '../types';
import { cleanText } from '../logic/cardView';
import { LIMITS, cleanPostText, rateLimit } from '../logic/social';
import { relativeTime } from '../logic/date';
import { ReportSheet, ReportTargetInfo } from '../components/ReportSheets';
import { Avatar, Button, Card, Chip, EmptyState, IconButton, ListRow, Screen, Sheet, T, TextField } from '../ui/kit';
import { space } from '../ui/theme';
import { useToast } from '../ui/Toast';

let stamps: number[] = [];

export function CircleScreen() {
  const nav = useNav();
  const route = useRoute<RouteProp<RootStackParamList, 'Circle'>>();
  const { circleId } = route.params;
  const toast = useToast();
  const { user } = useAuth();
  const { me } = useCommunity();
  const { state, blockUser, notePost } = useAppState();
  const contributor = useContributor((s) => nav.navigate(s));

  const [circle, setCircle] = useState<Circle | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<Paper | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openReplies, setOpenReplies] = useState<Record<string, Post[]>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [reportTarget, setReportTarget] = useState<ReportTargetInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await getCircle(circleId);
      setCircle(c);
      if (c && (c.visibility === 'public' || (user && c.memberUids.includes(user.uid)))) setPosts(await listPosts(circleId));
    } catch {
      setCircle(null);
    }
  }, [circleId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const isMember = Boolean(user && circle?.memberUids.includes(user.uid));
  const isOwner = Boolean(user && circle?.ownerUid === user.uid);
  const visiblePosts = useMemo(() => posts.filter((p) => !state.blockedUids.includes(p.uid)), [posts, state.blockedUids]);
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />;

  if (circle === undefined) {
    return (
      <Screen title="Circle" left={back}>
        <T tone="muted">Loading…</T>
      </Screen>
    );
  }
  if (circle === null) {
    return (
      <Screen title="Circle" left={back}>
        <EmptyState icon="slash" title="Circle not found" body="It may have been deleted, or the code is wrong." />
      </Screen>
    );
  }

  const send = async () => {
    const author = contributor();
    if (!author) return;
    const clean = cleanPostText(text, LIMITS.post) || (attach ? 'Shared a paper' : null);
    if (!clean) return;
    const next = rateLimit(stamps, Date.now());
    if (!next) return toast('You are posting quickly. Wait a moment.');
    stamps = next;
    setBusy(true);
    try {
      await addPost(circle.id, author, clean, attach);
      setText('');
      setAttach(null);
      notePost();
      setPosts(await listPosts(circle.id));
    } catch {
      toast('Could not post. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleReplies = async (p: Post) => {
    if (openReplies[p.id]) {
      setOpenReplies((r) => {
        const next = { ...r };
        delete next[p.id];
        return next;
      });
      return;
    }
    try {
      const list = await listReplies(circle.id, p.id);
      setOpenReplies((r) => ({ ...r, [p.id]: list }));
    } catch {
      toast('Could not load replies.');
    }
  };

  const sendReply = async (p: Post) => {
    const author = contributor();
    if (!author) return;
    const clean = cleanPostText(replyText[p.id] || '', LIMITS.comment);
    if (!clean) return;
    try {
      await addReply(circle.id, p, author, clean);
      setReplyText((r) => ({ ...r, [p.id]: '' }));
      const list = await listReplies(circle.id, p.id);
      setOpenReplies((r) => ({ ...r, [p.id]: list }));
    } catch {
      toast('Could not reply. Try again.');
    }
  };

  const share = async () => {
    await Clipboard.setStringAsync(circle.id);
    Share.share({
      message: `Join "${circle.name}" on ReOpSy. In Community > Join with code, paste: ${circle.id}`,
    }).catch(() => {});
    toast('Invite code copied.');
  };

  const library = state.library;

  return (
    <Screen title={circle.name} left={back} right={<IconButton icon="more-horizontal" label="Circle options" onPress={() => setMenuOpen(true)} />}>
      <T tone="muted">{circle.description || 'No description.'}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s }}>
        <Chip label={`${circle.memberUids.length} member${circle.memberUids.length === 1 ? '' : 's'}`} icon="users" />
        <Chip label={circle.visibility === 'private' ? 'Private' : 'Public'} icon={circle.visibility === 'private' ? 'lock' : 'globe'} />
      </View>

      {!isMember ? (
        <Card style={{ marginTop: space.l }}>
          <T>Join to post and reply. You can leave any time.</T>
          <Button
            label="Join circle"
            style={{ marginTop: space.m }}
            onPress={async () => {
              const author = contributor();
              if (!author) return;
              try {
                await joinCircle(circle, author);
                await load();
              } catch {
                toast('Could not join. Try again.');
              }
            }}
          />
        </Card>
      ) : (
        <View style={{ marginTop: space.l }}>
          <TextField label="Post to the circle" value={text} onChangeText={setText} multiline maxLength={LIMITS.post} placeholder="A question, a paper worth reading, a meeting note…" />
          {attach ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s }}>
              <Chip label={cleanText(attach.headline || attach.originalTitle)} icon="file-text" selected />
              <IconButton icon="x" label="Remove attached paper" size={18} onPress={() => setAttach(null)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button kind="secondary" icon="paperclip" label="Attach paper" onPress={() => setPickOpen(true)} style={{ flex: 1 }} />
            <Button icon="send" label="Post" onPress={send} loading={busy} disabled={!text.trim() && !attach} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <View style={{ marginTop: space.xl, gap: space.m }}>
        {visiblePosts.length === 0 ? (
          <T tone="muted">No posts yet. Start with the paper you are reading this week.</T>
        ) : (
          visiblePosts.map((p) => {
            const mine = user?.uid === p.uid;
            const replies = openReplies[p.id];
            return (
              <Card key={p.id}>
                <Pressable onPress={() => nav.navigate('Profile', { uid: p.uid })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Avatar name={p.name} size={32} />
                  <T v="small" tone="muted" style={{ flex: 1 }}>
                    <T v="small" style={{ fontWeight: '600' }}>{p.name}</T> @{p.handle}
                    {p.createdAt ? ` · ${relativeTime(p.createdAt.getTime())}` : ''}
                  </T>
                </Pressable>
                <T selectable style={{ marginTop: space.s }}>{p.text}</T>
                {p.paper ? (
                  <Pressable onPress={() => nav.navigate('Paper', { paperId: p.paper!.id, ref: p.paper! })} accessibilityRole="button" style={{ marginTop: space.s }}>
                    <Chip label={p.paper.title} icon="file-text" tone="accent" />
                  </Pressable>
                ) : null}
                <View style={{ flexDirection: 'row', gap: space.l, marginTop: space.m }}>
                  <Pressable onPress={() => toggleReplies(p)} accessibilityRole="button" hitSlop={8}>
                    <T v="caption" tone="accent" style={{ fontWeight: '600' }}>{replies ? 'Hide replies' : 'Replies'}</T>
                  </Pressable>
                  {mine || isOwner ? (
                    <Pressable
                      onPress={async () => {
                        try {
                          await deletePost(circle.id, p.id);
                          setPosts((list) => list.filter((x) => x.id !== p.id));
                        } catch {
                          toast('Could not delete.');
                        }
                      }}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <T v="caption" tone="muted">Delete</T>
                    </Pressable>
                  ) : null}
                  {!mine ? (
                    <Pressable onPress={() => setReportTarget({ type: 'post', path: `circles/${circle.id}/posts/${p.id}`, uid: p.uid, name: p.name })} accessibilityRole="button" hitSlop={8}>
                      <T v="caption" tone="muted">Report</T>
                    </Pressable>
                  ) : null}
                </View>
                {replies ? (
                  <View style={{ marginTop: space.m, paddingLeft: space.m, gap: space.s }}>
                    {replies
                      .filter((r) => !state.blockedUids.includes(r.uid))
                      .map((r) => (
                        <View key={r.id}>
                          <T v="small" tone="muted">
                            <T v="small" style={{ fontWeight: '600' }}>{r.name}</T>
                            {r.createdAt ? ` · ${relativeTime(r.createdAt.getTime())}` : ''}
                          </T>
                          <T selectable>{r.text}</T>
                          {user?.uid === r.uid || user?.uid === p.uid || isOwner ? (
                            <Pressable
                              onPress={async () => {
                                await deleteReply(circle.id, p.id, r.id).catch(() => toast('Could not delete.'));
                                setOpenReplies((o) => ({ ...o, [p.id]: (o[p.id] || []).filter((x) => x.id !== r.id) }));
                              }}
                              accessibilityRole="button"
                              hitSlop={8}
                            >
                              <T v="caption" tone="muted">Delete</T>
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => setReportTarget({ type: 'reply', path: `circles/${circle.id}/posts/${p.id}/replies/${r.id}`, uid: r.uid, name: r.name })} accessibilityRole="button" hitSlop={8}>
                              <T v="caption" tone="muted">Report</T>
                            </Pressable>
                          )}
                        </View>
                      ))}
                    {isMember ? (
                      <View>
                        <TextField label="Reply" value={replyText[p.id] || ''} onChangeText={(v) => setReplyText((r) => ({ ...r, [p.id]: v }))} maxLength={LIMITS.comment} />
                        <Button kind="secondary" label="Send reply" onPress={() => sendReply(p)} disabled={!(replyText[p.id] || '').trim()} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </View>

      <Sheet visible={pickOpen} title="Attach a paper from your library" onClose={() => setPickOpen(false)}>
        {library.length === 0 ? (
          <T tone="muted">Your library is empty. Save papers in Today first.</T>
        ) : (
          library.map((e) => (
            <ListRow
              key={e.paper.id}
              title={cleanText(e.paper.headline || e.paper.originalTitle)}
              subtitle={e.status === 'survey' ? 'In survey' : e.status === 'later' ? 'Read later' : 'Saved'}
              onPress={() => {
                setAttach(e.paper);
                setPickOpen(false);
              }}
            />
          ))
        )}
      </Sheet>

      <Sheet visible={menuOpen} title={circle.name} onClose={() => setMenuOpen(false)}>
        <View style={{ gap: space.s }}>
          {isMember ? <Button kind="secondary" icon="user-plus" label="Invite people (copy code)" onPress={share} /> : null}
          {isMember && !isOwner ? (
            <Button
              kind="secondary"
              icon="log-out"
              label="Leave circle"
              onPress={async () => {
                if (!user) return;
                await leaveCircle(circle.id, user.uid).catch(() => toast('Could not leave.'));
                setMenuOpen(false);
                nav.goBack();
              }}
            />
          ) : null}
          {isOwner ? (
            <Button
              kind="danger"
              icon="trash-2"
              label="Delete circle and all posts"
              onPress={async () => {
                try {
                  await deleteCircle(circle.id);
                  setMenuOpen(false);
                  toast('Circle deleted.');
                  nav.goBack();
                } catch {
                  toast('Could not delete the circle.');
                }
              }}
            />
          ) : (
            <Button
              kind="ghost"
              icon="flag"
              label="Report this circle"
              onPress={() => {
                setMenuOpen(false);
                setReportTarget({ type: 'circle', path: `circles/${circle.id}`, uid: circle.ownerUid, name: 'the owner' });
              }}
            />
          )}
          {me ? null : <T v="small" tone="muted">Create a profile to post here.</T>}
        </View>
      </Sheet>

      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} onBlock={blockUser} />
    </Screen>
  );
}
