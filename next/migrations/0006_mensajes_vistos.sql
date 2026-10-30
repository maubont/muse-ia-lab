-- 0006: deduplicación persistente de mensajes entrantes.
--
-- Antes los ids se guardaban en un Set en memoria: al reiniciar se olvidaban y
-- Evolution, que reintenta hasta 10 veces, provocaba respuestas duplicadas al
-- cliente. Esta tabla sobrevive a reinicios y a varias réplicas.

create table if not exists public.musa_mensajes_vistos (
  id_externo   text primary key,
  visto_en     timestamptz not null default now()
);

create index if not exists musa_mensajes_vistos_visto_en_idx
  on public.musa_mensajes_vistos (visto_en);

alter table public.musa_mensajes_vistos enable row level security;

-- Solo el servicio escribe y lee: sin políticas, nadie más entra.
comment on table public.musa_mensajes_vistos is
  'Ids de mensajes ya procesados. Evita respuestas duplicadas cuando Evolution reintenta.';

-- Limpieza: los ids de más de 7 días no aportan (Evolution reintenta minutos).
create or replace function public.musa_limpiar_vistos() returns void
language sql security definer as $$
  delete from public.musa_mensajes_vistos where visto_en < now() - interval '7 days';
$$;
