// GET /api/rostering/:id/shifts — list shifts for a rostering
export async function onRequestGet(context) {
  const { env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT id, rostering_id, agent_index, tanggal, shift_code, catatan, created_at, updated_at FROM roster_shifts WHERE rostering_id = ? ORDER BY agent_index, tanggal'
    ).bind(id).all();

    return Response.json(results || []);
  } catch (error) {
    return Response.json({ error: 'Gagal memuat shift: ' + error.message }, { status: 500 });
  }
}

// POST /api/rostering/:id/shifts — bulk upsert shifts
export async function onRequestPost(context) {
  const { request, env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    const { shifts } = await request.json();

    if (!Array.isArray(shifts) || shifts.length === 0) {
      return Response.json({ error: 'Data shift kosong atau tidak valid' }, { status: 400 });
    }

    // Verify rostering exists
    const roster = await env.DB.prepare('SELECT id FROM rosterings WHERE id = ?').bind(id).first();
    if (!roster) {
      return Response.json({ error: 'Rostering tidak ditemukan' }, { status: 404 });
    }

    const stmt = env.DB.prepare(
      'INSERT INTO roster_shifts (rostering_id, agent_index, tanggal, shift_code, catatan) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(rostering_id, agent_index, tanggal) DO UPDATE SET shift_code = excluded.shift_code, catatan = excluded.catatan, updated_at = datetime(\'now\')'
    );

    let successCount = 0;
    for (const shift of shifts) {
      if (!shift.agent_index || !shift.tanggal || !shift.shift_code) continue;

      const result = await stmt.bind(
        id,
        shift.agent_index,
        shift.tanggal,
        shift.shift_code,
        shift.catatan || null
      ).run();

      if (result.changes > 0) successCount++;
    }

    return Response.json({ success: true, saved: successCount }, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Gagal menyimpan shift: ' + error.message }, { status: 500 });
  }
}