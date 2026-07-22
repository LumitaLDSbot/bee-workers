export function mapSupabaseError(error: { message?: string }): string {
  const message = error?.message?.toLowerCase() ?? '';

  if (message.includes('invalid login credentials')) return 'Credenciales incorrectas. Revisa tus datos.';
  if (message.includes('otp expired')) return 'El código ha caducado. Solicita uno nuevo.';
  if (message.includes('token has expired or is invalid')) return 'El código es inválido o ha caducado.';
  if (message.includes('phone not confirmed')) return 'Tu teléfono todavía no está confirmado.';
  if (message.includes('email not confirmed')) return 'Tu email todavía no está confirmado.';
  if (message.includes('rate limit exceeded')) return 'Demasiados intentos. Espera unos minutos.';
  if (message.includes('user not found')) return 'No hemos encontrado una cuenta con esos datos.';

  return 'Ha ocurrido un error. Inténtalo de nuevo en unos segundos.';
}
