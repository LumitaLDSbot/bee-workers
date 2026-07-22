# Implementación core Bee Workers


Este bloque implementa el núcleo del marketplace:


- Publicación de turnos por employer
- Feed cercano para worker
- Aplicaciones con propuesta de precio
- Aceptación/rechazo por employer
- Check-in/check-out con geolocalización
- Ratings bidireccionales
- Notificaciones Realtime
- Cálculo de neto orientativo con comisión 5%


> Asumo que ya tienes el sistema de auth/onboarding y las tablas base del proyecto anterior.  
> A continuación añado la migración SQL necesaria para este core.


---


# 1. Migración SQL core


Ejecutar en Supabase SQL Editor.


```sql
-- =====================================================
-- Bee Workers Core
-- Shifts, applications, check-in, ratings, payments, notifications
-- =====================================================


-- Campos adicionales en shifts
alter table public.shifts
  add column if not exists slots_needed integer not null default 1;


alter table public.shifts
  alter column hourly_rate_offer drop not null;


do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shifts_slots_needed_check'
  ) then
    alter table public.shifts
      add constraint shifts_slots_needed_check
      check (slots_needed between 1 and 20);
  end if;
end
$$;


-- Mensaje opcional en aplicaciones
alter table public.shift_applications
  add column if not exists message text;


-- Payments por shift + worker (no solo por shift)
alter table public.payments
  drop constraint if exists payments_shift_id_key;


drop index if exists public.payments_shift_id_key;


create unique index if not exists payments_shift_worker_unique
  on public.payments (shift_id, worker_id);


alter table public.payments
  add column if not exists hours numeric,
  add column if not exists hourly_rate numeric,
  add column if not exists net_before_taxes numeric,
  add column if not exists irs_taxable_base numeric,
  add column if not exists irs_estimate numeric,
  add column if not exists social_security_base numeric,
  add column if not exists social_security_estimate numeric,
  add column if not exists social_security_exempt boolean;


alter table public.payments
  alter column commission_rate set default 0.05;


-- Check-out también guarda ubicación
alter table public.shift_checkins
  add column if not exists check_out_lat double precision,
  add column if not exists check_out_lng double precision;


-- Ratings: permitir que un employer valore a varios workers en el mismo shift
alter table public.ratings
  drop constraint if exists ratings_unique_rater_per_shift;


do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_unique_rater_ratee'
  ) then
    alter table public.ratings
      add constraint ratings_unique_rater_ratee
      unique (shift_id, rater_id, ratee_id);
  end if;
end
$$;


-- Radio de trabajo para workers (si no existe)
alter table public.worker_profiles
  add column if not exists work_radius_km integer;


-- Pending ratings
create table if not exists public.pending_ratings (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  rater_id uuid not null references public.users(id) on delete cascade,
  ratee_id uuid not null references public.users(id) on delete cascade,
  type public.rating_type not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,


  unique (shift_id, rater_id, ratee_id, type),
  constraint pending_ratings_status_check check (status in ('pending', 'done'))
);


alter table public.pending_ratings enable row level security;


drop policy if exists pending_ratings_select_involved on public.pending_ratings;
create policy pending_ratings_select_involved
  on public.pending_ratings
  for select
  to authenticated
  using (
    rater_id = auth.uid()
    or ratee_id = auth.uid()
  );


-- =====================================================
-- Función: calculate_worker_net_core
-- Comisión 5%
-- IRS estimado: 23% sobre 75% del bruto
-- SS estimado: 21.4% sobre 70% del bruto, con exención 12 meses
-- =====================================================


create or replace function public.calculate_worker_net_core(
  p_gross numeric,
  p_worker_id uuid
)
returns table (
  gross numeric,
  commission_rate numeric,
  commission numeric,
  net_before_taxes numeric,
  irs_taxable_base numeric,
  irs_rate numeric,
  irs_estimate numeric,
  social_security_base numeric,
  social_security_rate numeric,
  social_security_exempt boolean,
  social_security_estimate numeric,
  total_tax_estimate numeric,
  net_after_taxes numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross numeric := round(coalesce(p_gross, 0), 2);
  v_commission_rate numeric := 0.05;
  v_commission numeric;
  v_net_before_taxes numeric;


  v_irs_rate numeric := 0.23;
  v_irs_taxable_base numeric;
  v_irs_estimate numeric;


  v_ss_rate numeric := 0.214;
  v_ss_base numeric;
  v_ss_exempt boolean := false;
  v_ss_estimate numeric;


  v_total_tax_estimate numeric;
  v_net_after_taxes numeric;


  v_first_activity date;
  v_manual_exempt boolean;
begin
  -- Autorización: propio worker, service_role o admin DB
  if p_worker_id is not null
     and auth.uid() is distinct from p_worker_id
     and coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'No autorizado para calcular el neto de otro trabajador'
      using errcode = 'insufficient_privilege';
  end if;


  v_commission := round(v_gross * v_commission_rate, 2);
  v_net_before_taxes := round(v_gross - v_commission, 2);


  -- IRS categoría B: base simplificada 75%
  v_irs_taxable_base := round(v_gross * 0.75, 2);
  v_irs_estimate := round(v_irs_taxable_base * v_irs_rate, 2);


  -- Segurança Social: base 70%
  v_ss_base := round(v_gross * 0.70, 2);


  if p_worker_id is not null then
    select
      coalesce(wp.first_activity_at, wp.created_at::date),
      coalesce(wp.is_social_security_exempt, false)
    into v_first_activity, v_manual_exempt
    from public.worker_profiles wp
    where wp.user_id = p_worker_id;


    if found then
      v_ss_exempt := v_manual_exempt
        or (v_first_activity + interval '12 months') > now();
    end if;
  end if;


  if v_ss_exempt then
    v_ss_estimate := 0.00;
  else
    v_ss_estimate := round(v_ss_base * v_ss_rate, 2);
  end if;


  v_total_tax_estimate := round(v_irs_estimate + v_ss_estimate, 2);
  v_net_after_taxes := round(v_net_before_taxes - v_total_tax_estimate, 2);


  return query
  select
    v_gross,
    v_commission_rate,
    v_commission,
    v_net_before_taxes,
    v_irs_taxable_base,
    v_irs_rate,
    v_irs_estimate,
    v_ss_base,
    v_ss_rate,
    v_ss_exempt,
    v_ss_estimate,
    v_total_tax_estimate,
    v_net_after_taxes;
end;
$$;


-- =====================================================
-- Función pública: calculate_worker_net(hourly_rate, hours, worker_id)
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
  net_before_taxes numeric,
  irs_taxable_base numeric,
  irs_rate numeric,
  irs_estimate numeric,
  social_security_base numeric,
  social_security_rate numeric,
  social_security_exempt boolean,
  social_security_estimate numeric,
  total_tax_estimate numeric,
  net_after_taxes numeric
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


-- =====================================================
-- Función: get_nearby_shifts
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
  slots_needed integer,
  accepted_count bigint,
  remaining_slots bigint,
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
    s.slots_needed,
    coalesce(ac.accepted_count, 0) as accepted_count,
    greatest(s.slots_needed - coalesce(ac.accepted_count, 0), 0) as remaining_slots,
    round(
      (
        st_distance(
          st_setsrid(st_makepoint(worker_lng, worker_lat), 4326)::geography,
          s.geog
        ) / 1000.0
      )::numeric,
      2
    ) as distance_km
  from public.shifts s
  left join lateral (
    select count(*)::bigint as accepted_count
    from public.shift_applications sa
    where sa.shift_id = s.id
      and sa.status = 'accepted'
  ) ac on true
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


-- =====================================================
-- Notificaciones a workers cercanos
-- =====================================================


create or replace function public.notify_nearby_workers(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data
  )
  select
    wp.user_id,
    'new_shift_nearby',
    'Nuevo turno cerca de ti',
    coalesce(s.profession_required, 'Turno') || ' en ' || coalesce(s.location, 'Porto'),
    jsonb_build_object(
      'shiftId', s.id,
      'profession', s.profession_required
    )
  from public.shifts s
  join public.worker_profiles wp on wp.user_id <> s.employer_id
  where s.id = p_shift_id
    and s.status = 'published'
    and s.geog is not null
    and wp.geog is not null
    and wp.is_autonomo = true
    and wp.seguro_vigente = true
    and s.profession_required = any(wp.professions)
    and st_dwithin(
      s.geog,
      wp.geog,
      (coalesce(wp.work_radius_km, 10) * 1000.0)::float8
    )
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = wp.user_id
        and n.type = 'new_shift_nearby'
        and n.data->>'shiftId' = s.id::text
    )
  limit 200;
end;
$$;


create or replace function public.shifts_after_publish_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'published')
     or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'published') then
    perform public.notify_nearby_workers(new.id);
  end if;


  return new;
end;
$$;


create or replace trigger shifts_after_publish_notify
  after insert or update on public.shifts
  for each row execute function public.shifts_after_publish_notify();


-- =====================================================
-- Aplicaciones: límite de aceptación según slots_needed
-- =====================================================


create or replace function public.shift_applications_accept_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slots_needed integer;
  v_accepted_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select s.slots_needed
    into v_slots_needed
    from public.shifts s
    where s.id = new.shift_id;


    select count(*)::integer
    into v_accepted_count
    from public.shift_applications sa
    where sa.shift_id = new.shift_id
      and sa.status = 'accepted'
      and sa.id <> new.id;


    if v_accepted_count >= coalesce(v_slots_needed, 1) then
      raise exception 'Este turno ya ha cubierto todas las vacantes disponibles';
    end if;
  end if;


  return new;
end;
$$;


create or replace trigger shift_applications_accept_limit
  before update on public.shift_applications
  for each row execute function public.shift_applications_accept_limit();


-- =====================================================
-- Aplicaciones: notificaciones + estado del shift
-- =====================================================


create or replace function public.shift_applications_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer_id uuid;
  v_shift public.shifts%rowtype;
begin
  select s.*
  into v_shift
  from public.shifts s
  where s.id = coalesce(new.shift_id, old.shift_id);


  if not found then
    return coalesce(new, old);
  end if;


  v_employer_id := v_shift.employer_id;


  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_employer_id,
      'new_application',
      'Nueva aplicación recibida',
      'Un trabajador ha aplicado a tu turno.',
      jsonb_build_object(
        'shiftId', new.shift_id,
        'applicationId', new.id,
        'workerId', new.worker_id
      )
    );


    return new;
  end if;


  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status = 'accepted' then
        insert into public.notifications (user_id, type, title, body, data)
        values (
          new.worker_id,
          'application_accepted',
          '¡Aplicación aceptada!',
          'Tu aplicación fue aceptada. Revisa los detalles del turno.',
          jsonb_build_object('shiftId', new.shift_id, 'applicationId', new.id)
        );


        update public.shifts
        set status = 'assigned', updated_at = now()
        where id = new.shift_id
          and status in ('published', 'draft');
      end if;


      if new.status in ('rejected', 'cancelled') then
        insert into public.notifications (user_id, type, title, body, data)
        values (
          new.worker_id,
          'application_rejected',
          'Aplicación no aceptada',
          'Tu aplicación no fue aceptada en esta ocasión.',
          jsonb_build_object('shiftId', new.shift_id, 'applicationId', new.id)
        );
      end if;


      if old.status = 'accepted' and new.status in ('rejected', 'withdrawn', 'cancelled') then
        if not exists (
          select 1
          from public.shift_applications sa
          where sa.shift_id = new.shift_id
            and sa.status = 'accepted'
        ) then
          update public.shifts
          set status = 'published', updated_at = now()
          where id = new.shift_id
            and status = 'assigned';
        end if;
      end if;
    end if;


    return new;
  end if;


  return coalesce(new, old);
end;
$$;


create or replace trigger shift_applications_after_write
  after insert or update on public.shift_applications
  for each row execute function public.shift_applications_after_write();


-- =====================================================
-- Check-in / Check-out
-- Validación geográfica y temporal
-- =====================================================


create or replace function public.shift_checkins_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_accepted boolean;
  v_distance numeric;
begin
  if tg_op = 'INSERT' then
    select s.*
    into v_shift
    from public.shifts s
    where s.id = new.shift_id;


    if not found then
      raise exception 'Turno no encontrado';
    end if;


    select exists (
      select 1
      from public.shift_applications sa
      where sa.shift_id = new.shift_id
        and sa.worker_id = new.worker_id
        and sa.status = 'accepted'
    )
    into v_accepted;


    if not v_accepted then
      raise exception 'Solo puedes hacer check-in si tu aplicación fue aceptada';
    end if;


    if new.check_in_at < (v_shift.starts_at - interval '15 minutes') then
      raise exception 'El check-in solo está disponible desde 15 minutos antes del inicio del turno';
    end if;


    if new.check_in_at > (v_shift.ends_at + interval '2 hours') then
      raise exception 'El turno ya ha finalizado o el check-in está fuera de plazo';
    end if;


    if v_shift.latitude is null or v_shift.longitude is null then
      raise exception 'El turno no tiene ubicación configurada';
    end if;


    if new.lat is null or new.lng is null then
      raise exception 'No se pudo obtener tu ubicación';
    end if;


    v_distance := public.st_distancesphere(
      public.st_setsrid(public.st_makepoint(new.lng, new.lat), 4326),
      public.st_setsrid(public.st_makepoint(v_shift.longitude, v_shift.latitude), 4326)
    );


    new.distance_meters := v_distance;


    if v_distance > 100 then
      raise exception 'Estás demasiado lejos del lugar del turno. Debes estar a menos de 100 metros.';
    end if;


    return new;
  end if;


  if tg_op = 'UPDATE' then
    if new.check_out_at is not null and old.check_out_at is null then
      if new.check_out_at < new.check_in_at then
        raise exception 'El check-out no puede ser anterior al check-in';
      end if;
    end if;


    -- Permitir updates internos/service role
    if auth.uid() is null or pg_trigger_depth() > 0 then
      return new;
    end if;


    if new.id <> old.id
       or new.shift_id <> old.shift_id
       or new.worker_id <> old.worker_id
       or new.check_in_at <> old.check_in_at then
      raise exception 'No puedes modificar campos críticos del check-in';
    end if;


    return new;
  end if;


  return coalesce(new, old);
end;
$$;


create or replace trigger shift_checkins_before_write
  before insert or update on public.shift_checkins
  for each row execute function public.shift_checkins_before_write();


-- =====================================================
-- Recálculo de totales
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
    select count(*)
    from public.shift_checkins sc
    where sc.worker_id = p_worker_id
      and sc.check_out_at is not null
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
    select count(distinct sc.shift_id)
    from public.shift_checkins sc
    join public.shifts s on s.id = sc.shift_id
    where s.employer_id = p_employer_id
      and sc.check_out_at is not null
  )
  where ep.user_id = p_employer_id;
end;
$$;


-- =====================================================
-- Completar check-out:
-- crea payment, pending ratings y notificaciones
-- =====================================================


create or replace function public.complete_checkin(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin public.shift_checkins%rowtype;
  v_shift public.shifts%rowtype;
  v_application public.shift_applications%rowtype;
  v_hours numeric;
  v_rate numeric;
  v_gross numeric;
  v_calc record;
  v_payment_id uuid;
begin
  select c.*
  into v_checkin
  from public.shift_checkins c
  where c.id = p_checkin_id;


  if not found then
    return;
  end if;


  select s.*
  into v_shift
  from public.shifts s
  where s.id = v_checkin.shift_id;


  select sa.*
  into v_application
  from public.shift_applications sa
  where sa.shift_id = v_checkin.shift_id
    and sa.worker_id = v_checkin.worker_id
    and sa.status = 'accepted';


  if not found then
    return;
  end if;


  v_hours := greatest(
    extract(epoch from (coalesce(v_checkin.check_out_at, now()) - v_checkin.check_in_at)) / 3600.0,
    0
  );


  if v_hours = 0 then
    v_hours := greatest(
      extract(epoch from (v_shift.ends_at - v_shift.starts_at)) / 3600.0,
      0
    );
  end if;


  v_rate := coalesce(
    v_application.proposed_rate,
    v_shift.hourly_rate_offer,
    0
  );


  v_gross := round(v_rate * v_hours, 2);


  select *
  into v_calc
  from public.calculate_worker_net_core(v_gross, v_checkin.worker_id);


  insert into public.payments (
    shift_id,
    worker_id,
    gross,
    commission_rate,
    commission,
    net_to_worker,
    tax_estimate,
    worker_net_estimate,
    currency,
    status,
    hours,
    hourly_rate,
    net_before_taxes,
    irs_taxable_base,
    irs_estimate,
    social_security_base,
    social_security_estimate,
    social_security_exempt
  )
  values (
    v_checkin.shift_id,
    v_checkin.worker_id,
    v_calc.gross,
    v_calc.commission_rate,
    v_calc.commission,
    v_calc.net_before_taxes,
    v_calc.total_tax_estimate,
    v_calc.net_after_taxes,
    'EUR',
    'pending',
    v_hours,
    v_rate,
    v_calc.net_before_taxes,
    v_calc.irs_taxable_base,
    v_calc.irs_estimate,
    v_calc.social_security_base,
    v_calc.social_security_estimate,
    v_calc.social_security_exempt
  )
  on conflict (shift_id, worker_id) do nothing
  returning id into v_payment_id;


  -- Si ya existía payment, no duplicar notificaciones
  if v_payment_id is null then
    return;
  end if;


  -- Pending ratings
  insert into public.pending_ratings (shift_id, rater_id, ratee_id, type, status)
  values
    (v_checkin.shift_id, v_shift.employer_id, v_checkin.worker_id, 'employer_to_worker', 'pending'),
    (v_checkin.shift_id, v_checkin.worker_id, v_shift.employer_id, 'worker_to_employer', 'pending')
  on conflict (shift_id, rater_id, ratee_id, type) do nothing;


  -- Notificación worker: payment creado + rating pendiente
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_checkin.worker_id,
    'payment_created',
    'Pago registrado',
    'Hemos registrado el pago estimado de tu turno completado.',
    jsonb_build_object(
      'shiftId', v_checkin.shift_id,
      'paymentId', v_payment_id
    )
  );


  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_checkin.worker_id,
    'rating_pending',
    'Valora a la empresa',
    'Tu turno ha finalizado. Puedes valorar a la empresa.',
    jsonb_build_object(
      'shiftId', v_checkin.shift_id,
      'rateeId', v_shift.employer_id,
      'type', 'worker_to_employer'
    )
  );


  -- Notificación employer: check-out + rating pendiente
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_shift.employer_id,
    'worker_checked_out',
    'Worker finalizó el turno',
    'El trabajador ha hecho check-out correctamente.',
    jsonb_build_object(
      'shiftId', v_checkin.shift_id,
      'workerId', v_checkin.worker_id
    )
  );


  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_shift.employer_id,
    'rating_pending',
    'Valora al trabajador',
    'El turno ha finalizado. Puedes valorar al trabajador.',
    jsonb_build_object(
      'shiftId', v_checkin.shift_id,
      'rateeId', v_checkin.worker_id,
      'type', 'employer_to_worker'
    )
  );


  -- Marcar shift completed si todos los accepted hicieron checkout
  if not exists (
    select 1
    from public.shift_applications sa
    left join public.shift_checkins sc
      on sc.shift_id = sa.shift_id
     and sc.worker_id = sa.worker_id
    where sa.shift_id = v_checkin.shift_id
      and sa.status = 'accepted'
      and sc.check_out_at is null
  ) then
    update public.shifts
    set status = 'completed', updated_at = now()
    where id = v_checkin.shift_id
      and status in ('assigned', 'published');
  end if;


  perform public.recalc_worker_total_jobs(v_checkin.worker_id);
  perform public.recalc_employer_total_shifts(v_shift.employer_id);
end;
$$;


create or replace function public.shift_checkins_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
begin
  select s.*
  into v_shift
  from public.shifts s
  where s.id = coalesce(new.shift_id, old.shift_id);


  if not found then
    return coalesce(new, old);
  end if;


  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_shift.employer_id,
      'worker_checked_in',
      'Worker hizo check-in',
      'El trabajador ha iniciado el turno.',
      jsonb_build_object(
        'shiftId', new.shift_id,
        'workerId', new.worker_id,
        'distanceMeters', new.distance_meters
      )
    );


    return new;
  end if;


  if tg_op = 'UPDATE' then
    if old.check_out_at is null and new.check_out_at is not null then
      perform public.complete_checkin(new.id);
    end if;


    return new;
  end if;


  return coalesce(new, old);
end;
$$;


create or replace trigger shift_checkins_after_write
  after insert or update on public.shift_checkins
  for each row execute function public.shift_checkins_after_write();


-- =====================================================
-- Ratings: actualizar pending y promedios
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
  if tg_op = 'INSERT' then
    update public.pending_ratings pr
    set status = 'done', completed_at = now()
    where pr.shift_id = new.shift_id
      and pr.rater_id = new.rater_id
      and pr.ratee_id = new.ratee_id
      and pr.type = new.type
      and pr.status = 'pending';


    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.ratee_id,
      'new_rating',
      'Has recibido una valoración',
      'Alguien ha valorado tu perfil.',
      jsonb_build_object(
        'shiftId', new.shift_id,
        'ratingId', new.id
      )
    );


    perform public.recalc_rating_for_ratee(new.ratee_id, new.type);
    return new;
  end if;


  if tg_op = 'UPDATE' then
    perform public.recalc_rating_for_ratee(old.ratee_id, old.type);


    if old.ratee_id is distinct from new.ratee_id
       or old.type is distinct from new.type then
      perform public.recalc_rating_for_ratee(new.ratee_id, new.type);
    end if;


    return new;
  end if;


  if tg_op = 'DELETE' then
    perform public.recalc_rating_for_ratee(old.ratee_id, old.type);
    return old;
  end if;


  return coalesce(new, old);
end;
$$;


create or replace trigger ratings_after_write
  after insert or update or delete on public.ratings
  for each row execute function public.ratings_after_write();


-- =====================================================
-- Política de inserción de ratings:
-- solo si existe pending_rating
-- =====================================================


drop policy if exists ratings_insert_valid_completed_shift on public.ratings;


drop policy if exists ratings_insert_pending on public.ratings;
create policy ratings_insert_pending
  on public.ratings
  for insert
  to authenticated
  with check (
    rater_id = auth.uid()
    and exists (
      select 1
      from public.pending_ratings pr
      where pr.shift_id = ratings.shift_id
        and pr.rater_id = ratings.rater_id
        and pr.ratee_id = ratings.ratee_id
        and pr.type = ratings.type
        and pr.status = 'pending'
    )
  );


-- =====================================================
-- Realtime
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
      alter publication supabase_realtime add table public.shift_applications;
    exception when duplicate_object then
      null;
    end;


    begin
      alter publication supabase_realtime add table public.shift_checkins;
    exception when duplicate_object then
      null;
    end;


    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then
      null;
    end;


    begin
      alter publication supabase_realtime add table public.pending_ratings;
    exception when duplicate_object then
      null;
    end;
  end if;
end
$$;
```


