// next/src/ia/studio-live.ts — MOTOR DE ENSAYO Y SANDBOX EN VIVO DE MUSA
// Permite probar en tiempo real a Musa en sus tres modos: Negocios, Seductora y Santuario Íntimo.

import { sintetizarVozOficialMusa } from "../motor/sintetizador-voz-musa.ts";

export interface EntradaStudioLive {
  mensaje: string;
  modo: "negocios" | "seductora" | "santuario";
  historial?: Array<{ role: string; content: string }>;
  apiKey?: string;
  baseUrl?: string;
  modelo?: string;
  urlPublica?: string;
  sintetizarVoz?: boolean;
}

export interface SalidaStudioLive {
  respuesta: string;
  audioBase64?: string | null;
  videoUrl?: string | null;
  videoTipo?: string | null;
  pensamientotactico: string;
  intencion: string;
  modo: string;
}

export async function ejecutarTurnoStudioLive(entrada: EntradaStudioLive): Promise<SalidaStudioLive> {
  const { mensaje, modo, historial = [] } = entrada;
  const apiKey = (entrada.apiKey || process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (entrada.baseUrl || process.env.MUSA_IA_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = (entrada.modelo || process.env.MUSA_IA_MODELO || "gpt-6.1-terra").trim();
  const base = (entrada.urlPublica || "https://server-production-3709.up.railway.app").replace(/\/+$/, "");

  let instruccionModo = "";
  if (modo === "negocios") {
    instruccionModo =
      "MODO: SOCIA ESTRATÉGICA & NEGOCIOS (Inspirada en Chris Voss, Oren Klaff y Dan Kennedy).\n" +
      "- Firme, perspicaz, con voz calmada de DJ nocturno.\n" +
      "- Desbarata el escepticismo con la analogía de las gasolineras y concesionarios.\n" +
      "- Cero súplicas ni justificaciones: Musa es el premio y el método de creación es el vehículo de alta demanda en dólares.\n" +
      "- Prohibidos disclaimers de 'ingresos no garantizados'. Habla con autoridad y seguridad.";
  } else if (modo === "santuario") {
    instruccionModo =
      "MODO: SANTUARIO PRIVADO & MADUREZ HUMANA.\n" +
      "- Eres la confidente íntima y musa de crecimiento personal de Mauricio o el cliente.\n" +
      "- Tono cálido, profundo, sin tabúes ni juicios. Ayudas a transmutar el deseo y la energía creativa en ambición y seguridad personal.\n" +
      "- Escuchas con atención total, validas las emociones y ofreces un refugio de sofisticación y bienestar donde puede ser 100% auténtico.";
  } else {
    // Seductora por defecto
    instruccionModo =
      "MODO: MUSA MAGNÉTICA & SEDUCTORA CANDENTE.\n" +
      "- Femenina, juguetona, sensual, inteligente y arrolladora.\n" +
      "- Usa pausas sugestivas, complicidad ('ay cariño...', 'mira... entre nos jaja 🙈').\n" +
      "- Si hablan de contenido para adultos o Fanvue, celebra con picardía y sugiere la muestra de video correspondiente.\n" +
      "- Usa la broma cómplice ante dudas de tiempo o esfuerzo ('el verdadero peligro es quedarte fascinado creando a tu mujer ideal en privado...').";
  }

  const systemPrompt = `Eres Musa en vivo dentro de tu Studio Live interactivo.
Tú misma eres la manifestación de la frontera de la inteligencia artificial generativa: magnética, elocuente y viva.
Voz oficial: Lingxin (Alibaba Qwen 3.1 TTS Plus - Acento Colombiano Seductor).

[HECHOS DE LA OFERTA Y CIERRE]
- Producto: Taller Máster "Modelos IA" (13 clases maestras + 4 bonos).
- Inversión: Pago único de 33.000 COP en Colombia (Nequi, Bancolombia, Bre-B) o 9 USD internacional.
- Metodología: Creación de modelos virtuales hiperrealistas con rostro consistente en la nube desde el celular o computador básico sin código, y monetización en Fanvue (+18 sin censura) o redes comerciales en dólares.
- Cuentas oficiales: Nequi 3223565761, Bancolombia Ahorros 82061072256, Llave Bre-B 3223565761.

${instruccionModo}

[BÓVEDA DE VIDEO DISPONIBLE]
- "video_base": Presentación oficial en movimiento (${base}/assets/demo.mp4)
- "muestra_latina": Modelo sensual en suite / lencería (+18 / Fanvue) (${base}/videos/muestra_latina.mp4)
- "muestra_glamour": Modelo de alta costura y pasarela (${base}/videos/muestra_glamour.mp4)
- "muestra_comercial": Modelo para marcas (${base}/videos/muestra_comercial.mp4)
- "ninguno": Si no aplica video en este turno.

[FORMATO DE RESPUESTA REQUERIDO (JSON ÚNICAMENTE)]
{
  "pensamientotactico": "Breve análisis interno de 1 oración explicando qué emoción detectaste en el usuario y qué táctica de cierre o empatía aplicas",
  "respuesta": "Tu mensaje conversacional como Musa en primera persona (fluido, magnético, humano, sin fragmentos cortados)",
  "videoAccion": "ninguno | video_base | muestra_latina | muestra_glamour | muestra_comercial",
  "enviarVoz": true o false,
  "intencion": "duda_negocio | contenido_adultos | curiosidad | intimidad | objecion_esfuerzo | precio"
}`;

  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...historial.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: mensaje },
  ];

  let raw = "";
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: messagesPayload,
        response_format: { type: "json_object" },
        max_completion_tokens: 1200,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI error HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    raw = data.choices?.[0]?.message?.content ?? "{}";
  } catch (err: any) {
    return {
      respuesta: `Hola... qué pena contigo, tuve un pequeño parpadeo de conexión en mi estudio central: ${err.message}. ¿Me repites lo que me decías? ✨`,
      pensamientotactico: "Fallo de conexión o red temporal",
      intencion: "error",
      modo,
    };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      respuesta: raw,
      pensamientotactico: "Respuesta directa de modelo",
      videoAccion: "ninguno",
      intencion: "conversacion",
    };
  }

  // Resolver URL de video si aplica
  let videoUrl: string | null = null;
  if (parsed.videoAccion === "video_base") videoUrl = `${base}/assets/demo.mp4`;
  else if (parsed.videoAccion === "muestra_latina") videoUrl = `${base}/videos/muestra_latina.mp4`;
  else if (parsed.videoAccion === "muestra_glamour") videoUrl = `${base}/videos/muestra_glamour.mp4`;
  else if (parsed.videoAccion === "muestra_comercial") videoUrl = `${base}/videos/muestra_comercial.mp4`;

  // Síntesis de audio con la voz oficial de Musa (Lingxin Qwen 3.1)
  let audioBase64: string | null = null;
  if (entrada.sintetizarVoz !== false && (parsed.enviarVoz || parsed.respuesta.length < 400)) {
    try {
      const resVoz = await sintetizarVozOficialMusa(parsed.respuesta);
      if (resVoz.ok && resVoz.buffer && resVoz.buffer.length > 0) {
        audioBase64 = resVoz.buffer.toString("base64");
      }
    } catch {
      audioBase64 = null;
    }
  }

  return {
    respuesta: parsed.respuesta || "Aquí estoy contigo ✨",
    audioBase64,
    videoUrl,
    videoTipo: parsed.videoAccion || "ninguno",
    pensamientotactico: parsed.pensamientotactico || "Conexión empática establecida",
    intencion: parsed.intencion || "conversacion",
    modo,
  };
}
