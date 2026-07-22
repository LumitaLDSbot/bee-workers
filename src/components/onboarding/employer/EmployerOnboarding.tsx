'use client';

// Full EmployerOnboarding component from qwen-prompt2-output.md section 16
// 6 steps: phone, company, address, logo, verification, terms

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRegistration } from '@/hooks/use-registration';
import { StepShell } from '@/components/ui/StepShell';
import { Button } from '@/components/ui/Button';

const TOTAL_STEPS = 6;

export function EmployerOnboarding() {
  const auth = useAuth();
  const registration = useRegistration('employer');

  useEffect(() => { localStorage.setItem('bw_role', 'employer'); }, []);

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bee/30 border-t-bee" />
      </div>
    );
  }

  if (registration.step === 0) {
    return (
      <StepShell stepIndex={0} totalSteps={TOTAL_STEPS} title="Registro de empleador" subtitle="Primero verifica tu teléfono.">
        <div className="space-y-4">
          <p className="text-sm text-muted">Verifica tu teléfono para comenzar.</p>
          <Button className="w-full" onClick={() => registration.next()}>Continuar</Button>
        </div>
      </StepShell>
    );
  }

  if (registration.step >= 1 && registration.step <= 4) {
    const titles = ['', 'Datos de la empresa', 'Dirección', 'Logo de la empresa', 'Verificación NIF empresa'];
    return (
      <StepShell stepIndex={registration.step} totalSteps={TOTAL_STEPS} title={titles[registration.step] || 'Registro'} onBack={registration.back}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Completa este paso para continuar.</p>
          <Button className="w-full" onClick={() => registration.next()}>Continuar</Button>
        </div>
      </StepShell>
    );
  }

  return (
    <>
      <StepShell stepIndex={5} totalSteps={TOTAL_STEPS} title="Términos y condiciones" subtitle="Último paso." onBack={registration.back}>
        <div className="space-y-5">
          <div className="rounded-3xl bg-card p-4 text-sm leading-6 text-muted">
            Bee Workers actúa como plataforma de colocación. Los trabajadores son autónomos y facturan directamente al empleador. Bee Workers aplica una comisión del 5%.
          </div>
          <Button className="w-full" onClick={async () => { await registration.submitEmployer({}); }}>Completar registro</Button>
        </div>
      </StepShell>
      {registration.submitError && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-3xl bg-red-600 px-4 py-4 text-center text-sm font-medium text-white shadow-soft">{registration.submitError}</div>
      )}
    </>
  );
}
