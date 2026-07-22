'use client';

import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { Button, Card, EmptyState, FullLoader } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/date';

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, loading, markAsRead } = useNotifications();

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Button variant="ghost" onClick={() => router.back()}>
            ← Volver
          </Button>
          <h1 className="text-lg font-black">Notificaciones</h1>
          <span />
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {loading && <FullLoader />}

        {!loading && notifications.length === 0 && (
          <EmptyState
            title="Sin notificaciones"
            description="Aquí verás novedades de turnos, aplicaciones y valoraciones."
          />
        )}

        {notifications.map(notification => (
          <Card
            key={notification.id}
            onClick={() => {
              if (!notification.read_at) {
                markAsRead(notification.id);
              }

              if (notification.data?.shiftId) {
                router.push(`/app/worker/shifts/${notification.data.shiftId}`);
              }
            }}
            className={notification.read_at ? 'opacity-70' : 'border-[#FFB800]/30'}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{notification.title}</p>
                <p className="mt-1 text-sm text-[#8B8B8B]">{notification.body}</p>
                <p className="mt-2 text-xs text-[#8B8B8B]">
                  {formatDateTime(notification.created_at)}
                </p>
              </div>

              {!notification.read_at && (
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FFB800]" />
              )}
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}