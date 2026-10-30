# Ingeniería inversa del cliente de HyperModels (REA)

30-oct-2026. Objetivo: entender **cómo está construida** su área de alumnos para
mejorar la nuestra, no reutilizar su contenido.

**Alcance:** solo el JavaScript que su web sirve a un usuario autenticado. No se
accedió a su servidor, su base de datos ni su código privado. **No se conservó
ningún archivo suyo**: los chunks se analizaron y se borraron.

---

## Cómo se hizo, y qué funcionó

| Paso | Herramienta | Resultado |
|---|---|---|
| Conectar al navegador ya autenticado | REA `list-browser-targets` | ✅ 3 targets, identificó la página del curso |
| Capturar y analizar el bundle | REA `analyze-web-bundle` | ⚠️ capturó la página, pero **0 fuentes**: `status: empty` |
| Descargar los 20 chunks (1,9 MB) | HTTP directo | ✅ |
| Análisis semántico local | REA `analyze-javascript-application` | ❌ **`provider_timeout`**: 300 s por fuente, y están minificados |
| Extracción dirigida de estructura | regex sobre los chunks | ✅ **aquí salió todo lo útil** |

**Lo que esto enseña sobre REA:** es una herramienta excelente para binarios,
Electron y apps con código sin minificar. Para un bundle de Next.js minificado de
1,9 MB, su analizador semántico no llega en el presupuesto por defecto. Se puede
subir `--analysis-timeout-ms`, pero para **estructura de producto** el análisis de
cadenas da el 90 % del valor en el 5 % del tiempo.

---

## Lo que reveló el código

### 1. Hay **desbloqueo por fecha** (drip content), no solo progreso

```
unlockLessonAction              ← una acción de servidor para desbloquear
LockedLessonDialog              ← el diálogo de lección bloqueada
  · "Desbloqueando..."
  · "Se desbloquea el {fecha}"
  · "Se desbloquea en {tiempo}"
```

Es decir: **las lecciones se abren según un calendario**. Por eso los módulos sin
empezar se veían desenfocados en la captura: **estaban bloqueados por fecha**, no
apagados. Me equivoqué al interpretarlo.

### 2. Y hay una **puerta con coste** para saltarse el bloqueo

```
"…es posible que pierdas acceso a un par de sorpresas vinculadas a tu progreso.
 ¿Quieres continuar?"
  → "Sí, desbloquear"
```

No te prohíben adelantarte: te avisan de que **pierdes recompensas**. Es una fricción
elegante —el usuario decide— en vez de un muro.

### 3. Es **bilingüe de verdad**, con dos árboles de curso

```
/dashboard/hypermodels/modules/32-programa-afiliados/lessons/01
/dashboard/hypermodels-en/modules/32-affiliate-program/lessons/01
```

Mismo curso, dos idiomas, rutas paralelas. Y usan `useDict()`: diccionarios, no
traducciones dispersas.

### 4. Vocabulario del modelo

| Término | Apariciones |
|---|---|
| `module` | 484 |
| `lesson` | 131 |
| `locked` | 90 |
| `progress` | 59 |
| `completed` | 47 |
| `unlock` | 43 |
| `affiliate` | 40 |

**No hay certificados.** Las 28 apariciones de «certificate» eran del reproductor de
video (DRM/HLS), no del curso. Otra lectura mía que hay que corregir.

### 5. Su stack

- **Next.js** con *server actions* (`createServerReference`, `unlockLessonAction`).
- **Clerk** para autenticación.
- 23 llamadas a `fetch(` desde el cliente.
- i18n por diccionarios.

---

## Lo que vale copiar, y lo que no

### Vale copiar

| Idea | Por qué | Coste en Musa |
|---|---|---|
| **El diálogo de bloqueo con coste** | Deja elegir en vez de prohibir. Es la mejor pieza de UX de su plataforma | Bajo, si hay progreso |
| **Orden y desbloqueo secuencial** | Convierte 60 archivos en un recorrido | Medio |
| **Progreso visible** | Es lo que hace que se termine | Medio |
| **Diccionarios para textos** | Permite traducir sin tocar la lógica | Bajo |

### No vale copiar

| Idea | Por qué no |
|---|---|
| **Drip por calendario** | En un curso de 9 USD con 60 archivos, abrir lecciones por fecha **frustra**: el comprador quiere todo ya. Su precio (27 USD) y su público justifican el ritmo; el nuestro no |
| **Recompensas («sorpresas»)** | Hay que diseñarlas, producirlas y mantenerlas. Es otro producto |
| **Bilingüe con dos árboles** | Duplica el mantenimiento del contenido. Primero Colombia |
| **Server actions** | Su arquitectura; la nuestra es un servidor sin dependencias y funciona |

---

## Conclusión

Su ventaja no es tecnología: es que **el curso está modelado** (`module` → `lesson` →
`completed`) y el alumno ve **dónde está y qué sigue**.

Nosotros tenemos archivos con nombres bonitos. El siguiente escalón no es copiar su
drip: es tener **progreso y vista de lección**. Eso se puede hacer sin calendario, sin
recompensas y sin inglés.
