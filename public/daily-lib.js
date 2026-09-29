/* Daily Report Interaction — calculation logic.
 *
 * Direct port of the standalone peruri-daily-report app's src/lib/*.js
 * (excel, ticketMetrics, voiceMetrics, responseTimeMetrics, dailyMetrics,
 * formatReport). The algorithms are unchanged; the only addition is that
 * every raw-file header name is looked up through a column map (`C`) instead
 * of being hard-coded, so it can be remapped from the "Konfigurasi Kolom"
 * page when a source export changes its column names.
 *
 * Plain script (no build step): exposes `DailyLib` on window, and via
 * module.exports when loaded from Node (used by the parity tests).
 */
(function (root) {
  'use strict';

  // Default header names of each raw file. Keys are internal; values are the
  // header text looked up in the uploaded file.
  const DEFAULT_COLS = {
    ticket: {
      source: 'source_name',
      origin: 'date_origin_interaction',
      channel: 'channel_name',
      start: 'date_start_interaction',
      end: 'date_end_interaction',
      main: 'mainCategory',
      sub: 'subCategory',
      detail: 'detailSubCategory',
    },
    voice: { datetime: 'datetime', event: 'event', talktime: 'talktime' },
    detail: {
      session: 'session_id',
      origin: 'date_origin',
      action: 'action_type',
      received: 'date_received',
      channel: 'channel_name',
    },
  };

  // ---------------------------------------------------------------- excel.js
  // Matches strings like "2026-08-01 06:06:12", "2026-08-01", "01/08/2026
  // 06:06:12" etc — the shapes date/datetime columns take when a raw export
  // force-quotes cells as text (leading ') instead of real Excel date cells.
  const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const DATE_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

  function tryParseDateString(s) {
    let m = DATE_ISO_RE.exec(s);
    if (m) {
      const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, +se);
    }
    m = DATE_SLASH_RE.exec(s);
    if (m) {
      // Assume DD/MM/YYYY (Indonesian export convention)
      const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, +se);
    }
    return null;
  }

  // Strips a leading and/or trailing single-quote wrapper (Excel's "force
  // text" marker, or the source system literally wrapping values in quotes).
  function stripQuoteWrapper(v) {
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
    if (v.startsWith("'")) return v.slice(1);
    return v;
  }

  function normalizeQuotedValue(v) {
    if (typeof v !== 'string') return v;
    const stripped = stripQuoteWrapper(v);
    const trimmed = stripped.trim();
    const asDate = tryParseDateString(trimmed);
    if (asDate) return asDate;
    if (trimmed !== '' && !isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return stripped;
  }

  // Reads a File (.xlsx/.xls or .csv) -> { headers, rows } where rows are
  // objects keyed by header name. Needs the XLSX (SheetJS) and Papa
  // (PapaParse) globals. CSV always gets the quote/date/number coercion.
  async function readWorkbookRows(file, opts) {
    const stripApostrophe = !!(opts && opts.stripApostrophe);
    if (/\.csv$/i.test(file.name)) return readCsvRows(file);
    return readXlsxRows(file, stripApostrophe);
  }

  async function readXlsxRows(file, stripApostrophe) {
    const XLSX = root.XLSX;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (aoa.length === 0) return { headers: [], rows: [] };
    const headers = aoa[0].map((h) => (h == null ? '' : String(h).trim()));
    const rows = [];
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i];
      if (line.every((v) => v == null || v === '')) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        let val = line[idx] === undefined ? null : line[idx];
        if (stripApostrophe) val = normalizeQuotedValue(val);
        obj[h] = val;
      });
      rows.push(obj);
    }
    return { headers, rows };
  }

  async function readCsvRows(file) {
    const Papa = root.Papa;
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    const headers = (parsed.meta.fields || []).map((h) => (h == null ? '' : String(h).trim()));
    const rows = parsed.data.map((row) => {
      const obj = {};
      headers.forEach((h) => {
        obj[h] = normalizeQuotedValue(row[h] ?? null);
      });
      return obj;
    });
    return { headers, rows };
  }

  // Cell value (Date time-only, "HH:MM:SS" string, or Excel day fraction) ->
  // total seconds. Used for the voice raw's talktime column.
  function durationToSeconds(v) {
    if (v == null || v === '') return 0;
    if (v instanceof Date) return v.getHours() * 3600 + v.getMinutes() * 60 + v.getSeconds();
    if (typeof v === 'string') {
      const parts = v.split(':').map(Number);
      if (parts.length === 3) {
        const [h, m, s] = parts;
        return h * 3600 + m * 60 + s;
      }
    }
    if (typeof v === 'number') return Math.round(v * 86400);
    return 0;
  }

  function isDate(v) {
    return v instanceof Date && !isNaN(v.getTime());
  }

  // True if `d` is in refDate's month and on/before refDate (calendar dates).
  function isWithinMtd(d, refDate) {
    if (!isDate(d)) return false;
    const sameMonth = d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
    if (!sameMonth) return false;
    const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const refOnly = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    return dOnly <= refOnly;
  }

  // -------------------------------------------------------- ticketMetrics.js
  const EXCLUDED_SOURCE = 'EOS Monitoring';

  function avgSeconds(rows, startKey, endKey) {
    let sum = 0;
    let n = 0;
    for (const r of rows) {
      const s = r[startKey];
      const e = r[endKey];
      if (isDate(s) && isDate(e)) {
        const diff = (e.getTime() - s.getTime()) / 1000;
        if (diff >= 0) {
          sum += diff;
          n += 1;
        }
      }
    }
    return n > 0 ? sum / n : 0;
  }

  function computeTicketMetrics(rows, refDate, C) {
    const T = (C || DEFAULT_COLS).ticket;
    // Exclude EOS Monitoring globally, then bound to Month-to-Date range
    const inScope = rows.filter(
      (r) => r[T.source] !== EXCLUDED_SOURCE && isWithinMtd(r[T.origin], refDate)
    );

    const emailRows = inScope.filter((r) => r[T.channel] === 'Email');
    const waRows = inScope.filter((r) => r[T.channel] === 'Whatsapp');
    const manualRows = inScope.filter((r) => r[T.channel] === 'Manual');
    const voiceTixRows = inScope.filter((r) => r[T.channel] === 'Voice');

    const email = {
      cof: emailRows.length,
      acd: emailRows.length,
      aht: avgSeconds(emailRows, T.start, T.end),
    };

    // WhatsApp COF is merged with Manual channel tickets (established
    // convention), but AHT is computed from the WhatsApp channel only.
    const wa = {
      cof: waRows.length + manualRows.length,
      acd: waRows.length + manualRows.length,
      aht: avgSeconds(waRows, T.start, T.end),
    };

    // Top KIP All Channel: main - sub - detail across every channel in scope.
    const kipCounts = new Map();
    for (const r of inScope) {
      const key = `${r[T.main] ?? '-'} - ${r[T.sub] ?? '-'} - ${r[T.detail] ?? '-'}`;
      kipCounts.set(key, (kipCounts.get(key) || 0) + 1);
    }
    const totalForKip = inScope.length;
    const topKip = [...kipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({
        label,
        count,
        pct: totalForKip > 0 ? (count / totalForKip) * 100 : 0,
      }));

    return {
      email,
      wa,
      topKip,
      debug: {
        emailCount: emailRows.length,
        waCount: waRows.length,
        manualCount: manualRows.length,
        voiceTicketCount: voiceTixRows.length,
        totalForKip,
      },
    };
  }

  // ------------------------------------------------------------ voiceMetrics.js
  const ABANDON_VALUES = new Set(['ABANDON', 'ABANDONED']);

  function computeVoiceMetrics(rows, refDate, C) {
    const V = (C || DEFAULT_COLS).voice;
    const inScope = rows.filter((r) => isWithinMtd(r[V.datetime], refDate));

    const cof = inScope.length;
    const acdRows = inScope.filter((r) => {
      const ev = r[V.event];
      return ev != null && ev !== '' && !ABANDON_VALUES.has(String(ev).toUpperCase());
    });
    const acd = acdRows.length;

    let sum = 0;
    for (const r of acdRows) sum += durationToSeconds(r[V.talktime]);
    const aht = acd > 0 ? sum / acd : 0;
    const scr = cof > 0 ? (acd / cof) * 100 : 100;

    return { cof, acd, aht, scr };
  }

  // ----------------------------------------------------- responseTimeMetrics.js
  // Sorts rows by session_id then chronologically, and computes the shifted
  // response-time value (O) per row (see computeResponseTimeMetrics).
  function computeShiftedResponseTimes(rows, D) {
    const sorted = [...rows].sort((a, b) => {
      const sidA = a[D.session] ?? '';
      const sidB = b[D.session] ?? '';
      if (sidA < sidB) return -1;
      if (sidA > sidB) return 1;
      const dA = a[D.origin] instanceof Date ? a[D.origin].getTime() : 0;
      const dB = b[D.origin] instanceof Date ? b[D.origin].getTime() : 0;
      return dA - dB;
    });

    const n = sorted.length;
    const N = new Array(n).fill(null);
    for (let i = 1; i < n; i++) {
      const cur = sorted[i];
      const prev = sorted[i - 1];
      if (
        cur[D.session] === prev[D.session] &&
        cur[D.action] === 'OUT' &&
        (prev[D.action] === 'IN' || prev[D.action] === 'OUT')
      ) {
        const drCur = cur[D.received];
        const drPrev = prev[D.received];
        if (isDate(drCur) && isDate(drPrev)) {
          N[i] = (drCur.getTime() - drPrev.getTime()) / 1000;
        }
      }
    }

    const O = new Array(n).fill(null);
    for (let i = 0; i < n - 1; i++) {
      if (N[i + 1] != null && N[i + 1] > 0) O[i] = N[i + 1];
    }
    return { sorted, O };
  }

  // Mirrors the master-template logic (Dbase NV columns N/O):
  //  1. Sort by session_id, then chronologically within each session.
  //  2. For every OUT row whose previous row (same session) is IN/OUT,
  //     N = gap in seconds between their date_received values.
  //  3. Shift N up one row (O[i] = N[i+1]) so the value sits on the row
  //     whose date is used for the MTD/date grouping.
  //  4. Average O per channel, bounded to Month-to-Date.
  function computeResponseTimeMetrics(rows, refDate, C) {
    const D = (C || DEFAULT_COLS).detail;
    const { sorted, O } = computeShiftedResponseTimes(rows, D);

    const sums = { Email: 0, Whatsapp: 0 };
    const counts = { Email: 0, Whatsapp: 0 };

    for (let i = 0; i < sorted.length; i++) {
      const val = O[i];
      if (val == null) continue;
      const row = sorted[i];
      const channel = row[D.channel];
      if (channel !== 'Email' && channel !== 'Whatsapp') continue;
      if (!isWithinMtd(row[D.received], refDate)) continue;
      sums[channel] += val;
      counts[channel] += 1;
    }

    return {
      email: counts.Email > 0 ? sums.Email / counts.Email : 0,
      wa: counts.Whatsapp > 0 ? sums.Whatsapp / counts.Whatsapp : 0,
      debug: { emailN: counts.Email, waN: counts.Whatsapp },
    };
  }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dateKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  // Same O-value response-time metric, broken down per calendar day (1st of
  // refDate's month through refDate) — feeds the daily Response Time chart.
  function computeDailyResponseTimeSeries(rows, refDate, C) {
    const D = (C || DEFAULT_COLS).detail;
    const { sorted, O } = computeShiftedResponseTimes(rows, D);

    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const buckets = new Map();
    for (let d = new Date(start); d <= refDate; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      buckets.set(dateKey(day), {
        date: day,
        dayName: DAY_NAMES[day.getDay()],
        dateLabel: `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}`,
        emailSum: 0,
        emailN: 0,
        waSum: 0,
        waN: 0,
      });
    }

    for (let i = 0; i < sorted.length; i++) {
      const val = O[i];
      if (val == null) continue;
      const row = sorted[i];
      const channel = row[D.channel];
      if (channel !== 'Email' && channel !== 'Whatsapp') continue;
      const dr = row[D.received];
      if (!isDate(dr)) continue;
      const bucket = buckets.get(dateKey(new Date(dr.getFullYear(), dr.getMonth(), dr.getDate())));
      if (!bucket) continue;
      if (channel === 'Email') {
        bucket.emailSum += val;
        bucket.emailN += 1;
      } else {
        bucket.waSum += val;
        bucket.waN += 1;
      }
    }

    return [...buckets.values()].map((b) => ({
      date: b.date,
      dayName: b.dayName,
      dateLabel: b.dateLabel,
      email: b.emailN > 0 ? b.emailSum / b.emailN : null,
      wa: b.waN > 0 ? b.waSum / b.waN : null,
    }));
  }

  // ---------------------------------------------------------- dailyMetrics.js
  // One bucket per calendar day (1st .. refDate) counting interactions per
  // channel; WhatsApp = whatsapp + manual tickets (excluding EOS Monitoring).
  function computeDailySeries(ticketRows, voiceRows, refDate, C) {
    const cols = C || DEFAULT_COLS;
    const T = cols.ticket;
    const V = cols.voice;
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const buckets = new Map();
    for (let d = new Date(start); d <= refDate; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      buckets.set(dateKey(day), {
        date: day,
        dayName: DAY_NAMES[day.getDay()],
        dateLabel: `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}`,
        voice: 0,
        email: 0,
        whatsapp: 0,
      });
    }

    for (const r of ticketRows) {
      if (r[T.source] === EXCLUDED_SOURCE) continue;
      const origin = r[T.origin];
      if (!isDate(origin)) continue;
      const bucket = buckets.get(dateKey(new Date(origin.getFullYear(), origin.getMonth(), origin.getDate())));
      if (!bucket) continue;
      const chan = r[T.channel];
      if (chan === 'Email') bucket.email += 1;
      else if (chan === 'Whatsapp' || chan === 'Manual') bucket.whatsapp += 1;
    }

    for (const r of voiceRows) {
      const dt = r[V.datetime];
      if (!isDate(dt)) continue;
      const bucket = buckets.get(dateKey(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())));
      if (!bucket) continue;
      bucket.voice += 1;
    }

    return [...buckets.values()];
  }

  // --------------------------------------------------------- formatReport.js
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function fmtDateId(d) {
    return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
  }
  function fmtNum(n, decimals = 2) {
    return Number(n).toFixed(decimals);
  }
  function fmtPct(n) {
    return `${fmtNum(n)}%`;
  }
  function fmtSec(n) {
    return `${Math.round(n)} sec`;
  }

  function formatReport({ refDate, voice, email, wa, topKip, sdm }) {
    const lines = [];
    lines.push('*Daily Traffic Layanan PERURI Digital Contact Center*');
    lines.push(`${fmtDateId(refDate)} | Pukul 00:00 - 23:59 WIB`);
    lines.push('');
    lines.push('*Month to Date Achievement*');
    lines.push('');

    lines.push('*Voice*');
    lines.push(`COF: ${voice.cof}`);
    lines.push(`ACD: ${voice.acd}`);
    lines.push(`AHT: ${fmtSec(voice.aht)}`);
    lines.push(`Performance SCR: ${fmtPct(voice.scr)}`);
    lines.push('Target SCR: 90.00%');
    lines.push('');

    lines.push('*Email*');
    lines.push(`COF: ${email.cof}`);
    lines.push(`ACD: ${email.acd}`);
    lines.push(`AHT: ${fmtSec(email.aht)}`);
    lines.push(`Performance Response Time: ${fmtSec(email.rt)}`);
    lines.push('Target Response Time: 900 sec');
    lines.push('');

    lines.push('*WhatsApp*');
    lines.push(`COF: ${wa.cof}`);
    lines.push(`ACD: ${wa.acd}`);
    lines.push(`AHT: ${fmtSec(wa.aht)}`);
    lines.push(`Performance Response Time: ${fmtSec(wa.rt)}`);
    lines.push('Target Response Time: 900 sec');
    lines.push('');

    lines.push('*TOP 5 MtD KIP All Channel*');
    topKip.forEach((k, i) => {
      lines.push(`${i + 1}. ${k.label}: ${fmtPct(k.pct)}`);
    });
    lines.push('');

    lines.push('*Kehadiran SDM Layanan*');
    lines.push(`Total SDM: ${sdm.totalSdm}`);
    lines.push(`Total SDM Terjadwal: ${sdm.totalTerjadwal}`);
    lines.push(`Total SDM Tidak Hadir: ${sdm.totalTidakHadir}`);
    lines.push(`Total SDM Terlambat Hadir: ${sdm.totalTerlambat}`);

    const lateness = sdm.totalTerjadwal > 0 ? (sdm.totalTerlambat / sdm.totalTerjadwal) * 100 : 0;
    const adherence = 100 - lateness;
    lines.push(`Lateness: ${fmtPct(lateness)}`);
    lines.push(`Adherence: ${fmtPct(adherence)}`);
    lines.push(`Attendance: ${fmtPct(sdm.attendance)}`);

    return lines.join('\n');
  }

  // ----------------------------------------------------------- column mapping
  // Resolves the configured header names against the headers actually found
  // in each uploaded file (exact match first, then case-insensitive). Returns
  // the resolved column map plus a list of headers that could not be found,
  // so the UI can warn instead of silently producing zeros.
  function resolveCols(C, headersByKind) {
    const base = C || DEFAULT_COLS;
    const cols = { ticket: {}, voice: {}, detail: {} };
    const missing = { ticket: [], voice: [], detail: [] };
    ['ticket', 'voice', 'detail'].forEach((kind) => {
      const headers = (headersByKind && headersByKind[kind]) || [];
      Object.keys(base[kind]).forEach((k) => {
        const want = base[kind][k];
        let found = headers.indexOf(want) !== -1 ? want : undefined;
        if (found === undefined) {
          const lower = String(want).toLowerCase();
          found = headers.find((h) => String(h).toLowerCase() === lower);
        }
        cols[kind][k] = found !== undefined ? found : want;
        if (found === undefined) missing[kind].push(want);
      });
    });
    return { cols, missing };
  }

  const DailyLib = {
    DEFAULT_COLS,
    readWorkbookRows,
    normalizeQuotedValue,
    durationToSeconds,
    isDate,
    isWithinMtd,
    computeTicketMetrics,
    computeVoiceMetrics,
    computeResponseTimeMetrics,
    computeDailyResponseTimeSeries,
    computeDailySeries,
    formatReport,
    resolveCols,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DailyLib;
  else root.DailyLib = DailyLib;
})(typeof window !== 'undefined' ? window : globalThis);
