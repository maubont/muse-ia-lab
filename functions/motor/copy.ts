// motor/copy.ts — RENDERIZADO DEL COPY del funnel (funciones puras).
//
// Extraído LITERALMENTE de musa-webhook-twilio.ts (líneas 103-122, 185-198,
// 304-365 y 1892-1932) y verificado por comparación textual normalizada y por
// prueba diferencial contra el original.
//
// POR QUÉ ESTE ARCHIVO EXISTE: el copy es el producto. Un placeholder sin
// resolver (`{{nombre}}`) o un token interno filtrado (`[PROMPT_MUESTRA]`,
// `[ENTREGA_LINKS:…]`) llegan al cliente tal cual y queman la venta. `limpiarTokens`
// existe justamente porque eso ya pasó una vez.
//
// Con este módulo se puede recorrer TODO el copy real de la base y comprobar que
// ninguna etapa deja basura. Eso es `scripts/test-copy.mjs`.
//
// Se mantiene INERTE para el despliegue (ver ADR-001 §6).

// ============================== tipos ==============================

export type LeadNombre = {
  nombre?: string | null;
  profile_name?: string | null;
};

export type EtapaCopy = {
  id: string;
  mensajes: string[];
  ramas?: Record<string, { mensajes?: string[]; sin_video?: string }>;
};

export type CfgCopy = {
  funnelCopy?: { etapas: EtapaCopy[]; objeciones?: Array<{ objecion: string; respuesta: string }> };
  precio?: { usd?: number; cop?: number };
  precioBsHoy?: { bs?: number };
  cuentasVe?: Record<string, Record<string, string>> & { provisional?: boolean };
  cuentasCo?: Record<string, Record<string, string>> & { provisional?: boolean };
  entrega?: { link_grupo?: string; modulos?: string[]; bonos?: Record<string, string> };
};

// ============================== utilidades de formato ==============================

/** 7400 -> "7.400" */
export function formatMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** quita prefijos de guion tipo "[SI RESPONDE OTRO PAÍS] " */
export function sinPrefijo(t: string): string {
  return (t || "").replace(/^\[[^\]]*\]\s*/, "");
}

/** limpia tokens de fases futuras que no deben llegar al cliente */
export function limpiarTokens(t: string): string {
  return (t || "")
    .replace(
      /\s*Y mira, te dejo una muestra real de lo que hay adentro 👇 \[PROMPT_MUESTRA\] Pruébalo tú mismo\.\s*/g,
      " ",
    )
    .replace(/\[(VIDEO_AVATAR[^\]]*|PROMPT_MUESTRA|ENTREGA_LINKS:[^\]]*)\]/g, "")
    .replace(/✨/g, "✨")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const PALABRAS_NEGOCIO =
  /(venta|shop|store|tienda|negocio|inversion|oficial|marketing|online|grupo|empresa|publicidad|agencia|import|export|cursos|modelos|servicio|disponible|whatsapp)/i;

/** nombre de pila usable a partir de lead.nombre o profile_name */
export function nombreUsable(lead: LeadNombre): string | null {
  const candidato = (lead.nombre || lead.profile_name || "").trim();
  if (!candidato) return null;
  const palabras = candidato.split(/\s+/);
  if (palabras.length > 2) return null;
  const primera = palabras[0];
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]{2,20}$/.test(primera)) return null;
  if (PALABRAS_NEGOCIO.test(candidato)) return null;
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

// ============================== etapas y cuentas ==============================

export function etapa(cfg: CfgCopy, id: string): EtapaCopy {
  const e = (cfg.funnelCopy?.etapas ?? []).find((x) => x.id === id);
  if (!e) throw new Error("funnel_copy sin etapa " + id);
  return e;
}

export function bloqueCuentasVE(cfg: CfgCopy): string {
  const pm = cfg.cuentasVe?.pago_movil ?? {};
  const cu = cfg.cuentasVe?.cuenta ?? {};
  return [
    "📲 *Pago Móvil*",
    `Banco: ${pm.banco ?? ""}`,
    `Teléfono: ${pm.telefono ?? ""}`,
    `Cédula: ${pm.cedula ?? ""}`,
    `Titular: ${pm.titular ?? ""}`,
    "",
    "🏦 *Transferencia (Banco de Venezuela)*",
    `Cuenta ${cu.tipo ?? ""}: ${cu.numero ?? ""}`,
    `Cédula: ${cu.cedula ?? ""}`,
    `Titular: ${cu.titular ?? ""}`,
  ].join("\n");
}

