'use client';

import { useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, length = 6, disabled }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  const handleChange = (index: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) return;
    const next = chars.slice();
    next[index] = clean[0];
    const newValue = next.join('').slice(0, length);
    onChange(newValue);
    if (index < length - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !chars[index] && index > 0) inputsRef.current[index - 1]?.focus();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (pasted) onChange(pasted.slice(0, length));
  };

  return (
    <div className="flex justify-between gap-2">
      {chars.map((char, index) => (
        <input key={index} ref={el => { inputsRef.current[index] = el; }} value={char}
          onChange={e => handleChange(index, e.target.value)} onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste} disabled={disabled} inputMode="numeric" maxLength={1}
          className="h-14 w-12 rounded-2xl border border-black/10 bg-white text-center text-xl font-bold text-ink outline-none focus:border-bee focus:ring-2 focus:ring-bee/30" />
      ))}
    </div>
  );
}
