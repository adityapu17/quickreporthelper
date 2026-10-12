// Functions/rostering.js — serves rostering.html through auth middleware
// HTML embedded to avoid filesystem reads in Workers

const ROSTERING_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rostering — Intan</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/shell.css">
<style>
  :root{
    --ink:#1b2430; --slate:#425066; --slate-soft:#6b7a8f; --line:#d9e0e8;
    --paper:#f6f8fa; --card:#ffffff; --teal:#0f7a6b; --teal-soft:#e4f2ef;
    --red:#b3432f; --amber:#c98a1d; --blue:#3568c9;
    --mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    --sans: "Segoe UI", "Poppins", Arial, sans-serif;
    --heading: "Poppins", "Segoe UI", Arial, sans-serif;
  }
  *{box-sizing:border-box;}
  @keyframes pageFade{ from{opacity:0;} to{opacity:1;} }
  @keyframes cardIn{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
  @keyframes popIn{ from{opacity:0; transform:translateY(-4px) scale(.97);} to{opacity:1; transform:translateY(0) scale(1);} }
  body{ animation:pageFade .2s ease; margin:0; background:var(--paper); color:var(--ink); font-family:var(--sans); }
  button, select, input, a{ transition:background-color .15s ease, border-color .15s ease, color .15s ease, transform .1s ease, box-shadow .15s ease; }
  button:active{ transform:scale(.96); }
  select:focus, input:focus{ outline:none; border-color:var(--teal); box-shadow:0 0 0 3px rgba(15,122,107,.12); }
  .fade-in{ animation:cardIn .2s ease both; }

  header{padding:26px 32px 18px; border-bottom:1px solid var(--line); background:var(--card); display:flex; align-items:flex-start; justify-content:space-between; gap:20px;}
  header h1{margin:0 0 4px; font-size:20px; letter-spacing:-0.01em; font-weight:700; font-family:var(--heading);}
  .header-account{display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--slate-soft); white-space:nowrap; padding-top:2px;}
  .header-account button{background:none; border:1px solid var(--line); border-radius:6px; padding:5px 11px; font-size:12px; cursor:pointer; color:var(--slate); font-family:var(--sans);}
  .header-account button:hover{background:var(--paper);}
  .bot-helper{ position:relative; }
  .bot-helper button{ border:none; border-radius:10px; width:36px; height:36px; padding:2px; background:none; cursor:pointer; }
  .bot-helper button:hover{ background:var(--paper); }
  @keyframes botFloat{ 0%,100%{transform:translateY(0);} 50%{transform:translateY(-2px);} }
  .bot-helper button img{ width:100%; height:100%; object-fit:contain; display:block; animation:botFloat 3.2s ease-in-out infinite; }
  .bot-bubble{
    position:absolute; top:calc(100% + 10px); right:0; width:270px;
    background:#fff; border:1px solid var(--line); border-radius:12px; padding:13px 15px;
    font-size:12.5px; line-height:1.55; color:var(--ink); box-shadow:0 6px 20px rgba(20,30,45,.14);
    display:none; z-index:30; text-align:left; white-space:normal; overflow-wrap:break-word;
  }
  .bot-bubble.show{ display:block; animation:popIn .18s ease; }
  .bot-bubble::after{ content:''; position:absolute; top:-6px; right:13px; width:11px; height:11px; background:#fff; border-left:1px solid var(--line); border-top:1px solid var(--line); transform:rotate(45deg); }
  .bot-bubble b{ display:block; margin-bottom:4px; color:var(--teal); }

  .app-tabs{display:flex; gap:2px; border-bottom:1px solid var(--line); background:var(--card); padding:0 32px;}
  .app-tabs a{ padding:9px 16px; font-size:12.5px; font-weight:600; text-decoration:none; color:var(--slate-soft); border-bottom:2px solid transparent; margin-bottom:-1px; }
  .app-tabs a:hover{color:var(--ink);}
  .app-tabs a.active{color:var(--teal); border-bottom-color:var(--teal);}

  .wrap{max-width:1400px; margin:0 auto; padding:22px 32px 64px;}

  .card{background:var(--card); border:1px solid var(--line); border-radius:10px; margin-bottom:20px; overflow:hidden; box-shadow:0 1px 2px rgba(20,30,45,.04);}
  .card h2{margin:0; padding:14px 20px; font-size:14.5px; font-weight:700; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; background:#fbfcfd; font-family:var(--heading);}
  .card .body{ padding:18px 20px; }

  .form-grid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:14px; margin-bottom:14px; }
  @media (max-width:820px){ .form-grid{ grid-template-columns:1fr; } }
  .field{ display:flex; flex-direction:column; gap:5px; }
  .field label{ font-size:11.5px; font-weight:700; color:var(--slate-soft); text-transform:uppercase; letter-spacing:.03em; }
  select, input[type=number], input[type=text]{ font-family:var(--sans); font-size:13.5px; border-radius:7px; border:1px solid var(--line); padding:8px 12px; background:var(--card); color:var(--ink); }

  .table-responsive{ overflow-x:auto; margin-bottom:20px; }
  table{ width:100%; border-collapse:collapse; font-size:13.5px; }
  thead th{ text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--slate-soft); padding:10px 20px; border-bottom:1.5px solid var(--line); font-weight:700; background:#fbfcfd; }
  tbody td{ padding:10px 20px; border-bottom:1px solid #eef1f4; font-family:var(--mono); font-size:13.5px; }
  tbody tr:last-child td{ border-bottom:none; }
  .btn-primary{ background:var(--teal); border:1px solid var(--teal); color:#fff; font-weight:600; border-radius:7px; padding:9px 18px; font-size:13.5px; cursor:pointer; }
  .btn-ghost{ font-family:var(--sans); font-size:13.5px; border-radius:7px; border:1px solid var(--line); padding:8px 16px; background:var(--card); color:var(--ink); cursor:pointer; }
  .btn-danger{ background:var(--red); border:1px solid var(--red); color:#fff; font-weight:600; border-radius:7px; padding:9px 18px; font-size:13.5px; cursor:pointer; }
  .btn-sm{ font-size:12px; padding:4px 10px; }

  .empty-state{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:36px; text-align:center; color:var(--slate-soft); font-size:13.5px; }

  /* Rostering tabs */
  .roster-tabs{display:flex; gap:4px; border-bottom:1px solid var(--line); background:var(--card); padding:0 8px; margin-bottom:16px;}
  .roster-tabs button{ padding:8px 16px; font-size:12.5px; font-weight:600; background:none; border:none; color:var(--slate-soft); border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; }
  .roster-tabs button:hover{color:var(--ink);}
  .roster-tabs button.active{color:var(--teal); border-bottom-color:var(--teal);}

  /* Stats grid */
  .stats-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; margin-bottom:16px;}
  .stat{background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px 16px;}
  .stat .label{font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--slate-soft); margin-bottom:4px;}
  .stat .value{font-size:16px; font-weight:700; font-family:var(--mono); color:var(--ink);}

  /* Shift calendar */
  .calendar-wrap{overflow-x:auto; overflow-y:auto; max-height:600px;}
  .calendar-table{width:100%; border-collapse:collapse; font-size:12px; min-width:max-content;}
  .calendar-table th{position:sticky; top:0; background:#fbfcfd; z-index:10; text-align:center; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:var(--slate-soft); padding:8px 4px; border-bottom:1.5px solid var(--line); font-weight:700;}
  .calendar-table th.agent-col{position:sticky; left:0; width:180px; min-width:180px; background:#fbfcfd; z-index:20; text-align:left; padding:8px 12px;}
  .calendar-table td{text-align:center; padding:4px 2px; border-bottom:1px solid #eef1f4; border-right:1px solid #eef1f4; height:36px; vertical-align:middle;}
  .calendar-table td.agent-col{position:sticky; left:0; width:180px; min-width:180px; background:var(--card); z-index:15; text-align:left; padding:8px 12px; font-weight:600; font-size:12px;}
  .calendar-table tr:hover td.agent-col{background:var(--teal-soft);}
  .calendar-table tr.today td{background:rgba(15,122,107,.08);}
  .calendar-table tr.weekend td{background:rgba(179,67,47,.05);}

  .shift-select{width:100%; height:100%; border:none; background:transparent; font-size:11px; font-weight:600; text-align:center; cursor:pointer; padding:2px; border-radius:4px;}
  .shift-select:focus{outline:none; background:var(--teal-soft);}
  .shift-P{background:rgba(53,104,201,.15); color:#3568c9;}
  .shift-S{background:rgba(201,138,29,.15); color:#c98a1d;}
  .shift-M{background:rgba(179,67,47,.15); color:#b3432f;}
  .shift-L{background:rgba(107,122,143,.15); color:#6b7a8f;}
  .shift-C{background:rgba(15,122,107,.15); color:#0f7a6b;}
  .shift-O{background:rgba(128,0,128,.15); color:#800080;}
  .shift-empty{background:transparent; color:var(--slate-soft);}

  .shift-legend{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; font-size:11px;}
  .shift-legend-item{display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:4px; background:var(--paper); border:1px solid var(--line);}
  .shift-legend-color{width:12px; height:12px; border-radius:2px;}

  /* Saved rosters list */
  .saved-roster{display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #eef1f4;}
  .saved-roster:last-child{border-bottom:none;}
  .saved-roster-info{display:flex; flex-direction:column; gap:2px;}
  .saved-roster-title{font-weight:600; font-size:13px;}
  .saved-roster-meta{font-size:11px; color:var(--slate-soft);}
  .saved-roster-actions{display:flex; gap:8px;}

  .stat-clickable{cursor:pointer; transition:background .15s;}
  .stat-clickable:hover{background:var(--teal-soft);}

  .tab-panel{display:none;}
  .tab-panel.active{display:block; animation:cardIn .2s ease both;}

  @media (max-width:820px){
    .calendar-table th.agent-col,.calendar-table td.agent-col{width:140px; min-width:140px;}
    .shift-select{font-size:10px;}
  }
</style>
</head>
<body data-section="rostering">
<script src="/shell.js"></script>

<header>
  <div>
    <h1>Rostering</h1>
  </div>
  <div class="header-account">
    <span id="whoami"></span>
    <div class="bot-helper">
      <button id="btn-bot" aria-label="Bantuan" title="Bantuan"><img src="/robot.png" alt="Bantuan"></button>
      <div class="bot-bubble" id="bot-bubble">
        <b>Cara pakai halaman ini</b>
        <div style="margin-top:8px;">Tab <b>Buat Roster</b>: isi bulan/tahun/jumlah karyawan, lalu Generate.</div>
        <div style="margin-top:4px;">Tab <b>Kalender Shift</b>: pilih roster, isi shift per agent per tanggal (P=Pagi, S=Sore, M=Malam, L=Libur, C=Cuti).</div>
        <div style="margin-top:4px;">Tab <b>Kelola Data</b>: lihat/hapus/edit roster tersimpan.</div>
      </div>
    </div>
    <button id="btn-logout">Logout</button>
  </div>
</header>

<div class="wrap">
  <!-- Rostering Tabs -->
  <div class="roster-tabs" role="tablist">
    <button class="active" role="tab" data-tab="create">Buat Roster</button>
    <button role="tab" data-tab="calendar">Kalender Shift</button>
    <button role="tab" data-tab="manage">Kelola Data</button>
  </div>

  <!-- TAB 1: BUAT ROSTER -->
  <div class="tab-panel active" id="tab-create">
    <div class="card">
      <h2>Pengaturan Roster Bulanan</h2>
      <div class="body">
        <form id="rosterForm" class="form-grid">
          <div class="field">
            <label for="rosterBulan">Bulan</label>
            <select id="rosterBulan" required>
              <option value="">Pilih bulan</option>
              <option value="1">Januari</option>
              <option value="2">Februari</option>
              <option value="3">Maret</option>
              <option value="4">April</option>
              <option value="5">Mei</option>
              <option value="6">Juni</option>
              <option value="7">Juli</option>
              <option value="8">Agustus</option>
              <option value="9">September</option>
              <option value="10">Oktober</option>
              <option value="11">November</option>
              <option value="12">Desember</option>
            </select>
          </div>

          <div class="field">
            <label for="rosterTahun">Tahun</label>
            <input type="number" id="rosterTahun" min="2020" max="2100" placeholder="2026" required>
          </div>

          <div class="field">
            <label for="rosterJumlahKaryawan">Jumlah Karyawan</label>
            <input type="number" id="rosterJumlahKaryawan" min="1" placeholder="" required>
          </div>

          <div class="field">
            <label for="rosterHariLiburNasional">Hari Libur Nasional</label>
            <input type="number" id="rosterHariLiburNasional" min="0" placeholder="0" help="Jumlah hari libur nasional dalam bulan ini">
          </div>

          <div class="field">
            <label for="rosterCutiBersama">Cuti Bersama</label>
            <input type="number" id="rosterCutiBersama" min="0" placeholder="0" help="Jumlah hari cuti bersama">
          </div>

          <div class="field" style="grid-column: 1 / -1;">
            <button type="submit" class="btn-primary" id="generateRosterBtn">Generate Roster</button>
            <button type="button" class="btn-ghost" id="resetRosterBtn">Reset Form</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card" id="rosterResult" style="display:none;">
      <h2>Hasil Roster Bulanan</h2>
      <div class="body">
        <div id="rosterSummary">
          <div class="stats-grid" id="rosterStats"></div>
        </div>

        <div class="table-responsive">
          <table id="rosterTable">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Karyawan</th>
                <th>Hari Kerja (HK)</th>
                <th>Hari Libur (HL)</th>
                <th>Total Hari</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="rosterTableBody"></tbody>
          </table>
        </div>

        <div class="field" style="grid-column: 1 / -1; text-align:center; margin-top:20px;">
          <button class="btn-primary" id="exportExcelBtn">Export ke Excel</button>
          <button class="btn-ghost" id="printRosterBtn">Print Roster</button>
          <button class="btn-primary" id="openCalendarBtn">Buka Kalender Shift →</button>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: KALENDER SHIFT -->
  <div class="tab-panel" id="tab-calendar">
    <div class="card">
      <h2>Kalender Shift Bulanan</h2>
      <div class="body">
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="field">
            <label for="calRosterSelect">Pilih Roster</label>
            <select id="calRosterSelect" required>
              <option value="">-- Pilih roster yang sudah dibuat --</option>
            </select>
          </div>
          <div class="field" style="grid-column: 1 / -1; display:flex; gap:8px; align-items:end;">
            <button class="btn-primary" id="loadCalendarBtn">Load Kalender</button>
            <button class="btn-ghost" id="saveAllShiftsBtn">Simpan Semua Shift</button>
            <button class="btn-ghost" id="autoFillWeekendsBtn">Isi Weekend Otomatis</button>
          </div>
        </div>

        <div class="shift-legend" id="shiftLegend"></div>

        <div class="calendar-wrap" id="calendarWrap">
          <div class="empty-state" id="calendarEmpty">Pilih roster dan klik <b>Load Kalender</b> untuk memulai.</div>
          <table class="calendar-table" id="calendarTable" style="display:none;">
            <thead>
              <tr>
                <th class="agent-col">Agent / Tanggal</th>
              </tr>
            </thead>
            <tbody id="calendarBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 3: KELOLA DATA -->
  <div class="tab-panel" id="tab-manage">
    <div class="card">
      <h2>Daftar Roster Tersimpan</h2>
      <div class="body">
        <div class="empty-state" id="manageEmpty">Memuat data...</div>
        <div id="manageList" style="display:none;"></div>
      </div>
    </div>
  </div>
</div>

<script>
document.getElementById('btn-bot').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('bot-bubble').classList.toggle('show'); });
document.addEventListener('click', (e) => { const b = document.getElementById('bot-bubble'); if (b.classList.contains('show') && !e.target.closest('.bot-helper')) b.classList.remove('show'); });
document.getElementById('btn-logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; });
fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => { if (d && d.email) document.getElementById('whoami').textContent = d.email; }).catch(() => {});

const MONTHS = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const SHIFT_CODES = {
  'P': {label:'Pagi (P)', color:'#3568c9', bg:'rgba(53,104,201,.15)'},
  'S': {label:'Sore (S)', color:'#c98a1d', bg:'rgba(201,138,29,.15)'},
  'M': {label:'Malam (M)', color:'#b3432f', bg:'rgba(179,67,47,.15)'},
  'L': {label:'Libur (L)', color:'#6b7a8f', bg:'rgba(107,122,143,.15)'},
  'C': {label:'Cuti (C)', color:'#0f7a6b', bg:'rgba(15,122,107,.15)'},
  'O': {label:'Off (O)', color:'#800080', bg:'rgba(128,0,128,.15)'},
  '': {label:'—', color:'var(--slate-soft)', bg:'transparent'}
};

let editingRosterId = null;
let currentCalendarRosterId = null;
let currentCalendarAgents = [];

// ============ TAB SWITCHING ============
document.querySelectorAll('.roster-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.roster-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'manage') loadManageList();
    if (btn.dataset.tab === 'calendar') loadCalendarRosterList();
  });
});

// ============ TAB 1: BUAT ROSTER ============
document.getElementById('rosterForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const bulan = parseInt(document.getElementById('rosterBulan').value, 10);
  const tahun = parseInt(document.getElementById('rosterTahun').value, 10);
  const jumlahKaryawan = parseInt(document.getElementById('rosterJumlahKaryawan').value, 10);
  const hariLiburNasional = parseInt(document.getElementById('rosterHariLiburNasional').value, 10) || 0;
  const cutiBersama = parseInt(document.getElementById('rosterCutiBersama').value, 10) || 0;

  if (!bulan || !tahun || !jumlahKaryawan || jumlahKaryawan <= 0) {
    alert('Lengkapi semua field wajib dengan benar');
    return;
  }

  const hariDalamBulan = new Date(tahun, bulan - 1, 0).getDate();
  const totalLibur = hariLiburNasional + cutiBersama;
  const hkPerKaryawan = hariDalamBulan - totalLibur;
  const hlPerKaryawan = totalLibur;

  try {
    let result;
    if (editingRosterId) {
      result = await updateRosterings(editingRosterId, bulan, tahun, jumlahKaryawan, hariLiburNasional, cutiBersama);
      alert('Rostering berhasil diperbarui!');
      editingRosterId = null;
    } else {
      result = await saveRosterings(bulan, tahun, jumlahKaryawan, hariLiburNasional, cutiBersama);
      alert('Rostering berhasil disimpan!');
    }

    document.getElementById('rosterResult').style.display = 'block';

    const statsGrid = document.getElementById('rosterStats');
    statsGrid.innerHTML =
      '<div class="stat"><div class="label">Bulan</div><div class="value">' + MONTHS[bulan] + ' ' + tahun + '</div></div>' +
      '<div class="stat"><div class="label">Hari dalam Bulan</div><div class="value">' + hariDalamBulan + '</div></div>' +
      '<div class="stat"><div class="label">Hari Libur Nasional</div><div class="value">' + hariLiburNasional + '</div></div>' +
      '<div class="stat"><div class="label">Cuti Bersama</div><div class="value">' + cutiBersama + '</div></div>' +
      '<div class="stat"><div class="label">Total Hari Libur</div><div class="value">' + totalLibur + '</div></div>' +
      '<div class="stat"><div class="label">Hari Kerja (HK) per Karyawan</div><div class="value">' + hkPerKaryawan + '</div></div>' +
      '<div class="stat"><div class="label">Hari Libur (HL) per Karyawan</div><div class="value">' + hlPerKaryawan + '</div></div>' +
      '<div class="stat"><div class="label">Total Karyawan</div><div class="value">' + jumlahKaryawan + '</div></div>' +
      '<div class="stat"><div class="label">Total HK Seluruh Karyawan</div><div class="value">' + (hkPerKaryawan * jumlahKaryawan) + '</div></div>';

    const tableBody = document.getElementById('rosterTableBody');
    tableBody.innerHTML = '';

    for (let i = 1; i <= jumlahKaryawan; i++) {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td>' + i + '</td>' +
        '<td><input type="text" placeholder="Nama Karyawan ' + i + '" class="karyawan-input"></td>' +
        '<td class="hk-value">' + hkPerKaryawan + '</td>' +
        '<td class="hl-value">' + hlPerKaryawan + '</td>' +
        '<td class="total-value">' + hariDalamBulan + '</td>' +
        '<td><button class="btn-ghost edit-btn btn-sm">Edit</button><button class="btn-danger delete-btn btn-sm">Hapus</button></td>';
      tableBody.appendChild(row);
    }

    tableBody.querySelectorAll('.edit-btn').forEach((button, index) => {
      button.addEventListener('click', () => {
        const row = button.closest('tr');
        const namaInput = row.querySelector('.karyawan-input');
        if (button.textContent === 'Edit') {
          namaInput.removeAttribute('readonly');
          namaInput.focus();
          button.textContent = 'Simpan';
        } else {
          namaInput.setAttribute('readonly', true);
          button.textContent = 'Edit';
        }
      });
    });

    tableBody.querySelectorAll('.delete-btn').forEach(button => {
      button.addEventListener('click', () => {
        if (confirm('Apakah Anda yakin ingin menghapus karyawan ini?')) {
          button.closest('tr').remove();
          updateRowNumbers();
        }
      });
    });

  } catch (error) {
    alert(error.message);
  }
});

function updateRowNumbers() {
  const rows = document.querySelectorAll('#rosterTableBody tr');
  rows.forEach((row, index) => {
    row.querySelector('td:first-child').textContent = index + 1;
  });
}

document.getElementById('resetRosterBtn').addEventListener('click', () => {
  document.getElementById('rosterForm').reset();
  document.getElementById('rosterResult').style.display = 'none';
  editingRosterId = null;
});

document.getElementById('exportExcelBtn').addEventListener('click', () => {
  alert('Fitur export ke Excel akan segeri tersedia!');
});

document.getElementById('printRosterBtn').addEventListener('click', () => {
  window.print();
});

document.getElementById('openCalendarBtn').addEventListener('click', () => {
  document.querySelector('.roster-tabs button[data-tab="calendar"]').click();
});

// ============ API HELPERS ============
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: 'Request failed'}));
    throw new Error(err.error || 'Request failed: ' + res.status);
  }
  return res.json();
}

async function saveRosterings(bulan, tahun, jumlahKaryawan, hariLiburNasional, cutiBersama) {
  return apiFetch('/api/rostering', {
    method: 'POST',
    body: JSON.stringify({ bulan, tahun, jumlah_karyawan: jumlahKaryawan, hari_libur_nasional: hariLiburNasional, cuti_bersama: cutiBersama })
  });
}

async function updateRosterings(id, bulan, tahun, jumlahKaryawan, hariLiburNasional, cutiBersama) {
  return apiFetch('/api/rostering/' + id, {
    method: 'PUT',
    body: JSON.stringify({ bulan, tahun, jumlah_karyawan: jumlahKaryawan, hari_libur_nasional: hariLiburNasional, cuti_bersama: cutiBersama })
  });
}

async function deleteRostering(id) {
  return apiFetch('/api/rostering/' + id, { method: 'DELETE' });
}

async function getRostering(id) {
  return apiFetch('/api/rostering/' + id);
}

async function getShifts(rosteringId) {
  return apiFetch('/api/rostering/' + rosteringId + '/shifts');
}

async function saveShifts(rosteringId, shifts) {
  return apiFetch('/api/rostering/' + rosteringId + '/shifts', {
    method: 'POST',
    body: JSON.stringify({ shifts })
  });
}

// ============ TAB 2: KALENDER SHIFT ============
function loadCalendarRosterList() {
  apiFetch('/api/rostering').then(rosters => {
    const sel = document.getElementById('calRosterSelect');
    sel.innerHTML = '<option value="">-- Pilih roster yang sudah dibuat --</option>';
    rosters.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = MONTHS[r.bulan] + ' ' + r.tahun + ' (' + r.jumlah_karyawan + ' karyawan)';
      sel.appendChild(opt);
    });
  }).catch(err => console.error(err));
}

