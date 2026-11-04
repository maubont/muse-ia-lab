// motor/guardarrailes.ts — GUARDARRAÍLES DE CUMPLIMIENTO de Musa (funciones puras).
//
// CANÓNICO y PROBADO: `scripts/test-guardarrailes.mjs`.
// Extraído LITERALMENTE de musa-webhook-twilio.ts L369-552 (prueba diferencial
// contra el original). Se mantiene INERTE para el despliegue mientras InsForge
// imponga "una función = un archivo": la copia que corre hoy sigue inlineada en el
// webhook. Ver ADR-001 §6.
//
// POR QUÉ ESTE ARCHIVO EXISTE: estas heurísticas no son "utilidades". Son las que
// evitan, en este orden de gravedad:
//   1. vender a un menor de edad                    -> `clasificarEdadHeuristico`
//   2. perder el número por no honrar un opt-out    -> `esStopTotal`
//   3. mentir sobre ser humana                      -> `preguntaPorBot`
//   4. cotizar en la moneda equivocada              -> `detectarPaisHeuristico`
// Merecen pruebas y merecen vivir fuera de un archivo de 2.876 líneas.
//
// Cero dependencias, cero imports: se prueba con `node --experimental-strip-types`.

// ============================== heurísticas ==============================

/**
 * minúsculas, sin acentos, sin espacios extremos.
 * Todas las heurísticas de abajo asumen este formato; se exporta para que quien
 * llame no invente su propia normalización. Copiado literal del original (L94-100).
 */
export function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function esStopTotal(norm: string): boolean {
  if (!norm) return false;
  // El opt-out debe dispararse aunque la palabra clave vaya acompañada de otro
  // texto ("mejor no, SALIR", "ya no, stop"). Detectamos STOP/SALIR/BAJA/
  // CANCELAR como TOKEN AISLADO (separado por límites no alfabéticos), no como
  // subcadena (para no confundir "salir" dentro de "salirme"/"asalariado" ni
  // "stop" dentro de otra palabra). Si el mensaje SOLO contiene esa palabra
  // (con o sin signos) también cuenta.
  const limpio = norm.replace(/[^a-z]/g, "");
  if (limpio === "stop" || limpio === "salir" || limpio === "baja" || limpio === "cancelar") {
    return true;
  }
  return /(^|[^a-z])(stop|salir|baja|cancelar)([^a-z]|$)/.test(norm);
}

export function preguntaPorBot(norm: string): boolean {
  return /\b(eres|sos|seras|sera que eres)\b.{0,30}\b(bot|robot|maquina|ia|inteligencia artificial|humana?|persona real|de verdad)\b/.test(norm) ||
    /\bun bot\b.{0,5}\?/.test(norm) ||
    /\b(bot|robot) o (persona|humana?)\b/.test(norm);
}

export function pideHumano(norm: string): boolean {
  // 1. Palabras clave directas aisladas
  if (/\b(humano|asesor(a|es)?|agente|operador(a)?|soporte)\b/.test(norm)) return true;

  // 2. Intención de conectar con una persona / alguien
  if (/(hablar|comunicar|comuniqueme|comunicame|contactar|atender|atienda|pasame|pasa|conectar|quiero|necesito)\s+(con\s+)?(una?\s+)?(persona|alguien|humano)/.test(norm)) return true;

  // 3. Reclamo de atención humana ("alguien que me responda", "hay alguien ahi", "atencion al cliente")
  if (/alguien\s+(que\s+)?(me\s+)?(responda|ayude|atienda|escuche|de informacion)/.test(norm)) return true;
  if (/\b(hay\s+alguien|alguien\s+ahi|con\s+quien\s+hablo|persona\s+real|de\s+carne\s+y\s+hueso)\b/.test(norm)) return true;
  if (/\b(atencion\s+al\s+cliente|servicio\s+al\s+cliente)\b/.test(norm)) return true;

  return false;
}

export function preguntaPrecio(norm: string): boolean {
  return /(cuanto (cuesta|vale|es|sale)|precio|costo|valor|que vale|cuanto hay que pagar)/.test(norm);
}

export function detectarPaisHeuristico(norm: string, original: string): string | null {
  // Abreviaturas y variantes como PALABRA exacta (\b), nunca como subcadena:
  // "col" no debe dispararse dentro de "escolar" ni "ven" dentro de "vender".
  const ve = /venez|vzla|vnzla|🇻🇪/.test(norm) || /🇻🇪/.test(original) ||
    /\b(ven|vene|vzla|vnzla|venezuela)\b/.test(norm) || norm === "ve";
  const co = /colomb|🇨🇴/.test(norm) || /🇨🇴/.test(original) ||
    /\b(col|colombia)\b/.test(norm) || norm === "co";
  if (ve && !co) return "VE";
  if (co && !ve) return "CO";
  return null;
}

