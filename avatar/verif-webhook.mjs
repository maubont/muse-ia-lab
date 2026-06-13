// Verificador: POST tipo Twilio al webhook musa-webhook-twilio
// uso: node verif-webhook.mjs <waid-sin-mas> <profileName> <body>
const [waid, profileName, ...rest] = process.argv.slice(2);
const body = rest.join(" ");
const url = "https://m2gnzrj8.functions.insforge.app/musa-webhook-twilio";
const params = new URLSearchParams({
  From: `whatsapp:+${waid}`,
  WaId: waid,
  ProfileName: profileName,
  Body: body,
  NumMedia: "0",
  MessageSid: "SMverif" + Date.now() + Math.floor(Math.random() * 10000),
});
const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params,
});
const txt = await res.text();
console.log(JSON.stringify({ status: res.status, ms: Date.now() - t0, body: txt.slice(0, 200) }));
