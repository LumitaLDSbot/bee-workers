'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeEmployerRegistration, completeWorkerRegistration } from '@/server/actions/onboarding.actions';
import type { Role } from '@/types';

type RegistrationData = Record<string, unknown>;

export function useRegistration(role: Role) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<RegistrationData>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const updateData = useCallback((patch: RegistrationData) => {
    setData(prev => ({ ...prev, ...patch }));
  }, []);

  const next = useCallback(() => { setSubmitError(null); setStep(prev => prev + 1); }, []);
  const back = useCallback(() => { setSubmitError(null); setStep(prev => Math.max(0, prev - 1)); }, []);
  const goToStep = useCallback((index: number) => { setSubmitError(null); setStep(index); }, []);

  const submitWorker = useCallback(async (extra?: RegistrationData) => {
    setSubmitting(true); setSubmitError(null);
    const payload = { ...data, ...extra };
    const result = await completeWorkerRegistration(payload);
    setSubmitting(false);
    if (!result.success) { setSubmitError(result.error); return result; }
    setShowTutorial(true);
    return result;
  }, [data]);

  const submitEmployer = useCallback(async (extra?: RegistrationData) => {
    setSubmitting(true); setSubmitError(null);
    const payload = { ...data, ...extra };
    const result = await completeEmployerRegistration(payload);
    setSubmitting(false);
    if (!result.success) { setSubmitError(result.error); return result; }
    router.push('/verification-pending');
    return result;
  }, [data, router]);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    router.push('/verification-pending');
  }, [router]);

  return { role, step, data, submitting, submitError, showTutorial, updateData, next, back, goToStep, submitWorker, submitEmployer, closeTutorial };
}
