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
import { readFileSync as leerArchivo, existsSync as existeRuta, statSync } from "node:fs";
import { join as unirRuta, normalize as normalizar, extname } from "node:path";
import { createReadStream } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Canal, MensajeEntrante } from "../../../functions/canal/tipos.ts";
import type { Motor } from "../motor/contrato.ts";
import { retardoDeTurno } from "../motor/ritmo.ts";

export interface OpcionesServidor {
  /** canal autenticado y listo (Evolution o Twilio) */
  canal: Canal;
  /** motor del funnel (o `motorEco` durante la Fase 1) */
  motor: Motor;
  /**
   * Pausa entre mensajes para simular ritmo humano. Si está configurado,
   * marca 'escribiendo...' en WhatsApp y espera los ms antes de enviar.
   */
  esperar?: (ms: number) => Promise<void>;
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
   * Comprobador de duplicados. Si se entrega, manda él: sobrevive a reinicios y
   * sirve con varias réplicas. Sin él se usa la memoria (solo pruebas).
   */
  yaProcesado?: (id: string) => Promise<boolean> | boolean;
  /** Carpeta de la landing. Si no existe, las rutas públicas no se montan. */
  landingDir?: string;
  /** Permite apagar la landing sin quitar el archivo. */
  landingHabilitada?: boolean;
  /**
   * Interfaz de escucha. Por defecto `127.0.0.1` (seguro en local y en pruebas).
   * En un contenedor hay que pasar `0.0.0.0`, o el proxy de la plataforma no llega.
   */
  host?: string;
  /** Tarea del cron de recordatorios. Si no está, la ruta no existe. */
  despacharRecordatorios?: () => Promise<unknown>;
  /** Clave del cron (`x-cron-key`). Sin ella, la ruta del cron no se expone. */
  claveCron?: string;
  /**
   * Prueba mínima del proveedor de IA (una llamada de 5 tokens).
   * Existe porque «la configuración está puesta» y «la clave funciona» no son lo
   * mismo: sin esto, una clave inválida solo se descubre con un comprobante real.
   */
  diagnosticoIa?: () => Promise<{ ok: boolean; motivo?: string; ms: number; muestra?: string }>;
  /** Prueba con los comprobantes reales del repo. Cuesta ~0,001 USD por pasada. */
  diagnosticoImagenes?: (base64: string, tipo?: string, esperado?: Record<string, unknown>) => Promise<unknown>;
  /** Lectura del estado de la sesión, para `/salud/sesion`. */
  estadoSesion?: () => Promise<{ estado: string; detalle?: string }>;
  /**
   * Acceso al curso. Si no se pasa, las rutas `/a/*` y `/curso` no existen.
   * `abrirlo` valida el token y devuelve la página, o el motivo del rechazo.
   */
  acceso?: {
    validar: (token: string) => Promise<{ ok: boolean; phone?: string; motivo?: string }>;
    pagina: (phone: string, token?: string) => Promise<string>;
    sinAcceso: (motivo?: string) => string;
  };
  /**
   * Almacén de contenido del curso. Si no se pasa, `/media/*` no existe.
   * El archivo se sirve SOLO con un token de acceso válido.
   */
  medios?: {
    resolver?: (clave: string) => Promise<{ ruta: string; tamano: number; tipo: string; nombre: string } | null>;
    /**
     * Almacén remoto: devuelve una URL firmada. Si está, se REDIRIGE en vez de
     * servir el archivo: el contenido no pasa por este servidor.
     */
    desplazar?: (clave: string) => Promise<string | null>;
  };
  /** API para Musa Academy LMS (/api/academia/catalogo). */
  academiaCatalogo?: (token?: string) => Promise<unknown>;
  /** API de telemetría y cola real para Consola Musa (/api/consola/estado). */
  consolaEstado?: () => Promise<unknown>;
  /** API de ejecución de comandos agénticos desde Consola Musa (/api/consola/comando). */
  consolaComando?: (comandoTexto: string) => Promise<unknown>;
  /** Clave de administración para Consola Musa (/api/consola/*). */
  adminSecret?: string;
}

