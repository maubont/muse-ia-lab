// next/src/motor/ritmo.ts — EL RITMO DE LA CONVERSACIÓN.
//
// Dos cosas que el cliente percibe y que ninguna prueba de lógica captura:
//
//   1. Que el bot «está escribiendo» antes de que llegue el mensaje.
//   2. Que no llegue un testamento: se parte en ideas y se dosifica.
//
// Regla de oro: responder RÁPIDO. El retardo artificial existe para que se sienta
// humano, no para hacer esperar. Un bot que tarda 6 segundos por mensaje se siente
// peor que uno que contesta en dos.

/** Tope de retardo por mensaje: nunca más de esto, aunque el texto sea enorme. */
export const RETARDO_MAX_MS = 2_500;
export const RETARDO_MIN_MS = 300;

/** Máximo de caracteres por mensaje. Más que esto es «testamento». */
export const MAX_CARACTERES_POR_MENSAJE = 420;

/**
 * Por debajo de esto, un texto con varios párrafos se manda entero: partir
 * «Hola.\n\n¿Cómo estás?» en dos burbujas es ruido, no naturalidad.
 */
export const UMBRAL_SECCION = 180;

/** Lo que WhatsApp muestra como máximo razonable en un turno. */
export const MAX_MENSAJES_POR_TURNO = 4;

/**
 * Retardo del PRIMER mensaje de un turno.
 *
 * La velocidad de la primera respuesta es lo que más pesa en la conversión: un
 * lead contestado en menos de un minuto convierte hasta 8 veces más que uno
 * contestado a los 5 minutos. Así que el primer mensaje sale casi de inmediato:
 * solo lo justo para que el «escribiendo…» se registre.
 */
export const RETARDO_PRIMERO_MS = 150;

/**
 * Retardo proporcional al texto, acotado.
 * 0,25 s de base + ~18 ms por carácter, con techo en 2,5 s.
 */
export function retardoMs(texto: string, tope = RETARDO_MAX_MS): number {
  const largo = (texto ?? "").length;
  const calculado = 250 + largo * 18;
  return Math.min(tope, Math.max(RETARDO_MIN_MS, calculado));
}

/** Retardo según la posición en el turno: el primero casi instantáneo. */
export function retardoDeTurno(indice: number, texto: string): number {
  return indice === 0 ? RETARDO_PRIMERO_MS : retardoMs(texto);
}

/**
 * Parte un texto largo en bloques que se puedan leer.
 * Corta por párrafo; si un párrafo sigue siendo largo, por frase; y solo como
 * último recurso por longitud. Nunca devuelve bloques vacíos.
 */
export function partirMensaje(texto: string, maximo = MAX_CARACTERES_POR_MENSAJE): string[] {
  const limpio = (texto ?? "").trim();
  if (!limpio) return [];

  const parrafos = limpio.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // Corto y de un solo bloque: se manda entero, sin partir por partir.
  if (limpio.length <= maximo && (parrafos.length <= 1 || limpio.length <= UMBRAL_SECCION)) {
    return [limpio];
  }

  const bloques: string[] = [];
  for (const parrafo of parrafos) {
    if (parrafo.trim().length <= maximo) {
      if (parrafo.trim()) bloques.push(parrafo.trim());
      continue;
    }
    // Párrafo largo: por frases.
    const frases = parrafo.split(/(?<=[.!?…])\s+/);
    let actual = "";
    for (const frase of frases) {
      if (!actual) actual = frase;
      else if ((actual + " " + frase).length <= maximo) actual += " " + frase;
      else {
        bloques.push(actual.trim());
        actual = frase;
      }
    }
    if (actual.trim()) bloques.push(actual.trim());
  }

  // Último recurso: bloques que siguen siendo enormes se cortan por longitud,
  // respetando palabras.
  const finales: string[] = [];
  for (const b of bloques) {
    if (b.length <= maximo) { finales.push(b); continue; }
    let resto = b;
    while (resto.length > maximo) {
      let corte = resto.lastIndexOf(" ", maximo);
      if (corte <= 0) corte = maximo;
      finales.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }
    if (resto) finales.push(resto);
  }

  return finales.filter(Boolean);
}

/** Recorta un turno al máximo de mensajes, juntando el sobrante en el último. */
export function limitarTurno(bloques: string[], maximo = MAX_MENSAJES_POR_TURNO): string[] {
  if (bloques.length <= maximo) return bloques;
  const cabeza = bloques.slice(0, maximo - 1);
  const cola = bloques.slice(maximo - 1).join("\n\n");
  return [...cabeza, cola];
}
