// next/src/acceso/medios.ts — ALMACÉN DE CONTENIDO.
//
// Hoy el contenido vive en carpetas públicas de Drive: quien las recibe, las
// reparte. Esto pone el contenido detrás del MISMO token que ya abre el curso.
//
// ── POR QUÉ UNA INTERFAZ Y NO UNA CARPETA ────────────────────────────────────
// Servir desde el servidor funciona hoy y no necesita credenciales. Cuando el
// curso pese (video, decenas de alumnos), se cambia la implementación por R2 con
// URLs firmadas y **nada más del sistema cambia**: la ruta, el token y la página
// siguen igual.
//
// ── LA REGLA QUE NO SE PUEDE SALTAR ──────────────────────────────────────────
// La clave viene de la configuración, pero se trata como dato NO confiable: un
// `..` en la clave leería archivos del servidor. Toda clave se normaliza y se
// comprueba que quede DENTRO de la raíz. Sin excepciones.

import { createReadStream, statSync, existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";

export interface MedioResuelto {
  /** ruta absoluta en disco */
  ruta: string;
  tamano: number;
  tipo: string;
  /** para la cabecera Content-Disposition */
  nombre: string;
}

export interface MediaStore {
  /** Guarda un archivo local bajo una clave. Devuelve la clave normalizada. */
  guardar(clave: string, origen: string): Promise<string>;
  /** Resuelve una clave a un archivo servible, o null. */
  resolver(clave: string): Promise<MedioResuelto | null>;
  /** Solo comprueba existencia. Útil para avisar de enlaces rotos. */
  existe(clave: string): Promise<boolean>;
}

/** Tipos que se sirven inline. Todo lo demás, como descarga. */
const TIPOS: Record<string, string> = {
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".zip": "application/zip",
};

/**
 * Normaliza una clave y comprueba que no se escape de la raíz.
 * Devuelve la clave relativa segura, o null si es sospechosa.
 */
export function claveSegura(clave: string): string | null {
  if (!clave || typeof clave !== "string") return null;
  // NUL, barra invertida (separador de Windows) y dos puntos (unidad `C:`): fuera.
  if (clave.includes("\0") || clave.includes("\\") || clave.includes(":")) return null;

  const limpia = clave.replace(/^\/+/, "");
  if (!limpia) return null;

  const partes = limpia.split("/");
  // `..` en cualquier posición: rechazo directo, sin intentar adivinar.
  // Tampoco se aceptan segmentos vacíos (dobles barras) ni `.`.
  if (partes.some((p) => p === "" || p === "." || p === "..")) return null;

  return partes.join("/");
}

export function crearAlmacenLocal(raiz: string): MediaStore {
  const base = resolve(raiz);

  /** Ruta absoluta segura dentro de la raíz, o null. */
  const rutaDe = (clave: string): string | null => {
    const segura = claveSegura(clave);
    if (!segura) return null;
    const abs = resolve(join(base, segura));
    // La comprobación que de verdad importa: ¿sigue dentro?
    if (abs !== base && !abs.startsWith(base + sep)) return null;
    return abs;
  };

  return {
    async guardar(clave, origen) {
      const segura = claveSegura(clave);
      if (!segura) throw new Error("clave no permitida");
      const destino = rutaDe(segura);
      if (!destino) throw new Error("clave fuera de la raíz");
      await mkdir(dirname(destino), { recursive: true });
      await copyFile(origen, destino);
      return segura;
    },

    async resolver(clave) {
      const abs = rutaDe(clave);
      if (!abs || !existsSync(abs)) return null;
      const st = statSync(abs);
      if (!st.isFile()) return null;
      const tipo = TIPOS[extname(abs).toLowerCase()] ?? "application/octet-stream";
      return {
        ruta: abs,
        tamano: st.size,
        tipo,
        nombre: abs.split(sep).pop() ?? "archivo",
      };
    },

    async existe(clave) {
      const abs = rutaDe(clave);
      return !!abs && existsSync(abs);
    },
  };
}

/** Lee el archivo por trozos: no carga un video entero en memoria. */
export function leerMedio(m: MedioResuelto) {
  return createReadStream(m.ruta);
}

/**
 * Enlaces internos: la configuración puede decir `media:bonos/plan.pdf` en vez de
 * una URL. La página lo convierte al enlace con el token de quien mira.
 */
export const PREFIJO_MEDIA = "media:";

export function esEnlaceDeMedio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.startsWith(PREFIJO_MEDIA);
}

export function rutaDeMedio(valor: string): string {
  return valor.slice(PREFIJO_MEDIA.length).replace(/^\/+/, "");
}

/** Construye el enlace servible a partir de la clave y el token del alumno. */
export function enlaceDeMedio(clave: string, token: string): string {
  const partes = clave.split("/").map(encodeURIComponent).join("/");
  return `/media/${encodeURIComponent(token)}/${partes}`;
}
