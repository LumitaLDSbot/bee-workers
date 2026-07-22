# 🐝 Bee Workers

**Plataforma de intermediación laboral temporal para hostelería y restauración en Portugal**

*Be a Worker. Bee a Worker.*

---

## 📋 Concepto

App que conecta empleadores (restaurantes, hoteles) con trabajadores temporales para turnos puntuales. El trabajador define su precio/hora, el empleador publica turnos y filtra candidatos por rating, experiencia y proximidad.

### Diferenciadores clave
- **Bidireccional** — Workers califican locales, locales califican workers
- **Bee Score** — Algoritmo que combina estrellas + trabajos completados + puntualidad
- **Geolocation check-in** — Anti-fraude: el worker debe estar en el sitio para iniciar turno
- **Cálculo neto automático** — La app muestra al worker lo que recibe después de impuestos
- **Workers autónomos** — Todos los workers deben estar registrados como trabalhador independiente (recibos verdes)

### Modelo de negocio
- Pago directo employer → worker
- Comisión de plataforma: 5% por turno
- Sin intermediación de pago (fase 1)
- Plan premium para employers (fase 3)
- Disclaimer obligatorio: IRS y Segurança Social los paga el worker. La app solo muestra estimaciones orientativas.
- Tutorial integrado: cómo declarar IRS (Cat. B) y SS como autónomo en Portugal

---

## 🎯 Nicho inicial
- **Hostelería y restauración en Porto, Portugal**
- Roles: cocineros, meseros, lavaplatos, recepcionistas, camareiras
- Expansión futura: limpieza, obras, profesores, paseadores de animales

---

## 🏗️ Stack técnico
- **Frontend:** Next.js 14+ (PWA responsiva)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Geolocation:** Browser Geolocation API + PostGIS
- **Deploy:** VPS#2 (5.189.159.232) con Docker + Traefik
- **Dominio:** bee-workers.pt (pendiente registrar) o subdominio de lumodigitalsolutions.com

### 🎨 Design System
- **Amarillo abeja:** #FFB800 (primario, CTAs, acentos)
- **Negro suave:** #1A1A1A (texto, nunca negro absoluto)
- **Blanco crema:** #FFFAF0 (fondos claros)
- **Gris claro:** #F5F5F0 (cards)
- **Gris medio:** #8B8B8B (texto secundario)
- **Amarillo oscuro:** #E0A800 (hover states)
- **Motivo visual:** Hexágonos (colmena) sutiles en UI — patrones de fondo, bordes, avatars hexagonales
- **Tipografía:** Inter o Space Grotesk (sans-serif limpia)
- **Estilo:** Limpio, minimalista, mobile-first, inspirado en Uber con identidad propia

---

## 📊 Modelo de datos (preliminar)

### Tablas principales

#### users
- id (uuid, PK)
- phone (unique)
- email
- full_name
- photo_url
- role: 'worker' | 'employer' | 'both'
- nif (unique, required for workers)
- bio
- is_verified (boolean)
- created_at

#### worker_profiles
- user_id (FK → users)
- professions[] (array: cocinero, mesero, etc.)
- skills[] (array)
- experience_years
- hourly_rate (decimal)
- location_lat, location_lng
- max_distance_km (int, default 20)
- rating_avg (decimal, 0-5)
- total_jobs (int)
- total_hours (int)
- is_autonomo (boolean, required true)
- niss (string, seguro social)

#### employer_profiles
- user_id (FK → users)
- company_name
- nif_empresa
- address
- location_lat, location_lng
- rating_avg (decimal, 0-5)
- total_shifts_posted (int)
- total_shifts_completed (int)

#### shifts
- id (uuid, PK)
- employer_id (FK → users)
- title (ej: "Cocinero para turno noche")
- profession_required (string)
- description
- date (date)
- start_time (time)
- end_time (time)
- hourly_rate_offer (decimal, nullable si employer prefiere recibir propuestas)
- location_lat, location_lng
- status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
- max_applicants (int, default 10)
- created_at

#### shift_applications
- id (uuid, PK)
- shift_id (FK → shifts)
- worker_id (FK → users)
- proposed_rate (decimal, nullable)
- message (text)
- status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
- created_at

