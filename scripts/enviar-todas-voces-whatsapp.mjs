// scripts/enviar-todas-voces-whatsapp.mjs
// Envía una nota de voz PTT por cada una de las 9 voces de OpenAI a WhatsApp en orden secuencial.

const apiKey = "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";
const evoUrl = "https://evolution-production-1418.up.railway.app";
const evoKey = "Fevpg05csHiBGJOqWlkKU1dmMQC8Z423u7bty9oALITr";
const evoInst = "musa";
const telefonoDestino = "573223565761";

const VOCES = [
  // --- Femeninas / Principales para Musa ---
  { id: "nova", nombre: "Nova", desc: "Femenina · Doblaje Latino Neutro" },
  { id: "coral", nombre: "Coral", desc: "Femenina · Cálida e Íntima" },
  { id: "shimmer", nombre: "Shimmer", desc: "Femenina · Suave y Melódica" },
  { id: "sage", nombre: "Sage", desc: "Femenina · Sobria y Pausada" },
  { id: "alloy", nombre: "Alloy", desc: "Neutra · Equilibrada y Directa" },
  // --- Masculinas / Complementarias ---
  { id: "ash", nombre: "Ash", desc: "Masculina · Casual y Fresca" },
  { id: "echo", nombre: "Echo", desc: "Masculina · Suave y Empática" },
  { id: "fable", nombre: "Fable", desc: "Masculina · Narrativa y Expresiva" },
  { id: "onyx", nombre: "Onyx", desc: "Masculina · Profunda y Firme" },
];

function generarGuion(v) {
  return `Hola Mauricio, soy la voz ${v.nombre}. Te hablo desde Muse IA Lab para que escuches mi acento, mi ritmo y mi pronunciación en español... Con nuestro taller aprendes a crear y monetizar modelos virtuales hiperrealistas por treinta y tres mil pesos. Escúchame y me cuentas qué tal te parezco.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarVoz(v, idx, total) {
  const guion = generarGuion(v);
  console.log(`\n[${idx + 1}/${total}] Sintetizando voz ${v.nombre} (${v.id})...`);

  const resTTS = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "tts-1-hd",
      voice: v.id,
      input: guion,
      response_format: "opus",
      speed: 0.98,
    }),
  });

  if (!resTTS.ok) {
    console.error(`❌ Error TTS para ${v.nombre}:`, resTTS.status, await resTTS.text());
    return false;
  }

  const buf = Buffer.from(await resTTS.arrayBuffer());
  const b64 = buf.toString("base64");
  console.log(`   Audio generado (${buf.length} bytes). Enviando a WhatsApp...`);

  const resEvo = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${evoInst}`, {
    method: "POST",
    headers: { apikey: evoKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: telefonoDestino,
      audio: b64,
      options: { delay: 1000, encoding: true },
    }),
  });

  if (resEvo.ok) {
    const j = await resEvo.json().catch(() => ({}));
    console.log(`   ✓ Entregado a WhatsApp (${v.nombre}) ID: ${j?.key?.id ?? "ok"}`);
    return true;
  } else {
    console.error(`❌ Error Evolution para ${v.nombre}:`, resEvo.status, await resEvo.text());
    return false;
  }
}

async function main() {
  console.log(`=== ENVIANDO TODAS LAS VOCES A WHATSAPP (${telefonoDestino}) ===`);
  console.log(`Total de voces a despachar: ${VOCES.length}\n`);

  for (let i = 0; i < VOCES.length; i++) {
    const v = VOCES[i];
    await enviarVoz(v, i, VOCES.length);
    // Esperar 2 segundos entre envíos para asegurar orden cronológico en WhatsApp
    if (i < VOCES.length - 1) {
      await sleep(2200);
    }
  }

  console.log("\n=======================================================");
  console.log("TODAS LAS NOTAS DE VOZ HAN SIDO ENVIADAS CON ÉXITO A WHATSAPP");
  console.log("=======================================================");
}

main().catch(console.error);
