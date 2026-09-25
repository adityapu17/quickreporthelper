// GET /api/me — requires session (enforced by middleware). Returns the
// logged-in user's email so the frontend can show "who's logged in".
export async function onRequestGet(context) {
  const { request, env } = context;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const row = await env.DB.prepare('SELECT user_email, expires_at FROM sessions WHERE token = ?')
    .bind(match[1]).first();
  if (!row || new Date(row.expires_at) <= new Date()) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return Response.json({ email: row.user_email });
}
