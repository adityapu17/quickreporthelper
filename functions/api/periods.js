const CHUNK_SIZE = 7; // 7 rows * 14 columns = 98 bound params, under D1's 100-param-per-query limit
const COLS = [
  'period_id', 'channel', 'category', 'main_category', 'sub_category_raw',
  'detail_sub_category', 'escalated', 'date_start', 'date_open', 'date_end',
  'phone', 'customer_category', 'company', 'raw_json'
];

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT year, month, label, row_count, uploaded_at FROM periods ORDER BY year DESC, month DESC'
  ).all();
  return Response.json(results || []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { year, month, label, rows } = body;
    if (!year || month === undefined || month === null || !Array.isArray(rows)) {
      return Response.json({ error: 'year, month, and rows[] are required' }, { status: 400 });
    }

    const existing = await env.DB.prepare('SELECT id FROM periods WHERE year = ? AND month = ?')
      .bind(year, month).first();
    let periodId;
    if (existing) {
      periodId = existing.id;
      await env.DB.prepare('DELETE FROM tickets WHERE period_id = ?').bind(periodId).run();
      await env.DB.prepare("UPDATE periods SET label = ?, row_count = 0 WHERE id = ?")
        .bind(label || null, periodId).run();
    } else {
      const res = await env.DB.prepare(
        'INSERT INTO periods (year, month, label, row_count) VALUES (?, ?, ?, 0)'
      ).bind(year, month, label || null).run();
      periodId = res.meta.last_row_id;
    }

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

    // Only mark the final row_count once every chunk has inserted successfully.
    await env.DB.prepare("UPDATE periods SET row_count = ?, uploaded_at = datetime('now') WHERE id = ?")
      .bind(rows.length, periodId).run();

    return Response.json({ ok: true, period_id: periodId, row_count: rows.length });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
