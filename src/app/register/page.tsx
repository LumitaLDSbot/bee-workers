'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function RegisterPage() {
  const router = useRouter();
  const selectRole = (role: 'worker' | 'employer') => {
    localStorage.setItem('bw_role', role);
    router.push(`/onboarding/${role}`);
  };

  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Únete a Bee Workers</h1>
          <p className="mt-2 text-muted">Elige cómo quieres usar la plataforma</p>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="text-xl font-bold">Soy trabajador/a</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Busca turnos puntuales en hostelería y restauración en Porto.</p>
            <Button className="mt-4 w-full" onClick={() => selectRole('worker')}>Registrarme como worker</Button>
          </Card>
          <Card>
            <h2 className="text-xl font-bold">Soy empleador</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Publica turnos y encuentra profesionales verificados.</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => selectRole('employer')}>Registrarme como employer</Button>
          </Card>
        </div>
        <div className="mt-6 text-center">
          <button onClick={() => router.push('/login')} className="text-sm font-semibold text-ink underline decoration-bee decoration-2 underline-offset-4">Ya tengo cuenta</button>
        </div>
      </div>
    </div>
  );
}
