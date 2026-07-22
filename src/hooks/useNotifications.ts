'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { markNotificationReadAction } from '@/server/actions/notifications.actions';
import type { AppNotification } from '@/types/core';

export function useNotifications() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('notifications').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    const { count } = await supabase
      .from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).is('read_at', null);
    setUnreadCount(count ?? 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase.channel(`notifications-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => fetchNotifications())
        .subscribe();
    }
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchNotifications, supabase]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await markNotificationReadAction(notificationId);
    await fetchNotifications();
  }, [fetchNotifications]);

  return { notifications, unreadCount, loading, refresh: fetchNotifications, markAsRead };
}
