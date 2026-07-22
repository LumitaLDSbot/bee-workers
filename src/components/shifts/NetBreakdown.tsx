'use client';

import { calculateWorkerNet } from '@/lib/utils/calc';
import { formatEUR } from '@/lib/utils/number';
import { FISCAL_DISCLAIMER } from '@/lib/constants';
import { Card } from '@/components/ui';

interface NetBreakdownProps { hourlyRate: number; hours: number; ssExempt?: boolean; }

export function NetBreakdown({ hourlyRate, hours, ssExempt = false }: NetBreakdownProps) {
  if (!hourlyRate || hourlyRate <= 0 || hours <= 0) return null;
  const result = calculateWorkerNet({ hourlyRate, hours, ssExempt });
  return (
    <Card className="space-y-3">
      <h3 className="text-base font-bold text-[#1A1A1A]">Estimación de neto</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[#8B8B8B]">Bruto ({formatEUR(result.hourlyRate)} × {result.hours.toFixed(1)}h)</span><span className="font-semibold">{formatEUR(result.gross)}</span></div>
        <div className="flex justify-between"><span className="text-[#8B8B8B]">Comisión Bee Workers (5%)</span><span className="font-semibold text-red-600">-{formatEUR(result.commission)}</span></div>
        <div className="flex justify-between border-t border-black/5 pt-2"><span className="font-medium">A recibir antes de impuestos</span><span className="font-bold">{formatEUR(result.netBeforeTaxes)}</span></div>
        <div className="flex justify-between"><span className="text-[#8B8B8B]">IRS estimado (23% sobre 75%)</span><span className="font-semibold text-red-600">-{formatEUR(result.irsEstimate)}</span></div>
        <div className="flex justify-between"><span className="text-[#8B8B8B]">SS estimado (21.4% sobre 70%){result.ssExempt ? ' · Exento' : ''}</span><span className="font-semibold text-red-600">-{formatEUR(result.ssEstimate)}</span></div>
        <div className="flex justify-between rounded-2xl bg-[#F5F5F0] px-3 py-3"><span className="font-bold">Neto estimado</span><span className="font-black">{formatEUR(result.netAfterTaxes)}</span></div>
      </div>
      <p className="rounded-2xl bg-[#FFB800]/10 p-3 text-xs leading-5 text-[#1A1A1A]">{FISCAL_DISCLAIMER}</p>
    </Card>
  );
}
