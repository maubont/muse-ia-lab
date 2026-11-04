// scripts/simular-chat-musa.mjs — Simulación de conversación interactiva con Musa en Producción
// Conecta con la consola y el webhook de Railway, envía turnos y extrae las respuestas generadas.

const MUSA_URL = "https://server-production-3709.up.railway.app";
const WEBHOOK_SECRET = "b8d55f70e0bb1a2cd743cfae042f982a1cdc4385974872a483b41ae43d086e6c";
const ADMIN_SECRET = "musa_admin_sec_2026";

async function loginConsola() {
  const r = await fetch(`${MUSA_URL}/api/consola/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clave: ADMIN_SECRET })
  });
  if (!r.ok) throw new Error(`Error login consola: ${r.status}`);
  const cookieHeader = r.headers.get("set-cookie") || "";
  const cookie = cookieHeader.split(";")[0];
  const data = await r.json();
  return { cookie, csrfToken: data.csrfToken };
}

async function comandoConsola(cmd, cookie, csrfToken) {
  const r = await fetch(`${MUSA_URL}/api/consola/comando`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie,
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify({ comando: cmd })
  });
  return r.json();
}

async function enviarMensajeWebhook(tel, texto, pushName = "Simulador Lead") {
  const msgId = `SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const payload = {
    event: "messages.upsert",
    instance: "musa",
    data: {
      key: { id: msgId, remoteJid: `${tel.replace(/\D/g, "")}@s.whatsapp.net`, fromMe: false },
      pushName,
      message: { conversation: texto },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
    date_time: new Date().toISOString(),
  };

  const start = Date.now();
  const res = await fetch(`${MUSA_URL}/webhook/evolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-evolution-secret": WEBHOOK_SECRET
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const duracionMs = Date.now() - start;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, duracionMs, json };
}

async function ejecutarSimulacion() {
  console.log("=================================================");
  console.log("   SIMULACIÓN EN VIVO CON MUSA EN PRODUCCIÓN");
  console.log("=================================================\n");

  console.log("1. Autenticando con Consola Musa...");
  const { cookie, csrfToken } = await loginConsola();
  console.log("   Autenticación exitosa.\n");

  const SIM_TEL = "+573009990011";

  // Reiniciar estado previo del lead de prueba
  console.log(`2. Reiniciando lead de prueba ${SIM_TEL}...`);
  const resetRes = await comandoConsola(`reiniciar ${SIM_TEL}`, cookie, csrfToken);
  console.log(`   ${resetRes.respuesta}\n`);

  // Definir 4 turnos conversacionales realistas
  const turnos = [
    {
      titulo: "TURNO 1: Llegada desde la landing con confirmación tácita (+18)",
      texto: "Hola Musa, vengo de la página web (+18). Quiero saber cómo funciona el curso."
    },
    {
      titulo: "TURNO 2: Objeción de plataforma / querer ver el aula antes de pagar",
      texto: "Muéstrame la plataforma primero antes de pagar, quiero ver dónde voy a estudiar."
    },
    {
      titulo: "TURNO 3: Objeción técnica / hardware (computador vs celular)",
      texto: "¿Necesito un computador potente con tarjeta de video o puedo hacerlo todo desde el celular?"
    },
    {
      titulo: "TURNO 4: Decisión de compra y solicitud de medios de pago",
      texto: "¡Listo de una! Me convence totalmente. ¿Cómo pago por Nequi?"
    }
  ];

  for (let i = 0; i < turnos.length; i++) {
    const t = turnos[i];
    console.log(`-------------------------------------------------`);
    console.log(`[${i + 1}/4] ${t.titulo}`);
    console.log(`👤 Usuario: "${t.texto}"`);

    const envio = await enviarMensajeWebhook(SIM_TEL, t.texto);
    console.log(`   (Webhook procesado en ${envio.duracionMs}ms - HTTP ${envio.status})`);

    // Esperar 1.5s para que el ciclo de base de datos y ritmo asíncrono asiente
    await new Promise((r) => setTimeout(r, 1500));

    // Consultar historial registrado
    const hist = await comandoConsola(`ver ${SIM_TEL}`, cookie, csrfToken);
    console.log(`\n💬 Respuestas de Musa:\n`);
    console.log(hist.respuesta);
    console.log("\n");
  }

  console.log("=================================================");
  console.log("   SIMULACIÓN COMPLETADA CON ÉXITO");
  console.log("=================================================");
}

ejecutarSimulacion().catch(err => {
  console.error("Falla en la simulación:", err);
  process.exit(1);
});
