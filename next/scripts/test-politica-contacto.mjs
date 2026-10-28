// next/scripts/test-politica-contacto.mjs — la política de contacto, probada.
//
//   node --experimental-strip-types next/scripts/test-politica-contacto.mjs
//
// El caso que motivó todo esto: un lead que escribe a las 7 a.m. NO debe recibir
// el seguimiento de las 20 h a las 3 a.m.

import {
  puedeResponder,
  puedeSeguir,
  dentroDeHorarioRazonable,
  horaLocal,
  siguienteSeguimientoPorTiempo,
  VENTANA_SERVICIO_MS,
  MAX_SEGUIMIENTOS,
} from "../src/motor/politica-contacto.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const TZ = "America/Bogota";
/** Construye una fecha en hora de Bogotá (UTC-5, sin horario de verano). */
const bogota = (dia, hora, minuto = 0) => new Date(Date.UTC(2026, 9, dia, hora + 5, minuto));
const ctx = (extra = {}) => ({
  ahora: bogota(28, 10), ultimoEntrante: bogota(28, 9), ultimoSaliente: bogota(28, 9, 30),
  seguimientosEnviados: 0, tz: TZ, ...extra,
});

// ============================== responder siempre ==============================
{
  t("responder: permitido", puedeResponder().permitido, true);
  // Aunque sea de madrugada: si el cliente escribió, se le contesta.
  const madrugada = ctx({ ahora: bogota(28, 3) });
  t("responder a las 3am: permitido", puedeResponder(madrugada).permitido, true);
}

// ============================== horario ==============================
{
  t("hora local 10:00", horaLocal(bogota(28, 10), TZ), 10);
  t("hora local 22:00", horaLocal(bogota(28, 22), TZ), 22);
  t("hora local 00:00", horaLocal(bogota(28, 0), TZ), 0);

  t("8:00 está dentro", dentroDeHorarioRazonable(bogota(28, 8), TZ), true);
  t("21:59 está dentro", dentroDeHorarioRazonable(bogota(28, 21, 59), TZ), true);
  t("22:00 queda fuera", dentroDeHorarioRazonable(bogota(28, 22), TZ), false);
  t("7:59 queda fuera", dentroDeHorarioRazonable(bogota(28, 7, 59), TZ), false);
  t("3:00 queda fuera", dentroDeHorarioRazonable(bogota(28, 3), TZ), false);
}

// ============================== ventana de 24 h ==============================
{
  // Todo referido al mismo ancla: si se mezcla con Date.now() la prueba depende
  // de la hora real y falla sola.
  const ahora = bogota(28, 12);
  const dentro = ctx({ ahora, ultimoEntrante: bogota(27, 13) }); // 23 h
  const fuera = ctx({ ahora, ultimoEntrante: bogota(27, 11) }); // 25 h
  t("23 h después: dentro de ventana", puedeSeguir(dentro).permitido, true);
  t("25 h después: fuera", puedeSeguir(fuera), { permitido: false, motivo: "fuera_de_ventana_24h" });
}

// ============================== límite de seguimientos ==============================
{
  t("3 seguimientos ya enviados: no hay más", puedeSeguir(ctx({ seguimientosEnviados: MAX_SEGUIMIENTOS })),
    { permitido: false, motivo: "limite_alcanzado" });
  t("2 enviados: todavía se puede", puedeSeguir(ctx({ seguimientosEnviados: 2 })).permitido, true);
}

// ============================== EL CASO QUE IMPORTA ==============================
{
  // El lead escribió a las 7:00. Veinte horas después son las 3:00 del día
  // siguiente: la ventana de 24 h sigue abierta, pero es de madrugada.
  const lead = bogota(28, 7);
  const aLasTres = new Date(lead.getTime() + 20 * 3600 * 1000);
  const p = puedeSeguir({
    ahora: aLasTres, ultimoEntrante: lead, ultimoSaliente: lead,
    seguimientosEnviados: 2, tz: TZ,
  });
  t("7am + 20h = 3am: BLOQUEADO por horario", p, { permitido: false, motivo: "fuera_de_horario" });
  t("y la hora calculada es 3", horaLocal(aLasTres, TZ), 3);
}

// ============================== reloj inconsistente ==============================
{
  const futuro = ctx({ ahora: bogota(28, 10), ultimoEntrante: bogota(28, 11) });
  t("reloj raro: no se escribe", puedeSeguir(futuro), { permitido: false, motivo: "reloj_inconsistente" });
}

// ============================== sin mensaje previo ==============================
{
  t("nunca escribió: no se le sigue", puedeSeguir(ctx({ ultimoEntrante: null })),
    { permitido: false, motivo: "sin_mensaje_del_lead" });
}

// ============================== umbrales de tiempo ==============================
{
  const base = ctx({ seguimientosEnviados: 0, ultimoSaliente: bogota(28, 9) });
  t("a los 10 min no toca", siguienteSeguimientoPorTiempo({ ...base, ahora: bogota(28, 9, 10) }), null);
  t("a los 31 min toca el 1.º", siguienteSeguimientoPorTiempo({ ...base, ahora: bogota(28, 9, 31) }), 1);

  const con1 = ctx({ seguimientosEnviados: 1, ultimoSaliente: bogota(28, 9) });
  t("4 h después toca el 2.º", siguienteSeguimientoPorTiempo({ ...con1, ahora: bogota(28, 13, 1) }), 2);

  const con2 = ctx({ seguimientosEnviados: 2, ultimoSaliente: bogota(28, 9) });
  t("20 h después toca el 3.º", siguienteSeguimientoPorTiempo({ ...con2, ahora: bogota(29, 5, 1) }), 3);
  t("con 3 enviados: nunca más", siguienteSeguimientoPorTiempo({ ...ctx({ seguimientosEnviados: 3 }), ahora: bogota(30, 12) }), null);
}

// ============================== horario que cruza medianoche ==============================
{
  t("horario 20–2: las 23 está dentro", dentroDeHorarioRazonable(bogota(28, 23), TZ, 20, 2), true);
  t("horario 20–2: las 1 está dentro", dentroDeHorarioRazonable(bogota(28, 1), TZ, 20, 2), true);
  t("horario 20–2: las 5 está fuera", dentroDeHorarioRazonable(bogota(28, 5), TZ, 20, 2), false);
}

console.log(`politica de contacto: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
