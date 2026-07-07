// Test de regresión del núcleo Wompi (functions/lib/wompi.ts).
// No toca red ni credenciales reales: usa un integrity/event secret de prueba y
// verifica la cripto de forma autocontenida, cruzando contra node:crypto.
// Uso: node scripts/test-wompi.mjs

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  firmaIntegridad,
  generarLinkCheckout,
  verificarChecksumEvento,
} from "../functions/lib/wompi.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname;

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

let fallos = 0;
function check(nombre, cond, extra = "") {
  const ok = !!cond;
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
}

// ───────────────────────── 1) Firma de integridad del checkout ─────────────────────────
{
  const reference = "MUSA-573001112233-1719400000000";
  const amountInCents = 3_300_000; // 33.000 COP
  const currency = "COP";
  const integritySecret = "test_integrity_ABC123";

  const esperado = sha(`${reference}${amountInCents}${currency}${integritySecret}`);
  const obtenido = await firmaIntegridad({ reference, amountInCents, currency, integritySecret });
  check("firmaIntegridad = SHA256(ref+amount+currency+secret)", obtenido === esperado, obtenido.slice(0, 12) + "…");

  // Con expirationTime, el campo entra en la cadena.
  const exp = "2026-07-01T00:00:00.000Z";
  const esperadoExp = sha(`${reference}${amountInCents}${currency}${exp}${integritySecret}`);
  const obtenidoExp = await firmaIntegridad({ reference, amountInCents, currency, integritySecret, expirationTime: exp });
  check("firmaIntegridad incluye expirationTime cuando se usa", obtenidoExp === esperadoExp);
  check("expirationTime cambia la firma", obtenidoExp !== obtenido);
}

// ───────────────────────── 2) URL del Web Checkout ─────────────────────────
{
  const url = await generarLinkCheckout({
    publicKey: "pub_test_XYZ",
    integritySecret: "test_integrity_ABC123",
    reference: "MUSA-573001112233-1719400000000",
    amountInCents: 3_300_000,
    redirectUrl: "https://m2gnzrj8.insforge.site/gracias",
  });

  check("URL apunta al checkout de Wompi", url.startsWith("https://checkout.wompi.co/p/?"));
  check("clave signature:integrity SIN encodear el ':' (no %3A)", url.includes("&signature:integrity=") && !url.includes("signature%3Aintegrity"));
  check("amount-in-cents en centavos enteros", url.includes("amount-in-cents=3300000"));
  check("currency=COP presente", url.includes("currency=COP"));
  check("public-key presente", url.includes("public-key=pub_test_XYZ"));
  check("redirect-url presente y encodeada", url.includes("redirect-url=https%3A%2F%2F"));

  // La integrity de la URL debe coincidir con firmaIntegridad().
  const m = url.match(/signature:integrity=([0-9a-f]{64})/);
  const esperado = await firmaIntegridad({ reference: "MUSA-573001112233-1719400000000", amountInCents: 3_300_000, currency: "COP", integritySecret: "test_integrity_ABC123" });
  check("integrity de la URL coincide con firmaIntegridad()", m && m[1] === esperado);

  // Validaciones defensivas.
  let lanzo = false;
  try { await generarLinkCheckout({ publicKey: "x", integritySecret: "y", reference: "r", amountInCents: 0 }); } catch { lanzo = true; }
  check("rechaza amountInCents<=0", lanzo);
}

// ───────────────────────── 3) Verificación de eventos (checksum) ─────────────────────────
{
  const eventSecret = "test_event_SECRET_999";
  // Evento típico transaction.updated con APPROVED.
  const body = {
    event: "transaction.updated",
    data: { transaction: { id: "1234-tx", status: "APPROVED", amount_in_cents: 3_300_000, reference: "MUSA-573001112233-1719400000000" } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    timestamp: 1719400123,
  };
  // Checksum correcto = concat(valores de properties) + timestamp + eventSecret.
  const cadena = `${body.data.transaction.id}${body.data.transaction.status}${body.data.transaction.amount_in_cents}${body.timestamp}${eventSecret}`;
  const checksumOk = sha(cadena);

  const r1 = await verificarChecksumEvento(body, checksumOk, eventSecret);
  check("checksum válido => valido=true", r1.valido === true, r1.motivo);

  const r2 = await verificarChecksumEvento(body, checksumOk.toUpperCase(), eventSecret);
  check("comparación case-insensitive", r2.valido === true);

  // Manipulación: cambiar el status invalida la firma.
  const bodyTamper = JSON.parse(JSON.stringify(body));
  bodyTamper.data.transaction.status = "DECLINED";
  const r3 = await verificarChecksumEvento(bodyTamper, checksumOk, eventSecret);
  check("evento manipulado (status) => valido=false", r3.valido === false, r3.motivo);

  // Fail-closed: faltantes.
  check("sin event secret => fail-closed", (await verificarChecksumEvento(body, checksumOk, undefined)).valido === false);
  check("sin header checksum => fail-closed", (await verificarChecksumEvento(body, null, eventSecret)).valido === false);
  const sinTs = JSON.parse(JSON.stringify(body)); delete sinTs.timestamp;
  check("sin timestamp => fail-closed", (await verificarChecksumEvento(sinTs, checksumOk, eventSecret)).valido === false);
  const sinProps = JSON.parse(JSON.stringify(body)); delete sinProps.signature.properties;
  check("sin properties => fail-closed", (await verificarChecksumEvento(sinProps, checksumOk, eventSecret)).valido === false);
}

console.log(fallos === 0 ? "\nTODO OK ✅" : `\n${fallos} FALLO(S) ❌`);
process.exit(fallos === 0 ? 0 : 1);
