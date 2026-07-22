import { z } from 'zod';
import { normalizePhonePT, isValidE164 } from '@/lib/utils/phone';

function calculateAge(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  return age;
}

export const phoneSchema = z
  .string()
  .min(9, 'Introduce tu número de teléfono')
  .transform(normalizePhonePT)
  .refine(isValidE164, 'Introduce un teléfono válido, por ejemplo +351912345678');

export const otpSchema = z.object({
  otp: z.string().length(6, 'El código tiene 6 dígitos'),
});

export const workerPersonalSchema = z.object({
  fullName: z.string().min(2, 'Introduce tu nombre completo'),
  email: z.string().email('Introduce un email válido'),
  nif: z.string().regex(/^\d{9}$/, 'El NIF debe tener 9 dígitos'),
  niss: z.string().optional().refine(value => !value || /^\d{11}$/.test(value), 'El NISS debe tener 11 dígitos'),
  birthDate: z.string().min(1, 'Selecciona tu fecha de nacimiento')
    .refine(value => !isNaN(Date.parse(value)), 'Fecha inválida')
    .refine(value => calculateAge(value) >= 18, 'Debes ser mayor de 18 años'),
});

export const workerPhotoSchema = z.object({
  profilePhotoUrl: z.string().url('Sube una foto de perfil válida'),
});

export const workerProfessionsSchema = z.object({
  professions: z.array(z.string()).min(1, 'Selecciona al menos una profesión'),
  skills: z.array(z.string()).default([]),
});

export const workerIdentitySchema = z.object({
  documentType: z.enum(['cc', 'passport'], { errorMap: () => ({ message: 'Selecciona un tipo de documento' }) }),
  idFrontPath: z.string().min(1, 'Sube la foto frontal del documento'),
  selfieDocPath: z.string().min(1, 'Sube una selfie con el documento'),
  nifDocumentPath: z.string().min(1, 'Sube el comprobante de NIF'),
});

export const workerAutonomousSchema = z.object({
  atividadePath: z.string().min(1, 'Sube el comprobante de actividad abierta'),
  seguroPath: z.string().min(1, 'Sube el comprobante del seguro'),
  seguroExpiresAt: z.string().min(1, 'Indica la fecha de caducidad del seguro')
    .refine(value => !isNaN(Date.parse(value)), 'Fecha inválida')
    .refine(value => new Date(value) > new Date(), 'El seguro debe estar vigente'),
});

export const workerPricingSchema = z.object({
  hourlyRate: z.coerce.number({ required_error: 'Introduce tu precio por hora', invalid_type_error: 'Introduce un número válido' }).min(0.1, 'Introduce un precio por hora válido').max(500, 'Precio demasiado alto'),
  workRadiusKm: z.coerce.number({ required_error: 'Selecciona tu radio de trabajo', invalid_type_error: 'Introduce un número válido' }).min(1, 'Radio mínimo 1 km').max(100, 'Radio máximo 100 km'),
});

export const workerTermsSchema = z.object({
  acceptTerms: z.boolean().refine(value => value === true, { message: 'Debes aceptar los Términos y Condiciones' }),
  acceptFiscal: z.boolean().refine(value => value === true, { message: 'Debes confirmar que entiendes tus obligaciones fiscales' }),
});

export const workerRegistrationSchema = workerPersonalSchema
  .merge(workerPhotoSchema)
  .merge(workerProfessionsSchema)
  .merge(workerIdentitySchema)
  .merge(workerAutonomousSchema)
  .merge(workerPricingSchema)
  .merge(workerTermsSchema);

export type WorkerPersonalValues = z.infer<typeof workerPersonalSchema>;
export type WorkerPhotoValues = z.infer<typeof workerPhotoSchema>;
export type WorkerProfessionsValues = z.infer<typeof workerProfessionsSchema>;
export type WorkerIdentityValues = z.infer<typeof workerIdentitySchema>;
export type WorkerAutonomousValues = z.infer<typeof workerAutonomousSchema>;
export type WorkerPricingValues = z.infer<typeof workerPricingSchema>;
export type WorkerTermsValues = z.infer<typeof workerTermsSchema>;
export type WorkerRegistrationValues = z.infer<typeof workerRegistrationSchema>;

export const employerCompanySchema = z.object({
  companyName: z.string().min(2, 'Introduce el nombre de la empresa'),
  nifEmpresa: z.string().regex(/^\d{9}$/, 'El NIF de empresa debe tener 9 dígitos'),
  email: z.string().email('Introduce un email válido'),
  contactPhone: phoneSchema,
});

export const employerAddressSchema = z.object({
  address: z.string().min(5, 'Introduce una dirección completa'),
  latitude: z.number({ required_error: 'Valida la dirección para obtener coordenadas', invalid_type_error: 'Coordenadas inválidas' }),
  longitude: z.number({ required_error: 'Valida la dirección para obtener coordenadas', invalid_type_error: 'Coordenadas inválidas' }),
});

export const employerLogoSchema = z.object({
  logoUrl: z.string().url('Sube un logo válido'),
});

export const employerVerificationSchema = z.object({
  nifDocumentPath: z.string().min(1, 'Sube el documento de NIF de empresa'),
});

export const employerTermsSchema = z.object({
  acceptTerms: z.boolean().refine(value => value === true, { message: 'Debes aceptar los Términos y Condiciones' }),
});

export const employerRegistrationSchema = employerCompanySchema
  .merge(employerAddressSchema)
  .merge(employerLogoSchema)
  .merge(employerVerificationSchema)
  .merge(employerTermsSchema);

export type EmployerCompanyValues = z.infer<typeof employerCompanySchema>;
export type EmployerAddressValues = z.infer<typeof employerAddressSchema>;
export type EmployerLogoValues = z.infer<typeof employerLogoSchema>;
export type EmployerVerificationValues = z.infer<typeof employerVerificationSchema>;
export type EmployerTermsValues = z.infer<typeof employerTermsSchema>;
export type EmployerRegistrationValues = z.infer<typeof employerRegistrationSchema>;
