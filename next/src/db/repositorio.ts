// next/src/db/repositorio.ts — el `Repositorio` REAL, contra Postgres.
//
// Es la otra mitad del ejecutor: convierte efectos en SQL. La conexión se inyecta
// (`consultar`), así que la lógica se prueba sin base de datos y en producción usa
// el pool de `pg`.
//
// Decisiones que importan:
//
//  · `reclamarEntrega` es UN SOLO UPDATE con RETURNING. Es la única forma de que
//    la carrera entre una captura y el operador se resuelva sin doble entrega.
//  · `registrarPago` distingue QUÉ restricción se violó: si es la de referencia
//    (`musa_payments_ref_unica`) devuelve `dupeRef`; si es la de `short_id`,
//    reintenta con otro id. Confundirlas rompería el dedupe de comprobantes.
//  · `actualizarLead` solo acepta columnas de una lista blanca. Nada de construir
//    SQL con las claves que vengan del motor.
//
// GPT NO está implementado aquí: no hay presupuesto para llamadas. Las cuatro
// operaciones que lo necesitan escalan a humano (la opción segura) y registran un
// evento, en vez de inventar una respuesta.

import type { Repositorio } from "../motor/ejecutar.ts";
import type { DatosComprobante } from "../../../functions/motor/comprobante.ts";
import type { Canal } from "../../../functions/canal/tipos.ts";
import { partirMensaje, limitarTurno, retardoDeTurno } from "../motor/ritmo.ts";
import { crearAcceso, enlaceDeAcceso } from "../acceso/accesos.ts";

