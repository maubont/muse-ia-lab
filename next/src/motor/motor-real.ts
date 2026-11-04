// next/src/motor/motor-real.ts — el MOTOR que corre de verdad contra Postgres.
//
// Es la costura final: recibe un `MensajeEntrante` del canal, carga el lead, pide
// la decisión al enrutador, ejecuta los efectos y persiste. No inventa nada: si
// una pieza no está (GPT, visión), el enrutador y el repositorio ya saben qué
// hacer de forma segura.
//
// CONTRATO CON EL SERVIDOR: este motor envía por su cuenta (los efectos `enviar`
// pasan por el repositorio y de ahí al canal), así que devuelve `[]`. Si devolviera
// los mensajes, el servidor los enviaría otra vez.

import type { Motor } from "./contrato.ts";
import type { MensajeEntrante, MensajeSaliente, Canal } from "../../../functions/canal/tipos.ts";
import type { Consultar } from "../db/repositorio.ts";
import { crearRepositorio } from "../db/repositorio.ts";
import { leerConfigFunnel } from "../db/config-funnel.ts";
import type { CfgFunnel } from "../db/config-funnel.ts";
import { decidirRuta } from "./router.ts";
import { atenderComandoOperador } from "./cola-revision.ts";
import { ejecutar } from "./ejecutar.ts";
import type { ClasificacionGPT } from "./efectos.ts";
import { normalizar } from "../../../functions/motor/guardarrailes.ts";
import { recordatoriosParaEstado, cuandoEnviar, ajustarAHorario } from "./recordatorios.ts";
import { dentroDeHorarioRazonable } from "./politica-contacto.ts";
import { MSG_PAGO_REENVIO } from "./s08.ts";

export interface DepsMotorReal {
  consultar: Consultar;
  canal: Canal;
  /** Se recalcula cada cierto tiempo; por defecto cada 60 s. */
  ttlConfigMs?: number;
  /** Clasificador GPT. Sin él, las heurísticas deciden y el resto se re-pregunta. */
  clasificar?: (mensaje: MensajeEntrante, estado: string) => Promise<ClasificacionGPT>;
  ahora?: () => Date;
  /** Espera entre mensajes; inyectable para que las pruebas no duerman. */
  esperar?: (ms: number) => Promise<void>;
  /** Dominio público; sin él la entrega manda los enlaces sueltos. */
  urlPublica?: string;
  apiKeyIa?: string;
  modeloIa?: string;
  urlIa?: string;
  /**
   * Lector de comprobantes. Si no se pasa, S08 recibe `datos: null` y el caso va
   * a la cola humana — nunca se auto-valida un pago sin haberlo leído.
   */
  lector?: (entrada: {
    lead: string;
    media: { url: string; tipo: string; tamano?: number };
    yaPago: boolean;
    bytes?: Buffer;
  }) => Promise<
    | { ok: true; datos: unknown; origen: string; coste: number }
    | { ok: false; accion: "pedir_reenvio" | "cola_humana"; motivo: string; coste: number }
  >;
}

interface LeadFila {
  phone: string;
  profile_name: string | null;
  nombre: string | null;
  pais: string | null;
  estado_funnel: string;
  mayor_18: boolean | null;
  opt_out: boolean;
  escalado_humano: boolean;
  email: string | null;
  pagado: boolean;
  last_in_at: string | null;
}

const SQL_UPSERT = `
  insert into public.musa_leads (phone, profile_name, estado_funnel, last_in_at, bono_rapido_hasta)
  values ($1, $2, 'S00_LLEGADA', now(), now() + interval '24 hours')
  on conflict (phone) do update
    set last_in_at = now(),
        profile_name = coalesce(excluded.profile_name, public.musa_leads.profile_name),
        updated_at = now()
  returning phone, profile_name, nombre, pais, estado_funnel, mayor_18, opt_out, escalado_humano, pagado, last_in_at, email
`;

