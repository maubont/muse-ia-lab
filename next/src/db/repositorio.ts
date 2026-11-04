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
import { partirMensaje, limitarTurno, retardoDeTurno, retardoMs } from "../motor/ritmo.ts";
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
        await consultar(
          "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
          [phone, texto],
        ).catch(() => ({ rows: [] }));
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
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body, media_url, media_type) values ($1, 'out', $2, $3, $4)",
        [phone, media.texto, media.url, media.tipo],
      ).catch(() => ({ rows: [] }));
      if (!r.ok) await registrarEnvioFallido(phone, r.status, r.motivo);
    },

    // ── Respuestas inteligentes contextuales con gpt-6-luna (y fallback determinista) ─
    async gptResponder(args: { instruccion?: string; abortarSiEscala?: boolean; phone?: string }) {
      const apiKey = (process.env.MUSA_IA_KEY || "").trim();
      const phone = args.phone;
      if (!apiKey || !phone) {
        return { escalo: true };
      }

      void canal.marcarEscribiendo(phone).catch?.(() => {});

      let leadRow: { nombre?: string; profile_name?: string; estado_funnel?: string; mayor_18?: boolean } | undefined;
      try {
        const { rows } = await consultar(
          "select nombre, profile_name, estado_funnel, mayor_18 from public.musa_leads where phone = $1",
          [phone],
        );
        leadRow = rows[0] as typeof leadRow;
      } catch {
        leadRow = undefined;
      }

      let ultimoMensaje = "";
      try {
        const { rows: msgs } = await consultar(
          "select body from public.musa_messages where lead_phone = $1 and direction = 'in' order by created_at desc, id desc limit 1",
          [phone],
        );
        ultimoMensaje = (msgs[0]?.body as string) || "";
      } catch {
        ultimoMensaje = "";
      }

      const { generarRespuestaConversacional } = await import("../ia/conversacion.ts");
      const resp = await generarRespuestaConversacional(
        { consultar, urlPublica, presupuestoDiarioUsd: 1.0 },
        {
          phone,
          nombre: leadRow?.nombre ?? leadRow?.profile_name ?? null,
          estadoFunnel: leadRow?.estado_funnel ?? "S06_CIERRE",
          mayor18: leadRow?.mayor_18 === true,
          ultimoMensaje,
          instruccionEspecifica: args.instruccion,
        },
      );

      await canal.enviar(phone, { texto: resp.texto }).catch(() => ({ ok: false }));
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
        [phone, resp.texto],
      ).catch(() => ({ rows: [] }));

      await this.registrarEvento(
        phone,
        resp.origen === "ia_luna" ? "gpt_luna_respondido" : "gpt_no_implementado",
        {
          origen: resp.origen,
          latencia_ms: resp.latenciaMs,
          escalo: resp.escalo,
        },
      );

      if (resp.escalo) {
        await consultar(
          "update public.musa_leads set escalado_humano = true, updated_at = now() where phone = $1",
          [phone],
        ).catch(() => {});
        if (telefonoOperador) {
          await canal.enviar(telefonoOperador, {
            texto: `🔔 Musa escaló a humano con ${phone} tras prometer consultar al equipo.`,
          }).catch(() => {});
        }
      }

      return { escalo: resp.escalo };
    },

    async gptFallback(phone) {
      const apiKey = (process.env.MUSA_IA_KEY || "").trim();

      void canal.marcarEscribiendo(phone).catch?.(() => {});

      if (!apiKey) {
        const msg =
          "¡Aquí estoy para ayudarte! ✨ Recuerda que el curso completo *Modelos IA* (13 módulos paso a paso + 4 bonos + acceso de por vida a Musa Studio) tiene un único pago promocional de *33.000 COP* (≈ *9 USD*).\n\n" +
          "✨ Si deseas degustar la plataforma antes de decidirte, puedes ver la *Clase 1 gratis* aquí:\n" +
          "https://server-production-3709.up.railway.app/academia.html\n\n" +
          "¿Te gustaría que te comparta los datos de Nequi o Bancolombia para activar tu acceso completo, o tienes alguna duda específica?";
        await canal.enviar(phone, { texto: msg }).catch(() => ({ ok: false }));
        await consultar(
          "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
          [phone, msg],
        ).catch(() => ({ rows: [] }));
        await this.registrarEvento(phone, "gpt_no_implementado", { motivo: "fallback" });
        return;
      }

      let leadRow: { nombre?: string; profile_name?: string; estado_funnel?: string; mayor_18?: boolean } | undefined;
      try {
        const { rows } = await consultar(
          "select nombre, profile_name, estado_funnel, mayor_18 from public.musa_leads where phone = $1",
          [phone],
        );
        leadRow = rows[0] as typeof leadRow;
      } catch {
        leadRow = undefined;
      }

      let ultimoMensaje = "";
      try {
        const { rows: msgs } = await consultar(
          "select body from public.musa_messages where lead_phone = $1 and direction = 'in' order by created_at desc, id desc limit 1",
          [phone],
        );
        ultimoMensaje = (msgs[0]?.body as string) || "";
      } catch {
        ultimoMensaje = "";
      }

      const { generarRespuestaConversacional } = await import("../ia/conversacion.ts");
      const resp = await generarRespuestaConversacional(
        { consultar, urlPublica, presupuestoDiarioUsd: 1.0 },
        {
          phone,
          nombre: leadRow?.nombre ?? leadRow?.profile_name ?? null,
          estadoFunnel: leadRow?.estado_funnel ?? "S06_CIERRE",
          mayor18: leadRow?.mayor_18 === true,
          ultimoMensaje,
          metaRetorno: "¿Te comparto los datos de Nequi o prefieres Bancolombia para activar tu acceso hoy? 😊",
        },
      );

      await canal.enviar(phone, { texto: resp.texto }).catch(() => ({ ok: false }));
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
        [phone, resp.texto],
      ).catch(() => ({ rows: [] }));

      await this.registrarEvento(
        phone,
        resp.origen === "ia_luna" ? "gpt_luna_respondido" : "gpt_no_implementado",
        {
          origen: resp.origen,
          latencia_ms: resp.latenciaMs,
          escalo: resp.escalo,
        },
      );

      if (resp.escalo) {
        await consultar(
          "update public.musa_leads set escalado_humano = true, updated_at = now() where phone = $1",
          [phone],
        ).catch(() => {});
        if (telefonoOperador) {
          await canal.enviar(telefonoOperador, {
            texto: `🔔 Musa escaló a humano con ${phone} tras prometer consultar al equipo.`,
          }).catch(() => {});
        }
      }
    },

    async responderObjecion(phone, args) {
      const apiKey = (process.env.MUSA_IA_KEY || "").trim();

      const respuestas: Record<number, string> = {
        1: "Te entiendo perfecto 🙏 Por eso te dejo una muestra REAL del curso para que la pruebes gratis hoy mismo 👇\n\n🎨 *Retrato hiperrealista de una mujer joven latina, fotografía profesional, luz natural dorada, piel realista con textura, 85mm f/1.4*\n\nAdemás, apenas verifico tu comprobante recibes tu enlace personal al área del curso con los 13 módulos y 4 bonos al instante.",
        2: "Te entiendo 🙏 Por eso el acceso es de solo *33.000 COP* (≈ *9 USD*) en un único pago de por vida, sin mensualidades ni cobros ocultos, e incluye los 13 módulos y los 4 bonos completos.",
        3: "¡Sí! 🚀 Apenas verifico tu comprobante te entrego por este mismo chat tu enlace personal a Musa Academy con los 13 módulos y los 4 bonos listos para ver.",
        4: "Totalmente 💪 El curso arranca desde CERO en el Módulo 1 y te lleva paso a paso hasta crear y monetizar tu primer modelo virtual, sin necesidad de experiencia previa.",
        5: "Sí 🌎 Todo el curso es 100 % online y tanto las herramientas de IA como las plataformas de monetización funcionan desde Colombia y cualquier país.",
        6: "Son *33.000 COP* (≈ *9 USD*) pago único 🙌 Puedes pagar por *Nequi, llave Bre-B o Bancolombia*. ¿Te paso los datos para hacerlo ahora?",
        7: "Incluye *13 módulos prácticos* (creación de modelos hiperrealistas, consistencia facial, video IA, TikTok/Instagram, Telegram, Fanvue, ManyChat y prompts) + *4 bonos exclusivos* + la *Guía Rápida de Implementación* por *33.000 COP* (≈ *9 USD*) pago único.",
        8: "Sí 😊 Crear y gestionar personajes ficticios generados con IA es completamente legal. El curso enseña a crear identidades 100 % originales.",
        9: "¡Por supuesto! ✨ Tú nunca muestras tu cara ni tu cuerpo: creas y diriges modelos virtuales con IA detrás de cámara.",
        10: "Te garantizamos la entrega inmediata y verificable de los 13 módulos + 4 bonos en tu área privada apenas envíes tu comprobante, con soporte directo por este mismo WhatsApp 📲",
        11: "Lo hicimos accesible a propósito (*33.000 COP* / *9 USD* pago único) para que cualquier persona en Colombia pueda empezar sin barreras.",
        12: "¡Claro, tómate tu tiempo! 😊 Recuerda que en tus primeras 24 horas tienes incluida de regalo la *Guía Rápida de Implementación*. Cuando quieras continuar, solo avísame cuando desees continuar ✨",
        13: "Sí 😄 Soy Musa, la asistente virtual de Modelos IA. Y automatizar la atención así con IA es justamente una de las habilidades que aprenderás dentro del curso 😉",
      };

      const temasObjecion: Record<number, string> = {
        1: "El lead pide una muestra o tiene desconfianza. Valida con empatía, menciona la Clase 1 gratis en la academia y entrega el prompt de muestra si lo pide.",
        2: "El lead pregunta por el precio o siente que es caro. Explica que son solo 33.000 COP (≈ 9 USD) en único pago de por vida sin mensualidades.",
        3: "El lead pregunta si la entrega es inmediata. Confirma que se entrega al instante tras validar el comprobante por este mismo chat.",
        4: "El lead pregunta si necesita un computador potente o si puede desde el celular. Aclara con calidez que todo corre en la nube y puede hacerlo desde su celular o PC básico.",
        5: "El lead pregunta si funciona en su país. Confirma que las herramientas y plataformas funcionan desde Colombia y cualquier país.",
        6: "El lead pregunta cómo pagar. Indica que puede por Nequi, Bancolombia o Bre-B.",
        7: "El lead pregunta qué incluye. Resume los 13 módulos prácticos + 4 bonos + Guía Rápida de Implementación.",
        8: "El lead pregunta si es legal. Confirma que crear personajes ficticios con IA es 100% legal.",
        9: "El lead pregunta si debe mostrar su cara o cuerpo. Aclara que jamás; todo es generado con IA de forma 100% anónima.",
        10: "El lead pregunta por garantía. Confirma la entrega completa y soporte directo por WhatsApp.",
        11: "El lead pregunta por qué es tan accesible. Explica que se busca democratizar el acceso en Colombia.",
        12: "El lead dice que lo va a pensar. Respeta su tiempo y recuérdale con calidez el bono de 24 horas.",
        13: "El lead pregunta si es un bot. Admítelo con orgullo y simpatía, y úsalo como demo del Módulo 12 (automatización ManyChat).",
      };

      void canal.marcarEscribiendo(phone).catch?.(() => {});

      let texto = "";
      if (apiKey) {
        try {
          let leadRow: { nombre?: string; profile_name?: string; estado_funnel?: string; mayor_18?: boolean } | undefined;
          const { rows } = await consultar(
            "select nombre, profile_name, estado_funnel, mayor_18 from public.musa_leads where phone = $1",
            [phone],
          );
          leadRow = rows[0] as typeof leadRow;

          const { rows: msgs } = await consultar(
            "select body from public.musa_messages where lead_phone = $1 and direction = 'in' order by created_at desc, id desc limit 1",
            [phone],
          );
          const ultimoMensaje = (msgs[0]?.body as string) || "";

          const { generarRespuestaConversacional } = await import("../ia/conversacion.ts");
          const resp = await generarRespuestaConversacional(
            { consultar, urlPublica, presupuestoDiarioUsd: 1.0 },
            {
              phone,
              nombre: leadRow?.nombre ?? leadRow?.profile_name ?? null,
              estadoFunnel: leadRow?.estado_funnel ?? "S06_CIERRE",
              mayor18: leadRow?.mayor_18 === true,
              ultimoMensaje,
              instruccionEspecifica: temasObjecion[args.id] ?? "Resuelve la duda con empatía.",
              metaRetorno: args.conRecierre ? "¿Te paso los datos de pago para Nequi o prefieres Bancolombia? 😊" : undefined,
            },
          );

          if (resp.ok && resp.texto) {
            texto = resp.texto;
            await this.registrarEvento(phone, "gpt_luna_objecion", { id: args.id, latencia_ms: resp.latenciaMs });
          }
        } catch {
          texto = "";
        }
      }

      if (!texto) {
        const base = respuestas[args.id] ?? respuestas[7];
        texto = args.conRecierre ? `${base}\n\n¿Te paso los datos de pago por Nequi o Bre-B para activar tu acceso? 😊` : base;
        await this.registrarEvento(phone, "gpt_no_implementado", { motivo: "objecion", id: args.id });
      }

      await canal.enviar(phone, { texto }).catch(() => ({ ok: false }));
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
        [phone, texto],
      ).catch(() => ({ rows: [] }));
    },
    async reaskGate(phone, motivo) {
      const texto =
        "Para continuar y pasarte los detalles del acceso, confírmame por favor si eres mayor de 18 años 😊 (Respóndeme *Sí* o tu edad).";
      void canal.marcarEscribiendo(phone).catch?.(() => {});
      await canal.enviar(phone, { texto }).catch(() => ({ ok: false }));
      await consultar(
        "insert into public.musa_messages (lead_phone, direction, body) values ($1, 'out', $2)",
        [phone, texto],
      ).catch(() => ({ rows: [] }));
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
