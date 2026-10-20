// POST /api/ticketing/resolved
// body: { ticketRowId: <tickets.id>, value: "<tanggal>" }
// Menulis date resolved ke raw_json baris tiket itu (header diambil dari
// Konfigurasi Kolom `ticket_date_resolved`, default auto-detect / date_resolved).
// `value` harus dikirim dalam format yang sama dengan date open tiket
// (ISO UTC atau "YYYY-MM-DD HH:mm:ss") — dihitung di sisi klien.

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const RESOLVED_CANDIDATES = ['dateresolved', 'resolveddate', 'dateresolve', 'tglresolved'];
const OPEN_CANDIDATES = ['dateopen'];

function parseTs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return (!isFinite(v) || v < 20000) ? null : Math.round((v - 25569) * 86400000);
  const s = String(v).trim();
  if (!s || s === '-') return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function pickKey(raw, override, candidates) {
  const keys = Object.keys(raw);
  if (override) {
    const hit = keys.find(k => norm(k) === norm(override));
    if (hit) return hit;
  }
  return keys.find(k => candidates.includes(norm(k))) || null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const rowId = Number(body.ticketRowId);
    const value = String(body.value == null ? '' : body.value).trim();
    if (!Number.isInteger(rowId) || rowId <= 0) return Response.json({ error: 'ticketRowId tidak valid.' }, { status: 400 });
    const newTs = parseTs(value);
    if (newTs === null) return Response.json({ error: 'Format tanggal tidak valid.' }, { status: 400 });

    const row = await env.DB.prepare('SELECT id, date_open, raw_json FROM tickets WHERE id = ?').bind(rowId).first();
    if (!row) return Response.json({ error: 'Tiket tidak ditemukan.' }, { status: 404 });

    let raw = {};
    try { raw = row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) { raw = {}; }

    const cfgRows = (await env.DB.prepare('SELECT key, value FROM column_config').all()).results || [];
    const config = {};
    cfgRows.forEach(r => { config[r.key] = r.value; });

    const openKey = pickKey(raw, config.ticket_date_open, OPEN_CANDIDATES);
    const openTs = parseTs(openKey ? raw[openKey] : null) ?? parseTs(row.date_open);
    if (openTs === null) return Response.json({ error: 'Date open tiket kosong, tidak bisa divalidasi.' }, { status: 400 });
    if (newTs < openTs) return Response.json({ error: 'Date resolved tidak boleh lebih awal dari date open.' }, { status: 400 });

    const header = (pickKey(raw, config.ticket_date_resolved, RESOLVED_CANDIDATES) || config.ticket_date_resolved || 'date_resolved')
      .replace(/["\\]/g, '');
    const path = '$."' + header + '"';
    await env.DB.prepare('UPDATE tickets SET raw_json = json_set(raw_json, ?, ?) WHERE id = ?').bind(path, value, rowId).run();

    return Response.json({ ok: true, header, value });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
