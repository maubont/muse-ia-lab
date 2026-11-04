import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const r = await pool.query(
    "SELECT tel, estado_funnel, created_at, updated_at FROM musa_leads ORDER BY updated_at DESC LIMIT 10"
  );
  console.log("LEADS RECIENTES:");
  console.table(r.rows);

  const m = await pool.query(
    "SELECT id, lead_tel, direccion, tipo, cuerpo, created_at FROM musa_messages ORDER BY id DESC LIMIT 10"
  );
  console.log("\nMENSAJES RECIENTES:");
  console.table(m.rows.map(x => ({
    id: x.id,
    tel: x.lead_tel,
    dir: x.direccion,
    cuerpo: (x.cuerpo || "").slice(0, 60),
    ts: x.created_at
  })));
} finally {
  await pool.end();
}
