import { cn } from '@/lib/utils/cn';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && <label className="block text-sm font-medium text-ink">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-2xl border border-black/10 bg-white px-4 py-4 text-base text-ink outline-none transition',
            'placeholder:text-muted focus:border-bee focus:ring-2 focus:ring-bee/30',
            error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-sm text-muted">{hint}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
