// Verificador: GET de URLs públicas de videos del avatar (status, content-type, bytes)
const base = "https://m2gnzrj8.us-east.insforge.app/api/storage/buckets/musa-avatares/objects/";
const keys = process.argv.slice(2);
for (const k of keys) {
  const url = base + k;
  try {
    const res = await fetch(url);
    const ct = res.headers.get("content-type");
    let bytes = Number(res.headers.get("content-length") || 0);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    } else {
      await res.text();
    }
    console.log(JSON.stringify({ key: k, status: res.status, contentType: ct, bytes }));
  } catch (e) {
    console.log(JSON.stringify({ key: k, error: String(e).slice(0, 200) }));
  }
}
