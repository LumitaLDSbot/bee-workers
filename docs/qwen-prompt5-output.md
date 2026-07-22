# Cierre de producción Bee Workers

A continuación tienes el paquete completo de finalización para Bee Workers como PWA instalable, con rendimiento, Docker, deploy en VPS, testing, SEO/analytics y documentación.

> Este bloque está pensado para añadirse al proyecto Next.js 14 + Supabase ya existente.

---

# 1. Estructura de archivos nuevos

Crea o reemplaza estos archivos:

```text
bee-workers/
├── package.json
├── next.config.mjs
├── Dockerfile
├── .dockerignore
├── docker-compose.yml
├── .env.example
├── vitest.config.ts
├── playwright.config.ts
│
├── scripts/
│   ├── deploy.sh
│   ├── generate-vapid-keys.mjs
│   └── generate-icons.mjs
│
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/
│       └── icon.svg
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── offline/
│   │   │   └── page.tsx
│   │   ├── api/
│   │   │   ├── health/
│   │   │   │   └── route.ts
│   │   │   ├── applications/
│   │   │   │   └── route.ts
│   │   │   └── push/
│   │   │       ├── subscribe/
│   │   │       │   └── route.ts
│   │   │       └── test/
│   │   │           └── route.ts
│   │   ├── sitemap.ts
│   │   ├── robots.ts
│   │   └── turnos/
│   │       └── [id]/
│   │           └── page.tsx
│   │
│   ├── components/
│   │   ├── PWAProvider.tsx
│   │   └── seo/
│   │       └── Analytics.tsx
│   │
│   ├── lib/
│   │   ├── push-client.ts
│   │   ├── push-server.ts
│   │   ├── offline.ts
│   │   └── validations/
│   │       └── forms.ts
│   │
├── supabase/
│   └── migrations/
│       └── 20260722_push_subscriptions.sql
│
├── tests/
│   ├── unit/
│   │   ├── calc.test.ts
│   │   ├── utils.test.ts
│   │   └── validations.test.ts
│   └── integration/
│       └── shift-flow.test.ts
│
├── e2e/
│   ├── landing.spec.ts
│   └── shift-flow.spec.ts
│
├── README.md
├── DEPLOY.md
└── CONTRIBUTING.md
```

---

# 2. `package.json`

```json
{
  "name": "bee-workers",
  "version": "1.0.0",
  "private": true,
  "description": "Marketplace de turnos puntuales en hostelería y restauración en Porto",
  "scripts": {
    "dev": "next dev -p 3004",
    "build": "next build",
    "start": "next start -p 3004",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "generate:vapid": "node scripts/generate-vapid-keys.mjs",
    "generate:icons": "node scripts/generate-icons.mjs",
    "deploy": "bash scripts/deploy.sh"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.4",
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "^7.53.0",
    "sharp": "^0.33.5",
    "web-push": "^3.6.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@types/web-push": "^3.6.3",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

---

# 3. Configuración Next.js optimizada

## `next.config.mjs`

```js
// next.config.mjs
// Configuración de producción para Bee Workers

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Necesario para Docker standalone
  output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  images: {
    remotePatterns: [
      // Imágenes desde Supabase Storage
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: ['@supabase/supabase-js'],
  },

  async headers() {
    return [
      // Service Worker sin cache agresiva
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      // Manifest
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // Headers de seguridad
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

# 4. PWA

## `public/manifest.webmanifest`

```json
{
  "name": "Bee Workers",
  "short_name": "BeeWorkers",
  "description": "Turnos puntuales en hostelería y restauración en Porto",
  "lang": "es",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFFAF0",
  "theme_color": "#FFB800",
  "categories": ["jobs", "business", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Ver turnos",
      "short_name": "Turnos",
      "description": "Explorar turnos cercanos",
      "url": "/app/worker",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    },
    {
      "name": "Publicar turno",
      "short_name": "Publicar",
      "description": "Publicar un nuevo turno",
      "url": "/app/employer/shifts/new",
      "icons": [
        {
          "src": "/icons/icon-192.png",
          "sizes": "192x192"
        }
      ]
    }
  ]
}
```

---

## `public/icons/icon.svg`

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="#FFB800" />
  <path
    d="M256 96L360 156V276L256 336L152 276V156L256 96Z"
    fill="#1A1A1A"
    fill-opacity="0.92"
  />
  <path
    d="M256 176L312 208V272L256 304L200 272V208L256 176Z"
    fill="#FFFAF0"
  />
  <text
    x="50%"
    y="420"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="72"
    font-weight="bold"
    fill="#1A1A1A"
  >
    BW
  </text>
</svg>
```

---

## `scripts/generate-icons.mjs`

```js
// Genera iconos PNG para PWA a partir del SVG
// Uso: npm run generate:icons

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const input = path.join(process.cwd(), 'public/icons/icon.svg');
const outputDir = path.join(process.cwd(), 'public/icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-maskable-512.png', size: 512 },
];

async function generate() {
  for (const item of sizes) {
    await sharp(input)
      .resize(item.size, item.size)
      .png()
      .toFile(path.join(outputDir, item.name));

    console.log(`✅ Generado ${item.name}`);
  }

  console.log('🎉 Iconos PWA generados correctamente.');
}

generate().catch(error => {
  console.error('Error generando iconos:', error);
  process.exit(1);
});
```

---

## `public/sw.js`

```js
// Service Worker Bee Workers
// Cache estático, offline fallback, background sync y push notifications

const CACHE_VERSION = 'bee-workers-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const IMAGES_CACHE = `${CACHE_VERSION}-images`;

const PRECACHE_URLS = ['/', '/offline', '/manifest.webmanifest'];

// Workbox desde CDN
importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js'
);

// Instalación: precache mínimo
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => !key.startsWith(CACHE_VERSION))
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Navegación: network first con fallback offline
const navigationHandler = async ({ request }) => {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request, {
      ignoreSearch: true,
    });

    if (cachedResponse) {
      return cachedResponse;
    }

    return caches.match('/offline');
  }
};

