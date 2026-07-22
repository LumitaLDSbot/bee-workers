'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { Card } from '@/components/ui/Card';
import { phoneSchema } from '@/lib/validations/onboarding';
import type { UserProfile } from '@/types';

const phoneFormSchema = z.object({ phone: phoneSchema });
const emailFormSchema = z.object({
  email: z.string().email('Introduce un email válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type PhoneFormValues = z.infer<typeof phoneFormSchema>;
type EmailFormValues = z.infer<typeof emailFormSchema>;

function redirectByProfile(router: ReturnType<typeof useRouter>, profile: UserProfile | null) {
  if (!profile) { router.push('/register'); return; }
  if (!profile.onboarding_completed) { router.push(`/onboarding/${profile.role === 'employer' ? 'employer' : 'worker'}`); return; }
  if (profile.verification_status !== 'approved') { router.push('/verification-pending'); return; }
  router.push(profile.role === 'employer' ? '/app/employer' : '/app/worker');
}

export function LoginForm() {
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [otpSent, setOtpSent] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneForm = useForm<PhoneFormValues>({ resolver: zodResolver(phoneFormSchema), defaultValues: { phone: '' } });
  const emailForm = useForm<EmailFormValues>({ resolver: zodResolver(emailFormSchema), defaultValues: { email: '', password: '' } });

  const handleSendOtp = async (values: PhoneFormValues) => {
    setLoading(true); setError(null);
    try { await auth.sendPhoneOtp(values.phone); setVerifiedPhone(values.phone); setOtpSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al enviar el código.'); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (!verifiedPhone) return;
    setLoading(true); setError(null);
    try {
      await auth.verifyPhoneOtp(verifiedPhone, otp);
      const profile = await auth.refreshProfile();
      redirectByProfile(router, profile);
    } catch (err) { setError(err instanceof Error ? err.message : 'Código inválido.'); }
    finally { setLoading(false); }
  };

  const handleEmailLogin = async (values: EmailFormValues) => {
    setLoading(true); setError(null);
    try {
      await auth.signInWithEmailPassword(values.email, values.password);
      const profile = await auth.refreshProfile();
      redirectByProfile(router, profile);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al iniciar sesión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-bee text-2xl font-black">BW</div>
          <h1 className="text-3xl font-bold">Bee Workers</h1>
          <p className="mt-2 text-muted">Turnos puntuales en hostelería y restauración</p>
        </div>

        <Card>
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-3xl bg-card p-1">
            <button type="button" onClick={() => { setMode('phone'); setError(null); }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === 'phone' ? 'bg-white shadow-card' : 'text-muted'}`}>Teléfono</button>
            <button type="button" onClick={() => { setMode('email'); setError(null); }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === 'email' ? 'bg-white shadow-card' : 'text-muted'}`}>Email</button>
          </div>

          {mode === 'phone' ? (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={phoneForm.handleSubmit(handleSendOtp)} className="space-y-4">
                  <Input label="Teléfono" placeholder="+351 912 345 678" {...phoneForm.register('phone')} error={phoneForm.formState.errors.phone?.message} />
                  <Button type="submit" className="w-full" loading={loading}>Enviar código</Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted">Introduce el código enviado a {verifiedPhone}.</p>
                  <OtpInput value={otp} onChange={setOtp} disabled={loading} />
                  <Button className="w-full" loading={loading} disabled={otp.length !== 6} onClick={handleVerifyOtp}>Verificar código</Button>
                  <Button variant="ghost" className="w-full" onClick={() => { setOtpSent(false); setOtp(''); setError(null); }}>Cambiar teléfono</Button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={emailForm.handleSubmit(handleEmailLogin)} className="space-y-4">
              <Input label="Email" type="email" placeholder="tu@email.com" {...emailForm.register('email')} error={emailForm.formState.errors.email?.message} />
              <Input label="Contraseña" type="password" placeholder="••••••••" {...emailForm.register('password')} error={emailForm.formState.errors.password?.message} />
              <Button type="submit" className="w-full" loading={loading}>Entrar</Button>
            </form>
          )}

          {error && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        </Card>

        <div className="mt-6 text-center">
          <button onClick={() => router.push('/register')} className="text-sm font-semibold text-ink underline decoration-bee decoration-2 underline-offset-4">Crear cuenta nueva</button>
        </div>
      </div>
    </div>
  );
}
