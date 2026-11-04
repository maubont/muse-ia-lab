// next/scripts/test-ia-conversacion.mjs — Prueba unitaria del motor contextual ia/conversacion.ts
import { generarFallbackSeguro, armarSystemPrompt, generarRespuestaConversacional } from "../src/ia/conversacion.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) {
    ok++;
    return;
  }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

// 1. Fallback seguro en Gate 18+ sin confirmación
{
  const fb = generarFallbackSeguro(
    { phone: "+573001234567", nombre: "Carlos", estadoFunnel: "S04_GATE18", mayor18: false },
    "https://musa.test"
  );
  t("fallback gate 18 pide confirmación", fb.includes("18 años o más"), true);
  t("fallback no incluye corazones violetas", fb.includes("💜"), false);
}

// 2. Fallback seguro en etapa de cierre
{
  const fb = generarFallbackSeguro(
    { phone: "+573001234567", nombre: "Laura", estadoFunnel: "S06_CIERRE", mayor18: true },
    "https://musa.test"
  );
  t("fallback cierre incluye precio", fb.includes("33.000 COP"), true);
  t("fallback cierre incluye demo gratis", fb.includes("https://musa.test/academia.html"), true);
  t("fallback cierre incluye cierre guiado", fb.includes("Nequi o Bancolombia"), true);
}

// 3. System prompt maestro
{
  const sp = armarSystemPrompt(
    {
      phone: "+573001234567",
      nombre: "Mauricio",
      estadoFunnel: "S06_CIERRE",
      mayor18: true,
      metaRetorno: "¿Te paso los datos para Nequi o Bancolombia?",
      instruccionEspecifica: "Responde dudas sobre celulares.",
    },
    "https://musa.test"
  );
  t("prompt incluye nombre", sp.includes("Mauricio"), true);
  t("prompt incluye hechos clave (33.000 COP)", sp.includes("33.000 COP"), true);
  t("prompt incluye instrucción ManyChat bot", sp.includes("Módulo 12"), true);
  t("prompt prohíbe corazones violetas", sp.includes("ESTÁ ESTRICTAMENTE PROHIBIDO usar corazones morados"), true);
}

// 4. Invocación sin API key cae a fallback seguro sin lanzar excepciones
{
  const dummyConsultar = async () => ({ rows: [] });
  const res = await generarRespuestaConversacional(
    { consultar: dummyConsultar, urlPublica: "https://musa.test" },
    { phone: "+573001234567", nombre: "Andrés", estadoFunnel: "S06_CIERRE", mayor18: true }
  );
  t("sin api key: ok es false pero seguro", res.ok, false);
  t("sin api key: origen fallback_seguro", res.origen, "fallback_seguro");
  t("sin api key: texto contiene precio", res.texto.includes("33.000 COP"), true);
}

console.log(`test-ia-conversacion: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
