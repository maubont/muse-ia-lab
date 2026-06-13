// Consola Musa — SPA movil-first v2 (Preact + htm via CDN, sin build).
// Auth: OAuth InsForge (google/github) con ANON key publica. El access token de la
// sesion se pasa como Bearer a las funciones admin (musa-admin-*). Si el email no
// es el del dueno, las funciones responden 403 -> "Acceso restringido".
// La API key admin NUNCA vive aqui: solo en las funciones server-side.
//
// 5 pestanas: Inicio · Pagos · Chats · Analisis · Config.

import { h, render } from "https://esm.sh/preact@10.23.2";
import { useState, useEffect, useRef, useCallback } from "https://esm.sh/preact@10.23.2/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { createClient } from "https://esm.sh/@insforge/sdk@latest";

const html = htm.bind(h);

// ---- Config InsForge (publico: baseUrl + ANON key) ----
const BASE_URL = "https://m2gnzrj8.us-east.insforge.app";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTkxODV9.JJRoVe2-6rF1zxhC-zdumwkHF0fpYz9LG246dqPQyfo";
const REDIRECT_TO = window.location.origin + "/consola/";

const insforge = createClient({ baseUrl: BASE_URL, anonKey: ANON_KEY });

// ---- Diccionario de motivos (motivo_flag -> espanol claro) ----
const MOTIVOS = {
  destino_no_coincide: "el numero que recibio no es el nuestro",
  pago_incompleto: "pago de menos",
  estado_programada: "el pago aun no esta confirmado",
  estado_en_proceso: "el pago aun no esta confirmado",
  referencia_duplicada: "comprobante repetido",
  imagen_duplicada: "comprobante repetido",
  baja_confianza: "lectura poco clara",
  senales_manipulacion: "posible edicion",
  monto_excesivo: "monto muy alto",
  fecha_vieja: "fecha fuera de rango",
  fecha_futura: "fecha fuera de rango",
  circuit_breaker: "muchos pagos seguidos",
};
function traducirMotivo(m) {
  if (!m) return null;
  return MOTIVOS[m] || m.replace(/_/g, " ");
}
const MOTIVOS_FRAUDE = /manipulacion|destino|monto|duplicad|circuit/i;

// Motivos de rechazo ofrecidos en el selector (clave enviada + etiqueta legible).
const MOTIVOS_RECHAZO = [
  ["destino_no_coincide", "El numero que recibio no es el nuestro"],
  ["pago_incompleto", "Pago de menos"],
  ["estado_en_proceso", "El pago aun no esta confirmado"],
  ["referencia_duplicada", "Comprobante repetido"],
  ["baja_confianza", "Lectura poco clara / borroso"],
  ["senales_manipulacion", "Posible edicion del comprobante"],
  ["no_validado", "Otro / no validado"],
];

// Etiquetas humanas de los eventos del timeline (evento -> texto + icono).
const EVENTO_LABEL = {
  cambio_estado: ["Avanzo de etapa", "↪"],
  objecion: ["Objecion", "❓"],
  comprobante_vision: ["Leyo un comprobante", "🧾"],
  nota_voz_transcrita: ["Nota de voz transcrita", "🎙️"],
  pago_aprobado_auto: ["Pago aprobado (auto)", "✅"],
  pago_aprobado_manual: ["Pago aprobado (manual)", "✅"],
  entrega_realizada: ["Curso entregado", "📦"],
  optout: ["Pidio no recibir mas", "🚫"],
  escalado: ["Escalado a humano", "🔴"],
  circuit_breaker: ["Freno antifraude", "🛑"],
  firma_invalida: ["Firma invalida", "⚠️"],
  respuesta_manual_operador: ["Respondiste tu", "✍️"],
  control_humano_tomado: ["Tomaste el control", "🙋"],
  control_humano_devuelto: ["Devolviste a Musa", "🤖"],
  comando_operador: ["Comando de operador", "⌨️"],
  operador_notificado: ["Operador notificado", "📨"],
};
function eventoLabel(ev) {
  return EVENTO_LABEL[ev] || [ev.replace(/_/g, " "), "•"];
}

// ---- Helpers ----
function fmtNum(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("es-VE").format(Math.round(Number(n) * 100) / 100);
}
function fmtMonto(n, moneda) {
  if (n == null) return "—";
  const m = (moneda || "").toUpperCase();
  return fmtNum(n) + (m ? " " + m : "");
}
function fmtDinero(map) {
  // map: { USD: 9, VES: 7400 } -> "9 USD · 7.400 VES" (o "—" si vacio)
  if (!map || typeof map !== "object") return "—";
  const partes = Object.entries(map).filter(([, v]) => Number(v) > 0)
    .map(([m, v]) => fmtNum(v) + " " + m);
  return partes.length ? partes.join(" · ") : "—";
}
function tiempoBadge(min) {
  if (min == null) return null;
  if (min < 60) return { txt: min + " min", cls: min > 20 ? "danger" : "warn" };
  const h = Math.floor(min / 60);
  return { txt: h + " h", cls: "danger" };
}
function banderaPais(pais) {
  const p = String(pais || "").toUpperCase();
  if (p.includes("VE")) return "🇻🇪";
  if (p.includes("CO")) return "🇨🇴";
  return "🌎";
}

// Llama a una funcion admin via insforge.functions.invoke, que adjunta el Bearer
// del usuario (token en memoria del SDK) automaticamente. Mapea statusCode -> err.code
// para el branching 401/403. Para musa-admin-data usamos query (?view=...) embebida
// en el slug. El SDK construye {subhosting}/{slug}, que conserva el query string.
async function callFn(slug, { method = "GET", query = "", body = null } = {}) {
  const slugFull = slug + (query ? "?" + query : "");
  const { data, error } = await insforge.functions.invoke(slugFull, {
    method,
    ...(body ? { body } : {}),
  });
  if (error) {
    const err = new Error(error.error || error.message || "error");
    err.code = error.statusCode || 0;
    throw err;
  }
  return data;
}

// ===================== Componentes genericos =====================

function Toast({ msg, kind, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, []);
  return html`<div class="toast ${kind}">${msg}</div>`;
}

function StateLoading({ txt }) {
  return html`<div class="loading-state"><div class="inline-spin"></div> ${txt}</div>`;
}
function StateError({ txt, onRetry }) {
  return html`<div class="error-state">${txt}${onRetry
    ? html`<br/><button class="iconbtn" style="margin-top:12px" onClick=${onRetry}>Reintentar</button>`
    : null}</div>`;
}

function Login() {
  const oauth = (provider) =>
    insforge.auth.signInWithOAuth(provider, {
      redirectTo: REDIRECT_TO,
      additionalParams: { prompt: "select_account" },
    });
  return html`
    <div class="login">
      <div class="logo">Consola Musa</div>
      <div class="tag">Panel del operador</div>
      <div class="oauth">
        <button class="oauthbtn" onClick=${() => oauth("google")}>
          <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
          Entrar con Google
        </button>
        <button class="oauthbtn gh" onClick=${() => oauth("github")}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .1.7 1.3 1.6 1.7 2.5.4 1.7.1 2.1-.1.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 5 18 5.3 18 5.3c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>
          Entrar con GitHub
        </button>
      </div>
      <div class="small">Solo el dueno autorizado puede entrar. La sesion queda guardada en este dispositivo.</div>
    </div>
  `;
}

