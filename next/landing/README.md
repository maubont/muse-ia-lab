# Landing de Modelos IA

Un solo archivo principal, **15 KB**, cero peticiones externas, **0,46 MB** en total
con el video. Se abre desde disco y funciona; se puede subir a cualquier hosting
estático.

## Qué ya está puesto

| Pieza | Estado |
|---|---|
| Video de la modelo | ✅ `assets/demo.mp4` — 9 s, 720 px, sin audio, **408 KB** (recompilado desde `avatar/generados/kling-maria-comprimido.mp4`) |
| Poster | ✅ `assets/demo.jpg` — 38 KB, para que la sección no bloquee la carga |
| Términos | ✅ `terminos.html` — con datos del titular por rellenar |
| Privacidad | ✅ `privacidad.html` — incluye la divulgación de IA y la Ley 1581 |
| Reembolsos | ✅ `reembolsos.html` — **propuesta**, marcada como pendiente de aprobación |
| Atribución | ✅ `?ref=` viaja en el texto del mensaje |
| Puerta 18+ | ✅ antes de salir a WhatsApp |

## Qué falta antes de publicar

| Buscar | Poner |
|---|---|
| `57XXXXXXXXXX` | El número de WhatsApp de Musa, sin `+` ni espacios. **Sin esto el CTA no lleva a ninguna parte** |
| `[NOMBRE O RAZÓN SOCIAL PENDIENTE]`, `[CORREO PENDIENTE]` | Los datos reales del titular, en las tres páginas legales |
| `[PLAZO A DEFINIR]` | Cuánto tiempo se guardan los datos y en qué plazo se responde un reembolso |
| Píxel de Meta | El ID, cuando exista. El evento `Contact` ya está preparado y solo se dispara si `fbq` existe |

## Decisiones de diseño (y por qué)

**Un solo objetivo: entrar a WhatsApp.** Los cinco botones hacen exactamente lo
mismo. No hay menú, no hay enlaces que saquen al visitante de la página, no hay
formulario: cada paso extra pierde gente.

**El CTA no está en el encabezado.** Un caso documentado subió conversiones 39 %
**quitando** el botón dominante de arriba: la gente decidía antes de entender la
oferta. Aquí primero se explica, después se pide la acción.

**La referencia viaja en el texto del mensaje.** Meta borra los UTM al pasar a
WhatsApp, así que el `?ref=` se convierte en `Ref: XXXX` dentro del mensaje
prellenado. El bot lo lee en el primer turno: así se sabe qué anuncio trajo a
quien compró.

**Puerta de 18 años antes de salir.** Un checkbox obligatorio. No es burocracia:
un usuario que entiende con quién habla y qué compra reporta menos, y los reportes
son lo que tumba un número en Baileys.

**Sin promesas de ingresos.** Nada de "gana dinero desde casa". Además de ser
falso, Meta lo prohíbe y es motivo de rechazo del anuncio.

## Cómo se mide

- `?ref=` en la URL del anuncio → llega al chat → se puede cruzar con ventas.
- El evento `Contact` del píxel se dispara al pulsar el CTA, **solo si `fbq`
  existe**. No se carga ningún píxel todavía: falta el ID.
- El servidor ya registra `respuesta_enviada` con los milisegundos de cada turno.

## Lo que falta y no puedo poner yo

1. **El número**: sin él, el CTA no lleva a ninguna parte.
2. **Testimonios reales.** No inventé ninguno: la sección de prueba social está
   deliberadamente ausente hasta que existan clientes.
3. **El ID del píxel de Meta** y la verificación del dominio.
4. **Los datos del titular** en las páginas legales.

## Cómo se probó

Se sirvió en local y se comprobó que las tres rutas responden:

```
/                 HTTP 200 · 15 KB · text/html
/assets/demo.mp4  HTTP 200 · 408 KB · video/mp4
/terminos.html    HTTP 200 ·  3 KB · text/html
```

Los cuatro enlaces internos resuelven a archivos existentes; no hay rutas muertas.
