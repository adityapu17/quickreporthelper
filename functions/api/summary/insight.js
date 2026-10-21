// GET /api/summary/insight?year=2026|all&month=all|0..11&produk=all|emeterai|perisai|shield
// Agregasi dari tabel `tickets` (Report Ticket yang tersimpan di DB):
//   kategori = detail_sub_category, jenis = main_category (Informasi/Keluhan/Permintaan),
//   produk = sub_category_raw, company = company, interaksi = jumlah baris tiket.
// Hasil berupa pohon siap tampil (maks 10 per level, sisanya diringkas di `more`).

const PRODUK_MATCH = { emeterai: 'emeterai', perisai: 'perisai', shield: 'perurishield' };
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (s) => String(s == null ? '' : s).trim();

function productLabel(raw) {
  const n = norm(raw);
  if (n.includes('emeterai')) return 'E-Meterai';
  if (n.includes('perisai')) return 'Perisai';
  if (n.includes('perurishield')) return 'Peruri Shield';
  return clean(raw) || '(Tanpa produk)';
}
function typeLabel(raw) {
  const n = norm(raw);
  if (n.includes('informasi')) return 'Informasi';
  if (n.includes('keluhan')) return 'Keluhan';
  if (n.includes('permintaan')) return 'Permintaan';
  return clean(raw) || 'Lainnya';
}

// levels: urutan field, mis. ['cat', 'company']. Mengembalikan { nodes, more }.
function build(rows, levels, limit) {
  const [lv, ...rest] = levels;
  const groups = new Map();
  for (const r of rows) {
    const key = String(r[lv]).toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { name: r[lv], count: 0, rows: [] }; groups.set(key, g); }
    g.count += r.n;
    g.rows.push(r);
  }
  const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
  const top = sorted.slice(0, limit);
  const rem = sorted.slice(limit);
  return {
    nodes: top.map(g => {
      const node = { name: g.name, count: g.count };
      if (rest.length) node.children = build(g.rows, rest, 10);
      return node;
    }),
    more: rem.length ? { distinct: rem.length, count: rem.reduce((n, g) => n + g.count, 0) } : null
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year') || 'all';
    const month = url.searchParams.get('month') || 'all';
    const produk = url.searchParams.get('produk') || 'all';
    if (produk !== 'all' && !PRODUK_MATCH[produk]) return Response.json({ error: 'produk tidak valid' }, { status: 400 });

    const where = [], binds = [];
    if (year !== 'all') { const y = Number(year); if (!Number.isInteger(y)) return Response.json({ error: 'year tidak valid' }, { status: 400 }); where.push('p.year = ?'); binds.push(y); }
    if (month !== 'all') { const m = Number(month); if (!Number.isInteger(m) || m < 0 || m > 11) return Response.json({ error: 'month tidak valid' }, { status: 400 }); where.push('p.month = ?'); binds.push(m); }
    if (produk !== 'all') {
      where.push("replace(replace(replace(lower(COALESCE(t.sub_category_raw,'')),'-',''),' ',''),'_','') LIKE ?");
      binds.push('%' + PRODUK_MATCH[produk] + '%');
    }
    const sql = 'SELECT t.sub_category_raw AS sub, t.main_category AS type, t.detail_sub_category AS cat, t.company AS company, COUNT(*) AS n ' +
                'FROM tickets t JOIN periods p ON p.id = t.period_id' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
                ' GROUP BY t.sub_category_raw, t.main_category, t.detail_sub_category, t.company';
    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    const rows = (results || []).map(r => ({
      product: productLabel(r.sub), type: typeLabel(r.type),
      cat: clean(r.cat) || '(Tanpa kategori)', company: clean(r.company) || '(Tanpa company)', n: Number(r.n) || 0
    }));
    const total = rows.reduce((n, r) => n + r.n, 0);

    let availableMonths = [];
    if (year !== 'all') {
      const mr = await env.DB.prepare('SELECT DISTINCT month FROM periods WHERE year = ? ORDER BY month').bind(Number(year)).all();
      availableMonths = (mr.results || []).map(x => x.month);
    }

    return Response.json({
      total, filters: { year, month, produk }, availableMonths,
      views: {
        cat: build(rows, ['cat', 'company'], 10),
        comp: build(rows, ['company', 'cat'], 10),
        type: build(rows, ['type', 'cat', 'company'], 10),
        treeCat: build(rows, ['product', 'cat', 'company'], 8),
        treeComp: build(rows, ['product', 'company', 'cat'], 8)
      }
    });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
