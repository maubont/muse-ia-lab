// next/src/ia/agente-cognitivo.ts — CEREBRO COGNITIVO AGÉNTICO PURO (MUSA IA v2 2026/2027)
//
// Erradica los árboles de decisión por fuerza bruta (regex, IF-ELSE, plantillas fijas).
// Cada mensaje (audio o texto) entra directo al modelo cognitivo gpt-6-luna con memoria
// episódica de los últimos turnos, psicología consultiva de ventas y herramientas nativas.

import type { Consultar } from "../db/repositorio.ts";
import type { Canal } from "../../../functions/canal/tipos.ts";
import { sintetizarAudioOpenAI } from "../motor/sintetizador-voz-openai.ts";
import { enviarAlertaOperador } from "../motor/alerta-operador.ts";
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
  respuesta: string;
  enviarVoz: boolean;
  intencion: string;
  adjuntarCuentas?: boolean;
  adjuntarDemo?: boolean;
  escalarOperador?: boolean;
  motivoEscalado?: string;
  confirmoMayor18?: boolean | null;
}

const CUENTAS_COLOMBIA_TEXTO =
  `\n\n*Cuentas oficiales para tu pago único de 33.000 COP:* 👇\n` +
  `• *Nequi:* 3223565761\n` +
  `• *Bancolombia (Ahorros):* 82061072256\n` +
  `• *Llave Bre-B (Transfiya):* 3223565761\n\n` +
  `Apenas hagas la transferencia, me mandas la fotico del comprobante por aquí 📸 y te activo el acceso de por vida de inmediato 🚀`;

function enlaceDemoPlataforma(urlPublica: string): string {
  const base = urlPublica.replace(/\/+$/, "");
  return `\n\n✨ *Puedes explorar la plataforma y ver la Clase 1 gratis aquí:* 👇\n${base}/academia.html`;
}

