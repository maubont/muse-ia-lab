-- 0003_recordatorios.sql — recordatorios PROACTIVOS con fecha explícita.
--
-- Por qué una tabla y no recalcular umbrales: el cron actual deduce cuándo toca
-- escribiendo a partir de `last_out_at`, así que no puede distinguir «pidió los
-- datos de pago y no pagó» de «se distrajo a media conversación». El momento de
-- máxima intención de compra merece su propio recordatorio.
--
-- Cada fila es una promesa concreta: a quién, de qué tipo, a qué hora y qué pasó.
-- Se CANCELA en cuanto el lead responde: si volvió, no hay nada que recordar.
--
-- Escrita a mano (no viene de producción): es una tabla nueva del repo nuevo.

create table if not exists public.musa_recordatorios (
  id bigint generated always as identity primary key,
  lead_phone text not null references public.musa_leads(phone) on delete cascade,
  tipo text not null,
  programado_para timestamptz not null,
  enviado_en timestamptz,
  cancelado_en timestamptz,
  motivo text,
  created_at timestamptz not null default now()
);

-- El cron busca vencidos sin enviar y sin cancelar: índice parcial a propósito.
create index if not exists musa_recordatorios_pendientes_idx
  on public.musa_recordatorios (programado_para)
  where enviado_en is null and cancelado_en is null;

create index if not exists musa_recordatorios_lead_idx
  on public.musa_recordatorios (lead_phone);

-- Solo el servidor (API key admin) accede: RLS sin políticas.
alter table public.musa_recordatorios enable row level security;

-- Verificación de que quedó bien (se ejecuta al aplicarla).
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'musa_recordatorios'
  ) then
    raise exception 'musa_recordatorios no se creó';
  end if;
end $$;
