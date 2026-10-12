// GET /api/rostering — list saved rosterings
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT id, bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama, created_at FROM rosterings ORDER BY tahun DESC, bulan DESC'
  ).all();
  return Response.json(results || []);
}

// POST /api/rostering — create a new rostering
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama } = await request.json();

    if (!bulan || !tahun || !jumlah_karyawan) {
      return Response.json({ error: 'Bulan, tahun, dan jumlah karyawan wajib diisi' }, { status: 400 });
    }

    const res = await env.DB.prepare(
      'INSERT INTO rosterings (bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama) VALUES (?, ?, ?, ?, ?)'
    ).bind(bulan, tahun, jumlah_karyawan, hari_libur_nasional || 0, cuti_bersama || 0).run();

    return Response.json({ id: res.meta.last_row_id, success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Gagal menyimpan rostering: ' + error.message }, { status: 500 });
  }
}