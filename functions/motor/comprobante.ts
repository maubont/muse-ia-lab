// motor/comprobante.ts — NÚCLEO ANTIFRAUDE de Musa (funciones puras, sin I/O).
//
// CANÓNICO y PROBADO: `scripts/test-comprobante.mjs` (28 casos adversariales).
// Se mantiene INERTE para el despliegue: igual que `functions/lib/wompi.ts`, la
// versión que corre hoy sigue inlineada en `musa-webhook-twilio.ts` mientras
// InsForge imponga "una función = un archivo" (ver ADR-001 §6).
//
// Cuando exista el bundle (esbuild) o el runtime propio, el webhook reemplaza sus
// copias locales por `import { decidirComprobante } from "./motor/comprobante.ts"`
// y esta pasa a ser la única fuente de verdad.
//
// PRINCIPIO: las decisiones las toma el CÓDIGO, no el LLM. El modelo de visión solo
// extrae datos; aquí se decide si se entrega el producto o se manda a un humano.
//
// Cero dependencias, cero imports: se puede probar con `node --experimental-strip-types`.

// ============================== tipos ==============================

/** Salida estricta del modelo de visión. Un campo mal extraído NO debe decidir nada. */
export type DatosComprobante = {
  metodo: string | null;
  monto: number | null;
  moneda: string | null;
  fecha: string | null;
  hora: string | null;
  numero_referencia: string | null;
  destino: string | null;
  /**
   * TODOS los números/cuentas/teléfonos/llaves visibles en el comprobante, en
   * crudo (incluye enmascarados y completos). Permite reconocer NUESTRO número
   * aunque la visión elija otro como 'destino' principal.
   */
  numeros_detectados: string[];
  nombre_destinatario: string | null;
  banco_o_app: string | null;
  estado_operacion: string | null;
  es_captura_completa: boolean;
  senales_manipulacion: string[];
  confidence: { monto?: number; referencia?: number; destino?: number; fecha?: number };
};

export type Decision = {
  accion: "AUTO_APROBAR" | "COLA_HUMANA" | "PEDIR_REENVIO";
  motivo: string | null;
};

/** Forma mínima de `musa_settings.cuentas_*` que este módulo necesita. */
export type CuentasCfg = {
  pago_movil?: { telefono?: string; [k: string]: unknown };
  cuenta?: { numero?: string; [k: string]: unknown };
  nequi?: { numero?: string; [k: string]: unknown };
  bancolombia?: { numero?: string; [k: string]: unknown };
  breb?: { llave?: string; [k: string]: unknown };
  provisional?: boolean;
  [k: string]: unknown;
};

/**
 * Subconjunto estructural de `Cfg` (musa-webhook-twilio.ts). Un `Cfg` completo es
 * asignable a este tipo sin casts: solo se declaran los campos que se leen.
 */
export type CfgComprobante = {
  precio?: { usd?: number; cop?: number };
  precioBsHoy?: { bs?: number };
  cuentasVe?: CuentasCfg;
  cuentasCo?: CuentasCfg;
};

// ============================== utilidades ==============================

/** solo dígitos (para comparar referencias y destinos sin formato). */
export function soloDigitos(s: string | null): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Lista de NUESTROS destinos (solo dígitos) según las cuentas de settings:
 * Pago Móvil + cuenta BDV (VE) y Nequi + Bancolombia + Bre-B (CO).
 * Descarta fragmentos de menos de 6 dígitos: no identifican una cuenta.
 */
export function nuestrosDestinos(cfg: CfgComprobante): string[] {
  const set = new Set<string>();
  const add = (v?: string) => {
    const d = soloDigitos(v ?? null);
    if (d.length >= 6) set.add(d);
  };
  const ve = cfg.cuentasVe ?? {};
  add(ve.pago_movil?.telefono);
  add(ve.cuenta?.numero);
  const co = cfg.cuentasCo ?? {};
  add(co.nequi?.numero);
  add(co.bancolombia?.numero);
  add(co.breb?.llave);
  return Array.from(set);
}

/** Precio esperado para la moneda del comprobante. null = moneda desconocida. */
export function precioEsperado(cfg: CfgComprobante, moneda: string | null): number | null {
  switch ((moneda || "").toUpperCase()) {
    case "COP": return Number(cfg.precio?.cop ?? 33000);
    case "VES": return Number(cfg.precioBsHoy?.bs ?? 7400);
    case "USD": return Number(cfg.precio?.usd ?? 9);
    default: return null;
  }
}

