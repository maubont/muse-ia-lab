// next/scripts/test-vision.mjs — las cuatro defensas de la lectura de comprobantes.
//
//   node --experimental-strip-types next/scripts/test-vision.mjs
//
// El invariante que se prueba en TODAS las ramas: si algo falla —sin imagen, sin
// proveedor, sin presupuesto, JSON roto, timeout— el resultado es SIEMPRE uno de
// los dos caminos seguros (pedir reenvío o cola humana). Nunca una aprobación.

import { prefiltrar, TAMANO_MAXIMO_BYTES } from "../src/vision/prefiltro.ts";
import { costeEstimado, consultarPresupuesto } from "../src/vision/presupuesto.ts";
import { validarDatos, extraerJson, configDesdeEntorno, leerConProveedor } from "../src/vision/proveedor.ts";
import { leerComprobante, huellaDe, costeReservado } from "../src/vision/lector.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const IMAGEN = { url: "https://x/comprobante.jpg", tipo: "image/jpeg", tamano: 200_000 };
const PROVEEDOR = {
  baseUrl: "https://api.test/v1", apiKey: "k", modelo: "mini",
  precioEntrada: 0.15, precioSalida: 0.6, maxTokensSalida: 400,
};
const DATOS_OK = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: "2026-10-28", hora: "10:00",
  numero_referencia: "M-1", destino: "3223565761", numeros_detectados: [],
  nombre_destinatario: null, banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.99, destino: 0.99, fecha: 0.99 },
};

/** SQL falso: controla gasto, cache y escrituras. */
function db({ gastado = 0, cache = null } = {}) {
  const escrituras = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("select coalesce(sum(coste_usd)")) return { rows: [{ gastado }] };
    if (q.startsWith("select resultado, coste_usd from public.musa_lecturas_cache")) {
      return { rows: cache ? [{ resultado: cache, coste_usd: "0.001" }] : [] };
    }
    escrituras.push({ q, params });
    return { rows: [] };
  };
  return { consultar, escrituras };
}

/** Proveedor falso: devuelve lo que se le diga, sin red. */
function falsoFetch({ contenido = JSON.stringify(DATOS_OK), status = 200, lanza = null, tokens = [1300, 260] } = {}) {
  return async () => {
    if (lanza) throw new Error(lanza);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        choices: [{ message: { content: contenido } }],
        usage: { prompt_tokens: tokens[0], completion_tokens: tokens[1] },
      }),
      text: async () => contenido,
    };
  };
}

const lector = (db, extra = {}) => ({
  consultar: db.consultar,
  proveedor: PROVEEDOR,
  presupuestoDiario: 1,
  descargarImagen: async () => ({ bytes: Buffer.from("bytes-de-imagen"), tipo: "image/jpeg" }),
  fetchImpl: falsoFetch(),
  ...extra,
});

// ============================== PREFILTRO ==============================
{
  t("sin imagen: pedir reenvío", prefiltrar({ media: null, yaPago: false }), { leer: false, accion: "pedir_reenvio", motivo: "sin_imagen" });
  t("pdf: pedir captura", prefiltrar({ media: { ...IMAGEN, tipo: "application/pdf" }, yaPago: false }).motivo, "tipo_no_soportado");
  t("video: pedir captura", prefiltrar({ media: { ...IMAGEN, tipo: "video/mp4" }, yaPago: false }).motivo, "tipo_no_soportado");
  t("demasiado grande", prefiltrar({ media: { ...IMAGEN, tamano: TAMANO_MAXIMO_BYTES + 1 }, yaPago: false }).motivo, "archivo_demasiado_grande");
  t("archivo vacío", prefiltrar({ media: { ...IMAGEN, tamano: 0 }, yaPago: false }).motivo, "archivo_vacio");
  t("ya pagó: cola humana", prefiltrar({ media: IMAGEN, yaPago: true }), { leer: false, accion: "cola_humana", motivo: "lead_ya_tiene_pago" });
  t("imagen normal: se lee", prefiltrar({ media: IMAGEN, yaPago: false }).leer, true);
  t("png: se lee", prefiltrar({ media: { ...IMAGEN, tipo: "image/png" }, yaPago: false }).leer, true);
}

