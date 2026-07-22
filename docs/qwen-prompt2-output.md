# Implementación completa: Autenticación y registro Bee Workers


Voy a implementar el sistema completo de autenticación y onboarding para Bee Workers con:


- Next.js 14 App Router
- Supabase Auth con Phone OTP + Email/Password fallback
- Supabase Storage con progreso
- Validación Zod
- Tailwind CSS mobile-first con identidad “abeja/hexágono”
- Rutas protegidas con middleware
- Disclaimer fiscal obligatorio para workers
- Tutorial integrado de IRS/SS/Finanças/Seguro


> Comisión de plataforma: **5%**  
> La plataforma **no retiene IRS ni Segurança Social**.


---


## 1. Instalación de dependencias


```bash
npm i @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers
npm i -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```


---


## 2. Variables de entorno


`.env.local`:


```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key


NEXT_PUBLIC_APP_URL=http://localhost:3000


# Opcional para geocoding
GOOGLE_GEOCODE_API_KEY=


# Si no hay Google, se usa Nominatim como fallback
```


---


## 3. Migración SQL mínima para onboarding


Ejecutar en Supabase SQL Editor si ya tienes el schema base de Bee Workers.


```sql
-- =====================================================
-- Extensión de tablas para onboarding/verificación
-- =====================================================


alter table public.users
  add column if not exists birth_date date,
  add column if not exists profile_photo_url text,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists fiscal_disclaimer_accepted_at timestamptz,
  add column if not exists terms_version text not null default 'v1';


alter table public.worker_profiles
  add column if not exists work_radius_km integer,
  add column if not exists document_type text,
  add column if not exists id_front_path text,
  add column if not exists selfie_doc_path text,
  add column if not exists nif_document_path text,
  add column if not exists atividade_path text,
  add column if not exists seguro_path text;


alter table public.employer_profiles
  add column if not exists logo_url text,
  add column if not exists nif_document_path text,
  add column if not exists verification_status text not null default 'pending';


-- Tabla de documentos de onboarding para revisión administrativa
create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  doc_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);


alter table public.onboarding_documents enable row level security;


drop policy if exists onboarding_documents_select_own on public.onboarding_documents;
create policy onboarding_documents_select_own
  on public.onboarding_documents
  for select
  to authenticated
  using (user_id = auth.uid());


-- Bucket para documentos de employers
insert into storage.buckets (id, name, public)
values ('employer-documents', 'employer-documents', false)
on conflict (id) do nothing;


alter table storage.objects enable row level security;


drop policy if exists employer_documents_owner_select on storage.objects;
create policy employer_documents_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'employer-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  );


drop policy if exists employer_documents_owner_insert on storage.objects;
create policy employer_documents_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'employer-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists employer_documents_owner_update on storage.objects;
create policy employer_documents_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'employer-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  )
  with check (
    bucket_id = 'employer-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists employer_documents_owner_delete on storage.objects;
create policy employer_documents_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'employer-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  );
```


---


# 4. Diseño visual / Tailwind


## `tailwind.config.ts`


```ts
import type { Config } from 'tailwindcss';


const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bee: {
          DEFAULT: '#FFB800',
          dark: '#E0A800',
        },
        ink: '#1A1A1A',
        cream: '#FFFAF0',
        card: '#F5F5F0',
        muted: '#8B8B8B',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(26, 26, 26, 0.08)',
        card: '0 6px 24px rgba(26, 26, 26, 0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};


export default config;
```


---


## `src/app/globals.css`


```css
@tailwind base;
@tailwind components;
@tailwind utilities;


:root {
  color-scheme: light;
}


body {
  @apply bg-cream text-ink font-sans antialiased;
}


/* Hexágono para avatars */
.hex-clip {
  clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%);
}


/* Patrón hexagonal sutil */
.hex-pattern {
  background-color: #fffaF0;
  background-image: url("data:image/svg+xml,%3Csvg width='56' height='100' viewBox='0 0 56 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23FFB800' stroke-opacity='0.08' stroke-width='2'/%3E%3C/svg%3E");
  background-size: 56px 100px;
}


.no-scrollbar::-webkit-scrollbar {
  display: none;
}


.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```


---


## `src/app/layout.tsx`


```tsx
import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';


const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});


export const metadata: Metadata = {
  title: 'Bee Workers',
  description: 'Turnos puntuales en hostelería y restauración en Porto',
  manifest: '/manifest.webmanifest',
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={spaceGrotesk.variable}>
      <body className="min-h-screen bg-cream text-ink">{children}</body>
    </html>
  );
}
```


---


# 5. Tipos TypeScript


## `src/types/index.ts`


```ts
export type Role = 'worker' | 'employer' | 'both';


export type VerificationStatus = 'pending' | 'approved' | 'rejected';


export interface UserProfile {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  nif: string | null;
  role: Role;
  is_verified: boolean;
  onboarding_completed: boolean;
  verification_status: VerificationStatus;
  profile_photo_url: string | null;
  birth_date: string | null;
  terms_accepted_at: string | null;
  fiscal_disclaimer_accepted_at: string | null;
  terms_version: string;
}


export interface WorkerProfile {
  user_id: string;
  full_name: string | null;
  professions: string[];
  skills: string[];
  hourly_rate: number;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  rating_count: number;
  total_jobs: number;
  is_autonomo: boolean;
  niss: string | null;
  first_activity_at: string | null;
  is_social_security_exempt: boolean;
  seguro_vigente: boolean;
  seguro_expires_at: string | null;
  work_radius_km: number | null;
  document_type: string | null;
  id_front_path: string | null;
  selfie_doc_path: string | null;
  nif_document_path: string | null;
  atividade_path: string | null;
  seguro_path: string | null;
}


export interface EmployerProfile {
  user_id: string;
  company_name: string;
  nif_empresa: string | null;
  address: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  rating_count: number;
  total_shifts: number;
  logo_url: string | null;
  nif_document_path: string | null;
  verification_status: VerificationStatus;
}


export type ActionResult<T = undefined> =
  | { success: true; data?: T; redirect?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };


export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}
```


---


# 6. Constantes de negocio


## `src/lib/constants/options.ts`


```ts
export const PROFESSIONS = [
  'Camarero/a',
  'Ayudante de cocina',
  'Cocinero/a',
  'Barista',
  'Barman / Bartender',
  'Recepcionista',
  'Personal de limpieza',
  'Jefe/a de sala',
  'Cajero/a',
  'Repartidor/a',
] as const;


export const SKILLS = [
  'Bandeja',
  'TPV',
  'Atención al cliente',
  'Latte art',
  'Cocina fría',
  'Cocina caliente',
  'Inglés',
  'Español',
  'Portugués',
  'Trabajo en equipo',
  'Rapidez',
  'Experiencia en terraza',
] as const;


export const DOCUMENT_TYPES = [
  { value: 'cc', label: 'Cartão de Cidadão' },
  { value: 'passport', label: 'Pasaporte' },
] as const;


export const WORK_RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50] as const;


export const PLATFORM_COMMISSION_RATE = 0.05;
```


---


## `src/lib/constants/legal.ts`


```ts
export const LEGAL = {
  termsVersion: 'v1',
  fiscalDisclaimer: [
    'Recibes el bruto menos una comisión del 5% para Bee Workers.',
    'Tú eres responsable de declarar y pagar tu IRS y Segurança Social.',
    'Bee Workers no retiene impuestos ni actúa como empleador.',
    'La app muestra estimaciones orientativas, pero no sustituye asesoría fiscal.',
  ],
  workerResponsibilities: [
    'Emitir recibo verde por cada servicio facturado.',
    'Declarar IRS en Categoría B mediante Modelo 3 + Anexo B.',
    'Declarar Segurança Social trimestralmente cuando corresponda.',
    'Mantener actividad abierta nas Finanças.',
    'Mantener seguro de acidentes de trabalho vigente.',
  ],
  tutorial: {
    irs: [
      'El IRS de trabajadores independientes se declara anualmente con el Modelo 3.',
      'En régimen simplificado, normalmente tributa el 75% del rendimiento bruto.',
      'Debes incluir Anexo B para rendimientos de categoría B.',
      'Consulta el Portal das Finanças para confirmar plazos y obligaciones.',
    ],
    ss: [
      'La Segurança Social de trabajadores independientes se declara trimestralmente.',
      'La base habitual se calcula sobre el 70% del rendimiento relevante.',
      'El tipo general es 21,4% para trabalhadores independentes.',
      'Puedes existir exención durante los primeros 12 meses tras iniciar actividad.',
      'Gestiona tus declaraciones en seg-social.pt.',
    ],
    financas: [
      'Debes abrir actividad nas Finanças antes de facturar.',
      'Puedes hacerlo online en el Portal das Finanças.',
      'Selecciona categoría B / trabalhadores independentes.',
      'Verifica si aplicas exención de IVA por volumen de facturación inferior a 15.000€.',
    ],
    seguro: [
      'El seguro de acidentes de trabalho es obligatorio para trabajadores independientes.',
      'Puedes contratarlo en aseguradoras portuguesas autorizadas.',
      'Guarda el comprobante y la fecha de caducidad en tu perfil.',
      'Sin seguro vigente no deberías aceptar servicios.',
    ],
  },
} as const;
```


---


# 7. Utilidades


## `src/lib/utils/cn.ts`


```ts
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
```


---


## `src/lib/utils/errors.ts`


