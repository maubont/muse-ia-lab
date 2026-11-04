// scripts/probar-modelo-ia.mjs — Probar modelo OpenAI configurado en el entorno
const key = process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY;
const modelo = process.env.MUSA_IA_MODELO || "gpt-4o-mini";
console.log("KEY CONFIGURADA:", !!key, "PREFIX:", key ? key.slice(0, 10) : "none");
console.log("MODELO CONFIGURADO:", modelo);

if (!key) {
  console.error("Falta API KEY");
  process.exit(1);
}

const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: modelo,
    messages: [
      { role: "system", content: "Eres Musa, asesora comercial de Modelos IA en WhatsApp. Responde de forma cálida, persuasiva y conversacional." },
      { role: "user", content: "Hola Musa, ¿realmente puedo ganar dinero con esto o es pura estafa?" }
    ],
    max_completion_tokens: 400,
    reasoning_effort: "low"
  })
});

console.log("STATUS HTTP:", r.status);
const txt = await r.text();
console.log("BODY:", txt.slice(0, 500));
