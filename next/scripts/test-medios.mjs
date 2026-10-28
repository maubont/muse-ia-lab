// next/scripts/test-medios.mjs — almacén de contenido y ruta protegida.
//
//   node --experimental-strip-types next/scripts/test-medios.mjs
//
// La prueba que más importa: que una clave con `..` no pueda leer nada fuera del
// almacén. Es la diferencia entre servir un curso y servir el servidor entero.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claveSegura, crearAlmacenLocal, esEnlaceDeMedio, rutaDeMedio, enlaceDeMedio,
} from "../src/acceso/medios.ts";
import { crearServidor } from "../src/api/servidor.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

// ============================== claves peligrosas ==============================
{
  const ataques = [
    "../secreto.txt",
    "../../etc/passwd",
    "bonos/../../secreto.txt",
    "bonos/..",
    "..\\windows\\win.ini",
    "a//b",
    "a\0b",
    "",
  ];
  for (const a of ataques) {
    t(`clave rechazada: ${JSON.stringify(a)}`, claveSegura(a), null);
  }
}

{
  t("clave normal", claveSegura("bonos/plan.pdf"), "bonos/plan.pdf");
  t("clave con subcarpetas", claveSegura("curso/modulo-1/video.mp4"), "curso/modulo-1/video.mp4");
  t("clave con espacios", claveSegura("bonos/plan de accion.pdf"), "bonos/plan de accion.pdf");
  t("barra inicial: se limpia", claveSegura("/bonos/plan.pdf"), "bonos/plan.pdf");
  // `/etc/passwd` no es un ataque: al quitar la barra queda relativo al almacén.
  t("ruta absoluta: se vuelve relativa", claveSegura("/etc/passwd"), "etc/passwd");
  t("con dos puntos (unidad C:): rechazada", claveSegura("C:/Windows/win.ini"), null);
}

// ============================== almacén local ==============================
const raiz = mkdtempSync(join(tmpdir(), "musa-medios-"));
try {
  mkdirSync(join(raiz, "bonos"), { recursive: true });
  writeFileSync(join(raiz, "bonos", "plan.pdf"), "contenido-de-prueba");
  writeFileSync(join(tmpdir(), "fuera-del-almacen.txt"), "SECRETO");

  const almacen = crearAlmacenLocal(raiz);

  {
    const m = await almacen.resolver("bonos/plan.pdf");
    t("resolver: encuentra el archivo", m !== null, true);
    t("resolver: tamaño", m.tamano, "contenido-de-prueba".length);
    t("resolver: tipo por extensión", m.tipo, "application/pdf");
    t("resolver: nombre", m.nombre, "plan.pdf");
  }

  {
    t("resolver: archivo inexistente", await almacen.resolver("bonos/no-existe.pdf"), null);
    t("resolver: traversal bloqueado", await almacen.resolver("../fuera-del-almacen.txt"), null);
    t("resolver: absoluto bloqueado", await almacen.resolver("/etc/passwd"), null);
  }

  {
    t("existe: sí", await almacen.existe("bonos/plan.pdf"), true);
    t("existe: no", await almacen.existe("bonos/otro.pdf"), false);
    t("existe: traversal", await almacen.existe("../fuera-del-almacen.txt"), false);
  }

  {
    const origen = join(tmpdir(), "origen-prueba.txt");
    writeFileSync(origen, "nuevo");
    const clave = await almacen.guardar("curso/nuevo.txt", origen);
    t("guardar: devuelve la clave", clave, "curso/nuevo.txt");
    t("guardar: queda servible", (await almacen.resolver("curso/nuevo.txt")).tamano, 5);
  }

  {
    let lanzo = false;
    try { await almacen.guardar("../malo.txt", join(tmpdir(), "origen-prueba.txt")); } catch { lanzo = true; }
    t("guardar: rechaza traversal", lanzo, true);
  }
} finally {
  rmSync(raiz, { recursive: true, force: true });
}

