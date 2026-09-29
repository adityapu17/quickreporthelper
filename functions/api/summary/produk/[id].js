import { validateProduk } from '../../../_lib/summary.js';

// PUT /api/summary/produk/:id, DELETE /api/summary/produk/:id
export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const body = await request.json();
    const err = validateProduk(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      'UPDATE produk_records SET bulan=?, tahun=?, produk=?, totalInteraksi=?, updatedAt=? WHERE id=?'
    ).bind(body.bulan, body.tahun, body.produk, body.totalInteraksi, now, params.id).run();
    if (res.meta && res.meta.changes === 0) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  await env.DB.prepare('DELETE FROM produk_records WHERE id=?').bind(params.id).run();
  return Response.json({ ok: true });
}
