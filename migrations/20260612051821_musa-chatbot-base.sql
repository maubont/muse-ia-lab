-- Chatbot de ventas WhatsApp «Musa» — esquema base (Fase 1)
-- Tablas con prefijo musa_ para convivir con el proyecto cv-mauricio.
-- Todas son de uso exclusivo del servidor (edge functions con API key admin):
-- RLS habilitado SIN políticas = anon/authenticated no leen ni escriben.

create table public.musa_leads (
  phone text primary key,
  profile_name text,
  nombre text,
  pais text check (pais in ('VE','CO','OTRO')),
  estado_funnel text not null default 'S00_LLEGADA',
  mayor_18 boolean,
  avatar_enviado boolean not null default false,
  ctwa_clid text,
  source_id text,
  ref_code text,
  opt_out boolean not null default false,
  opt_in_vip boolean not null default false,
  pagado boolean not null default false,
  escalado_humano boolean not null default false,
  bono_rapido_hasta timestamptz,
  capi_lead_sent boolean not null default false,
  capi_purchase_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.musa_messages (
  id bigint generated always as identity primary key,
  lead_phone text not null references public.musa_leads(phone) on delete cascade,
  direction text not null check (direction in ('in','out')),
  body text,
  media_url text,
  media_type text,
  twilio_sid text,
  estado_funnel text,
  created_at timestamptz not null default now()
);
create index musa_messages_lead_idx on public.musa_messages (lead_phone, created_at);

create table public.musa_payments (
  id bigint generated always as identity primary key,
  lead_phone text not null references public.musa_leads(phone),
  metodo text not null,
  ref_normalizada text,
  monto numeric,
  moneda text,
  fecha_pago date,
  image_phash text,
  storage_key text,
  status text not null default 'pendiente'
    check (status in ('pendiente','aprobado','rechazado','revision')),
  datos_extraidos jsonb,
  motivo_flag text,
  short_id text unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint musa_payments_ref_unica unique (metodo, ref_normalizada)
);
create index musa_payments_lead_idx on public.musa_payments (lead_phone);
create index musa_payments_phash_idx on public.musa_payments (image_phash);

create table public.musa_exchange_rates (
  id bigint generated always as identity primary key,
  fecha date not null,
  fuente text not null,
  tasa numeric not null,
  created_at timestamptz not null default now()
);
create index musa_exchange_rates_fecha_idx on public.musa_exchange_rates (fecha);

create table public.musa_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.musa_videos_cache (
  nombre_normalizado text primary key,
  storage_key text not null,
  proveedor text,
  created_at timestamptz not null default now()
);

create table public.musa_funnel_events (
  id bigint generated always as identity primary key,
  lead_phone text,
  evento text not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);
create index musa_funnel_events_lead_idx on public.musa_funnel_events (lead_phone);
create index musa_funnel_events_evento_idx on public.musa_funnel_events (evento, created_at);

create table public.musa_testimonios (
  id bigint generated always as identity primary key,
  lead_phone text references public.musa_leads(phone),
  texto text not null,
  permiso boolean not null default false,
  created_at timestamptz not null default now()
);

-- Trigger: updated_at automático en musa_leads
create or replace function public.musa_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger musa_leads_touch
  before update on public.musa_leads
  for each row execute function public.musa_touch_updated_at();

-- RLS: habilitado sin políticas → solo el servidor (API key admin) accede
alter table public.musa_leads enable row level security;
alter table public.musa_messages enable row level security;
alter table public.musa_payments enable row level security;
alter table public.musa_exchange_rates enable row level security;
alter table public.musa_settings enable row level security;
alter table public.musa_videos_cache enable row level security;
alter table public.musa_funnel_events enable row level security;
alter table public.musa_testimonios enable row level security;

-- Configuración inicial (config de la app, editable sin tocar código)
insert into public.musa_settings (key, value) values
('precio', '{"usd": 9, "cop": 33000, "margen_bs": 1.02}'),
('cuentas_ve', '{"provisional": true, "pago_movil": {"banco": "0102 Banco de Venezuela", "telefono": "0412-0000000", "cedula": "V-00.000.000", "titular": "PENDIENTE"}, "cuenta": {"numero": "01020000000000000000", "tipo": "corriente", "titular": "PENDIENTE", "cedula": "PENDIENTE"}}'),
('cuentas_co', '{"provisional": false, "bancolombia": {"tipo": "ahorros", "numero": "82061072256", "titular": "Mau** Bon**"}, "nequi": {"numero": "3223565761", "titular": "PENDIENTE"}, "breb": {"llave": "3223565761", "titular": "PENDIENTE"}}'),
('horario_verificacion', '{"inicio": 8, "fin": 22, "tz": "America/Caracas"}'),
('marca', '{"asesora": "Musa", "display_name": "Modelos IA", "firma": "— Musa 💜 | Modelos IA"}'),
('avatar', '{"personalizado_activo": true, "duracion_s": 6, "tts": "openai"}'),
('entrega', '{"modulos": [
  "https://drive.google.com/drive/folders/11zAllQMiP_kjCkrSfe-yig0PRDa5diBf?usp=sharing",
  "https://drive.google.com/drive/folders/1N9hKATsJrWa2zbZaMoLTozfNk4LaOCQL?usp=sharing",
  "https://drive.google.com/drive/folders/1_YS_OOLHaTPEvaix_UFSCg66M-i8Bndv?usp=sharing",
  "https://drive.google.com/drive/folders/1Th9l8qCSAc_pAkqt3sIK_RdlE_oRP4eS?usp=sharing",
  "https://drive.google.com/drive/folders/12vkzzOMrnOV20cwuFKsUOb7OOPy5PEFP?usp=sharing",
  "https://drive.google.com/drive/folders/1CArGZfj_LlhOpgWM5awcIv3pcUKDkpBF?usp=sharing",
  "https://drive.google.com/drive/folders/1zJDQnRVCKPMggMCAM1uwJGmi5IIZfClj?usp=sharing",
  "https://drive.google.com/drive/folders/1qfiplYpR40tNj7MwrE8-JBpBQhiifG4r?usp=sharing",
  "https://drive.google.com/drive/folders/1UPF-LCR65vkYaZGfAT4SHQ2Ye6q6M_eP?usp=sharing",
  "https://drive.google.com/drive/folders/1t62ClpZ9oSbnf-jNM5Tj6oGqmcP2gwPt?usp=sharing",
  "https://drive.google.com/drive/folders/1PXET9HlzhU7ZZdq6Dgy9FDXdGWi-e6kA?usp=sharing",
  "https://drive.google.com/drive/folders/1ZIZ8ehMi8Ih1bgyxhRGwHFHQz3lIMfx1?usp=sharing",
  "https://drive.google.com/drive/folders/1BCXYfrsZhmWxm4Oww3S-D60FKX4HDtSZ?usp=sharing"
], "bonos": {
  "coleccion_modelos": "https://drive.google.com/drive/folders/1rkrx4eTHdAF90YOYjoUva328Ci_M6nMZ?usp=sharing",
  "audios_fempro": "https://drive.google.com/drive/folders/1prpULrTfut-46O_BXEakZv8CIOt1HQrg?usp=sharing",
  "youtube_money_machine": "https://drive.google.com/drive/folders/1UMwTq1GoSopEoTc_wtRP8_V7n-dnbB3M?usp=sharing",
  "megapack_master_ia": "https://drive.google.com/drive/folders/1ujtfclhZHI0oVGM9aZ0cpGU43ZHAPsFe?usp=sharing"
}, "link_grupo": "PENDIENTE"}');
