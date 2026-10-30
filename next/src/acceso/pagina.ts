// next/src/acceso/pagina.ts — LA PÁGINA DEL CURSO.
//
// Se genera del contenido real de `musa_settings.entrega`: si mañana cambian los
// enlaces, la página cambia sola. Nada de listas hardcodeadas.
//
// Se renderiza en el servidor, sin JavaScript: carga en cualquier teléfono y no
// filtra la estructura del producto a nadie que no tenga acceso.
//
// ── CAMBIO DE FORMA (migración al almacén propio) ────────────────────────────
// Antes: un enlace por módulo (13 carpetas de Drive).
// Ahora: cada módulo tiene VARIOS archivos (clases en video + PDF de enlaces).
// `modulos` acepta las tres formas para no romper la configuración existente:
//   · "https://…"                       (legado: un enlace)
//   · ["media:curso/01/1.1-….mp4", …]   (nuevo: varios archivos)
//   · { titulo: "…", archivos: [ … ] }  (nuevo: con nombre propio)

export interface ModuloConfig {
  titulo?: string;
  archivos: string[];
}

export type EntradaModulo = string | string[] | ModuloConfig;

export interface EntregaConfig {
  modulos?: EntradaModulo[];
  /** Cada bono puede ser un enlace o varios archivos migrados. */
  bonos?: Record<string, string | string[]>;
  plan_accion_7dias?: string;
  link_grupo?: string;
}

export interface OpcionesPagina {
  /**
   * Token del alumno. Con él se construyen los enlaces internos (`media:…`),
   * que de otro modo no se pueden servir: el contenido va detrás del acceso.
   */
  token?: string;
}

/**
 * Convierte el valor de la configuración en un enlace utilizable.
 *  · `media:bonos/plan.pdf` → `/media/<token>/bonos/plan.pdf`
 *  · `https://…`            → tal cual
 *  · cualquier otra cosa    → null (no se enlaza a la nada)
 */
