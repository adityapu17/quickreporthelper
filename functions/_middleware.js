// Runs before every request. Blocks everything except the login page and a
// short allow-list of pre-login API calls, until a valid session cookie is
// present — so report data behind it can't leak to anyone unauthenticated.
//
// Also enforces security headers (CSP, HSTS, X-Frame-Options, etc.) on every
// response, including Cloudflare Pages Function responses (the `public/_headers`
// file only covers static assets).

// Security headers applied to every response.
const SECURITY_HEADERS = {
  // Tight CSP: same-origin only. 'unsafe-inline' on style-src keeps inline
  // <style> blocks working (used by login.html etc.). script-src is 'self'
  // only — inline scripts are blocked until migrated to external files.
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  // Restrict CORS to same origin (no cross-origin API abuse).
  'Access-Control-Allow-Origin': 'https://quickreporthelper.pages.dev',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

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

  const valid = await isValidSession(request, env);
  if (!valid) {
    if (path.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized. Silakan login.' }, { status: 401, headers: SECURITY_HEADERS });
    }
    return Response.redirect(url.origin + '/login', 302);
  }

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
