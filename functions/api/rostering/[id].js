// GET /api/rostering/[id] — get a specific rostering
export async function onRequestGet(context) {
  const { env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    'SELECT id, bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama, created_at FROM rosterings WHERE id = ?'
  ).bind(id).all();

  if (!results || results.length === 0) {
    return Response.json({ error: 'Rostering tidak ditemukan' }, { status: 404 });
  }

  return Response.json(results[0]);
}

// PUT /api/rostering/[id] — update a specific rostering
export async function onRequestPut(context) {
  const { request, env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    const { bulan, tahun, jumlah_karyawan, hari_libur_nasional, cuti_bersama } = await request.json();

    if (!bulan || !tahun || !jumlah_karyawan) {
      return Response.json({ error: 'Bulan, tahun, dan jumlah karyawan wajib diisi' }, { status: 400 });
    }

    const res = await env.DB.prepare(
      'UPDATE rosterings SET bulan = ?, tahun = ?, jumlah_karyawan = ?, hari_libur_nasional = ?, cuti_bersama = ? WHERE id = ?'
    ).bind(bulan, tahun, jumlah_karyawan, hari_libur_nasional || 0, cuti_bersama || 0, id).run();

    if (res.meta.changes === 0) {
      return Response.json({ error: 'Rostering tidak ditemukan atau tidak ada perubahan' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Gagal memperbarui rostering: ' + error.message }, { status: 500 });
  }
}

// DELETE /api/rostering/[id] — delete a specific rostering (and its shifts)
export async function onRequestDelete(context) {
  const { env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    // First delete shifts (FK constraint would fail otherwise)
    await env.DB.prepare(
      'DELETE FROM roster_shifts WHERE rostering_id = ?'
    ).bind(id).run();

    const res = await env.DB.prepare(
      'DELETE FROM rosterings WHERE id = ?'
    ).bind(id).run();

    if (res.meta.changes === 0) {
      return Response.json({ error: 'Rostering tidak ditemukan' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Gagal menghapus rostering: ' + error.message }, { status: 500 });
  }
}