import { describe, expect, it } from 'vitest';
import { calculateWorkerNet } from '@/lib/utils/calc';

describe('calculateWorkerNet', () => {
  it('calcula correctamente el neto sin exención SS', () => {
    const result = calculateWorkerNet({ hourlyRate: 10, hours: 10, ssExempt: false });
    expect(result.gross).toBe(100);
    expect(result.commission).toBe(5);
    expect(result.netBeforeTaxes).toBe(95);
    expect(result.irsTaxableBase).toBe(75);
    expect(result.irsEstimate).toBe(17.25);
    expect(result.ssBase).toBe(70);
    expect(result.ssEstimate).toBe(14.98);
    expect(result.totalTaxEstimate).toBe(32.23);
    expect(result.netAfterTaxes).toBe(62.77);
  });

  it('aplica exención de Segurança Social', () => {
    const result = calculateWorkerNet({ hourlyRate: 10, hours: 10, ssExempt: true });
    expect(result.ssExempt).toBe(true);
    expect(result.ssEstimate).toBe(0);
    expect(result.totalTaxEstimate).toBe(17.25);
    expect(result.netAfterTaxes).toBe(77.75);
  });

  it('devuelve cero para inputs cero', () => {
    const result = calculateWorkerNet({ hourlyRate: 0, hours: 0, ssExempt: false });
    expect(result.gross).toBe(0);
    expect(result.commission).toBe(0);
    expect(result.netBeforeTaxes).toBe(0);
    expect(result.totalTaxEstimate).toBe(0);
    expect(result.netAfterTaxes).toBe(0);
  });
});
