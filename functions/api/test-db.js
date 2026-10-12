// test-db.js
// Endpoint to verify that env.DB is correctly bound and accessible.

export async function onRequest(context) {
  const { env } = context;
  try {
    // Simple SELECT query to confirm connectivity
    const row = await env.DB.prepare('SELECT 1').first();
    return Response.json({ ok: true, row });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
