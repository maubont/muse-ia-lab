// next/src/ia/conversacion.ts — MOTOR CONVERSACIONAL CONTEXTUAL (OPENAI GPT-6-LUNA)
//
// Une el modelo de razonamiento gpt-6-luna con la memoria histórica de musa_messages.
// Diseñado para WhatsApp: respuestas de 2-3 líneas cortas, empáticas, resolutivas
// y orientadas a cerrar hacia Nequi / Bancolombia, respetando el catálogo cerrado de hechos.

import type { Consultar } from "../db/repositorio.ts";
import type { CfgFunnel } from "../db/config-funnel.ts";
import { consultarPresupuesto, registrarConsumo, costeEstimado } from "../vision/presupuesto.ts";

export interface ContextoConversacion {
  phone: string;
  nombre?: string | null;
  estadoFunnel: string;
  mayor18?: boolean | null;
  ultimoMensaje?: string;
  instruccionEspecifica?: string;
  metaRetorno?: string;
}

export interface DepsConversacion {
  consultar: Consultar;
  urlPublica?: string;
  presupuestoDiarioUsd?: number;
  cfg?: CfgFunnel;
  apiKey?: string;
  modelo?: string;
  baseUrl?: string;
}

export interface ResultadoConversacion {
  ok: boolean;
  texto: string;
  escalo: boolean;
  latenciaMs: number;
  origen: "ia_luna" | "fallback_seguro";
  tokens?: { prompt: number; completion: number };
}

/** Expresión para detectar cuando el modelo promete consultar con el equipo humano. */
const RE_PROMESA_EQUIPO = /(confirm|consult|pregunt|verific|revis|chequ|valid)\w*[^.!?\n]{0,40}\bequipo\b/i;

/** Filtro anti-alucinación de precios y descuentos no autorizados. */
const RE_DESCUENTO = /\b(te lo dejo en|descuento especial|rebaja|te puedo rebajar|te hago un descuento|te lo rebajo|20\.000|25\.000|15\.000|10\.000)\b/i;

/** Filtro ético: prohíbe promesas de enriquecimiento rápido. */
const RE_PROMESAS_INGRESOS = /\b(ingresos garantizados|ganaras seguro|te haras rico|plata facil|dinero rapido|rentabilidad garantizada|1000 dolares al mes garantizados)\b/i;

/** Filtro de seguridad: prohíbe captura de claves bancarias o números de tarjeta. */
const RE_DATOS_PRIVADOS = /\b(clave|contraseña|pin de tu|codigo de seguridad|cvv|cvc|numero de tarjeta|tu tarjeta de credito)\b/i;

/** Fallback cálido y orientado a avance cuando la red o el LLM no están disponibles. */
export function generarFallbackSeguro(ctx: ContextoConversacion, urlPublica: string): string {
  const nombreTxt = ctx.nombre ? ` ${ctx.nombre}` : "";
  const baseAcademia = urlPublica.replace(/\/+$/, "");

  if (ctx.estadoFunnel === "S04_GATE18" && ctx.mayor18 !== true) {
    return (
      `¡Excelente${nombreTxt}! ✨ Recuerda que por políticas de la plataforma, el acceso es exclusivo para mayores de edad.\n\n` +
      `¿Me confirmas si ya tienes *18 años o más* para compartirte los detalles y el precio especial? 🙏`
    );
  }

  const pregunta = ctx.metaRetorno || "¿Te gustaría que te comparta los datos de Nequi o Bancolombia para activar tu acceso hoy mismo, o tienes alguna duda específica?";

  return (
    `¡Aquí estoy contigo${nombreTxt}! ✨ El curso completo *Modelos IA* (13 módulos paso a paso + 4 bonos + acceso de por vida a Musa Studio) tiene un pago único de *33.000 COP* (≈ *9 USD*).\n\n` +
    `✨ Puedes degustar la plataforma y ver la *Clase 1 gratis* aquí:\n` +
    `${baseAcademia}/academia.html\n\n` +
    `${pregunta}`
  );
}

