// musa-tasa-dia: actualiza la tasa del dolar paralelo (Venezuela) y el precio del dia en Bs.
// Invocada por cron (schedules de InsForge) con header x-cron-key.
import { createAdminClient } from 'npm:@insforge/sdk';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function hoyCaracas(): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

async function fetchJsonConTimeout(url: string, ms = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const esperado = Deno.env.get('MUSA_CRON_KEY');
  const recibido = req.headers.get('x-cron-key');
  if (!esperado || recibido !== esperado) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL')!,
    apiKey: Deno.env.get('API_KEY')!,
  });

  const hoy = hoyCaracas();
  const errores: string[] = [];

  // --- 2. Obtener tasa (fuente principal + fallback) ---
  let tasa: number | null = null;
  let fuente = '';

  try {
    const d = await fetchJsonConTimeout('https://ve.dolarapi.com/v1/dolares/paralelo') as Record<string, unknown>;
    const p = Number(d?.promedio);
    if (Number.isFinite(p) && p > 0) {
      tasa = p;
      fuente = 'paralelo-dolarapi';
    } else {
      errores.push('dolarapi: campo promedio invalido');
    }
  } catch (e) {
    errores.push(`dolarapi: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (tasa === null) {
    try {
      const d = await fetchJsonConTimeout('https://pydolarve.org/api/v1/dollar') as Record<string, any>;
      // best-effort: estructuras conocidas de pydolarve
      const candidatos = [
        d?.monitors?.enparalelovzla?.price,
        d?.monitors?.paralelo?.price,
        d?.monitors?.dolartoday?.price,
        d?.price,
      ];
      const p = candidatos.map(Number).find((n) => Number.isFinite(n) && n > 0);
      if (p !== undefined) {
        tasa = p;
        fuente = 'pydolarve';
      } else {
        errores.push('pydolarve: sin precio valido en la respuesta');
      }
    } catch (e) {
      errores.push(`pydolarve: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // --- Ultima tasa registrada (para fallback y para la regla del salto) ---
  const { data: prevRows, error: prevErr } = await admin.database
    .from('musa_exchange_rates')
    .select('id, fecha, fuente, tasa, created_at')
    .order('id', { ascending: false })
    .limit(1);
  if (prevErr) {
    return json({ ok: false, error: 'db_error_lectura_tasas', detalle: prevErr.message ?? prevErr }, 500);
  }
  const previa = prevRows && prevRows.length > 0 ? prevRows[0] : null;
  const tasaPrevia = previa ? Number(previa.tasa) : null;

  let usandoCache = false;

  if (tasa === null) {
    // Ambas fuentes fallaron
    const edadMs = previa ? Date.now() - new Date(previa.created_at).getTime() : Infinity;
    if (!previa || edadMs > 36 * 3600 * 1000) {
      await admin.database.from('musa_funnel_events').insert([{
        evento: 'alerta_tasa',
        detalle: { motivo: 'sin_fuente', errores, ultima_tasa: previa ?? null },
      }]);
      return json({ ok: false, motivo: 'sin_fuente', errores });
    }
    // Hay tasa reciente (<36h): usarla como cache para mantener el precio del dia
    tasa = tasaPrevia!;
    fuente = `cache-${previa.fuente}`;
    usandoCache = true;
  }

  // --- 3. Sanidad: salto >15% respecto a la tasa previa ---
  if (!usandoCache && tasaPrevia !== null && tasaPrevia > 0) {
    const cambio = Math.abs(tasa - tasaPrevia) / tasaPrevia;
    if (cambio > 0.15) {
      await admin.database.from('musa_funnel_events').insert([{
        evento: 'alerta_tasa_salto',
        detalle: { previa: tasaPrevia, nueva: tasa, cambio_pct: Math.round(cambio * 10000) / 100, fuente },
      }]);
      return json({ ok: false, motivo: 'salto_sospechoso', previa: tasaPrevia, nueva: tasa });
    }
  }

  // --- 4. Registrar la tasa del dia (solo si vino de fuente real y cambio respecto a la ultima fila) ---
  const repetida = previa !== null && previa.fecha === hoy && tasaPrevia === tasa;
  if (!usandoCache && !repetida) {
    const { error: insErr } = await admin.database
      .from('musa_exchange_rates')
      .insert([{ fecha: hoy, fuente, tasa }]);
    if (insErr) {
      return json({ ok: false, error: 'db_error_insert_tasa', detalle: insErr.message ?? insErr }, 500);
    }
  }

  // --- 5. Calcular precio del dia en Bs ---
  const { data: precioRows, error: precioErr } = await admin.database
    .from('musa_settings')
    .select('key, value')
    .eq('key', 'precio')
    .limit(1);
  if (precioErr || !precioRows || precioRows.length === 0) {
    return json({ ok: false, error: 'db_error_settings_precio', detalle: precioErr?.message ?? 'sin fila precio' }, 500);
  }
  const precioCfg = precioRows[0].value as { usd?: number; margen_bs?: number };
  const usd = Number(precioCfg?.usd);
  const margen = Number(precioCfg?.margen_bs ?? 1);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(margen) || margen <= 0) {
    return json({ ok: false, error: 'settings_precio_invalido', detalle: precioCfg }, 500);
  }
  const precioBs = Math.ceil((usd * tasa * margen) / 100) * 100;

  // --- 6. Regla "en el mismo dia solo sube" ---
  const { data: hoyRows, error: hoyErr } = await admin.database
    .from('musa_settings')
    .select('key, value')
    .eq('key', 'precio_bs_hoy')
    .limit(1);
  if (hoyErr) {
    return json({ ok: false, error: 'db_error_settings_hoy', detalle: hoyErr.message ?? hoyErr }, 500);
  }
  const existente = hoyRows && hoyRows.length > 0 ? hoyRows[0] : null;
  const valorExistente = existente?.value as { bs?: number; fecha?: string } | undefined;

  if (valorExistente && valorExistente.fecha === hoy && Number(valorExistente.bs) >= precioBs) {
    return json({ ok: true, sin_cambio: true, tasa, precio_bs: Number(valorExistente.bs), fuente });
  }

  const nuevoValor = {
    bs: precioBs,
    tasa,
    fecha: hoy,
    fuente,
    actualizado_en: new Date().toISOString(),
  };

  if (existente) {
    const { error: updErr } = await admin.database
      .from('musa_settings')
      .update({ value: nuevoValor })
      .eq('key', 'precio_bs_hoy');
    if (updErr) {
      return json({ ok: false, error: 'db_error_update_precio_hoy', detalle: updErr.message ?? updErr }, 500);
    }
  } else {
    const { error: ins2Err } = await admin.database
      .from('musa_settings')
      .insert([{ key: 'precio_bs_hoy', value: nuevoValor }]);
    if (ins2Err) {
      return json({ ok: false, error: 'db_error_insert_precio_hoy', detalle: ins2Err.message ?? ins2Err }, 500);
    }
  }

  // --- 7. Respuesta ---
  return json({ ok: true, tasa, precio_bs: precioBs, fuente, ...(usandoCache ? { fuente_cache: true } : {}), ...(errores.length ? { avisos: errores } : {}) });
}
