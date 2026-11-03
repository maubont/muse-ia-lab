// next/scripts/test-acceso.mjs — tokens de acceso y página del curso.
//
//   node --experimental-strip-types next/scripts/test-acceso.mjs
//
// Lo que se protege aquí: que un token no se pueda adivinar, que caduque, que se
// pueda revocar, y que la página NO filtre enlaces a quien no tiene acceso.

import { readFileSync } from "node:fs";
import { generarToken, crearAcceso, validarToken, revocarAcceso, enlaceDeAcceso } from "../src/acceso/accesos.ts";
import { paginaCurso, paginaSinAcceso, nombreDeBono, TITULOS_MODULOS } from "../src/acceso/pagina.ts";

const escaparDePrueba = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
const ENTREGA = filas.find((f) => f.key === "entrega").value;

/** SQL falso con una tabla de accesos en memoria. */
function db() {
  const filas = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    // OJO con el orden: la variante con `returning` comparte prefijo con la otra,
    // así que se comprueba primero.
    if (q.includes("returning id")) {
      const afectadas = filas.filter((f) => f.lead_phone === params[0] && !f.revocado_en);
      for (const f of afectadas) f.revocado_en = new Date().toISOString();
      return { rows: afectadas.map((_, i) => ({ id: i + 1 })) };
    }
    if (q.startsWith("update public.musa_accesos set revocado_en = now() where lead_phone")) {
      for (const f of filas) if (f.lead_phone === params[0] && !f.revocado_en) f.revocado_en = new Date().toISOString();
      return { rows: [] };
    }
    if (q.startsWith("insert into public.musa_accesos")) {
      const dias = Number(params[2]);
      filas.push({
        token: params[1], lead_phone: params[0], revocado_en: null, visitas: 0,
        expira_en: new Date(Date.now() + dias * 86400_000).toISOString(),
      });
      return { rows: [{ token: params[1], expira_en: filas.at(-1).expira_en }] };
    }
    if (q.startsWith("select lead_phone, expira_en, revocado_en")) {
      const f = filas.find((x) => x.token === params[0]);
      return { rows: f ? [f] : [] };
    }
    if (q.startsWith("update public.musa_accesos set ultimo_acceso")) {
      const f = filas.find((x) => x.token === params[0]);
      if (f) f.visitas++;
      return { rows: [] };
    }
    return { rows: [] };
  };
  return { consultar, filas };
}

// ============================== el token ==============================
{
  const a = generarToken();
  const b = generarToken();
  t("token de 32 caracteres", a.length, 32);
  t("dos tokens son distintos", a === b, false);
  t("solo caracteres seguros para URL", /^[A-Za-z0-9_-]+$/.test(a), true);
  t("no contiene el teléfono ni la fecha", /\d{10}/.test(a), false);
}

{
  // 200 tokens: ninguno se repite.
  const vistos = new Set(Array.from({ length: 200 }, () => generarToken()));
  t("200 tokens, cero colisiones", vistos.size, 200);
}

// ============================== crear y validar ==============================
{
  const { consultar } = db();
  const { token, expira } = await crearAcceso(consultar, "+573001112233");
  t("crear: devuelve token", token.length, 32);
  t("crear: devuelve caducidad", expira.length > 10, true);

  const v = await validarToken(consultar, token);
  t("validar: ok", v.ok, true);
  t("validar: devuelve el teléfono", v.phone, "+573001112233");
}

{
  const { consultar } = db();
  const v = await validarToken(consultar, "token-inventado-de-30-caracteres!!");
  t("token inventado: no vale", v.ok, false);
  t("token inventado: motivo no_existe", v.motivo, "no_existe");
}

{
  const { consultar } = db();
  t("token vacío: no vale", (await validarToken(consultar, "")).ok, false);
  t("token corto: no vale", (await validarToken(consultar, "abc")).ok, false);
  t("token larguísimo: no vale", (await validarToken(consultar, "x".repeat(200))).ok, false);
}

// ============================== reemitir revoca el anterior ==============================
{
  const { consultar } = db();
  const primero = await crearAcceso(consultar, "+573001112233");
  const segundo = await crearAcceso(consultar, "+573001112233");

  t("reemitir: el nuevo sirve", (await validarToken(consultar, segundo.token)).ok, true);
  const viejo = await validarToken(consultar, primero.token);
  t("reemitir: el anterior deja de servir", viejo.ok, false);
  t("reemitir: motivo revocado", viejo.motivo, "revocado");
}

// ============================== caducidad ==============================
{
  const { consultar, filas: f } = db();
  const { token } = await crearAcceso(consultar, "+573001112233", -1); // caducó ayer
  const v = await validarToken(consultar, token);
  t("caducado: no vale", v.ok, false);
  t("caducado: motivo caducado", v.motivo, "caducado");
}