```ts
export function mapSupabaseError(error: { message?: string }): string {
  const message = error?.message?.toLowerCase() ?? '';


  if (message.includes('invalid login credentials')) {
    return 'Credenciales incorrectas. Revisa tus datos.';
  }


  if (message.includes('otp expired')) {
    return 'El código ha caducado. Solicita uno nuevo.';
  }


  if (message.includes('token has expired or is invalid')) {
    return 'El código es inválido o ha caducado.';
  }


  if (message.includes('phone not confirmed')) {
    return 'Tu teléfono todavía no está confirmado.';
  }


  if (message.includes('email not confirmed')) {
    return 'Tu email todavía no está confirmado.';
  }


  if (message.includes('rate limit exceeded')) {
    return 'Demasiados intentos. Espera unos minutos.';
  }


  if (message.includes('user not found')) {
    return 'No hemos encontrado una cuenta con esos datos.';
  }


  return 'Ha ocurrido un error. Inténtalo de nuevo en unos segundos.';
}
```


---


## `src/lib/utils/phone.ts`


```ts
export function normalizePhonePT(input: string): string {
  const digits = input.replace(/\D/g, '');


  if (digits.startsWith('351')) {
    return `+${digits}`;
  }


  if (digits.length === 9) {
    return `+351${digits}`;
  }


  if (input.trim().startsWith('+')) {
    return `+${digits}`;
  }


  return `+${digits}`;
}


export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
```


---


## `src/lib/utils/zod.ts`


```ts
import { ZodError } from 'zod';


export function getZodErrorMessage(error: ZodError): string {
  const flat = error.flatten();


  const fieldError = Object.values(flat.fieldErrors)
    .flat()
    .find(Boolean);


  if (fieldError) return fieldError;


  const formError = flat.formErrors.find(Boolean);
  if (formError) return formError;


  return 'Revisa los datos introducidos.';
}
```


---


## `src/lib/utils/storage.ts`


```ts
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
```


---


# 8. Supabase clients


## `src/lib/supabase/client.ts`


```ts
import { createBrowserClient } from '@supabase/ssr';


export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```


---


## `src/lib/supabase/server.ts`


```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';


export function createServerSupabaseClient() {
  const cookieStore = cookies();


  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```


---


## `src/lib/supabase/admin.ts`


```ts
import { createClient } from '@supabase/supabase-js';


export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```


---


## `src/lib/supabase/middleware.ts`


```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { UserProfile } from '@/types';


function getRoleHome(profile: UserProfile): string {
  if (profile.role === 'employer') return '/app/employer';
  return '/app/worker';
}


export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });


  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );


  const {
    data: { user },
  } = await supabase.auth.getUser();


  const { pathname } = request.nextUrl;


  const publicPaths = ['/', '/login', '/register'];
  const isPublic = publicPaths.includes(pathname);


  if (!user) {
    if (pathname.startsWith('/app') || pathname.startsWith('/verification-pending')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }


    return response;
  }


  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<UserProfile>();


  const metadataRole = user.user_metadata?.role as string | undefined;
  const effectiveRole = profile?.role ?? metadataRole ?? 'worker';


  if (isPublic) {
    const url = request.nextUrl.clone();


    if (!profile || !profile.onboarding_completed) {
      url.pathname = `/onboarding/${effectiveRole === 'employer' ? 'employer' : 'worker'}`;
      return NextResponse.redirect(url);
    }


    if (profile.verification_status !== 'approved') {
      url.pathname = '/verification-pending';
      return NextResponse.redirect(url);
    }


    url.pathname = getRoleHome(profile);
    return NextResponse.redirect(url);
  }


  if (pathname.startsWith('/onboarding')) {
    if (profile?.onboarding_completed) {
      const url = request.nextUrl.clone();


      if (profile.verification_status !== 'approved') {
        url.pathname = '/verification-pending';
      } else {
        url.pathname = getRoleHome(profile);
      }


      return NextResponse.redirect(url);
    }


    return response;
  }


  if (pathname.startsWith('/app')) {
    if (!profile || !profile.onboarding_completed) {
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding/${effectiveRole === 'employer' ? 'employer' : 'worker'}`;
      return NextResponse.redirect(url);
    }


    if (profile.verification_status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/verification-pending';
      return NextResponse.redirect(url);
    }


    return response;
  }


  if (pathname.startsWith('/verification-pending')) {
    if (profile?.verification_status === 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = getRoleHome(profile);
      return NextResponse.redirect(url);
    }


    return response;
  }


  return response;
}
```


---


## `src/middleware.ts`


```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';


export async function middleware(request: NextRequest) {
  return updateSession(request);
}


export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|css|js|ico)).*)',
  ],
};
```


---


# 9. Validaciones Zod


## `src/lib/validations/onboarding.ts`


```ts
import { z } from 'zod';
import { normalizePhonePT, isValidE164 } from '@/lib/utils/phone';


function calculateAge(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();


  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();


  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < date.getDate())
  ) {
    age--;
  }


  return age;
}


export const phoneSchema = z
  .string()
  .min(9, 'Introduce tu número de teléfono')
  .transform(normalizePhonePT)
  .refine(isValidE164, 'Introduce un teléfono válido, por ejemplo +351912345678');


export const otpSchema = z.object({
  otp: z.string().length(6, 'El código tiene 6 dígitos'),
});


export const workerPersonalSchema = z.object({
  fullName: z.string().min(2, 'Introduce tu nombre completo'),
  email: z.string().email('Introduce un email válido'),
  nif: z
    .string()
    .regex(/^\d{9}$/, 'El NIF debe tener 9 dígitos'),
  niss: z
    .string()
    .optional()
    .refine(value => !value || /^\d{11}$/.test(value), 'El NISS debe tener 11 dígitos'),
  birthDate: z
    .string()
    .min(1, 'Selecciona tu fecha de nacimiento')
    .refine(value => !isNaN(Date.parse(value)), 'Fecha inválida')
    .refine(value => calculateAge(value) >= 18, 'Debes ser mayor de 18 años'),
});


export const workerPhotoSchema = z.object({
  profilePhotoUrl: z.string().url('Sube una foto de perfil válida'),
});


export const workerProfessionsSchema = z.object({
  professions: z.array(z.string()).min(1, 'Selecciona al menos una profesión'),
  skills: z.array(z.string()).default([]),
});


export const workerIdentitySchema = z.object({
  documentType: z.enum(['cc', 'passport'], {
    errorMap: () => ({ message: 'Selecciona un tipo de documento' }),
  }),
  idFrontPath: z.string().min(1, 'Sube la foto frontal del documento'),
  selfieDocPath: z.string().min(1, 'Sube una selfie con el documento'),
  nifDocumentPath: z.string().min(1, 'Sube el comprobante de NIF'),
});


export const workerAutonomousSchema = z.object({
  atividadePath: z.string().min(1, 'Sube el comprobante de actividad abierta'),
  seguroPath: z.string().min(1, 'Sube el comprobante del seguro'),
  seguroExpiresAt: z
    .string()
    .min(1, 'Indica la fecha de caducidad del seguro')
    .refine(value => !isNaN(Date.parse(value)), 'Fecha inválida')
    .refine(value => new Date(value) > new Date(), 'El seguro debe estar vigente'),
});


export const workerPricingSchema = z.object({
  hourlyRate: z.coerce
    .number({
      required_error: 'Introduce tu precio por hora',
      invalid_type_error: 'Introduce un número válido',
    })
    .min(0.1, 'Introduce un precio por hora válido')
    .max(500, 'Precio demasiado alto'),
  workRadiusKm: z.coerce
    .number({
      required_error: 'Selecciona tu radio de trabajo',
      invalid_type_error: 'Introduce un número válido',
    })
    .min(1, 'Radio mínimo 1 km')
    .max(100, 'Radio máximo 100 km'),
});


export const workerTermsSchema = z.object({
  acceptTerms: z.boolean().refine(value => value === true, {
    message: 'Debes aceptar los Términos y Condiciones',
  }),
  acceptFiscal: z.boolean().refine(value => value === true, {
    message: 'Debes confirmar que entiendes tus obligaciones fiscales',
  }),
});


export const workerRegistrationSchema = workerPersonalSchema
  .merge(workerPhotoSchema)
  .merge(workerProfessionsSchema)
  .merge(workerIdentitySchema)
  .merge(workerAutonomousSchema)
  .merge(workerPricingSchema)
  .merge(workerTermsSchema);


export type WorkerPersonalValues = z.infer<typeof workerPersonalSchema>;
export type WorkerPhotoValues = z.infer<typeof workerPhotoSchema>;
export type WorkerProfessionsValues = z.infer<typeof workerProfessionsSchema>;
export type WorkerIdentityValues = z.infer<typeof workerIdentitySchema>;
export type WorkerAutonomousValues = z.infer<typeof workerAutonomousSchema>;
export type WorkerPricingValues = z.infer<typeof workerPricingSchema>;
export type WorkerTermsValues = z.infer<typeof workerTermsSchema>;
export type WorkerRegistrationValues = z.infer<typeof workerRegistrationSchema>;


export const employerCompanySchema = z.object({
  companyName: z.string().min(2, 'Introduce el nombre de la empresa'),
  nifEmpresa: z.string().regex(/^\d{9}$/, 'El NIF de empresa debe tener 9 dígitos'),
  email: z.string().email('Introduce un email válido'),
  contactPhone: phoneSchema,
});