document.getElementById('loadCalendarBtn').addEventListener('click', async () => {
  const rosterId = document.getElementById('calRosterSelect').value;
  if (!rosterId) { alert('Pilih roster terlebih dahulu'); return; }
  currentCalendarRosterId = rosterId;
  await loadCalendar(rosterId);
});

async function loadCalendar(rosterId) {
  try {
    const [roster, shifts] = await Promise.all([
      getRostering(rosterId),
      getShifts(rosterId)
    ]);

    const hariDalamBulan = new Date(roster.tahun, roster.bulan - 1, 0).getDate();
    currentCalendarAgents = [];

    // Build agent list from shifts or create placeholder
    const agentNames = {};
    shifts.forEach(s => {
      if (!agentNames[s.agent_index]) agentNames[s.agent_index] = 'Agent ' + s.agent_index;
    });
    for (let i = 1; i <= roster.jumlah_karyawan; i++) {
      currentCalendarAgents[i] = agentNames[i] || 'Agent ' + i;
    }

    renderShiftLegend();
    renderCalendarTable(roster, hariDalamBulan, shifts);
    document.getElementById('calendarEmpty').style.display = 'none';
    document.getElementById('calendarTable').style.display = 'table';
  } catch (err) {
    alert('Gagal memuat kalender: ' + err.message);
  }
}

