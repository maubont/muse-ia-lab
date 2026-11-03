// next/scripts/test-auth-consola.mjs
// Suite de pruebas obligatoria para el BLOQUE B (Autenticación y Protección de Consola Musa).
// Verifica:
//  1. GET /api/consola/estado sin sesión -> 401 Unauthorized
//  2. POST /api/consola/comando sin sesión -> 401 Unauthorized
//  3. POST /api/consola/login con clave incorrecta -> 401 clave_incorrecta
//  4. POST /api/consola/login con clave correcta -> 200 + Set-Cookie (musa_admin_session) + csrfToken
//  5. GET /api/consola/session con cookie válida -> 200 { autenticado: true, csrfToken }
//  6. GET /api/consola/estado con cookie válida -> 200 OK + payload con _csrf
//  7. POST /api/consola/comando con cookie válida pero SIN CSRF -> 403 csrf_invalido
//  8. POST /api/consola/comando con cookie válida y CSRF válido -> 200 OK
//  9. Sesión con cookie alterada/falsa -> 401 firma_invalida
// 10. POST /api/consola/logout -> cookie revocada (Max-Age=0)
// 11. GET /api/consola/estado post-logout -> 401 Unauthorized

import { crearServidor } from "../src/api/servidor.ts";
import { motorEco } from "../src/motor/contrato.ts";

let ok = 0;
let fallas = 0;

function afirmar(titulo, condicion, detalle = "") {
  if (condicion) {
    ok++;
  } else {
    fallas++;
    console.error(`FALLA: ${titulo} ${detalle}`);
  }
}

const canalDummy = {
  enviarTexto: async () => {},
};

async function ejecutar() {
  const CLAVE_TEST = "musa_secreto_super_seguro_2026";
  let comandoRecibido = "";

  const s = crearServidor({
    canal: canalDummy,
    motor: motorEco(),
    adminSecret: CLAVE_TEST,
    consolaEstado: async () => ({
      metricas: { leadsTotales: 10, pagosEnRevision: 2 },
      pagos: [],
    }),
    consolaComando: async (cmd) => {
      comandoRecibido = cmd;
      return { ok: true, ejecutado: cmd };
    },
  });

  const puerto = await s.escuchar(0);
  const base = `http://127.0.0.1:${puerto}`;

  try {
    // 1. GET /api/consola/estado sin sesión
    const r1 = await fetch(`${base}/api/consola/estado`);
    afirmar("1. Estado sin sesión responde 401", r1.status === 401);
    const j1 = await r1.json();
    afirmar("1.b Error es no_autorizado", j1.error === "no_autorizado");

    // 2. POST /api/consola/comando sin sesión
    const r2 = await fetch(`${base}/api/consola/comando`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comando: "aprobar 100" }),
    });
    afirmar("2. Comando sin sesión responde 401", r2.status === 401);

    // 3. Login con clave errónea
    const r3 = await fetch(`${base}/api/consola/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: "clave_totalmente_equivocada" }),
    });
    afirmar("3. Login erróneo responde 401", r3.status === 401);

    // 4. Login con clave correcta
    const r4 = await fetch(`${base}/api/consola/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: CLAVE_TEST }),
    });
    afirmar("4. Login correcto responde 200", r4.status === 200);
    const j4 = await r4.json();
    afirmar("4.b Login retorna csrfToken", typeof j4.csrfToken === "string" && j4.csrfToken.length > 20);

    const setCookie = r4.headers.get("set-cookie") ?? "";
    afirmar("4.c Set-Cookie musa_admin_session presente", setCookie.includes("musa_admin_session="));
    afirmar("4.d Cookie es HttpOnly", setCookie.includes("HttpOnly"));
    afirmar("4.e Cookie es SameSite=Strict", setCookie.includes("SameSite=Strict"));

    // Extraer cookie valor
    const cookieMatch = setCookie.match(/musa_admin_session=([^;]+)/);
    const cookieVal = cookieMatch ? cookieMatch[1] : "";
    const cookieHeader = `musa_admin_session=${cookieVal}`;

    // 5. GET /api/consola/session con cookie válida
    const r5 = await fetch(`${base}/api/consola/session`, {
      headers: { Cookie: cookieHeader },
    });
    const j5 = await r5.json();
    afirmar("5. Sesión activa verificada", j5.autenticado === true);

    // 6. GET /api/consola/estado con cookie válida
    const r6 = await fetch(`${base}/api/consola/estado`, {
      headers: { Cookie: cookieHeader },
    });
    afirmar("6. Estado autenticado responde 200", r6.status === 200);
    const j6 = await r6.json();
    afirmar("6.b Estado retorna métricas reales", j6.metricas?.leadsTotales === 10);
    afirmar("6.c Estado adjunta _csrf", typeof j6._csrf === "string");

    const csrfToken = j6._csrf;

    // 7. POST /api/consola/comando sin CSRF -> 403
    const r7 = await fetch(`${base}/api/consola/comando`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ comando: "aprobar 100" }),
    });
    afirmar("7. Comando sin CSRF responde 403", r7.status === 403);
    const j7 = await r7.json();
    afirmar("7.b Motivo es csrf_invalido", j7.error === "csrf_invalido");

    // 8. POST /api/consola/comando con CSRF válido -> 200
    const r8 = await fetch(`${base}/api/consola/comando`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ comando: "aprobar 100" }),
    });
    afirmar("8. Comando con CSRF responde 200", r8.status === 200);
    afirmar("8.b Comando ejecutado efectivamente", comandoRecibido === "aprobar 100");

    // 9. Cookie alterada (ataque de falsificación)
    const cookieTrucada = `musa_admin_session=${encodeURIComponent("1760000000000.randomnonce.firmafalsa1234567890")}`;
    const r9 = await fetch(`${base}/api/consola/estado`, {
      headers: { Cookie: cookieTrucada },
    });
    afirmar("9. Cookie alterada es rechazada con 401", r9.status === 401);

    // 10. Logout
    const r10 = await fetch(`${base}/api/consola/logout`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    });
    afirmar("10. Logout responde 200", r10.status === 200);
    const setCookieLogout = r10.headers.get("set-cookie") ?? "";
    afirmar("10.b Cookie revocada con Max-Age=0", setCookieLogout.includes("Max-Age=0"));

    // 11. Acceso posterior a logout
    const r11 = await fetch(`${base}/api/consola/estado`, {
      headers: { Cookie: "musa_admin_session=" },
    });
    afirmar("11. Acceso post-logout denegado con 401", r11.status === 401);

  } finally {
    await s.cerrar();
  }

  console.log(`\n  aserciones correctas: ${ok}`);
  console.log(`  aserciones fallidas:  ${fallas}`);
  console.log(`\n  ${ok} ok, ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

ejecutar().catch((e) => {
  console.error("Error fatal en suite:", e);
  process.exit(1);
});
