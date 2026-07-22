'use client';

import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationBadge() {
  const { unreadCount } = useNotifications();
  return (
    <Link href="/app/notifications" className="relative rounded-full bg-[#F5F5F0] px-3 py-2 text-sm font-semibold text-[#1A1A1A]">
      🔔
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFB800] text-[10px] font-black text-[#1A1A1A]">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </Link>
  );
}
