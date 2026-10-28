# Landing de Modelos IA

Un solo archivo, **15 KB**, cero peticiones externas. Se abre desde disco y
funciona; se puede subir a cualquier hosting estático.

## Qué hay que reemplazar antes de publicar

| Buscar | Poner | Por qué |
|---|---|---|
| `57XXXXXXXXXX` | El número de WhatsApp de Musa, sin `+` ni espacios | Es el destino del CTA |
| `[ Aquí va el video de la modelo… ]` | `<video src="..." autoplay muted loop playsinline>` vertical 9:16, ≤3 MB | **Sin media real la página no vende**: la promesa es visual |
| `<a href="/terminos">` y los otros dos | URLs reales de términos, privacidad y reembolsos | Meta exige que existan para aprobar el anuncio |

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

1. **El video o la imagen de la modelo.** Es la prueba del producto. Sin eso, la
   página es texto bonito.
2. **Testimonios reales.** No inventé ninguno: la sección de prueba social está
   deliberadamente ausente hasta que existan clientes.
3. **El ID del píxel de Meta** y la verificación del dominio.
4. **El número**: sin él, el CTA no lleva a ninguna parte.
