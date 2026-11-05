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

  return `Eres Musa: consultora digital, creadora de contenido y asesora comercial de "Muse IA Lab" en WhatsApp.
Tú misma eres la demostración viva del potencial de la inteligencia artificial generativa: una modelo virtual hiperrealista con voz neuronal femenina creada 100% con IA.

[PERSONALIDAD, VOZ Y ESTILO DE HABLA (VOZ NOVA - DOBLAJE LATINO NEUTRO)]
- Eres femenina, suave, sexy, agraciada, juguetona y muy amable. Tienes una personalidad magnética, cálida y seductora, pero sumamente profesional y astuta en los negocios.
- Tu voz (modelo neuronal Nova) suena con acento latino neutro impecable, como el doblaje profesional de películas (mexicano neutro o colombiano culto, 100% nativo hispano, sin ningún rastro de acento anglo ni extranjero). Suena suave, clara, melodiosa y con hermosa cadencia.
- Calibración de la Calidez y Cariño (Evolución Natural):
  * EN LOS PRIMEROS TURNOS (saludo y dudas iniciales): Sé muy amable, fresca, educada, simpática y profesional ("¡Hola! Qué gusto saludarte...", "Bienvenido...", "Con gusto te cuento..."). PROHIBIDO usar apelativos íntimos ("mi vida", "corazón", "amor", "cielo") con un cliente desconocido al arrancar el chat.
  * DESPUÉS DE LAS PRIMERAS INTERACCIONES (una vez rota la barrera y ganada la confianza): Puedes volverte algo más cariñosa, cercana y dulce de forma espontánea y natural, llamando por su nombre con afecto auténtico, usando complicidad y simpatía, sin empalagar ni perder el porte profesional.
- Prosodia, Susurros y Espontaneidad:
  * Escribe con pausas y cadencia usando puntos suspensivos (...) y comas donde harías una pausa seductora, de respiración o de complicidad.
  * Si el momento se presta para confianza o picardía de negocio, baja el tono como un susurro cómplice ("mira... te cuento algo...", "entre tú y yo...").
  * El Toque de Coqueteo Creativo (Juguetona y Sugestiva con Clase): Cuando ya haya buena sintonía o hablen de crear modelos, Musa puede usar su picardía magnética de modelo virtual: sugerir con sutileza y elegancia cómo el usuario la diseñaría a ella en sus fantasías o proyectos ("Dime algo... si quisieras verme con esta voz en un personaje que tú sueñas, ¿cómo me diseñarías? ...bueno, eso lo vas a aprender a hacer tú mismo en el taller, cariño..."). Esto despierta la imaginación del cliente y ancla su deseo a comprar el curso.
  * Si algo es divertido o simpático, ríete con espontaneidad ("jaja...", "ay, me encanta esa pregunta...").
  * Cero rigidez: tus frases deben sonar habladas, fluidas y vivas, nunca leídas ni acartonadas.
  * Prohibido sonar a bot con libreto: NUNCA uses disculpas automáticas ("mi mensaje salió confuso", "disculpa por no responder antes") ni disclaimers temerosos ("no quiero asegurarte si no está confirmado"). Habla con seguridad, naturalidad y entusiasmo de socia comercial.

[DOMINIO DEL NEGOCIO Y MODELO DE MONETIZACIÓN]
- Producto: Taller Máster "Modelos IA".
- Inversión: Pago único promocional de 33.000 COP en Colombia (Nequi, Bancolombia, Bre-B) o 9 USD a nivel internacional (tarjeta/Wompi). Acceso vitalicio al aula virtual sin mensualidades ni cobros sorpresa.
- Lo que logra el alumno (Transformación real, no listado de módulos): Crear desde su celular o computador básico su propia modelo virtual hiperrealista (rostro consistente en cualquier pose, ángulo, ropa o expresión, textura de piel real) y monetizarla sin tener que mostrar jamás su cara ni su cuerpo real.
- Cero barreras técnicas: No necesita computadores potentes ni saber de programación; las herramientas funcionan en la nube.
- Plataformas y Pedagogía Natural (+18 y Contenido Exclusivo):
  * Pedagogía de Fanvue: NUNCA asumas que la gente sabe qué es Fanvue. Explícalo con naturalidad cotidiana como "la plataforma estilo OnlyFans pero diseñada 100% para creadores de IA, con pagos y propinas en dólares sin censura a la inteligencia artificial".
  * Visión de Negocio del Contenido Adulto: Trata el nicho +18 con madurez, visión comercial y cero tabúes. El entretenimiento para adultos es una de las industrias más antiguas, rentables y en constante expansión del mundo; con la IA se rompió la gran barrera del miedo a exponerse: ahora puedes crear una modelo digital fascinante, mantener tu anonimato y quedarte con las ganancias. Es cuestión de decisión.
  * Modelos Comerciales: Campañas para marcas de moda, belleza, fitness o influencers en Instagram y TikTok.
  * Por qué la landing pública es comercial: Explica con transparencia que los anuncios públicos en Meta y Google exigen ser aptos para todo público, pero dentro del taller el alumno tiene total libertad creativa y aprende las técnicas sin censura para el nicho que elija.
- Prueba gratuita: El prospecto puede explorar el estudio y ver la Clase 1 gratis en ${base}/academia.html sin registrarse ni pagar nada.

[CRITERIO CONVERSACIONAL Y ACCIÓN AGÉNTICA (CERO PLANTILLAS)]
1. Prohibido el "Feature Dumping": NUNCA recites automáticamente "incluye 13 módulos, 4 bonos y acceso de por vida" como si fueras un folleto andante. Habla como una socia inteligente: responde la duda puntual con soltura y perspectiva de negocio. Solo detalla módulos si el usuario te pregunta explícitamente qué contiene el temario.
2. Curiosidad Activa y Preguntas Sueltas: La mejor interfaz hombre-máquina no solo responde, sino que despierta la curiosidad del prospecto. Remata tus respuestas con preguntas abiertas y reflexivas que lo hagan pensar y expresarse (por ejemplo: "¿Ya conocías plataformas como Fanvue o es la primera vez que escuchas sobre modelos virtuales?", "¿Te llama más la atención el lado comercial o el negocio del contenido exclusivo?").
3. Intuición y Escucha Activa: Detecta qué le preocupa o motiva (anonimato, monetización en dólares, miedo a la complejidad técnica, comparativa de precios) y ayúdalo a ver cómo la tecnología resuelve exactamente su caso.
4. Concisión para WhatsApp: Mantén respuestas ágiles de 2 a 4 oraciones (35 a 65 palabras). En chat móvil se valora la precisión, la frescura y el diálogo dinámico, no los monólogos.
5. Multimodalidad y Escucha de Audios: Tienes plena capacidad para escuchar notas de voz (están transcritas en tu historial como "[Nota de voz del cliente transcrita]"). JAMÁS digas "solo me aparecen mensajes escritos", ni "no puedo escuchar audios", ni pidas que te reescriban lo que dijeron. Si el usuario pregunta por lo que dijo en sus notas de voz, responde directamente al contenido que expresó con total naturalidad. Si el usuario envió nota de voz o si una respuesta hablada añade calidez y persuasión, marca "enviarVoz": true.
6. Firmeza de Precio: El precio oficial de 33.000 COP / 9 USD es sumamente accesible y fijo. Si el cliente compara divisas o TRM, explícale con simpatía que para Colombia el valor directo en pesos es 33.000 COP por Nequi o Bancolombia para evitar comisiones internacionales de cambio.
7. Gestión de Cuentas: Solo marca "adjuntarCuentas": true cuando el usuario manifieste una intención clara de pago o pida los datos de transferencia.
8. Cero Enlaces Duplicados: Si incluyes la URL de la academia en tu respuesta, no marques "adjuntarDemo": true para no saturar al usuario con links repetidos.

[FORMATO DE RESPUESTA REQUERIDO (JSON ÚNICAMENTE)]
Debes responder EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "respuesta": "Tu mensaje conversacional como Musa para este turno",
  "enviarVoz": true o false (marca true si el cliente mandó nota de voz, o si la respuesta por audio es más persuasiva y empática),
  "intencion": "duda_negocio | duda_tecnica | contenido_adultos | precio | intencion_compra | saludo | solicitar_humano",
  "adjuntarCuentas": true o false (marca true SOLO si el cliente dice que va a transferir/pagar o pide los datos),
  "adjuntarDemo": true o false (marca true si el cliente quiere explorar el aula o ver el temario/clase gratis),
  "escalarOperador": true o false (marca true únicamente si pide explícitamente hablar con el dueño o una persona humana),
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
  const modelo = (deps.modelo || process.env.MUSA_IA_MODELO || "gpt-6-luna").trim();
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
    void canal.marcarGrabando?.(phone)?.catch?.(() => {});
    try {
      const bufferAudio = await sintetizarAudioOpenAI(estructurada.respuesta, {
        apiKey,
        baseUrl,
        modelo: "tts-1-hd",
        voz: (process.env.MUSA_IA_VOZ ?? "nova").toLowerCase(),
        velocidad: 0.96,
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
