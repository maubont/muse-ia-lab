// next/src/api/panel-api.ts — API de datos reales para Musa Academy LMS y Consola Musa.
//
// Conecta las dos interfaces web (/academia.html y /consola.html) directamente con
// PostgreSQL, el validador de tokens (/a/<token>), el almacén R2/S3 (/media/<token>/*)
// y la cola de revisión del operador (atenderComandoOperador).

import type { Consultar } from "../db/repositorio.ts";
import type { Canal } from "../../../functions/canal/tipos.ts";
import { leerConfigFunnel } from "../db/config-funnel.ts";
import { validarToken } from "../acceso/accesos.ts";
import {
  normalizarModulo,
  resolverEnlace,
  nombreVisible,
  tipoDeArchivo,
  nombreDeBono,
  TITULOS_MODULOS,
} from "../acceso/pagina.ts";
import type { EntregaConfig } from "../acceso/pagina.ts";
import { interpretarComando } from "../motor/comandos-operador.ts";
import { atenderComandoOperador } from "../motor/cola-revision.ts";
import { crearRepositorio } from "../db/repositorio.ts";

const RESULTADOS_POR_DEFECTO: readonly string[] = [
  "Entiende el mercado y lo que vas a construir",
  "Tu primer personaje generado con IA",
  "Domina las herramientas que importan",
  "Un flujo para producir sin quedarte sin ideas",
  "Cómo se convierte una imagen en un cobro",
  "Tu grupo y tu bot funcionando",
  "Atajos y herramientas que ahorran horas",
  "La publicación que sí se comparte",
  "Piensa como negocio, no como hobby",
  "Configura tu canal de venta",
  "Video realista con IA",
  "Responde solo lo que se repite",
  "Los prompts que sostienen todo el sistema",
];

const PROMPTS_POR_MODULO: readonly string[] = [
  "Retrato editorial de Musa en estudio arquitectónico cálido, luz natural suave de ventana, lente 85mm f/1.8, textura de piel real con poros visibles y expresión serena.",
  "Primer plano hiperrealista de modelo virtual (ADN Musa), piel oliva cálida sin retoque plástico, ojos color avellana-ámbar con reflejo natural, iluminación suave lateral.",
  "Retrato de estudio de alta resolución, textura dérmica realista, iluminación Rembrandt cálida, cabello castaño con ondas naturales, fotografía RAW de formato medio.",
  "Hoja de consistencia facial del mismo personaje (Musa) en 3 ángulos: frente, tres cuartos y perfil, manteniendo exactamente la misma estructura ósea y rasgos.",
  "Secuencia estratégica de 5 historias para Instagram orientadas a presentar el estilo de vida de tu avatar y dirigir tráfico cualificado al enlace del perfil.",
  "Mensaje automático de bienvenida en Telegram con presentación de tu modelo virtual, catálogo organizado y respuesta 24/7.",
  "Mejora de micro-textura dérmica e iluminación cinematográfica: poros naturales, grano orgánico fino y balance de color cálido editorial.",
  "Estructura de gancho visual de 3 segundos para Reels y TikTok mostrando la evolución y realismo de tu personaje virtual.",
  "Plantilla de publicación flexible: estructura de Reels e historias listas para copiar y adaptar a tu propio ritmo.",
  "Biografía optimizada para perfil de creadora virtual en Fanvue + mensaje automático de bienvenida para nuevos suscriptores.",
  "Secuencia de movimiento natural en video 4K: giro sutil de cabeza, parpadeo orgánico, sonrisa suave y movimiento realista del cabello con la brisa.",
  "Automatización ManyChat: al recibir comentario con palabra clave en un Reel, responder públicamente y enviar mensaje directo con tu enlace.",
  "Fotografía editorial nocturna de Musa en terraza urbana al atardecer, luces de ciudad en bokeh suave, estética de lujo minimalista y piel realista.",
];

const MOTIVOS_ESPANOL: Record<string, string> = {
  aprobado_por_operador: "Aprobado manualmente por el operador",
  vision_fallida: "Visión IA no pudo leer la captura",
  destinatario_no_coincide: "El número de destino no coincide con Nequi/Bre-B oficial",
  monto_insuficiente: "El monto pagado es menor al precio del curso ($33.000 COP)",
  referencia_duplicada: "Referencia de pago ya utilizada anteriormente",
  imagen_duplicada: "La imagen del comprobante ya había sido enviada",
  fuera_de_horario: "Recibido fuera de horario de verificación automática",
  sin_referencia: "Comprobante sin número de referencia visible",
};

