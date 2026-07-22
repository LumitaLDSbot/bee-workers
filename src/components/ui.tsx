'use client';

import { cn } from '@/lib/utils/cn';
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('h-8 w-8 animate-spin rounded-full border-4 border-[#FFB800]/30 border-t-[#FFB800]', className)} />
  );
}

export function FullLoader({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">{label}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-center dark:border-red-900/40 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {retry && <Button variant="secondary" className="mt-4" onClick={retry}>Reintentar</Button>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F5F5F0] text-2xl dark:bg-neutral-800">🐝</div>
      <h3 className="text-lg font-bold text-[#1A1A1A] dark:text-neutral-100">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-xs text-sm text-[#8B8B8B] dark:text-neutral-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn('rounded-3xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900', onClick && 'cursor-pointer transition hover:shadow-md', className)}>
      {children}
    </div>
  );
}

export function Badge({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'dark' }) {
  const styles = {
    default: 'bg-[#FFB800]/15 text-[#1A1A1A] dark:bg-[#FFB800]/20 dark:text-[#FFB800]',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    muted: 'bg-[#F5F5F0] text-[#8B8B8B] dark:bg-neutral-800 dark:text-neutral-400',
    dark: 'bg-[#1A1A1A] text-white dark:bg-neutral-800',
  };
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', styles[variant])}>{children}</span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  loading?: boolean;
}

export function Button({ className, variant = 'primary', loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button disabled={disabled || loading} className={cn(
      'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
      variant === 'primary' && 'bg-[#FFB800] text-[#1A1A1A] shadow-sm hover:bg-[#E0A800]',
      variant === 'secondary' && 'bg-[#F5F5F0] text-[#1A1A1A] hover:bg-black/5 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
      variant === 'ghost' && 'bg-transparent text-[#1A1A1A] hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10',
      variant === 'danger' && 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300',
      variant === 'outline' && 'border border-black/10 bg-transparent text-[#1A1A1A] hover:bg-black/5 dark:border-white/15 dark:text-neutral-100 dark:hover:bg-white/10',
      className
    )} {...props}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {children}
    </button>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; hint?: string; }
export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">{label}</label>}
      <input className={cn(
        'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
        'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
        error && 'border-red-400 focus:border-red-400 focus:ring-red-100', className
      )} {...props} />
      {hint && !error && <p className="text-xs text-[#8B8B8B] dark:text-neutral-400">{hint}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string; }
export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">{label}</label>}
      <textarea className={cn(
        'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
        'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25', error && 'border-red-400', className
      )} {...props} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string; }
export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">{label}</label>}
      <select className={cn(
        'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
        error && 'border-red-400', className
      )} {...props}>{children}</select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#FFFAF0] p-5 shadow-xl dark:bg-neutral-950 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1A1A1A] dark:text-neutral-100">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-bold text-[#1A1A1A] dark:bg-neutral-800 dark:text-neutral-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RatingStars({ value, onChange, size = 'md' }: { value: number; onChange?: (value: number) => void; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' };
  return (
    <div className={cn('flex gap-1', sizes[size])}>
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} type="button" disabled={!onChange} onClick={() => onChange?.(star)}
          className={cn(star <= value ? 'text-[#FFB800]' : 'text-black/15 dark:text-white/20', onChange && 'transition hover:scale-110')}>★</button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, label, warningThreshold = 80 }: { value: number; max: number; label?: string; warningThreshold?: number }) {
  const percent = Math.min(Math.round((value / max) * 100), 100);
  const isWarning = percent >= warningThreshold;
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#8B8B8B] dark:text-neutral-400">{label}</span>
          <span className="font-semibold text-[#1A1A1A] dark:text-neutral-100">{percent}%</span>
        </div>
      )}
      <div className="h-3 w-full overflow-hidden rounded-full bg-[#F5F5F0] dark:bg-neutral-800">
        <div className={cn('h-full rounded-full transition-all', isWarning ? 'bg-red-500' : 'bg-[#FFB800]')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Avatar({ src, alt = 'Avatar', fallback = 'BW', size = 48, hex = true }: { src?: string | null; alt?: string; fallback?: string; size?: number; hex?: boolean }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-[#FFB800] font-bold text-[#1A1A1A]', hex ? 'hex-clip' : 'rounded-full')} style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" style={{ width: size, height: size }} /> : <span style={{ fontSize: size / 3 }}>{fallback}</span>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: string }) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">{value}</p>
        {hint && <p className="mt-1 text-xs text-[#8B8B8B] dark:text-neutral-500">{hint}</p>}
      </div>
      {icon && <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F5F5F0] text-lg dark:bg-neutral-800">{icon}</div>}
    </Card>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4">
      {label && <span className="text-sm text-[#1A1A1A] dark:text-neutral-200">{label}</span>}
      <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 rounded-full transition disabled:opacity-50', checked ? 'bg-[#FFB800]' : 'bg-black/15 dark:bg-white/20')}>
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </label>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ id: string; label: string }>; active: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition',
            active === tab.id ? 'bg-[#FFB800] text-[#1A1A1A]' : 'bg-[#F5F5F0] text-[#8B8B8B] dark:bg-neutral-800 dark:text-neutral-300')}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SimpleBarChart({ data, formatValue, height = 160 }: { data: Array<{ label: string; value: number }>; formatValue: (value: number) => string; height?: number }) {
  const max = Math.max(...data.map(item => item.value), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((item, index) => {
          const barHeight = Math.max((item.value / max) * 100, 4);
          return (
            <div key={`${item.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="text-[10px] font-semibold text-[#8B8B8B] dark:text-neutral-400">{item.value > 0 ? formatValue(item.value) : ''}</div>
              <div className="w-full rounded-t-xl bg-[#FFB800] transition-all dark:bg-[#E0A800]" style={{ height: `${barHeight}%` }} title={formatValue(item.value)} />
              <div className="text-[10px] text-[#8B8B8B] dark:text-neutral-500">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