// ============================== VALIDACIÓN DE LA RESPUESTA ==============================
{
  t("json limpio: válido", validarDatos(DATOS_OK).monto, 33000);
  t("json con markdown: se extrae", extraerJson('Aquí va:\n```json\n{"a":1}\n```')?.a, 1);
  t("texto sin json: null", extraerJson("no hay nada"), null);
  t("json roto: null", extraerJson("{roto"), null);

  t("monto texto: se descarta", validarDatos({ ...DATOS_OK, monto: "33000" }).monto, null);
  t("fecha mal formada: se descarta", validarDatos({ ...DATOS_OK, fecha: "28/10/2026" }).fecha, null);
  t("confidence fuera de rango: se acota", validarDatos({ ...DATOS_OK, confidence: { monto: 5 } }).confidence.monto, 1);
  t("confidence negativa: se acota", validarDatos({ ...DATOS_OK, confidence: { monto: -3 } }).confidence.monto, 0);
  t("respuesta nula: null", validarDatos(null), null);
  t("respuesta string: null", validarDatos("hola"), null);
  t("numeros_detectados no array: []", validarDatos({ ...DATOS_OK, numeros_detectados: "x" }).numeros_detectados, []);
}

// ============================== PROVEEDOR ==============================
{
  const r = await leerConProveedor(PROVEEDOR, "data:image/jpeg;base64,AAA", falsoFetch());
  t("proveedor: devuelve datos", r.datos.monto, 33000);
  t("proveedor: cuenta tokens", [r.tokensEntrada, r.tokensSalida], [1300, 260]);
}

{
  const r = await leerConProveedor(PROVEEDOR, "data:image/jpeg;base64,AAA", falsoFetch({ status: 429 }));
  t("proveedor 429: sin datos", r.datos, null);
  t("proveedor 429: motivo con status", r.motivoFallo.startsWith("http_429"), true);
}

{
  const r = await leerConProveedor(PROVEEDOR, "data:image/jpeg;base64,AAA", falsoFetch({ lanza: "boom" }));
  t("proveedor que lanza: sin datos", r.datos, null);
  t("proveedor que lanza: motivo", r.motivoFallo.length > 0, true);
}

{
  const r = await leerConProveedor(PROVEEDOR, "data:image/jpeg;base64,AAA", falsoFetch({ contenido: "no es json" }));
  t("respuesta ilegible: sin datos", r.datos, null);
  t("respuesta ilegible: json_invalido", r.motivoFallo, "json_invalido");
}

// ============================== PRESUPUESTO ==============================
{
  const d = db({ gastado: 0 });
  const e = await consultarPresupuesto(d.consultar, { tope: 1, estimado: 0.001 });
  t("presupuesto: permite", e.permitido, true);
  t("presupuesto: restante", Math.round(e.restante * 1000) / 1000, 1);
}

{
  const d = db({ gastado: 0.999 });
  const e = await consultarPresupuesto(d.consultar, { tope: 1, estimado: 0.01 });
  t("presupuesto: no cabe", e.permitido, false);
  t("presupuesto: motivo", e.motivo, "no_cabe_en_el_presupuesto");
}

{
  const d = db({ gastado: 5 });
  const e = await consultarPresupuesto(d.consultar, { tope: 1, estimado: 0.001 });
  t("presupuesto agotado: no permite", e.permitido, false);
  t("presupuesto agotado: motivo", e.motivo, "presupuesto_agotado");
  t("presupuesto: restante nunca negativo", e.restante, 0);
}

{
  const d = db();
  const e = await consultarPresupuesto(d.consultar, { tope: 0, estimado: 0 });
  t("presupuesto en 0: desactivado", e.motivo, "presupuesto_desactivado");
}

