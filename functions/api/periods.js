// GET /api/periods — list saved periods (used by both the main app and the
// "Kelola Database" page). Saving is now done via init -> chunk -> finalize
// (see periods/init.js, periods/chunk.js, periods/finalize.js) so the
// frontend can show real upload progress.
export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT id, year, month, label, row_count, uploaded_at FROM periods ORDER BY year DESC, month DESC'
  ).all();
  return Response.json(results || []);
}