function renderShiftLegend() {
  const container = document.getElementById('shiftLegend');
  container.innerHTML = '';
  Object.entries(SHIFT_CODES).forEach(([code, info]) => {
    if (code === '') return;
    const el = document.createElement('span');
    el.className = 'shift-legend-item';
    el.innerHTML = '<span class="shift-legend-color" style="background:' + info.bg + '"></span>' + info.label;
    container.appendChild(el);
  });
}

function renderCalendarTable(roster, hariDalamBulan, shifts) {
  const thead = document.querySelector('#calendarTable thead tr');
  thead.innerHTML = '<th class="agent-col">Agent / Tanggal</th>';
  for (let d = 1; d <= hariDalamBulan; d++) {
    const date = new Date(roster.tahun, roster.bulan - 1, d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const th = document.createElement('th');
    th.textContent = d;
    th.style.width = '40px';
    th.style.minWidth = '40px';
    if (isWeekend) th.style.background = 'rgba(179,67,47,.1)';
    thead.appendChild(th);
  }

  const tbody = document.getElementById('calendarBody');
  tbody.innerHTML = '';

  // Build shift lookup: agent_index -> tanggal -> shift
  const shiftMap = {};
  shifts.forEach(s => {
    if (!shiftMap[s.agent_index]) shiftMap[s.agent_index] = {};
    shiftMap[s.agent_index][s.tanggal] = s.shift_code;
  });

  for (let i = 1; i <= roster.jumlah_karyawan; i++) {
    const tr = document.createElement('tr');
    const today = new Date();
    const dateToday = today.getDate();
    const monthMatch = today.getMonth() + 1 === roster.bulan && today.getFullYear() === roster.tahun;
    if (monthMatch) tr.classList.add('today');

    // Check if first day of month is weekend for row striping
    const firstDay = new Date(roster.tahun, roster.bulan - 1, 1).getDay();
    let hasWeekend = false;
    for (let d = 1; d <= hariDalamBulan; d++) {
      const dow = (firstDay + d - 1) % 7;
      if (dow === 0 || dow === 6) { hasWeekend = true; break; }
    }
    if (hasWeekend) tr.classList.add('weekend');

    // Agent name cell
    tr.innerHTML = '<td class="agent-col"><input type="text" value="' + (currentCalendarAgents[i] || 'Agent ' + i) + '" class="agent-name-input" data-agent="' + i + '" style="width:100%; border:none; background:transparent; font:inherit; font-weight:600;"></td>';

    // Shift cells
    for (let d = 1; d <= hariDalamBulan; d++) {
      const shiftCode = (shiftMap[i] && shiftMap[i][d]) || '';
      const shiftInfo = SHIFT_CODES[shiftCode] || SHIFT_CODES[''];
      const td = document.createElement('td');
      td.innerHTML = '<select class="shift-select shift-' + shiftCode + '" data-agent="' + i + '" data-tanggal="' + d + '" style="background:' + shiftInfo.bg + '; color:' + shiftInfo.color + ';">' +
        Object.entries(SHIFT_CODES).map(([c, inf]) => '<option value="' + c + '"' + (c === shiftCode ? ' selected' : '') + ' style="background:' + inf.bg + '; color:' + inf.color + ';">' + (c ? c : '—') + '</option>').join('') +
        '</select>';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  // Add change listeners
  tbody.querySelectorAll('.shift-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const agent = e.target.dataset.agent;
      const tanggal = e.target.dataset.tanggal;
      const val = e.target.value;
      e.target.className = 'shift-select shift-' + val;
      const info = SHIFT_CODES[val] || SHIFT_CODES[''];
      e.target.style.background = info.bg;
      e.target.style.color = info.color;
    });
  });

  tbody.querySelectorAll('.agent-name-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      currentCalendarAgents[e.target.dataset.agent] = e.target.value;
    });
  });
}

