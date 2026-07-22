'use client';

import { Input, Select } from '@/components/ui';
import { PROFESSIONS } from '@/lib/constants';
import type { ShiftFilters } from '@/hooks/useShifts';

interface ShiftFiltersProps {
  filters: ShiftFilters;
  onChange: (filters: ShiftFilters) => void;
}

export function ShiftFiltersBar({ filters, onChange }: ShiftFiltersProps) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      <div className="w-44 shrink-0">
        <Select value={filters.profession} onChange={e => onChange({ ...filters, profession: e.target.value })}>
          <option value="">Todas las profesiones</option>
          {PROFESSIONS.map(profession => <option key={profession} value={profession}>{profession}</option>)}
        </Select>
      </div>
      <div className="w-32 shrink-0">
        <Select value={filters.maxKm} onChange={e => onChange({ ...filters, maxKm: Number(e.target.value) })}>
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={15}>15 km</option>
          <option value={20}>20 km</option>
          <option value={30}>30 km</option>
        </Select>
      </div>
      <div className="w-40 shrink-0"><Input type="date" value={filters.date} onChange={e => onChange({ ...filters, date: e.target.value })} /></div>
      <div className="w-32 shrink-0"><Input type="number" placeholder="€/h mín" value={filters.minPrice || ''} onChange={e => onChange({ ...filters, minPrice: Number(e.target.value) })} /></div>
    </div>
  );
}
