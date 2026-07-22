import { z } from 'zod';

export const shiftFormSchema = z.object({
  profession: z.string().min(1, 'Selecciona una profesión'),
  date: z.string().min(1, 'Selecciona una fecha'),
  startTime: z.string().min(1, 'Selecciona hora de inicio'),
  endTime: z.string().min(1, 'Selecciona hora de fin'),
  pricePerHour: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000, 'Descripción demasiado larga').optional(),
  slotsNeeded: z.coerce.number().int().min(1).max(20),
});

export const applicationFormSchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});

export const ratingFormSchema = z.object({
  stars: z.number().int().min(1).max(5),
  punctuality: z.number().int().min(1).max(5).optional(),
  professionalism: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});

export const workerProfileFormSchema = z.object({
  fullName: z.string().min(2, 'Nombre demasiado corto'),
  hourlyRate: z.coerce.number().min(0.1, 'Precio inválido'),
  workRadiusKm: z.coerce.number().min(1).max(100),
  professions: z.array(z.string()).min(1, 'Selecciona al menos una profesión'),
  skills: z.array(z.string()).default([]),
  isActive: z.boolean(),
});

export type ShiftFormValues = z.infer<typeof shiftFormSchema>;
export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
export type RatingFormValues = z.infer<typeof ratingFormSchema>;
export type WorkerProfileFormValues = z.infer<typeof workerProfileFormSchema>;
