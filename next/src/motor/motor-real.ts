// next/src/motor/motor-real.ts — el MOTOR que corre de verdad contra Postgres.
//
// Es la costura final: recibe un `MensajeEntrante` del canal, carga el lead, pide
// la decisión al enrutador, ejecuta los efectos y persiste. No inventa nada: si
// una pieza no está (GPT, visión), el enrutador y el repositorio ya saben qué
// hacer de forma segura.
//
// CONTRATO CON EL SERVIDOR: este motor envía por su cuenta (los efectos `enviar`
// pasan por el repositorio y de ahí al canal), así que devuelve `[]`. Si devolviera
// los mensajes, el servidor los enviaría otra vez.

import type { Motor } from "./contrato.ts";
import type { MensajeEntrante, MensajeSaliente, Canal } from "../../../functions/canal/tipos.ts";
import type { Consultar } from "../db/repositorio.ts";
import { crearRepositorio } from "../db/repositorio.ts";
import { leerConfigFunnel } from "../db/config-funnel.ts";
import type { CfgFunnel } from "../db/config-funnel.ts";
import { decidirRuta } from "./router.ts";
import { ejecutar } from "./ejecutar.ts";
import type { ClasificacionGPT } from "./efectos.ts";
import { normalizar } from "../../../functions/motor/guardarrailes.ts";

export interface DepsMotorReal {
  consultar: Consultar;
  canal: Canal;
  /** Se recalcula cada cierto tiempo; por defecto cada 60 s. */
  ttlConfigMs?: number;
  /** Clasificador GPT. Sin él, las heurísticas deciden y el resto se re-pregunta. */
  clasificar?: (mensaje: MensajeEntrante, estado: string) => Promise<ClasificacionGPT>;
  ahora?: () => Date;
  /** Espera entre mensajes; inyectable para que las pruebas no duerman. */
  esperar?: (ms: number) => Promise<void>;
}

interface LeadFila {
  phone: string;
  profile_name: string | null;
  nombre: string | null;
  pais: string | null;
  estado_funnel: string;
  mayor_18: boolean | null;
  opt_out: boolean;
  escalado_humano: boolean;
  pagado: boolean;
  last_in_at: string | null;
}

const SQL_UPSERT = `
  insert into public.musa_leads (phone, profile_name, estado_funnel, last_in_at, bono_rapido_hasta)
  values ($1, $2, 'S00_LLEGADA', now(), now() + interval '24 hours')
  on conflict (phone) do update
    set last_in_at = now(),
        profile_name = coalesce(excluded.profile_name, public.musa_leads.profile_name),
        updated_at = now()
  returning phone, profile_name, nombre, pais, estado_funnel, mayor_18, opt_out, escalado_humano, pagado, last_in_at
`;

const SQL_MENSAJE = `
  insert into public.musa_messages (lead_phone, direction, body, media_url, media_type, estado_funnel)
  values ($1, 'in', $2, $3, $4, $5)
`;

/** Lee el país del lead (columnas reales de la fila). */
function aLead(fila: LeadFila) {
  return {
    phone: fila.phone,
    profile_name: fila.profile_name,
    nombre: fila.nombre,
    pais: fila.pais,
    estado_funnel: fila.estado_funnel,
    mayor_18: fila.mayor_18,
    opt_out: fila.opt_out,
    escalado_humano: fila.escalado_humano,
    pagado: fila.pagado,
    last_in_at: fila.last_in_at,
  };
}

export function crearMotorReal(deps: DepsMotorReal): Motor {
  const { consultar, canal } = deps;
  const ttl = deps.ttlConfigMs ?? 60_000;
  const ahora = deps.ahora ?? (() => new Date());

  let cache: { cfg: CfgFunnel; cargado: number } | null = null;

  const configuracion = async (): Promise<CfgFunnel> => {
    const t = ahora().getTime();
    if (cache && t - cache.cargado < ttl) return cache.cfg;
    const cfg = await leerConfigFunnel(consultar);
    cache = { cfg, cargado: t };
    return cfg;
  };

  return {
    async procesar(mensaje: MensajeEntrante): Promise<MensajeSaliente[]> {
      const cfg = await configuracion();

      // 1. lead: crear o tocar (la base decide: `on conflict`)
      const { rows } = await consultar(SQL_UPSERT, [mensaje.telefono, mensaje.nombre_perfil]);
      const fila = rows[0] as unknown as LeadFila | undefined;
      if (!fila) throw new Error("upsert de lead sin fila devuelta");
      const lead = aLead(fila);

      // 2. dejar rastro del mensaje entrante ANTES de decidir
      await consultar(SQL_MENSAJE, [
        mensaje.telefono,
        mensaje.texto || null,
        mensaje.media?.url ?? null,
        mensaje.media?.mime ?? null,
        lead.estado_funnel,
      ]);

      // 3. clasificación (solo si hay clasificador; sin él, la heurística manda)
      const clasificacion = deps.clasificar && mensaje.texto
        ? await deps.clasificar(mensaje, lead.estado_funnel)
        : null;

      // 4. decisión
      const efectos = decidirRuta({
        lead,
        cfg: cfg as never,
        body: mensaje.texto,
        norm: normalizar(mensaje.texto),
        clasificacion,
      });

      // 5. ejecución contra Postgres
      const repo = crearRepositorio({
        consultar,
        canal,
        telefonoOperador: cfg.operador?.whatsapp ?? "",
        esperar: deps.esperar,
      });
      await ejecutar(efectos, { repo, phone: mensaje.telefono });

      // El motor envía por los efectos; devolver algo aquí duplicaría el envío.
      return [];
    },
  };
}

/** Reexportado para las pruebas. */
export type { Motor };
