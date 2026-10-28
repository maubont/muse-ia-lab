// next/src/acceso/pagina.ts — LA PÁGINA DEL CURSO.
//
// Se genera del contenido real de `musa_settings.entrega`: si mañana cambian los
// enlaces, la página cambia sola. Nada de listas hardcodeadas.
//
// Se renderiza en el servidor, sin JavaScript: carga en cualquier teléfono y no
// filtra la estructura del producto a nadie que no tenga acceso.

export interface EntregaConfig {
  modulos?: string[];
  bonos?: Record<string, string>;
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

/** Títulos de los 13 módulos. Hoy la configuración solo trae URLs. */
export const TITULOS_MODULOS = [
  "Bienvenida y cómo aprovechar el curso",
  "Tu primer modelo con IA",
  "Rostro, cuerpo y coherencia",
  "Voz y sincronización labial",
  "Video: del prompt al resultado",
  "Escenarios y luz",
  "Publicación y calendario",
  "Instagram: crecimiento real",
  "TikTok: qué funciona y qué no",
  "Monetización: primeras ventas",
  "Atención y comunidad",
  "Métricas y decisiones",
  "Escalar sin perder calidad",
] as const;

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
h2{font-size:17px;margin:32px 0 12px;color:var(--texto)}
p{color:var(--tenue);font-size:15px}
a.tarjeta{display:flex;gap:12px;align-items:flex-start;text-decoration:none;color:inherit;
  background:var(--panel);border:1px solid var(--borde);border-radius:12px;padding:14px 16px;margin-bottom:8px}
a.tarjeta:hover{border-color:#3b3b4d}
.num{flex:0 0 26px;height:26px;border-radius:50%;background:rgba(139,92,246,.16);
  border:1px solid rgba(139,92,246,.4);color:var(--acento);font-weight:700;font-size:13px;
  display:grid;place-items:center;margin-top:2px}
.tarjeta strong{display:block;font-size:15px;color:var(--texto);font-weight:600}
.tarjeta span{font-size:13px;color:var(--tenue)}
.aviso{margin-top:36px;padding:14px 16px;border-radius:12px;background:var(--panel);
  border:1px solid var(--borde);font-size:13px;color:var(--tenue)}
.error{max-width:420px;margin:80px auto;text-align:center}
.error h1{color:#f87171;margin-bottom:12px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--borde);font-size:12px;color:#6b6b7d}
</style></head><body><main>`;
}

const pie = `</main></body></html>`;

/**
 * Página principal del curso.
 * `entregados` es el subconjunto de enlaces que ya se mandaron por chat; aquí se
 * muestran todos, porque el acceso ya prueba que pagó.
 */
export function paginaCurso(entrega: EntregaConfig, nombre?: string | null, opciones: OpcionesPagina = {}): string {
  const token = opciones.token;
  const modulos = Array.isArray(entrega.modulos) ? entrega.modulos : [];
  const bonos = entrega.bonos && typeof entrega.bonos === "object" ? entrega.bonos : {};

  const saludo = nombre ? `Hola, ${escapar(nombre)}` : "Hola";

  const listaModulos = modulos
    .map((url, i) => {
      const titulo = TITULOS_MODULOS[i] ?? `Módulo ${i + 1}`;
      const enlace = resolverEnlace(url, token) ?? "#";
      return `<a class="tarjeta" href="${escapar(enlace)}" target="_blank" rel="noopener noreferrer">
        <span class="num">${i + 1}</span>
        <span><strong>${escapar(titulo)}</strong><span>Abrir módulo</span></span>
      </a>`;
    })
    .join("");

  const listaBonos = Object.entries(bonos)
    .map(([clave, url]) => {
      const enlace = resolverEnlace(url, token) ?? "#";
      return `<a class="tarjeta" href="${escapar(enlace)}" target="_blank" rel="noopener noreferrer">
        <span class="num">★</span>
        <span><strong>${escapar(nombreDeBono(clave))}</strong><span>Bono incluido</span></span>
      </a>`;
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
export function paginaSinAcceso(motivo?: string): string {
  const detalle =
    motivo === "caducado"
      ? "Este enlace caducó."
      : motivo === "revocado"
        ? "Este enlace fue reemplazado por uno nuevo."
        : "Este enlace no es válido.";
  return `${cabecera("Acceso no válido — Modelos IA")}
<div class="error">
  <h1>No puedo abrirte el curso</h1>
  <p>${escapar(detalle)}</p>
  <p style="margin-top:14px">Escríbenos por WhatsApp y te enviamos uno nuevo al instante.</p>
</div>
${pie}`;
}
