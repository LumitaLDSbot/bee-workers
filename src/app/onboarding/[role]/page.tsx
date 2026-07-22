import { notFound } from 'next/navigation';
import { WorkerOnboarding } from '@/components/onboarding/worker/WorkerOnboarding';
import { EmployerOnboarding } from '@/components/onboarding/employer/EmployerOnboarding';

export default function OnboardingPage({ params }: { params: { role: string } }) {
  if (params.role !== 'worker' && params.role !== 'employer') notFound();
  if (params.role === 'worker') return <WorkerOnboarding />;
  return <EmployerOnboarding />;
}
