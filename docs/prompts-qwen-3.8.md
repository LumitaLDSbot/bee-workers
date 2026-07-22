# Bee Workers — Prompts para Qwen 3.8 Max

**Fecha:** 22 julio 2026
**Modelo objetivo:** Qwen 3.8 Max (preview gratuito)
**Estrategia:** 5 prompts secuenciales, cada uno construye sobre el anterior

---

## 📋 CONTEXTO DEL PROYECTO (incluir al inicio de cada prompt)

```
Bee Workers es una plataforma PWA (Next.js 14 + Supabase) que conecta trabajadores autónomos (recibos verdes) con empleadores de hostelería y restauración en Porto, Portugal, para turnos puntuales y temporales.

Modelo: Marketplace (agência de colocação). La plataforma NO es empleadora. Workers facturan directamente al employer. La plataforma cobra 5% de comisión.

IMPORTANTE: La plataforma NO retiene IRS ni Segurança Social. El worker recibe el bruto menos la comisión (5%) y es responsable de declarar y pagar sus propios impuestos. La app muestra estimaciones orientativas pero el pago real de impuestos es responsabilidad exclusiva del worker. Incluir tutorial integrado de cómo declarar IRS (Cat. B) y SS como autónomo.

Stack: Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL + Auth + Storage + Realtime), Tailwind CSS, PWA mobile-first.

Legal clave (Portugal):
- Workers deben ser trabalhadores independentes (recibos verdes)
- Seguro de acidentes de trabalho obligatorio (Lei 98/2009)
- Art. 12.º-A CT: NO fijar precios, NO controlar horarios, NO penalizar rechazo de turnos
- IVA: exento si factura < €15.000/año
- IRS: Categoría B, tributa sobre 75% del bruto
- Segurança Social: 21.4% sobre 70% del bruto (12 meses exento al iniciar)
```

---

## PROMPT 1: Arquitectura + Base de Datos

```
Eres un arquitecto de software senior. Diseña la arquitectura completa de Bee Workers, una plataforma PWA con Next.js 14 + Supabase que conecta trabajadores autónomos con empleadores de hostelería en Porto, Portugal.

Necesito que generes:

1. Schema completo de PostgreSQL para Supabase con estas tablas mínimo:
   - users (con phone, email, NIF, role worker/employer/both, is_verified)
   - worker_profiles (professions[], skills[], hourly_rate, location, rating, total_jobs, is_autonomo, niss, seguro_vigente)
   - employer_profiles (company_name, nif_empresa, address, location, rating, total_shifts)
   - shifts (employer_id, profession_required, date, start_time, end_time, hourly_rate_offer, location, status)
   - shift_applications (shift_id, worker_id, proposed_rate, status)
   - shift_checkins (shift_id, worker_id, check_in_at, lat, lng, distance, check_out_at)
   - ratings (shift_id, rater, ratee, type, stars, punctuality, professionalism, comment)
   - payments (shift_id, gross, commission_rate, commission, net_to_worker, tax_estimate, worker_net_estimate)
   - notifications (user_id, type, title, body, data, read_at)
   - worker_annual_earnings (worker_id, year, total_billed, iva_exemption_remaining)

2. Row Level Security (RLS) policies para cada tabla
3. Triggers necesarios (update rating_avg después de rating, update total_jobs después de shift completado, update annual_earnings después de payment)
4. Funciones SQL:
   - calculate_worker_net(hourly_rate, hours, worker_id) → returns breakdown
   - get_nearby_shifts(worker_lat, worker_lng, max_km, profession) → returns shifts within radius
   - check_iva_exemption(worker_id) → returns remaining exemption amount
5. Storage buckets: profile-photos, worker-documents (seguro, NIF, atividade)
6. Estructura de carpetas del proyecto Next.js 14 (App Router)

Genera todo el SQL completo, listo para ejecutar en Supabase SQL Editor. Incluye comentarios en español. Usa UUIDs como PKs y timestamps con timezone.
```

---

## PROMPT 2: Autenticación + Registro + KYC

