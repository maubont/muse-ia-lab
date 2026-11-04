// scripts/test-enviar-audio-nova.mjs
import fs from "node:fs";

const apiKey = "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";
const evoUrl = "https://evolution-production-1418.up.railway.app";
const evoKey = "Fevpg05csHiBGJOqWlkKU1dmMQC8Z423u7bty9oALITr";
const evoInst = "musa";

async function main() {
  const text = "¡Hola! Soy Musa... Te preparé esta prueba con la voz Nova: tiene una dicción totalmente latina neutra, limpia y natural como el doblaje de las películas, sin acento gringo ni extranjero... Escúchala y me dices si sientes la diferencia.";

  console.log("1. Generando audio con OpenAI TTS (Nova, tts-1-hd, speed 0.96)...");
  const resTTS = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "tts-1-hd",
      voice: "nova",
      input: text,
      response_format: "opus",
      speed: 0.96,
    }),
  });

  if (!resTTS.ok) {
    console.error("Error TTS:", resTTS.status, await resTTS.text());
    return;
  }

  const buf = Buffer.from(await resTTS.arrayBuffer());
  const b64 = buf.toString("base64");
  console.log(`Audio generado: ${buf.length} bytes.`);

  console.log("2. Enviando nota de voz PTT a +573223565761 por Evolution API...");
  const resEvo = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${evoInst}`, {
    method: "POST",
    headers: { apikey: evoKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: "573223565761",
      audio: b64,
      options: { delay: 1200, encoding: true },
    }),
  });

  console.log("Evolution status:", resEvo.status);
  const respJson = await resEvo.json();
  console.log("Evolution response:", respJson);
}

main().catch(console.error);
