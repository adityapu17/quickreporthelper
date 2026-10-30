/* Tombol "Copy Grafik" dan "Copy Tabel" otomatis untuk halaman Monthly, Summary,
   Daily, dan Ticketing — buat ditempel ke slide presentasi.
   - Grafik (Chart.js <canvas> atau SVG) disalin sebagai gambar PNG.
   - Tabel disalin sebagai tabel HTML berstyle (masuk PPT/Word/Excel sebagai tabel
     sungguhan) + fallback teks TSV.
   Dipasang lewat shell.js. Idempotent: di-scan ulang tiap DOM berubah, jadi
   grafik/tabel yang dirender ulang tetap dapat tombol. */
(function () {
  var sec = document.body.getAttribute('data-section');
  if (['monthly', 'summary', 'daily', 'ticketing'].indexOf(sec) === -1) return;
  if (/\/database(\.html)?$/.test(location.pathname)) return; // halaman kelola DB, bukan laporan

  // ---------- style ----------
  var st = document.createElement('style');
  st.textContent =
    '.qr-copybar{display:flex;justify-content:flex-end;gap:6px;margin:6px 0 6px;padding:0 2px;}' +
    '.qr-copybtn{font-family:var(--sans,"Segoe UI",Arial,sans-serif);font-size:11px;font-weight:600;' +
    'color:var(--teal,#0f7a6b);background:var(--teal-soft,#e4f2ef);border:none;border-radius:6px;' +
    'padding:4px 10px;cursor:pointer;white-space:nowrap;}' +
    '.qr-copybtn:hover{background:#d5ece7;}' +
    'body.capture-mode .qr-copybar{display:none !important;}';
  document.head.appendChild(st);

  // ---------- util ----------
  function shown(el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left > -5000;
  }
  function flash(btn, ok, msg) {
    var orig = btn.getAttribute('data-orig') || btn.textContent;
    btn.setAttribute('data-orig', orig);
    btn.textContent = msg || (ok ? 'Tersalin ✓' : 'Gagal, coba lagi');
    setTimeout(function () { btn.textContent = orig; }, 1700);
  }
  function loadHtml2canvas() {
    if (typeof window.html2canvas === 'function') return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- copy grafik ----------
  function canvasToWhiteBlob(src) {
    return new Promise(function (resolve) {
      var c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0);
      c.toBlob(resolve, 'image/png');
    });
  }
  function copyChart(target, btn) {
    var p;
    if (target.tagName === 'CANVAS') {
      p = canvasToWhiteBlob(target);
    } else {
      p = loadHtml2canvas().then(function () {
        return window.html2canvas(target, {
          backgroundColor: '#ffffff', scale: 2, useCORS: true,
          ignoreElements: function (el) { return el.classList && el.classList.contains('qr-copybar'); }
        });
      }).then(function (cv) {
        return new Promise(function (resolve) { cv.toBlob(resolve, 'image/png'); });
      });
    }
    p.then(function (blob) {
      if (!blob) { flash(btn, false); return; }
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(function () { flash(btn, true); })
          .catch(function () { download(blob, 'grafik.png'); flash(btn, true, 'Didownload ✓'); });
      } else {
        download(blob, 'grafik.png'); flash(btn, true, 'Didownload ✓');
      }
    }).catch(function () { flash(btn, false); });
  }

  // ---------- copy tabel ----------
  function cleanClone(table) {
    var clone = table.cloneNode(true);
    // ganti input/select dengan nilainya, buang tombol/ikon aksi
    var origFields = table.querySelectorAll('input,select,textarea');
    var cloneFields = clone.querySelectorAll('input,select,textarea');
    cloneFields.forEach(function (f, i) {
      var o = origFields[i];
      var v = o ? (o.tagName === 'SELECT' ? (o.options[o.selectedIndex] || {}).text : o.value) : '';
      f.replaceWith(document.createTextNode(v || ''));
    });
    clone.querySelectorAll('button,.icon-btn,svg,script,style').forEach(function (n) { n.remove(); });
    // buang kolom yang kosong semua (mis. kolom tombol edit/hapus)
    var rows = [].slice.call(clone.rows);
    var hasSpan = rows.some(function (r) { return [].some.call(r.cells, function (c) { return c.colSpan > 1 || c.rowSpan > 1; }); });
    if (!hasSpan && rows.length) {
      var nCols = Math.max.apply(null, rows.map(function (r) { return r.cells.length; }));
      for (var ci = nCols - 1; ci >= 0; ci--) {
        var empty = rows.every(function (r) { return !r.cells[ci] || !r.cells[ci].textContent.trim(); });
        if (empty) rows.forEach(function (r) { if (r.cells[ci]) r.deleteCell(ci); });
      }
    }
    return clone;
  }
  function styledTableHtml(table, own) {
    // Monthly sudah punya builder sendiri (styling sama seperti sebelumnya) — pakai itu.
    if (!own && typeof window.buildInlineStyledTable === 'function') {
      try { return window.buildInlineStyledTable(table); } catch (e) {}
    }
    var clone = cleanClone(table);
    var FONT = 'Calibri, "Segoe UI", Arial, sans-serif';
    clone.setAttribute('border', '1'); clone.setAttribute('cellpadding', '6'); clone.setAttribute('cellspacing', '0');
    clone.removeAttribute('class'); clone.removeAttribute('id'); clone.removeAttribute('style');
    clone.style.borderCollapse = 'collapse'; clone.style.fontFamily = FONT; clone.style.fontSize = '9pt';
    [].forEach.call(clone.rows, function (row) {
      var isHead = row.querySelector('th') !== null;
      var bg = isHead ? '#F6F8FA' : '#FFFFFF';
      row.setAttribute('bgcolor', bg);
      [].forEach.call(row.cells, function (c, i) {
        var numeric = c.classList.contains('num');
        var bold = c.style.fontWeight === 'bold';
        c.removeAttribute('class'); c.removeAttribute('style');
        c.setAttribute('bgcolor', bg);
        c.style.cssText = 'background-color:' + bg + ';border:1px solid #D9E0E8;padding:6px 10px;font-family:' + FONT +
          ';font-size:9pt;color:' + (isHead ? '#425066' : '#1B2430') + ';text-align:' + (numeric ? 'right' : 'left') +
          ';' + (isHead ? 'font-weight:bold;text-transform:uppercase;' : (bold ? 'font-weight:bold;' : ''));
      });
    });
    return clone.outerHTML;
  }
  function tableTsv(table) {
    var clone = cleanClone(table);
    return [].map.call(clone.rows, function (r) {
      return [].map.call(r.cells, function (c) { return c.textContent.replace(/\s+/g, ' ').trim(); }).join('\t');
    }).join('\n');
  }
  function copyTable(table, btn, own) {
    var html = styledTableHtml(table, own), text = tableTsv(table);
    // execCommand dulu: jalan juga di file:// dan hanya butuh klik user.
    var box = document.createElement('div');
    box.setAttribute('contenteditable', 'true');
    box.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre;';
    box.innerHTML = html;
    document.body.appendChild(box);
    var ok = false;
    try {
      var range = document.createRange(); range.selectNodeContents(box);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      ok = document.execCommand('copy'); sel.removeAllRanges();
    } catch (e) { ok = false; }
    document.body.removeChild(box);
    if (ok) { flash(btn, true); return; }
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]).then(function () { flash(btn, true); }).catch(function () { flash(btn, false); });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(btn, true); }, function () { flash(btn, false); });
    } else flash(btn, false);
  }

  // ---------- scan & pasang tombol ----------
  var SKIP = '.sidebar,.user-menu,.bot-helper,button,.sb-link,[data-no-copy],.tooltip,.chart-tooltip,[role="tooltip"]';

  function addBar(target, buttons) {
    if (target.previousElementSibling && target.previousElementSibling.classList.contains('qr-copybar') &&
        target.previousElementSibling._qrTarget === target) return;
    var bar = document.createElement('div');
    bar.className = 'qr-copybar';
    bar._qrTarget = target;
    buttons.forEach(function (def) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'qr-copybtn'; b.textContent = def.label;
      b.addEventListener('click', function (e) { e.stopPropagation(); def.fn(b); });
      bar.appendChild(b);
    });
    target.parentNode.insertBefore(bar, target);
  }

  // ---------- tree: Copy Summary / Copy Full Tree ----------
  // Halaman mengisi window.QR_TREE_DATA[id] = { summary, full } (objek atau fungsi) dan memberi
  // atribut data-qr-tree="id" pada wadah tree. Bentuk data: { head:[..], num:[indeks kolom angka], rows:[[..], ..] }
  // Baris dengan properti bold=true ditebalkan (induk).
  function treeToTable(d) {
    var t = document.createElement('table');
    var th = t.createTHead().insertRow();
    d.head.forEach(function (h, i) {
      var c = document.createElement('th'); c.textContent = h;
      if ((d.num || []).indexOf(i) !== -1) c.className = 'num';
      th.appendChild(c);
    });
    var tb = t.createTBody();
    d.rows.forEach(function (r) {
      var tr = tb.insertRow();
      r.forEach(function (v, i) {
        var c = tr.insertCell(); c.textContent = v == null ? '' : String(v);
        if ((d.num || []).indexOf(i) !== -1) c.className = 'num';
        if (r.bold) c.style.fontWeight = 'bold';
      });
    });
    return t;
  }
  function copyTree(id, which, btn) {
    var reg = (window.QR_TREE_DATA || {})[id];
    var src = reg && reg[which];
    var d = typeof src === 'function' ? src() : src;
    if (!d || !d.rows || !d.rows.length) { flash(btn, false, 'Tidak ada data'); return; }
    copyTable(treeToTable(d), btn, true);
  }

  function scan() {
    obs.disconnect();
    try {
      // bersihkan toolbar yatim (target sudah hilang / dirender ulang)
      [].forEach.call(document.querySelectorAll('.qr-copybar'), function (bar) {
        if (!bar._qrTarget || !bar._qrTarget.isConnected || bar.nextElementSibling !== bar._qrTarget || !shown(bar._qrTarget)) bar.remove();
      });

      // grafik: canvas Chart.js
      [].forEach.call(document.querySelectorAll('canvas'), function (cv) {
        if (cv.closest(SKIP) || !shown(cv)) return;
        var r = cv.getBoundingClientRect();
        if (r.width < 120 || r.height < 80) return;
        var host = cv.closest('.chart-wrap,.chart-wrap-sm,.chart-canvas-wrap,.chart-full') || cv.parentElement;
        if (host.querySelectorAll('canvas').length > 1) host = cv; // beberapa canvas satu wadah → per canvas
        addBar(host, [{ label: 'Copy Grafik', fn: function (btn) { copyChart(cv, btn); } }]);
      });

      // grafik: SVG buatan sendiri (Monthly)
      var seenHosts = [];
      [].forEach.call(document.querySelectorAll('svg'), function (sv) {
        if (sv.closest(SKIP) || sv.closest('.qr-copybar') || !shown(sv)) return;
        var r = sv.getBoundingClientRect();
        if (r.width < 120 || r.height < 100) return;
        var host = sv.parentElement;
        if (!host || seenHosts.indexOf(host) !== -1) return;
        seenHosts.push(host);
        addBar(host, [{ label: 'Copy Grafik', fn: function (btn) { copyChart(host, btn); } }]);
      });

      // tree (Copy Summary / Copy Full Tree)
      [].forEach.call(document.querySelectorAll('[data-qr-tree]'), function (el) {
        if (!shown(el)) return;
        var id = el.getAttribute('data-qr-tree');
        addBar(el, [
          { label: 'Copy Summary', fn: function (btn) { copyTree(id, 'summary', btn); } },
          { label: 'Copy Full Tree', fn: function (btn) { copyTree(id, 'full', btn); } }
        ]);
      });

      // tabel
      [].forEach.call(document.querySelectorAll('table'), function (t) {
        if (t.closest(SKIP) || t.parentElement.closest('table') || !shown(t)) return;
        if (!t.rows.length || !t.textContent.trim()) return;
        var target = t.closest('.tbl-wrap') || t;
        if (target.parentElement && target.parentElement.closest('table')) return;
        addBar(target, [{ label: 'Copy Tabel', fn: function (btn) { copyTable(t, btn); } }]);
      });
    } finally {
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  var timer = null;
  var obs = new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  });
  scan();
})();