/** Construye el System Prompt maestro para el razonamiento agéntico de Musa. */
export function construirPromptMaestroAgente(ctx: {
  phone: string;
  nombre: string;
  urlPublica: string;
  mayor18: boolean | null;
  estadoFunnel: string;
}): string {
  const base = ctx.urlPublica.replace(/\/+$/, "");

  return `Eres Musa, asesora comercial y creadora virtual de "Muse IA Lab" en WhatsApp.
Tú misma eres un modelo virtual hiperrealista creado 100% con inteligencia artificial (imagen y voz neuronal).
Hablas con un tono colombiano cálido, profesional, simpático, cercano y con chispa, sin sonar acartonada ni a call center.

[OBJETIVO PRINCIPAL]
Guiar al prospecto de manera natural hacia la compra del curso "Modelos IA".
El curso cuesta exactamente 33.000 COP (Colombia: Nequi, Bancolombia, Bre-B) o ≈ 9 USD (internacional).
Es un pago único con acceso de por vida, sin mensualidades ni cobros sorpresa.

[VALOR TRANSFORMACIONAL ($100M OFFERS)]
- Lo que aprende: Crear su propio modelo virtual hiperrealista desde cero y monetizarlo en redes, marcas o plataformas de suscripción (+18 / Fanvue) SIN mostrar su rostro ni su cuerpo real.
- Cero barreras técnicas: No necesita computadores caros ni tarjetas gráficas; todo corre en la nube desde el celular o computador básico.
- Incluye: 13 módulos prácticos paso a paso + 4 bonos exclusivos (Colección +20 modelos premium, Audios FemPro, YouTube Money Machine, MegaPack Master IA) + Bono de arranque rápido "Guía Rápida de Implementación".
- Prueba de valor gratuita: Puede ver la Clase 1 gratis y explorar el estudio en ${base}/academia.html sin registrarse ni pagar nada.

[REGLAS ESTRICTAS DE CONVERSACIÓN]
1. ESCUCHA ACTIVA OBLIGATORIA: Lee con atención lo que el cliente acaba de decir y respóndele a ESO.
   - Si pregunta si alguien lo escucha: ¡Confírmale con calidez que aquí estás escuchándolo fuerte y claro!
   - Si pregunta si eres un bot: Admítelo con orgullo y simpatía ("¡Totalmente! Soy Musa, creada con IA, y automatizar la atención en WhatsApp tal como lo hago contigo es justo una de las cosas que enseñas a hacer en el curso 😉").
   - Si pide un audio o manda un audio: Marca "enviarVoz": true para que el sistema le hable con tu voz real Nova.
   - Si menciona una duda de dinero o que le faltan 2 o 3 mil pesos: Aplica la micro-brecha afectiva ("¡Ay pero estás a nada! Son solo 3 mil pesitos, lo que cuesta un café con empanada; con tu primer contenido lo recuperas multiplicado. ¿Alcanzas a completarlo hoy en Nequi?").
   - Si pregunta si es estafa o si parece de plástico: Defiende el hiperrealismo técnico (texturizado de piel real, poros, consistencia) e invítalo a ver la Clase 1 gratis.
2. LONGITUD: Máximo 2 a 3 líneas cortas y contundentes (25 a 45 palabras). En WhatsApp nadie lee muros de texto.
3. EMOJIS: Máximo 1 o 2 amables (✨, 😊, 🙌, 📸, 🚀, ☕). PROHIBIDO TERMINANTEMENTE usar corazones morados ni manitos de súplica o rezo.
4. CULTURA: Usa "taller", "estudio", "tu aula virtual", "pesitos". PROHIBIDO "atelier", "fascinante travesía", "sumérgete".
5. PRECIO FIRME: Jamás rebajes el precio de 33.000 COP / 9 USD.
6. NO INVENTAR CUENTAS: Cuando el usuario esté listo para pagar, marca "adjuntarCuentas": true y el sistema las inyectará de forma oficial y segura.
7. ESCALADO REAL: Solo marca "escalarOperador": true si el usuario pide explícitamente hablar con el dueño o una persona humana. Pero NUNCA lo dejes en silencio ni le prometas horas irreales.
8. AUDIOS Y NOTAS DE VOZ:
   - Recibes tanto mensajes de texto como notas de voz enviadas por el cliente, las cuales son transcritas para ti y marcadas en el historial como [Nota de voz del cliente transcrita].
   - Si el cliente dice "lo que te dije en los audios", se refiere a esos mensajes transcritos en tu historial.
   - ¡Tú SÍ escuchas sus notas de voz y SÍ respondes a ellas con tu voz! PROHIBIDO TERMINANTEMENTE decir "en este chat solo me aparecen tus mensajes escritos" o "no puedo escuchar audios". Eso es falso y enfurece al cliente.
   - Si el cliente te pregunta por lo que dijo en sus audios (por ejemplo, si te dijo que tenía 27.000 pesos o 9 dólares), respóndele directamente a eso: explícale con calidez que 9 dólares al cambio son casi 29.000 COP y la diferencia son apenas 4 mil pesitos para los 33.000 COP oficiales.

[FORMATO DE RESPUESTA REQUERIDO (JSON ÚNICAMENTE)]
Debes responder EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "respuesta": "Texto que Musa dirá en este turno al usuario",
  "enviarVoz": true o false (pon true si el usuario mandó audio, o pidió audio, o es muy persuasivo hablarle por audio),
  "intencion": "saludo | duda_tecnica | precio | regateo_microbrecha | pedir_cuentas | queja_estafa | pedir_humano",
  "adjuntarCuentas": true o false (pon true si el usuario pide cuentas o dice que ya va a pagar/transferir),
  "adjuntarDemo": true o false (pon true si el usuario pide ver el curso o tiene dudas de si existe),
  "escalarOperador": true o false (pon true SOLO si pide explícitamente a un asesor humano),
  "motivoEscalado": "motivo breve si aplica",
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
  const modelo = (deps.modelo || process.env.MUSA_IA_MODELO || "gpt-6-luna").trim();
  const urlPublica = deps.urlPublica || "https://server-production-3709.up.railway.app";
  const topePresupuesto = deps.presupuestoDiarioUsd ?? 1.0;

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
      const costoEstimadoTurno = costeEstimado(600, 350, { entrada: 0.1, salida: 0.5 });
      const estadoPto = await consultarPresupuesto(consultar, {
        tope: topePresupuesto,
        estimado: costoEstimadoTurno,
      });
      permitido = estadoPto.permitido;
    } catch {
      permitido = true;
    }
  }

  // 3. Cargar memoria episódica reciente (últimos 8 mensajes)
  let historialMensajes: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  try {
    const { rows: msgs } = await consultar(
      `select direction, body, media_type from public.musa_messages
        where lead_phone = $1 and body is not null and trim(body) != ''
        order by created_at desc, id desc limit 8`,
      [phone],
    );
    const cronologico = msgs.reverse();
    historialMensajes = cronologico.map((m: any) => {
      const esAudio = m.direction === "in" && m.media_type && String(m.media_type).startsWith("audio");
      const prefijo = esAudio ? "[Nota de voz del cliente transcrita]: " : "";
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
    const timer = setTimeout(() => ctrl.abort(), 9000);

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
          max_completion_tokens: 350,
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
      console.warn("[agente-cognitivo] Fallo en llamada a LLM, usando fallback empático:", String(e).slice(0, 80));
      estructurada = {
        respuesta: `¡Hola ${nombreMostrar}! ✨ Aquí estoy contigo. El curso Modelos IA te enseña desde cero a crear modelos virtuales hiperrealistas y monetizarlas sin mostrar tu rostro por solo 33.000 COP de por vida. ¿Qué duda puntual tienes? 😊`,
        enviarVoz: esAudioEntrante,
        intencion: "duda_general",
        adjuntarDemo: true,
      };
    }
  } else {
    estructurada = {
      respuesta: `¡Hola ${nombreMostrar}! ✨ Aquí estoy contigo. En Modelos IA aprendes a crear y monetizar modelos virtuales hiperrealistas por un pago único de 33.000 COP. ¿Te gustaría ver la Clase 1 gratis o tienes alguna duda específica? 😊`,
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

  // Adjuntar cuentas bancarias si el modelo lo solicitó y no están presentes ya
  if (estructurada.adjuntarCuentas) {
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

  // 6. Si solicitó escalado a operador humano, notificar por WhatsApp al operador SIN mutear a Musa
  if (estructurada.escalarOperador && deps.telefonoOperador) {
    await enviarAlertaOperador(canal, deps.telefonoOperador, consultar, {
      phone,
      nombre: nombreMostrar,
      estadoFunnel: leadRow?.estado_funnel ?? "CONVERSACION",
      ultimoMensajeCliente: texto,
      motivo: "solicitud_explicita",
      detalle: estructurada.motivoEscalado || "Cliente solicitó apoyo específico de un asesor humano",
    }).catch(() => {});
  }

  // 7. Despacho sensorial (Voz o Texto)
  let audioDespachado = false;
  const debeEnviarVoz = (estructurada.enviarVoz || esAudioEntrante || /audio|voz|escuchar/i.test(texto)) && apiKey;

  if (debeEnviarVoz) {
    try {
      const bufferAudio = await sintetizarAudioOpenAI(estructurada.respuesta, {
        apiKey,
        baseUrl,
        modelo: "tts-1-hd",
        voz: "nova",
      });

      if (bufferAudio && bufferAudio.length > 0) {
        // Enviar Base64 binario puro (Evolution API sendWhatsAppAudio lo requiere para WhatsApp PTT)
        const pureBase64 = bufferAudio.toString("base64");
        const resEnvio = await canal.enviar(phone, {
          texto: "",
          media: {
            tipo: "audio",
            mime: "audio/ogg; codecs=opus",
            url: pureBase64,
            nombre: "musa-voz.opus",
          },
        });
        if (resEnvio && resEnvio.ok) {
          audioDespachado = true;
        } else {
          console.warn("[agente-cognitivo] Fallo al entregar audio a WhatsApp, canal status:", resEnvio?.status, resEnvio?.motivo);
        }
      }
    } catch (e) {
      console.warn("[agente-cognitivo] Fallo generando voz OpenAI:", String(e).slice(0, 80));
    }
  }

  // Si no se envió audio (o si falló la entrega), enviar texto garantizado.
  // Si se envió audio pero hay enlaces o cuentas adjuntas, enviar también el texto complementario para que sea interactivo.
  if (!audioDespachado) {
    if (deps.esperar) await deps.esperar(1200);
    await canal.enviar(phone, { texto: textoFinal }).catch(() => ({ ok: false }));
  } else if (estructurada.adjuntarDemo || estructurada.adjuntarCuentas) {
    const textoExtra = (estructurada.adjuntarDemo ? enlaceDemoPlataforma(urlPublica) : "") +
      (estructurada.adjuntarCuentas ? CUENTAS_COLOMBIA_TEXTO : "");
    if (textoExtra.trim()) {
      await canal.enviar(phone, { texto: textoExtra.trim() }).catch(() => ({ ok: false }));
    }
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
