// POST /api/periods/init  body: { year, month, label }
// Creates (or clears, if it already exists) a period, ready to receive
// row chunks via /api/periods/chunk.
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { year, month, label } = await request.json();
    if (!year || month === undefined || month === null) {
      return Response.json({ error: 'year and month are required' }, { status: 400 });
    }
    const existing = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
      .bind(year, month).first();
    let periodId;
    if (existing) {
      periodId = existing.id;
      await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(periodId).run();
      await env.DB.prepare('UPDATE periods SET label = ?, row_count = 0 WHERE id = ?')
        .bind(label || null, periodId).run();
    } else {
      const res = await env.DB.prepare(
        'INSERT INTO periods (year, month, label, row_count) VALUES (?, ?, ?, 0)'
      ).bind(year, month, label || null).run();
      periodId = res.meta.last_row_id;
    }
    return Response.json({ ok: true, period_id: periodId });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
