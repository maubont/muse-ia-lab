// Test de P1-1: si el envío de la entrega falla, debe programar un reintento y
// avisar al operador. Antes registraba «acceso_creado» como si hubiera entregado.
import { crearRepositorio } from "../src/db/repositorio.ts";

let ok = 0, fallas = 0;
const t = (e, r, x) => { if (JSON.stringify(r) === JSON.stringify(x)) ok++; else { fallas++; console.error(`FALLA ${e}: ${JSON.stringify(r)} != ${JSON.stringify(x)}`); } };

function entorno({ fallaEnvio }) {
  const consultas = [];
  const envios = [];
  const consultar = async (sql, params) => {
    const q = sql.replace(/\s+/g, " ").trim();
    consultas.push({ q, params });
    if (q.startsWith("insert into public.musa_accesos")) return { rows: [{ token: "TOK", expira_en: "2027" }] };
    return { rows: [] };
  };
  const canal = {
    id: "evolution",
    async enviar(tel, m) {
      envios.push({ tel, texto: m.texto });
      return fallaEnvio ? { ok: false, id_externo: null, status: 500, motivo: "Connection Closed" } : { ok: true, id_externo: "x" };
    },
    async verificar() { return { valido: true, motivo: "ok" }; },
    async parsear() { return []; },
    async marcarEscribiendo() {},
  };
  const repo = crearRepositorio({ consultar, canal, telefonoOperador: "+573000000000", urlPublica: "https://musa.test", esperar: async () => {} });
  return { repo, consultas, envios };
}

// 1. Envío fallido: reintento + aviso
{
  const { repo, consultas, envios } = entorno({ fallaEnvio: true });
  await repo.entregarCurso("+5730", { bienvenida: "Bienvenido", respaldo: ["A", "B"] });
  t("no registra acceso_creado", consultas.some((c) => c.params?.[1] === "acceso_creado"), false);
  t("registra entrega_fallida", consultas.some((c) => c.params?.[1] === "entrega_fallida"), true);
  t("programa un reintento", consultas.some((c) => c.q.includes("musa_recordatorios") && c.params?.includes("entrega_pendiente")), true);
  t("el reintento lleva el enlace", consultas.some((c) => String(c.params?.[2] ?? "").includes("/a/TOK")), true);
  t("avisa al operador", envios.some((e) => e.tel === "+573000000000" && /Reenvía|Reenvia/.test(e.texto)), true);
}

// 2. Envío correcto: nada de reintentos
{
  const { repo, consultas } = entorno({ fallaEnvio: false });
  await repo.entregarCurso("+5730", { bienvenida: "Bienvenido", respaldo: ["A", "B"] });
  t("registra acceso_creado", consultas.some((c) => c.params?.[1] === "acceso_creado"), true);
  t("NO programa reintento", consultas.some((c) => c.q.includes("musa_recordatorios")), false);
  t("NO registra fallo", consultas.some((c) => c.params?.[1] === "entrega_fallida"), false);
}

console.log(`entrega fallida: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
