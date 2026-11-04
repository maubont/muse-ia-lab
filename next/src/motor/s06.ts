// next/src/motor/s06.ts — ESTADOS S06_CIERRE y S07_DATOS_PAGO.
//
// Son los dos estados que separan una conversación de una venta: aquí el lead dice
// «dale» y recibe los datos para pagar. Si esto se rompe, no entra dinero.
//
// ── MÉTODO DE ESTE PORT ───────────────────────────────────────────────────────
// Portado POR LECTURA de musa-webhook-twilio.ts:1941-2097. No hay prueba
// diferencial (el sistema viejo no es ejecutable aquí). La estructura de ramas y
// el orden de los efectos se conservan tal cual.
//
// FUERA DE ALCANCE A PROPÓSITO: la rama de **Wompi** (checkout con link firmado,
// L1942-2007). Wompi está dormido (`pago.proveedor = "manual"` en producción) y
// depende de secretos y de `wompiGenerarLink`. Cuando se active, entra aquí como
// un efecto más; no se porta código muerto.

import {
  esAfirmativoCierre,
  esNegativoCierre,
  contienePregunta,
  pideDatosDirecto,
} from "../../../functions/motor/guardarrailes.ts";
import {
  etapa,
  sinPrefijo,
  resolverPlaceholders,
  bloqueCuentasVE,
  bloqueCuentasCO,
  textoCuentasValido,
  metodosPagoDisponibles,
} from "../../../functions/motor/copy.ts";
import type { CfgCopy, LeadNombre } from "../../../functions/motor/copy.ts";
import type { ClasificacionGPT, Efecto, LeadMotor } from "./efectos.ts";

// ============================== textos fijos ==============================

export const MSG_NEGATIVO_SUAVE =
  "Todo bien, sin presión 😊 Aquí quedo por si te animas más adelante; cualquier duda me la escribes con confianza ✨";

/** Instrucción al GPT cuando el lead cierra pero además pregunta algo. */
export const INSTRUCCION_PREGUNTA_JUNTO_A_CIERRE =
  "Si su duda se responde con los HECHOS CERRADOS, respóndela y avísale que ya mismo le pasas los datos de pago. " +
  "Si el dato NO está en los HECHOS CERRADOS, NO lo afirmes (ni con un sí inicial): di SOLO que lo confirmas con el equipo y que le escriben enseguida por aquí, sin ofrecer enviar los datos de pago todavía.";

const MSG_SIN_DATOS =
  "¡Excelente decisión, {{nombre}}! 🙌 Déjame confirmar con el equipo los datos de pago actualizados y te escribo en un ratico por aquí mismo ✨";

// ============================== S06_CIERRE ==============================

export interface EntradaS06 {
  lead: LeadMotor;
  cfg: CfgCopy;
  body: string;
  norm: string;
  /** Solo se usa cuando la heurística no basta. La obtiene el llamador del GPT. */
  clasificacion?: ClasificacionGPT;
}

/**
 * Decide qué hacer en S06_CIERRE. Réplica de `manejarS06` (L2074-2097).
 * Orden: afirmativo heurístico -> negativo heurístico -> clasificación GPT.
 */
export function decidirS06(entrada: EntradaS06): Efecto[] {
  const { lead, cfg, body, norm } = entrada;

  // 1. Negativo primero (respeto total a la decisión del prospecto)
  if (esNegativoCierre(norm)) return [{ tipo: "enviar", textos: [MSG_NEGATIVO_SUAVE] }];

  // 2. Afirmativo heurístico de cierre -> Cierre inmediato con datos de pago
  if (esAfirmativoCierre(norm)) return cerrarConDatos(lead, cfg, body, norm);

  // 3. Consulta de Muestra / Ver Plataforma / Dónde se estudia
  const PIDE_VER_PLATAFORMA = /\b(ver|muestra|muestrame|mostrar|plataforma|academia|donde estudio|donde se estudia|donde voy a estudiar|como es el curso|como es la plataforma|contenido|dichoso curso|es serio|seriedad|estafa|desconfianza|probar|degustar)\b/i;
  if (PIDE_VER_PLATAFORMA.test(norm)) {
    return [{ tipo: "responder_objecion", id: 1, conRecierre: true }];
  }

  // 4. Saludo o reactivación en S06_CIERRE
  if (norm === "hola" || norm === "buenas" || norm === "buenos dias" || norm === "buenas tardes" || norm === "buenas noches") {
    return [{ tipo: "gpt_fallback" }];
  }

  // 5. Objeciones comunes resueltas directamente con recierre:
  if (/\b(cuanto\s+(vale|cuesta|es)|que\s+(precio|valor|costo)\s+tiene|cual\s+es\s+el\s+(precio|valor|costo)|precio|costo|cuanto vale|en dolares)\b/i.test(norm) && !/\b(tengo|solo tengo|me alcanza|me faltan|pesos)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 2, conRecierre: true }];
  }
  if (/\b(computador|computadora|pc|celular|telefono|movil|requisitos|experiencia|cero|tarjeta grafica)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 4, conRecierre: true }];
  }
  if (/\b(mostrar mi cara|mi rostro|mi cara|mi cuerpo|camara|anonimo|anonima)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 9, conRecierre: true }];
  }
  if (/\b(legal|legalidad|delito|ley|prohibido)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 8, conRecierre: true }];
  }
  if (/\b(eres real|eres un bot|eres bot|eres humana|persona real)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 13, conRecierre: true }];
  }
  if (/\b(que incluye|temario|modulos|que ensenan|que contiene|bonos)\b/i.test(norm)) {
    return [{ tipo: "responder_objecion", id: 7, conRecierre: true }];
  }

  // 6. Clasificación GPT (si existe un modelo conectado)
  const cls = entrada.clasificacion ?? null;
  if (cls?.tipo === "afirmativo") return cerrarConDatos(lead, cfg, body, norm);
  if (cls?.tipo === "objecion" && cls.objecion_id) {
    return [{ tipo: "responder_objecion", id: cls.objecion_id, conRecierre: true }];
  }
  if (cls?.tipo === "negativo") return [{ tipo: "enviar", textos: [MSG_NEGATIVO_SUAVE] }];

  return [{ tipo: "gpt_fallback" }];
}