// ============================== enlaces internos ==============================
{
  t("esEnlaceDeMedio: sí", esEnlaceDeMedio("media:bonos/plan.pdf"), true);
  t("esEnlaceDeMedio: http no", esEnlaceDeMedio("https://drive.google.com/x"), false);
  t("esEnlaceDeMedio: nulo no", esEnlaceDeMedio(null), false);
  t("rutaDeMedio", rutaDeMedio("media:bonos/plan.pdf"), "bonos/plan.pdf");
  t("rutaDeMedio: barra inicial", rutaDeMedio("media:/bonos/plan.pdf"), "bonos/plan.pdf");
  t("enlaceDeMedio", enlaceDeMedio("bonos/plan de accion.pdf", "TOK"), "/media/TOK/bonos/plan%20de%20accion.pdf");
}

// ============================== ruta /media ==============================
{
  const raiz2 = mkdtempSync(join(tmpdir(), "musa-media-ruta-"));
  try {
    mkdirSync(join(raiz2, "bonos"), { recursive: true });
    writeFileSync(join(raiz2, "bonos", "plan.pdf"), "0123456789");

    const almacen = crearAlmacenLocal(raiz2);
    const canal = {
      id: "evolution",
      async verificar() { return { valido: true, motivo: "ok" }; },
      async parsear() { return []; },
      async enviar() { return { ok: true }; },
      async marcarEscribiendo() {},
    };
    const motor = { async procesar() { return []; } };
    const acceso = {
      validar: async (tk) => (tk === "TOK" ? { ok: true, phone: "+5730" } : { ok: false, motivo: "no_existe" }),
      pagina: async () => "<h1>curso</h1>",
      sinAcceso: () => "<h1>no</h1>",
    };

    const srv = crearServidor({ canal, motor, acceso, medios: { resolver: (c) => almacen.resolver(c) } });
    const puerto = await srv.escuchar(0);
    const base = `http://127.0.0.1:${puerto}`;

    const bien = await fetch(`${base}/media/TOK/bonos/plan.pdf`);
    t("media con token: 200", bien.status, 200);
    t("media con token: tipo", bien.headers.get("content-type"), "application/pdf");
    t("media con token: contenido", await bien.text(), "0123456789");
    t("media: acepta rangos", bien.headers.get("accept-ranges"), "bytes");
    t("media: no se cachea en proxies", (bien.headers.get("cache-control") ?? "").includes("private"), true);

    const malToken = await fetch(`${base}/media/MALO/bonos/plan.pdf`);
    t("media con token inválido: 403", malToken.status, 403);

    const noExiste = await fetch(`${base}/media/TOK/bonos/nada.pdf`);
    t("media inexistente: 404", noExiste.status, 404);

    const traversal = await fetch(`${base}/media/TOK/..%2F..%2Fetc%2Fpasswd`);
    t("media con traversal: 404", traversal.status, 404);

    const rango = await fetch(`${base}/media/TOK/bonos/plan.pdf`, { headers: { range: "bytes=3-6" } });
    t("rango: 206", rango.status, 206);
    t("rango: devuelve el trozo", await rango.text(), "3456");
    t("rango: cabecera content-range", rango.headers.get("content-range"), "bytes 3-6/10");

    const fueraDeRango = await fetch(`${base}/media/TOK/bonos/plan.pdf`, { headers: { range: "bytes=99-200" } });
    t("rango imposible: 416", fueraDeRango.status, 416);

    const head = await fetch(`${base}/media/TOK/bonos/plan.pdf`, { method: "HEAD" });
    t("HEAD: 200 sin cuerpo", head.status, 200);

    const post = await fetch(`${base}/media/TOK/bonos/plan.pdf`, { method: "POST" });
    t("POST: 405", post.status, 405);

    await srv.cerrar();
  } finally {
    rmSync(raiz2, { recursive: true, force: true });
  }
}

console.log(`medios: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