```
Eres un desarrollador Full Stack senior. Implementa el sistema de autenticación y registro de Bee Workers (Next.js 14 + Supabase).

Requisitos:

1. Flujo de registro WORKER:
   - Step 1: Phone + OTP (Supabase Auth con phone)
   - Step 2: Datos personales (nombre, email, NIF, fecha nacimiento)
   - Step 3: Foto perfil (subir a Supabase Storage)
   - Step 4: Profesiones y skills (seleccionar de lista predefinida + custom)
   - Step 5: Verificación de identidad:
     - Foto frontal del documento (CC o pasaporte)
     - Selfie con documento
     - NIF verificado
   - Step 6: Verificación de autónomo:
     - Subir comprobante de actividad aberta nas Finanças
     - Subir comprobante de seguro de acidentes de trabalho
   - Step 7: Definir precio/hora y radio de trabajo (km)
   - Step 8: Aceptar Términos y Condiciones + Privacy Policy

2. Flujo de registro EMPLOYER:
   - Step 1: Phone + OTP
   - Step 2: Datos empresa (nombre, NIF empresa, email, phone)
   - Step 3: Dirección + geocode (Google Maps o similar)
   - Step 4: Logo empresa
   - Step 5: Verificación NIF empresa
   - Step 6: Aceptar Términos y Condiciones

3. Flujo de LOGIN:
   - Phone + OTP
   - Email + password (fallback)
   - Session persistente (Supabase session)

4. Protección de rutas:
   - Middleware Next.js para rutas protegidas
   - Redirect según rol (worker → /app/worker, employer → /app/employer)
   - Ruta /onboarding solo para usuarios no verificados

Genera:
- Componentes React completos con TypeScript
- Usando Tailwind CSS para estilos (mobile-first, diseño tipo Uber: limpio, minimalista)
- Validación con Zod
- Manejo de errores en español (mensajes user-friendly)
- Upload a Supabase Storage con progreso
- Estados de carga y error
- Hooks personalizados (useAuth, useRegistration)
- Tipos TypeScript completos

Diseño visual: Inspirado en Uber pero con identidad propia. Paleta de colores:
- Amarillo abeja: #FFB800 (color primario, acentos, CTAs)
- Negro suave: #1A1A1A (texto, no negro absoluto puro)
- Blanco crema: #FFFAF0 (fondos claros)
- Gris claro: #F5F5F0 (fondos de cards)
- Gris medio: #8B8B8B (texto secundario)
- Amarillo oscuro: #E0A800 (hover states)
- Motivo visual: hexágonos (colmena) sutilmente integrados en UI (patrones de fondo, bordes decorativos, avatars con shape hexagonal opcional)
- Tipografía: sans-serif limpia y moderna (Inter o Space Grotesk)
- Mucho espacio en blanco, botones grandes redondeados, cards con shadow suave
- No usar negro absoluto (#000000) en ningún lado — siempre negro suave
```

---

## PROMPT 3: Core — Turnos, Aplicaciones, Check-in, Ratings

