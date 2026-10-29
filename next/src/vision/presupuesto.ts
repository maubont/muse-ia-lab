// next/src/vision/presupuesto.ts — EL FRENO.
//
// El gasto en IA se descontrola por dos vías: un pico de tráfico, o un bucle que
// reintenta. Este módulo corta las dos: se consulta ANTES de cada llamada y, si no
// hay margen, el sistema NO se queda sin responder — manda el caso a la cola
// humana, que ya funciona.
//
// Se mide contra la tabla real de consumo: lo que se gastó hoy, no una estimación.

import type { Consultar } from "../db/repositorio.ts";

/** Presupuesto por defecto si no hay variable de entorno. Deliberadamente bajo. */
export const PRESUPUESTO_DIARIO_POR_DEFECTO = 1;

export interface EstadoPresupuesto {
  permitido: boolean;
  /** lo gastado hoy, en USD */
  gastado: number;
  /** el tope del día */
  tope: number;
  /** cuánto queda */
  restante: number;
  motivo?: string;
}

/** Coste estimado ANTES de llamar: se descuenta del presupuesto para no pasarse. */
export function costeEstimado(tokensEntrada: number, tokensSalida: number, precios: { entrada: number; salida: number }): number {
  return (tokensEntrada / 1_000_000) * precios.entrada + (tokensSalida / 1_000_000) * precios.salida;
}

/**
 * Lee lo gastado hoy y decide si se puede llamar.
 * `estimado` se exige por adelantado: si no cabe, no se llama.
 */
export async function consultarPresupuesto(
  consultar: Consultar,
  opciones: { tope?: number; estimado?: number; ahora?: Date } = {},
): Promise<EstadoPresupuesto> {
  const tope = opciones.tope ?? PRESUPUESTO_DIARIO_POR_DEFECTO;
  const estimado = opciones.estimado ?? 0;

  if (tope <= 0) {
    return { permitido: false, gastado: 0, tope, restante: 0, motivo: "presupuesto_desactivado" };
  }

  let gastado = 0;
  try {
    const { rows } = await consultar(
      "select coalesce(sum(coste_usd), 0)::float8 as gastado from public.musa_consumo_ia where creado_en >= date_trunc('day', now())",
      [],
    );
    gastado = Number((rows[0] as { gastado?: number } | undefined)?.gastado ?? 0);
  } catch {
    // Si no se puede consultar, se asume lo peor: no gastar. Fallar hacia seguro.
    return { permitido: false, gastado: 0, tope, restante: 0, motivo: "no_se_pudo_consultar_el_gasto" };
  }

  const restante = Math.max(0, tope - gastado);
  if (gastado + estimado > tope) {
    return {
      permitido: false,
      gastado,
      tope,
      restante,
      motivo: restante <= 0 ? "presupuesto_agotado" : "no_cabe_en_el_presupuesto",
    };
  }

  return { permitido: true, gastado, tope, restante };
}

/** Registra una llamada. Nunca lanza: el flujo no se rompe por telemetría. */
export async function registrarConsumo(
  consultar: Consultar,
  datos: {
    lead?: string | null;
    proveedor: string;
    modelo: string;
    proposito: string;
    tokensEntrada: number;
    tokensSalida: number;
    coste: number;
    exito: boolean;
    motivoFallo?: string;
  },
): Promise<void> {
  try {
    await consultar(
      `insert into public.musa_consumo_ia
        (lead_phone, proveedor, modelo, proposito, tokens_entrada, tokens_salida, coste_usd, exito, motivo_fallo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        datos.lead ?? null,
        datos.proveedor,
        datos.modelo,
        datos.proposito,
        datos.tokensEntrada,
        datos.tokensSalida,
        Number(datos.coste.toFixed(6)),
        datos.exito,
        datos.motivoFallo ?? null,
      ],
    );
  } catch {
    /* la telemetría nunca tumba una venta */
  }
}
