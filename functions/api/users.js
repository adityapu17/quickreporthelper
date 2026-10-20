import { hashPassword } from '../_lib/crypto.js';
import { ensureRoleColumn } from '../_lib/roles.js';

// GET /api/users — list users (requires session; enforced by _middleware.js
// since this path isn't in its exemption list).
export async function onRequestGet(context) {
  const { env } = context;
  await ensureRoleColumn(env);
  const { results } = await env.DB.prepare(
    'SELECT id, email, role, created_at FROM users ORDER BY created_at ASC'
  ).all();
  return Response.json(results || []);
}

// POST /api/users  body: { email, password }
// Normally requires a session too — EXCEPT when the users table is still
// empty, in which case _middleware.js lets this one request through so the
// very first admin account can be created without a chicken-and-egg login.
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    await ensureRoleColumn(env);
    const { email, password, role } = await request.json();
    const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
    const bootstrap = !!(countRow && countRow.c === 0);
    if (!bootstrap && !(context.data && context.data.role === 'admin')) {
      return Response.json({ error: 'Hanya admin yang bisa menambah user.' }, { status: 403 });
    }
    if (role !== undefined && role !== 'admin' && role !== 'user') {
      return Response.json({ error: 'Role harus admin atau user.' }, { status: 400 });
    }
    const newRole = bootstrap ? 'admin' : (role || 'user');
    if (!email || !password || password.length < 6) {
      return Response.json({ error: 'Email wajib diisi dan password minimal 6 karakter.' }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalizedEmail).first();
    if (existing) {
      return Response.json({ error: 'Email sudah terdaftar.' }, { status: 409 });
    }
    const { hash, salt } = await hashPassword(password);
    const res = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, salt, role) VALUES (?, ?, ?, ?)'
    ).bind(normalizedEmail, hash, salt, newRole).run();
    return Response.json({ ok: true, id: res.meta.last_row_id, email: normalizedEmail, role: newRole });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
