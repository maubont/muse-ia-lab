// next/scripts/test-evo.mjs — pruebas del CLI de Evolution. Sin red.
//
//   node next/scripts/test-evo.mjs

import { ejecutar, AYUDA } from "./evo.mjs";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

const ENV = {
  EVOLUTION_URL: "https://evolution.test/",
  EVOLUTION_APIKEY: "clave-secreta-que-no-debe-salir",
  EVOLUTION_INSTANCE: "musa",
};

function fake(respuesta = { status: 200, body: {} }) {
  const llamadas = [];
  const impl = async (url, init) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(respuesta.body), {
      status: respuesta.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  impl.llamadas = llamadas;
  return impl;
}

const correr = (args, f, env = ENV) => ejecutar(args, { fetchImpl: f, env });

// ---------- configuración ----------
{
  const r = await correr(["estado"], fake(), {});
  t("sin config: código 2", r.codigo, 2);
  t("sin config: nombra lo que falta", r.salida[0].includes("EVOLUTION_URL"), true);
  t("sin config: no filtra la key", r.salida.join(" ").includes("clave-secreta"), false);
}
{
  const r = await correr([], fake());
  t("sin comando: código 2", r.codigo, 2);
  const h = await correr(["--help"], fake());
  t("--help: código 0", h.codigo, 0);
  t("--help: es la ayuda", h.salida[0] === AYUDA, true);
}

// ---------- estado ----------
{
  const f = fake({ body: { instance: { instanceName: "musa", state: "open" } } });
  const r = await correr(["estado"], f);
  t("estado: código 0", r.codigo, 0);
  t("estado: salida", r.salida[0], "musa: open");
  t("estado: URL", f.llamadas[0].url, "https://evolution.test/instance/connectionState/musa");
  t("estado: método", f.llamadas[0].init.method, "GET");
  t("estado: manda apikey", f.llamadas[0].init.headers.apikey, ENV.EVOLUTION_APIKEY);
  t("estado: base sin doble barra", f.llamadas[0].url.includes("test//"), false);
}

// ---------- instancias ----------
{
  const f = fake({ body: [{ name: "musa", connectionStatus: "open" }, { name: "sportbot", connectionStatus: "close" }] });
  const r = await correr(["instancias"], f);
  t("instancias: dos filas", r.salida.length, 2);
  t("instancias: primera", r.salida[0].trim().startsWith("musa"), true);
  t("instancias: estado visible", r.salida[1].includes("close"), true);
}
{
  const f = fake({ body: [] });
  const r = await correr(["instancias"], f);
  t("instancias vacías", r.salida[0], "(ninguna instancia creada)");
}

// ---------- webhook ----------
{
  const f = fake({ body: { url: "https://musa.test/webhook/evolution", events: ["MESSAGES_UPSERT"], headers: { jwt_key: "x" } } });
  const r = await correr(["webhook-ver"], f);
  t("webhook-ver: URL", f.llamadas[0].url, "https://evolution.test/webhook/find/musa");
  t("webhook-ver: muestra la url", r.salida[0].includes("https://musa.test"), true);
  t("webhook-ver: detecta firma", r.salida[2].includes("configurado"), true);
  t("webhook-ver: no imprime el jwt_key", r.salida.join(" ").includes("jwt_key:  x"), false);
}

{
  const f = fake({ body: { ok: true } });
  const r = await correr(["webhook-set", "--url", "https://musa.test/webhook/evolution", "--jwt", "secreto-firma"], f);
  t("webhook-set: código 0", r.codigo, 0);
  t("webhook-set: URL", f.llamadas[0].url, "https://evolution.test/webhook/set/musa");
  const cuerpo = JSON.parse(f.llamadas[0].init.body);
  t("webhook-set: forma verificada", Object.keys(cuerpo), ["webhook"]);
  t("webhook-set: enabled", cuerpo.webhook.enabled, true);
  t("webhook-set: evento", cuerpo.webhook.events, ["MESSAGES_UPSERT"]);
  t("webhook-set: jwt en headers", cuerpo.webhook.headers.jwt_key, "secreto-firma");
  t("webhook-set: base64 desactivado", cuerpo.webhook.base64, false);
}

{
  const f = fake({ body: {} });
  const r = await correr(["webhook-set", "--url", "https://musa.test/w"], f);
  t("webhook-set sin firma: avisa", r.salida[0].includes("SIN firma"), true);
}

// ---------- enviar ----------
{
  const f = fake({ body: { key: { id: "ABC123" } } });
  const r = await correr(["enviar", "+57 300 111 2233", "hola", "mundo"], f);
  t("enviar: código 0", r.codigo, 0);
  t("enviar: id en la salida", r.salida[0].includes("ABC123"), true);
  t("enviar: URL", f.llamadas[0].url, "https://evolution.test/message/sendText/musa");
  const cuerpo = JSON.parse(f.llamadas[0].init.body);
  t("enviar: número sin formato", cuerpo.number, "573001112233");
  t("enviar: texto unido", cuerpo.text, "hola mundo");
}
{
  const r = await correr(["enviar"], fake());
  t("enviar sin argumentos: uso", r.codigo, 2);
}

// ---------- errores ----------
{
  const f = fake({ status: 401, body: { error: "unauthorized" } });
  const r = await correr(["estado"], f);
  t("HTTP 401: código 1", r.codigo, 1);
  t("HTTP 401: reporta el status", r.salida[0].includes("401"), true);
  t("HTTP 401: no filtra la key", r.salida.join(" ").includes(ENV.EVOLUTION_APIKEY), false);
}
{
  const f = async () => { throw new Error("ECONNREFUSED"); };
  const r = await correr(["estado"], f);
  t("red caída: código 1", r.codigo, 1);
  t("red caída: explica", r.salida[0].includes("No se pudo conectar"), true);
}

// ---------- la key nunca sale ----------
{
  const salidas = [];
  for (const args of [["estado"], ["instancias"], ["qr"], ["webhook-ver"], ["enviar", "3001112233", "x"], ["--help"]]) {
    const r = await correr(args, fake({ body: { instance: { state: "open" } } }));
    salidas.push(r.salida.join("\n"));
  }
  t("ninguna salida contiene la API key", salidas.join("\n").includes(ENV.EVOLUTION_APIKEY), false);
}

console.log(`evo cli: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
