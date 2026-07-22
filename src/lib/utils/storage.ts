import { createClient } from '@/lib/supabase/client';

interface UploadParams {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (progress: number) => void;
  publicRead?: boolean;
}

interface UploadResult {
  path: string;
  publicUrl: string | null;
}

export function buildStoragePath(
  userId: string,
  name: string,
  file: File
): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  return `${userId}/${safeName}-${Date.now()}.${ext}`;
}

export async function uploadFileWithProgress({
  bucket,
  path,
  file,
  onProgress,
  publicRead = false,
}: UploadParams): Promise<UploadResult> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Debes iniciar sesión para subir archivos.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Faltan variables de entorno de Supabase.');
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `${url}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', 'true');

    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    }

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = 'Error al subir el archivo.';
        try {
          const parsed = JSON.parse(xhr.responseText);
          message = parsed?.message || parsed?.error || message;
        } catch {
          // ignore parse error
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));

    xhr.send(file);
  });

  if (publicRead) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  return { path, publicUrl: null };
}

export async function uploadImage({
  bucket,
  path,
  file,
  publicRead = true,
}: {
  bucket: string;
  path: string;
  file: File;
  publicRead?: boolean;
}): Promise<string> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    throw new Error('No pudimos subir la imagen. Inténtalo de nuevo.');
  }

  if (publicRead) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  return path;
}

export function buildImagePath(userId: string, name: string, file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  return `${userId}/${name}-${Date.now()}.${ext}`;
}
