# Arquitectura completa Bee Workers (Next.js 14 + Supabase, PWA, Porto)


A continuación tienes una arquitectura pensada para:


- **Marketplace / agência de colocação**, donde Bee Workers **no es empleador**.
- Workers autónomos (`recibos verdes`) facturan directamente al employer.
- La plataforma cobra una **comisión del 7%**.
- Cumplimiento legal básico en Portugal:
  - Worker como `trabalhador independente`.
  - Seguro de accidentes de trabajo obligatorio.
  - No fijación de precios por plataforma.
  - No penalización por rechazo de turnos.
  - Tracking de IVA < €15.000/año.
  - Estimación IRS categoría B y Segurança Social.


---


## 1. Arquitectura de alto nivel


```text
PWA Mobile-first (Next.js 14 App Router)
        |
        |  Server Components / Server Actions / Route Handlers
        v
Next.js Backend
        |
        |  Supabase JS (anon) + Supabase Service Role (backend privilegiado)
        v
Supabase
  - PostgreSQL
  - Auth
  - Row Level Security
  - Storage
  - Realtime
  - Database Functions / Triggers
```


### Principios de diseño legal


1. **La plataforma no fija precio**
   - `shifts.hourly_rate_offer` es oferta del employer.
   - `shift_applications.proposed_rate` es propuesta del worker.
   - No hay constraints de precio mínimo/máximo impuestos por plataforma.


2. **No penalización por rechazo**
   - `shift_applications.status` puede ser `rejected`, `withdrawn`, `cancelled`.
   - No hay rating negativo ni score oculto por rechazar.


3. **Worker autónomo**
   - `worker_profiles.is_autonomo`.
   - `worker_profiles.seguro_vigente`.
   - Documentos en bucket privado `worker-documents`.


4. **Pagos y comisión**
   - Payment registra `gross`, `commission_rate = 0.07`, `commission`, `net_to_worker`.
   - IRS y Segurança Social se guardan como estimación.
   - La plataforma no calcula IRS final ni retiene IRS.


5. **IVA**
   - `worker_annual_earnings.iva_exemption_remaining` trackea el remanente de €15.000.


---


# 2. SQL completo para Supabase


Ejecutar en **Supabase SQL Editor**.


> Está pensado para un proyecto nuevo. Muchas sentencias usan `IF NOT EXISTS` / `DROP POLICY IF EXISTS` para facilitar re-ejecución parcial.


