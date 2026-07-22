'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { cn } from '@/lib/utils/cn';

export function WorkerNav() {
  const pathname = usePathname();
  const items = [
    { href: '/app/worker', label: 'Feed' },
    { href: '/app/worker/applications', label: 'Aplicaciones' },
    { href: '/app/worker/ratings', label: 'Ratings' },
  ];
  return (
    <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/app/worker" className="text-lg font-black">Bee<span className="text-[#FFB800]">Workers</span></Link>
        <div className="flex items-center gap-2"><NotificationBadge /></div>
      </div>
      <div className="mx-auto flex max-w-md gap-2 px-4 pb-3">
        {items.map(item => (
          <Link key={item.href} href={item.href} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition', pathname === item.href ? 'bg-[#FFB800] text-[#1A1A1A]' : 'bg-[#F5F5F0] text-[#8B8B8B]')}>{item.label}</Link>
        ))}
      </div>
    </div>
  );
}

export function EmployerNav() {
  const pathname = usePathname();
  const items = [
    { href: '/app/employer/shifts', label: 'Mis turnos' },
    { href: '/app/employer/shifts/new', label: 'Publicar' },
  ];
  return (
    <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/app/employer/shifts" className="text-lg font-black">Bee<span className="text-[#FFB800]">Workers</span></Link>
        <NotificationBadge />
      </div>
      <div className="mx-auto flex max-w-md gap-2 px-4 pb-3">
        {items.map(item => (
          <Link key={item.href} href={item.href} className={cn('rounded-full px-4 py-2 text-sm font-semibold transition', pathname === item.href ? 'bg-[#FFB800] text-[#1A1A1A]' : 'bg-[#F5F5F0] text-[#8B8B8B]')}>{item.label}</Link>
        ))}
      </div>
    </div>
  );
}