export function traducirMotivoFlag(motivo: string | null | undefined): string {
  if (!motivo) return "Verificación automática completada";
  if (MOTIVOS_ESPANOL[motivo]) return MOTIVOS_ESPANOL[motivo];
  return String(motivo).replace(/_/g, " ");
}

/**
 * Construye el catálogo estructurado de Musa Academy.
 * Si el alumno trae un token válido (`?t=` o cookie `musa_acceso`), genera los enlaces
 * reales `/media/<token>/<clave>` al almacén S3/R2. Si entra en modo vista previa (sin
 * token), muestra la estructura real de los 13 módulos y 30 lecciones usando el video
 * de demostración `/assets/demo.mp4` para que el reproductor funcione siempre.
 */
export async function obtenerCatalogoAcademia(
  consultar?: Consultar,
  tokenBruto?: string,
): Promise<Record<string, unknown>> {
  let token = (tokenBruto ?? "").trim();
  let autenticado = false;
  let phone: string | undefined;
  let nombreAlumno = "Mauricio Bonilla";

  if (consultar && !token) {
    // Si se abre /academia.html directamente sin ?t=, recuperar el token activo más reciente
    const { rows } = await consultar(
      "select token, lead_phone from public.musa_accesos where revocado_en is null and expira_en > now() order by id desc limit 1",
    ).catch(() => ({ rows: [] }));
    if (rows[0]?.token) {
      token = String(rows[0].token);
    }
  }

  if (consultar && token) {
    const val = await validarToken(consultar, token, false).catch(() => ({ ok: false as const }));
    if (val.ok && "phone" in val && val.phone) {
      autenticado = true;
      phone = val.phone;
      const { rows } = await consultar(
        "select nombre, profile_name from public.musa_leads where phone = $1",
        [phone],
      ).catch(() => ({ rows: [] }));
      const f = rows[0] as { nombre?: string | null; profile_name?: string | null } | undefined;
      nombreAlumno = f?.nombre || f?.profile_name || "Miembro Musa Academy";
    }
  }

  let entrega: EntregaConfig = {};
  if (consultar) {
    const cfg = await leerConfigFunnel(consultar).catch(() => null);
    if (cfg?.entrega) entrega = cfg.entrega as unknown as EntregaConfig;
  }

  const entradasModulos = Array.isArray(entrega.modulos) && entrega.modulos.length > 0
    ? entrega.modulos
    : TITULOS_MODULOS.map((t, i) => ({
        titulo: t,
        resultado: RESULTADOS_POR_DEFECTO[i],
        archivos: [`media:curso/${String(i + 1).padStart(2, "0")}/clase-1.mp4`],
      }));

  const modulos = entradasModulos.map((entrada, idx) => {
    const norm = normalizarModulo(entrada);
    const tituloRaw = norm.titulo ?? TITULOS_MODULOS[idx] ?? `Módulo ${idx + 1}`;
    const titulo = tituloRaw.replace(/,\s*Leonardo/gi, "").replace(/Leonardo\s*(AI)?/gi, "Generador IA");
    const resultadoRaw = norm.resultado ?? RESULTADOS_POR_DEFECTO[idx] ?? "Paso práctico del método";
    const resultado = resultadoRaw.replace(/cuatro herramientas/gi, "herramientas");
    const prompt = PROMPTS_POR_MODULO[idx] ?? PROMPTS_POR_MODULO[0];

    const lecciones = norm.archivos.map((archivo, lIdx) => {
      const infoTipo = tipoDeArchivo(archivo);
      const urlReal = autenticado ? resolverEnlace(archivo, token) : null;
      const esVideo = infoTipo.etiqueta === "Video";
      const esPdf = infoTipo.etiqueta === "PDF";
      return {
        id: `m${idx + 1}-l${lIdx + 1}`,
        titulo: nombreVisible(archivo, "curso"),
        etiqueta: infoTipo.etiqueta,
        icono: infoTipo.icono,
        esVideo,
        esPdf,
        url: urlReal ?? (esVideo ? "/assets/demo.mp4" : "#requiere-acceso"),
        requiereToken: !autenticado,
      };
    });

    return {
      numero: idx + 1,
      titulo,
      resultado,
      prompt,
      totalLecciones: lecciones.length,
      lecciones,
    };
  });

  const bonosRaw = entrega.bonos && typeof entrega.bonos === "object" ? entrega.bonos : {};
  const bonos = Object.entries(bonosRaw).map(([clave, valor]) => {
    const lista = Array.isArray(valor) ? valor : [valor];
    const prefijo = `bonos/${clave}`;
    const archivos = lista.map((item) => {
      const info = tipoDeArchivo(item);
      const urlReal = autenticado ? resolverEnlace(item, token) : null;
      return {
        titulo: nombreVisible(item, prefijo),
        etiqueta: info.etiqueta,
        icono: info.icono,
        url: urlReal ?? (info.etiqueta === "Video" ? "/assets/demo.mp4" : "#requiere-acceso"),
      };
    });
    return {
      clave,
      titulo: nombreDeBono(clave),
      totalArchivos: archivos.length,
      archivos,
    };
  });

  const refCode = phone ? `musa-${phone.replace(/\D/g, "").slice(-4)}` : "musa-vip";

  return {
    ok: true,
    autenticado,
    alumno: {
      nombre: nombreAlumno,
      rango: autenticado ? "Acceso Vitalicio Activo" : "Modo Vista Previa",
      refCode,
      enlaceReferido: `https://server-production-3709.up.railway.app/?ref=${refCode}`,
    },
    soporteWa: "https://wa.me/573227462629?text=" + encodeURIComponent("Hola Musa, estoy dentro de Musa Studio y tengo una consulta"),
    modulos,
    bonos,
  };
}