// ============================== revocar ==============================
{
  const { consultar } = db();
  const { token } = await crearAcceso(consultar, "+573001112233");
  const n = await revocarAcceso(consultar, "+573001112233");
  t("revocar: una fila afectada", n, 1);
  t("revocar: el token deja de servir", (await validarToken(consultar, token)).ok, false);
}

// ============================== visitas ==============================
{
  const { consultar, filas: f } = db();
  const { token } = await crearAcceso(consultar, "+573001112233");
  await validarToken(consultar, token, true);
  await validarToken(consultar, token, true);
  t("visitas: se cuentan", f.find((x) => x.token === token).visitas, 2);
}

// ============================== la página ==============================
{
  const html = paginaCurso(ENTREGA, "Carlos", { token: "TOK" });
  t("página: saluda por su nombre", html.includes("Hola, Carlos"), true);
  // Cada módulo puede tener varios archivos: se comprueban los títulos, no el marcado.
  t("página: los 13 módulos", TITULOS_MODULOS.filter((x) => html.includes(escaparDePrueba(x))).length, 13);
  // Tres bonos son un solo enlace; youtube_money_machine son 6 archivos y se agrupa.
  // audios_fempro y coleccion_modelos son un enlace; youtube_money_machine (6) y
  // megapack_master_ia (22) se agrupan.
  t("página: bonos de un enlace", (html.match(/Bono incluido/g) ?? []).length, 2);
  t("página: el bono de varios archivos se agrupa", html.includes("YouTube Money Machine") && html.includes("6 archivos"), true);
  t("página: sin PDF del reto de 7 días", html.includes("plan-accion-7-dias.pdf"), false);
  t("página: sin menciones a Leonardo", /leonardo/i.test(html), false);
  t("página: marco de titulares", TITULOS_MODULOS.length, 13);
  t("página: no se indexa", html.includes("noindex"), true);
}

{
  const html = paginaCurso(ENTREGA, null);
  t("sin nombre: no inventa saludo", html.includes("Hola 👋"), true);
}

{
  // Los enlaces del curso vienen de la configuración, no hardcodeados.
  const html = paginaCurso({ modulos: ["https://ejemplo.test/modulo-uno"] }, "Ana");
  t("config distinta: renderiza la nueva", html.includes("https://ejemplo.test/modulo-uno"), true);
  t("config distinta: solo un módulo", (html.match(/class="tarjeta"/g) ?? []).length, 1);
}

{
  const html = paginaCurso(ENTREGA, "Carlos");
  // Escapado: un nombre con HTML no puede inyectar nada.
  const malo = paginaCurso(ENTREGA, '<script>alert("x")</script>');
  t("el nombre se escapa", malo.includes("<script>alert"), false);
  t("el nombre escapa a entidad", malo.includes("&lt;script&gt;"), true);
}

{
  const html = paginaSinAcceso("revocado");
  t("sin acceso: no muestra enlaces", html.includes("Abrir módulo"), false);
  t("sin acceso: explica que fue reemplazado", html.includes("reemplazado"), true);
  t("sin acceso: no revela si el token existió", paginaSinAcceso("no_existe").includes("revocado"), false);
}

// ============================== enlace y nombres ==============================
{
  t("enlace: sin barra duplicada", enlaceDeAcceso("https://musa.test/", "abc"), "https://musa.test/a/abc");
  t("enlace: base sin barra", enlaceDeAcceso("https://musa.test", "abc"), "https://musa.test/a/abc");
  t("bono: nombre legible", nombreDeBono("coleccion_modelos"), "Colección de modelos");
  t("bono: nombre desconocido se humaniza", nombreDeBono("pack_extra_2027"), "Pack Extra 2027");
}

// El alumno debe leer nombres legibles, no la clave del almacén.
{
  const { nombreVisible } = await import("../src/acceso/pagina.ts");
  t("nombre escrito a mano", nombreVisible("media:curso/01/1.1-Empieza-aqui-Introduccion.mp4", "curso"), "Empieza aquí: introducción");
  t("sin «Copia de»", nombreVisible("media:curso/06/Copia-de-6.1-CREANDO-GRUPO-DE-TELEGRAM", "curso").includes("Copia"), false);
  t("sin guiones bajos", nombreVisible("media:curso/01/1.1-Empieza-aqui-Introduccion.mp4", "curso").includes("_"), false);
  const pagina = paginaCurso(ENTREGA, "Ana", { token: "TOK" });
  t("nombres limpios en la página", pagina.includes("Copia de 6.1"), false);
  t("y el de Telegram aparece bien", pagina.includes("Crear tu grupo de Telegram"), true);
  // Se miran solo los textos visibles: el href del enlace SÍ lleva la clave real.
  const visible = pagina.replace(/href="[^"]*"/g, "");
  t("ningún nombre con guiones de la clave", /\d\.\d-[a-zA-Z]/.test(visible), false);
}

console.log(`acceso al curso: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