// -------- INICIO --------
function PantallaInicio({ data, loading, error, refreshing, onGoPagos, onGoChats, onRetry }) {
  if (loading && !data) return html`<${StateLoading} txt="Cargando tablero…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo cargar el tablero. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  const pendientes = [];
  if (data.pagos_en_cola?.n > 0) {
    const b = tiempoBadge(data.pagos_en_cola.mas_viejo_min);
    pendientes.push({
      dot: b?.cls === "danger" ? "var(--red)" : "var(--amber)",
      title: data.pagos_en_cola.n + " pago" + (data.pagos_en_cola.n > 1 ? "s" : "") + " por revisar",
      sub: "En la bandeja de pagos",
      badge: b ? { txt: "hace " + b.txt, cls: b.cls } : null,
      go: onGoPagos,
    });
  }
  if (data.escalados?.n > 0) {
    pendientes.push({
      dot: "var(--accent)", title: data.escalados.n + " escalado" + (data.escalados.n > 1 ? "s" : "") + " a humano",
      sub: "Chats que pidieron atencion", badge: { txt: "atender", cls: "warn" }, go: onGoChats,
    });
  }
  if (data.chats_vivos?.n > 0) {
    pendientes.push({
      dot: "var(--green)", title: data.chats_vivos.n + " chat" + (data.chats_vivos.n > 1 ? "s" : "") + " vivo" + (data.chats_vivos.n > 1 ? "s" : "") + " hoy",
      sub: "Conversaciones activas", badge: { txt: "ver", cls: "ok" }, go: onGoChats,
    });
  }

  const salud = data.salud || {};
  const filasSalud = [
    ["Tasa del dia fresca", salud.tasa_fresca],
    ["Cuentas Venezuela listas", salud.cuentas_ve_ok],
    ["Antifraude al dia", salud.antifraude_ok],
  ];

  return html`
    <div>
      ${refreshing ? html`<div style="text-align:right" class="refreshing"><span class="inline-spin"></span> actualizando</div>` : null}

      ${data.reconciliacion_aprobado_sin_entregar > 0
        ? html`<div class="banner danger"><span class="b-ico">⚠️</span><div>
            <b>${data.reconciliacion_aprobado_sin_entregar} pago(s) aprobados sin entregar.</b>
            Revisa que el curso haya llegado al cliente.</div></div>`
        : null}

      <div class="metric-row">
        <div class="metric">
          <div class="label">Ventas hoy</div>
          <div class="value">${fmtNum(data.ventas_hoy?.n || 0)}</div>
          <div class="hint">~${fmtNum(data.ventas_hoy?.usd_aprox || 0)} USD</div>
        </div>
        <div class="metric">
          <div class="label">Llegan a pagar</div>
          <div class="value">${fmtNum(data.metrica_reina_pct || 0)}<small>%</small></div>
          <div class="hint">de cada 100 que escriben</div>
        </div>
      </div>

      <div class="section-title">Pendientes</div>
      <div class="card card-list">
        ${pendientes.length === 0
          ? html`<div class="empty" style="padding:24px 8px"><div class="big">✅</div>Nada pendiente. Todo en orden.</div>`
          : pendientes.map((p) => html`
            <a class="pending" href="#" onClick=${(e) => { e.preventDefault(); if (p.go) p.go(); }}>
              <span class="dot" style=${{ background: p.dot }}></span>
              <span class="pe-main"><span class="pe-title">${p.title}</span><br/><span class="pe-sub">${p.sub}</span></span>
              ${p.badge ? html`<span class="badge ${p.badge.cls}">${p.badge.txt}</span>` : null}
            </a>`)}
      </div>

      <div class="section-title">Salud del sistema</div>
      <div class="card">
        <div class="health">
          ${filasSalud.map(([nombre, ok]) => html`
            <div class="health-row">
              <span class="light ${ok ? "green" : "red"}"></span>
              <span class="h-name">${nombre}</span>
              <span class="h-state ${ok ? "green" : "red"}">${ok ? "OK" : "REVISAR"}</span>
            </div>`)}
        </div>
      </div>
    </div>
  `;
}

// -------- BANDEJA DE PAGOS --------
function PantallaPagos({ data, loading, error, refreshing, onAccion, onVerImagen, onRetry }) {
  if (loading && !data) return html`<${StateLoading} txt="Cargando bandeja…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo cargar la bandeja. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  const pagos = data.pagos || [];
  const resueltos = data.resueltos_hoy || [];

  return html`
    <div>
      ${refreshing ? html`<div style="text-align:right" class="refreshing"><span class="inline-spin"></span> actualizando</div>` : null}
      ${pagos.length === 0
        ? html`<div class="empty"><div class="big">✅</div>No hay pagos por revisar.</div>`
        : pagos.map((p) => html`<${PagoCard} key=${p.short_id} p=${p} onAccion=${onAccion} onVerImagen=${onVerImagen} />`)}

      ${resueltos.length > 0 ? html`
        <div class="section-title">Resueltos hoy</div>
        <div class="card card-list">
          ${resueltos.map((r) => html`
            <div class="resuelto">
              <span class="badge ${r.status === "aprobado" ? "ok" : "danger"}">${r.status === "aprobado" ? "Aprobado" : "Rechazado"}</span>
              <span class="r-sid">#${r.short_id}</span>
              <span class="r-meta">${fmtMonto(r.monto, r.moneda)}${r.motivo_flag ? " · " + traducirMotivo(r.motivo_flag) : ""}</span>
            </div>`)}
        </div>` : null}
    </div>
  `;
}

