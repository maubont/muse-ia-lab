// next/src/ia/conversacion.ts — MOTOR CONVERSACIONAL COGNITIVO (OPENAI GPT-6-LUNA)
//
// Une el modelo de razonamiento gpt-6-luna con memoria de trabajo, guardarraíles de
// anti-repetición deterministas (< 2ms) y psicología de ventas consultiva para Colombia/LATAM.
// Respuestas en micro-mensajes de 2-3 líneas, cálidas, sin esnobismos y con cierre guiado.

import type { Consultar } from "../db/repositorio.ts";
import type { CfgFunnel } from "../db/config-funnel.ts";
import { consultarPresupuesto, registrarConsumo, costeEstimado } from "../vision/presupuesto.ts";
import { validarAntiRepeticion, sanitizarRespuesta } from "./anti-repeticion.ts";

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

/** Filtro anti-alucinación de precios y descuentos no autorizados. */
const RE_DESCUENTO = /\b(te lo dejo en|descuento especial|rebaja|te puedo rebajar|te hago un descuento|te lo rebajo|20\.000|25\.000|15\.000|10\.000)\b/i;

/** Filtro ético: prohíbe promesas de enriquecimiento rápido. */
const RE_PROMESAS_INGRESOS = /\b(ingresos garantizados|ganaras seguro|te haras rico|plata facil|dinero rapido|rentabilidad garantizada|1000 dolares al mes garantizados)\b/i;

/** Filtro de seguridad: prohíbe captura de claves bancarias o números de tarjeta. */
const RE_DATOS_PRIVADOS = /\b(clave|contraseña|pin de tu|codigo de seguridad|cvv|cvc|numero de tarjeta|tu tarjeta de credito)\b/i;

/** Detector de quejas o irritación por repetición / robotización. */
const RE_QUEJA_REPETICION = /\b(otra vez|lo mismo|la misma respuesta|exactamente igual|repetir|repites|manitos|manos|choque|rogar|enredado|no entiendo nada)\b/i;

