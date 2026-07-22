# Implementación completa: Dashboards, perfiles, admin y landing

Este bloque añade la capa visual y de gestión completa sobre el auth/core anterior:

- Dashboard Worker
- Dashboard Employer
- Perfil público Worker
- Perfil público Employer
- Configuración de usuario
- Panel Admin
- Landing pública
- Componentes reutilizables
- Charts SVG/CSS simples
- Dark mode
- Idioma
- Eliminación de cuenta con gracia 30 días

> Asumo que ya tienes:
> - Auth/onboarding
> - Tablas base: users, worker_profiles, employer_profiles, shifts, shift_applications, shift_checkins, ratings, payments, notifications, pending_ratings
> - Cliente Supabase en `@/lib/supabase/client`
> - Server client en `@/lib/supabase/server`
> - Admin client en `@/lib/supabase/admin`

---

# 1. Migración SQL para dashboards, admin, settings, favoritos, disputas

Ejecutar en Supabase SQL Editor.

```sql
-- =====================================================
-- Extensión de usuarios para admin, suspensión y borrado
-- =====================================================

alter table public.users
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspension_reason text,
  add column if not exists delete_requested_at timestamptz,
  add column if not exists last_active_at timestamptz not null default now();

-- Disponibilidad del worker
alter table public.worker_profiles
  add column if not exists is_active boolean not null default true;

-- Documentos KYC: revisión admin
alter table public.onboarding_documents
  add column if not exists reviewed_by uuid references public.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reject_reason text;

-- =====================================================
-- Favoritos de employer hacia workers
-- =====================================================

create table if not exists public.user_favorites (
  employer_id uuid not null references public.users(id) on delete cascade,
  worker_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employer_id, worker_id),
  constraint user_favorites_no_self check (employer_id <> worker_id)
);

alter table public.user_favorites enable row level security;

drop policy if exists user_favorites_select_own on public.user_favorites;
create policy user_favorites_select_own
  on public.user_favorites
  for select
  to authenticated
  using (employer_id = auth.uid());

drop policy if exists user_favorites_insert_own on public.user_favorites;
create policy user_favorites_insert_own
  on public.user_favorites
  for insert
  to authenticated
  with check (employer_id = auth.uid());

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own
  on public.user_favorites
  for delete
  to authenticated
  using (employer_id = auth.uid());

-- =====================================================
-- Configuración de notificaciones
-- =====================================================

create table if not exists public.notification_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  new_shift_nearby boolean not null default true,
  new_application boolean not null default true,
  application_accepted boolean not null default true,
  application_rejected boolean not null default true,
  worker_checked_in boolean not null default true,
  worker_checked_out boolean not null default true,
  rating_pending boolean not null default true,
  marketing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists notification_settings_select_own on public.notification_settings;
create policy notification_settings_select_own
  on public.notification_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_settings_upsert_own on public.notification_settings;
create policy notification_settings_upsert_own
  on public.notification_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_settings_update_own on public.notification_settings;
create policy notification_settings_update_own
  on public.notification_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================
-- Configuración de usuario: idioma y tema
-- =====================================================

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  language text not null default 'es',
  theme text not null default 'light',
  updated_at timestamptz not null default now(),
  constraint user_settings_language_check check (language in ('pt', 'es', 'en')),
  constraint user_settings_theme_check check (theme in ('light', 'dark'))
);

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================
-- Disputas / reportes
-- =====================================================

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid references public.users(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  reason text not null,
  status text not null default 'open',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disputes_status_check check (status in ('open', 'under_review', 'resolved', 'closed'))
);

alter table public.disputes enable row level security;

drop policy if exists disputes_select_own on public.disputes;
create policy disputes_select_own
  on public.disputes
  for select
  to authenticated
  using (
    reporter_id = auth.uid()
    or reported_user_id = auth.uid()
  );

drop policy if exists disputes_insert_own on public.disputes;
create policy disputes_insert_own
  on public.disputes
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- =====================================================
-- Helper admin
-- =====================================================

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select is_admin
      from public.users
      where id = auth.uid()
    ),
    false
  );
$$;

-- =====================================================
-- Actualizar annual earnings incluyendo pagos pendientes
-- (pending = turno completado y pago estimado generado)
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
    and p.status in ('pending', 'paid', 'released')
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

-- =====================================================
-- Dashboard Worker
-- =====================================================

create or replace function public.get_worker_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_week_shifts integer := 0;
  v_month_gross numeric := 0;
  v_month_net_before numeric := 0;
  v_month_net_after numeric := 0;
  v_rating numeric := 0;
  v_rating_count integer := 0;
  v_total_jobs integer := 0;
  v_is_active boolean := true;
  v_annual_billed numeric := 0;
  v_iva_remaining numeric := 15000;
  v_upcoming jsonb := '[]'::jsonb;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'No autorizado';
  end if;

  -- Turnos esta semana
  select count(*)::integer
  into v_week_shifts
  from public.shift_applications sa
  join public.shifts s on s.id = sa.shift_id
  where sa.worker_id = uid
    and sa.status = 'accepted'
    and s.starts_at >= date_trunc('week', now())
    and s.starts_at < date_trunc('week', now()) + interval '7 days';

  -- Ingresos del mes (estimados)
  select
    coalesce(sum(p.gross), 0),
    coalesce(sum(p.net_before_taxes), 0),
    coalesce(sum(p.worker_net_estimate), 0)
  into v_month_gross, v_month_net_before, v_month_net_after
  from public.payments p
  where p.worker_id = uid
    and p.status in ('pending', 'paid', 'released')
    and date_trunc('month', coalesce(p.paid_at, p.created_at)) = date_trunc('month', now());

  -- Perfil worker
  select
    wp.rating,
    wp.rating_count,
    wp.total_jobs,
    wp.is_active
  into v_rating, v_rating_count, v_total_jobs, v_is_active
  from public.worker_profiles wp
  where wp.user_id = uid;

  -- IVA anual
  select
    wae.total_billed,
    wae.iva_exemption_remaining
  into v_annual_billed, v_iva_remaining
  from public.worker_annual_earnings wae
  where wae.worker_id = uid
    and wae.year = extract(year from now())::int;

  if v_annual_billed is null then
    select coalesce(sum(p.gross), 0)
    into v_annual_billed
    from public.payments p
    where p.worker_id = uid
      and p.status in ('pending', 'paid', 'released')
      and extract(year from coalesce(p.paid_at, p.created_at)) = extract(year from now());

    v_iva_remaining := greatest(15000 - v_annual_billed, 0);
  end if;

  -- Próximos turnos
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_upcoming
  from (
    select
      s.id as shift_id,
      s.profession_required,
      s.location,
      s.starts_at,
      s.ends_at,
      s.hourly_rate_offer,
      s.status as shift_status,
      ep.company_name,
      ep.logo_url,
      sa.proposed_rate,
      sa.status as application_status
    from public.shift_applications sa
    join public.shifts s on s.id = sa.shift_id
    left join public.employer_profiles ep on ep.user_id = s.employer_id
    where sa.worker_id = uid
      and sa.status = 'accepted'
      and s.starts_at >= now()
      and s.status not in ('cancelled')
    order by s.starts_at asc
    limit 5
  ) t;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'weekShifts', v_week_shifts,
      'monthGross', v_month_gross,
      'monthNetBeforeTaxes', v_month_net_before,
      'monthNetAfterTaxes', v_month_net_after,
      'rating', v_rating,
      'ratingCount', v_rating_count,
      'totalJobs', v_total_jobs,
      'isActive', v_is_active
    ),
    'iva', jsonb_build_object(
      'annualBilled', v_annual_billed,
      'limit', 15000,
      'remaining', v_iva_remaining,
      'percentUsed', round((v_annual_billed / 15000.0) * 100, 2)
    ),
    'upcomingShifts', v_upcoming
  );
end;
$$;

-- =====================================================
-- Historial completado del worker con paginación
-- =====================================================

create or replace function public.get_worker_completed_shifts(
  page int default 0,
  page_size int default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'No autorizado';
  end if;

  page := greatest(coalesce(page, 0), 0);
  page_size := least(coalesce(page_size, 10), 50);

  select count(*)::integer
  into v_total
  from public.payments p
  where p.worker_id = uid
    and p.status in ('pending', 'paid', 'released');

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      p.id as payment_id,
      p.gross,
      p.net_before_taxes,
      p.worker_net_estimate,
      p.status as payment_status,
      coalesce(p.paid_at, p.created_at) as effective_date,
      s.id as shift_id,
      s.profession_required,
      s.location,
      s.shift_date,
      s.start_time,
      s.end_time,
      ep.company_name,
      ep.logo_url
    from public.payments p
    join public.shifts s on s.id = p.shift_id
    left join public.employer_profiles ep on ep.user_id = s.employer_id
    where p.worker_id = uid
      and p.status in ('pending', 'paid', 'released')
    order by effective_date desc
    limit page_size
    offset page * page_size
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', page,
    'pageSize', page_size
  );
end;
$$;

-- =====================================================
-- Ingresos mensuales del worker para gráfico
-- =====================================================

create or replace function public.get_worker_monthly_earnings(
  month_count int default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_result jsonb := '[]'::jsonb;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'No autorizado';
  end if;

  month_count := least(coalesce(month_count, 6), 24);

  with months as (
    select date_trunc('month', now()) - (n || ' months')::interval as month
    from generate_series(month_count - 1, 0) n
  ),
  agg as (
    select
      date_trunc('month', coalesce(p.paid_at, p.created_at)) as month,
      coalesce(sum(p.gross), 0) as gross,
      coalesce(sum(p.net_before_taxes), 0) as net
    from public.payments p
    where p.worker_id = uid
      and p.status in ('pending', 'paid', 'released')
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'label', to_char(m.month, 'MM/YY'),
        'gross', coalesce(a.gross, 0),
        'net', coalesce(a.net, 0)
      )
      order by m.month asc
    ),
    '[]'::jsonb
  )
  into v_result
  from months m
  left join agg a on a.month = m.month;

  return v_result;
end;
$$;

-- =====================================================
-- Dashboard Employer
-- =====================================================

create or replace function public.get_employer_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_active_shifts integer := 0;
  v_workers_hired_month integer := 0;
  v_rating numeric := 0;
  v_rating_count integer := 0;
  v_total_shifts integer := 0;
  v_month_spend numeric := 0;
  v_shifts jsonb := '[]'::jsonb;
  v_monthly_spend jsonb := '[]'::jsonb;
  v_favorites jsonb := '[]'::jsonb;
begin
  uid := auth.uid();

  if uid is null then
    raise exception 'No autorizado';
  end if;

  -- Turnos activos
  select count(*)::integer
  into v_active_shifts
  from public.shifts s
  where s.employer_id = uid
    and s.status in ('published', 'assigned')
    and s.starts_at >= now();

  -- Workers contratados este mes
  select count(distinct p.worker_id)::integer
  into v_workers_hired_month
  from public.payments p
  join public.shifts s on s.id = p.shift_id
  where s.employer_id = uid
    and p.status in ('pending', 'paid', 'released')
    and date_trunc('month', coalesce(p.paid_at, p.created_at)) = date_trunc('month', now());

  -- Perfil employer
  select
    ep.rating,
    ep.rating_count,
    ep.total_shifts
  into v_rating, v_rating_count, v_total_shifts
  from public.employer_profiles ep
  where ep.user_id = uid;

  -- Gasto del mes
  select coalesce(sum(p.gross), 0)
  into v_month_spend
  from public.payments p
  join public.shifts s on s.id = p.shift_id
  where s.employer_id = uid
    and p.status in ('pending', 'paid', 'released')
    and date_trunc('month', coalesce(p.paid_at, p.created_at)) = date_trunc('month', now());

  -- Turnos publicados
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_shifts
  from (
    select
      s.id as shift_id,
      s.profession_required,
      s.location,
      s.starts_at,
      s.ends_at,
      s.hourly_rate_offer,
      s.status,
      s.slots_needed,
      (
        select count(*)
        from public.shift_applications sa
        where sa.shift_id = s.id
      ) as application_count,
      (
        select count(*)
        from public.shift_applications sa
        where sa.shift_id = s.id
          and sa.status = 'accepted'
      ) as accepted_count
    from public.shifts s
    where s.employer_id = uid
    order by s.starts_at desc
    limit 20
  ) t;

  -- Gasto mensual últimos 6 meses
  with months as (
    select date_trunc('month', now()) - (n || ' months')::interval as month
    from generate_series(5, 0) n
  ),
  agg as (
    select
      date_trunc('month', coalesce(p.paid_at, p.created_at)) as month,
      coalesce(sum(p.gross), 0) as spend
    from public.payments p
    join public.shifts s on s.id = p.shift_id
    where s.employer_id = uid
      and p.status in ('pending', 'paid', 'released')
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'label', to_char(m.month, 'MM/YY'),
        'value', coalesce(a.spend, 0)
      )
      order by m.month asc
    ),
    '[]'::jsonb
  )
  into v_monthly_spend
  from months m
  left join agg a on a.month = m.month;

  -- Favoritos
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_favorites
  from (
    select
      wp.user_id as worker_id,
      wp.full_name,
      wp.professions,
      wp.rating,
      wp.rating_count,
      wp.total_jobs,
      wp.is_active,
      u.profile_photo_url
    from public.user_favorites f
    join public.worker_profiles wp on wp.user_id = f.worker_id
    join public.users u on u.id = wp.user_id
    where f.employer_id = uid
    order by f.created_at desc
    limit 10
  ) t;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'activeShifts', v_active_shifts,
      'workersHiredMonth', v_workers_hired_month,
      'rating', v_rating,
      'ratingCount', v_rating_count,
      'totalShifts', v_total_shifts,
      'monthSpend', v_month_spend
    ),
    'shifts', v_shifts,
    'monthlySpend', v_monthly_spend,
    'favorites', v_favorites
  );
end;
$$;

-- =====================================================
-- Métricas Admin
-- =====================================================

create or replace function public.get_admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_workers integer := 0;
  v_total_employers integer := 0;
  v_pending_verification integer := 0;
  v_active_users_30d integer := 0;
  v_shifts_this_month integer := 0;
  v_completed_shifts_month integer := 0;
  v_gmv_month numeric := 0;
  v_commission_month numeric := 0;
  v_open_disputes integer := 0;
  v_monthly_gmv jsonb := '[]'::jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'No autorizado';
  end if;

  select count(*)::integer
  into v_total_workers
  from public.users
  where role in ('worker', 'both');

  select count(*)::integer
  into v_total_employers
  from public.users
  where role in ('employer', 'both');

  select count(*)::integer
  into v_pending_verification
  from public.users
  where onboarding_completed = true
    and verification_status = 'pending';

  select count(*)::integer
  into v_active_users_30d
  from public.users
  where last_active_at >= now() - interval '30 days';

  select count(*)::integer
  into v_shifts_this_month
  from public.shifts
  where date_trunc('month', starts_at) = date_trunc('month', now());

  select count(*)::integer, coalesce(sum(p.gross), 0), coalesce(sum(p.commission), 0)
  into v_completed_shifts_month, v_gmv_month, v_commission_month
  from public.payments p
  where p.status in ('pending', 'paid', 'released')
    and date_trunc('month', coalesce(p.paid_at, p.created_at)) = date_trunc('month', now());

  select count(*)::integer
  into v_open_disputes
  from public.disputes
  where status in ('open', 'under_review');

  with months as (
    select date_trunc('month', now()) - (n || ' months')::interval as month
    from generate_series(5, 0) n
  ),
  agg as (
    select
      date_trunc('month', coalesce(p.paid_at, p.created_at)) as month,
      coalesce(sum(p.gross), 0) as gmv,
      coalesce(sum(p.commission), 0) as commission
    from public.payments p
    where p.status in ('pending', 'paid', 'released')
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'label', to_char(m.month, 'MM/YY'),
        'gmv', coalesce(a.gmv, 0),
        'commission', coalesce(a.commission, 0)
      )
      order by m.month asc
    ),
    '[]'::jsonb
  )
  into v_monthly_gmv
  from months m
  left join agg a on a.month = m.month;

  return jsonb_build_object(
    'totalWorkers', v_total_workers,
    'totalEmployers', v_total_employers,
    'pendingVerification', v_pending_verification,
    'activeUsers30d', v_active_users_30d,
    'shiftsThisMonth', v_shifts_this_month,
    'completedShiftsMonth', v_completed_shifts_month,
    'gmvMonth', v_gmv_month,
    'commissionMonth', v_commission_month,
    'openDisputes', v_open_disputes,
    'monthlyGmv', v_monthly_gmv
  );
end;
$$;

-- =====================================================
-- Grants
-- =====================================================

grant execute on all functions in schema public to authenticated, service_role;
```