export const employerAddressSchema = z.object({
  address: z.string().min(5, 'Introduce una dirección completa'),
  latitude: z.number({
    required_error: 'Valida la dirección para obtener coordenadas',
    invalid_type_error: 'Coordenadas inválidas',
  }),
  longitude: z.number({
    required_error: 'Valida la dirección para obtener coordenadas',
    invalid_type_error: 'Coordenadas inválidas',
  }),
});


export const employerLogoSchema = z.object({
  logoUrl: z.string().url('Sube un logo válido'),
});


export const employerVerificationSchema = z.object({
  nifDocumentPath: z.string().min(1, 'Sube el documento de NIF de empresa'),
});


export const employerTermsSchema = z.object({
  acceptTerms: z.boolean().refine(value => value === true, {
    message: 'Debes aceptar los Términos y Condiciones',
  }),
});


export const employerRegistrationSchema = employerCompanySchema
  .merge(employerAddressSchema)
  .merge(employerLogoSchema)
  .merge(employerVerificationSchema)
  .merge(employerTermsSchema);


export type EmployerCompanyValues = z.infer<typeof employerCompanySchema>;
export type EmployerAddressValues = z.infer<typeof employerAddressSchema>;
export type EmployerLogoValues = z.infer<typeof employerLogoSchema>;
export type EmployerVerificationValues = z.infer<typeof employerVerificationSchema>;
export type EmployerTermsValues = z.infer<typeof employerTermsSchema>;
export type EmployerRegistrationValues = z.infer<typeof employerRegistrationSchema>;
```


---


# 10. Server Actions


## `src/server/actions/onboarding.actions.ts`


```ts
'use server';


import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getZodErrorMessage } from '@/lib/utils/zod';
import {
  workerRegistrationSchema,
  employerRegistrationSchema,
} from '@/lib/validations/onboarding';
import type { ActionResult, Role } from '@/types';
import { LEGAL } from '@/lib/constants/legal';


async function getAuthUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();


  return user;
}


function assertOwnPath(path: string, userId: string, label: string) {
  if (!path.startsWith(`${userId}/`)) {
    throw new Error(`Documento inválido: ${label}`);
  }
}


export async function startOnboarding(role: Role): Promise<ActionResult> {
  try {
    const user = await getAuthUser();


    if (!user) {
      return {
        success: false,
        error: 'Debes iniciar sesión antes de continuar.',
      };
    }


    const admin = createAdminClient();
    const now = new Date().toISOString();


    const { error } = await admin.from('users').upsert({
      id: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null,
      role,
      onboarding_completed: false,
      verification_status: 'pending',
      updated_at: now,
    });


    if (error) {
      return {
        success: false,
        error: 'No hemos podido preparar tu cuenta. Inténtalo de nuevo.',
      };
    }


    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        role,
      },
    });


    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Error inesperado al iniciar el registro.',
    };
  }
}


export async function ensureUserProfile(): Promise<ActionResult> {
  try {
    const user = await getAuthUser();


    if (!user) {
      return {
        success: false,
        error: 'Sesión no encontrada.',
      };
    }


    const admin = createAdminClient();


    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();


    if (existing) {
      return { success: true };
    }


    const role = (user.user_metadata?.role as Role) || 'worker';
    const now = new Date().toISOString();


    await admin.from('users').insert({
      id: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null,
      role,
      onboarding_completed: false,
      verification_status: 'pending',
      updated_at: now,
    });


    return { success: true };
  } catch {
    return {
      success: false,
      error: 'No hemos podido crear tu perfil básico.',
    };
  }
}


export async function completeWorkerRegistration(
  input: unknown
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();


    if (!user) {
      return {
        success: false,
        error: 'Debes iniciar sesión antes de completar el registro.',
      };
    }


    const parsed = workerRegistrationSchema.safeParse(input);


    if (!parsed.success) {
      return {
        success: false,
        error: getZodErrorMessage(parsed.error),
      };
    }


    const data = parsed.data;


    assertOwnPath(data.idFrontPath, user.id, 'documento frontal');
    assertOwnPath(data.selfieDocPath, user.id, 'selfie con documento');
    assertOwnPath(data.nifDocumentPath, user.id, 'comprobante de NIF');
    assertOwnPath(data.atividadePath, user.id, 'comprobante de actividad');
    assertOwnPath(data.seguroPath, user.id, 'comprobante de seguro');


    const admin = createAdminClient();
    const now = new Date().toISOString();


    const { error: userError } = await admin.from('users').upsert({
      id: user.id,
      full_name: data.fullName,
      email: data.email,
      nif: data.nif,
      birth_date: data.birthDate,
      profile_photo_url: data.profilePhotoUrl,
      role: 'worker',
      onboarding_completed: true,
      verification_status: 'pending',
      terms_accepted_at: now,
      fiscal_disclaimer_accepted_at: now,
      terms_version: LEGAL.termsVersion,
      updated_at: now,
    });


    if (userError) {
      return {
        success: false,
        error: 'No hemos podido guardar tus datos personales.',
      };
    }


    const { error: profileError } = await admin.from('worker_profiles').upsert({
      user_id: user.id,
      full_name: data.fullName,
      professions: data.professions,
      skills: data.skills,
      hourly_rate: data.hourlyRate,
      work_radius_km: data.workRadiusKm,
      is_autonomo: true,
      niss: data.niss || null,
      seguro_vigente: true,
      seguro_expires_at: data.seguroExpiresAt,
      document_type: data.documentType,
      id_front_path: data.idFrontPath,
      selfie_doc_path: data.selfieDocPath,
      nif_document_path: data.nifDocumentPath,
      atividade_path: data.atividadePath,
      seguro_path: data.seguroPath,
      updated_at: now,
    });


    if (profileError) {
      return {
        success: false,
        error: 'No hemos podido guardar tu perfil de trabajador.',
      };
    }


    const docs = [
      {
        user_id: user.id,
        doc_type: 'id_front',
        storage_bucket: 'worker-documents',
        storage_path: data.idFrontPath,
      },
      {
        user_id: user.id,
        doc_type: 'selfie_doc',
        storage_bucket: 'worker-documents',
        storage_path: data.selfieDocPath,
      },
      {
        user_id: user.id,
        doc_type: 'nif',
        storage_bucket: 'worker-documents',
        storage_path: data.nifDocumentPath,
      },
      {
        user_id: user.id,
        doc_type: 'atividade',
        storage_bucket: 'worker-documents',
        storage_path: data.atividadePath,
      },
      {
        user_id: user.id,
        doc_type: 'seguro',
        storage_bucket: 'worker-documents',
        storage_path: data.seguroPath,
      },
    ];


    await admin.from('onboarding_documents').insert(docs);


    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        role: 'worker',
        full_name: data.fullName,
        onboarding_completed: true,
      },
    });


    return {
      success: true,
      redirect: '/verification-pending',
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Error inesperado al completar el registro.',
    };
  }
}


export async function completeEmployerRegistration(
  input: unknown
): Promise<ActionResult> {
  try {
    const user = await getAuthUser();


    if (!user) {
      return {
        success: false,
        error: 'Debes iniciar sesión antes de completar el registro.',
      };
    }


    const parsed = employerRegistrationSchema.safeParse(input);


    if (!parsed.success) {
      return {
        success: false,
        error: getZodErrorMessage(parsed.error),
      };
    }


    const data = parsed.data;


    assertOwnPath(data.nifDocumentPath, user.id, 'NIF de empresa');


    const admin = createAdminClient();
    const now = new Date().toISOString();


    const { error: userError } = await admin.from('users').upsert({
      id: user.id,
      full_name: data.companyName,
      email: data.email,
      phone: data.contactPhone,
      role: 'employer',
      profile_photo_url: data.logoUrl,
      onboarding_completed: true,
      verification_status: 'pending',
      terms_accepted_at: now,
      terms_version: LEGAL.termsVersion,
      updated_at: now,
    });


    if (userError) {
      return {
        success: false,
        error: 'No hemos podido guardar tus datos de empresa.',
      };
    }


    const { error: profileError } = await admin.from('employer_profiles').upsert({
      user_id: user.id,
      company_name: data.companyName,
      nif_empresa: data.nifEmpresa,
      address: data.address,
      location: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      logo_url: data.logoUrl,
      nif_document_path: data.nifDocumentPath,
      verification_status: 'pending',
      updated_at: now,
    });


    if (profileError) {
      return {
        success: false,
        error: 'No hemos podido guardar tu perfil de empresa.',
      };
    }


    await admin.from('onboarding_documents').insert({
      user_id: user.id,
      doc_type: 'employer_nif',
      storage_bucket: 'employer-documents',
      storage_path: data.nifDocumentPath,
    });


    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        role: 'employer',
        company_name: data.companyName,
        onboarding_completed: true,
      },
    });


    return {
      success: true,
      redirect: '/verification-pending',
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Error inesperado al completar el registro.',
    };
  }
}
```


---


## `src/server/actions/geocode.actions.ts`


```ts
'use server';


import type { ActionResult, GeocodeResult } from '@/types';