```sql
-- =====================================================
-- Bee Workers - Schema completo Supabase
-- Next.js 14 + Supabase
-- Marketplace de turnos en hostelería/restauración (Porto)
-- =====================================================


-- Extensiones necesarias
create extension if not exists postgis;
create extension if not exists pgcrypto;


-- =====================================================
-- Tipos ENUM
-- =====================================================


do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'user_role'
  ) then
    create type public.user_role as enum ('worker', 'employer', 'both');
  end if;


  if not exists (
    select 1 from pg_type where typname = 'shift_status'
  ) then
    create type public.shift_status as enum (
      'draft',
      'published',
      'assigned',
      'completed',
      'cancelled',
      'expired'
    );
  end if;


  if not exists (
    select 1 from pg_type where typname = 'application_status'
  ) then
    create type public.application_status as enum (
      'pending',
      'accepted',
      'rejected',
      'withdrawn',
      'cancelled'
    );
  end if;


  if not exists (
    select 1 from pg_type where typname = 'rating_type'
  ) then
    create type public.rating_type as enum (
      'employer_to_worker',
      'worker_to_employer'
    );
  end if;


  if not exists (
    select 1 from pg_type where typname = 'payment_status'
  ) then
    create type public.payment_status as enum (
      'pending',
      'paid',
      'released',
      'refunded',
      'cancelled'
    );
  end if;
end
$$;


-- =====================================================
-- Tabla: users
-- Perfil base de autenticación y rol
-- =====================================================


create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  email text,
  full_name text,
  nif text,
  role public.user_role not null default 'worker',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint users_phone_unique unique (phone),
  constraint users_email_unique unique (email),
  constraint users_nif_unique unique (nif),
  constraint users_nif_check check (nif is null or nif ~ '^[0-9]{9}$')
);


comment on table public.users is 'Usuarios de Bee Workers. Puede ser worker, employer o both.';
comment on column public.users.is_verified is 'Verificación administrativa de identidad/documentos. No debe ser editable por el propio usuario.';


-- =====================================================
-- Tabla: worker_profiles
-- Perfil público/operativo del trabajador autónomo
-- =====================================================


create table if not exists public.worker_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name text,
  professions text[] not null default '{}',
  skills text[] not null default '{}',
  hourly_rate numeric(10,2) not null default 0,
  location text,
  latitude double precision,
  longitude double precision,
  geog geography(Point, 4326) generated always as (
    case
      when longitude is not null and latitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
    end
  ) stored,


  rating numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  total_jobs integer not null default 0,


  is_autonomo boolean not null default false,
  niss text,
  first_activity_at date,
  is_social_security_exempt boolean not null default false,


  seguro_vigente boolean not null default false,
  seguro_expires_at date,


  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint worker_profiles_hourly_rate_nonnegative check (hourly_rate >= 0),
  constraint worker_profiles_rating_range check (rating between 0 and 5),
  constraint worker_profiles_total_jobs_nonnegative check (total_jobs >= 0),
  constraint worker_profiles_rating_count_nonnegative check (rating_count >= 0),
  constraint worker_profiles_niss_check check (niss is null or niss ~ '^[0-9]{11}$')
);


comment on table public.worker_profiles is 'Perfil del trabajador independiente (recibos verdes).';
comment on column public.worker_profiles.hourly_rate is 'Tarifa orientativa definida por el worker. La plataforma no la impone.';
comment on column public.worker_profiles.is_social_security_exempt is 'Flag administrativo para exención SS 12 meses. No debería ser autoeditable.';


-- =====================================================
-- Tabla: employer_profiles
-- Perfil del empleador / establecimiento
-- =====================================================


create table if not exists public.employer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_name text not null,
  nif_empresa text,
  address text,
  location text,
  latitude double precision,
  longitude double precision,
  geog geography(Point, 4326) generated always as (
    case
      when longitude is not null and latitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
    end
  ) stored,


  rating numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  total_shifts integer not null default 0,


  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint employer_profiles_nif_empresa_unique unique (nif_empresa),
  constraint employer_profiles_nif_empresa_check check (nif_empresa is null or nif_empresa ~ '^[0-9]{9}$'),
  constraint employer_profiles_rating_range check (rating between 0 and 5),
  constraint employer_profiles_total_shifts_nonnegative check (total_shifts >= 0),
  constraint employer_profiles_rating_count_nonnegative check (rating_count >= 0)
);


comment on table public.employer_profiles is 'Perfil del empleador de hostelería/restauración.';


-- =====================================================
-- Tabla: shifts
-- Turnos publicados por employers
-- =====================================================


create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.users(id) on delete cascade,


  profession_required text not null,
  description text,


  -- Campos solicitados explícitamente
  shift_date date not null default current_date,
  start_time time,
  end_time time,


  -- Campos robustos con timezone
  starts_at timestamptz,
  ends_at timestamptz,


  hourly_rate_offer numeric(10,2) not null,
  location text,
  latitude double precision,
  longitude double precision,
  geog geography(Point, 4326) generated always as (
    case
      when longitude is not null and latitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
    end
  ) stored,


  status public.shift_status not null default 'draft',


  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint shifts_hourly_rate_offer_nonnegative check (hourly_rate_offer >= 0)
);


comment on table public.shifts is 'Turnos puntuales/temporales publicados por employers.';
comment on column public.shifts.hourly_rate_offer is 'Oferta económica definida por el employer. La plataforma no fija precio.';


-- =====================================================
-- Tabla: shift_applications
-- Aplicaciones de workers a shifts
-- =====================================================


create table if not exists public.shift_applications (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  worker_id uuid not null references public.users(id) on delete cascade,


  proposed_rate numeric(10,2) not null,
  status public.application_status not null default 'pending',


  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint shift_applications_unique_per_worker_shift unique (shift_id, worker_id),
  constraint shift_applications_proposed_rate_nonnegative check (proposed_rate >= 0)
);


comment on table public.shift_applications is 'Aplicaciones de trabajadores a turnos.';
comment on column public.shift_applications.proposed_rate is 'Tarifa propuesta por el worker. La plataforma no impone precio.';


-- Solo una aplicación aceptada por shift
create unique index if not exists shift_applications_one_accepted_idx
  on public.shift_applications (shift_id)
  where status = 'accepted';


-- =====================================================
-- Tabla: shift_checkins
-- Check-in/check-out como prueba de servicio
-- No debe usarse para control horario abusivo
-- =====================================================


create table if not exists public.shift_checkins (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  worker_id uuid not null references public.users(id) on delete cascade,


  check_in_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  distance_meters numeric,


  check_out_at timestamptz,


  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint shift_checkins_unique_per_worker_shift unique (shift_id, worker_id),
  constraint shift_checkins_checkout_after_checkin check (
    check_out_at is null or check_out_at >= check_in_at
  )
);


comment on table public.shift_checkins is 'Registro de check-in/check-out como evidencia del servicio.';


-- =====================================================
-- Tabla: ratings
-- Ratings bidireccionales después de shift completado
-- =====================================================


create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  rater_id uuid not null references public.users(id) on delete cascade,
  ratee_id uuid not null references public.users(id) on delete cascade,


  type public.rating_type not null,
  stars integer not null,
  punctuality integer,
  professionalism integer,
  comment text,


  created_at timestamptz not null default now(),


  constraint ratings_unique_rater_per_shift unique (shift_id, rater_id),
  constraint ratings_stars_range check (stars between 1 and 5),
  constraint ratings_punctuality_range check (punctuality is null or punctuality between 1 and 5),
  constraint ratings_professionalism_range check (professionalism is null or professionalism between 1 and 5)
);


comment on table public.ratings is 'Valoraciones tras shifts completados. Sin penalización por rechazo de turno.';


-- =====================================================
-- Tabla: payments
-- Registro de pago/comisión. No implica que Bee Workers sea empleador.
-- =====================================================


create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts(id) on delete restrict,
  worker_id uuid references public.users(id) on delete restrict,


  gross numeric(12,2) not null,
  commission_rate numeric(5,4) not null default 0.07,
  commission numeric(12,2) not null default 0,
  net_to_worker numeric(12,2) not null default 0,


  -- IRS no lo calcula la plataforma como retención final.
  -- tax_estimate se usa aquí como estimación de Segurança Social.
  tax_estimate numeric(12,2) not null default 0,
  worker_net_estimate numeric(12,2) not null default 0,


  currency text not null default 'EUR',
  status public.payment_status not null default 'pending',
  paid_at timestamptz,


  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),


  constraint payments_gross_nonnegative check (gross >= 0),
  constraint payments_commission_nonnegative check (commission >= 0),
  constraint payments_net_to_worker_nonnegative check (net_to_worker >= 0),
  constraint payments_tax_estimate_nonnegative check (tax_estimate >= 0),
  constraint payments_worker_net_estimate_nonnegative check (worker_net_estimate >= 0),
  constraint payments_commission_rate_range check (commission_rate between 0 and 1)
);


comment on table public.payments is 'Registro económico del turno. Worker factura al employer; plataforma cobra comisión 7%.';
comment on column public.payments.tax_estimate is 'Estimación de Segurança Social. No es retención final de IRS.';


-- =====================================================
-- Tabla: notifications
-- =====================================================


create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,


  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,


  read_at timestamptz,
  created_at timestamptz not null default now()
);


comment on table public.notifications is 'Notificaciones para workers y employers.';


-- =====================================================
-- Tabla: worker_annual_earnings
-- Tracking anual para exención IVA (art. 53 CIVA, límite 15.000)
-- =====================================================


create table if not exists public.worker_annual_earnings (
  worker_id uuid not null references public.users(id) on delete cascade,
  year integer not null,
  total_billed numeric(14,2) not null default 0,
  iva_exemption_remaining numeric(14,2) not null default 15000,
  updated_at timestamptz not null default now(),


  primary key (worker_id, year),
  constraint worker_annual_earnings_year_check check (year >= 2020),
  constraint worker_annual_earnings_total_billed_nonnegative check (total_billed >= 0),
  constraint worker_annual_earnings_iva_remaining_nonnegative check (iva_exemption_remaining >= 0)
);


comment on table public.worker_annual_earnings is 'Resumen anual de facturación del worker para control de IVA.';


-- =====================================================
-- Función básica: updated_at
-- =====================================================


create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Triggers updated_at
create or replace trigger set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.worker_profiles
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.employer_profiles
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.shift_applications
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.shift_checkins
  for each row execute function public.set_updated_at();


create or replace trigger set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();


-- =====================================================
-- Normalización de fechas/horas en shifts
-- Convierte date + time a timestamptz en Europe/Lisbon
-- Soporta turnos que terminan después de medianoche
-- =====================================================


create or replace function public.shifts_normalize_times()
returns trigger
language plpgsql
as $$
begin
  -- Si starts_at viene informado, manda sobre date/time
  if new.starts_at is not null then
    new.shift_date := (new.starts_at at time zone 'Europe/Lisbon')::date;
    new.start_time := (new.starts_at at time zone 'Europe/Lisbon')::time;
  else
    if new.shift_date is null or new.start_time is null then
      raise exception 'shift_date y start_time son obligatorios si starts_at no se indica';
    end if;


    new.starts_at := timezone('Europe/Lisbon', new.shift_date + new.start_time);
  end if;


  -- Si ends_at viene informado, se usa para end_time
  if new.ends_at is not null then
    new.end_time := (new.ends_at at time zone 'Europe/Lisbon')::time;
  else
    if new.end_time is null then
      raise exception 'end_time o ends_at son obligatorios';
    end if;


    -- Si end_time es menor o igual que start_time, se asume día siguiente
    if new.end_time > new.start_time then
      new.ends_at := timezone('Europe/Lisbon', new.shift_date + new.end_time);
    else
      new.ends_at := timezone('Europe/Lisbon', (new.shift_date + 1) + new.end_time);
    end if;
  end if;


  if new.ends_at <= new.starts_at then
    raise exception 'ends_at debe ser posterior a starts_at';
  end if;


  return new;
end;
$$;


create or replace trigger shifts_normalize_times
  before insert or update on public.shifts
  for each row execute function public.shifts_normalize_times();


-- Después de crear el trigger, forzamos NOT NULL
alter table public.shifts alter column start_time set not null;
alter table public.shifts alter column end_time set not null;
alter table public.shifts alter column starts_at set not null;
alter table public.shifts alter column ends_at set not null;


do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_ends_after_starts'
  ) then
    alter table public.shifts
      add constraint shifts_ends_after_starts check (ends_at > starts_at);
  end if;
end
$$;


-- =====================================================
-- Índices
-- =====================================================


create index if not exists users_role_idx
  on public.users (role);


create index if not exists worker_profiles_geog_idx
  on public.worker_profiles using gist (geog);


create index if not exists worker_profiles_professions_idx
  on public.worker_profiles using gin (professions);


create index if not exists worker_profiles_skills_idx
  on public.worker_profiles using gin (skills);


create index if not exists employer_profiles_geog_idx
  on public.employer_profiles using gist (geog);


create index if not exists shifts_employer_id_idx
  on public.shifts (employer_id);


create index if not exists shifts_status_starts_at_idx
  on public.shifts (status, starts_at);


create index if not exists shifts_profession_required_idx
  on public.shifts (profession_required);


create index if not exists shifts_geog_idx
  on public.shifts using gist (geog);


create index if not exists shift_applications_shift_id_idx
  on public.shift_applications (shift_id);


create index if not exists shift_applications_worker_id_idx
  on public.shift_applications (worker_id);


create index if not exists shift_applications_shift_status_idx
  on public.shift_applications (shift_id, status);


create index if not exists shift_checkins_shift_worker_idx
  on public.shift_checkins (shift_id, worker_id);


create index if not exists ratings_ratee_type_idx
  on public.ratings (ratee_id, type);


create index if not exists ratings_shift_idx
  on public.ratings (shift_id);


create index if not exists payments_shift_id_idx
  on public.payments (shift_id);


create index if not exists payments_worker_status_idx
  on public.payments (worker_id, status);


create index if not exists payments_paid_status_idx
  on public.payments (status)
  where status in ('paid', 'released');


create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read_at);


-- =====================================================
-- Funciones helper para RLS
-- SECURITY DEFINER para evitar recursividad con RLS
-- =====================================================


create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid();
$$;


create or replace function public.current_user_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_verified, false)
  from public.users
  where id = auth.uid();
$$;


create or replace function public.is_employer_of_shift(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shifts
    where id = p_shift_id
      and employer_id = auth.uid()
  );
$$;


create or replace function public.is_assigned_worker_for_shift(p_shift_id uuid, p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shift_applications
    where shift_id = p_shift_id
      and worker_id = p_worker_id
      and status = 'accepted'
  );
$$;


-- =====================================================
-- Función: calculate_worker_net_core
-- Devuelve breakdown económico a partir de gross
-- =====================================================


create or replace function public.calculate_worker_net_core(
  p_gross numeric,
  p_worker_id uuid
)
returns table (
  gross numeric,
  commission_rate numeric,
  commission numeric,
  net_to_worker numeric,
  irs_taxable_base numeric,
  social_security_base numeric,
  social_security_exempt boolean,
  social_security_estimate numeric,
  tax_estimate numeric,
  worker_net_estimate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross numeric := round(coalesce(p_gross, 0), 2);
  v_commission_rate numeric := 0.07;
  v_commission numeric;
  v_net_to_worker numeric;
  v_irs_taxable_base numeric;
  v_social_security_base numeric;
  v_social_security_exempt boolean := false;
  v_social_security_estimate numeric;
  v_first_activity date;
  v_manual_exempt boolean;
begin
  -- Autorización: solo el propio worker, service_role o admin DB
  if p_worker_id is not null
     and auth.uid() is distinct from p_worker_id
     and coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'No autorizado para calcular neto de otro trabajador'
      using errcode = 'insufficient_privilege';
  end if;


  v_commission := round(v_gross * v_commission_rate, 2);
  v_net_to_worker := round(v_gross - v_commission, 2);


  -- IRS categoría B: base simplificada 75% del bruto
  v_irs_taxable_base := round(v_gross * 0.75, 2);


  -- Segurança Social: base 70% del bruto
  v_social_security_base := round(v_gross * 0.70, 2);


  if p_worker_id is not null then
    select
      coalesce(wp.first_activity_at, wp.created_at::date),
      coalesce(wp.is_social_security_exempt, false)
    into v_first_activity, v_manual_exempt
    from public.worker_profiles wp
    where wp.user_id = p_worker_id;


    if found then
      -- Exención 12 meses desde inicio de actividad
      v_social_security_exempt := v_manual_exempt
        or (v_first_activity + interval '12 months') > now();
    else
      v_social_security_exempt := false;
    end if;
  end if;


  if v_social_security_exempt then
    v_social_security_estimate := 0.00;
  else
    v_social_security_estimate := round(v_social_security_base * 0.214, 2);
  end if;


  return query
  select
    v_gross,
    v_commission_rate,
    v_commission,
    v_net_to_worker,
    v_irs_taxable_base,
    v_social_security_base,
    v_social_security_exempt,
    v_social_security_estimate,
    v_social_security_estimate, -- tax_estimate = estimación SS
    round(v_net_to_worker - v_social_security_estimate, 2);
end;
$$;


comment on function public.calculate_worker_net_core is 'Calcula comisión 7%, base IRS 75%, base SS 70%, SS 21.4% y exención 12 meses.';


-- =====================================================
-- Función solicitada: calculate_worker_net(hourly_rate, hours, worker_id)
-- =====================================================


create or replace function public.calculate_worker_net(
  p_hourly_rate numeric,
  p_hours numeric,
  p_worker_id uuid
)
returns table (
  hourly_rate numeric,
  hours numeric,
  gross numeric,
  commission_rate numeric,
  commission numeric,
  net_to_worker numeric,
  irs_taxable_base numeric,
  social_security_base numeric,
  social_security_exempt boolean,
  social_security_estimate numeric,
  tax_estimate numeric,
  worker_net_estimate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p_hourly_rate,
    p_hours,
    c.*
  from public.calculate_worker_net_core(
    round(coalesce(p_hourly_rate, 0) * coalesce(p_hours, 0), 2),
    p_worker_id
  ) c;
$$;


comment on function public.calculate_worker_net is 'Breakdown completo a partir de hourly_rate y hours.';


-- =====================================================
-- Función solicitada: check_iva_exemption(worker_id)
-- Devuelve remanente de exención IVA (15.000)
-- =====================================================


create or replace function public.check_iva_exemption(p_worker_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
begin
  if p_worker_id is null then
    return 15000;
  end if;


  -- Autorización: solo propio worker, service_role o admin DB
  if auth.uid() is distinct from p_worker_id
     and coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'No autorizado para consultar IVA de otro trabajador'
      using errcode = 'insufficient_privilege';
  end if;


  select greatest(15000 - coalesce(total_billed, 0), 0)
  into v_remaining
  from public.worker_annual_earnings
  where worker_id = p_worker_id
    and year = extract(year from now())::int;


  return coalesce(v_remaining, 15000);
end;
$$;


comment on function public.check_iva_exemption is 'Devuelve el remanente de la exención de IVA (15.000) para el año actual.';


-- =====================================================
-- Función solicitada: get_nearby_shifts
-- =====================================================


create or replace function public.get_nearby_shifts(
  worker_lat double precision,
  worker_lng double precision,
  max_km numeric default 10,
  profession text default null
)
returns table (
  id uuid,
  employer_id uuid,
  profession_required text,
  description text,
  shift_date date,
  start_time time,
  end_time time,
  starts_at timestamptz,
  ends_at timestamptz,
  hourly_rate_offer numeric,
  location text,
  latitude double precision,
  longitude double precision,
  status public.shift_status,
  distance_km numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.employer_id,
    s.profession_required,
    s.description,
    s.shift_date,
    s.start_time,
    s.end_time,
    s.starts_at,
    s.ends_at,
    s.hourly_rate_offer,
    s.location,
    s.latitude,
    s.longitude,
    s.status,
    round((st_distance(
      st_setsrid(st_makepoint(worker_lng, worker_lat), 4326)::geography,
      s.geog
    ) / 1000.0)::numeric, 2) as distance_km
  from public.shifts s
  where s.status = 'published'
    and s.starts_at >= now()
    and worker_lat is not null
    and worker_lng is not null
    and s.geog is not null
    and st_dwithin(
      st_setsrid(st_makepoint(worker_lng, worker_lat), 4326)::geography,
      s.geog,
      (coalesce(max_km, 10) * 1000.0)::float8
    )
    and (
      profession is null
      or btrim(profession) = ''
      or s.profession_required ilike '%' || profession || '%'
    )
  order by distance_km asc, s.starts_at asc;
$$;


comment on function public.get_nearby_shifts is 'Devuelve shifts publicados dentro de un radio. Respeta RLS.';


-- =====================================================
-- Trigger: distancia de check-in respecto al shift
-- =====================================================


create or replace function public.set_checkin_distance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_lat double precision;
  v_shift_lng double precision;
begin
  select latitude, longitude
  into v_shift_lat, v_shift_lng
  from public.shifts
  where id = new.shift_id;


  if v_shift_lat is not null
     and v_shift_lng is not null
     and new.lat is not null
     and new.lng is not null then
    new.distance_meters := st_distancesphere(
      st_setsrid(st_makepoint(new.lng, new.lat), 4326),
      st_setsrid(st_makepoint(v_shift_lng, v_shift_lat), 4326)
    );
  end if;


  return new;
end;
$$;


create or replace trigger set_checkin_distance
  before insert or update on public.shift_checkins
  for each row execute function public.set_checkin_distance();


-- =====================================================
-- Recálculo de rating medio
-- =====================================================


create or replace function public.recalc_rating_for_ratee(
  p_ratee_id uuid,
  p_type public.rating_type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_type = 'employer_to_worker' then
    update public.worker_profiles wp
    set
      rating = coalesce((
        select avg(r.stars)::numeric(3,2)
        from public.ratings r
        where r.ratee_id = p_ratee_id
          and r.type = p_type
      ), 0),
      rating_count = (
        select count(*)
        from public.ratings r
        where r.ratee_id = p_ratee_id
          and r.type = p_type
      )
    where wp.user_id = p_ratee_id;
  elsif p_type = 'worker_to_employer' then
    update public.employer_profiles ep
    set
      rating = coalesce((
        select avg(r.stars)::numeric(3,2)
        from public.ratings r
        where r.ratee_id = p_ratee_id
          and r.type = p_type
      ), 0),
      rating_count = (
        select count(*)
        from public.ratings r
        where r.ratee_id = p_ratee_id
          and r.type = p_type
      )
    where ep.user_id = p_ratee_id;
  end if;
end;
$$;


create or replace function public.ratings_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_rating_for_ratee(old.ratee_id, old.type);
    return old;
  elsif tg_op = 'UPDATE' then
    perform public.recalc_rating_for_ratee(old.ratee_id, old.type);


    if old.ratee_id is distinct from new.ratee_id
       or old.type is distinct from new.type then
      perform public.recalc_rating_for_ratee(new.ratee_id, new.type);
    end if;


    return new;
  else
    perform public.recalc_rating_for_ratee(new.ratee_id, new.type);
    return new;
  end if;
end;
$$;


create or replace trigger ratings_after_write
  after insert or update or delete on public.ratings
  for each row execute function public.ratings_after_write();


-- =====================================================
-- Recálculo de total_jobs y total_shifts
-- =====================================================


create or replace function public.recalc_worker_total_jobs(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.worker_profiles wp
  set total_jobs = (
    select count(distinct s.id)
    from public.shifts s
    join public.shift_applications sa on sa.shift_id = s.id
    where sa.worker_id = p_worker_id
      and sa.status = 'accepted'
      and s.status = 'completed'
  )
  where wp.user_id = p_worker_id;
end;
$$;


create or replace function public.recalc_employer_total_shifts(p_employer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employer_profiles ep
  set total_shifts = (
    select count(*)
    from public.shifts s
    where s.employer_id = p_employer_id
      and s.status = 'completed'
  )
  where ep.user_id = p_employer_id;
end;
$$;


create or replace function public.shifts_after_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
begin
  if tg_op = 'INSERT' and new.status = 'completed' then
    perform public.recalc_employer_total_shifts(new.employer_id);


    select sa.worker_id
    into v_worker_id
    from public.shift_applications sa
    where sa.shift_id = new.id
      and sa.status = 'accepted'
    limit 1;


    if v_worker_id is not null then
      perform public.recalc_worker_total_jobs(v_worker_id);
    end if;


    return new;
  end if;


  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and (old.status = 'completed' or new.status = 'completed') then


    perform public.recalc_employer_total_shifts(new.employer_id);


    select sa.worker_id
    into v_worker_id
    from public.shift_applications sa
    where sa.shift_id = new.id
      and sa.status = 'accepted'
    limit 1;


    if v_worker_id is not null then
      perform public.recalc_worker_total_jobs(v_worker_id);
    end if;
  end if;


  return new;
end;
$$;


create or replace trigger shifts_after_status_change
  after insert or update on public.shifts
  for each row execute function public.shifts_after_status_change();


-- =====================================================
-- Guard para shift_applications
-- Evita cambios no autorizados de campos críticos
-- =====================================================


create or replace function public.shift_applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_employer boolean;
begin
  -- Service role o triggers internos pueden modificar
  if auth.uid() is null or pg_trigger_depth() > 0 then
    return new;
  end if;


  select exists (
    select 1
    from public.shifts s
    where s.id = old.shift_id
      and s.employer_id = auth.uid()
  )
  into v_is_employer;


  -- Worker propietario de la aplicación
  if old.worker_id = auth.uid() then
    if new.worker_id <> old.worker_id or new.shift_id <> old.shift_id then
      raise exception 'No puedes cambiar worker o shift de la aplicación';
    end if;


    -- Si ya no está pendiente, solo puede retirar/cancelar, no cambiar tarifa
    if old.status <> 'pending' and new.proposed_rate <> old.proposed_rate then
      raise exception 'No puedes cambiar la tarifa una vez la aplicación no está pendiente';
    end if;


    if new.status not in (old.status, 'withdrawn', 'cancelled') then
      raise exception 'El trabajador solo puede retirar o cancelar la aplicación';
    end if;


    if new.status = 'withdrawn' and old.status <> 'pending' then
      raise exception 'Solo se puede retirar una aplicación pendiente';
    end if;


    if new.status = 'cancelled' and old.status in ('cancelled', 'rejected') then
      raise exception 'No se puede cancelar una aplicación ya cancelada o rechazada';
    end if;


    return new;
  end if;


  -- Employer del shift
  if v_is_employer then
    if new.worker_id <> old.worker_id
       or new.shift_id <> old.shift_id
       or new.proposed_rate <> old.proposed_rate then
      raise exception 'El employer no puede modificar campos económicos ni claves de la aplicación';
    end if;


    if new.status not in (old.status, 'accepted', 'rejected', 'cancelled') then
      raise exception 'El employer solo puede aceptar, rechazar o cancelar';
    end if;


    if new.status = 'accepted' and old.status not in ('pending', 'accepted') then
      raise exception 'No se puede aceptar una aplicación que no está pendiente';
    end if;


    return new;
  end if;


  raise exception 'No autorizado para modificar esta aplicación';
end;
$$;


create or replace trigger shift_applications_guard
  before update on public.shift_applications
  for each row execute function public.shift_applications_guard();


-- =====================================================
-- Lógica tras cambios en shift_applications
-- Aceptación -> shift assigned
-- Cancelación de accepted -> shift published si estaba assigned
-- Recálculo de totals si shift completed
-- =====================================================


create or replace function public.shift_applications_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_worker_id uuid;
  v_employer_id uuid;
begin
  if tg_op = 'DELETE' then
    select *
    into v_shift
    from public.shifts
    where id = old.shift_id;


    if not found then
      return old;
    end if;


    if old.status = 'accepted' then
      update public.shifts
      set status = 'published', updated_at = now()
      where id = old.shift_id
        and status = 'assigned';


      if v_shift.status = 'completed' then
        perform public.recalc_worker_total_jobs(old.worker_id);
        perform public.recalc_employer_total_shifts(v_shift.employer_id);
      end if;
    end if;


    return old;
  end if;


  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      update public.shifts
      set status = 'assigned', updated_at = now()
      where id = new.shift_id
        and status in ('published', 'draft');
    end if;


    return new;
  end if;


  -- UPDATE
  if old.status is distinct from new.status then
    select *
    into v_shift
    from public.shifts
    where id = new.shift_id;


    if not found then
      return new;
    end if;


    if new.status = 'accepted' then
      update public.shifts
      set status = 'assigned', updated_at = now()
      where id = new.shift_id
        and status in ('published', 'draft');
    elsif old.status = 'accepted'
      and new.status in ('rejected', 'withdrawn', 'cancelled') then
      update public.shifts
      set status = 'published', updated_at = now()
      where id = new.shift_id
        and status = 'assigned';
    end if;


    if v_shift.status = 'completed'
       and (old.status = 'accepted' or new.status = 'accepted') then
      v_worker_id := coalesce(new.worker_id, old.worker_id);
      v_employer_id := v_shift.employer_id;


      perform public.recalc_worker_total_jobs(v_worker_id);
      perform public.recalc_employer_total_shifts(v_employer_id);
    end if;
  end if;


  return new;
end;
$$;


create or replace trigger shift_applications_after_write
  after insert or update or delete on public.shift_applications
  for each row execute function public.shift_applications_after_write();


-- =====================================================
-- Trigger payments_before_write
-- Asigna worker aceptado y calcula breakdown económico
-- =====================================================


create or replace function public.payments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_worker_id uuid;
  v_hours numeric;
  v_rate numeric;
  v_calc record;
begin
  select *
  into v_shift
  from public.shifts s
  where s.id = new.shift_id;


  if not found then
    raise exception 'Shift no encontrado';
  end if;


  select sa.worker_id
  into v_worker_id
  from public.shift_applications sa
  where sa.shift_id = new.shift_id
    and sa.status = 'accepted'
  order by sa.updated_at desc
  limit 1;


  if v_worker_id is null then
    if tg_op = 'UPDATE' and old.worker_id is not null then
      v_worker_id := old.worker_id;
    else
      raise exception 'No hay trabajador aceptado para el shift %', new.shift_id;
    end if;
  end if;


  new.worker_id := v_worker_id;


  v_hours := greatest(
    extract(epoch from (v_shift.ends_at - v_shift.starts_at)) / 3600.0,
    0
  );


  if new.gross is null then
    if tg_op = 'UPDATE' and old.gross is not null then
      new.gross := old.gross;
    else
      select sa.proposed_rate
      into v_rate
      from public.shift_applications sa
      where sa.shift_id = new.shift_id
        and sa.status = 'accepted'
      order by sa.updated_at desc
      limit 1;


      v_rate := coalesce(v_rate, v_shift.hourly_rate_offer, 0);
      new.gross := round(v_rate * v_hours, 2);
    end if;
  end if;


  select *
  into v_calc
  from public.calculate_worker_net_core(new.gross, v_worker_id);


  new.commission_rate := v_calc.commission_rate;
  new.commission := v_calc.commission;
  new.net_to_worker := v_calc.net_to_worker;
  new.tax_estimate := v_calc.tax_estimate;
  new.worker_net_estimate := v_calc.worker_net_estimate;


  if new.status in ('paid', 'released') and new.paid_at is null then
    new.paid_at := now();
  end if;


  return new;
end;
$$;


create or replace trigger payments_before_write
  before insert or update on public.payments
  for each row execute function public.payments_before_write();


-- =====================================================
-- Recálculo de worker_annual_earnings
-- =====================================================


create or replace function public.recalc_worker_annual_earnings(
  p_worker_id uuid,
  p_year int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  if p_worker_id is null or p_year is null then
    return;
  end if;


  select coalesce(sum(p.gross), 0)
  into v_total
  from public.payments p
  where p.worker_id = p_worker_id
    and p.status in ('paid', 'released')
    and coalesce(
      extract(year from p.paid_at),
      extract(year from p.created_at)
    )::int = p_year;


  insert into public.worker_annual_earnings (
    worker_id,
    year,
    total_billed,
    iva_exemption_remaining,
    updated_at
  )
  values (
    p_worker_id,
    p_year,
    v_total,
    greatest(15000 - v_total, 0),
    now()
  )
  on conflict (worker_id, year)
  do update set
    total_billed = excluded.total_billed,
    iva_exemption_remaining = excluded.iva_exemption_remaining,
    updated_at = now();
end;
$$;


create or replace function public.payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_year int;
  v_old_worker_id uuid;
  v_old_year int;
begin
  if tg_op = 'DELETE' then
    v_worker_id := old.worker_id;
    v_year := coalesce(
      extract(year from old.paid_at),
      extract(year from old.created_at)
    )::int;


    perform public.recalc_worker_annual_earnings(v_worker_id, v_year);
    return old;
  end if;


  if tg_op = 'UPDATE' then
    v_old_worker_id := old.worker_id;
    v_old_year := coalesce(
      extract(year from old.paid_at),
      extract(year from old.created_at)
    )::int;


    perform public.recalc_worker_annual_earnings(v_old_worker_id, v_old_year);
  end if;


  v_worker_id := new.worker_id;
  v_year := coalesce(
    extract(year from new.paid_at),
    extract(year from new.created_at)
  )::int;


  perform public.recalc_worker_annual_earnings(v_worker_id, v_year);


  return new;
end;
$$;


create or replace trigger payments_after_write
  after insert or update or delete on public.payments
  for each row execute function public.payments_after_write();


-- =====================================================
-- Guards de integridad/seguridad
-- Evitan que usuarios editen campos administrativos
-- =====================================================


create or replace function public.users_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 0 then
    return new;
  end if;


  if new.id <> old.id then
    raise exception 'No puedes cambiar el ID de usuario';
  end if;


  if new.is_verified is distinct from old.is_verified then
    raise exception 'is_verified solo puede ser modificado por administración';
  end if;


  return new;
end;
$$;


create or replace trigger users_guard
  before update on public.users
  for each row execute function public.users_guard();


create or replace function public.worker_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 0 then
    return new;
  end if;


  if new.user_id <> old.user_id then
    raise exception 'No puedes cambiar el user_id del perfil';
  end if;


  if new.rating is distinct from old.rating
     or new.rating_count is distinct from old.rating_count
     or new.total_jobs is distinct from old.total_jobs
     or new.is_social_security_exempt is distinct from old.is_social_security_exempt then
    raise exception 'Campos administrativos o calculados no pueden ser editados manualmente';
  end if;


  return new;
end;
$$;


create or replace trigger worker_profiles_guard
  before update on public.worker_profiles
  for each row execute function public.worker_profiles_guard();


create or replace function public.employer_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 0 then
    return new;
  end if;


  if new.user_id <> old.user_id then
    raise exception 'No puedes cambiar el user_id del perfil';
  end if;


  if new.rating is distinct from old.rating
     or new.rating_count is distinct from old.rating_count
     or new.total_shifts is distinct from old.total_shifts then
    raise exception 'Campos calculados no pueden ser editados manualmente';
  end if;


  return new;
end;
$$;


create or replace trigger employer_profiles_guard
  before update on public.employer_profiles
  for each row execute function public.employer_profiles_guard();


create or replace function public.shift_checkins_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 0 then
    return new;
  end if;


  if new.id <> old.id
     or new.shift_id <> old.shift_id
     or new.worker_id <> old.worker_id
     or new.check_in_at <> old.check_in_at then
    raise exception 'No puedes modificar campos críticos del check-in';
  end if;


  if new.check_out_at is not null and new.check_out_at < new.check_in_at then
    raise exception 'check_out_at no puede ser anterior a check_in_at';
  end if;


  return new;
end;
$$;


create or replace trigger shift_checkins_guard
  before update on public.shift_checkins
  for each row execute function public.shift_checkins_guard();


-- =====================================================
-- Sincronizar full_name desde users a worker_profiles
-- =====================================================


create or replace function public.sync_user_full_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.full_name is distinct from old.full_name then
    update public.worker_profiles
    set full_name = new.full_name
    where user_id = new.id;
  end if;


  return new;
end;
$$;


create or replace trigger sync_user_full_name
  after update on public.users
  for each row execute function public.sync_user_full_name();


-- =====================================================
-- Trigger opcional: creación automática de profiles
-- cuando se registra en auth.users
-- =====================================================


create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role;
begin
  v_role := case
    when lower(meta->>'role') in ('worker', 'employer', 'both')
      then lower(meta->>'role')::public.user_role
    else 'worker'
  end;


  insert into public.users (
    id,
    phone,
    email,
    full_name,
    role,
    is_verified
  )
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(meta->>'full_name', ''),
    v_role,
    false
  )
  on conflict (id)
  do update set
    phone = coalesce(public.users.phone, excluded.phone),
    email = coalesce(public.users.email, excluded.email),
    full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name);


  if v_role in ('worker', 'both') then
    insert into public.worker_profiles (
      user_id,
      full_name
    )
    values (
      new.id,
      coalesce(meta->>'full_name', '')
    )
    on conflict (user_id)
    do update set
      full_name = coalesce(nullif(public.worker_profiles.full_name, ''), excluded.full_name);
  end if;


  if v_role in ('employer', 'both') then
    insert into public.employer_profiles (
      user_id,
      company_name
    )
    values (
      new.id,
      coalesce(nullif(meta->>'company_name', ''), 'Empresa')
    )
    on conflict (user_id)
    do update set
      company_name = coalesce(nullif(public.employer_profiles.company_name, ''), excluded.company_name);
  end if;


  return new;
end;
$$;


drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- =====================================================
-- Row Level Security
-- =====================================================


alter table public.users enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_applications enable row level security;
alter table public.shift_checkins enable row level security;
alter table public.ratings enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.worker_annual_earnings enable row level security;


-- ------------------------------------------------------------
-- RLS: users
-- ------------------------------------------------------------


drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);


drop policy if exists users_insert_own on public.users;
create policy users_insert_own
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id);


drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ------------------------------------------------------------
-- RLS: worker_profiles
-- ------------------------------------------------------------


drop policy if exists worker_profiles_select_own_or_employer_involved on public.worker_profiles;
create policy worker_profiles_select_own_or_employer_involved
  on public.worker_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_user_role() in ('employer', 'both')
      and exists (
        select 1
        from public.shift_applications sa
        join public.shifts s on s.id = sa.shift_id
        where sa.worker_id = worker_profiles.user_id
          and s.employer_id = auth.uid()
      )
    )
  );


drop policy if exists worker_profiles_insert_own on public.worker_profiles;
create policy worker_profiles_insert_own
  on public.worker_profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_role() in ('worker', 'both')
  );


drop policy if exists worker_profiles_update_own on public.worker_profiles;
create policy worker_profiles_update_own
  on public.worker_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


drop policy if exists worker_profiles_delete_own on public.worker_profiles;
create policy worker_profiles_delete_own
  on public.worker_profiles
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
-- RLS: employer_profiles
-- ------------------------------------------------------------


drop policy if exists employer_profiles_select_own_or_worker_involved on public.employer_profiles;
create policy employer_profiles_select_own_or_worker_involved
  on public.employer_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_user_role() in ('worker', 'both')
      and (
        exists (
          select 1
          from public.shifts s
          where s.employer_id = employer_profiles.user_id
            and s.status = 'published'
        )
        or exists (
          select 1
          from public.shift_applications sa
          join public.shifts s on s.id = sa.shift_id
          where sa.worker_id = auth.uid()
            and s.employer_id = employer_profiles.user_id
        )
      )
    )
  );


drop policy if exists employer_profiles_insert_own on public.employer_profiles;
create policy employer_profiles_insert_own
  on public.employer_profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.current_user_role() in ('employer', 'both')
  );


drop policy if exists employer_profiles_update_own on public.employer_profiles;
create policy employer_profiles_update_own
  on public.employer_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


drop policy if exists employer_profiles_delete_own on public.employer_profiles;
create policy employer_profiles_delete_own
  on public.employer_profiles
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
-- RLS: shifts
-- ------------------------------------------------------------


drop policy if exists shifts_select_published_anon on public.shifts;
create policy shifts_select_published_anon
  on public.shifts
  for select
  to anon
  using (status = 'published');


drop policy if exists shifts_select_authenticated on public.shifts;
create policy shifts_select_authenticated
  on public.shifts
  for select
  to authenticated
  using (
    employer_id = auth.uid()
    or (
      status = 'published'
      and public.current_user_role() in ('worker', 'both')
    )
    or exists (
      select 1
      from public.shift_applications sa
      where sa.shift_id = shifts.id
        and sa.worker_id = auth.uid()
    )
  );


drop policy if exists shifts_insert_employer on public.shifts;
create policy shifts_insert_employer
  on public.shifts
  for insert
  to authenticated
  with check (
    employer_id = auth.uid()
    and public.current_user_role() in ('employer', 'both')
    and exists (
      select 1
      from public.employer_profiles ep
      where ep.user_id = auth.uid()
    )
  );


drop policy if exists shifts_update_employer on public.shifts;
create policy shifts_update_employer
  on public.shifts
  for update
  to authenticated
  using (employer_id = auth.uid())
  with check (employer_id = auth.uid());


drop policy if exists shifts_delete_employer on public.shifts;
create policy shifts_delete_employer
  on public.shifts
  for delete
  to authenticated
  using (employer_id = auth.uid());


-- ------------------------------------------------------------
-- RLS: shift_applications
-- ------------------------------------------------------------


drop policy if exists shift_applications_select_involved on public.shift_applications;
create policy shift_applications_select_involved
  on public.shift_applications
  for select
  to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.employer_id = auth.uid()
    )
  );


drop policy if exists shift_applications_insert_worker on public.shift_applications;
create policy shift_applications_insert_worker
  on public.shift_applications
  for insert
  to authenticated
  with check (
    worker_id = auth.uid()
    and public.current_user_role() in ('worker', 'both')
    and exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.status = 'published'
        and s.employer_id <> auth.uid()
    )
    and exists (
      select 1
      from public.worker_profiles wp
      where wp.user_id = auth.uid()
        and wp.is_autonomo = true
        and wp.seguro_vigente = true
    )
  );


drop policy if exists shift_applications_update_involved on public.shift_applications;
create policy shift_applications_update_involved
  on public.shift_applications
  for update
  to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.employer_id = auth.uid()
    )
  )
  with check (
    worker_id = auth.uid()
    or exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.employer_id = auth.uid()
    )
  );


drop policy if exists shift_applications_delete_worker_pending on public.shift_applications;
create policy shift_applications_delete_worker_pending
  on public.shift_applications
  for delete
  to authenticated
  using (
    worker_id = auth.uid()
    and status = 'pending'
  );


-- ------------------------------------------------------------
-- RLS: shift_checkins
-- ------------------------------------------------------------


drop policy if exists shift_checkins_select_involved on public.shift_checkins;
create policy shift_checkins_select_involved
  on public.shift_checkins
  for select
  to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.employer_id = auth.uid()
    )
  );


drop policy if exists shift_checkins_insert_assigned_worker on public.shift_checkins;
create policy shift_checkins_insert_assigned_worker
  on public.shift_checkins
  for insert
  to authenticated
  with check (
    worker_id = auth.uid()
    and exists (
      select 1
      from public.shift_applications sa
      where sa.shift_id = shift_id
        and sa.worker_id = auth.uid()
        and sa.status = 'accepted'
    )
    and exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.status in ('assigned', 'completed')
    )
  );


drop policy if exists shift_checkins_update_own on public.shift_checkins;
create policy shift_checkins_update_own
  on public.shift_checkins
  for update
  to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());


-- ------------------------------------------------------------
-- RLS: ratings
-- ------------------------------------------------------------


drop policy if exists ratings_select_involved on public.ratings;
create policy ratings_select_involved
  on public.ratings
  for select
  to authenticated
  using (
    rater_id = auth.uid()
    or ratee_id = auth.uid()
  );


drop policy if exists ratings_insert_valid_completed_shift on public.ratings;
create policy ratings_insert_valid_completed_shift
  on public.ratings
  for insert
  to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.status = 'completed'
    )
    and (
      (
        type = 'employer_to_worker'
        and exists (
          select 1
          from public.shifts s
          where s.id = shift_id
            and s.employer_id = auth.uid()
        )
        and exists (
          select 1
          from public.shift_applications sa
          where sa.shift_id = shift_id
            and sa.worker_id = ratee_id
            and sa.status = 'accepted'
        )
      )
      or (
        type = 'worker_to_employer'
        and exists (
          select 1
          from public.shift_applications sa
          where sa.shift_id = shift_id
            and sa.worker_id = auth.uid()
            and sa.status = 'accepted'
        )
        and exists (
          select 1
          from public.shifts s
          where s.id = shift_id
            and s.employer_id = ratee_id
        )
      )
    )
  );


-- ------------------------------------------------------------
-- RLS: payments
-- Solo lectura para partes involucradas.
-- Escritura solo vía service_role/backend.
-- ------------------------------------------------------------


drop policy if exists payments_select_involved on public.payments;
create policy payments_select_involved
  on public.payments
  for select
  to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1
      from public.shifts s
      where s.id = shift_id
        and s.employer_id = auth.uid()
    )
  );


-- No se crean policies de insert/update/delete para payments.
-- Solo service_role puede escribir.


-- ------------------------------------------------------------
-- RLS: notifications
-- ------------------------------------------------------------


drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());


drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
-- RLS: worker_annual_earnings
-- ------------------------------------------------------------


drop policy if exists worker_annual_earnings_select_own on public.worker_annual_earnings;
create policy worker_annual_earnings_select_own
  on public.worker_annual_earnings
  for select
  to authenticated
  using (worker_id = auth.uid());


-- =====================================================
-- Storage Buckets
-- =====================================================


insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;


insert into storage.buckets (id, name, public)
values ('worker-documents', 'worker-documents', false)
on conflict (id) do nothing;


alter table storage.objects enable row level security;


-- profile-photos: lectura pública
drop policy if exists profile_photos_public_read on storage.objects;
create policy profile_photos_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'profile-photos');


-- profile-photos: subida solo carpeta propia
drop policy if exists profile_photos_owner_insert on storage.objects;
create policy profile_photos_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists profile_photos_owner_update on storage.objects;
create policy profile_photos_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists profile_photos_owner_delete on storage.objects;
create policy profile_photos_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- worker-documents: privado, solo propietario
drop policy if exists worker_documents_owner_select on storage.objects;
create policy worker_documents_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  );


drop policy if exists worker_documents_owner_insert on storage.objects;
create policy worker_documents_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'worker-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists worker_documents_owner_update on storage.objects;
create policy worker_documents_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  )
  with check (
    bucket_id = 'worker-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists worker_documents_owner_delete on storage.objects;
create policy worker_documents_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or owner = auth.uid()
    )
  );


-- =====================================================
-- Realtime (opcional)
-- =====================================================


do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.shifts;
    exception when duplicate_object then
      null;
    end;


    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then
      null;
    end;
  end if;
end
$$;


-- =====================================================
-- Grants básicos
-- =====================================================


grant usage on schema public to anon, authenticated, service_role;


grant select on public.shifts to anon;


grant select, insert, update, delete on
  public.users,
  public.worker_profiles,
  public.employer_profiles,
  public.shifts,
  public.shift_applications,
  public.shift_checkins,
  public.ratings,
  public.payments,
  public.notifications,
  public.worker_annual_earnings
to authenticated, service_role;


grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.get_nearby_shifts(double precision, double precision, numeric, text) to anon;


alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;


alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
```


