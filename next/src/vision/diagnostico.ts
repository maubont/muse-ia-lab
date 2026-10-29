// next/src/vision/diagnostico.ts — PRUEBA DE VERDAD: ¿lee bien NUESTROS comprobantes?
//
// El diagnóstico de texto solo demuestra que la clave y el modelo responden. Esto
// demuestra lo que importa: que el modelo saca bien el monto, el destino y la
// referencia de los comprobantes reales que usamos.
//
// Usa las tres imágenes de `comprobantes-prueba/` y compara contra lo que está
// impreso en ellas. Coste por pasada: del orden de 0,001 USD con gpt-6-luna.

import { readFileSync } from "node:fs";
import { leerConProveedor } from "./proveedor.ts";
import type { ConfigProveedor } from "./proveedor.ts";
import { costeEstimado } from "./presupuesto.ts";

export interface CasoDiagnostico {
  archivo: string;
  nombre: string;
  esperado: {
    monto: number;
    moneda: string;
    destino: string;
    referencia: string;
    estado: string;
  };
}

/** Lo que se ve a simple vista en cada imagen del repo. */
export const CASOS: CasoDiagnostico[] = [
  {
    archivo: "comprobantes-prueba/1-nequi-aprueba.png",
    nombre: "Nequi · envío exitoso",
    esperado: { monto: 33000, moneda: "COP", destino: "3223565761", referencia: "1834502671", estado: "exitosa" },
  },
  {
    archivo: "comprobantes-prueba/2-pagomovil-aprueba.png",
    nombre: "Pago Móvil · Venezuela",
    esperado: { monto: 7400, moneda: "VES", destino: "04141234567", referencia: "004812670933", estado: "exitosa" },
  },
  {
    archivo: "comprobantes-prueba/3-nequi-cola-humana.png",
    nombre: "Nequi · programada",
    esperado: { monto: 33000, moneda: "COP", destino: "3223565761", referencia: "7740031288", estado: "programada" },
  },
];

const digitos = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

export interface ResultadoCaso {
  nombre: string;
  ok: boolean;
  ms: number;
  coste: number;
  datos: Record<string, unknown> | null;
  fallos: string[];
  motivo?: string;
}

export interface ResultadoDiagnostico {
  ok: boolean;
  casos: ResultadoCaso[];
  costeTotal: number;
  aciertos: number;
  total: number;
}

/**
 * Corre los casos indicados contra el proveedor real.
 * `leerArchivo` es inyectable para poder probar sin disco ni red.
 */
export async function diagnosticarImagenes(
  cfg: ConfigProveedor,
  opciones: {
    casos?: CasoDiagnostico[];
    leerArchivo?: (ruta: string) => Buffer;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ResultadoDiagnostico> {
  const casos = opciones.casos ?? CASOS;
  const leer = opciones.leerArchivo ?? ((ruta: string) => readFileSync(ruta));
  const resultados: ResultadoCaso[] = [];
  let costeTotal = 0;
  let aciertos = 0;
  let total = 0;

  for (const caso of casos) {
    let bytes: Buffer;
    try {
      bytes = leer(caso.archivo);
    } catch {
      resultados.push({
        nombre: caso.nombre, ok: false, ms: 0, coste: 0, datos: null,
        fallos: ["archivo_no_encontrado"], motivo: caso.archivo,
      });
      total += 5;
      continue;
    }

    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const t0 = Date.now();
    const r = await leerConProveedor(cfg, dataUrl, opciones.fetchImpl);
    const ms = Date.now() - t0;
    const coste = costeEstimado(r.tokensEntrada, r.tokensSalida, {
      entrada: cfg.precioEntrada,
      salida: cfg.precioSalida,
    });
    costeTotal += coste;

    if (!r.datos) {
      resultados.push({ nombre: caso.nombre, ok: false, ms, coste, datos: null, fallos: [], motivo: r.motivoFallo });
      total += 5;
      continue;
    }

    const d = r.datos;
    const comprobaciones: Array<[string, boolean]> = [
      ["monto", Number(d.monto) === caso.esperado.monto],
      ["moneda", String(d.moneda ?? "").toUpperCase() === caso.esperado.moneda],
      ["destino", digitos(d.destino) === digitos(caso.esperado.destino)],
      ["referencia", digitos(d.numero_referencia) === digitos(caso.esperado.referencia)],
      ["estado", String(d.estado_operacion ?? "") === caso.esperado.estado],
    ];
    const fallos = comprobaciones.filter(([, bien]) => !bien).map(([campo]) => campo);
    total += comprobaciones.length;
    aciertos += comprobaciones.length - fallos.length;

    resultados.push({
      nombre: caso.nombre,
      ok: fallos.length === 0,
      ms,
      coste,
      datos: d as unknown as Record<string, unknown>,
      fallos,
    });
  }

  return {
    ok: resultados.every((r) => r.ok),
    casos: resultados,
    costeTotal,
    aciertos,
    total,
  };
}
/**
 * Diagnóstico con UNA imagen que envía el cliente.
 *
 * Por qué así: los comprobantes de prueba están ignorados por git (privacidad), así
 * que NO viajan al contenedor. En lugar de meterlos en el repo, la imagen viaja en
 * la petición y el servidor solo responde lo que leyó. Nada sensible se almacena.
 */
export async function diagnosticarImagenSuelta(
  cfg: ConfigProveedor,
  base64: string,
  esperado?: Partial<CasoDiagnostico["esperado"]>,
  opciones: { fetchImpl?: typeof fetch; tipo?: string } = {},
): Promise<ResultadoCaso & { coste: number; tokens?: { entrada: number; salida: number } }> {
  const tipo = opciones.tipo ?? "image/png";
  const dataUrl = `data:${tipo};base64,${base64}`;
  const t0 = Date.now();
  const r = await leerConProveedor(cfg, dataUrl, opciones.fetchImpl);
  const ms = Date.now() - t0;
  const coste = costeEstimado(r.tokensEntrada, r.tokensSalida, {
    entrada: cfg.precioEntrada,
    salida: cfg.precioSalida,
  });

  if (!r.datos) {
    return { nombre: "imagen_enviada", ok: false, ms, coste, datos: null, fallos: [], motivo: r.motivoFallo };
  }

  const d = r.datos;
  const fallos: string[] = [];
  if (esperado) {
    if (esperado.monto !== undefined && Number(d.monto) !== Number(esperado.monto)) fallos.push("monto");
    if (esperado.moneda !== undefined && String(d.moneda ?? "").toUpperCase() !== esperado.moneda) fallos.push("moneda");
    if (esperado.destino !== undefined && digitos(d.destino) !== digitos(esperado.destino)) fallos.push("destino");
    if (esperado.referencia !== undefined && digitos(d.numero_referencia) !== digitos(esperado.referencia)) fallos.push("referencia");
    if (esperado.estado !== undefined && String(d.estado_operacion ?? "") !== esperado.estado) fallos.push("estado");
  }

  return {
    nombre: "imagen_enviada",
    ok: fallos.length === 0,
    ms,
    coste,
    datos: d as unknown as Record<string, unknown>,
    fallos,
    tokens: { entrada: r.tokensEntrada, salida: r.tokensSalida },
  };
}