/**
 * Cierre aceptado (L2050-2072): si además trae una pregunta, se responde ANTES de
 * los datos de pago — nunca se descarta la pregunta del cliente.
 */
export function cerrarConDatos(lead: LeadMotor, cfg: CfgCopy, body: string, norm: string): Efecto[] {
  const efectos: Efecto[] = [];
  if (!pideDatosDirecto(norm) && contienePregunta(body, norm)) {
    efectos.push({
      tipo: "evento",
      nombre: "fallback_gpt",
      detalle: { etapa: lead.estado_funnel, motivo: "pregunta_junto_a_cierre" },
    });
    efectos.push({
      tipo: "gpt_responder",
      instruccion: INSTRUCCION_PREGUNTA_JUNTO_A_CIERRE,
      abortar_si_escala: true,
    });
  }
  efectos.push(...efectosDatosPago(lead, cfg));
  return efectos;
}

// ============================== S07_DATOS_PAGO ==============================

/**
 * Entrega los datos de pago manuales (L2009-2043), con dos reglas duras:
 *   1. si NINGÚN bloque de cuentas es enviable, JAMÁS se mandan placeholders:
 *      se escala a humano;
 *   2. los bloques válidos van en UN solo mensaje, con Venezuela primero.
 */
export function efectosDatosPago(lead: LeadNombre, cfg: CfgCopy): Efecto[] {
  const s07 = etapa(cfg, "S07_DATOS_PAGO");
  const disp = metodosPagoDisponibles(cfg);

  // PAÍS HABILITADO: que una cuenta esté bien formada no significa que se venda
  // en ese país. `paises_habilitados` manda. Por defecto, solo Colombia.
  const permitidos = (
    Array.isArray((cfg as { paisesHabilitados?: string[] }).paisesHabilitados) &&
    (cfg as { paisesHabilitados: string[] }).paisesHabilitados.length > 0
      ? (cfg as { paisesHabilitados: string[] }).paisesHabilitados
      : ["CO"]
  ).map((p) => String(p).toUpperCase());

  const veHabilitado = permitidos.includes("VE");
  const coHabilitado = permitidos.includes("CO");
  const hayAlgunPais = (disp.ve && veHabilitado) || (disp.co && coHabilitado);

  if (!hayAlgunPais) {
    return [
      { tipo: "lead", patch: { escalado_humano: true } },
      { tipo: "evento", nombre: "escalado", detalle: { motivo: "datos_pago_incompletos" } },
      { tipo: "enviar", textos: [resolverPlaceholders(MSG_SIN_DATOS, lead, cfg)] },
    ];
  }

  const partes: string[] = [resolverPlaceholders(sinPrefijo(s07.mensajes[0]), lead, cfg)];
  if (disp.ve && veHabilitado) {
    // Se compone desde el bloque validado, no desde el placeholder del copy: así
    // lo que se envía es exactamente lo que pasó la validación.
    partes.push("\n🇻🇪 *Venezuela*\n" + bloqueCuentasVE(cfg));
  }
  if (disp.co && coHabilitado) {
    partes.push("\n🇨🇴 *Colombia*\n" + bloqueCuentasCO(cfg));
  }
  partes.push(resolverPlaceholders(sinPrefijo(s07.mensajes[1]), lead, cfg));

  return [
    { tipo: "estado", nuevo: "S08_ESPERA_CAPTURA" },
    { tipo: "enviar", textos: [partes.join("\n").trim()] },
  ];
}

/** Reexportado por comodidad de las pruebas. */
export { textoCuentasValido };
