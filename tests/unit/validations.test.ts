import { describe, expect, it } from 'vitest';
import { shiftFormSchema, applicationFormSchema, ratingFormSchema, workerProfileFormSchema } from '@/lib/validations/forms';

describe('shiftFormSchema', () => {
  it('acepta un turno válido', () => {
    expect(shiftFormSchema.safeParse({ profession: 'Camarero/a', date: '2026-07-22', startTime: '10:00', endTime: '14:00', pricePerHour: 12, description: 'Turno', slotsNeeded: 2 }).success).toBe(true);
  });
  it('rechaza slotsNeeded mayor que 20', () => {
    expect(shiftFormSchema.safeParse({ profession: 'Camarero/a', date: '2026-07-22', startTime: '10:00', endTime: '14:00', slotsNeeded: 21 }).success).toBe(false);
  });
});

describe('applicationFormSchema', () => {
  it('acepta aplicación con propuesta', () => {
    expect(applicationFormSchema.safeParse({ shiftId: '11111111-1111-1111-1111-111111111111', message: 'Tengo experiencia', proposedRate: 13 }).success).toBe(true);
  });
  it('rechaza shiftId inválido', () => {
    expect(applicationFormSchema.safeParse({ shiftId: 'invalid-id', proposedRate: 13 }).success).toBe(false);
  });
});

describe('ratingFormSchema', () => {
  it('acepta rating válido', () => {
    expect(ratingFormSchema.safeParse({ stars: 5, punctuality: 4, professionalism: 5, comment: 'Muy profesional' }).success).toBe(true);
  });
  it('rechaza estrellas fuera de rango', () => {
    expect(ratingFormSchema.safeParse({ stars: 6 }).success).toBe(false);
  });
});

describe('workerProfileFormSchema', () => {
  it('acepta perfil worker válido', () => {
    expect(workerProfileFormSchema.safeParse({ fullName: 'Ana Silva', hourlyRate: 12, workRadiusKm: 10, professions: ['Camarero/a'], skills: ['Bandeja'], isActive: true }).success).toBe(true);
  });
  it('rechaza sin profesiones', () => {
    expect(workerProfileFormSchema.safeParse({ fullName: 'Ana Silva', hourlyRate: 12, workRadiusKm: 10, professions: [], skills: [], isActive: true }).success).toBe(false);
  });
});
