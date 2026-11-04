// scripts/probar-voces.mjs — Generador y reproductor de prueba para las voces femeninas de OpenAI TTS.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpetaSalida = path.join(__dirname, "..", "voces_musa");

if (!fs.existsSync(carpetaSalida)) {
  fs.mkdirSync(carpetaSalida, { recursive: true });
}

const apiKey = (process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY || "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").trim();

const TEXTO_MUSA = `¡Hola! Soy Musa, de Muse IA Lab. Te cuento que con nuestro taller aprendes desde cero a crear tu propia modelo virtual hiperrealista y monetizarla en redes o plataformas de suscripción como Fanvue, sin tener que mostrar tu rostro ni tu cuerpo real. Todo lo manejas desde tu celular o computador básico. Puedes entrar ya mismo a ver la clase uno gratis. ¿Te gustaría ver cómo funciona por dentro?`;

const VOCES = [
  {
    id: "coral",
    nombre: "Coral",
    estilo: "Cálida, relajada, empática y conversacional",
    nota: "La más cercana al perfil 'Sol' de ChatGPT: suena muy humana, relajada y cercana.",
  },
  {
    id: "nova",
    nombre: "Nova",
    estilo: "Enérgica, alegre, juvenil y dinámica",
    nota: "Voz activa con mucha chispa comercial y ritmo ágil.",
  },
  {
    id: "shimmer",
    nombre: "Shimmer",
    estilo: "Clara, melódica, expresiva y refinada",
    nota: "Tono limpio y suave con modulación muy cuidada.",
  },
  {
    id: "sage",
    nombre: "Sage",
    estilo: "Serena, sobria, sofisticada y pausada",
    nota: "Ideal para un tono más consultivo, elegante y maduro.",
  },
  {
    id: "alloy",
    nombre: "Alloy",
    estilo: "Neutra, directa, equilibrada y moderna",
    nota: "Tono balanceado, directo y sin artificios.",
  },
];

console.log("=== GENERANDO MUESTRAS DE AUDIO PARA LAS VOCES FEMENINAS DE OPENAI ===");
console.log(`Texto a sintetizar (${TEXTO_MUSA.length} caracteres):\n"${TEXTO_MUSA}"\n`);

async function generar() {
  for (const v of VOCES) {
    const rutaArchivo = path.join(carpetaSalida, `${v.id}.mp3`);
    console.log(`Generando voz: ${v.nombre} (${v.id})...`);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        voice: v.id,
        input: TEXTO_MUSA,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      console.error(`❌ Error generando ${v.nombre}:`, res.status, await res.text());
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(rutaArchivo, buffer);
    console.log(`✓ Guardado: ${rutaArchivo} (${Math.round(buffer.length / 1024)} KB)`);
  }

  // Generar página HTML interactiva
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Casting de Voces Musa IA</title>
  <style>
    :root {
      --bg: #0b0c10;
      --card: #15171e;
      --border: #262a36;
      --accent: #c8a97e;
      --text: #f0f2f5;
      --subtext: #8e95a5;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header {
      max-width: 720px;
      text-align: center;
      margin-bottom: 30px;
    }
    h1 {
      color: var(--accent);
      margin-bottom: 8px;
      font-size: 28px;
    }
    p.sub {
      color: var(--subtext);
      font-size: 15px;
      margin-top: 0;
      line-height: 1.5;
    }
    .sample-box {
      background: rgba(200, 169, 126, 0.08);
      border: 1px solid rgba(200, 169, 126, 0.25);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 25px;
      font-size: 14px;
      line-height: 1.6;
      color: #e2e8f0;
      font-style: italic;
      max-width: 720px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      width: 100%;
      max-width: 720px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .voice-title {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .badge {
      background: rgba(200, 169, 126, 0.15);
      color: var(--accent);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .style-text {
      font-size: 14px;
      color: #cbd5e1;
      font-weight: 500;
    }
    .note-text {
      font-size: 13px;
      color: var(--subtext);
      line-height: 1.4;
    }
    audio {
      width: 100%;
      margin-top: 4px;
      filter: invert(0.9) hue-rotate(180deg);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Casting de Voces para Musa IA</h1>
    <p class="sub">Escucha cada una de las voces femeninas de OpenAI TTS (modelo de alta definición <code>tts-1-hd</code>) con el guión real de presentación comercial de Musa.</p>
  </div>

  <div class="sample-box">
    <strong>Guión de prueba sintetizado:</strong><br>
    "${TEXTO_MUSA}"
  </div>

  <div class="grid">
    ${VOCES.map(
      (v) => `
    <div class="card">
      <div class="card-top">
        <div class="voice-title">${v.nombre}</div>
        <div class="badge">${v.id}</div>
      </div>
      <div class="style-text">✨ ${v.estilo}</div>
      <div class="note-text">💡 ${v.note ?? v.nota}</div>
      <audio controls preload="auto">
        <source src="${v.id}.mp3" type="audio/mpeg">
        Tu navegador no soporta el elemento de audio.
      </audio>
    </div>`
    ).join("\n")}
  </div>
</body>
</html>`;

  const rutaHtml = path.join(carpetaSalida, "escuchar_voces.html");
  fs.writeFileSync(rutaHtml, html, "utf-8");
  console.log(`\n🎉 ¡Listo! Muestras generadas en:\n📁 ${carpetaSalida}`);
  console.log(`🌐 Abre este archivo en tu navegador para escucharlas todas con un clic:\n${rutaHtml}`);
}

generar().catch(console.error);
