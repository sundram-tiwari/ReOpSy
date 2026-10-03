import { useEffect, useState } from 'react';
import { useNav } from '../navigation/types';
import { useAuth } from '../hooks/useAuth';
import { useAppState } from '../state/AppState';
import { useCommunity } from '../state/Community';
import { InboxItem, listInbox, markInboxRead } from '../services/community';
import { relativeTime } from '../logic/date';
import { EmptyState, IconButton, ListRow, Screen, T } from '../ui/kit';

const ICONS = { reply: 'message-circle', follow: 'user-plus', circle_join: 'users' } as const;

/** Notifications: replies, follows and circle joins only. Nothing promotional. */
export function InboxScreen() {
  const nav = useNav();
  const { user } = useAuth();
  const { state, markInboxSeen } = useAppState();
  const { refreshUnread } = useCommunity();
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const list = (await listInbox(user.uid)).filter((i) => !state.blockedUids.includes(i.fromUid));
        if (!alive) return;
        setItems(list);
        await markInboxRead(user.uid, list.filter((i) => !i.read).map((i) => i.id));
        markInboxSeen();
        refreshUnread();
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
    // Mark-as-read runs once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const open = (i: InboxItem) => {
    if (i.target.screen === 'Paper') nav.navigate('Paper', { paperId: i.target.id });
    else if (i.target.screen === 'Circle') nav.navigate('Circle', { circleId: i.target.id });
    else nav.navigate('Profile', { uid: i.target.id });
  };

  return (
    <Screen title="Notifications" left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
      {items === null ? (
        <T tone="muted">Loading…</T>
      ) : items.length === 0 ? (
        <EmptyState icon="bell-off" title="No notifications" body="Replies to you, new followers and people joining your circles appear here." />
      ) : (
        items.map((i) => (
          <ListRow
            key={i.id}
            icon={ICONS[i.type] || 'bell'}
            title={i.text}
            subtitle={i.createdAt ? relativeTime(i.createdAt.getTime()) : undefined}
            tone={i.read ? 'muted' : 'ink'}
            onPress={() => open(i)}
          />
        ))
      )}
    </Screen>
  );
}
