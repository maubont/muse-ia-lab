// scripts/test-canal-evolution.mjs — pruebas del adaptador de canal Evolution API.
//
//   node --experimental-strip-types scripts/test-canal-evolution.mjs
//
// No necesita red ni instancia: el `fetch` se inyecta y las firmas se generan en
// el propio test. Lo que aquí se verifica es lo que puede costar caro:
//   · que un POST sin firma válida NO entre (fail-closed, el P0 histórico)
//   · que el bot no se responda a sí mismo ni procese grupos
//   · que la media del comprobante llegue al pipeline de visión
//   · que el envío salga con la forma exacta que Evolution espera

import { crearCanalEvolution } from "../functions/canal/evolution.ts";

const SECRETO = "secreto-de-prueba-32-bytes-largo";
const CFG = {
  baseUrl: "https://evolution.test/",
  instancia: "musa",
  apiKey: "api-key-de-prueba",
  jwtKey: SECRETO,
};

const enc = new TextEncoder();
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

/** Firma un JWT HS256 igual que Evolution (webhook.controller.ts:generateJwtToken). */
async function firmar(payload, secreto = SECRETO) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

const jwtValido = () => firmar({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, app: "evolution", action: "webhook" });

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

/** fetch falso que registra la llamada y responde lo que se le diga. */
function fakeFetch(respuesta = { status: 201, body: { key: { id: "EVO123" } } }) {
  const llamadas = [];
  const impl = async (url, init) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(respuesta.body ?? {}), {
      status: respuesta.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  impl.llamadas = llamadas;
  return impl;
}

const canal = (extra = {}) => crearCanalEvolution({ ...CFG, ...extra });
const peticion = () => new Request("https://musa.test/webhook", { method: "POST" });

// ============================== verificar (fail-closed) ==============================

{
  const c = canal();
  const jwt = await jwtValido();
  const req = (h) => new Request("https://musa.test/webhook", { method: "POST", headers: h });

  t("verificar: JWT válido", await c.verificar(req({ Authorization: `Bearer ${jwt}` }), ""), { valido: true, motivo: "ok" });
  t("verificar: sin header", (await c.verificar(req({}), "")).valido, false);
  t("verificar: bearer basura", (await c.verificar(req({ Authorization: "Bearer abc" }), "")).motivo, "jwt_mal_formado");

  const otro = await firmar({ exp: Math.floor(Date.now() / 1000) + 600, action: "webhook" }, "otro-secreto");
  t("verificar: firma de otro secreto", (await c.verificar(req({ Authorization: `Bearer ${otro}` }), "")).motivo, "firma_no_coincide");

  // Manipular el payload sin recalcular la firma debe fallar.
  const [h, , s] = jwt.split(".");
  const payloadFalso = b64u(enc.encode(JSON.stringify({ action: "webhook", exp: Math.floor(Date.now() / 1000) + 600, extra: 1 })));
  t("verificar: payload manipulado", (await c.verificar(req({ Authorization: `Bearer ${h}.${payloadFalso}.${s}` }), "")).motivo, "firma_no_coincide");

  const expirado = await firmar({ exp: Math.floor(Date.now() / 1000) - 60, action: "webhook" });
  t("verificar: JWT expirado", (await c.verificar(req({ Authorization: `Bearer ${expirado}` }), "")).motivo, "jwt_expirado");

  const otraAccion = await firmar({ exp: Math.floor(Date.now() / 1000) + 600, action: "login" });
  t("verificar: acción distinta", (await c.verificar(req({ Authorization: `Bearer ${otraAccion}` }), "")).motivo, "accion_inesperada");

  const sinSecreto = crearCanalEvolution({ ...CFG, jwtKey: "" });
  t("verificar: sin ninguna credencial", (await sinSecreto.verificar(req({ Authorization: `Bearer ${jwt}` }), "")).motivo, "sin_credencial_configurada");
}

// ---------- secreto compartido en cabecera (mecanismo de v2.3.7) ----------
{
  const SECRETO_CABECERA = "secreto-compartido-de-prueba";
  const soloCabecera = crearCanalEvolution({ ...CFG, jwtKey: "", secretoWebhook: SECRETO_CABECERA });
  const req = (h) => new Request("https://musa.test/webhook", { method: "POST", headers: h });

  t("cabecera: secreto correcto", await soloCabecera.verificar(req({ "x-evolution-secret": SECRETO_CABECERA }), ""),
    { valido: true, motivo: "secreto_compartido" });
  t("cabecera: secreto incorrecto", (await soloCabecera.verificar(req({ "x-evolution-secret": "otro" }), "")).valido, false);
  t("cabecera: sin cabecera", (await soloCabecera.verificar(req({}), "")).valido, false);

  // Nombre de cabecera configurable.
  const otraCabecera = crearCanalEvolution({ ...CFG, jwtKey: "", secretoWebhook: SECRETO_CABECERA, nombreCabeceraSecreto: "x-musa-secret" });
  t("cabecera: nombre configurable", (await otraCabecera.verificar(req({ "x-musa-secret": SECRETO_CABECERA }), "")).valido, true);
  t("cabecera: el nombre viejo ya no vale", (await otraCabecera.verificar(req({ "x-evolution-secret": SECRETO_CABECERA }), "")).valido, false);

  // Con los dos mecanismos, vale cualquiera de los dos.
  const ambos = crearCanalEvolution({ ...CFG, secretoWebhook: SECRETO_CABECERA });
  const jwt = await jwtValido();
  t("ambos: JWT sirve", (await ambos.verificar(req({ Authorization: `Bearer ${jwt}` }), "")).motivo, "ok");
  t("ambos: cabecera también sirve", (await ambos.verificar(req({ "x-evolution-secret": SECRETO_CABECERA }), "")).motivo, "secreto_compartido");
  t("ambos: nada válido se rechaza", (await ambos.verificar(req({}), "")).valido, false);
}

// ============================== parsear ==============================

const upsert = (data, event = "messages.upsert") => JSON.stringify({ event, instance: "musa", data, destination: "x", date_time: "2026-10-27T18:00:00Z", sender: "57300@s.whatsapp.net", server_url: "https://evolution.test", apikey: "api-key-de-prueba" });

const msgTexto = {
  key: { id: "ABC123", remoteJid: "573223565761@s.whatsapp.net", fromMe: false },
  pushName: "Juan",
  message: { conversation: "hola" },
  messageType: "conversation",
  messageTimestamp: 1700000000,
};

{
  const c = canal();
  const r = await c.parsear(new Request("https://musa.test"), upsert(msgTexto));
  t("parsear: cantidad", r.length, 1);
  t("parsear: telefono E.164", r[0].telefono, "+573223565761");
  t("parsear: texto", r[0].texto, "hola");
  t("parsear: id_externo (idempotencia)", r[0].id_externo, "ABC123");
  t("parsear: nombre_perfil", r[0].nombre_perfil, "Juan");
  t("parsear: timestamp segundos -> ms", r[0].enviado_en, 1700000000000);
  t("parsear: sin atribución CTWA (Baileys)", r[0].atribucion, { ctwa_clid: null, source_id: null });
  t("parsear: canal", r[0].canal, "evolution");
  t("parsear: sin media", r[0].media, null);
}

t("parsear: fromMe filtrado", (await canal().parsear(peticion(), upsert({ ...msgTexto, key: { ...msgTexto.key, fromMe: true } }))).length, 0);
t("parsear: grupo filtrado", (await canal().parsear(peticion(), upsert({ ...msgTexto, key: { ...msgTexto.key, remoteJid: "123-456@g.us" } }))).length, 0);
t("parsear: broadcast filtrado", (await canal().parsear(peticion(), upsert({ ...msgTexto, key: { ...msgTexto.key, remoteJid: "status@broadcast" } }))).length, 0);
t("parsear: otro evento", (await canal().parsear(peticion(), upsert(msgTexto, "messages.update"))).length, 0);
t("parsear: evento en MAYÚSCULAS", (await canal().parsear(peticion(), upsert(msgTexto, "MESSAGES_UPSERT"))).length, 1);
// Cuerpo firmado pero ilegible: debe LANZAR (el servidor responde 400), no
// devolver [] silenciosamente.
{
  let lanzo = false;
  try { await canal().parsear(peticion(), "no es json"); } catch { lanzo = true; }
  t("parsear: JSON inválido lanza", lanzo, true);
}

t("parsear: extendedTextMessage", (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { extendedTextMessage: { text: "quiero info" } } })))[0].texto, "quiero info");

