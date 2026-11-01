// next/scripts/test-cola-revision.mjs — la salida de la cola de revisión.
//
// El sistema manda al operador «Responde: ok <id>». Hasta ahora no había quien
// entendiera esa respuesta: el pago quedaba en revisión para siempre y el cliente
// leía «seguimos verificando» indefinidamente.

import { interpretarComando, normalizarTelefono, esComandoOperador } from "../src/motor/comandos-operador.ts";
import { atenderComandoOperador } from "../src/motor/cola-revision.ts";

let ok = 0,
  fallas = 0;
const t = (etiqueta, real, esperado) => {
  if (JSON.stringify(real) === JSON.stringify(esperado)) {
    ok++;
    return;
  }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
};

// ── Interpretación de los comandos ─────────────────────────────────────────
t("ok 4821", interpretarComando("ok 4821"), { tipo: "aprobar", shortId: "4821" });
t("OK en mayúsculas", interpretarComando("OK 4821"), { tipo: "aprobar", shortId: "4821" });
t("con espacios", interpretarComando("  ok   4821  "), { tipo: "aprobar", shortId: "4821" });
t("minúsculas del id", interpretarComando("ok 4a2b"), { tipo: "aprobar", shortId: "4A2B" });
t("ver", interpretarComando("ver 4821"), { tipo: "ver", shortId: "4821" });
t("rechazar con motivo", interpretarComando("no 4821 comprobante de otra persona"), {
  tipo: "rechazar",
  shortId: "4821",
  motivo: "comprobante de otra persona",
});
t("rechazar sin motivo", interpretarComando("no 4821"), { tipo: "rechazar", shortId: "4821", motivo: "sin_motivo" });

// Lo que NO debe interpretarse como comando
for (const frase of ["hola", "ok", "okey 4821", "no", "ver", "ok 1", "buenas ok 4821", ""]) {
  t(`«${frase}» no es comando`, interpretarComando(frase), null);
}

// ── El operador se reconoce por número, con o sin formato ──────────────────
t("normaliza el +", normalizarTelefono("+57 322 356 5761"), "573223565761");
t("mismo número con formatos distintos", normalizarTelefono("+573223565761") === normalizarTelefono("57 322-356-5761"), true);
t("es comando del operador", esComandoOperador("+573223565761", "ok 4821", "573223565761"), true);
t("un cliente no puede aprobar", esComandoOperador("+573001112233", "ok 4821", "573223565761"), false);
t("sin operador configurado, nadie aprueba", esComandoOperador("+573223565761", "ok 4821", undefined), false);

// ── Ejecución: aprobar entrega; rechazar no entrega ────────────────────────
function entorno({ status = "revision", entregaFalla = false } = {}) {
  const consultas = [];
  const avisos = [];
  const entregas = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    consultas.push({ q, params });
    if (q.includes("from public.musa_payments") && q.includes("select")) {
      return {
        rows: [
          { short_id: params[0], lead_phone: "+573001112233", metodo: "Nequi", monto: 33000, moneda: "COP", status, motivo_flag: null, datos_extraidos: { numero_referencia: "M-1", destino: "3223565761", estado_operacion: "exitosa" }, created_at: "2026-10-30" },
        ],
      };
    }
    return { rows: [] };
  };
  const canal = {
    async enviar(tel, m) {
      avisos.push({ tel, texto: m.texto });
      return { ok: true };
    },
  };
  const repo = {
    async entregarCurso(phone, e) {
      entregas.push({ phone, e });
      if (entregaFalla) throw new Error("base caída");
    },
  };
  return { consultar, canal, repo, consultas, avisos, entregas };
}

{
  const { consultar, canal, repo, consultas, avisos, entregas } = entorno();
  await atenderComandoOperador({ tipo: "aprobar", shortId: "4821" }, repo, consultar, canal, "+573223565761", "https://musa.test");
  t("aprobar: entrega al cliente", entregas.length, 1);
  t("aprobar: al teléfono del pago", entregas[0]?.phone, "+573001112233");
  t("aprobar: marca aprobado", consultas.some((c) => c.q.includes("set status = 'aprobado'")), true);
  t("aprobar: registra el evento", consultas.some((c) => c.q.includes("pago_aprobado_operador")), true);
  t("aprobar: avisa al operador", avisos.some((a) => a.texto.includes("aprobado y entregado")), true);
}

{
  const { consultar, canal, repo, consultas, avisos, entregas } = entorno();
  await atenderComandoOperador({ tipo: "rechazar", shortId: "4821", motivo: "monto no coincide" }, repo, consultar, canal, "+573223565761", "https://musa.test");
  t("rechazar: NO entrega", entregas.length, 0);
  t("rechazar: marca rechazado", consultas.some((c) => c.q.includes("set status = 'rechazado'")), true);
  t("rechazar: avisa al cliente", avisos.some((a) => a.tel === "+573001112233"), true);
  t("rechazar: el aviso no menciona el motivo interno", avisos.find((a) => a.tel === "+573001112233")?.texto.includes("monto no coincide"), false);
}

{
  const { consultar, canal, repo, avisos } = entorno({ entregaFalla: true });
  await atenderComandoOperador({ tipo: "aprobar", shortId: "4821" }, repo, consultar, canal, "+573223565761", "https://musa.test");
  t("si la entrega falla: avisa del fallo", avisos.some((a) => a.texto.includes("sigue en revisión")), true);
  t("si la entrega falla: NO dice aprobado", avisos.some((a) => a.texto.includes("aprobado y entregado")), false);
}

{
  const { consultar, canal, repo, avisos } = entorno();
  await atenderComandoOperador({ tipo: "aprobar", shortId: "4821" }, repo, consultar, canal, "+573223565761", undefined);
  t("sin URL pública: no aprueba a ciegas", avisos.some((a) => a.texto.includes("MUSA_URL_PUBLICA")), true);
}

{
  const { consultar, canal, repo, avisos } = entorno();
  await atenderComandoOperador({ tipo: "ver", shortId: "4821" }, repo, consultar, canal, "+573223565761", "https://musa.test");
  const visto = avisos.find((a) => a.texto.includes("#4821"));
  t("ver: muestra el detalle", !!visto, true);
  t("ver: incluye la referencia", String(visto?.texto).includes("M-1"), true);
  t("ver: propone los comandos", String(visto?.texto).includes("ok 4821"), true);
}

console.log(`cola de revisión: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);