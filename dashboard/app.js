// Consola Musa — SPA movil-first (Preact + htm via CDN, sin build).
// Auth: OAuth InsForge (google/github) con ANON key publica. El access token de la
// sesion se pasa como Bearer a las funciones admin (musa-admin-*). Si el email no
// es el del dueno, las funciones responden 403 -> "Acceso restringido".
// La API key admin NUNCA vive aqui: solo en las funciones server-side.

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
function tiempoBadge(min) {
  if (min == null) return null;
  if (min < 60) return { txt: min + " min", cls: min > 20 ? "danger" : "warn" };
  const h = Math.floor(min / 60);
  return { txt: h + " h", cls: "danger" };
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

// ===================== Componentes =====================

function Toast({ msg, kind, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, []);
  return html`<div class="toast ${kind}">${msg}</div>`;
}

function Login({ error }) {
  const oauth = (provider) =>
    insforge.auth.signInWithOAuth(provider, {
      redirectTo: REDIRECT_TO,
      additionalParams: { prompt: "select_account" },
    });
  return html`
    <div class="login">
      <div class="logo">Consola Musa</div>
      <div class="tag">Panel del operador</div>
      ${error === "restricted"
        ? html`<div class="restricted">Acceso restringido. Esta cuenta no es la del dueno.</div>`
        : null}
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
function PantallaInicio({ data, loading, error, refreshing, onGoPagos }) {
  if (loading && !data) return html`<div class="loading-state"><div class="inline-spin"></div> Cargando tablero…</div>`;
  if (error && !data) return html`<div class="error-state">No se pudo cargar el tablero.<br/>${error}</div>`;
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
      sub: "Chats que pidieron atencion", badge: { txt: "atender", cls: "warn" }, go: null,
    });
  }
  if (data.chats_vivos?.n > 0) {
    pendientes.push({
      dot: "var(--green)", title: data.chats_vivos.n + " chat" + (data.chats_vivos.n > 1 ? "s" : "") + " vivo" + (data.chats_vivos.n > 1 ? "s" : "") + " hoy",
      sub: "Conversaciones activas", badge: { txt: "activo", cls: "ok" }, go: null,
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
          <div class="label">Metrica reina</div>
          <div class="value">${fmtNum(data.metrica_reina_pct || 0)}<small>%</small></div>
          <div class="hint">llegan a pagar (S08/S06)</div>
        </div>
      </div>

      <div class="section-title">Pendientes</div>
      <div class="card" style="padding:6px 16px">
        ${pendientes.length === 0
          ? html`<div class="empty" style="padding:24px 8px"><div class="big">✅</div>Nada pendiente. Todo en orden.</div>`
          : pendientes.map((p) => html`
            <a class="pending" href=${p.go ? "#pagos" : "#"} onClick=${(e) => { if (p.go) { e.preventDefault(); p.go(); } else { e.preventDefault(); } }}>
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
function PantallaPagos({ data, loading, error, onAccion, onVerImagen }) {
  if (loading && !data) return html`<div class="loading-state"><div class="inline-spin"></div> Cargando bandeja…</div>`;
  if (error && !data) return html`<div class="error-state">No se pudo cargar la bandeja.<br/>${error}</div>`;
  if (!data) return null;

  const pagos = data.pagos || [];
  const resueltos = data.resueltos_hoy || [];

  return html`
    <div>
      ${pagos.length === 0
        ? html`<div class="empty"><div class="big">🎉</div>No hay pagos por revisar.</div>`
        : pagos.map((p) => html`<${PagoCard} key=${p.short_id} p=${p} onAccion=${onAccion} onVerImagen=${onVerImagen} />`)}

      ${resueltos.length > 0 ? html`
        <div class="section-title">Resueltos hoy</div>
        <div class="card" style="padding:6px 16px">
          ${resueltos.map((r) => html`
            <div class="resuelto">
              <span class="badge ${r.status === "aprobado" ? "ok" : "danger"}">${r.status === "aprobado" ? "OK" : "NO"}</span>
              <span class="r-sid">#${r.short_id}</span>
              <span class="r-meta">${fmtMonto(r.monto, r.moneda)}${r.motivo_flag ? " · " + traducirMotivo(r.motivo_flag) : ""}</span>
            </div>`)}
        </div>` : null}
    </div>
  `;
}

function PagoCard({ p, onAccion, onVerImagen }) {
  const [busy, setBusy] = useState(false);
  const motivo = traducirMotivo(p.motivo_flag);
  const fraude = p.motivo_flag && MOTIVOS_FRAUDE.test(p.motivo_flag);
  const b = tiempoBadge(p.antiguedad_min);
  const d = p.datos_extraidos || {};
  const montoBad = p.precio_esperado != null && p.monto != null && Number(p.monto) < Number(p.precio_esperado);

  const aprobar = async () => {
    setBusy(true);
    await onAccion({ accion: "aprobar", short_id: p.short_id });
    setBusy(false);
  };
  const rechazar = () => onAccion({ accion: "_pedir_motivo", short_id: p.short_id });

  return html`
    <div class="pago-card">
      ${p.imagen
        ? html`<img class="pago-img" src=${p.imagen} alt="comprobante" onClick=${() => onVerImagen(p.imagen)} />`
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
        <div class="kv">
          ${p.metodo ? html`<span><b>Metodo:</b> ${p.metodo}</span>` : null}
          ${d.numero_referencia ? html`<span><b>Ref:</b> ${d.numero_referencia}</span>` : null}
          ${d.banco_o_app ? html`<span><b>Banco:</b> ${d.banco_o_app}</span>` : null}
          ${d.fecha ? html`<span><b>Fecha:</b> ${d.fecha}</span>` : null}
          ${d.destino ? html`<span><b>Destino:</b> ${d.destino}</span>` : null}
        </div>
        <div class="actions">
          <button class="btn btn-ok" disabled=${busy} onClick=${aprobar}>${busy ? "…" : "Aprobar"}</button>
          <button class="btn btn-no" disabled=${busy} onClick=${rechazar}>Rechazar</button>
          ${p.imagen ? html`<button class="btn btn-ver" onClick=${() => onVerImagen(p.imagen)}>Ver</button>` : null}
        </div>
      </div>
    </div>
  `;
}

// -------- CONFIG --------
function PantallaConfig({ data, loading, error, onGuardarTasa, onActivarReales }) {
  const [bs, setBs] = useState("");
  const [savingTasa, setSavingTasa] = useState(false);
  const [confirmReal, setConfirmReal] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (data?.precio_bs_hoy?.bs != null) setBs(String(data.precio_bs_hoy.bs));
  }, [data]);

  if (loading && !data) return html`<div class="loading-state"><div class="inline-spin"></div> Cargando configuracion…</div>`;
  if (error && !data) return html`<div class="error-state">No se pudo cargar la configuracion.<br/>${error}</div>`;
  if (!data) return null;

  const cuentasVe = data.cuentas_ve || {};
  const provisional = cuentasVe.provisional === true;
  const pm = cuentasVe.pago_movil || {};
  const cu = cuentasVe.cuenta || {};

  const guardarTasa = async () => {
    const n = Number(bs);
    if (!n || n <= 0) return;
    setSavingTasa(true);
    const prev = data.precio_bs_hoy || {};
    const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    await onGuardarTasa({ ...prev, bs: n, fecha: hoyISO });
    setSavingTasa(false);
  };
  const activar = async () => {
    setActivando(true);
    await onActivarReales(cuentasVe);
    setActivando(false);
    setConfirmReal(false);
  };

  return html`
    <div>
      <div class="card">
        <h2>Tasa del dia (Bs)</h2>
        <div class="field">
          <label>Bolivares por curso</label>
          <input type="number" inputmode="decimal" value=${bs} onInput=${(e) => setBs(e.target.value)} placeholder="ej. 360" />
          <div class="desc">Fecha guardada hoy (America/Caracas). Precio base: ${fmtNum(data.precio?.usd) || "—"} USD.</div>
        </div>
        <button class="btn-block btn-primary" disabled=${savingTasa} onClick=${guardarTasa}>${savingTasa ? "Guardando…" : "Guardar tasa"}</button>
      </div>

      <div class="card">
        <h2>Cuentas de Venezuela</h2>
        <span class="cuentas-flag ${provisional ? "flag-prov" : "flag-real"}">${provisional ? "MODO PROVISIONAL (simulacion)" : "CUENTAS REALES ACTIVAS"}</span>
        <div class="kv" style="display:block">
          ${pm.banco || pm.telefono
            ? html`<div><b>Pago movil:</b> ${pm.banco || ""} ${pm.telefono || ""} ${pm.cedula ? "· CI " + pm.cedula : ""}</div>`
            : html`<div class="desc">Sin pago movil configurado.</div>`}
          ${cu.numero
            ? html`<div><b>Cuenta:</b> ${cu.banco || ""} ${cu.numero}</div>`
            : null}
        </div>
        ${provisional
          ? (confirmReal
            ? html`<div style="margin-top:12px">
                <div class="banner danger" style="margin-bottom:10px"><span class="b-ico">⚠️</span><div>Vas a activar las cuentas <b>reales</b>. El bot empezara a enviar estos datos a los clientes. ¿Seguro?</div></div>
                <button class="btn-block btn-primary" disabled=${activando} onClick=${activar}>${activando ? "Activando…" : "Si, activar cuentas reales"}</button>
                <button class="btn-block btn-ghost" style="margin-top:8px" onClick=${() => setConfirmReal(false)}>Cancelar</button>
              </div>`
            : html`<button class="btn-block btn-primary" style="margin-top:12px" onClick=${() => setConfirmReal(true)}>Activar cuentas reales de Venezuela</button>`)
          : html`<div class="desc" style="margin-top:10px">Las cuentas reales ya estan activas.</div>`}
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
      <img class="modal-img" src=${src} onClick=${(e) => e.stopPropagation()} />
    </div>
  `;
}

