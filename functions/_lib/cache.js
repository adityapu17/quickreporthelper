// Cache hasil GET di Cache API (gratis, tidak memakai kuota reads D1).
// Kunci cache = URL + versi data (tabel data_version). Endpoint yang mengubah data
// memanggil bumpVersion(env), jadi cache lama otomatis tidak terpakai lagi.
// Kalau tabel data_version belum ada atau Cache API tidak tersedia, semuanya
// jatuh ke perilaku lama (tanpa cache). Cek di DevTools: header X-Cache = HIT / MISS.

export async function bumpVersion(env) {
  try { await env.DB.prepare('UPDATE data_version SET v = v + 1 WHERE id = 1').run(); } catch (e) { /* tabel belum ada: abaikan */ }
}

function out(res, tag) {
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'private, no-store'); // browser tidak boleh menyimpan; cache hanya di sisi Worker
  h.set('X-Cache', tag);
  return new Response(res.body, { status: res.status, headers: h });
}

export async function cachedJson(context, build) {
  const { request, env } = context;
  let cache, ver;
  try {
    cache = caches.default;
    const row = await env.DB.prepare('SELECT v FROM data_version WHERE id = 1').first();
    if (!row) return build();
    ver = String(row.v);
  } catch (e) { return build(); }

  const u = new URL(request.url);
  u.searchParams.sort();
  u.searchParams.set('_v', ver);
  const key = new Request(u.toString());

  try {
    const hit = await cache.match(key);
    if (hit) return out(hit, 'HIT');
  } catch (e) { /* lanjut ke build */ }

  const res = await build();
  if (res.status !== 200) return res;
  const store = new Response(res.clone().body, res);
  store.headers.set('Cache-Control', 'public, max-age=86400'); // versi di kunci yang menjamin kesegaran
  context.waitUntil(cache.put(key, store).catch(() => {}));
  return out(res, 'MISS');
}
