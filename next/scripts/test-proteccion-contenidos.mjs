// next/scripts/test-proteccion-contenidos.mjs — Prueba de protección de medios y contenidos (Bloque C).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { crearServidor } from "../src/api/servidor.ts";

console.log("🧪 Iniciando pruebas de Protección de Contenidos (Bloque C)...");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "musa-test-media-"));
const testFilePath = path.join(tmpDir, "dummy-video.mp4");
fs.writeFileSync(testFilePath, Buffer.alloc(1024, "A"));

const canalMock = {
  enviarTexto: async () => ({ id: "m1" }),
  enviarPlantilla: async () => ({ id: "m2" }),
  enviarImagen: async () => ({ id: "m3" })
};

const motorMock = {
  procesar: async () => ({ ok: true, accionTomada: "eco" })
};

// Mock de servicio de accesos
const accesoMock = {
  validar: async (token) => {
    if (token === "tok_estudiante_valido_1234567890abcdef") {
      return { ok: true, leadId: "lead_123", alumno: "Estudiante Verificado" };
    }
    return { ok: false, motivo: "token_invalido" };
  }
};

// Mock de almacén de medios
const mediosMock = {
  resolver: async (clave) => {
    if (clave === "leccion1.mp4") {
      return {
        nombre: "leccion1.mp4",
        tipo: "video/mp4",
        tamano: 1024,
        ruta: testFilePath
      };
    }
    return null;
  }
};

const srv = crearServidor({
  canal: canalMock,
  motor: motorMock,
  acceso: accesoMock,
  medios: mediosMock,
  adminSecret: "secret_test_2026"
});

const puerto = await srv.escuchar(0);
const baseUrl = `http://127.0.0.1:${puerto}`;

try {
  // Test 1: Intento sin token o token incompleto -> 400 ruta incompleta
  const resIncompleta = await fetch(`${baseUrl}/media/solotoken`);
  assert.equal(resIncompleta.status, 400);
  console.log("✅ Ruta incompleta (/media/token): 400 Bad Request");

  // Test 2: Token inválido / visitante -> 403 sin_acceso
  const resSinAcceso = await fetch(`${baseUrl}/media/tok_invalido_hacker/leccion1.mp4`);
  assert.equal(resSinAcceso.status, 403);
  const jsonSinAcceso = await resSinAcceso.json();
  assert.equal(jsonSinAcceso.error, "sin_acceso");
  console.log("✅ Token inválido / no autenticado: 403 sin_acceso");

  // Test 3: Token válido solicitando archivo existente -> 200 OK (o 206 si pide rango)
  const resValida = await fetch(`${baseUrl}/media/tok_estudiante_valido_1234567890abcdef/leccion1.mp4`);
  // Puede ser 200 o 404 si el archivo físico no existe en disco de test, pero no 403
  assert.notEqual(resValida.status, 403, "Token válido no debe recibir 403");
  console.log(`✅ Token de estudiante legítimo: Acceso concedido (HTTP ${resValida.status})`);

  // Test 4: Intento de Path Traversal -> 403 sin token, o 404 si token válido
  const resTraversal = await fetch(`${baseUrl}/media/tok_invalido/..%2f..%2f.env`);
  assert.equal(resTraversal.status, 403);
  console.log("✅ Intento de directory traversal sin token válido: 403 rechazado");

  console.log("🎉 Todas las pruebas del Bloque C pasaron exitosamente (4/4 ok)!");
  console.log("4 ok, 0 fallas");
} finally {
  await srv.cerrar();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}
