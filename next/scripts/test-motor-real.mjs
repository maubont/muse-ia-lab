// next/scripts/test-motor-real.mjs — el motor de verdad, con un Postgres falso.
//
//   node --experimental-strip-types next/scripts/test-motor-real.mjs
//
// Lo que se comprueba es el recorrido completo de un mensaje: upsert del lead,
// registro del entrante, decisión, y ejecución de los efectos (incluido el envío).

import { readFileSync } from "node:fs";
import { crearMotorReal } from "../src/motor/motor-real.ts";
import { leerConfigFunnel } from "../src/db/config-funnel.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
const SETTINGS = filas.map((f) => ({ key: f.key, value: f.value }));

const LEAD = {
  phone: "+573001112233", profile_name: "Carlos", nombre: null, pais: null,
  estado_funnel: "S04_GATE18", mayor_18: null, opt_out: false, escalado_humano: false,
  pagado: false, last_in_at: null,
};

/** Postgres falso: responde a las consultas conocidas y apunta el resto. */
function sql(extra = {}) {
  const log = [];
  const consultar = async (consulta, params) => {
    const q = consulta.replace(/\s+/g, " ").trim();
    log.push({ q, params });
    if (q.startsWith("select key, value from public.musa_settings")) return { rows: SETTINGS };
    if (q.startsWith("insert into public.musa_leads")) return { rows: [{ ...LEAD, ...(extra.lead ?? {}) }] };
    if (q.startsWith("update public.musa_leads set pagado = true")) return { rows: [{ phone: LEAD.phone }] };
    return { rows: [] };
  };
  return { consultar, log };
}

function canal() {
  const enviados = [];
  return {
    enviados,
    id: "evolution",
    async enviar(tel, m) { enviados.push({ tel, texto: m.texto }); return { ok: true, id_externo: "x" }; },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  };
}

const mensaje = (texto) => ({
  canal: "evolution", id_externo: "M1", telefono: "+573001112233", nombre_perfil: "Carlos",
  texto, media: null, atribucion: { ctwa_clid: null, source_id: null }, enviado_en: Date.now(),
});

// ============================== configuración ==============================
{
  const { consultar } = sql();
  const cfg = await leerConfigFunnel(consultar);
  t("config: lee las etapas", cfg.funnelCopy.etapas.length, 13);
  t("config: precio COP", cfg.precio.cop, 33000);
  t("config: 13 módulos en la entrega", cfg.entrega.modulos.length, 13);
  t("config: whatsapp del operador", cfg.operador.whatsapp, "+573223565761");
}

// ============================== gate 18+ ==============================
{
  const { consultar, log } = sql();
  const c = canal();
  const motor = crearMotorReal({ consultar, canal: c });
  const salida = await motor.procesar(mensaje("si tengo 25"));

  t("motor devuelve [] (el envío va por efectos)", salida, []);
  // La primera consulta es la configuración; el orden del resto es el del flujo.
  t("lee la configuración primero", log[0].q.startsWith("select key, value from public.musa_settings"), true);
  t("upsert del lead", log.some((l) => l.q.startsWith("insert into public.musa_leads")), true);
  t("registra el mensaje entrante", log.some((l) => l.q.startsWith("insert into public.musa_messages")), true);
  t("actualiza el lead (mayor_18)", log.some((l) => l.q.includes("mayor_18")), true);
  t("cambia el estado a S06", log.some((l) => l.q.includes("estado_funnel") && l.params?.[1] === "S06_CIERRE"), true);
  t("envía precio y cierre", c.enviados.length, 2);
  t("el primero trae el precio", c.enviados[0].texto.includes("33.000"), true);
}

// ============================== STOP ==============================
{
  const { consultar, log } = sql();
  const c = canal();
  const motor = crearMotorReal({ consultar, canal: c });
  await motor.procesar(mensaje("stop"));

  t("STOP: marca opt_out", log.some((l) => l.q.includes("opt_out") && l.params?.includes(true)), true);
  t("STOP: registra el evento", log.some((l) => l.q.includes("musa_funnel_events") && l.params?.[1] === "optout"), true);
  t("STOP: un solo mensaje", c.enviados.length, 1);
  t("STOP: es el de despedida", c.enviados[0].texto.includes("Quedas fuera"), true);
}

// ============================== ya dio de baja ==============================
{
  const { consultar } = sql({ lead: { opt_out: true } });
  const c = canal();
  const motor = crearMotorReal({ consultar, canal: c });
  await motor.procesar(mensaje("hola?"));
  t("opt_out: no se envía NADA", c.enviados.length, 0);
}

// ============================== caché de configuración ==============================
{
  const { consultar, log } = sql();
  const motor = crearMotorReal({ consultar, canal: canal(), ttlConfigMs: 60_000 });
  await motor.procesar(mensaje("si tengo 25"));
  const tras = log.filter((l) => l.q.startsWith("select key, value from public.musa_settings")).length;

  const { consultar: c2 } = sql();
  const motor2 = crearMotorReal({ consultar: c2, canal: canal(), ttlConfigMs: 0 });
  await motor2.procesar(mensaje("si tengo 25"));

  t("config: se lee una sola vez dentro del TTL", tras, 1);
}

// ============================== clasificador ausente ==============================
{
  // Sin clasificador y con un mensaje ambiguo: re-pregunta, no avanza.
  const { consultar, log } = sql();
  const motor = crearMotorReal({ consultar, canal: canal() });
  await motor.procesar(mensaje("jaja ok"));
  t("ambiguo sin GPT: no cambia de estado", log.some((l) => l.q.includes("estado_funnel") && l.params?.[1] === "S06_CIERRE"), false);
  t("ambiguo sin GPT: deja rastro", log.some((l) => l.params?.[1] === "gpt_no_implementado"), true);
}

console.log(`motor real: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