export async function geocodeAddressAction(
  address: string
): Promise<ActionResult<GeocodeResult>> {
  try {
    if (!address || address.trim().length < 5) {
      return {
        success: false,
        error: 'Introduce una dirección completa.',
      };
    }


    const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;


    if (googleKey) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', googleKey);


      const res = await fetch(url.toString(), {
        cache: 'no-store',
      });


      const json = await res.json();


      if (json.status !== 'OK' || !json.results?.[0]) {
        return {
          success: false,
          error: 'No hemos podido validar la dirección. Revisa los datos.',
        };
      }


      const result = json.results[0];


      return {
        success: true,
        data: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          formattedAddress: result.formatted_address,
        },
      };
    }


    // Fallback: Nominatim OpenStreetMap
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');


    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'BeeWorkersOnboarding',
      },
      cache: 'no-store',
    });


    const json = await res.json();


    if (!Array.isArray(json) || json.length === 0) {
      return {
        success: false,
        error: 'No hemos podido validar la dirección. Revisa los datos.',
      };
    }


    return {
      success: true,
      data: {
        lat: parseFloat(json[0].lat),
        lng: parseFloat(json[0].lon),
        formattedAddress: json[0].display_name,
      },
    };
  } catch {
    return {
      success: false,
      error: 'Error al validar la dirección. Inténtalo de nuevo.',
    };
  }
}
```


---


# 11. Hooks personalizados


## `src/hooks/use-auth.ts`


```ts
'use client';


import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureUserProfile, startOnboarding } from '@/server/actions/onboarding.actions';
import { mapSupabaseError } from '@/lib/utils/errors';
import type { Role, UserProfile } from '@/types';


export function useAuth() {
  const supabase = createClient();


  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();


    if (!user) {
      setProfile(null);
      return null;
    }


    let { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<UserProfile>();


    if (!data) {
      await ensureUserProfile();


      const retry = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle<UserProfile>();


      data = retry.data;
    }


    setProfile(data ?? null);
    return data ?? null;
  }, [supabase]);


  useEffect(() => {
    let active = true;


    async function init() {
      setLoading(true);


      const {
        data: { session },
      } = await supabase.auth.getSession();


      if (!active) return;


      setUser(session?.user ?? null);


      if (session?.user) {
        await fetchProfile();
      }


      if (active) {
        setLoading(false);
      }
    }


    init();


    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);


      if (session?.user) {
        await fetchProfile();
      } else {
        setProfile(null);
      }
    });


    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase.auth]);


  const sendPhoneOtp = useCallback(
    async (phone: string, role?: Role) => {
      setError(null);


      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: true,
          data: role ? { role } : undefined,
        },
      });


      if (error) {
        const message = mapSupabaseError(error);
        setError(message);
        throw new Error(message);
      }
    },
    [supabase.auth]
  );


  const verifyPhoneOtp = useCallback(
    async (phone: string, token: string, role?: Role) => {
      setError(null);


      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });


      if (error) {
        const message = mapSupabaseError(error);
        setError(message);
        throw new Error(message);
      }


      if (role) {
        await startOnboarding(role);
      }


      setUser(data.user);
      await fetchProfile();


      return data;
    },
    [supabase.auth, fetchProfile]
  );


  const signInWithEmailPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);


      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });


      if (error) {
        const message = mapSupabaseError(error);
        setError(message);
        throw new Error(message);
      }


      setUser(data.user);
      await fetchProfile();


      return data;
    },
    [supabase.auth, fetchProfile]
  );


  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase.auth]);


  const refreshProfile = useCallback(async () => {
    return fetchProfile();
  }, [fetchProfile]);


  return {
    user,
    profile,
    loading,
    error,
    sendPhoneOtp,
    verifyPhoneOtp,
    signInWithEmailPassword,
    signOut,
    refreshProfile,
  };
}
```


---


## `src/hooks/use-registration.ts`


```ts
'use client';


import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  completeEmployerRegistration,
  completeWorkerRegistration,
} from '@/server/actions/onboarding.actions';
import type { Role } from '@/types';


type RegistrationData = Record<string, unknown>;


export function useRegistration(role: Role) {
  const router = useRouter();


  const [step, setStep] = useState(0);
  const [data, setData] = useState<RegistrationData>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);


  const updateData = useCallback((patch: RegistrationData) => {
    setData(prev => ({
      ...prev,
      ...patch,
    }));
  }, []);


  const next = useCallback(() => {
    setSubmitError(null);
    setStep(prev => prev + 1);
  }, []);


  const back = useCallback(() => {
    setSubmitError(null);
    setStep(prev => Math.max(0, prev - 1));
  }, []);


  const goToStep = useCallback((index: number) => {
    setSubmitError(null);
    setStep(index);
  }, []);


  const submitWorker = useCallback(
    async (extra?: RegistrationData) => {
      setSubmitting(true);
      setSubmitError(null);


      const payload = {
        ...data,
        ...extra,
      };


      const result = await completeWorkerRegistration(payload);


      setSubmitting(false);


      if (!result.success) {
        setSubmitError(result.error);
        return result;
      }


      setShowTutorial(true);
      return result;
    },
    [data]
  );


  const submitEmployer = useCallback(
    async (extra?: RegistrationData) => {
      setSubmitting(true);
      setSubmitError(null);


      const payload = {
        ...data,
        ...extra,
      };


      const result = await completeEmployerRegistration(payload);


      setSubmitting(false);


      if (!result.success) {
        setSubmitError(result.error);
        return result;
      }


      router.push('/verification-pending');
      return result;
    },
    [data, router]
  );


  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    router.push('/verification-pending');
  }, [router]);


  return {
    role,
    step,
    data,
    submitting,
    submitError,
    showTutorial,
    updateData,
    next,
    back,
    goToStep,
    submitWorker,
    submitEmployer,
    closeTutorial,
  };
}
```


---


# 12. Componentes UI base


## `src/components/ui/Button.tsx`


```tsx
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
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
        )}
        {children}
      </button>
    );
  }
);


Button.displayName = 'Button';
```


---


## `src/components/ui/Input.tsx`


```tsx
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
        {label && (
          <label className="block text-sm font-medium text-ink">{label}</label>
        )}


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
```


---


## `src/components/ui/Checkbox.tsx`


```tsx
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
          <input
            ref={ref}
            type="checkbox"
            className={cn(
              'mt-1 h-5 w-5 shrink-0 rounded border-black/20 text-bee accent-bee',
              className
            )}
            {...props}
          />
          <span className="text-sm leading-6 text-ink">{label}</span>
        </label>


        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);


Checkbox.displayName = 'Checkbox';
```


---


## `src/components/ui/Card.tsx`


```tsx
import { cn } from '@/lib/utils/cn';


export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-4xl border border-black/5 bg-white p-5 shadow-card',
        className
      )}
    >
      {children}
    </div>
  );
}
```


---


## `src/components/ui/StepShell.tsx`


```tsx
import { Button } from '@/components/ui/Button';


interface StepShellProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}


export function StepShell({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  onBack,
  children,
}: StepShellProps) {
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);


  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-6">
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} className="px-3 py-2">
              ← Volver
            </Button>
          ) : (
            <span />
          )}


          <span className="text-sm font-medium text-muted">
            {stepIndex + 1} de {totalSteps}
          </span>
        </div>


        <div className="h-2 w-full overflow-hidden rounded-full bg-card">
          <div
            className="h-full rounded-full bg-bee transition-all"
            style={{ width: `${progress}%` }}
          />
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
```


---


## `src/components/ui/OtpInput.tsx`


```tsx
'use client';


import { useRef } from 'react';


interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}


export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);


  const chars = Array.from({ length }, (_, i) => value[i] ?? '');


  const handleChange = (index: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) return;


    const next = chars.slice();
    next[index] = clean[0];


    const newValue = next.join('').slice(0, length);
    onChange(newValue);


    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };


  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Backspace' && !chars[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };


  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (pasted) {
      onChange(pasted.slice(0, length));
    }
  };


  return (
    <div className="flex justify-between gap-2">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={el => {
            inputsRef.current[index] = el;
          }}
          value={char}
          onChange={e => handleChange(index, e.target.value)}
          onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          className="h-14 w-12 rounded-2xl border border-black/10 bg-white text-center text-xl font-bold text-ink outline-none focus:border-bee focus:ring-2 focus:ring-bee/30"
        />
      ))}
    </div>
  );
}
```


---


## `src/components/ui/FileUpload.tsx`


```tsx
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


export function FileUpload({
  label,
  bucket,
  pathName,
  userId,
  value,
  onChange,
  accept = 'image/*,application/pdf',
  maxMB = 10,
  publicRead = false,
  hint,
  error,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);


  const handleFile = async (file: File) => {
    setLocalError(null);
    setProgress(0);


    if (!file) return;


    if (file.size > maxMB * 1024 * 1024) {
      setLocalError(`El archivo no puede superar ${maxMB}MB.`);
      return;
    }


    try {
      setUploading(true);


      if (file.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(file));
      }


      const path = buildStoragePath(userId, pathName, file);


      const result = await uploadFileWithProgress({
        bucket,
        path,
        file,
        publicRead,
        onProgress: setProgress,
      });


      onChange(publicRead && result.publicUrl ? result.publicUrl : result.path);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Error al subir el archivo.'
      );
    } finally {
      setUploading(false);
    }
  };


  const finalError = error || localError;


  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">{label}</p>


      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />


      <div
        className={cn(
          'rounded-3xl border border-dashed p-4 transition',
          finalError ? 'border-red-400 bg-red-50' : 'border-black/10 bg-card'
        )}
      >
        {preview || (publicRead && value) ? (
          <img
            src={preview || value}
            alt={label}
            className="mb-4 h-40 w-full rounded-2xl object-cover"
          />
        ) : null}


        {!preview && !publicRead && value ? (
          <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-ink">
            Documento subido correctamente.
          </div>
        ) : null}


        <Button
          type="button"
          variant="secondary"
          className="w-full"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo...' : value ? 'Sustituir archivo' : 'Subir archivo'}
        </Button>


        {uploading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-bee transition-all"
                style={{ width: `${progress}%` }}
              />
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
```


---


## `src/components/ui/HexAvatar.tsx`


```tsx
import { cn } from '@/lib/utils/cn';


interface HexAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  fallback?: string;
}


