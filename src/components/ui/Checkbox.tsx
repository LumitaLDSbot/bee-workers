import { cn } from '@/lib/utils/cn';
import { InputHTMLAttributes, forwardRef } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="flex items-start gap-3">
          <input ref={ref} type="checkbox" className={cn('mt-1 h-5 w-5 shrink-0 rounded border-black/20 text-bee accent-bee', className)} {...props} />
          <span className="text-sm leading-6 text-ink">{label}</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
