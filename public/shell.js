/* Injects the left sidebar (Monthly / Summary / Daily / QC Sampler / Rostering / Ticketing) into any
   page. Set <body data-section="monthly|summary|daily|qc"> to mark the
   active item. Kept dependency-free so it works on every page, including
   the simpler ones that share no other JS. */
(function () {
  if (document.querySelector('.sidebar')) return;

  var icons = {
    monthly: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    summary: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    daily:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    qc:      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21"/><path d="M8.5 11h5M11 8.5v5"/></svg>',
    ticketing: '<svg viewBox="0 0 24 24"><path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/></svg>',
    setting: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    rostering: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 6v12M11 6v12M15 6v12"/></svg>'
  };
  var items = [
    { key: 'monthly', href: '/',           label: 'Monthly Report Interaction' },
    { key: 'summary', href: '/summary',    label: 'Summary Interaction' },
    { key: 'daily',   href: '/daily',      label: 'Daily Report Interaction' },
    { key: 'qc',      href: '/qc-sampler', label: 'QC Sampler' },
    { key: 'rostering', href: '/rostering', label: 'Rostering' },
    { key: 'ticketing', href: '/ticketing', label: 'Ticketing' },
    { key: 'setting', href: '/config', label: 'Setting' }
  ];
  var active = document.body.getAttribute('data-section') || 'monthly';
  var collapsed = false;
  try { collapsed = localStorage.getItem('intan-sidebar-collapsed') === '1'; } catch (e) {}

  var aside = document.createElement('aside');
  aside.className = 'sidebar' + (collapsed ? ' collapsed' : '');
  aside.setAttribute('aria-label', 'Menu utama');
  aside.innerHTML =
    '<div class="sb-brand">' +
      '<div class="sb-brand-text"><div class="sb-title">Intan <span style="font-weight:500; color:var(--slate-soft,#6b7a8f); font-size:10.5px;">Interaction Analyzer</span></div>' +
      '<div class="sb-sub">PERURI Digital Contact Center</div></div>' +
      '<button type="button" class="sb-collapse-btn" id="sb-collapse-btn" aria-label="Ciutkan menu" title="Ciutkan menu">' +
        '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="sb-label">Menu</div>' +
    '<nav class="sb-nav">' +
    items.map(function (it) {
      return '<a class="sb-link' + (it.key === active ? ' active' : '') + '" href="' + it.href + '" data-label="' + it.label + '"' +
             (it.key === active ? ' aria-current="page"' : '') + '>' + icons[it.key] +
             '<span class="sb-link-label">' + it.label + '</span></a>';
    }).join('') +
    '</nav>' +
    '<button type="button" class="sb-expand-btn" id="sb-expand-btn" aria-label="Buka menu" title="Buka menu">' +
      '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' +
    '</button>';

  document.body.classList.add('has-sidebar');
  if (collapsed) document.body.classList.add('sidebar-collapsed');
  document.body.insertBefore(aside, document.body.firstChild);

  function setCollapsed(val) {
    collapsed = val;
    aside.classList.toggle('collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem('intan-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) {}
  }
  document.getElementById('sb-collapse-btn').addEventListener('click', function () { setCollapsed(true); });
  document.getElementById('sb-expand-btn').addEventListener('click', function () { setCollapsed(false); });

  // Poppins is only linked by index.html; make the brand/heading font
  // consistent on the other pages too.
  if (!document.querySelector('link[href*="family=Poppins"]')) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap';
    document.head.appendChild(l);
  }

  // --- User menu: replace full email in header with initial + dropdown ---
  (function initUserMenu() {
    function setup() {
      var headerAccount = document.querySelector('.header-account');
      if (!headerAccount) return; // login page, etc.
      if (headerAccount.querySelector('.user-menu')) return; // already initialized

      var whoamiSpan = document.getElementById('whoami');
      var logoutBtn = document.getElementById('btn-logout');
      if (!whoamiSpan || !logoutBtn) return;

      // Hide the old full-email span
      whoamiSpan.style.display = 'none';

      // Build the user menu
      var userMenu = document.createElement('div');
      userMenu.className = 'user-menu';

      var initialBtn = document.createElement('button');
      initialBtn.className = 'user-initial-btn';
      initialBtn.type = 'button';
      initialBtn.setAttribute('aria-label', 'Menu pengguna');
      initialBtn.setAttribute('aria-haspopup', 'true');
      initialBtn.setAttribute('aria-expanded', 'false');
      initialBtn.textContent = '·';

      var dropdown = document.createElement('div');
      dropdown.className = 'user-dropdown';

      var emailDiv = document.createElement('div');
      emailDiv.className = 'user-email';
      emailDiv.textContent = '…';

      // Move the existing logout button into the dropdown
      logoutBtn.className = 'dropdown-item';
      logoutBtn.setAttribute('aria-label', 'Logout');

      dropdown.appendChild(emailDiv);
      dropdown.appendChild(logoutBtn);
      userMenu.appendChild(initialBtn);
      userMenu.appendChild(dropdown);

      // Insert before bot-helper (or at end of header-account)
      var botHelper = headerAccount.querySelector('.bot-helper');
      if (botHelper) {
        headerAccount.insertBefore(userMenu, botHelper);
      } else {
        headerAccount.appendChild(userMenu);
      }

      // Fetch current user to populate initial + email
      fetch('/api/me', { credentials: 'same-origin' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          if (d && d.email) {
            initialBtn.textContent = d.email.charAt(0).toUpperCase();
            emailDiv.textContent = d.email;
          }
        })
        .catch(function() {});

      // Toggle dropdown
      initialBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var shown = dropdown.classList.toggle('show');
        initialBtn.setAttribute('aria-expanded', shown);
      });

      // Close dropdown on outside click
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.user-menu') && dropdown.classList.contains('show')) {
          dropdown.classList.remove('show');
          initialBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  })();
})();

