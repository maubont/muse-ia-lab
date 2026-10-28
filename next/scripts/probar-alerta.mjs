// next/scripts/probar-alerta.mjs — manda una alerta de prueba y dice si llegó.
//
//   $env:MUSA_ALERTA_WEBHOOK="https://api.telegram.org/bot<TOKEN>/sendMessage"
//   $env:MUSA_ALERTA_CHAT_ID="123456789"
//   node next/scripts/probar-alerta.mjs
//
// Nunca imprime el token ni el chat_id completos: solo el formato detectado y la
// respuesta del servicio. Útil para comprobar la configuración ANTES de que haga
// falta de verdad.

import { detectarFormato, prepararAlerta, revisarConfigAlerta } from "../src/monitor/alertas.ts";

const url = (process.env.MUSA_ALERTA_WEBHOOK ?? "").trim();
const chatId = (process.env.MUSA_ALERTA_CHAT_ID ?? "").trim();

/** Oculta el secreto de una URL para poder imprimirla. */
function ocultar(u) {
  return u.replace(/bot[^/]+/i, "bot<OCULTO>").replace(/(webhooks\/\d+\/)[\w-]+/i, "$1<OCULTO>");
}

const revision = revisarConfigAlerta(url || undefined, chatId || undefined);
if (!revision.ok) {
  console.error(`  ✗ ${revision.motivo}`);
  console.error("\n  Configura las variables y vuelve a intentarlo:");
  console.error('    MUSA_ALERTA_WEBHOOK="https://api.telegram.org/bot<TOKEN>/sendMessage"');
  console.error('    MUSA_ALERTA_CHAT_ID="123456789"');
  process.exit(2);
}

const formato = detectarFormato(url);
const texto = "✅ Prueba de alertas de Musa. Si estás leyendo esto, el monitor de sesión puede avisarte cuando WhatsApp se caiga.";

console.log(`  servicio: ${formato}`);
console.log(`  destino:  ${ocultar(url)}`);
if (chatId) console.log(`  chat_id:  …${chatId.slice(-4)}`);

const { cuerpo } = prepararAlerta(url, texto, chatId || undefined);

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  const respuesta = await res.text().catch(() => "");

  if (res.ok) {
    console.log(`\n  ✓ HTTP ${res.status} — alerta enviada. Revisa Telegram.`);
    process.exit(0);
  }

  console.error(`\n  ✗ HTTP ${res.status} — el servicio la rechazó.`);
  // Los errores de Telegram son explícitos; se muestran recortados.
  console.error(`    ${respuesta.slice(0, 300)}`);
  if (respuesta.includes("chat not found")) {
    console.error("\n  El chat_id no es válido: escríbele primero al bot (/start) y vuelve a mirar getUpdates.");
  }
  if (respuesta.includes("Unauthorized")) {
    console.error("\n  El token no es válido: cópialo completo desde @BotFather.");
  }
  process.exit(1);
} catch (e) {
  console.error(`\n  ✗ no se pudo conectar: ${e.cause?.code ?? e.name}`);
  process.exit(1);
}
