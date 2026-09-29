// /api/summary/channel — "Summary Interaction" per-channel monthly records
// (Email / Voice / WhatsApp). GET lists, POST creates. Update/delete by id
// live in channel/[id].js. Behind the same login as the rest of the app
// (see _middleware.js).
import { validateChannel } from '../../_lib/summary.js';

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT * FROM channel_records ORDER BY tahun DESC, bulan DESC'
  ).all();
  return Response.json(results || []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const err = validateChannel(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO channel_records
        (id, bulan, tahun, channel, totalInteraksi, responseTime, aht, scr, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, body.bulan, body.tahun, body.channel, body.totalInteraksi,
      body.responseTime ?? null, body.aht ?? null, body.scr ?? null, now, now
    ).run();
    return Response.json({ id, ...body, createdAt: now, updatedAt: now });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