function PagoCard({ p, onAccion, onVerImagen }) {
  const [busy, setBusy] = useState(false);
  const [confirmAprobar, setConfirmAprobar] = useState(false);
  const motivo = traducirMotivo(p.motivo_flag);
  const fraude = p.motivo_flag && MOTIVOS_FRAUDE.test(p.motivo_flag);
  const b = tiempoBadge(p.antiguedad_min);
  const d = p.datos_extraidos || {};
  const montoBad = p.precio_esperado != null && p.monto != null && Number(p.monto) < Number(p.precio_esperado);
  const numeros = Array.isArray(p.numeros_detectados) ? p.numeros_detectados : [];
  const coin = p.coincidencia || {};

  // P0: si el comprobante tiene una senal de alerta, exigir confirmacion antes de entregar
  // (la entrega es irreversible). Los pagos limpios mantienen el tap unico.
  const hayAlerta = !!p.motivo_flag || coin.coincide === false || montoBad;
  const textoAlerta = motivo
    ? motivo
    : (montoBad ? "pago de menos" : "ningun numero coincide con tus cuentas");

  const hacerAprobar = async () => {
    setBusy(true);
    setConfirmAprobar(false);
    await onAccion({ accion: "aprobar", short_id: p.short_id });
    setBusy(false);
  };
  const aprobar = () => {
    if (hayAlerta) { setConfirmAprobar(true); return; }
    hacerAprobar();
  };
  const rechazar = () => onAccion({ accion: "_pedir_motivo", short_id: p.short_id });

  return html`
    <div class="pago-card">
      ${p.imagen
        ? html`<img class="pago-img" src=${p.imagen} alt="comprobante" role="button" aria-label=${"Ampliar comprobante de #" + p.short_id} onClick=${() => onVerImagen(p.imagen)} />`
        : html`<div class="pago-img-empty">Sin imagen del comprobante</div>`}
      <div class="pago-body">
        <div class="pago-head">
          <span class="sid">#${p.short_id}</span>
          <span class="lead">${p.lead?.nombre || "—"}<br/>${p.lead?.phone || ""}</span>
        </div>
        ${b ? html`<span class="badge ${b.cls}">hace ${b.txt}</span>` : null}
        ${motivo ? html`<div class="motivo ${fraude ? "fraude" : ""}">⚑ ${motivo}</div>` : null}
        <div class="monto-cmp">
          Pago: <span class="pago-val ${montoBad ? "bad" : ""}">${fmtMonto(p.monto, p.moneda)}</span>
          ${p.precio_esperado != null ? html` <span class="esp">/ esperado ${fmtMonto(p.precio_esperado, p.moneda)}</span>` : ""}
        </div>

        ${numeros.length > 0 ? html`
          <div class="nums-block">
            <div class="nums-head">Numeros en el comprobante</div>
            <div class="nums-list">
              ${numeros.map((n) => {
                const dig = String(n).replace(/\D+/g, "");
                const mio = coin.numero || "";
                const ok = !!(coin.coincide && mio && dig.length >= 4 &&
                  (dig === mio || dig.includes(mio) || mio.includes(dig)));
                return html`<span class="numchip ${ok ? "match" : ""}">${ok ? "✓ " : ""}${n}</span>`;
              })}
            </div>
            ${coin.coincide
              ? html`<div class="coin coin-ok">✓ Un numero coincide con tus cuentas</div>`
              : html`<div class="coin coin-warn">⚠️ Ningun numero coincide con tus cuentas</div>`}
          </div>` : (coin && coin.coincide === false
            ? html`<div class="coin coin-warn" style="margin-top:8px">⚠️ Sin numeros legibles en el comprobante</div>`
            : null)}

        <div class="kv">
          ${p.metodo ? html`<span><b>Metodo:</b> ${p.metodo}</span>` : null}
          ${d.numero_referencia ? html`<span><b>Ref:</b> ${d.numero_referencia}</span>` : null}
          ${d.banco_o_app ? html`<span><b>Banco:</b> ${d.banco_o_app}</span>` : null}
          ${d.fecha ? html`<span><b>Fecha:</b> ${d.fecha}</span>` : null}
          ${d.destino ? html`<span><b>Destino:</b> ${d.destino}</span>` : null}
        </div>
        ${confirmAprobar
          ? html`<div style="margin-top:12px">
              <div class="banner danger" style="margin-bottom:10px"><span class="b-ico">⚠️</span><div>
                Este comprobante tiene una señal: <b>${textoAlerta}</b>. Si apruebas, el curso se entrega y <b>no se puede deshacer</b>.</div></div>
              <button class="btn-block btn-primary" disabled=${busy} onClick=${hacerAprobar}><b>${busy ? "…" : "Sí, aprobar y entregar"}</b></button>
              <button class="btn-block btn-ghost" style="margin-top:8px" disabled=${busy} onClick=${() => setConfirmAprobar(false)}>Cancelar</button>
            </div>`
          : html`<div class="actions">
              <button class="btn btn-ok" disabled=${busy} onClick=${aprobar}>${busy ? "…" : "Aprobar"}</button>
              <button class="btn btn-no" disabled=${busy} onClick=${rechazar}>Rechazar</button>
              ${p.imagen ? html`<button class="btn btn-ver" onClick=${() => onVerImagen(p.imagen)}>Ver</button>` : null}
            </div>`}
      </div>
    </div>
  `;
}

