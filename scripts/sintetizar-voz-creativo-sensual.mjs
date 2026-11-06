// scripts/sintetizar-voz-creativo-sensual.mjs — Síntesis limpia con voz Nova HD sin cortes al final
import fs from "node:fs";

const apiKey = "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";

const guion = `El mercado de las modelos virtuales para Fanvue y contenido exclusivo está facturando miles de dólares cada mes. El verdadero secreto no son las muñecas de plástico de siempre, sino la consistencia fotográfica: piel real con poros, miradas magnéticas y presencia auténtica. En nuestro taller virtual intensivo de Musa aprendes todo el método en una sola tarde, sin programar, por solo treinta y tres mil pesos. Escríbenos al WhatsApp y empieza hoy.`;

console.log("=== SINTETIZANDO VOZ SENSUAL COMERCIAL LIMPIA (Nova tts-1-hd) ===");
console.log("Guion:", guion);

async function main() {
  fs.mkdirSync("creativos-revisar/audio", { recursive: true });
  const outPath = "creativos-revisar/audio/voz-creativo-sensual.mp3";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      voice: "nova",
      input: guion,
      response_format: "mp3",
      speed: 1.05,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error en OpenAI TTS: ${res.status} ${err}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`✓ Audio generado exitosamente en ${outPath} (${buf.length} bytes)`);
}

main().catch(err => {
  console.error("Fallo:", err);
  process.exit(1);
});
