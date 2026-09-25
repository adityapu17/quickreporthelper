// POST /api/periods/chunk  body: { period_id, rows: [...] }
// Inserts a batch of rows (called repeatedly by the client so it can show
// a % progress bar). Internally re-chunks to 7 rows/statement to stay
// under D1's 100-bound-parameter-per-query limit (14 columns * 7 = 98).
const D1_CHUNK = 6; // 6 rows * 15 columns = 90 bound params, under D1's 100-param-per-query limit
const COLS = [
  'period_id', 'channel', 'category', 'main_category', 'sub_category_raw',
  'detail_sub_category', 'escalated', 'date_start', 'date_open', 'date_end',
  'phone', 'customer_email', 'customer_category', 'company', 'raw_json'
];

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { period_id, rows } = await request.json();
    if (!period_id || !Array.isArray(rows)) {
      return Response.json({ error: 'period_id and rows[] are required' }, { status: 400 });
    }
    for (let i = 0; i < rows.length; i += D1_CHUNK) {
      const chunk = rows.slice(i, i + D1_CHUNK);
      const placeholders = chunk.map(() => '(' + COLS.map(() => '?').join(',') + ')').join(',');
      const sql = `INSERT INTO tickets (${COLS.join(',')}) VALUES ${placeholders}`;
      const params = [];
      chunk.forEach(r => {
        params.push(
          period_id, r.channel || null, r.category || null, r.mainCategory || null,
          r.subCategoryRaw || null, r.detailSubCategory || null, r.escalated ? 1 : 0,
          r.dateStart || null, r.dateOpen || null, r.dateEnd || null, r.phone || null,
          r.customerEmail || null, r.customerCategory || null, r.company || null,
          JSON.stringify(r.raw || {})
        );
      });
      await env.DB.prepare(sql).bind(...params).run();
    }
    return Response.json({ ok: true, inserted: rows.length });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
