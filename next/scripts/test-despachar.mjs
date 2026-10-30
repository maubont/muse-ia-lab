// next/scripts/test-despachar.mjs — el cron de recordatorios contra un SQL falso.
//
//   node --experimental-strip-types next/scripts/test-despachar.mjs
//
// Lo que se busca: que NINGUNA regla de la política se pueda saltar por la puerta
// de atrás del cron. Un recordatorio que se envía a quien pidió salir cuesta el
// número.

import { despacharRecordatorios } from "../src/motor/despachar.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const bogota = (dia, hora) => new Date(Date.UTC(2026, 9, dia, hora + 5));

/** Postgres falso: devuelve el recordatorio y el lead que se le indiquen. */
function entorno({ recordatorios = [], lead, enviar, ahora = bogota(28, 10) } = {}) {
  const log = [];
  const envios = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    log.push({ q, params });
    if (q.startsWith("select id, lead_phone")) return { rows: recordatorios };
    // Reclamo atómico: se comporta como si esta pasada ganara la fila.
    if (q.startsWith("update public.musa_recordatorios set enviado_en = now()") && q.includes("returning id")) {
      return { rows: [{ id: params[0] }] };
    }
    if (q.startsWith("select phone, opt_out")) return { rows: lead ? [lead] : [] };
    return { rows: [] };
  };
  const canal = {
    id: "evolution",
    async enviar(tel, m) {
      envios.push({ tel, texto: m.texto });
      return enviar ? enviar() : { ok: true, id_externo: "x" };
    },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  };
  return { consultar, canal, log, envios, ahora };
}

const rec = (id, phone, texto = "¿Seguimos?") => ({
  id, lead_phone: phone, tipo: "pago_pendiente", motivo: texto, programado_para: bogota(28, 9).toISOString(),
});

const lead = (extra = {}) => ({
  phone: "+573001112233", opt_out: false, escalado_humano: false, pagado: false,
  estado_funnel: "S08_ESPERA_CAPTURA",
  last_in_at: bogota(28, 9).toISOString(), last_out_at: bogota(28, 9).toISOString(),
  seguimientos_enviados: 0, ...extra,
});

const correr = (e) => despacharRecordatorios({ consultar: e.consultar, canal: e.canal, ahora: () => e.ahora, esperar: async () => {} });

// ============================== camino feliz ==============================
{
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: lead() });
  const r = await correr(e);
  t("camino feliz: un enviado", r.enviados, 1);
  t("camino feliz: un vencido", r.vencidos, 1);
  t("camino feliz: se envió el texto", e.envios[0].texto, "¿Seguimos?");
  t("camino feliz: se marca enviado", e.log.some((l) => l.q.startsWith("update public.musa_recordatorios set enviado_en")), true);
  t("camino feliz: cuenta el seguimiento", e.log.some((l) => l.q.includes("seguimientos_enviados = coalesce")), true);
  t("camino feliz: deja evento", e.log.some((l) => l.params?.[1] === "recordatorio_enviado"), true);
}

// ============================== las reglas ==============================
{
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: lead({ opt_out: true }) });
  const r = await correr(e);
  t("opt_out: NO se envía", e.envios.length, 0);
  t("opt_out: se cancela", r.cancelados, 1);
  t("opt_out: queda el motivo", e.log.some((l) => l.params?.[1] === "opt_out"), true);
}

{
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: lead({ pagado: true }) });
  const r = await correr(e);
  t("ya pagó: NO se le persigue", e.envios.length, 0);
  t("ya pagó: se cancela", r.cancelados, 1);
}

{
  const viejo = lead({ last_in_at: bogota(27, 8).toISOString() }); // 26 h
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: viejo, ahora: bogota(28, 10) });
  const r = await correr(e);
  t("fuera de 24 h: NO se envía", e.envios.length, 0);
  t("fuera de 24 h: se cancela", r.cancelados, 1);
}

{
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: lead({ seguimientos_enviados: 3 }) });
  const r = await correr(e);
  t("límite de 3: NO se envía", e.envios.length, 0);
  t("límite de 3: se cancela", r.cancelados, 1);
}

{
  // De madrugada: se reprograma, no se envía ni se pierde.
  // El lead escribió ayer a las 22:00 (5 h antes): dentro de la ventana, fuera de horario.
  const nocturno = lead({ last_in_at: bogota(27, 22).toISOString(), last_out_at: bogota(27, 22).toISOString() });
  const e = entorno({ recordatorios: [rec("1", "+573001112233")], lead: nocturno, ahora: bogota(28, 3) });
  const r = await correr(e);
  t("de madrugada: NO se envía", e.envios.length, 0);
  t("de madrugada: se reprograma", r.reprogramados, 1);
  t("de madrugada: queda el motivo", e.log.some((l) => l.params?.[2] === "reprogramado_por_horario"), true);
}

{
  const e = entorno({ recordatorios: [rec("1", "+57999")], lead: null });
  const r = await correr(e);
  t("lead inexistente: se cancela", r.cancelados, 1);
  t("lead inexistente: sin envío", e.envios.length, 0);
}

{
  const e = entorno({ recordatorios: [rec("1", "+57300", "")], lead: lead() });
  const r = await correr(e);
  t("sin texto: se cancela, no se manda vacío", r.cancelados, 1);
  t("sin texto: sin envío", e.envios.length, 0);
}

// ============================== el canal falla ==============================
{
  const e = entorno({
    recordatorios: [rec("1", "+573001112233")], lead: lead(),
    enviar: () => ({ ok: false, id_externo: null, status: 500, motivo: "Connection Closed" }),
  });
  const r = await correr(e);
  t("canal caído: no cuenta como enviado", r.enviados, 0);
  t("canal caído: cuenta como fallido", r.fallidos, 1);
  t("canal caído: se reprograma, no se pierde", e.log.some((l) => l.params?.[2] === "reintento_por_fallo"), true);
  t("canal caído: deja evento", e.log.some((l) => l.params?.[1] === "recordatorio_fallido"), true);
}

// ============================== lote ==============================
{
  const muchos = Array.from({ length: 25 }, (_, i) => rec(String(i), "+573001112233"));
  const e = entorno({ recordatorios: muchos.slice(0, 20), lead: lead() });
  const r = await correr(e);
  t("lote: no arrasa la cola", r.vencidos, 20);
  t("lote: consulta con límite", e.log[0].params[0], 20);
}

console.log(`despachar: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
