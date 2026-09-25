// GET /api/users-count — always public (no session required). Used by
// login.html to decide whether to show "create first admin account" or the
// normal login form. Only exposes a count, nothing sensitive.
export async function onRequestGet(context) {
  const { env } = context;
  const row = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
  return Response.json({ count: row ? row.c : 0 });
}