// Mensaje efímero: el contenido real está un nivel más adentro.
t(
  "parsear: desempaqueta ephemeralMessage",
  (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { ephemeralMessage: { message: { conversation: "hola efimero" } } } })))[0].texto,
  "hola efimero",
);

// Reacción: no es un mensaje que el funnel deba procesar.
t("parsear: reacción ignorada", (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { reactionMessage: { text: "❤" } } }))).length, 0);

// ---- media ----
{
  const base64 = Buffer.from("PNGDATOS").toString("base64");
  const payload = upsert({ ...msgTexto, message: { imageMessage: { mimetype: "image/png", base64 } } });
  const r = await canal().parsear(peticion(), payload);
  t("media: cantidad", r.length, 1);
  t("media: tipo imagen", r[0].media.tipo, "imagen");
  t("media: mime", r[0].media.mime, "image/png");
  t("media: sin texto queda vacío", r[0].texto, "");
  const bytes = new Uint8Array(await r[0].media.obtenerBytes());
  t("media: bytes desde base64 embebido", Buffer.from(bytes).toString(), "PNGDATOS");
}

{
  // Sin base64 en el webhook: debe pedirlo a Evolution con la clave del mensaje.
  const f = fakeFetch({ status: 200, body: { base64: Buffer.from("JPEG-X").toString("base64"), mimetype: "image/jpeg" } });
  const c = canal({ fetchImpl: f });
  const r = await c.parsear(peticion(), upsert({ ...msgTexto, message: { imageMessage: { mimetype: "image/jpeg" } } }));
  const bytes = new Uint8Array(await r[0].media.obtenerBytes());
  t("media: bytes vía getBase64FromMediaMessage", Buffer.from(bytes).toString(), "JPEG-X");
  t("media: endpoint correcto", f.llamadas[0].url, "https://evolution.test/chat/getBase64FromMediaMessage/musa");
  t("media: envía la key del mensaje", JSON.parse(f.llamadas[0].init.body).message.key.id, "ABC123");
}

