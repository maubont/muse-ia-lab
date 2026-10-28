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

export interface OpcionesArranque {
  /** inyectable en pruebas */
  env?: Entorno;
  /** 0 = puerto efímero; en contenedor se usa PORT */
  puerto?: number;
  host?: string;
  /** inyectable en pruebas: evita tocar la base de datos */
  motor?: Motor;
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
  const conexion = crearConexion(urlBaseDatos);
  console.log("[musa] motor real contra Postgres");
  return crearMotorReal({ consultar: conexion.consultar, canal: crearCanalEvolutionConfig(env) });
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
  const servidor = crearServidor({
    canal,
    motor: opciones.motor ?? await construirMotor(env),
    host: opciones.host ?? "0.0.0.0",
  });

  const puerto = await servidor.escuchar(opciones.puerto ?? Number(env.PORT ?? 8080));
  console.log(`[musa] ${describirConfig(config)} · escuchando en :${puerto}`);
  console.log("[musa] webhook: POST /webhook/evolution · salud: GET /salud");

  return {
    puerto,
    cerrar: () => servidor.cerrar(),
    rutas: { salud: "/salud", webhook: "/webhook/evolution" },
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