// ===================== App raiz =====================
function App() {
  const [authState, setAuthState] = useState("checking"); // checking | out | in | restricted
  const [tab, setTab] = useState(() => (location.hash === "#pagos" ? "pagos" : location.hash === "#config" ? "config" : "inicio"));

  const [inicio, setInicio] = useState({ data: null, loading: true, error: null, refreshing: false });
  const [pagos, setPagos] = useState({ data: null, loading: true, error: null });
  const [config, setConfig] = useState({ data: null, loading: true, error: null });

  const [toast, setToast] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const pollRef = useRef(null);

  const showToast = (msg, kind = "ok") => setToast({ msg, kind, id: Date.now() });

  // --- Auth bootstrap (maneja el retorno de OAuth) ---
  useEffect(() => {
    let cancel = false;
    (async () => {
      // El SDK auto-detecta insforge_code en la URL y canjea la sesion.
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

  // --- Cargas de datos ---
  const loadInicio = useCallback(async (silent = false) => {
    setInicio((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent && !!s.data }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=inicio" });
      setInicio({ data, loading: false, error: null, refreshing: false });
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      if (e.code === 401) { setAuthState("out"); return; }
      setInicio((s) => ({ ...s, loading: false, error: e.message, refreshing: false }));
    }
  }, []);

  const loadPagos = useCallback(async () => {
    setPagos((s) => ({ ...s, loading: !s.data, error: null }));
    try {
      const data = await callFn("musa-admin-data", { query: "view=pagos" });
      setPagos({ data, loading: false, error: null });
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      if (e.code === 401) { setAuthState("out"); return; }
      setPagos((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfig((s) => ({ ...s, loading: !s.data, error: null }));
    try {
      const data = await callFn("musa-admin-settings", { method: "GET" });
      setConfig({ data, loading: false, error: null });
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      if (e.code === 401) { setAuthState("out"); return; }
      setConfig((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  // --- Al entrar, carga la pestana activa + arranca polling de inicio ---
  useEffect(() => {
    if (authState !== "in") return;
    loadInicio();
    if (tab === "pagos") loadPagos();
    if (tab === "config") loadConfig();
    pollRef.current = setInterval(() => {
      loadInicio(true);
      if (location.hash === "#pagos") loadPagos();
    }, 45000);
    return () => clearInterval(pollRef.current);
  }, [authState]);

  // --- Cambio de pestana ---
  const goTab = (t) => {
    setTab(t);
    location.hash = t;
    if (t === "inicio") loadInicio(!!inicio.data);
    if (t === "pagos") loadPagos();
    if (t === "config") loadConfig();
  };

  // --- Accion sobre un pago ---
  const onAccion = async ({ accion, short_id, motivo }) => {
    if (accion === "_pedir_motivo") { setReasonFor(short_id); return; }
    try {
      const r = await callFn("musa-admin-accion", { method: "POST", body: { accion, short_id, motivo } });
      if (r.ya_estaba_resuelto) showToast("#" + short_id + " ya estaba resuelto", "ok");
      else if (r.ok) showToast(accion === "aprobar" ? "#" + short_id + " aprobado y entregado" : "#" + short_id + " rechazado", "ok");
      else showToast("No se pudo procesar #" + short_id, "err");
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      showToast("Error: " + e.message, "err");
    }
    await loadPagos();
    loadInicio(true);
  };

  const onPickReason = async (motivo) => {
    const sid = reasonFor; setReasonFor(null);
    await onAccion({ accion: "rechazar", short_id: sid, motivo });
  };

  // --- Guardar tasa / activar cuentas reales ---
  const onGuardarTasa = async (value) => {
    try {
      await callFn("musa-admin-settings", { method: "POST", body: { key: "precio_bs_hoy", value } });
      showToast("Tasa guardada", "ok");
      await loadConfig(); loadInicio(true);
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      showToast("Error: " + e.message, "err");
    }
  };
  const onActivarReales = async (cuentasVe) => {
    try {
      const value = { ...cuentasVe, provisional: false, es_simulacion: false };
      await callFn("musa-admin-settings", { method: "POST", body: { key: "cuentas_ve", value } });
      showToast("Cuentas reales activadas", "ok");
      await loadConfig(); loadInicio(true);
    } catch (e) {
      if (e.code === 403) { setAuthState("restricted"); return; }
      showToast("Error: " + e.message, "err");
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

  const pendN = inicio.data ? ((inicio.data.pagos_en_cola?.n || 0) + (inicio.data.escalados?.n || 0)) : 0;

  return html`
    <div class="shell">
      <div class="topbar">
        <div>
          <h1>Consola Musa</h1>
          <div class="sub">${tab === "inicio" ? "Inicio" : tab === "pagos" ? "Bandeja de pagos" : "Configuracion"}</div>
        </div>
        <button class="iconbtn" onClick=${signOut}>Salir</button>
      </div>
      <div class="content">
        ${tab === "inicio" ? html`<${PantallaInicio} ...${inicio} onGoPagos=${() => goTab("pagos")} />` : null}
        ${tab === "pagos" ? html`<${PantallaPagos} ...${pagos} onAccion=${onAccion} onVerImagen=${setImgSrc} />` : null}
        ${tab === "config" ? html`<${PantallaConfig} ...${config} onGuardarTasa=${onGuardarTasa} onActivarReales=${onActivarReales} />` : null}
      </div>

      <nav class="bottomnav">
        <button class=${tab === "inicio" ? "active" : ""} onClick=${() => goTab("inicio")}>
          <span class="ico">🏠</span>Inicio
        </button>
        <button class=${tab === "pagos" ? "active" : ""} onClick=${() => goTab("pagos")}>
          <span class="ico">🧾</span>Pagos${pendN > 0 ? html`<span class="nbadge">${pendN}</span>` : null}
        </button>
        <button class=${tab === "config" ? "active" : ""} onClick=${() => goTab("config")}>
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
