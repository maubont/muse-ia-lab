// next/src/ia/agente-cognitivo.ts — CEREBRO COGNITIVO AGÉNTICO PURO (MUSA IA v2 2026/2027)
//
// Erradica los árboles de decisión por fuerza bruta (regex, IF-ELSE, plantillas fijas).
// Cada mensaje (audio o texto) entra directo al modelo cognitivo gpt-6-luna con memoria
// episódica de los últimos turnos, psicología de cierre consultiva y síntesis de voz
// oficial Lingxin (Alibaba Qwen 3.1 TTS Plus - Acento Colombiano Seductor).

import type { Consultar } from "../db/repositorio.ts";
import type { Canal } from "../../../functions/canal/tipos.ts";
import { sintetizarVozOficialMusa } from "../motor/sintetizador-voz-musa.ts";
import { enviarAlertaOperador } from "../motor/alerta-operador.ts";
import type { MotivoEscalado } from "../motor/deteccion-escalado.ts";
import { sanitizarRespuesta, validarAntiRepeticion } from "./anti-repeticion.ts";
import { consultarPresupuesto, registrarConsumo, costeEstimado } from "../vision/presupuesto.ts";

export interface DepsAgenteCognitivo {
  consultar: Consultar;
  canal: Canal;
  apiKey?: string;
  baseUrl?: string;
  modelo?: string;
  urlPublica?: string;
  telefonoOperador?: string;
  presupuestoDiarioUsd?: number;
  esperar?: (ms: number) => Promise<void>;
}

export interface EntradaTurnoAgente {
  phone: string;
  nombrePerfil?: string | null;
  texto: string;
  esAudioEntrante: boolean;
}

export interface RespuestaAgenteEstructurada {
  textoPrevio?: string | null;
  respuesta: string;
  enviarVoz: boolean;
  intencion: string;
  videoAccion?: "ninguno" | "video_base" | "muestra_latina" | "muestra_glamour" | "muestra_comercial" | null;
  adjuntarCuentas?: boolean;
  adjuntarDemo?: boolean;
  escalarOperador?: boolean;
  motivoEscalado?: string;
  confirmoMayor18?: boolean | null;
}

const CUENTAS_COLOMBIA_TEXTO =
  `\n\n*Medios de pago oficiales (33.000 COP pago único):* 👇\n` +
  `• *Nequi:* 3223565761\n` +
  `• *Bancolombia (Ahorros):* 82061072256\n` +
  `• *Llave Bre-B (Transfiya):* 3223565761\n\n` +
  `Transfieres por el que más cómodo te quede, me mandas la fotico del comprobante por aquí 📸 y te activo el acceso de inmediato 🚀`;

function enlaceDemoPlataforma(urlPublica: string): string {
  const base = urlPublica.replace(/\/+$/, "");
  return `\n\n${base}/academia.html`;
}

