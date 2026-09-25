// POST /api/periods/finalize  body: { period_id, row_count }
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { period_id, row_count } = await request.json();
    if (!period_id) return Response.json({ error: 'period_id is required' }, { status: 400 });
    await env.DB.prepare("UPDATE periods SET row_count = ?, uploaded_at = datetime('now') WHERE id = ?")
      .bind(row_count || 0, period_id).run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