#### shift_checkins
- id (uuid, PK)
- shift_id (FK → shifts)
- worker_id (FK → users)
- check_in_at (timestamp)
- check_in_lat, check_in_lng
- check_in_distance_m (int)
- check_out_at (timestamp, nullable)
- check_out_lat, check_out_lng (nullable)

#### ratings
- id (uuid, PK)
- shift_id (FK → shifts)
- rater_id (FK → users)
- ratee_id (FK → users)
- rating_type: 'worker_to_employer' | 'employer_to_worker'
- stars (1-5)
- comment (text, nullable)
- punctuality (1-5)
- professionalism (1-5)
- created_at

#### payments
- id (uuid, PK)
- shift_id (FK → shifts)
- worker_id (FK → users)
- employer_id (FK → users)
- gross_amount (decimal)
- commission_rate (decimal, ej: 0.07)
- commission_amount (decimal)
- net_to_worker (decimal) — bruto - comisión
- worker_tax_estimate (decimal) — estimación IVA + IRS
- worker_net_estimate (decimal) — lo que el worker realmente recibe
- status: 'pending' | 'paid' | 'disputed'
- paid_at (timestamp, nullable)

---

## 💰 Cálculo de neto del worker

```
gross_amount = hourly_rate × hours_worked
commission = gross_amount × 0.05 (5% plataforma)
worker_invoice = gross_amount (worker factura al employer)
worker_iva = worker_invoice × 0.23 (23% IVA, si aplicable)
worker_irs = estimación según tramo
worker_net = worker_invoice - worker_irs (IVA se repercute al employer)

Display al worker:
  "Por este turno cobrarás: €{gross_amount} bruto
   Factura con IVA: €{gross_amount + iva}
   Tu estimación IRS (~20%): -€{irs}
   Tu neto estimado: €{worker_net}"
```

### Exención de IVA para autónomos
- Limite 2026: €14.500/año (régimen de isenção)
- Si el worker factura < €14.500/año → NO cobra IVA
- La app debe trackear facturación anual del worker y alertarle cuando se acerque al límite

---

## 🚀 Fases

### Fase 1 — MVP (2-3 semanas)
- [ ] Diseño de BD en Supabase
- [ ] Auth (phone + email)
- [ ] Registro worker (con KYC: NIF + selfie + documento)
- [ ] Registro employer (con NIF empresa)
- [ ] Publicar turno
- [ ] Aplicar a turno
- [ ] Aceptar/rechazar aplicante
- [ ] Check-in geolocation
- [ ] Check-out
- [ ] Rating bidireccional
- [ ] Cálculo neto automático
- [ ] PWA responsiva (mobile-first)

### Fase 2 — Validación (1-2 meses)
- [ ] 10 restaurantes piloto en Porto
- [ ] App nativa (React Native) si hay tracción
- [ ] Notificaciones push
- [ ] Turnos de emergencia (tarifa premium)
- [ ] Sistema de referidos (cadena de favores)

### Fase 3 — Monetización y expansión
- [ ] Comisión automática
- [ ] Plan premium employers
- [ ] Expansión a otros nichos (limpieza, obras)
- [ ] Expansión a otras ciudades (Lisboa, Braga)
- [ ] App nativa iOS + Android

---

## ⚖️ Legal (pendiente investigación)

- Marco: Lei 19/2014 (trabalho temporário) + DL 116/2012 (prestação serviços)
- Workers como trabalhadores independentes (recibos verdes)
- Seguro de acidente de trabalho (obligatorio)
- GDPR compliance
- KYC: NIF + documento + selfie

*Ver docs/legal-research.md para detalles*

---

## 📁 Estructura del proyecto

```
bee-workers/
├── README.md (este archivo)
├── docs/
│   ├── legal-research.md
│   ├── architecture.md
│   └── design-system.md
├── src/
│   ├── app/          (Next.js pages)
│   ├── components/   (UI components)
│   ├── lib/          (Supabase client, utils)
│   ├── types/        (TypeScript types)
│   └── styles/       (Global styles)
├── prisma/
│   └── schema.prisma (si usamos Prisma)
├── supabase/
│   └── migrations/   (SQL migrations)
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

*Proyecto iniciado: 22 julio 2026*
*Creado por Lumita 💡 para Luis Enrique*