// ============================== decisión ==============================

/**
 * VALIDACIONES EN CÓDIGO (no en el LLM). Recibe los datos extraídos + si el lead ya
 * tiene un pago aprobado y decide la acción. NO toca la BD: el dedupe por
 * referencia/pHash y el circuit breaker se evalúan aparte (necesitan la BD).
 *
 * Orden deliberado: primero lo que evita mandar al humano por basura (reenvío),
 * luego lo que exige un humano sí o sí (estado, monto, destino, fecha, confianza).
 */
export function decidirComprobante(
  cfg: CfgComprobante,
  d: DatosComprobante,
  esPrimerPagoAprobado: boolean,
): Decision {
  // 1) captura incompleta / ilegible -> pedir reenvío (suave, no notifica aún)
  if (!d.es_captura_completa || d.estado_operacion === "ilegible") {
    return { accion: "PEDIR_REENVIO", motivo: "captura_incompleta" };
  }
  // 2) estado no exitoso -> cola humana
  if (d.estado_operacion && ["programada", "en_proceso", "fallida"].includes(d.estado_operacion)) {
    return { accion: "COLA_HUMANA", motivo: "estado_" + d.estado_operacion };
  }
  // 3) monto / moneda
  const esperado = precioEsperado(cfg, d.moneda);
  if (esperado == null || d.monto == null) {
    return { accion: "COLA_HUMANA", motivo: "monto_o_moneda_ilegible" };
  }
  if (d.monto < esperado * 0.98) {
    return { accion: "COLA_HUMANA", motivo: "pago_incompleto" };
  }
  if (d.monto > esperado * 3) {
    return { accion: "COLA_HUMANA", motivo: "monto_excesivo" };
  }
  // 4) destino debe coincidir con uno de los nuestros.
  // Candidatos = el campo 'destino' principal + TODOS los numeros_detectados,
  // cada uno normalizado a solo dígitos. Coincide si NUESTRO número completo
  // (su longitud real: 10 Nequi/Bre-B, 11 Pago Móvil/Bancolombia, 20 BDV)
  // aparece como coincidencia EXACTA o como substring completo dentro de algún
  // candidato. NO se usa coincidencia por sufijo corto laxo.
  //
  // TRADE-OFF CONOCIDO: la regla `includes` acepta un candidato que CONTENGA
  // nuestro número (p. ej. una cuenta más larga que lo incluya). Se mantiene para
  // tolerar prefijos de banco que añade el OCR. Cubierto por el test (caso 20).
  const destinos = nuestrosDestinos(cfg);
  const candidatos = [d.destino, ...(d.numeros_detectados ?? [])]
    .map((s) => soloDigitos(s))
    .filter((s) => s.length >= 6);
  const coincide = destinos.length > 0 &&
    candidatos.some((cand) => destinos.some((n) => cand === n || cand.includes(n)));
  if (!coincide) {
    return { accion: "COLA_HUMANA", motivo: "destino_no_coincide" };
  }
  // 5) fecha: futura o > 3 días atrás -> cola (null no bloquea)
  if (d.fecha) {
    const f = new Date(d.fecha + "T00:00:00Z").getTime();
    if (!Number.isNaN(f)) {
      const hoy = Date.now();
      if (f > hoy + 24 * 60 * 60 * 1000) return { accion: "COLA_HUMANA", motivo: "fecha_futura" };
      if (hoy - f > 3 * 24 * 60 * 60 * 1000) return { accion: "COLA_HUMANA", motivo: "fecha_vieja" };
    }
  }
  // 6) confidence
  const c = d.confidence ?? {};
  if ((c.monto ?? 0) < 0.85 || (c.referencia ?? 0) < 0.85 || (c.destino ?? 0) < 0.85) {
    return { accion: "COLA_HUMANA", motivo: "baja_confianza" };
  }
  // 7) señales de manipulación
  if (d.senales_manipulacion && d.senales_manipulacion.length > 0) {
    return { accion: "COLA_HUMANA", motivo: "senales_manipulacion" };
  }
  // 8) solo si es el PRIMER pago aprobado de ese lead
  if (!esPrimerPagoAprobado) {
    return { accion: "COLA_HUMANA", motivo: "lead_ya_tiene_pago" };
  }
  return { accion: "AUTO_APROBAR", motivo: null };
}
