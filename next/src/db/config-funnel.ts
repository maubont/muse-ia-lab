// next/src/db/config-funnel.ts — carga `musa_settings` y lo mapea al `Cfg` del motor.
//
// La base guarda snake_case (`funnel_copy`, `precio_bs_hoy`); el motor usa
// camelCase (`funnelCopy`, `precioBsHoy`). Este mapeo es el MISMO que hace el
// webhook original (musa-webhook-twilio.ts:264-302). Si se cambia aquí y no allí,
// las dos implementaciones dejan de comportarse igual.

import type { Consultar } from "./repositorio.ts";

export interface CfgFunnel {
  funnelCopy: {
    etapas: Array<{ id: string; mensajes: string[]; ramas?: Record<string, { mensajes?: string[]; sin_video?: string }> }>;
    objeciones?: Array<{ objecion: string; respuesta: string }>;
  };
  precio: { usd: number; cop: number };
  precioBsHoy: { bs: number };
  cuentasVe: Record<string, unknown>;
  cuentasCo: Record<string, unknown>;
  entrega: {
    modulos?: string[];
    bonos?: Record<string, string>;
    plan_accion_7dias?: string;
    link_grupo?: string;
  };
  marca: { asesora?: string; firma?: string };
  /** Países habilitados para el negocio. ["CO"] = solo Colombia. */
  paisesHabilitados: string[];
  operador: { whatsapp?: string };
}

export const CLAVES = [
  "funnel_copy",
  "precio",
  "precio_bs_hoy",
  "cuentas_ve",
  "cuentas_co",
  "entrega",
  "marca",
  "operador",
  "paises_habilitados",
] as const;

function sanitizarFunnelCopy(fc: CfgFunnel["funnelCopy"]): CfgFunnel["funnelCopy"] {
  if (!fc || typeof fc !== "object") return fc;
  try {
    const json = JSON.stringify(fc);
    if (!/google drive/i.test(json)) return fc;
    const limpio = json.replace(/enlaces directos de Google Drive/gi, "tu enlace personal al área del curso");
    return JSON.parse(limpio);
  } catch {
    return fc;
  }
}

/** Lee las claves necesarias. Valores por defecto explícitos, como el original. */
export async function leerConfigFunnel(consultar: Consultar): Promise<CfgFunnel> {
  const { rows } = await consultar(
    "select key, value from public.musa_settings where key = any($1::text[])",
    [CLAVES as unknown as string[]],
  );

  const mapa: Record<string, unknown> = {};
  for (const fila of rows) mapa[String(fila.key)] = fila.value;

  const funnelCopy = sanitizarFunnelCopy((mapa.funnel_copy ?? { etapas: [] }) as CfgFunnel["funnelCopy"]);

  // Auto-sanitización en la base de datos si contenía copy antiguo
  if (mapa.funnel_copy && /google drive/i.test(JSON.stringify(mapa.funnel_copy))) {
    consultar(
      "update public.musa_settings set value = $1::jsonb, updated_at = now() where key = 'funnel_copy'",
      [JSON.stringify(funnelCopy)],
    ).catch(() => {});
  }

  return {
    funnelCopy,
    precio: (mapa.precio ?? { usd: 9, cop: 33000 }) as CfgFunnel["precio"],
    precioBsHoy: (mapa.precio_bs_hoy ?? { bs: 7400 }) as CfgFunnel["precioBsHoy"],
    cuentasVe: (mapa.cuentas_ve ?? {}) as Record<string, unknown>,
    cuentasCo: (mapa.cuentas_co ?? {}) as Record<string, unknown>,
    entrega: (mapa.entrega ?? {}) as CfgFunnel["entrega"],
    marca: (mapa.marca ?? {}) as CfgFunnel["marca"],
    paisesHabilitados: (Array.isArray(mapa.paises_habilitados) && mapa.paises_habilitados.length > 0
      ? (mapa.paises_habilitados as string[])
      : ["CO"]) as string[],
    operador: (mapa.operador ?? {}) as CfgFunnel["operador"],
  };
}
