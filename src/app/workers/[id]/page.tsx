'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicWorkerProfileAction } from '@/server/actions/public-profile.actions';
import { toggleFavoriteWorkerAction, createDisputeAction } from '@/server/actions/profile.actions';
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
import { formatEUR, timeAgo } from '@/lib/utils/format';

export default function PublicWorkerProfilePage() {
  const params = useParams();
  const router = useRouter();

  const workerId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    const result = await getPublicWorkerProfileAction(workerId);

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
  }, [workerId]);

  const handleFavorite = async () => {
    setFavoriteLoading(true);
    const result = await toggleFavoriteWorkerAction(workerId);

    if (result.success && result.data) {
      setData((prev: any) => ({
        ...prev,
        isFavorite: result.data.favorite,
      }));
    }

    setFavoriteLoading(false);
  };

  const handleReport = async () => {
    setReportLoading(true);

    const result = await createDisputeAction({
      reportedUserId: workerId,
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

  const { user, profile, showRating, comments, isFavorite } = data;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar src={user.profile_photo_url} size={72} fallback="W" />

              <div>
                <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
                  {profile.full_name || user.full_name}
                </h1>

                <div className="mt-2 flex flex-wrap gap-2">
                  {user.is_verified && <Badge variant="success">Verificado</Badge>}
                  {profile.is_autonomo && <Badge variant="success">Autónomo ✓</Badge>}
                  {profile.seguro_vigente && <Badge variant="success">Seguro ✓</Badge>}
                  {user.nif && <Badge variant="muted">NIF ✓</Badge>}
                  {!profile.is_active && <Badge variant="danger">No disponible</Badge>}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={isFavorite ? 'primary' : 'outline'}
                loading={favoriteLoading}
                onClick={handleFavorite}
              >
                {isFavorite ? '★ Favorito' : '☆ Favorito'}
              </Button>

              <Button variant="danger" onClick={() => setReportOpen(true)}>
                Reportar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Rating</p>
              <p className="mt-1 text-xl font-black">
                {showRating ? profile.rating.toFixed(1) : 'Nuevo'}
              </p>
              {showRating && <RatingStars value={Math.round(profile.rating)} size="sm" />}
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Trabajos</p>
              <p className="mt-1 text-xl font-black">{profile.total_jobs}</p>
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Tarifa</p>
              <p className="mt-1 text-xl font-black">
                {formatEUR(profile.hourly_rate)}/h
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Profesiones</h2>
          <div className="flex flex-wrap gap-2">
            {profile.professions?.map((profession: string) => (
              <Badge key={profession} variant="muted">
                {profession}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills?.map((skill: string) => (
              <Badge key={skill} variant="default">
                {skill}
              </Badge>
            ))}
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

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar perfil">
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