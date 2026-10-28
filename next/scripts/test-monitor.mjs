// next/scripts/test-monitor.mjs — el vigilante de la sesión de WhatsApp.
//
//   node --experimental-strip-types next/scripts/test-monitor.mjs
//
// La prueba que importa: que avise cuando hay que avisar y que NO machaque al
// operador con un mensaje cada cinco minutos.

import { decidirVigilancia } from "../src/monitor/sesion.ts";
import { crearVigilante } from "../src/monitor/vigilante.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const ABIERTA = { estado: "open" };
const CAIDA = { estado: "close" };
const CONECTANDO = { estado: "connecting" };
const hace = (ms) => 1_000_000 + ms;

// ============================== primera lectura ==============================
{
  const d = decidirVigilancia(ABIERTA, null, hace(0));
  t("arranca abierta: no alerta", d.alertar, false);
  t("arranca abierta: tipo abrio", d.tipo, "abrio");
}

{
  const d = decidirVigilancia(CAIDA, null, hace(0));
  t("arranca caída: alerta", d.alertar, true);
  t("arranca caída: dice que no salen mensajes", d.mensaje.includes("no van a salir"), true);
}

// ============================== transiciones ==============================
{
  const previo = { estado: "open", desde: hace(0), ultimoAviso: null };
  const d = decidirVigilancia(CAIDA, previo, hace(10 * 60_000));
  t("se cae: no alerta en el minuto 0 (gracia)", d.alertar, false);
  t("se cae: queda en gracia", d.tipo, "en_gracia");
}

{
  const previo = { estado: "close", desde: hace(0), ultimoAviso: null };
  const d = decidirVigilancia(CAIDA, previo, hace(5 * 60_000));
  t("caída pasada la gracia: alerta", d.alertar, true);
  t("caída: dice cuántos minutos lleva", d.mensaje.includes("5 min"), true);
}

{
  const previo = { estado: "close", desde: hace(0), ultimoAviso: hace(5 * 60_000) };
  const d = decidirVigilancia(CAIDA, previo, hace(10 * 60_000));
  t("caída reciente ya avisada: NO repite", d.alertar, false);
  t("caída reciente: tipo sigue_caida", d.tipo, "sigue_caida");
}

{
  const previo = { estado: "close", desde: hace(0), ultimoAviso: hace(0) };
  const d = decidirVigilancia(CAIDA, previo, hace(31 * 60_000));
  t("caída de 31 min: vuelve a avisar", d.alertar, true);
}

{
  const previo = { estado: "close", desde: hace(0), ultimoAviso: hace(0) };
  const d = decidirVigilancia(ABIERTA, previo, hace(60_000));
  t("se recupera: avisa", d.alertar, true);
  t("se recupera: mensaje positivo", d.mensaje.includes("volvió"), true);
  t("se recupera: estado abierto", d.estado, "open");
}

{
  const previo = { estado: "open", desde: hace(0), ultimoAviso: null };
  const d = decidirVigilancia(ABIERTA, previo, hace(60_000));
  t("sigue bien: silencio", d.alertar, false);
  t("sigue bien: tipo sigue_bien", d.tipo, "sigue_bien");
}

{
  // connecting no es open: si se queda ahí, hay que avisar.
  const previo = { estado: "connecting", desde: hace(0), ultimoAviso: null };
  const d = decidirVigilancia(CONECTANDO, previo, hace(10 * 60_000));
  t("conectando 10 min: alerta", d.alertar, true);
}

// ============================== el vigilante completo ==============================
{
  const alertas = [];
  let estado = "open";
  const v = crearVigilante({
    leerEstado: async () => ({ estado }),
    alertar: async (texto) => { alertas.push(texto); },
    repetirCadaMs: 60_000,
    graciaMs: 0,
  });

  t("v: primera pasada abierta", (await v.revisar()).alertado, false);
  estado = "close";
  t("v: detecta la caída", (await v.revisar()).alertado, true);
  t("v: una alerta enviada", alertas.length, 1);
  t("v: estado actual caído", v.estadoActual(), "close");

  estado = "open";
  t("v: detecta la recuperación", (await v.revisar()).alertado, true);
  t("v: dos alertas", alertas.length, 2);

  v.detener();
}

{
  // Si leer el estado falla (Evolution caído del todo), cuenta como caída.
  const alertas = [];
  const v = crearVigilante({
    leerEstado: async () => { throw new Error("fetch failed"); },
    alertar: async (t) => { alertas.push(t); },
    graciaMs: 0,
  });
  const r = await v.revisar();
  t("no poder leer el estado: alerta", r.alertado, true);
  t("no poder leer el estado: queda desconocido", r.estado, "desconocido");
  v.detener();
}

{
  // Si la alerta falla, el vigilante no se rompe ni entra en bucle.
  let intentos = 0;
  const v = crearVigilante({
    leerEstado: async () => ({ estado: "close" }),
    alertar: async () => { intentos++; throw new Error("webhook caído"); },
    graciaMs: 0,
  });
  const r = await v.revisar();
  t("alerta fallida: no rompe el vigilante", r.alertado, true);
  t("alerta fallida: se intentó una vez", intentos, 1);
  v.detener();
}

console.log(`monitor de sesión: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
