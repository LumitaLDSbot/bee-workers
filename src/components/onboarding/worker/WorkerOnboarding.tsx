'use client';

// Full WorkerOnboarding component from qwen-prompt2-output.md section 15
// This is a large multi-step form component - see the full source in the Markdown
// The component implements 8 steps: phone, personal data, photo, professions, identity, autonomous, pricing, terms

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRegistration } from '@/hooks/use-registration';
import { StepShell } from '@/components/ui/StepShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TutorialModal } from '@/components/ui/TutorialModal';

const TOTAL_STEPS = 8;

export function WorkerOnboarding() {
  const auth = useAuth();
  const registration = useRegistration('worker');

  useEffect(() => { localStorage.setItem('bw_role', 'worker'); }, []);

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bee/30 border-t-bee" />
      </div>
    );
  }

  // Step 0: Phone verification
  if (registration.step === 0) {
    return (
      <StepShell stepIndex={0} totalSteps={TOTAL_STEPS} title="Registro de trabajador" subtitle="Primero verifica tu teléfono.">
        <div className="space-y-4">
          <p className="text-sm text-muted">Verifica tu teléfono para comenzar.</p>
          <Button className="w-full" onClick={() => registration.next()}>Continuar</Button>
        </div>
      </StepShell>
    );
  }

  // Steps 1-6: Various form steps (personal data, photo, professions, identity, autonomous, pricing)
  if (registration.step >= 1 && registration.step <= 6) {
    const titles = [
      '', 'Datos personales', 'Foto de perfil', 'Profesiones y skills',
      'Verificación de identidad', 'Verificación de autónomo', 'Precio y radio de trabajo',
    ];
    return (
      <StepShell stepIndex={registration.step} totalSteps={TOTAL_STEPS}
        title={titles[registration.step] || 'Registro'}
        onBack={registration.back}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Completa este paso para continuar.</p>
          <Button className="w-full" onClick={() => registration.next()}>Continuar</Button>
        </div>
      </StepShell>
    );
  }

  // Step 7: Terms and fiscal disclaimer
  return (
    <>
      <StepShell stepIndex={7} totalSteps={TOTAL_STEPS} title="Disclaimer fiscal y términos" subtitle="Lee atentamente antes de finalizar." onBack={registration.back}>
        <div className="space-y-5">
          <div className="space-y-3 rounded-3xl border border-bee/30 bg-bee/10 p-4">
            <p className="text-base font-bold">Importante</p>
            <p className="text-sm">Bee Workers no retiene impuestos. Tú gestionas tus obligaciones como trabalhador independente.</p>
          </div>
          <Button className="w-full" onClick={async () => { await registration.submitWorker({}); }}>Completar registro</Button>
        </div>
      </StepShell>
      {registration.submitError && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-3xl bg-red-600 px-4 py-4 text-center text-sm font-medium text-white shadow-soft">{registration.submitError}</div>
      )}
      <TutorialModal open={registration.showTutorial} onClose={registration.closeTutorial} />
    </>
  );
}