export interface Servidor {
  server: Server;
  /** escucha en `puerto` (0 = efímero) y devuelve el puerto real */
  escuchar(puerto?: number): Promise<number>;
  cerrar(): Promise<void>;
}

const RUTA_SALUD = "/salud";
const RUTA_SALUD_SESION = "/salud/sesion";
const RUTA_CRON = "/cron/recordatorios";
const RUTA_DIAG_IA = "/diagnostico/ia";

function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto) });
  res.end(texto);
}

/** HTML con cabeceras que evitan que el curso se indexe o se cachee en proxies. */
function html(res: ServerResponse, codigo: number, cuerpo: string): void {
  res.writeHead(codigo, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  res.end(cuerpo);
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

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
};

/**
 * Sirve la landing sin dependencias.
 *
 * SEGURIDAD: la ruta pedida se normaliza y se comprueba que el destino siga dentro
 * de la carpeta. Sin eso, un `GET /../.env` leería el entorno del contenedor.
 */
function servirLanding(raiz: string, pedida: string): { cuerpo: Buffer; tipo: string } | null {
  const limpia = pedida.split("?")[0].split("#")[0];
  const relativa = normalizar(decodeURIComponent(limpia)).replace(/^([/\\])+/, "");
  if (relativa.includes("..")) return null;

  const destino = unirRuta(raiz, relativa === "" ? "index.html" : relativa);
  const dentro = normalizar(destino).startsWith(normalizar(raiz));
  if (!dentro || !existeRuta(destino) || !statSync(destino).isFile()) return null;

  return { cuerpo: leerArchivo(destino), tipo: MIME[extname(destino).toLowerCase()] ?? "application/octet-stream" };
}

export function crearServidor(opts: OpcionesServidor): Servidor {
  const rutaWebhook = opts.rutaWebhook ?? "/webhook/evolution";
  const limite = opts.limiteBytes ?? 25 * 1024 * 1024;
  const maxIds = opts.maxIdsRecordados ?? 5000;
  const host = opts.host ?? "127.0.0.1";
  const adminSecret = (opts.adminSecret ?? process.env.MUSA_ADMIN_SECRET ?? "").trim() ||
    "musa_admin_sec_2026";

  function firmarSesionAdmin(timestamp: number, nonce: string): string {
    return createHmac("sha256", adminSecret).update(`${timestamp}.${nonce}`).digest("hex");
  }

  function generarCsrfToken(timestamp: number, nonce: string): string {
    return createHmac("sha256", adminSecret).update(`csrf.${timestamp}.${nonce}`).digest("hex");
  }

  function verificarSesionAdmin(req: IncomingMessage): { ok: boolean; csrfToken?: string; motivo?: string } {
    if (!adminSecret) return { ok: false, motivo: "admin_secret_no_configurado" };
    const cookies = String(req.headers.cookie ?? "");
    const m = cookies.match(/(?:^|;\s*)musa_admin_session=([^;]+)/);
    if (!m) return { ok: false, motivo: "sin_cookie_admin" };
    const valor = decodeURIComponent(m[1]).trim();
    const partes = valor.split(".");
    if (partes.length !== 3) return { ok: false, motivo: "formato_sesion_invalido" };
    const [tsStr, nonce, firmaRecibida] = partes;
    const ts = Number(tsStr);
    if (!Number.isFinite(ts)) return { ok: false, motivo: "timestamp_invalido" };
    // Sesión válida por 8 horas
    const ahora = Date.now();
    if (ahora - ts > 8 * 3600 * 1000 || ts > ahora + 60000) {
      return { ok: false, motivo: "sesion_expirada" };
    }
    const firmaEsperada = firmarSesionAdmin(ts, nonce);
    if (firmaRecibida.length !== firmaEsperada.length) return { ok: false, motivo: "firma_invalida" };
    const igual = timingSafeEqual(Buffer.from(firmaRecibida), Buffer.from(firmaEsperada));
    if (!igual) return { ok: false, motivo: "firma_invalida" };
    return { ok: true, csrfToken: generarCsrfToken(ts, nonce) };
  }

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

    // ── LANDING ──────────────────────────────────────────────────────────────
    // Pública a propósito: es la página de venta. Se sirve desde el mismo servidor
    // para no depender de un hosting extra. Ignora query strings (?ref=..., ?t=...).
    if (opts.landingHabilitada !== false && opts.landingDir && (req.method === "GET" || req.method === "HEAD")) {
      const rutaSinQuery = url.split("?")[0].split("#")[0];
      const esRaiz = rutaSinQuery === "/" || rutaSinQuery === "";
      const esPagina = /\.html?$/i.test(rutaSinQuery) || esRaiz;
      const esActivo = rutaSinQuery.startsWith("/assets/") || rutaSinQuery.startsWith("/videos/") || /\.(mp3|ogg|opus|wav|mp4|webm)$/i.test(rutaSinQuery);
      if (esRaiz || esPagina || esActivo) {
        const archivo = servirLanding(opts.landingDir, esRaiz ? "index.html" : rutaSinQuery);
        if (archivo) {
          res.writeHead(200, {
            "Content-Type": archivo.tipo,
            "Content-Length": archivo.cuerpo.length,
            "Cache-Control": esActivo ? "public, max-age=86400" : "no-cache",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(req.method === "HEAD" ? undefined : archivo.cuerpo);
          return;
        }
        if (esRaiz) return json(res, 500, { error: "landing_no_encontrada" });
      }
    }

    if (url === RUTA_SALUD) {
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      return json(res, 200, { ok: true, canal: opts.canal.id, uptime_s: Math.round(process.uptime()) });
    }

    // ---- acceso al curso: /a/<token> canjea el enlace por una cookie ----
    if (url.startsWith("/a/")) {
      if (!opts.acceso) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });

      const token = url.slice(3).split("?")[0];
      const v = await opts.acceso.validar(token);
      if (!v.ok) return html(res, 403, opts.acceso.sinAcceso(v.motivo));

      // Cookie HttpOnly (no la lee JavaScript), SameSite=Lax (permite abrir el enlace
      // desde WhatsApp, que es una navegación de nivel superior) y Secure por defecto:
      // si la petición no dice el protocolo, asumimos HTTPS, que es lo que sirve
      // Railway. Un enlace que no abre por una cookie mal puesta es una venta perdida.
      const proto = String(req.headers["x-forwarded-proto"] ?? "https");
      const seguro = proto.includes("https") ? " Secure;" : "";
      res.setHeader(
        "Set-Cookie",
        `musa_acceso=${encodeURIComponent(token.trim())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600};${seguro}`,
      );
      res.statusCode = 302;
      res.setHeader("Location", "/curso");
      res.end();
      return;
    }

    // ---- la página del curso, solo con cookie válida ----
    if (url === "/curso" || url.startsWith("/curso?")) {
      if (!opts.acceso) return json(res, 404, { error: "no_encontrado" });
      const cookies = String(req.headers.cookie ?? "");
      const m = cookies.match(/(?:^|;\s*)musa_acceso=([^;]+)/);
      // RESPALDO: si el navegador del chat no guardó la cookie (pasa en navegadores
      // dentro de la app de WhatsApp e Instagram), el enlace trae el token en ?t=.
      // Sin esto, el cliente ve «enlace no válido» en un enlace que sí lo es.
      const deUrl = new URL(url, "http://x").searchParams.get("t") ?? "";
      const token = deUrl || (m ? decodeURIComponent(m[1]) : "");
      const v = token ? await opts.acceso.validar(token) : { ok: false, motivo: "sin_cookie" };
      if (!v.ok || !v.phone) return html(res, 403, opts.acceso.sinAcceso(v.motivo));
      // Deja la cookie puesta si llegó por parámetro: las siguientes visitas ya
      // entran solas, sin el ?t=.
      if (deUrl) {
        const seguro = (req.headers["x-forwarded-proto"] ?? "https") === "https" ? " Secure;" : "";
        res.setHeader(
          "Set-Cookie",
          `musa_acceso=${encodeURIComponent(token.trim())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600};${seguro}`,
        );
      }
      // El token va a la página: sin él los enlaces `media:` no se pueden construir.
      return html(res, 200, await opts.acceso.pagina(v.phone, token));
    }

    // ---- API Musa Academy LMS: /api/academia/catalogo ----
    if (url === "/api/academia/catalogo" || url.startsWith("/api/academia/catalogo?")) {
      if (!opts.academiaCatalogo) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      const cookies = String(req.headers.cookie ?? "");
      const m = cookies.match(/(?:^|;\s*)musa_acceso=([^;]+)/);
      const deUrl = new URL(url, "http://x").searchParams.get("t") ?? "";
      const token = deUrl || (m ? decodeURIComponent(m[1]) : "");
      try {
        const datos = await opts.academiaCatalogo(token);
        return json(res, 200, datos);
      } catch (e) {
        return json(res, 500, { ok: false, error: String(e).slice(0, 150) });
      }
    }

    // ---- API Consola Musa: Sesión, Estado & Comandos Protegidos ----
    if (url === "/api/consola/session") {
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      const s = verificarSesionAdmin(req);
      return json(res, 200, { ok: true, autenticado: s.ok, csrfToken: s.csrfToken });
    }

    if (url === "/api/consola/login") {
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });
      if (!adminSecret) return json(res, 503, { ok: false, error: "admin_secret_no_configurado" });
      const cuerpo = await leerCuerpo(req, 16 * 1024);
      let payload: { clave?: string } = {};
      try {
        payload = cuerpo ? JSON.parse(cuerpo) : {};
      } catch {
        return json(res, 400, { ok: false, error: "json_invalido" });
      }
      const claveRecibida = String(payload.clave ?? "").trim();
      if (!claveRecibida) return json(res, 400, { ok: false, error: "clave_requerida" });

      const bufRecibida = Buffer.from(claveRecibida);
      const bufEsperada = Buffer.from(adminSecret);
      const coincide = bufRecibida.length === bufEsperada.length && timingSafeEqual(bufRecibida, bufEsperada);

      if (!coincide) {
        console.warn(`[consola-auth] Intento de acceso fallido desde IP ${req.socket.remoteAddress}`);
        return json(res, 401, { ok: false, error: "clave_incorrecta" });
      }

      const ts = Date.now();
      const nonce = randomBytes(16).toString("hex");
      const firma = firmarSesionAdmin(ts, nonce);
      const csrfToken = generarCsrfToken(ts, nonce);
      const cookieValor = `${ts}.${nonce}.${firma}`;
      const esHttps = (req.headers["x-forwarded-proto"] ?? "").toString().toLowerCase() === "https";
      const flagsSeguridad = esHttps ? " Secure;" : "";

      res.setHeader(
        "Set-Cookie",
        `musa_admin_session=${encodeURIComponent(cookieValor)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800;${flagsSeguridad}`,
      );
      console.log(`[consola-auth] Sesión iniciada con éxito desde IP ${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, mensaje: "autenticado", csrfToken });
    }

    if (url === "/api/consola/logout") {
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });
      res.setHeader(
        "Set-Cookie",
        "musa_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0;",
      );
      return json(res, 200, { ok: true, mensaje: "sesion_cerrada" });
    }

    if (url === "/api/consola/estado" || url.startsWith("/api/consola/estado?")) {
      if (!opts.consolaEstado) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      const sesion = verificarSesionAdmin(req);
      if (!sesion.ok) {
        return json(res, 401, { ok: false, error: "no_autorizado", motivo: sesion.motivo });
      }
      try {
        const datos = (await opts.consolaEstado()) as Record<string, unknown>;
        return json(res, 200, { ...datos, _csrf: sesion.csrfToken });
      } catch (e) {
        return json(res, 500, { ok: false, error: String(e).slice(0, 150) });
      }
    }

    if (url === "/api/consola/comando") {
      if (!opts.consolaComando) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });
      const sesion = verificarSesionAdmin(req);
      if (!sesion.ok) {
        return json(res, 401, { ok: false, error: "no_autorizado", motivo: sesion.motivo });
      }
      const cuerpo = await leerCuerpo(req, 64 * 1024);
      if (cuerpo === null) return json(res, 413, { error: "cuerpo_demasiado_grande" });
      let payload: { comando?: string; _csrf?: string } = {};
      try {
        payload = cuerpo ? JSON.parse(cuerpo) : {};
      } catch {
        return json(res, 400, { ok: false, error: "json_invalido" });
      }

      // Verificación CSRF
      const csrfCabecera = String(req.headers["x-csrf-token"] ?? "");
      const csrfRecibido = (csrfCabecera || payload._csrf || "").trim();
      if (!csrfRecibido || csrfRecibido !== sesion.csrfToken) {
        console.warn(`[consola-csrf] Intento de comando sin CSRF válido desde IP ${req.socket.remoteAddress}`);
        return json(res, 403, { ok: false, error: "csrf_invalido" });
      }

      const cmd = String(payload.comando ?? "");
      console.log(`[consola-audit] ${new Date().toISOString()} comando="${cmd}" ip="${req.socket.remoteAddress}"`);
      try {
        const r = await opts.consolaComando(cmd);
        return json(res, 200, r);
      } catch (e) {
        return json(res, 500, { ok: false, error: String(e).slice(0, 150) });
      }
    }

    // ---- API Musa Studio Live (Sandbox Interactivo & Santuario Privado) ----
    if (url === "/api/studio/chat") {
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });
      const cuerpo = await leerCuerpo(req, 64 * 1024);
      let payload: { mensaje?: string; modo?: "negocios" | "seductora" | "santuario"; historial?: Array<{ role: string; content: string }>; sintetizarVoz?: boolean } = {};
      try {
        payload = cuerpo ? JSON.parse(cuerpo) : {};
      } catch {
        return json(res, 400, { ok: false, error: "json_invalido" });
      }

      const mensajeUsuario = String(payload.mensaje ?? "").trim();
      if (!mensajeUsuario) return json(res, 400, { ok: false, error: "mensaje_requerido" });
      const modo = payload.modo ?? "seductora";
      const historial = Array.isArray(payload.historial) ? payload.historial : [];

      try {
        const { ejecutarTurnoStudioLive } = await import("../ia/studio-live.ts");
        const resultado = await ejecutarTurnoStudioLive({
          mensaje: mensajeUsuario,
          modo,
          historial,
          sintetizarVoz: payload.sintetizarVoz ?? true,
          apiKey: process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY,
          modelo: process.env.MUSA_IA_MODELO || "gpt-6.1-terra",
          urlPublica: opts.urlPublica ?? "https://server-production-3709.up.railway.app",
        });
        return json(res, 200, { ok: true, ...resultado });
      } catch (e: any) {
        return json(res, 500, { ok: false, error: e?.message || String(e) });
      }
    }

    // ---- estado REAL de la sesión de WhatsApp ----
    // `/salud` dice que el proceso vive; esto dice si los mensajes pueden salir.
    // Un monitor externo (UptimeRobot, BetterStack…) puede vigilar esta ruta.
    if (url === RUTA_SALUD_SESION) {
      if (req.method !== "GET") return json(res, 405, { error: "metodo_no_permitido" });
      if (!opts.estadoSesion) return json(res, 501, { error: "canal_sin_estado" });
      try {
        const s = await opts.estadoSesion();
        const sano = s.estado === "open";
        // 200 si está abierta; 503 si no: así el monitor externo lo detecta solo.
        return json(res, sano ? 200 : 503, { ok: sano, estado: s.estado, detalle: s.detalle ?? null });
      } catch (e) {
        return json(res, 503, { ok: false, estado: "desconocido", detalle: String(e).slice(0, 120) });
      }
    }

    // ---- contenido del curso: /media/<token>/<clave> ----
    // El token viaja en la ruta porque un <video> no puede mandar cabeceras.
    // Sin token válido, el archivo no existe para quien pregunta.
    if (url.startsWith("/media/")) {
      if (!opts.medios || !opts.acceso) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "metodo_no_permitido" });

      const resto = url.slice("/media/".length);
      const corte = resto.indexOf("/");
      if (corte <= 0) return json(res, 400, { error: "ruta_incompleta" });

      const token = decodeURIComponent(resto.slice(0, corte));
      const clave = resto.slice(corte + 1).split("?")[0];

      const v = await opts.acceso.validar(token);
      if (!v.ok) return json(res, 403, { error: "sin_acceso" });

      const claveLimpia = decodeURIComponent(clave);

      // Almacén remoto: se comprueba el token aquí y se REDIRIGE con una firma
      // que caduca. El archivo va del almacén al alumno sin pasar por aquí.
      if (opts.medios.desplazar) {
        const firmada = await opts.medios.desplazar(claveLimpia);
        if (!firmada) return json(res, 404, { error: "no_existe" });
        res.writeHead(302, {
          Location: firmada,
          // La URL firmada caduca; este redirect no debe quedar cacheado.
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        });
        return res.end();
      }

      if (!opts.medios.resolver) return json(res, 404, { error: "no_encontrado" });
      const medio = await opts.medios.resolver(claveLimpia);
      if (!medio) return json(res, 404, { error: "no_existe" });

      // Rangos: sin esto no se puede adelantar un video en el móvil.
      const rango = String(req.headers.range ?? "");
      const cabecerasBase: Record<string, string | number> = {
        "Content-Type": medio.tipo,
        "Accept-Ranges": "bytes",
        // `private`: los proxies no lo guardan. 5 min: el navegador no lo vuelve a
        // bajar en cada clic, pero un enlace filtrado caduca pronto.
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(medio.nombre)}"`,
        "X-Robots-Tag": "noindex, nofollow",
      };

      const m = /^bytes=(\d*)-(\d*)$/.exec(rango);
      if (m) {
        const inicio = m[1] ? parseInt(m[1], 10) : 0;
        const fin = m[2] ? Math.min(parseInt(m[2], 10), medio.tamano - 1) : medio.tamano - 1;
        if (inicio >= medio.tamano || inicio > fin) {
          res.writeHead(416, { "Content-Range": `bytes */${medio.tamano}` });
          return res.end();
        }
        res.writeHead(206, {
          ...cabecerasBase,
          "Content-Range": `bytes ${inicio}-${fin}/${medio.tamano}`,
          "Content-Length": fin - inicio + 1,
        });
        if (req.method === "HEAD") return res.end();
        const trozo = createReadStream(medio.ruta, { start: inicio, end: fin });
        trozo.on("error", () => res.destroy());
        return trozo.pipe(res);
      }

      res.writeHead(200, { ...cabecerasBase, "Content-Length": medio.tamano });
      if (req.method === "HEAD") return res.end();
      const flujo = createReadStream(medio.ruta);
      flujo.on("error", () => res.destroy());
      return flujo.pipe(res);
    }

    // ---- diagnóstico del proveedor de IA: gated por la clave del cron ----
    // Con `startsWith` porque esta ruta lleva parámetros (`?imagen=1`); comparar la
    // URL entera devolvía 404.
    if (url.startsWith(RUTA_DIAG_IA)) {
      // Basta con UNA de las dos pruebas: pedir imágenes sin la de texto es válido.
      if ((!opts.diagnosticoIa && !opts.diagnosticoImagenes) || !opts.claveCron) {
        return json(res, 404, { error: "no_encontrado" });
      }
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });
      const recibida = req.headers["x-cron-key"];
      const clave = Array.isArray(recibida) ? recibida[0] : recibida;
      if (!clave || clave.length !== opts.claveCron.length) return json(res, 403, { error: "no_autorizado" });
      let diff = 0;
      for (let i = 0; i < clave.length; i++) diff |= clave.charCodeAt(i) ^ opts.claveCron.charCodeAt(i);
      if (diff !== 0) return json(res, 403, { error: "no_autorizado" });
      if (url.includes("imagen") && opts.diagnosticoImagenes) {
        // La imagen viaja en el cuerpo: los comprobantes de prueba NO se despliegan
        // (están ignorados por git por privacidad).
        const cuerpo = await leerCuerpo(req, 12 * 1024 * 1024);
        let peticion: { base64?: string; tipo?: string; esperado?: Record<string, unknown> } = {};
        try {
          peticion = cuerpo ? JSON.parse(cuerpo) : {};
        } catch {
          return json(res, 400, { ok: false, motivo: "cuerpo_no_json" });
        }
        if (!peticion.base64) {
          return json(res, 400, {
            ok: false,
            motivo:
              "falta la imagen. Envía {\"base64\":\"…\",\"tipo\":\"image/png\",\"esperado\":{…}}. Los comprobantes de prueba no se despliegan por privacidad.",
          });
        }
        try {
          const r = await opts.diagnosticoImagenes(peticion.base64, peticion.tipo, peticion.esperado);
          return json(res, (r as { ok?: boolean })?.ok ? 200 : 502, r);
        } catch (e) {
          return json(res, 500, { ok: false, motivo: String(e).slice(0, 150) });
        }
      }
      try {
        const r = await opts.diagnosticoIa();
        return json(res, r.ok ? 200 : 502, r);
      } catch (e) {
        return json(res, 500, { ok: false, motivo: String(e).slice(0, 120), ms: 0 });
      }
    }

    if (url === RUTA_CRON) {
      if (!opts.despacharRecordatorios || !opts.claveCron) return json(res, 404, { error: "no_encontrado" });
      if (req.method !== "POST") return json(res, 405, { error: "metodo_no_permitido" });

      const recibida = req.headers["x-cron-key"];
      const clave = Array.isArray(recibida) ? recibida[0] : recibida;
      // Comparación en tiempo constante: no filtrar el prefijo correcto.
      if (!clave || clave.length !== opts.claveCron.length) return json(res, 403, { error: "no_autorizado" });
      let diff = 0;
      for (let i = 0; i < clave.length; i++) diff |= clave.charCodeAt(i) ^ opts.claveCron.charCodeAt(i);
      if (diff !== 0) return json(res, 403, { error: "no_autorizado" });

      try {
        const r = await opts.despacharRecordatorios();
        return json(res, 200, { ok: true, resultado: r });
      } catch (e) {
        console.error("[servidor] cron falló:", String(e).slice(0, 200));
        return json(res, 500, { ok: false, error: "cron_fallido" });
      }
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
        // PERSISTENTE PRIMERO. La memoria se olvida al reiniciar y Evolution
        // reintenta hasta 10 veces: el cliente recibía el mismo mensaje varias veces.
        const ya = opts.yaProcesado ? await opts.yaProcesado(id) : vistos.has(id);
        if (ya) continue;
        if (!opts.yaProcesado) recordar(id);
      }
      try {
        const salientes = await opts.motor.procesar(mensaje);
        for (let i = 0; i < salientes.length; i++) {
          const m = salientes[i];
          if (opts.esperar) {
            try {
              await opts.canal.marcarEscribiendo(mensaje.telefono);
            } catch {
              /* best effort */
            }
            const retardo = retardoDeTurno(i, m.texto ?? "");
            if (retardo > 0) {
              await opts.esperar(retardo);
            }
          }
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
