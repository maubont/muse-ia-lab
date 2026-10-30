// next/scripts/test-enlace-acceso.mjs — el enlace que recibe el cliente tiene que abrir
// sin que haga nada más. Aquí se cubren los casos que lo rompían: mayúsculas, basura
// pegada al copiar, y navegadores de chat que no guardan cookies.

import { crearServidor } from "../src/api/servidor.ts";
import { limpiarToken } from "../src/acceso/accesos.ts";
import { paginaSinAcceso } from "../src/acceso/pagina.ts";

let ok = 0;
let fallas = 0;
const t = (etiqueta, real, esperado) => {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
};

const BUENO = "JbdQgJ8zMaPitI9HYN3YzqUkhQWjLzTK";

// ---------- 1. limpieza del token ----------
t("limpia un punto final", limpiarToken(`${BUENO}.`), BUENO);
t("limpia un paréntesis", limpiarToken(`(${BUENO})`), BUENO);
t("limpia espacios y saltos", limpiarToken(`  ${BUENO}\n`), BUENO);
t("limpia una coma pegada", limpiarToken(`${BUENO},`), BUENO);
t("no toca un token limpio", limpiarToken(BUENO), BUENO);
t("token vacío queda vacío", limpiarToken("   "), "");

// ---------- 2. la pantalla de error, caso por caso ----------
{
  const noExiste = paginaSinAcceso("no_existe");
  t("error: dice que no es válido", noExiste.includes("no es válido"), true);
  t("error: no manda a un WhatsApp sin número", noExiste.includes("wa.me"), false);
  t("error: ofrece salida escrita", noExiste.includes("Escríbenos al WhatsApp"), true);

  const revocado = paginaSinAcceso("revocado");
  t("revocado: mensaje propio", revocado.includes("fue reemplazado"), true);

  const vencido = paginaSinAcceso("vencido");
  t("vencido: explica que caducó", vencido.includes("caducó"), true);

  const sinCookie = paginaSinAcceso("sin_cookie");
  t("sin cookie: pide abrir el enlace completo", sinCookie.includes("enlace completo"), true);

  const conBoton = paginaSinAcceso("no_existe", "https://wa.me/57300");
  t("con soporte: pinta el botón", conBoton.includes("Pedir un enlace nuevo"), true);
  t("con soporte: usa el enlace", conBoton.includes("wa.me/57300"), true);
}

// ---------- 3. el enrutado, con un acceso de mentira ----------
const accesoFalso = {
  async validar(token) {
    const limpio = limpiarToken(token);
    if (limpio.toLowerCase() === BUENO.toLowerCase()) return { ok: true, phone: "+57300" };
    return { ok: false, motivo: limpio ? "no_existe" : "sin_cookie" };
  },
  async pagina() { return "<html><body>curso</body></html>"; },
  sinAcceso: (m) => paginaSinAcceso(m, undefined),
};

const srv = crearServidor({
  canal: {
    id: "evolution",
    async enviar() { return { ok: true }; },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  },
  motor: { async procesar() { return []; } },
  acceso: accesoFalso,
});
const puerto = await srv.escuchar(0);
const base = `http://127.0.0.1:${puerto}`;
const pedir = (ruta, ini = {}) => fetch(base + ruta, { redirect: "manual", ...ini });

{
  const r = await pedir(`/a/${BUENO}`);
  t("enlace bueno: 302 a /curso", r.status, 302);
  t("enlace bueno: destino correcto", r.headers.get("location"), "/curso");
  const c = r.headers.get("set-cookie") ?? "";
  t("cookie: HttpOnly", c.includes("HttpOnly"), true);
  t("cookie: SameSite=Lax (abre desde WhatsApp)", c.includes("SameSite=Lax"), true);
  t("cookie: Secure cuando hay https", c.includes("Secure"), true);
}

for (const [nombre, ruta] of [
  ["minúsculas", `/a/${BUENO.toLowerCase()}`],
  ["punto final", `/a/${BUENO}.`],
  ["paréntesis", `/a/(${BUENO})`],
]) {
  t(`${nombre}: entra igual`, (await pedir(ruta)).status, 302);
}

{
  const r = await pedir(`/curso?t=${BUENO}`);
  t("sin cookie pero con ?t=: entra", r.status, 200);
  t("y repone la cookie", (r.headers.get("set-cookie") ?? "").includes("musa_acceso"), true);
}

{
  const r = await pedir("/curso");
  t("sin cookie ni parámetro: 403", r.status, 403);
  t("explica que falta el enlace completo", (await r.text()).includes("enlace completo"), true);
}

{
  const r = await pedir("/a/AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH");
  t("token inventado: 403", r.status, 403);
  t("y dice que no es válido", (await r.text()).includes("no es válido"), true);
}

await srv.cerrar();
console.log(`enlace de acceso: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
