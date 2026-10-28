// next/scripts/test-recordatorios.mjs — recordatorios por evento.
//
//   node --experimental-strip-types next/scripts/test-recordatorios.mjs

import {
  recordatoriosParaEstado,
  cuandoEnviar,
  ajustarAHorario,
  textoDeRecordatorio,
  TEXTOS_RECORDATORIO,
} from "../src/motor/recordatorios.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const bogota = (dia, hora, minuto = 0) => new Date(Date.UTC(2026, 9, dia, hora + 5, minuto));
const TZ = "America/Bogota";

// ============================== qué se programa ==============================
{
  const trasDatos = recordatoriosParaEstado("S07_DATOS_PAGO");
  t("tras dar datos de pago: 3 recordatorios", trasDatos.length, 3);
  t("todos del mismo tipo", new Set(trasDatos.map((r) => r.tipo)).size, 1);
  t("tipo correcto", trasDatos[0].tipo, "pago_pendiente");
  t("el primero a los 20 min", trasDatos[0].enMinutos, 20);
  t("el segundo a las 3 h", trasDatos[1].enMinutos, 180);
  t("el tercero a las 20 h", trasDatos[2].enMinutos, 1200);
  t("los 20 h caben en la ventana de 24 h", trasDatos[2].enMinutos < 24 * 60, true);
}

{
  const esperando = recordatoriosParaEstado("S08_ESPERA_CAPTURA");
  t("en S08 también se programan", esperando.length, 3);
}

{
  const verificacion = recordatoriosParaEstado("S09_VERIFICACION");
  t("en verificación: uno solo", verificacion.length, 1);
  t("tipo verificación", verificacion[0].tipo, "verificacion_pendiente");
}

{
  t("estado sin recordatorios: ninguno", recordatoriosParaEstado("S04_GATE18"), []);
  t("estado desconocido: ninguno", recordatoriosParaEstado("S99"), []);
}

// ============================== cuándo ==============================
{
  const ahora = bogota(28, 10);
  t("20 min después", cuandoEnviar(ahora, 20).getTime() - ahora.getTime(), 20 * 60_000);
}

// ============================== horario razonable ==============================
{
  // Cae a las 3 a.m. -> se mueve a las 8 de la mañana.
  const madrugada = bogota(29, 3);
  const ajustado = ajustarAHorario(madrugada, TZ);
  const hora = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(ajustado), 10) % 24;
  t("de madrugada se mueve a la apertura", hora, 8);
}

{
  // Dentro de horario no se toca.
  const dentro = bogota(28, 15);
  t("dentro de horario no se toca", ajustarAHorario(dentro, TZ).getTime(), dentro.getTime());
}

{
  // Justo antes de cerrar (21:30) sigue siendo válido.
  const casiCierre = bogota(28, 21, 30);
  t("21:30 sigue dentro", ajustarAHorario(casiCierre, TZ).getTime(), casiCierre.getTime());
}

{
  // 23:00 se mueve a las 8 del día siguiente (9 horas).
  const noche = bogota(28, 23);
  const ajustado = ajustarAHorario(noche, TZ);
  t("23:00 pasa a la mañana siguiente", ajustado.getTime() - noche.getTime(), 9 * 3600_000);
}

// ============================== el copy ==============================
{
  t("hay tres textos de pago pendiente", TEXTOS_RECORDATORIO.pago_pendiente.length, 3);
  t("textoDeRecordatorio devuelve el primero", textoDeRecordatorio("pago_pendiente", 0), TEXTOS_RECORDATORIO.pago_pendiente[0]);
  t("índice alto no rompe", typeof textoDeRecordatorio("pago_pendiente", 99), "string");
}

{
  // Lista negra del plan: sin urgencia falsa, sin contadores, sin promesas.
  const todos = Object.values(TEXTOS_RECORDATORIO).flat().join(" ");
  t("sin cuenta atrás inventada", /\b(\d+\s*(min|horas?|días?)|últimas? (plazas|unidades)|solo hoy)\b/i.test(todos), false);
  t("sin promesas de ingresos", /ganar|ingresos|dinero fácil/i.test(todos), false);
  t("sin signos de urgencia falsa", /!!!|urgente|apresúrate/i.test(todos), false);
  t("tutea, no grita", todos.includes("!"), false);
}

console.log(`recordatorios: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
