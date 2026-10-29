import { diagnosticarImagenes, CASOS } from "../src/vision/diagnostico.ts";

let ok = 0, fallas = 0;
const t = (e, r, x) => { if (JSON.stringify(r) === JSON.stringify(x)) ok++; else { fallas++; console.error(`FALLA ${e}: ${JSON.stringify(r)} != ${JSON.stringify(x)}`); } };

const PROVEEDOR = { baseUrl: "https://x/v1", apiKey: "k", modelo: "m", precioEntrada: 0.1, precioSalida: 0.5 };

const BUENO = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: "2026-06-13", hora: "14:41",
  numero_referencia: "1834502671", destino: "3223565761", numeros_detectados: [],
  nombre_destinatario: "MUSA IA LAB", banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.99, destino: 0.99, fecha: 0.99 },
};

const falso = (contenido) => async () => ({
  ok: true, status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(contenido) } }], usage: { prompt_tokens: 1300, completion_tokens: 250 } }),
  text: async () => "",
});

// 1. Lee bien el primero: monto, moneda, destino, referencia y estado coinciden.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    casos: [CASOS[0]],
    leerArchivo: () => Buffer.from("imagen"),
    fetchImpl: falso(BUENO),
  });
  t("caso bueno: ok", r.ok, true);
  t("caso bueno: 5 aciertos", r.aciertos, 5);
  t("caso bueno: sin fallos", r.casos[0].fallos, []);
  t("caso bueno: coste > 0", r.costeTotal > 0, true);
  t("caso bueno: coste ridículo", r.costeTotal < 0.01, true);
}

// 2. Monto equivocado: debe detectarlo y marcar el caso.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    casos: [CASOS[0]],
    leerArchivo: () => Buffer.from("imagen"),
    fetchImpl: falso({ ...BUENO, monto: 32000 }),
  });
  t("monto malo: no ok", r.ok, false);
  t("monto malo: señala el campo", r.casos[0].fallos, ["monto"]);
  t("monto malo: 4 de 5", r.aciertos, 4);
}

// 3. Estado equivocado (programada leída como exitosa): el caso que más importa.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    casos: [CASOS[2]],
    leerArchivo: () => Buffer.from("imagen"),
    // El comprobante 3 es "programada" y su referencia es distinta: el fixture
    // debe reflejar el contenido real, si no la prueba mide otra cosa.
    fetchImpl: falso({ ...BUENO, monto: 33000, numero_referencia: "M7740031288", estado_operacion: "exitosa" }),
  });
  t("estado malo: no ok", r.ok, false);
  t("estado malo: señala estado", r.casos[0].fallos, ["estado"]);
}

// 4. Archivo ausente: no revienta, lo reporta.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    casos: [CASOS[0]],
    leerArchivo: () => { throw new Error("no está"); },
    fetchImpl: falso(BUENO),
  });
  t("sin archivo: no ok", r.ok, false);
  t("sin archivo: lo dice", r.casos[0].fallos, ["archivo_no_encontrado"]);
}

// 5. Respuesta ilegible: lo reporta con motivo.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    casos: [CASOS[0]],
    leerArchivo: () => Buffer.from("imagen"),
    fetchImpl: falso("no soy json"),
  });
  t("respuesta rota: no ok", r.ok, false);
  t("respuesta rota: con motivo", typeof r.casos[0].motivo, "string");
}

// 6. Los tres casos recorren y suman.
{
  const r = await diagnosticarImagenes(PROVEEDOR, {
    leerArchivo: () => Buffer.from("imagen"),
    fetchImpl: falso(BUENO),
  });
  t("tres casos", r.casos.length, 3);
  t("total de comprobaciones", r.total, 15);
}

console.log(`diagnóstico de imágenes: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
