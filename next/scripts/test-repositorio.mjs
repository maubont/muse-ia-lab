// next/scripts/test-repositorio.mjs — el repositorio contra un SQL falso.
//
//   node --experimental-strip-types next/scripts/test-repositorio.mjs
//
// Lo importante no es que "genere SQL", sino que distinga bien las dos
// restricciones únicas: confundirlas rompería el dedupe de comprobantes
// (referencia) o la cola humana (short_id).

import { crearRepositorio, montarFilaPago, COLUMNAS_LEAD } from "../src/db/repositorio.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

function entorno(opciones = {}) {
  const consultas = [];
  const envios = [];
  const consultar = async (sql, params) => {
    consultas.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    if (opciones.responder) return opciones.responder(sql, params);
    return { rows: [] };
  };
  const canal = { id: "evolution", async enviar(tel, m) { envios.push([tel, m.texto]); return { ok: true, id_externo: "x" }; }, async verificar() { return { valido: true, motivo: "ok" }; }, async parsear() { return []; }, async marcarEscribiendo() {} };
  const repo = crearRepositorio({ consultar, canal, telefonoOperador: opciones.operador ?? "+573000000000" });
  return { repo, consultas, envios };
}

const DATOS = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: "2026-10-27", hora: "10:00",
  numero_referencia: "M-123.456", destino: "3223565761", numeros_detectados: [],
  nombre_destinatario: null, banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [], confidence: { monto: 1, referencia: 1, destino: 1, fecha: 1 },
};

// ============================== lista blanca ==============================
{
  const { repo, consultas } = entorno();
  await repo.actualizarLead("+5730", { mayor_18: true, nombre: "Carlos", campo_inventado: "x", "evil; drop": 1 });
  t("solo escribe columnas permitidas", consultas[0].params.slice(1), [true, "Carlos"]);
  t("no aparece la columna inventada", consultas[0].sql.includes("campo_inventado"), false);
  t("no aparece la inyección", consultas[0].sql.includes("evil"), false);
}
{
  const { repo, consultas } = entorno();
  await repo.actualizarLead("+5730", { campo_inventado: 1 });
  t("sin columnas válidas: no ejecuta nada", consultas.length, 0);
}

// ============================== entrega atómica ==============================
{
  const { repo, consultas } = entorno({ responder: () => ({ rows: [{ phone: "+5730" }] }) });
  const gano = await repo.reclamarEntrega("+5730");
  t("claim: gana si la fila vuelve", gano, true);
  t("claim: es un solo update condicional", /update public\.musa_leads set pagado = true.*where phone = \$1 and pagado = false returning/i.test(consultas[0].sql), true);
}
{
  const { repo } = entorno({ responder: () => ({ rows: [] }) });
  t("claim: pierde si no hay fila", await repo.reclamarEntrega("+5730"), false);
}

// ============================== las dos restricciones ==============================
{
  // Choca la referencia: es duplicado de comprobante.
  const { repo } = entorno({
    responder: () => { const e = new Error("dup"); e.code = "23505"; e.constraint = "musa_payments_ref_unica"; throw e; },
  });
  const r = await repo.registrarPago("+5730", { estado: "aprobado", motivo: null, datos: DATOS });
  t("referencia duplicada devuelve dupeRef", r, { dupeRef: true });
}
{
  // Choca el short_id: se reintenta con otro, NO es un duplicado de pago.
  let intentos = 0;
  const { repo } = entorno({
    responder: () => {
      intentos++;
      if (intentos < 3) { const e = new Error("dup"); e.code = "23505"; e.constraint = "musa_payments_short_id_key"; throw e; }
      return { rows: [{ short_id: "7777" }] };
    },
  });
  const r = await repo.registrarPago("+5730", { estado: "revision", motivo: "x", datos: DATOS });
  t("short_id repetido se reintenta", intentos, 3);
  t("short_id final", r, { shortId: "7777" });
}

// ============================== fila del pago ==============================
{
  const f = montarFilaPago("+5730", { estado: "aprobado", motivo: null, datos: DATOS });
  t("referencia solo dígitos", f.ref_normalizada, "123456");
  t("método normalizado", f.metodo, "Nequi");
  t("monto y moneda", [f.monto, f.moneda], [33000, "COP"]);
}
{
  const f = montarFilaPago("+5730", { estado: "revision", motivo: "vision_fallida", datos: null });
  t("sin datos: método por clasificar", f.metodo, "por_clasificar");
  t("sin datos: referencia nula", f.ref_normalizada, null);
  t("sin datos: conserva el motivo", f.motivo_flag, "vision_fallida");
}
{
  const f = montarFilaPago("+5730", { estado: "revision", motivo: null, datos: { ...DATOS, numero_referencia: "abc" } });
  t("referencia sin dígitos queda nula", f.ref_normalizada, null);
}

// ============================== envíos ==============================
{
  const { repo, envios } = entorno();
  await repo.enviar("+5730", ["uno", "dos"]);
  t("envía en orden", envios, [["+5730", "uno"], ["+5730", "dos"]]);
}

{
  // Si el canal rechaza el envío, tiene que quedar registrado: el motor ya
  // decidió y el cliente no recibió nada.
  const consultas = [];
  const consultar = async (sql, params) => {
    consultas.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    return { rows: [] };
  };
  const canalRoto = {
    id: "evolution",
    async enviar() { return { ok: false, id_externo: null, status: 500, motivo: "Connection Closed" }; },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  };
  const repoRoto = crearRepositorio({ consultar, canal: canalRoto, telefonoOperador: "+573000000000" });
  await repoRoto.enviar("+5730", ["hola"]);

  const fallo = consultas.find((c) => c.params?.[1] === "envio_fallido");
  t("envío fallido queda registrado", !!fallo, true);
  t("envío fallido: guarda el status", fallo?.params?.[2]?.includes("500"), true);
  t("envío fallido: guarda el motivo", fallo?.params?.[2]?.includes("Connection Closed"), true);
}
{
  const { repo, envios } = entorno();
  await repo.notificarOperador("revisar #4821");
  t("notifica al operador configurado", envios, [["+573000000000", "revisar #4821"]]);
}
{
  const { repo, envios } = entorno({ operador: "" });
  await repo.notificarOperador("revisar");
  t("sin operador: no envía a ningún sitio", envios.length, 0);
}

// ============================== GPT no implementado ==============================
{
  const { repo, consultas } = entorno();
  const r = await repo.gptResponder({ instruccion: "x", abortarSiEscala: true });
  t("GPT ausente: escala (opción segura)", r, { escalo: true });
  await repo.gptFallback("+5730");
  t("GPT ausente: queda registrado", consultas.at(-1).params[1], "gpt_no_implementado");
}

// ============================== eventos ==============================
{
  const { repo, consultas } = entorno();
  await repo.registrarEvento("+5730", "prueba", { a: 1 });
  t("evento: json serializado", consultas[0].params[2], '{"a":1}');
  t("columnas del lead son 16", COLUMNAS_LEAD.size, 16);
}

console.log(`repositorio: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
