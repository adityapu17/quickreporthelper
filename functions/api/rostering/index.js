// GET /api/rostering — list saved rosterings
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT id, bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama, created_at FROM rosterings ORDER BY tahun DESC, bulan DESC'
  ).all();
  return Response.json(results || []);
}

// POST /api/rostering — create or upsert a rostering (handles duplicate bulan/tahun)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama } = await request.json();

    if (!bulan || !tahun || !jumlah_karyawan) {
      return Response.json({ error: 'Bulan, tahun, dan jumlah karyawan wajib diisi' }, { status: 400 });
    }

    // Upsert: insert or replace on unique (bulan, tahun)
    const res = await env.DB.prepare(
      'INSERT INTO rosterings (bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(bulan, tahun) DO UPDATE SET jumlah_karyawan = excluded.jumlah_karyawan, hari_libur_nasional = excluded.hari_libur_nasional, cuti_bersama = excluded.cuti_bersama'
    ).bind(bulan, tahun, jumlah_karyawan, hari_libur_nasional || 0, cuti_bersama || 0).run();

    // Get the id (either new or existing)
    let rosterId = res.meta.last_row_id;
    if (!rosterId) {
      // If no last_row_id (upsert updated existing), fetch the id
      const existing = await env.DB.prepare(
        'SELECT id FROM rosterings WHERE bulan = ? AND tahun = ?'
      ).bind(bulan, tahun).first();
      if (existing) rosterId = existing.id;
    }

    return Response.json({ id: rosterId, success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Gagal menyimpan rostering: ' + error.message }, { status: 500 });
  }
}