```
Eres un desarrollador Full Stack senior. Implementa el core de Bee Workers (Next.js 14 + Supabase): publicación de turnos, aplicaciones, check-in geolocation y ratings.

### 1. PUBLICAR TURNO (Employer)
- Formulario: profesión requerida, fecha, hora inicio, hora fin, precio/hora (opcional), descripción, número de workers necesarios
- Preview del costo total estimado (precio/hora × horas × num_workers)
- Publicar a Supabase + notificación a workers cercanos (Realtime)
- Lista de mis turnos publicados con estado y aplicaciones recibidas

### 2. BUSCAR Y APLICAR A TURNOS (Worker)
- Feed de turnos cercanos (usar función get_nearby_shifts)
- Filtros: profesión, distancia, fecha, precio/hora mínimo
- Cada turno muestra: empresa, fecha, horario, precio, rating de la empresa, distancia
- Botón "Aplicar" con mensaje opcional y propuesta de precio (si employer no fijó precio)
- "Ver perfil de la empresa" (rating, total_shifts, comentarios de otros workers)

### 3. GESTIONAR APLICACIONES (Employer)
- Ver lista de aplicantes para cada turno
- Filtros: rating, número de trabajos completados, precio/hora
- "Ver perfil del worker" (foto, profesiones, rating, total_jobs, skills)
- Aceptar / Rechazar aplicante
- Al aceptar: notificación al worker, turno cambia a "assigned"

### 4. CHECK-IN / CHECK-OUT (Worker)
- Botón "Iniciar turno" — solo disponible 15 min antes del horario
- Verificación de geolocation: comparar lat/lng del worker con lat/lng del turno
- Si distancia > 100m → bloquear check-in con mensaje
- Registrar check_in_at, lat, lng, distance
- Botón "Finalizar turno" — registrar check_out_at, lat, lng
- Al finalizar: trigger para crear registro de payment + rating pendiente

### 5. RATINGS (Bidireccional)
- Después de check-out:
  - Worker califica employer (1-5 estrellas + punctuality + professionalism + comment)
  - Employer califica worker (1-5 estrellas + punctuality + professionalism + comment)
- Solo se pueden calificar turnos completados
- Rating visible en perfil solo después de 3 ratings (privacidad inicial)
- Trigger: actualizar rating_avg y total_jobs/total_shifts

### 6. NOTIFICACIONES
- Usar Supabase Realtime subscriptions
- Worker recibe: nuevo turno cercano, aplicación aceptada, aplicación rechazada, recordatorio de turno
- Employer recibe: nueva aplicación, worker hizo check-in, worker hizo check-out, rating pendiente
- Badge de notificaciones no leídas en navbar

### 7. CÁLCULO DE NETO (Worker)
- Al ver un turno, mostrar breakdown:
  - Bruto: €X/hora × Y horas = €Z
  - Comisión Bee Workers (5%): -€C
  - Tu estimación IRS (23% retención): -€R
  - Tu estimación SS (21.4% × 70%): -€S (si no está en periodo de exención)
  - **Neto estimado: €N**
- Función calculate_worker_net() en SQL + equivalente en TypeScript

Genera:
- Todos los componentes React con TypeScript
- Server Actions o API routes donde aplique
- Hooks: useShifts, useApplications, useCheckin, useRatings, useNotifications
- Realtime subscriptions con Supabase
- Geolocation API del browser (con manejo de permisos)
- Estados de carga, error, vacío
- Diseño mobile-first tipo Uber (limpio, minimalista, amarillo abeja #FFB800 como acento, negro suave #1A1A1A, motivo hexagonal sutil en UI)
- Todas las pantallas necesarias

Usa Tailwind CSS. Componentes pequeños y reutilizables. Comentarios en español.
```

---

## PROMPT 4: Dashboard + Perfil + Configuración + Admin

```
Eres un desarrollador Full Stack senior. Implementa los dashboards, perfiles y panel de administración de Bee Workers (Next.js 14 + Supabase).

### 1. DASHBOARD WORKER
- Resumen: turnos esta semana, ingresos del mes, rating actual, próximos turnos
- Gráfico de ingresos mensuales (Chart simple con CSS o librería ligera)
- Lista de próximos turnos (con opción de cancelar si faltan >24h)
- Historial de turnos completados (con paginación)
- Tracking de facturación anual: barra de progreso hacia límite de IVA (€15.000)
- Alerta si se acerca al límite: "Te quedan €X antes de tener que cobrar IVA"

### 2. DASHBOARD EMPLOYER
- Resumen: turnos activos, workers contratados este mes, rating de la empresa
- Lista de turnos publicados (activos, completados, cancelados)
- Workers favoritos (lista de workers con buena experiencia previa)
- Gasto total del mes en turnos
- Gráfico de uso mensual

### 3. PERFIL WORKER (público)
- Foto, nombre, profesiones, skills
- Rating con estrellas + total de trabajos completados
- Verificado (badge: NIF ✓, Autónomo ✓, Seguro ✓)
- Comentarios recientes de employers (sin nombre del employer por privacidad)
- Disponibilidad actual (activo/inactivo toggle)
- Editar precio/hora, radio de trabajo, profesiones

### 4. PERFIL EMPLOYER (público)
- Logo, nombre de empresa, dirección
- Rating con estrellas + total de turnos completados
- Verificado (badge: NIF empresa ✓)
- Comentarios recientes de workers
- Editar info de empresa

### 5. CONFIGURACIÓN (ambos)
- Editar datos personales
- Cambiar foto/logo
- Notificaciones (toggle por tipo)
- Idioma (PT, ES, EN)
- Dark mode
- Eliminar cuenta (con confirmación + período de gracia de 30 días)

### 6. PANEL ADMIN (Bee Workers staff)
- Solo accesible para rol 'admin'
- Lista de workers (con filtros: verificados, pendientes, bloqueados)
- Lista de employers (con filtros)
- Verificación manual de documentos (KYC review)
- Métricas: usuarios activos, turnos/mes, GMV (gross merchandise value), comisiones
- Gestión de disputas (si un worker o employer reporta un problema)
- Ban/suspender usuarios

### 7. PÁGINA LANDING (pública)
- Hero: "Be a Worker. Bee a Worker." + CTA registro
- Cómo funciona (worker y employer, dos columnas)
- Beneficios clave (bidireccional, geolocation, verified profiles)
- Testimonios (placeholder)
- FAQ
- Footer con links legales (Terms, Privacy, Contacto)

Genera:
- Todos los componentes React con TypeScript
- Diseño mobile-first tipo Uber (limpio, minimalista)
- Tailwind CSS con amarillo miel #FFB800, negro suave #1A1A1A, blanco crema #FFFAF0, motivo hexagonal sutil
- Charts simples (sin librerías pesadas, usar CSS/SVG)
- Estados de carga y error
- Componentes reutilizables (Card, Badge, RatingStars, ProgressBar, Avatar, etc.)
- Responsive: mobile, tablet, desktop
- Comentarios en español
```

