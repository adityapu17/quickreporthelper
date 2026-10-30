// Runs before every request. Blocks everything except the login page and a
// short allow-list of pre-login API calls, until a valid session cookie is
// present — so report data behind it can't leak to anyone unauthenticated.
//
// Also enforces security headers (CSP, HSTS, X-Frame-Options, etc.) on every
// response, including Cloudflare Pages Function responses (the `public/_headers`
// file only covers static assets).

import { ensureRoleColumn, normRole } from './_lib/roles.js';

// Security headers applied to every response.
const SECURITY_HEADERS = {
  // CSP: same-origin + trusted CDNs for Chart.js, xlsx (loaded via
  // <script src> from cdnjs.cloudflare.com / cdn.jsdelivr.net).
  // 'unsafe-inline' on style-src AND script-src keeps inline <style>/<script>
  // blocks working (login.html etc. use inline scripts).
  // TODO: migrate inline scripts to external .js files to restore strict CSP
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: blob:; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  // Restrict CORS to same origin (no cross-origin API abuse).
  'Access-Control-Allow-Origin': 'https://quickreporthelper.pages.dev',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Returns { email, role } for a valid session, otherwise null.
async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  await ensureRoleColumn(env);
  const row = await env.DB.prepare(
    'SELECT s.user_email AS email, s.expires_at AS expires_at, u.role AS role ' +
    'FROM sessions s LEFT JOIN users u ON u.email = s.user_email WHERE s.token = ?'
  ).bind(match[1]).first();
  if (!row) return null;
  if (!(new Date(row.expires_at) > new Date())) return null;
  // User yang sudah dihapus (role null) diperlakukan view-only.
  return { email: row.email, role: row.role ? normRole(row.role) : 'user' };
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight for API routes.
  if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': SECURITY_HEADERS['Access-Control-Allow-Origin'],
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        ...SECURITY_HEADERS,
      },
    });
  }

  // Always public: the login page itself, the login/logout calls, and the
  // "how many users exist" check the login page uses to decide whether to
  // show a normal login form or a first-run "create admin account" form.
  // Both /login.html and /login are allowed — Cloudflare Pages auto-strips
  // the .html extension from URLs, so both forms can be hit.
  if (path === '/login.html' || path === '/login' || path === '/api/login' || path === '/api/logout' || path === '/api/users-count') {
    const response = await next();
    return applySecurityHeaders(response);
  }

  // Allow static assets (images, stylesheets, scripts)
  if (/\.(jpg|jpeg|png|gif|svg|ico|css|js|webp)$/i.test(path)) {
    const response = await next();
    return applySecurityHeaders(response);
  }

  // Bootstrap exception: allow creating the very first user account with no
  // session, but only while the users table is genuinely empty. Every
  // subsequent POST /api/users (adding more users later) requires a session
  // like everything else below.
  if (path === '/api/users' && request.method === 'POST') {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
    if (row && row.c === 0) {
      const response = await next();
      return applySecurityHeaders(response);
    }
    // Table not empty — fall through to session check below.
  }

  const session = await getSession(request, env);
  if (!session) {
    if (path.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized. Silakan login.' }, { status: 401, headers: SECURITY_HEADERS });
    }
    return Response.redirect(url.origin + '/login', 302);
  }

  // Role 'user' = view only: semua request tulis ke API (POST/PUT/PATCH/DELETE) ditolak.
  const method = request.method.toUpperCase();
  if (path.startsWith('/api/') && method !== 'GET' && method !== 'HEAD' && session.role !== 'admin') {
    return Response.json(
      { error: 'Akses ditolak: role "user" hanya bisa melihat data (view only). Hubungi admin.' },
      { status: 403, headers: SECURITY_HEADERS }
    );
  }
  context.data.email = session.email;
  context.data.role = session.role;

  const response = await next();
  return applySecurityHeaders(response);
}

// Clone the response and attach security headers without buffering the body.
function applySecurityHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Don't override a Set-Cookie or Content-Type that the Function set.
    if (!['set-cookie', 'content-type'].includes(key.toLowerCase())) {
      newHeaders.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
