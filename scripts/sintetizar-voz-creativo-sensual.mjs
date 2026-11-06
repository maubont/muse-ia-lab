// scripts/sintetizar-voz-creativo-sensual.mjs — Voz HD con ángulo sensual/Fanvue +18 para video publicitario
import fs from "node:fs";

const apiKey = "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";

const guion = `El mercado de las modelos virtuales para Fanvue y contenido exclusivo está facturando miles de dólares cada mes. Y el verdadero secreto no son los filtros plásticos ni las muñecas de siempre: es la consistencia fotográfica real. Piel con textura, miradas magnéticas y video en movimiento que conecta de verdad. En nuestro taller virtual intensivo de Musa aprendes todo el método paso a paso en una sola tarde, sin saber programar, por solo treinta y tres mil pesos. Escríbenos al WhatsApp tocando el botón y empieza hoy mismo.`;

console.log("=== SINTETIZANDO VOZ SENSUAL COMERCIAL (Nova tts-1-hd) ===");
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