---


# 3. Convenciones de Storage


## Bucket: `profile-photos`


Público.


Ruta recomendada:


```text
profile-photos/{user_id}/avatar.png
profile-photos/{user_id}/cover.jpg
```


Ejemplo:


```text
profile-photos/3f2c1e6a-8f2d-4a7b-bc1e-9d2f3a4b5c6d/avatar.png
```


## Bucket: `worker-documents`


Privado.


Ruta recomendada:


```text
worker-documents/{user_id}/nif.pdf
worker-documents/{user_id}/atividade.pdf
worker-documents/{user_id}/seguro-acidentes.pdf
worker-documents/{user_id}/niss.pdf
```


Ejemplo:


```text
worker-documents/3f2c1e6a-8f2d-4a7b-bc1e-9d2f3a4b5c6d/seguro-acidentes.pdf
```


---


# 4. Estructura recomendada Next.js 14 (App Router)


```text
bee-workers/
├── public/
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── maskable-icon.png
│   ├── sw.js
│   ├── manifest.webmanifest
│   └── offline.html
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── manifest.ts
│   │   ├── robots.ts
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── callback/
│   │   │   │   └── route.ts
│   │   │   └── forgot-password/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (worker)/
│   │   │   ├── worker/
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── shifts/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [shiftId]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── applications/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── earnings/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── documents/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── profile/
│   │   │   │       └── page.tsx
│   │   │
│   │   ├── (employer)/
│   │   │   ├── employer/
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── shifts/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── [shiftId]/
│   │   │   │   │       ├── page.tsx
│   │   │   │       ├── applicants/
│   │   │   │       │   └── page.tsx
│   │   │   │       └── payments/
│   │   │   │           └── page.tsx
│   │   │   │   ├── workers/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── profile/
│   │   │   │       └── page.tsx
│   │   │
│   │   ├── notifications/
│   │   │   └── page.tsx
│   │   │
│   │   └── api/
│   │       ├── health/
│   │       │   └── route.ts
│   │       ├── webhooks/
│   │       │   ├── payments/
│   │       │   │   └── route.ts
│   │       │   └── supabase/
│   │       │       └── route.ts
│   │       └── cron/
│   │           ├── expire-shifts/
│   │           │   └── route.ts
│   │           └── check-seguro-expiry/
│   │               └── route.ts
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── toast.tsx
│   │   │   └── bottom-nav.tsx
│   │   │
│   │   ├── shifts/
│   │   │   ├── shift-card.tsx
│   │   │   ├── shift-form.tsx
│   │   │   ├── shift-detail.tsx
│   │   │   ├── shift-application-card.tsx
│   │   │   └── shift-checkin-button.tsx
│   │   │
│   │   ├── workers/
│   │   │   ├── worker-profile-card.tsx
│   │   │   ├── worker-availability-form.tsx
│   │   │   └── worker-document-uploader.tsx
│   │   │
│   │   ├── employers/
│   │   │   ├── employer-profile-card.tsx
│   │   │   └── employer-shift-list.tsx
│   │   │
│   │   ├── payments/
│   │   │   ├── payment-breakdown-card.tsx
│   │   │   └── iva-exemption-card.tsx
│   │   │
│   │   └── notifications/
│   │       ├── notification-list.tsx
│   │       └── notification-item.tsx
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   ├── admin.ts
│   │   │   └── middleware.ts
│   │   │
│   │   ├── validations/
│   │   │   ├── auth.ts
│   │   │   ├── shift.ts
│   │   │   ├── application.ts
│   │   │   ├── worker-profile.ts
│   │   │   └── employer-profile.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── date.ts
│   │   │   ├── geo.ts
│   │   │   ├── currency.ts
│   │   │   └── legal.ts
│   │   │
│   │   └── constants/
│   │       ├── professions.ts
│   │       ├── porto-locations.ts
│   │       └── commission.ts
│   │
│   ├── server/
│   │   ├── actions/
│   │   │   ├── auth.actions.ts
│   │   │   ├── shifts.actions.ts
│   │   │   ├── applications.actions.ts
│   │   │   ├── checkins.actions.ts
│   │   │   ├── ratings.actions.ts
│   │   │   ├── payments.actions.ts
│   │   │   ├── notifications.actions.ts
│   │   │   └── documents.actions.ts
│   │   │
│   │   ├── queries/
│   │   │   ├── shifts.queries.ts
│   │   │   ├── applications.queries.ts
│   │   │   ├── workers.queries.ts
│   │   │   ├── employers.queries.ts
│   │   │   ├── payments.queries.ts
│   │   │   └── notifications.queries.ts
│   │   │
│   │   └── services/
│   │       ├── payment.service.ts
│   │       ├── notification.service.ts
│   │       ├── verification.service.ts
│   │       └── legal-estimate.service.ts
│   │
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-geolocation.ts
│   │   ├── use-nearby-shifts.ts
│   │   ├── use-realtime-notifications.ts
│   │   └── use-shift-applications.ts
│   │
│   ├── types/
│   │   ├── database.types.ts
│   │   ├── shift.types.ts
│   │   ├── application.types.ts
│   │   ├── payment.types.ts
│   │   └── profile.types.ts
│   │
│   └── middleware.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_rls.sql
│   │   ├── 0003_triggers.sql
│   │   ├── 0004_storage.sql
│   │   └── 0005_realtime.sql
│   ├── seed.sql
│   └── config.toml
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.local.example
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```