// ============================== enviar ==============================

{
  const f = fakeFetch();
  const c = canal({ fetchImpl: f });
  const r = await c.enviar("+573223565761", { texto: "¡Hola Juan!" });
  t("enviar: ok", r.ok, true);
  t("enviar: id del mensaje", r.id_externo, "EVO123");
  t("enviar: URL", f.llamadas[0].url, "https://evolution.test/message/sendText/musa");
  t("enviar: header apikey", f.llamadas[0].init.headers.apikey, "api-key-de-prueba");
  t("enviar: número sin '+'", JSON.parse(f.llamadas[0].init.body).number, "573223565761");
  t("enviar: texto", JSON.parse(f.llamadas[0].init.body).text, "¡Hola Juan!");
}

{
  const f = fakeFetch();
  const c = canal({ fetchImpl: f });
  const r = await c.enviar("+573223565761", {
    texto: "Mira mi saludo",
    media: { url: "https://cdn.test/v.mp4", tipo: "video", mime: "video/mp4" },
  });
  t("enviar media: ok", r.ok, true);
  t("enviar media: endpoint", f.llamadas[0].url, "https://evolution.test/message/sendMedia/musa");
  const body = JSON.parse(f.llamadas[0].init.body);
  t("enviar media: mediatype", body.mediatype, "video");
  t("enviar media: media url", body.media, "https://cdn.test/v.mp4");
  t("enviar media: caption", body.caption, "Mira mi saludo");
}

{
  const f = fakeFetch({ status: 500, body: { error: "boom" } });
  const c = canal({ fetchImpl: f });
  const r = await c.enviar("+573223565761", { texto: "x" });
  t("enviar: error del proveedor", r.ok, false);
  t("enviar: status expuesto", r.status, 500);
}

{
  const f = fakeFetch();
  const c = canal({ fetchImpl: f });
  await c.marcarEscribiendo("+573223565761");
  t("typing: endpoint", f.llamadas[0].url, "https://evolution.test/chat/sendPresence/musa");
  t("typing: presence", JSON.parse(f.llamadas[0].init.body).presence, "composing");
}

