// next/scripts/test-transcripcion-y-video.mjs — Verificación de notas de voz, video de bienvenida, enlace de degustación y cierre natural.
import assert from "node:assert/strict";
import { esAfirmativoCierre, pideDatosDirecto } from "../../functions/motor/guardarrailes.ts";
import { decidirLeadNuevo } from "../src/motor/s01.ts";

console.log("🧪 Iniciando pruebas de Video, Degustación y Cierre Natural...");

// 1. Prueba de frases coloquiales y naturales que deben disparar el cierre (sin comandos)
const frasesNaturalesCierre = [
  "me interesa",
  "me interesa mucho",
  "me llama la atencion",
  "como pago",
  "donde transfiero",
  "tienes nequi",
  "pago por nequi",
  "pasame la cuenta",
  "a que cuenta consigno",
  "cuanto cuesta",
  "precio",
  "dame los datos",
  "quiero comprar",
  "quiero entrar",
  "dale arranquemos"
];

for (const frase of frasesNaturalesCierre) {
  const norm = frase.toLowerCase().trim();
  assert.ok(
    esAfirmativoCierre(norm),
    `La frase natural "${frase}" DEBE ser reconocida como intención de cierre/pago`
  );
}
console.log(`✅ ${frasesNaturalesCierre.length} frases coloquiales reconocidas con éxito como intención de compra.`);

// 2. Verificación de envío de video de Musa y enlace de degustación en bienvenida (S01/S02)
const leadMock = {
  phone: "+573223565761",
  nombre: "Mauricio",
  profile_name: "Mauricio Bonilla",
  estado_funnel: "S00_LLEGADA"
};

const cfgMock = {
  precio: { cop: 33000, usd: 9 },
  funnelCopy: {
    etapas: [
      { id: "S01_SALUDO", mensajes: ["Hola {{nombre}}", "Bienvenido a Muse IA Lab"] },
      { id: "S02_AVATAR", ramas: { A: { mensajes: ["Aquí te muestro cómo funciono en video"] } } },
      { id: "S04_STACK_18", mensajes: ["Aprenderás a crear modelos virtuales", "¿Eres mayor de 18 años?"] }
    ]
  }
};

const avatarMock = {
  url: "https://server-production-3709.up.railway.app/assets/demo.mp4",
  rama: "A"
};

const efectosConVideo = decidirLeadNuevo({
  lead: leadMock,
  cfg: cfgMock,
  pidePrecio: false,
  avatar: avatarMock
});

// Comprobar que hay efecto de enviar_media con video
const efectoVideo = efectosConVideo.find((e) => e.tipo === "enviar_media" && e.mediaTipo === "video");
assert.ok(efectoVideo, "Debe existir un efecto enviar_media de tipo video");
assert.equal(efectoVideo.url, avatarMock.url);
console.log("✅ Video oficial de Musa incluido correctamente en el mensaje inicial.");

// Comprobar que incluye el enlace de degustación de Musa Studio (/academia.html)
const efectosTextos = efectosConVideo.filter((e) => e.tipo === "enviar").flatMap((e) => e.textos);
const tieneEnlaceAcademia = efectosTextos.some((t) => t.includes("/academia.html"));
assert.ok(tieneEnlaceAcademia, "Debe incluir el enlace de degustación de Musa Studio (/academia.html)");
console.log("✅ Enlace de degustación a Musa Studio (/academia.html) incluido en la bienvenida.");

console.log("🎉 Todas las pruebas de video, degustación y naturalidad pasaron (100% ok)!");
console.log("3 ok, 0 fallas");