export function bloqueCuentasCO(cfg: CfgCopy): string {
  const c = cfg.cuentasCo ?? {};
  return [
    `📲 *Nequi*: ${c.nequi?.numero ?? ""}`,
    `🏦 *Bancolombia* (${c.bancolombia?.tipo ?? "ahorros"}): ${c.bancolombia?.numero ?? ""}`,
    `🔑 *Llave Bre-B*: ${c.breb?.llave ?? ""}`,
  ].join("\n");
}

export function resolverPlaceholders(texto: string, lead: LeadNombre, cfg: CfgCopy): string {
  let t = texto ?? "";
  const nombre = nombreUsable(lead);
  if (nombre) {
    t = t.replace(/\{\{nombre\}\}/g, nombre);
  } else {
    // sin nombre usable: quitar la coma y el nombre con gracia
    t = t
      .replace(/,\s*\{\{nombre\}\}/g, "")
      .replace(/\{\{nombre\}\},\s*/g, "")
      .replace(/\s*\{\{nombre\}\}\s*/g, " ");
  }
  t = t
    .replace(/\{\{precio_bs\}\}/g, formatMiles(Number(cfg.precioBsHoy?.bs ?? 7400)))
    .replace(/\{\{precio_cop\}\}/g, formatMiles(Number(cfg.precio?.cop ?? 9000)))
    .replace(/\{\{cuentas_venezuela\}\}/g, bloqueCuentasVE(cfg))
    .replace(/\{\{cuentas_colombia\}\}/g, bloqueCuentasCO(cfg))
    .replace(/\{\{link_grupo\}\}/g, cfg.entrega?.link_grupo ?? "");
  return limpiarTokens(t).replace(/ {2,}/g, " ");
}

/** filtra líneas [VE]/[CO] según el país del lead; OTRO elimina ambas */
export function filtrarLineasPais(texto: string, pais: string | null): string {
  const lineas = (texto ?? "").split("\n").map((l) => {
    if (l.startsWith("[VE]")) return pais === "VE" ? l.slice(4).trim() : null;
    if (l.startsWith("[CO]")) return pais === "CO" ? l.slice(4).trim() : null;
    return l;
  }).filter((l) => l !== null) as string[];
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ============================== validación de cuentas ==============================

/** true si el bloque de cuentas es enviable (sin PENDIENTE, campos vacíos ni números placeholder) */
export function textoCuentasValido(texto: string): boolean {
  if (/pendiente/i.test(texto)) return false;
  if (/:\s*(\n|$)/.test(texto)) return false; // campo vacío tras los dos puntos
  if (/0{7,}/.test(texto.replace(/[\s.\-]/g, ""))) return false; // teléfonos/cédulas de ceros
  return true;
}

/**
 * Qué bloques de pago están REALMENTE disponibles hoy (cuentas no provisional y
 * sin placeholders). Lo usan el GPT libre (para no prometer un método inexistente)
 * y el guard de S08 (para escalar cuando piden un método no disponible).
 */
export function metodosPagoDisponibles(cfg: CfgCopy): { ve: boolean; co: boolean } {
  const veProvisional = cfg.cuentasVe?.provisional === true;
  const coProvisional = cfg.cuentasCo?.provisional === true;
  return {
    ve: !veProvisional && textoCuentasValido(bloqueCuentasVE(cfg)),
    co: !coProvisional && textoCuentasValido(bloqueCuentasCO(cfg)),
  };
}

/**
 * El lead pide explícitamente un método/zona de pago VENEZUELA (Pago Móvil,
 * transferencia BDV, "datos de Venezuela", "en bolívares cómo pago", etc.).
 */
export function pideMetodoVE(norm: string): boolean {
  return /\b(pago movil|pagomovil|movil|banco de venezuela|bdv|en bolivares|datos de venezuela|venezuela|metodo de venezuela)\b/.test(norm) &&
    /(pago|paga|pagar|transfer|datos|cuenta|movil|bolivares|metodo|deposito)/.test(norm);
}

/**
 * El lead pide explícitamente un método/zona de pago COLOMBIA (Nequi,
 * Bancolombia, Bre-B, "datos de Colombia", "en pesos cómo pago", etc.).
 */
export function pideMetodoCO(norm: string): boolean {
  return /\b(nequi|bancolombia|bre-?b|breb|en pesos|datos de colombia|colombia|metodo de colombia)\b/.test(norm) &&
    /(pago|paga|pagar|transfer|datos|cuenta|pesos|metodo|deposito|nequi|bancolombia|breb|bre-b)/.test(norm);
}
