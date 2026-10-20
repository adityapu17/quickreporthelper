// GET /api/ticketing/search?q=<teks>      -> daftar tiket (ticket id / subject mengandung teks)
// GET /api/ticketing/search?id=<tickets.id> -> detail satu tiket
import { norm, parseTs, dateMode, resolveColumns } from '../../_lib/ticket-fields.js';

const MAX_RESULTS = 50;
const esc = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const pathOf = (h) => '$."' + String(h).replace(/["\\]/g, '') + '"';
const txt = (v) => (v === null || v === undefined) ? '' : String(v);

async function loadContext(env) {
  const cfgRows = (await env.DB.prepare('SELECT key, value FROM column_config').all()).results || [];
  const config = {};
  cfgRows.forEach(r => { config[r.key] = r.value; });
  const sample = (await env.DB.prepare('SELECT raw_json FROM tickets WHERE raw_json IS NOT NULL ORDER BY id DESC LIMIT 100').all()).results || [];
  const keys = new Set();
  sample.forEach(r => { try { Object.keys(JSON.parse(r.raw_json)).forEach(k => keys.add(k)); } catch (e) {} });
  return { config, cols: resolveColumns(Array.from(keys), config) };
}

function parseRaw(row) {
  try { return row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) { return {}; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const { config, cols } = await loadContext(env);
    const get = (raw, key) => (cols[key] ? raw[cols[key]] : null);

    // ---------- detail ----------
    const idParam = url.searchParams.get('id');
    if (idParam) {
      const row = await env.DB.prepare(
        'SELECT t.id, t.period_id, t.sub_category_raw, t.detail_sub_category, t.date_open, t.raw_json, p.label AS period_label ' +
        'FROM tickets t LEFT JOIN periods p ON p.id = t.period_id WHERE t.id = ?').bind(Number(idParam)).first();
      if (!row) return Response.json({ error: 'Tiket tidak ditemukan.' }, { status: 404 });
      const raw = parseRaw(row);
      const date = (key) => {
        let v = get(raw, key);
        if (key === 'ticket_date_open' && (v === null || v === undefined || v === '')) v = row.date_open;
        const ts = parseTs(v);
        return { header: cols[key] || null, ts, mode: dateMode(v), raw: txt(v) };
      };
      const field = (key) => ({ header: cols[key] || null, value: txt(get(raw, key)) });
      const escHeader = (config.ticketing_escalated || config.ticket_is_escalated || 'is_escalated').trim();
      return Response.json({
        rowId: row.id,
        period: row.period_label || '',
        escalated: norm(raw[escHeader]) === 'escalated',
        id: field('ticket_id').value || String(row.id),
        subject: field('ticket_subject'),
        status: field('ticket_status'),
        severity: field('ticket_severity'),
        unit: field('ticket_unit'),
        createdBy: field('ticket_created_by'),
        remarks: field('ticket_remarks'),
        feedback: field('ticket_feedback'),
        subCategory: txt(row.sub_category_raw),
        detailSubCategory: txt(row.detail_sub_category) || '',
        dates: {
          open: date('ticket_date_open'), onProgress: date('ticket_date_onprogress'), pending: date('ticket_date_pending'),
          resolved: date('ticket_date_resolved'), reopen: date('ticket_date_reopen'), closed: date('ticket_date_closed'),
          lastUpdate: date('ticket_date_lastupdate')
        },
        allColumns: Object.keys(raw).map(k => [k, txt(raw[k])])
      });
    }

    // ---------- pencarian ----------
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return Response.json({ error: 'Ketik minimal 2 karakter.' }, { status: 400 });
    const like = '%' + esc(q) + '%';

    const conds = [], binds = [];
    if (cols.ticket_id) { conds.push("lower(COALESCE(CAST(json_extract(t.raw_json, ?) AS TEXT), '')) LIKE ? ESCAPE '\\'"); binds.push(pathOf(cols.ticket_id), like); }
    else { conds.push("CAST(t.id AS TEXT) LIKE ? ESCAPE '\\'"); binds.push(like); }
    if (cols.ticket_subject) { conds.push("lower(COALESCE(CAST(json_extract(t.raw_json, ?) AS TEXT), '')) LIKE ? ESCAPE '\\'"); binds.push(pathOf(cols.ticket_subject), like); }
    const where = '(' + conds.join(' OR ') + ')';

    const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets t WHERE ' + where).bind(...binds).first()).n || 0;
    const { results } = await env.DB.prepare(
      'SELECT t.id, t.period_id, t.sub_category_raw, t.detail_sub_category, t.date_open, t.raw_json, p.label AS period_label ' +
      'FROM tickets t LEFT JOIN periods p ON p.id = t.period_id WHERE ' + where +
      ' ORDER BY t.date_open DESC, t.id DESC LIMIT ' + MAX_RESULTS).bind(...binds).all();

    const items = (results || []).map(r => {
      const raw = parseRaw(r);
      const openV = get(raw, 'ticket_date_open') ?? r.date_open;
      return {
        rowId: r.id,
        id: txt(get(raw, 'ticket_id')) || String(r.id),
        subject: txt(get(raw, 'ticket_subject')),
        status: txt(get(raw, 'ticket_status')),
        severity: txt(get(raw, 'ticket_severity')),
        subCategory: txt(r.sub_category_raw),
        period: r.period_label || '',
        openTs: parseTs(openV), openMode: dateMode(openV)
      };
    });
    return Response.json({ q, total, shown: items.length, items, columns: { id: cols.ticket_id, subject: cols.ticket_subject } });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
