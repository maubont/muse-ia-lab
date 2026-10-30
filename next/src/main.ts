// next/src/main.ts — PUNTO DE ENTRADA del servidor de Musa.
//
//   EVOLUTION_URL=… EVOLUTION_APIKEY=… EVOLUTION_INSTANCE=… EVOLUTION_JWT_KEY=… \
//     node --experimental-strip-types next/src/main.ts
//
// Qué hace, en orden y sin sorpresas:
//   1. lee la configuración del entorno (por NOMBRE; nunca imprime valores)
//   2. si falta algo, sale con código 2 y dice QUÉ falta
//   3. construye el canal y arranca el servidor en 0.0.0.0:PORT
//
// El motor es hoy `motorEco`: repite el texto y deja ver el `MensajeEntrante`.
// Sirve para ensayar la conectividad (Fase 1.4) sin número y sin gastar tokens.
// Cuando el funnel esté completo, aquí se inyecta el motor real: es una línea.

import { crearServidor } from "./api/servidor.ts";
import { crearCanalEvolution } from "../../functions/canal/evolution.ts";
import { leerConfigCanal, describirConfig } from "./config.ts";
import { motorEco } from "./motor/contrato.ts";
import type { Motor } from "./motor/contrato.ts";
import type { Entorno } from "./config.ts";
import type { Consultar } from "./db/repositorio.ts";
import type { OpcionesServidor } from "./api/servidor.ts";
import type { DepsMotorReal } from "./motor/motor-real.ts";
import { crearVigilante, alertarPorWebhook } from "./monitor/vigilante.ts";
import { revisarConfigAlerta } from "./monitor/alertas.ts";

export interface OpcionesArranque {
  /** inyectable en pruebas */
  env?: Entorno;
  /** 0 = puerto efímero; en contenedor se usa PORT */
  puerto?: number;
  host?: string;
  /** inyectable en pruebas: evita tocar la base de datos */
  motor?: Motor;
  /** inyectable en pruebas */
  esperar?: (ms: number) => Promise<void>;
  /** inyectable en pruebas */
  despacharRecordatorios?: () => Promise<unknown>;
  /** inyectable en pruebas */
  claveCron?: string;
  /** apagar el vigilante de sesión en pruebas (por defecto se enciende) */
  vigilar?: boolean;
}

/**
 * Construye el motor:
 *  · con `DATABASE_URL` -> motor real contra Postgres (carga `pg` dinámicamente)
 *  · sin ella           -> motorEco, que solo hace eco (ensayo de conectividad)
 */
async function construirMotor(env: Entorno): Promise<Motor> {
  const urlBaseDatos = (env.DATABASE_URL ?? "").trim();
  if (!urlBaseDatos) return motorEco();

  const { crearConexion } = await import("./db/pool.ts");
  const { crearMotorReal } = await import("./motor/motor-real.ts");
  const { configDesdeEntorno: configIa } = await import("./vision/proveedor.ts");
  const { leerComprobante } = await import("./vision/lector.ts");

  const conexion = crearConexion(urlBaseDatos);
  const cfgIa = configIa(env as Record<string, string | undefined>);
  // Se calcula UNA vez y se registra el número efectivo: si alguien escribe mal el
  // nombre de la variable, el log mostrará 1 y no el valor que creía haber puesto.
  const presupuestoDiario = Number(env.MUSA_PRESUPUESTO_DIARIO_USD ?? 1);

  // El lector vive aquí porque necesita la conexión. Sin proveedor devuelve
  // `cola_humana`: el comprobante lo mira una persona, nunca se auto-valida.
  const lector: DepsMotorReal["lector"] = (entrada) =>
    leerComprobante(
      {
        consultar: conexion.consultar,
        proveedor: cfgIa,
        presupuestoDiario,
        descargarImagen: async (url: string) => {
          if (!url) return null;
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) return null;
            return {
              bytes: Buffer.from(await res.arrayBuffer()),
              tipo: res.headers.get("content-type") ?? "image/jpeg",
            };
          } catch {
            return null;
          }
        },
      },
      entrada as never,
    );

  console.log(`[musa] motor real contra Postgres · presupuesto IA ${presupuestoDiario} USD/día`);
  return crearMotorReal({
    consultar: conexion.consultar,
    canal: crearCanalEvolutionConfig(env),
    urlPublica: (env.MUSA_URL_PUBLICA ?? "").trim() || undefined,
    lector,
  });
}

/** Canal construido solo con el entorno (para el motor real). */
function crearCanalEvolutionConfig(env: Entorno) {
  return crearCanalEvolution({
    baseUrl: (env.EVOLUTION_URL ?? "").replace(/\/+$/, ""),
    instancia: env.EVOLUTION_INSTANCE ?? "musa",
    apiKey: env.EVOLUTION_APIKEY ?? "",
    jwtKey: env.EVOLUTION_JWT_KEY ?? "",
    secretoWebhook: env.EVOLUTION_WEBHOOK_SECRET || undefined,
    nombreCabeceraSecreto: env.EVOLUTION_WEBHOOK_HEADER || undefined,
  });
}

