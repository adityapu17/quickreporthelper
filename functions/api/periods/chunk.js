// POST /api/periods/chunk  body: { period_id, kind, rows: [...] }
// kind: 'ticket' | 'gap' | 'voice' — inserts a batch of rows into the
// matching table (called repeatedly by the client so it can show a %
// progress bar). Internally re-chunks per kind to stay under D1's
// 100-bound-parameter-per-query limit.
const TICKET_COLS = [
  'period_id', 'channel', 'category', 'main_category', 'sub_category_raw',
  'detail_sub_category', 'escalated', 'date_start', 'date_open', 'date_end',
  'phone', 'customer_email', 'customer_category', 'company', 'raw_json'
];
const GAP_COLS = ['period_id', 'channel', 'gap_min', 'gap_date'];
const VOICE_COLS = ['period_id', 'event', 'talktime_min', 'call_date'];

const CONFIGS = {
  ticket: { table: 'tickets', cols: TICKET_COLS, chunk: 6, toParams: (id, r) => [
    id, r.channel || null, r.category || null, r.mainCategory || null,
    r.subCategoryRaw || null, r.detailSubCategory || null, r.escalated ? 1 : 0,
    r.dateStart || null, r.dateOpen || null, r.dateEnd || null, r.phone || null,
    r.customerEmail || null, r.customerCategory || null, r.company || null,
    JSON.stringify(r.raw || {})
  ]},
  gap: { table: 'response_gaps', cols: GAP_COLS, chunk: 20, toParams: (id, r) => [
    id, r.channel || null, r.gapMin, r.date || null
  ]},
  voice: { table: 'voice_records', cols: VOICE_COLS, chunk: 20, toParams: (id, r) => [
    id, r.event || null, r.talktimeMin, r.date || null
  ]}
};

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { period_id, kind, rows } = await request.json();
    const cfg = CONFIGS[kind];
    if (!period_id || !cfg || !Array.isArray(rows)) {
      return Response.json({ error: 'period_id, valid kind, and rows[] are required' }, { status: 400 });
    }
    for (let i = 0; i < rows.length; i += cfg.chunk) {
      const chunk = rows.slice(i, i + cfg.chunk);
      const placeholders = chunk.map(() => '(' + cfg.cols.map(() => '?').join(',') + ')').join(',');
      const sql = `INSERT INTO ${cfg.table} (${cfg.cols.join(',')}) VALUES ${placeholders}`;
      const params = [];
      chunk.forEach(r => params.push(...cfg.toParams(period_id, r)));
      await env.DB.prepare(sql).bind(...params).run();
    }
    return Response.json({ ok: true, inserted: rows.length });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