// -------- CONVERSACIONES (lista) --------
function PantallaChats({ data, loading, error, soloAtencion, onToggleFiltro, onAbrir, onRetry, refreshing }) {
  if (loading && !data) return html`<${StateLoading} txt="Cargando conversaciones…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo cargar las conversaciones. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  const todas = data.conversaciones || [];
  // "requieren atencion": escalado, o le toca a Musa (lead escribio ultimo) hace rato.
  const requiereAtencion = (c) => {
    if (c.flags?.escalado_humano) return true;
    // le_toca === "lead" significa que el lead escribio y Musa no ha respondido.
    if (c.le_toca === "lead" && !c.flags?.opt_out && !c.flags?.pagado) return true;
    return false;
  };
  const lista = soloAtencion ? todas.filter(requiereAtencion) : todas;
  const nAtencion = todas.filter(requiereAtencion).length;

  return html`
    <div>
      ${refreshing ? html`<div style="text-align:right" class="refreshing"><span class="inline-spin"></span> actualizando</div>` : null}
      <div class="filtros">
        <button class=${"chip " + (soloAtencion ? "chip-on" : "")} onClick=${() => onToggleFiltro(true)}>
          Requieren atencion${nAtencion > 0 ? html` <span class="chip-n">${nAtencion}</span>` : null}
        </button>
        <button class=${"chip " + (!soloAtencion ? "chip-on" : "")} onClick=${() => onToggleFiltro(false)}>Todas</button>
      </div>

      ${lista.length === 0
        ? html`<div class="empty"><div class="big">${soloAtencion ? "👍" : "💬"}</div>${soloAtencion ? "Nada requiere atencion ahora." : "Sin conversaciones recientes."}</div>`
        : html`<div class="card" style="padding:4px 0;overflow:hidden">
            ${lista.map((c) => html`<${ChatRow} key=${c.phone_raw} c=${c} atencion=${requiereAtencion(c)} onAbrir=${onAbrir} />`)}
          </div>`}
    </div>
  `;
}

// Estado principal de un chat: UNO solo, por prioridad, sin etiquetas que se solapen.
function chatEstadoChip(c) {
  const f = c.flags || {};
  if (f.pagado) return html`<span class="tag tag-pago">✅ ya compró</span>`;
  if (f.opt_out) return html`<span class="tag tag-out">no contactar</span>`;
  if (f.escalado_humano) return html`<span class="tag tag-esc">🔴 te toca a ti</span>`;
  return html`<span class="tag tag-etapa">${c.etiqueta}</span>`;
}

function ChatRow({ c, atencion, onAbrir }) {
  const last = c.ultimo_mensaje;
  return html`
    <a class="chat-row" href="#" onClick=${(e) => { e.preventDefault(); onAbrir(c.phone_raw); }}>
      <div class="chat-ava ${atencion ? "att" : ""}">${banderaPais(c.pais)}</div>
      <div class="chat-main">
        <div class="chat-top">
          <span class="chat-name">${c.nombre || c.phone}</span>
          <span class="chat-when">${last?.cuando || ""}</span>
        </div>
        <div class="chat-prev">
          ${last
            ? html`<span class="prev-dir">${last.direction === "out" ? "Musa: " : ""}</span>${last.texto || "—"}`
            : html`<span class="prev-dim">sin mensajes</span>`}
        </div>
        <div class="chat-tags">
          ${chatEstadoChip(c)}
          ${(!c.flags?.pagado && !c.flags?.opt_out && !c.flags?.escalado_humano && c.le_toca === "lead")
            ? html`<span class="tag tag-toca-lead">● te escribió</span>`
            : null}
        </div>
      </div>
      <span class="chat-arrow">›</span>
    </a>
  `;
}

// -------- CONVERSACION (hilo) --------
function PantallaConversacion({ data, loading, error, onVolver, onTomarControl, onDevolverControl, onResponder, onRetry, busyAccion }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hiloRef = useRef(null);

  useEffect(() => {
    if (hiloRef.current) hiloRef.current.scrollTop = hiloRef.current.scrollHeight;
  }, [data]);

  if (loading && !data) return html`<${StateLoading} txt="Cargando conversación…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo abrir la conversacion. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  const lead = data.lead || {};
  const mensajes = data.mensajes || [];
  const timeline = data.timeline || [];
  const escalado = lead.flags?.escalado_humano === true;

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    const ok = await onResponder(lead.phone_raw, t);
    setEnviando(false);
    if (ok) setTexto("");
  };

  return html`
    <div class="conv">
      <div class="conv-head">
        <button class="iconbtn" onClick=${onVolver}>‹ Volver</button>
        <div class="conv-id">
          <div class="conv-name">${banderaPais(lead.pais)} ${lead.nombre || lead.phone}</div>
          <div class="conv-sub">${lead.etiqueta}${lead.mayor_18 ? " · 18+" : ""}</div>
        </div>
      </div>

      <div class="conv-tags">
        ${escalado ? html`<span class="tag tag-esc">🔴 bajo control humano</span>` : html`<span class="tag tag-toca-musa">Musa atiende</span>`}
        ${lead.flags?.pagado ? html`<span class="tag tag-pago">✅ ya compró</span>` : null}
        ${lead.flags?.opt_out ? html`<span class="tag tag-out">no contactar</span>` : null}
      </div>

      <div class="conv-ctrl">
        ${escalado
          ? html`<button class="btn-block btn-ghost" disabled=${busyAccion} onClick=${() => onDevolverControl(lead.phone_raw)}>${busyAccion ? "…" : "Devolver a Musa"}</button>`
          : html`<button class="btn-block btn-warn" disabled=${busyAccion} onClick=${() => onTomarControl(lead.phone_raw)}>${busyAccion ? "…" : "Tomar control"}</button>`}
      </div>

      <div class="hilo" ref=${hiloRef}>
        ${mensajes.length === 0
          ? html`<div class="empty" style="padding:24px">Sin mensajes.</div>`
          : mensajes.map((m) => html`
            <div class="msg ${m.direction === "out" ? "out" : "in"}">
              <div class="bubble">
                ${m.body ? m.body : html`<span class="media">${m.media_type ? "[" + m.media_type + "]" : "[media]"}</span>`}
              </div>
            </div>`)}
      </div>

      ${timeline.length > 0 ? html`
        <div class="section-title">Linea de tiempo</div>
        <div class="card" style="padding:6px 14px">
          ${timeline.map((e, i) => {
            const [lbl, ico] = eventoLabel(e.evento);
            return html`<div class="tl-row" key=${i}>
              <span class="tl-ico">${ico}</span>
              <span class="tl-main"><b>${lbl}</b>${e.resumen ? html` <span class="tl-det">${e.resumen}</span>` : ""}</span>
              <span class="tl-when">${e.cuando || ""}</span>
            </div>`;
          })}
        </div>` : null}

      <div class="responder">
        <textarea
          placeholder=${escalado ? "Escribe tu respuesta…" : "Musa está atendiendo este chat"}
          value=${texto}
          onInput=${(e) => setTexto(e.target.value)}
          rows="2"
          disabled=${!escalado}
        ></textarea>
        <button class="btn-send" disabled=${!escalado || enviando || !texto.trim()} onClick=${enviar}>${enviando ? "…" : "Enviar"}</button>
      </div>
      ${!escalado ? html`<div class="responder-hint">Para responder tú, primero toca <b>"Tomar control"</b>.</div>` : null}
    </div>
  `;
}

