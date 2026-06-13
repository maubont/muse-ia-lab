// Genera el audio base del avatar (~8 s) con OpenAI TTS y lo guarda en avatar/base-audio.mp3
import { writeFileSync } from "node:fs";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("FALTA OPENAI_API_KEY en el entorno");
  process.exit(1);
}

const body = {
  model: "gpt-4o-mini-tts",
  voice: "coral",
  input:
    "¡Hola! Soy una modelo creada cien por ciento con inteligencia artificial. Y esto mismo es lo que tú vas a aprender a crear, paso a paso. Te leo en el chat.",
  instructions:
    "Mujer venezolana joven, cálida y entusiasta, acento latino neutro, ritmo natural de nota de voz de WhatsApp",
  response_format: "mp3",
};

const res = await fetch("https://api.openai.com/v1/audio/speech", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error("TTS fallo:", res.status, await res.text());
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(new URL("./base-audio.mp3", import.meta.url), buf);
console.log("OK base-audio.mp3 bytes=" + buf.length);