workbox.routing.registerRoute(
  new workbox.routing.NavigationRoute(navigationHandler)
);

// Assets estáticos de Next.js
workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font',
  new workbox.strategies.CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

// Imágenes, incluidas las de Supabase Storage
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: IMAGES_CACHE,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

// =====================================================
// Background Sync para aplicaciones a turnos
// =====================================================

const applicationQueue = new workbox.backgroundSync.Queue('applications', {
  maxRetentionTime: 24 * 60,
});

self.addEventListener('message', event => {
  if (event.data?.type === 'QUEUE_APPLICATION') {
    const payload = event.data.payload;

    const request = new Request('/api/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    applicationQueue.pushRequest({ request });

    self.registration.sync.register('apply-to-shift');
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'apply-to-shift') {
    event.waitUntil(applicationQueue.replayRequests());
  }
});

// =====================================================
// Push Notifications
// =====================================================

self.addEventListener('push', event => {
  let data = {
    title: 'Bee Workers',
    body: 'Tienes una nueva notificación.',
    url: '/',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (error) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: {
      url: data.url || '/',
    },
    vibrate: [100, 50, 100],
    tag: data.tag || 'bee-workers-notification',
    renotify: Boolean(data.tag),
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
```

---

## `src/app/offline/page.tsx`

```tsx
// Página offline para PWA

import Link from 'next/link';

export const metadata = {
  title: 'Sin conexión | Bee Workers',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center bg-[#FFFAF0] px-4 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FFB800] text-3xl">
          🐝
        </div>

        <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
          Estás sin conexión
        </h1>

        <p className="mt-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
          No pudimos cargar esta página. Algunas funciones pueden seguir
          disponibles si ya se cargaron antes.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#FFB800] px-6 py-3.5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E0A800]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
```

---

## `src/components/PWAProvider.tsx`

```tsx
'use client';

// Registra el Service Worker y expone instalación PWA

import { createContext, useContext, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextValue {
  canInstall: boolean;
  install: () => Promise<void>;
}

const PWAContext = createContext<PWAContextValue>({
  canInstall: false,
  install: async () => {},
});

export function usePWAInstall() {
  return useContext(PWAContext);
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Registrar service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
        } catch (error) {
          console.error('Error registrando SW:', error);
        }
      });
    }

    // Capturar evento de instalación
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
  };

  return (
    <PWAContext.Provider
      value={{
        canInstall: Boolean(deferredPrompt),
        install,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}
```

---

# 5. Push Notifications

## `scripts/generate-vapid-keys.mjs`

```js
// Genera claves VAPID para Web Push
// Uso: npm run generate:vapid

import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Copia estas variables en .env:');
console.log('');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@lumodigitalsolutions.com');
```

---

## `supabase/migrations/20260722_push_subscriptions.sql`

```sql
-- Suscripciones Web Push por usuario

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
```

---

## `src/lib/push-client.ts`

```ts
// Utilidades cliente para Web Push

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    console.warn('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error suscribiendo a push:', error);
    return false;
  }
}
```

---

## `src/lib/push-server.ts`

```ts
// Envío de notificaciones push desde servidor

import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@lumodigitalsolutions.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys no configuradas');
  }

  const admin = createAdminClient();

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0 };
  }

  const results = await Promise.allSettled(
    subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload)
        );

        return { success: true, subscriptionId: subscription.id };
      } catch (error: any) {
        // Si la suscripción ya no es válida, la eliminamos
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await admin
            .from('push_subscriptions')
            .delete()
            .eq('id', subscription.id);
        }

        throw error;
      }
    })
  );

  const sent = results.filter(result => result.status === 'fulfilled').length;

  return { sent };
}
```

---

## `src/app/api/push/subscribe/route.ts`

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const subscription = body?.subscription;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ success: true });
}
```

---

## `src/app/api/push/test/route.ts`

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push-server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: 'Bee Workers',
      body: 'Notificación de prueba correcta.',
      url: '/',
      tag: 'push-test',
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'No se pudo enviar la notificación' },
      { status: 500 }
    );
  }
}
```

---

# 6. Background Sync para aplicaciones

## `src/lib/offline.ts`

```ts
// Encola aplicaciones a turnos cuando no hay conexión

interface QueueApplicationPayload {
  shiftId: string;
  message?: string;
  proposedRate?: number | null;
}

