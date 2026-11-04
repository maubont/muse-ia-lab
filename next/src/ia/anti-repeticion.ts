// next/src/ia/anti-repeticion.ts — GUARDARRAÍL DETERMINISTA DE ANTI-REPETICIÓN Y SANITIZACIÓN.
//
// Mide similitud léxica y semántica híbrida (Dice Bigrams + Levenshtein) en < 2ms
// para evitar que Musa repita respuestas enlatadas o frases idénticas en turnos consecutivos.
// También erradica emojis problemáticos como las dos manitos de rogar (🙏) y corazones morados masivos (💜).

/** Normaliza texto para comparación: minúsculas, sin acentos, sin puntuación ni emojis. */
export function normalizarParaComparacion(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^\w\s]/gi, " ")       // Quitar puntuación y emojis
    .replace(/\s+/g, " ")
    .trim();
}

/** Calcula bigramas de una cadena de texto. */
function obtenerBigramas(texto: string): Set<string> {
  const s = normalizarParaComparacion(texto);
  const bigramas = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigramas.add(s.substring(i, i + 2));
  }
  return bigramas;
}

/** Coeficiente de Dice sobre bigramas (similitud entre 0.0 y 1.0). */
export function similitudDice(a: string, b: string): number {
  if (!a || !b) return 0;
  const normA = normalizarParaComparacion(a);
  const normB = normalizarParaComparacion(b);
  if (normA === normB) return 1.0;
  if (normA.length < 2 || normB.length < 2) return 0.0;

  const bgA = obtenerBigramas(normA);
  const bgB = obtenerBigramas(normB);
  let interseccion = 0;

  for (const bg of bgA) {
    if (bgB.has(bg)) interseccion++;
  }

  return (2.0 * interseccion) / (bgA.size + bgB.size);
}

/** Distancia Levenshtein normalizada (1.0 = idénticos, 0.0 = totalmente distintos). */
export function similitudLevenshtein(a: string, b: string): number {
  const s1 = normalizarParaComparacion(a);
  const s2 = normalizarParaComparacion(b);
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const m = s1.length;
  const n = s2.length;
  const matriz: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) matriz[i][0] = i;
  for (let j = 0; j <= n; j++) matriz[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,        // Eliminación
        matriz[i][j - 1] + 1,        // Inserción
        matriz[i - 1][j - 1] + costo // Sustitución
      );
    }
  }

  const distancia = matriz[m][n];
  const maxLongitud = Math.max(m, n);
  return 1.0 - distancia / maxLongitud;
}

/** Métrica híbrida de similitud: 60% Dice (vocabulario) + 40% Levenshtein (orden exacto). */
export function calcularSimilitud(texto1: string, texto2: string): number {
  const dice = similitudDice(texto1, texto2);
  const lev = similitudLevenshtein(texto1, texto2);
  return 0.6 * dice + 0.4 * lev;
}

export interface ResultadoValidacionRepeticion {
  repetido: boolean;
  maxSimilitud: number;
  mensajePrevioChocante?: string;
}

/**
 * Valida si la respuesta candidata es una repetición inaceptable de las últimas respuestas salientes.
 * Umbral de rechazo estándar: >= 0.65 (65% de similitud).
 */
export function validarAntiRepeticion(
  candidato: string,
  ultimosMensajesOut: string[],
  umbral = 0.65
): ResultadoValidacionRepeticion {
  let maxSimilitud = 0;
  let mensajePrevioChocante: string | undefined;

  for (const prev of ultimosMensajesOut.slice(0, 3)) {
    if (!prev || !prev.trim()) continue;
    const sim = calcularSimilitud(candidato, prev);
    if (sim > maxSimilitud) {
      maxSimilitud = sim;
      mensajePrevioChocante = prev;
    }
    if (sim >= umbral) {
      return {
        repetido: true,
        maxSimilitud,
        mensajePrevioChocante,
      };
    }
  }

  return {
    repetido: false,
    maxSimilitud,
  };
}

/** Emojis prohibidos en atención de Musa (súplica y saturación de corazones). */
const EMOJIS_PROHIBIDOS = /[🙏🥺🤫🙄💜]/gu;

/**
 * Sanitiza la respuesta saliente:
 * 1. Remueve emojis de súplica (🙏) y corazones morados (💜).
 * 2. Si el usuario está molesto o confundido, remueve el 100% de emojis para máxima seriedad.
 * 3. Remueve URLs idénticas repetidas en el mismo mensaje para no saturar al usuario.
 */
export function sanitizarRespuesta(texto: string, usuarioMolesto = false): string {
  if (!texto) return "";
  let limpio = texto.replace(EMOJIS_PROHIBIDOS, "");
  if (usuarioMolesto) {
    limpio = limpio.replace(/\p{Extended_Pictographic}/gu, "");
  }

  // Deduplicar URLs idénticas si aparecen más de una vez en el mismo texto
  const urlsVistas = new Set<string>();
  limpio = limpio.replace(/https?:\/\/[^\s]+/gi, (url) => {
    const urlLimpia = url.replace(/[.,;!]+$/, "").toLowerCase();
    if (urlsVistas.has(urlLimpia)) {
      return "";
    }
    urlsVistas.add(urlLimpia);
    return url;
  });

  return limpio.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