---


# 5. Notas importantes de implementación


## 5.1. Supabase clients


### Cliente browser


```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';


export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```


### Cliente server


```ts
// src/lib/supabase/server.ts
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
      },
    }
  );
}
```


### Admin / service role


Solo en backend, nunca exponer.


```ts
// src/lib/supabase/admin.ts
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


## 5.2. Pagos y comisión


La tabla `payments` debe ser escrita principalmente con `service_role` desde backend.


Ejemplo de flujo:


1. Shift se marca `completed`.
2. Backend verifica accepted application.
3. Backend crea payment:
   - `shift_id`
   - `gross` opcional, o calculado desde `hourly_rate_offer` / `proposed_rate`.
4. Trigger `payments_before_write` calcula:
   - `commission = gross * 0.07`
   - `net_to_worker = gross - commission`
   - `tax_estimate` como estimación SS.
   - `worker_net_estimate`.
5. Cuando payment pasa a `paid` o `released`:
   - Trigger `payments_after_write` actualiza `worker_annual_earnings`.


---


## 5.3. IVA


La función:


```sql
select public.check_iva_exemption('worker_uuid');
```


devuelve el remanente de €15.000 para el año actual.


Ejemplo:


```text
total_billed = 12.300
iva_exemption_remaining = 2.700
```


Si `total_billed >= 15.000`, devuelve `0`.


---


## 5.4. Segurança Social


La estimación usa:


```text
Base SS = 70% del gross
SS = 21.4% de base SS
```


Excepto si:


- `worker_profiles.is_social_security_exempt = true`, o
- `first_activity_at + 12 months > now()`.


Ejemplo:


```text
Gross = €100
Base SS = €70
SS = €14.98
```


---


## 5.5. IRS


La plataforma no calcula IRS final.


Solo se guarda:


```text
irs_taxable_base = 75% del gross
```


Esto es informativo para categoría B en régimen simplificado.


---


## 5.6. Cumplimiento Art. 12.º-A CT


Para evitar indicios de relación laboral:


- No usar `shift_applications.status = rejected` para scoring negativo.
- No bloquear workers por rechazar turnos.
- No imponer tarifa mínima.
- No mostrar “acceptance rate” como métrica punitiva.
- `shift_checkins` debe presentarse como prueba de servicio, no vigilancia.
- Worker puede proponer `proposed_rate`.
- Employer puede ofrecer `hourly_rate_offer`.


---


# 6. Recomendaciones de producto/legal


## Worker onboarding


Campos obligatorios antes de aplicar:


```text
full_name
NIF
NISS
professions
is_autonomo = true
seguro_vigente = true
seguro_expires_at
```


Documentos obligatorios en `worker-documents`:


```text
nif.pdf
atividade.pdf
seguro-acidentes.pdf
```


## Employer onboarding


Campos obligatorios:


```text
company_name
nif_empresa
address
location
```


## Verificación administrativa


`users.is_verified` solo debe actualizarse con `service_role`.


Ejemplo backend:


```ts
await adminClient
  .from('users')
  .update({ is_verified: true })
  .eq('id', userId);
