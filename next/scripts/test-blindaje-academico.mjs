// next/scripts/test-blindaje-academico.mjs
// Suite de pruebas obligatoria para el BLOQUE A (Blindaje Académico y Aislamiento de Estudiantes).
// Verifica:
//  1. Solicitud anónima: NUNCA hereda sesión de otro alumno, retorna modo demostración.
//  2. Token inválido: rechazo y fallback seguro a modo demostración.
//  3. Token vencido: denegación y fallback seguro a modo demostración.
//  4. Token revocado: denegación y fallback seguro a modo demostración.
//  5. Aislamiento entre Estudiante A y Estudiante B (cero cruce de datos o identidad).
//  6. Protección de propiedad intelectual: solo el prompt 1 en demo; prompts 2-13 protegidos (null).
//  7. Protección de medios: lecciones 2-13 bloqueadas en modo demo.

import { obtenerCatalogoAcademia } from "../src/api/panel-api.ts";

let ok = 0;
let fallas = 0;

function afirmar(titulo, condicion, detalle = "") {
  if (condicion) {
    ok++;
  } else {
    fallas++;
    console.error(`FALLA: ${titulo} ${detalle}`);
  }
}

// Mock de base de datos con dos estudiantes sintéticos (tokens de 32 chars)
const ESTUDIANTES_FICTICIOS = {
  tok_estudiante_a_1234567890abcdef: {
    token: "tok_estudiante_a_1234567890abcdef",
    lead_phone: "573001112233",
    nombre: "Ana Gómez",
    expira_en: new Date(Date.now() + 86400000 * 30).toISOString(),
    revocado_en: null,
  },
  tok_estudiante_b_1234567890fedcba: {
    token: "tok_estudiante_b_1234567890fedcba",
    lead_phone: "573104445566",
    nombre: "Carlos Pérez",
    expira_en: new Date(Date.now() + 86400000 * 30).toISOString(),
    revocado_en: null,
  },
  tok_vencido_1234567890abcdef12345: {
    token: "tok_vencido_1234567890abcdef12345",
    lead_phone: "573207778899",
    nombre: "Estudiante Expirado",
    expira_en: new Date(Date.now() - 86400000).toISOString(), // Ayer
    revocado_en: null,
  },
  tok_revocado_1234567890abcdef1234: {
    token: "tok_revocado_1234567890abcdef1234",
    lead_phone: "573209990011",
    nombre: "Estudiante Revocado",
    expira_en: new Date(Date.now() + 86400000 * 30).toISOString(),
    revocado_en: new Date(Date.now() - 3600000).toISOString(), // Hace 1 hora
  },
};

const consultarMock = async (sql, params = []) => {
  const query = sql.toLowerCase();

  // Validar token en musa_accesos
  if (query.includes("from public.musa_accesos") && query.includes("lower(token) = lower($1)")) {
    const t = String(params[0] ?? "").toLowerCase();
    const item = Object.values(ESTUDIANTES_FICTICIOS).find((e) => e.token.toLowerCase() === t);
    if (!item) return { rows: [] };
    return { rows: [{ lead_phone: item.lead_phone, expira_en: item.expira_en, revocado_en: item.revocado_en }] };
  }

  // Consulta de nombre en musa_leads
  if (query.includes("from public.musa_leads") && query.includes("phone = $1")) {
    const phone = params[0];
    const item = Object.values(ESTUDIANTES_FICTICIOS).find((e) => e.lead_phone === phone);
    if (!item) return { rows: [] };
    return { rows: [{ nombre: item.nombre, profile_name: item.nombre }] };
  }

  // Fallback antiguo que NUNCA debe ejecutarse
  if (query.includes("order by id desc limit 1")) {
    throw new Error("VULNERABILIDAD SEC-01 DETECTADA: Se ejecutó la consulta de fallback no autorizada");
  }

  return { rows: [] };
};

