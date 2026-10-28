// next/src/db/pool.ts — conexión real a Postgres, con `pg`.
//
// Se importa DINÁMICAMENTE desde main.ts: si no hay DATABASE_URL (por ejemplo en
// local o en las pruebas), este módulo nunca se carga y `pg` no hace falta.
//
// `DATABASE_URL` es interna de Railway (`*.railway.internal`) y solo resuelve
// dentro del proyecto. Para conectarse desde fuera hace falta el proxy TCP.

import pg from "pg";
import type { Consultar } from "./repositorio.ts";

export interface Conexion {
  consultar: Consultar;
  cerrar: () => Promise<void>;
}

export function crearConexion(connectionString: string, opciones: { max?: number } = {}): Conexion {
  const pool = new pg.Pool({
    connectionString,
    max: opciones.max ?? 5,
    // Railway Postgres no exige TLS en la red privada; si algún día se usa el
    // proxy público, habrá que activarlo aquí.
    ssl: false,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return {
    consultar: async (sql, params) => {
      const r = await pool.query(sql, params as never);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    cerrar: () => pool.end(),
  };
}