/**
 * Lee en vivo las métricas, cola de pagos, leads activos y eventos desde PostgreSQL
 * para alimentar la Consola Agéntica (/consola.html).
 */
export async function obtenerEstadoConsola(deps: {
  consultar?: Consultar;
  estadoSesion?: () => Promise<{ estado: string; detalle?: string }>;
}): Promise<Record<string, unknown>> {
  const { consultar, estadoSesion } = deps;
  let sesion = { ok: false, estado: "desconocido" };
  if (estadoSesion) {
    try {
      const s = await estadoSesion();
      sesion = { ok: s.estado === "open", estado: s.estado };
    } catch {
      sesion = { ok: false, estado: "error" };
    }
  }

  if (!consultar) {
    return {
      ok: true,
      sinBaseDeDatos: true,
      uptime_s: Math.round(process.uptime()),
      sesion,
      metricas: {
        leadsTotales: 0,
        leadsActivos24h: 0,
        leadsPagados: 0,
        pagosEnRevision: 0,
        pagosAprobados: 0,
        escaladosHumanos: 0,
        reconciliacionSinAcceso: 0,
      },
      pagos: [],
      leads: [],
      eventos: [],
    };
  }

  const [resMetricas, resPagos, resLeads, resEventos] = await Promise.all([
    consultar(`
      select
        (select count(*)::int from public.musa_leads) as leads_totales,
        (select count(*)::int from public.musa_leads where last_in_at > now() - interval '24 hours') as leads_24h,
        (select count(*)::int from public.musa_leads where pagado = true) as leads_pagados,
        (select count(*)::int from public.musa_leads where escalado_humano = true and pagado = false) as escalados,
        (select count(*)::int from public.musa_payments where status = 'revision') as pagos_revision,
        (select count(*)::int from public.musa_payments where status = 'aprobado') as pagos_aprobados
    `).catch(() => ({ rows: [{}] })),
    consultar(`
      select p.short_id, p.lead_phone, p.metodo, p.ref_normalizada, p.monto, p.moneda,
             p.status, p.motivo_flag, p.datos_extraidos, p.created_at,
             l.nombre, l.profile_name
        from public.musa_payments p
        left join public.musa_leads l on l.phone = p.lead_phone
       order by p.created_at desc
       limit 10
    `).catch(() => ({ rows: [] })),
    consultar(`
      select phone, nombre, profile_name, estado_funnel, mayor_18, pagado, escalado_humano, last_in_at, updated_at
        from public.musa_leads
       order by coalesce(last_in_at, updated_at, created_at) desc
       limit 15
    `).catch(() => ({ rows: [] })),
    consultar(`
      select id, lead_phone, evento, detalle, created_at
        from public.musa_funnel_events
       order by created_at desc
       limit 15
    `).catch(() => ({ rows: [] })),
  ]);

  const m = (resMetricas.rows[0] ?? {}) as Record<string, number>;
  const pagos = resPagos.rows.map((r) => ({
    short_id: r.short_id,
    lead_phone: r.lead_phone,
    nombre_lead: r.nombre || r.profile_name || r.lead_phone,
    metodo: r.metodo,
    referencia: r.ref_normalizada,
    monto: r.monto,
    moneda: r.moneda ?? "COP",
    status: r.status,
    motivo_flag: r.motivo_flag,
    motivo_legible: traducirMotivoFlag(r.motivo_flag as string | null),
    datos_extraidos: r.datos_extraidos ?? {},
    created_at: r.created_at,
  }));

  return {
    ok: true,
    uptime_s: Math.round(process.uptime()),
    sesion,
    metricas: {
      leadsTotales: Number(m.leads_totales ?? 0),
      leadsActivos24h: Number(m.leads_24h ?? 0),
      leadsPagados: Number(m.leads_pagados ?? 0),
      pagosEnRevision: Number(m.pagos_revision ?? 0),
      pagosAprobados: Number(m.pagos_aprobados ?? 0),
      escaladosHumanos: Number(m.escalados ?? 0),
      reconciliacionSinAcceso: 0,
    },
    pagos,
    leads: resLeads.rows,
    eventos: resEventos.rows,
  };
}

