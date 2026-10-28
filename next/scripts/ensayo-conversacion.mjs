// next/scripts/ensayo-conversacion.mjs — una conversación COMPLETA contra el
// sistema desplegado, turno por turno.
//
//   $env:MUSA_URL="https://server-production-xxxx.up.railway.app"
//   $env:EVOLUTION_WEBHOOK_SECRET="<secreto>"
//   node next/scripts/ensayo-conversacion.mjs
//
// Manda los mensajes como los mandaría un lead real, firmados, y va mostrando el
// avance. NO envía WhatsApps: la instancia no está vinculada, así que los envíos
// fallan limpio y quedan registrados como `envio_fallido`.
//
// Es el ensayo más cercano a la realidad que se puede hacer sin número.

const url = (process.env.MUSA_URL ?? "").replace(/\/+$/, "");
const secreto = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
const cabecera = process.env.EVOLUTION_WEBHOOK_HEADER ?? "x-evolution-secret";
if (!url || !secreto) {
  console.error("faltan MUSA_URL y EVOLUTION_WEBHOOK_SECRET");
  process.exit(2);
}

const TELEFONO = (process.env.MUSA_TEL ?? "573001112233").replace(/\D/g, "");
const NOMBRE = process.env.MUSA_NOMBRE ?? "Ensayo";

let turno = 0;
async function decir(texto) {
  turno++;
  const id = `CONV-${Date.now()}-${turno}`;
  const cuerpo = JSON.stringify({
    event: "messages.upsert",
    instance: "musa",
    data: {
      key: { id, remoteJid: `${TELEFONO}@s.whatsapp.net`, fromMe: false },
      pushName: NOMBRE,
      message: { conversation: texto },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
    date_time: new Date().toISOString(),
  });

  const r = await fetch(`${url}/webhook/evolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [cabecera]: secreto },
    body: cuerpo,
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json().catch(() => ({}));
  console.log(`  ${String(turno).padStart(2)}. «${texto}» → HTTP ${r.status} · procesados ${j.procesados ?? "?"}`);
  // Pequeña pausa para que el turno anterior termine de escribir en la base.
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`conversación contra ${url} · lead ${TELEFONO}\n`);

// El guion sigue el funnel real: saludo → gate 18+ → cierre → datos de pago.
await decir("hola, vi el anuncio");
await decir("si tengo 25");
await decir("dale, quiero empezar");

console.log("\nListo. Revisa en la base:");
console.log("  · musa_leads.estado_funnel  (debe haber avanzado)");
console.log("  · musa_recordatorios        (debe haber filas si llegó a S07/S08)");
console.log("  · musa_funnel_events        (respuesta_enviada con los ms)");