/** Construye el System Prompt maestro de Musa adaptado al estado del lead. */
export function armarSystemPrompt(ctx: ContextoConversacion, urlPublica: string, cfgPrompt?: string): string {
  const baseAcademia = urlPublica.replace(/\/+$/, "");
  const nombre = ctx.nombre || "amigo";

  const promptBase = cfgPrompt && cfgPrompt.length > 50
    ? cfgPrompt
    : `Eres Musa, la asesora comercial y asistente virtual oficial de "Muse IA Lab" en WhatsApp.`;

  return (
`${promptBase}

[CONTEXTO DEL LEAD EN ESTE TURNO]
- Nombre del lead: ${nombre}
- Teléfono: ${ctx.phone}
- Etapa del embudo: ${ctx.estadoFunnel}
- Mayor de 18 años confirmado: ${ctx.mayor18 === true ? "SÍ" : "PENDIENTE"}
${ctx.metaRetorno ? `- Meta de cierre de este turno: ${ctx.metaRetorno}` : ""}
${ctx.instruccionEspecifica ? `- Instrucción particular: ${ctx.instruccionEspecifica}` : ""}

[HECHOS CERRADOS DEL PRODUCTO — TU ÚNICA VERDAD]
- Oferta: Curso "Modelos IA" (13 módulos prácticos en video y plantillas de copiar y pegar) + 4 bonos exclusivos (Colección +20 modelos, Audios FemPro, YouTube Money Machine, MegaPack Master IA) + Bono de Decisión Rápida "Guía Rápida de Implementación" (primeras 24 horas).
- Precio: Único pago de 33.000 COP (Colombia: Nequi, Bancolombia o llave Bre-B) o ≈ 9 USD (internacional). Sin mensualidades ni cobros sorpresa.
- Requisitos técnicos: No requiere PC gamer ni tarjeta gráfica costosa; todo corre en la nube desde cualquier celular o computador básico.
- Anonimato: El creador nunca muestra su rostro ni su cuerpo; crea personajes 100% ficticios con IA detrás de escena.
- Plataforma / Demo: Puede ver la Clase 1 gratis en ${baseAcademia}/academia.html.
- Entrega: Enlace personal al área privada inmediatamente tras validar el comprobante de transferencia bancaria por este chat.

[REGLAS CONVERSACIONALES WHATSAPP (MANDATORIAS)]
1. LONGITUD: Responde en MÁXIMO 2 A 3 LÍNEAS CORTAS (estilo chat rápido de WhatsApp, 35 a 65 palabras). Prohibidos los muros de texto.
2. TONO: Cálido, latino (Colombia neutro), empático, tuteo respetuoso. Emojis medidos (✨, 🙌, 🚀, 😊, 📸). ESTÁ ESTRICTAMENTE PROHIBIDO usar corazones morados.
3. SI TE PREGUNTAN SI ERES UN BOT: Admítelo SIEMPRE con simpatía y orgullo profesional, y conviértelo en demo del producto:
   "¡Totalmente! 😄 Soy Musa, la asistente digital de Muse IA Lab creada con IA. Y de hecho, automatizar la atención en WhatsApp e Instagram así como lo hago contigo es justamente una de las habilidades que aprenderás en el Módulo 12 😉 Detrás de mí está el equipo humano revisando cada comprobante."
4. CIERRE GUIADO CONTEXTUAL: Remata SIEMPRE con una pregunta orientada al siguiente paso o a elegir medio de pago, PERO si las cuentas ya fueron dadas en el chat, orienta a la transferencia:
   - Si aún no tiene las cuentas: "¿Te paso los datos para Nequi o prefieres Bancolombia? 😊"
   - Si ya tiene las cuentas en el chat: "¿Crees que puedas hacer la transferencia ahorita para activarte el aula de una vez? 🚀"
5. GATE 18+: Si el usuario AÚN NO confirma ser mayor de edad, responde su duda y termina SIEMPRE preguntando: "¿Me confirmas si ya tienes 18 años o más? 😊". Si declara ser menor de edad, rechaza amablemente la venta.
6. CERO ALUCINACIÓN FINANCIERA: Jamás inventes precios ni descuentos. Jamás prometas "ingresos garantizados" ni "hacerse rico". Jamás pidas números de tarjeta, claves ni PINs ni generes números de cuenta inventados.
7. MANEJO DE CONFUSIÓN Y RECLAMOS: Si el usuario dice "¿cuál captura?", "estoy pidiendo info" o nota que te adelantaste, valida de inmediato con gracia:
   "¡Tienes toda la razón, qué pena contigo! Me adelanté de la emoción 😅 Olvida lo de la captura por un momento." Responde en 2 líneas sin rodeos y sin exigir pagos.
8. MANEJO DE DESCONFIANZA O TEMOR A ESTAFAS: Si el lead duda o pregunta si es real, valida su prudencia con amabilidad ("En internet hay que ser precavido y haces muy bien en dudar 🙏") e invítalo a ver la Clase 1 gratis en ${baseAcademia}/academia.html sin pagar nada.
9. CONSCIENCIA HISTÓRICA DEL CHAT: Revisa los mensajes previos. Si el usuario ya dijo que vio la plataforma o el video, jamás le digas que vaya a verlo. Si ya tiene las cuentas bancarias en la pantalla, jamás le preguntes si se las pasas.
10. ESTRATEGIA CONSULTIVA ANTE FALTA DE DINERO (ej. 'Tengo 29 mil pesos'): Valida con calidez y picardía ("Te entiendo, estás a nada: son solo 4.000 pesitos de diferencia, lo de un café 😊"). Explica con afecto que la plataforma y los 4 bonos se activan con los 33.000 COP exactos, recuérdale que con su primera creación monetizada recupera esa inversión multiplicada, y motívalo a completar el faltante por Nequi para no perder el cupo.
11. ESPONTANEIDAD TOTAL: Cero respuestas de plantilla o párrafos enlatados. Habla como una experta en ventas humana, fresca, inteligente y empática.`
  );
}

