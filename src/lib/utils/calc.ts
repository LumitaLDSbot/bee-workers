import {
  PLATFORM_COMMISSION_RATE,
  IRS_RATE,
  IRS_TAXABLE_BASE,
  SS_RATE,
  SS_TAXABLE_BASE,
} from '@/lib/constants';
import { round2 } from '@/lib/utils/number';
import type { NetBreakdownInput, NetBreakdownResult } from '@/types/core';

export function calculateWorkerNet({
  hourlyRate,
  hours,
  ssExempt = false,
}: NetBreakdownInput): NetBreakdownResult {
  const gross = round2(hourlyRate * hours);
  const commission = round2(gross * PLATFORM_COMMISSION_RATE);
  const netBeforeTaxes = round2(gross - commission);

  const irsTaxableBase = round2(gross * IRS_TAXABLE_BASE);
  const irsEstimate = round2(irsTaxableBase * IRS_RATE);

  const ssBase = round2(gross * SS_TAXABLE_BASE);
  const ssEstimate = ssExempt ? 0 : round2(ssBase * SS_RATE);

  const totalTaxEstimate = round2(irsEstimate + ssEstimate);
  const netAfterTaxes = round2(netBeforeTaxes - totalTaxEstimate);

  return {
    hourlyRate,
    hours,
    gross,
    commissionRate: PLATFORM_COMMISSION_RATE,
    commission,
    netBeforeTaxes,
    irsTaxableBase,
    irsRate: IRS_RATE,
    irsEstimate,
    ssBase,
    ssRate: SS_RATE,
    ssExempt,
    ssEstimate,
    totalTaxEstimate,
    netAfterTaxes,
  };
}

export function calculateShiftCost(
  hourlyRate: number,
  hours: number,
  slots: number
): number {
  return round2(hourlyRate * hours * slots);
}
