// GET /api/ticketing?periods=2026-8,2026-9   (format year-month, month 0-based
// seperti di tabel `periods`) atau ?periods=all untuk seluruh data.
//
// Hanya tiket escalated (tickets.escalated = 1). Kolom severity / status /
// date_pending / date_resolved / date_closed tidak punya kolom sendiri di
// tabel `tickets`, jadi dibaca dari raw_json (baris asli Excel). Nama header
// bisa di-override lewat Konfigurasi Kolom (column_config), kalau tidak diisi
// akan auto-detect dari daftar kandidat di bawah.

const SUBS = [
  { key: 'emeterai', label: 'E-Meterai',        match: 'emeterai' },
  { key: 'perisai',  label: 'Perisai',          match: 'perisai' },
  { key: 'shield',   label: 'Peruri Shield',    match: 'perurishield' },
  { key: 'event',    label: 'Event Management', match: 'eventmanagement' }
];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const TARGET_HOURS = { Critical: 8, High: 12, Medium: 24, Low: 48 };

// key config -> kandidat nama header (dinormalisasi: huruf kecil, tanpa simbol)
const FIELD_CANDIDATES = {
  ticket_id:          ['ticketid', 'idticket', 'noticket', 'ticketno', 'ticketnumber', 'id'],
  ticket_severity:    ['severity', 'ticketseverity', 'severitylevel', 'priority', 'prioritas'],
  ticket_status:      ['status', 'ticketstatus', 'statusticket', 'ticketstatusname'],
  ticket_date_open:   ['dateopen'],
  ticket_date_pending:['datepending', 'pendingdate', 'datependingticket', 'tglpending'],
  ticket_date_resolved:['dateresolved', 'resolveddate', 'dateresolve', 'tglresolved'],
  ticket_date_closed: ['dateclosed', 'dateclose', 'closeddate', 'tglclosed'],
  ticket_date_lastupdate: ['datelastupdate', 'lastupdate', 'lastupdated', 'dateupdate', 'dateupdated', 'updatedat', 'tglupdate'],
  ticket_unit:        ['unit', 'posisi', 'position', 'currentunit', 'currentposition', 'unitposisi', 'posisiunit', 'posisitiket', 'assignedunit', 'unitkerja', 'unitname'],
  ticket_company:     ['ticketcompanyname', 'companyname', 'company', 'namaperusahaan', 'perusahaan', 'customercompany'],
  ticket_subject:     ['subject', 'ticketsubject', 'title', 'judul', 'summary', 'description']
};

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

function parseTs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!isFinite(v) || v < 20000) return null;
    return Math.round((v - 25569) * 86400000); // Excel serial
  }
  const s = String(v).trim();
  if (!s || s === '-') return null;
  // "2026-09-01 08:04:32" / "2026-09-01T08:04:32" tanpa zona -> dianggap UTC
  // supaya konsisten dengan pasangan tanggal lain dari baris yang sama.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // "01/09/2026 08:04(:32)" (dd/mm/yyyy)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(s); // ISO dengan Z / offset
  return isNaN(t) ? null : t;
}

function normSeverity(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  if (!s) return null;
  if (s.includes('crit')) return 'Critical';
  if (s.includes('high')) return 'High';
  if (s.includes('med')) return 'Medium';
  if (s.includes('low')) return 'Low';
  return null;
}

function statusGroup(v) {
  const n = norm(v);
  if (!n) return 'Lainnya';
  if (n.includes('reopen')) return 'Reopen';
  if (n.includes('pending')) return 'Pending';
  if (n.includes('progress')) return 'On Progress';
  if (n.includes('open')) return 'Open';
  return 'Lainnya';
}

function subKeyOf(raw) {
  const n = norm(raw);
  if (!n) return null;
  const hit = SUBS.find(s => n.includes(s.match));
  return hit ? hit.key : null;
}

// Cari header di baris raw: override dari config dulu, lalu kandidat.
function makeResolver(sampleKeys, config) {
  const byNorm = {};
  sampleKeys.forEach(k => { if (!(norm(k) in byNorm)) byNorm[norm(k)] = k; });
  const resolved = {};
  Object.keys(FIELD_CANDIDATES).forEach(cfgKey => {
    const override = config[cfgKey];
    let found = null;
    if (override && byNorm[norm(override)]) found = byNorm[norm(override)];
    if (!found) {
      for (const c of FIELD_CANDIDATES[cfgKey]) {
        if (byNorm[c]) { found = byNorm[c]; break; }
      }
    }
    resolved[cfgKey] = found; // nama header asli atau null
  });
  return resolved;
}

