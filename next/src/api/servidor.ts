// next/src/api/servidor.ts — servidor HTTP del webhook de Musa v2.
//
// CERO dependencias: solo módulos nativos de Node. Motivo: menos superficie de
// suministro y arranca sin `npm install`, que en el sandbox actual ni siquiera es
// posible. Si más adelante hace falta un router, se cambia sin tocar el contrato.
//
// Flujo, en este orden y sin excepciones:
//   1. leer el cuerpo con límite de tamaño
//   2. verificar la firma  -> si no valida, 403 y NO se procesa nada
//   3. parsear             -> [] significa "no es un mensaje de usuario"
//   4. deduplicar por id   -> Evolution reintenta hasta 10 veces
//   5. motor               -> decide qué contestar
//   6. enviar              -> por el mismo canal
//
// La seguridad NO es un middleware opcional: `verificar` es la segunda línea de
// este archivo a propósito. Cierra el fail-open que hoy tiene el webhook de Twilio.

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Canal, MensajeEntrante } from "../../../functions/canal/tipos.ts";
import type { Motor } from "../motor/contrato.ts";

export interface OpcionesServidor {
  /** canal autenticado y listo (Evolution o Twilio) */
  canal: Canal;
  /** motor del funnel (o `motorEco` durante la Fase 1) */
  motor: Motor;
  /** ruta del webhook; por defecto /webhook/evolution */
  rutaWebhook?: string;
  /**
   * Tope de cuerpo. Evolution con `webhookBase64` puede mandar un comprobante
   * entero en base64 (~1,33x el archivo), así que 25 MB cubre videos de 16 MB.
   */
  limiteBytes?: number;
  /** deduplicación en memoria; el tamaño se recorta solo (ver `recordar`) */
  maxIdsRecordados?: number;
  /**
   * Interfaz de escucha. Por defecto `127.0.0.1` (seguro en local y en pruebas).
   * En un contenedor hay que pasar `0.0.0.0`, o el proxy de la plataforma no llega.
   */
  host?: string;
}

export interface Servidor {
  server: Server;
  /** escucha en `puerto` (0 = efímero) y devuelve el puerto real */
  escuchar(puerto?: number): Promise<number>;
  cerrar(): Promise<void>;
}

const RUTA_SALUD = "/salud";

function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto) });
  res.end(texto);
}

function leerCuerpo(req: IncomingMessage, limite: number): Promise<string | null> {
  return new Promise((resolve) => {
    const trozos: Buffer[] = [];
    let total = 0;
    let excedido = false;
    req.on("data", (t: Buffer) => {
      if (excedido) return;
      total += t.length;
      if (total > limite) {
        // No cortamos el socket: si lo destruimos, el cliente recibe un error de
        // red en vez del 413 y Evolution lo trata como fallo reintentable.
        // Dejamos de acumular, drenamos el resto y respondemos al terminar.
        excedido = true;
        trozos.length = 0;
        return;
      }
      trozos.push(t);
    });
    req.on("end", () => resolve(excedido ? null : Buffer.concat(trozos).toString("utf8")));
    req.on("error", () => resolve(excedido ? null : ""));
  });
}

export function crearServidor(opts: OpcionesServidor): Servidor {
  const rutaWebhook = opts.rutaWebhook ?? "/webhook/evolution";
  const limite = opts.limiteBytes ?? 25 * 1024 * 1024;
  const maxIds = opts.maxIdsRecordados ?? 5000;
  const host = opts.host ?? "127.0.0.1";

  // Deduplicación en memoria. Sirve para el arranque y para un proceso único;
  // cuando haya más de una réplica, esto se muda a Redis con TTL (Fase 3.4).
  const vistos = new Set<string>();
  const recordar = (id: string): void => {
    vistos.add(id);
    if (vistos.size > maxIds) {
      const primero = vistos.values().next().value;
      if (primero !== undefined) vistos.delete(primero);
    }
  };

  const manejar = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "/";

    if (url === RUTA_SALUD) {
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      return json(res, 200, { ok: true, canal: opts.canal.id, uptime_s: Math.round(process.uptime()) });
    }

    if (url !== rutaWebhook) return json(res, 404, { error: "no_encontrado" });
    if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });

    const cuerpo = await leerCuerpo(req, limite);
    if (cuerpo === null) return json(res, 413, { error: "cuerpo_demasiado_grande" });

    // 2. FIRMA — antes de tocar nada.
    const peticion = new Request(`http://localhost${url}`, {
      method: "POST",
      headers: req.headers as Record<string, string>,
      body: cuerpo,
    });

    let firma;
    try {
      firma = await opts.canal.verificar(peticion, cuerpo);
    } catch (e) {
      console.error("[servidor] verificar lanzó:", String(e).slice(0, 200));
      return json(res, 403, { error: "firma_error" });
    }
    if (!firma.valido) {
      // 403 (no 5xx): Evolution no reintenta 403. Un 500 aquí sería un bucle.
      console.warn("[servidor] webhook rechazado:", firma.motivo);
      return json(res, 403, { error: "no_autorizado", motivo: firma.motivo });
    }

    // 3. PARSEO
    let mensajes: MensajeEntrante[];
    try {
      mensajes = await opts.canal.parsear(peticion, cuerpo);
    } catch (e) {
      console.error("[servidor] parsear lanzó:", String(e).slice(0, 200));
      return json(res, 400, { error: "payload_invalido" });
    }
    if (mensajes.length === 0) return json(res, 200, { ok: true, procesados: 0 });

    // 4-6. DEDUPE -> MOTOR -> ENVÍO
    let procesados = 0;
    for (const mensaje of mensajes) {
      const id = mensaje.id_externo;
      if (id) {
        if (vistos.has(id)) continue;
        recordar(id);
      }
      try {
        const salientes = await opts.motor.procesar(mensaje);
        for (const m of salientes) {
          const envio = await opts.canal.enviar(mensaje.telefono, m);
          if (!envio.ok) {
            console.error("[servidor] envío falló:", envio.status ?? "", envio.motivo ?? "");
          }
        }
        procesados++;
      } catch (e) {
        // Un fallo del motor en UN mensaje no debe tumbar el lote ni provocar
        // reintentos de Evolution sobre un mensaje ya medio procesado.
        console.error("[servidor] motor falló:", String(e).slice(0, 200), "id:", id);
      }
    }

    return json(res, 200, { ok: true, procesados });
  };

  const server = createServer((req, res) => {
    manejar(req, res).catch((e) => {
      console.error("[servidor] error no controlado:", String(e).slice(0, 300));
      if (!res.headersSent) json(res, 500, { error: "interno" });
      else res.end();
    });
  });

  return {
    server,
    escuchar(puerto = 0) {
      return new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(puerto, host, () => {
          const dir = server.address();
          resolve(typeof dir === "object" && dir ? dir.port : puerto);
        });
      });
    },
    cerrar() {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