{
  const roto = async () => { throw new Error("db caída"); };
  const e = await consultarPresupuesto(roto, { tope: 1, estimado: 0.001 });
  t("presupuesto ilegible: NO gasta", e.permitido, false);
  t("presupuesto ilegible: motivo", e.motivo, "no_se_pudo_consultar_el_gasto");
}

{
  t("coste estimado", costeEstimado(1_000_000, 0, { entrada: 0.15, salida: 0.6 }), 0.15);
  t("coste reservado es pequeño", costeReservado(PROVEEDOR) < 0.001, true);
}

// ============================== ORQUESTADOR: los caminos seguros ==============================
{
  const d = db();
  const r = await leerComprobante(lector(d), { lead: "+5730", media: null, yaPago: false });
  t("sin imagen: pide reenvío", r, { ok: false, accion: "pedir_reenvio", motivo: "sin_imagen", coste: 0 });
}

{
  const d = db();
  const r = await leerComprobante(lector(d, { proveedor: null }), { lead: "+5730", media: IMAGEN, yaPago: false });
  t("sin proveedor: cola humana", r.accion, "cola_humana");
  t("sin proveedor: motivo", r.motivo, "sin_proveedor_ia");
  t("sin proveedor: no gasta", r.coste, 0);
}

{
  const d = db({ gastado: 10 });
  const r = await leerComprobante(lector(d), { lead: "+5730", media: IMAGEN, yaPago: false });
  t("sin presupuesto: cola humana", r.accion, "cola_humana");
  t("sin presupuesto: motivo", r.motivo, "presupuesto_agotado");
}

{
  const d = db();
  const r = await leerComprobante(lector(d, { descargarImagen: async () => null }), { lead: "+5730", media: IMAGEN, yaPago: false });
  t("imagen que no baja: pedir reenvío", r.accion, "pedir_reenvio");
}

{
  const d = db();
  const r = await leerComprobante(lector(d, { fetchImpl: falsoFetch({ status: 500 }) }), { lead: "+5730", media: IMAGEN, yaPago: false });
  t("proveedor caído: cola humana", r.accion, "cola_humana");
  t("proveedor caído: no aprueba", r.ok, false);
}

// ============================== ORQUESTADOR: camino feliz ==============================
{
  const d = db();
  const r = await leerComprobante(lector(d), { lead: "+5730", media: IMAGEN, yaPago: false });
  t("lectura buena: ok", r.ok, true);
  t("lectura buena: datos", r.datos.monto, 33000);
  t("lectura buena: origen proveedor", r.origen, "proveedor");
  t("lectura buena: registra el gasto", d.escrituras.some((e) => e.q.startsWith("insert into public.musa_consumo_ia")), true);
  t("lectura buena: guarda en cache", d.escrituras.some((e) => e.q.startsWith("insert into public.musa_lecturas_cache")), true);
  t("lectura buena: coste > 0", r.coste > 0, true);
  t("lectura buena: coste ridículo", r.coste < 0.01, true);
}

// ============================== CACHE ==============================
{
  const d = db({ cache: DATOS_OK });
  let llamo = false;
  const r = await leerComprobante(
    lector(d, { fetchImpl: async () => { llamo = true; return falsoFetch()(); } }),
    { lead: "+5730", media: IMAGEN, yaPago: false },
  );
  t("cache: devuelve datos", r.datos.monto, 33000);
  t("cache: origen cache", r.origen, "cache");
  t("cache: NO llama al proveedor", llamo, false);
  t("cache: no cuesta", r.coste, 0);
}

// ============================== huella ==============================
{
  t("huella estable", huellaDe(Buffer.from("x")), huellaDe(Buffer.from("x")));
  t("huellas distintas", huellaDe(Buffer.from("x")) === huellaDe(Buffer.from("y")), false);
  t("huella no expone el contenido", huellaDe(Buffer.from("secreto")).includes("secreto"), false);
}