export async function queueApplication(payload: QueueApplicationPayload) {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker no soportado');
  }

  const registration = await navigator.serviceWorker.ready;

  navigator.serviceWorker.controller?.postMessage({
    type: 'QUEUE_APPLICATION',
    payload,
  });

  if ('sync' in registration) {
    try {
      await (registration as any).sync.register('apply-to-shift');
    } catch (error) {
      console.warn('Background Sync no disponible:', error);
    }
  }
}
```

---

## `src/app/api/applications/route.ts`

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const applicationSchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = applicationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { shiftId, message, proposedRate } = parsed.data;

  const { data: shift } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .maybeSingle();

  if (!shift) {
    return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
  }

  if (shift.status !== 'published') {
    return NextResponse.json(
      { error: 'Este turno ya no está disponible' },
      { status: 400 }
    );
  }

  if (shift.employer_id === user.id) {
    return NextResponse.json(
      { error: 'No puedes aplicar a tu propio turno' },
      { status: 400 }
    );
  }

  const finalProposedRate = proposedRate ?? shift.hourly_rate_offer ?? undefined;

  if (!finalProposedRate || finalProposedRate <= 0) {
    return NextResponse.json(
      { error: 'Este turno requiere propuesta de precio' },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('shift_applications').insert({
    shift_id: shiftId,
    worker_id: user.id,
    proposed_rate: finalProposedRate,
    message: message ?? null,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya has aplicado a este turno' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'No pudimos enviar la aplicación' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

---

# 7. Layout raíz con PWA, SEO y analytics

## `src/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { PWAProvider } from '@/components/PWAProvider';
import { Analytics } from '@/components/seo/Analytics';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'
  ),
  manifest: '/manifest.webmanifest',
  title: {
    default: 'Bee Workers | Turnos en hostelería en Porto',
    template: '%s | Bee Workers',
  },
  description:
    'Bee Workers conecta trabajadores autónomos con empleadores de hostelería y restauración en Porto para turnos puntuales y temporales.',
  applicationName: 'Bee Workers',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bee Workers',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Bee Workers',
    title: 'Bee Workers | Turnos en hostelería en Porto',
    description:
      'Marketplace de turnos puntuales para trabajadores autónomos y empleadores de hostelería en Porto.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bee Workers',
    description:
      'Turnos puntuales en hostelería y restauración en Porto para trabajadores autónomos.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#FFB800',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={spaceGrotesk.variable}>
      <body className="min-h-screen bg-[#FFFAF0] font-sans text-[#1A1A1A] antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <PWAProvider>{children}</PWAProvider>
        <Analytics />
      </body>
    </html>
  );
}
```

---

## `src/components/seo/Analytics.tsx`

```tsx
// Analytics privacy-friendly con Plausible
// Si prefieres GA4, reemplaza este script

import Script from 'next/script';

export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  if (!domain) {
    return null;
  }

  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  );
}
```

---

# 8. SEO: sitemap, robots y turnos públicos

## `src/app/sitemap.ts`

```ts
import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return staticRoutes;
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: shifts } = await admin
    .from('shifts')
    .select('id, updated_at')
    .eq('status', 'published')
    .order('starts_at', { ascending: true })
    .limit(5000);

  const shiftRoutes: MetadataRoute.Sitemap = (shifts ?? []).map(shift => ({
    url: `${baseUrl}/turnos/${shift.id}`,
    lastModified: shift.updated_at ? new Date(shift.updated_at) : new Date(),
    changeFrequency: 'hourly',
    priority: 0.9,
  }));

  return [...staticRoutes, ...shiftRoutes];
}
```

---

## `src/app/robots.ts`

```ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/admin/', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

---

## `src/app/turnos/[id]/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface PublicShiftPageProps {
  params: {
    id: string;
  };
}

async function getPublicShift(shiftId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: shift } = await admin
    .from('shifts')
    .select(
      `
      *,
      employer_profiles (
        company_name,
        address,
        location
      )
      `
    )
    .eq('id', shiftId)
    .eq('status', 'published')
    .maybeSingle();

  return shift;
}