export function resolverEnlace(valor: unknown, token?: string): string | null {
  if (typeof valor !== "string" || !valor) return null;
  if (valor.startsWith("media:")) {
    if (!token) return null; // sin token no hay forma de servirlo
    const clave = valor.slice("media:".length).replace(/^\/+/, "");
    const partes = clave.split("/").map(encodeURIComponent).join("/");
    return `/media/${encodeURIComponent(token)}/${partes}`;
  }
  if (/^https?:\/\//i.test(valor)) return valor;
  return null;
}

/** Normaliza cualquier forma de entrada a `{ titulo?, archivos }`. */
export function normalizarModulo(entrada: EntradaModulo): ModuloConfig {
  if (typeof entrada === "string") return { archivos: [entrada] };
  if (Array.isArray(entrada)) return { archivos: entrada.filter((x) => typeof x === "string") };
  if (entrada && typeof entrada === "object") {
    return {
      titulo: typeof entrada.titulo === "string" ? entrada.titulo : undefined,
      archivos: Array.isArray(entrada.archivos) ? entrada.archivos.filter((x) => typeof x === "string") : [],
    };
  }
  return { archivos: [] };
}

/** Títulos de los 13 módulos. Hoy la configuración solo trae URLs. */
/**
 * Títulos de los 13 módulos.
 *
 * ── SE RENOMBRARON EL 30-OCT-2026 ────────────────────────────────────────────
 * Los anteriores eran un índice inventado para la página de venta: se prometía
 * «Escenarios y luz» y el archivo dentro era un tutorial de bots de Telegram. Cada
 * uno de estos dice lo que el módulo contiene de verdad, revisado archivo por archivo.
 */
export const TITULOS_MODULOS = [
  "Bienvenida y estrategia",
  "Tu primer modelo con IA",
  "Las herramientas: ChatGPT, Leonardo, SeaArt y DeepSeek",
  "Crear contenido en serie",
  "Monetización: los primeros pasos",
  "Telegram: tu grupo y tu bot",
  "Herramientas para potenciar tu IA",
  "Hazte viral en TikTok",
  "Mente de empresario",
  "Fanvue: cómo funciona",
  "Crea videos 100 % realistas",
  "ManyChat desde cero",
  "Biblioteca de prompts",
] as const;

/**
 * NOMBRES EXACTOS para los archivos del curso.
 *
 * La limpieza automática no basta: los archivos llegaron como
 * «Copia-de-6.2-CREANDO-Y-CONFIGURANDO-EL-BOT-DE-TELEGRAM» y en pantalla se veía
 * tal cual. Aquí está el nombre que debe leer el alumno, escrito a mano uno por uno.
 * Si un archivo no está en esta tabla, se usa la limpieza automática.
 */
export const NOMBRES_CURSO: Record<string, string> = {
  "curso/01/1.1-Empieza-aqui-Introduccion.mp4": "Empieza aquí: introducción",
  "curso/01/1.2-Tu-estrategia-en-Instagram.mp4": "Tu estrategia en Instagram",
  "curso/01/1.3-Entendiendo-la-base-del-mercado-de-Modelos-IA.mp4": "Entiende el mercado de modelos IA",

  "curso/02/2.1-Creando-los-primeros-modelos-con-Candy.mp4": "Crea tus primeros modelos con Candy",
  "curso/02/2.1-Enlace-Candy.pdf": "Enlace: Candy",
  "curso/02/2.2-Atencion_-contenido-18_.mp4": "Atención: contenido +18",
  "curso/02/2.3-Enlaces-Ainudez-y-Pornjourney.pdf": "Enlaces: herramientas de nudify",
  "curso/02/2.4-Dandole-vida-a-tu-modelo-_18_": "Dale vida a tu modelo (+18)",
  "curso/02/2.5-Enlaces-Dandole-vida-a-tu-modelo-_18_.pdf": "Enlaces: dale vida a tu modelo (+18)",

  "curso/03/3.1-Chatgpt-en-su-maximo-esplendor": "ChatGPT al máximo",
  "curso/03/3.2-Leonardo-AI-para-capos": "Leonardo AI",
  "curso/03/3.3-Seaairt.ai-lo-mas-secreto-de-la-IA": "SeaArt AI",
  "curso/03/3.4-Deepseek-_-Opensource-_-Pollo-AI": "DeepSeek, OpenSource y Pollo AI",
  "curso/03/3.5-Enlaces-Deepseek-_-Opensource-_-Pollo-AI.pdf": "Enlaces: DeepSeek, OpenSource y Pollo AI",
  "curso/03/3.6-Reve-_-Nudify": "Reve y Nudify",

  "curso/04/4.1-Creando-em-Leonardo-AI": "Crear en Leonardo AI",
  "curso/04/4.2-Creando-Contenidos-Infinitos": "Contenido infinito",
  "curso/04/4.3-Llamada-de-Mentoria-Secreta-2.0.mp4": "Mentoría: llamada 2.0",

  "curso/05/Copia-de-5.1-MONETIZA-TU-IA-CON-ESTOS-SENCILLOS-PASOS": "Monetiza tu IA en pasos sencillos",

  "curso/06/Copia-de-6.1-CREANDO-GRUPO-DE-TELEGRAM": "Crear tu grupo de Telegram",
  "curso/06/Copia-de-6.2-CREANDO-Y-CONFIGURANDO-EL-BOT-DE-TELEGRAM": "Configurar tu bot de Telegram",

  "curso/07/Copia-de-7.1-Herramientas-para-potenciar-tu-IA.pdf": "Herramientas para potenciar tu IA",

  "curso/08/Copia-de-8.1-HAZTE-VIRAL-EN-TIKTOK": "Hazte viral en TikTok",

  "curso/09/Copia-de-Atencion-Mente-de-Empresario.txt": "Mente de empresario",

  "curso/10/-10-Fanvue.mp4": "Fanvue: cómo funciona",

  "curso/11/CREA-VIDEOS-100_-REALISTAS": "Crea videos 100 % realistas",

  "curso/12/12.1-MANYCHAT-DESDE-CERO.mp4": "ManyChat desde cero",

  "curso/13/13.1-Prompts.pdf": "Prompts (parte 1)",
  "curso/13/13.2-Prompts-PARTE-2.pdf": "Prompts (parte 2)",
};

/** Nombres legibles de los bonos a partir de su clave en la configuración. */
export function nombreDeBono(clave: string): string {
  const nombres: Record<string, string> = {
    audios_fempro: "Audios Fempro",
    coleccion_modelos: "Colección de modelos",
    megapack_master_ia: "Megapack Master IA",
    youtube_money_machine: "YouTube Money Machine",
    plan_accion_7dias: "Plan de Acción 7 Días",
  };
  if (nombres[clave]) return nombres[clave];
  return clave.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapar(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto legible a partir de un segmento de la clave. */
function legible(segmento: string): string {
  return segmento
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nombre de archivo legible a partir de la clave del almacén.
 *
 * `prefijo` es la parte de la clave que identifica al grupo (por ejemplo
 * `bonos/megapack_master_ia`). Si después de quitarlo queda una carpeta, se
 * antepone: dentro del megapack hay un `1.1 Introducción` en cada módulo, y sin
 * la carpeta el alumno vería tres enlaces con el mismo nombre.
 */
export function nombreVisible(clave: string, prefijo?: string): string {
  // LA TABLA VA PRIMERO, con la clave completa: si se busca después de recortar el
  // prefijo, ninguna entrada coincide.
  const exacto = NOMBRES_CURSO[clave] ?? NOMBRES_CURSO[clave.replace(/^\/+/, "")];
  if (exacto) return exacto;

  let resto = clave;
  if (prefijo && resto.startsWith(prefijo + "/")) resto = resto.slice(prefijo.length + 1);

  const partes = resto.split("/").filter(Boolean);
  const archivo = legible(partes.pop() ?? clave);
  if (partes.length === 0) return archivo;

  return `${legible(partes[partes.length - 1])} · ${archivo}`;
}

/** Tipo de archivo por extensión, para etiquetar cada enlace. */
export function tipoDeArchivo(clave: string): { etiqueta: string; icono: string } {
  // SIN EXTENSIÓN = VIDEO. Se comprobó archivo por archivo contra el almacén: los
  // 13 que vienen sin extensión son video/mp4. Antes se etiquetaban como «Archivo»
  // y el alumno no sabía que podía reproducirlos.
  const partes = (clave.split("/").pop() ?? "").split(".");
  const tieneExtension = partes.length > 1 && /^[a-z0-9]{2,5}$/i.test(partes[partes.length - 1]);
  if (!tieneExtension) return { etiqueta: "Video", icono: "▶" };
  const ext = (partes.pop() ?? "").toLowerCase();
  if (ext === "mp4" || ext === "mov" || ext === "mkv") return { etiqueta: "Video", icono: "▶" };
  if (ext === "pdf") return { etiqueta: "PDF", icono: "▤" };
  if (ext === "mp3" || ext === "m4a") return { etiqueta: "Audio", icono: "♪" };
  if (ext === "zip" || ext === "rar" || ext === "7z") return { etiqueta: "Paquete", icono: "▣" };
  return { etiqueta: "Archivo", icono: "•" };
}

/** Cabecera de la página (compartida por las pantallas de acceso). */
function cabecera(titulo: string): string {
  return `<!doctype html><html lang="es-CO"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapar(titulo)}</title>
<style>
:root{--fondo:#0b0b10;--panel:#14141c;--texto:#f4f4f7;--tenue:#a5a5b8;--acento:#c4b5fd;--borde:#262632;--ok:#34d399}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--fondo);color:var(--texto);font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:680px;margin:0 auto;padding:36px 20px 72px}
h1{font-size:26px;letter-spacing:-.02em;line-height:1.25;margin-bottom:6px}
h2{font-size:17px;margin:34px 0 6px;color:var(--texto)}
h2 small{display:block;font-weight:400;font-size:13px;color:var(--tenue);margin-top:2px}
p{color:var(--tenue);font-size:15px}
a.tarjeta{display:flex;gap:12px;align-items:flex-start;text-decoration:none;color:inherit;
  background:var(--panel);border:1px solid var(--borde);border-radius:12px;padding:12px 14px;margin-bottom:8px}
a.tarjeta:hover{border-color:#3b3b4d}
.num{flex:0 0 26px;height:26px;border-radius:50%;background:rgba(139,92,246,.16);
  border:1px solid rgba(139,92,246,.4);color:var(--acento);font-weight:700;font-size:13px;
  display:grid;place-items:center;margin-top:1px}
.tarjeta strong{display:block;font-size:14.5px;color:var(--texto);font-weight:600;line-height:1.35}
.tarjeta span{font-size:12.5px;color:var(--tenue)}
.aviso{margin-top:36px;padding:14px 16px;border-radius:12px;background:var(--panel);
  border:1px solid var(--borde);font-size:13px;color:var(--tenue)}
.boton{display:inline-block;padding:14px 22px;border-radius:12px;text-decoration:none;
      font-weight:700;font-size:15px;color:#fff;
      background:linear-gradient(180deg,#a78bfa,#7c3aed);
      box-shadow:0 10px 24px -12px rgba(139,92,246,.9)}
    .boton:hover{filter:brightness(1.06)}
    .error{max-width:420px;margin:80px auto;text-align:center}
.error h1{color:#f87171;margin-bottom:12px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--borde);font-size:12px;color:#6b6b7d}
</style></head><body><main>`;
}

const pie = `</main></body></html>`;

function tarjetaModulo(indice: number, m: ModuloConfig, token?: string): string {
  const titulo = m.titulo ?? TITULOS_MODULOS[indice] ?? `Módulo ${indice + 1}`;
  const filas = m.archivos
    .map((archivo) => ({ archivo, url: resolverEnlace(archivo, token) }))
    .filter((x): x is { archivo: string; url: string } => !!x.url);
  if (filas.length === 0) return "";

  // UN SOLO ARCHIVO: MISMA ESTRUCTURA QUE LOS DEMÁS.
  // Antes se pintaba como tarjeta suelta al mismo nivel que los archivos del módulo
  // anterior, y el alumno no distinguía dónde empezaba el módulo 5. Siete de los trece
  // módulos tienen un archivo, así que el desorden dominaba la página.
  if (filas.length === 1) {
    const { archivo, url } = filas[0];
    const { etiqueta, icono } = tipoDeArchivo(archivo);
    const fila = `<a class="tarjeta" href="${escapar(url)}" target="_blank" rel="noopener noreferrer" style="margin-left:26px">
        <span><strong>${escapar(nombreVisible(archivo, "curso"))}</strong><span>${icono} ${etiqueta}</span></span>
      </a>`;
    return `<h2>${indice + 1}. ${escapar(titulo)}<small>1 archivo</small></h2>${fila}`;
  }

  // Varios archivos: se muestra el módulo y una fila por archivo.
  const subfilas = filas
    .map(({ archivo, url }) => {
      const { etiqueta, icono } = tipoDeArchivo(archivo);
      return `<a class="tarjeta" href="${escapar(url)}" target="_blank" rel="noopener noreferrer" style="margin-left:26px">
        <span><strong>${escapar(nombreVisible(archivo, "curso"))}</strong><span>${icono} ${etiqueta}</span></span>
      </a>`;
    })
    .join("");

  return `<h2>${indice + 1}. ${escapar(titulo)}<small>${filas.length} archivos</small></h2>${subfilas}`;
}

/**
 * Página principal del curso.
 * `entregados` es el subconjunto de enlaces que ya se mandaron por chat; aquí se
 * muestran todos, porque el acceso ya prueba que pagó.
 */
export function paginaCurso(entrega: EntregaConfig, nombre?: string | null, opciones: OpcionesPagina = {}): string {
  const token = opciones.token;
  const modulos = (Array.isArray(entrega.modulos) ? entrega.modulos : []).map(normalizarModulo);
  const bonos = entrega.bonos && typeof entrega.bonos === "object" ? entrega.bonos : {};

  const saludo = nombre ? `Hola, ${escapar(nombre)}` : "Hola";
  const listaModulos = modulos.map((m, i) => tarjetaModulo(i, m, token)).join("");

  const listaBonos = Object.entries(bonos)
    .flatMap(([clave, valor]) => {
      const valores = Array.isArray(valor) ? valor : [valor];
      const enlaces = valores
        .map((v) => ({ v, url: resolverEnlace(v, token) }))
        .filter((x): x is { v: string; url: string } => !!x.url);
      if (enlaces.length === 0) return [];

      if (enlaces.length === 1) {
        return [`<a class="tarjeta" href="${escapar(enlaces[0].url)}" target="_blank" rel="noopener noreferrer">
          <span class="num">★</span>
          <span><strong>${escapar(nombreDeBono(clave))}</strong><span>Bono incluido</span></span>
        </a>`];
      }

      // Bono con varios archivos: título y una fila por archivo.
      const prefijo = `bonos/${clave}`;
      const filas = enlaces.map(({ v, url }) => {
        const { etiqueta, icono } = tipoDeArchivo(v);
        return `<a class="tarjeta" href="${escapar(url)}" target="_blank" rel="noopener noreferrer" style="margin-left:26px">
          <span><strong>${escapar(nombreVisible(v, prefijo))}</strong><span>${icono} ${etiqueta}</span></span>
        </a>`;
      }).join("");
      return [`<h2>★ ${escapar(nombreDeBono(clave))}<small>${enlaces.length} archivos</small></h2>${filas}`];
    })
    .join("");

  const enlacePlan = resolverEnlace(entrega.plan_accion_7dias, token);
  const plan = enlacePlan
    ? `<a class="tarjeta" href="${escapar(enlacePlan)}" target="_blank" rel="noopener noreferrer">
        <span class="num">7</span>
        <span><strong>Plan de Acción 7 Días</strong><span>Qué hacer cada día</span></span>
      </a>`
    : "";

  const enlaceGrupo = resolverEnlace(entrega.link_grupo, token);
  const grupo = enlaceGrupo
    ? `<a class="tarjeta" href="${escapar(enlaceGrupo)}" target="_blank" rel="noopener noreferrer">
        <span class="num">◎</span>
        <span><strong>Grupo de la comunidad</strong><span>Preguntas y avances</span></span>
      </a>`
    : "";

  return `${cabecera("Tu curso — Modelos IA")}
<h1>${saludo} 👋</h1>
<p>Este es tu acceso personal. Guárdalo: es tuyo y no caduca.</p>

<h2>Los 13 módulos</h2>
${listaModulos}

<h2>Tus bonos</h2>
${listaBonos || "<p>—</p>"}

${plan ? `<h2>Plan de trabajo</h2>${plan}` : ""}
${grupo ? `<h2>Comunidad</h2>${grupo}` : ""}

<div class="aviso">
  Si compartes este enlace, quien lo abra entra con tu nombre. Si necesitas uno nuevo, pídelo por WhatsApp y este deja de funcionar.
</div>
<footer>© 2026 Modelos IA · Acceso personal e intransferible</footer>
${pie}`;
}

/** Pantalla para un enlace caducado, revocado o inventado. Sin pistas útiles. */
/**
 * Un enlace roto no debe terminar en una pantalla muda.
 *
 * Antes todas las causas mostraban «Este enlace no es válido» y mandaban a escribir
 * por WhatsApp, sin número configurado: el cliente quedaba atrapado. Ahora cada caso
 * explica qué pasó y siempre hay una salida.
 */
function motivoLegible(motivo?: string): { titulo: string; detalle: string } {
  switch (motivo) {
    case "revocado":
      return {
        titulo: "Este enlace fue reemplazado",
        detalle: "Te enviamos uno nuevo en algún momento y este dejó de servir. Abre el último mensaje.",
      };
    case "vencido":
      return {
        titulo: "Este enlace caducó",
        detalle: "Pide uno nuevo y te lo enviamos al instante. Tu compra sigue registrada.",
      };
    case "sin_cookie":
      return {
        titulo: "Abre el enlace completo",
        detalle: "El enlace del mensaje tiene una clave al final. Si copiaste solo una parte, no funciona.",
      };
    default:
      return {
        titulo: "Este enlace no es válido",
        detalle: "Revisa que lo copiaste completo. Si el problema sigue, escríbenos y te enviamos otro.",
      };
  }
}

export function paginaSinAcceso(motivo?: string, enlaceSoporte?: string): string {
  const legible = motivoLegible(motivo);
  return `${cabecera(`${legible.titulo} — Modelos IA`)}
<div class="error">
  <h1>${escapar(legible.titulo)}</h1>
  <p>${escapar(legible.detalle)}</p>
  ${
    enlaceSoporte
      ? `<p style="margin-top:18px"><a class="boton" href="${escapar(enlaceSoporte)}" target="_blank" rel="noopener noreferrer">Pedir un enlace nuevo</a></p>`
      : `<p class="fino" style="margin-top:18px">Escríbenos al WhatsApp desde el que compraste y te enviamos uno nuevo.</p>`
  }
</div>
${pie}`;
}