/** Lo mínimo que hace falta de un cliente SQL. `pg.Pool.query` encaja. */
export interface Consultar {
  (sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface DepsRepositorio {
  consultar: Consultar;
  canal: Canal;
  /** WhatsApp del dueño, para las notificaciones de la cola humana. */
  telefonoOperador: string;
  /**
   * Espera entre mensajes. Inyectable para que las pruebas no duerman de verdad;
   * en producción es la real y da la sensación de que alguien escribe.
   */
  esperar?: (ms: number) => Promise<void>;
  /** Dominio público del servidor. Sin él, la entrega cae a los enlaces sueltos. */
  urlPublica?: string;
}

/** Columnas que el motor puede tocar en `musa_leads`. */
export const COLUMNAS_LEAD = new Set([
  "nombre",
  "pais",
  "estado_funnel",
  "mayor_18",
  "avatar_enviado",
  "opt_out",
    "email",
  "opt_in_vip",
  "pagado",
  "escalado_humano",
  "bono_rapido_hasta",
  "last_in_at",
  "last_out_at",
  "seguimientos_enviados",
  "ctwa_clid",
  "source_id",
  "ref_code",
]);

const REF_UNICA = "musa_payments_ref_unica";
const SHORT_ID_UNICO = "musa_payments_short_id_key";

/**
 * ¿El canal está caído (no «este mensaje falló»)?
 * Con la sesión de WhatsApp cerrada, Evolution responde 500 con «Connection
 * Closed» o el envío vence por timeout. En ambos casos no tiene sentido seguir.
 */
export function esCanalCaido(status?: number, motivo?: string): boolean {
  const m = (motivo ?? "").toLowerCase();
  if (m.includes("timeout")) return true;
  if (m.includes("connection closed")) return true;
  if (m.includes("connection failure")) return true;
  return status === 500 || status === 502 || status === 503;
}

/** Genera un id corto de 4 dígitos para la cola humana (`ok 4821`). */
export function nuevoShortId(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function crearRepositorio(deps: DepsRepositorio): Repositorio {
  const { consultar, canal, telefonoOperador } = deps;
  const urlPublica = (deps.urlPublica ?? "").trim();
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Deja rastro de un envío fallido. Nunca lanza: es telemetría, no el flujo. */  const registrarEnvioFallido = async (phone: string, status?: number, motivo?: string) => {
    try {
      await consultar(
        "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, $2, $3::jsonb)",
        [phone, "envio_fallido", JSON.stringify({ status: status ?? null, motivo: (motivo ?? "").slice(0, 200) })],
      );
    } catch {
      /* si ni esto se puede, no se rompe el flujo por telemetría */
    }
  };

  return {
    async actualizarLead(phone, patch) {
      const claves = Object.keys(patch).filter((k) => COLUMNAS_LEAD.has(k));
      if (claves.length === 0) return;
      const sets = claves.map((k, i) => `"${k}" = $${i + 2}`);
      const valores = claves.map((k) => patch[k]);
      await consultar(
        `update public.musa_leads set ${sets.join(", ")}, updated_at = now() where phone = $1`,
        [phone, ...valores],
      );
    },

    async cambiarEstado(phone, estado) {
      await consultar(
        "update public.musa_leads set estado_funnel = $2, updated_at = now() where phone = $1",
        [phone, estado],
      );
    },

    async registrarEvento(phone, nombre, detalle) {
      await consultar(
        "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, $2, $3::jsonb)",
        [phone, nombre, JSON.stringify(detalle ?? {})],
      );
    },

    async registrarPago(phone, pago) {
      const fila = montarFilaPago(phone, pago);

      for (let intento = 0; intento < 6; intento++) {
        const shortId = nuevoShortId();
        try {
          const { rows } = await consultar(
            `insert into public.musa_payments
               (lead_phone, metodo, ref_normalizada, monto, moneda, fecha_pago, status,
                datos_extraidos, motivo_flag, short_id, resolved_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
             returning id, short_id`,
            [
              phone,
              fila.metodo,
              fila.ref_normalizada,
              fila.monto,
              fila.moneda,
              fila.fecha_pago,
              pago.estado === "aprobado" ? "aprobado" : "revision",
              JSON.stringify(pago.datos ?? null),
              pago.motivo,
              shortId,
              pago.estado === "aprobado" ? new Date().toISOString() : null,
            ],
          );
          return { shortId: String(rows[0]?.short_id ?? shortId) };
        } catch (e) {
          const err = e as { code?: string; constraint?: string };
          if (err.code === "23505" && err.constraint === REF_UNICA) return { dupeRef: true };
          if (err.code === "23505" && err.constraint === SHORT_ID_UNICO) continue; // otro id
          throw e;
        }
      }
      throw new Error("no se pudo generar un short_id único tras 6 intentos");
    },

    async entregarCurso(phone, entrega) {
      // Sin dominio público no hay enlace personal: se entrega lo que hay.
      if (!urlPublica) {
        await this.enviar(phone, [...entrega.respaldo, entrega.bienvenida]);
        await this.registrarEvento(phone, "entrega_sin_acceso", { motivo: "MUSA_URL_PUBLICA sin configurar" });
        return;
      }

      const { token } = await crearAcceso(consultar, phone);
      const enlace = enlaceDeAcceso(urlPublica, token);

      const mensajeAcceso = `🎓 *Tu acceso personal:*\n${enlace}\n\nGuárdalo: es tuyo y no caduca.`;
      const envio = await this.enviar(phone, [mensajeAcceso, entrega.bienvenida]);

      if (envio.ok) {
        await this.registrarEvento(phone, "acceso_creado", {});
        return;
      }

      // PAGÓ Y NO RECIBIÓ. El pago ya quedó marcado por la barrera, así que no basta
      // con anotar el fallo: hay que reintentar y avisar a una persona. Sin esto, un
      // corte de red en el instante de la entrega dejaba al cliente sin curso y sin
      // que nadie lo supiera.
      await this.registrarEvento(phone, "entrega_fallida", {});
      await consultar(
        "insert into public.musa_recordatorios (lead_phone, tipo, programado_para, motivo) values ($1, $2, now() + interval \'15 minutes\', $3)",
        [phone, "entrega_pendiente", mensajeAcceso],
      ).catch(() => ({ rows: [] }));
      if (telefonoOperador) {
        await canal.enviar(telefonoOperador, {
          texto: `⚠️ Entregué un acceso y el envío falló. Reenvía a ${phone}:\n${enlace}`,
        });
      }
    },

    async reclamarEntrega(phone) {
      const { rows } = await consultar(
        "update public.musa_leads set pagado = true, updated_at = now() where phone = $1 and pagado = false returning phone",
        [phone],
      );
      return rows.length > 0;
    },

    async notificarOperador(texto) {
      if (!telefonoOperador) return; // sin operador configurado no se inventa un destino
      await canal.enviar(telefonoOperador, { texto });
    },

    async enviar(phone, textos) {
      // El cliente tiene que VER que alguien escribe. El «escribiendo…» se manda
      // antes de cada mensaje, y el retardo es proporcional pero acotado: la
      // sensación es humana, la espera no.
      const bloques = limitarTurno(textos.flatMap((t) => partirMensaje(t)));
      let indice = 0;
      let todoBien = true;
      for (const texto of bloques) {
        // El «escribiendo…» NO se espera: si el canal está lento sería otro
        // timeout por mensaje. Se dispara y se sigue.
        void canal.marcarEscribiendo(phone).catch?.(() => {});
        await esperar(retardoDeTurno(indice, texto));
        const r = await canal.enviar(phone, { texto });
        if (!r.ok) {
          todoBien = false;
          await registrarEnvioFallido(phone, r.status, r.motivo);
          // Canal caído: insistir con el resto solo acumula timeouts y el
          // cliente no va a recibir ninguno. Se corta el turno.
          if (esCanalCaido(r.status, r.motivo)) {
            const restantes = bloques.length - indice - 1;
            if (restantes > 0) {
              await registrarEnvioFallido(phone, undefined, `turno_abortado:${restantes}_sin_intentar`);
            }
            return { ok: false };
          }
        }
        indice++;
      }
      return { ok: todoBien };
    },

    async enviarMedia(phone, media) {
      await canal.marcarEscribiendo(phone);
      await esperar(retardoMs(media.texto));
      const r = await canal.enviar(phone, {
        texto: media.texto,
        media: { url: media.url, tipo: media.tipo },
      });
      if (!r.ok) await registrarEnvioFallido(phone, r.status, r.motivo);
    },

    // ── GPT no implementado: se escala y se registra, nunca se improvisa ────
    async gptResponder() {
      return { escalo: true };
    },
    async gptFallback(phone) {
      await this.registrarEvento(phone, "gpt_no_implementado", { motivo: "fallback" });
    },
    async responderObjecion(phone, args) {
      await this.registrarEvento(phone, "gpt_no_implementado", { motivo: "objecion", id: args.id });
    },
    async reaskGate(phone, motivo) {
      await this.registrarEvento(phone, "gpt_no_implementado", { motivo: `reask:${motivo}` });
    },
  };
}

/** Normaliza la fila del pago. La referencia va en solo dígitos, como el original. */
export function montarFilaPago(
  phone: string,
  pago: { estado: "aprobado" | "revision"; motivo: string | null; datos: DatosComprobante | null },
) {
  const d = pago.datos;
  const ref = (d?.numero_referencia ?? "").replace(/\D/g, "");
  return {
    lead_phone: phone,
    metodo: d?.metodo ? String(d.metodo).slice(0, 60) : "por_clasificar",
    ref_normalizada: ref || null,
    monto: d?.monto ?? null,
    moneda: d?.moneda ?? null,
    fecha_pago: d?.fecha ?? null,
    motivo_flag: pago.motivo,
  };
}
