const COLS = [
  'period_id', 'channel', 'category', 'main_category', 'sub_category_raw',
  'detail_sub_category', 'escalated', 'date_start', 'date_open', 'date_end',
  'phone', 'customer_category', 'company', 'raw_json'
];
const CHUNK_SIZE = 25;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleListPeriods(env) {
  const { results } = await env.DB.prepare(
    'SELECT year, month, label, row_count, uploaded_at FROM periods ORDER BY year DESC, month DESC'
  ).all();
  return json(results || []);
}

async function handleSavePeriod(request, env) {
  const body = await request.json();
  const { year, month, label, rows } = body;
  if (!year || month === undefined || month === null || !Array.isArray(rows)) {
    return json({ error: 'year, month, and rows[] are required' }, 400);
  }

  // Upsert the period row, replacing any previous data for the same year+month.
  const existing = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  let periodId;
  if (existing) {
    periodId = existing.id;
    await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(periodId).run();
    await env.DB.prepare('UPDATE periods SET label = ?, row_count = ?, uploaded_at = datetime(\'now\') WHERE id = ?')
      .bind(label || null, rows.length, periodId).run();
  } else {
    const res = await env.DB.prepare(
      'INSERT INTO periods (year, month, label, row_count) VALUES (?, ?, ?, ?)'
    ).bind(year, month, label || null, rows.length).run();
    periodId = res.meta.last_row_id;
  }

  // Bulk-insert in chunks to stay well under D1's per-statement bound-parameter limit.
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '(' + COLS.map(() => '?').join(',') + ')').join(',');
    const sql = `INSERT INTO tickets (${COLS.join(',')}) VALUES ${placeholders}`;
    const params = [];
    chunk.forEach(r => {
      params.push(
        periodId, r.channel || null, r.category || null, r.mainCategory || null,
        r.subCategoryRaw || null, r.detailSubCategory || null, r.escalated ? 1 : 0,
        r.dateStart || null, r.dateOpen || null, r.dateEnd || null, r.phone || null,
        r.customerCategory || null, r.company || null, JSON.stringify(r.raw || {})
      );
    });
    await env.DB.prepare(sql).bind(...params).run();
  }

  return json({ ok: true, period_id: periodId, row_count: rows.length });
}

async function handleGetPeriod(env, year, month) {
  const period = await env.DB.prepare('SELECT * FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return json({ error: 'not found' }, 404);
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
  return json({ year: period.year, month: period.month, label: period.label, rows });
}

async function handleDeletePeriod(env, year, month) {
  const period = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
    .bind(year, month).first();
  if (!period) return json({ error: 'not found' }, 404);
  await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(period.id).run();
  await env.DB.prepare('DELETE FROM periods WHERE id = ?').bind(period.id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/periods' && request.method === 'GET') {
      return handleListPeriods(env);
    }
    if (path === '/api/periods' && request.method === 'POST') {
      try {
        return await handleSavePeriod(request, env);
      } catch (err) {
        return json({ error: err.message || String(err) }, 500);
      }
    }
    const m = path.match(/^\/api\/periods\/(\d+)\/(\d+)$/);
    if (m) {
      const year = Number(m[1]), month = Number(m[2]);
      if (request.method === 'GET') return handleGetPeriod(env, year, month);
      if (request.method === 'DELETE') return handleDeletePeriod(env, year, month);
    }

    return env.ASSETS.fetch(request);
  }
};
