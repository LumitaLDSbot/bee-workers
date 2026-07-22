export function normalizePhonePT(input: string): string {
  const digits = input.replace(/\D/g, '');

  if (digits.startsWith('351')) return `+${digits}`;
  if (digits.length === 9) return `+351${digits}`;
  if (input.trim().startsWith('+')) return `+${digits}`;

  return `+${digits}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
