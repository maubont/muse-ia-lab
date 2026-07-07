// Promueve fusion-C como master definitivo de Musa y depura descartados.
// Local: fusion-C -> musa-master.png ; conserva refs de trabajo renombradas ; borra fusion A/B/D.
// Bucket: sube base/musa-master.png ; borra base/musa-master.jpg viejo y temporales test/fusion/*.

import { readFileSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const REV = join(RAIZ, "creativos-revisar");
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;

const log = [];
function delLocal(f){ const p=join(REV,f); if(existsSync(p)){ rmSync(p); log.push("borrado local "+f);} }
function renLocal(a,b){ const pa=join(REV,a), pb=join(REV,b); if(existsSync(pa)){ renameSync(pa,pb); log.push("renombrado "+a+" -> "+b);} }

// 1) promover C -> musa-master.png
const c = readFileSync(join(REV, "fusion-C.png"));
writeFileSync(join(REV, "musa-master.png"), c);
log.push("master nuevo: musa-master.png ("+(c.length/1024/1024).toFixed(1)+"MB)");

// 2) conservar padres como referencias de trabajo
renLocal("musa-master.jpg", "_ref-nanobanana-v1.jpg");
renLocal("v Images 2.0.png", "_ref-openai-v2.png");

// 3) borrar descartados (incluida copia C ya promovida)
for (const f of ["fusion-A.png","fusion-B.png","fusion-C.png","fusion-D.png"]) delLocal(f);

// 4) bucket: subir master nuevo
async function subir(key, buf, ct){
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: ct }), key.split("/").pop());
  const res = await fetch(objUrl(key), { method:"PUT", headers:{ Authorization:`Bearer ${IK}` }, body: fd });
  if(!res.ok) throw new Error(`UPLOAD ${key} ${res.status} ${(await res.text()).slice(0,200)}`);
  log.push("bucket subido "+key);
}
async function borrar(key){
  const res = await fetch(objUrl(key), { method:"DELETE", headers:{ Authorization:`Bearer ${IK}` } });
  log.push(`bucket delete ${key} -> ${res.status}`);
}
await subir("base/musa-master.png", c, "image/png");

// 5) bucket: borrar viejo y temporales
for (const k of [
  "base/musa-master.jpg",
  "test/fusion/fusion-A.png","test/fusion/fusion-B.png","test/fusion/fusion-C.png","test/fusion/fusion-D.png",
  "test/fusion/fuente-openai-v2.png","test/fusion/fuente-nanobanana-master.jpg",
]) await borrar(k);

console.log(JSON.stringify({ ok:true, log }, null, 2));