// -------- ANALISIS --------
function PantallaAnalisis({ data, loading, error, onRetry, refreshing }) {
  if (loading && !data) return html`<${StateLoading} txt="Cargando analisis…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo cargar el analisis. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  const embudo = data.embudo || {};
  const niveles = embudo.niveles || [];
  const fuga = embudo.mayor_fuga;
  const fin = data.finanzas || {};
  const riesgo = data.riesgo || {};
  const maxN = Math.max(1, ...niveles.map((n) => n.n || 0));
  // Marca el nivel destino de la mayor fuga.
  const nivelFuga = fuga?.a;

  const dup = riesgo.duplicados_phash || [];
  const recon = riesgo.reconciliacion_aprobado_sin_entregar || 0;

  return html`
    <div>
      ${refreshing ? html`<div style="text-align:right" class="refreshing"><span class="inline-spin"></span> actualizando</div>` : null}

      <div class="section-title">Embudo</div>
      <div class="card">
        ${fuga && fuga.pierden > 0
          ? html`<div class="fuga-note">Mayor fuga: <b>${fuga.de} → ${fuga.a}</b> (${fmtNum(fuga.pierden)} leads, ${fmtNum(fuga.pct)}%)</div>`
          : null}
        ${niveles.length === 0
          ? html`<div class="empty" style="padding:20px">Aun sin datos del embudo.</div>`
          : niveles.map((n) => {
            const pct = Math.round(((n.n || 0) / maxN) * 100);
            const esFuga = n.clave === nivelFuga;
            return html`
              <div class="fbar-row">
                <div class="fbar-label">${n.label}<span class="fbar-n">${fmtNum(n.n)}</span></div>
                <div class="fbar-track"><div class="fbar-fill ${esFuga ? "fbar-leak" : ""}" style=${{ width: Math.max(3, pct) + "%" }}></div></div>
              </div>`;
          })}
      </div>

      <div class="section-title">Finanzas</div>
      <div class="metric-row">
        <div class="metric">
          <div class="label">Ingresos hoy</div>
          <div class="value sm">${fmtDinero(fin.ingresos_hoy)}</div>
          <div class="hint">${fmtNum(fin.ventas_n)} ventas (total)</div>
        </div>
        <div class="metric">
          <div class="label">Ingresos 14 dias</div>
          <div class="value sm">${fmtDinero(fin.ingresos_14d)}</div>
          <div class="hint">~${fmtNum(fin.ingreso_usd_aprox)} USD aprox.</div>
        </div>
      </div>
      <div class="card">
        <div class="fin-row"><span>Costo del cerebro de Musa <i>(real)</i></span><b>${fmtNum(fin.costo_openai_medido_usd)} USD</b></div>
        <div class="fin-row"><span>Costo de mensajes WhatsApp <i>(estimado)</i></span><b>${fmtNum(fin.costo_twilio_estimado_usd)} USD</b></div>
        <div class="fin-row total"><span>Margen <i>(estimado)</i></span><b class=${(fin.margen_estimado_usd || 0) >= 0 ? "pos" : "neg"}>${fmtNum(fin.margen_estimado_usd)} USD</b></div>
        <div class="desc" style="margin-top:6px">Ingreso USD y margen son estimados (ventas × precio). El costo del cerebro de Musa es real por uso.</div>
      </div>

      <div class="section-title">Riesgo</div>
      <div class="card">
        <div class="fin-row"><span>Comprobantes repetidos</span><b class=${dup.length > 0 ? "neg" : ""}>${fmtNum(dup.length)}</b></div>
        <div class="fin-row"><span>Pidieron no contactar</span><b>${fmtNum(riesgo.optouts_total)}</b></div>
        <div class="fin-row"><span>Freno antifraude (eventos)</span><b>${fmtNum(riesgo.circuit_breaker_eventos)}</b></div>
        <div class="fin-row"><span>Aprobados sin entregar</span><b class=${recon > 0 ? "neg" : "pos"}>${fmtNum(recon)}</b></div>
        ${recon > 0
          ? html`<div class="banner danger" style="margin:10px 0 0"><span class="b-ico">⚠️</span><div>Hay ${recon} pago(s) aprobados sin registro de entrega. Revisa en Pagos / Chats.</div></div>`
          : null}
        ${dup.length > 0
          ? html`<div class="dup-list">${dup.map((d) => html`<div class="dup-item">Mismo comprobante usado por ${d.leads_distintos} personas</div>`)}</div>`
          : null}
      </div>
    </div>
  `;
}

// -------- CONFIG --------
function CamposPagoMovilVe({ pm, set }) {
  return html`
    <div class="sub-block">
      <div class="sub-title">Pago Movil</div>
      <div class="field"><label>Banco</label><input value=${pm.banco || ""} onInput=${(e) => set("banco", e.target.value)} placeholder="ej. 0102 Banco de Venezuela" /></div>
      <div class="field"><label>Telefono</label><input inputmode="tel" value=${pm.telefono || ""} onInput=${(e) => set("telefono", e.target.value)} placeholder="ej. 0414-1234567" /></div>
      <div class="grid2">
        <div class="field"><label>Cedula</label><input value=${pm.cedula || ""} onInput=${(e) => set("cedula", e.target.value)} placeholder="V-..." /></div>
        <div class="field"><label>Titular</label><input value=${pm.titular || ""} onInput=${(e) => set("titular", e.target.value)} placeholder="Nombre" /></div>
      </div>
    </div>
  `;
}
function CamposCuentaVe({ cu, set }) {
  return html`
    <div class="sub-block">
      <div class="sub-title">Cuenta bancaria</div>
      <div class="field"><label>Banco</label><input value=${cu.banco || ""} onInput=${(e) => set("banco", e.target.value)} placeholder="ej. Banco de Venezuela" /></div>
      <div class="grid2">
        <div class="field"><label>Numero</label><input inputmode="numeric" value=${cu.numero || ""} onInput=${(e) => set("numero", e.target.value)} placeholder="20 digitos" /></div>
        <div class="field"><label>Tipo</label><input value=${cu.tipo || ""} onInput=${(e) => set("tipo", e.target.value)} placeholder="corriente / ahorros" /></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Cedula</label><input value=${cu.cedula || ""} onInput=${(e) => set("cedula", e.target.value)} placeholder="V-..." /></div>
        <div class="field"><label>Titular</label><input value=${cu.titular || ""} onInput=${(e) => set("titular", e.target.value)} placeholder="Nombre" /></div>
      </div>
    </div>
  `;
}

function EstadoCuentas({ provisional, simulacion }) {
  if (simulacion) {
    return html`<span class="cuentas-flag flag-prov">⚠️ DATOS DE PRUEBA — reemplazalos por los reales antes de lanzar</span>`;
  }
  if (provisional) {
    return html`<span class="cuentas-flag flag-prov">SIN CONFIGURAR</span>`;
  }
  return html`<span class="cuentas-flag flag-real">CUENTAS REALES ACTIVAS</span>`;
}

function PantallaConfig({ data, loading, error, onGuardarTasa, onGuardarCuentasVe, onGuardarCuentasCo, onRetry }) {
  const [bs, setBs] = useState("");
  const [savingTasa, setSavingTasa] = useState(false);

  // Estado editable de cuentas VE/CO (se hidrata desde data).
  const [vep, setVep] = useState({});   // pago_movil VE
  const [vec, setVec] = useState({});   // cuenta VE
  const [coNequi, setCoNequi] = useState({});
  const [coBanco, setCoBanco] = useState({});
  const [coBreb, setCoBreb] = useState({});
  const [savingVe, setSavingVe] = useState(false);
  const [savingCo, setSavingCo] = useState(false);
  const [confirmVe, setConfirmVe] = useState(false);
  const [confirmCo, setConfirmCo] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.precio_bs_hoy?.bs != null) setBs(String(data.precio_bs_hoy.bs));
    const ve = data.cuentas_ve || {};
    setVep({ ...(ve.pago_movil || {}) });
    setVec({ ...(ve.cuenta || {}) });
    const co = data.cuentas_co || {};
    setCoNequi({ ...(co.nequi || {}) });
    setCoBanco({ ...(co.bancolombia || {}) });
    setCoBreb({ ...(co.breb || {}) });
  }, [data]);

  if (loading && !data) return html`<${StateLoading} txt="Cargando configuracion…" />`;
  if (error && !data) return html`<${StateError} txt=${"No se pudo cargar la configuracion. " + error} onRetry=${onRetry} />`;
  if (!data) return null;

  // Invalida solo si hay texto y no es un numero > 0 (no marcar el campo vacio inicial).
  const tasaInvalida = bs.trim() !== "" && !(Number(bs) > 0);
  const cuentasVe = data.cuentas_ve || {};
  const cuentasCo = data.cuentas_co || {};
  const veProvisional = cuentasVe.provisional === true;
  const veSimulacion = cuentasVe.es_simulacion === true;
  const coProvisional = cuentasCo.provisional === true;
  const coSimulacion = cuentasCo.es_simulacion === true;

  const guardarTasa = async () => {
    const n = Number(bs);
    if (!n || n <= 0) return;
    setSavingTasa(true);
    const prev = data.precio_bs_hoy || {};
    const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    await onGuardarTasa({ ...prev, bs: n, fecha: hoyISO });
    setSavingTasa(false);
  };

  const guardarVe = async () => {
    setSavingVe(true);
    // Conserva campos previos (nota, etc.) pero marca reales: provisional=false, es_simulacion=false.
    const value = {
      ...cuentasVe,
      pago_movil: { ...vep },
      cuenta: { ...vec },
      provisional: false,
      es_simulacion: false,
    };
    delete value.nota;
    await onGuardarCuentasVe(value);
    setSavingVe(false);
    setConfirmVe(false);
  };

  const guardarCo = async () => {
    setSavingCo(true);
    const value = {
      ...cuentasCo,
      nequi: { ...coNequi },
      bancolombia: { ...coBanco },
      breb: { ...coBreb },
      provisional: false,
      es_simulacion: false,
    };
    delete value.nota;
    await onGuardarCuentasCo(value);
    setSavingCo(false);
    setConfirmCo(false);
  };

  const setVepK = (k, v) => setVep((s) => ({ ...s, [k]: v }));
  const setVecK = (k, v) => setVec((s) => ({ ...s, [k]: v }));

  return html`
    <div>
      <div class="card">
        <h2>Tasa del dia (Bs)</h2>
        <div class="field">
          <label>Bolivares por curso</label>
          <input type="number" inputmode="decimal" class=${tasaInvalida ? "invalid" : ""} value=${bs} onInput=${(e) => setBs(e.target.value)} placeholder="ej. 360" />
          ${tasaInvalida
            ? html`<div class="desc err">Escribe un número mayor que 0.</div>`
            : html`<div class="desc">Fecha guardada hoy (America/Caracas). Precio base: ${fmtNum(data.precio?.usd) || "—"} USD.</div>`}
        </div>
        <button class="btn-block btn-primary" disabled=${savingTasa || tasaInvalida} onClick=${guardarTasa}>${savingTasa ? "Guardando…" : "Guardar tasa"}</button>
      </div>

      <div class="card">
        <h2>Cuentas de Venezuela</h2>
        <${EstadoCuentas} provisional=${veProvisional} simulacion=${veSimulacion} />
        ${veSimulacion
          ? html`<div class="banner danger" style="margin:6px 0 14px"><span class="b-ico">⚠️</span><div>Estos son datos de ejemplo. El bot los enviaria a los clientes tal cual. <b>Pega tus cuentas reales</b> y guarda para activarlas.</div></div>`
          : null}

        <${CamposPagoMovilVe} pm=${vep} set=${setVepK} />
        <${CamposCuentaVe} cu=${vec} set=${setVecK} />

        ${confirmVe
          ? html`<div style="margin-top:6px">
              <div class="banner danger" style="margin-bottom:10px"><span class="b-ico">⚠️</span><div>Vas a marcar estas cuentas como <b>reales</b>. El bot empezara a enviarlas a los clientes. ¿Seguro?</div></div>
              <button class="btn-block btn-primary" disabled=${savingVe} onClick=${guardarVe}>${savingVe ? "Guardando…" : "Si, guardar cuentas reales"}</button>
              <button class="btn-block btn-ghost" style="margin-top:8px" onClick=${() => setConfirmVe(false)}>Cancelar</button>
            </div>`
          : html`<button class="btn-block btn-primary" style="margin-top:6px" onClick=${() => setConfirmVe(true)}>Guardar cuentas reales de Venezuela</button>`}
      </div>

      <div class="card">
        <h2>Cuentas de Colombia</h2>
        <${EstadoCuentas} provisional=${coProvisional} simulacion=${coSimulacion} />
        ${coSimulacion
          ? html`<div class="banner danger" style="margin:6px 0 14px"><span class="b-ico">⚠️</span><div>Datos de ejemplo. Pega tus cuentas reales de Colombia y guarda.</div></div>`
          : null}

        <div class="sub-block">
          <div class="sub-title">Nequi</div>
          <div class="grid2">
            <div class="field"><label>Numero</label><input inputmode="tel" value=${coNequi.numero || ""} onInput=${(e) => setCoNequi((s) => ({ ...s, numero: e.target.value }))} /></div>
            <div class="field"><label>Titular</label><input value=${coNequi.titular || ""} onInput=${(e) => setCoNequi((s) => ({ ...s, titular: e.target.value }))} /></div>
          </div>
        </div>
        <div class="sub-block">
          <div class="sub-title">Bancolombia</div>
          <div class="grid2">
            <div class="field"><label>Numero</label><input inputmode="numeric" value=${coBanco.numero || ""} onInput=${(e) => setCoBanco((s) => ({ ...s, numero: e.target.value }))} /></div>
            <div class="field"><label>Tipo</label><input value=${coBanco.tipo || ""} onInput=${(e) => setCoBanco((s) => ({ ...s, tipo: e.target.value }))} placeholder="ahorros" /></div>
          </div>
          <div class="field"><label>Titular</label><input value=${coBanco.titular || ""} onInput=${(e) => setCoBanco((s) => ({ ...s, titular: e.target.value }))} /></div>
        </div>
        <div class="sub-block">
          <div class="sub-title">Bre-B</div>
          <div class="grid2">
            <div class="field"><label>Llave</label><input value=${coBreb.llave || ""} onInput=${(e) => setCoBreb((s) => ({ ...s, llave: e.target.value }))} /></div>
            <div class="field"><label>Titular</label><input value=${coBreb.titular || ""} onInput=${(e) => setCoBreb((s) => ({ ...s, titular: e.target.value }))} /></div>
          </div>
        </div>

        ${confirmCo
          ? html`<div style="margin-top:6px">
              <div class="banner danger" style="margin-bottom:10px"><span class="b-ico">⚠️</span><div>Vas a marcar las cuentas de Colombia como <b>reales</b>. ¿Seguro?</div></div>
              <button class="btn-block btn-primary" disabled=${savingCo} onClick=${guardarCo}>${savingCo ? "Guardando…" : "Si, guardar cuentas reales"}</button>
              <button class="btn-block btn-ghost" style="margin-top:8px" onClick=${() => setConfirmCo(false)}>Cancelar</button>
            </div>`
          : html`<button class="btn-block btn-primary" style="margin-top:6px" onClick=${() => setConfirmCo(true)}>Guardar cuentas reales de Colombia</button>`}
      </div>
    </div>
  `;
}

// -------- Modales --------
function ReasonModal({ onPick, onClose }) {
  return html`
    <div class="modal-bg" onClick=${onClose}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <h3>Motivo del rechazo</h3>
        <div class="reason-list">
          ${MOTIVOS_RECHAZO.map(([k, label]) => html`<button onClick=${() => onPick(k)}>${label}</button>`)}
        </div>
        <div class="closebar"><button class="iconbtn" onClick=${onClose}>Cancelar</button></div>
      </div>
    </div>
  `;
}
function ImageModal({ src, onClose }) {
  return html`
    <div class="modal-bg" style="align-items:center;padding:16px" onClick=${onClose}>
      <button class="iconbtn" aria-label="Cerrar" style="position:absolute;top:calc(16px + var(--safe-top));right:16px;z-index:2" onClick=${onClose}>✕</button>
      <img class="modal-img" src=${src} onClick=${(e) => e.stopPropagation()} />
    </div>
  `;
}

// ===================== App raiz =====================
const TABS = ["inicio", "pagos", "chats", "analisis", "config"];
const TITULOS = {
  inicio: "Inicio", pagos: "Bandeja de pagos", chats: "Conversaciones",
  analisis: "Analisis", config: "Configuracion",
};
// P2: subtitulos de orientacion en una linea (mostrados bajo el titulo de seccion).
const SUBTITULOS = {
  inicio: "Lo que necesita tu atención hoy",
  pagos: "Aprueba o rechaza comprobantes",
  chats: "Conversaciones de WhatsApp",
  analisis: "Cómo va el negocio",
  config: "Tasa del día y cuentas de pago",
};

function App() {
  const [authState, setAuthState] = useState("checking"); // checking | out | in | restricted
  const [tab, setTab] = useState(() => {
    const h0 = location.hash.replace("#", "");
    return TABS.includes(h0) ? h0 : "inicio";
  });

  const [inicio, setInicio] = useState({ data: null, loading: true, error: null, refreshing: false });
  const [pagos, setPagos] = useState({ data: null, loading: true, error: null, refreshing: false });
  const [config, setConfig] = useState({ data: null, loading: true, error: null });
  const [chats, setChats] = useState({ data: null, loading: true, error: null, refreshing: false });
  const [analisis, setAnalisis] = useState({ data: null, loading: true, error: null, refreshing: false });

  const [soloAtencion, setSoloAtencion] = useState(false);
  const [convPhone, setConvPhone] = useState(null); // phone_raw abierto, o null (lista)
  const [conv, setConv] = useState({ data: null, loading: false, error: null });
  const [busyAccion, setBusyAccion] = useState(false);

  const [toast, setToast] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const pollRef = useRef(null);

  const showToast = (msg, kind = "ok") => setToast({ msg, kind, id: Date.now() });

  // --- Auth bootstrap (maneja el retorno de OAuth) ---
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await insforge.auth.getCurrentUser();
        if (cancel) return;
        if (error || !data?.user) { setAuthState("out"); return; }
        setAuthState("in");
      } catch (_e) {
        if (!cancel) setAuthState("out");
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Maneja errores de auth de forma uniforme. Devuelve true si fue de auth.
  const manejarAuthErr = (e) => {
    if (e.code === 403) { setAuthState("restricted"); return true; }
    if (e.code === 401) { setAuthState("out"); return true; }
    return false;
  };

  // --- Cargas de datos ---
  const loadInicio = useCallback(async (silent = false) => {
    setInicio((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent && !!s.data, error: silent ? s.error : null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=inicio" });
      setInicio({ data, loading: false, error: null, refreshing: false, lastOk: new Date() });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      setInicio((s) => ({ ...s, loading: false, error: e.message, refreshing: false, offline: silent && !!s.data }));
    }
  }, []);

  const loadPagos = useCallback(async (silent = false) => {
    setPagos((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent && !!s.data, error: silent ? s.error : null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=pagos" });
      setPagos({ data, loading: false, error: null, refreshing: false, lastOk: new Date() });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      // P1: en poll silencioso, no tragarse el error; marcar offline sin borrar data.
      setPagos((s) => ({ ...s, loading: false, refreshing: false, error: e.message, offline: silent && !!s.data }));
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfig((s) => ({ ...s, loading: !s.data, error: null }));
    try {
      const data = await callFn("musa-admin-settings", { method: "GET" });
      setConfig({ data, loading: false, error: null });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      setConfig((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  const loadChats = useCallback(async (silent = false) => {
    setChats((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent && !!s.data, error: silent ? s.error : null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=conversaciones" });
      setChats({ data, loading: false, error: null, refreshing: false, lastOk: new Date() });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      setChats((s) => ({ ...s, loading: false, error: e.message, refreshing: false, offline: silent && !!s.data }));
    }
  }, []);

  const loadAnalisis = useCallback(async (silent = false) => {
    setAnalisis((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent && !!s.data, error: silent ? s.error : null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=analitica" });
      setAnalisis({ data, loading: false, error: null, refreshing: false, lastOk: new Date() });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      setAnalisis((s) => ({ ...s, loading: false, error: e.message, refreshing: false, offline: silent && !!s.data }));
    }
  }, []);

  const loadConv = useCallback(async (phoneRaw, silent = false) => {
    setConv((s) => ({ ...s, loading: !silent && !s.data, error: null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=conversacion&phone=" + encodeURIComponent(phoneRaw) });
      setConv({ data, loading: false, error: null });
    } catch (e) {
      if (manejarAuthErr(e)) return;
      setConv((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  // --- Al entrar, carga la pestana activa + arranca polling ---
  useEffect(() => {
    if (authState !== "in") return;
    loadInicio();
    if (tab === "pagos") loadPagos();
    if (tab === "config") loadConfig();
    if (tab === "chats") loadChats();
    if (tab === "analisis") loadAnalisis();
    pollRef.current = setInterval(() => {
      loadInicio(true);
      const hsh = location.hash.replace("#", "");
      if (hsh === "pagos") loadPagos(true);
      if (hsh === "chats" && !convPhone) loadChats(true);
      if (hsh === "analisis") loadAnalisis(true);
    }, 45000);
    return () => clearInterval(pollRef.current);
  }, [authState]);

  // --- Cambio de pestana ---
  const goTab = (t) => {
    setConvPhone(null);
    setTab(t);
    location.hash = t;
    if (t === "inicio") loadInicio(!!inicio.data);
    if (t === "pagos") loadPagos();
    if (t === "config") loadConfig();
    if (t === "chats") loadChats(!!chats.data);
    if (t === "analisis") loadAnalisis(!!analisis.data);
  };

  // --- Abrir / cerrar conversacion ---
  // P2: empotrar el hilo en el historial para que el boton 'atras' nativo vuelva a la lista.
  const convPhoneRef = useRef(null);
  useEffect(() => { convPhoneRef.current = convPhone; }, [convPhone]);
  useEffect(() => {
    const onPop = () => { if (convPhoneRef.current) volverLista(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const abrirConv = (phoneRaw) => {
    setConvPhone(phoneRaw);
    setConv({ data: null, loading: true, error: null });
    try { history.pushState({ conv: phoneRaw }, "", "#chats"); } catch (_e) {}
    loadConv(phoneRaw);
  };
  const volverLista = () => { setConvPhone(null); setConv({ data: null, loading: false, error: null }); loadChats(true); };

  // --- Accion sobre un pago ---
  const onAccion = async ({ accion, short_id, motivo }) => {
    if (accion === "_pedir_motivo") { setReasonFor(short_id); return; }
    // P0: UI optimista — saca la tarjeta de la cola al instante; el loadPagos posterior reconcilia.
    setPagos((s) => s.data
      ? ({ ...s, data: { ...s.data, pagos: (s.data.pagos || []).filter((x) => x.short_id !== short_id) } })
      : s);
    try {
      const r = await callFn("musa-admin-accion", { method: "POST", body: { accion, short_id, motivo } });
      if (r.ya_estaba_resuelto) showToast("#" + short_id + " ya estaba resuelto", "ok");
      else if (r.ok) {
        if (accion === "aprobar") showToast("#" + short_id + " aprobado y entregado", "ok");
        else showToast("#" + short_id + " rechazado" + (motivo ? " — " + traducirMotivo(motivo) : ""), "ok"); // P2: motivo en el toast
      } else showToast("No se pudo procesar #" + short_id, "err");
    } catch (e) {
      if (manejarAuthErr(e)) return;
      showToast("Error: " + e.message, "err");
    }
    await loadPagos();
    loadInicio(true);
  };

  const onPickReason = async (motivo) => {
    const sid = reasonFor; setReasonFor(null);
    await onAccion({ accion: "rechazar", short_id: sid, motivo });
  };

  // --- Acciones de conversacion ---
  const onTomarControl = async (phoneRaw) => {
    setBusyAccion(true);
    try {
      await callFn("musa-admin-accion", { method: "POST", body: { accion: "tomar_control", lead_phone: phoneRaw } });
      showToast("Tomaste el control", "ok");
      await loadConv(phoneRaw, true);
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
    }
    setBusyAccion(false);
    loadInicio(true);
  };
  const onDevolverControl = async (phoneRaw) => {
    setBusyAccion(true);
    try {
      await callFn("musa-admin-accion", { method: "POST", body: { accion: "devolver_control", lead_phone: phoneRaw } });
      showToast("Devuelto a Musa", "ok");
      await loadConv(phoneRaw, true);
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
    }
    setBusyAccion(false);
    loadInicio(true);
  };
  const onResponder = async (phoneRaw, texto) => {
    try {
      const r = await callFn("musa-admin-responder", { method: "POST", body: { lead_phone: phoneRaw, texto } });
      if (r.es_prueba) showToast("Guardado (número de prueba, no se envía de verdad).", "warn");
      else if (r.twilio_enviado) showToast("Mensaje enviado", "ok");
      else showToast("Se guardó, pero no se pudo enviar por WhatsApp. Intenta de nuevo.", "err");
      await loadConv(phoneRaw, true);
      return true;
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
      return false;
    }
  };

  // --- Guardar tasa / cuentas ---
  const onGuardarTasa = async (value) => {
    try {
      await callFn("musa-admin-settings", { method: "POST", body: { key: "precio_bs_hoy", value } });
      showToast("Tasa guardada", "ok");
      await loadConfig(); loadInicio(true);
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
    }
  };
  const onGuardarCuentasVe = async (value) => {
    try {
      await callFn("musa-admin-settings", { method: "POST", body: { key: "cuentas_ve", value } });
      showToast("Cuentas de Venezuela guardadas", "ok");
      await loadConfig(); loadInicio(true);
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
    }
  };
  const onGuardarCuentasCo = async (value) => {
    try {
      await callFn("musa-admin-settings", { method: "POST", body: { key: "cuentas_co", value } });
      showToast("Cuentas de Colombia guardadas", "ok");
      await loadConfig(); loadInicio(true);
    } catch (e) {
      if (!manejarAuthErr(e)) showToast("Error: " + e.message, "err");
    }
  };

  const signOut = async () => { try { await insforge.auth.signOut(); } catch (_e) {} setAuthState("out"); };

  // --- Render ---
  if (authState === "checking") {
    return html`<div class="boot"><div class="spinner"></div><p>Verificando sesion…</p></div>`;
  }
  if (authState === "out") return html`<${Login} />`;
  if (authState === "restricted") {
    return html`<div class="login">
      <div class="logo">Consola Musa</div>
      <div class="restricted">Acceso restringido.<br/>Esta cuenta no esta autorizada.</div>
      <button class="oauthbtn gh" style="max-width:320px" onClick=${signOut}>Salir y probar con otra cuenta</button>
    </div>`;
  }

  // P0: el badge de Pagos cuenta SOLO comprobantes en cola (los escalados ya los cuenta Chats).
  const pendN = inicio.data ? (inicio.data.pagos_en_cola?.n || 0) : 0;
  const escN = inicio.data ? (inicio.data.escalados?.n || 0) : 0;
  const enConv = tab === "chats" && convPhone;
  const subTitulo = enConv ? "Chat con el cliente" : TITULOS[tab];
  const subHint = enConv ? null : SUBTITULOS[tab];
  // P1: si el poll silencioso de la pestana activa fallo, mostrar 'Sin conexion' discreto en el header.
  const sinConexion = (tab === "inicio" && inicio.offline) || (tab === "pagos" && pagos.offline)
    || (tab === "chats" && chats.offline) || (tab === "analisis" && analisis.offline);

  return html`
    <div class="shell">
      <div class="topbar">
        <div>
          <h1>Consola Musa</h1>
          <div class="sub">${subTitulo}</div>
          ${sinConexion
            ? html`<div class="conn-warn">Sin conexión — reintentando</div>`
            : (subHint ? html`<div class="updated-at">${subHint}</div>` : null)}
        </div>
        <button class="iconbtn iconbtn-ghost" aria-label="Salir" onClick=${signOut}>Salir</button>
      </div>
      <div class="content">
        ${tab === "inicio" ? html`<${PantallaInicio} ...${inicio} onGoPagos=${() => goTab("pagos")} onGoChats=${() => goTab("chats")} onRetry=${() => loadInicio()} />` : null}
        ${tab === "pagos" ? html`<${PantallaPagos} ...${pagos} onAccion=${onAccion} onVerImagen=${setImgSrc} onRetry=${() => loadPagos()} />` : null}
        ${tab === "chats"
          ? (convPhone
            ? html`<${PantallaConversacion} ...${conv} onVolver=${volverLista} onTomarControl=${onTomarControl} onDevolverControl=${onDevolverControl} onResponder=${onResponder} onRetry=${() => loadConv(convPhone)} busyAccion=${busyAccion} />`
            : html`<${PantallaChats} ...${chats} soloAtencion=${soloAtencion} onToggleFiltro=${setSoloAtencion} onAbrir=${abrirConv} onRetry=${() => loadChats()} />`)
          : null}
        ${tab === "analisis" ? html`<${PantallaAnalisis} ...${analisis} onRetry=${() => loadAnalisis()} />` : null}
        ${tab === "config" ? html`<${PantallaConfig} ...${config} onGuardarTasa=${onGuardarTasa} onGuardarCuentasVe=${onGuardarCuentasVe} onGuardarCuentasCo=${onGuardarCuentasCo} onRetry=${loadConfig} />` : null}
      </div>

      <nav class="bottomnav">
        <button class=${tab === "inicio" ? "active" : ""} aria-label="Inicio" onClick=${() => goTab("inicio")}>
          <span class="ico">🏠</span>Inicio
        </button>
        <button class=${tab === "pagos" ? "active" : ""} aria-label=${"Pagos" + (pendN > 0 ? ", " + pendN + " pendientes" : "")} onClick=${() => goTab("pagos")}>
          <span class="ico">🧾</span>Pagos${pendN > 0 ? html`<span class="nbadge">${pendN}</span>` : null}
        </button>
        <button class=${tab === "chats" ? "active" : ""} aria-label=${"Chats" + (escN > 0 ? ", " + escN + " escalados" : "")} onClick=${() => goTab("chats")}>
          <span class="ico">💬</span>Chats${escN > 0 ? html`<span class="nbadge">${escN}</span>` : null}
        </button>
        <button class=${tab === "analisis" ? "active" : ""} aria-label="Análisis" onClick=${() => goTab("analisis")}>
          <span class="ico">📊</span>Analisis
        </button>
        <button class=${tab === "config" ? "active" : ""} aria-label="Configuración" onClick=${() => goTab("config")}>
          <span class="ico">⚙️</span>Config
        </button>
      </nav>

      ${reasonFor ? html`<${ReasonModal} onPick=${onPickReason} onClose=${() => setReasonFor(null)} />` : null}
      ${imgSrc ? html`<${ImageModal} src=${imgSrc} onClose=${() => setImgSrc(null)} />` : null}
      ${toast ? html`<${Toast} key=${toast.id} msg=${toast.msg} kind=${toast.kind} onDone=${() => setToast(null)} />` : null}
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
