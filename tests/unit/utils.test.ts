import { describe, expect, it } from 'vitest';
import { formatEUR } from '@/lib/utils/format';
import { haversineDistanceMeters } from '@/lib/utils/geo';
import { calculateShiftHours } from '@/lib/utils/date';

describe('formatEUR', () => {
  it('formatea euros correctamente', () => {
    const value = formatEUR(1234.5);
    expect(value).toContain('1');
    expect(value).toContain('234');
  });
  it('formatea cero', () => {
    const value = formatEUR(0);
    expect(value).toContain('0');
  });
});

describe('haversineDistanceMeters', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversineDistanceMeters(41.14961, -8.61099, 41.14961, -8.61099)).toBe(0);
  });
  it('calcula distancia aproximada entre dos puntos de Porto', () => {
    const distance = haversineDistanceMeters(41.14961, -8.61099, 41.14087, -8.61308);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(2000);
  });
});

describe('calculateShiftHours', () => {
  it('calcula horas normales', () => {
    expect(calculateShiftHours('2026-07-22T10:00:00.000Z', '2026-07-22T14:00:00.000Z')).toBe(4);
  });
  it('devuelve 0 si end es anterior a start', () => {
    expect(calculateShiftHours('2026-07-22T14:00:00.000Z', '2026-07-22T10:00:00.000Z')).toBe(0);
  });
});