---


# 2. Tipos TypeScript


## `src/types/core.ts`


```ts
export type ShiftStatus =
  | 'draft'
  | 'published'
  | 'assigned'
  | 'completed'
  | 'cancelled'
  | 'expired';


export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled';


export type RatingType = 'employer_to_worker' | 'worker_to_employer';


export interface Shift {
  id: string;
  employer_id: string;
  profession_required: string;
  description: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  starts_at: string;
  ends_at: string;
  hourly_rate_offer: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ShiftStatus;
  slots_needed: number;
  accepted_count?: number;
  remaining_slots?: number;
  distance_km?: number;
}


export interface WorkerProfile {
  user_id: string;
  full_name: string | null;
  professions: string[];
  skills: string[];
  hourly_rate: number;
  rating: number;
  rating_count: number;
  total_jobs: number;
  is_autonomo: boolean;
  seguro_vigente: boolean;
  work_radius_km: number | null;
  profile_photo_url?: string | null;
}


export interface EmployerProfile {
  user_id: string;
  company_name: string;
  nif_empresa: string | null;
  address: string | null;
  location: string | null;
  rating: number;
  rating_count: number;
  total_shifts: number;
  logo_url: string | null;
}


export interface Application {
  id: string;
  shift_id: string;
  worker_id: string;
  proposed_rate: number;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  worker_profiles?: WorkerProfile | null;
}


export interface Checkin {
  id: string;
  shift_id: string;
  worker_id: string;
  check_in_at: string;
  lat: number | null;
  lng: number | null;
  distance_meters: number | null;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
}


export interface PendingRating {
  id: string;
  shift_id: string;
  rater_id: string;
  ratee_id: string;
  type: RatingType;
  status: 'pending' | 'done';
  created_at: string;
  shifts?: Shift | null;
}


export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}


export interface NetBreakdownInput {
  hourlyRate: number;
  hours: number;
  ssExempt?: boolean;
}


export interface NetBreakdownResult {
  hourlyRate: number;
  hours: number;
  gross: number;
  commissionRate: number;
  commission: number;
  netBeforeTaxes: number;
  irsTaxableBase: number;
  irsRate: number;
  irsEstimate: number;
  ssBase: number;
  ssRate: number;
  ssExempt: boolean;
  ssEstimate: number;
  totalTaxEstimate: number;
  netAfterTaxes: number;
}
```


