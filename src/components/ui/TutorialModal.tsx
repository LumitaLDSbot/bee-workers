'use client';

import { Button } from '@/components/ui/Button';
import { LEGAL } from '@/lib/constants/legal';

interface TutorialModalProps { open: boolean; onClose: () => void; }

function TutorialSection({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <details className="group rounded-3xl border border-black/5 bg-card p-4">
      <summary className="cursor-pointer list-none text-base font-semibold text-ink">{title}</summary>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
        {items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-bee" /><span>{item}</span></li>)}
      </ul>
    </details>
  );
}

export function TutorialModal({ open, onClose }: TutorialModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-4xl bg-cream p-5 shadow-soft sm:rounded-4xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Guía fiscal para autónomos</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Bee Workers no retiene impuestos. Tú gestionas tus obligaciones como trabalhador independente.</p>
        </div>
        <div className="space-y-3">
          <TutorialSection title="Cómo declarar IRS (Categoría B)" items={LEGAL.tutorial.irs} />
          <TutorialSection title="Cómo declarar Segurança Social" items={LEGAL.tutorial.ss} />
          <TutorialSection title="Abrir actividad nas Finanças" items={LEGAL.tutorial.financas} />
          <TutorialSection title="Seguro de acidentes de trabalho" items={LEGAL.tutorial.seguro} />
        </div>
        <Button className="mt-6 w-full" onClick={onClose}>Entendido, continuar</Button>
      </div>
    </div>
  );
}
