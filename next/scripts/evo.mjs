// next/scripts/evo.mjs — CLI propio para operar Evolution API. CERO dependencias.
//
//   node next/scripts/evo.mjs estado
//   node next/scripts/evo.mjs qr
//   node next/scripts/evo.mjs webhook-ver
//   node next/scripts/evo.mjs webhook-set --url https://musa.example/webhook/evolution --jwt <secreto>
//   node next/scripts/evo.mjs enviar 573001112233 "hola"
//
// Configuración por entorno (o por flags --url / --key / --instancia):
//   EVOLUTION_URL       https://<servicio>.up.railway.app
//   EVOLUTION_APIKEY    API key (header `apikey`)
//   EVOLUTION_INSTANCE  nombre de la instancia (por defecto: musa)
//
// La API key NUNCA se imprime: ni en errores, ni en --json, ni en la ayuda.
//
// Rutas verificadas en el código fuente de Evolution (webhook.controller.ts,
// sendMessage.router.ts). `instance/create` y `instance/connect` NO están
// verificadas contra una instancia real: confirmar en la Fase 1.

import { pathToFileURL } from "node:url";

export const AYUDA = `evo — operar Evolution API desde la terminal

Comandos:
  instancias                      lista las instancias de la cuenta
  estado                          estado de conexión de la instancia
  qr                              pide el QR / código de vinculación
  webhook-ver                     muestra el webhook configurado
  webhook-set --url <URL> [--jwt <secreto>] [--secreto <valor>] [--cabecera <nombre>]
                                  configura el webhook (evento MESSAGES_UPSERT)
  crear [nombre]                  crea la instancia (Baileys, con QR)
  enviar <numero> <texto>         envía un mensaje de prueba

Opciones:
  --base <URL>      base de Evolution        (o EVOLUTION_URL)
  --url <URL>       destino del webhook     (solo para webhook-set)
  --key <APIKEY>    API key                  (o EVOLUTION_APIKEY)
  --instancia <n>   nombre de instancia      (o EVOLUTION_INSTANCE, por defecto "musa")
  --jwt <secreto>   secreto con el que Evolution firma el webhook
  --json            salida JSON cruda
  -h, --help        esta ayuda

La API key nunca se imprime.`;

const EVENTOS = ["MESSAGES_UPSERT"];

function parsear(argv) {
  const opciones = { json: false, ayuda: false, posicional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opciones.json = true;
    else if (a === "-h" || a === "--help") opciones.ayuda = true;
    else if (a === "--base") opciones.base = argv[++i];
    else if (a === "--url") opciones.webhookUrl = argv[++i];
    else if (a === "--key") opciones.key = argv[++i];
    else if (a === "--instancia") opciones.instancia = argv[++i];
    else if (a === "--jwt") opciones.jwt = argv[++i];
    else if (a === "--secreto") opciones.secreto = argv[++i];
    else if (a === "--cabecera") opciones.cabecera = argv[++i];
    else opciones.posicional.push(a);
  }
  return opciones;
}

const quitarBarra = (u) => (u ?? "").replace(/\/+$/, "");

/**
 * Ejecuta un comando. Devuelve { codigo, salida } en vez de llamar a process.exit
 * para poder probarlo sin arrancar un proceso.
 */
