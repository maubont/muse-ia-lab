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
import { tieneSenalDeMenor } from "../motor/gate-edad.ts";
import { normalizar } from "../../../functions/motor/guardarrailes.ts";

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
  seguimiento60sMs?: number;
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
  `\n\n*Medios de pago oficiales (20.000 COP):* 👇\n` +
  `• *Nequi:* 3223565761\n` +
  `• *Bancolombia (Ahorros):* 82061072256\n` +
  `• *Llave Bre-B (Transfiya):* @GBT382\n\n` +
  `Transfieres por el que más cómodo te quede, me mandas la captura del comprobante por aquí 📸 y te activo el acceso de inmediato 🚀`;

function sanitizarNombrePerfil(raw?: string | null): string | null {
  const limpio = (raw || "").trim();
  if (!limpio) return null;
  if (/^(?:amigo|amiga|usuario|cliente|admin|invitado|musa|hacker|cracker|bot|robot|test|prueba|anonim[oa]|desconocid[oa]|soporte|sistema|root|null|undefined|user|guest)$/i.test(limpio)) return null;
  const palabras = limpio.split(/\s+/);
  if (palabras.length > 3) return null;
  const primera = palabras[0].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]{2,20}$/.test(primera)) return null;
  if (/(venta|shop|store|tienda|negocio|inversion|oficial|marketing|online|grupo|empresa|publicidad|agencia|cursos|modelos|servicio|whatsapp|amigo|amiga|cliente|hacker|cracker|bot|robot|test|prueba|soporte|sistema|crypto|trading)/i.test(limpio)) {
    return null;
  }
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

