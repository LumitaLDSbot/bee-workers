'use client';

import { Badge, Card } from '@/components/ui';
import { formatEUR } from '@/lib/utils/number';
import { formatHour, formatShiftDate } from '@/lib/utils/date';
import type { Shift } from '@/types/core';

interface ShiftCardProps {
  shift: Shift;
  employerName?: string;
  employerRating?: number;
  employerRatingCount?: number;
  onClick?: () => void;
}

export function ShiftCard({ shift, employerName, employerRating, employerRatingCount = 0, onClick }: ShiftCardProps) {
  const showRating = employerRatingCount >= 3;
  return (
    <Card onClick={onClick} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#1A1A1A]">{shift.profession_required}</h3>
          <p className="text-sm text-[#8B8B8B]">{employerName ?? 'Empresa'}</p>
        </div>
        <Badge variant={shift.remaining_slots && shift.remaining_slots > 0 ? 'default' : 'muted'}>{shift.remaining_slots ?? shift.slots_needed} vacantes</Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-[#8B8B8B]">
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">{formatShiftDate(shift.shift_date)}</span>
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">{formatHour(shift.start_time)} - {formatHour(shift.end_time)}</span>
        {typeof shift.distance_km === 'number' && <span className="rounded-full bg-[#F5F5F0] px-3 py-1">{shift.distance_km.toFixed(1)} km</span>}
      </div>
      <div className="flex items-center justify-between">
        <div>
          {shift.hourly_rate_offer ? (
            <p className="text-lg font-black text-[#1A1A1A]">{formatEUR(shift.hourly_rate_offer)}<span className="text-xs font-medium text-[#8B8B8B]">/hora</span></p>
          ) : <p className="text-sm font-semibold text-[#1A1A1A]">Precio a convenir</p>}
        </div>
        {showRating && <span className="text-sm font-semibold text-[#1A1A1A]">⭐ {employerRating?.toFixed(1)}</span>}
      </div>
    </Card>
  );
}
