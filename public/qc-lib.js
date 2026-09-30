/* QC Sampler — calculation logic.
 *
 * Direct port of the standalone qc-sampler app's src/lib/parseRaw.js,
 * sampler.js and copyTable.js. Algorithms are unchanged; the only structural
 * change is that the header/row extraction (buildFieldIndex + get()) is
 * split out from the file-reading step, so the exact same alias-matching
 * logic can be reused for two data sources:
 *   1. An uploaded .xlsx/.xls/.csv file (parseRawFile) — same as original.
 *   2. Rows already sitting in the D1 database, taken from each saved
 *      ticket's `raw` JSON blob (parseDbRows) — new, but goes through the
 *      identical parseAoaRows() core so both paths behave identically.
 *
 * Plain script (no build step): exposes `QcLib` on window, and via
 * module.exports when loaded from Node (used by the parity tests).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------- parseRaw.js
  const HEADER_ALIASES = {
    ticket_id: ['ticket_id', 'ticket id'],
    agent: ['created_by_name', 'agent', 'nama agent', 'agent name'],
    channel: ['source_name', 'channel'],
    channelName: ['channel_name'],
    customer_name: ['customer_name', 'nama customer', 'customer name'],
    customer_email: ['customer_email', 'email customer'],
    customer_hp: ['customer_hp', 'no hp customer', 'phone'],
    subCategory: ['subcategory', 'sub_category', 'sub category'],
    detailSubCategory: ['detailsubcategory', 'detail_sub_category', 'detail sub category'],
    dateRaw: ['date_origin_interaction', 'date origin interaction'],
  };

  function normalizeHeader(h) {
    return String(h ?? '').trim().toLowerCase();
  }

  function buildFieldIndex(headerRow) {
    const normalized = headerRow.map(normalizeHeader);
    const index = {};
    for (const field in HEADER_ALIASES) {
      const aliases = HEADER_ALIASES[field];
      let found = -1;
      for (const alias of aliases) {
        const i = normalized.indexOf(alias);
        if (i !== -1) { found = i; break; }
      }
      index[field] = found;
    }
    return index;
  }

  function stripQuoteChar(val) {
    if (typeof val !== 'string') return val;
    const m = val.match(/^="(.*)"$/);
    if (m) return m[1];
    return val.replace(/^['"]+/, '').replace(/["']+$/, '');
  }

  function excelSerialToDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial);
    const totalSeconds = Math.round(fractionalDay * 86400);
    dateInfo.setUTCHours(0, 0, 0, 0);
    dateInfo.setUTCSeconds(totalSeconds);
    return dateInfo;
  }

  function parseDateFlexible(val) {
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (typeof val === 'number' && isFinite(val)) return excelSerialToDate(val);
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return null;
      let d = new Date(s.replace(' ', 'T'));
      if (!isNaN(d.getTime())) return d;
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[ T]?(\d{1,2}:\d{2}(:\d{2})?)?/);
      if (m) {
        const dd = m[1], mm = m[2], yyyy = m[3], time = m[4];
        const year = yyyy.length === 2 ? '20' + yyyy : yyyy;
        const iso = year + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0') + 'T' + (time || '00:00:00');
        d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    }
    return null;
  }

  // Shared core: given an AOA (array-of-arrays, header row first) and a
  // label to stamp on each row's _key / attribute to the source, builds the
  // same { rows, sheetName } shape parseRawFile() used to return.
  function parseAoaRows(aoa, stripQuotes, sourceLabel) {
    if (!aoa.length) throw new Error('File kosong atau tidak terbaca.');

    const headerRow = aoa[0];
    const fieldIndex = buildFieldIndex(headerRow);

    const missing = [];
    for (const field in fieldIndex) if (fieldIndex[field] === -1) missing.push(field);
    const requiredMissing = missing.filter((f) => f !== 'ticket_id' && f !== 'channelName');
    if (requiredMissing.length) {
      throw new Error(
        `Kolom berikut tidak ditemukan di header "${sourceLabel}": ${requiredMissing.join(', ')}. ` +
        `Pastikan sumber data punya kolom yang sesuai.`
      );
    }

    const rows = [];
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;

      const get = (field) => {
        const i = fieldIndex[field];
        if (i === -1) return '';
        let v = row[i];
        if (stripQuotes) v = stripQuoteChar(v);
        return typeof v === 'string' ? v.trim() : v;
      };

      const rawDate = get('dateRaw');
      const date = parseDateFlexible(rawDate);

      const agent = String(get('agent') || '').trim();
      const channel = String(get('channel') || '').trim();
      if (!agent && !channel) continue; // skip fully blank / junk rows

      rows.push({
        _key: sourceLabel + '-' + r,
        ticket_id: String(get('ticket_id') || ''),
        agent,
        channel,
        channelName: String(get('channelName') || ''),
        customer_name: String(get('customer_name') || ''),
        customer_email: String(get('customer_email') || ''),
        customer_hp: String(get('customer_hp') || ''),
        subCategory: String(get('subCategory') || ''),
        detailSubCategory: String(get('detailSubCategory') || ''),
        date,
      });
    }

    if (!rows.length) throw new Error('Tidak ada baris data valid yang ditemukan.');

    return { rows, sheetName: sourceLabel };
  }

  // Upload-file path — identical to the original app: read the workbook,
  // prefer a sheet literally named "DB" (case-insensitive), else the first
  // sheet, then run it through the shared core above.
  async function parseRawFile(file, stripQuotes) {
    const XLSX = root.XLSX;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'db') || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    return parseAoaRows(aoa, stripQuotes, sheetName);
  }

  // Database path — takes the array of `.raw` objects a saved period's
  // tickets carry (each key is an original file header, value is the cell
  // value or an ISO date string), turns them into an AOA, and reuses the
  // exact same parsing core so both data sources behave identically.
  function parseDbRows(rawObjects, stripQuotes, sourceLabel) {
    const headerSet = [];
    const seen = new Set();
    rawObjects.forEach((o) => {
      for (const k in o) if (!seen.has(k)) { seen.add(k); headerSet.push(k); }
    });
    const aoa = [headerSet];
    rawObjects.forEach((o) => {
      aoa.push(headerSet.map((h) => (o[h] === undefined || o[h] === null ? '' : o[h])));
    });
    return parseAoaRows(aoa, stripQuotes, sourceLabel);
  }

  // -------------------------------------------------------------- sampler.js
  const EXCLUDE_DETAIL_SUBCATEGORIES = [
    'Email Spam',
    'Status Email CC dari Pengirim',
    'Spam (Chat promosi via WhatsApp)',
  ];
  const DAY_MS = 24 * 60 * 60 * 1000;

  function dateKey(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatDate(d) {
    if (!d) return '-';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function formatDateISO(d) {
    if (!d) return '-';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatHour(d) {
    if (!d) return '-';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function computeDateRange(rows) {
    let min = null, max = null;
    for (const r of rows) {
      if (!r.date) continue;
      if (!min || r.date < min) min = r.date;
      if (!max || r.date > max) max = r.date;
    }
    if (!min || !max) return { min: null, max: null, days: 0 };
    const days = Math.floor((max - min) / DAY_MS) + 1;
    return { min, max, days };
  }

  function getSampleTarget(days) {
    return days >= 21 ? 8 : 4;
  }

  function buildWeekBuckets(min, max, weeksNeeded) {
    const totalMs = Math.max(max - min, DAY_MS) + DAY_MS;
    const chunk = totalMs / weeksNeeded;
    const buckets = [];
    for (let i = 0; i < weeksNeeded; i++) {
      const start = new Date(min.getTime() + chunk * i);
      const end = new Date(min.getTime() + chunk * (i + 1));
      buckets.push({ start, end, label: 'Minggu ' + (i + 1) });
    }
    return buckets;
  }

  function bucketIndexFor(date, buckets) {
    for (let i = 0; i < buckets.length; i++) {
      if (date >= buckets[i].start && date < buckets[i].end) return i;
    }
    return buckets.length - 1;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function filterEligibleRows(allRows, agent, channel) {
    return allRows.filter((r) =>
      r.agent === agent &&
      r.channel === channel &&
      r.date &&
      r.channelName !== 'Manual' &&
      EXCLUDE_DETAIL_SUBCATEGORIES.indexOf(r.detailSubCategory) === -1
    );
  }

  function generateSamples(opts) {
    const eligibleRows = opts.eligibleRows, min = opts.min, max = opts.max, sampleTarget = opts.sampleTarget;
    if (!eligibleRows.length) {
      return { results: [], meta: { requested: sampleTarget, found: 0, uniqueDates: 0, pool: 0 } };
    }

    const weeksNeeded = sampleTarget / 2;
    const buckets = buildWeekBuckets(min, max, weeksNeeded);
    const perBucket = sampleTarget / buckets.length;

    const byBucket = [];
    for (let i = 0; i < buckets.length; i++) byBucket.push([]);
    for (const row of eligibleRows) byBucket[bucketIndexFor(row.date, buckets)].push(row);

    const results = [];
    const usedDates = new Set();
    const usedKeys = new Set();

    for (let b = 0; b < byBucket.length; b++) {
      const candidates = shuffle(byBucket[b]);
      let taken = 0;
      for (const row of candidates) {
        if (taken >= perBucket) break;
        const dk = dateKey(row.date);
        if (usedDates.has(dk) || usedKeys.has(row._key)) continue;
        results.push(row);
        usedDates.add(dk);
        usedKeys.add(row._key);
        taken++;
      }
    }

    if (results.length < sampleTarget) {
      const leftover = shuffle(eligibleRows.filter((r) => !usedKeys.has(r._key)));
      for (const row of leftover) {
        if (results.length >= sampleTarget) break;
        const dk = dateKey(row.date);
        if (usedDates.has(dk)) continue;
        results.push(row);
        usedDates.add(dk);
        usedKeys.add(row._key);
      }
    }

    if (results.length < sampleTarget) {
      const leftover = shuffle(eligibleRows.filter((r) => !usedKeys.has(r._key)));
      for (const row of leftover) {
        if (results.length >= sampleTarget) break;
        results.push(row);
        usedKeys.add(row._key);
        usedDates.add(dateKey(row.date));
      }
    }

    results.sort((a, b) => a.date - b.date);

    return {
      results,
      meta: {
        requested: sampleTarget,
        found: results.length,
        uniqueDates: new Set(results.map((r) => dateKey(r.date))).size,
        pool: eligibleRows.length,
      },
    };
  }

  // ------------------------------------------------------------ copyTable.js
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function copyRowsToClipboard(headers, rows) {
    const tsvLines = headers ? [headers.join('\t')].concat(rows.map((r) => r.join('\t'))) : rows.map((r) => r.join('\t'));
    const tsv = tsvLines.join('\n');

    const headHtml = headers ? '<tr>' + headers.map((h) => '<th>' + escapeHtml(h) + '</th>').join('') + '</tr>' : '';
    const html = '<table>' + headHtml + rows.map((r) => '<tr>' + r.map((c) => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>').join('') + '</table>';

    try {
      if (root.ClipboardItem) {
        const item = new root.ClipboardItem({
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (e) { /* fall through to plain text */ }

    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch (e) {
      return false;
    }
  }

  const QcLib = {
    EXCLUDE_DETAIL_SUBCATEGORIES,
    parseAoaRows,
    parseRawFile,
    parseDbRows,
    dateKey, formatDate, formatDateISO, formatHour,
    computeDateRange, getSampleTarget, buildWeekBuckets,
    filterEligibleRows, generateSamples,
    copyRowsToClipboard,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QcLib;
  else root.QcLib = QcLib;
})(typeof window !== 'undefined' ? window : globalThis);
