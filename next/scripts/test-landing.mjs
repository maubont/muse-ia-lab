// next/scripts/test-landing.mjs — la landing servida desde el mismo servidor.
//
// Se levanta el servidor REAL y se piden las rutas por HTTP. Incluye dos intentos de
// salir de la carpeta con `..`, que deben devolver 404: sin esa comprobación, un
// `GET /../.env` leería los secretos del contenedor.

import { arrancar } from "../src/main.ts";

let ok = 0;
let fallas = 0;
const t = (etiqueta, real, esperado) => {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
};

const s = await arrancar({ puerto: 0, vigilar: false });
const base = `http://127.0.0.1:${s.puerto}`;
const pedir = (ruta) => fetch(base + ruta, { redirect: "manual" });

// --- páginas ---
for (const [ruta, nombre] of [
  ["/", "portada"],
  ["/terminos.html", "términos"],
  ["/privacidad.html", "privacidad"],
  ["/reembolsos.html", "reembolsos"],
]) {
  const r = await pedir(ruta);
  t(`${nombre}: 200`, r.status, 200);
  t(`${nombre}: es HTML`, (r.headers.get("content-type") ?? "").includes("text/html"), true);
  const cuerpo = await r.text();
  t(`${nombre}: no expone el sistema de archivos`, cuerpo.includes("ENOENT"), false);
}

// --- contenido real, no una página en blanco ---
{
  const r = await pedir("/");
  const html = await r.text();
  t("portada: tiene el titular", html.includes("modelos virtuales"), true);
  t("portada: tiene el precio", html.includes("$9 USD"), true);
  t("portada: tiene el meta viewport", html.includes('name="viewport"'), true);
  t("portada: sin número falso", html.includes("XXXXXXXXXX"), false);
}

// --- activos ---
for (const [ruta, tipo] of [
  ["/assets/demo.jpg", "image/jpeg"],
  ["/assets/demo.mp4", "video/mp4"],
]) {
  const r = await pedir(ruta);
  t(`${ruta}: 200`, r.status, 200);
  t(`${ruta}: tipo ${tipo}`, (r.headers.get("content-type") ?? "").includes(tipo), true);
}

// --- seguridad: no se sale de la carpeta ---
for (const ruta of ["/../package.json", "/..%2f..%2fpackage.json", "/../../.env", "/assets/../../next/src/main.ts"]) {
  const r = await pedir(ruta);
  t(`traversal ${ruta}: 404`, r.status === 404 || r.status === 400, true);
}
{
  const r = await pedir("/../package.json");
  const cuerpo = await r.text();
  t("traversal: no filtra el package.json", cuerpo.includes('"name"'), false);
}

// --- lo que NO debe servirse ---
for (const ruta of ["/main.ts", "/api/servidor.ts", "/.env"]) {
  const r = await pedir(ruta);
  t(`no se sirve ${ruta}`, r.status, 404);
}

// --- las rutas del sistema siguen intactas ---
{
  const r = await pedir("/salud");
  t("salud: 200", r.status, 200);
  t("salud: es JSON", (r.headers.get("content-type") ?? "").includes("application/json"), true);
}

// --- apagable por entorno ---
{
  const s2 = await arrancar({ puerto: 0, vigilar: false, landingHabilitada: false });
  const r = await fetch(`http://127.0.0.1:${s2.puerto}/`, { redirect: "manual" });
  t("apagada: la portada da 404", r.status, 404);
  await s2.cerrar();
}

await s.cerrar();
console.log(`landing: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
