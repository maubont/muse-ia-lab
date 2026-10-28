// scripts/test-guardarrailes.mjs — pruebas de los guardarraíles de cumplimiento.
//
//   node --experimental-strip-types scripts/test-guardarrailes.mjs
//
// Cubre lo que puede costar el negocio entero:
//   · gate 18+ (vender a un menor = riesgo legal y baneo de la cuenta)
//   · opt-out STOP (ignorarlo = reportes = baneo)
//   · honestidad sobre ser bot (la lista negra del plan §9)
//   · país/moneda (cotizar en Bs a un colombiano es una venta perdida)

import {
  esStopTotal,
  preguntaPorBot,
  pideHumano,
  preguntaPrecio,
  detectarPaisHeuristico,
  inyectarEdadDeletreada,
  clasificarEdadHeuristico,
  esAfirmativoCierre,
  esNegativoCierre,
  esYaPague,
  contienePregunta,
  pideDatosDirecto,
} from "../functions/motor/guardarrailes.ts";

let ok = 0;
let fallas = 0;
const avisos = [];

function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) {
    ok++;
    return;
  }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

// ============================== GATE 18+ ==============================
// Prioridad máxima: un "mayor" falso vende a un menor; un "menor" falso pierde
// la venta Y bloquea los seguimientos (el plan manda silencio total).

t("edad: 'tengo 17'", clasificarEdadHeuristico("tengo 17"), "menor");
t("edad: 'tengo 18'", clasificarEdadHeuristico("tengo 18"), "mayor");
t("edad: '17'", clasificarEdadHeuristico("17"), "menor");
t("edad: '18'", clasificarEdadHeuristico("18"), "mayor");
t("edad: 'tengo 30'", clasificarEdadHeuristico("tengo 30"), "mayor");
t("edad: 'soy menor de edad'", clasificarEdadHeuristico("soy menor de edad"), "menor");
t("edad: 'no soy mayor'", clasificarEdadHeuristico("no soy mayor"), "menor");

// BUG HISTÓRICO (lead «Carlitos»): el 18 de "cumplo los 18" se leía como edad actual.
t(
  "edad: Carlitos (bug histórico)",
  clasificarEdadHeuristico("nah todavia no, el ano que viene cumplo los 18"),
  "menor",
);
t("edad: 'el año que viene cumplo los 18'", clasificarEdadHeuristico("el año que viene cumplo los 18"), "menor");
t("edad: 'cumplo 17'", clasificarEdadHeuristico("cumplo 17"), "menor");
t("edad: 'ya cumpli 18'", clasificarEdadHeuristico("ya cumpli 18"), "mayor");
t("edad: '+18'", clasificarEdadHeuristico("+18"), "mayor");
t("edad: 'soy mayor de edad'", clasificarEdadHeuristico("soy mayor de edad"), "mayor");

// Notas de voz: la edad llega deletreada.
t("edad deletreada: 'veinticinco'", clasificarEdadHeuristico("tengo veinticinco"), "mayor");
t("edad deletreada: 'diecisiete'", clasificarEdadHeuristico("tengo diecisiete"), "menor");
t("edad deletreada: 'treinta y cinco'", clasificarEdadHeuristico("tengo treinta y cinco"), "mayor");
t("edad deletreada: 'veintiun anos'", clasificarEdadHeuristico("tengo veintiun anos"), "mayor");
t("inyectar: sin número en palabras", inyectarEdadDeletreada("hola"), "hola");

// Ambigüedad real: debe devolver null para que decida el clasificador GPT.
t("edad: 'hola' (ambiguo)", clasificarEdadHeuristico("hola"), null);
t("edad: 'cuanto cuesta' (ambiguo)", clasificarEdadHeuristico("cuanto cuesta"), null);

// --- OBSERVACIÓN 1: respuestas que empiezan por "no" sin número ---
// La rama `^(no|nop|nel|nah|que va)` devuelve "menor" SIN importar el contexto.
// "no sé" y "no entiendo" son respuestas plausibles de un adulto: el lead queda
// marcado como menor, la venta se bloquea y no recibe seguimientos.
for (const frase of ["no se", "no entiendo", "no gracias todavia"]) {
  if (clasificarEdadHeuristico(frase) === "menor") {
    avisos.push(
      `OBSERVACIÓN 1 · gate 18+: "${frase}" se clasifica como MENOR por empezar por "no". ` +
        "Un adulto que responde así queda bloqueado y sin seguimientos.",
    );
  }
}

