// next/src/motor/despachar.ts — EL CRON QUE ENVÍA LOS RECORDATORIOS VENCIDOS.
//
// `musa_recordatorios` ya se llena, pero nadie la leía: cada fila es una promesa
// sin cumplir. Esto la cumple —con las reglas puestas:
//
//   · nunca a quien pidió salir (opt_out)
//   · nunca fuera de la ventana de 24 h
//   · nunca fuera del horario razonable
//   · nunca más de 3 seguimientos por lead
//
// Si un recordatorio no se puede enviar, NO se pierde: se reprograma o se cancela
// con el motivo. Un silencio sin rastro es lo que hace imposible depurar después.

import type { Consultar } from "../db/repositorio.ts";
import type { Canal } from "../../../functions/canal/tipos.ts";
import { puedeSeguir } from "./politica-contacto.ts";
import { ajustarAHorario } from "./recordatorios.ts";

export interface DepsDespacho {
  consultar: Consultar;
  canal: Canal;
  ahora?: () => Date;
  /** cuántos por pasada: un cron cada minuto no debe arrasar la cola */
  lote?: number;
  esperar?: (ms: number) => Promise<void>;
}

export interface ResumenDespacho {
  vencidos: number;
  enviados: number;
  reprogramados: number;
  cancelados: number;
  fallidos: number;
}

interface FilaRecordatorio {
  id: string;
  lead_phone: string;
  tipo: string;
  motivo: string | null;
  programado_para: string;
}

interface FilaLead {
  phone: string;
  opt_out: boolean;
  escalado_humano: boolean;
  pagado: boolean;
  estado_funnel: string;
  last_in_at: string | null;
  last_out_at: string | null;
  seguimientos_enviados: number | null;
}

const SQL_VENCIDOS = `
  select id, lead_phone, tipo, motivo, programado_para
    from public.musa_recordatorios
   where programado_para <= now() and enviado_en is null and cancelado_en is null
   order by programado_para
   limit $1
`;

const SQL_LEAD = `
  select phone, opt_out, escalado_humano, pagado, estado_funnel,
         last_in_at, last_out_at, seguimientos_enviados
    from public.musa_leads where phone = $1
`;

const SQL_MARCAR_ENVIADO = `
  update public.musa_recordatorios set enviado_en = now() where id = $1
`;

const SQL_REPROGRAMAR = `
  update public.musa_recordatorios set programado_para = $2, motivo = $3 where id = $1
`;

const SQL_CANCELAR = `
  update public.musa_recordatorios set cancelado_en = now(), motivo = $2 where id = $1
`;

const SQL_CONTAR_SEGUIMIENTO = `
  update public.musa_leads
     set seguimientos_enviados = coalesce(seguimientos_enviados, 0) + 1,
         last_out_at = now(), updated_at = now()
   where phone = $1
`;

const SQL_EVENTO = `
  insert into public.musa_funnel_events (lead_phone, evento, detalle) values ($1,$2,$3::jsonb)
`;

/**
 * Envía una pasada de recordatorios vencidos.
 * Devuelve qué pasó con cada uno, para poder mirarlo en los logs.
 */
export async function despacharRecordatorios(deps: DepsDespacho): Promise<ResumenDespacho> {
  const { consultar, canal } = deps;
  const ahora = deps.ahora ?? (() => new Date());
  const lote = deps.lote ?? 20;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const resumen: ResumenDespacho = { vencidos: 0, enviados: 0, reprogramados: 0, cancelados: 0, fallidos: 0 };

  const { rows } = await consultar(SQL_VENCIDOS, [lote]);
  resumen.vencidos = rows.length;

  for (const rec of rows as unknown as FilaRecordatorio[]) {
    const { rows: leads } = await consultar(SQL_LEAD, [rec.lead_phone]);
    const lead = leads[0] as unknown as FilaLead | undefined;

    // Lead inexistente: no hay a quién escribir.
    if (!lead) {
      await consultar(SQL_CANCELAR, [rec.id, "lead_inexistente"]);
      resumen.cancelados++;
      continue;
    }

    // Dio de baja o ya pagó: no se le persigue.
    if (lead.opt_out) {
      await consultar(SQL_CANCELAR, [rec.id, "opt_out"]);
      resumen.cancelados++;
      continue;
    }
    if (lead.pagado) {
      await consultar(SQL_CANCELAR, [rec.id, "ya_pago"]);
      resumen.cancelados++;
      continue;
    }

    const permiso = puedeSeguir({
      ahora: ahora(),
      ultimoEntrante: lead.last_in_at ? new Date(lead.last_in_at) : null,
      ultimoSaliente: lead.last_out_at ? new Date(lead.last_out_at) : null,
      seguimientosEnviados: lead.seguimientos_enviados ?? 0,
    });

    if (!permiso.permitido) {
      // Fuera de horario se reprograma; el resto se cancela con motivo.
      if (permiso.motivo === "fuera_de_horario") {
        const nueva = ajustarAHorario(ahora());
        await consultar(SQL_REPROGRAMAR, [rec.id, nueva.toISOString(), "reprogramado_por_horario"]);
        resumen.reprogramados++;
      } else {
        await consultar(SQL_CANCELAR, [rec.id, permiso.motivo]);
        resumen.cancelados++;
      }
      continue;
    }

    const texto = rec.motivo ?? "";
    if (!texto) {
      await consultar(SQL_CANCELAR, [rec.id, "sin_texto"]);
      resumen.cancelados++;
      continue;
    }

    try {
      void canal.marcarEscribiendo(rec.lead_phone).catch?.(() => {});
      await esperar(300);
      const r = await canal.enviar(rec.lead_phone, { texto });
      if (!r.ok) {
        // El canal falló: se reprograma para dentro de una hora, no se pierde.
        await consultar(SQL_REPROGRAMAR, [rec.id, new Date(ahora().getTime() + 3600_000).toISOString(), "reintento_por_fallo"]);
        await consultar(SQL_EVENTO, [rec.lead_phone, "recordatorio_fallido", JSON.stringify({ tipo: rec.tipo, motivo: r.motivo ?? null })]);
        resumen.fallidos++;
        continue;
      }
      await consultar(SQL_MARCAR_ENVIADO, [rec.id]);
      await consultar(SQL_CONTAR_SEGUIMIENTO, [rec.lead_phone]);
      await consultar(SQL_EVENTO, [rec.lead_phone, "recordatorio_enviado", JSON.stringify({ tipo: rec.tipo })]);
      resumen.enviados++;
    } catch (e) {
      await consultar(SQL_EVENTO, [rec.lead_phone, "recordatorio_error", JSON.stringify({ tipo: rec.tipo, error: String(e).slice(0, 120) })]);
      resumen.fallidos++;
    }
  }

  return resumen;
}