document.getElementById('saveAllShiftsBtn').addEventListener('click', async () => {
  if (!currentCalendarRosterId) { alert('Belum ada roster dipilih'); return; }
  const shifts = [];
  document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
    const agent = parseInt(sel.dataset.agent, 10);
    const tanggal = parseInt(sel.dataset.tanggal, 10);
    const code = sel.value;
    if (code) shifts.push({ agent_index: agent, tanggal, shift_code: code });
  });
  try {
    await saveShifts(currentCalendarRosterId, shifts);
    alert('Shift berhasil disimpan! (' + shifts.length + ' entries)');
  } catch (err) {
    alert('Gagal menyimpan shift: ' + err.message);
  }
});

document.getElementById('autoFillWeekendsBtn').addEventListener('click', async () => {
  if (!currentCalendarRosterId) return;
  const roster = await getRostering(currentCalendarRosterId);
  const hariDalamBulan = new Date(roster.tahun, roster.bulan - 1, 0).getDate();
  const firstDay = new Date(roster.tahun, roster.bulan - 1, 1).getDay();
  document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
    const d = parseInt(sel.dataset.tanggal, 10);
    const dow = (firstDay + d - 1) % 7;
    if ((dow === 0 || dow === 6) && !sel.value) {
      sel.value = 'L';
      sel.dispatchEvent(new Event('change'));
    }
  });
});