export async function ejecutar(argv, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const opciones = parsear(argv);
  const salida = [];

  if (opciones.ayuda || opciones.posicional.length === 0) {
    return { codigo: opciones.ayuda ? 0 : 2, salida: [AYUDA] };
  }

  const base = quitarBarra(opciones.base ?? env.EVOLUTION_URL);
  const key = opciones.key ?? env.EVOLUTION_APIKEY;
  const instancia = opciones.instancia ?? env.EVOLUTION_INSTANCE ?? "musa";

  if (!base || !key) {
    const faltan = [!base && "EVOLUTION_URL (--base)", !key && "EVOLUTION_APIKEY (--key)"].filter(Boolean);
    return { codigo: 2, salida: [`Falta configuración: ${faltan.join(" y ")}`, "", AYUDA] };
  }

  const cabeceras = { "Content-Type": "application/json", apikey: key };

  const llamar = async (metodo, ruta, cuerpo) => {
    const url = `${base}${ruta}`;
    let res;
    try {
      res = await fetchImpl(url, {
        method: metodo,
        headers: cabeceras,
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      });
    } catch (e) {
      return { ok: false, codigo: 1, texto: `No se pudo conectar con ${base}: ${String(e).slice(0, 160)}` };
    }
    const texto = await res.text();
    if (!res.ok) {
      // Se recorta el cuerpo: puede contener trazas. Nunca incluye la key.
      return { ok: false, codigo: 1, texto: `HTTP ${res.status} en ${metodo} ${ruta}: ${texto.slice(0, 300)}` };
    }
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
    return { ok: true, datos };
  };

  const [comando, ...resto] = opciones.posicional;

  switch (comando) {
    case "instancias": {
      const r = await llamar("GET", "/instance/fetchInstances");
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      const lista = Array.isArray(r.datos) ? r.datos : (r.datos?.instances ?? []);
      if (lista.length === 0) return { codigo: 0, salida: ["(ninguna instancia creada)"] };
      for (const it of lista) {
        const n = it?.name ?? it?.instance?.instanceName ?? "?";
        const e = it?.connectionStatus ?? it?.instance?.state ?? "?";
        salida.push(`${n.padEnd(20)} ${e}`);
      }
      return { codigo: 0, salida };
    }

    case "estado": {
      const r = await llamar("GET", `/instance/connectionState/${instancia}`);
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      const estado = r.datos?.instance?.state ?? r.datos?.state ?? "?";
      return { codigo: 0, salida: [`${instancia}: ${estado}`] };
    }

    case "qr": {
      const r = await llamar("GET", `/instance/connect/${instancia}`);
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      const codigo = r.datos?.code ?? r.datos?.pairingCode ?? null;
      salida.push(`instancia: ${instancia}`);
      if (codigo) salida.push(`código de vinculación: ${codigo}`);
      if (r.datos?.base64) salida.push("QR recibido en base64: abre la consola de Evolution o el manager para escanearlo.");
      else salida.push("Sin QR en la respuesta: revisa el estado de la instancia.");
      return { codigo: 0, salida };
    }

    case "webhook-ver": {
      const r = await llamar("GET", `/webhook/find/${instancia}`);
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      if (!r.datos || Object.keys(r.datos).length === 0) return { codigo: 0, salida: ["(sin webhook configurado)"] };
      salida.push(`url:      ${r.datos.url ?? "?"}`);
      salida.push(`eventos:  ${(r.datos.events ?? []).join(", ") || "?"}`);
      salida.push(`jwt_key:  ${r.datos.headers?.jwt_key ? "configurado" : "AUSENTE (sin firma)"}`);
      return { codigo: 0, salida };
    }

    case "webhook-set": {
      if (!opciones.webhookUrl) return { codigo: 2, salida: ["Falta --url <URL del webhook>"] };
      if (!opciones.jwt && !opciones.secreto) {
        salida.push("⚠ sin --jwt ni --secreto: el webhook llegará SIN firma y el servidor lo rechazará con 403.");
      }
      // Evolution borra `jwt_key` de los headers y añade Authorization: Bearer.
      // Los demás headers se conservan, así que se pueden configurar los dos
      // mecanismos a la vez (v2.3.7 no firma, pero sí manda el header estático).
      const cabeceras = {};
      if (opciones.secreto) cabeceras[opciones.cabecera ?? "x-evolution-secret"] = opciones.secreto;
      if (opciones.jwt) cabeceras.jwt_key = opciones.jwt;

      const cuerpo = {
        webhook: {
          enabled: true,
          url: opciones.webhookUrl,
          byEvents: false,
          base64: false,
          events: EVENTOS,
          ...(Object.keys(cabeceras).length ? { headers: cabeceras } : {}),
        },
      };
      const r = await llamar("POST", `/webhook/set/${instancia}`, cuerpo);
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      salida.push(`webhook configurado en ${instancia} -> ${opciones.webhookUrl}`);
      salida.push(`eventos: ${EVENTOS.join(", ")}`);
      salida.push(`firma: ${opciones.jwt ? "JWT" : "no"} · cabecera estática: ${opciones.secreto ? "sí" : "no"}`);
      return { codigo: 0, salida };
    }

    case "crear": {
      const nombre = resto[0] ?? instancia;
      if (/\s/.test(nombre)) return { codigo: 2, salida: ["El nombre de instancia no puede tener espacios"] };
      const r = await llamar("POST", "/instance/create", {
        instanceName: nombre,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      });
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      const estado = r.datos?.instance?.status ?? r.datos?.instance?.state ?? "creada";
      salida.push(`instancia ${nombre} creada (${estado})`);
      salida.push(`siguiente paso: node next/scripts/evo.mjs qr`);
      return { codigo: 0, salida };
    }

    case "enviar": {
      const [numero, ...texto] = resto;
      if (!numero || texto.length === 0) return { codigo: 2, salida: ["Uso: enviar <numero> <texto>"] };
      const r = await llamar("POST", `/message/sendText/${instancia}`, {
        number: numero.replace(/\D/g, ""),
        text: texto.join(" "),
      });
      if (!r.ok) return { codigo: r.codigo, salida: [r.texto] };
      if (opciones.json) return { codigo: 0, salida: [JSON.stringify(r.datos, null, 2)] };
      const id = r.datos?.key?.id ?? "?";
      return { codigo: 0, salida: [`enviado a ${numero} (id ${id})`] };
    }

    default:
      return { codigo: 2, salida: [`Comando desconocido: ${comando}`, "", AYUDA] };
  }
}

// ---- entrada de línea de comandos ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { codigo, salida } = await ejecutar(process.argv.slice(2));
  for (const l of salida) console.log(l);
  process.exit(codigo);
}
