// next/src/motor/s04.ts — ESTADO S04_GATE18 (verificación de mayoría de edad).
//
// Es el estado más delicado del funnel: aquí se decide si una persona puede o no
// comprar. Un falso «mayor» vende a un menor; un falso «menor» pierde la venta y
// deja al lead en silencio total.
//
// ── MÉTODO DE ESTE PORT (leer antes de tocar) ─────────────────────────────────
// Portado POR LECTURA de musa-webhook-twilio.ts:1829-1890, no por prueba
// diferencial (el sistema viejo no es ejecutable en este entorno: depende de
// InsForge y Deno). Se conserva la estructura de ramas EXACTA y el orden de los
// efectos. La diferencia con el original es que aquí la función es PURA: devuelve
// efectos en vez de ejecutarlos.
//
// Consecuencia honesta: la equivalencia de comportamiento está revisada a mano,
// no demostrada. Antes del cutover hay que pasar la puerta de paridad
// (`scripts/verificar-funnel-colombia.mjs`) contra el sistema viejo.
//
// Las llamadas a GPT NO viven aquí: la clasificación entra como dato y las
// respuestas libres salen como efectos. Así el gate se puede probar sin red.

import { edadDelGate } from "./gate-edad.ts";
import { clasificarEdadHeuristico, contienePregunta } from "../../../functions/motor/guardarrailes.ts";
import { etapa, resolverPlaceholders } from "../../../functions/motor/copy.ts";
import type { CfgCopy, LeadNombre } from "../../../functions/motor/copy.ts";
import type { ClasificacionGPT, Efecto, LeadMotor } from "./efectos.ts";

export type { ClasificacionGPT, Efecto };

// ============================== textos fijos ==============================

/** Se alterna con MSG_GATE18_REASK2 para no repetir el mismo mensaje seguido. */
export const MSG_GATE18_REASK =
  "Solo para estar segura antes de seguir 😊 ¿Ya tienes *18 años o más*? Respóndeme con un *sí* o dime tu edad, porfa ✨";

export const MSG_GATE18_REASK2 =
  "Jeje va 😊 pero necesito que me lo confirmes clarito: ¿ya tienes *18 años o más*? Apenas me digas que sí, seguimos con todos los detalles ✨";

export const PREGUNTA_S04 = "¿Me confirmas que ya tienes 18 años o más?";

/** Instrucción que se le da al GPT cuando el lead confirma edad pero además pregunta algo. */
export const INSTRUCCION_PREGUNTA_JUNTO_A_EDAD =
  "Si su duda se responde con los HECHOS CERRADOS, respóndela y avísale que ya mismo le pasas el precio y los detalles. " +
  "Si el dato NO está en los HECHOS CERRADOS, NO lo afirmes (ni con un sí inicial): di SOLO que lo confirmas con el equipo y que le escriben enseguida por aquí, sin prometer pasar el precio en este mismo mensaje.";

// ============================== tipos ==============================

export type LeadS04 = LeadMotor;

export interface EntradaS04 {
  lead: LeadS04;
  cfg: CfgCopy;
  body: string;
  norm: string;
  /** Solo se usa si la heurística no decide. El llamador la obtiene del GPT. */
  clasificacion?: ClasificacionGPT;
}

// ============================== decisión ==============================

/**
 * Decide qué hacer cuando el lead está en S04_GATE18.
 * Mismo orden de ramas que el original: mayor -> menor -> objeción -> afirmativo
 * ambiguo -> ambiguo sin pregunta -> fallback libre.
 */
export function decidirS04(entrada: EntradaS04): Efecto[] {
  const { lead, cfg, body, norm } = entrada;
  const efectos: Efecto[] = [];

  // La heurística marca «menor» cualquier mensaje que empiece por «no». Esta capa
  // lo corrige sin tocar el módulo verificado: ver gate-edad.ts.
  let edad = edadDelGate(norm);
  let cls: ClasificacionGPT = null;
  if (!edad) {
    cls = entrada.clasificacion ?? null;
    if (cls?.tipo === "edad_si") edad = "mayor";
    else if (cls?.tipo === "edad_menor") edad = "menor";
    // OJO: "afirmativo" genérico ("ok", "jaja ok") NO confirma edad. El gate exige
    // un sí inequívoco (edad_si o heurístico).
  }

  if (edad === "mayor") {
    efectos.push({ tipo: "lead", patch: { mayor_18: true } });
    efectos.push({ tipo: "estado", nuevo: "S06_CIERRE" });
    if (contienePregunta(body, norm)) {
      // Confirmó edad pero también preguntó algo: responderlo antes de seguir.
      efectos.push({
        tipo: "evento",
        nombre: "fallback_gpt",
        detalle: { etapa: lead.estado_funnel, motivo: "pregunta_junto_a_confirmacion" },
      });
      efectos.push({
        tipo: "gpt_responder",
        instruccion: INSTRUCCION_PREGUNTA_JUNTO_A_EDAD,
        abortar_si_escala: true,
      });
    }
    efectos.push({ tipo: "enviar", textos: mensajesPrecioYCierre(lead, cfg) });
    return efectos;
  }

  if (edad === "menor") {
    const s04 = etapa(cfg, "S04_STACK_18");
    efectos.push({ tipo: "lead", patch: { mayor_18: false } });
    efectos.push({ tipo: "estado", nuevo: "S92_MENOR" });
    efectos.push({ tipo: "evento", nombre: "menor_bloqueado", detalle: {} });
    const texto = s04.mensajes?.[2];
    // Sin el tercer mensaje del copy no se inventa uno: se calla. Un menor NO
    // debe recibir seguimientos.
    efectos.push({ tipo: "enviar", textos: texto ? [resolverPlaceholders(texto, lead, cfg)] : [] });
    return efectos;
  }

  if (cls?.tipo === "objecion" && cls.objecion_id) {
    efectos.push({ tipo: "responder_objecion", id: cls.objecion_id });
    efectos.push({ tipo: "enviar", textos: [PREGUNTA_S04] });
    return efectos;
  }

  if (cls?.tipo === "afirmativo") {
    // Afirmación ambigua: re-preguntar explícito, sin avanzar el gate.
    efectos.push({ tipo: "reask_gate", motivo: "afirmativo_ambiguo" });
    return efectos;
  }

  if (!contienePregunta(body, norm)) {
    // Ambiguo SIN pregunta real ("jaja ok", "mmm", emojis): el gate NUNCA se da
    // por pasado ni se delega al GPT libre. Se re-pregunta de forma determinista.
    efectos.push({ tipo: "reask_gate", motivo: "ambiguo_sin_pregunta" });
    return efectos;
  }

  efectos.push({ tipo: "gpt_fallback" });
  return efectos;
}

// ============================== piezas ==============================

/** S05 (precio) + S06 (cierre), listos para enviar. Ver original L1521-1531. */
export function mensajesPrecioYCierre(lead: LeadNombre, cfg: CfgCopy): string[] {
  const s05 = etapa(cfg, "S05_PRECIO");
  const s06 = etapa(cfg, "S06_CIERRE");
  const precio = s05.mensajes[0];
  const cierre = `${s05.mensajes[1]}\n\n${s06.mensajes[0]}`;
  return [
    resolverPlaceholders(precio, lead, cfg),
    resolverPlaceholders(cierre, lead, cfg),
  ];
}
