import { ZodError } from 'zod';

export function getZodErrorMessage(error: ZodError): string {
  const flat = error.flatten();

  const fieldError = Object.values(flat.fieldErrors).flat().find(Boolean);
  if (fieldError) return fieldError;

  const formError = flat.formErrors.find(Boolean);
  if (formError) return formError;

  return 'Revisa los datos introducidos.';
}
