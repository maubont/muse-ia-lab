// next/src/motor/contrato.ts — contrato del MOTOR del funnel.
//
// El servidor HTTP no sabe de estados, precios ni comprobantes: solo llama a
// `procesar()` y envía lo que le devuelvan. Eso permite portar la máquina de
// estados S00–S93 sin tocar la capa de red, y probar la red sin el funnel.

import type { MensajeEntrante, MensajeSaliente } from "../../../functions/canal/tipos.ts";

export interface Motor {
  /**
   * Recibe un mensaje ya autenticado y normalizado; devuelve lo que hay que enviar.
   * Puede devolver [] (no contestar) sin que eso sea un error.
   * Debe ser idempotente respecto a `mensaje.id_externo` cuando el llamador ya
   * deduplicó — hoy el servidor deduplica, pero el worker del futuro no.
   */
  procesar(mensaje: MensajeEntrante): Promise<MensajeSaliente[]>;
}

/**
 * Motor de eco: SOLO para desarrollo y pruebas de conectividad (Fase 1.4).
 * Repite el texto recibido y deja ver en el log el `MensajeEntrante` completo.
 * Nunca debe configurarse en producción.
 */
export function motorEco(): Motor {
  return {
    async procesar(mensaje: MensajeEntrante): Promise<MensajeSaliente[]> {
      const resumen = {
        canal: mensaje.canal,
        telefono: mensaje.telefono,
        nombre: mensaje.nombre_perfil,
        texto: mensaje.texto,
        media: mensaje.media ? { tipo: mensaje.media.tipo, mime: mensaje.media.mime } : null,
        atribucion: mensaje.atribucion,
        id_externo: mensaje.id_externo,
      };
      console.log("[motor-eco]", JSON.stringify(resumen));
      if (!mensaje.texto) return [];
      return [{ texto: `eco: ${mensaje.texto}` }];
    },
  };
}