// ============================== OPT-OUT ==============================

t("stop: 'stop'", esStopTotal("stop"), true);
t("stop: 'salir por favor'", esStopTotal("salir por favor"), true);
t("stop: 'mejor no, salir'", esStopTotal("mejor no, salir"), true);
t("stop: 'cancelar'", esStopTotal("cancelar"), true);
t("stop: 'baja'", esStopTotal("baja"), true);
t("stop: 'stop!!!'", esStopTotal("stop!!!"), true);
t("stop: NO confunde 'salirme'", esStopTotal("quiero salirme de aqui"), false);
t("stop: NO confunde 'asalariado'", esStopTotal("soy asalariado"), false);
t("stop: NO confunde 'bajamar'", esStopTotal("bajamar"), false);
t("stop: NO confunde 'un stopwatch'", esStopTotal("un stopwatch"), false);
t("stop: 'no' simple NO dispara opt-out", esStopTotal("no"), false);

// ============================== HONESTIDAD / BOT ==============================

t("bot: 'eres un bot?'", preguntaPorBot("eres un bot?"), true);
t("bot: 'sos una maquina'", preguntaPorBot("sos una maquina"), true);
t("bot: 'eres humana?'", preguntaPorBot("eres humana?"), true);
t("bot: 'un bot?'", preguntaPorBot("un bot?"), true);
t("bot: 'bot o persona'", preguntaPorBot("bot o persona"), true);
t("bot: NO falsea 'eres colombiano'", preguntaPorBot("eres colombiano"), false);
t("bot: 'hola'", preguntaPorBot("hola"), false);

t(
  "humano: 'quiero hablar con una persona'",
  pideHumano("quiero hablar con una persona"),
  true,
);
t("humano: 'pasame un asesor'", pideHumano("pasame un asesor"), true);
t("humano: 'persona real'", pideHumano("persona real"), true);

// ============================== PAÍS / MONEDA ==============================

t("pais: 'soy de colombia'", detectarPaisHeuristico("soy de colombia", ""), "CO");
t("pais: 'venezuela'", detectarPaisHeuristico("venezuela", ""), "VE");
t("pais: 'col'", detectarPaisHeuristico("col", ""), "CO");
t("pais: 'co'", detectarPaisHeuristico("co", ""), "CO");
t("pais: 've'", detectarPaisHeuristico("ve", ""), "VE");
t("pais: bandera CO", detectarPaisHeuristico("", "🇨🇴"), "CO");
t("pais: bandera VE", detectarPaisHeuristico("", "🇻🇪"), "VE");
t("pais: NO confunde 'escolar'", detectarPaisHeuristico("soy escolar", ""), null);
t("pais: NO confunde 'vender'", detectarPaisHeuristico("quiero vender", ""), null);
t("pais: ambos -> ambiguo", detectarPaisHeuristico("colombia y venezuela", ""), null);

// ============================== CIERRE ==============================

t("cierre: 'si'", esAfirmativoCierre("si"), true);
t("cierre: 'dale'", esAfirmativoCierre("dale"), true);
t("cierre: 'como pago'", esAfirmativoCierre("como pago"), true);
t("cierre: 'no' no es afirmativo", esAfirmativoCierre("no"), false);
t("negativo: 'no'", esNegativoCierre("no"), true);
t("negativo: 'despues'", esNegativoCierre("despues"), true);
t("negativo: 'si' no es negativo", esNegativoCierre("si"), false);
t("ya pague: 'ya pague'", esYaPague("ya pague"), true);
t("ya pague: 'listo el pago'", esYaPague("listo el pago"), true);
t("ya pague: 'pago' a secas", esYaPague("pago"), false);

t("pregunta: con signos", contienePregunta("si, ¿cuanto cuesta?", "si, ¿cuanto cuesta?"), true);
t("pregunta: 'si' solo", contienePregunta("si", "si"), false);
t("pregunta: mixta", contienePregunta("si pero como pago", "si pero como pago"), true);
t("datos: 'pasame los datos'", pideDatosDirecto("pasame los datos"), true);
t("datos: 'hola'", pideDatosDirecto("hola"), false);
t("precio: 'cuanto vale'", preguntaPrecio("cuanto vale"), true);
t("precio: 'hola'", preguntaPrecio("hola"), false);

// ============================== salida ==============================

for (const a of avisos) console.log("⚠ " + a);
console.log(`guardarraíles: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
