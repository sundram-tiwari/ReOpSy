import {
  Firestore,
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  DocumentReference,
} from 'firebase/firestore';
import { db } from './firebase';
import { Paper } from '../types';
import { paperKey } from '../logic/cardView';
import { LIMITS, ReportReason, SummaryReportReason } from '../logic/social';

/**
 * Research community on Firestore. Every write here has a matching rule in
 * app/firestore.rules; the rules are the real enforcement, these functions
 * only shape valid writes and friendly errors.
 *
 * Author name and handle are copied onto content so a feed renders without
 * one profile read per item.
 */

export interface Author {
  uid: string;
  name: string;
  handle: string;
}

export interface Profile extends Author {
  role: string;
  affiliation: string;
  bio: string;
  interests: string[];
  orcid: string;
  createdAt: Date | null;
}

export interface PaperRef {
  id: string;
  title: string;
  url: string;
  topic: string;
}

export interface Comment extends Author {
  id: string;
  text: string;
  parentId: string | null;
  helpfulCount: number;
  createdAt: Date | null;
}

export interface Recommendation extends Author {
  id: string;
  paper: PaperRef;
  note: string;
  createdAt: Date | null;
}

export interface Circle {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  ownerUid: string;
  memberUids: string[];
  topic: string;
  lastActivityAt: Date | null;
}

export interface Post extends Author {
  id: string;
  text: string;
  paper: PaperRef | null;
  createdAt: Date | null;
}

export type InboxType = 'reply' | 'follow' | 'circle_join';

export interface InboxItem {
  id: string;
  type: InboxType;
  fromUid: string;
  fromName: string;
  text: string;
  target: { screen: 'Paper' | 'Circle' | 'Profile'; id: string };
  read: boolean;
  createdAt: Date | null;
}

export class CommunityError extends Error {}

function store(): Firestore {
  if (!db) throw new CommunityError('Community features need an internet connection and a configured server.');
  return db;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

export function paperRef(p: Paper): PaperRef {
  return { id: p.id, title: (p.headline || p.originalTitle).slice(0, 300), url: p.url, topic: p.topics?.[0] || '' };
}

// ---------------------------------------------------------------- profiles

function profileFrom(id: string, d: Record<string, any>): Profile {
  return {
    uid: id,
    name: d.name || 'Researcher',
    handle: d.handle || '',
    role: d.role || '',
    affiliation: d.affiliation || '',
    bio: d.bio || '',
    interests: Array.isArray(d.interests) ? d.interests : [],
    orcid: d.orcid || '',
    createdAt: toDate(d.createdAt),
  };
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(store(), 'profiles', uid));
  return snap.exists() ? profileFrom(snap.id, snap.data()) : null;
}

export interface ProfileInput {
  name: string;
  handle: string;
  role: string;
  affiliation: string;
  bio: string;
  interests: string[];
  orcid: string;
}

/**
 * Creates the profile (claiming the handle) or updates it. The handle is
 * fixed after creation so links and mentions stay stable.
 */
