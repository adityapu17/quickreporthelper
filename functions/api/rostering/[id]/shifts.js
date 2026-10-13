// GET /api/rostering/:id/shifts — list shifts for a rostering
export async function onRequestGet(context) {
  const { env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    const { results: shifts } = await env.DB.prepare(
      'SELECT id, rostering_id, agent_index, tanggal, shift_code, catatan, created_at, updated_at FROM roster_shifts WHERE rostering_id = ? ORDER BY agent_index, tanggal'
    ).bind(id).all();

    // Also fetch agent_names from rosterings
    const roster = await env.DB.prepare('SELECT agent_names FROM rosterings WHERE id = ?').bind(id).first();
    const agentNames = roster && roster.agent_names ? JSON.parse(roster.agent_names) : {};

    return Response.json({ shifts: shifts || [], agentNames });
  } catch (error) {
    return Response.json({ error: 'Gagal memuat shift: ' + error.message }, { status: 500 });
  }
}

// POST /api/rostering/:id/shifts — bulk upsert shifts + agent names
export async function onRequestPost(context) {
  const { request, env } = context;
  const { id } = context.params;

  if (!id) {
    return Response.json({ error: 'ID rostering tidak valid' }, { status: 400 });
  }

  try {
    const { shifts, agentNames } = await request.json();
    const shiftArray = Array.isArray(shifts) ? shifts : [];

    // Verify rostering exists
    const roster = await env.DB.prepare('SELECT id FROM rosterings WHERE id = ?').bind(id).first();
    if (!roster) {
      return Response.json({ error: 'Rostering tidak ditemukan' }, { status: 404 });
    }

    // Save agent names first (even if no shifts — user may have only renamed agents)
    if (agentNames && typeof agentNames === 'object') {
      await env.DB.prepare(
        'UPDATE rosterings SET agent_names = ? WHERE id = ?'
      ).bind(JSON.stringify(agentNames), id).run();
    }

    // If no shifts to save, return success after saving agent names
    if (shiftArray.length === 0) {
      return Response.json({ success: true, saved: 0, agentNamesSaved: true }, { status: 201 });
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

      if (result.meta.changes > 0) successCount++;
    }

    return Response.json({ success: true, saved: successCount }, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Gagal menyimpan shift: ' + error.message }, { status: 500 });
  }
}