---

## PROMPT 5: PWA + Deploy + Docker + Testing

```
Eres un DevOps y QA senior. Finaliza Bee Workers (Next.js 14 + Supabase) como PWA instalable y despliegue en producción.

### 1. PWA CONFIGURATION
- manifest.json completo (iconos, nombre, colores, display standalone)
- Service Worker con next-pwa o manual:
  - Cache de páginas estáticas
  - Offline fallback page
  - Background sync para aplicaciones a turnos
- Instalable en iOS y Android (Add to Home Screen)
- Push notifications (Web Push API + VAPID keys)
- Splash screen

### 2. PERFORMANCE
- next.config.js optimizado (images, compression, headers)
- Lazy loading de componentes pesados
- Optimización de imágenes (next/image con Supabase Storage)
- Code splitting por ruta
- Prefetch de rutas probables

### 3. DOCKER SETUP
- Dockerfile multi-stage (build + production)
- docker-compose.yml con:
  - Next.js app
  - Supabase local (para dev) o apuntar a cloud
  - Traefik labels para routing HTTPS
- .env.example con todas las variables necesarias
- Health check endpoint

### 4. DEPLOY EN VPS#2
- Script de deploy (deploy.sh) para VPS#2 (5.189.159.232)
- Traefik labels: bee-workers.lumodigitalsolutions.com
- HTTPS automático con Let's Encrypt
- Puerto interno: 3004
- Variables de entorno: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

### 5. TESTING
- Tests unitarios con Vitest para:
  - Cálculo de neto del worker
  - Validación de formularios (Zod schemas)
  - Funciones utilitarias (formatPrice, calculateDistance, etc.)
- Tests de integración para:
  - Flujo de registro (worker y employer)
  - Publicar turno → aplicar → aceptar → check-in → check-out → rating
- Tests E2E con Playwright para flujos críticos

### 6. SEO + ANALYTICS
- Metadata por página (Open Graph, Twitter Cards)
- sitemap.xml dinámico
- robots.txt
- Schema.org structured data (JobPosting para turnos públicos)
- Google Analytics 4 o Plausible (privacy-friendly)

### 7. DOCUMENTACIÓN
- README.md actualizado con setup completo
- DEPLOY.md con pasos de despliegue
- CONTRIBUTING.md
- .env.example documentado

Genera todos los archivos completos, listos para usar. Comentarios en español. Configuración lista para producción.
```

---

## 📝 Notas de uso

- Enviar los prompts en orden (1→5), cada uno espera a que Qwen termine
- Copiar el código generado a los archivos correspondientes del proyecto
- Revisar y adaptar antes de deployar
- Qwen 3.8 Max tiene 256K context window → puede generar archivos grandes completos
- Si un prompt genera demasiado, dividir en sub-prompts

---

*Creado por Lumita 💡 para Luis — 22 julio 2026*