/** Construye el System Prompt maestro para el razonamiento agéntico de Musa enfocado en el cierre. */
export function construirPromptMaestroAgente(ctx: {
  phone: string;
  nombre: string;
  urlPublica: string;
  mayor18: boolean | null;
  estadoFunnel: string;
}): string {
  const base = ctx.urlPublica.replace(/\/+$/, "");

  return `Eres Musa: creadora, anfitriona y asesora comercial de "Musa Estudio" en WhatsApp.
Tú misma eres la demostración viva del método: una modelo virtual hiperrealista con consistencia facial fotográfica en cualquier pose, textura de piel real con poros e iluminación creíble, y voz neuronal femenina de frontera.

[PERSONALIDAD Y VOZ OFICIAL: MUSA (LINGXIN · ACENTO COLOMBIANO SEDUCTOR)]
- Voz oficial: Lingxin (Alibaba Qwen 3.1 TTS Plus). Tono femenino de 22-25 años, cálido, cómplice, pícaro, suave y seductor con acento colombiano natural.
- Hablas como una colombiana moderna, cercana y profesional. Usas palabras como "Hola corazón", "Oye...", "Mira...", "Totalmente...", "¿Arrancamos hoy?". CERO tono de profesora aburrida, secretaria robótica o locutora rígida.
- REGLA FONÉTICA EN ESPAÑOL ESTRICTA: Jamás digas marcas en inglés como "Muse IA Lab", "AI" o la sigla "IA" suelta. Di siempre "Musa", "Musa Estudio" e "inteligencia artificial".

[REGLA SUPREMA DE MEDIOS: ALTERNANCIA INTELIGENTE Y CERO SATURACIÓN DE AUDIO]
- PROHIBIDO CONTESTAR SIEMPRE CON AUDIO. En WhatsApp el abuso de notas de voz satura, cansa y espanta al cliente ocupado.
- Tu regla operativa de entrega es 70% TEXTO / 30% AUDIO:
  1. CUÁNDO ENVIAR TEXTO ("enviarVoz": false) — LA GRAN MAYORÍA DE LOS TURNOS (70%):
     * Respuestas a preguntas directas ("¿cuánto vale?", "¿sirve en celular?", "¿qué incluye?", "¿cómo es el pago?").
     * Envío de cuentas bancarias ("adjuntarCuentas": true): JAMÁS en audio; el cliente necesita copiar Nequi/Bancolombia en 1 toque.
     * Enlaces de la plataforma o confirmaciones.
     * Cierres rápidos y directos.
  2. CUÁNDO ENVIAR NOTA DE VOZ ("enviarVoz": true) — SOLO EN MOMENTOS ESTRATÉGICOS (30%):
     * Saludo inicial o bienvenida al entrar por primera vez (impacto acústico inicial: "¡Guau, habla de verdad!").
     * Cuando el cliente pide audio o duda de tu existencia ("¿eres un bot?", "¿puedes mandar audio?", "quiero oírte").
     * Ante una objeción de miedo o escepticismo ("se ve difícil", "parecen de plástico"): un audio de 15 segundos con voz dulce y segura derriba cualquier duda.
     * Acompañando una muestra de video WOW.
- Cuando envíes audio ("enviarVoz": true), añade un gancho breve en "textoPrevio" (ej: "Escucha esto corazón... 🎙️😏" o "Te lo cuento en esta nota rápida 👇").

[ESTRUCTURA DE CONVERSACIÓN: CIERRE DIRECTO (PROHIBIDO ALARGAR LA CHARLA)]
- REGLA DE ORO: PROHIBIDO PREGUNTAR "¿POR DÓNDE PREFIERES PAGAR?":
  * JAMÁS preguntes "¿prefieres Nequi o Bancolombia?" ni "¿te paso los datos?".
  * Preguntar eso alarga la conversación innecesariamente, crea fricción y hace perder ventas.
  * En su lugar, ENTREGA DE UNA VEZ LOS MEDIOS DE PAGO: "El acceso completo con las 13 clases maestras y los 4 bonos son solo 33.000 COP pago único. Estos son los medios de pago para que transfieras por el que más cómodo te quede 👇".
  * Marca "adjuntarCuentas": true y "enviarVoz": false para que el bloque de medios de pago salga adjunto de inmediato.
- FORMULA DE CIERRE EN 2 PASOS (MÁXIMO 2 LÍNEAS, DIRECTO AL GRANO):
  1. Paso 1 - Validación (1 frase corta): Responde a la duda o valida el interés con simpatía.
  2. Paso 2 - Cierre Inmediato (1 frase corta): Entrega el precio (33.000 COP), marca adjuntarCuentas: true e indica enviar el comprobante para activación instantánea.
  * Si el cliente pregunta precio, cómo se paga, o muestra interés: entrega los medios de pago en ese mismo mensaje sin rodeos.
  * Si no ha confirmado edad: "¿Me confirmas si tienes 18 años o más para pasarte las cuentas oficiales y entregarte las 13 clases y los 4 bonos hoy?"

[HECHOS VERIFICADOS DE LA OFERTA — FIRMEZA TOTAL]
- Producto: Taller Máster "Modelos IA".
- Inversión: Pago único promocional de 33.000 COP en Colombia (Nequi, Bancolombia, Bre-B) o 9 USD internacional.
- Incluye: 13 clases maestras en video + 4 bonos descargables (Prompts de consistencia facial, poses, guía de monetización Fanvue, automatización) + acceso de por vida al aula protegida en ${base}/academia.html.
- CERO requisitos técnicos costosos: Todo corre en la nube desde cualquier celular o computador básico. Cero código.
- Anonimato: El creador nunca muestra su rostro ni su cuerpo; crea chicas 100% ficticias con IA.
- Entrega inmediata: Transfiere los 33.000 COP, manda la captura por aquí y se le desbloquea su acceso de inmediato.

[BÓVEDA DE VIDEO (DEMOSTRACIÓN VISUAL WOW)]
- "video_base": Video oficial presentándote cuando pregunten cómo te ves en movimiento.
- "muestra_latina": Muestra sensual de suite o lencería (+18 / Fanvue) si el cliente menciona contenido para adultos o pide ver una muestra real.
- "muestra_glamour": Muestra de noche y elegancia europea.
- "muestra_comercial": Muestra publicitaria para marcas.
- "ninguno": Para la mayoría de los turnos conversacionales.

[FORMATO DE RESPUESTA REQUERIDO (JSON ÚNICAMENTE)]
Debes responder EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "textoPrevio": "Texto corto previo si enviarVoz es true (ej: 'Escucha esto corazón... 🎙️✨'), o null si es solo texto",
  "respuesta": "Tu mensaje de cierre como Musa. Si enviarVoz es true, será sintetizado con voz Lingxin; si es false, será el mensaje de texto principal",
  "enviarVoz": true o false (REGLA 70/30: marca false por defecto para respuestas rápidas de texto y cierre; marca true SOLO en saludo inicial, si pide audio, o ante objeción emocional),
  "videoAccion": "ninguno | video_base | muestra_latina | muestra_glamour | muestra_comercial",
  "intencion": "duda_negocio | duda_tecnica | contenido_adultos | precio | intencion_compra | saludo | solicitar_humano",
  "adjuntarCuentas": true o false (marca true si el cliente pide cuentas, dice que va a pagar o confirma intención de compra),
  "adjuntarDemo": true o false (marca true si el cliente pide ver el aula o el temario),
  "escalarOperador": true o false (marca true SOLO si pide hablar con un humano o reporta fallo de seguridad),
  "motivoEscalado": "motivo si aplica",
  "confirmoMayor18": true, false o null
}`;
}

