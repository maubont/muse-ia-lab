// next/src/motor/deteccion-escalado.ts — DETECCIÓN MULTICAPA DE ESCALADO A HUMANO Y HANDOFF TRANSPARENTE.
//
// Identifica cuando un lead requiere atención humana real (petición directa, frustración,
// quejas de robotización, incertidumbre de espera o reclamos operativos) y genera
// una respuesta honesta y definitiva que jamás promete "consultar con el equipo".

export type MotivoEscalado =
  | "solicitud_explicita"
  | "frustracion_incertidumbre"
  | "reclamo_operativo"
  | "fuera_de_alcance_legal"
  | "fatiga_bucle";

export interface ResultadoDeteccionEscalado {
  debeEscalar: boolean;
  motivo?: MotivoEscalado;
  detalle?: string;
}

export function normalizarTexto(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// 1. Solicitud directa de hablar con una persona
const RE_SOLICITUD_HUMANO =
  /\b(humano|asesor(a|es)?|agente|operador(a)?|soporte|atencion\s+al\s+cliente|servicio\s+al\s+cliente|persona\s+real|alguien\s+de\s+carne\s+y\s+hueso)\b/i;

const RE_INTENCION_CONTACTO =
  /(hablar|comunicar|comuniqueme|comunicame|contactar|atender|atienda|pasame|pasa|conectar|quiero|necesito)\s+(con\s+)?(una?\s+)?(persona|alguien|humano|asesor|agente)/i;

const RE_RECLAMO_RESPUESTA =
  /alguien\s+(que\s+)?(me\s+)?(responda|ayude|atienda|escuche|de\s+informacion)/i;

// 2. Frustración, robotización e incertidumbre sobre atención (Caso real de Mauricio)
const RE_INCERTIDUMBRE_HUMANO =
  /\b(el\s+humano\s+(ya\s+)?sabe|saber\s+si\s+(el\s+)?humano|esperar\s+a\s+que\s+(un\s+)?humano|quedar(me)?\s+con\s+la\s+incertidumbre|si\s+me\s+van\s+a\s+atender|por\s+que\s+no\s+me\s+(escribe|responde|llama|envio|dice))\b/i;

const RE_FRUSTRACION_BOT =
  /\b(deja\s+de\s+repetir|eres\s+una?\s+(grabadora|robot|maquina)|no\s+entiendes\s+nada|la\s+misma\s+respuesta|otra\s+vez\s+lo\s+mismo|exactamente\s+igual|esas\s+dos\s+manitos|manitos\s+de\s+rogar|choque\s+esos\s+cinco|no\s+me\s+sirve\s+esa\s+respuesta|responde\s+lo\s+que\s+te\s+pregunt[oe]|no\s+me\s+respondes|me\s+tienen\s+(harto|mamado|cansado)|ya\s+me\s+canse|pesimo\s+servicio|deja\s+la\s+robadera|estafa(dores)?|ladron(es)?|fraude)\b/i;

// 3. Reclamos operativos de dinero/entrega
const RE_RECLAMO_OPERATIVO =
  /\b(ya\s+pague\s+y\s+nada|descontaron\s+la\s+plata|no\s+me\s+llego\s+el\s+curso|link\s+caido|no\s+abre\s+el\s+enlace|cuenta\s+bloqueada|devuelvanme\s+la\s+plata|reembolso|devolucion\s+del\s+dinero)\b/i;

// 4. Preguntas fuera de alcance comercial (legal / empresarial / B2B)
const RE_OUT_OF_SCOPE =
  /\b(factura\s+electronica|rut|nit\s+de\s+la\s+empresa|superintendencia|sic|demanda|abogado|contrato\s+comercial|convenio\s+empresarial)\b/i;

/** Detecta si un mensaje requiere escalado a operador humano. */
export function detectarIntencionEscalado(textoOriginal: string): ResultadoDeteccionEscalado {
  const norm = normalizarTexto(textoOriginal);
  if (!norm) return { debeEscalar: false };

  // Evitar falsos positivos si solo pregunta si es bot con simple curiosidad
  const esPreguntaCuriosaBot =
    /\b(eres|sos)\s+(un\s+)?(bot|robot|ia|inteligencia artificial)\b/i.test(norm) &&
    !/(humano|asesor|queja|incertidumbre|esperar|atiende|repetir|manitos)/i.test(norm);

  if (esPreguntaCuriosaBot) {
    return { debeEscalar: false };
  }

  // 1. Incertidumbre de atención o queja de espera previa
  if (RE_INCERTIDUMBRE_HUMANO.test(norm)) {
    return {
      debeEscalar: true,
      motivo: "frustracion_incertidumbre",
      detalle: "Cliente manifiesta incertidumbre sobre si un asesor humano está notificado",
    };
  }

  // 2. Frustración directa con el bot o reclamo por respuestas repetidas/emojis
  if (RE_FRUSTRACION_BOT.test(norm)) {
    return {
      debeEscalar: true,
      motivo: "frustracion_incertidumbre",
      detalle: "Frustración evidente con la automatización o queja por repetición/emojis",
    };
  }

  // 3. Solicitud explícita de un humano
  if (RE_SOLICITUD_HUMANO.test(norm) || RE_INTENCION_CONTACTO.test(norm) || RE_RECLAMO_RESPUESTA.test(norm)) {
    return {
      debeEscalar: true,
      motivo: "solicitud_explicita",
      detalle: "Petición directa de conectar con un asesor humano",
    };
  }

  // 4. Reclamo de pago / entrega
  if (RE_RECLAMO_OPERATIVO.test(norm)) {
    return {
      debeEscalar: true,
      motivo: "reclamo_operativo",
      detalle: "Reclamo por cobro realizado, enlace caído o solicitud de soporte urgente",
    };
  }

  // 5. Fuera de alcance legal / tributario
  if (RE_OUT_OF_SCOPE.test(norm)) {
    return {
      debeEscalar: true,
      motivo: "fuera_de_alcance_legal",
      detalle: "Consulta legal, tributaria o corporativa fuera del catálogo cerrado",
    };
  }

  return { debeEscalar: false };
}

/** Mensaje de hand-off que recibe el cliente en WhatsApp: honesto, definitivo y sin falsas esperas. */
export function generarMensajeHandoffCliente(nombre?: string | null): string {
  const nombreLimpio = (nombre || "").trim();
  if (nombreLimpio && !/^(usuario|amigo|cliente)$/i.test(nombreLimpio)) {
    return `${nombreLimpio}, he notificado directamente a nuestro asesor humano para que revise tu caso y te responda por aquí mismo en cuanto esté disponible.`;
  }
  return "He notificado directamente a nuestro asesor humano para que revise tu caso y te responda por aquí mismo en cuanto esté disponible.";
}
