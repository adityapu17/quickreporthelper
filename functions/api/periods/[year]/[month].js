export async function onRequestGet(context) {
  const { env, params } = context;
  const year = Number(params.year), month = Number(params.month);
  const period = await env.DB.prepare('SELECT * FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return Response.json({ error: 'not found' }, { status: 404 });
  const { results } = await env.DB.prepare('SELECT * FROM tickets WHERE period_id = ?')
    .bind(period.id).all();
  const rows = (results || []).map(t => ({
    channel: t.channel,
    category: t.category,
    mainCategory: t.main_category,
    subCategoryRaw: t.sub_category_raw,
    detailSubCategory: t.detail_sub_category,
    escalated: !!t.escalated,
    dateStart: t.date_start,
    dateOpen: t.date_open,
    dateEnd: t.date_end,
    phone: t.phone,
    customerCategory: t.customer_category,
    company: t.company,
    raw: t.raw_json ? JSON.parse(t.raw_json) : {}
  }));
  return Response.json({ year: period.year, month: period.month, label: period.label, rows });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const year = Number(params.year), month = Number(params.month);
  const period = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return Response.json({ error: 'not found' }, { status: 404 });
  await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(period.id).run();
  await env.DB.prepare('DELETE FROM periods WHERE id = ?').bind(period.id).run();
  return Response.json({ ok: true });
}
