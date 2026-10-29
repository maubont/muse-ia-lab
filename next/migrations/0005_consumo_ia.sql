-- 0005_consumo_ia.sql — registro de gasto en modelos de IA.
--
-- POR QUÉ EXISTE: el gasto en IA es invisible por naturaleza. Una llamada aquí,
-- otra allá, y a fin de mes llega la factura sin saber qué la produjo. Cada
-- llamada deja su rastro aquí, con coste, y el presupuesto diario se comprueba
-- contra esta tabla ANTES de llamar.
--
-- La regla: si el presupuesto está agotado, el sistema NO se queda sin hacer nada;
-- manda el caso a la cola humana, que ya funciona.
--
-- Escrita a mano: tabla nueva del repo nuevo.

create table if not exists public.musa_consumo_ia (
  id bigint generated always as identity primary key,
  lead_phone text,
  proveedor text not null,
  modelo text not null,
  proposito text not null,              -- 'comprobante' | 'conversacion' | 'transcripcion'
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  coste_usd numeric(10, 6) not null default 0,
  exito boolean not null default true,
  motivo_fallo text,
  creado_en timestamptz not null default now()
);

-- El presupuesto diario se consulta sumando el día: este índice lo hace barato.
create index if not exists musa_consumo_ia_dia_idx on public.musa_consumo_ia (creado_en);

-- Cache de lecturas: el mismo comprobante no se paga dos veces.
create table if not exists public.musa_lecturas_cache (
  huella text primary key,             -- sha256 de los bytes de la imagen
  resultado jsonb not null,            -- datos extraídos
  modelo text not null,
  coste_usd numeric(10, 6) not null default 0,
  creado_en timestamptz not null default now()
);

alter table public.musa_consumo_ia enable row level security;
alter table public.musa_lecturas_cache enable row level security;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='musa_consumo_ia') then
    raise exception 'musa_consumo_ia no se creó';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='musa_lecturas_cache') then
    raise exception 'musa_lecturas_cache no se creó';
  end if;
end $$;
