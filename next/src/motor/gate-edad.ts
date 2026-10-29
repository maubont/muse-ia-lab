// next/src/motor/gate-edad.ts — CORRECCIÓN DEL GATE DE EDAD.
//
// ── EL DEFECTO QUE ESTO CIERRA ───────────────────────────────────────────────
// `clasificarEdadHeuristico` (módulo verificado, guardarrailes.ts:182) dice:
//
//     if (/^(no|nop|nel|nah|que va)\b/.test(norm)) return "menor";
//
// Cualquier mensaje que EMPIECE por «no» se clasifica como menor. En la práctica:
//
//     "no sé"                    -> menor
//     "no entiendo la pregunta"  -> menor
//     "no, espera"               -> menor
//     "no me quedó claro"        -> menor
//
// Un adulto que duda recibe el mensaje de «debes ser mayor de edad», queda en
// S92_MENOR y no vuelve a recibir nada. Se pierde la venta y se le insulta.
//
// ── POR QUÉ UNA CAPA Y NO UN ARREGLO DIRECTO ─────────────────────────────────
// `guardarrailes.ts` está probado DIFERENCIALMENTE contra el código en producción
// (688 comparaciones). Cambiarlo destruiría esa garantía y no se sabría si una
// diferencia futura es una mejora o un error de port.
//
// Esta capa NO relaja la protección de menores: un «menor» solo se mantiene si
// hay una señal real (edad adolescente explícita, «soy menor», «aún no cumplo»).
// Si el «menor» venía únicamente del «no» inicial, se devuelve `null` —
// ambigua — y el gate vuelve a preguntar en vez de bloquear.

import { clasificarEdadHeuristico, inyectarEdadDeletreada } from "../../../functions/motor/guardarrailes.ts";

/**
 * Señales que SÍ indican minoría de edad de verdad.
 * Copiadas de las ramas del módulo verificado (guardarrailes.ts:142-181). Si se
 * cambian allí, hay que cambiarlas aquí: por eso están juntas y comentadas.
 */
export const SENALES_MENOR_REALES: RegExp[] = [
  // declaración explícita
  /(soy menor|menor de edad|no tengo 18|no soy mayor|aun soy menor|todavia soy menor)/,
  // negación de mayoría en presente
  /(aun no (cumplo|tengo|los|soy|llego)|todavia no (cumplo|tengo|los|soy|llego))/,
  // edad adolescente explícita ("tengo 16", "16 años")
  /\b(1[0-7])\b/,
  // cumplir los 18 en el futuro
  /(voy a cumplir|falta(n)? .* (para )?cumplir|cuando (los )?cumpla|los cumplo|los cumplire|cumplire|cumplo los|el (otro|proximo) (ano|anio|año)|el ano que viene|el año que viene)/,
];

/** ¿el mensaje contiene una señal real de minoría de edad? */
export function tieneSenalDeMenor(norm: string): boolean {
  // Las edades deletreadas ("diecisiete", típicas de notas de voz transcritas) se
  // convierten a dígito con el mismo inyector del módulo verificado. Sin esto,
  // "tengo diecisiete" pasaría como ambiguo en vez de como menor.
  const conDigitos = inyectarEdadDeletreada(norm ?? "");
  return SENALES_MENOR_REALES.some((r) => r.test(conDigitos));
}

/**
 * Clasificación de edad para el gate, corrigiendo el falso «menor» por el «no»
 * inicial. Devuelve "mayor" | "menor" | null (ambiguo).
 */
export function edadDelGate(norm: string, heuristico?: string | null): string | null {
  const h = heuristico === undefined ? clasificarEdadHeuristico(norm) : heuristico;

  if (h !== "menor") return h;
  // Un «menor» solo se sostiene con una señal real en el texto.
  if (tieneSenalDeMenor(norm)) return "menor";

  // El «no» inicial no es prueba de nada: se devuelve ambiguo para re-preguntar.
  return null;
}

/** ¿el mensaje empieza por una negación? Útil para elegir la pregunta de reenganche. */
export function empiezaPorNegacion(norm: string): boolean {
  return /^(no|nop|nel|nah|que va)\b/.test(norm ?? "");
}