// ---------------------------------------------------------------------------
// Role: 'admin' boleh tulis/ubah data, 'user' view only. Server tetap yang
// menolak request tulis (403) — bagian ini hanya menyembunyikan kontrol tulis
// dan memberi pesan yang jelas.
// ---------------------------------------------------------------------------
(function () {
  window.INTAN_ROLE = null;

  var RO_CSS = [
    // Monthly: simpan ke DB
    '#btn-save-curr,#btn-save-prev',
    // Kelola Database / Kelola User: hapus & tambah
    '.del-btn,#add-user-card',
    // Konfigurasi Kolom
    '#btn-save',
    // Ticketing: koreksi date resolved
    '.edit-row',
    // Summary: form input, bulk upload, edit/hapus baris
    '#formChannel,#formProduk,#bulkUploadChannelBtn,.edit-banner,.icon-btn',
    // Rostering: buat/simpan/ubah roster
    '#openCalendarBtn,#saveAllShiftsBtn,#autoFillWeekendsBtn,#clearAllBtn,#addAgentDropdownBtn,.delete-roster'
  ].map(function (sel) {
    return sel.split(',').map(function (x) { return 'body[data-role="user"] ' + x; }).join(',');
  }).join(',') + '{display:none !important;}' +
  'body[data-role="user"] input[data-key]{pointer-events:none;background:#f3f5f7;color:#6b7a8f;}' +
  'body[data-role="user"] #view-input>.card{display:none !important;}' +
  'body[data-role="user"] #view-input::after{content:"Mode view only: input data hanya untuk admin.";display:block;padding:24px;color:#6b7a8f;font-size:13.5px;}' +
  'body[data-role="user"]::after{content:"View only";position:fixed;right:16px;bottom:16px;background:#1b2430;color:#fff;font:600 11.5px/1 sans-serif;padding:8px 12px;border-radius:999px;opacity:.85;pointer-events:none;z-index:9999;}';

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#b3432f;color:#fff;padding:10px 18px;border-radius:8px;font:600 13px sans-serif;z-index:10000;box-shadow:0 4px 14px rgba(0,0,0,.2);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  // Blok request tulis dari sisi klien untuk role user (server juga menolak).
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (window.INTAN_ROLE === 'user' && method !== 'GET' && method !== 'HEAD' &&
        url.indexOf('/api/') !== -1 && !/\/api\/(login|logout)(\?|$)/.test(url)) {
      toast('Role user hanya bisa melihat data (view only).');
      return Promise.resolve(new Response(JSON.stringify({ error: 'Role user hanya bisa melihat data (view only).' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    return nativeFetch.apply(this, arguments);
  };

  function apply(role) {
    window.INTAN_ROLE = role;
    document.body.setAttribute('data-role', role || '');
    if (role === 'user' && !document.getElementById('intan-ro-style')) {
      var st = document.createElement('style');
      st.id = 'intan-ro-style';
      st.textContent = RO_CSS;
      document.head.appendChild(st);
    }
    document.dispatchEvent(new CustomEvent('intan-role', { detail: role }));
  }

  function init() {
    nativeFetch('/api/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) apply(d.role === 'user' ? 'user' : 'admin'); })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