```


---


# 7. Realtime recomendado


## Workers


Suscribirse a nuevos shifts publicados:


```ts
supabase
  .channel('nearby-shifts')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'shifts',
      filter: 'status=eq.published',
    },
    payload => {
      console.log(payload);
    }
  )
  .subscribe();
```


## Notifications


Suscribirse a notificaciones del usuario:


```ts
supabase
  .channel(`notifications-${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`,
    },
    payload => {
      console.log(payload);
    }
  )
  .subscribe();
```


---


# 8. Variables de entorno recomendadas


```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...


NEXT_PUBLIC_APP_URL=https://beeworkers.pt
NEXT_PUBLIC_APP_ENV=production


NEXT_PUBLIC_DEFAULT_CITY=Porto
NEXT_PUBLIC_DEFAULT_COUNTRY=PT
NEXT_PUBLIC_PLATFORM_COMMISSION_RATE=0.07
```


---


# 9. Resumen del modelo de datos


| Tabla | Propósito |
|---|---|
| `users` | Auth, rol, verificación |
| `worker_profiles` | Perfil worker, skills, tarifa, seguro, SS |
| `employer_profiles` | Empresa, NIF, localización, rating |
| `shifts` | Turnos publicados |
| `shift_applications` | Aplicaciones y aceptación |
| `shift_checkins` | Check-in/check-out como prueba |
| `ratings` | Ratings tras shift completado |
| `payments` | Gross, comisión 7%, net estimate |
| `notifications` | Notificaciones |
| `worker_annual_earnings` | Control IVA anual |


---


# 10. Siguiente paso recomendado


Después de ejecutar este SQL:


1. Generar tipos TypeScript desde Supabase:


```bash
npx supabase gen types typescript \
  --project-id TU_PROJECT_ID \
  --schema public \
  > src/types/database.types.ts
```


2. Crear Server Actions para:
   - crear shift
   - aplicar a shift
   - aceptar/rechazar aplicación
   - completar shift
   - crear payment con service role
   - marcar notificación leída


3. Implementar PWA:
   - `manifest.ts`
   - `sw.js`
   - install prompt
   - offline fallback


4. Implementar verificación documental:
   - upload a `worker-documents`
   - admin dashboard con service role
   - update `users.is_verified`
   - update `worker_profiles.seguro_vigente`