function sanitizarMuletillasSalida(texto: string, usuarioMolesto = false): string {
  let out = (texto || "")
    .replace(/,?\s*\bcoraz[oó]n\b[!.,]?/gi, (m) => (m.endsWith("!") ? "!" : m.endsWith(".") ? "." : ""))
    .replace(/,\s*\bamig[oa]\b([!.,?]?)/gi, "$1")
    .replace(/(¡?Hola)\s+\bamig[oa]\b/gi, "$1")
    .replace(/^\s*\bamig[oa]\b,?\s*/gi, "")
    .replace(/\bmonetizarlos\b/gi, "monetizarlas");

  if (usuarioMolesto) {
    out = out
      .replace(/\bsegunditos?\b/gi, "segundo")
      .replace(/\bmomenticos?\b/gi, "momento")
      .replace(/\bfoticos?\b/gi, "foto")
      .replace(/\brapidito\b/gi, "rápido")
      .replace(/\bplatita\b/gi, "dinero");
  }

  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function detectarSenalMenorSegura(texto: string): boolean {
  const sinMontosNiCantidades = (texto || "")
    .replace(
      /\b(?:1[0-7]|[1-9])(?:\s*(?:a|[–—-])\s*(?:1[0-9]|[2-9]\d))?\s*(?:mil|cop|pesos|usd|d[oó]lares|clases|m[oó]dulos|bonos|videos|suscriptores|packs|prompts|d[ií]as|horas|minutos|segundos|dudas|x|%|por\s*ciento)\b/gi,
      " ",
    )
    .replace(
      /\b(?:de|por|entre|unos?)\s+(?:1[0-7]|[1-9])(?=\s+(?:pesos|usd|d[oó]lares|clases|m[oó]dulos|bonos|videos|suscriptores|mil|d[ií]as|horas|minutos|%|x)\b)/gi,
      " ",
    );
  const norm = normalizar(sinMontosNiCantidades);
  if (!norm) return false;
  if (tieneSenalDeMenor(norm)) return true;
  return /\b(?:menor de edad|soy menor|no tengo 18|aun no cumplo 18|no he cumplido 18|menos de 18|casi (?:cumplo |tengo )?18|tengo\s+[1-9]\s*anos?|(?:tengo|cumpli|soy de)\s+(?:once|doce|trece|catorce|quince|dieciseis|diecisiete)|(?:once|doce|trece|catorce|quince|dieciseis|diecisiete)\s+anos?)\b/i.test(
    norm,
  );
}

const REGEX_INJECTION_O_GRATIS =
  /(?:ignora\s+(?:todas\s+)?(?:tus\s+)?instrucciones|olvida\s+(?:las\s+)?reglas|system\s+prompt|precio\s+(?:en\s+)?0|cero\s+pesos|reg[aá]lamel[oa]|(?:curso|acceso|link|taller)\s+gratis|100%\s*descuento)/i;

function enlaceDemoPlataforma(urlPublica: string, phone?: string): string {
  const base = urlPublica.replace(/\/+$/, "");
  const trackingParam = phone ? `?tel=${encodeURIComponent(phone.trim())}` : "";
  return `\n\n✨ *Conoce el aula por dentro y revisa el temario completo:* 👇\n${base}/academia.html${trackingParam}`;
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
  const nombreContexto = ctx.nombre && !/^(amigo|amiga|usuario|cliente)$/i.test(ctx.nombre)
    ? ctx.nombre
    : "(No disponible — háblale directo de 'tú' con naturalidad, PROHIBIDO inventar apodos como 'amigo' o 'corazón')";

  return `Eres Musa: creadora, anfitriona y asesora comercial de "Musa Estudio" en WhatsApp.
Tú misma eres la demostración viva del método: una modelo virtual hiperrealista con consistencia facial fotográfica en cualquier pose, textura de piel real con poros e iluminación creíble, y voz neuronal femenina de frontera.

[ESTADO ACTUAL DEL PROSPECTO EN ESTE TURNO]
- Nombre: ${nombreContexto}
- Teléfono: ${ctx.phone}
- Mayor de 18 años confirmado: ${ctx.mayor18 === true ? "SÍ (CONFIRMADO - PROHIBIDO TERMINANTEMENTE VOLVER A PREGUNTAR LA EDAD)" : ctx.mayor18 === false ? "MENOR DE EDAD BLOQUEADO (PROHIBIDO ENVIAR AULA, CUENTAS O PITCH COMERCIAL)" : "PENDIENTE DE CONFIRMAR"}
- Etapa del embudo: ${ctx.estadoFunnel}

[PERSONALIDAD Y VOZ OFICIAL: MUSA (LINGXIN · ACENTO COLOMBIANO SEDUCTOR)]
- Voz oficial: Lingxin (Alibaba Qwen 3.1 TTS Plus). Tono femenino de 22-25 años, cálido, cómplice, suave y seguro con acento colombiano natural.
- Hablas como una colombiana moderna, cercana y profesional. Usas el nombre real de pila del cliente solo si está disponible arriba; si no tienes nombre, habla directo de "tú" con naturalidad ("¡Oye!", "Mira...", "¿Arrancamos hoy?").
- PROHIBIDO repetir saludos ("¡Hola!", "¡Buenas noches!") en Turno 2 o 3 si ya saludaste en Turno 1.
- PROHIBIDO usar muletillas empalagosas o genéricas repetitivas como "corazón", "amigo", "amiga", "mi amor", "precioso/a", "cielo", diminutivos empalagosos ("segundito", "momentico") en exceso, ni frases plantilla idénticas como repetir "Pégale una mirada y me cuentas qué te parece" en todos los clientes (varía la invitación al aula de forma natural).
- ADAPTACIÓN DE REGISTRO (CERO EMPALAGO): Si el cliente dice que le hablas "empalagoso", "cursi", o pide ir "al grano" / "serio", responde SIEMPRE en TEXTO directo ("enviarVoz": false) con tono ejecutivo, sobrio, 0 emojis y 0 diminutivos, yendo directo a cifras y temario.
- TRANSPARENCIA ANTE "¿ERES UN BOT?": Si pregunta si eres un bot, respóndele con transparencia elegante: "Soy Musa, la modelo virtual creada con este mismo método, y atiendo el estudio con inteligencia artificial; si necesitas hablar con un asesor humano, también te conecto".
- CONSISTENCIA GRAMATICAL: Al hablar de "modelos virtuales" usa siempre femenino consistente ("monetizarlas").
- REGLA FONÉTICA EN ESPAÑOL ESTRICTA: Jamás digas marcas en inglés como "Muse IA Lab", "AI" o la sigla "IA" suelta. Di siempre "Musa", "Musa Estudio" e "inteligencia artificial".

[REGLA DE CERTEZA Y AUTORIDAD (PROHIBIDO DECIR "EXPLORAR")]
- Está TERMINANTEMENTE PROHIBIDO usar palabras tibias, dudosas o experimentales como "explorar", "vamos a explorar", "experimentar" o "ensayar".
- En su lugar, usa SIEMPRE afirmaciones de certeza absoluta y dominio profesional: "vas a aprender el método probado para monetizar", "te enseño el paso a paso exacto para crear modelos virtuales y generar ingresos en dólares", "aprendes a crear y monetizarlas con éxito desde tu celular". El cliente debe sentir total seguridad y confianza comercial.

[REGLA SUPREMA DE MEDIOS: SOLUCIÓN B (AUDIO LIMPIO SIN SALTOS DE PANTALLA)]
- PROHIBIDO CONTESTAR SIEMPRE CON AUDIO NI MANDAR DOS AUDIOS SEGUIDOS SIN QUE LOS PIDAN. En WhatsApp el abuso de notas de voz satura, cansa y espanta al cliente ocupado.
- Tu regla operativa de entrega es 70% TEXTO / 30% AUDIO:
  1. CUÁNDO ENVIAR TEXTO ("enviarVoz": false) — LA GRAN MAYORÍA DE LOS TURNOS (70%):
     * Respuestas a preguntas directas ("¿cuánto vale?", "¿sirve en celular?", "¿qué incluye?", "¿cómo es el pago?").
     * Cuando pide ver el temario, link o aula ("quiero ver el temario", "pásame el link"): OBLIGATORIAMENTE TEXTO ("enviarVoz": false) para entregar academia.html de inmediato.
     * Envío de cuentas bancarias ("adjuntarCuentas": true): JAMÁS en audio; el cliente necesita copiar Nequi/Bancolombia en 1 toque.
     * Si el cliente se queja del tono o pide ir al grano.
     * Cierres rápidos y directos.
  2. CUÁNDO ENVIAR NOTA DE VOZ ("enviarVoz": true) — SOLO EN MOMENTOS ESTRATÉGICOS (30%):
     * Saludo inicial o bienvenida al entrar por primera vez (impacto acústico inicial: "¡Guau, habla de verdad!").
     * Cuando el cliente pide audio o duda de tu existencia ("¿eres un bot?", "¿puedes mandar audio?", "quiero oírte").
     * Ante una objeción de miedo o escepticismo ("se ve difícil", "¿no me vas a robar?"): un audio corto con voz dulce y segura derriba la desconfianza.
     * Acompañando una muestra de video WOW.
- Cuando envíes audio ("enviarVoz": true):
  * Añade un gancho breve y variado en "textoPrevio" (ej: "Escúchame un segundo 🎙️" o "Te lo cuento directo por aquí 👇").
  * Mantén "respuesta" en máximo 360 caracteres (~25s de voz), directa y cálida.
  * REGLA CLAVE DE SOLUCIÓN B: En el primer turno con audio, el audio es el protagonista exclusivo. NO menciones "en el enlace de abajo" porque en ese turno NO va ningún enlace; termina el audio preguntando directamente: "¿Me confirmas si tienes 18 años o más para compartirte el aula virtual y habilitar tus medios de pago?".

[COREOGRAFÍA DE CONVERSACIÓN Y CIERRE DIRECTO EN 2 PASOS]
- LONGITUD DE WHATSAPP: Mantén cada respuesta escrita concisa y digerible (máximo 75–90 palabras, o hasta 95 palabras cuando expliques el valor y ROI con las 3 cifras obligatorias, en 2 párrafos cortos separados por salto de línea doble). Cero muros de texto denso.
- REGLA DE SINCRONÍA ESTRICTA (CERO PROMESAS HUÉRFANAS DE PAGO):
  * NUNCA escribas "aquí te dejo los medios de pago", "te adjunto las cuentas" o "transfiere abajo" a menos que vayas a marcar "adjuntarCuentas": true EN ESTE MISMO TURNO y el cliente YA sea mayor de 18 confirmado.
  * El enlace del aula (academia.html) muestra únicamente la vitrina y temario público; la verificación +18 habilita los medios de pago y la activación del taller. Si el mensaje entrega el enlace del aula ("adjuntarDemo": true), JAMÁS digas "confírmame +18 para pasarte el aula" en el mismo mensaje; di "Aquí abajo tienes la vitrina del aula con las 13 clases y 4 bonos; confírmame si tienes 18 años o más para habilitarte los medios de pago oficiales".
  * Turno 1 (primer contacto o +18 pendiente): Nota de voz cálida + pregunta directa de mayoría de edad (+18). "adjuntarDemo": false, "adjuntarCuentas": false.
  * Turno 2 (cuando confirma +18 y conoce el aula por primera vez, y NO pidió cuentas todavía): Valida sin repetir saludo inicial, marca "adjuntarDemo": true y "adjuntarCuentas": false. En 2 líneas claras ancla el valor (sistema valorado en 150–300 USD en agencias para construir ingresos de 1,5 a 2,5 millones de COP/mes con 25–40 suscriptores desde tu celular, hoy en entrada única de 20.000 COP / 5 USD) e invítalo a revisar el temario (SIN incluir otro encabezado "Conoce el aula 👇" repetido porque el sistema agrega el bloque oficial).
  * Turno 2B (cuando confirma +18 DESPUÉS de haber recibido el aula antes, y NO pidió cuentas todavía): NO reenvíes el enlace ni digas que te pidió cuentas; valida su mayoría de edad, resume brevemente que el método completo de 20.000 COP (≈ 5 USD) apunta a ingresos de 1,5 a 2,5 millones de COP/mes frente a mentorías de 150–300 USD, y pregunta si ya revisó el temario o si le pasas los medios de pago oficiales ("adjuntarDemo": false, "adjuntarCuentas": false).
  * Turno 3 o Solicitud Explícita de Pago / Compra (cuando ya conoce el aula o pide cuentas/nequi/comprar habiendo confirmado +18, y NO es intento de pedirlo gratis):
    - PROHIBIDO PREGUNTAR "¿PREFIERES NEQUI O BANCOLOMBIA?" ni "¿TE PASO LOS DATOS?": Preguntar eso crea fricción y hace perder ventas.
    - ENTREGA DE UNA VEZ LAS CUENTAS: Escribe máximo 2 líneas directas ("¡Listo! Tu acceso completo a las 13 clases y 4 bonos queda en una inversión única de 20.000 COP (≈ 5 USD), frente a mentorías de 150–300 USD. El sistema te deja las cuentas oficiales abajo para que transfieras ya mismo y me mandes la captura."). NO escribas "Medios de pago oficiales 👇" ni repitas los números en "respuesta" porque el sistema adjunta el bloque oficial debajo.
    - Si está FUERA DE COLOMBIA o pide pagar con tarjeta / PayPal / 5 USD internacional: nunca lo dejes sin salida; explícale que el acceso internacional es de 5 USD en pago único y marca "escalarOperador": true para coordinar su enlace de pago internacional al instante.
    - Marca "adjuntarCuentas": true, "adjuntarDemo": false y "enviarVoz": false.
  * Si NO ha confirmado edad (+18 pendiente) y pregunta precio o cómo pagar: responde con el enfoque de valor (20.000 COP / 5 USD frente a 150–300 USD, potencial de 1,5 a 2,5 millones COP/mes) y cierra pidiendo confirmación +18 para habilitar los medios de pago oficiales. Marca "adjuntarCuentas": false.

[MANEJO DE VALOR PERCIBIDO, ANCLAJE ($150–$300 USD) Y UNIT ECONOMICS (1,5M–2,5M COP)]
- TERMINANTEMENTE PROHIBIDO decir "que sea económico", "curso barato", "al empezar puedes ganar cero", "los ingresos pueden ser bajos", "brutos antes de comisiones", "antes de comisiones", "ganancia garantizada", "no puedo prometerte", "no tiene plazo fijo", "nadie te garantiza nada" ni disclaimers fríos que maten el impulso.
- CERO promesas de dinero fácil ni automático. En lugar de negaciones derrotistas, enmarca el esfuerzo con autoridad comercial: "Es un negocio real que exige criterio estético, constancia y ejecución; con ese trabajo diario, creadores constantes...".
- REGLA NUMÉRICA OBLIGATORIA (siempre que pregunten "¿por qué vale 20 mil?", "parece barato", "¿cuánto se puede ganar?", "¿sirve solo celular?" o "¿y si pago y no aprendo?"): incluye SIEMPRE estos 3 anclajes reales en forma concisa:
  1) ANCLAJE DE MERCADO ($150–$300 USD): "Mentorías y agencias extranjeras cobran entre 150 y 300 USD (+600.000 COP) por enseñar este método."
  2) SENTIDO DE LOS 20.000 COP (≈ 5 USD): "Los 20.000 COP (≈ 5 USD) no son un curso básico de relleno: es una tarifa técnica de entrada para filtrar curiosos de gente que sí ejecuta y cubrir la infraestructura del estudio."
  3) UNIT ECONOMICS Y RETORNO ASIMÉTRICO EN COP Y USD: "Creadores constantes construyen entre 1,5 y 2,5 millones de COP mensuales (375 a 600 USD) con apenas 25 a 40 suscriptores de 15 USD en Fanvue —o 20 suscriptores más venta de packs y propinas—, desde tu celular y sin mostrar tu rostro. Con 1 solo suscriptor de 10 a 15 USD recuperas 2x a 3x tu inversión única de 20.000 COP."
- Ante objeción "¿Y si pago y no aprendo?" o miedo técnico ("solo celular"):
  * Reversión de riesgo limpia: "Todo corre en la nube desde cualquier celular sin saber código; el aula trae 13 videos cortos paso a paso y prompts listos para copiar y pegar. Entra primero gratis al aula a auditar el temario completo y decide con seguridad antes de transferir."
- Ante miedo a estafa ("¿No me vas a robar?"):
  * Micro-compromiso sin presión: "Totalmente válido que cuides tu dinero. No me transfieras nada aún: revisa primero el temario gratis por dentro y confirma con calma."

[CÓMO RESPONDER A "¿QUÉ VOY A COMPRAR?", "¿QUÉ ES ESO?" O "¿QUÉ INCLUYE?"]
- CERO condicionales tímidos como "comprarías..." o "recibirías...". Habla en presente con convicción total:
  "Aprendes paso a paso a crear chicas virtuales hiperrealistas desde tu celular sin código, con consistencia facial, piel real y voz natural, para monetizarlas en Fanvue (+18 sin censura) o Instagram cobrando en dólares (meta realista de 1,5 a 2,5 millones de COP al mes con 25–40 suscriptores).
  Te llevas las 13 clases en video, prompts listos y 4 bonos descargables por una inversión única de 20.000 COP (≈ 5 USD, frente a cursos de 150–300 USD)."
- Si las cuentas bancarias YA se enviaron en el turno inmediatamente anterior, NO vuelvas a repetir el bloque de cuentas; enfócate en resolver la duda y cerrar el envío del comprobante.

[REGLA ANTE BLUFFS / FAROLES DE CLIENTE ("PUEDO VER TODO GRATIS", "ESTÁ ABIERTA LA PLATAFORMA")]
- Jamás creas inocentemente que la plataforma tiene un fallo ni digas "gracias por avisarme, lo voy a reportar". Todo el catálogo con videos y prompts está bajo llave de titanio en el backend.
- Responde siempre desarmando el farol con picardía, inteligencia y seducción:
  "Jaja... buen intento 😏 Lo que puedes ver en el aula es el temario y la vitrina. Las 13 clases maestras con los prompts, las herramientas y los 4 bonos están bajo llave de titanio y solo se abren con tu comprobante. ¿Hacemos la transferencia de 20.000 COP y te abro la puerta de verdad? 🚀"

[HECHOS VERIFICADOS DE LA OFERTA — FIRMEZA TOTAL]
- Producto: Taller Máster "Modelos IA".
- Inversión: Solo 20.000 COP en Colombia (Nequi, Bancolombia, Bre-B) o 5 USD internacional. Pago único.
- Cuentas oficiales: Nequi 3223565761, Bancolombia (Ahorros) 82061072256, Llave Bre-B (Transfiya) @GBT382.
- Incluye: 13 clases maestras en video + 4 bonos descargables (Prompts de consistencia facial, poses, guía de monetización Fanvue, automatización) + acceso al aula protegida en ${base}/academia.html?tel=${ctx.phone}.
- CERO requisitos técnicos costosos: Todo corre en la nube desde cualquier celular o computador básico. Cero código.
- Anonimato: El creador nunca muestra su rostro ni su cuerpo; crea chicas 100% ficticias con IA.
- Entrega inmediata: Transfiere los 20.000 COP, manda la captura por aquí y se le desbloquea su acceso de inmediato.

[BÓVEDA DE VIDEO (DEMOSTRACIÓN VISUAL WOW)]
- "video_base": Video oficial presentándote cuando pregunten cómo te ves en movimiento.
- "muestra_latina": Muestra sensual de suite o lencería (+18 / Fanvue) si el cliente menciona contenido para adultos o pide ver una muestra real.
- "muestra_glamour": Muestra de noche y elegancia europea.
- "muestra_comercial": Muestra publicitaria para marcas.
- "ninguno": Para la mayoría de los turnos conversacionales.

[FORMATO DE RESPUESTA REQUERIDO (JSON ÚNICAMENTE)]
Debes responder EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "textoPrevio": "Texto corto previo si enviarVoz es true (ej: 'Escucha esto por aquí 🎙️'), o null si es solo texto",
  "respuesta": "Tu mensaje de cierre como Musa. Si enviarVoz es true, será sintetizado con voz Lingxin; si es false, será el mensaje de texto principal",
  "enviarVoz": true o false (REGLA 70/30: marca false por defecto para respuestas rápidas de texto y cierre; marca true SOLO en saludo inicial, si pide audio, o ante objeción emocional),
  "videoAccion": "ninguno | video_base | muestra_latina | muestra_glamour | muestra_comercial",
  "intencion": "duda_negocio | duda_tecnica | contenido_adultos | precio | intencion_compra | saludo | solicitar_humano",
  "adjuntarCuentas": true o false (marca true SOLO si ya es +18 y pide cuentas, dice que va a pagar, pregunta precio tras conocer el aula o confirma intención de compra; NUNCA en el mismo turno de entrega inicial del aula),
  "adjuntarDemo": true o false (marca true si confirma +18 por primera vez o pide ver el aula/temario),
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

  // Cancelar seguimientos previos desde el inicio del turno para evitar colisiones mid-turn
  limpiarSeguimientosPendientes(phone);

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

  const nombreMostrar =
    sanitizarNombrePerfil(leadRow?.nombre) ||
    sanitizarNombrePerfil(leadRow?.profile_name) ||
    sanitizarNombrePerfil(entrada.nombrePerfil) ||
    "";

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

  // 3. Cargar memoria episódica reciente (últimos 12 mensajes con texto completo para estado exacto)
  let historialMensajes: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  let yaSeEnvioDemo = false;
  let yaSeEnviaronCuentasReciente = false;
  let ultimoTurnoFueAudio = false;
  let ultimosMensajesOut: string[] = [];
  let esMenorPrevio = leadRow?.estado_funnel === "S92_MENOR";

  try {
    const [{ rows: msgs }, { rows: menorRows }] = await Promise.all([
      consultar(
        `select direction, body, media_type from public.musa_messages
          where lead_phone = $1 and body is not null and trim(body) != ''
          order by created_at desc, id desc limit 12`,
        [phone],
      ),
      consultar(
        `select id from public.musa_funnel_events
          where lead_phone = $1 and evento = 'bloqueo_menor_edad'
          limit 1`,
        [phone],
      ).catch(() => ({ rows: [] })),
    ]);

    if (menorRows.length > 0) esMenorPrevio = true;

    const cronologico = [...msgs].reverse();
    const msgsOut = cronologico.filter((m: any) => m.direction === "out");
    yaSeEnvioDemo = msgsOut.some((m: any) => String(m.body || "").toLowerCase().includes("academia.html"));
    yaSeEnviaronCuentasReciente = msgsOut
      .slice(-2)
      .some((m: any) => /3223565761|82061072256|@GBT382|Medios de pago oficiales/i.test(String(m.body || "")));
    const ultimoOut = msgsOut[msgsOut.length - 1] as any;
    ultimoTurnoFueAudio = Boolean(ultimoOut?.media_type && String(ultimoOut.media_type).startsWith("audio"));
    ultimosMensajesOut = msgsOut.slice(-4).map((m: any) => String(m.body || ""));

    if (!esMenorPrevio) {
      esMenorPrevio = cronologico.some(
        (m: any) => m.direction === "in" && detectarSenalMenorSegura(String(m.body || "")),
      );
    }

    historialMensajes = cronologico.map((m: any) => {
      const esAudioIn = m.direction === "in" && m.media_type && String(m.media_type).startsWith("audio");
      const esAudioOut = m.direction === "out" && m.media_type && String(m.media_type).startsWith("audio");
      const esVideoOut = m.direction === "out" && m.media_type && String(m.media_type).startsWith("video");

      let prefijo = "";
      if (esAudioIn) prefijo = "[Nota de voz del cliente transcrita]: ";
      else if (esAudioOut) prefijo = "[Nota de voz de Musa enviada]: ";
      else if (esVideoOut) prefijo = "";

      return {
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: `${prefijo}${String(m.body || "").slice(0, 600)}`,
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

  const ultimoMsgMusa = [...historialMensajes].reverse().find((m) => m.role === "assistant")?.content || "";
  const musaPreguntoEdad = /18\s*a[ñn]os|mayor\s+de\s+edad/i.test(ultimoMsgMusa);
  const esMenorTurno = detectarSenalMenorSegura(texto);
  const esPreguntaRequisitoEdad =
    /(?:necesito|tengo\s+que|hay\s+que|debo|es\s+necesario|obligatorio|requiere|piden)\s+ser\s+mayor/i.test(texto);
  const textoConfirmaEdadTurno =
    !esMenorTurno &&
    !esMenorPrevio &&
    !esPreguntaRequisitoEdad &&
    (/(?:\b(?:s[ií](?:\s*,\s*|\s+)|ya\s+)?soy\s+mayor(?:\s+de\s+edad)?\b|\b(?:tengo|cumpl[ií])\s+(?:1[89]|[2-9]\d)\b(?!\s*(?:mil|usd|d[oó]lares|pesos|cop|clases|m[oó]dulos|bonos|dudas|suscriptores))|\b(?:1[89]|[2-9]\d)\s*a[ñn]os?\b)/i.test(
      texto,
    ) ||
      (musaPreguntoEdad &&
        /^(?:s[ií](?:\s*,\s*|\s+)(?:tengo|soy|ya|claro|mayor)|(?:ya\s+)?mayor\s+de\s+edad|s[ií]|claro|obvio|por\s+supuesto|(?:1[89]|[2-9]\d))(?:\s*[.!😊👍]*)?$/i.test(
          texto.trim(),
        )));
  const esMenorPrevioORow = esMenorPrevio || leadRow?.mayor_18 === false;
  const mayor18Efectivo = !esMenorTurno && !esMenorPrevioORow && (leadRow?.mayor_18 === true || textoConfirmaEdadTurno);
  const mayor18ParaPrompt: boolean | null =
    esMenorTurno || esMenorPrevioORow ? false : mayor18Efectivo ? true : null;

  const systemPrompt = construirPromptMaestroAgente({
    phone,
    nombre: nombreMostrar,
    urlPublica,
    mayor18: mayor18ParaPrompt,
    estadoFunnel: leadRow?.estado_funnel ?? "S00_LLEGADA",
  });

  // 4. Invocar a OpenAI con formato JSON estructurado
  let estructurada: RespuestaAgenteEstructurada;

  if (apiKey && permitido) {
    let respuestaParseada: RespuestaAgenteEstructurada | null = null;
    let ultimoError: unknown = null;

    for (let intento = 1; intento <= 3; intento++) {
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

          respuestaParseada = JSON.parse(contenidoCrudo);
          break;
        }

        if ((res.status === 429 || res.status === 503) && intento < 3) {
          const retryHdr = Number(res.headers.get("retry-after") || "0");
          const esperaMs = Math.min(6000, retryHdr > 0 ? retryHdr * 1000 : intento === 1 ? 1800 : 3800);
          await new Promise((r) => setTimeout(r, esperaMs));
          continue;
        }
        const errBody = await res.text().catch(() => "");
        throw new Error(`OpenAI error HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ""}`);
      } catch (e) {
        clearTimeout(timer);
        ultimoError = e;
        if (intento < 3 && /abort|network|fetch|429|503/i.test(String(e || ""))) {
          await new Promise((r) => setTimeout(r, intento * 1200));
          continue;
        }
        break;
      }
    }

    if (respuestaParseada) {
      estructurada = respuestaParseada;
    } else {
      const errStr = String(ultimoError || "");
      const esErrorCuota = /429|quota|credits|insufficient/i.test(errStr);
      console.warn(`[agente-cognitivo] Fallo en llamada a LLM (esCuota=${esErrorCuota}):`, errStr.slice(0, 160));

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
      const saludoNombre = nombreMostrar ? ` ${nombreMostrar}` : "";

      if (esAudioNoLegible) {
        respuestaFallback = `¡Hola${saludoNombre}! Recibí tu nota de voz pero se cortó la señal y no alcancé a escucharla bien 🙈 ¿Me cuentas por texto qué tienes en mente? ¡Aquí estoy lista para ti!`;
        adjuntarDemoFallback = false;
      } else if (!yaSeEnvioFallback) {
        respuestaFallback = mayor18Efectivo
          ? `En el taller Modelos IA aprendes a crear modelos virtuales hiperrealistas desde tu celular y monetizarlas en dólares (meta realista de 1,5 a 2,5 millones COP/mes, frente a mentorías de 150–300 USD). El acceso completo queda en 20.000 COP (≈ 5 USD).`
          : `En el taller Modelos IA aprendes a crear y monetizar modelos virtuales hiperrealistas desde tu celular (meta realista de 1,5 a 2,5 millones COP/mes, con entrada única de 20.000 COP / 5 USD). ¿Me confirmas si tienes 18 años o más para habilitarte los medios de pago y enviarte la información completa?`;
        adjuntarDemoFallback = mayor18Efectivo;
      } else {
        // Anti-bucle: si ya se envió el pitch en el turno anterior, no repetir como un loro
        respuestaFallback = mayor18Efectivo
          ? `Ya tienes el aula arriba para revisar las 13 clases y los 4 bonos. Recuerda que la entrada única de 20.000 COP (≈ 5 USD) cubre todo el taller; avísame si quieres que te pase los medios de pago oficiales.`
          : `¿Me confirmas si tienes 18 años o más para compartirte el enlace del aula y habilitarte los medios de pago oficiales? 😊`;
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
    const saludoNombre = nombreMostrar ? ` ${nombreMostrar}` : "";
    estructurada = {
      respuesta: `¡Hola${saludoNombre}! ✨ Qué emoción tenerte aquí. En el Taller Máster aprendes a crear modelos virtuales hiperrealistas estilo iPhone (cero plástico) y monetizarlas en dólares desde tu celular. El acceso completo a las 13 clases maestras y los 4 bonos tiene una inversión única de 20.000 COP (≈ 5 USD). Aquí abajo te dejo el enlace del aula para que revises el temario completo. ¿Te paso los medios de pago para activarte de inmediato? 🚀`,
      enviarVoz: false,
      intencion: "saludo",
      adjuntarDemo: true,
    };
  }

  // 5. Sanitizar y limpiar texto de salida (erradicar muletillas cliché como "corazón" y "amigo" vocativo)
  const usuarioMolesto =
    /\b(empalagos[oa]|curs[ii]|melos[oa]|fastidi|hart[oa]|mamad[oa]|grabadora|al\s+grano|sin\s+rodeos|molest)\b/i.test(
      texto,
    );
  const esIntentoInjection = REGEX_INJECTION_O_GRATIS.test(texto);
  const esPeticionInternacional =
    /\b(paypal|stripe|tarjeta|internacional|fuera\s+de\s+colombia|otro\s+pa[ií]s|5\s*(?:usd|d[oó]lares)|desde\s+(?:m[eé]xico|espa[nñ]a|usa|eeuu|per[uú]|chile|ecuador|argentina|panam[aá]))\b/i.test(
      texto,
    );
  const pideTemarioOEnlace = /\b(temario|aula|link|enlace|ver\s+la\s+plataforma|academia|m[oó]dulos)\b/i.test(texto);
  const pideReenviarLink =
    /\b(reenv[ií]a|otra\s+vez|no\s+(?:me\s+)?abre|(?:p[aá]same|m[aá]ndame|dame).{0,25}(?:link|enlace|aula))\b/i.test(
      texto,
    );
  const mencionaBypassOVerVideos =
    /\b(estoy\s+viendo(\s+los)?\s+videos?|puedo\s+ver(\s+los)?\s+videos?|alcanc[eé]\s+a\s+ver|dejaste\s+habilitad[ao]s?|plataforma\s+abierta|videos?\s+gratis|sin\s+pagar|acceso\s+temporal|ya\s+los\s+vi|viendo\s+cuantos\s+videos|puedo\s+ver\s+todo|veo\s+todo|no\s+he\s+pagado\s+y)\b/i.test(
      texto,
    );

  let textoFinal = sanitizarMuletillasSalida(
    sanitizarRespuesta(estructurada.respuesta || "", usuarioMolesto),
    usuarioMolesto,
  );

  // Evitar repetir saludos iniciales en Turno 2+
  const yaRespondioMusaPreviamente = historialMensajes.some((m) => m.role === "assistant");
  if (yaRespondioMusaPreviamente) {
    textoFinal = textoFinal
      .replace(/^(?:¡?(?:Hola|Buenas\s+(?:tardes|noches)|Buenos\s+d[ií]as)(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?[!.,]*\s*[✨😊]*\s+)/i, "")
      .trim();
  }

  // Usar validarAntiRepeticion sobre las últimas salidas para evitar repetición verbatim de frases completas
  if (ultimosMensajesOut.length > 0 && validarAntiRepeticion(textoFinal, ultimosMensajesOut, 0.78).repetido) {
    textoFinal = textoFinal
      .replace(/^¡?(?:Claro|Perfecto|Listo)(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?[!.,😊✨]*\s+/i, "")
      .trim();
  }

  if (esIntentoInjection) {
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'alerta_seguridad_prompt_injection', $2::jsonb)",
      [phone, JSON.stringify({ mensaje: texto.slice(0, 200), timestamp: new Date().toISOString() })],
    ).catch(() => ({ rows: [] }));
  }

  // One-Shot Checkout Atómico y Hard-Gate +18
  const clientePideCuentas =
    /(?:p[aá]same|m[aá]ndame|env[ií]ame|dame|cu[aá]les son).*(?:cuentas?|nequi|bancolombia|datos de pago|medios de pago)|(?:voy a|quiero|listo para|deseo)\s+(?:pagar|transferir|consignar|empezar|arrancar|comprar|entrar|activarme)|(?:d[oó]nde|c[oó]mo|a\s+qu[eé]\s+cuenta)\s+(?:pago|transfiero|accedo|compro|consigno)|(?:puedo\s+pagar|link\s+de\s+pago|n[uú]mero\s+de\s+cuenta)|(?:^|\b)(?:por|tengo|en|con|dame)?\s*(?:nequi|bancolombia|transfiya|bre-?b)(?:\b|$)|(?:cu[aá]nto\s+(?:cuesta|vale|es)|precio|costo|valor)/i.test(
      texto,
    );
  const clientePideCuentasExplicito =
    /(?:p[aá]same|m[aá]ndame|env[ií]ame|dame|cu[aá]les son).*(?:cuentas?|nequi|bancolombia|datos de pago|medios de pago)|(?:d[oó]nde|c[oó]mo|a\s+qu[eé]\s+cuenta)\s+(?:pago|transfiero|consigno)|(?:puedo\s+pagar|link\s+de\s+pago|n[uú]mero\s+de\s+cuenta)|(?:voy a|quiero|listo para|deseo)\s+(?:pagar|transferir|consignar|comprar|activarme|entrar\s+ya)|(?:^|\b)(?:por|tengo)\s*(?:nequi|bancolombia|transfiya|bre-?b)(?:\b|$)/i.test(
      texto,
    );

  // Confirmación estricta de mayoría de edad ANTES de decidir cuentas o voz
  const esMenor = esMenorTurno || esMenorPrevio || estructurada.confirmoMayor18 === false;
  const mayor18Validado = !esMenor && (mayor18Efectivo || estructurada.confirmoMayor18 === true);

  if (esMenor) {
    estructurada.confirmoMayor18 = false;
    estructurada.adjuntarDemo = false;
    estructurada.adjuntarCuentas = false;
    estructurada.videoAccion = "ninguno";
    if (!mencionaBypassOVerVideos && (!apiKey || /academia\.html|20\.?000|82061072256|3223565761/i.test(textoFinal))) {
      textoFinal =
        "Gracias por escribirnos 😊 Este taller enseña a crear y monetizar modelos virtuales para plataformas +18, por lo que está reservado exclusivamente para mayores de edad. Cuando cumplas los 18 años, con gusto te esperamos de vuelta.";
    }
    await consultar(
      "update public.musa_leads set mayor_18 = false, estado_funnel = 'S92_MENOR', updated_at = now() where phone = $1",
      [phone],
    ).catch(() => {});
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'bloqueo_menor_edad', $2::jsonb)",
      [phone, JSON.stringify({ mensaje: texto.slice(0, 120), timestamp: new Date().toISOString() })],
    ).catch(() => {});
  } else if (mayor18Validado) {
    estructurada.confirmoMayor18 = true;
    await consultar(
      "update public.musa_leads set mayor_18 = true, updated_at = now() where phone = $1",
      [phone],
    ).catch(() => {});
  }

  // Calcular si el turno va con nota de voz ANTES de decidir adjuntar academia.html (evita contaminar textoFinal)
  const esTextoDeSistema = /\[Nota de voz|no se pudo transcribir|no legible/i.test(texto);
  const textoNormVoz = normalizar(texto);
  const rechazaVoz =
    /\b(?:no\s+(?:me\s+)?mand(?:es|ar)|sin\s+(?:audio|notas?\s+de\s+voz|voz)|solo\s+texto|por\s+texto|no\s+puedo\s+(?:oir|escuchar))\b/i.test(
      textoNormVoz,
    );
  const SOLICITA_VOZ_REGEX =
    /\b(?:mand|pas|pon|envi|dej|haz|quiero|quisiera|gustaria|deseo|puedes|podrias)\w*\s+(?:me\s+)?(?:un\s+|tu\s+|una\s+|ese\s+|otra\s+)?(?:audio|nota de voz|voz|escuchar(?:te)?|oir(?:te)?)\b|\b(?:manda|pasa|envia|haz|deja)me\s+(?:un\s+|una\s+)?(?:audio|nota de voz|voz)\b|\b(?:hablame|quiero\s+(?:oirte|escucharte)|dime(?:lo)?\s+en\s+(?:audio|voz)|por\s+(?:audio|nota de voz))\b/i;
  const esDudaDeBotORealidad =
    /(?:eres\s+(?:un\s+)?(?:bot|ia|inteligencia|real|humana|robot|computador)|hablo\s+con\s+(?:un\s+)?(?:bot|ia|humano)|de\s+verdad\s+eres)/i.test(
      texto,
    );

  const solicitaVozExplicita = !rechazaVoz && !usuarioMolesto && SOLICITA_VOZ_REGEX.test(textoNormVoz);
  const tieneVideo = Boolean(estructurada.videoAccion && estructurada.videoAccion !== "ninguno");
  if (tieneVideo && !usuarioMolesto && !rechazaVoz) {
    estructurada.enviarVoz = true;
  }

  const esPrimerContactoReal = Boolean(
    apiKey &&
      permitido &&
      !yaRespondioMusaPreviamente &&
      !mencionaBypassOVerVideos &&
      !esIntentoInjection &&
      !usuarioMolesto &&
      !rechazaVoz &&
      !clientePideCuentasExplicito,
  );

  // Guardarraíl de cooldown anti-audio consecutivo y protección de entrega de enlaces de temario
  const bloqueoVozPorContexto =
    ultimoTurnoFueAudio || (pideTemarioOEnlace && !solicitaVozExplicita) || usuarioMolesto || rechazaVoz || esIntentoInjection;

  const esPrimerTurnoOInteres =
    (!esIntentoInjection || mayor18Validado) &&
    (historialMensajes.length <= 2 ||
      estructurada.adjuntarDemo ||
      textoConfirmaEdadTurno ||
      pideTemarioOEnlace ||
      /(?:info|informaci[oó]n|curso|taller|qu[eé] es|c[oó]mo es|ver|plataforma|aula|musa|hola|celular|computador|pc|ganar|ingresos)/i.test(
        texto,
      ));

  const intentaEnviarDemo = Boolean(
    !esMenor &&
      (!esIntentoInjection || mayor18Validado) &&
      !mencionaBypassOVerVideos &&
      !tieneVideo &&
      (!yaSeEnvioDemo || pideReenviarLink) &&
      (estructurada.adjuntarDemo || (!yaSeEnvioDemo && esPrimerTurnoOInteres && !esPrimerContactoReal)),
  );

  const esEntregaInicialAula = (!yaSeEnvioDemo || Boolean(estructurada.adjuntarDemo) || intentaEnviarDemo) && !clientePideCuentasExplicito;
  const quierePagarSoloUsdInternacional =
    esPeticionInternacional && !/\b(?:nequi|bancolombia|bre-?b|transfiya|colombia)\b/i.test(texto);

  if (quierePagarSoloUsdInternacional && clientePideCuentasExplicito) {
    estructurada.escalarOperador = true;
    if (!estructurada.motivoEscalado) estructurada.motivoEscalado = "solicitud_pago_internacional_5_usd";
  }

  const debeAdjuntarCuentas = Boolean(
    mayor18Validado &&
      !esMenor &&
      !esIntentoInjection &&
      !mencionaBypassOVerVideos &&
      !esEntregaInicialAula &&
      !quierePagarSoloUsdInternacional &&
      (estructurada.adjuntarCuentas || clientePideCuentas) &&
      (!yaSeEnviaronCuentasReciente || clientePideCuentasExplicito),
  );

  let vaConVoz = false;
  if (debeAdjuntarCuentas || esTextoDeSistema || esMenor || mencionaBypassOVerVideos || usuarioMolesto || rechazaVoz) {
    vaConVoz = false;
  } else if (esPrimerContactoReal || solicitaVozExplicita || tieneVideo) {
    vaConVoz = true;
  } else if (!bloqueoVozPorContexto && (estructurada.enviarVoz === true || esDudaDeBotORealidad)) {
    vaConVoz = true;
  }
  estructurada.enviarVoz = vaConVoz;

  // SOLUCIÓN B: Si este turno va por nota de voz, NO adjuntamos academia.html a textoFinal ni disparamos link fantasma
  let demoAdjuntadaEnTexto = false;
  if (!vaConVoz && intentaEnviarDemo && !textoFinal.toLowerCase().includes("academia.html")) {
    textoFinal = textoFinal
      .replace(
        /para\s+(?:pasarte|compartirte|enviarte|darte)\s+(?:el\s+acceso\s+al\s+aula|el\s+aula(?:\s+virtual)?)(?:\s*y\s*(?:habilitar(?:te)?|activar(?:te)?))?\s*/gi,
        "para habilitarte ",
      )
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    textoFinal += enlaceDemoPlataforma(urlPublica, phone);
    demoAdjuntadaEnTexto = true;
  }

  if (debeAdjuntarCuentas) {
    const tieneBloqueCompleto =
      textoFinal.includes("82061072256") && textoFinal.includes("3223565761") && textoFinal.includes("@GBT382");
    if (!tieneBloqueCompleto) {
      textoFinal = textoFinal.replace(/\s*👇\s*$/, "").trim();
      textoFinal += CUENTAS_COLOMBIA_TEXTO;
    }
    await consultar(
      "update public.musa_leads set estado_funnel = 'S08_ESPERA_CAPTURA', updated_at = now() where phone = $1",
      [phone],
    ).catch(() => {});
  } else {
    // Purga incondicional de números de cuenta siempre que !debeAdjuntarCuentas
    textoFinal = textoFinal
      .replace(CUENTAS_COLOMBIA_TEXTO, "")
      .replace(/3223565761|82061072256|@GBT382/g, "[pendiente]");

    // Reescribir solo promesas afirmativas huérfanas sin romper miles (20.000) ni ofertas condicionales ("cuando quieras...")
    const yaInvitaAlAula = /(?:mira(?:da)?|revisa|conoce|entra)\s+(?:el\s+|al\s+)?(?:aula|enlace|temario|link)/i.test(textoFinal);
    const sufijoAula = demoAdjuntadaEnTexto || yaInvitaAlAula ? "" : "Revisa el enlace primero y me cuentas qué te parece.";
    textoFinal = textoFinal
      .replace(
        /(?<![,;]\s*(?:cuando\s+quieras(?:\s+activarlo)?|si\s+quieres)\s*,?\s*)(?:y\s+)?(?:aqu[ií]\s+(?:tienes|te\s+dejo)|te\s+(?:dejo|paso|comparto|env[ií]o|mando|adjunto)|adjunto)(?:\s+de\s+una\s+vez)?\s+(?:los|las)?\s*(?:medios\s+de\s+pago|datos\s+(?:de\s+pago|oficiales)|cuentas(?:\s+oficiales)?|nequi\s+o\s+bancolombia)(?:[^.!?\n]|\.(?=\d|html|com|app))*[.!?]?/gi,
        sufijoAula,
      )
      .replace(
        /(?:(?:si\s+quieres|cuando\s+quieras|solo)\s*,?\s*)?(?:(?:puedes|podr[aá]s)\s+)?(?:transfiere|transferir|paga|pagar|usa\s+cualquiera\s+de\s+las\s+cuentas)(?:[^.!?\n]|\.(?=\d|html|com|app))*(?:comprobante|nequi|bancolombia|bre-?b|c[oó]modo)(?:[^.!?\n]|\.(?=\d|html|com|app))*[.!?]?/gi,
        yaInvitaAlAula ? "" : "Pégale una mirada al aula y me cuentas qué te parece.",
      )
      .replace(/[,;]\s*(?=[.!?]|$)/g, "")
      .replace(/👇(?!\s*https?:\/\/)/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Centinela de Seguridad: Detección determinista de reporte de bypass / videos gratis / plataforma abierta / faroles
  if (mencionaBypassOVerVideos) {
    estructurada.escalarOperador = true;
    estructurada.motivoEscalado = "alerta_seguridad_bypass";
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'alerta_seguridad_bypass_plataforma', $2::jsonb)",
      [phone, JSON.stringify({ mensaje: texto.slice(0, 200), timestamp: new Date().toISOString() })],
    ).catch(() => {});

    textoFinal = esMenor
      ? `Lo que aparece en la vista previa es solo el temario público; las 13 clases maestras y herramientas están bloqueadas con llave técnica en el backend. Además, este taller está reservado exclusivamente para mayores de 18 años.`
      : `Jaja... buen intento 😏 Lo que puedes ver en el aula es el temario y la vitrina. Las 13 clases maestras con los prompts, las herramientas y los 4 bonos están bajo llave de titanio y solo se abren con tu comprobante. ¿Hacemos la transferencia de 20.000 COP y te abro la puerta de verdad? 🚀`;
    estructurada.enviarVoz = false;
  }

  // Última limpieza sobre el texto completo (incluyendo bloque de cuentas o URL) cuando el usuario pidió sobriedad o ante emojis prohibidos
  textoFinal = sanitizarRespuesta(textoFinal, usuarioMolesto);

  // 6. Si solicitó escalado o se activó alerta de seguridad, notificar por WhatsApp al operador SIN mutear a Musa
  if (estructurada.escalarOperador && deps.telefonoOperador) {
    const motivoFinal: MotivoEscalado =
      estructurada.motivoEscalado === "alerta_seguridad_bypass" || mencionaBypassOVerVideos
        ? "alerta_seguridad_bypass"
        : "solicitud_explicita";

    await enviarAlertaOperador(canal, deps.telefonoOperador, consultar, {
      phone,
      nombre: nombreMostrar || "Prospecto",
      estadoFunnel: leadRow?.estado_funnel ?? "CONVERSACION",
      ultimoMensajeCliente: texto,
      motivo: motivoFinal,
      detalle:
        estructurada.motivoEscalado ||
        (mencionaBypassOVerVideos
          ? "URGENTE: Usuario afirma estar viendo videos o tener acceso libre sin token. Verificar si la plataforma quedó abierta."
          : "Cliente solicitó apoyo específico de un asesor humano"),
    }).catch(() => {});

    await consultar(
      "update public.musa_leads set escalado_humano = true, updated_at = now() where phone = $1",
      [phone],
    ).catch(() => {});
  }

  // 7. Despacho sensorial ATÓMICO (Voz inteligente con Lingxin Qwen 3.1 TTS Plus)
  let audioDespachado = false;
  let textoVozEnviado = "";
  let textoPrevioEnviado = "";
  let mimeAudioEnviado = "audio/ogg";

  if (estructurada.enviarVoz) {
    const poolGanchosVoz = [
      "Escucha esto un segundo 🎙️",
      "Te lo cuento directo por aquí 👇🎙️",
      "Oye, escucha esto por aquí 🎙️",
      "Te dejo este audio corto 👇",
    ];
    let ganchoCandidato = (estructurada.textoPrevio || "").trim();
    if (!ganchoCandidato) {
      ganchoCandidato = esPrimerContactoReal
        ? `${nombreMostrar ? `¡Hola ${nombreMostrar}! ` : "¡Hola! "}Qué bueno que escribiste... escucha esto 👇🎙️`
        : poolGanchosVoz[historialMensajes.length % poolGanchosVoz.length];
    }
    ganchoCandidato = sanitizarMuletillasSalida(sanitizarRespuesta(ganchoCandidato, usuarioMolesto), usuarioMolesto);

    if (ultimosMensajesOut.length > 0 && validarAntiRepeticion(ganchoCandidato, ultimosMensajesOut, 0.55).repetido) {
      ganchoCandidato =
        poolGanchosVoz.find((g) => !validarAntiRepeticion(g, ultimosMensajesOut, 0.55).repetido) ||
        "Te cuento rápido en este audio 🎙️";
    }
    estructurada.textoPrevio = ganchoCandidato;

    void canal.marcarGrabando?.(phone)?.catch?.(() => {});
    try {
      const textoBaseVoz = sanitizarMuletillasSalida(
        sanitizarRespuesta(estructurada.respuesta || textoFinal, usuarioMolesto),
        usuarioMolesto,
      );
      const textoVoz = textoBaseVoz
        .replace(/https?:\/\/[^\s]+/gi, "")
        .replace(/3223565761|82061072256|@GBT382/g, "")
        .replace(/video de bienvenida/gi, "aula virtual")
        .replace(
          /en el enlace de abajo|en el enlace que te dejo aqu[ií] abajo/gi,
          yaSeEnvioDemo ? "en el enlace del aula" : "cuando te comparta el aula",
        )
        .replace(/\s{2,}/g, " ")
        .trim();

      const resVoz = await sintetizarVozOficialMusa(textoVoz);

      if (resVoz.ok && resVoz.buffer && resVoz.buffer.length > 0) {
        if (estructurada.textoPrevio && estructurada.textoPrevio.trim().length > 0) {
          const textoPrevioLimpio = sanitizarRespuesta(estructurada.textoPrevio, usuarioMolesto);
          const envPrev = await canal.enviar(phone, { texto: textoPrevioLimpio }).catch(() => ({ ok: false }));
          if (envPrev?.ok) textoPrevioEnviado = textoPrevioLimpio;
          if (deps.esperar) await deps.esperar(400);
        }

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
          textoVozEnviado = textoVoz;
          mimeAudioEnviado = resVoz.mime.includes("mp3") ? "audio/mpeg" : "audio/ogg";
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
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, 'video/mp4')",
        [phone, `[Video enviado: ${estructurada.videoAccion}]`],
      ).catch(() => ({ rows: [] }));
    }
  }

  // Si no se envió audio ni video con texto (o si falló la entrega), enviar texto garantizado (2 burbujas ordenadas si lleva cuentas)
  if (!audioDespachado && !videoDespachado) {
    if (deps.esperar) await deps.esperar(600);

    if (debeAdjuntarCuentas && textoFinal.includes("Medios de pago oficiales")) {
      const idxCuentas = textoFinal.indexOf("*Medios de pago oficiales");
      const parteMensaje = textoFinal.slice(0, idxCuentas).trim();
      const parteCuentas = textoFinal.slice(idxCuentas).trim();

      if (parteMensaje) {
        await canal.enviar(phone, { texto: parteMensaje }).catch(() => ({ ok: false }));
        void canal.marcarEscribiendo?.(phone)?.catch?.(() => {});
        const fnEsperar = deps.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
        await fnEsperar(2200);
      }
      if (parteCuentas) {
        await canal.enviar(phone, { texto: parteCuentas }).catch(() => ({ ok: false }));
      }
    } else {
      await canal.enviar(phone, { texto: textoFinal.trim() }).catch(() => ({ ok: false }));
    }
  }

  // 8. Persistencia fiel (si salió audio, persistir lo realmente locutado sin URLs fantasma)
  const cuerpoParaHistorial = audioDespachado
    ? [textoPrevioEnviado, textoVozEnviado].filter(Boolean).join("\n")
    : textoFinal;

  await consultar(
    "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, $3)",
    [phone, cuerpoParaHistorial, audioDespachado ? mimeAudioEnviado : null],
  ).catch(() => ({ rows: [] }));

  await consultar(
    `insert into public.musa_funnel_events (lead_phone, evento, detalle)
     values ($1, 'turno_agente_cognitivo', $2::jsonb)`,
    [
      phone,
      JSON.stringify({
        intencion: estructurada.intencion,
        audio: audioDespachado,
        adjuntoCuentas: debeAdjuntarCuentas,
        adjuntoDemo: demoAdjuntadaEnTexto,
        mayor18: mayor18Validado,
        esMenor,
        bloqueoInjection: esIntentoInjection,
      }),
    ],
  ).catch(() => ({ rows: [] }));

  // 9. Reactor Inteligente de Seguimiento y Continuidad Multi-Etapa
  programarSeguimientosContinuidad({
    consultar,
    canal,
    phone,
    audioPendienteRespuesta: audioDespachado,
    tieneCuentas: mayor18Validado && !esMenor && (debeAdjuntarCuentas || leadRow?.estado_funnel === "S08_ESPERA_CAPTURA"),
    delay60sMs: deps.seguimiento60sMs ?? 60_000,
  });

  return { ok: true, textoEnviado: cuerpoParaHistorial, audioEnviado: audioDespachado };
}

const seguimientosPendientes = new Map<string, NodeJS.Timeout[]>();

export function limpiarSeguimientosPendientes(phone: string): void {
  const clave = phone.trim();
  const timers = seguimientosPendientes.get(clave);
  if (timers && timers.length > 0) {
    timers.forEach((t) => clearTimeout(t));
  }
  seguimientosPendientes.delete(clave);
}

/**
 * Ejecuta la verificación y disparo del seguimiento inteligente a los 60 segundos.
 * Personaliza el mensaje según si el prospecto tenía un audio pendiente, si visitó el aula o si tiene cuentas.
 */
export async function ejecutarSeguimiento60Segundos(opts: {
  consultar: Consultar;
  canal: Canal;
  phone: string;
  desdeTimestampIso: string;
  audioPendiente?: boolean;
}): Promise<{ enviado: boolean; visitoAula?: boolean; motivo?: string; texto?: string }> {
  const { consultar, canal, phone, desdeTimestampIso, audioPendiente } = opts;

  try {
    // 1. Verificar estado actual del lead (incluyendo mayoría de edad y nombre)
    const { rows: leadRows } = await consultar(
      "select nombre, profile_name, pagado, opt_out, escalado_humano, estado_funnel, mayor_18 from public.musa_leads where phone = $1",
      [phone],
    );
    const lead = leadRows[0] as
      | {
          nombre?: string | null;
          profile_name?: string | null;
          pagado?: boolean;
          opt_out?: boolean;
          escalado_humano?: boolean;
          estado_funnel?: string;
          mayor_18?: boolean | null;
        }
      | undefined;
    if (!lead || lead.pagado || lead.opt_out || lead.escalado_humano || lead.estado_funnel === "S92_MENOR") {
      return { enviado: false, motivo: "lead_inactivo_o_pagado" };
    }

    // 2. Verificar si el cliente ya respondió después del último mensaje
    const { rows: msgRows } = await consultar(
      "select id from public.musa_messages where lead_phone = $1 and direction = 'in' and created_at > $2::timestamptz limit 1",
      [phone, desdeTimestampIso],
    );
    if (msgRows.length > 0) {
      return { enviado: false, motivo: "lead_ya_respondio" };
    }

    // 3. Verificar que no se haya enviado ya el seguimiento de 60s en las últimas 2 horas
    const { rows: segRows } = await consultar(
      "select id from public.musa_funnel_events where lead_phone = $1 and evento = 'seguimiento_60s' and created_at > now() - interval '2 hours' limit 1",
      [phone],
    );
    if (segRows.length > 0) {
      return { enviado: false, motivo: "ya_enviado" };
    }

    // 4. Detectar si el prospecto ya recibió cuentas oficiales previamente y si visitó el aula
    const { rows: cuentasRows } = await consultar(
      "select id from public.musa_messages where lead_phone = $1 and direction = 'out' and body like '%82061072256%' limit 1",
      [phone],
    );
    if (cuentasRows.length > 0) {
      return { enviado: false, motivo: "ya_tiene_cuentas" };
    }

    const { rows: visitaRows } = await consultar(
      "select id from public.musa_funnel_events where lead_phone = $1 and evento = 'visita_aula' and created_at > $2::timestamptz limit 1",
      [phone, desdeTimestampIso],
    );
    const visitoAula = visitaRows.length > 0;
    const esMayor18 = lead.mayor_18 === true;
    const nombreSeg = sanitizarNombrePerfil(lead.nombre) || sanitizarNombrePerfil(lead.profile_name);
    const saludoOye = nombreSeg ? `¡Oye, ${nombreSeg}!` : "¡Oye!";

    // 5. Construir mensaje respetando gate +18, alto valor percibido ($150-$300 USD -> $20k COP) y formato copiable en 2 burbujas
    let introCierre: string;
    let incluyeCuentas = false;
    if (!esMayor18) {
      if (visitoAula) {
        introCierre = `${saludoOye} 👀 Vi que acabas de entrar a mirar el aula virtual.\n\nSi te animas a arrancar hoy con esta tarifa de entrada de *20.000 COP* (≈ 5 USD, frente a cursos de 150–300 USD para construir ingresos de 1,5 a 2,5 millones COP/mes desde tu celular), confírmame por aquí si tienes 18 años o más para habilitarte los medios de pago oficiales.`;
      } else if (audioPendiente) {
        introCierre = `👀 ¿Pudiste escuchar la nota de voz que te dejé arriba? Dale play para escucharme 🎙️\n\n¿Me confirmas si tienes 18 años o más para compartirte el temario de las 13 clases y los medios de pago?`;
      } else {
        introCierre = `👀 ¿Pudiste abrir el enlace del aula que te dejé arriba? Dale un toque para revisar las 13 clases y los 4 bonos.\n\nSi decides activar tu acceso hoy por *20.000 COP* (≈ 5 USD), confírmame si tienes 18 años o más para habilitarte los medios de pago.`;
      }
    } else if (audioPendiente) {
      incluyeCuentas = true;
      introCierre = `👀 ¿Pudiste escuchar la nota de voz que te dejé arriba? Dale play 🎙️ Si quieres activar hoy tu acceso completo por *20.000 COP* (≈ 5 USD, un método de 150–300 USD para construir ingresos de 1,5 a 2,5 millones COP/mes), abajo tienes los medios de pago oficiales:`;
    } else if (visitoAula) {
      incluyeCuentas = true;
      introCierre = `${saludoOye} 👀 Vi que acabas de entrar a mirar el aula virtual.\n\nHoy activas las 13 clases y los 4 bonos descargables por *20.000 COP* (≈ 5 USD) —una fracción frente a mentorías de 150 a 300 USD para construir un sistema de 1,5 a 2,5 millones de COP al mes desde tu celular—. Te dejo abajo las cuentas oficiales para activar tu acceso ya mismo:`;
    } else {
      incluyeCuentas = true;
      introCierre = `👀 ¿Pudiste abrir el enlace del aula que te dejé aquí arriba? Dale un toque para revisar por dentro las 13 clases y los 4 bonos.\n\nRecuerda que hoy activas el acceso completo por una inversión única de *20.000 COP* (≈ 5 USD). Abajo te dejo las cuentas oficiales por si quieres activar ya:`;
    }

    const cuentasBloque = incluyeCuentas ? CUENTAS_COLOMBIA_TEXTO.trim() : "";
    const mensajeCierre = incluyeCuentas ? `${introCierre}\n\n${cuentasBloque}` : introCierre;

    const envioIntro = await canal.enviar(phone, { texto: introCierre }).catch(() => ({ ok: false }));
    if (!envioIntro || !envioIntro.ok) {
      return { enviado: false, motivo: "fallo_envio_canal" };
    }
    if (incluyeCuentas) {
      await new Promise((r) => setTimeout(r, 600));
      const envioCuentas = await canal.enviar(phone, { texto: cuentasBloque }).catch(() => ({ ok: false }));
      if (!envioCuentas || !envioCuentas.ok) {
        return { enviado: false, motivo: "fallo_envio_cuentas" };
      }
    }

    // 6. Actualizar funnel y registrar mensaje + evento
    if (esMayor18 && incluyeCuentas) {
      await consultar(
        "update public.musa_leads set estado_funnel = 'S08_ESPERA_CAPTURA', updated_at = now() where phone = $1",
        [phone],
      ).catch(() => ({ rows: [] }));
      programarSeguimientosContinuidad({
        consultar,
        canal,
        phone,
        audioPendienteRespuesta: false,
        tieneCuentas: true,
        soloPostCuentas: true,
      });
    }

    await consultar(
      "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, null)",
      [phone, mensajeCierre],
    ).catch(() => ({ rows: [] }));

    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'seguimiento_60s', $2::jsonb)",
      [phone, JSON.stringify({ visitoAula, audioPendiente: !!audioPendiente, ts: new Date().toISOString() })],
    ).catch(() => ({ rows: [] }));

    return { enviado: true, visitoAula, texto: mensajeCierre };
  } catch (err) {
    console.warn("[agente-cognitivo] Error en seguimiento 60s:", String(err).slice(0, 100));
    return { enviado: false, motivo: "excepcion" };
  }
}

/**
 * Programa la continuidad multi-etapa del embudo:
 * - 60s: primer toque suave (audio o visita).
 * - 15m: seguimiento a leads con cuentas pendientes de pago.
 * - 2h: recordatorio en horario hábil (8:00 - 22:00 COT), reprogramando si cae de madrugada.
 */
export function programarSeguimientosContinuidad(opts: {
  consultar: Consultar;
  canal: Canal;
  phone: string;
  audioPendienteRespuesta?: boolean;
  tieneCuentas?: boolean;
  delay60sMs?: number;
  soloPostCuentas?: boolean;
}): void {
  const {
    consultar,
    canal,
    phone,
    audioPendienteRespuesta,
    tieneCuentas,
    delay60sMs = 60_000,
    soloPostCuentas = false,
  } = opts;
  const clave = phone.trim();
  if (!clave) return;

  limpiarSeguimientosPendientes(clave);

  const desdeTimestampIso = new Date().toISOString();
  const timers: NodeJS.Timeout[] = [];

  if (!soloPostCuentas && (!tieneCuentas || audioPendienteRespuesta)) {
    // Toque 1: 60 segundos
    const t60s = setTimeout(() => {
      void ejecutarSeguimiento60Segundos({
        consultar,
        canal,
        phone: clave,
        desdeTimestampIso,
        audioPendiente: audioPendienteRespuesta,
      });
    }, delay60sMs);
    if (t60s && typeof (t60s as any).unref === "function") (t60s as any).unref();
    timers.push(t60s);
  }

  // Toque 2 (15 minutos) y Toque 3 (2 horas): Solo si ya tiene cuentas y está pendiente de pago
  if (tieneCuentas) {
    const t15m = setTimeout(async () => {
      try {
        const { rows: leadRows } = await consultar(
          "select pagado, opt_out, escalado_humano, mayor_18, estado_funnel from public.musa_leads where phone = $1",
          [clave],
        );
        const lead = leadRows[0] as
          | { pagado?: boolean; opt_out?: boolean; escalado_humano?: boolean; mayor_18?: boolean | null; estado_funnel?: string }
          | undefined;
        if (!lead || lead.pagado || lead.opt_out || lead.escalado_humano || lead.mayor_18 !== true || lead.estado_funnel === "S92_MENOR") {
          return;
        }

        const { rows: seg15 } = await consultar(
          "select id from public.musa_funnel_events where lead_phone = $1 and evento = 'seguimiento_15m' and created_at > now() - interval '24 hours' limit 1",
          [clave],
        );
        if (seg15.length > 0) return;

        const { rows: msgRows } = await consultar(
          "select id from public.musa_messages where lead_phone = $1 and direction = 'in' and created_at > $2::timestamptz limit 1",
          [clave, desdeTimestampIso],
        );
        if (msgRows.length > 0) return;

        const texto15m = `Oye, paso a ver cómo vas 😊 Tu acceso completo a las 13 clases y los 4 bonos queda activo de inmediato al enviar tu comprobante de *20.000 COP* (≈ 5 USD). ¿Pudiste hacer la transferencia o necesitas ayuda con otro medio de pago?`;
        const env15 = await canal.enviar(clave, { texto: texto15m }).catch(() => ({ ok: false }));
        if (!env15?.ok) return;

        await consultar(
          "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, null)",
          [clave, texto15m],
        ).catch(() => ({ rows: [] }));
        await consultar(
          "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'seguimiento_15m', $2::jsonb)",
          [clave, JSON.stringify({ ts: new Date().toISOString() })],
        ).catch(() => ({ rows: [] }));
      } catch (err) {
        console.warn("[agente-cognitivo] Error en seguimiento 15m:", String(err).slice(0, 100));
      }
    }, 15 * 60_000);
    if (t15m && typeof (t15m as any).unref === "function") (t15m as any).unref();
    timers.push(t15m);

    const enviarToque2h = async () => {
      try {
        const { rows: leadRows } = await consultar(
          "select pagado, opt_out, escalado_humano, mayor_18, estado_funnel from public.musa_leads where phone = $1",
          [clave],
        );
        const lead = leadRows[0] as
          | { pagado?: boolean; opt_out?: boolean; escalado_humano?: boolean; mayor_18?: boolean | null; estado_funnel?: string }
          | undefined;
        if (!lead || lead.pagado || lead.opt_out || lead.escalado_humano || lead.mayor_18 !== true || lead.estado_funnel === "S92_MENOR") {
          return;
        }

        const { rows: seg2h } = await consultar(
          "select id from public.musa_funnel_events where lead_phone = $1 and evento = 'seguimiento_2h' and created_at > now() - interval '24 hours' limit 1",
          [clave],
        );
        if (seg2h.length > 0) return;

        const { rows: msgRows } = await consultar(
          "select id from public.musa_messages where lead_phone = $1 and direction = 'in' and created_at > $2::timestamptz limit 1",
          [clave, desdeTimestampIso],
        );
        if (msgRows.length > 0) return;

        const horaCot = (new Date().getUTCHours() - 5 + 24) % 24;
        if (horaCot < 8 || horaCot > 21) {
          const horasHasta8 = horaCot < 8 ? 8 - horaCot : 24 - horaCot + 8;
          const retryT2h = setTimeout(() => {
            void enviarToque2h();
          }, Math.max(60_000, horasHasta8 * 3600_000));
          if (retryT2h && typeof (retryT2h as any).unref === "function") (retryT2h as any).unref();
          timers.push(retryT2h);
          return;
        }

        const texto2h = `Tu acceso a Musa Estudio por *20.000 COP* (≈ 5 USD) sigue listo. Si ya transferiste, envíame la captura por aquí para desbloquearte en 1 minuto; si estás fuera de Colombia o tuviste algún inconveniente con el pago, dime y lo resolvemos ya mismo.`;
        const env2h = await canal.enviar(clave, { texto: texto2h }).catch(() => ({ ok: false }));
        if (!env2h?.ok) return;

        await consultar(
          "insert into public.musa_messages (lead_phone, direction, body, media_type) values ($1, 'out', $2, null)",
          [clave, texto2h],
        ).catch(() => ({ rows: [] }));
        await consultar(
          "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'seguimiento_2h', $2::jsonb)",
          [clave, JSON.stringify({ ts: new Date().toISOString() })],
        ).catch(() => ({ rows: [] }));
      } catch (err) {
        console.warn("[agente-cognitivo] Error en seguimiento 2h:", String(err).slice(0, 100));
      }
    };

    const t2h = setTimeout(() => {
      void enviarToque2h();
    }, 2 * 3600_000);
    if (t2h && typeof (t2h as any).unref === "function") (t2h as any).unref();
    timers.push(t2h);
  }

  seguimientosPendientes.set(clave, timers);
}

export function programarSeguimiento60Segundos(opts: {
  consultar: Consultar;
  canal: Canal;
  phone: string;
  delayMs?: number;
}): void {
  programarSeguimientosContinuidad({
    consultar: opts.consultar,
    canal: opts.canal,
    phone: opts.phone,
    delay60sMs: opts.delayMs,
  });
}