/**
 * CAMBIO 4 (Fase 4) — números deletreados en español → dígitos.
 * Las notas de voz transcritas escriben la edad con palabras ("veinticinco"),
 * no con dígitos, así que el extractor numérico del gate no la veía. Esta función
 * inyecta el dígito equivalente (10–99) detrás de la palabra para que el resto de
 * la heurística de edad lo lea igual que "25". Solo cubre el rango de edades
 * plausibles; no toca el texto si no hay un número en palabras.
 */
export function inyectarEdadDeletreada(norm: string): string {
  const unidades: Record<string, number> = {
    cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9,
  };
  const especiales: Record<string, number> = {
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
    veintisiete: 27, veintiocho: 28, veintinueve: 29,
  };
  const decenas: Record<string, number> = {
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
    ochenta: 80, noventa: 90,
  };
  // 1) palabras 10–29 directas.
  for (const [w, n] of Object.entries(especiales)) {
    if (new RegExp(`\\b${w}\\b`).test(norm)) return `${norm} ${n}`;
  }
  // 2) "treinta y cinco", "cuarenta y dos", etc.
  for (const [dw, dn] of Object.entries(decenas)) {
    const m = norm.match(new RegExp(`\\b${dw}(\\s+y\\s+(\\w+))?`));
    if (m) {
      let n = dn;
      if (m[2] && unidades[m[2]] != null) n += unidades[m[2]];
      return `${norm} ${n}`;
    }
  }
  return norm;
}

/**
 * CAMBIO 2 — gate de edad inferido. Atajo heurístico para los casos obvios; si
 * NO decide (null = ambiguo) el llamador cae al clasificador GPT. Devuelve
 * "mayor" | "menor" | null (ambiguo).
 */
export function clasificarEdadHeuristico(normRaw: string): string | null {
  // Inyecta el dígito si la edad viene deletreada (notas de voz transcritas).
  const norm = inyectarEdadDeletreada(normRaw);
  // --- SEÑALES DE MENOR (prioridad máxima: van ANTES del extractor de número) ---
  //
  // CAUSA RAÍZ RONDA 1 (Carlitos, 17): "nah todavia no, el ano que viene cumplo
  // los 18" no matcheaba ninguna señal de menor y el extractor de número capturaba
  // el "18" de "cumplo los 18" devolviendo "mayor". Fix:
  //   a) Detectar el FUTURO de "cumplir" como menor de forma robusta: cualquier
  //      forma conjugada de cumplir (cumplo/cumplire/cumpla/voy a cumplir/falta
  //      para cumplir...) acompañada de un horizonte futuro o de la negación
  //      "todavia/aun no" es MENOR, sin importar el número que venga después.
  //   b) Si hay contexto de "cumplir N años" en futuro/negado, NO dejar que el
  //      extractor numérico lo lea como edad actual.
  const negacionPrevia = /(todavia|aun|aún|aun no|todavia no)\b/.test(norm) ||
    /^(no|nah|nop|nel|que va|qué va|aun no|todavia no)\b/.test(norm);
  const cumplirFuturo =
    // "cumplo/cumplire/cumpla/cumpliendo (los) 18", "voy a cumplir", "falta para cumplir"
    /\b(voy a cumplir|falta(n)? .* (para )?cumplir|cuando (los )?cumpla|los cumplo|los cumplire|cumplire|cumplo los|cumplire los|cumpla los)\b/.test(norm) ||
    // horizontes futuros explícitos
    /\b(el (otro|proximo|que viene) (ano|anio|año)|el ano que viene|el año que viene|proximo ano|el ano entrante|en (un|dos|tres) (ano|anos|año|años)|el mes que viene|en \w+ cumplo)\b/.test(norm);
  if (
    /(soy menor|menor de edad|no tengo 18|no soy mayor|no soy mayor de edad|aun soy menor|todavia soy menor)/.test(norm)
  ) {
    return "menor";
  }
  if (
    /(aun no (cumplo|tengo|los|soy|llego)|todavia no (cumplo|tengo|los|soy|llego))/.test(norm)
  ) {
    return "menor";
  }
  // negación + intención de cumplir años (futuro) => MENOR. Cubre el caso de
  // Carlitos aunque el "18" venga inmediatamente después de "cumplo los".
  if (cumplirFuturo && (negacionPrevia || /\bcumpl/.test(norm))) {
    // Sólo lo consideramos MENOR cuando el verbo cumplir está en CONTEXTO futuro
    // (no cuando ya cumplió: "ya cumpli 18" lo maneja la rama de mayor abajo).
    if (!/\bya (cumpli|los cumpli|tengo)\b/.test(norm)) return "menor";
  }
  // "+18", "mas de 18", "ya soy mayor" → mayor inequívoco.
  if (/(\+\s*18|mas de 18|ya soy mayor|soy mayor de edad|ya cumpli (los )?18|ya los cumpli)/.test(norm)) {
    return "mayor";
  }
  // Extractor de número: SOLO si NO hay contexto de "cumplir en el futuro" (para
  // no leer el "18" de "el año que viene cumplo los 18" como edad actual).
  if (!cumplirFuturo) {
    const num = norm.match(/\b(\d{1,2})\b/);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 10 && n <= 17) return "menor";
      if (n >= 18 && n <= 99) return "mayor";
    }
  } else {
    // Hay "cumplir futuro" + un número en rango de edad menor (p.ej. "cumplo 17"):
    // tratarlo como menor; si el número fuese >=18 con negación previa ya salió
    // arriba como menor, así que aquí cualquier número adolescente confirma menor.
    const num = norm.match(/\b(\d{1,2})\b/);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 10 && n <= 17) return "menor";
    }
  }
  if (/^(no|nop|nel|nah|que va)\b/.test(norm)) return "menor";
  if (
    /^(si+|sip|claro|por supuesto|obvio|asi es|correcto|confirmo|afirmativo|yes|dale|aja|ajadale|de una)\b/.test(norm) ||
    /(soy mayor|mayor de edad|tengo mas de 18|ya los (tengo|cumpli)|si tengo|si los tengo|si soy mayor|claro que si|por su puesto)/.test(norm)
  ) return "mayor";
  return null;
}