async function ejecutar() {
  // 1. Solicitud anónima (sin token)
  const anon = await obtenerCatalogoAcademia(consultarMock, "");
  afirmar("Anónimo: autenticado es false", anon.autenticado === false);
  afirmar("Anónimo: modo es demostracion", anon.modo === "demostracion");
  afirmar("Anónimo: nombre es Visitante", anon.alumno?.nombre === "Visitante");
  afirmar("Anónimo: rango es Modo Demostración", anon.alumno?.rango === "Modo Demostración");
  afirmar("Anónimo: refCode no filtra teléfono", anon.alumno?.refCode === "musa-vip");
  afirmar("Anónimo: enlaceReferido es null", anon.alumno?.enlaceReferido === null);

  // Protección de propiedad intelectual en anónimo
  afirmar("Anónimo: Módulo 1 libre", anon.modulos[0].bloqueado === false);
  afirmar("Anónimo: Módulo 1 incluye prompt teaser", typeof anon.modulos[0].prompt === "string");
  afirmar("Anónimo: Módulo 2 bloqueado", anon.modulos[1].bloqueado === true);
  afirmar("Anónimo: Módulo 2 oculta prompt maestro", anon.modulos[1].prompt === null);
  afirmar("Anónimo: Módulo 13 bloqueado", anon.modulos[12].bloqueado === true);
  afirmar("Anónimo: Módulo 13 oculta prompt maestro", anon.modulos[12].prompt === null);

  // Protección de medios en anónimo
  afirmar("Anónimo: Lección 1 es muestra gratis", anon.modulos[0].lecciones[0].esMuestraGratis === true);
  afirmar("Anónimo: Lección 1 video apunta a demo.mp4", anon.modulos[0].lecciones[0].url === "/assets/demo.mp4");
  afirmar("Anónimo: Lección 2 bloqueada", anon.modulos[1].lecciones[0].bloqueada === true);
  afirmar("Anónimo: Lección 2 no entrega URL de medio", anon.modulos[1].lecciones[0].url === "#requiere-acceso");

  // 2. Token inválido (inventado)
  const invalido = await obtenerCatalogoAcademia(consultarMock, "token_fantasma_xyz_1234567890123");
  afirmar("Token inválido: autenticado es false", invalido.autenticado === false);
  afirmar("Token inválido: nombre es Visitante", invalido.alumno?.nombre === "Visitante");
  afirmar("Token inválido: módulo 2 bloqueado", invalido.modulos[1].bloqueado === true);

  // 3. Token vencido
  const vencido = await obtenerCatalogoAcademia(consultarMock, "tok_vencido_1234567890abcdef12345");
  afirmar("Token vencido: autenticado es false", vencido.autenticado === false);
  afirmar("Token vencido: nombre es Visitante", vencido.alumno?.nombre === "Visitante");
  afirmar("Token vencido: módulo 2 bloqueado", vencido.modulos[1].bloqueado === true);

  // 4. Token revocado
  const revocado = await obtenerCatalogoAcademia(consultarMock, "tok_revocado_1234567890abcdef1234");
  afirmar("Token revocado: autenticado es false", revocado.autenticado === false);
  afirmar("Token revocado: nombre es Visitante", revocado.alumno?.nombre === "Visitante");

  // 5. Estudiante A válido
  const estA = await obtenerCatalogoAcademia(consultarMock, "tok_estudiante_a_1234567890abcdef");
  afirmar("Estudiante A: autenticado es true", estA.autenticado === true);
  afirmar("Estudiante A: modo es estudiante", estA.modo === "estudiante");
  afirmar("Estudiante A: nombre correcto", estA.alumno?.nombre === "Ana Gómez");
  afirmar("Estudiante A: refCode personal", estA.alumno?.refCode === "musa-2233");
  afirmar("Estudiante A: todos los módulos desbloqueados", estA.modulos.every((m) => m.bloqueado === false));
  afirmar("Estudiante A: todos los prompts disponibles", estA.modulos.every((m) => typeof m.prompt === "string"));
  afirmar("Estudiante A: URLs reales con su token", estA.modulos[1].lecciones[0].url.includes("tok_estudiante_a_1234567890abcdef"));

  // 6. Estudiante B válido
  const estB = await obtenerCatalogoAcademia(consultarMock, "tok_estudiante_b_1234567890fedcba");
  afirmar("Estudiante B: autenticado es true", estB.autenticado === true);
  afirmar("Estudiante B: nombre correcto", estB.alumno?.nombre === "Carlos Pérez");
  afirmar("Estudiante B: refCode personal", estB.alumno?.refCode === "musa-5566");
  afirmar("Estudiante B: URLs reales con su token", estB.modulos[1].lecciones[0].url.includes("tok_estudiante_b_1234567890fedcba"));

  // 7. Aislamiento estricto: Estudiante A NO ve datos ni enlaces de Estudiante B
  afirmar("Aislamiento: A no tiene token de B", !JSON.stringify(estA).includes("tok_estudiante_b_1234567890fedcba"));
  afirmar("Aislamiento: A no tiene nombre de B", !JSON.stringify(estA).includes("Carlos Pérez"));
  afirmar("Aislamiento: B no tiene token de A", !JSON.stringify(estB).includes("tok_estudiante_a_1234567890abcdef"));
  afirmar("Aislamiento: B no tiene nombre de A", !JSON.stringify(estB).includes("Ana Gómez"));

  console.log(`\n  aserciones correctas: ${ok}`);
  console.log(`  aserciones fallidas:  ${fallas}`);
  console.log(`\n  ${ok} ok, ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

ejecutar().catch((e) => {
  console.error("Error fatal en suite:", e);
  process.exit(1);
});
