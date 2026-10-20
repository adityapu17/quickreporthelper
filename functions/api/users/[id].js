import { ensureRoleColumn } from '../../_lib/roles.js';

// DELETE /api/users/:id — requires session (enforced by middleware).
// Refuses to delete the last remaining user so nobody locks everyone out.
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = Number(params.id);
  const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
  if (countRow && countRow.c <= 1) {
    return Response.json({ error: 'Tidak bisa menghapus user terakhir.' }, { status: 400 });
  }
  await ensureRoleColumn(env);
  if (!(context.data && context.data.role === 'admin')) {
    return Response.json({ error: 'Hanya admin yang bisa menghapus user.' }, { status: 403 });
  }
  const existing = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });
  if (existing.role === 'admin') {
    const adm = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").first();
    if (adm && adm.c <= 1) return Response.json({ error: 'Tidak bisa menghapus admin terakhir.' }, { status: 400 });
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}
