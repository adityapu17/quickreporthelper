// Role pengguna: 'admin' (boleh tulis/ubah data) dan 'user' (view only).
// Kolom `users.role` dibuat otomatis kalau belum ada. User yang sudah ada
// sebelum fitur role otomatis menjadi 'admin' supaya tidak ada yang terkunci.
let roleReady = null;

export function ensureRoleColumn(env) {
  if (!roleReady) {
    roleReady = (async () => {
      const info = await env.DB.prepare('PRAGMA table_info(users)').all();
      const has = (info.results || []).some(c => c.name === 'role');
      if (has) return;
      try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'").run();
      } catch (e) {
        if (!/duplicate column/i.test(String(e && e.message))) throw e; // isolate lain sudah menambahkan
      }
    })().catch(e => { roleReady = null; throw e; });
  }
  return roleReady;
}

export const normRole = (r) => (r === 'user' ? 'user' : 'admin');
