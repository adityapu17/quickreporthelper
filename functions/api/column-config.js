// GET /api/column-config — returns { key: value, ... } of all overrides.
// POST /api/column-config  body: { config: { key: value, ... } } — upserts
// every provided key (empty string clears an override back to default).
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare('SELECT key, value FROM column_config').all();
  const config = {};
  (results || []).forEach(r => { config[r.key] = r.value; });
  return Response.json(config);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { config } = await request.json();
    if (!config || typeof config !== 'object') {
      return Response.json({ error: 'config object is required' }, { status: 400 });
    }
    const entries = Object.entries(config);
    for (const [key, value] of entries) {
      await env.DB.prepare(
        'INSERT INTO column_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).bind(key, value || '').run();
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