const emptySev = () => ({ Critical: 0, High: 0, Medium: 0, Low: 0, Lainnya: 0 });

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const periodsParam = (url.searchParams.get('periods') || '').trim();
    if (!periodsParam) return Response.json({ error: 'Parameter periods wajib (mis. 2026-8,2026-9 atau all).' }, { status: 400 });

    // --- periode terpilih ---
    const allPeriods = (await env.DB.prepare('SELECT id, year, month, label FROM periods ORDER BY year DESC, month DESC').all()).results || [];
    let chosen;
    if (periodsParam === 'all') {
      chosen = allPeriods;
    } else {
      const wanted = new Set(periodsParam.split(',').map(s => s.trim()).filter(Boolean));
      chosen = allPeriods.filter(p => wanted.has(p.year + '-' + p.month));
    }
    if (!chosen.length) return Response.json({ error: 'Periode tidak ditemukan.' }, { status: 404 });

    // --- config override kolom ---
    const cfgRows = (await env.DB.prepare('SELECT key, value FROM column_config').all()).results || [];
    const config = {};
    cfgRows.forEach(r => { config[r.key] = r.value; });

    // --- tiket escalated: kolom escalated bisa diatur di Setting ---
    const escHeader = (config.ticketing_escalated || config.ticket_is_escalated || 'is_escalated').trim();
    const escPath = '$."' + escHeader.replace(/["\\]/g, '') + '"';
    const ids = chosen.map(p => p.id);
    const fetchTickets = async (where, extraBind) => {
      const out = [];
      for (let i = 0; i < ids.length; i += 80) {
        const part = ids.slice(i, i + 80);
        const sql = 'SELECT id, period_id, sub_category_raw, detail_sub_category, date_open, raw_json FROM tickets WHERE ' + where +
                    ' AND period_id IN (' + part.map(() => '?').join(',') + ')';
        const { results } = await env.DB.prepare(sql).bind(...extraBind, ...part).all();
        (results || []).forEach(r => out.push(r));
      }
      return out;
    };
    let tickets = await fetchTickets("lower(trim(COALESCE(json_extract(raw_json, ?), ''))) = 'escalated'", [escPath]);
    let escalatedSource = 'raw';
    if (!tickets.length) {
      // header tidak ketemu di raw_json -> pakai flag yang disimpan saat upload
      tickets = await fetchTickets('escalated = 1', []);
      if (tickets.length) escalatedSource = 'fallback';
    }

    // --- resolve header dari gabungan key semua baris (sample 200 baris pertama) ---
    const parsed = tickets.map(t => {
      let raw = {};
      try { raw = t.raw_json ? JSON.parse(t.raw_json) : {}; } catch (e) { raw = {}; }
      return { t, raw };
    });
    const keySet = new Set();
    parsed.slice(0, 200).forEach(p => Object.keys(p.raw).forEach(k => keySet.add(k)));
    const cols = makeResolver(Array.from(keySet), config);
    // date_open: header khusus kalau ada di config
    if (config.ticket_date_open) {
      const hit = Array.from(keySet).find(k => norm(k) === norm(config.ticket_date_open));
      if (hit) cols.ticket_date_open = hit;
    }

    const excludeValue = norm(config.ticketing_exclude_unit || 'supervisor');
    let excludedCount = 0;
    const now = Date.now();
    const rawOf = (p, cfgKey) => (cols[cfgKey] ? p.raw[cols[cfgKey]] : null);

    // --- hitung per tiket ---
    const subsOut = {};
    SUBS.forEach(s => {
      subsOut[s.key] = {
        key: s.key, label: s.label, total: 0,
        severity: emptySev(),
        outstanding: 0, resolved: 0, closed: 0, done: 0,
        sla: { bySeverity: {}, total: { counted: 0, onTarget: 0, breach: 0, pct: null }, skipped: 0 },
        outstandingSla: { bySeverity: {}, total: { count: 0, onTrack: 0, breach: 0 } },
        sla_fallbackLastUpdate: 0,
        outstandingByStatus: { Open: 0, 'On Progress': 0, Pending: 0, Reopen: 0, Lainnya: 0 },
        outstandingTickets: [], skippedTickets: [],
        top10: []
      };
      SEVERITIES.forEach(sv => {
        subsOut[s.key].sla.bySeverity[sv] = { target: TARGET_HOURS[sv], counted: 0, onTarget: 0, breach: 0, pct: null };
        subsOut[s.key].outstandingSla.bySeverity[sv] = { target: TARGET_HOURS[sv], count: 0, onTrack: 0, breach: 0 };
      });
    });
    const catMaps = {};
    SUBS.forEach(s => { catMaps[s.key] = new Map(); });
    let totalEscalated = 0;
    const rowsBySub = {};
    SUBS.forEach(s => { rowsBySub[s.key] = []; });

    parsed.forEach(p => {
      // tiket yang posisinya di unit Supervisor dikecualikan dari semua hitungan
      if (cols.ticket_unit && excludeValue && norm(p.raw[cols.ticket_unit]).includes(excludeValue)) { excludedCount++; return; }
      totalEscalated++;
      const sk = subKeyOf(p.t.sub_category_raw);
      if (!sk) return;
      const out = subsOut[sk];
      out.total++;

      // kategori (detail sub category) x perusahaan, untuk "Top 10 kategori terbanyak"
      {
        const cat = String(p.t.detail_sub_category || '').trim() || '(Tanpa kategori)';
        const comp = String(rawOf(p, 'ticket_company') || '').trim() || '(Tanpa nama perusahaan)';
        const cm = catMaps[sk];
        const ck = cat.toLowerCase();
        if (!cm.has(ck)) cm.set(ck, { name: cat, count: 0, companies: new Map() });
        const ce = cm.get(ck); ce.count++;
        const pk = comp.toLowerCase();
        if (!ce.companies.has(pk)) ce.companies.set(pk, { name: comp, count: 0 });
        ce.companies.get(pk).count++;
      }

      const sev = normSeverity(rawOf(p, 'ticket_severity'));
      out.severity[sev || 'Lainnya']++;

      const openTs = parseTs(rawOf(p, 'ticket_date_open')) ?? parseTs(p.t.date_open);
      const pendTs = parseTs(rawOf(p, 'ticket_date_pending'));
      const resTs = parseTs(rawOf(p, 'ticket_date_resolved'));
      const cloTs = parseTs(rawOf(p, 'ticket_date_closed'));
      const lastTs = parseTs(rawOf(p, 'ticket_date_lastupdate'));
      const statusTxt = String(rawOf(p, 'ticket_status') || '').toLowerCase();

      // status akhir
      let state; // 'resolved' | 'closed' | 'outstanding'
      if (cols.ticket_status && statusTxt) {
        if (statusTxt.includes('closed') || statusTxt === 'close') state = 'closed';
        else if (statusTxt.includes('resolved') || statusTxt.includes('resolve')) state = 'resolved';
        else state = 'outstanding';
      } else {
        state = cloTs ? 'closed' : (resTs ? 'resolved' : 'outstanding');
      }

      const target = sev ? TARGET_HOURS[sev] : null;
      const tid = rawOf(p, 'ticket_id') != null && rawOf(p, 'ticket_id') !== '' ? String(rawOf(p, 'ticket_id')) : String(p.t.id);
      const tsub = String(rawOf(p, 'ticket_subject') || p.t.detail_sub_category || '');
      let hours = null, endTs = null, usedLast = false;
      if (openTs !== null) {
        if (state === 'outstanding') {
          endTs = pendTs !== null ? pendTs : now;
        } else {
          endTs = pendTs !== null ? pendTs : (resTs !== null ? resTs : (cloTs !== null ? cloTs : lastTs));
          if (pendTs === null && resTs === null && cloTs === null && lastTs !== null) usedLast = true;
        }
        if (endTs !== null) {
          hours = (endTs - openTs) / 3600000;
          if (hours < 0) hours = null;
        }
      }

      if (state === 'outstanding') {
        out.outstanding++;
        const grp = statusGroup(rawOf(p, 'ticket_status'));
        out.outstandingByStatus[grp]++;
        out.outstandingTickets.push({
          id: tid, subject: tsub, severity: sev || '-', status: String(rawOf(p, 'ticket_status') || ''), statusGroup: grp,
          hours: hours === null ? null : Math.round(hours * 10) / 10, target,
          withinTarget: (hours !== null && target !== null) ? hours <= target : null,
          pending: pendTs !== null
        });
        if (hours !== null && sev) {
          const o = out.outstandingSla.bySeverity[sev];
          o.count++; out.outstandingSla.total.count++;
          if (hours <= target) { o.onTrack++; out.outstandingSla.total.onTrack++; }
          else { o.breach++; out.outstandingSla.total.breach++; }
        }
      } else {
        out.done++;
        if (state === 'closed') out.closed++; else out.resolved++;
        if (hours !== null && sev) {
          const s = out.sla.bySeverity[sev];
          s.counted++; out.sla.total.counted++;
          if (hours <= target) { s.onTarget++; out.sla.total.onTarget++; }
          else { s.breach++; out.sla.total.breach++; }
        } else {
          out.sla.skipped++;
          let reason = 'Tidak bisa dihitung';
          if (openTs === null) reason = 'Date open kosong';
          else if (endTs === null) reason = 'Tidak ada date pending / resolved / closed / last update';
          else if (endTs < openTs) reason = 'Tanggal selesai lebih awal dari date open';
          else if (!sev) reason = 'Severity tidak dikenali';
          const rawOpen = rawOf(p, 'ticket_date_open') ?? p.t.date_open;
          const dateMode = (typeof rawOpen === 'string' ? !/(Z|[+-]\d{2}:?\d{2})$/.test(rawOpen.trim()) : typeof rawOpen === 'number') ? 'plain' : 'iso';
          const endSource = pendTs !== null ? 'date pending' : resTs !== null ? 'date resolved' : cloTs !== null ? 'date closed' : lastTs !== null ? 'date last update' : null;
          out.skippedTickets.push({
            rowId: p.t.id, id: tid, subject: tsub, severity: sev || '-', status: String(rawOf(p, 'ticket_status') || ''), reason,
            openTs, endTs, endSource, dateMode,
            editable: openTs !== null && endSource !== 'date pending' && (endTs === null || endTs < openTs)
          });
        }
        if (usedLast && hours !== null && sev) out.sla_fallbackLastUpdate++;
      }

      rowsBySub[sk].push({
        id: tid,
        subject: tsub,
        severity: sev || '-',
        state,
        hours: hours === null ? null : Math.round(hours * 10) / 10,
        target,
        withinTarget: (hours !== null && target !== null) ? hours <= target : null,
        openTs
      });
    });

    // --- persen + top 10 (durasi terlama) ---
    SUBS.forEach(s => {
      const o = subsOut[s.key];
      SEVERITIES.forEach(sv => {
        const x = o.sla.bySeverity[sv];
        x.pct = x.counted ? Math.round((x.onTarget / x.counted) * 1000) / 10 : null;
      });
      const t = o.sla.total;
      t.pct = t.counted ? Math.round((t.onTarget / t.counted) * 1000) / 10 : null;
      o.outstandingTickets.sort((a, b) => (b.hours === null) - (a.hours === null) || b.hours - a.hours);
      o.sla.fallbackLastUpdate = o.sla_fallbackLastUpdate; delete o.sla_fallbackLastUpdate;
      o.top10 = rowsBySub[s.key]
        .filter(r => r.hours !== null && r.state !== 'outstanding')
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10);
      o.topCategories = Array.from(catMaps[s.key].values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map(c => {
          const comps = Array.from(c.companies.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
          const top = comps.slice(0, 10);
          const rest = comps.slice(10);
          return { name: c.name, count: c.count, companies: top, otherCompanies: { distinct: rest.length, count: rest.reduce((n, x) => n + x.count, 0) } };
        });
    });

    return Response.json({
      periods: chosen.map(p => ({ year: p.year, month: p.month, label: p.label })),
      totals: {
        all: totalEscalated,
        emeterai: subsOut.emeterai.total,
        perisai: subsOut.perisai.total,
        shield: subsOut.shield.total,
        event: subsOut.event.total
      },
      subs: subsOut,
      targets: TARGET_HOURS,
      escalated: { header: escHeader, source: escalatedSource },
      excluded: { count: excludedCount, unitColumn: cols.ticket_unit, value: config.ticketing_exclude_unit || 'supervisor' },
      columns: cols,           // header yang terdeteksi (null = tidak ketemu)
      generatedAt: now
    });
  } catch (err) {
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}