const SQL_MENSAJE = `
  insert into public.musa_messages (lead_phone, direction, body, media_url, media_type, estado_funnel)
  values ($1, 'in', $2, $3, $4, $5)
`;

/** Al recibir un mensaje, se cancelan los recordatorios pendientes: el lead volvió. */
const SQL_CANCELAR_RECORDATORIOS = `
  update public.musa_recordatorios
     set cancelado_en = now(), motivo = 'lead_respondio'
   where lead_phone = $1 and enviado_en is null and cancelado_en is null
`;

const SQL_PROGRAMAR_RECORDATORIO = `
  insert into public.musa_recordatorios (lead_phone, tipo, programado_para, motivo)
  values ($1, $2, $3, $4)
`;

/** Lee el país del lead (columnas reales de la fila). */
function aLead(fila: LeadFila) {
  return {
    phone: fila.phone,
    profile_name: fila.profile_name,
    nombre: fila.nombre,
    pais: fila.pais,
    estado_funnel: fila.estado_funnel,
    mayor_18: fila.mayor_18,
    opt_out: fila.opt_out,
    escalado_humano: fila.escalado_humano,
    email: fila.email,
    pagado: fila.pagado,
    last_in_at: fila.last_in_at,
  };
}

// Un correo escrito por el cliente se guarda como canal de respaldo: si WhatsApp
// cae, es la única forma de avisarle que su acceso sigue vivo.
const CORREO_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function crearMotorReal(deps: DepsMotorReal): Motor {
  const { consultar, canal } = deps;
  const ttl = deps.ttlConfigMs ?? 60_000;
  const ahora = deps.ahora ?? (() => new Date());

  let cache: { cfg: CfgFunnel; cargado: number } | null = null;

  const configuracion = async (): Promise<CfgFunnel> => {
    const t = ahora().getTime();
    if (cache && t - cache.cargado < ttl) return cache.cfg;
    const cfg = await leerConfigFunnel(consultar);
    cache = { cfg, cargado: t };
    return cfg;
  };

  return {
    async procesar(mensaje: MensajeEntrante): Promise<MensajeSaliente[]> {
      const t0 = Date.now();
      const cfg = await configuracion();

      // 0. el lead volvió: no hay nada que recordarle
      await consultar(SQL_CANCELAR_RECORDATORIOS, [mensaje.telefono]).catch(() => ({ rows: [] }));

      // 1. lead: crear o tocar (la base decide: `on conflict`)
      const { rows } = await consultar(SQL_UPSERT, [mensaje.telefono, mensaje.nombre_perfil]);
      const fila = rows[0] as unknown as LeadFila | undefined;
      if (!fila) throw new Error("upsert de lead sin fila devuelta");
      const lead = aLead(fila);

      // 1.b Transcripción de audio / notas de voz con IA:
      if (mensaje.media && mensaje.media.tipo === "audio" && (!mensaje.texto || mensaje.texto.trim() === "")) {
        try {
          const bytes = await mensaje.media.obtenerBytes();
          if (bytes && bytes.byteLength > 0) {
            const { transcribirAudio } = await import("./transcriptor-audio.ts");
            const textoTranscrito = await transcribirAudio(Buffer.from(bytes), mensaje.media.mime ?? "audio/ogg");
            if (textoTranscrito) {
              console.log(`[musa] nota de voz transcrita (${mensaje.telefono}): "${textoTranscrito.slice(0, 80)}"`);
              mensaje.texto = textoTranscrito;
            }
          }
        } catch (e) {
          console.warn("[musa] error transcribiendo nota de voz:", String(e).slice(0, 100));
        }
      }

      // 1.c CAPTURA DEL CORREO. No se pide: si el cliente lo escribe, se guarda.
      // Es el único canal que sobrevive a un bloqueo de WhatsApp, así que la base de
      // compradores deja de depender solo de Meta.
      const correoVisto = (mensaje.texto ?? "").match(CORREO_RE)?.[0]?.toLowerCase();
      if (correoVisto && lead.email !== correoVisto) {
        await consultar("update public.musa_leads set email = $2, updated_at = now() where phone = $1", [
          mensaje.telefono,
          correoVisto,
        ]).catch(() => ({ rows: [] }));
      }

      // 2. dejar rastro del mensaje entrante ANTES de decidir
      await consultar(SQL_MENSAJE, [
        mensaje.telefono,
        mensaje.texto || null,
        mensaje.media?.url ?? null,
        mensaje.media?.mime ?? null,
        lead.estado_funnel,
      ]);

      // 3. clasificación (solo si hay clasificador; sin él, la heurística manda)
      const clasificacion = deps.clasificar && mensaje.texto
        ? await deps.clasificar(mensaje, lead.estado_funnel)
        : null;

      // 4. decisión
      // 4.5. Si el estado es S08 y llegó un adjunto, se LEE aquí: es el único punto
      //      donde el comprobante se convierte en datos. Si la lectura no da datos,
      //      S08 recibe null y manda el caso a un humano — nunca auto-valida.
      let comprobante: { datos: unknown; esPrimerPago: boolean; imagenDuplicada: boolean; dentroDeHorario: boolean } | undefined;
      const dentroDeHorario = dentroDeHorarioRazonable(ahora(), "America/Bogota");

      if (lead.estado_funnel === "S08_ESPERA_CAPTURA" && mensaje.media && deps.lector) {
        // OJO: el adaptador de Evolution entrega `obtenerBytes()`, NO una URL.
        // Antes se pasaba `url ?? ""` y toda imagen real caía en «sin_imagen»:
        // el cliente entraba en un bucle de reenvíos y la visión nunca corría.
        let bytes: Buffer | undefined;
        try {
          const crudo = await mensaje.media.obtenerBytes();
          if (crudo && crudo.byteLength > 0) bytes = Buffer.from(crudo);
        } catch {
          bytes = undefined;
        }

        const lectura = await deps.lector({
          lead: mensaje.telefono,
          media: {
            url: mensaje.media.url ?? "",
            tipo: mensaje.media.mime ?? "",
            tamano: bytes ? bytes.length : undefined,
          },
          yaPago: lead.pagado === true,
          bytes,
        });

        if (lectura.ok) {
          comprobante = {
            datos: lectura.datos,
            esPrimerPago: lead.pagado !== true,
            // Una lectura que viene de la caché significa que ESTA MISMA IMAGEN ya
            // se procesó antes. Si no se marca, dos leads pueden enviar la misma
            // captura y los dos reciben el curso.
            imagenDuplicada: lectura.origen === "cache",
            dentroDeHorario,
          };
        } else if (lectura.accion === "pedir_reenvio") {
          // No se puede leer ese archivo (PDF, vacío, no bajó): se pide otro. No
          // se molesta al operador por algo que el cliente arregla en un mensaje.
          await ejecutar(
            [
              { tipo: "evento", nombre: "comprobante_no_leible", detalle: { motivo: lectura.motivo } },
              { tipo: "enviar", textos: [MSG_PAGO_REENVIO] },
            ],
            { repo: crearRepositorio({ consultar, canal, telefonoOperador: cfg.operador?.whatsapp ?? "", esperar: deps.esperar, urlPublica: deps.urlPublica }), phone: mensaje.telefono },
          );
          await consultar(
            "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1,$2,$3::jsonb)",
            [mensaje.telefono, "respuesta_enviada", JSON.stringify({ ms: Date.now() - t0, estado: lead.estado_funnel })],
          ).catch(() => ({ rows: [] }));
          return [];
        } else {
          // Sin proveedor, sin presupuesto o el proveedor falló: a un humano, con acuse.
          comprobante = { datos: null, esPrimerPago: lead.pagado !== true, imagenDuplicada: false, dentroDeHorario };
        }
      }

      // ── COMANDO DEL OPERADOR ──────────────────────────────────────────────
      // El dueño recibe avisos que dicen «Responde: ok <id>». Hasta ahora ese
      // mensaje se trataba como un lead nuevo: el bot le mandaba el saludo. Aquí
      // se atiende primero, y solo si viene del número del operador.
      const { interpretarComando, normalizarTelefono } = await import("./comandos-operador.ts");
      const esOperador =
        !!cfg.operador?.whatsapp &&
        normalizarTelefono(mensaje.telefono) === normalizarTelefono(cfg.operador.whatsapp);
      const comando = esOperador ? interpretarComando(mensaje.texto) : null;

      if (comando) {
        const repoOps = crearRepositorio({
          consultar,
          canal,
          telefonoOperador: cfg.operador?.whatsapp ?? "",
          esperar: deps.esperar,
          urlPublica: deps.urlPublica,
        });
        await atenderComandoOperador(comando, repoOps, consultar, canal, mensaje.telefono, deps.urlPublica);
        return [];
      }

      const urlBase = (deps.urlPublica ?? "https://server-production-3709.up.railway.app").replace(/\/+$/, "");
      const avatar = {
        url: `${urlBase}/assets/demo.mp4`,
        rama: "A",
      };

      const efectos = decidirRuta({
        lead,
        cfg: cfg as never,
        body: mensaje.texto,
        norm: normalizar(mensaje.texto),
        clasificacion,
        comprobante: comprobante as never,
        avatar,
      });

      // 5. ejecución contra Postgres
      const repo = crearRepositorio({
        consultar,
        canal,
        telefonoOperador: cfg.operador?.whatsapp ?? "",
        esperar: deps.esperar,
        urlPublica: deps.urlPublica,
        apiKeyIa: deps.apiKeyIa,
        modeloIa: deps.modeloIa,
        urlIa: deps.urlIa,
      });
      const resumen = await ejecutar(efectos, { repo, phone: mensaje.telefono });

      // `dupeRef` significa que la referencia ya existía en otro pago. El ejecutor
      // ya se detuvo, pero hasta ahora ese resultado se descartaba en silencio: ni
      // aviso al operador ni revisión. Ahora se escala.
      if (resumen.dupeRef) {
        await ejecutar(
          [
            { tipo: "evento", nombre: "pago_duplicado", detalle: { motivo: "referencia_ya_registrada" } },
            { tipo: "notificar_operador", texto: `Pago con referencia repetida: ${mensaje.telefono}` },
          ],
          { repo, phone: mensaje.telefono },
        );
      }

      // 6. recordatorios: si el estado cambió, se programan los del nuevo estado.
      //    `ajustarAHorario` evita que caigan de madrugada.
      const nuevoEstado = efectos.filter((e) => e.tipo === "estado").at(-1);
      if (nuevoEstado && nuevoEstado.tipo === "estado" && nuevoEstado.nuevo !== lead.estado_funnel) {
        for (const r of recordatoriosParaEstado(nuevoEstado.nuevo)) {
          const cuando = ajustarAHorario(cuandoEnviar(ahora(), r.enMinutos));
          await consultar(SQL_PROGRAMAR_RECORDATORIO, [mensaje.telefono, r.tipo, cuando.toISOString(), r.texto])
            .catch(() => ({ rows: [] }));
        }
      }

      // 7. métrica que decide: cuánto tardó la primera respuesta
      await consultar(
        "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1,$2,$3::jsonb)",
        [mensaje.telefono, "respuesta_enviada", JSON.stringify({ ms: Date.now() - t0, estado: lead.estado_funnel })],
      ).catch(() => ({ rows: [] }));

      // El motor envía por los efectos; devolver algo aquí duplicaría el envío.
      return [];
    },
  };
}

/** Reexportado para las pruebas. */
export type { Motor };
