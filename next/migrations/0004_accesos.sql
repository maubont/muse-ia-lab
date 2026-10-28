-- 0004_accesos.sql — acceso personal al curso.
--
-- Hoy la entrega son 17 enlaces de Drive pegados en el chat: cualquiera los
-- reenvía y no hay forma de revocar. Esto crea un acceso con nombre y apellido:
-- un token por comprador, con caducidad y revocación.
--
-- LÍMITE HONESTO: mientras el contenido viva en carpetas públicas de Drive, esto
-- es una puerta más bonita, NO una cerradura. El día que los archivos se muden a
-- almacenamiento propio (P3), basta con cambiar el origen de los enlaces: la
-- estructura de acceso ya está.
--
-- Escrita a mano: es una tabla nueva del repo nuevo.

create table if not exists public.musa_accesos (
  id bigint generated always as identity primary key,
  lead_phone text not null references public.musa_leads(phone) on delete cascade,
  token text not null unique,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  revocado_en timestamptz,
  ultimo_acceso timestamptz,
  visitas integer not null default 0
);

create index if not exists musa_accesos_lead_idx on public.musa_accesos (lead_phone);

-- Un solo acceso vigente por teléfono: si se reemite, se revoca el anterior
-- antes de insertar (lo hace el código, no un índice parcial, para dejar rastro).
create index if not exists musa_accesos_vigentes_idx
  on public.musa_accesos (lead_phone)
  where revocado_en is null;

alter table public.musa_accesos enable row level security;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'musa_accesos'
  ) then
    raise exception 'musa_accesos no se creó';
  end if;
end $$;
