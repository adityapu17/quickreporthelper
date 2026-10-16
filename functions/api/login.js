import { verifyPassword } from '../_lib/crypto.js';

// POST /api/login  body: { email, password }
// Verifies against the users table (email+password, PBKDF2-hashed) and, on
// success, creates a session row in D1 and sets an HttpOnly cookie.
//
// Rate limiting: 5 failed attempts per IP within a 15-minute window trigger
// a 15-minute lockout. Successful logins reset the counter.
const SESSION_HOURS = 12;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function onRequestPost(context) {
  const { request, env } = context;

  // Only accept POST — reject everything else with 405.
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } });
  }

  // Ensure the login_attempts table exists (idempotent; cheap on D1).
  // This doubles as the migration since production deploys via GitHub push
  // and doesn't run wrangler d1 migrations automatically.
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS login_attempts (' +
    'ip TEXT PRIMARY KEY, failed_count INTEGER DEFAULT 0, locked_until TEXT)'
  ).run();

  // --- Rate limiting -------------------------------------------------
  // Cloudflare terminates TLS and passes the real client IP.
  const ip = request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    new URL(request.url).searchParams.get('ip') ||
    'unknown';

  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT failed_count, locked_until FROM login_attempts WHERE ip = ?'
  ).bind(ip).first();

  // If locked and still in lockout window — reject immediately.
  if (row && row.locked_until) {
    const lockedUntilMs = new Date(row.locked_until).getTime();
    if (now < lockedUntilMs) {
      return Response.json({ error: 'Terlalu banyak upaya login gagal. Coba lagi nanti.' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } });
    }
    // Lockout expired — reset to a clean slate.
    await env.DB.prepare(
      'UPDATE login_attempts SET failed_count = 0, locked_until = NULL WHERE ip = ?'
    ).bind(ip).run();
  }

  const currentFails = row ? row.failed_count : 0;

  // --- Validate input ------------------------------------------------
  const body = await request.json().catch(() => ({}));
  if (!body.email || !body.password) {
    return Response.json({ error: 'Email dan password wajib diisi.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const user = await env.DB.prepare('SELECT id, email, password_hash, salt FROM users WHERE email = ?')
    .bind(email).first();

  // Always run verifyPassword to keep timing consistent (avoid user enumeration).
  const expectedSalt = user ? user.salt : '00'.repeat(16);
  const expectedHash = user ? user.password_hash : '00'.repeat(32);
  const ok = await verifyPassword(body.password, expectedSalt, expectedHash);

  if (!user || !ok) {
    // --- Record failed attempt ---------------------------------------
    const fails = currentFails + 1;
    const newLockedUntil = fails >= MAX_ATTEMPTS
      ? new Date(now + LOCKOUT_MS).toISOString()
      : null;

    await env.DB.prepare(
      'INSERT INTO login_attempts (ip, failed_count, locked_until) VALUES (?, ?, ?) ' +
      'ON CONFLICT(ip) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until'
    ).bind(ip, fails, newLockedUntil).run();

    // Same error message & timing regardless of whether the user exists,
    // to avoid user-enumeration via response differences.
    return Response.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  // --- Success: reset rate-limit counter & create session ------------
  await env.DB.prepare(
    'INSERT INTO login_attempts (ip, failed_count, locked_until) VALUES (?, 0, NULL) ' +
    'ON CONFLICT(ip) DO UPDATE SET failed_count = 0, locked_until = NULL'
  ).bind(ip).run();

  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, user_email, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.email, expiresAt).run();

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
  return new Response(JSON.stringify({ ok: true, email: user.email }), { headers });
}