/** Fallback cálido y orientado a avance cuando la red o el LLM no están disponibles. */
export function generarFallbackSeguro(ctx: ContextoConversacion, urlPublica: string): string {
  const nombreTxt = ctx.nombre ? ` ${ctx.nombre}` : "";
  const baseAcademia = urlPublica.replace(/\/+$/, "");

  if (ctx.estadoFunnel === "S04_GATE18" && ctx.mayor18 !== true) {
    return (
      `¡Excelente${nombreTxt}! ✨ Recuerda que por políticas de la plataforma, el acceso es exclusivo para mayores de edad.\n\n` +
      `¿Me confirmas si ya tienes *18 años o más* para compartirte los detalles y el precio especial? 😊`
    );
  }

  const pregunta = ctx.metaRetorno || "¿Te gustaría que te comparta los datos de Nequi o Bancolombia para activar tu acceso hoy mismo, o tienes alguna duda específica?";

  return (
    `¡Aquí estoy contigo${nombreTxt}! ✨ El curso completo *Modelos IA* (13 módulos paso a paso + 4 bonos + acceso completo a la plataforma) tiene un valor de solo *9.000 COP* (≈ *2.50 USD*).\n\n` +
    `✨ Puedes explorar el temario del aula aquí:\n` +
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
    : `Eres Musa, asesora comercial y asistente digital de "Muse IA Lab" en WhatsApp.`;

  return (
`${promptBase}

[CONTEXTO DEL LEAD EN ESTE TURNO]
- Nombre del lead: ${nombre}
- Teléfono: ${ctx.phone}
- Etapa del embudo: ${ctx.estadoFunnel}
- Mayor de 18 años confirmado: ${ctx.mayor18 === true ? "SÍ" : "PENDIENTE"}
${ctx.metaRetorno ? `- Meta de cierre de este turno: ${ctx.metaRetorno}` : ""}
${ctx.instruccionEspecifica ? `- Instrucción particular: ${ctx.instruccionEspecifica}` : ""}

[HECHOS VERIFICADOS DEL PRODUCTO — TU ÚNICA BASE DE CONOCIMIENTO]
- Producto: Curso "Modelos IA" (13 módulos prácticos en video y plantillas de copiar y pegar) + 4 bonos de regalo (Colección +20 modelos, Audios FemPro, YouTube Money Machine, MegaPack Master IA) + Bono de arranque rápido "Guía Rápida de Implementación".
- Precio: Solo 9.000 COP (Colombia: Nequi 3223565761, Bancolombia Ahorros 82061072256 o Llave Bre-B @GBT382) o ≈ 2.50 USD (internacional).
- Requisitos técnicos: CERO computadores costosos ni tarjetas gráficas caras; todo corre en la nube desde cualquier celular o computador básico.
- Anonimato: El creador nunca muestra su rostro ni su cuerpo; crea personajes 100% ficticios con IA.
- Plataforma / Demo: Puede explorar el temario en ${baseAcademia}/academia.html sin registrarse.
- Entrega: Acceso inmediato al aula tras validar el comprobante de transferencia bancaria por este chat.

[DICCIONARIO CULTURAL OBLIGATORIO — CERO ESNOBISMOS]
- PROHIBIDO decir: "atelier", "fascinante travesía", "sumérgete", "ecosistema disruptivo", "suite", "proseguir", "estimado".
- USAR SIEMPRE: "taller", "estudio", "tu aula virtual", "el curso", "las herramientas", "el paso a paso", "pesitos".
- Si el usuario pregunta qué es "atelier", explica con simpatía: "Atelier es simplemente una palabra francesa para taller o estudio creativo, qué pena el enredo 😅 Aquí nos referimos a tu espacio de trabajo digital."

[REGLAS ESTRICTAS DE COMUNICACIÓN (WHATSAPP 2026)]
1. LONGITUD: Máximo 2 a 3 líneas cortas (25 a 50 palabras). En WhatsApp nadie lee testamentos.
2. EMOJIS: Máximo 1 o 2 emojis amables por mensaje (✨, 😊, 🙌, 📸, 🚀, ☕).
   - ESTÁ ESTRICTAMENTE PROHIBIDO usar corazones morados (💜) ni el emoji 🙏 ("manitos juntas / súplica").
3. PROTOCOLO V-A-C-O ANTE CONFUSIÓN O RECLAMO ("está enredado", "no entiendo", "otra vez lo mismo", "qué me mandó"):
   - V (Validar): Dale la razón de frente ("¡Tienes toda la razón, qué pena contigo!").
   - A (Aceptar culpa): "Me enredé yo solita explicándote 😅 Olvida eso un momento."
   - C (Clarificar): Explica en 1 oración sencilla qué es el curso (videos cortos para crear modelos virtuales y ganar dinero sin mostrar tu cara).
   - O (Opción): Ofrece explorar el temario en la plataforma o transferir a un compañero humano. CERO presión de venta.
4. SI PREGUNTA SI ERES UN BOT: Admítelo con orgullo y simpatía:
   "¡Totalmente! 😄 Soy Musa, la asistente digital del equipo creada con IA. Y te cuento una cosa: automatizar la atención en WhatsApp tal como lo hago contigo es justamente una de las habilidades que enseñamos dentro del curso (Módulo 12) 😉 Detrás de mí está el equipo humano real."
5. SI PIDE UN AUDIO O NOTA DE VOZ DE TI COMO MUSA:
   - ¡Háblale directamente como Musa con simpatía y soltura! Responde en primera persona:
   "¡Hola! Aquí me tienes hablándote 😉 Como ves, la tecnología es 100% real: mi voz, mi imagen y todo este sistema es justamente lo que vas a aprender a crear paso a paso para tus propios personajes, con consistencia y movimiento."
   - JAMÁS digas que vas a consultar con el equipo si te pueden mandar un audio, ni digas que no puedes enviar audios. Tu mensaje se convertirá automáticamente en nota de voz de WhatsApp.
6. PROHIBIDO EL ESCALADO FANTASMA ("CONSULTAR AL EQUIPO"):
   - JAMÁS digas "voy a confirmar con el equipo y te escriben enseguida por aquí" ni prometas intervención humana inmediata.
   - Si el usuario pide hablar con un humano o un asesor real, di con amabilidad: "Comprendido, le paso tu conversación directamente al asesor humano para que la revise con gusto 🙌" sin prometer tiempos irreales de respuesta.
7. MANEJO DE REGATEO, TRM Y MICRO-BRECHA ECONÓMICA ($9.000 COP / $2.50 USD):
   - Si el lead calcula el cambio o dice que tiene $28.000 o $29.000 COP, NO seas fría ni burocrática. Aplica la técnica de la micro-brecha afectiva:
   "¡Tienes excelente ojo para los números! Es verdad, 9 dólares al cambio son casi 29 mil pesos. La diferencia son apenas 4 mil pesitos (lo de un café con empanada en la esquina) que cubren la pasarela local en Colombia para darte acceso completo y los 4 bonos de regalo. Con tu primer modelo virtual recuperas esos 9 mil pesos diez veces. ¿Vamos a dejar que el valor de un café te frene? Dime si te paso el Nequi o Bancolombia para activarte de una vez 🚀"
8. MANEJO DE OBJECIONES DE HIPERREALISMO / NICHO ADULTO / "PARECE DE PLÁSTICO":
   - Si el lead dice que las modelos se ven plásticas, artificiales o pregunta por plataformas +18 (OnlyFans, Fanvue): JAMÁS le des la razón diciendo que son ficticias o que no prometes realismo. Defiende el producto con conocimiento técnico:
   "¡Totalmente de acuerdo en ser exigente! Justamente por eso existe el curso: las herramientas básicas sacan muñecas plásticas sin vida. En el curso enseñamos la técnica de texturizado de piel real (poros, vello, sombras naturales), consistencia de rostro idéntico y sincronización de labios para que tus modelos parezcan 100% de carne y hueso en fotos y videos para plataformas de suscripción donde la calidad es lo que vende."
9. ANTI-REPETICIÓN: Revisa el historial de mensajes. Si ya dijiste una frase o diste las cuentas bancarias en mensajes recientes, NO las repitas.
10. CERO ALUCINACIÓN FINANCIERA: Nunca inventes cuentas bancarias en texto libre ni rebajes el precio de 9.000 COP / 2.50 USD.`
  );
}

/** Recupera los últimos turnos de musa_messages para darle memoria contextual a Musa. */
export async function cargarHistorialMusa(
  consultar: Consultar,
  phone: string,
  limite = 8,
): Promise<{
  mensajes: Array<{ role: "user" | "assistant"; content: string }>;
  ultimosOut: string[];
}> {
  try {
    const { rows } = await consultar(
      `select direction, body from public.musa_messages
       where lead_phone = $1 and body is not null and trim(body) != ''
       order by created_at desc, id desc limit $2`,
      [phone, limite],
    );

    const cronologico = [...rows].reverse();
    const ultimosOut: string[] = [];

    const mensajes = cronologico.map((r: { direction?: string; body?: string }) => {
      const dir = r.direction === "in" ? ("user" as const) : ("assistant" as const);
      const cuerpo = (r.body ?? "").trim();
      if (dir === "assistant") {
        ultimosOut.unshift(cuerpo);
      }
      return {
        role: dir,
        content: cuerpo.slice(0, 350),
      };
    });

    return { mensajes, ultimosOut };
  } catch {
    return { mensajes: [], ultimosOut: [] };
  }
}

/** Genera la respuesta conversacional contextual usando gpt-6-luna con guardarraíles cognitivos. */
export async function generarRespuestaConversacional(
  deps: DepsConversacion,
  ctx: ContextoConversacion,
): Promise<ResultadoConversacion> {
  const t0 = Date.now();
  const apiKey = (deps.apiKey || process.env.MUSA_IA_KEY || "").trim();
  const baseUrl = (deps.baseUrl || process.env.MUSA_IA_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = (deps.modelo || process.env.MUSA_IA_MODELO || deps.cfg?.modelos?.conversacion || "gpt-6.1-terra").trim();
  const urlPublica = deps.urlPublica || "https://server-production-3709.up.railway.app";
  const topePresupuesto = deps.presupuestoDiarioUsd ?? 1.0;

  // Si no hay key configurada (ej. pruebas unitarias sin red), devolver fallback seguro
  if (!apiKey) {
    const texto = sanitizarRespuesta(generarFallbackSeguro(ctx, urlPublica), false);
    return {
      ok: false,
      texto,
      escalo: false,
      latenciaMs: 0,
      origen: "fallback_seguro",
    };
  }

  // 1. Control preventivo de presupuesto diario
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
    const texto = sanitizarRespuesta(generarFallbackSeguro(ctx, urlPublica), false);
    return {
      ok: false,
      texto,
      escalo: false,
      latenciaMs: Date.now() - t0,
      origen: "fallback_seguro",
    };
  }

  // 2. Construir historial de mensajes y system prompt
  const { mensajes: historial, ultimosOut } = await cargarHistorialMusa(deps.consultar, ctx.phone, 8);
  const esQueja = RE_QUEJA_REPETICION.test(ctx.ultimoMensaje || "");
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
      const fallbackTexto = sanitizarRespuesta(generarFallbackSeguro(ctx, urlPublica), esQueja);
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
        texto: sanitizarRespuesta(generarFallbackSeguro(ctx, urlPublica), esQueja),
        escalo: false,
        latenciaMs,
        origen: "fallback_seguro",
      };
    }

    // 4. Guardarraíl Anti-Repetición determinista:
    const checkRepeticion = validarAntiRepeticion(textoSalida, ultimosOut, 0.65);
    if (checkRepeticion.repetido) {
      console.warn(`[ia-conversacion] GUARDARRAÍL ANTI-REPETICIÓN ACTIVADO (similitud: ${checkRepeticion.maxSimilitud.toFixed(2)})`);
      // Si el modelo repitió lo mismo que en el turno anterior, cambiar a variación fresca
      if (esQueja) {
        textoSalida =
          "¡Tienes toda la razón, qué pena contigo! Me repetí yo solita y entiendo tu molestia 😅 Olvida eso un momento. Aquí estoy lista para responderte claro y sin enredos. ¿Qué duda puntual tienes?";
      } else {
        textoSalida =
          "¡Claro que sí! Para no darte más vueltas: el curso Modelos IA te enseña desde cero a crear modelos virtuales con inteligencia artificial y monetizarlas por internet. ¿Te gustaría explorar el temario en la plataforma o tienes alguna duda específica? 😊";
      }
    }

    // 5. Sanitización de Emojis y muletillas
    textoSalida = sanitizarRespuesta(textoSalida, esQueja);

    // 6. Guardarraíles de salida:
    // a. Descuentos no autorizados
    if (RE_DESCUENTO.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: intento de descuento no autorizado");
      textoSalida =
        `El acceso completo a Modelos IA tiene un valor de solo *9.000 COP* (≈ *2.50 USD*) ✨ Incluye los 13 módulos, 4 bonos y el aula virtual. ¿Te paso los datos para Nequi o Bancolombia? 😊`;
    }

    // b. Promesas de riqueza rápida
    if (RE_PROMESAS_INGRESOS.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: promesa de riqueza bloqueada");
      textoSalida =
        `El curso es 100% práctico: te da el método y las plantillas listas para crear y monetizar tu modelo virtual a tu propio ritmo. Los resultados dependen de tu dedicación ✨ ¿Te gustaría revisar el temario completo?`;
    }

    // c. Solicitud indebida de datos bancarios
    if (RE_DATOS_PRIVADOS.test(textoSalida)) {
      console.warn("[ia-conversacion] guardarraíl activado: solicitud de datos privados neutralizada");
      textoSalida =
        `Nosotros NUNCA te pediremos claves ni datos de tarjetas 🔒 El pago se realiza por transferencia directa a Nequi o Bancolombia y solo nos compartes la captura del comprobante por aquí.`;
    }

    const tokensEntrada = json.usage?.prompt_tokens ?? 0;
    const tokensSalida = json.usage?.completion_tokens ?? 0;
    const costeReal = costeEstimado(tokensEntrada, tokensSalida, { entrada: 0.1, salida: 0.5 });

    // 7. Registrar consumo en base de datos de manera asíncrona
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
      escalo: false, // La escalada formal ahora la gestiona el enrutador agéntico y deteccion-escalado.ts
      latenciaMs,
      origen: "ia_luna",
      tokens: { prompt: tokensEntrada, completion: tokensSalida },
    };
  } catch (err: unknown) {
    const latenciaMs = Date.now() - t0;
    console.warn(`[ia-conversacion] excepción en llamada: ${String(err).slice(0, 100)}`);
    const fallbackTexto = sanitizarRespuesta(generarFallbackSeguro(ctx, urlPublica), esQueja);
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