---

# 2. Utilidades base

## `src/lib/utils/cn.ts`

```ts
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
```

---

## `src/lib/utils/format.ts`

```ts
export function formatEUR(value: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0);
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${days} d`;
}
```

---

## `src/lib/utils/storage.ts`

```ts
import { createClient } from '@/lib/supabase/client';

interface UploadImageParams {
  bucket: string;
  path: string;
  file: File;
  publicRead?: boolean;
}

export async function uploadImage({
  bucket,
  path,
  file,
  publicRead = true,
}: UploadImageParams): Promise<string> {
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
```

---

# 3. Hooks de tema e idioma

## `src/hooks/useTheme.ts`

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('bw_theme') as Theme | null;

    if (stored) {
      setTheme(stored);
      return;
    }

    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    localStorage.setItem('bw_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
```

---

## `src/lib/i18n.ts`

```ts
export type Language = 'es' | 'pt' | 'en';

export const translations: Record<
  Language,
  Record<string, string>
> = {
  es: {
    'nav.dashboard': 'Panel',
    'nav.shifts': 'Turnos',
    'nav.applications': 'Aplicaciones',
    'nav.settings': 'Ajustes',
    'nav.admin': 'Admin',
    'common.loading': 'Cargando...',
    'common.error': 'Ha ocurrido un error',
    'common.retry': 'Reintentar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
  },
  pt: {
    'nav.dashboard': 'Painel',
    'nav.shifts': 'Turnos',
    'nav.applications': 'Candidaturas',
    'nav.settings': 'Definições',
    'nav.admin': 'Admin',
    'common.loading': 'A carregar...',
    'common.error': 'Ocorreu um erro',
    'common.retry': 'Tentar novamente',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.shifts': 'Shifts',
    'nav.applications': 'Applications',
    'nav.settings': 'Settings',
    'nav.admin': 'Admin',
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
  },
};

export function createTranslator(language: Language) {
  return function t(key: string): string {
    return translations[language]?.[key] ?? translations.es[key] ?? key;
  };
}
```

---

# 4. Componentes UI reutilizables

## `src/components/ui.tsx`

```tsx
'use client';

import { cn } from '@/lib/utils/cn';
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-8 w-8 animate-spin rounded-full border-4 border-[#FFB800]/30 border-t-[#FFB800]',
        className
      )}
    />
  );
}

export function FullLoader({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-center dark:border-red-900/40 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {retry && (
        <Button variant="secondary" className="mt-4" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F5F5F0] text-2xl dark:bg-neutral-800">
        🐝
      </div>
      <h3 className="text-lg font-bold text-[#1A1A1A] dark:text-neutral-100">
        {title}
      </h3>
      {description && (
        <p className="mx-auto mt-2 max-w-xs text-sm text-[#8B8B8B] dark:text-neutral-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-3xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900',
        onClick && 'cursor-pointer transition hover:shadow-md',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'dark';
}) {
  const styles = {
    default: 'bg-[#FFB800]/15 text-[#1A1A1A] dark:bg-[#FFB800]/20 dark:text-[#FFB800]',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    muted: 'bg-[#F5F5F0] text-[#8B8B8B] dark:bg-neutral-800 dark:text-neutral-400',
    dark: 'bg-[#1A1A1A] text-white dark:bg-neutral-800',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        styles[variant]
      )}
    >
      {children}
    </span>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' &&
          'bg-[#FFB800] text-[#1A1A1A] shadow-sm hover:bg-[#E0A800]',
        variant === 'secondary' &&
          'bg-[#F5F5F0] text-[#1A1A1A] hover:bg-black/5 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
        variant === 'ghost' &&
          'bg-transparent text-[#1A1A1A] hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10',
        variant === 'danger' && 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300',
        variant === 'outline' &&
          'border border-black/10 bg-transparent text-[#1A1A1A] hover:bg-black/5 dark:border-white/15 dark:text-neutral-100 dark:hover:bg-white/10',
        className
      )}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      )}
      {children}
    </button>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
          'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        {...props}
      />
      {hint && !error && (
        <p className="text-xs text-[#8B8B8B] dark:text-neutral-400">{hint}</p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
          'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
          error && 'border-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#1A1A1A] dark:text-neutral-200">
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100',
          error && 'border-red-400',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#FFFAF0] p-5 shadow-xl dark:bg-neutral-950 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1A1A1A] dark:text-neutral-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-bold text-[#1A1A1A] dark:bg-neutral-800 dark:text-neutral-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RatingStars({
  value,
  onChange,
  size = 'md',
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-sm',
    md: 'text-xl',
    lg: 'text-3xl',
  };

  return (
    <div className={cn('flex gap-1', sizes[size])}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={cn(
            star <= value ? 'text-[#FFB800]' : 'text-black/15 dark:text-white/20',
            onChange && 'transition hover:scale-110'
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  warningThreshold = 80,
}: {
  value: number;
  max: number;
  label?: string;
  warningThreshold?: number;
}) {
  const percent = Math.min(Math.round((value / max) * 100), 100);
  const isWarning = percent >= warningThreshold;

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#8B8B8B] dark:text-neutral-400">{label}</span>
          <span className="font-semibold text-[#1A1A1A] dark:text-neutral-100">
            {percent}%
          </span>
        </div>
      )}

      <div className="h-3 w-full overflow-hidden rounded-full bg-[#F5F5F0] dark:bg-neutral-800">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isWarning ? 'bg-red-500' : 'bg-[#FFB800]'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function Avatar({
  src,
  alt = 'Avatar',
  fallback = 'BW',
  size = 48,
  hex = true,
}: {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: number;
  hex?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-[#FFB800] font-bold text-[#1A1A1A]',
        hex ? 'hex-clip' : 'rounded-full'
      )}
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
        <span style={{ fontSize: size / 3 }}>{fallback}</span>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
}) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
          {value}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-[#8B8B8B] dark:text-neutral-500">{hint}</p>
        )}
      </div>

      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F5F5F0] text-lg dark:bg-neutral-800">
          {icon}
        </div>
      )}
    </Card>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      {label && (
        <span className="text-sm text-[#1A1A1A] dark:text-neutral-200">{label}</span>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 rounded-full transition disabled:opacity-50',
          checked ? 'bg-[#FFB800]' : 'bg-black/15 dark:bg-white/20'
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full bg-white transition-all',
            checked ? 'left-6' : 'left-1'
          )}
        />
      </button>
    </label>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition',
            active === tab.id
              ? 'bg-[#FFB800] text-[#1A1A1A]'
              : 'bg-[#F5F5F0] text-[#8B8B8B] dark:bg-neutral-800 dark:text-neutral-300'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SimpleBarChart({
  data,
  formatValue,
  height = 160,
}: {
  data: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(...data.map(item => item.value), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((item, index) => {
          const barHeight = Math.max((item.value / max) * 100, 4);

          return (
            <div
              key={`${item.label}-${index}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div className="text-[10px] font-semibold text-[#8B8B8B] dark:text-neutral-400">
                {item.value > 0 ? formatValue(item.value) : ''}
              </div>

              <div
                className="w-full rounded-t-xl bg-[#FFB800] transition-all dark:bg-[#E0A800]"
                style={{ height: `${barHeight}%` }}
                title={formatValue(item.value)}
              />

              <div className="text-[10px] text-[#8B8B8B] dark:text-neutral-500">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

# 5. Estilos globales con hexágono y dark mode

## `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}

.dark {
  color-scheme: dark;
}

body {
  @apply bg-[#FFFAF0] text-[#1A1A1A] antialiased dark:bg-neutral-950 dark:text-neutral-100;
}

.hex-clip {
  clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%);
}

.hex-pattern {
  background-color: #fffaF0;
  background-image: url("data:image/svg+xml,%3Csvg width='56' height='100' viewBox='0 0 56 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23FFB800' stroke-opacity='0.08' stroke-width='2'/%3E%3C/svg%3E");
  background-size: 56px 100px;
}

.dark .hex-pattern {
  background-color: #0a0a0a;
  background-image: url("data:image/svg+xml,%3Csvg width='56' height='100' viewBox='0 0 56 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23FFB800' stroke-opacity='0.10' stroke-width='2'/%3E%3C/svg%3E");
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

# 6. Server Actions: perfiles, settings, favoritos, disputas, cuenta

## `src/server/actions/profile.actions.ts`

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

export async function updateWorkerProfileAction(input: {
  fullName: string;
  hourlyRate: number;
  workRadiusKm: number;
  professions: string[];
  skills: string[];
  isActive: boolean;
  profilePhotoUrl?: string;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  const { error: userError } = await admin
    .from('users')
    .update({
      full_name: input.fullName,
      profile_photo_url: input.profilePhotoUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (userError) {
    return { success: false, error: 'No pudimos actualizar tus datos.' };
  }

  const { error: profileError } = await admin
    .from('worker_profiles')
    .update({
      full_name: input.fullName,
      hourly_rate: input.hourlyRate,
      work_radius_km: input.workRadiusKm,
      professions: input.professions,
      skills: input.skills,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (profileError) {
    return { success: false, error: 'No pudimos actualizar tu perfil de worker.' };
  }

  return { success: true };
}

export async function updateEmployerProfileAction(input: {
  companyName: string;
  address: string;
  logoUrl?: string;
  email: string;
  phone: string;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  const { error: userError } = await admin
    .from('users')
    .update({
      full_name: input.companyName,
      email: input.email,
      phone: input.phone,
      profile_photo_url: input.logoUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (userError) {
    return { success: false, error: 'No pudimos actualizar tus datos.' };
  }

  const { error: profileError } = await admin
    .from('employer_profiles')
    .update({
      company_name: input.companyName,
      address: input.address,
      location: input.address,
      logo_url: input.logoUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (profileError) {
    return { success: false, error: 'No pudimos actualizar tu perfil de empresa.' };
  }

  return { success: true };
}

export async function toggleFavoriteWorkerAction(
  workerId: string
): Promise<ActionResult<{ favorite: boolean }>> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  const { data: existing } = await admin
    .from('user_favorites')
    .select('worker_id')
    .eq('employer_id', user.id)
    .eq('worker_id', workerId)
    .maybeSingle();

  if (existing) {
    await admin
      .from('user_favorites')
      .delete()
      .eq('employer_id', user.id)
      .eq('worker_id', workerId);

    return { success: true, data: { favorite: false } };
  }

  await admin.from('user_favorites').insert({
    employer_id: user.id,
    worker_id: workerId,
  });

  return { success: true, data: { favorite: true } };
}

export async function createDisputeAction(input: {
  reportedUserId: string;
  shiftId?: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  if (!input.reason || input.reason.trim().length < 10) {
    return {
      success: false,
      error: 'Describe el problema con al menos 10 caracteres.',
    };
  }

  const { error } = await supabase.from('disputes').insert({
    reporter_id: user.id,
    reported_user_id: input.reportedUserId,
    shift_id: input.shiftId ?? null,
    reason: input.reason.trim(),
    status: 'open',
  });

  if (error) {
    return { success: false, error: 'No pudimos enviar el reporte.' };
  }

  return { success: true };
}
```

---

## `src/server/actions/settings.actions.ts`

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

export async function getSettingsDataAction() {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const, error: 'Debes iniciar sesión.' };
  }

  const [
    userData,
    workerProfile,
    employerProfile,
    settings,
    notificationSettings,
  ] = await Promise.all([
    admin.from('users').select('*').eq('id', user.id).maybeSingle(),
    admin.from('worker_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('employer_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('notification_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  return {
    success: true as const,
    data: {
      user: userData.data,
      workerProfile: workerProfile.data,
      employerProfile: employerProfile.data,
      settings: settings.data,
      notificationSettings: notificationSettings.data,
    },
  };
}

export async function updateUserSettingsAction(input: {
  language: 'es' | 'pt' | 'en';
  theme: 'light' | 'dark';
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  await admin.from('user_settings').upsert({
    user_id: user.id,
    language: input.language,
    theme: input.theme,
    updated_at: new Date().toISOString(),
  });

  return { success: true };
}

export async function updateNotificationSettingsAction(input: {
  new_shift_nearby: boolean;
  new_application: boolean;
  application_accepted: boolean;
  application_rejected: boolean;
  worker_checked_in: boolean;
  worker_checked_out: boolean;
  rating_pending: boolean;
  marketing: boolean;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  await admin.from('notification_settings').upsert({
    user_id: user.id,
    ...input,
    updated_at: new Date().toISOString(),
  });

  return { success: true };
}

export async function requestDeleteAccountAction(): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  await admin
    .from('users')
    .update({ delete_requested_at: new Date().toISOString() })
    .eq('id', user.id);

  return { success: true };
}

export async function cancelDeleteAccountAction(): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  await admin
    .from('users')
    .update({ delete_requested_at: null })
    .eq('id', user.id);

  return { success: true };
}
```

---

## `src/server/actions/dashboard.actions.ts`

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cancelUpcomingShiftAction } from '@/server/actions/shifts.actions';

export async function getWorkerDashboardAction() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc('get_worker_dashboard');

  if (error) {
    return { success: false as const, error: 'No pudimos cargar tu panel.' };
  }

  return { success: true as const, data };
}

export async function getWorkerMonthlyEarningsAction(monthCount = 6) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc('get_worker_monthly_earnings', {
    month_count: monthCount,
  });

  if (error) {
    return { success: false as const, error: 'No pudimos cargar tus ingresos.' };
  }

  return { success: true as const, data };
}

export async function getWorkerCompletedShiftsAction(page = 0, pageSize = 10) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc('get_worker_completed_shifts', {
    page,
    page_size: pageSize,
  });

  if (error) {
    return { success: false as const, error: 'No pudimos cargar tu historial.' };
  }

  return { success: true as const, data };
}

export async function getEmployerDashboardAction() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc('get_employer_dashboard');

  if (error) {
    return { success: false as const, error: 'No pudimos cargar tu panel.' };
  }

  return { success: true as const, data };
}

export { cancelUpcomingShiftAction };
```

---

## `src/server/actions/shifts.actions.ts`

Añadir/reescribir `cancelUpcomingShiftAction`.

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

export async function cancelUpcomingShiftAction(
  shiftId: string
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Debes iniciar sesión.' };
  }

  const { data: application } = await admin
    .from('shift_applications')
    .select('*, shifts(*)')
    .eq('shift_id', shiftId)
    .eq('worker_id', user.id)
    .maybeSingle();

  if (!application) {
    return { success: false, error: 'No tienes aplicación para este turno.' };
  }

  const shift = application.shifts;

  if (!shift) {
    return { success: false, error: 'Turno no encontrado.' };
  }

  const startsAt = new Date(shift.starts_at).getTime();
  const now = Date.now();
  const hoursUntilStart = (startsAt - now) / 3600000;

  if (application.status === 'accepted' && hoursUntilStart < 24) {
    return {
      success: false,
      error:
        'Solo puedes cancelar un turno aceptado con más de 24 horas de antelación.',
    };
  }

  const nextStatus = application.status === 'accepted' ? 'cancelled' : 'withdrawn';

  const { error } = await admin
    .from('shift_applications')
    .update({ status: nextStatus })
    .eq('id', application.id);

  if (error) {
    return { success: false, error: 'No pudimos cancelar el turno.' };
  }

  // Notificar employer si era accepted
  if (application.status === 'accepted') {
    await admin.from('notifications').insert({
      user_id: shift.employer_id,
      type: 'application_cancelled',
      title: 'Un worker canceló su turno',
      body: 'Un trabajador aceptado canceló su participación.',
      data: {
        shiftId,
        workerId: user.id,
      },
    });
  }

  return { success: true };
}
```

---

# 7. Server Actions públicas para perfiles

## `src/server/actions/public-profile.actions.ts`

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getPublicWorkerProfileAction(workerId: string) {
  const admin = createAdminClient();
  const supabase = createServerSupabaseClient();

  const { data: user } = await admin
    .from('users')
    .select(
      'id, full_name, profile_photo_url, is_verified, verification_status, nif, is_suspended'
    )
    .eq('id', workerId)
    .maybeSingle();

  if (!user || user.is_suspended) {
    return { success: false as const, error: 'Perfil no disponible.' };
  }

  const { data: profile } = await admin
    .from('worker_profiles')
    .select(
      'user_id, full_name, professions, skills, hourly_rate, rating, rating_count, total_jobs, is_active, is_autonomo, seguro_vigente, seguro_expires_at'
    )
    .eq('user_id', workerId)
    .maybeSingle();

  if (!profile) {
    return { success: false as const, error: 'Perfil no disponible.' };
  }

  const showRating = (profile.rating_count ?? 0) >= 3;

  let comments: Array<{ stars: number; comment: string | null; created_at: string }> = [];

  if (showRating) {
    const { data: ratings } = await admin
      .from('ratings')
      .select('stars, comment, created_at')
      .eq('ratee_id', workerId)
      .eq('type', 'employer_to_worker')
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    comments = (ratings ?? []) as any;
  }

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  let isFavorite = false;

  if (currentUser) {
    const { data: favorite } = await admin
      .from('user_favorites')
      .select('worker_id')
      .eq('employer_id', currentUser.id)
      .eq('worker_id', workerId)
      .maybeSingle();

    isFavorite = Boolean(favorite);
  }

  const seguroVigente =
    profile.seguro_vigente &&
    (!profile.seguro_expires_at || new Date(profile.seguro_expires_at) > new Date());

  return {
    success: true as const,
    data: {
      user,
      profile: {
        ...profile,
        seguro_vigente: seguroVigente,
      },
      showRating,
      comments,
      isFavorite,
    },
  };
}

export async function getPublicEmployerProfileAction(employerId: string) {
  const admin = createAdminClient();
  const supabase = createServerSupabaseClient();

  const { data: user } = await admin
    .from('users')
    .select(
      'id, full_name, profile_photo_url, is_verified, verification_status, is_suspended'
    )
    .eq('id', employerId)
    .maybeSingle();

  if (!user || user.is_suspended) {
    return { success: false as const, error: 'Perfil no disponible.' };
  }

  const { data: profile } = await admin
    .from('employer_profiles')
    .select(
      'user_id, company_name, address, location, rating, rating_count, total_shifts, logo_url, nif_empresa'
    )
    .eq('user_id', employerId)
    .maybeSingle();

  if (!profile) {
    return { success: false as const, error: 'Perfil no disponible.' };
  }

  const showRating = (profile.rating_count ?? 0) >= 3;

  let comments: Array<{ stars: number; comment: string | null; created_at: string }> = [];

  if (showRating) {
    const { data: ratings } = await admin
      .from('ratings')
      .select('stars, comment, created_at')
      .eq('ratee_id', employerId)
      .eq('type', 'worker_to_employer')
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    comments = (ratings ?? []) as any;
  }

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  return {
    success: true as const,
    data: {
      user,
      profile,
      showRating,
      comments,
      currentUserId: currentUser?.id ?? null,
    },
  };
}
```

---

# 8. Server Actions Admin

## `src/server/actions/admin.actions.ts`

```ts
'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Debes iniciar sesión.');
  }

  const { data } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!data?.is_admin) {
    throw new Error('No autorizado.');
  }

  return user;
}

export async function adminGetMetricsAction() {
  try {
    await assertAdmin();

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc('get_admin_metrics');

    if (error) {
      return { success: false as const, error: 'No pudimos cargar métricas.' };
    }

    return { success: true as const, data };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminGetUsersAction(input: {
  role?: 'worker' | 'employer';
  verification?: 'pending' | 'approved' | 'rejected';
  suspended?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    await assertAdmin();

    const admin = createAdminClient();
    const page = input.page ?? 0;
    const pageSize = input.pageSize ?? 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from('users')
      .select(
        `
        id,
        full_name,
        email,
        phone,
        role,
        is_verified,
        verification_status,
        is_suspended,
        delete_requested_at,
        created_at,
        worker_profiles (
          user_id,
          full_name,
          professions,
          rating,
          rating_count,
          total_jobs,
          is_active
        ),
        employer_profiles (
          user_id,
          company_name,
          rating,
          rating_count,
          total_shifts
        )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (input.role === 'worker') {
      query = query.in('role', ['worker', 'both']);
    }

    if (input.role === 'employer') {
      query = query.in('role', ['employer', 'both']);
    }

    if (input.verification) {
      query = query.eq('verification_status', input.verification);
    }

    if (typeof input.suspended === 'boolean') {
      query = query.eq('is_suspended', input.suspended);
    }

    if (input.search && input.search.trim()) {
      const term = input.search.trim().replace(/[%]/g, '');
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return { success: false as const, error: 'No pudimos cargar usuarios.' };
    }

    return {
      success: true as const,
      data: {
        users: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminSetVerificationAction(input: {
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
}) {
  try {
    const adminUser = await assertAdmin();
    const admin = createAdminClient();

    await admin
      .from('users')
      .update({
        verification_status: input.status,
        is_verified: input.status === 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    await admin
      .from('employer_profiles')
      .update({
        verification_status: input.status,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', input.userId);

    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminSetSuspensionAction(input: {
  userId: string;
  suspended: boolean;
  reason?: string;
}) {
  try {
    await assertAdmin();
    const admin = createAdminClient();

    await admin
      .from('users')
      .update({
        is_suspended: input.suspended,
        suspension_reason: input.reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminGetPendingDocumentsAction() {
  try {
    await assertAdmin();
    const admin = createAdminClient();

    const { data: docs } = await admin
      .from('onboarding_documents')
      .select(
        `
        id,
        user_id,
        doc_type,
        storage_bucket,
        storage_path,
        status,
        created_at,
        users:user_id (
          id,
          full_name,
          email,
          role
        )
        `
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);

    const enriched = await Promise.all(
      (docs ?? []).map(async doc => {
        const { data: signed } = await admin.storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, 60 * 10);

        return {
          ...doc,
          signedUrl: signed?.signedUrl ?? null,
        };
      })
    );

    return { success: true as const, data: enriched };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminReviewDocumentAction(input: {
  documentId: string;
  status: 'approved' | 'rejected';
  rejectReason?: string;
}) {
  try {
    const adminUser = await assertAdmin();
    const admin = createAdminClient();

    await admin
      .from('onboarding_documents')
      .update({
        status: input.status,
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: input.rejectReason ?? null,
      })
      .eq('id', input.documentId);

    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminGetDisputesAction(
  status?: 'open' | 'under_review' | 'resolved' | 'closed'
) {
  try {
    await assertAdmin();
    const admin = createAdminClient();

    let query = admin
      .from('disputes')
      .select(
        `
        id,
        reason,
        status,
        admin_notes,
        created_at,
        reporter:reporter_id (
          id,
          full_name,
          email
        ),
        reported:reported_user_id (
          id,
          full_name,
          email
        )
        `
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq('status', status);
    }

    const { data } = await query;

    return { success: true as const, data: data ?? [] };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}

export async function adminResolveDisputeAction(input: {
  disputeId: string;
  status: 'under_review' | 'resolved' | 'closed';
  adminNotes?: string;
}) {
  try {
    await assertAdmin();
    const admin = createAdminClient();

    await admin
      .from('disputes')
      .update({
        status: input.status,
        admin_notes: input.adminNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.disputeId);

    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : 'No autorizado.',
    };
  }
}
```

---

# 9. Dashboard Worker

## `src/app/app/worker/dashboard/page.tsx`

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getWorkerDashboardAction,
  getWorkerMonthlyEarningsAction,
  getWorkerCompletedShiftsAction,
  cancelUpcomingShiftAction,
} from '@/server/actions/dashboard.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  ProgressBar,
  SimpleBarChart,
  StatCard,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

interface WorkerDashboardData {
  summary: {
    weekShifts: number;
    monthGross: number;
    monthNetBeforeTaxes: number;
    monthNetAfterTaxes: number;
    rating: number;
    ratingCount: number;
    totalJobs: number;
    isActive: boolean;
  };
  iva: {
    annualBilled: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };
  upcomingShifts: any[];
}

interface MonthlyEarning {
  month: string;
  label: string;
  gross: number;
  net: number;
}

interface CompletedHistory {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

export default function WorkerDashboardPage() {
  const [dashboard, setDashboard] = useState<WorkerDashboardData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEarning[]>([]);
  const [history, setHistory] = useState<CompletedHistory | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (currentPage = 0) => {
    setLoading(true);
    setError(null);

    const [dashRes, monthlyRes, historyRes] = await Promise.all([
      getWorkerDashboardAction(),
      getWorkerMonthlyEarningsAction(6),
      getWorkerCompletedShiftsAction(currentPage, 10),
    ]);

    if (!dashRes.success) {
      setError(dashRes.error);
      setLoading(false);
      return;
    }

    setDashboard(dashRes.data as WorkerDashboardData);
    setMonthly((monthlyRes.success ? monthlyRes.data : []) as MonthlyEarning[]);
    setHistory((historyRes.success ? historyRes.data : null) as CompletedHistory | null);
    setPage(currentPage);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const handleCancelShift = async (shiftId: string) => {
    setActionLoading(shiftId);
    const result = await cancelUpcomingShiftAction(shiftId);
    setActionLoading(null);

    if (result.success) {
      await load(page);
    } else {
      alert(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando tu panel..." />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Error'} retry={() => load(page)} />
        </div>
      </div>
    );
  }

  const { summary, iva, upcomingShifts } = dashboard;
  const showRating = summary.ratingCount >= 3;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-[#1A1A1A] p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black">Panel Worker</h1>
            <p className="mt-1 text-sm text-white/70">
              Resumen de tu actividad como autónomo.
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/app/worker">
              <Button variant="secondary">Ver feed</Button>
            </Link>
            <Link href="/app/settings">
              <Button variant="ghost">Ajustes</Button>
            </Link>
          </div>
        </div>

        {/* Resumen */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Turnos esta semana"
            value={String(summary.weekShifts)}
            icon="📅"
          />
          <StatCard
            label="Ingresos del mes"
            value={formatEUR(summary.monthGross)}
            hint={`Antes de impuestos: ${formatEUR(summary.monthNetBeforeTaxes)}`}
            icon="💶"
          />
          <StatCard
            label="Rating actual"
            value={showRating ? summary.rating.toFixed(1) : 'Nuevo'}
            hint={`${summary.totalJobs} trabajos completados`}
            icon="⭐"
          />
          <StatCard
            label="Disponibilidad"
            value={summary.isActive ? 'Activo' : 'Inactivo'}
            icon={summary.isActive ? '🟢' : '⚪'}
          />
        </section>

        {/* IVA */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Límite de IVA</h2>
            <Badge variant={iva.percentUsed >= 80 ? 'danger' : 'default'}>
              {formatEUR(iva.annualBilled)} / {formatEUR(iva.limit)}
            </Badge>
          </div>

          <ProgressBar value={iva.annualBilled} max={iva.limit} label="Facturación anual" />

          {iva.remaining > 0 ? (
            <p className="rounded-2xl bg-[#FFB800]/10 p-4 text-sm text-[#1A1A1A] dark:text-neutral-100">
              Te quedan <strong>{formatEUR(iva.remaining)}</strong> antes de tener que
              cobrar IVA.
            </p>
          ) : (
            <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Has superado el límite de exención de IVA. Revisa tus obligaciones fiscales.
            </p>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gráfico ingresos */}
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Ingresos mensuales</h2>

            {monthly.length === 0 ? (
              <EmptyState title="Sin datos" description="Aún no tienes ingresos registrados." />
            ) : (
              <SimpleBarChart
                data={monthly.map(item => ({
                  label: item.label,
                  value: item.gross,
                }))}
                formatValue={formatEUR}
              />
            )}
          </Card>

          {/* Próximos turnos */}
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Próximos turnos</h2>

            {upcomingShifts.length === 0 ? (
              <EmptyState
                title="Sin próximos turnos"
                description="Aplica a turnos desde el feed."
                action={
                  <Link href="/app/worker">
                    <Button>Ir al feed</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {upcomingShifts.map((shift: any) => {
                  const canCancel =
                    new Date(shift.starts_at).getTime() - Date.now() > 24 * 3600000;

                  return (
                    <div
                      key={shift.shift_id}
                      className="rounded-2xl border border-black/5 bg-[#F5F5F0] p-4 dark:border-white/10 dark:bg-neutral-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{shift.profession_required}</p>
                          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                            {shift.company_name}
                          </p>
                          <p className="mt-1 text-sm text-[#8B8B8B] dark:text-neutral-400">
                            {formatDateTime(shift.starts_at)}
                          </p>
                        </div>

                        <Badge>{shift.application_status}</Badge>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Link href={`/app/worker/shifts/${shift.shift_id}`}>
                          <Button variant="secondary">Ver</Button>
                        </Link>

                        {canCancel && (
                          <Button
                            variant="danger"
                            loading={actionLoading === shift.shift_id}
                            onClick={() => handleCancelShift(shift.shift_id)}
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Historial */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Historial de turnos completados</h2>
            <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              {history?.total ?? 0} registros
            </span>
          </div>

          {!history || history.items.length === 0 ? (
            <EmptyState title="Sin historial" description="Aún no completaste turnos." />
          ) : (
            <>
              <div className="space-y-3">
                {history.items.map((item: any) => (
                  <div
                    key={item.payment_id}
                    className="flex flex-col gap-3 rounded-2xl border border-black/5 p-4 dark:border-white/10 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-bold">{item.profession_required}</p>
                      <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                        {item.company_name} · {formatDateTime(item.effective_date)}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="font-black">{formatEUR(item.gross)}</p>
                      <p className="text-xs text-[#8B8B8B] dark:text-neutral-400">
                        Neto estimado: {formatEUR(item.worker_net_estimate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => load(page - 1)}
                >
                  Anterior
                </Button>

                <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                  Página {page + 1}
                </span>

                <Button
                  variant="secondary"
                  disabled={(page + 1) * history.pageSize >= history.total}
                  onClick={() => load(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
```

---

# 10. Dashboard Employer

## `src/app/app/employer/dashboard/page.tsx`

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getEmployerDashboardAction } from '@/server/actions/dashboard.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  SimpleBarChart,
  StatCard,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

interface EmployerDashboardData {
  summary: {
    activeShifts: number;
    workersHiredMonth: number;
    rating: number;
    ratingCount: number;
    totalShifts: number;
    monthSpend: number;
  };
  shifts: any[];
  monthlySpend: Array<{ label: string; value: number }>;
  favorites: any[];
}

export default function EmployerDashboardPage() {
  const [dashboard, setDashboard] = useState<EmployerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getEmployerDashboardAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDashboard(result.data as EmployerDashboardData);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando panel employer..." />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Error'} retry={load} />
        </div>
      </div>
    );
  }

  const { summary, shifts, monthlySpend, favorites } = dashboard;
  const showRating = summary.ratingCount >= 3;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-[#1A1A1A] p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black">Panel Employer</h1>
            <p className="mt-1 text-sm text-white/70">
              Gestiona tus turnos y workers contratados.
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/app/employer/shifts/new">
              <Button>Publicar turno</Button>
            </Link>
            <Link href="/app/settings">
              <Button variant="ghost">Ajustes</Button>
            </Link>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Turnos activos" value={String(summary.activeShifts)} icon="📌" />
          <StatCard
            label="Workers contratados este mes"
            value={String(summary.workersHiredMonth)}
            icon="👥"
          />
          <StatCard
            label="Gasto del mes"
            value={formatEUR(summary.monthSpend)}
            icon="💸"
          />
          <StatCard
            label="Rating empresa"
            value={showRating ? summary.rating.toFixed(1) : 'Nuevo'}
            hint={`${summary.totalShifts} turnos completados`}
            icon="⭐"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Uso mensual</h2>

            {monthlySpend.length === 0 ? (
              <EmptyState title="Sin datos" description="Aún no hay gasto registrado." />
            ) : (
              <SimpleBarChart data={monthlySpend} formatValue={formatEUR} />
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Workers favoritos</h2>

            {favorites.length === 0 ? (
              <EmptyState
                title="Sin favoritos"
                description="Guarda workers con buena experiencia."
              />
            ) : (
              <div className="space-y-3">
                {favorites.map((worker: any) => (
                  <Link
                    key={worker.worker_id}
                    href={`/workers/${worker.worker_id}`}
                    className="flex items-center gap-3 rounded-2xl border border-black/5 p-3 transition hover:shadow-md dark:border-white/10"
                  >
                    <Avatar src={worker.profile_photo_url} fallback="W" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{worker.full_name}</p>
                      <p className="truncate text-sm text-[#8B8B8B] dark:text-neutral-400">
                        {worker.professions?.[0] ?? 'Worker'}
                      </p>
                    </div>

                    {worker.rating_count >= 3 && (
                      <Badge>⭐ {worker.rating.toFixed(1)}</Badge>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Turnos publicados</h2>
            <Link href="/app/employer/shifts">
              <Button variant="secondary">Ver todos</Button>
            </Link>
          </div>

          {shifts.length === 0 ? (
            <EmptyState
              title="Sin turnos"
              description="Publica tu primer turno."
              action={
                <Link href="/app/employer/shifts/new">
                  <Button>Publicar turno</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {shifts.map((shift: any) => (
                <Link
                  key={shift.shift_id}
                  href={`/app/employer/shifts/${shift.shift_id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-black/5 p-4 transition hover:shadow-md dark:border-white/10 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-bold">{shift.profession_required}</p>
                    <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                      {formatDateTime(shift.starts_at)} · {shift.location}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted">{shift.application_count} apps</Badge>
                    <Badge variant="muted">
                      {shift.accepted_count}/{shift.slots_needed}
                    </Badge>
                    <Badge
                      variant={
                        shift.status === 'completed'
                          ? 'success'
                          : shift.status === 'assigned'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {shift.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
```

---

# 11. Perfil público Worker

## `src/app/workers/[id]/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicWorkerProfileAction } from '@/server/actions/public-profile.actions';
import { toggleFavoriteWorkerAction, createDisputeAction } from '@/server/actions/profile.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  FullLoader,
  Modal,
  RatingStars,
  Textarea,
} from '@/components/ui';
import { formatEUR, timeAgo } from '@/lib/utils/format';

export default function PublicWorkerProfilePage() {
  const params = useParams();
  const router = useRouter();

  const workerId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    const result = await getPublicWorkerProfileAction(workerId);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setData(result.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [workerId]);

  const handleFavorite = async () => {
    setFavoriteLoading(true);
    const result = await toggleFavoriteWorkerAction(workerId);

    if (result.success && result.data) {
      setData((prev: any) => ({
        ...prev,
        isFavorite: result.data.favorite,
      }));
    }

    setFavoriteLoading(false);
  };

  const handleReport = async () => {
    setReportLoading(true);

    const result = await createDisputeAction({
      reportedUserId: workerId,
      reason: reportReason,
    });

    setReportLoading(false);

    if (result.success) {
      setReportOpen(false);
      setReportReason('');
      alert('Reporte enviado. Gracias.');
    } else {
      alert(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando perfil..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Perfil no disponible'} retry={load} />
        </div>
      </div>
    );
  }

  const { user, profile, showRating, comments, isFavorite } = data;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar src={user.profile_photo_url} size={72} fallback="W" />

              <div>
                <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
                  {profile.full_name || user.full_name}
                </h1>

                <div className="mt-2 flex flex-wrap gap-2">
                  {user.is_verified && <Badge variant="success">Verificado</Badge>}
                  {profile.is_autonomo && <Badge variant="success">Autónomo ✓</Badge>}
                  {profile.seguro_vigente && <Badge variant="success">Seguro ✓</Badge>}
                  {user.nif && <Badge variant="muted">NIF ✓</Badge>}
                  {!profile.is_active && <Badge variant="danger">No disponible</Badge>}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={isFavorite ? 'primary' : 'outline'}
                loading={favoriteLoading}
                onClick={handleFavorite}
              >
                {isFavorite ? '★ Favorito' : '☆ Favorito'}
              </Button>

              <Button variant="danger" onClick={() => setReportOpen(true)}>
                Reportar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Rating</p>
              <p className="mt-1 text-xl font-black">
                {showRating ? profile.rating.toFixed(1) : 'Nuevo'}
              </p>
              {showRating && <RatingStars value={Math.round(profile.rating)} size="sm" />}
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Trabajos</p>
              <p className="mt-1 text-xl font-black">{profile.total_jobs}</p>
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Tarifa</p>
              <p className="mt-1 text-xl font-black">
                {formatEUR(profile.hourly_rate)}/h
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Profesiones</h2>
          <div className="flex flex-wrap gap-2">
            {profile.professions?.map((profession: string) => (
              <Badge key={profession} variant="muted">
                {profession}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills?.map((skill: string) => (
              <Badge key={skill} variant="default">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Comentarios recientes</h2>

          {!showRating ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Este perfil aún no tiene suficientes valoraciones públicas.
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Sin comentarios públicos.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment: any, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-black/5 p-4 dark:border-white/10"
                >
                  <RatingStars value={comment.stars} size="sm" />
                  {comment.comment && (
                    <p className="mt-2 text-sm text-[#1A1A1A] dark:text-neutral-200">
                      {comment.comment}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[#8B8B8B] dark:text-neutral-500">
                    {timeAgo(comment.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar perfil">
        <div className="space-y-4">
          <Textarea
            label="Motivo del reporte"
            rows={5}
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="Describe el problema..."
          />

          <Button
            className="w-full"
            loading={reportLoading}
            disabled={reportReason.trim().length < 10}
            onClick={handleReport}
          >
            Enviar reporte
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

---

# 12. Perfil público Employer

## `src/app/employers/[id]/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicEmployerProfileAction } from '@/server/actions/public-profile.actions';
import { createDisputeAction } from '@/server/actions/profile.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  FullLoader,
  Modal,
  RatingStars,
  Textarea,
} from '@/components/ui';
import { timeAgo } from '@/lib/utils/format';

export default function PublicEmployerProfilePage() {
  const params = useParams();
  const router = useRouter();

  const employerId = params.id as string;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    const result = await getPublicEmployerProfileAction(employerId);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setData(result.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [employerId]);

  const handleReport = async () => {
    setReportLoading(true);

    const result = await createDisputeAction({
      reportedUserId: employerId,
      reason: reportReason,
    });

    setReportLoading(false);

    if (result.success) {
      setReportOpen(false);
      setReportReason('');
      alert('Reporte enviado. Gracias.');
    } else {
      alert(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando perfil..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Perfil no disponible'} retry={load} />
        </div>
      </div>
    );
  }

  const { user, profile, showRating, comments } = data;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar src={profile.logo_url || user.profile_photo_url} size={72} fallback="E" />

              <div>
                <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">
                  {profile.company_name}
                </h1>

                <div className="mt-2 flex flex-wrap gap-2">
                  {user.is_verified && <Badge variant="success">Verificado</Badge>}
                  {profile.nif_empresa && <Badge variant="muted">NIF empresa ✓</Badge>}
                </div>
              </div>
            </div>

            <Button variant="danger" onClick={() => setReportOpen(true)}>
              Reportar
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">Rating</p>
              <p className="mt-1 text-xl font-black">
                {showRating ? profile.rating.toFixed(1) : 'Nuevo'}
              </p>
              {showRating && <RatingStars value={Math.round(profile.rating)} size="sm" />}
            </div>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 dark:bg-neutral-800">
              <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                Turnos completados
              </p>
              <p className="mt-1 text-xl font-black">{profile.total_shifts}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm dark:bg-neutral-800">
            <p className="text-[#8B8B8B] dark:text-neutral-400">Dirección</p>
            <p className="mt-1 font-medium">{profile.address || 'Porto'}</p>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Comentarios recientes</h2>

          {!showRating ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Este perfil aún no tiene suficientes valoraciones públicas.
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              Sin comentarios públicos.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment: any, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-black/5 p-4 dark:border-white/10"
                >
                  <RatingStars value={comment.stars} size="sm" />
                  {comment.comment && (
                    <p className="mt-2 text-sm text-[#1A1A1A] dark:text-neutral-200">
                      {comment.comment}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[#8B8B8B] dark:text-neutral-500">
                    {timeAgo(comment.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Reportar empresa">
        <div className="space-y-4">
          <Textarea
            label="Motivo del reporte"
            rows={5}
            value={reportReason}
            onChange={e => setReportReason(e.target.value)}
            placeholder="Describe el problema..."
          />

          <Button
            className="w-full"
            loading={reportLoading}
            disabled={reportReason.trim().length < 10}
            onClick={handleReport}
          >
            Enviar reporte
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

---

# 13. Página de configuración

## `src/app/app/settings/page.tsx`

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getSettingsDataAction,
  updateNotificationSettingsAction,
  updateUserSettingsAction,
  requestDeleteAccountAction,
  cancelDeleteAccountAction,
} from '@/server/actions/settings.actions';
import { updateWorkerProfileAction, updateEmployerProfileAction } from '@/server/actions/profile.actions';
import {
  Button,
  Card,
  FullLoader,
  Input,
  Modal,
  Select,
  Toggle,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { uploadImage, buildImagePath } from '@/lib/utils/storage';
import type { Language } from '@/lib/i18n';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [language, setLanguage] = useState<Language>('es');

  const [workerForm, setWorkerForm] = useState({
    fullName: '',
    hourlyRate: '',
    workRadiusKm: '',
    professions: '',
    skills: '',
    isActive: true,
    profilePhotoUrl: '',
  });

  const [employerForm, setEmployerForm] = useState({
    companyName: '',
    address: '',
    email: '',
    phone: '',
    logoUrl: '',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    new_shift_nearby: true,
    new_application: true,
    application_accepted: true,
    application_rejected: true,
    worker_checked_in: true,
    worker_checked_out: true,
    rating_pending: true,
    marketing: false,
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const result = await getSettingsDataAction();

    if (result.success) {
      const {
        user,
        workerProfile,
        employerProfile,
        settings,
        notificationSettings: notif,
      } = result.data;

      setData(result.data);

      if (settings?.language) {
        setLanguage(settings.language as Language);
      }

      if (settings?.theme) {
        setTheme(settings.theme as 'light' | 'dark');
      }

      if (workerProfile) {
        setWorkerForm({
          fullName: workerProfile.full_name || user?.full_name || '',
          hourlyRate: String(workerProfile.hourly_rate ?? ''),
          workRadiusKm: String(workerProfile.work_radius_km ?? ''),
          professions: (workerProfile.professions ?? []).join(', '),
          skills: (workerProfile.skills ?? []).join(', '),
          isActive: workerProfile.is_active ?? true,
          profilePhotoUrl: user?.profile_photo_url || '',
        });
      }

      if (employerProfile) {
        setEmployerForm({
          companyName: employerProfile.company_name || '',
          address: employerProfile.address || '',
          email: user?.email || '',
          phone: user?.phone || '',
          logoUrl: employerProfile.logo_url || user?.profile_photo_url || '',
        });
      }

      if (notif) {
        setNotificationSettings({
          new_shift_nearby: notif.new_shift_nearby,
          new_application: notif.new_application,
          application_accepted: notif.application_accepted,
          application_rejected: notif.application_rejected,
          worker_checked_in: notif.worker_checked_in,
          worker_checked_out: notif.worker_checked_out,
          rating_pending: notif.rating_pending,
          marketing: notif.marketing,
        });
      }
    }

    setLoading(false);
  }, [setTheme]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveWorker = async () => {
    setSaving(true);

    await updateWorkerProfileAction({
      fullName: workerForm.fullName,
      hourlyRate: Number(workerForm.hourlyRate || 0),
      workRadiusKm: Number(workerForm.workRadiusKm || 0),
      professions: workerForm.professions
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      skills: workerForm.skills
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      isActive: workerForm.isActive,
      profilePhotoUrl: workerForm.profilePhotoUrl,
    });

    setSaving(false);
    alert('Perfil actualizado.');
  };

  const handleSaveEmployer = async () => {
    setSaving(true);

    await updateEmployerProfileAction({
      companyName: employerForm.companyName,
      address: employerForm.address,
      email: employerForm.email,
      phone: employerForm.phone,
      logoUrl: employerForm.logoUrl,
    });

    setSaving(false);
    alert('Perfil de empresa actualizado.');
  };

  const handleSavePreferences = async () => {
    setSaving(true);

    await Promise.all([
      updateUserSettingsAction({ language, theme }),
      updateNotificationSettingsAction(notificationSettings),
    ]);

    setSaving(false);
    alert('Preferencias guardadas.');
  };

  const handlePhotoUpload = async (file: File, role: 'worker' | 'employer') => {
    if (!data?.user?.id) return;

    try {
      const path = buildImagePath(
        data.user.id,
        role === 'worker' ? 'avatar' : 'logo',
        file
      );

      const url = await uploadImage({
        bucket: 'profile-photos',
        path,
        file,
      });

      if (role === 'worker') {
        setWorkerForm(prev => ({ ...prev, profilePhotoUrl: url }));
      } else {
        setEmployerForm(prev => ({ ...prev, logoUrl: url }));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al subir imagen');
    }
  };

  const handleRequestDelete = async () => {
    await requestDeleteAccountAction();
    setDeleteOpen(false);
    alert('Cuenta marcada para eliminación. Tienes 30 días para cancelar.');
    await load();
  };

  const handleCancelDelete = async () => {
    await cancelDeleteAccountAction();
    alert('Eliminación cancelada.');
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando ajustes..." />
      </div>
    );
  }

  const hasWorker = Boolean(data?.workerProfile);
  const hasEmployer = Boolean(data?.employerProfile);
  const deleteRequestedAt = data?.user?.delete_requested_at;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-3xl font-black">Configuración</h1>

        {deleteRequestedAt && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30">
            <p className="text-sm text-red-700 dark:text-red-300">
              Tu cuenta está programada para eliminación. Puedes cancelarla antes de
              30 días.
            </p>
            <Button variant="danger" className="mt-3" onClick={handleCancelDelete}>
              Cancelar eliminación
            </Button>
          </Card>
        )}

        {/* Preferencias */}
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">Preferencias</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Idioma"
              value={language}
              onChange={e => setLanguage(e.target.value as Language)}
            >
              <option value="es">Español</option>
              <option value="pt">Português</option>
              <option value="en">English</option>
            </Select>

            <div className="space-y-2">
              <p className="text-sm font-medium">Dark mode</p>
              <Toggle
                checked={theme === 'dark'}
                onChange={value => setTheme(value ? 'dark' : 'light')}
                label={theme === 'dark' ? 'Activado' : 'Desactivado'}
              />
            </div>
          </div>

          <Button onClick={handleSavePreferences} loading={saving}>
            Guardar preferencias
          </Button>
        </Card>

        {/* Worker */}
        {hasWorker && (
          <Card className="space-y-5">
            <h2 className="text-lg font-bold">Perfil Worker</h2>

            <div className="flex items-center gap-4">
              {workerForm.profilePhotoUrl && (
                <img
                  src={workerForm.profilePhotoUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              )}

              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file, 'worker');
                }}
              />
            </div>

            <Input
              label="Nombre completo"
              value={workerForm.fullName}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, fullName: e.target.value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Precio/hora"
                type="number"
                value={workerForm.hourlyRate}
                onChange={e =>
                  setWorkerForm(prev => ({ ...prev, hourlyRate: e.target.value }))
                }
              />

              <Input
                label="Radio de trabajo (km)"
                type="number"
                value={workerForm.workRadiusKm}
                onChange={e =>
                  setWorkerForm(prev => ({ ...prev, workRadiusKm: e.target.value }))
                }
              />
            </div>

            <Input
              label="Profesiones (separadas por coma)"
              value={workerForm.professions}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, professions: e.target.value }))
              }
            />

            <Input
              label="Skills (separadas por coma)"
              value={workerForm.skills}
              onChange={e =>
                setWorkerForm(prev => ({ ...prev, skills: e.target.value }))
              }
            />

            <Toggle
              label="Disponible para aceptar turnos"
              checked={workerForm.isActive}
              onChange={value =>
                setWorkerForm(prev => ({ ...prev, isActive: value }))
              }
            />

            <Button onClick={handleSaveWorker} loading={saving}>
              Guardar perfil worker
            </Button>
          </Card>
        )}

        {/* Employer */}
        {hasEmployer && (
          <Card className="space-y-5">
            <h2 className="text-lg font-bold">Perfil Employer</h2>

            <div className="flex items-center gap-4">
              {employerForm.logoUrl && (
                <img
                  src={employerForm.logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              )}

              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file, 'employer');
                }}
              />
            </div>

            <Input
              label="Nombre de empresa"
              value={employerForm.companyName}
              onChange={e =>
                setEmployerForm(prev => ({ ...prev, companyName: e.target.value }))
              }
            />

            <Input
              label="Dirección"
              value={employerForm.address}
              onChange={e =>
                setEmployerForm(prev => ({ ...prev, address: e.target.value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                value={employerForm.email}
                onChange={e =>
                  setEmployerForm(prev => ({ ...prev, email: e.target.value }))
                }
              />

              <Input
                label="Teléfono"
                value={employerForm.phone}
                onChange={e =>
                  setEmployerForm(prev => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>

            <Button onClick={handleSaveEmployer} loading={saving}>
              Guardar perfil employer
            </Button>
          </Card>
        )}

        {/* Notificaciones */}
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">Notificaciones</h2>

          <div className="space-y-4">
            <Toggle
              label="Nuevos turnos cercanos"
              checked={notificationSettings.new_shift_nearby}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  new_shift_nearby: value,
                }))
              }
            />

            <Toggle
              label="Nuevas aplicaciones"
              checked={notificationSettings.new_application}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  new_application: value,
                }))
              }
            />

            <Toggle
              label="Aplicación aceptada"
              checked={notificationSettings.application_accepted}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  application_accepted: value,
                }))
              }
            />

            <Toggle
              label="Aplicación rechazada"
              checked={notificationSettings.application_rejected}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  application_rejected: value,
                }))
              }
            />

            <Toggle
              label="Check-in / check-out"
              checked={notificationSettings.worker_checked_in}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  worker_checked_in: value,
                  worker_checked_out: value,
                }))
              }
            />

            <Toggle
              label="Valoraciones pendientes"
              checked={notificationSettings.rating_pending}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  rating_pending: value,
                }))
              }
            />

            <Toggle
              label="Marketing"
              checked={notificationSettings.marketing}
              onChange={value =>
                setNotificationSettings(prev => ({
                  ...prev,
                  marketing: value,
                }))
              }
            />
          </div>

          <Button onClick={handleSavePreferences} loading={saving}>
            Guardar notificaciones
          </Button>
        </Card>

        {/* Eliminar cuenta */}
        <Card className="space-y-4 border-red-200 dark:border-red-900/40">
          <h2 className="text-lg font-bold text-red-700 dark:text-red-300">
            Eliminar cuenta
          </h2>

          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            Tu cuenta se marcará para eliminación y se eliminará tras un período de
            gracia de 30 días.
          </p>

          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Solicitar eliminación
          </Button>
        </Card>
      </main>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar cuenta">
        <div className="space-y-4">
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            ¿Seguro que quieres eliminar tu cuenta? Podrás cancelar durante 30 días.
          </p>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>

            <Button variant="danger" className="flex-1" onClick={handleRequestDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

---

# 14. Panel Admin

## `src/app/admin/page.tsx`

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminGetMetricsAction,
  adminGetUsersAction,
  adminSetVerificationAction,
  adminSetSuspensionAction,
  adminGetPendingDocumentsAction,
  adminReviewDocumentAction,
  adminGetDisputesAction,
  adminResolveDisputeAction,
} from '@/server/actions/admin.actions';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FullLoader,
  Input,
  Select,
  SimpleBarChart,
  StatCard,
  Tabs,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

export default function AdminPage() {
  const [tab, setTab] = useState('metrics');

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="rounded-3xl bg-[#1A1A1A] p-6 text-white">
          <h1 className="text-3xl font-black">Admin Bee Workers</h1>
          <p className="mt-1 text-sm text-white/70">
            Gestión de usuarios, verificación, métricas y disputas.
          </p>
        </div>

        <Tabs
          tabs={[
            { id: 'metrics', label: 'Métricas' },
            { id: 'users', label: 'Usuarios' },
            { id: 'verification', label: 'Verificación' },
            { id: 'disputes', label: 'Disputas' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'metrics' && <AdminMetrics />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'verification' && <AdminVerification />}
        {tab === 'disputes' && <AdminDisputes />}
      </main>
    </div>
  );
}

function AdminMetrics() {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetMetricsAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setMetrics(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workers" value={String(metrics.totalWorkers)} icon="👷" />
        <StatCard label="Employers" value={String(metrics.totalEmployers)} icon="🏢" />
        <StatCard
          label="Pendientes verificación"
          value={String(metrics.pendingVerification)}
          icon="🪪"
        />
        <StatCard
          label="Activos 30d"
          value={String(metrics.activeUsers30d)}
          icon="📈"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Turnos este mes"
          value={String(metrics.shiftsThisMonth)}
          icon="📅"
        />
        <StatCard
          label="Completados este mes"
          value={String(metrics.completedShiftsMonth)}
          icon="✅"
        />
        <StatCard label="GMV mes" value={formatEUR(metrics.gmvMonth)} icon="💶" />
        <StatCard
          label="Comisiones mes"
          value={formatEUR(metrics.commissionMonth)}
          icon="🐝"
        />
      </section>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold">GMV mensual</h2>

        <SimpleBarChart
          data={metrics.monthlyGmv.map((item: any) => ({
            label: item.label,
            value: item.gmv,
          }))}
          formatValue={formatEUR}
        />
      </Card>
    </div>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [role, setRole] = useState('');
  const [verification, setVerification] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetUsersAction({
      role: role ? (role as 'worker' | 'employer') : undefined,
      verification: verification
        ? (verification as 'pending' | 'approved' | 'rejected')
        : undefined,
      search,
      page,
      pageSize: 20,
    });

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setUsers(result.data.users);
    setTotal(result.data.total);
    setLoading(false);
  }, [role, verification, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVerify = async (userId: string, status: 'approved' | 'rejected') => {
    await adminSetVerificationAction({ userId, status });
    await load();
  };

  const handleSuspend = async (userId: string, suspended: boolean) => {
    await adminSetSuspensionAction({ userId, suspended });
    await load();
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-4 md:grid-cols-4">
        <Input
          label="Buscar"
          placeholder="Nombre, email, teléfono"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />

        <Select
          label="Rol"
          value={role}
          onChange={e => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos</option>
          <option value="worker">Workers</option>
          <option value="employer">Employers</option>
        </Select>

        <Select
          label="Verificación"
          value={verification}
          onChange={e => {
            setVerification(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
        </Select>

        <div className="flex items-end">
          <Button className="w-full" onClick={load}>
            Filtrar
          </Button>
        </div>
      </Card>

      {loading && <FullLoader />}
      {!loading && error && <ErrorState message={error} retry={load} />}

      {!loading && !error && (
        <>
          <div className="space-y-3">
            {users.map(user => (
              <Card key={user.id} className="space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold">
                      {user.full_name || user.email || user.id}
                    </p>
                    <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                      {user.email} · {user.role}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="muted">{user.verification_status}</Badge>
                      {user.is_suspended && <Badge variant="danger">Suspendido</Badge>}
                      {user.delete_requested_at && (
                        <Badge variant="danger">Borrado solicitado</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleVerify(user.id, 'approved')}
                    >
                      Aprobar
                    </Button>

                    <Button
                      variant="danger"
                      onClick={() => handleVerify(user.id, 'rejected')}
                    >
                      Rechazar
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => handleSuspend(user.id, !user.is_suspended)}
                    >
                      {user.is_suspended ? 'Reactivar' : 'Suspender'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>

            <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              {total} usuarios · página {page + 1}
            </span>

            <Button
              variant="secondary"
              disabled={(page + 1) * 20 >= total}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AdminVerification() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetPendingDocumentsAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDocs(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (
    documentId: string,
    status: 'approved' | 'rejected'
  ) => {
    await adminReviewDocumentAction({ documentId, status });
    await load();
  };

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <Card>
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            No hay documentos pendientes de revisión.
          </p>
        </Card>
      ) : (
        docs.map(doc => (
          <Card key={doc.id} className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold">{doc.doc_type}</p>
                <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                  {doc.users?.full_name || doc.users?.email || doc.user_id}
                </p>
                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  {formatDateTime(doc.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline">Ver documento</Button>
                  </a>
                )}

                <Button onClick={() => handleReview(doc.id, 'approved')}>
                  Aprobar
                </Button>

                <Button variant="danger" onClick={() => handleReview(doc.id, 'rejected')}>
                  Rechazar
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await adminGetDisputesAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDisputes(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (disputeId: string, status: 'resolved' | 'closed') => {
    await adminResolveDisputeAction({ disputeId, status });
    await load();
  };

  if (loading) return <FullLoader />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div className="space-y-4">
      {disputes.length === 0 ? (
        <Card>
          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
            No hay disputas abiertas.
          </p>
        </Card>
      ) : (
        disputes.map(dispute => (
          <Card key={dispute.id} className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="font-bold">Reporte</p>
                <p className="text-sm text-[#1A1A1A] dark:text-neutral-200">
                  {dispute.reason}
                </p>

                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  Reporter: {dispute.reporter?.full_name || dispute.reporter?.email}
                </p>

                <p className="text-xs text-[#8B8B8B] dark:text-neutral-500">
                  Reported: {dispute.reported?.full_name || dispute.reported?.email}
                </p>

                <div className="mt-2">
                  <Badge
                    variant={
                      dispute.status === 'open'
                        ? 'warning'
                        : dispute.status === 'resolved'
                          ? 'success'
                          : 'muted'
                    }
                  >
                    {dispute.status}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handleResolve(dispute.id, 'resolved')}>
                  Marcar resuelta
                </Button>

                <Button variant="secondary" onClick={() => handleResolve(dispute.id, 'closed')}>
                  Cerrar
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
```

---

# 15. Landing pública

## `src/app/page.tsx`

```tsx
import { LandingPage } from '@/components/landing/LandingPage';

export default function Home() {
  return <LandingPage />;
}
```

---

## `src/components/landing/LandingPage.tsx`

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

const faqs = [
  {
    q: '¿Bee Workers es mi empleador?',
    a: 'No. Bee Workers es una plataforma de colocación. Los workers son autónomos y facturan directamente al empleador.',
  },
  {
    q: '¿Qué comisión cobra Bee Workers?',
    a: 'La plataforma cobra una comisión del 5% sobre el bruto del servicio.',
  },
  {
    q: '¿Bee Workers retiene IRS o Segurança Social?',
    a: 'No. La plataforma no retiene impuestos. El worker es responsable de declarar y pagar IRS y Segurança Social.',
  },
  {
    q: '¿Necesito seguro de accidentes de trabajo?',
    a: 'Sí. En Portugal, los trabalhadores independentes deben tener seguro de acidentes de trabajo vigente.',
  },
  {
    q: '¿Cuándo puedo cobrar IVA?',
    a: 'Si facturas menos de 15.000€ al año, normalmente puedes acogerte a exención de IVA. La app te ayuda a trackear ese límite.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-neutral-900">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-bold text-[#1A1A1A] dark:text-neutral-100">{q}</span>
        <span className="text-[#FFB800]">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <p className="mt-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
          {a}
        </p>
      )}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#FFFAF0]/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-black text-[#1A1A1A] dark:text-neutral-100">
            Bee<span className="text-[#FFB800]">Workers</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button>Registro</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hex-pattern">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex rounded-full bg-[#FFB800]/15 px-4 py-2 text-sm font-semibold text-[#1A1A1A] dark:text-[#FFB800]">
              Porto · Hostelería y restauración
            </div>

            <h1 className="text-5xl font-black leading-tight text-[#1A1A1A] dark:text-neutral-100 md:text-6xl">
              Be a Worker.
              <br />
              <span className="text-[#FFB800]">Bee a Worker.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-[#8B8B8B] dark:text-neutral-400">
              Conectamos trabajadores autónomos con empleadores de hostelería para
              turnos puntuales y temporales. Simple, verificado y con geolocalización.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register">
                <Button className="w-full px-8 py-4 text-base sm:w-auto">
                  Empezar ahora
                </Button>
              </Link>

              <Link href="#how">
                <Button variant="outline" className="w-full px-8 py-4 text-base sm:w-auto">
                  Cómo funciona
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
          Cómo funciona
        </h2>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4">
            <h3 className="text-xl font-bold">Para Workers</h3>

            <ul className="space-y-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              <li>1. Regístrate como trabalhador independente.</li>
              <li>2. Sube tus documentos y verifica tu perfil.</li>
              <li>3. Descubre turnos cerca de ti.</li>
              <li>4. Aplica y propón tu precio si el turno no lo fija.</li>
              <li>5. Haz check-in, completa el turno y valora.</li>
            </ul>

            <Link href="/register">
              <Button variant="secondary">Quiero ser worker</Button>
            </Link>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-xl font-bold">Para Employers</h3>

            <ul className="space-y-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              <li>1. Crea el perfil de tu empresa.</li>
              <li>2. Publica turnos con fecha, hora y profesión.</li>
              <li>3. Recibe aplicaciones de workers verificados.</li>
              <li>4. Acepta al profesional adecuado.</li>
              <li>5. Gestiona check-in/check-out y valora.</li>
            </ul>

            <Link href="/register">
              <Button variant="secondary">Quiero publicar turnos</Button>
            </Link>
          </Card>
        </div>
      </section>

      {/* Beneficios */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
          Beneficios clave
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Card>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB800]/15 text-xl">
              🔄
            </div>
            <h3 className="text-lg font-bold">Bidireccional</h3>
            <p className="mt-2 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              Workers y employers se valoran mutuamente. La confianza se construye en
              ambas direcciones.
            </p>
          </Card>

          <Card>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB800]/15 text-xl">
              📍
            </div>
            <h3 className="text-lg font-bold">Geolocalización</h3>
            <p className="mt-2 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              Encuentra turnos cercanos y haz check-in con verificación de ubicación.
            </p>
          </Card>

          <Card>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFB800]/15 text-xl">
              ✅
            </div>
            <h3 className="text-lg font-bold">Perfiles verificados</h3>
            <p className="mt-2 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              NIF, actividad abierta y seguro de accidentes revisados para mayor
              seguridad.
            </p>
          </Card>
        </div>
      </section>

      {/* Testimonios */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
          Testimonios
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Card>
            <p className="text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              “Encontré turnos cerca de casa y pude gestionar todo desde el móvil.”
            </p>
            <p className="mt-4 font-bold">— Worker placeholder</p>
          </Card>

          <Card>
            <p className="text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              “Publicamos un turno y en poco tiempo teníamos aplicaciones válidas.”
            </p>
            <p className="mt-4 font-bold">— Employer placeholder</p>
          </Card>

          <Card>
            <p className="text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              “La estimación de neto me ayuda a entender mis ingresos como autónomo.”
            </p>
            <p className="mt-4 font-bold">— Worker placeholder</p>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
          Preguntas frecuentes
        </h2>

        <div className="mt-8 space-y-4">
          {faqs.map(faq => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-3xl bg-[#1A1A1A] p-10 text-center text-white">
          <h2 className="text-3xl font-black">
            Empieza a trabajar o a contratar hoy
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-white/70">
            Crea tu cuenta y forma parte de la colmena de hostelería en Porto.
          </p>

          <div className="mt-8 flex justify-center">
            <Link href="/register">
              <Button className="px-8 py-4 text-base">Crear cuenta</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 bg-white py-10 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-black">
                Bee<span className="text-[#FFB800]">Workers</span>
              </p>
              <p className="mt-2 text-sm text-[#8B8B8B] dark:text-neutral-400">
                Marketplace de turnos en Porto.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-[#8B8B8B] dark:text-neutral-400">
              <Link href="/legal/terms" className="hover:text-[#1A1A1A] dark:hover:text-neutral-100">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-[#1A1A1A] dark:hover:text-neutral-100">
                Privacy
              </Link>
              <Link href="/contact" className="hover:text-[#1A1A1A] dark:hover:text-neutral-100">
                Contacto
              </Link>
            </div>
          </div>

          <p className="mt-8 text-xs text-[#8B8B8B] dark:text-neutral-500">
            Bee Workers no es empleador. Los workers son trabajadores independientes y
            son responsables de sus obligaciones fiscales.
          </p>
        </div>
      </footer>
    </div>
  );
}
```

---

# 16. Protección de rutas Admin y suspensión

Actualiza tu middleware para proteger `/admin` y cuentas suspendidas.

## `src/lib/supabase/middleware.ts`

Añadir este bloque dentro de `updateSession`, después de obtener `user`.

```ts
// Dentro de updateSession, después de obtener user
if (pathname.startsWith('/admin')) {
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const admin = createAdminClient();

  const { data: adminUser } = await admin
    .from('users')
    .select('is_admin, is_suspended')
    .eq('id', user.id)
    .maybeSingle();

  if (!adminUser?.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = '/app/worker';
    return NextResponse.redirect(url);
  }

  return response;
}

if (user && pathname.startsWith('/app')) {
  const admin = createAdminClient();

  const { data: appUser } = await admin
    .from('users')
    .select('is_suspended, delete_requested_at')
    .eq('id', user.id)
    .maybeSingle();

  if (appUser?.is_suspended) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}
```

Import necesario:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
```

---

# 17. Resumen funcional implementado

## Worker

- Dashboard con:
  - turnos esta semana
  - ingresos del mes
  - rating
  - disponibilidad
  - gráfico de ingresos mensual
  - próximos turnos
  - cancelación si faltan >24h
  - historial paginado
  - tracking IVA con alerta de límite

## Employer

- Dashboard con:
  - turnos activos
  - workers contratados este mes
  - rating empresa
  - gasto mensual
  - gráfico de uso mensual
  - lista de turnos publicados
  - workers favoritos

## Perfil público Worker

- Foto
- Nombre
- Profesiones
- Skills
- Rating con privacidad hasta 3 valoraciones
- Total trabajos
- Badges de verificación
- Comentarios sin nombre del employer
- Favorito para employer
- Reporte/disputa

## Perfil público Employer

- Logo
- Nombre empresa
- Dirección
- Rating con privacidad hasta 3 valoraciones
- Total turnos
- Badge NIF empresa
- Comentarios sin nombre del worker
- Reporte/disputa

## Configuración

- Editar datos
- Cambiar foto/logo
- Toggles de notificaciones
- Idioma PT/ES/EN
- Dark mode
- Eliminación de cuenta con gracia 30 días

## Admin

- Solo rol `is_admin`
- Métricas:
  - usuarios
  - pendientes verificación
  - activos 30d
  - turnos/mes
  - GMV
  - comisiones
- Gestión de usuarios:
  - filtros
  - búsqueda
  - aprobar/rechazar
  - suspender
- KYC:
  - documentos pendientes
  - URLs firmadas
  - aprobación/rechazo
- Disputas:
  - listados
  - resolución/cierre

## Landing

- Hero
- Cómo funciona
- Beneficios
- Testimonios placeholder
- FAQ
- Footer legal

---

# 18. Notas legales importantes

La UI y los flujos respetan:

- Bee Workers no es empleador.
- Worker factura directamente al employer.
- Comisión visible: 5%.
- No hay fijación de precio por plataforma.
- Worker puede proponer precio.
- No hay penalización por rechazo.
- IRS y SS son responsabilidad del worker.
- Las estimaciones son orientativas.
- Seguro de accidentes obligatorio.
- Tracking de IVA €15.000.

---

Con esto queda implementada la capa completa de dashboards, perfiles, admin y landing para Bee Workers en Next.js 14 + Supabase, con diseño mobile-first, dark mode, charts ligeros y componentes reutilizables.