export function HexAvatar({
  src,
  alt = 'Avatar',
  size = 56,
  fallback = 'BW',
}: HexAvatarProps) {
  return (
    <div
      className="hex-clip flex items-center justify-center overflow-hidden bg-bee font-bold text-ink"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span className={cn('text-sm')}>{fallback}</span>
      )}
    </div>
  );
}
```


---


## `src/components/ui/TutorialModal.tsx`


```tsx
'use client';


import { Button } from '@/components/ui/Button';
import { LEGAL } from '@/lib/constants/legal';


interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}


function TutorialSection({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <details className="group rounded-3xl border border-black/5 bg-card p-4">
      <summary className="cursor-pointer list-none text-base font-semibold text-ink">
        {title}
      </summary>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
        {items.map(item => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-bee" />
            <span>{item}</span>
          </li>
        ))}
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
          <p className="mt-2 text-sm leading-6 text-muted">
            Bee Workers no retiene impuestos. Tú gestionas tus obligaciones como
            trabalhador independente.
          </p>
        </div>


        <div className="space-y-3">
          <TutorialSection title="Cómo declarar IRS (Categoría B)" items={LEGAL.tutorial.irs} />
          <TutorialSection title="Cómo declarar Segurança Social" items={LEGAL.tutorial.ss} />
          <TutorialSection title="Abrir actividad nas Finanças" items={LEGAL.tutorial.financas} />
          <TutorialSection title="Seguro de acidentes de trabalho" items={LEGAL.tutorial.seguro} />
        </div>


        <Button className="mt-6 w-full" onClick={onClose}>
          Entendido, continuar
        </Button>
      </div>
    </div>
  );
}
```


---


## `src/components/ui/AddressInput.tsx`


```tsx
'use client';


import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { geocodeAddressAction } from '@/server/actions/geocode.actions';


interface AddressInputProps {
  address: string;
  latitude?: number;
  longitude?: number;
  onChange: (value: {
    address: string;
    latitude: number | undefined;
    longitude: number | undefined;
  }) => void;
  error?: string;
}


export function AddressInput({
  address,
  latitude,
  longitude,
  onChange,
  error,
}: AddressInputProps) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [validated, setValidated] = useState(Boolean(latitude && longitude));


  const handleValidate = async () => {
    setLoading(true);
    setLocalError(null);
    setValidated(false);


    const result = await geocodeAddressAction(address);


    setLoading(false);


    if (!result.success || !result.data) {
      setLocalError(result.success ? 'No se pudo validar la dirección.' : result.error);
      onChange({
        address,
        latitude: undefined,
        longitude: undefined,
      });
      return;
    }


    setValidated(true);
    onChange({
      address: result.data.formattedAddress,
      latitude: result.data.lat,
      longitude: result.data.lng,
    });
  };


  return (
    <div className="space-y-3">
      <Input
        label="Dirección del establecimiento"
        placeholder="Rua de Santa Catarina, Porto"
        value={address}
        onChange={e => {
          setValidated(false);
          onChange({
            address: e.target.value,
            latitude: undefined,
            longitude: undefined,
          });
        }}
      />


      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loading}
        onClick={handleValidate}
      >
        Validar dirección
      </Button>


      {validated && latitude && longitude && (
        <div className="rounded-2xl bg-card px-4 py-3 text-sm text-ink">
          Dirección validada: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </div>
      )}


      {(error || localError) && (
        <p className="text-sm text-red-600">{error || localError}</p>
      )}
    </div>
  );
}
```


---


# 13. Página de login


## `src/app/login/page.tsx`


```tsx
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';


export default function LoginPage() {
  return <LoginForm />;
}
```


---


## `src/components/auth/LoginForm.tsx`


```tsx
'use client';


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { Card } from '@/components/ui/Card';
import { phoneSchema } from '@/lib/validations/onboarding';
import type { UserProfile } from '@/types';


const phoneFormSchema = z.object({
  phone: phoneSchema,
});