---


# 3. Constantes y utilidades


## `src/lib/constants.ts`


```ts
export const PLATFORM_COMMISSION_RATE = 0.05;


export const IRS_RATE = 0.23;
export const IRS_TAXABLE_BASE = 0.75;


export const SS_RATE = 0.214;
export const SS_TAXABLE_BASE = 0.70;


export const CHECKIN_RADIUS_METERS = 100;
export const CHECKIN_EARLY_MINUTES = 15;


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


export const FISCAL_DISCLAIMER =
  'Estimación orientativa. Bee Workers no retiene IRS ni Segurança Social. El pago de impuestos es responsabilidad exclusiva del worker.';
```


---


## `src/lib/utils/number.ts`


```ts
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}


export function formatEUR(value: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}
```


---


## `src/lib/utils/date.ts`


```ts
export function formatShiftDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}


export function formatHour(time: string): string {
  return time?.slice(0, 5) ?? '';
}


export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}


export function calculateShiftHours(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const hours = (end - start) / 3600000;
  return Math.max(hours, 0);
}


export function calculateHoursFromDateAndTime(
  date: string,
  startTime: string,
  endTime: string
): number {
  const start = new Date(`${date}T${startTime}`);
  let end = new Date(`${date}T${endTime}`);


  // Turno nocturno: si termina antes, se asume día siguiente
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }


  const hours = (end.getTime() - start.getTime()) / 3600000;
  return Math.max(hours, 0);
}
```


---


## `src/lib/utils/geo.ts`


```ts
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;


  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);


  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);


  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```


---


## `src/lib/utils/calc.ts`


```ts
import {
  PLATFORM_COMMISSION_RATE,
  IRS_RATE,
  IRS_TAXABLE_BASE,
  SS_RATE,
  SS_TAXABLE_BASE,
} from '@/lib/constants';
import { round2 } from '@/lib/utils/number';
import type { NetBreakdownInput, NetBreakdownResult } from '@/types/core';


export function calculateWorkerNet({
  hourlyRate,
  hours,
  ssExempt = false,
}: NetBreakdownInput): NetBreakdownResult {
  const gross = round2(hourlyRate * hours);
  const commission = round2(gross * PLATFORM_COMMISSION_RATE);
  const netBeforeTaxes = round2(gross - commission);


  const irsTaxableBase = round2(gross * IRS_TAXABLE_BASE);
  const irsEstimate = round2(irsTaxableBase * IRS_RATE);


  const ssBase = round2(gross * SS_TAXABLE_BASE);
  const ssEstimate = ssExempt ? 0 : round2(ssBase * SS_RATE);


  const totalTaxEstimate = round2(irsEstimate + ssEstimate);
  const netAfterTaxes = round2(netBeforeTaxes - totalTaxEstimate);


  return {
    hourlyRate,
    hours,
    gross,
    commissionRate: PLATFORM_COMMISSION_RATE,
    commission,
    netBeforeTaxes,
    irsTaxableBase,
    irsRate: IRS_RATE,
    irsEstimate,
    ssBase,
    ssRate: SS_RATE,
    ssExempt,
    ssEstimate,
    totalTaxEstimate,
    netAfterTaxes,
  };
}


export function calculateShiftCost(
  hourlyRate: number,
  hours: number,
  slots: number
): number {
  return round2(hourlyRate * hours * slots);
}
```


---


# 4. UI base reutilizable


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
      <p className="text-sm text-[#8B8B8B]">{label}</p>
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
    <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-center">
      <p className="text-sm text-red-700">{message}</p>
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
    <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F5F5F0] text-2xl">
        🐝
      </div>
      <h3 className="text-lg font-bold text-[#1A1A1A]">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-xs text-sm text-[#8B8B8B]">
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
        'rounded-3xl border border-black/5 bg-white p-4 shadow-sm',
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
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const styles = {
    default: 'bg-[#FFB800]/15 text-[#1A1A1A]',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    muted: 'bg-[#F5F5F0] text-[#8B8B8B]',
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
          'bg-[#FFB800] text-[#1A1A1A] hover:bg-[#E0A800] shadow-sm',
        variant === 'secondary' && 'bg-[#F5F5F0] text-[#1A1A1A] hover:bg-black/5',
        variant === 'ghost' && 'bg-transparent text-[#1A1A1A] hover:bg-black/5',
        variant === 'danger' && 'bg-red-100 text-red-700 hover:bg-red-200',
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
        <label className="block text-sm font-medium text-[#1A1A1A]">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B]',
          'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs text-[#8B8B8B]">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
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
        <label className="block text-sm font-medium text-[#1A1A1A]">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition placeholder:text-[#8B8B8B]',
          'focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
          error && 'border-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
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
        <label className="block text-sm font-medium text-[#1A1A1A]">
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#FFB800] focus:ring-2 focus:ring-[#FFB800]/25',
          error && 'border-red-400',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#FFFAF0] p-5 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1A1A1A]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-[#F5F5F0] px-3 py-1 text-sm font-bold text-[#1A1A1A]"
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
            star <= value ? 'text-[#FFB800]' : 'text-black/15',
            onChange && 'transition hover:scale-110'
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```


---


# 5. Hooks de geolocalización


## `src/hooks/useGeolocation.ts`


```ts
'use client';


import { useCallback, useState } from 'react';


interface Position {
  lat: number;
  lng: number;
  accuracy?: number;
}


export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);


  const requestPosition = useCallback(async (): Promise<Position> => {
    setLoading(true);
    setError(null);


    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'Tu navegador no soporta geolocalización.';
      setError(message);
      setLoading(false);
      throw new Error(message);
    }


    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const nextPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };


          setPosition(nextPosition);
          setLoading(false);
          resolve(nextPosition);
        },
        err => {
          let message = 'No pudimos obtener tu ubicación.';


          if (err.code === err.PERMISSION_DENIED) {
            message =
              'Permiso de ubicación denegado. Actívalo para ver turnos cercanos.';
          }


          if (err.code === err.POSITION_UNAVAILABLE) {
            message = 'Ubicación no disponible. Inténtalo de nuevo.';
          }


          if (err.code === err.TIMEOUT) {
            message = 'Tiempo de espera agotado al obtener ubicación.';
          }


          setError(message);
          setLoading(false);
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    });
  }, []);


  return {
    loading,
    error,
    position,
    requestPosition,
  };
}
```


---


# 6. Hooks principales


## `src/hooks/useShifts.ts`


```ts
'use client';


import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { Shift, EmployerProfile, Checkin, Application } from '@/types/core';


export interface ShiftFilters {
  profession: string;
  maxKm: number;
  date: string;
  minPrice: number;
}


export function useNearbyShifts(filters: ShiftFilters) {
  const supabase = createClient();
  const geo = useGeolocation();


  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const positionRef = useRef<{ lat: number; lng: number } | null>(null);


  const fetchShifts = useCallback(
    async (pos: { lat: number; lng: number }) => {
      const { data, error } = await supabase.rpc('get_nearby_shifts', {
        worker_lat: pos.lat,
        worker_lng: pos.lng,
        max_km: filters.maxKm,
        profession: filters.profession || null,
      });


      if (error) {
        throw new Error('No pudimos cargar los turnos cercanos.');
      }


      const normalized = (data ?? []) as Shift[];


      const filtered = normalized.filter(shift => {
        if (filters.date && shift.shift_date !== filters.date) return false;


        if (filters.minPrice > 0) {
          const price = shift.hourly_rate_offer ?? 0;
          if (price < filters.minPrice) return false;
        }


        return true;
      });


      setShifts(filtered);
    },
    [filters.maxKm, filters.profession, filters.date, filters.minPrice, supabase]
  );


  const refresh = useCallback(async () => {
    if (!positionRef.current) {
      const pos = await geo.requestPosition();
      positionRef.current = pos;
      await fetchShifts(pos);
      return;
    }


    await fetchShifts(positionRef.current);
  }, [fetchShifts, geo]);


  useEffect(() => {
    let active = true;


    async function init() {
      setLoading(true);
      setError(null);


      try {
        const pos = geo.position ?? (await geo.requestPosition());
        if (!active) return;


        positionRef.current = pos;
        await fetchShifts(pos);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Error al cargar turnos.');
      } finally {
        if (active) setLoading(false);
      }
    }


    init();


    return () => {
      active = false;
    };
  }, [fetchShifts, geo.position, geo.requestPosition]);


  // Realtime: nuevos shifts publicados
  useEffect(() => {
    const channel = supabase
      .channel('nearby-shifts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: 'status=eq.published',
        },
        async () => {
          if (positionRef.current) {
            await fetchShifts(positionRef.current);
          }
        }
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchShifts, supabase]);


  return {
    shifts,
    loading,
    error,
    refresh,
    geo,
  };
}


