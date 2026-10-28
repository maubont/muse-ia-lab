# Evaluación P3 y P2 — antes de tocar nada

Fecha: 28-oct-2026. Basada en el código y la configuración reales, no en notas previas.

---

## P3 — Storage y entrega del contenido

### Lo que hay hoy

| Pieza | Estado real |
|---|---|
| 13 módulos | Carpetas de **Google Drive** (externas) |
| 4 bonos | Carpetas de **Google Drive** (externas) |
| Plan de Acción 7 Días | **1 URL de InsForge** — y el PDF **existe en el repo** (0,68 MB) |
| Videos del avatar | En el repo: 19 archivos, ~80 MB |
| Video de la landing | Local optimizado: 408 KB |

### Corrección a una nota mía anterior

Dije «6 URLs de InsForge en la configuración (4 de avatar, 2 de entrega)». **El inventario real dice 3**: dos en `avatar` y una en `entrega`. Lo corrijo aquí para que no se propague.

### Oportunidades detectadas

**P3-1 · El plan de 7 días muere con InsForge, y no debería.** Es el único «regalo» que menciona la entrega y apunta a un servicio que estamos abandonando. El PDF está en el repo: se sirve desde nuestro almacenamiento y la dependencia desaparece **hoy**.

**P3-2 · La protección real no es el almacenamiento, es la puerta.** Mudar archivos a R2 sin control de acceso no cambia nada: los enlaces siguen siendo públicos. Lo que protege es servir los archivos **a través del mismo token** que ya valida el curso.

**P3-3 · Servir desde el servidor o con URLs firmadas.** Dos caminos:

| | Servir desde el servidor | URLs firmadas (R2) |
|---|---|---|
| Ventaja | Una sola puerta, revocación inmediata, funciona hoy | No consume ancho de banda del servidor |
| Costo | El tráfico pasa por Railway | Requiere credenciales de Cloudflare |
| Cuándo | Ahora: el curso pesa poco | Cuando haya decenas de alumnos viendo video |

**P3-4 · Los videos del avatar no deben vivir en el repo.** 80 MB versionados en git. Deben servirse desde el mismo almacén y dejar el repo ligero.

**P3-5 · Límite honesto: esto no impide copiar.** Un alumno puede descargar lo que ve. Lo que sí se gana: revocar, saber quién entra, y que el enlace no se pueda reenviar indefinidamente. La piratería se **reduce**, no se elimina.

### Objetivo definido para P3

1. Interfaz `MediaStore` con dos implementaciones: **local** (hoy, sin credenciales) y **R2** (cuando existan).
2. Ruta `GET /media/<token>/<ruta>` que valida el mismo token del curso y entrega el archivo.
3. Migrar el **Plan de 7 Días** (0,68 MB) a nuestro almacén y corregir su URL en `entrega`.
4. Dejar preparado —no ejecutado— el traslado de los 13 módulos: requiere descargarlos de Drive, y eso es una decisión de contenido, no de código.

---

## P2 — Lectura del comprobante

### Lo que hay hoy

El destino se valida así (`functions/motor/comprobante.ts:155-156`):

```ts
const coincide = destinos.length > 0 &&
  candidatos.some((cand) => destinos.some((n) => cand === n || cand.includes(n)));
```

El candidato es el campo `destino` **más todos** los `numeros_detectados`.

### Hallazgos

**P2-1 · La comparación por subcadena acepta un número que solo *contenga* el nuestro.** El campo de referencia de una captura puede ser `M-3223565761-01`; al extraer solo dígitos queda `322356576101`, que **contiene** `3223565761` y por tanto coincide. Un comprobante falso que solo *mencione* nuestro número pasa el filtro del destino.

**P2-2 · Las cuentas de simulación de Venezuela están activas en la decisión.**

```
cuentas_ve.es_simulacion = true
cuentas_ve.provisional   = true
ve.pago_movil.telefono   = 0414-1234567     ← se acepta como destino propio
ve.cuenta.numero         = 01020123456789012345
```

`nuestrosDestinos()` las incluye sin mirar `es_simulacion`. Un comprobante en bolívares contra esas cuentas **se aprobaría**. El lanzamiento es solo Colombia, pero el código no lo impone. Y `es_simulacion` no lo lee nadie: es una promesa sin cumplir.

**P2-3 · Las llaves Bre-B pueden ser alfanuméricas y hoy se mutilan.** `soloDigitos()` las convierte en dígitos. Hoy la llave configurada es numérica (`3223565761`, el mismo número de Nequi), así que no falla; pero el día que sea un alias (`@musa`, `mibilletera.co`) la comparación sería incorrecta **en silencio**.

**P2-4 · No hay ventana de fecha.** Un comprobante de hace tres semanas, con referencia única, pasaría el filtro. La deduplicación por referencia protege del reenvío del *mismo* comprobante, no de uno viejo.

**P2-5 · Un monto que no cuadra se rechaza, cuando muchas veces debería ir a humano.** Un pago de 32.000 en vez de 33.000 puede ser un error del alumno, no un fraude: hoy se descarta sin mirarlo.

### Objetivo definido para P2

1. **Coincidencia exacta** tras normalizar (quitar separadores y el prefijo de país `57`), nunca por subcadena.
2. `numeros_detectados` solo como **respaldo**, exigiendo además que coincida el titular.
3. **Ignorar cuentas con `es_simulacion: true`** y registrar el aviso.
4. Soportar llaves **alfanuméricas** sin destruirlas.
5. **Ventana de fecha**: rechazar comprobantes de más de 72 h.
6. Monto fuera de rango: **a cola humana**, no rechazo seco.

---

## Lo que necesito de ti para ejecutar

| Tema | Decisión |
|---|---|
| P3 | ¿Sirvo los medios **desde el servidor** (hoy, sin nada) o esperas a tener **credenciales de Cloudflare R2**? Mi recomendación: servidor ahora, R2 cuando el curso pese. |
| P3 | ¿Autorizas descargar las 13 carpetas de Drive para mudarlas? Es contenido tuyo y puede ser pesado |
| P2 | ¿Confirmas que Venezuela **no** debe aceptarse en este lanzamiento? |