/** Recupera los últimos turnos de musa_messages para darle memoria contextual a Musa. */
export async function cargarHistorialMusa(consultar: Consultar, phone: string, limite = 8): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const { rows } = await consultar(
      `select direction, body from public.musa_messages
       where lead_phone = $1 and body is not null and trim(body) != ''
       order by created_at desc, id desc limit $2`,
      [phone, limite],
    );

    const cronologico = rows.reverse();
    return cronologico.map((r: { direction?: string; body?: string }) => ({
      role: r.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: (r.body ?? "").slice(0, 350),
    }));
  } catch {
    return [];
  }
}

/**
 * Genera la respuesta conversacional contextual usando gpt-6-luna.
 */
export async function generarRespuestaConversacional(
  deps: DepsConversacion,
  ctx: ContextoConversacion,
): Promise<ResultadoConversacion> {
  const t0 = Date.now();
  const apiKey = (deps.apiKey || process.env.MUSA_IA_KEY || "").trim();
  const baseUrl = (deps.baseUrl || process.env.MUSA_IA_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = (deps.modelo || process.env.MUSA_IA_MODELO || deps.cfg?.modelos?.conversacion || "gpt-6-luna").trim();
  const urlPublica = deps.urlPublica || "https://server-production-3709.up.railway.app";
  const topePresupuesto = deps.presupuestoDiarioUsd ?? 1.0;

  // Si no hay key configurada (ej. pruebas unitarias sin internet), devolver fallback seguro
  if (!apiKey) {
    const texto = generarFallbackSeguro(ctx, urlPublica);
    return {
      ok: false,
      texto,
      escalo: false,
      latenciaMs: 0,
      origen: "fallback_seguro",
    };
  }

  // 1. Control preventivo de presupuesto diario (fail-open si hay problema transitorio de DB)
  let permitido = true;
  try {
    const costoEstimadoTurno = costeEstimado(600, 350, { entrada: 0.1, salida: 0.5 });
    const estadoPto = await consultarPresupuesto(deps.consultar, {
      tope: topePresupuesto,
      estimado: costoEstimadoTurno,
    });
    if (!estadoPto.permitido && (estadoPto.motivo === "presupuesto_agotado" || estadoPto.motivo === "no_cabe_en_el_presupuesto")) {
      permitido = false;
      console.warn(`[ia-conversacion] presupuesto agotado: gastado=${estadoPto.gastado}, tope=${estadoPto.tope}`);
    }
  } catch (err) {
    console.warn(`[ia-conversacion] fallo consultando presupuesto (fail-open para chat):`, err);
    permitido = true;
  }

  if (!permitido) {
    const texto = generarFallbackSeguro(ctx, urlPublica);
    return {
      ok: false,
      texto,
      escalo: false,
      latenciaMs: Date.now() - t0,
      origen: "fallback_seguro",
    };
  }

  // 2. Construir historial de mensajes y system prompt
  const historial = await cargarHistorialMusa(deps.consultar, ctx.phone, 8);
  const systemPrompt = armarSystemPrompt(ctx, urlPublica, deps.cfg?.gptSystem?.prompt);

  const mensajesPayload: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...historial,
  ];

  if (ctx.ultimoMensaje && (!historial.length || historial[historial.length - 1].content !== ctx.ultimoMensaje)) {
    mensajesPayload.push({ role: "user", content: ctx.ultimoMensaje.slice(0, 400) });
  }

  // 3. Invocar a gpt-6-luna con timeout de 8.0 segundos
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        max_completion_tokens: 350,
        reasoning_effort: "low",
        messages: mensajesPayload,
      }),
      signal: ctrl.signal,
    });

    const latenciaMs = Date.now() - t0;

    if (!res.ok) {
      const errTexto = await res.text().catch(() => "");
      console.warn(`[ia-conversacion] HTTP ${res.status} de OpenAI (${modelo}): ${errTexto.slice(0, 100)}`);
      const fallbackTexto = generarFallbackSeguro(ctx, urlPublica);
      return {
        ok: false,
        texto: fallbackTexto,
        escalo: false,
        latenciaMs,
        origen: "fallback_seguro",
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    let textoSalida = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!textoSalida) {
      return {
        ok: false,
        texto: generarFallbackSeguro(ctx, urlPublica),
        escalo: false,
        latenciaMs,
        origen: "fallback_seguro",
      };
    }

    // 4. Post-procesamiento y guardarraíles de salida:
    // a. Limpiar corazones morados
    textoSalida = textoSalida.replace(/💜/g, "✨");

    // b. Detectar si intentó inventar descuentos no autorizados
    if (RE_DESCUENTO.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: intento de descuento no autorizado");
      textoSalida =
        `El acceso completo a Modelos IA tiene un único pago de *33.000 COP* (≈ *9 USD*), sin mensualidades ni cobros adicionales ✨ Incluye los 13 módulos, 4 bonos y la plataforma de por vida. ¿Te paso los datos para Nequi o Bancolombia? 😊`;
    }

    // c. Detectar promesas de enriquecimiento rápido
    if (RE_PROMESAS_INGRESOS.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: promesa de riqueza bloqueada");
      textoSalida =
        `El curso es 100% formativo y práctico: te da el método y las plantillas listas para crear y monetizar tu modelo virtual a tu propio ritmo. Los resultados dependen de tu dedicación y constancia ✨ ¿Te gustaría revisar el temario completo?`;
    }

    // d. Detectar solicitud indebida de claves o tarjetas
    if (RE_DATOS_PRIVADOS.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: solicitud de datos privados neutralizada");
      textoSalida =
        `Nosotros NUNCA te pediremos claves ni datos de tarjetas 🔒 El pago se realiza por transferencia directa a Nequi o Bancolombia y solo nos compartes la captura del comprobante por aquí.`;
    }

    // e. Evaluar si escaló al equipo humano
    const escalo = RE_PROMESA_EQUIPO.test(textoSalida);

    const tokensEntrada = json.usage?.prompt_tokens ?? 0;
    const tokensSalida = json.usage?.completion_tokens ?? 0;
    const costeReal = costeEstimado(tokensEntrada, tokensSalida, { entrada: 0.1, salida: 0.5 });

    // 5. Registrar consumo en base de datos de manera asíncrona
    void registrarConsumo(deps.consultar, {
      lead: ctx.phone,
      proveedor: baseUrl,
      modelo,
      proposito: "conversacion",
      tokensEntrada,
      tokensSalida,
      coste: costeReal,
      exito: true,
    });

    return {
      ok: true,
      texto: textoSalida,
      escalo,
      latenciaMs,
      origen: "ia_luna",
      tokens: { prompt: tokensEntrada, completion: tokensSalida },
    };
  } catch (err: unknown) {
    const latenciaMs = Date.now() - t0;
    console.warn(`[ia-conversacion] excepción en llamada: ${String(err).slice(0, 100)}`);
    const fallbackTexto = generarFallbackSeguro(ctx, urlPublica);
    return {
      ok: false,
      texto: fallbackTexto,
      escalo: false,
      latenciaMs,
      origen: "fallback_seguro",
    };
  } finally {
    clearTimeout(timer);
  }
}
