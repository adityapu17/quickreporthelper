// POST /api/logout — destroys the current session.
// Requires: a valid, non-expired session cookie.
// Only POST is accepted; GET/PUT/DELETE return 405 to prevent CSRF via
// simple links/images (a logout via GET would be exploitable cross-site).
export async function onRequestPost(context) {
  const { request, env } = context;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);

  const headers = new Headers({ 'Content-Type': 'application/json' });
  // Always clear the cookie regardless of session validity.
  headers.append('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');

  // Delete the session row from the database if a token was present.
  if (match) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(match[1]).run();
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
}
