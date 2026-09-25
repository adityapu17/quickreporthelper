// Runs before every request. Blocks everything except the login page and a
// short allow-list of pre-login API calls, until a valid session cookie is
// present — so report data behind it can't leak to anyone unauthenticated.
async function isValidSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return false;
  const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE token = ?').bind(match[1]).first();
  if (!row) return false;
  return new Date(row.expires_at) > new Date();
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Always public: the login page itself, the login/logout calls, and the
  // "how many users exist" check the login page uses to decide whether to
  // show a normal login form or a first-run "create admin account" form.
  // Both /login.html and /login are allowed — Cloudflare Pages auto-strips
  // the .html extension from URLs, so both forms can be hit.
  if (path === '/login.html' || path === '/login' || path === '/api/login' || path === '/api/logout' || path === '/api/users-count') {
    return next();
  }

  // Bootstrap exception: allow creating the very first user account with no
  // session, but only while the users table is genuinely empty. Every
  // subsequent POST /api/users (adding more users later) requires a session
  // like everything else below.
  if (path === '/api/users' && request.method === 'POST') {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
    if (row && row.c === 0) return next();
  }

  const valid = await isValidSession(request, env);
  if (!valid) {
    if (path.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized. Silakan login.' }, { status: 401 });
    }
    return Response.redirect(url.origin + '/login', 302);
  }
  return next();
}