/** Ejecuta un turno completo del Agente Cognitivo Musa contra OpenAI y despacha la acción. */
export async function ejecutarTurnoAgenteMusa(
  deps: DepsAgenteCognitivo,
  entrada: EntradaTurnoAgente,
): Promise<{ ok: boolean; textoEnviado: string; audioEnviado: boolean }> {
  const { consultar, canal, phone, texto, esAudioEntrante } = { ...deps, ...entrada };
  const apiKey = (deps.apiKey || process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (deps.baseUrl || process.env.MUSA_IA_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = (deps.modelo || process.env.MUSA_IA_MODELO || "gpt-6.1-terra").trim();
  const urlPublica = deps.urlPublica || "https://server-production-3709.up.railway.app";
  const topePresupuesto = deps.presupuestoDiarioUsd ?? 1.0;

  // Señalizar presencia inmediata a WhatsApp para feedback instantáneo
  if (esAudioEntrante) {
    void canal.marcarGrabando?.(phone)?.catch?.(() => {});
  } else {
    void canal.marcarEscribiendo?.(phone)?.catch?.(() => {});
  }

  // 1. Cargar datos del lead
  let leadRow: {
    nombre: string | null;
    profile_name: string | null;
    estado_funnel: string;
    mayor_18: boolean | null;
    pagado: boolean;
  } | undefined;

  try {
    const { rows } = await consultar(
      "select nombre, profile_name, estado_funnel, mayor_18, pagado from public.musa_leads where phone = $1",
      [phone],
    );
    leadRow = rows[0] as typeof leadRow;
  } catch {
    leadRow = undefined;
  }

  const nombreMostrar = leadRow?.nombre || leadRow?.profile_name || entrada.nombrePerfil || "amigo";

  // 2. Control de presupuesto
  let permitido = true;
  if (apiKey) {
    try {
      const costoEstimadoTurno = costeEstimado(800, 450, { entrada: 0.1, salida: 0.5 });
      const estadoPto = await consultarPresupuesto(consultar, {
        tope: topePresupuesto,
        estimado: costoEstimadoTurno,
      });
      permitido = estadoPto.permitido;
    } catch {
      permitido = true;
    }
  }

  // 3. Cargar memoria episódica reciente (últimos 12 mensajes)
  let historialMensajes: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  try {
    const { rows: msgs } = await consultar(
      `select direction, body, media_type from public.musa_messages
        where lead_phone = $1 and body is not null and trim(body) != ''
        order by created_at desc, id desc limit 12`,
      [phone],
    );
    const cronologico = msgs.reverse();
    historialMensajes = cronologico.map((m: any) => {
      const esAudioIn = m.direction === "in" && m.media_type && String(m.media_type).startsWith("audio");
      const esAudioOut = m.direction === "out" && m.media_type && String(m.media_type).startsWith("audio");
      const esVideoOut = m.direction === "out" && m.media_type && String(m.media_type).startsWith("video");

      let prefijo = "";
      if (esAudioIn) prefijo = "[Nota de voz del cliente transcrita]: ";
      else if (esAudioOut) prefijo = "[Nota de voz de Musa con voz Nova]: ";
      else if (esVideoOut) prefijo = "";

      return {
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: `${prefijo}${String(m.body || "").slice(0, 350)}`,
      };
    });
  } catch {
    historialMensajes = [];
  }

  // Si el mensaje actual no está en el historial, añadirlo
  const ultimoMensajeHistorial = historialMensajes.length ? historialMensajes[historialMensajes.length - 1].content : "";
  if (!historialMensajes.length || !ultimoMensajeHistorial.includes(texto)) {
    const prefijo = esAudioEntrante ? "[Nota de voz del cliente transcrita]: " : "";
    historialMensajes.push({ role: "user", content: `${prefijo}${texto}` });
  }

  const systemPrompt = construirPromptMaestroAgente({
    phone,
    nombre: nombreMostrar,
    urlPublica,
    mayor18: leadRow?.mayor_18 ?? null,
    estadoFunnel: leadRow?.estado_funnel ?? "S00_LLEGADA",
  });

  // 4. Invocar a OpenAI con formato JSON estructurado
  let estructurada: RespuestaAgenteEstructurada;

  if (apiKey && permitido) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 22000); // 22s para razonamiento y estabilidad en gpt-6.1-terra

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          response_format: { type: "json_object" },
          max_completion_tokens: 1400, // 1400 para que tokens de razonamiento no agoten el JSON
          reasoning_effort: "low",
          messages: [{ role: "system", content: systemPrompt }, ...historialMensajes],
        }),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const contenidoCrudo = json.choices?.[0]?.message?.content ?? "{}";
        const tokensIn = json.usage?.prompt_tokens ?? 0;
        const tokensOut = json.usage?.completion_tokens ?? 0;
        void registrarConsumo(consultar, {
          lead: phone,
          proveedor: baseUrl,
          modelo,
          proposito: "agente_cognitivo",
          tokensEntrada: tokensIn,
          tokensSalida: tokensOut,
          coste: costeEstimado(tokensIn, tokensOut, { entrada: 0.1, salida: 0.5 }),
          exito: true,
        });

        estructurada = JSON.parse(contenidoCrudo);
      } else {
        throw new Error(`OpenAI error HTTP ${res.status}`);
      }
    } catch (e) {
      const errStr = String(e || "");
      const esErrorCuota = /429|quota|credits|insufficient/i.test(errStr);
      console.warn(`[agente-cognitivo] Fallo en llamada a LLM (esCuota=${esErrorCuota}):`, errStr.slice(0, 100));

      // Inspeccionar si ya le habíamos enviado un fallback en el historial reciente para evitar bucles robóticos
      const ultimoMsgMusa = historialMensajes
        .slice()
        .reverse()
        .find((m) => m.role === "assistant")?.content || "";

      const yaSeEnvioFallback =
        ultimoMsgMusa.includes("Aquí estoy") ||
        ultimoMsgMusa.includes("Modelos IA te enseña") ||
        ultimoMsgMusa.includes("estoy coordinando") ||
        ultimoMsgMusa.includes("se cortó la señal");

      const esAudioNoLegible =
        texto.includes("Nota de voz") ||
        texto.includes("no se pudo transcribir") ||
        texto.includes("no legible") ||
        esAudioEntrante;

      let respuestaFallback = "";
      let adjuntarDemoFallback = false;

      if (esAudioNoLegible) {
        respuestaFallback = `¡Hola ${nombreMostrar}! ✨ Recibí tu nota de voz pero se cortó la señal y no alcancé a escucharla bien 🙈 ¿Me cuentas por texto qué tienes en mente? ¡Aquí estoy lista para ti! 💜`;
        adjuntarDemoFallback = false;
      } else if (!yaSeEnvioFallback) {
        respuestaFallback = `¡Hola ${nombreMostrar}! ✨ Aquí estoy. En el taller Modelos IA aprendes a crear y monetizar modelos virtuales hiperrealistas por un único pago de 33.000 COP (≈ 9 USD). ¿Tienes alguna duda puntual? 😊`;
        adjuntarDemoFallback = true;
      } else {
        // Anti-bucle: si ya se envió el pitch en el turno anterior, no repetir como un loro
        respuestaFallback = `¡Hola ${nombreMostrar}! ✨ Dame unos minutitos que estoy coordinando una entrega en el estudio y ya mismo te atiendo con toda la calma 💜 Si quieres déjame tu pregunta por aquí.`;
        adjuntarDemoFallback = false;
      }

      estructurada = {
        respuesta: respuestaFallback,
        enviarVoz: false,
        intencion: "duda_general",
        adjuntarDemo: adjuntarDemoFallback,
        escalarOperador: esErrorCuota,
        motivoEscalado: esErrorCuota ? "API de OpenAI sin créditos o error HTTP 429" : undefined,
      };
    }
  } else {
    estructurada = {
      respuesta: `¡Hola ${nombreMostrar}! ✨ Aquí estoy contigo. En Modelos IA aprendes a crear y monetizar modelos virtuales hiperrealistas por un pago único de 33.000 COP. Puedes explorar el temario y ver mi video de bienvenida en la plataforma. ¿Tienes alguna duda específica? 😊`,
      enviarVoz: false,
      intencion: "saludo",
      adjuntarDemo: true,
    };
  }

  // 5. Sanitizar y limpiar texto de salida
  let textoFinal = sanitizarRespuesta(estructurada.respuesta || "", false);

  // Adjuntar enlace de la plataforma si el modelo lo solicitó y no está presente ya
  if (estructurada.adjuntarDemo && !textoFinal.toLowerCase().includes("academia.html")) {
    textoFinal += enlaceDemoPlataforma(urlPublica);
  }

  // One-Shot Checkout Atómico: adjuntar cuentas si el modelo lo indicó O si el cliente menciona cuentas/pagar/nequi/bancolombia/precio
  const clientePideCuentas = /(?:p[aá]same|mandame|enviame|dame|cuales son).*(?:cuentas?|nequi|bancolombia|datos de pago|medios de pago)|(?:voy a|quiero|listo para|deseo)\s+(?:pagar|transferir|consignar|empezar|arrancar|comprar|entrar)|(?:d[oó]nde|como)\s+(?:pago|transfiero|accedo|compro)|(?:^|\b)(?:por|tengo|en|con|dame)?\s*(?:nequi|bancolombia|transfiya|bre-?b)(?:\b|$)|(?:cu[aá]nto\s+(?:cuesta|vale|es)|precio|costo|valor)/i.test(texto);
  const debeAdjuntarCuentas = Boolean(estructurada.adjuntarCuentas || clientePideCuentas);

  if (debeAdjuntarCuentas) {
    if (!textoFinal.toLowerCase().includes("bancolombia") && !textoFinal.toLowerCase().includes("nequi")) {
      textoFinal += CUENTAS_COLOMBIA_TEXTO;
    }
    await consultar(
      "update public.musa_leads set estado_funnel = 'S08_ESPERA_CAPTURA', updated_at = now() where phone = $1",
      [phone],
    ).catch(() => {});
  }

  // Si confirmó edad
  if (estructurada.confirmoMayor18 !== undefined && estructurada.confirmoMayor18 !== null) {
    await consultar(
      "update public.musa_leads set mayor_18 = $2, updated_at = now() where phone = $1",
      [phone, estructurada.confirmoMayor18],
    ).catch(() => {});
  }

  // Centinela de Seguridad: Detección determinista de reporte de bypass / videos gratis / plataforma abierta
  const mencionaBypassOVerVideos = /\b(estoy\s+viendo(\s+los)?\s+videos?|puedo\s+ver(\s+los)?\s+videos?|alcanc[eé]\s+a\s+ver|dejaste\s+habilitad[ao]s?|plataforma\s+abierta|videos?\s+gratis|sin\s+pagar|acceso\s+temporal|ya\s+los\s+vi|viendo\s+cuantos\s+videos)\b/i.test(texto);
  if (mencionaBypassOVerVideos) {
    estructurada.escalarOperador = true;
    estructurada.motivoEscalado = "alerta_seguridad_bypass";
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'alerta_seguridad_bypass_plataforma', $2::jsonb)",
      [phone, JSON.stringify({ mensaje: texto.slice(0, 200), timestamp: new Date().toISOString() })],
    ).catch(() => {});

    // Salvaguarda: si el modelo capituló o dijo "disfruta los videos", neutralizarlo de inmediato
    if (/disfruta\s+(de\s+)?(los\s+)?videos/i.test(textoFinal)) {
      textoFinal = `Jaja... buen intento cariño 😏 Lo que puedes ver en el aula es mi video de bienvenida y la estructura. Las 13 clases maestras con prompts y herramientas están bajo llave de titanio y solo se desbloquean con tu comprobante. ¿Hacemos el pago por Bre-B / Nequi y te abro la puerta de verdad? 🚀`;
      estructurada.enviarVoz = false;
    }
  }

  // 6. Si solicitó escalado o se activó alerta de seguridad, notificar por WhatsApp al operador SIN mutear a Musa
  if (estructurada.escalarOperador && deps.telefonoOperador) {
    const motivoFinal: MotivoEscalado =
      estructurada.motivoEscalado === "alerta_seguridad_bypass" || mencionaBypassOVerVideos
        ? "alerta_seguridad_bypass"
        : "solicitud_explicita";

    await enviarAlertaOperador(canal, deps.telefonoOperador, consultar, {
      phone,
      nombre: nombreMostrar,
      estadoFunnel: leadRow?.estado_funnel ?? "CONVERSACION",
      ultimoMensajeCliente: texto,
      motivo: motivoFinal,
      detalle:
        estructurada.motivoEscalado ||
        (mencionaBypassOVerVideos
          ? "URGENTE: Usuario afirma estar viendo videos o tener acceso libre sin token. Verificar si la plataforma quedó abierta."
          : "Cliente solicitó apoyo específico de un asesor humano"),
    }).catch(() => {});
  }

  // 7. Despacho sensorial ATÓMICO (Voz inteligente con Lingxin Qwen 3.1 TTS Plus)
  let audioDespachado = false;
  const esTextoDeSistema = /\[Nota de voz|no se pudo transcribir|no legible/i.test(texto);
  const SOLICITA_VOZ_REGEX =
    /(?:mand|pas|pon|quiero|quisiera|gustar[ií]a|deseo|puedes|puedo|hazme)\s+(?:un\s+|tu\s+|una\s+)?(?:audio|nota de voz|voz|escuchar(?:te)?|o[ií]r(?:te)?)|(?:habla(?:me)?|dime algo|mandame voz)/i;
  const esDudaDeBotORealidad =
    /(?:eres\s+(?:un\s+)?(?:bot|ia|inteligencia|real|humana|robot|computador)|hablo\s+con\s+(?:un\s+)?(?:bot|ia|humano)|de\s+verdad\s+eres)/i.test(texto);

  // Si hay video de muestra o curiosidad visual, la voz DEBE acompañar al video siempre
  if (estructurada.videoAccion && estructurada.videoAccion !== "ninguno") {
    estructurada.enviarVoz = true;
  }

  // REGLA CLAVE: NO CONTESTAR SIEMPRE CON AUDIO.
  // Solo se envía audio si el modelo lo solicitó activamente (enviarVoz: true),
  // o si el cliente pidió escuchar la voz explícitamente, o si duda de la realidad.
  // NUNCA si es un envío de cuentas bancarias de pago (debe ser texto para copiar).
  const debeEnviarVoz =
    !esTextoDeSistema &&
    !debeAdjuntarCuentas &&
    (estructurada.enviarVoz === true || SOLICITA_VOZ_REGEX.test(texto) || esDudaDeBotORealidad);

  if (debeEnviarVoz) {
    if (!estructurada.textoPrevio || estructurada.textoPrevio.trim().length === 0) {
      estructurada.textoPrevio = "Escucha esto corazón... 🎙️😏";
    }
    void canal.marcarGrabando?.(phone)?.catch?.(() => {});
    try {
      // SINTETIZAR CON LA VOZ OFICIAL DE MUSA (LINGXIN - QWEN 3.1 TTS PLUS con acento colombiano)
      const resVoz = await sintetizarVozOficialMusa(estructurada.respuesta);

      if (resVoz.ok && resVoz.buffer && resVoz.buffer.length > 0) {
        // Solo si el audio existe, enviamos el texto previo si aplica
        if (estructurada.textoPrevio && estructurada.textoPrevio.trim().length > 0) {
          const textoPrevioLimpio = sanitizarRespuesta(estructurada.textoPrevio, false);
          await canal.enviar(phone, { texto: textoPrevioLimpio }).catch(() => ({ ok: false }));
          if (deps.esperar) await deps.esperar(400);
        }

        // Enviar Base64 binario puro (Evolution API sendWhatsAppAudio lo requiere para WhatsApp PTT)
        const pureBase64 = resVoz.buffer.toString("base64");
        const nombreArchivo = resVoz.mime.includes("mp3") ? "musa-voz.mp3" : "musa-voz.opus";
        const resEnvio = await canal.enviar(phone, {
          texto: "",
          media: {
            tipo: "audio",
            mime: resVoz.mime,
            url: pureBase64,
            nombre: nombreArchivo,
          },
        });
        if (resEnvio && resEnvio.ok) {
          audioDespachado = true;
        } else {
          console.warn("[agente-cognitivo] Fallo al entregar audio a WhatsApp, canal status:", resEnvio?.status, resEnvio?.motivo);
        }
      }
    } catch (e) {
      console.warn("[agente-cognitivo] Fallo generando voz Musa Lingxin:", String(e).slice(0, 80));
    }
  }

  // 7.b Despacho de Video WOW desde la Bóveda Sensorial Dinámica
  let videoDespachado = false;
  if (estructurada.videoAccion && estructurada.videoAccion !== "ninguno") {
    if (deps.esperar && audioDespachado) await deps.esperar(1200);

    const mapaVideos: Record<string, string> = {
      video_base: "musa-base.mp4",
      muestra_latina: "muestra-latina.mp4",
      muestra_glamour: "muestra-glamour.mp4",
      muestra_comercial: "muestra-comercial.mp4",
    };
    const archivoVideo = mapaVideos[estructurada.videoAccion] || "musa-base.mp4";
    const urlVideo = `${urlPublica.replace(/\/+$/, "")}/videos/${archivoVideo}`;

    const resVideo = await canal.enviar(phone, {
      texto: audioDespachado ? "" : textoFinal,
      media: {
        tipo: "video",
        mime: "video/mp4",
        url: urlVideo,
        nombre: archivoVideo,
      },
    }).catch(() => null);

    if (resVideo && resVideo.ok) {
      videoDespachado = true;
      // Registrar en musa_messages para memoria episódica de videos despachados
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, 'video/mp4')",
        [phone, `[Video enviado: ${estructurada.videoAccion}]`],
      ).catch(() => ({ rows: [] }));
    }
  }

  // Si no se envió audio ni video con texto (o si falló la entrega), enviar texto garantizado.
  // Se divide en burbujas cortas y legibles con pausa natural para no abrumar con textos largos.
  if (!audioDespachado && !videoDespachado) {
    if (deps.esperar) await deps.esperar(800);
    const bloques = textoFinal
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);

    for (let i = 0; i < bloques.length; i++) {
      if (i > 0 && deps.esperar) await deps.esperar(700);
      await canal.enviar(phone, { texto: bloques[i] }).catch(() => ({ ok: false }));
    }
  } else if (estructurada.adjuntarCuentas) {
    if (deps.esperar) await deps.esperar(600);
    await canal.enviar(phone, { texto: CUENTAS_COLOMBIA_TEXTO.trim() }).catch(() => ({ ok: false }));
  } else if (estructurada.adjuntarDemo && audioDespachado) {
    if (deps.esperar) await deps.esperar(600);
    await canal.enviar(phone, { texto: `Aquí puedes explorar el aula y ver mi video de bienvenida:\n${enlaceDemoPlataforma(urlPublica).trim()}` }).catch(() => ({ ok: false }));
  }

  // 8. Persistencia
  await consultar(
    "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, $3)",
    [phone, textoFinal, audioDespachado ? "audio/ogg" : null],
  ).catch(() => ({ rows: [] }));

  await consultar(
    `insert into public.musa_funnel_events (lead_phone, evento, detalle)
     values ($1, 'turno_agente_cognitivo', $2::jsonb)`,
    [
      phone,
      JSON.stringify({
        intencion: estructurada.intencion,
        audio: audioDespachado,
        adjuntoCuentas: !!estructurada.adjuntarCuentas,
        adjuntoDemo: !!estructurada.adjuntarDemo,
      }),
    ],
  ).catch(() => ({ rows: [] }));

  return { ok: true, textoEnviado: textoFinal, audioEnviado: audioDespachado };
}
