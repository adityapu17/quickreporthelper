import { validateChannel } from '../../../_lib/summary.js';

// PUT /api/summary/channel/:id, DELETE /api/summary/channel/:id
export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const body = await request.json();
    const err = validateChannel(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      `UPDATE channel_records
       SET bulan=?, tahun=?, channel=?, totalInteraksi=?, responseTime=?, aht=?, scr=?, updatedAt=?
       WHERE id=?`
    ).bind(
      body.bulan, body.tahun, body.channel, body.totalInteraksi,
      body.responseTime ?? null, body.aht ?? null, body.scr ?? null, now, params.id
    ).run();
    if (res.meta && res.meta.changes === 0) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  await env.DB.prepare('DELETE FROM channel_records WHERE id=?').bind(params.id).run();
  return Response.json({ ok: true });
}
