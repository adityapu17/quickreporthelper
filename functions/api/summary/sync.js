// POST /api/summary/sync - "Sync with DB" di halaman Summary Interaction.
// Menghitung ulang data Summary dari semua bulan yang pernah diupload ke DB
// (tabel periods / tickets / response_gaps / voice_records) lalu menulisnya ke
// channel_records dan produk_records. Rumus sama dengan halaman Monthly:
//   - Email / WhatsApp / Manual : Total Interaksi = jumlah tiket channel itu;
//                                  Response Time = rata-rata gap_min bulan itu
//   - Voice : Total Interaksi = Call Offered (voice_records bulan itu; kalau
//             tidak ada, jumlah tiket voice); AHT = rata-rata talktime (menit)
//             tanpa ABANDON; SCR = (offered - abandoned) / offered * 100
//   - Produk: Perisai = tiket kategori Digital Sign, E-Meterai = kategori E-Meterai
// Nilai yang tidak bisa dihitung (null) TIDAK menimpa nilai lama yang sudah ada.
// Bulan pada tanggal gap/voice dibaca dalam WIB (UTC+7), sama seperti browser.
// Hanya admin (middleware menolak POST untuk role user).

const r2 = (n) => (n == null || !isFinite(n)) ? null : Math.round(n * 100) / 100;

export async function onRequestPost(context) {
  const { env } = context;
  try {
    const all = (sql) => env.DB.prepare(sql).all().then(r => r.results || []);
    // periods.month disimpan 0..11 (getMonth JS, Januari = 0); channel_records/produk_records.bulan memakai 1..12.
    const monthOk = (col, p) => `strftime('%Y-%m', datetime(${col}, '+7 hours')) = printf('%04d-%02d', ${p}.year, ${p}.month + 1)`;

    const [periods, chanCounts, catCounts, gaps, voice] = await Promise.all([
      all('SELECT id, year, month FROM periods ORDER BY year, month'),
      all('SELECT period_id, LOWER(channel) AS channel, COUNT(*) AS c FROM tickets GROUP BY period_id, LOWER(channel)'),
      all('SELECT period_id, category, COUNT(*) AS c FROM tickets GROUP BY period_id, category'),
      all(`SELECT g.period_id, LOWER(g.channel) AS channel, AVG(g.gap_min) AS avg
           FROM response_gaps g JOIN periods p ON p.id = g.period_id
           WHERE g.gap_date IS NOT NULL AND ${monthOk('g.gap_date', 'p')}
           GROUP BY g.period_id, LOWER(g.channel)`),
      all(`SELECT v.period_id, COUNT(*) AS offered,
                  SUM(CASE WHEN v.event = 'ABANDON' THEN 1 ELSE 0 END) AS abandoned,
                  AVG(CASE WHEN v.event <> 'ABANDON' AND v.talktime_min > 0 THEN v.talktime_min END) AS aht
           FROM voice_records v JOIN periods p ON p.id = v.period_id
           WHERE v.call_date IS NULL OR ${monthOk('v.call_date', 'p')}
           GROUP BY v.period_id`)
    ]);

    const chanBy = {}, catBy = {}, gapBy = {}, voiceBy = {};
    chanCounts.forEach(r => { (chanBy[r.period_id] ||= {})[r.channel] = r.c; });
    catCounts.forEach(r => { (catBy[r.period_id] ||= {})[r.category] = r.c; });
    gaps.forEach(r => { (gapBy[r.period_id] ||= {})[r.channel] = r.avg; });
    voice.forEach(r => { voiceBy[r.period_id] = r; });

    const now = new Date().toISOString();
    const stmts = [
      // Sisa sync versi lama yang salah menulis bulan 0-based: bulan 0 tidak valid.
      env.DB.prepare('DELETE FROM channel_records WHERE bulan = 0'),
      env.DB.prepare('DELETE FROM produk_records WHERE bulan = 0')
    ];
    let channelRows = 0, produkRows = 0;

    const upsertChannel = (p, channel, total, rt, aht, scr) => {
      // Tanpa ON CONFLICT: tabel di produksi bisa saja tidak punya UNIQUE(bulan, tahun, channel).
      // UPDATE dulu (nilai null tidak menimpa nilai lama), INSERT hanya kalau barisnya belum ada.
      stmts.push(env.DB.prepare(
        `UPDATE channel_records SET totalInteraksi = ?,
           responseTime = COALESCE(?, responseTime), aht = COALESCE(?, aht), scr = COALESCE(?, scr), updatedAt = ?
         WHERE bulan = ? AND tahun = ? AND channel = ?`
      ).bind(total, r2(rt), r2(aht), r2(scr), now, p.month + 1, p.year, channel));
      stmts.push(env.DB.prepare(
        `INSERT INTO channel_records (id, bulan, tahun, channel, totalInteraksi, responseTime, aht, scr, createdAt, updatedAt)
         SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM channel_records WHERE bulan = ? AND tahun = ? AND channel = ?)`
      ).bind(crypto.randomUUID(), p.month + 1, p.year, channel, total, r2(rt), r2(aht), r2(scr), now, now, p.month + 1, p.year, channel));
      channelRows++;
    };
    const upsertProduk = (p, produk, total) => {
      // produk_records tidak punya UNIQUE: UPDATE dulu, INSERT hanya kalau belum ada baris.
      stmts.push(env.DB.prepare(
        'UPDATE produk_records SET totalInteraksi = ?, updatedAt = ? WHERE bulan = ? AND tahun = ? AND produk = ?'
      ).bind(total, now, p.month + 1, p.year, produk));
      stmts.push(env.DB.prepare(
        `INSERT INTO produk_records (id, bulan, tahun, produk, totalInteraksi, createdAt, updatedAt)
         SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM produk_records WHERE bulan = ? AND tahun = ? AND produk = ?)`
      ).bind(crypto.randomUUID(), p.month + 1, p.year, produk, total, now, now, p.month + 1, p.year, produk));
      produkRows++;
    };

    for (const p of periods) {
      const ch = chanBy[p.id] || {}, cat = catBy[p.id] || {}, gp = gapBy[p.id] || {}, vo = voiceBy[p.id];
      if (ch.email) upsertChannel(p, 'Email', ch.email, gp.email, null, null);
      if (ch.whatsapp) upsertChannel(p, 'WhatsApp', ch.whatsapp, gp.whatsapp, null, null);
      if (ch.manual) upsertChannel(p, 'Manual', ch.manual, null, null, null);
      if (vo && vo.offered > 0) {
        upsertChannel(p, 'Voice', vo.offered, null, vo.aht, ((vo.offered - vo.abandoned) / vo.offered) * 100);
      } else if (ch.voice) {
        upsertChannel(p, 'Voice', ch.voice, null, null, null);
      }
      const hasTickets = Object.values(ch).some(n => n > 0);
      if (hasTickets) {
        upsertProduk(p, 'Perisai', cat['Digital Sign'] || 0);
        upsertProduk(p, 'E-Meterai', cat['E-Meterai'] || 0);
      }
    }

    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return Response.json({ ok: true, periods: periods.length, channelRows, produkRows });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
