# Cómo se lee un comprobante: configuración y proveedores

Documento de referencia para quien configure —o depure— la lectura de comprobantes
de Musa.

---

## 1. Qué es `MUSA_IA_URL`

Es la **dirección base** de la API del proveedor de IA. El código le añade
`/chat/completions` por detrás.

```
MUSA_IA_URL = https://api.openai.com/v1
                        ↓ el código concatena
POST https://api.openai.com/v1/chat/completions
```

**No se pone la ruta completa.** Si pones `/chat/completions` al final, la
petición irá a `…/chat/completions/chat/completions` y dará 404.

### Por qué es una URL y no un proveedor fijo

Los tres grandes hablan el mismo dialecto en su endpoint de chat. Con una variable
se cambia de proveedor **sin tocar código ni desplegar**:

| Proveedor | `MUSA_IA_URL` | Modelo de ejemplo |
|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-6-luna` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | el que elijas del catálogo |
| **Gemini** (compatibilidad OpenAI) | `https://generativelanguage.googleapis.com/v1beta/openai` | un modelo de la familia Gemini |

Cada proveedor tiene **su propia clave**. La de OpenAI no funciona en OpenRouter,
ni al revés. URL y clave van en pareja.

---

## 2. Configuración mínima

```env
MUSA_IA_URL=https://api.openai.com/v1
MUSA_IA_KEY=sk-...
MUSA_IA_MODELO=gpt-6-luna
```

Con esas tres, el servidor arranca con:

```
[musa] visión: gpt-6-luna · presupuesto 1 USD/día
```

Sin ellas tres, arranca igual pero avisa:

```
[musa] visión: sin proveedor · los comprobantes van a la cola humana
```

Ese segundo mensaje **no es un error**: es el comportamiento correcto. Sin
proveedor no se inventa una lectura; el comprobante lo mira una persona.

---

## 3. Ajustes opcionales

| Variable | Por defecto | Para qué |
|---|---|---|
| `MUSA_PRESUPUESTO_DIARIO_USD` | `1` | Tope de gasto al día. Al agotarse, todo va a la cola humana |
| `MUSA_IA_RAZONAMIENTO` | `none` | Esfuerzo de razonamiento. **No lo subas** para leer comprobantes: cuesta más y no mejora |
| `MUSA_IA_JSON` | `si` | Pide salida estructurada. Ponlo en `no` si el proveedor la rechaza |
| `MUSA_IA_MAX_TOKENS` | `400` | Tope de tokens de salida |
| `MUSA_IA_TIMEOUT_MS` | `30000` | Corte por lentitud |
| `MUSA_IA_PRECIO_ENTRADA` | `0.1` | Precio por millón de tokens de entrada (para el registro de gasto) |
| `MUSA_IA_PRECIO_SALIDA` | `0.5` | Precio por millón de salida |

> **Sobre los precios:** si cambias de modelo o de proveedor, actualiza estos dos
> valores. Solo se usan para calcular el gasto registrado y comprobar el tope
> diario. Si no coinciden con la realidad, el tope se aplicará con otro criterio.

---

## 4. Errores frecuentes

| Síntoma | Causa |
|---|---|
| `http_404` | La URL incluye `/chat/completions`, o el modelo no existe con ese nombre exacto |
| `http_401` | La clave no es de ese proveedor, o está mal copiada |
| `http_429` | Límite de peticiones del proveedor; el sistema manda el caso a humano y no reintenta solo |
| `json_invalido` | El modelo respondió algo que no se pudo interpretar. Suele arreglarse activando `MUSA_IA_JSON=si` |
| Siempre cola humana | Falta alguna de las tres variables, o el presupuesto del día está agotado |

Los cuatro primeros quedan registrados en `musa_consumo_ia` con el motivo exacto.

---

## 5. Cómo comprobar que funciona

Antes de confiar en él, con los 3 comprobantes reales del repo:

```bash
$env:MUSA_IA_URL="https://api.openai.com/v1"
$env:MUSA_IA_KEY="sk-..."
$env:MUSA_IA_MODELO="gpt-6-luna"
node --experimental-strip-types next/scripts/calibrar-vision.mjs
```

Compara lo que lee el modelo contra lo que está impreso en cada imagen (monto,
moneda, destino, referencia, estado) y devuelve el coste real por comprobante.
**Sale con código 1 si algo no coincide.**

---

## 6. Las cuatro defensas, para entender qué se puede esperar

```
1. PREFILTRO    sin imagen, PDF, >8 MB o lead que ya pagó  → no se gasta
2. CACHÉ        mismo archivo (sha256)                     → no se paga dos veces
3. PRESUPUESTO  gasto del día contra el tope               → si no cabe, a humano
4. PROVEEDOR    leer, validar campo por campo, registrar
```

Y la regla que manda sobre las cuatro: **cualquier duda termina en una persona.**
Un pago nunca se aprueba sin datos válidos, aunque el modelo diga que está seguro.

---

## 7. Medición real (29-oct-2026)

Con la clave en producción y los 3 comprobantes del repo, enviados al endpoint:

| Comprobante | Lectura | Tiempo | Coste |
|---|---|---|---|
| Nequi · envío exitoso | 33.000 COP · 3223565761 · 1834502671 · exitosa | 3,1 s | $0,000139 |
| Pago Móvil · Venezuela | 7.400 VES · 0414-1234567 · 004812670933 · exitosa | 2,5 s | $0,000147 |
| Nequi · programada | 33.000 COP · 3223565761 · M7740031288 · **programada** | 1,9 s | $0,000147 |

**15 de 15 campos correctos.** Coste de las tres pruebas: **$0,000432**.

A ese precio, **1.000 comprobantes cuestan $0,14**.

### Y la decisión que producen

| Comprobante | Decisión | Por qué |
|---|---|---|
| Nequi · exitosa | **AUTO_APROBAR** | monto, destino, fecha y estado correctos |
| Pago Móvil · VES | **COLA_HUMANA** | Venezuela fuera del lanzamiento |
| Nequi · programada | **COLA_HUMANA** | una transferencia programada todavía no es dinero |

El modelo distinguió «Programada» de «Exitosa» por sí solo — el caso que más
preocupaba, porque un falso «exitosa» entregaría el curso sin cobrar.