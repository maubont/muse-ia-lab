// next/src/acceso/almacen-s3.ts — CONTENIDO EN OBJETOS (S3 compatible).
//
// Cuándo: cuando el curso pesa más de lo que puede vivir en el disco del
// servidor. Hoy son 7,6 GB, así que es el caso.
//
// ── LA DECISIÓN IMPORTANTE: URL FIRMADA, NO PROXY ────────────────────────────
// Si el servidor hiciera de intermediario, cada video de 600 MB pasaría por
// Railway: ancho de banda, CPU y un cuello de botella. Con una URL firmada, el
// servidor solo comprueba el token y **redirige**; el archivo viaja del almacén
// al alumno sin pasar por aquí.
//
// La firma caduca (5 minutos por defecto). Un enlace copiado deja de servir solo.

import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { claveSegura } from "./medios.ts";

export interface ConfigS3 {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Segundos de validez de la URL firmada. */
  segundos?: number;
}

export interface AlmacenRemoto {
  /** URL firmada para leer la clave, o null si no existe. */
  desplazar: (clave: string) => Promise<string | null>;
  existe: (clave: string) => Promise<boolean>;
}

export function crearAlmacenS3(cfg: ConfigS3): AlmacenRemoto {
  const s3 = new S3Client({
    region: cfg.region || "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // R2 y el almacén de Railway usan estilo virtual-host.
    forcePathStyle: false,
  });
  const segundos = cfg.segundos ?? 300;

  return {
    async desplazar(clave) {
      const segura = claveSegura(clave);
      if (!segura) return null;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: segura }));
      } catch {
        return null; // no existe: no se firma nada
      }
      const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: segura });
      return getSignedUrl(s3, cmd, { expiresIn: segundos });
    },

    async existe(clave) {
      const segura = claveSegura(clave);
      if (!segura) return false;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: segura }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Lee la configuración del entorno. Devuelve null si falta algo. */
export function configDesdeEntorno(env: Record<string, string | undefined>): ConfigS3 | null {
  const endpoint = (env.MUSA_S3_ENDPOINT ?? "").trim();
  const bucket = (env.MUSA_S3_BUCKET ?? "").trim();
  const accessKeyId = (env.MUSA_S3_ACCESS_KEY ?? "").trim();
  const secretAccessKey = (env.MUSA_S3_SECRET_KEY ?? "").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region: (env.MUSA_S3_REGION ?? "auto").trim(),
    bucket,
    accessKeyId,
    secretAccessKey,
    segundos: Number(env.MUSA_S3_FIRMA_SEGUNDOS ?? 300),
  };
}
