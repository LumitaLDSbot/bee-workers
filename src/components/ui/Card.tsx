import { cn } from '@/lib/utils/cn';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-4xl border border-black/5 bg-white p-5 shadow-card', className)}>
      {children}
    </div>
  );
}