const emailFormSchema = z.object({
  email: z.string().email('Introduce un email válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});


type PhoneFormValues = z.infer<typeof phoneFormSchema>;
type EmailFormValues = z.infer<typeof emailFormSchema>;


function redirectByProfile(router: useRouter, profile: UserProfile | null) {
  if (!profile) {
    router.push('/register');
    return;
  }


  if (!profile.onboarding_completed) {
    router.push(`/onboarding/${profile.role === 'employer' ? 'employer' : 'worker'}`);
    return;
  }


  if (profile.verification_status !== 'approved') {
    router.push('/verification-pending');
    return;
  }


  router.push(profile.role === 'employer' ? '/app/employer' : '/app/worker');
}


export function LoginForm() {
  const router = useRouter();
  const auth = useAuth();


  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [otpSent, setOtpSent] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: {
      phone: '',
    },
  });


  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });


  const handleSendOtp = async (values: PhoneFormValues) => {
    setLoading(true);
    setError(null);


    try {
      await auth.sendPhoneOtp(values.phone);
      setVerifiedPhone(values.phone);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el código.');
    } finally {
      setLoading(false);
    }
  };


  const handleVerifyOtp = async () => {
    if (!verifiedPhone) return;


    setLoading(true);
    setError(null);


    try {
      await auth.verifyPhoneOtp(verifiedPhone, otp);
      const profile = await auth.refreshProfile();
      redirectByProfile(router, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };


  const handleEmailLogin = async (values: EmailFormValues) => {
    setLoading(true);
    setError(null);


    try {
      await auth.signInWithEmailPassword(values.email, values.password);
      const profile = await auth.refreshProfile();
      redirectByProfile(router, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-bee text-2xl font-black">
            BW
          </div>
          <h1 className="text-3xl font-bold">Bee Workers</h1>
          <p className="mt-2 text-muted">
            Turnos puntuales en hostelería y restauración
          </p>
        </div>


        <Card>
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-3xl bg-card p-1">
            <button
              type="button"
              onClick={() => {
                setMode('phone');
                setError(null);
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mode === 'phone' ? 'bg-white shadow-card' : 'text-muted'
              }`}
            >
              Teléfono
            </button>


            <button
              type="button"
              onClick={() => {
                setMode('email');
                setError(null);
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mode === 'email' ? 'bg-white shadow-card' : 'text-muted'
              }`}
            >
              Email
            </button>
          </div>


          {mode === 'phone' ? (
            <div className="space-y-4">
              {!otpSent ? (
                <form
                  onSubmit={phoneForm.handleSubmit(handleSendOtp)}
                  className="space-y-4"
                >
                  <Input
                    label="Teléfono"
                    placeholder="+351 912 345 678"
                    {...phoneForm.register('phone')}
                    error={phoneForm.formState.errors.phone?.message}
                  />


                  <Button type="submit" className="w-full" loading={loading}>
                    Enviar código
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted">
                    Introduce el código enviado a {verifiedPhone}.
                  </p>


                  <OtpInput value={otp} onChange={setOtp} disabled={loading} />


                  <Button
                    className="w-full"
                    loading={loading}
                    disabled={otp.length !== 6}
                    onClick={handleVerifyOtp}
                  >
                    Verificar código
                  </Button>


                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setError(null);
                    }}
                  >
                    Cambiar teléfono
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={emailForm.handleSubmit(handleEmailLogin)}
              className="space-y-4"
            >
              <Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                {...emailForm.register('email')}
                error={emailForm.formState.errors.email?.message}
              />


              <Input
                label="Contraseña"
                type="password"
                placeholder="••••••••"
                {...emailForm.register('password')}
                error={emailForm.formState.errors.password?.message}
              />


              <Button type="submit" className="w-full" loading={loading}>
                Entrar
              </Button>
            </form>
          )}


          {error && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </Card>


        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/register')}
            className="text-sm font-semibold text-ink underline decoration-bee decoration-2 underline-offset-4"
          >
            Crear cuenta nueva
          </button>
        </div>
      </div>
    </div>
  );
}
```


---


# 14. Página de selección de registro


## `src/app/register/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';


export default function RegisterPage() {
  const router = useRouter();


  const selectRole = (role: 'worker' | 'employer') => {
    localStorage.setItem('bw_role', role);
    router.push(`/onboarding/${role}`);
  };


  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Únete a Bee Workers</h1>
          <p className="mt-2 text-muted">
            Elige cómo quieres usar la plataforma
          </p>
        </div>


        <div className="space-y-4">
          <Card>
            <h2 className="text-xl font-bold">Soy trabajador/a</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Busca turnos puntuales en hostelería y restauración en Porto.
            </p>
            <Button className="mt-4 w-full" onClick={() => selectRole('worker')}>
              Registrarme como worker
            </Button>
          </Card>


          <Card>
            <h2 className="text-xl font-bold">Soy empleador</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Publica turnos y encuentra profesionales verificados.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => selectRole('employer')}
            >
              Registrarme como employer
            </Button>
          </Card>
        </div>


        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm font-semibold text-ink underline decoration-bee decoration-2 underline-offset-4"
          >
            Ya tengo cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
```


---


# 15. Onboarding Worker completo


## `src/app/onboarding/[role]/page.tsx`


```tsx
import { notFound } from 'next/navigation';
import { WorkerOnboarding } from '@/components/onboarding/worker/WorkerOnboarding';
import { EmployerOnboarding } from '@/components/onboarding/employer/EmployerOnboarding';


export default function OnboardingPage({
  params,
}: {
  params: { role: string };
}) {
  if (params.role !== 'worker' && params.role !== 'employer') {
    notFound();
  }


  if (params.role === 'worker') {
    return <WorkerOnboarding />;
  }


  return <EmployerOnboarding />;
}
```


---


## `src/components/onboarding/worker/WorkerOnboarding.tsx`


```tsx
'use client';


import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/use-auth';
import { useRegistration } from '@/hooks/use-registration';
import { startOnboarding } from '@/server/actions/onboarding.actions';
import { StepShell } from '@/components/ui/StepShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { FileUpload } from '@/components/ui/FileUpload';
import { TutorialModal } from '@/components/ui/TutorialModal';
import {
  workerPersonalSchema,
  workerPhotoSchema,
  workerProfessionsSchema,
  workerIdentitySchema,
  workerAutonomousSchema,
  workerPricingSchema,
  workerTermsSchema,
  type WorkerPersonalValues,
  type WorkerPhotoValues,
  type WorkerProfessionsValues,
  type WorkerIdentityValues,
  type WorkerAutonomousValues,
  type WorkerPricingValues,
  type WorkerTermsValues,
} from '@/lib/validations/onboarding';
import { PROFESSIONS, SKILLS, DOCUMENT_TYPES } from '@/lib/constants/options';
import { LEGAL } from '@/lib/constants/legal';


const TOTAL_STEPS = 8;


interface StepProps<T> {
  defaultValues: Partial<T>;
  onNext: (values: T) => void;
  onBack?: () => void;
  userId?: string;
}


function PhoneStep({
  onNext,
}: {
  onNext: (values: { phone: string }) => void;
}) {
  const auth = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const sendOtp = async () => {
    setLoading(true);
    setError(null);


    try {
      await auth.sendPhoneOtp(phone, 'worker');
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el código.');
    } finally {
      setLoading(false);
    }
  };


  const verifyOtp = async () => {
    setLoading(true);
    setError(null);


    try {
      await auth.verifyPhoneOtp(phone, otp, 'worker');
      await startOnboarding('worker');
      onNext({ phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };


  if (auth.user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Ya tienes una sesión iniciada. Puedes continuar con tu registro.
        </p>
        <Button
          className="w-full"
          onClick={async () => {
            await startOnboarding('worker');
            onNext({ phone: auth.user.phone || '' });
          }}
        >
          Continuar
        </Button>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {!otpSent ? (
        <>
          <Input
            label="Teléfono"
            placeholder="+351 912 345 678"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <Button className="w-full" loading={loading} onClick={sendOtp}>
            Enviar código
          </Button>
        </>
      ) : (
        <>
          <Input
            label="Código de 6 dígitos"
            placeholder="123456"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
          />
          <Button
            className="w-full"
            loading={loading}
            disabled={otp.length !== 6}
            onClick={verifyOtp}
          >
            Verificar
          </Button>
        </>
      )}


      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}


function PersonalDataStep({ defaultValues, onNext, onBack }: StepProps<WorkerPersonalValues>) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerPersonalValues>({
    resolver: zodResolver(workerPersonalSchema),
    defaultValues: defaultValues as WorkerPersonalValues,
  });


  return (
    <StepShell
      stepIndex={1}
      totalSteps={TOTAL_STEPS}
      title="Datos personales"
      subtitle="Necesitamos tus datos básicos para tu perfil profesional."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Input
          label="Nombre completo"
          placeholder="Ana Silva"
          {...register('fullName')}
          error={errors.fullName?.message}
        />


        <Input
          label="Email"
          type="email"
          placeholder="ana@email.com"
          {...register('email')}
          error={errors.email?.message}
        />


        <Input
          label="NIF"
          placeholder="123456789"
          maxLength={9}
          {...register('nif')}
          error={errors.nif?.message}
        />


        <Input
          label="NISS (opcional)"
          placeholder="12345678901"
          maxLength={11}
          {...register('niss')}
          error={errors.niss?.message}
          hint="Si ya lo tienes, añádelo ahora."
        />


        <Input
          label="Fecha de nacimiento"
          type="date"
          {...register('birthDate')}
          error={errors.birthDate?.message}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function PhotoStep({
  defaultValues,
  onNext,
  onBack,
  userId,
}: StepProps<WorkerPhotoValues>) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerPhotoValues>({
    resolver: zodResolver(workerPhotoSchema),
    defaultValues: defaultValues as WorkerPhotoValues,
  });


  return (
    <StepShell
      stepIndex={2}
      totalSteps={TOTAL_STEPS}
      title="Foto de perfil"
      subtitle="Una foto clara genera más confianza entre empleadores."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Controller
          control={control}
          name="profilePhotoUrl"
          render={({ field }) => (
            <FileUpload
              label="Foto de perfil"
              bucket="profile-photos"
              pathName="avatar"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              publicRead
              accept="image/png,image/jpeg,image/webp"
              hint="Formato recomendado: JPG o PNG."
              error={errors.profilePhotoUrl?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function ProfessionsSkillsStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<WorkerProfessionsValues>) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WorkerProfessionsValues>({
    resolver: zodResolver(workerProfessionsSchema),
    defaultValues: {
      professions: defaultValues.professions ?? [],
      skills: defaultValues.skills ?? [],
    },
  });


  const professions = watch('professions') || [];
  const skills = watch('skills') || [];


  const toggleProfession = (profession: string) => {
    const next = professions.includes(profession)
      ? professions.filter(p => p !== profession)
      : [...professions, profession];


    setValue('professions', next, { shouldValidate: true });
  };


  const toggleSkill = (skill: string) => {
    const next = skills.includes(skill)
      ? skills.filter(s => s !== skill)
      : [...skills, skill];


    setValue('skills', next, { shouldValidate: true });
  };


  return (
    <StepShell
      stepIndex={3}
      totalSteps={TOTAL_STEPS}
      title="Profesiones y skills"
      subtitle="Selecciona tus especialidades dentro de hostelería."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">Profesiones</p>
          <div className="flex flex-wrap gap-2">
            {PROFESSIONS.map(profession => (
              <button
                key={profession}
                type="button"
                onClick={() => toggleProfession(profession)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  professions.includes(profession)
                    ? 'bg-bee text-ink'
                    : 'bg-card text-muted'
                }`}
              >
                {profession}
              </button>
            ))}
          </div>
          {errors.professions && (
            <p className="text-sm text-red-600">{errors.professions.message}</p>
          )}
        </div>


        <div className="space-y-3">
          <p className="text-sm font-medium">Skills</p>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map(skill => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  skills.includes(skill)
                    ? 'bg-bee text-ink'
                    : 'bg-card text-muted'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>


        <Controller
          control={control}
          name="professions"
          render={() => <input type="hidden" />}
        />


        <Controller
          control={control}
          name="skills"
          render={() => <input type="hidden" />}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function IdentityStep({
  defaultValues,
  onNext,
  onBack,
  userId,
}: StepProps<WorkerIdentityValues>) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerIdentityValues>({
    resolver: zodResolver(workerIdentitySchema),
    defaultValues: defaultValues as WorkerIdentityValues,
  });


  return (
    <StepShell
      stepIndex={4}
      totalSteps={TOTAL_STEPS}
      title="Verificación de identidad"
      subtitle="Sube tu documento y una selfie con él. Solo se usa para verificación."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Tipo de documento</p>
          <select
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-4 text-base outline-none focus:border-bee"
            {...register('documentType')}
          >
            <option value="">Selecciona una opción</option>
            {DOCUMENT_TYPES.map(doc => (
              <option key={doc.value} value={doc.value}>
                {doc.label}
              </option>
            ))}
          </select>
          {errors.documentType && (
            <p className="text-sm text-red-600">{errors.documentType.message}</p>
          )}
        </div>


        <Controller
          control={control}
          name="idFrontPath"
          render={({ field }) => (
            <FileUpload
              label="Foto frontal del documento"
              bucket="worker-documents"
              pathName="id-front"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.idFrontPath?.message}
            />
          )}
        />


        <Controller
          control={control}
          name="selfieDocPath"
          render={({ field }) => (
            <FileUpload
              label="Selfie con el documento"
              bucket="worker-documents"
              pathName="selfie-doc"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.selfieDocPath?.message}
            />
          )}
        />


        <Controller
          control={control}
          name="nifDocumentPath"
          render={({ field }) => (
            <FileUpload
              label="Comprobante de NIF"
              bucket="worker-documents"
              pathName="nif"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.nifDocumentPath?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function AutonomousStep({
  defaultValues,
  onNext,
  onBack,
  userId,
}: StepProps<WorkerAutonomousValues>) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerAutonomousValues>({
    resolver: zodResolver(workerAutonomousSchema),
    defaultValues: defaultValues as WorkerAutonomousValues,
  });


  return (
    <StepShell
      stepIndex={5}
      totalSteps={TOTAL_STEPS}
      title="Verificación de autónomo"
      subtitle="Necesitamos comprobar que tienes actividad abierta y seguro vigente."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Controller
          control={control}
          name="atividadePath"
          render={({ field }) => (
            <FileUpload
              label="Comprobante de actividad aberta nas Finanças"
              bucket="worker-documents"
              pathName="atividade"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.atividadePath?.message}
            />
          )}
        />


        <Controller
          control={control}
          name="seguroPath"
          render={({ field }) => (
            <FileUpload
              label="Seguro de acidentes de trabalho"
              bucket="worker-documents"
              pathName="seguro"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.seguroPath?.message}
            />
          )}
        />


        <Input
          label="Caducidad del seguro"
          type="date"
          {...register('seguroExpiresAt')}
          error={errors.seguroExpiresAt?.message}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function PricingStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<WorkerPricingValues>) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerPricingValues>({
    resolver: zodResolver(workerPricingSchema),
    defaultValues: defaultValues as WorkerPricingValues,
  });


  return (
    <StepShell
      stepIndex={6}
      totalSteps={TOTAL_STEPS}
      title="Precio y radio de trabajo"
      subtitle="Tú decides tu tarifa. Bee Workers no impone precios."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Input
          label="Precio por hora (€)"
          type="number"
          step="0.5"
          placeholder="12"
          {...register('hourlyRate', { valueAsNumber: true })}
          error={errors.hourlyRate?.message}
        />


        <Input
          label="Radio de trabajo (km)"
          type="number"
          placeholder="10"
          {...register('workRadiusKm', { valueAsNumber: true })}
          error={errors.workRadiusKm?.message}
        />


        <div className="rounded-3xl bg-card p-4 text-sm leading-6 text-muted">
          Bee Workers cobra una comisión del 5% sobre el bruto del servicio.
          Tú recibes el bruto menos esa comisión y gestionas tus impuestos.
        </div>


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function TermsFiscalStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<WorkerTermsValues> & {
  onNext: (values: WorkerTermsValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkerTermsValues>({
    resolver: zodResolver(workerTermsSchema),
    defaultValues: {
      acceptTerms: false,
      acceptFiscal: false,
      ...defaultValues,
    },
  });


  return (
    <StepShell
      stepIndex={7}
      totalSteps={TOTAL_STEPS}
      title="Disclaimer fiscal y términos"
      subtitle="Lee atentamente cómo funciona Bee Workers antes de finalizar."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-5">
        <div className="space-y-3 rounded-3xl border border-bee/30 bg-bee/10 p-4">
          <p className="text-base font-bold">Importante</p>
          <ul className="space-y-2 text-sm leading-6 text-ink">
            {LEGAL.fiscalDisclaimer.map(item => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-bee" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>


        <Controller
          control={control}
          name="acceptFiscal"
          render={({ field }) => (
            <Checkbox
              label="Entiendo que soy responsable de mis obligaciones fiscales, IRS y Segurança Social."
              checked={field.value}
              onChange={field.onChange}
              error={errors.acceptFiscal?.message}
            />
          )}
        />


        <Controller
          control={control}
          name="acceptTerms"
          render={({ field }) => (
            <Checkbox
              label="Acepto los Términos y Condiciones y la Privacy Policy de Bee Workers."
              checked={field.value}
              onChange={field.onChange}
              error={errors.acceptTerms?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Completar registro
        </Button>
      </form>
    </StepShell>
  );
}


export function WorkerOnboarding() {
  const auth = useAuth();
  const registration = useRegistration('worker');


  useEffect(() => {
    localStorage.setItem('bw_role', 'worker');
  }, []);


  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bee/30 border-t-bee" />
      </div>
    );
  }


  const userId = auth.user?.id;


  if (registration.step === 0) {
    return (
      <StepShell
        stepIndex={0}
        totalSteps={TOTAL_STEPS}
        title="Registro de trabajador"
        subtitle="Primero verifica tu teléfono."
      >
        <PhoneStep
          onNext={values => {
            registration.updateData(values);
            registration.next();
          }}
        />
      </StepShell>
    );
  }


  if (registration.step === 1) {
    return (
      <PersonalDataStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 2) {
    if (!userId) {
      registration.goToStep(0);
      return null;
    }


    return (
      <PhotoStep
        defaultValues={registration.data}
        userId={userId}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 3) {
    return (
      <ProfessionsSkillsStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 4) {
    if (!userId) {
      registration.goToStep(0);
      return null;
    }


    return (
      <IdentityStep
        defaultValues={registration.data}
        userId={userId}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 5) {
    if (!userId) {
      registration.goToStep(0);
      return null;
    }


    return (
      <AutonomousStep
        defaultValues={registration.data}
        userId={userId}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 6) {
    return (
      <PricingStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  return (
    <>
      <TermsFiscalStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={async values => {
          await registration.submitWorker(values);
        }}
      />


      {registration.submitError && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-3xl bg-red-600 px-4 py-4 text-center text-sm font-medium text-white shadow-soft">
          {registration.submitError}
        </div>
      )}


      <TutorialModal
        open={registration.showTutorial}
        onClose={registration.closeTutorial}
      />
    </>
  );
}
```


---


# 16. Onboarding Employer completo


## `src/components/onboarding/employer/EmployerOnboarding.tsx`


```tsx
'use client';


import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/use-auth';
import { useRegistration } from '@/hooks/use-registration';
import { startOnboarding } from '@/server/actions/onboarding.actions';
import { StepShell } from '@/components/ui/StepShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { FileUpload } from '@/components/ui/FileUpload';
import { AddressInput } from '@/components/ui/AddressInput';
import {
  employerCompanySchema,
  employerAddressSchema,
  employerLogoSchema,
  employerVerificationSchema,
  employerTermsSchema,
  type EmployerCompanyValues,
  type EmployerAddressValues,
  type EmployerLogoValues,
  type EmployerVerificationValues,
  type EmployerTermsValues,
} from '@/lib/validations/onboarding';


const TOTAL_STEPS = 6;


interface StepProps<T> {
  defaultValues: Partial<T>;
  onNext: (values: T) => void;
  onBack?: () => void;
  userId?: string;
}


function PhoneStep({
  onNext,
}: {
  onNext: (values: { phone: string }) => void;
}) {
  const auth = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const sendOtp = async () => {
    setLoading(true);
    setError(null);


    try {
      await auth.sendPhoneOtp(phone, 'employer');
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar el código.');
    } finally {
      setLoading(false);
    }
  };


  const verifyOtp = async () => {
    setLoading(true);
    setError(null);


    try {
      await auth.verifyPhoneOtp(phone, otp, 'employer');
      await startOnboarding('employer');
      onNext({ phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };


  if (auth.user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Ya tienes una sesión iniciada. Puedes continuar con tu registro.
        </p>
        <Button
          className="w-full"
          onClick={async () => {
            await startOnboarding('employer');
            onNext({ phone: auth.user.phone || '' });
          }}
        >
          Continuar
        </Button>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {!otpSent ? (
        <>
          <Input
            label="Teléfono"
            placeholder="+351 912 345 678"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <Button className="w-full" loading={loading} onClick={sendOtp}>
            Enviar código
          </Button>
        </>
      ) : (
        <>
          <Input
            label="Código de 6 dígitos"
            placeholder="123456"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
          />
          <Button
            className="w-full"
            loading={loading}
            disabled={otp.length !== 6}
            onClick={verifyOtp}
          >
            Verificar
          </Button>
        </>
      )}


      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}


function CompanyStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<EmployerCompanyValues>) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployerCompanyValues>({
    resolver: zodResolver(employerCompanySchema),
    defaultValues: defaultValues as EmployerCompanyValues,
  });


  return (
    <StepShell
      stepIndex={1}
      totalSteps={TOTAL_STEPS}
      title="Datos de la empresa"
      subtitle="Información básica del establecimiento."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Input
          label="Nombre de la empresa"
          placeholder="Café Porto Ltda"
          {...register('companyName')}
          error={errors.companyName?.message}
        />


        <Input
          label="NIF de empresa"
          placeholder="123456789"
          maxLength={9}
          {...register('nifEmpresa')}
          error={errors.nifEmpresa?.message}
        />


        <Input
          label="Email"
          type="email"
          placeholder="empresa@email.com"
          {...register('email')}
          error={errors.email?.message}
        />


        <Input
          label="Teléfono de contacto"
          placeholder="+351 912 345 678"
          {...register('contactPhone')}
          error={errors.contactPhone?.message}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function AddressStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<EmployerAddressValues>) {
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployerAddressValues>({
    resolver: zodResolver(employerAddressSchema),
    defaultValues: {
      address: defaultValues.address ?? '',
      latitude: defaultValues.latitude,
      longitude: defaultValues.longitude,
    },
  });


  const address = watch('address');
  const latitude = watch('latitude');
  const longitude = watch('longitude');


  return (
    <StepShell
      stepIndex={2}
      totalSteps={TOTAL_STEPS}
      title="Dirección"
      subtitle="Ubicación del establecimiento en Porto."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <AddressInput
          address={address}
          latitude={latitude}
          longitude={longitude}
          onChange={({ address, latitude, longitude }) => {
            setValue('address', address, { shouldValidate: true });
            setValue('latitude', latitude, { shouldValidate: true });
            setValue('longitude', longitude, { shouldValidate: true });
          }}
          error={errors.address?.message || errors.latitude?.message || errors.longitude?.message}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function LogoStep({
  defaultValues,
  onNext,
  onBack,
  userId,
}: StepProps<EmployerLogoValues>) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployerLogoValues>({
    resolver: zodResolver(employerLogoSchema),
    defaultValues: defaultValues as EmployerLogoValues,
  });


  return (
    <StepShell
      stepIndex={3}
      totalSteps={TOTAL_STEPS}
      title="Logo de la empresa"
      subtitle="Añade el logo para generar confianza."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Controller
          control={control}
          name="logoUrl"
          render={({ field }) => (
            <FileUpload
              label="Logo"
              bucket="profile-photos"
              pathName="logo"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              publicRead
              accept="image/png,image/jpeg,image/webp"
              error={errors.logoUrl?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function VerificationStep({
  defaultValues,
  onNext,
  onBack,
  userId,
}: StepProps<EmployerVerificationValues>) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployerVerificationValues>({
    resolver: zodResolver(employerVerificationSchema),
    defaultValues: defaultValues as EmployerVerificationValues,
  });


  return (
    <StepShell
      stepIndex={4}
      totalSteps={TOTAL_STEPS}
      title="Verificación NIF empresa"
      subtitle="Sube un documento que acredite el NIF de la empresa."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-4">
        <Controller
          control={control}
          name="nifDocumentPath"
          render={({ field }) => (
            <FileUpload
              label="Documento NIF empresa"
              bucket="employer-documents"
              pathName="nif-empresa"
              userId={userId!}
              value={field.value}
              onChange={field.onChange}
              error={errors.nifDocumentPath?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Continuar
        </Button>
      </form>
    </StepShell>
  );
}


function TermsStep({
  defaultValues,
  onNext,
  onBack,
}: StepProps<EmployerTermsValues> & {
  onNext: (values: EmployerTermsValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployerTermsValues>({
    resolver: zodResolver(employerTermsSchema),
    defaultValues: {
      acceptTerms: false,
      ...defaultValues,
    },
  });


  return (
    <StepShell
      stepIndex={5}
      totalSteps={TOTAL_STEPS}
      title="Términos y condiciones"
      subtitle="Último paso para crear tu cuenta de empleador."
      onBack={onBack}
    >
      <form onSubmit={handleSubmit(onNext)} className="space-y-5">
        <div className="rounded-3xl bg-card p-4 text-sm leading-6 text-muted">
          Bee Workers actúa como plataforma de colocación. Los trabajadores son
          autónomos y facturan directamente al empleador. Bee Workers aplica una
          comisión del 5%.
        </div>


        <Controller
          control={control}
          name="acceptTerms"
          render={({ field }) => (
            <Checkbox
              label="Acepto los Términos y Condiciones y la Privacy Policy."
              checked={field.value}
              onChange={field.onChange}
              error={errors.acceptTerms?.message}
            />
          )}
        />


        <Button type="submit" className="w-full" loading={isSubmitting}>
          Completar registro
        </Button>
      </form>
    </StepShell>
  );
}


export function EmployerOnboarding() {
  const auth = useAuth();
  const registration = useRegistration('employer');


  useEffect(() => {
    localStorage.setItem('bw_role', 'employer');
  }, []);


  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-bee/30 border-t-bee" />
      </div>
    );
  }


  const userId = auth.user?.id;


  if (registration.step === 0) {
    return (
      <StepShell
        stepIndex={0}
        totalSteps={TOTAL_STEPS}
        title="Registro de empleador"
        subtitle="Primero verifica tu teléfono."
      >
        <PhoneStep
          onNext={values => {
            registration.updateData(values);
            registration.next();
          }}
        />
      </StepShell>
    );
  }


  if (registration.step === 1) {
    return (
      <CompanyStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 2) {
    return (
      <AddressStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 3) {
    if (!userId) {
      registration.goToStep(0);
      return null;
    }


    return (
      <LogoStep
        defaultValues={registration.data}
        userId={userId}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  if (registration.step === 4) {
    if (!userId) {
      registration.goToStep(0);
      return null;
    }


    return (
      <VerificationStep
        defaultValues={registration.data}
        userId={userId}
        onBack={registration.back}
        onNext={values => {
          registration.updateData(values);
          registration.next();
        }}
      />
    );
  }


  return (
    <>
      <TermsStep
        defaultValues={registration.data}
        onBack={registration.back}
        onNext={async values => {
          await registration.submitEmployer(values);
        }}
      />


      {registration.submitError && (
        <div className="fixed inset-x-4 bottom-6 z-50 rounded-3xl bg-red-600 px-4 py-4 text-center text-sm font-medium text-white shadow-soft">
          {registration.submitError}
        </div>
      )}
    </>
  );
}
```


---


# 17. Página de verificación pendiente


## `src/app/verification-pending/page.tsx`


```tsx
'use client';


import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';


export default function VerificationPendingPage() {
  const router = useRouter();
  const auth = useAuth();


  useEffect(() => {
    if (!auth.loading && auth.profile?.verification_status === 'approved') {
      router.push(
        auth.profile.role === 'employer' ? '/app/employer' : '/app/worker'
      );
    }
  }, [auth.loading, auth.profile, router]);


  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-bee text-2xl">
            ⏳
          </div>


          <h1 className="text-2xl font-bold">Verificación en curso</h1>


          <p className="mt-3 text-sm leading-6 text-muted">
            Hemos recibido tus documentos. Nuestro equipo los revisará en un
            plazo de 24-48 horas laborables.
          </p>


          <div className="mt-6 rounded-3xl bg-card p-4 text-left text-sm leading-6 text-muted">
            Mientras tanto, puedes preparar:
            <ul className="mt-2 list-disc pl-5">
              <li>Tu disponibilidad horaria</li>
              <li>Tu zona preferente de trabajo</li>
              <li>Tus documentos fiscales al día</li>
            </ul>
          </div>


          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => auth.signOut().then(() => router.push('/login'))}
          >
            Cerrar sesión
          </Button>
        </Card>
      </div>
    </div>
  );
}
```


---


# 18. Dashboards mínimos protegidos


## `src/app/app/worker/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HexAvatar } from '@/components/ui/HexAvatar';


export default function WorkerDashboard() {
  const router = useRouter();
  const auth = useAuth();


  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HexAvatar src={auth.profile?.profile_photo_url} />
          <div>
            <p className="text-lg font-bold">
              {auth.profile?.full_name || 'Worker'}
            </p>
            <p className="text-sm text-muted">Worker autónomo</p>
          </div>
        </div>


        <Button
          variant="ghost"
          onClick={async () => {
            await auth.signOut();
            router.push('/login');
          }}
        >
          Salir
        </Button>
      </div>


      <Card>
        <h1 className="text-xl font-bold">Dashboard worker</h1>
        <p className="mt-2 text-sm text-muted">
          Aquí verás turnos cercanos, aplicaciones y pagos.
        </p>
      </Card>
    </div>
  );
}
```


---


## `src/app/app/employer/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HexAvatar } from '@/components/ui/HexAvatar';


export default function EmployerDashboard() {
  const router = useRouter();
  const auth = useAuth();


  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HexAvatar src={auth.profile?.profile_photo_url} fallback="EM" />
          <div>
            <p className="text-lg font-bold">
              {auth.profile?.full_name || 'Employer'}
            </p>
            <p className="text-sm text-muted">Employer</p>
          </div>
        </div>


        <Button
          variant="ghost"
          onClick={async () => {
            await auth.signOut();
            router.push('/login');
          }}
        >
          Salir
        </Button>
      </div>


      <Card>
        <h1 className="text-xl font-bold">Dashboard employer</h1>
        <p className="mt-2 text-sm text-muted">
          Aquí podrás publicar turnos y gestionar aplicaciones.
        </p>
      </Card>
    </div>
  );
}
```


---


# 19. Página raíz


## `src/app/page.tsx`


```tsx
import { redirect } from 'next/navigation';


export default function Home() {
  redirect('/login');
}
```


---


# 20. Notas importantes de producción


## Phone OTP


Para que el login con teléfono funcione, Supabase debe tener configurado un proveedor SMS:


- Twilio
- MessageBird
- Vonage


Configurar en Supabase Dashboard → Authentication → Providers → Phone.


---


## Buckets de Storage


Se usan:


```text
profile-photos       → público
worker-documents     → privado
employer-documents   → privado
```


Las rutas siguen el patrón:


```text
{bucket}/{userId}/{documento}
```


Esto permite políticas RLS por usuario.


---


## Verificación administrativa


El registro finaliza con:


```ts
onboarding_completed = true
verification_status = 'pending'
is_verified = false
```


Un admin debe aprobar documentos y actualizar:


```ts
verification_status = 'approved'
is_verified = true
```


Usando siempre `service_role` desde backend seguro.


---


## Disclaimer fiscal


El worker acepta obligatoriamente:


- Recibe bruto menos 5% comisión.
- Es responsable de IRS y Segurança Social.
- Bee Workers no retiene impuestos.
- La app solo muestra estimaciones.


El tutorial se muestra inmediatamente después de completar el registro.


---


## Cumplimiento Art. 12.º-A CT


La implementación respeta:


- Worker define su `hourlyRate`.
- Employer define `hourly_rate_offer`.
- No hay precio impuesto por plataforma.
- No hay penalización por rechazo en este flujo.
- Check-in/check-out no se implementan como control abusivo, sino como prueba de servicio.


---


Con esto tienes implementado el sistema completo de:


- Registro worker en 8 pasos
- Registro employer en 6 pasos
- Login phone OTP + email/password
- Middleware de protección de rutas
- Redirect por rol y estado de verificación
- Upload con progreso
- Validación Zod con mensajes en español
- Disclaimer fiscal obligatorio
- Tutorial integrado IRS/SS/Finanças/Seguro
- UI mobile-first con estética Bee Workers