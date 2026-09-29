// /api/summary/produk — "Summary Interaction" per-product monthly records
// (Perisai / E-Meterai). Update/delete by id live in produk/[id].js.
import { validateProduk } from '../../_lib/summary.js';

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT * FROM produk_records ORDER BY tahun DESC, bulan DESC'
  ).all();
  return Response.json(results || []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const err = validateProduk(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO produk_records (id, bulan, tahun, produk, totalInteraksi, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(id, body.bulan, body.tahun, body.produk, body.totalInteraksi, now, now).run();
    return Response.json({ id, ...body, createdAt: now, updatedAt: now });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