export async function saveProfile(uid: string, input: ProfileInput, isNew: boolean): Promise<void> {
  const fs = store();
  const fields = {
    name: input.name.trim().slice(0, LIMITS.name),
    role: input.role.trim().slice(0, LIMITS.role),
    affiliation: input.affiliation.trim().slice(0, LIMITS.affiliation),
    bio: input.bio.trim().slice(0, LIMITS.bio),
    interests: input.interests.slice(0, LIMITS.interests),
    orcid: input.orcid,
    updatedAt: serverTimestamp(),
  };
  if (!isNew) {
    await updateDoc(doc(fs, 'profiles', uid), fields);
    return;
  }
  const handleRef = doc(fs, 'handles', input.handle);
  if ((await getDoc(handleRef)).exists()) throw new CommunityError('That handle is taken. Try another.');
  const batch = writeBatch(fs);
  batch.set(handleRef, { uid, createdAt: serverTimestamp() });
  batch.set(doc(fs, 'profiles', uid), {
    ...fields,
    uid,
    handle: input.handle,
    acceptedTermsAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function searchPeople(prefix: string): Promise<Profile[]> {
  const p = prefix.trim().toLowerCase().replace(/^@/, '');
  if (p.length < 2) return [];
  const snap = await getDocs(
    query(collection(store(), 'profiles'), where('handle', '>=', p), where('handle', '<=', `${p}`), limit(10)),
  );
  return snap.docs.map((d) => profileFrom(d.id, d.data()));
}

export async function suggestPeople(interests: string[], myUid: string): Promise<Profile[]> {
  if (interests.length === 0) return [];
  const snap = await getDocs(
    query(collection(store(), 'profiles'), where('interests', 'array-contains-any', interests.slice(0, 10)), limit(25)),
  );
  return snap.docs.map((d) => profileFrom(d.id, d.data())).filter((p) => p.uid !== myUid);
}

// ----------------------------------------------------------------- follows

const followId = (follower: string, followee: string) => `${follower}_${followee}`;

export async function isFollowing(me: string, them: string): Promise<boolean> {
  return (await getDoc(doc(store(), 'follows', followId(me, them)))).exists();
}

export async function follow(me: Author, them: string): Promise<void> {
  await setDoc(doc(store(), 'follows', followId(me.uid, them)), {
    follower: me.uid,
    followee: them,
    createdAt: serverTimestamp(),
  });
  await notify(them, me, 'follow', `${me.name} followed you`, { screen: 'Profile', id: me.uid });
}

export async function unfollow(me: string, them: string): Promise<void> {
  await deleteDoc(doc(store(), 'follows', followId(me, them)));
}

export async function listFollowing(uid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(store(), 'follows'), where('follower', '==', uid), limit(300)));
  return snap.docs.map((d) => d.data().followee as string);
}

export async function followCounts(uid: string): Promise<{ followers: number; following: number }> {
  const fs = store();
  const [a, b] = await Promise.all([
    getCountFromServer(query(collection(fs, 'follows'), where('followee', '==', uid))),
    getCountFromServer(query(collection(fs, 'follows'), where('follower', '==', uid))),
  ]);
  return { followers: a.data().count, following: b.data().count };
}

// --------------------------------------------------------- recommendations

const recId = (uid: string, paperId: string) => `${uid}_${paperKey(paperId)}`;

function recFrom(id: string, d: Record<string, any>): Recommendation {
  return { id, uid: d.uid, name: d.name, handle: d.handle, paper: d.paper, note: d.note || '', createdAt: toDate(d.createdAt) };
}

export async function hasRecommended(uid: string, paperId: string): Promise<boolean> {
  return (await getDoc(doc(store(), 'recommendations', recId(uid, paperId)))).exists();
}

export async function recommend(me: Author, paper: Paper, note: string): Promise<void> {
  await setDoc(doc(store(), 'recommendations', recId(me.uid, paper.id)), {
    uid: me.uid,
    name: me.name,
    handle: me.handle,
    paper: paperRef(paper),
    note: note.trim().slice(0, LIMITS.note),
    createdAt: serverTimestamp(),
  });
}

export async function unrecommend(uid: string, paperId: string): Promise<void> {
  await deleteDoc(doc(store(), 'recommendations', recId(uid, paperId)));
}

export async function recommendationsBy(uid: string): Promise<Recommendation[]> {
  const snap = await getDocs(
    query(collection(store(), 'recommendations'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30)),
  );
  return snap.docs.map((d) => recFrom(d.id, d.data()));
}

/** Recommendations from people you follow in the last `days` days, newest first. */
export async function followingFeed(uids: string[], days = 14): Promise<Recommendation[]> {
  if (uids.length === 0) return [];
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  const results = await Promise.all(
    chunks.map((ids) =>
      getDocs(
        query(
          collection(store(), 'recommendations'),
          where('uid', 'in', ids),
          where('createdAt', '>=', since),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      ),
    ),
  );
  return results
    .flatMap((s) => s.docs.map((d) => recFrom(d.id, d.data())))
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}

// ------------------------------------------------------ paper discussions

function commentFrom(id: string, d: Record<string, any>): Comment {
  return {
    id,
    uid: d.uid,
    name: d.name,
    handle: d.handle,
    text: d.text,
    parentId: d.parentId || null,
    helpfulCount: typeof d.helpfulCount === 'number' ? d.helpfulCount : 0,
    createdAt: toDate(d.createdAt),
  };
}

export async function listComments(paperId: string): Promise<Comment[]> {
  const snap = await getDocs(
    query(collection(store(), 'papers', paperKey(paperId), 'comments'), orderBy('createdAt', 'asc'), limit(200)),
  );
  return snap.docs.map((d) => commentFrom(d.id, d.data()));
}

export async function addComment(
  me: Author,
  paper: Paper,
  text: string,
  replyTo: { id: string; uid: string } | null,
): Promise<void> {
  const fs = store();
  const key = paperKey(paper.id);
  // A small public index document so discussions can be listed later.
  await setDoc(doc(fs, 'papers', key), { paper: paperRef(paper), updatedAt: serverTimestamp() }, { merge: true });
  await addDoc(collection(fs, 'papers', key, 'comments'), {
    uid: me.uid,
    name: me.name,
    handle: me.handle,
    text: text.slice(0, LIMITS.comment),
    parentId: replyTo ? replyTo.id : null,
    helpfulCount: 0,
    createdAt: serverTimestamp(),
  });
  if (replyTo && replyTo.uid !== me.uid) {
    await notify(replyTo.uid, me, 'reply', `${me.name} replied to your comment`, { screen: 'Paper', id: paper.id });
  }
}

export async function deleteComment(paperId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(store(), 'papers', paperKey(paperId), 'comments', commentId));
}

/** IDs of comments on this paper that `uid` marked helpful. */
export async function myHelpful(paperId: string, uid: string): Promise<Set<string>> {
  const snap = await getDocs(query(collection(store(), 'papers', paperKey(paperId), 'helpful'), where('uid', '==', uid)));
  return new Set(snap.docs.map((d) => d.data().commentId as string));
}

/**
 * Toggles one "Helpful" mark. The mark and the counter change in one batch;
 * the rules only allow the counter to move by one alongside a matching mark.
 */
export async function setHelpful(uid: string, paperId: string, commentId: string, on: boolean): Promise<void> {
  const fs = store();
  const key = paperKey(paperId);
  const batch = writeBatch(fs);
  const mark = doc(fs, 'papers', key, 'helpful', `${uid}_${commentId}`);
  if (on) batch.set(mark, { uid, commentId, createdAt: serverTimestamp() });
  else batch.delete(mark);
  batch.update(doc(fs, 'papers', key, 'comments', commentId), { helpfulCount: increment(on ? 1 : -1) });
  await batch.commit();
}

// ----------------------------------------------------------------- circles

function circleFrom(id: string, d: Record<string, any>): Circle {
  return {
    id,
    name: d.name,
    description: d.description || '',
    visibility: d.visibility === 'private' ? 'private' : 'public',
    ownerUid: d.ownerUid,
    memberUids: Array.isArray(d.memberUids) ? d.memberUids : [],
    topic: d.topic || '',
    lastActivityAt: toDate(d.lastActivityAt),
  };
}

export async function createCircle(
  me: Author,
  input: { name: string; description: string; visibility: 'public' | 'private'; topic: string },
): Promise<string> {
  // Firestore's auto IDs are random enough to double as private invite codes.
  const ref = doc(collection(store(), 'circles'));
  await setDoc(ref, {
    name: input.name.trim().slice(0, LIMITS.circleName),
    description: input.description.trim().slice(0, LIMITS.circleDescription),
    visibility: input.visibility,
    topic: input.topic,
    ownerUid: me.uid,
    memberUids: [me.uid],
    createdAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getCircle(id: string): Promise<Circle | null> {
  const snap = await getDoc(doc(store(), 'circles', id.trim()));
  return snap.exists() ? circleFrom(snap.id, snap.data()) : null;
}

export async function myCircles(uid: string): Promise<Circle[]> {
  const snap = await getDocs(
    query(collection(store(), 'circles'), where('memberUids', 'array-contains', uid), orderBy('lastActivityAt', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => circleFrom(d.id, d.data()));
}

export async function publicCircles(): Promise<Circle[]> {
  const snap = await getDocs(
    query(collection(store(), 'circles'), where('visibility', '==', 'public'), orderBy('lastActivityAt', 'desc'), limit(30)),
  );
  return snap.docs.map((d) => circleFrom(d.id, d.data()));
}

export async function joinCircle(circle: Circle, me: Author): Promise<void> {
  await updateDoc(doc(store(), 'circles', circle.id), { memberUids: arrayUnion(me.uid) });
  if (circle.ownerUid !== me.uid) {
    await notify(circle.ownerUid, me, 'circle_join', `${me.name} joined ${circle.name}`, { screen: 'Circle', id: circle.id });
  }
}

export async function leaveCircle(circleId: string, uid: string): Promise<void> {
  await updateDoc(doc(store(), 'circles', circleId), { memberUids: arrayRemove(uid) });
}

async function deleteAll(refs: DocumentReference[]): Promise<void> {
  const fs = store();
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(fs);
    for (const r of refs.slice(i, i + 400)) batch.delete(r);
    await batch.commit();
  }
}

/** Owner only: removes the circle, its posts and their replies. */
export async function deleteCircle(circleId: string): Promise<void> {
  const fs = store();
  const posts = await getDocs(collection(fs, 'circles', circleId, 'posts'));
  for (const p of posts.docs) {
    const replies = await getDocs(collection(fs, 'circles', circleId, 'posts', p.id, 'replies'));
    await deleteAll(replies.docs.map((r) => r.ref));
  }
  await deleteAll(posts.docs.map((p) => p.ref));
  await deleteDoc(doc(fs, 'circles', circleId));
}

function postFrom(id: string, d: Record<string, any>): Post {
  return { id, uid: d.uid, name: d.name, handle: d.handle, text: d.text, paper: d.paper || null, createdAt: toDate(d.createdAt) };
}

export async function listPosts(circleId: string): Promise<Post[]> {
  const snap = await getDocs(
    query(collection(store(), 'circles', circleId, 'posts'), orderBy('createdAt', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => postFrom(d.id, d.data()));
}

export async function addPost(circleId: string, me: Author, text: string, paper: Paper | null): Promise<void> {
  const fs = store();
  await addDoc(collection(fs, 'circles', circleId, 'posts'), {
    uid: me.uid,
    name: me.name,
    handle: me.handle,
    text: text.slice(0, LIMITS.post),
    paper: paper ? paperRef(paper) : null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(fs, 'circles', circleId), { lastActivityAt: serverTimestamp() });
}

export async function deletePost(circleId: string, postId: string): Promise<void> {
  const fs = store();
  const replies = await getDocs(collection(fs, 'circles', circleId, 'posts', postId, 'replies'));
  await deleteAll(replies.docs.map((r) => r.ref));
  await deleteDoc(doc(fs, 'circles', circleId, 'posts', postId));
}

export async function listReplies(circleId: string, postId: string): Promise<Post[]> {
  const snap = await getDocs(
    query(collection(store(), 'circles', circleId, 'posts', postId, 'replies'), orderBy('createdAt', 'asc'), limit(100)),
  );
  return snap.docs.map((d) => postFrom(d.id, d.data()));
}

export async function addReply(circleId: string, post: Post, me: Author, text: string): Promise<void> {
  await addDoc(collection(store(), 'circles', circleId, 'posts', post.id, 'replies'), {
    uid: me.uid,
    name: me.name,
    handle: me.handle,
    text: text.slice(0, LIMITS.comment),
    paper: null,
    createdAt: serverTimestamp(),
  });
  if (post.uid !== me.uid) {
    await notify(post.uid, me, 'reply', `${me.name} replied to your post`, { screen: 'Circle', id: circleId });
  }
}

export async function deleteReply(circleId: string, postId: string, replyId: string): Promise<void> {
  await deleteDoc(doc(store(), 'circles', circleId, 'posts', postId, 'replies', replyId));
}

// ----------------------------------------------------------------- reports

export type ReportTarget = 'comment' | 'post' | 'reply' | 'profile' | 'circle';

export async function reportContent(input: {
  reporterUid: string;
  targetType: ReportTarget;
  targetPath: string;
  targetUid: string;
  reason: ReportReason;
  note: string;
}): Promise<void> {
  await addDoc(collection(store(), 'reports'), {
    ...input,
    note: input.note.trim().slice(0, LIMITS.reportNote),
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

/** Reports an AI summary. Works signed out, so every reader can flag errors. */
export async function reportSummary(input: { paperId: string; reason: SummaryReportReason; note: string; uid: string | null }) {
  await addDoc(collection(store(), 'summary_reports'), {
    paperId: input.paperId.slice(0, 200),
    reason: input.reason,
    note: input.note.trim().slice(0, LIMITS.reportNote),
    uid: input.uid,
    createdAt: serverTimestamp(),
  });
}

export interface ReportRecord {
  id: string;
  targetType: ReportTarget;
  targetPath: string;
  targetUid: string;
  reason: string;
  note: string;
  createdAt: Date | null;
}

export async function openReports(): Promise<ReportRecord[]> {
  const snap = await getDocs(
    query(collection(store(), 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, targetType: x.targetType, targetPath: x.targetPath, targetUid: x.targetUid, reason: x.reason, note: x.note || '', createdAt: toDate(x.createdAt) };
  });
}

/** Moderator action: delete the reported document (if still there) and close the report. */
export async function resolveReport(report: ReportRecord, removeContent: boolean): Promise<void> {
  const fs = store();
  if (removeContent) {
    const ref = doc(fs, report.targetPath);
    if ((await getDoc(ref)).exists()) await deleteDoc(ref);
  }
  await updateDoc(doc(fs, 'reports', report.id), { status: removeContent ? 'removed' : 'dismissed' });
}

// ------------------------------------------------------------------- inbox

async function notify(toUid: string, from: Author, type: InboxType, text: string, target: InboxItem['target']) {
  if (toUid === from.uid) return;
  try {
    await addDoc(collection(store(), 'inbox', toUid, 'items'), {
      type,
      fromUid: from.uid,
      fromName: from.name.slice(0, LIMITS.name),
      text: text.slice(0, 140),
      target,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // A failed notification must never fail the action that caused it.
  }
}

export async function listInbox(uid: string): Promise<InboxItem[]> {
  const snap = await getDocs(query(collection(store(), 'inbox', uid, 'items'), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, type: x.type, fromUid: x.fromUid, fromName: x.fromName, text: x.text, target: x.target, read: Boolean(x.read), createdAt: toDate(x.createdAt) };
  });
}

export async function markInboxRead(uid: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const fs = store();
  const batch = writeBatch(fs);
  for (const id of ids.slice(0, 400)) batch.update(doc(fs, 'inbox', uid, 'items', id), { read: true });
  await batch.commit();
}

export async function hasUnread(uid: string): Promise<boolean> {
  const snap = await getDocs(query(collection(store(), 'inbox', uid, 'items'), where('read', '==', false), limit(1)));
  return !snap.empty;
}

// -------------------------------------------------------- account deletion

/**
 * Deletes everything the user created: comments, helpful marks, posts,
 * replies, follows, recommendations, owned circles, inbox, profile, handle
 * and synced library. Required by Play's account-deletion policy and the
 * DPDP Act's erasure right. Call before deleting the auth account.
 */
export async function deleteMyData(uid: string, handle: string | null): Promise<void> {
  const fs = store();
  const byUid = (group: string) => getDocs(query(collectionGroup(fs, group), where('uid', '==', uid)));

  const [comments, helpful, posts, replies, recs] = await Promise.all([
    byUid('comments'),
    byUid('helpful'),
    byUid('posts'),
    byUid('replies'),
    getDocs(query(collection(fs, 'recommendations'), where('uid', '==', uid))),
  ]);
  // Each helpful mark is removed together with its counter, as the rules require.
  for (const mark of helpful.docs) {
    const paperDoc = mark.ref.parent.parent;
    const commentId = mark.data().commentId as string;
    const batch = writeBatch(fs);
    batch.delete(mark.ref);
    if (paperDoc) {
      const commentRef = doc(fs, paperDoc.path, 'comments', commentId);
      if ((await getDoc(commentRef)).exists()) batch.update(commentRef, { helpfulCount: increment(-1) });
    }
    await batch.commit();
  }
  await deleteAll([...comments.docs, ...replies.docs].map((d) => d.ref));
  for (const p of posts.docs) {
    const sub = await getDocs(collection(p.ref, 'replies'));
    await deleteAll(sub.docs.map((r) => r.ref));
  }
  await deleteAll([...posts.docs, ...recs.docs].map((d) => d.ref));

  const [following, followers] = await Promise.all([
    getDocs(query(collection(fs, 'follows'), where('follower', '==', uid))),
    getDocs(query(collection(fs, 'follows'), where('followee', '==', uid))),
  ]);
  await deleteAll([...following.docs, ...followers.docs].map((d) => d.ref));

  const circles = await myCircles(uid);
  for (const c of circles) {
    if (c.ownerUid === uid) await deleteCircle(c.id);
    else await leaveCircle(c.id, uid);
  }

  const inbox = await getDocs(collection(fs, 'inbox', uid, 'items'));
  await deleteAll(inbox.docs.map((d) => d.ref));

  const batch = writeBatch(fs);
  if (handle) batch.delete(doc(fs, 'handles', handle));
  batch.delete(doc(fs, 'profiles', uid));
  batch.delete(doc(fs, 'users', uid));
  await batch.commit();
}