export function useMyPublishedShifts() {
  const supabase = createClient();


  const [shifts, setShifts] = useState<
    Array<Shift & { application_count: number; accepted_count: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) throw new Error('Debes iniciar sesión.');


      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('employer_id', user.id)
        .order('starts_at', { ascending: false });


      if (shiftsError) throw new Error('No pudimos cargar tus turnos.');


      const ids = (shiftsData ?? []).map(s => s.id);


      let applications: Array<{ shift_id: string; status: string }> = [];


      if (ids.length > 0) {
        const { data: appsData } = await supabase
          .from('shift_applications')
          .select('shift_id,status')
          .in('shift_id', ids);


        applications = appsData ?? [];
      }


      const enriched = (shiftsData ?? []).map(shift => {
        const shiftApps = applications.filter(app => app.shift_id === shift.id);
        const accepted = shiftApps.filter(app => app.status === 'accepted').length;


        return {
          ...(shift as Shift),
          application_count: shiftApps.length,
          accepted_count: accepted,
        };
      });


      setShifts(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar turnos.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);


  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);


  // Realtime: cambios en shifts del employer
  useEffect(() => {
    let userId: string | null = null;


    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) return;
      userId = user.id;


      const channel = supabase
        .channel(`employer-shifts-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shifts',
            filter: `employer_id=eq.${user.id}`,
          },
          () => fetchShifts()
        )
        .subscribe();


      return channel;
    }


    let channelPromise = setup();


    return () => {
      channelPromise.then(channel => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [fetchShifts, supabase]);


  return { shifts, loading, error, refresh: fetchShifts };
}


export function useShiftDetail(shiftId: string) {
  const supabase = createClient();


  const [shift, setShift] = useState<Shift | null>(null);
  const [employer, setEmployer] = useState<EmployerProfile | null>(null);
  const [myApplication, setMyApplication] = useState<Application | null>(null);
  const [myCheckin, setMyCheckin] = useState<Checkin | null>(null);


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', shiftId)
        .maybeSingle();


      if (shiftError) throw new Error('No pudimos cargar el turno.');
      if (!shiftData) throw new Error('Turno no encontrado.');


      setShift(shiftData as Shift);


      const { data: employerData } = await supabase
        .from('employer_profiles')
        .select('*')
        .eq('user_id', shiftData.employer_id)
        .maybeSingle();


      setEmployer((employerData as EmployerProfile) ?? null);


      if (user) {
        const { data: appData } = await supabase
          .from('shift_applications')
          .select('*')
          .eq('shift_id', shiftId)
          .eq('worker_id', user.id)
          .maybeSingle();


        setMyApplication((appData as Application) ?? null);


        const { data: checkinData } = await supabase
          .from('shift_checkins')
          .select('*')
          .eq('shift_id', shiftId)
          .eq('worker_id', user.id)
          .maybeSingle();


        setMyCheckin((checkinData as Checkin) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el turno.');
    } finally {
      setLoading(false);
    }
  }, [shiftId, supabase]);


  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);


  // Realtime: cambios del shift y de mi aplicación/checkin
  useEffect(() => {
    const channel = supabase
      .channel(`shift-detail-${shiftId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: `id=eq.${shiftId}`,
        },
        () => fetchDetail()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_applications',
          filter: `shift_id=eq.${shiftId}`,
        },
        () => fetchDetail()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_checkins',
          filter: `shift_id=eq.${shiftId}`,
        },
        () => fetchDetail()
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDetail, shiftId, supabase]);


  return {
    shift,
    employer,
    myApplication,
    myCheckin,
    loading,
    error,
    refresh: fetchDetail,
  };
}
```


---


## `src/hooks/useApplications.ts`


```ts
'use client';


import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Application, Shift } from '@/types/core';


export function useShiftApplications(shiftId: string) {
  const supabase = createClient();


  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const { data, error } = await supabase
        .from('shift_applications')
        .select('*, worker_profiles(*)')
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: false });


      if (error) throw new Error('No pudimos cargar las aplicaciones.');


      setApplications((data ?? []) as Application[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar aplicaciones.');
    } finally {
      setLoading(false);
    }
  }, [shiftId, supabase]);


  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);


  useEffect(() => {
    const channel = supabase
      .channel(`shift-applications-${shiftId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_applications',
          filter: `shift_id=eq.${shiftId}`,
        },
        () => fetchApplications()
      )
      .subscribe();


    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchApplications, shiftId, supabase]);


  return { applications, loading, error, refresh: fetchApplications };
}


export function useMyApplications() {
  const supabase = createClient();


  const [applications, setApplications] = useState<
    Array<Application & { shifts?: Shift | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) throw new Error('Debes iniciar sesión.');


      const { data, error } = await supabase
        .from('shift_applications')
        .select('*, shifts(*)')
        .eq('worker_id', user.id)
        .order('created_at', { ascending: false });


      if (error) throw new Error('No pudimos cargar tus aplicaciones.');


      setApplications((data ?? []) as Array<Application & { shifts?: Shift | null }>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar aplicaciones.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);


  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;


    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) return;


      channel = supabase
        .channel(`my-applications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shift_applications',
            filter: `worker_id=eq.${user.id}`,
          },
          () => fetchApplications()
        )
        .subscribe();
    }


    setup();


    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchApplications, supabase]);


  return { applications, loading, error, refresh: fetchApplications };
}
```


---


## `src/hooks/useCheckin.ts`


```ts
'use client';


import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { checkInAction, checkOutAction } from '@/server/actions/checkin.actions';
import type { Checkin, Shift } from '@/types/core';


export function useCheckin(shiftId: string) {
  const supabase = createClient();
  const geo = useGeolocation();


  const [shift, setShift] = useState<Shift | null>(null);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());


  // Actualizar hora para habilitar botón 15 min antes
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);


  const fetchCheckin = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) throw new Error('Debes iniciar sesión.');


      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', shiftId)
        .maybeSingle();


      setShift((shiftData as Shift) ?? null);


      const { data: checkinData } = await supabase
        .from('shift_checkins')
        .select('*')
        .eq('shift_id', shiftId)
        .eq('worker_id', user.id)
        .maybeSingle();


      setCheckin((checkinData as Checkin) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar check-in.');
    } finally {
      setLoading(false);
    }
  }, [shiftId, supabase]);


  useEffect(() => {
    fetchCheckin();
  }, [fetchCheckin]);


  const canCheckIn = (() => {
    if (!shift) return false;
    if (checkin) return false;


    const start = new Date(shift.starts_at).getTime();
    const end = new Date(shift.ends_at).getTime();
    const current = now.getTime();


    return current >= start - 15 * 60 * 1000 && current <= end + 2 * 60 * 60 * 1000;
  })();


  const doCheckIn = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);


    try {
      const pos = await geo.requestPosition();


      const result = await checkInAction({
        shiftId,
        lat: pos.lat,
        lng: pos.lng,
      });


      if (!result.success) {
        throw new Error(result.error);
      }


      await fetchCheckin();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al hacer check-in.');
    } finally {
      setActionLoading(false);
    }
  }, [fetchCheckin, geo, shiftId]);


  const doCheckOut = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);


    try {
      const pos = await geo.requestPosition();


      const result = await checkOutAction({
        shiftId,
        lat: pos.lat,
        lng: pos.lng,
      });


      if (!result.success) {
        throw new Error(result.error);
      }


      await fetchCheckin();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al finalizar turno.');
    } finally {
      setActionLoading(false);
    }
  }, [fetchCheckin, geo, shiftId]);


  return {
    shift,
    checkin,
    loading,
    error,
    actionLoading,
    actionError,
    canCheckIn,
    doCheckIn,
    doCheckOut,
    refresh: fetchCheckin,
  };
}
```


---


## `src/hooks/useRatings.ts`


```ts
'use client';


import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { submitRatingAction } from '@/server/actions/ratings.actions';
import type { PendingRating, RatingType } from '@/types/core';


