export async function onRequestGet(context) {
  const { env, params } = context;
  const year = Number(params.year), month = Number(params.month);
  const period = await env.DB.prepare('SELECT * FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return Response.json({ error: 'not found' }, { status: 404 });

  const [ticketsRes, gapsRes, voiceRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM tickets WHERE period_id = ?').bind(period.id).all(),
    env.DB.prepare('SELECT channel, gap_min, gap_date FROM response_gaps WHERE period_id = ?').bind(period.id).all(),
    env.DB.prepare('SELECT event, talktime_min, call_date FROM voice_records WHERE period_id = ?').bind(period.id).all()
  ]);

  const rows = (ticketsRes.results || []).map(t => ({
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
    customerEmail: t.customer_email,
    customerCategory: t.customer_category,
    company: t.company,
    raw: t.raw_json ? JSON.parse(t.raw_json) : {}
  }));
  const gaps = (gapsRes.results || []).map(g => ({ channel: g.channel, gapMin: g.gap_min, date: g.gap_date }));
  const voiceRecords = (voiceRes.results || []).map(v => ({ event: v.event, talktimeMin: v.talktime_min, date: v.call_date }));

  return Response.json({ year: period.year, month: period.month, label: period.label, rows, gaps, voiceRecords });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const year = Number(params.year), month = Number(params.month);
  const period = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return Response.json({ error: 'not found' }, { status: 404 });
  await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(period.id).run();
  await env.DB.prepare('DELETE FROM response_gaps WHERE period_id = ?').bind(period.id).run();
  await env.DB.prepare('DELETE FROM voice_records WHERE period_id = ?').bind(period.id).run();
  await env.DB.prepare('DELETE FROM periods WHERE id = ?').bind(period.id).run();
  return Response.json({ ok: true });
}