export function esAfirmativoCierre(norm: string): boolean {
  if (esNegativoCierre(norm)) return false;
  // Si pide información explícitamente, es consulta y no intención de compra/pago inmediata
  if (/\b(info|informacion|detalles?|de que trata|como es el curso|saber mas|como funciona)\b/.test(norm)) {
    return false;
  }
  return /^(si+|sip|dale|de una|ok|okey|okay|va|vale|listo|claro|perfecto|por supuesto|obvio|bueno|hagamoslo|me animo|empecemos|comencemos|arranquemos|comprar|inscribirme)\b/.test(norm) ||
    /^quiero$/.test(norm) ||
    /(como pago|donde pago|como hago (el|para|con el) ?pago|como hago para pagar|como hago el pago|como realizo el pago|como puedo pagar|como se paga|por donde pago|los datos|datos de pago|pasame|quiero pagar|quiero empezar|quiero comprar|si quiero|paso los datos|(?<!no\s+)me interesa|(?<!no\s+)me llama la atencion|(?<!no\s+)me gusta|como es|como seria|pasame la cuenta|a que cuenta|donde transfiero|donde consigno|tienes nequi|pago por nequi|nequi|bancolombia|bre-?b|cuanto cuesta|cuanto vale|que vale|precio|pasa los datos|dame los datos|donde deposito|quiero entrar|quiero acceder|como entro|quiero inscribirme)/.test(norm);
}

export function esNegativoCierre(norm: string): boolean {
  return /^(no|nop|nel|no gracias|no quiero|ahorita no|ahora no|hoy no|despues|luego|mas tarde|otro dia)\b/.test(norm);
}

export function esYaPague(norm: string): boolean {
  return /(ya pague|ya pag|ya transfer|ya hice el pago|ya esta el pago|listo el pago|pago hecho|ya realice|acabo de pagar|hice la transferencia|hice el pago movil)/.test(norm);
}

/** mensaje mixto: además de afirmar, trae una pregunta que NO debe ignorarse */
export function contienePregunta(body: string, norm: string): boolean {
  if (/[?¿]/.test(body || "")) return true;
  const sinArranque = norm.replace(
    /^(si+|sip|dale|de una|ok(ey|ay)?|va|vale|listo|claro|perfecto|bueno)\b[\s,]*(y|pero)?\s*/,
    "",
  );
  return /\b(cuant[oa]s?|como|cual(es)?|donde|cuando|por ?que|sirve|funciona|se puede|puedo|necesito|hay que|incluye)\b/
    .test(sinArranque);
}

/** el mensaje ya es en sí una petición de los datos de pago */
export function pideDatosDirecto(norm: string): boolean {
  return /(como pago|donde pago|como hago (el|para|con el) ?pago|como hago para pagar|como hago el pago|como realizo el pago|como puedo pagar|como se paga|por donde pago|los datos|datos de pago|pasame|quiero pagar|quiero comprar|paso los datos|pasame la cuenta|a que cuenta|donde transfiero|donde consigno|dame los datos|cuenta de nequi|cuenta nequi|nequi|bancolombia)/.test(norm);
}
