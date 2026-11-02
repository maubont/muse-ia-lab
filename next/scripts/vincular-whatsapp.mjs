// next/scripts/vincular-whatsapp.mjs — Visor en vivo para vincular WhatsApp a prueba de errores.
//
//   node next/scripts/vincular-whatsapp.mjs
//
// 1. Lee las credenciales de Railway desde next/deploy/.env
// 2. Levanta un servidor web local en http://localhost:3333
// 3. Abre automáticamente el navegador del usuario
// 4. Consulta el QR fresco de Evolution API cada 10 segundos
// 5. Detecta en tiempo real cuando el teléfono escanea y la sesión pasa a "open"
// 6. Confirma la conexión y permite hacer una prueba de eco inmediata

import http from "node:http";
import fs from "node:fs";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

// Cargar variables de deploy
const env = {};
const envPath = join(RAIZ, "next/deploy/.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const EVOLUTION_URL = (env.EVOLUTION_URL ?? process.env.EVOLUTION_URL ?? "").replace(/\/+$/, "");
const EVOLUTION_APIKEY = env.EVOLUTION_APIKEY ?? process.env.EVOLUTION_APIKEY ?? "";
const INSTANCIA = env.EVOLUTION_INSTANCE ?? process.env.EVOLUTION_INSTANCE ?? "musa";

if (!EVOLUTION_URL || !EVOLUTION_APIKEY) {
  console.error("❌ Falta EVOLUTION_URL o EVOLUTION_APIKEY en next/deploy/.env");
  process.exit(1);
}

const PUERTO = 3333;

async function pedirEvolution(ruta) {
  try {
    const res = await fetch(`${EVOLUTION_URL}${ruta}`, {
      headers: { apikey: EVOLUTION_APIKEY, "Content-Type": "application/json" },
    });
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
      return { ok: res.ok, status: res.status, raw: text };
    }
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

const HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Vincular WhatsApp — Musa IA Lab</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090d;
      color: #f3f3f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #13131b;
      border: 1px solid #232332;
      border-radius: 20px;
      padding: 32px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .logo {
      font-size: 24px;
      font-weight: 700;
      color: #c4b5fd;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #9494a8;
      margin-bottom: 24px;
    }
    .qr-box {
      background: #ffffff;
      border-radius: 16px;
      padding: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 280px;
      min-height: 280px;
      margin-bottom: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      position: relative;
    }
    .qr-box img {
      width: 250px;
      height: 250px;
      display: block;
      object-fit: contain;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: 999px;
      background: #1c1c28;
      color: #c4b5fd;
      margin-bottom: 16px;
      font-weight: 500;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f59e0b;
      animation: pulse 1.5s infinite;
    }
    .dot.green {
      background: #10b981;
      animation: none;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .steps {
      text-align: left;
      font-size: 13px;
      color: #a1a1b5;
      background: #181824;
      border-radius: 12px;
      padding: 16px;
      line-height: 1.6;
    }
    .steps ol { padding-left: 20px; }
    .steps li { margin-bottom: 6px; }
    .connected-card {
      display: none;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 16px;
      padding: 24px;
      margin-top: 12px;
    }
    .connected-card h3 {
      color: #10b981;
      font-size: 18px;
      margin-bottom: 8px;
    }
    .connected-card p {
      font-size: 14px;
      color: #d1fae5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <span>Musa IA Lab</span>
    </div>
    <div class="subtitle">Vinculación de WhatsApp (+57 322 746 2629)</div>

    <div class="status-badge" id="badge">
      <span class="dot" id="dot"></span>
      <span id="badge-text">Generando código QR...</span>
    </div>

    <div class="qr-box" id="qr-container">
      <img id="qr-img" src="" alt="Código QR de WhatsApp" style="display:none;" />
      <div id="qr-loader" style="color: #4b5563; font-size: 14px;">Conectando con Evolution...</div>
    </div>

    <div class="connected-card" id="success-box">
      <h3>🎉 ¡WhatsApp Vinculado con Éxito!</h3>
      <p id="owner-text">La sesión está activa en Railway. Musa ya puede recibir y enviar mensajes.</p>
    </div>

    <div class="steps" id="steps-box">
      <ol>
        <li>Abre WhatsApp en el teléfono <strong>+57 322 746 2629</strong>.</li>
        <li>Toca los tres puntos (⋮) o Ajustes &gt; <strong>Dispositivos vinculados</strong>.</li>
        <li>Toca <strong>Vincular un dispositivo</strong> y apunta la cámara a este código QR.</li>
      </ol>
    </div>
  </div>

  <script>
    let yaConectado = false;

    async function chequearEstado() {
      if (yaConectado) return;
      try {
        const res = await fetch("/api/estado");
        const json = await res.json();
        const estado = json.state || json.instance?.state || "close";

        if (estado === "open") {
          yaConectado = true;
          document.getElementById("badge").style.background = "rgba(16, 185, 129, 0.15)";
          document.getElementById("badge").style.color = "#10b981";
          document.getElementById("dot").className = "dot green";
          document.getElementById("badge-text").textContent = "Conexión Activa (open)";
          document.getElementById("qr-container").style.display = "none";
          document.getElementById("steps-box").style.display = "none";
          document.getElementById("success-box").style.display = "block";
          return;
        } else if (estado === "connecting") {
          document.getElementById("badge-text").textContent = "Conectando con WhatsApp...";
        } else {
          document.getElementById("badge-text").textContent = "Esperando escaneo de QR...";
        }
      } catch (err) {
        console.error("Error consultando estado:", err);
      }
    }

    async function refrescarQR() {
      if (yaConectado) return;
      try {
        const res = await fetch("/api/qr");
        const json = await res.json();

        if (json.base64) {
          const img = document.getElementById("qr-img");
          img.src = json.base64.startsWith("data:") ? json.base64 : ("data:image/png;base64," + json.base64);
          img.style.display = "block";
          document.getElementById("qr-loader").style.display = "none";
        }
      } catch (err) {
        console.error("Error al refrescar QR:", err);
      }
    }

    // Intervalo de polling del QR (cada 12 segundos para renovar antes de expirar)
    refrescarQR();
    chequearEstado();

    setInterval(chequearEstado, 3000);
    setInterval(refrescarQR, 12000);
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(HTML);
  }

  if (url.pathname === "/api/qr") {
    const r = await pedirEvolution(`/instance/connect/${INSTANCIA}?number=573227462629`);
    res.writeHead(r.ok ? 200 : 500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r.data ?? { error: r.error ?? r.raw }));
  }

  if (url.pathname === "/api/estado") {
    const r = await pedirEvolution(`/instance/connectionState/${INSTANCIA}`);
    res.writeHead(r.ok ? 200 : 500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r.data ?? { error: r.error ?? r.raw }));
  }

  res.writeHead(404);
  res.end();
});

server.listen(PUERTO, () => {
  console.log(`\n============================================================`);
  console.log(`🚀 Visor de Vinculación de WhatsApp activo en:`);
  console.log(`   http://localhost:${PUERTO}`);
  console.log(`============================================================`);
  console.log(`\nAbriendo tu navegador para mostrar el código QR...`);
  console.log(`Apunta con WhatsApp (+57 322 746 2629) > Dispositivos vinculados.`);
  console.log(`Presiona Ctrl+C en esta terminal para detener el visor cuando esté listo.\n`);

  exec(`start http://localhost:${PUERTO}`, (err) => {
    if (err) {
      console.log(`(Abre manualmente en tu navegador: http://localhost:${PUERTO})`);
    }
  });
});
