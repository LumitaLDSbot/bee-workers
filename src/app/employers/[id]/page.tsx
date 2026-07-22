'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicEmployerProfileAction } from '@/server/actions/public-profile.actions';
import { createDisputeAction } from '@/server/actions/profile.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  FullLoader,
  Modal,
  RatingStars,
  Textarea,
} from '@/components/ui';
import { timeAgo } from '@/lib/utils/format';

export default function PublicEmployerProfilePage() {
  const params = useParams();
  const router = useRouter();

  const employerId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    const result = await getPublicEmployerProfileAction(employerId);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setData(result.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [employerId]);

  const handleReport = async () => {
    setReportLoading(true);

    const result = await createDisputeAction({
      reportedUserId: employerId,
      reason: reportReason,
    });

    setReportLoading(false);

    if (result.success) {
      setReportOpen(false);
      setReportReason('');
      alert('Reporte enviado. Gracias.');
    } else {
      alert(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando perfil..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Perfil no disponible'} retry={load} />
        </div>
      </div>
    );
  }

  const { user, profile, showRating, comments } = data;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar src={profile.logo_url || user.profile_photo_url} size={72} fallback="E" />

              <div>
                <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
                  {profile.company_name}
                </h1>

                <div className="mt-2 flex flex-wrap gap-2">
                  {user.is_verified && <Badge variant="success">Verificado</Badge>}
                  {profile.nif_empresa && <Badge variant="muted">NIF empresa ✓</Badge>}
                </div>
              </div>
            </div>

            <Button variant="danger" onClick={() => setReportOpen(true)}>
              Reportar
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Rating</p>
              <p className="mt-1 text-xl font-black">
                {showRating ? profile.rating.toFixed(1) : 'Nuevo'}
              </p>
              {showRating && <RatingStars value={Math.round(profile.rating)} size="sm" />}
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                Turnos completados
              </p>
              <p className="mt-1 text-xl font-black">{profile.total_shifts}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm dark:bg-neutral-800">
            <p className="text-[#8B8B8B] dark:text-neutral-400">Dirección</p>
            <p className="mt-1 font-medium">{profile.address || 'Porto'}</p>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Comentarios recientes</h2>

          {!showRating ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Este perfil aún no tiene suficientes valoraciones públicas.
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Sin comentarios públicos.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment: any, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-black/5 p-4 dark:border-white/10"
                >
                  <RatingStars value={comment.stars} size="sm" />
                  {comment.comment && (
                    <p className="mt-2 text-sm text-[#1A1A1A] dark:text-neutral-200">
                      {comment.comment}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[#8B8B8B] dark:text-neutral-500">
                    {timeAgo(comment.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar empresa">
        <div className="space-y-4">
          <Textarea
            label="Motivo del reporte"
            rows={5}
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="Describe el problema..."
          />

          <Button
            className="w-full"
            loading={reportLoading}
            disabled={reportReason.trim().length < 10}
            onClick={handleReport}
          >
            Enviar reporte
          </Button>
        </div>
      </Modal>
    </div>
  );
}