// Un fallo de red en typing no debe propagar excepción.
{
  const c = canal({ fetchImpl: async () => { throw new Error("red caída"); } });
  let rompio = false;
  try { await c.marcarEscribiendo("+573223565761"); } catch { rompio = true; }
  t("typing: fallo de red no rompe el flujo", rompio, false);
}

// ============================== endurecimiento (patrón validado en producción) ==============================

// WhatsApp migró parte de los chats a LIDs (`123456@lid`), que NO son teléfonos.
// El número real viaja en `remoteJidAlt`. Sin esto, clientes reales se pierden.
{
  const conAlt = {
    ...msgTexto,
    key: { id: "LID1", remoteJid: "123456789@lid", remoteJidAlt: "573223565761@s.whatsapp.net", fromMe: false },
  };
  const r = await canal().parsear(peticion(), upsert(conAlt));
  t("LID con remoteJidAlt: se recupera el teléfono", r.length, 1);
  t("LID: teléfono correcto", r[0]?.telefono, "+573223565761");
}

{
  const sinAlt = { ...msgTexto, key: { id: "LID2", remoteJid: "123456789@lid", fromMe: false } };
  t("LID sin teléfono correlacionable: se ignora", (await canal().parsear(peticion(), upsert(sinAlt))).length, 0);
}

// Evolution también emite los mensajes SALIENTES (`send.message`).
t(
  "send.message con fromMe: ignorado (no hay bucle)",
  (await canal().parsear(peticion(), upsert({ ...msgTexto, key: { ...msgTexto.key, fromMe: true } }, "send.message"))).length,
  0,
);
t(
  "send.message aceptado como evento de mensaje",
  (await canal().parsear(peticion(), upsert(msgTexto, "send.message"))).length,
  1,
);

// El pie de una foto ES el texto que escribió el cliente.
{
  const payload = upsert({ ...msgTexto, message: { imageMessage: { mimetype: "image/jpeg", caption: "aquí va mi comprobante" } } });
  const r = await canal().parsear(peticion(), payload);
  t("pie de foto como texto", r[0].texto, "aquí va mi comprobante");
  t("pie de foto: además hay media", r[0].media.tipo, "imagen");
}

// Respuestas de plantilla, ubicación y reacción.
t(
  "respuesta de plantilla como texto",
  (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { templateButtonReplyMessage: { selectedDisplayText: "Sí, quiero" } } })))[0].texto,
  "Sí, quiero",
);
t(
  "ubicación compartida no rompe",
  (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { locationMessage: { degreesLatitude: 4.6 } } })))[0].texto,
  "[Ubicación compartida]",
);
t(
  "reacción ignorada (no es mensaje del cliente)",
  (await canal().parsear(peticion(), upsert({ ...msgTexto, message: { reactionMessage: { text: "❤" } } }))).length,
  0,
);

// `data` puede llegar como array.
t("data como array: toma el primer objeto", (await canal().parsear(peticion(), JSON.stringify({ event: "messages.upsert", data: [msgTexto] }))).length, 1);

// Con la sesión caída, sendText no falla rápido: cuelga. El adaptador corta.
{
  const colgado = (_url, init) =>
    new Promise((_, rechazar) => {
      init.signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        rechazar(e);
      });
    });
  const c = crearCanalEvolution({ ...CFG, fetchImpl: colgado, timeoutEnvioMs: 20 });
  const inicio = Date.now();
  const r = await c.enviar("+573223565761", { texto: "x" });
  t("envío colgado: no bloquea", r.ok, false);
  t("envío colgado: reporta timeout", r.motivo, "timeout");
  t("envío colgado: corta a tiempo", Date.now() - inicio < 1000, true);
}

// La instancia va codificada en la ruta.
{
  const f = fakeFetch();
  const c = crearCanalEvolution({ ...CFG, instancia: "musa test", fetchImpl: f });
  await c.enviar("+573223565761", { texto: "x" });
  t("instancia codificada en la URL", f.llamadas[0].url, "https://evolution.test/message/sendText/musa%20test");
}

console.log(`canal evolution: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
