'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { buildStoragePath, uploadFileWithProgress } from '@/lib/utils/storage';
import { cn } from '@/lib/utils/cn';

interface FileUploadProps {
  label: string;
  bucket: string;
  pathName: string;
  userId: string;
  value?: string;
  onChange: (value: string) => void;
  accept?: string;
  maxMB?: number;
  publicRead?: boolean;
  hint?: string;
  error?: string;
}

export function FileUpload({ label, bucket, pathName, userId, value, onChange, accept = 'image/*,application/pdf', maxMB = 10, publicRead = false, hint, error }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLocalError(null); setProgress(0);
    if (!file) return;
    if (file.size > maxMB * 1024 * 1024) { setLocalError(`El archivo no puede superar ${maxMB}MB.`); return; }
    try {
      setUploading(true);
      if (file.type.startsWith('image/')) setPreview(URL.createObjectURL(file));
      const path = buildStoragePath(userId, pathName, file);
      const result = await uploadFileWithProgress({ bucket, path, file, publicRead, onProgress: setProgress });
      onChange(publicRead && result.publicUrl ? result.publicUrl : result.path);
    } catch (err) { setLocalError(err instanceof Error ? err.message : 'Error al subir el archivo.'); }
    finally { setUploading(false); }
  };

  const finalError = error || localError;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">{label}</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
      <div className={cn('rounded-3xl border border-dashed p-4 transition', finalError ? 'border-red-400 bg-red-50' : 'border-black/10 bg-card')}>
        {preview || (publicRead && value) ? <img src={preview || value} alt={label} className="mb-4 h-40 w-full rounded-2xl object-cover" /> : null}
        {!preview && !publicRead && value ? <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-ink">Documento subido correctamente.</div> : null}
        <Button type="button" variant="secondary" className="w-full" loading={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Subiendo...' : value ? 'Sustituir archivo' : 'Subir archivo'}
        </Button>
        {uploading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-bee transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-muted">{progress}%</p>
          </div>
        )}
      </div>
      {hint && !finalError && <p className="text-sm text-muted">{hint}</p>}
      {finalError && <p className="text-sm text-red-600">{finalError}</p>}
    </div>
  );
}
