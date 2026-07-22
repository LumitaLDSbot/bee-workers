import { Button } from '@/components/ui/Button';

interface StepShellProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

export function StepShell({ stepIndex, totalSteps, title, subtitle, onBack, children }: StepShellProps) {
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-6">
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          {onBack ? <Button type="button" variant="ghost" onClick={onBack} className="px-3 py-2">← Volver</Button> : <span />}
          <span className="text-sm font-medium text-muted">{stepIndex + 1} de {totalSteps}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-card">
          <div className="h-full rounded-full bg-bee transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="hex-pattern mb-6 rounded-4xl border border-black/5 bg-white p-6 shadow-card">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
