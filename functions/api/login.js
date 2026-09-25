import { verifyPassword } from '../_lib/crypto.js';

// POST /api/login  body: { email, password }
// Verifies against the users table (email+password, PBKDF2-hashed) and, on
// success, creates a session row in D1 and sets an HttpOnly cookie.
const SESSION_HOURS = 12;

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  if (!body.email || !body.password) {
    return Response.json({ error: 'Email dan password wajib diisi.' }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const user = await env.DB.prepare('SELECT id, email, password_hash, salt FROM users WHERE email = ?')
    .bind(email).first();
  if (!user) {
    return Response.json({ error: 'Email atau password salah.' }, { status: 401 });
  }
  const ok = await verifyPassword(body.password, user.salt, user.password_hash);
  if (!ok) {
    return Response.json({ error: 'Email atau password salah.' }, { status: 401 });
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, user_email, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.email, expiresAt).run();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
  return new Response(JSON.stringify({ ok: true, email: user.email }), { headers });
}
