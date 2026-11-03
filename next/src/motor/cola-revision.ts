// next/src/motor/cola-revision.ts — LA SALIDA DE LA COLA DE REVISIÓN.
//
// ── EL AGUJERO QUE ESTO CIERRA ──────────────────────────────────────────────
// El sistema manda al dueño un aviso que dice:
//
//     «Pago para revisar #4821 … Responde: ok 4821 / no 4821 <motivo> / ver 4821»
//
// Pero no existía ningún código que entendiera esa respuesta. Si el dueño escribía
// «ok 4821», el bot lo tomaba por un lead nuevo, le mandaba el saludo y la puerta de
// edad, y el pago se quedaba en `revision` para siempre. El cliente, que ya había
// pagado, leía «seguimos verificando» indefinidamente.
//
// Esto resuelve los tres comandos y entrega. Sin esto, todo pago dudoso es un
// cliente perdido.

import type { ComandoOperador } from "./comandos-operador.ts";

type Consultar = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

type Canal = {
  enviar: (telefono: string, mensaje: { texto: string }) => Promise<{ ok: boolean; motivo?: string }>;
};

type Repo = {
  entregarCurso: (phone: string, entrega: { bienvenida: string; respaldo: string[] }) => Promise<void>;
};

/**
 * Ejecuta el comando del operador sobre un pago en revisión.
 *
 * Aprobar hace tres cosas, en este orden y a propósito:
 *  1. marca el pago como aprobado;
 *  2. entrega el curso al cliente;
 *  3. avisa al operador de lo que pasó.
 *
 * Si la entrega falla, el pago NO se marca como resuelto en falso: se deja en
 * `revision` con el motivo del fallo, para que el operador lo vea y reintente. Es
 * peor un pago aprobado sin entrega que un pago pendiente y visible.
 */
export async function atenderComandoOperador(
  comando: ComandoOperador,
  repo: Repo,
  consultar: Consultar,
  canal: Canal,
  telefonoOperador: string,
  urlPublica?: string,
): Promise<void> {
  const responder = async (texto: string): Promise<void> => {
    await canal.enviar(telefonoOperador, { texto }).catch(() => ({ ok: false }));
  };

  // ── VER ──────────────────────────────────────────────────────────────────
  if (comando.tipo === "ver") {
    const { rows } = await consultar(
      `select p.short_id, p.lead_phone, p.metodo, p.monto, p.moneda, p.status, p.motivo_flag,
              p.datos_extraidos, p.created_at
         from public.musa_payments p
        where upper(p.short_id) = $1`,
      [comando.shortId],
    );
    const p = rows[0];
    if (!p) {
      await responder(`No encuentro el pago #${comando.shortId}.`);
      return;
    }
    const datos = (p.datos_extraidos ?? {}) as Record<string, unknown>;
    await responder(
      [
        `#${p.short_id} · ${String(p.status).toUpperCase()}`,
        `Cliente: ${p.lead_phone}`,
        `Método: ${p.metodo} · Monto: ${p.monto} ${p.moneda ?? ""}`,
        `Estado de la operación: ${datos.estado_operacion ?? "?"}`,
        `Referencia: ${datos.numero_referencia ?? "sin referencia"}`,
        `Destino leído: ${datos.destino ?? "?"}`,
        `Motivo del flag: ${p.motivo_flag ?? "ninguno"}`,
        ``,
        `Responde: ok ${p.short_id} / no ${p.short_id} <motivo>`,
      ].join("\n"),
    );
    return;
  }

  // ── Buscar el pago para aprobar o rechazar ───────────────────────────────
  const { rows } = await consultar(
    `select p.short_id, p.lead_phone, p.status
       from public.musa_payments p
      where upper(p.short_id) = $1`,
    [comando.shortId],
  );
  const pago = rows[0];
  if (!pago) {
    await responder(`No encuentro el pago #${comando.shortId}. Usa «ver ${comando.shortId}».`);
    return;
  }

  if (pago.status === "aprobado") {
    await responder(`#${comando.shortId} ya estaba aprobado. Nada que hacer.`);
    return;
  }
  if (pago.status === "rechazado") {
    await responder(`#${comando.shortId} ya estaba rechazado.`);
    return;
  }

  const telefono = String(pago.lead_phone);

  // ── RECHAZAR ─────────────────────────────────────────────────────────────
  if (comando.tipo === "rechazar") {
    await consultar(
      `update public.musa_payments
          set status = 'rechazado', motivo_flag = $2, resolved_at = now()
        where upper(short_id) = $1`,
      [comando.shortId, comando.motivo.slice(0, 200)],
    );
    await consultar(
      `insert into public.musa_funnel_events (lead_phone, evento, detalle)
       values ($1, 'pago_rechazado_operador', $2::jsonb)`,
      [telefono, JSON.stringify({ short_id: comando.shortId, motivo: comando.motivo })],
    ).catch(() => ({ rows: [] }));

    await canal
      .enviar(telefono, {
        texto:
          "❌ No pudimos validar tu comprobante.\n\n" +
          "Si el pago sí se hizo, escríbenos y lo revisamos juntos. " +
          "Si no, puedes intentarlo de nuevo cuando quieras.",
      })
      .catch(() => ({ ok: false }));

    await responder(`#${comando.shortId} rechazado. Motivo: ${comando.motivo}. Se avisó al cliente.`);
    return;
  }

  // ── APROBAR ──────────────────────────────────────────────────────────────
  if (!urlPublica) {
    await responder(
      `⚠️ #${comando.shortId}: falta MUSA_URL_PUBLICA, así que no puedo generar el enlace. ` +
        `Configúrala y vuelve a escribir «ok ${comando.shortId}».`,
    );
    return;
  }

  try {
    // La entrega crea el acceso y lo manda. Si esto falla, no marcamos nada.
    await repo.entregarCurso(telefono, {
      bienvenida:
        "🎓 *Tu pago quedó confirmado.*\n\n" +
        "Este es tu acceso al curso. Guárdalo: es tuyo y no caduca.",
      respaldo: [],
    });

    await consultar(
      `update public.musa_payments
          set status = 'aprobado', resolved_at = now(), motivo_flag = 'aprobado_por_operador'
        where upper(short_id) = $1`,
      [comando.shortId],
    );
    await consultar(
      `insert into public.musa_funnel_events (lead_phone, evento, detalle)
       values ($1, 'pago_aprobado_operador', $2::jsonb)`,
      [telefono, JSON.stringify({ short_id: comando.shortId })],
    ).catch(() => ({ rows: [] }));

    await responder(`✅ #${comando.shortId} aprobado y entregado a ${telefono}.`);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await consultar(
      `update public.musa_payments set motivo_flag = $2 where upper(short_id) = $1`,
      [comando.shortId, `aprobacion_fallo_entrega: ${motivo}`.slice(0, 200)],
    ).catch(() => ({ rows: [] }));

    await responder(
      `⚠️ #${comando.shortId}: el pago sigue en revisión porque la entrega falló ` +
        `(${motivo.slice(0, 120)}). Revisa el log y reintenta.`,
    );
  }
}