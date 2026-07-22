'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function VerificationPendingPage() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!auth.loading && auth.profile?.verification_status === 'approved') {
      router.push(auth.profile.role === 'employer' ? '/app/employer' : '/app/worker');
    }
  }, [auth.loading, auth.profile, router]);

  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-bee text-2xl">⏳</div>
          <h1 className="text-2xl font-bold">Verificación en curso</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Hemos recibido tus documentos. Nuestro equipo los revisará en un plazo de 24-48 horas laborables.</p>
          <div className="mt-6 rounded-3xl bg-card p-4 text-left text-sm leading-6 text-muted">
            Mientras tanto, puedes preparar:
            <ul className="mt-2 list-disc pl-5">
              <li>Tu disponibilidad horaria</li>
              <li>Tu zona preferente de trabajo</li>
              <li>Tus documentos fiscales al día</li>
            </ul>
          </div>
          <Button variant="secondary" className="mt-6 w-full" onClick={() => auth.signOut().then(() => router.push('/login'))}>Cerrar sesión</Button>
        </Card>
      </div>
    </div>
  );
}
