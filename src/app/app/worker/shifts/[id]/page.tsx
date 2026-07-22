'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useShiftDetail } from '@/hooks/useShifts';
import { useCheckin } from '@/hooks/useCheckin';
import { applyToShiftAction } from '@/server/actions/applications.actions';
import { WorkerNav } from '@/components/layout/AppNav';
import { NetBreakdown } from '@/components/shifts/NetBreakdown';
import {
  Badge,
  Button,
  Card,
  FullLoader,
  ErrorState,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import { formatEUR } from '@/lib/utils/number';
import { formatDateTime, calculateShiftHours } from '@/lib/utils/date';

export default function WorkerShiftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const shiftId = params.id as string;
  const { shift, employer, myApplication, loading, error, refresh } =
    useShiftDetail(shiftId);

  const checkin = useCheckin(shiftId);

  const [applyOpen, setApplyOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [workerProfile, setWorkerProfile] = useState<any | null>(null);

  useState(() => {
    async function fetchWorkerProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setWorkerProfile(data);
    }

    fetchWorkerProfile();
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <WorkerNav />
        <FullLoader />
      </div>
    );
  }

  if (error || !shift) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <WorkerNav />
        <div className="mx-auto max-w-md px-4 py-6">
          <ErrorState message={error ?? 'Turno no encontrado.'} retry={refresh} />
        </div>
      </div>
    );
  }

  const hours = calculateShiftHours(shift.starts_at, shift.ends_at);
  const fixedPrice = shift.hourly_rate_offer ?? 0;
  const previewRate = fixedPrice > 0 ? fixedPrice : Number(proposedRate || 0);

  const handleApply = async () => {
    setApplyLoading(true);
    setApplyError(null);

    const result = await applyToShiftAction({
      shiftId,
      message,
      proposedRate: proposedRate ? Number(proposedRate) : null,
    });

    setApplyLoading(false);

    if (!result.success) {
      setApplyError(result.error);
      return;
    }

    setApplyOpen(false);
    setMessage('');
    setProposedRate('');
    await refresh();
  };

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1A1A1A]">
                {shift.profession_required}
              </h1>
              <p className="text-sm text-[#8B8B8B]">
                {employer?.company_name ?? 'Empresa'}
              </p>
            </div>

            <Badge>{shift.status}</Badge>
          </div>

          <div className="space-y-2 text-sm text-[#1A1A1A]">
            <p>📍 {shift.location}</p>
            <p>🕒 {formatDateTime(shift.starts_at)}</p>
            <p>
              💶{' '}
              {shift.hourly_rate_offer
                ? `${formatEUR(shift.hourly_rate_offer)}/hora`
                : 'Precio a convenir'}
            </p>
            <p>👥 {shift.slots_needed} vacantes</p>
          </div>

          {shift.description && (
            <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm leading-6 text-[#1A1A1A]">
              {shift.description}
            </div>
          )}
        </Card>

        {employer && (
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">
                {employer.company_name}
              </p>
              <p className="text-xs text-[#8B8B8B]">
                {employer.rating_count >= 3
                  ? `⭐ ${employer.rating.toFixed(1)} · ${employer.total_shifts} turnos`
                  : 'Perfil nuevo'}
              </p>
            </div>
          </Card>
        )}

        <NetBreakdown
          hourlyRate={previewRate}
          hours={hours}
          ssExempt={workerProfile?.is_social_security_exempt ?? false}
        />

        {myApplication && (
          <Card className="space-y-2">
            <p className="text-sm font-bold">Tu aplicación</p>
            <Badge
              variant={
                myApplication.status === 'accepted'
                  ? 'success'
                  : myApplication.status === 'rejected'
                    ? 'danger'
                    : 'warning'
              }
            >
              {myApplication.status}
            </Badge>
          </Card>
        )}

        {myApplication?.status === 'accepted' && (
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Check-in / Check-out</h2>

            {checkin.error && <p className="text-sm text-red-600">{checkin.error}</p>}
            {checkin.actionError && (
              <p className="text-sm text-red-600">{checkin.actionError}</p>
            )}

            {!checkin.checkin && (
              <Button
                className="w-full"
                disabled={!checkin.canCheckIn}
                loading={checkin.actionLoading}
                onClick={checkin.doCheckIn}
              >
                Iniciar turno
              </Button>
            )}

            {checkin.checkin && !checkin.checkin.check_out_at && (
              <Button
                className="w-full"
                loading={checkin.actionLoading}
                onClick={checkin.doCheckOut}
              >
                Finalizar turno
              </Button>
            )}

            {checkin.checkin?.check_out_at && (
              <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-700">
                Turno finalizado. Ya puedes valorar a la empresa en la sección
                Ratings.
              </div>
            )}

            {!checkin.canCheckIn && !checkin.checkin && (
              <p className="text-xs text-[#8B8B8B]">
                El check-in se habilita 15 minutos antes del inicio del turno.
              </p>
            )}
          </Card>
        )}

        {!myApplication && shift.status === 'published' && (
          <Button className="w-full" onClick={() => setApplyOpen(true)}>
            Aplicar
          </Button>
        )}
      </main>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Aplicar al turno">
        <div className="space-y-4">
          {fixedPrice <= 0 && (
            <Input
              label="Tu propuesta de precio por hora (€)"
              type="number"
              step="0.5"
              value={proposedRate}
              onChange={e => setProposedRate(e.target.value)}
              placeholder="12"
            />
          )}

          <Textarea
            label="Mensaje opcional"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Breve presentación, experiencia relevante..."
          />

          {applyError && <p className="text-sm text-red-600">{applyError}</p>}

          <Button className="w-full" loading={applyLoading} onClick={handleApply}>
            Enviar aplicación
          </Button>
        </div>
      </Modal>
    </div>
  );
}