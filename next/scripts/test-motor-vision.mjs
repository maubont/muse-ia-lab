// Integración del camino completo SIN proveedor real: el motor recibe una
// imagen en S08, llama al lector (inyectado), y decide. Lo que se prueba es el
// cableado, no el modelo.
import { readFileSync } from "node:fs";
import { crearMotorReal } from "../src/motor/motor-real.ts";

let ok = 0, fallas = 0;
function t(e, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${e}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8")).data.tables.musa_settings.rows;
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));

const LEAD = {
  phone: "+573009998877", profile_name: "Ana", nombre: null, pais: null,
  estado_funnel: "S08_ESPERA_CAPTURA", mayor_18: true, opt_out: false,
  escalado_humano: false, pagado: false, last_in_at: null,
};
const DATOS = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: new Date().toISOString().slice(0, 10),
  hora: "10:00", numero_referencia: "M-777", destino: "3223565761", numeros_detectados: [],
  nombre_destinatario: null, banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.99, destino: 0.99, fecha: 0.99 },
};

function entorno(lector) {
  const consultas = [], envios = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    consultas.push({ q, params });
    if (q.startsWith("select key, value from public.musa_settings")) return { rows: filas };
    if (q.startsWith("insert into public.musa_leads")) return { rows: [{ ...LEAD }] };
    if (q.startsWith("update public.musa_leads set pagado = true")) return { rows: [{ phone: LEAD.phone }] };
    if (q.startsWith("insert into public.musa_accesos")) return { rows: [{ token: "TOK", expira_en: "2027" }] };
    return { rows: [] };
  };
  const canal = {
    id: "evolution",
    async enviar(tel, m) { envios.push(m.texto); return { ok: true, id_externo: "x" }; },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  };
  const motor = crearMotorReal({ consultar, canal, esperar: async () => {}, urlPublica: "https://musa.test", lector });
  return { motor, consultas, envios };
}

const mensaje = { media: { tipo: "imagen", mime: "image/jpeg", url: "https://x/c.jpg" } };

// 1. Lectura buena -> decisión de pago
{
  const { motor, consultas, envios } = entorno(async () => ({ ok: true, datos: DATOS, origen: "proveedor", coste: 0.0003 }));
  await motor.procesar({ canal: "evolution", id_externo: "M1", telefono: LEAD.phone, nombre_perfil: "Ana", texto: "", media: mensaje.media, atribucion: { ctwa_clid: null, source_id: null }, enviado_en: Date.now() });
  t("lee el comprobante", consultas.some((c) => c.q.includes("musa_leads") && c.params?.includes("S10_ENTREGA")), true);
  t("entrega el curso", envios.some((x) => x.includes("/a/TOK")), true);
  t("registra el pago", consultas.some((c) => c.q.includes("musa_payments")), true);
}

// 2. El lector pide reenvío -> no molesta al operador
{
  const { motor, envios, consultas } = entorno(async () => ({ ok: false, accion: "pedir_reenvio", motivo: "tipo_no_soportado", coste: 0 }));
  await motor.procesar({ canal: "evolution", id_externo: "M2", telefono: LEAD.phone, nombre_perfil: "Ana", texto: "", media: { ...mensaje.media, mime: "application/pdf" }, atribucion: { ctwa_clid: null, source_id: null }, enviado_en: Date.now() });
  t("pide reenvío", envios.some((x) => x.includes("comprobante")), true);
  t("NO entrega", envios.some((x) => x.includes("/a/")), false);
  t("lo registra", consultas.some((c) => c.params?.[1] === "comprobante_no_leible"), true);
}

// 3. Sin proveedor -> cola humana con acuse
{
  const { motor, envios, consultas } = entorno(async () => ({ ok: false, accion: "cola_humana", motivo: "sin_proveedor_ia", coste: 0 }));
  await motor.procesar({ canal: "evolution", id_externo: "M3", telefono: LEAD.phone, nombre_perfil: "Ana", texto: "", media: mensaje.media, atribucion: { ctwa_clid: null, source_id: null }, enviado_en: Date.now() });
  t("acusa recibo", envios.some((x) => /verific|revis|pago/i.test(x)), true);
  t("NO entrega", envios.some((x) => x.includes("/a/")), false);
  t("marca revisión", consultas.some((c) => c.q.includes("musa_payments") && c.params?.includes("revision")), true);
}

// 4. Sin lector configurado -> también a humano, nunca a ciegas
{
  const { motor, envios } = entorno(undefined);
  await motor.procesar({ canal: "evolution", id_externo: "M4", telefono: LEAD.phone, nombre_perfil: "Ana", texto: "", media: mensaje.media, atribucion: { ctwa_clid: null, source_id: null }, enviado_en: Date.now() });
  t("sin lector: no entrega", envios.some((x) => x.includes("/a/")), false);
}

console.log(`motor con visión: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
