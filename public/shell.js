/* Injects the left sidebar (Monthly / Summary / Daily / QC Sampler) into any
   page. Set <body data-section="monthly|summary|daily|qc"> to mark the
   active item. Kept dependency-free so it works on every page, including
   the simpler ones that share no other JS. */
(function () {
  if (document.querySelector('.sidebar')) return;

  var icons = {
    monthly: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    summary: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    daily:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    qc:      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21"/><path d="M8.5 11h5M11 8.5v5"/></svg>'
  };
  var items = [
    { key: 'monthly', href: '/',           label: 'Monthly Report Interaction' },
    { key: 'summary', href: '/summary',    label: 'Summary Interaction' },
    { key: 'daily',   href: '/daily',      label: 'Daily Report Interaction' },
    { key: 'qc',      href: '/qc-sampler', label: 'QC Sampler' }
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
})();
