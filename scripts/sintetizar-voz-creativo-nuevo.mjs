// scripts/sintetizar-voz-creativo-nuevo.mjs — Síntesis de voz publicitaria HD para creativo
import fs from "node:fs";
import path from "node:path";

const apiKey = "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";

// Guion innovador, vendedor y sin clichés (cero "no soy real", precio exacto $33.000 sin COP)
const guion = `Las marcas y agencias ya no pagan miles de dólares por sesiones de fotos tradicionales. Hoy, las modelos virtuales hiperrealistas cierran contratos y facturan en Fanvue con consistencia total: piel con textura real, iluminación de estudio y movimiento natural. En el Taller Virtual de Musa aprendes a crearlas paso a paso en una sola tarde, sin saber programar, por solo treinta y tres mil pesos. Toca el botón de WhatsApp abajo y asegura tu acceso inmediato.`;

console.log("=== SINTETIZANDO VOZ EN ALTA DEFINICIÓN (OpenAI Nova tts-1-hd) ===");
console.log("Guion:", guion);

async function main() {
  fs.mkdirSync("creativos-revisar/audio", { recursive: true });
  const outPath = "creativos-revisar/audio/voz-creativo-original.mp3";

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
      speed: 1.04,
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