export interface ServidorArrancado {
  puerto: number;
  cerrar: () => Promise<void>;
  rutas: { salud: string; webhook: string };
}

/**
 * Arranca el servidor. No llama a `process.exit`: devuelve el control para poder
 * probarlo en el mismo proceso.
 */
export async function arrancar(opciones: OpcionesArranque = {}): Promise<ServidorArrancado> {
  const env = opciones.env ?? process.env;
  const config = leerConfigCanal(env);

  if (!config.ok) {
    // Se lanza con el mensaje ya redactado: nunca incluye valores.
    throw new Error(describirConfig(config));
  }

  const canal = crearCanalEvolution(config.config);
  const motor = opciones.motor ?? await construirMotor(env);

  // El cron solo existe si hay base de datos y clave configurada.
  const urlBaseDatos = (env.DATABASE_URL ?? "").trim();
  const claveCron = (opciones.claveCron ?? env.MUSA_CRON_KEY ?? "").trim();
  let despacharRecordatorios = opciones.despacharRecordatorios;

  // Una sola conexión para todo lo que use la base.
  let consultar: Consultar | undefined;
  if (urlBaseDatos) {
    const { crearConexion } = await import("./db/pool.ts");
    consultar = crearConexion(urlBaseDatos).consultar;
  }

  if (consultar && claveCron && !despacharRecordatorios) {
    const { despacharRecordatorios: despachar } = await import("./motor/despachar.ts");
    const canalCron = crearCanalEvolutionConfig(env);
    const consultarCron = consultar;
    despacharRecordatorios = () =>
      despachar({ consultar: consultarCron, canal: canalCron, esperar: opciones.esperar });
    console.log("[musa] cron de recordatorios: POST /cron/recordatorios");
  }

  // Lector de comprobantes: prefil tro -> cache -> presupuesto -> proveedor.
  // Si no hay proveedor configurado, todo va a la cola humana (nunca a ciegas).
  const { configDesdeEntorno: configIa } = await import("./vision/proveedor.ts");
  const cfgIa = configIa(env as Record<string, string | undefined>);
  console.log(
    cfgIa
      ? `[musa] visión: ${cfgIa.modelo} · presupuesto ${env.MUSA_PRESUPUESTO_DIARIO_USD ?? "1"} USD/día`
      : "[musa] visión: sin proveedor · los comprobantes van a la cola humana",
  );

  // Acceso al curso: /a/<token> canjea el enlace por una cookie.
  let acceso: OpcionesServidor["acceso"];
  if (consultar) {
    const { validarToken } = await import("./acceso/accesos.ts");
    const { paginaCurso, paginaSinAcceso } = await import("./acceso/pagina.ts");
    const { leerConfigFunnel } = await import("./db/config-funnel.ts");
    const consultarAcceso = consultar;
    acceso = {
      validar: (token: string) => validarToken(consultarAcceso, token, true),
      pagina: async (phone: string, token?: string) => {
        const cfg = await leerConfigFunnel(consultarAcceso);
        const { rows } = await consultarAcceso("select nombre, profile_name from public.musa_leads where phone = $1", [phone]);
        const fila = rows[0] as { nombre?: string | null; profile_name?: string | null } | undefined;
        const nombre = fila?.nombre ?? fila?.profile_name ?? null;
        return paginaCurso(cfg.entrega as never, nombre, { token });
      },
      // Un enlace roto no puede terminar en una pantalla muda: si hay número de
      // soporte, la página ofrece pedir uno nuevo.
      sinAcceso: (motivo?: string) =>
        paginaSinAcceso(
          motivo,
          process.env.MUSA_SOPORTE_WA
            ? `https://wa.me/${process.env.MUSA_SOPORTE_WA}?text=${encodeURIComponent("Hola, mi enlace del curso no abre")}`
            : undefined,
        ),
    };
    console.log("[musa] acceso al curso: GET /a/<token> → /curso");
  }

  // Almacén de contenido: los archivos del curso detrás del mismo token.
  // Local por ahora; cuando el curso pese se cambia por R2 sin tocar nada más.
  let medios: OpcionesServidor["medios"];
  const { configDesdeEntorno } = await import("./acceso/almacen-s3.ts");
  const cfgS3 = configDesdeEntorno(env as Record<string, string | undefined>);

  if (cfgS3) {
    // Almacén de objetos: el archivo NO pasa por este servidor.
    const { crearAlmacenS3 } = await import("./acceso/almacen-s3.ts");
    const remoto = crearAlmacenS3(cfgS3);
    medios = { desplazar: (clave: string) => remoto.desplazar(clave) };
    console.log(`[musa] medios: objetos · bucket ${cfgS3.bucket} · URL firmada ${cfgS3.segundos}s`);
  } else {
    const dirMedios = (env.MUSA_MEDIOS_DIR ?? "").trim();
    if (dirMedios) {
      const { crearAlmacenLocal } = await import("./acceso/medios.ts");
      const almacen = crearAlmacenLocal(dirMedios);
      medios = { resolver: (clave: string) => almacen.resolver(clave) };
      console.log(`[musa] medios: GET /media/<token>/<clave> · ${dirMedios}`);
    } else {
      console.log("[musa] medios: sin almacén configurado, /media no existe");
    }
  }

  // Deduplicación PERSISTENTE: el insert con «on conflict do nothing» devuelve fila
  // solo la primera vez. Sobrevive a reinicios y a varias réplicas.
  const yaProcesado = consultar
    ? async (id: string): Promise<boolean> => {
        try {
          const { rows } = await consultar(
            "insert into public.musa_mensajes_vistos (id_externo) values ($1) on conflict (id_externo) do nothing returning id_externo",
            [id],
          );
          return rows.length === 0;
        } catch {
          // Si la tabla no existe todavía, no se bloquea el webhook: se procesa.
          return false;
        }
      }
    : undefined;

  const servidor = crearServidor({
    canal,
    motor,
    yaProcesado,
    // La landing vive dentro del mismo contenedor: el servicio corre desde la raíz
    // del repo, así que la carpeta ya está desplegada.
    landingDir: process.env.MUSA_LANDING_DIR ?? "next/landing",
    // La opción explícita manda sobre el entorno: así se puede apagar en pruebas.
    landingHabilitada: opciones.landingHabilitada ?? process.env.MUSA_LANDING !== "0",
    host: opciones.host ?? "0.0.0.0",
    despacharRecordatorios,
    claveCron,
    estadoSesion: canal.estadoSesion ? () => canal.estadoSesion!() : undefined,
    acceso,
    medios,
    // Prueba mínima del proveedor: «configurado» y «funciona» no son lo mismo.
    diagnosticoIa: cfgIa
      ? async () => {
          const { probarProveedor } = await import("./vision/proveedor.ts");
          return probarProveedor(cfgIa);
        }
      : undefined,
    // Prueba con una imagen que envía el cliente: los comprobantes de prueba NO se
    // despliegan (están ignorados por git por privacidad), así que viajan en la
    // petición y el servidor solo responde lo que leyó.
    diagnosticoImagenes: cfgIa
      ? async (base64: string, tipo?: string, esperado?: Record<string, unknown>) =>
          (await import("./vision/diagnostico.ts")).diagnosticarImagenSuelta(cfgIa, base64, esperado as never, {
            tipo,
            consultar,
          })
      : undefined,
  });

  const puerto = await servidor.escuchar(opciones.puerto ?? Number(env.PORT ?? 8080));
  console.log(`[musa] ${describirConfig(config)} · escuchando en :${puerto}`);
  console.log("[musa] webhook: POST /webhook/evolution · salud: GET /salud · sesión: GET /salud/sesion");

  // Monitor de sesión. Avisa por FUERA de WhatsApp: si WhatsApp está caído, avisar
  // por WhatsApp no sirve de nada.
  // La configuración se revisa AL ARRANCAR: mejor saber hoy que la alerta no va a
  // llegar, que descubrirlo el día de la caída.
  const webhookAlerta = (env.MUSA_ALERTA_WEBHOOK ?? "").trim();
  const chatAlerta = (env.MUSA_ALERTA_CHAT_ID ?? "").trim();
  const revision = revisarConfigAlerta(webhookAlerta || undefined, chatAlerta || undefined);
  console.log(revision.ok ? "[musa] alertas: configuradas" : `[musa] alertas: ${revision.motivo}`);

  const vigilante = crearVigilante({
    leerEstado: async () => {
      if (!canal.estadoSesion) return { estado: "desconocido", detalle: "canal_sin_estado" };
      return await canal.estadoSesion();
    },
    alertar: (texto) =>
      alertarPorWebhook(
        (env.MUSA_ALERTA_WEBHOOK ?? "").trim() || undefined,
        texto,
        (env.MUSA_ALERTA_CHAT_ID ?? "").trim() || undefined,
      ),
  });
  if (opciones.vigilar !== false) vigilante.arrancar(Number(env.MUSA_MONITOR_MS ?? 5 * 60_000));

  return {
    puerto,
    vigilante,
    cerrar: async () => {
      vigilante.detener();
      await servidor.cerrar();
    },
    rutas: { salud: "/salud", sesion: "/salud/sesion", webhook: "/webhook/evolution" },
  };
}

// ---- entrada de línea de comandos ----
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "")) {
  arrancar()
    .then((s) => {
      const apagar = async () => {
        await s.cerrar();
        process.exit(0);
      };
      process.on("SIGINT", apagar);
      process.on("SIGTERM", apagar);
    })
    .catch((e) => {
      console.error("[musa] no arranca:", e instanceof Error ? e.message : String(e));
      process.exit(2);
    });
}
