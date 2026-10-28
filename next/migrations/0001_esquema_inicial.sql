-- 0001_esquema_inicial.sql — GENERADO, no editar a mano.
-- Fuente: seed/esquema-musa.json + seed/restricciones.json (exportados de producción).
-- Regenerar con: node next/scripts/generar-esquema.mjs
-- Verificar con: node next/scripts/verificar-esquema.mjs

-- Extensión necesaria para pHash/dedupe (sin uso aún, disponible desde el día 1).
create extension if not exists pg_trgm;

create table public.musa_leads (
  phone text not null,
  profile_name text,
  nombre text,
  pais text,
  estado_funnel text not null default 'S00_LLEGADA'::text,
  mayor_18 boolean,
  avatar_enviado boolean not null default false,
  ctwa_clid text,
  source_id text,
  ref_code text,
  opt_out boolean not null default false,
  opt_in_vip boolean not null default false,
  pagado boolean not null default false,
  escalado_humano boolean not null default false,
  bono_rapido_hasta timestamp with time zone,
  capi_lead_sent boolean not null default false,
  capi_purchase_sent boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_in_at timestamp with time zone,
  last_out_at timestamp with time zone,
  seguimientos_enviados integer not null default 0,
  constraint musa_leads_pkey PRIMARY KEY (phone),
  constraint musa_leads_pais_check CHECK ((pais = ANY (ARRAY['VE'::text, 'CO'::text, 'OTRO'::text])))
);

alter table public.musa_leads enable row level security;

create table public.musa_messages (
  id bigint generated always as identity,
  lead_phone text not null,
  direction text not null,
  body text,
  media_url text,
  media_type text,
  twilio_sid text,
  estado_funnel text,
  created_at timestamp with time zone not null default now(),
  constraint musa_messages_pkey PRIMARY KEY (id),
  constraint musa_messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
  constraint musa_messages_lead_phone_fkey FOREIGN KEY (lead_phone) REFERENCES musa_leads(phone) ON DELETE CASCADE
);

CREATE INDEX musa_messages_lead_idx ON public.musa_messages USING btree (lead_phone, created_at);
CREATE UNIQUE INDEX musa_messages_twilio_sid_uq ON public.musa_messages USING btree (twilio_sid) WHERE (twilio_sid IS NOT NULL);

alter table public.musa_messages enable row level security;

create table public.musa_payments (
  id bigint generated always as identity,
  lead_phone text not null,
  metodo text not null,
  ref_normalizada text,
  monto numeric,
  moneda text,
  fecha_pago date,
  image_phash text,
  storage_key text,
  status text not null default 'pendiente'::text,
  datos_extraidos jsonb,
  motivo_flag text,
  short_id text,
  created_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone,
  constraint musa_payments_pkey PRIMARY KEY (id),
  constraint musa_payments_ref_unica UNIQUE (metodo, ref_normalizada),
  constraint musa_payments_short_id_key UNIQUE (short_id),
  constraint musa_payments_status_check CHECK ((status = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'revision'::text]))),
  constraint musa_payments_lead_phone_fkey FOREIGN KEY (lead_phone) REFERENCES musa_leads(phone)
);

CREATE INDEX musa_payments_lead_idx ON public.musa_payments USING btree (lead_phone);
CREATE INDEX musa_payments_phash_idx ON public.musa_payments USING btree (image_phash);

alter table public.musa_payments enable row level security;

create table public.musa_exchange_rates (
  id bigint generated always as identity,
  fecha date not null,
  fuente text not null,
  tasa numeric not null,
  created_at timestamp with time zone not null default now(),
  constraint musa_exchange_rates_pkey PRIMARY KEY (id)
);

CREATE INDEX musa_exchange_rates_fecha_idx ON public.musa_exchange_rates USING btree (fecha);

alter table public.musa_exchange_rates enable row level security;

create table public.musa_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null default now(),
  constraint musa_settings_pkey PRIMARY KEY (key)
);

alter table public.musa_settings enable row level security;

create table public.musa_videos_cache (
  nombre_normalizado text not null,
  storage_key text not null,
  proveedor text,
  created_at timestamp with time zone not null default now(),
  constraint musa_videos_cache_pkey PRIMARY KEY (nombre_normalizado)
);

alter table public.musa_videos_cache enable row level security;

create table public.musa_funnel_events (
  id bigint generated always as identity,
  lead_phone text,
  evento text not null,
  detalle jsonb,
  created_at timestamp with time zone not null default now(),
  constraint musa_funnel_events_pkey PRIMARY KEY (id)
);

CREATE INDEX musa_funnel_events_evento_idx ON public.musa_funnel_events USING btree (evento, created_at);
CREATE INDEX musa_funnel_events_lead_idx ON public.musa_funnel_events USING btree (lead_phone);

alter table public.musa_funnel_events enable row level security;

create table public.musa_testimonios (
  id bigint generated always as identity,
  lead_phone text,
  texto text not null,
  permiso boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint musa_testimonios_pkey PRIMARY KEY (id),
  constraint musa_testimonios_lead_phone_fkey FOREIGN KEY (lead_phone) REFERENCES musa_leads(phone)
);

alter table public.musa_testimonios enable row level security;

-- Fin del esquema. Las reglas de negocio (funnel, copy, precios) viven en seed/musa_settings.json.
