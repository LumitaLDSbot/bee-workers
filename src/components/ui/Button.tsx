import { cn } from '@/lib/utils/cn';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-3xl px-6 py-4 text-base font-semibold transition-all',
          'disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary' && 'bg-bee text-ink shadow-soft hover:bg-bee-dark',
          variant === 'secondary' && 'bg-card text-ink hover:bg-black/5',
          variant === 'ghost' && 'bg-transparent text-ink hover:bg-black/5',
          variant === 'danger' && 'bg-red-100 text-red-700 hover:bg-red-200',
          className
        )}
        {...props}
      >
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
