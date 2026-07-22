'use client';

import { useState } from 'react';
import { usePendingRatings } from '@/hooks/useRatings';
import { WorkerNav } from '@/components/layout/AppNav';
import {
  Button,
  Card,
  EmptyState,
  FullLoader,
  ErrorState,
  Modal,
  RatingStars,
  Textarea,
} from '@/components/ui';
import type { PendingRating } from '@/types/core';

export default function WorkerRatingsPage() {
  const { pendingRatings, loading, error, refresh, submitRating } =
    usePendingRatings();

  const [selected, setSelected] = useState<PendingRating | null>(null);
  const [stars, setStars] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selected) return;

    setSubmitting(true);
    setSubmitError(null);

    const result = await submitRating({
      pendingRatingId: selected.id,
      shiftId: selected.shift_id,
      rateeId: selected.ratee_id,
      type: selected.type,
      stars,
      punctuality: punctuality || undefined,
      professionalism: professionalism || undefined,
      comment: comment || undefined,
    });

    setSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error);
      return;
    }

    setSelected(null);
    setStars(0);
    setPunctuality(0);
    setProfessionalism(0);
    setComment('');
  };

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Valoraciones pendientes</h1>

        {loading && <FullLoader />}

        {!loading && error && <ErrorState message={error} retry={refresh} />}

        {!loading && !error && pendingRatings.length === 0 && (
          <EmptyState
            title="Sin valoraciones pendientes"
            description="Cuando finalices un turno, podrás valorar a la empresa."
          />
        )}

        <div className="space-y-3">
          {pendingRatings.map(item => (
            <Card key={item.id} className="space-y-3">
              <p className="font-bold">
                {item.type === 'worker_to_employer'
                  ? 'Valorar empresa'
                  : 'Valorar trabajador'}
              </p>

              <p className="text-sm text-[#8B8B8B]">
                {item.shifts?.profession_required}
              </p>

              <Button onClick={() => setSelected(item)}>Valorar</Button>
            </Card>
          ))}
        </div>
      </main>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Dejar valoración"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Valoración general</p>
            <RatingStars value={stars} onChange={setStars} size="lg" />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Puntualidad</p>
            <RatingStars value={punctuality} onChange={setPunctuality} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Profesionalidad</p>
            <RatingStars value={professionalism} onChange={setProfessionalism} />
          </div>

          <Textarea
            label="Comentario"
            rows={4}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Cuenta tu experiencia..."
          />

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <Button
            className="w-full"
            loading={submitting}
            disabled={stars === 0}
            onClick={handleSubmit}
          >
            Enviar valoración
          </Button>
        </div>
      </Modal>
    </div>
  );
}