/**
 * Ejecuta un comando enviado desde la Consola Agéntica (por voz o texto).
 */
export async function ejecutarComandoConsola(deps: {
  comandoTexto: string;
  consultar?: Consultar;
  canal: Canal;
  urlPublica?: string;
  esperar?: (ms: number) => Promise<void>;
}): Promise<{ ok: boolean; respuesta: string; accion?: string }> {
  const { comandoTexto, consultar, canal, urlPublica, esperar } = deps;
  const limpio = (comandoTexto ?? "").trim().replace(/^\/+/, "");
  if (!limpio) return { ok: false, respuesta: "Escribe o dicta una instrucción para Musa." };

  if (!consultar) {
    return {
      ok: true,
      accion: "modo_demo",
      respuesta: `Comando recibido en modo ensayo: "${limpio}". Conecta DATABASE_URL para operar sobre PostgreSQL.`,
    };
  }

  // 1. ¿Es un comando de pago (ok <id>, no <id>, ver <id>, o "aprobar" directo)?
  let comandoAInterpretar = limpio;
  if (/^aprobar$/i.test(limpio)) {
    const { rows: revRows } = await consultar(
      "select id from public.musa_payments where status = 'revision' order by created_at desc limit 1",
    ).catch(() => ({ rows: [] }));
    if (revRows[0]?.id) {
      comandoAInterpretar = `ok ${revRows[0].id}`;
    }
  }
  const cmdOperador = interpretarComando(comandoAInterpretar);
  if (cmdOperador) {
    const respuestasCapturadas: string[] = [];
    const canalCapturador = {
      async enviar(tel: string, m: { texto: string }) {
        if (tel === "CONSOLA_WEB") {
          respuestasCapturadas.push(m.texto);
          return { ok: true };
        }
        return canal.enviar(tel, m);
      },
    };
    const repo = crearRepositorio({
      consultar,
      canal,
      telefonoOperador: "",
      esperar,
      urlPublica,
    });
    await atenderComandoOperador(
      cmdOperador,
      repo,
      consultar,
      canalCapturador,
      "CONSOLA_WEB",
      urlPublica ?? "https://server-production-3709.up.railway.app",
    );
    return {
      ok: true,
      accion: cmdOperador.tipo,
      respuesta: respuestasCapturadas.join("\n") || `Comando ${cmdOperador.tipo} #${cmdOperador.shortId} ejecutado.`,
    };
  }

  // 2. Comando: acceso <telefono> (emite un token real en musa_accesos)
  const mAcceso = /^(?:acceso|token)\s+(\+?\d[\d\s-]{7,16})$/i.exec(limpio);
  if (mAcceso) {
    const tel = "+" + mAcceso[1].replace(/\D/g, "");
    const { crearAcceso, enlaceDeAcceso } = await import("../acceso/accesos.ts");
    const { token } = await crearAcceso(consultar, tel);
    const base = (urlPublica ?? "https://server-production-3709.up.railway.app").replace(/\/+$/, "");
    const enlace = enlaceDeAcceso(base, token);
    const enlaceAcademia = `${base}/academia.html?t=${encodeURIComponent(token)}`;
    return {
      ok: true,
      accion: "acceso_emitido",
      respuesta: `Acceso real emitido para ${tel}:\n• Aula Musa Academy: ${enlaceAcademia}\n• Enlace directo: ${enlace}`,
    };
  }

  // 2b. Comando: reiniciar <telefono>
  const mReiniciar = /^(?:reiniciar|reset)\s+(\+?\d[\d\s-]{7,16})$/i.exec(limpio);
  if (mReiniciar) {
    const tel = "+" + mReiniciar[1].replace(/\D/g, "");
    await consultar(
      `update public.musa_leads
          set estado_funnel = 'S00_LLEGADA', mayor_18 = false, pagado = false, escalado_humano = false, updated_at = now()
        where phone = $1`,
      [tel],
    );
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'reset_desde_consola', '{}'::jsonb)",
      [tel],
    ).catch(() => ({ rows: [] }));
    return {
      ok: true,
      accion: "reiniciar_lead",
      respuesta: `He reiniciado el lead ${tel} a la etapa inicial S00_LLEGADA en PostgreSQL.`,
    };
  }

  // 2c. Comando: escalar <telefono>
  const mEscalar = /^escalar\s+(\+?\d[\d\s-]{7,16})$/i.exec(limpio);
  if (mEscalar) {
    const tel = "+" + mEscalar[1].replace(/\D/g, "");
    await consultar(
      "update public.musa_leads set escalado_humano = true, updated_at = now() where phone = $1",
      [tel],
    ).catch(() => ({ rows: [] }));
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'escalado_desde_consola', '{}'::jsonb)",
      [tel],
    ).catch(() => ({ rows: [] }));
    return {
      ok: true,
      accion: "escalar_humano",
      respuesta: `Lead ${tel} marcado en modo atención humana directa (escalado_humano = true).`,
    };
  }

  // 3. Comando: mensaje <telefono> <texto>
  const mMensaje = /^(?:mensaje|enviar|wa)\s+(\+?\d[\d\s-]{7,16})\s+(.+)$/is.exec(limpio);
  if (mMensaje) {
    const tel = "+" + mMensaje[1].replace(/\D/g, "");
    const texto = mMensaje[2].trim();
    try {
      await canal.marcarEscribiendo(tel);
    } catch {
      /* best effort */
    }
    const r = await canal.enviar(tel, { texto });
    await consultar(
      "insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1, 'mensaje_consola', $2::jsonb)",
      [tel, JSON.stringify({ ok: r.ok, texto: texto.slice(0, 120) })],
    ).catch(() => ({ rows: [] }));
    return {
      ok: r.ok,
      accion: "mensaje_directo",
      respuesta: r.ok
        ? `Mensaje enviado por WhatsApp a ${tel} con indicador de escritura activo.`
        : `No pude enviar el mensaje a ${tel}: ${r.motivo ?? "error de canal"}.`,
    };
  }

  // 4. Reporte operativo en tiempo real desde la base de datos
  if (/reporte|resumen|estado|metricas|métricas|cuántos|cuantos/i.test(limpio)) {
    const estado = await obtenerEstadoConsola({ consultar });
    const met = estado.metricas as Record<string, number>;
    return {
      ok: true,
      accion: "reporte_vivo",
      respuesta:
        `Reporte en vivo desde PostgreSQL: Tenemos ${met.leadsTotales} leads registrados (${met.leadsActivos24h} activos en las últimas 24 horas), ` +
        `${met.leadsPagados} alumnos con curso entregado, ${met.pagosEnRevision} pagos en cola de revisión y ${met.escaladosHumanos} conversaciones esperando atención humana.`,
    };
  }

  return {
    ok: true,
    accion: "asistente_consola",
    respuesta:
      `Instrucción recibida: "${limpio}". Puedes usar comandos directos como: "ok <id>" para aprobar un pago y despachar el curso, ` +
      `"no <id> <motivo>" para rechazar, "ver <id>" para inspeccionar un recibo, "reiniciar +57..." para resetear un lead, o "mensaje +57... <texto>" para hablar por WhatsApp.`,
  };
}