export async function generateMetadata({
  params,
}: PublicShiftPageProps): Promise<Metadata> {
  const shift = await getPublicShift(params.id);

  if (!shift) {
    return {
      title: 'Turno no disponible',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${shift.profession_required} en Porto`;
  const description =
    shift.description ||
    `Turno de ${shift.profession_required} en ${shift.location || 'Porto'}. Publica tu aplicación en Bee Workers.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default async function PublicShiftPage({
  params,
}: PublicShiftPageProps) {
  const shift = await getPublicShift(params.id);

  if (!shift) {
    notFound();
  }

  const employer = Array.isArray(shift.employer_profiles)
    ? shift.employer_profiles[0]
    : shift.employer_profiles;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: shift.profession_required,
    description: shift.description || shift.profession_required,
    datePosted: shift.created_at,
    validThrough: shift.starts_at,
    employmentType: 'TEMPORARY',
    hiringOrganization: {
      '@type': 'Organization',
      name: employer?.company_name || 'Empresa en Porto',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: shift.location || 'Porto',
        addressCountry: 'PT',
      },
    },
    ...(shift.hourly_rate_offer
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'EUR',
            value: {
              '@type': 'QuantitativeValue',
              value: shift.hourly_rate_offer,
              unitText: 'HOUR',
            },
          },
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <p className="text-sm font-semibold text-[#FFB800]">
            Turno en Porto
          </p>

          <h1 className="mt-2 text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
            {shift.profession_required}
          </h1>

          <p className="mt-2 text-sm text-[#8B8B8B] dark:text-neutral-400">
            {employer?.company_name || 'Empresa'} ·{' '}
            {shift.location || 'Porto'}
          </p>

          {shift.description && (
            <p className="mt-6 whitespace-pre-line text-sm leading-7 text-[#1A1A1A] dark:text-neutral-200">
              {shift.description}
            </p>
          )}

          <div className="mt-8">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-2xl bg-[#FFB800] px-6 py-4 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E0A800]"
            >
              Aplicar en Bee Workers
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
```

---

# 9. Health check

## `src/app/api/health/route.ts`

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  const startedAt = Date.now();

  try {
    const admin = createAdminClient();

    // Verificación ligera de conexión con Supabase
    const { error } = await admin.from('users').select('id').limit(1);

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          database: 'error',
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
```

---

# 10. Docker

## `Dockerfile`

```dockerfile
# Dockerfile multi-stage para Bee Workers
# Build Next.js standalone + producción Node 20

FROM node:20-alpine AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat

# ----------------------------------------------------
# Dependencias
# ----------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json* ./

RUN npm ci

# ----------------------------------------------------
# Build
# ----------------------------------------------------
FROM base AS builder

# Variables públicas necesarias durante el build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ----------------------------------------------------
# Producción
# ----------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3004
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Usuario no root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3004/api/health || exit 1

CMD ["node", "server.js"]
```

---

## `.dockerignore`

```text
node_modules
.next
.git
.gitignore
.env
.env.local
.env.production
npm-debug.log
README.md
DEPLOY.md
CONTRIBUTING.md
tests
e2e
playwright-report
test-results
coverage
```

---

## `docker-compose.yml`

```yaml
# Producción para Bee Workers
# Dominio: bee-workers.lumodigitalsolutions.com
# Puerto interno: 3004

services:
  bee-workers:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        NEXT_PUBLIC_PLAUSIBLE_DOMAIN: ${NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
    container_name: bee-workers
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 3004
      HOSTNAME: 0.0.0.0
    networks:
      - web
    # Si usas Supabase local en el host con `supabase start`,
    # descomenta para poder acceder desde el contenedor:
    # extra_hosts:
    #   - "host.docker.internal:host-gateway"
    labels:
      - traefik.enable=true
      - traefik.http.routers.bee-workers.rule=Host(`bee-workers.lumodigitalsolutions.com`)
      - traefik.http.routers.bee-workers.entrypoints=websecure
      - traefik.http.routers.bee-workers.tls=true
      - traefik.http.routers.bee-workers.tls.certresolver=letsencrypt
      - traefik.http.services.bee-workers.loadbalancer.server.port=3004
      - traefik.http.routers.bee-workers-http.rule=Host(`bee-workers.lumodigitalsolutions.com`)
      - traefik.http.routers.bee-workers-http.entrypoints=web
      - traefik.http.routers.bee-workers-http.middlewares=redirect-to-https
      - traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
      - traefik.http.middlewares.redirect-to-https.redirectscheme.permanent=true

networks:
  web:
    external: true
```

---

# 11. Script de deploy en VPS#2

## `scripts/deploy.sh`

```bash
#!/usr/bin/env bash

# Deploy Bee Workers en VPS#2
# IP: 5.189.159.232
# Dominio: bee-workers.lumodigitalsolutions.com
# Puerto interno: 3004

set -euo pipefail

APP_NAME="bee-workers"
APP_DIR="/opt/bee-workers"
DOMAIN="bee-workers.lumodigitalsolutions.com"
PORT="3004"
NETWORK="web"

echo "🚀 Deploy de ${APP_NAME}"
echo "Dominio: ${DOMAIN}"
echo "Directorio: ${APP_DIR}"

# ----------------------------------------------------
# 1. Requisitos
# ----------------------------------------------------
if ! command -v docker &> /dev/null; then
  echo "❌ Docker no está instalado"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "❌ Docker Compose plugin no está disponible"
  exit 1
fi

# ----------------------------------------------------
# 2. Crear directorio y red Traefik si no existen
# ----------------------------------------------------
mkdir -p "${APP_DIR}"

if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  echo "🌐 Creando red Docker '${NETWORK}'"
  docker network create "${NETWORK}"
fi

# ----------------------------------------------------
# 3. Mover código actual al directorio de producción
# Ejecuta este script desde la raíz del repositorio
# ----------------------------------------------------
echo "📦 Sincronizando archivos..."
rsync -av --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  ./ "${APP_DIR}/"

cd "${APP_DIR}"

# ----------------------------------------------------
# 4. Validar .env
# ----------------------------------------------------
if [ ! -f .env ]; then
  echo "❌ Falta .env en ${APP_DIR}"
  echo "Copia .env.example a .env y completa las variables"
  exit 1
fi

# ----------------------------------------------------
# 5. Build y arranque
# ----------------------------------------------------
echo "🔨 Construyendo imagen Docker..."
docker compose build --pull

echo "♻️  Reiniciando contenedor..."
docker compose up -d --remove-orphans

# ----------------------------------------------------
# 6. Health check
# ----------------------------------------------------
echo "🩺 Esperando health check..."
sleep 10

for i in {1..10}; do
  if curl --fail --silent "http://127.0.0.1:${PORT}/api/health" > /dev/null; then
    echo "✅ Servicio activo en puerto ${PORT}"
    exit 0
  fi

  echo "Intento ${i}/10 fallido. Reintentando..."
  sleep 5
done

echo "❌ El health check falló. Revisa logs:"
echo "docker logs ${APP_NAME}"
exit 1
```

Permisos:

```bash
chmod +x scripts/deploy.sh
```

---

# 12. Variables de entorno

## `.env.example`

```env
# =====================================================
# Bee Workers - Variables de entorno
# =====================================================

# URL pública de la app
NEXT_PUBLIC_APP_URL=https://bee-workers.lumodigitalsolutions.com

# Puerto interno
PORT=3004
HOSTNAME=0.0.0.0

# =====================================================
# Supabase
# =====================================================

# URL de tu proyecto Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Clave pública Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Clave service role. NUNCA exponer en cliente
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# =====================================================
# Web Push / VAPID
# Generar con: npm run generate:vapid
# =====================================================

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@lumodigitalsolutions.com

# =====================================================
# Analytics privacy-friendly
# =====================================================

NEXT_PUBLIC_PLAUSIBLE_DOMAIN=bee-workers.lumodigitalsolutions.com

# =====================================================
# Geocoding opcional
# =====================================================

GOOGLE_GEOCODE_API_KEY=

# =====================================================
# Testing
# =====================================================

# Para tests de integración
TEST_SUPABASE_URL=
TEST_SUPABASE_SERVICE_ROLE_KEY=

# Para E2E
E2E_BASE_URL=http://localhost:3004
E2E_WORKER_EMAIL=
E2E_WORKER_PASSWORD=
E2E_EMPLOYER_EMAIL=
E2E_EMPLOYER_PASSWORD=
```

---

# 13. Validaciones para tests

## `src/lib/validations/forms.ts`

```ts
import { z } from 'zod';

// Schema de publicación de turno
export const shiftFormSchema = z.object({
  profession: z.string().min(1, 'Selecciona una profesión'),
  date: z.string().min(1, 'Selecciona una fecha'),
  startTime: z.string().min(1, 'Selecciona hora de inicio'),
  endTime: z.string().min(1, 'Selecciona hora de fin'),
  pricePerHour: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000, 'Descripción demasiado larga').optional(),
  slotsNeeded: z.coerce.number().int().min(1).max(20),
});

// Schema de aplicación
export const applicationFormSchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});

// Schema de rating
export const ratingFormSchema = z.object({
  stars: z.number().int().min(1).max(5),
  punctuality: z.number().int().min(1).max(5).optional(),
  professionalism: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});

// Schema de perfil worker
export const workerProfileFormSchema = z.object({
  fullName: z.string().min(2, 'Nombre demasiado corto'),
  hourlyRate: z.coerce.number().min(0.1, 'Precio inválido'),
  workRadiusKm: z.coerce.number().min(1).max(100),
  professions: z.array(z.string()).min(1, 'Selecciona al menos una profesión'),
  skills: z.array(z.string()).default([]),
  isActive: z.boolean(),
});

export type ShiftFormValues = z.infer<typeof shiftFormSchema>;
export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
export type RatingFormValues = z.infer<typeof ratingFormSchema>;
export type WorkerProfileFormValues = z.infer<typeof workerProfileFormSchema>;
```

---

# 14. Testing unitario con Vitest

## `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## `tests/unit/calc.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { calculateWorkerNet } from '@/lib/utils/calc';

describe('calculateWorkerNet', () => {
  it('calcula correctamente el neto sin exención SS', () => {
    const result = calculateWorkerNet({
      hourlyRate: 10,
      hours: 10,
      ssExempt: false,
    });

    // Bruto: 10 * 10 = 100
    expect(result.gross).toBe(100);

    // Comisión 5%: 5
    expect(result.commission).toBe(5);

    // Antes de impuestos: 95
    expect(result.netBeforeTaxes).toBe(95);

    // IRS: 23% sobre 75% de 100 = 17.25
    expect(result.irsTaxableBase).toBe(75);
    expect(result.irsEstimate).toBe(17.25);

    // SS: 21.4% sobre 70% de 100 = 14.98
    expect(result.ssBase).toBe(70);
    expect(result.ssEstimate).toBe(14.98);

    // Total impuestos: 32.23
    expect(result.totalTaxEstimate).toBe(32.23);

    // Neto después de impuestos: 95 - 32.23 = 62.77
    expect(result.netAfterTaxes).toBe(62.77);
  });

  it('aplica exención de Segurança Social', () => {
    const result = calculateWorkerNet({
      hourlyRate: 10,
      hours: 10,
      ssExempt: true,
    });

    expect(result.ssExempt).toBe(true);
    expect(result.ssEstimate).toBe(0);

    // Total impuestos solo IRS: 17.25
    expect(result.totalTaxEstimate).toBe(17.25);

    // Neto: 95 - 17.25 = 77.75
    expect(result.netAfterTaxes).toBe(77.75);
  });

  it('devuelve cero para inputs cero', () => {
    const result = calculateWorkerNet({
      hourlyRate: 0,
      hours: 0,
      ssExempt: false,
    });

    expect(result.gross).toBe(0);
    expect(result.commission).toBe(0);
    expect(result.netBeforeTaxes).toBe(0);
    expect(result.totalTaxEstimate).toBe(0);
    expect(result.netAfterTaxes).toBe(0);
  });
});
```

---

## `tests/unit/utils.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { formatEUR, formatDateTime } from '@/lib/utils/format';
import { haversineDistanceMeters } from '@/lib/utils/geo';
import { calculateShiftHours } from '@/lib/utils/date';

describe('formatEUR', () => {
  it('formatea euros correctamente', () => {
    const value = formatEUR(1234.5);

    // No testeamos el símbolo exacto por locale, pero sí números
    expect(value).toContain('1');
    expect(value).toContain('234');
  });

  it('formatea cero', () => {
    const value = formatEUR(0);
    expect(value).toContain('0');
  });
});

describe('haversineDistanceMeters', () => {
  it('devuelve 0 para el mismo punto', () => {
    const distance = haversineDistanceMeters(
      41.14961,
      -8.61099,
      41.14961,
      -8.61099
    );

    expect(distance).toBe(0);
  });

  it('calcula distancia aproximada entre dos puntos de Porto', () => {
    // Aliados -> Ribeira aproximadamente
    const distance = haversineDistanceMeters(
      41.14961,
      -8.61099,
      41.14087,
      -8.61308
    );

    // Aproximadamente 1km, aceptamos rango amplio
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(2000);
  });
});

describe('calculateShiftHours', () => {
  it('calcula horas normales', () => {
    const hours = calculateShiftHours(
      '2026-07-22T10:00:00.000Z',
      '2026-07-22T14:00:00.000Z'
    );

    expect(hours).toBe(4);
  });

  it('devuelve 0 si end es anterior a start', () => {
    const hours = calculateShiftHours(
      '2026-07-22T14:00:00.000Z',
      '2026-07-22T10:00:00.000Z'
    );

    expect(hours).toBe(0);
  });
});
```

---

## `tests/unit/validations.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  applicationFormSchema,
  ratingFormSchema,
  shiftFormSchema,
  workerProfileFormSchema,
} from '@/lib/validations/forms';

describe('shiftFormSchema', () => {
  it('acepta un turno válido', () => {
    const result = shiftFormSchema.safeParse({
      profession: 'Camarero/a',
      date: '2026-07-22',
      startTime: '10:00',
      endTime: '14:00',
      pricePerHour: 12,
      description: 'Turno de mañana',
      slotsNeeded: 2,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza slotsNeeded mayor que 20', () => {
    const result = shiftFormSchema.safeParse({
      profession: 'Camarero/a',
      date: '2026-07-22',
      startTime: '10:00',
      endTime: '14:00',
      slotsNeeded: 21,
    });

    expect(result.success).toBe(false);
  });

  it('acepta precio opcional vacío', () => {
    const result = shiftFormSchema.safeParse({
      profession: 'Camarero/a',
      date: '2026-07-22',
      startTime: '10:00',
      endTime: '14:00',
      pricePerHour: null,
      slotsNeeded: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('applicationFormSchema', () => {
  it('acepta aplicación con propuesta', () => {
    const result = applicationFormSchema.safeParse({
      shiftId: '11111111-1111-1111-1111-111111111111',
      message: 'Tengo experiencia',
      proposedRate: 13,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza shiftId inválido', () => {
    const result = applicationFormSchema.safeParse({
      shiftId: 'invalid-id',
      proposedRate: 13,
    });

    expect(result.success).toBe(false);
  });
});

describe('ratingFormSchema', () => {
  it('acepta rating válido', () => {
    const result = ratingFormSchema.safeParse({
      stars: 5,
      punctuality: 4,
      professionalism: 5,
      comment: 'Muy profesional',
    });

    expect(result.success).toBe(true);
  });

  it('rechaza estrellas fuera de rango', () => {
    const result = ratingFormSchema.safeParse({
      stars: 6,
    });

    expect(result.success).toBe(false);
  });
});

describe('workerProfileFormSchema', () => {
  it('acepta perfil worker válido', () => {
    const result = workerProfileFormSchema.safeParse({
      fullName: 'Ana Silva',
      hourlyRate: 12,
      workRadiusKm: 10,
      professions: ['Camarero/a'],
      skills: ['Bandeja'],
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza sin profesiones', () => {
    const result = workerProfileFormSchema.safeParse({
      fullName: 'Ana Silva',
      hourlyRate: 12,
      workRadiusKm: 10,
      professions: [],
      skills: [],
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});
```

---

# 15. Test de integración del flujo completo

## `tests/integration/shift-flow.test.ts`

```ts
import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Este test usa Supabase local o entorno de testing
// Requiere TEST_SUPABASE_URL y TEST_SUPABASE_SERVICE_ROLE_KEY

const supabaseUrl = process.env.TEST_SUPABASE_URL;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

const runIntegration = Boolean(supabaseUrl && serviceRoleKey);

describe.skipIf(!runIntegration)('Flujo completo de turno', () => {
  const admin = createClient(supabaseUrl!, serviceRoleKey!);

  let employerId: string;
  let workerId: string;
  let shiftId: string;
  let applicationId: string;
  let checkinId: string;

  const suffix = Date.now().toString().slice(-6);

  beforeAll(async () => {
    // Crear employer
    const employer = await admin.auth.admin.createUser({
      email: `employer.${suffix}@test.com`,
      password: 'Test1234!',
      email_confirm: true,
      user_metadata: {
        role: 'employer',
      },
    });

    employerId = employer.data.user!.id;

    await admin.from('users').upsert({
      id: employerId,
      email: `employer.${suffix}@test.com`,
      full_name: 'Empresa Test',
      role: 'employer',
      is_verified: true,
      onboarding_completed: true,
      verification_status: 'approved',
    });

    await admin.from('employer_profiles').upsert({
      user_id: employerId,
      company_name: 'Empresa Test',
      address: 'Porto',
      location: 'Porto',
      latitude: 41.14961,
      longitude: -8.61099,
    });

    // Crear worker
    const worker = await admin.auth.admin.createUser({
      email: `worker.${suffix}@test.com`,
      password: 'Test1234!',
      email_confirm: true,
      user_metadata: {
        role: 'worker',
      },
    });

    workerId = worker.data.user!.id;

    await admin.from('users').upsert({
      id: workerId,
      email: `worker.${suffix}@test.com`,
      full_name: 'Worker Test',
      role: 'worker',
      is_verified: true,
      onboarding_completed: true,
      verification_status: 'approved',
    });

    await admin.from('worker_profiles').upsert({
      user_id: workerId,
      full_name: 'Worker Test',
      professions: ['Camarero/a'],
      skills: ['Bandeja'],
      hourly_rate: 12,
      is_autonomo: true,
      seguro_vigente: true,
      is_active: true,
      latitude: 41.14961,
      longitude: -8.61099,
      work_radius_km: 10,
    });
  });

  afterAll(async () => {
    if (employerId) {
      await admin.auth.admin.deleteUser(employerId);
    }

    if (workerId) {
      await admin.auth.admin.deleteUser(workerId);
    }
  });

  it('publica un turno', async () => {
    const startsAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from('shifts')
      .insert({
        employer_id: employerId,
        profession_required: 'Camarero/a',
        description: 'Turno test',
        starts_at: startsAt,
        ends_at: endsAt,
        hourly_rate_offer: 12,
        location: 'Porto',
        latitude: 41.14961,
        longitude: -8.61099,
        status: 'published',
        slots_needed: 1,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data.id).toBeDefined();

    shiftId = data.id;
  });

  it('worker aplica al turno', async () => {
    const { data, error } = await admin
      .from('shift_applications')
      .insert({
        shift_id: shiftId,
        worker_id: workerId,
        proposed_rate: 12,
        status: 'pending',
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data.id).toBeDefined();

    applicationId = data.id;
  });

  it('employer acepta la aplicación', async () => {
    const { error } = await admin
      .from('shift_applications')
      .update({ status: 'accepted' })
      .eq('id', applicationId);

    expect(error).toBeNull();

    const { data: shift } = await admin
      .from('shifts')
      .select('status')
      .eq('id', shiftId)
      .single();

    expect(shift?.status).toBe('assigned');
  });

  it('worker hace check-in dentro del radio', async () => {
    const { data, error } = await admin
      .from('shift_checkins')
      .insert({
        shift_id: shiftId,
        worker_id: workerId,
        check_in_at: new Date().toISOString(),
        lat: 41.14961,
        lng: -8.61099,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data.id).toBeDefined();

    checkinId = data.id;
  });

  it('worker hace check-out y genera payment + pending rating', async () => {
    const { error } = await admin
      .from('shift_checkins')
      .update({
        check_out_at: new Date().toISOString(),
        check_out_lat: 41.14961,
        check_out_lng: -8.61099,
      })
      .eq('id', checkinId);

    expect(error).toBeNull();

    const { data: payment } = await admin
      .from('payments')
      .select('*')
      .eq('shift_id', shiftId)
      .eq('worker_id', workerId)
      .maybeSingle();

    expect(payment).toBeTruthy();
    expect(payment?.gross).toBeGreaterThan(0);
    expect(payment?.commission_rate).toBe(0.05);

    const { data: pendingRating } = await admin
      .from('pending_ratings')
      .select('*')
      .eq('shift_id', shiftId)
      .eq('rater_id', employerId)
      .eq('ratee_id', workerId)
      .maybeSingle();

    expect(pendingRating).toBeTruthy();
  });

  it('employer valora al worker y actualiza rating', async () => {
    const { error } = await admin.from('ratings').insert({
      shift_id: shiftId,
      rater_id: employerId,
      ratee_id: workerId,
      type: 'employer_to_worker',
      stars: 5,
      punctuality: 5,
      professionalism: 5,
      comment: 'Excelente',
    });

    expect(error).toBeNull();

    const { data: profile } = await admin
      .from('worker_profiles')
      .select('rating, rating_count')
      .eq('user_id', workerId)
      .single();

    expect(profile?.rating_count).toBe(1);
    expect(Number(profile?.rating)).toBe(5);
  });
});
```

---

# 16. E2E con Playwright

## `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3004',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:3004',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

---

## `e2e/landing.spec.ts`

```ts
import { expect, test } from '@playwright/test';

test.describe('Landing pública', () => {
  test('muestra hero y CTAs', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Be a Worker.')).toBeVisible();
    await expect(page.getByText('Bee a Worker.')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Registro' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  });

  test('navega a registro', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Registro' }).first().click();

    await expect(page).toHaveURL(/register/);
  });
});
```

---

## `e2e/shift-flow.spec.ts`

```ts
import { expect, test } from '@playwright/test';

// Este test E2E requiere usuarios seed y login por email/password
// Configura E2E_WORKER_EMAIL, E2E_WORKER_PASSWORD, etc.

const workerEmail = process.env.E2E_WORKER_EMAIL;
const workerPassword = process.env.E2E_WORKER_PASSWORD;

test.describe('Flujo crítico worker', () => {
  test.skip(
    !workerEmail || !workerPassword,
    'Faltan credenciales E2E de worker'
  );

  test('login y acceso a feed', async ({ page }) => {
    await page.goto('/login');

    // Ajustar selectores según tu UI de login
    await page.getByLabel('Email').fill(workerEmail!);
    await page.getByLabel('Contraseña').fill(workerPassword!);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/app\/worker/);
    await expect(page.getByText('Turnos cerca de ti')).toBeVisible();
  });
});
```

---

# 17. Documentación

## `README.md`

```md
# Bee Workers

Marketplace PWA para turnos puntuales en hostelería y restauración en Porto.

Bee Workers conecta trabajadores autónomos (`recibos verdes`) con empleadores. La plataforma **no es empleadora**. Los workers facturan directamente al employer y la plataforma cobra una comisión del **5%**.

## Stack

- Next.js 14 App Router
- TypeScript
- Supabase
  - PostgreSQL
  - Auth
  - Storage
  - Realtime
- Tailwind CSS
- PWA
- Docker
- Traefik
- Vitest
- Playwright

## Requisitos

- Node.js 20+
- Docker
- Docker Compose
- Cuenta Supabase
- VPS con Traefik configurado

## Setup local

```bash
cp .env.example .env
```

Completa:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3004
```

Instala dependencias:

```bash
npm install
```

Genera claves VAPID:

```bash
npm run generate:vapid
```

Genera iconos PWA:

```bash
npm run generate:icons
```

Ejecuta:

```bash
npm run dev
```

La app corre en:

```text
http://localhost:3004
```

## Scripts

```bash
npm run dev
npm run build
npm start
npm test
npm run test:e2e
npm run generate:vapid
npm run generate:icons
npm run deploy
```

## PWA

La app es instalable en Android e iOS.

Incluye:

- `manifest.webmanifest`
- Service Worker
- Offline fallback
- Background sync para aplicaciones
- Push notifications con VAPID

## Testing

### Unitarios

```bash
npm test
```

### Integración

Configura:

```env
TEST_SUPABASE_URL=
TEST_SUPABASE_SERVICE_ROLE_KEY=
```

Ejecuta:

```bash
npm test
```

### E2E

Configura:

```env
E2E_BASE_URL=http://localhost:3004
E2E_WORKER_EMAIL=
E2E_WORKER_PASSWORD=
E2E_EMPLOYER_EMAIL=
E2E_EMPLOYER_PASSWORD=
```

Ejecuta:

```bash
npm run test:e2e
```

## Legal

- Workers deben ser trabajadores independientes.
- Seguro de acidentes de trabajo obligatorio.
- La plataforma no fija precios.
- La plataforma no penaliza rechazo de turnos.
- La plataforma no retiene IRS ni Segurança Social.
- Las estimaciones fiscales son orientativas.
```

---

## `DEPLOY.md`

```md
# Deploy Bee Workers

Dominio:

```text
bee-workers.lumodigitalsolutions.com
```

VPS:

```text
5.189.159.232
```

Puerto interno:

```text
3004
```

## 1. Requisitos en VPS

- Docker instalado
- Docker Compose plugin
- Traefik corriendo como reverse proxy
- Red Docker externa llamada `web`
- Let's Encrypt configurado en Traefik

## 2. Crear directorio

```bash
sudo mkdir -p /opt/bee-workers
sudo chown $USER:$USER /opt/bee-workers
```

## 3. Copiar código

Desde tu máquina local:

```bash
rsync -av --exclude '.git' --exclude 'node_modules' --exclude '.next' ./ user@5.189.159.232:/opt/bee-workers/
```

## 4. Configurar variables

En VPS:

```bash
cd /opt/bee-workers
cp .env.example .env
nano .env
```

Variables mínimas:

```env
NEXT_PUBLIC_APP_URL=https://bee-workers.lumodigitalsolutions.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@lumodigitalsolutions.com
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=bee-workers.lumodigitalsolutions.com
```

## 5. Crear red Traefik si no existe

```bash
docker network create web
```

## 6. Deploy

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## 7. Verificar

```bash
curl https://bee-workers.lumodigitalsolutions.com/api/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## 8. Logs

```bash
docker logs -f bee-workers
```

## 9. Supabase local opcional

Para desarrollo local con Supabase:

```bash
supabase start
```

Usa en `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321
```

En Linux descomenta en `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
```

---

## `CONTRIBUTING.md`

```md
# Contribuir a Bee Workers

Gracias por contribuir.

## Convenciones

- TypeScript estricto
- Componentes pequeños
- Tailwind CSS con paleta Bee Workers
- Comentarios en español
- Server Actions para mutaciones
- Service role solo en servidor

## Colores

```text
Amarillo abeja: #FFB800
Amarillo oscuro: #E0A800
Negro suave: #1A1A1A
Blanco crema: #FFFAF0
Gris claro: #F5F5F0
Gris medio: #8B8B8B
```

## Ramas

```text
main
feature/*
fix/*
hotfix/*
```

## Commits

Usar formato:

```text
feat: añadir dashboard worker
fix: corregir cálculo de neto
chore: actualizar dependencias
docs: mejorar README
test: añadir tests de validaciones
```

## Tests

Antes de abrir PR:

```bash
npm test
npm run build
```

Si tocas flujos críticos:

```bash
npm run test:e2e
```

## Legal

No introducir lógica que:

- Fije precios por plataforma
- Penalice rechazo de turnos
- Retenga IRS o Segurança Social
- Trate al worker como empleado

La plataforma es una agência de colocación.
```

---

# 18. Checklist final de producción

Antes de desplegar:

```bash
npm install
npm run generate:vapid
npm run generate:icons
npm test
npm run build
```

Verificar:

- [ ] `manifest.webmanifest` accesible en `/manifest.webmanifest`
- [ ] Service Worker activo en `/sw.js`
- [ ] Página `/offline` funciona
- [ ] Push notifications funcionan
- [ ] Background Sync para aplicaciones funciona
- [ ] `/api/health` devuelve `status: ok`
- [ ] Docker build correcto
- [ ] Traefik sirve HTTPS en `bee-workers.lumodigitalsolutions.com`
- [ ] Sitemap accesible en `/sitemap.xml`
- [ ] Robots accesible en `/robots.txt`
- [ ] Turnos públicos tienen JSON-LD `JobPosting`
- [ ] Analytics Plausible/GA4 activo
- [ ] Tests unitarios pasan
- [ ] Tests integración pasan contra entorno test
- [ ] E2E críticos pasan

---

# 19. Comandos rápidos de producción

```bash
# Generar VAPID
npm run generate:vapid

# Generar iconos PWA
npm run generate:icons

# Tests
npm test

# Build local
npm run build

# Start local producción
npm start

# Deploy VPS
./scripts/deploy.sh

# Logs contenedor
docker logs -f bee-workers

# Reconstruir y reiniciar
docker compose build --pull
docker compose up -d --remove-orphans
```

---

Con esto Bee Workers queda finalizado como:

- PWA instalable
- Offline fallback
- Background sync para aplicaciones
- Push notifications
- SEO con sitemap, robots y JobPosting
- Analytics privacy-friendly
- Docker multi-stage
- Deploy automático a VPS#2 con Traefik y HTTPS
- Testing unitario, integración y E2E
- Documentación completa lista para producción