import pg from 'pg';

async function main() {
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(
    'SELECT direccion, texto, audio, created_at FROM musa_mensajes WHERE phone = $1 ORDER BY id DESC LIMIT 10',
    ['+573223565761']
  );

  console.log('--- ÚLTIMOS MENSAJES DE WHATSAPP (+573223565761) ---');
  for (const row of res.rows.reverse()) {
    const hora = new Date(row.created_at).toLocaleTimeString('es-CO');
    const emisor = row.direccion === 'entrante' ? '🧑 Cliente' : '💋 Musa';
    const tipo = row.audio ? '[Nota de Voz 🎙️]' : '[Texto]';
    console.log(`[${hora}] ${emisor} ${tipo}: ${row.texto}`);
  }
  await client.end();
}

main().catch(err => {
  console.error('Error al consultar chat:', err.message);
  process.exit(1);
});
