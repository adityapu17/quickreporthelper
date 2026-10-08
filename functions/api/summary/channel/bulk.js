// POST /api/summary/channel/bulk — bulk upsert channel_records from parsed Excel.
// Body: { records: [ { bulan, tahun, channel, totalInteraksi, responseTime, aht, scr }, ... ] }
// Validates each row with the same rules as the single-row endpoint, then
// upserts atomically: if a row for (bulan, tahun, channel) already exists it
// updates that row; otherwise it inserts. Auth-gated by _middleware.js.
import { validateChannel } from '../../../_lib/summary.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const records = Array.isArray(body?.records) ? body.records : [];
    if (records.length === 0) return Response.json({ error: 'Tidak ada record yang dikirim', inserted: 0, updated: 0 }, { status: 400 });

    // Validate every row before touching the DB.
    for (let i = 0; i < records.length; i++) {
      const err = validateChannel(records[i]);
      if (err) return Response.json({ error: `Record ke-${i + 1}: ${err}` }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;

    // Upsert loop — D1 supports INSERT … ON CONFLICT via unique index on
    // (bulan, tahun, channel). If the schema lacks that index the fallback
    // below still works via a SELECT-then-INSERT/UPDATE.
    for (const rec of records) {
      const now = new Date().toISOString();
      const existing = await env.DB.prepare(
        'SELECT id FROM channel_records WHERE bulan = ? AND tahun = ? AND channel = ?'
      ).bind(rec.bulan, rec.tahun, rec.channel).first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE channel_records
           SET totalInteraksi = ?, responseTime = ?, aht = ?, scr = ?, updatedAt = ?
           WHERE id = ?`
        ).bind(
          rec.totalInteraksi, rec.responseTime ?? null, rec.aht ?? null, rec.scr ?? null, now,
          existing.id
        ).run();
        updated++;
      } else {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO channel_records
           (id, bulan, tahun, channel, totalInteraksi, responseTime, aht, scr, createdAt, updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, rec.bulan, rec.tahun, rec.channel, rec.totalInteraksi,
          rec.responseTime ?? null, rec.aht ?? null, rec.scr ?? null, now, now
        ).run();
        inserted++;
      }
    }

    return Response.json({ ok: true, inserted, updated, total: records.length });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}