// ============ TAB 3: KELOLA DATA ============
async function loadManageList() {
  const container = document.getElementById('manageList');
  const empty = document.getElementById('manageEmpty');
  try {
    const rosters = await apiFetch('/api/rostering');
    if (!rosters.length) {
      empty.textContent = 'Belum ada roster tersimpan.';
      empty.style.display = 'block';
      container.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    container.style.display = 'block';
    container.innerHTML = rosters.map(r => {
      const tgl = new Date(r.created_at);
      const tglStr = tgl.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
      return '<div class="saved-roster">' +
        '<div class="saved-roster-info">' +
          '<span class="saved-roster-title">' + MONTHS[r.bulan] + ' ' + r.tahun + '</span>' +
          '<span class="saved-roster-meta">' + r.jumlah_karyawan + ' karyawan • ' + r.hari_libur_nasional + ' libur nasional • ' + r.cuti_bersama + ' cuti bersama • Dibuat: ' + tglStr + '</span>' +
        '</div>' +
        '<div class="saved-roster-actions">' +
          '<button class="btn-ghost btn-sm edit-roster" data-id="' + r.id + '">Edit</button>' +
          '<button class="btn-ghost btn-sm view-shifts" data-id="' + r.id + '">Lihat Shift</button>' +
          '<button class="btn-danger btn-sm delete-roster" data-id="' + r.id + '">Hapus</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.edit-roster').forEach(btn => {
      btn.addEventListener('click', () => editRoster(btn.dataset.id));
    });
    container.querySelectorAll('.view-shifts').forEach(btn => {
      btn.addEventListener('click', () => viewShifts(btn.dataset.id));
    });
    container.querySelectorAll('.delete-roster').forEach(btn => {
      btn.addEventListener('click', () => deleteRoster(btn.dataset.id));
    });
  } catch (err) {
    empty.textContent = 'Gagal memuat: ' + err.message;
  }
}

async function editRoster(id) {
  const roster = await getRostering(id);
  document.getElementById('rosterBulan').value = roster.bulan;
  document.getElementById('rosterTahun').value = roster.tahun;
  document.getElementById('rosterJumlahKaryawan').value = roster.jumlah_karyawan;
  document.getElementById('rosterHariLiburNasional').value = roster.hari_libur_nasional;
  document.getElementById('rosterCutiBersama').value = roster.cuti_bersama;
  editingRosterId = id;
  document.querySelector('.roster-tabs button[data-tab="create"]').click();
  document.getElementById('generateRosterBtn').textContent = 'Update Roster';
}

async function viewShifts(id) {
  currentCalendarRosterId = id;
  document.querySelector('.roster-tabs button[data-tab="calendar"]').click();
  document.getElementById('calRosterSelect').value = id;
  await loadCalendar(id);
}

async function deleteRoster(id) {
  if (!confirm('Yakin hapus roster ini? Semua shift juga akan terhapus.')) return;
  try {
    await deleteRostering(id);
    alert('Roster dihapus');
    loadManageList();
    loadCalendarRosterList();
  } catch (err) {
    alert('Gagal hapus: ' + err.message);
  }
}

// Initial load
loadManageList();
loadCalendarRosterList();

// loadRosterings — list all saved rosters for reference
async function loadRosterings() {
  try {
    return await apiFetch('/api/rostering');
  } catch (err) {
    console.error('Failed to load rosters:', err);
    return [];
  }
}
</script>
</body>
</html>`;

export async function onRequestGet(context) {
  return new Response(ROSTERING_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}