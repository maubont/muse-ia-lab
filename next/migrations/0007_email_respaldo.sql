-- 0007: email de respaldo del comprador.
--
-- Sin un canal que sobreviva a un bloqueo de WhatsApp, la base de compradores se
-- puede evaporar en una noche. El email es ese canal: barato de pedir y el único
-- que no depende de Meta.

alter table public.musa_leads add column if not exists email text;

comment on column public.musa_leads.email is
  'Correo de respaldo. Se captura cuando el cliente lo escribe; sirve para avisar del acceso si WhatsApp falla.';

create index if not exists musa_leads_email_idx on public.musa_leads (lower(email)) where email is not null;