// ============================== configuración ==============================
{
  t("sin config: null", configDesdeEntorno({}), null);
  t("config parcial: null", configDesdeEntorno({ MUSA_IA_URL: "https://x" }), null);
  const c = configDesdeEntorno({ MUSA_IA_URL: "https://x/v1/", MUSA_IA_KEY: "k", MUSA_IA_MODELO: "m" });
  t("config completa: vale", c.baseUrl, "https://x/v1/");
  // Precios verificados de gpt-6-luna (developers.openai.com, oct-2026).
}

// ============================== razonamiento y salida estructurada ==============================
{
  // Lo que se envía al proveedor importa: sin `reasoning_effort`, gpt-6-luna
  // razona por defecto (medium) y esos tokens se pagan como salida.
  let cuerpo = null;
  const captura = async (_url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    return {
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(DATOS_OK) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      text: async () => "",
    };
  };
  await leerConProveedor({ ...PROVEEDOR, razonamiento: "none", salidaEstructurada: true }, "data:image/jpeg;base64,AAA", captura);
  t("se envía razonamiento none", cuerpo.reasoning_effort, "none");
  t("se pide JSON", cuerpo.response_format, { type: "json_object" });
  t("temperatura 0", cuerpo.temperature, 0);
  t("tope con el nombre nuevo", cuerpo.max_completion_tokens, 400);
  t("no se envía el nombre viejo", "max_tokens" in cuerpo, false);
  // gpt-6-luna rechaza `max_tokens` y exige `max_completion_tokens`.
  t("la imagen va en el mensaje", JSON.stringify(cuerpo.messages).includes("image_url"), true);
}

{
  let cuerpo = null;
  const captura = async (_url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(DATOS_OK) } }], usage: {} }), text: async () => "" };
  };
  await leerConProveedor({ ...PROVEEDOR, razonamiento: undefined, salidaEstructurada: false }, "data:image/jpeg;base64,AAA", captura);
  t("sin configurar: no se envía razonamiento", "reasoning_effort" in cuerpo, false);
  t("sin configurar: no se pide JSON", "response_format" in cuerpo, false);
}

{
  // Precios verificados de gpt-6-luna (developers.openai.com, oct-2026).
  const c = configDesdeEntorno({ MUSA_IA_URL: "https://api.openai.com/v1", MUSA_IA_KEY: "k", MUSA_IA_MODELO: "gpt-6-luna" });
  t("precio de entrada verificado", c.precioEntrada, 0.1);
  t("precio de salida verificado", c.precioSalida, 0.5);
  t("razonamiento por defecto: ninguno", c.razonamiento, "none");
  t("json por defecto", c.salidaEstructurada, true);
  t("se puede apagar el json", configDesdeEntorno({ MUSA_IA_URL: "u", MUSA_IA_KEY: "k", MUSA_IA_MODELO: "m", MUSA_IA_JSON: "no" }).salidaEstructurada, false);
  t("reserva por comprobante < 0.001 USD", costeReservado(c) < 0.001, true);
}

{
  // Proveedores antiguos: se puede volver al nombre viejo sin tocar código.
  let cuerpo = null;
  const captura = async (_url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(DATOS_OK) } }], usage: {} }), text: async () => "" };
  };
  await leerConProveedor({ ...PROVEEDOR, parametroMaxTokens: "max_tokens" }, "data:image/jpeg;base64,AAA", captura);
  t("parámetro alternativo: max_tokens", cuerpo.max_tokens, 400);
  t("parámetro alternativo: sin el nuevo", "max_completion_tokens" in cuerpo, false);
}

{
  const c = configDesdeEntorno({ MUSA_IA_URL: "u", MUSA_IA_KEY: "k", MUSA_IA_MODELO: "gpt-6-luna" });
  t("por defecto usa el nombre nuevo", c.parametroMaxTokens, "max_completion_tokens");
  t("se puede volver al viejo", configDesdeEntorno({ MUSA_IA_URL: "u", MUSA_IA_KEY: "k", MUSA_IA_MODELO: "m", MUSA_IA_PARAM_TOKENS: "max_tokens" }).parametroMaxTokens, "max_tokens");
}

console.log(`visión: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