export function usePendingRatings() {
  const supabase = createClient();


  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);


    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) throw new Error('Debes iniciar sesión.');


      const { data, error } = await supabase
        .from('pending_ratings')
        .select('*, shifts(*)')
        .eq('rater_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });


      if (error) throw new Error('No pudimos cargar tus valoraciones pendientes.');


      setPendingRatings((data ?? []) as PendingRating[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar valoraciones.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);


  useEffect(() => {
    fetchPending();
  }, [fetchPending]);


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;


    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) return;


      channel = supabase
        .channel(`pending-ratings-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pending_ratings',
            filter: `rater_id=eq.${user.id}`,
          },
          () => fetchPending()
        )
        .subscribe();
    }


    setup();


    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchPending, supabase]);


  const submitRating = useCallback(
    async (input: {
      pendingRatingId: string;
      shiftId: string;
      rateeId: string;
      type: RatingType;
      stars: number;
      punctuality?: number;
      professionalism?: number;
      comment?: string;
    }) => {
      const result = await submitRatingAction(input);


      if (result.success) {
        await fetchPending();
      }


      return result;
    },
    [fetchPending]
  );


  return {
    pendingRatings,
    loading,
    error,
    refresh: fetchPending,
    submitRating,
  };
}
```


---


## `src/hooks/useNotifications.ts`


```ts
'use client';


import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { markNotificationReadAction } from '@/server/actions/notifications.actions';
import type { AppNotification } from '@/types/core';


export function useNotifications() {
  const supabase = createClient();


  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);


  const fetchNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();


    if (!user) {
      setLoading(false);
      return;
    }


    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);


    setNotifications((data ?? []) as AppNotification[]);


    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);


    setUnreadCount(count ?? 0);
    setLoading(false);
  }, [supabase]);


  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;


    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) return;


      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => fetchNotifications()
        )
        .subscribe();
    }


    setup();


    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchNotifications, supabase]);


  const markAsRead = useCallback(
    async (notificationId: string) => {
      await markNotificationReadAction(notificationId);
      await fetchNotifications();
    },
    [fetchNotifications]
  );


  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markAsRead,
  };
}
```


---


# 7. Server Actions


## `src/server/actions/shifts.actions.ts`


```ts
'use server';


import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';


const publishShiftSchema = z.object({
  profession: z.string().min(1, 'Selecciona una profesión'),
  date: z.string().min(1, 'Selecciona una fecha'),
  startTime: z.string().min(1, 'Selecciona hora de inicio'),
  endTime: z.string().min(1, 'Selecciona hora de fin'),
  pricePerHour: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000).optional(),
  slotsNeeded: z.coerce.number().int().min(1).max(20),
});


export type PublishShiftInput = z.infer<typeof publishShiftSchema>;


export async function publishShiftAction(
  input: PublishShiftInput
): Promise<ActionResult<{ shiftId: string }>> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión para publicar un turno.',
    };
  }


  const parsed = publishShiftSchema.safeParse(input);


  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? 'Revisa los datos del turno.',
    };
  }


  const data = parsed.data;


  const { data: employerProfile } = await supabase
    .from('employer_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();


  if (!employerProfile) {
    return {
      success: false,
      error: 'No encontramos tu perfil de empleador.',
    };
  }


  if (!employerProfile.latitude || !employerProfile.longitude) {
    return {
      success: false,
      error:
        'Tu empresa no tiene ubicación configurada. Completa tu perfil antes de publicar.',
    };
  }


  const { data: shiftData, error } = await supabase
    .from('shifts')
    .insert({
      employer_id: user.id,
      profession_required: data.profession,
      description: data.description ?? null,
      shift_date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      hourly_rate_offer: data.pricePerHour || null,
      location: employerProfile.address ?? employerProfile.location ?? 'Porto',
      latitude: employerProfile.latitude,
      longitude: employerProfile.longitude,
      status: 'published',
      slots_needed: data.slotsNeeded,
    })
    .select('id')
    .single();


  if (error) {
    return {
      success: false,
      error: 'No pudimos publicar el turno. Inténtalo de nuevo.',
    };
  }


  return {
    success: true,
    data: {
      shiftId: shiftData.id,
    },
    redirect: '/app/employer/shifts',
  };
}
```


---


## `src/server/actions/applications.actions.ts`


```ts
'use server';


import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';


const applySchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});


export async function applyToShiftAction(
  input: z.infer<typeof applySchema>
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión para aplicar.',
    };
  }


  const parsed = applySchema.safeParse(input);


  if (!parsed.success) {
    return {
      success: false,
      error: 'Revisa los datos de tu aplicación.',
    };
  }


  const { shiftId, message, proposedRate } = parsed.data;


  const { data: shift } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .maybeSingle();


  if (!shift) {
    return {
      success: false,
      error: 'Turno no encontrado.',
    };
  }


  if (shift.status !== 'published') {
    return {
      success: false,
      error: 'Este turno ya no está disponible.',
    };
  }


  if (shift.employer_id === user.id) {
    return {
      success: false,
      error: 'No puedes aplicar a tu propio turno.',
    };
  }


  const finalProposedRate =
    proposedRate ?? shift.hourly_rate_offer ?? undefined;


  if (!finalProposedRate || finalProposedRate <= 0) {
    return {
      success: false,
      error:
        'Este turno requiere propuesta de precio. Introduce tu tarifa por hora.',
    };
  }


  const { error } = await supabase.from('shift_applications').insert({
    shift_id: shiftId,
    worker_id: user.id,
    proposed_rate: finalProposedRate,
    message: message ?? null,
    status: 'pending',
  });


  if (error) {
    if (error.message.includes('unique') || error.code === '23505') {
      return {
        success: false,
        error: 'Ya has aplicado a este turno.',
      };
    }


    return {
      success: false,
      error: 'No pudimos enviar tu aplicación.',
    };
  }


  return { success: true };
}


export async function acceptApplicationAction(
  applicationId: string
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  const { data: application } = await supabase
    .from('shift_applications')
    .select('*, shifts(*)')
    .eq('id', applicationId)
    .maybeSingle();


  if (!application) {
    return {
      success: false,
      error: 'Aplicación no encontrada.',
    };
  }


  if (application.shifts?.employer_id !== user.id) {
    return {
      success: false,
      error: 'No autorizado para gestionar esta aplicación.',
    };
  }


  const { count } = await supabase
    .from('shift_applications')
    .select('id', { count: 'exact', head: true })
    .eq('shift_id', application.shift_id)
    .eq('status', 'accepted');


  const slotsNeeded = application.shifts?.slots_needed ?? 1;


  if ((count ?? 0) >= slotsNeeded) {
    return {
      success: false,
      error: 'Este turno ya cubrió todas las vacantes.',
    };
  }


  const { error } = await supabase
    .from('shift_applications')
    .update({ status: 'accepted' })
    .eq('id', applicationId);


  if (error) {
    return {
      success: false,
      error: 'No pudimos aceptar la aplicación.',
    };
  }


  return { success: true };
}


export async function rejectApplicationAction(
  applicationId: string
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  const { data: application } = await supabase
    .from('shift_applications')
    .select('*, shifts(*)')
    .eq('id', applicationId)
    .maybeSingle();


  if (!application) {
    return {
      success: false,
      error: 'Aplicación no encontrada.',
    };
  }


  if (application.shifts?.employer_id !== user.id) {
    return {
      success: false,
      error: 'No autorizado para gestionar esta aplicación.',
    };
  }


  const { error } = await supabase
    .from('shift_applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId);


  if (error) {
    return {
      success: false,
      error: 'No pudimos rechazar la aplicación.',
    };
  }


  return { success: true };
}
```


---


## `src/server/actions/checkin.actions.ts`


```ts
'use server';


import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';


const checkInSchema = z.object({
  shiftId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
});


export async function checkInAction(
  input: z.infer<typeof checkInSchema>
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  const parsed = checkInSchema.safeParse(input);


  if (!parsed.success) {
    return {
      success: false,
      error: 'Ubicación inválida.',
    };
  }


  const { shiftId, lat, lng } = parsed.data;


  const { error } = await supabase.from('shift_checkins').insert({
    shift_id: shiftId,
    worker_id: user.id,
    check_in_at: new Date().toISOString(),
    lat,
    lng,
  });


  if (error) {
    if (error.message.includes('too far') || error.message.includes('demasiado lejos')) {
      return {
        success: false,
        error: 'Estás demasiado lejos del turno. Debes estar a menos de 100 metros.',
      };
    }


    if (error.message.includes('check-in solo está disponible')) {
      return {
        success: false,
        error: 'El check-in solo está disponible desde 15 minutos antes del inicio.',
      };
    }


    return {
      success: false,
      error: 'No pudimos registrar el check-in.',
    };
  }


  return { success: true };
}


const checkOutSchema = z.object({
  shiftId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
});


export async function checkOutAction(
  input: z.infer<typeof checkOutSchema>
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  const parsed = checkOutSchema.safeParse(input);


  if (!parsed.success) {
    return {
      success: false,
      error: 'Ubicación inválida.',
    };
  }


  const { shiftId, lat, lng } = parsed.data;


  const { error } = await supabase
    .from('shift_checkins')
    .update({
      check_out_at: new Date().toISOString(),
      check_out_lat: lat,
      check_out_lng: lng,
    })
    .eq('shift_id', shiftId)
    .eq('worker_id', user.id)
    .is('check_out_at', null);


  if (error) {
    return {
      success: false,
      error: 'No pudimos registrar el check-out.',
    };
  }


  return { success: true };
}
```


---


## `src/server/actions/ratings.actions.ts`


```ts
'use server';


import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';


const ratingSchema = z.object({
  pendingRatingId: z.string().uuid(),
  shiftId: z.string().uuid(),
  rateeId: z.string().uuid(),
  type: z.enum(['employer_to_worker', 'worker_to_employer']),
  stars: z.number().int().min(1).max(5),
  punctuality: z.number().int().min(1).max(5).optional(),
  professionalism: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});


export async function submitRatingAction(
  input: z.infer<typeof ratingSchema>
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  const parsed = ratingSchema.safeParse(input);


  if (!parsed.success) {
    return {
      success: false,
      error: 'Revisa los datos de la valoración.',
    };
  }


  const data = parsed.data;


  const { data: pending } = await supabase
    .from('pending_ratings')
    .select('*')
    .eq('id', data.pendingRatingId)
    .eq('rater_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();


  if (!pending) {
    return {
      success: false,
      error: 'Esta valoración ya no está pendiente.',
    };
  }


  const { error } = await supabase.from('ratings').insert({
    shift_id: data.shiftId,
    rater_id: user.id,
    ratee_id: data.rateeId,
    type: data.type,
    stars: data.stars,
    punctuality: data.punctuality ?? null,
    professionalism: data.professionalism ?? null,
    comment: data.comment ?? null,
  });


  if (error) {
    return {
      success: false,
      error: 'No pudimos guardar la valoración.',
    };
  }


  return { success: true };
}
```


---


## `src/server/actions/notifications.actions.ts`


```ts
'use server';


import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';


export async function markNotificationReadAction(
  notificationId: string
): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();


  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    return {
      success: false,
      error: 'Debes iniciar sesión.',
    };
  }


  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id);


  return { success: true };
}
```


---


# 8. Componentes de negocio


## `src/components/shifts/NetBreakdown.tsx`


```tsx
'use client';


import { calculateWorkerNet } from '@/lib/utils/calc';
import { formatEUR } from '@/lib/utils/number';
import { FISCAL_DISCLAIMER } from '@/lib/constants';
import { Card } from '@/components/ui';


interface NetBreakdownProps {
  hourlyRate: number;
  hours: number;
  ssExempt?: boolean;
}


export function NetBreakdown({ hourlyRate, hours, ssExempt = false }: NetBreakdownProps) {
  if (!hourlyRate || hourlyRate <= 0 || hours <= 0) {
    return null;
  }


  const result = calculateWorkerNet({ hourlyRate, hours, ssExempt });


  return (
    <Card className="space-y-3">
      <h3 className="text-base font-bold text-[#1A1A1A]">Estimación de neto</h3>


      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[#8B8B8B]">
            Bruto ({formatEUR(result.hourlyRate)} × {result.hours.toFixed(1)}h)
          </span>
          <span className="font-semibold">{formatEUR(result.gross)}</span>
        </div>


        <div className="flex justify-between">
          <span className="text-[#8B8B8B]">Comisión Bee Workers (5%)</span>
          <span className="font-semibold text-red-600">-{formatEUR(result.commission)}</span>
        </div>


        <div className="flex justify-between border-t border-black/5 pt-2">
          <span className="font-medium">A recibir antes de impuestos</span>
          <span className="font-bold">{formatEUR(result.netBeforeTaxes)}</span>
        </div>


        <div className="flex justify-between">
          <span className="text-[#8B8B8B]">IRS estimado (23% sobre 75%)</span>
          <span className="font-semibold text-red-600">-{formatEUR(result.irsEstimate)}</span>
        </div>


        <div className="flex justify-between">
          <span className="text-[#8B8B8B]">
            SS estimado (21.4% sobre 70%)
            {result.ssExempt ? ' · Exento' : ''}
          </span>
          <span className="font-semibold text-red-600">
            -{formatEUR(result.ssEstimate)}
          </span>
        </div>


        <div className="flex justify-between rounded-2xl bg-[#F5F5F0] px-3 py-3">
          <span className="font-bold">Neto estimado</span>
          <span className="font-black">{formatEUR(result.netAfterTaxes)}</span>
        </div>
      </div>


      <p className="rounded-2xl bg-[#FFB800]/10 p-3 text-xs leading-5 text-[#1A1A1A]">
        {FISCAL_DISCLAIMER}
      </p>
    </Card>
  );
}
```


---


## `src/components/shifts/ShiftCard.tsx`


```tsx
'use client';


import { Badge, Card } from '@/components/ui';
import { formatEUR } from '@/lib/utils/number';
import { formatHour, formatShiftDate } from '@/lib/utils/date';
import type { Shift } from '@/types/core';


interface ShiftCardProps {
  shift: Shift;
  employerName?: string;
  employerRating?: number;
  employerRatingCount?: number;
  onClick?: () => void;
}


export function ShiftCard({
  shift,
  employerName,
  employerRating,
  employerRatingCount = 0,
  onClick,
}: ShiftCardProps) {
  const showRating = employerRatingCount >= 3;


  return (
    <Card onClick={onClick} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#1A1A1A]">
            {shift.profession_required}
          </h3>
          <p className="text-sm text-[#8B8B8B]">
            {employerName ?? 'Empresa'}
          </p>
        </div>


        <Badge variant={shift.remaining_slots && shift.remaining_slots > 0 ? 'default' : 'muted'}>
          {shift.remaining_slots ?? shift.slots_needed} vacantes
        </Badge>
      </div>


      <div className="flex flex-wrap gap-2 text-xs text-[#8B8B8B]">
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">
          {formatShiftDate(shift.shift_date)}
        </span>
        <span className="rounded-full bg-[#F5F5F0] px-3 py-1">
          {formatHour(shift.start_time)} - {formatHour(shift.end_time)}
        </span>
        {typeof shift.distance_km === 'number' && (
          <span className="rounded-full bg-[#F5F5F0] px-3 py-1">
            {shift.distance_km.toFixed(1)} km
          </span>
        )}
      </div>


      <div className="flex items-center justify-between">
        <div>
          {shift.hourly_rate_offer ? (
            <p className="text-lg font-black text-[#1A1A1A]">
              {formatEUR(shift.hourly_rate_offer)}
              <span className="text-xs font-medium text-[#8B8B8B]">/hora</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-[#1A1A1A]">Precio a convenir</p>
          )}
        </div>


        {showRating && (
          <span className="text-sm font-semibold text-[#1A1A1A]">
            ⭐ {employerRating?.toFixed(1)}
          </span>
        )}
      </div>
    </Card>
  );
}
```


---


## `src/components/shifts/ShiftFilters.tsx`


```tsx
'use client';


import { Input, Select } from '@/components/ui';
import { PROFESSIONS } from '@/lib/constants';
import type { ShiftFilters } from '@/hooks/useShifts';


interface ShiftFiltersProps {
  filters: ShiftFilters;
  onChange: (filters: ShiftFilters) => void;
}


export function ShiftFiltersBar({ filters, onChange }: ShiftFiltersProps) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      <div className="w-44 shrink-0">
        <Select
          value={filters.profession}
          onChange={e => onChange({ ...filters, profession: e.target.value })}
        >
          <option value="">Todas las profesiones</option>
          {PROFESSIONS.map(profession => (
            <option key={profession} value={profession}>
              {profession}
            </option>
          ))}
        </Select>
      </div>


      <div className="w-32 shrink-0">
        <Select
          value={filters.maxKm}
          onChange={e =>
            onChange({ ...filters, maxKm: Number(e.target.value) })
          }
        >
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={15}>15 km</option>
          <option value={20}>20 km</option>
          <option value={30}>30 km</option>
        </Select>
      </div>


      <div className="w-40 shrink-0">
        <Input
          type="date"
          value={filters.date}
          onChange={e => onChange({ ...filters, date: e.target.value })}
        />
      </div>


      <div className="w-32 shrink-0">
        <Input
          type="number"
          placeholder="€/h mín"
          value={filters.minPrice || ''}
          onChange={e =>
            onChange({ ...filters, minPrice: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
}
```


---


## `src/components/notifications/NotificationBadge.tsx`


```tsx
'use client';


import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';


export function NotificationBadge() {
  const { unreadCount } = useNotifications();


  return (
    <Link
      href="/app/notifications"
      className="relative rounded-full bg-[#F5F5F0] px-3 py-2 text-sm font-semibold text-[#1A1A1A]"
    >
      🔔
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFB800] text-[10px] font-black text-[#1A1A1A]">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
```


---


## `src/components/layout/AppNav.tsx`


```tsx
'use client';


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { cn } from '@/lib/utils/cn';


export function WorkerNav() {
  const pathname = usePathname();


  const items = [
    { href: '/app/worker', label: 'Feed' },
    { href: '/app/worker/applications', label: 'Aplicaciones' },
    { href: '/app/worker/ratings', label: 'Ratings' },
  ];


  return (
    <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/app/worker" className="text-lg font-black">
          Bee<span className="text-[#FFB800]">Workers</span>
        </Link>


        <div className="flex items-center gap-2">
          <NotificationBadge />
        </div>
      </div>


      <div className="mx-auto flex max-w-md gap-2 px-4 pb-3">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              pathname === item.href
                ? 'bg-[#FFB800] text-[#1A1A1A]'
                : 'bg-[#F5F5F0] text-[#8B8B8B]'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}


export function EmployerNav() {
  const pathname = usePathname();


  const items = [
    { href: '/app/employer/shifts', label: 'Mis turnos' },
    { href: '/app/employer/shifts/new', label: 'Publicar' },
  ];


  return (
    <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link href="/app/employer/shifts" className="text-lg font-black">
          Bee<span className="text-[#FFB800]">Workers</span>
        </Link>


        <NotificationBadge />
      </div>


      <div className="mx-auto flex max-w-md gap-2 px-4 pb-3">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              pathname === item.href
                ? 'bg-[#FFB800] text-[#1A1A1A]'
                : 'bg-[#F5F5F0] text-[#8B8B8B]'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```


---


# 9. Pantallas Worker


## Feed cercano


## `src/app/app/worker/page.tsx`


```tsx
'use client';


import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useNearbyShifts, type ShiftFilters } from '@/hooks/useShifts';
import { WorkerNav } from '@/components/layout/AppNav';
import { ShiftFiltersBar } from '@/components/shifts/ShiftFilters';
import { ShiftCard } from '@/components/shifts/ShiftCard';
import { Button, EmptyState, ErrorState, FullLoader } from '@/components/ui';
import type { EmployerProfile, Shift } from '@/types/core';


export default function WorkerFeedPage() {
  const router = useRouter();
  const supabase = createClient();


  const [filters, setFilters] = useState<ShiftFilters>({
    profession: '',
    maxKm: 10,
    date: '',
    minPrice: 0,
  });


  const { shifts, loading, error, refresh, geo } = useNearbyShifts(filters);
  const [employers, setEmployers] = useState<Record<string, EmployerProfile>>({});


  useEffect(() => {
    async function fetchEmployers() {
      const employerIds = Array.from(new Set(shifts.map(s => s.employer_id)));
      if (employerIds.length === 0) return;


      const { data } = await supabase
        .from('employer_profiles')
        .select('*')
        .in('user_id', employerIds);


      const map: Record<string, EmployerProfile> = {};


      (data ?? []).forEach(item => {
        map[item.user_id] = item as EmployerProfile;
      });


      setEmployers(map);
    }


    fetchEmployers();
  }, [shifts, supabase]);


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <div className="rounded-3xl bg-[#1A1A1A] p-5 text-white">
          <h1 className="text-2xl font-black">Turnos cerca de ti</h1>
          <p className="mt-1 text-sm text-white/70">
            Encuentra oportunidades en Porto y aplica en segundos.
          </p>
        </div>


        <ShiftFiltersBar filters={filters} onChange={setFilters} />


        {loading && <FullLoader label="Buscando turnos cercanos..." />}


        {!loading && error && (
          <ErrorState
            message={error}
            retry={async () => {
              await refresh();
            }}
          />
        )}


        {!loading && !error && shifts.length === 0 && (
          <EmptyState
            title="No hay turnos cerca"
            description="Prueba a ampliar el radio o cambiar los filtros."
            action={
              <Button variant="secondary" onClick={refresh}>
                Recargar
              </Button>
            }
          />
        )}


        <div className="space-y-3">
          {shifts.map((shift: Shift) => {
            const employer = employers[shift.employer_id];


            return (
              <ShiftCard
                key={shift.id}
                shift={shift}
                employerName={employer?.company_name}
                employerRating={employer?.rating}
                employerRatingCount={employer?.rating_count}
                onClick={() => router.push(`/app/worker/shifts/${shift.id}`)}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
```


---


## Detalle de turno + aplicar + check-in


## `src/app/app/worker/shifts/[id]/page.tsx`


```tsx
'use client';


import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useShiftDetail } from '@/hooks/useShifts';
import { useCheckin } from '@/hooks/useCheckin';
import { applyToShiftAction } from '@/server/actions/applications.actions';
import { WorkerNav } from '@/components/layout/AppNav';
import { NetBreakdown } from '@/components/shifts/NetBreakdown';
import {
  Badge,
  Button,
  Card,
  FullLoader,
  ErrorState,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import { formatEUR } from '@/lib/utils/number';
import { formatDateTime, calculateShiftHours } from '@/lib/utils/date';


export default function WorkerShiftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();


  const shiftId = params.id as string;
  const { shift, employer, myApplication, loading, error, refresh } =
    useShiftDetail(shiftId);


  const checkin = useCheckin(shiftId);


  const [applyOpen, setApplyOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);


  const [workerProfile, setWorkerProfile] = useState<any | null>(null);


  useState(() => {
    async function fetchWorkerProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (!user) return;


      const { data } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();


      setWorkerProfile(data);
    }


    fetchWorkerProfile();
  });


  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <WorkerNav />
        <FullLoader />
      </div>
    );
  }


  if (error || !shift) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <WorkerNav />
        <div className="mx-auto max-w-md px-4 py-6">
          <ErrorState message={error ?? 'Turno no encontrado.'} retry={refresh} />
        </div>
      </div>
    );
  }


  const hours = calculateShiftHours(shift.starts_at, shift.ends_at);
  const fixedPrice = shift.hourly_rate_offer ?? 0;
  const previewRate = fixedPrice > 0 ? fixedPrice : Number(proposedRate || 0);


  const handleApply = async () => {
    setApplyLoading(true);
    setApplyError(null);


    const result = await applyToShiftAction({
      shiftId,
      message,
      proposedRate: proposedRate ? Number(proposedRate) : null,
    });


    setApplyLoading(false);


    if (!result.success) {
      setApplyError(result.error);
      return;
    }


    setApplyOpen(false);
    setMessage('');
    setProposedRate('');
    await refresh();
  };


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>


        <Card className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#1A1A1A]">
                {shift.profession_required}
              </h1>
              <p className="text-sm text-[#8B8B8B]">
                {employer?.company_name ?? 'Empresa'}
              </p>
            </div>


            <Badge>{shift.status}</Badge>
          </div>


          <div className="space-y-2 text-sm text-[#1A1A1A]">
            <p>📍 {shift.location}</p>
            <p>🕒 {formatDateTime(shift.starts_at)}</p>
            <p>
              💶{' '}
              {shift.hourly_rate_offer
                ? `${formatEUR(shift.hourly_rate_offer)}/hora`
                : 'Precio a convenir'}
            </p>
            <p>👥 {shift.slots_needed} vacantes</p>
          </div>


          {shift.description && (
            <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm leading-6 text-[#1A1A1A]">
              {shift.description}
            </div>
          )}
        </Card>


        {employer && (
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">
                {employer.company_name}
              </p>
              <p className="text-xs text-[#8B8B8B]">
                {employer.rating_count >= 3
                  ? `⭐ ${employer.rating.toFixed(1)} · ${employer.total_shifts} turnos`
                  : 'Perfil nuevo'}
              </p>
            </div>
          </Card>
        )}


        <NetBreakdown
          hourlyRate={previewRate}
          hours={hours}
          ssExempt={workerProfile?.is_social_security_exempt ?? false}
        />


        {myApplication && (
          <Card className="space-y-2">
            <p className="text-sm font-bold">Tu aplicación</p>
            <Badge
              variant={
                myApplication.status === 'accepted'
                  ? 'success'
                  : myApplication.status === 'rejected'
                    ? 'danger'
                    : 'warning'
              }
            >
              {myApplication.status}
            </Badge>
          </Card>
        )}


        {myApplication?.status === 'accepted' && (
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Check-in / Check-out</h2>


            {checkin.error && <p className="text-sm text-red-600">{checkin.error}</p>}
            {checkin.actionError && (
              <p className="text-sm text-red-600">{checkin.actionError}</p>
            )}


            {!checkin.checkin && (
              <Button
                className="w-full"
                disabled={!checkin.canCheckIn}
                loading={checkin.actionLoading}
                onClick={checkin.doCheckIn}
              >
                Iniciar turno
              </Button>
            )}


            {checkin.checkin && !checkin.checkin.check_out_at && (
              <Button
                className="w-full"
                loading={checkin.actionLoading}
                onClick={checkin.doCheckOut}
              >
                Finalizar turno
              </Button>
            )}


            {checkin.checkin?.check_out_at && (
              <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-700">
                Turno finalizado. Ya puedes valorar a la empresa en la sección
                Ratings.
              </div>
            )}


            {!checkin.canCheckIn && !checkin.checkin && (
              <p className="text-xs text-[#8B8B8B]">
                El check-in se habilita 15 minutos antes del inicio del turno.
              </p>
            )}
          </Card>
        )}


        {!myApplication && shift.status === 'published' && (
          <Button className="w-full" onClick={() => setApplyOpen(true)}>
            Aplicar
          </Button>
        )}
      </main>


      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Aplicar al turno">
        <div className="space-y-4">
          {fixedPrice <= 0 && (
            <Input
              label="Tu propuesta de precio por hora (€)"
              type="number"
              step="0.5"
              value={proposedRate}
              onChange={e => setProposedRate(e.target.value)}
              placeholder="12"
            />
          )}


          <Textarea
            label="Mensaje opcional"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Breve presentación, experiencia relevante..."
          />


          {applyError && <p className="text-sm text-red-600">{applyError}</p>}


          <Button className="w-full" loading={applyLoading} onClick={handleApply}>
            Enviar aplicación
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```


---


## Aplicaciones del worker


## `src/app/app/worker/applications/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { useMyApplications } from '@/hooks/useApplications';
import { WorkerNav } from '@/components/layout/AppNav';
import { Badge, Card, EmptyState, FullLoader, ErrorState } from '@/components/ui';
import { formatShiftDate, formatHour } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';


export default function WorkerApplicationsPage() {
  const router = useRouter();
  const { applications, loading, error, refresh } = useMyApplications();


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Mis aplicaciones</h1>


        {loading && <FullLoader />}


        {!loading && error && <ErrorState message={error} retry={refresh} />}


        {!loading && !error && applications.length === 0 && (
          <EmptyState
            title="Sin aplicaciones"
            description="Aplica a turnos desde el feed para verlos aquí."
          />
        )}


        <div className="space-y-3">
          {applications.map(app => (
            <Card
              key={app.id}
              onClick={() => router.push(`/app/worker/shifts/${app.shift_id}`)}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">
                  {app.shifts?.profession_required ?? 'Turno'}
                </p>
                <Badge
                  variant={
                    app.status === 'accepted'
                      ? 'success'
                      : app.status === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {app.status}
                </Badge>
              </div>


              {app.shifts && (
                <p className="text-sm text-[#8B8B8B]">
                  {formatShiftDate(app.shifts.shift_date)} ·{' '}
                  {formatHour(app.shifts.start_time)} -{' '}
                  {formatHour(app.shifts.end_time)}
                </p>
              )}


              <p className="text-sm font-semibold">
                Tu propuesta: {formatEUR(app.proposed_rate)}/h
              </p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
```


---


## Ratings pendientes del worker


## `src/app/app/worker/ratings/page.tsx`


```tsx
'use client';


import { useState } from 'react';
import { usePendingRatings } from '@/hooks/useRatings';
import { WorkerNav } from '@/components/layout/AppNav';
import {
  Button,
  Card,
  EmptyState,
  FullLoader,
  ErrorState,
  Modal,
  RatingStars,
  Textarea,
} from '@/components/ui';
import type { PendingRating } from '@/types/core';


export default function WorkerRatingsPage() {
  const { pendingRatings, loading, error, refresh, submitRating } =
    usePendingRatings();


  const [selected, setSelected] = useState<PendingRating | null>(null);
  const [stars, setStars] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);


  const handleSubmit = async () => {
    if (!selected) return;


    setSubmitting(true);
    setSubmitError(null);


    const result = await submitRating({
      pendingRatingId: selected.id,
      shiftId: selected.shift_id,
      rateeId: selected.ratee_id,
      type: selected.type,
      stars,
      punctuality: punctuality || undefined,
      professionalism: professionalism || undefined,
      comment: comment || undefined,
    });


    setSubmitting(false);


    if (!result.success) {
      setSubmitError(result.error);
      return;
    }


    setSelected(null);
    setStars(0);
    setPunctuality(0);
    setProfessionalism(0);
    setComment('');
  };


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Valoraciones pendientes</h1>


        {loading && <FullLoader />}


        {!loading && error && <ErrorState message={error} retry={refresh} />}


        {!loading && !error && pendingRatings.length === 0 && (
          <EmptyState
            title="Sin valoraciones pendientes"
            description="Cuando finalices un turno, podrás valorar a la empresa."
          />
        )}


        <div className="space-y-3">
          {pendingRatings.map(item => (
            <Card key={item.id} className="space-y-3">
              <p className="font-bold">
                {item.type === 'worker_to_employer'
                  ? 'Valorar empresa'
                  : 'Valorar trabajador'}
              </p>


              <p className="text-sm text-[#8B8B8B]">
                {item.shifts?.profession_required}
              </p>


              <Button onClick={() => setSelected(item)}>Valorar</Button>
            </Card>
          ))}
        </div>
      </main>


      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Dejar valoración"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Valoración general</p>
            <RatingStars value={stars} onChange={setStars} size="lg" />
          </div>


          <div className="space-y-2">
            <p className="text-sm font-medium">Puntualidad</p>
            <RatingStars value={punctuality} onChange={setPunctuality} />
          </div>


          <div className="space-y-2">
            <p className="text-sm font-medium">Profesionalidad</p>
            <RatingStars value={professionalism} onChange={setProfessionalism} />
          </div>


          <Textarea
            label="Comentario"
            rows={4}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Cuenta tu experiencia..."
          />


          {submitError && <p className="text-sm text-red-600">{submitError}</p>}


          <Button
            className="w-full"
            loading={submitting}
            disabled={stars === 0}
            onClick={handleSubmit}
          >
            Enviar valoración
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```


---


# 10. Pantallas Employer


## Listado de turnos publicados


## `src/app/app/employer/shifts/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { useMyPublishedShifts } from '@/hooks/useShifts';
import { EmployerNav } from '@/components/layout/AppNav';
import { Badge, Button, Card, EmptyState, ErrorState, FullLoader } from '@/components/ui';
import { formatShiftDate, formatHour } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';


export default function EmployerShiftsPage() {
  const router = useRouter();
  const { shifts, loading, error, refresh } = useMyPublishedShifts();


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Mis turnos</h1>
          <Button onClick={() => router.push('/app/employer/shifts/new')}>
            Publicar
          </Button>
        </div>


        {loading && <FullLoader />}


        {!loading && error && <ErrorState message={error} retry={refresh} />}


        {!loading && !error && shifts.length === 0 && (
          <EmptyState
            title="Aún no publicaste turnos"
            description="Publica tu primer turno para recibir aplicaciones."
            action={
              <Button onClick={() => router.push('/app/employer/shifts/new')}>
                Publicar turno
              </Button>
            }
          />
        )}


        <div className="space-y-3">
          {shifts.map(shift => (
            <Card
              key={shift.id}
              onClick={() => router.push(`/app/employer/shifts/${shift.id}`)}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">{shift.profession_required}</p>
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


              <p className="text-sm text-[#8B8B8B]">
                {formatShiftDate(shift.shift_date)} · {formatHour(shift.start_time)} -{' '}
                {formatHour(shift.end_time)}
              </p>


              <div className="flex items-center justify-between text-sm">
                <span>
                  {shift.hourly_rate_offer
                    ? `${formatEUR(shift.hourly_rate_offer)}/h`
                    : 'Precio a convenir'}
                </span>
                <span className="text-[#8B8B8B]">
                  {shift.application_count} apps · {shift.accepted_count}/
                  {shift.slots_needed}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
```


---


## Publicar turno


## `src/app/app/employer/shifts/new/page.tsx`


```tsx
'use client';


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publishShiftAction } from '@/server/actions/shifts.actions';
import { EmployerNav } from '@/components/layout/AppNav';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { PROFESSIONS } from '@/lib/constants';
import { calculateHoursFromDateAndTime } from '@/lib/utils/date';
import { calculateShiftCost } from '@/lib/utils/calc';
import { formatEUR } from '@/lib/utils/number';


export default function NewShiftPage() {
  const router = useRouter();


  const [profession, setProfession] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [description, setDescription] = useState('');
  const [slotsNeeded, setSlotsNeeded] = useState('1');


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const hours =
    date && startTime && endTime
      ? calculateHoursFromDateAndTime(date, startTime, endTime)
      : 0;


  const price = Number(pricePerHour || 0);
  const slots = Number(slotsNeeded || 1);
  const totalCost = price > 0 && hours > 0 ? calculateShiftCost(price, hours, slots) : 0;


  const handleSubmit = async () => {
    setLoading(true);
    setError(null);


    const result = await publishShiftAction({
      profession,
      date,
      startTime,
      endTime,
      pricePerHour: pricePerHour ? Number(pricePerHour) : null,
      description,
      slotsNeeded: Number(slotsNeeded),
    });


    setLoading(false);


    if (!result.success) {
      setError(result.error);
      return;
    }


    router.push('/app/employer/shifts');
  };


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Publicar turno</h1>


        <Card className="space-y-4">
          <Select
            label="Profesión requerida"
            value={profession}
            onChange={e => setProfession(e.target.value)}
          >
            <option value="">Selecciona una profesión</option>
            {PROFESSIONS.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>


          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />


          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Inicio"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
            <Input
              label="Fin"
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>


          <Input
            label="Precio por hora (opcional)"
            type="number"
            step="0.5"
            placeholder="12"
            value={pricePerHour}
            onChange={e => setPricePerHour(e.target.value)}
            hint="Si lo dejas vacío, los workers propondrán precio."
          />


          <Input
            label="Número de workers necesarios"
            type="number"
            min={1}
            max={20}
            value={slotsNeeded}
            onChange={e => setSlotsNeeded(e.target.value)}
          />


          <Textarea
            label="Descripción"
            rows={4}
            placeholder="Detalles del servicio, vestimenta, experiencia..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Card>


        <Card className="space-y-2">
          <h2 className="font-bold">Preview coste estimado</h2>


          {price > 0 && hours > 0 ? (
            <div className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Horas</span>
                <span>{hours.toFixed(1)}h</span>
              </p>
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Workers</span>
                <span>{slots}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Precio/hora</span>
                <span>{formatEUR(price)}</span>
              </p>
              <p className="flex justify-between rounded-2xl bg-[#F5F5F0] px-3 py-3 font-bold">
                <span>Total estimado</span>
                <span>{formatEUR(totalCost)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#8B8B8B]">
              Introduce fecha, horas y precio para ver el coste estimado.
            </p>
          )}
        </Card>


        {error && <p className="text-sm text-red-600">{error}</p>}


        <Button className="w-full" loading={loading} onClick={handleSubmit}>
          Publicar turno
        </Button>
      </main>
    </div>
  );
}
```


---


## Detalle de turno employer + aplicaciones


## `src/app/app/employer/shifts/[id]/page.tsx`


```tsx
'use client';


import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useShiftDetail } from '@/hooks/useShifts';
import { useShiftApplications } from '@/hooks/useApplications';
import {
  acceptApplicationAction,
  rejectApplicationAction,
} from '@/server/actions/applications.actions';
import { EmployerNav } from '@/components/layout/AppNav';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  Modal,
  Select,
} from '@/components/ui';
import { formatDateTime, calculateShiftHours } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';
import type { Application } from '@/types/core';


export default function EmployerShiftDetailPage() {
  const params = useParams();
  const router = useRouter();


  const shiftId = params.id as string;
  const { shift, loading, error, refresh } = useShiftDetail(shiftId);
  const { applications, refresh: refreshApplications } = useShiftApplications(shiftId);


  const [sortBy, setSortBy] = useState<'rating' | 'jobs' | 'price'>('rating');
  const [selectedWorker, setSelectedWorker] = useState<Application | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);


  const sortedApplications = useMemo(() => {
    const list = [...applications];


    return list.sort((a, b) => {
      if (sortBy === 'rating') {
        return (
          (b.worker_profiles?.rating ?? 0) - (a.worker_profiles?.rating ?? 0)
        );
      }


      if (sortBy === 'jobs') {
        return (
          (b.worker_profiles?.total_jobs ?? 0) - (a.worker_profiles?.total_jobs ?? 0)
        );
      }


      return a.proposed_rate - b.proposed_rate;
    });
  }, [applications, sortBy]);


  const handleAccept = async (applicationId: string) => {
    setActionLoading(applicationId);
    await acceptApplicationAction(applicationId);
    setActionLoading(null);
    await Promise.all([refresh(), refreshApplications()]);
  };


  const handleReject = async (applicationId: string) => {
    setActionLoading(applicationId);
    await rejectApplicationAction(applicationId);
    setActionLoading(null);
    await refreshApplications();
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <EmployerNav />
        <FullLoader />
      </div>
    );
  }


  if (error || !shift) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <EmployerNav />
        <div className="mx-auto max-w-md px-4 py-6">
          <ErrorState message={error ?? 'Turno no encontrado.'} retry={refresh} />
        </div>
      </div>
    );
  }


  const hours = calculateShiftHours(shift.starts_at, shift.ends_at);
  const acceptedCount = applications.filter(a => a.status === 'accepted').length;
  const remainingSlots = Math.max(shift.slots_needed - acceptedCount, 0);


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />


      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>


        <Card className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black">{shift.profession_required}</h1>
              <p className="text-sm text-[#8B8B8B]">{formatDateTime(shift.starts_at)}</p>
            </div>
            <Badge>{shift.status}</Badge>
          </div>


          <p className="text-sm text-[#8B8B8B]">
            {shift.hourly_rate_offer
              ? `${formatEUR(shift.hourly_rate_offer)}/h`
              : 'Precio a convenir'}{' '}
            · {hours.toFixed(1)}h · {acceptedCount}/{shift.slots_needed} aceptados
          </p>


          {shift.description && (
            <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm">
              {shift.description}
            </div>
          )}
        </Card>


        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Aplicaciones</h2>


          <div className="w-40">
            <Select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="rating">Mejor rating</option>
              <option value="jobs">Más trabajos</option>
              <option value="price">Menor precio</option>
            </Select>
          </div>
        </div>


        {applications.length === 0 && (
          <EmptyState
            title="Sin aplicaciones"
            description="Comparte tu turno o espera a que los workers apliquen."
          />
        )}


        <div className="space-y-3">
          {sortedApplications.map(app => {
            const profile = app.worker_profiles;
            const showRating = (profile?.rating_count ?? 0) >= 3;


            return (
              <Card key={app.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold">
                      {profile?.full_name ?? 'Worker'}
                    </p>
                    <p className="text-xs text-[#8B8B8B]">
                      {showRating
                        ? `⭐ ${profile?.rating.toFixed(1)} · ${profile?.total_jobs} trabajos`
                        : 'Perfil nuevo'}
                    </p>
                  </div>


                  <Badge
                    variant={
                      app.status === 'accepted'
                        ? 'success'
                        : app.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {app.status}
                  </Badge>
                </div>


                <p className="text-sm font-semibold">
                  {formatEUR(app.proposed_rate)}/h
                </p>


                {app.message && (
                  <p className="rounded-2xl bg-[#F5F5F0] p-3 text-sm text-[#1A1A1A]">
                    {app.message}
                  </p>
                )}


                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedWorker(app)}
                  >
                    Ver perfil
                  </Button>


                  {app.status === 'pending' && remainingSlots > 0 && (
                    <Button
                      loading={actionLoading === app.id}
                      onClick={() => handleAccept(app.id)}
                    >
                      Aceptar
                    </Button>
                  )}


                  {app.status === 'pending' && (
                    <Button
                      variant="danger"
                      loading={actionLoading === app.id}
                      onClick={() => handleReject(app.id)}
                    >
                      Rechazar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </main>


      <Modal
        open={!!selectedWorker}
        onClose={() => setSelectedWorker(null)}
        title="Perfil del worker"
      >
        {selectedWorker?.worker_profiles && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-bold">
                {selectedWorker.worker_profiles.full_name}
              </p>


              <p className="text-sm text-[#8B8B8B]">
                {selectedWorker.worker_profiles.rating_count >= 3
                  ? `⭐ ${selectedWorker.worker_profiles.rating.toFixed(1)} · ${selectedWorker.worker_profiles.total_jobs} trabajos`
                  : 'Este perfil aún no tiene suficientes valoraciones'}
              </p>
            </div>


            <div className="space-y-2">
              <p className="text-sm font-semibold">Profesiones</p>
              <div className="flex flex-wrap gap-2">
                {selectedWorker.worker_profiles.professions.map(item => (
                  <span
                    key={item}
                    className="rounded-full bg-[#F5F5F0] px-3 py-1 text-xs"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>


            <div className="space-y-2">
              <p className="text-sm font-semibold">Skills</p>
              <div className="flex flex-wrap gap-2">
                {selectedWorker.worker_profiles.skills.map(item => (
                  <span
                    key={item}
                    className="rounded-full bg-[#F5F5F0] px-3 py-1 text-xs"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
```


---


# 11. Notificaciones


## `src/app/app/notifications/page.tsx`


```tsx
'use client';


import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { Button, Card, EmptyState, FullLoader } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/date';


export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, loading, markAsRead } = useNotifications();


  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-[#FFFAF0]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Button variant="ghost" onClick={() => router.back()}>
            ← Volver
          </Button>
          <h1 className="text-lg font-black">Notificaciones</h1>
          <span />
        </div>
      </div>


      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {loading && <FullLoader />}


        {!loading && notifications.length === 0 && (
          <EmptyState
            title="Sin notificaciones"
            description="Aquí verás novedades de turnos, aplicaciones y valoraciones."
          />
        )}


        {notifications.map(notification => (
          <Card
            key={notification.id}
            onClick={() => {
              if (!notification.read_at) {
                markAsRead(notification.id);
              }


              if (notification.data?.shiftId) {
                router.push(`/app/worker/shifts/${notification.data.shiftId}`);
              }
            }}
            className={notification.read_at ? 'opacity-70' : 'border-[#FFB800]/30'}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{notification.title}</p>
                <p className="mt-1 text-sm text-[#8B8B8B]">{notification.body}</p>
                <p className="mt-2 text-xs text-[#8B8B8B]">
                  {formatDateTime(notification.created_at)}
                </p>
              </div>


              {!notification.read_at && (
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FFB800]" />
              )}
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}
```


---


# 12. Notas importantes de implementación


## Geolocalización


- La Geolocation API solo funciona en HTTPS o localhost.
- El check-in usa:
  - validación cliente para UX
  - validación servidor/DB como fuente de verdad
- Radio de check-in: **100 metros**
- Check-in habilitado: **15 minutos antes** del inicio


---


## Realtime


Este core usa Realtime sobre:


- `shifts`
- `shift_applications`
- `shift_checkins`
- `notifications`
- `pending_ratings`


Las notificaciones se generan principalmente desde triggers en PostgreSQL.


---


## Ratings y privacidad


- Solo se puede valorar tras check-out.
- El trigger crea `pending_ratings`.
- La valoración solo puede insertarse si existe pending_rating.
- El rating medio se guarda en perfil.
- La UI solo muestra rating si:


```ts
rating_count >= 3
```


Si tiene menos de 3 valoraciones, se muestra como perfil nuevo.


---


## Cálculo de neto


La app muestra:


```text
Bruto
- Comisión Bee Workers 5%
= A recibir antes de impuestos
- IRS estimado (23% sobre 75%)
- SS estimado (21.4% sobre 70%)
= Neto estimado
```


La plataforma **no retiene IRS ni SS**.


---


## Flujo completo implementado


### Employer


1. Publica turno
2. Recibe aplicaciones
3. Filtra/ordena aplicantes
4. Acepta o rechaza
5. Recibe notificación cuando worker hace check-in/check-out
6. Valora worker tras finalizar


### Worker


1. Ve turnos cercanos
2. Filtra por profesión, distancia, fecha y precio
3. Aplica con mensaje y propuesta si no hay precio
4. Si es aceptado, puede hacer check-in
5. Check-in bloqueado si está a más de 100m
6. Finaliza turno con check-out
7. Se genera payment estimado y rating pendiente
8. Valora employer


---


Con esto queda implementado el core funcional de Bee Workers en Next.js 14 + Supabase, con diseño mobile-first, lógica legal básica portuguesa, geolocalización, Realtime y estimaciones fiscales orientativas.