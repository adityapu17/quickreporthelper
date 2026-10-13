// Functions/rostering.js — single-page rostering: pick month/year → calendar view with inline editing

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

  header{padding:20px 24px 14px; border-bottom:1px solid var(--line); background:var(--card); display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;}
  header h1{margin:0; font-size:18px; letter-spacing:-0.01em; font-weight:700; font-family:var(--heading);}
  .header-account{display:flex; align-items:center; gap:10px; font-size:12px; color:var(--slate-soft); white-space:nowrap;}
  .header-account button{background:none; border:1px solid var(--line); border-radius:6px; padding:5px 11px; font-size:12px; cursor:pointer; color:var(--slate); font-family:var(--sans);}
  .header-account button:hover{background:var(--paper);}

  .bot-helper{ position:relative; }
  .bot-helper button{ border:none; border-radius:10px; width:36px; height:36px; padding:2px; background:none; cursor:pointer; }
  .bot-helper button:hover{ background:var(--paper); }
  @keyframes botFloat{ 0%,100%{transform:translateY(0);} 50%{transform:translateY(-2px);} }
  .bot-helper button img{ width:100%; height:100%; object-fit:contain; display:block; animation:botFloat 3.2s ease-in-out infinite; }
  .bot-bubble{
    position:absolute; top:calc(100% + 10px); right:0; width:260px;
    background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px;
    font-size:12px; line-height:1.5; color:var(--ink); box-shadow:0 6px 20px rgba(20,30,45,.14);
    display:none; z-index:30; text-align:left; white-space:normal; overflow-wrap:break-word;
  }
  .bot-bubble.show{ display:block; animation:popIn .18s ease; }
  .bot-bubble::after{ content:''; position:absolute; top:-6px; right:13px; width:11px; height:11px; background:#fff; border-left:1px solid var(--line); border-top:1px solid var(--line); transform:rotate(45deg); }
  .bot-bubble b{ display:block; margin-bottom:4px; color:var(--teal); }

  .wrap{max-width:1600px; margin:0 auto; padding:16px 24px 48px;}

  .card{background:var(--card); border:1px solid var(--line); border-radius:10px; margin-bottom:16px; overflow:hidden; box-shadow:0 1px 2px rgba(20,30,45,.04);}
  .card h2{margin:0; padding:12px 16px; font-size:13.5px; font-weight:700; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; background:#fbfcfd; font-family:var(--heading);}

  .btn-primary{ background:var(--teal); border:1px solid var(--teal); color:#fff; font-weight:600; border-radius:7px; padding:8px 16px; font-size:13px; cursor:pointer; }
  .btn-primary:hover{ filter:brightness(1.05); }
  .btn-ghost{ font-family:var(--sans); font-size:13px; border-radius:7px; border:1px solid var(--line); padding:7px 14px; background:var(--card); color:var(--ink); cursor:pointer; }
  .btn-ghost:hover{ background:var(--paper); }
  .btn-danger{ background:var(--red); border:1px solid var(--red); color:#fff; font-weight:600; border-radius:7px; padding:8px 16px; font-size:13px; cursor:pointer; }
  .btn-sm{ font-size:11.5px; padding:4px 10px; }

  .empty-state{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:32px; text-align:center; color:var(--slate-soft); font-size:13.5px; }

  /* Month/Year picker */
  .picker-bar{display:flex; gap:12px; align-items:end; flex-wrap:wrap; padding:16px;}
  .picker-field{display:flex; flex-direction:column; gap:4px;}
  .picker-field label{font-size:11px; font-weight:700; color:var(--slate-soft); text-transform:uppercase; letter-spacing:.03em;}
  .picker-field select, .picker-field input[type=number]{font-family:var(--sans); font-size:13.5px; border-radius:7px; border:1px solid var(--line); padding:8px 12px; background:var(--card); color:var(--ink); min-width:140px;}

  /* Calendar */
  .calendar-wrap{overflow-x:auto; overflow-y:auto; max-height:650px;}
  .calendar-table{width:100%; border-collapse:collapse; font-size:11.5px; min-width:max-content; table-layout:fixed;}
  .calendar-table th{position:sticky; top:0; background:#fbfcfd; z-index:10; text-align:center; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--slate-soft); padding:6px 3px; border-bottom:1.5px solid var(--line); font-weight:700;}
  .calendar-table th.agent-col{position:sticky; left:0; width:190px; min-width:190px; background:#fbfcfd; z-index:20; text-align:left; padding:6px 10px;}
  .calendar-table td{text-align:center; padding:3px 2px; border-bottom:1px solid #eef1f4; border-right:1px solid #eef1f4; height:34px; vertical-align:middle;}
  .calendar-table td.agent-col{position:sticky; left:0; width:190px; min-width:190px; background:var(--card); z-index:15; text-align:left; padding:6px 10px; font-weight:600; font-size:11.5px;}
  .calendar-table tr:hover td.agent-col{background:var(--teal-soft);}
  .calendar-table tr.today td{background:rgba(15,122,107,.08);}
  .calendar-table tr.weekend td{background:rgba(179,67,47,.05);}

  .section-row td{background:var(--teal-soft); font-weight:600; font-size:11px; text-align:center; padding:8px; border-top:2px solid var(--line);}
  .section-row td:first-child{background:var(--teal-soft);}

  .shift-select{width:100%; height:100%; border:none; background:transparent; font-size:10.5px; font-weight:600; text-align:center; cursor:pointer; padding:1px; border-radius:3px;}
  .shift-select:focus{outline:none; background:var(--teal-soft);}
  /* New shift code colors */
  .shift-OFF{background:rgba(25,135,84,.18); color:#198754;}      /* Green */
  .shift-CT{background:rgba(13,110,253,.18); color:#0d6efd;}      /* Blue */
  .shift-TR{background:rgba(253,126,20,.18); color:#fd7e14;}      /* Orange */
  .shift--{background:rgba(220,53,69,.18); color:#dc3545;}       /* Red */
  /* Other shift codes: black/white, no color bg */
  .shift-B2,.shift-C2,.shift-D1,.shift-D2,.shift-E2,.shift-F1,.shift-H1,.shift-I2,.shift-J1,.shift-K1,.shift-L,.shift-M{background:transparent; color:#111827;}
  .shift-empty{background:transparent; color:var(--slate-soft);}

  /* Agent name dropdown styling */
  .agent-name-select{width:100%; height:100%; border:none; background:transparent; font-size:10.5px; font-weight:600; text-align:left; cursor:pointer; padding:1px; border-radius:3px; color:#111827;}
  .agent-name-select:focus{outline:none; background:var(--teal-soft);}

  .shift-legend{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; font-size:10.5px; padding:0 4px;}
  .shift-legend-item{display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:4px; background:var(--paper); border:1px solid var(--line);}
  .shift-legend-color{width:10px; height:10px; border-radius:2px;}

  .agent-name-input{width:100%; border:none; background:transparent; font:inherit; font-weight:600; font-size:11.5px; color:var(--ink); padding:2px 4px;}
  .agent-name-input:focus{outline:none; background:var(--teal-soft); border-radius:3px;}

  .agent-row-name{width:100%; min-width:180px; display:flex; align-items:center; gap:6px;}
  .agent-name-wrapper{display:flex; align-items:center; gap:4px;}
  .agent-delete-btn{background:none; border:1px solid var(--line); border-radius:3px; width:22px; height:22px; cursor:pointer; color:var(--red); font-size:9px; display:flex; align-items:center; justify-content:center;}

  .toolbar{display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px 16px; border-top:1px solid var(--line); background:#fafbfc;}
  .toolbar-left{display:flex; gap:8px; align-items:center;}
  .toolbar-right{margin-left:auto; display:flex; gap:8px; align-items:center;}

  .roster-info{font-size:12px; color:var(--slate); font-weight:500;}

  /* Dropdown for tambah agent */
  #addAgentDropdownContainer{position:relative; display:inline-block;}
  #addAgentDropdown{width:0; height:0; opacity:0; position:absolute; cursor:pointer;}
  #addAgentOptions{
    position:absolute; bottom:100%; left:0; background:var(--card); border:1px solid var(--line); border-radius:6px;
    box-shadow:0 4px 12px rgba(20,30,45,.14); padding:4px; min-width:140px; z-index:100; display:none;
    flex-direction:column; gap:2px;
  }
  #addAgentOptions button{width:100%; text-align:left; padding:6px 10px; font-size:12px; border:none; background:none; color:var(--ink); cursor:pointer; border-radius:4px;}
  #addAgentOptions button:hover{background:var(--paper);}

  @media (max-width:900px){
    .calendar-table th.agent-col,.calendar-table td.agent-col{width:150px; min-width:150px;}
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
        <b>Cara pakai</b>
        <div style="margin-top:6px;">1. Pilih <b>Bulan</b> & <b>Tahun</b>, klik <b>Buka Kalender</b></div>
        <div style="margin-top:3px;">2. Kalender langsung terbuka — edit nama agent & pilih shift per tanggal</div>
        <div style="margin-top:3px;">3. <b>+ Tambah Agent</b> — pilih grup (Supervisor/EOS/Helpdesk)</div>
        <div style="margin-top:3px;">4. <b>Isi Weekend (L)</b> otomatis mengisi Sabtu/Minggu</div>
        <div style="margin-top:3px;">5. <b>Ekspor Excel</b> / <b>Simpan Semua</b> ke database</div>
      </div>
    </div>
    <button id="btn-logout">Logout</button>
  </div>
</header>

<div class="wrap">
  <!-- PICKER SECTION -->
  <div class="card" id="pickerCard">
    <h2>Pilih Bulan & Tahun</h2>
    <div class="picker-bar">
      <div class="picker-field">
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
      <div class="picker-field">
        <label for="rosterTahun">Tahun</label>
        <input type="number" id="rosterTahun" min="2020" max="2100" placeholder="2026" required>
      </div>
      <div style="margin-left:auto; display:flex; gap:8px; align-items:end;">
        <button class="btn-primary" id="openCalendarBtn">Buka Kalender</button>
        <button class="btn-ghost" id="loadExistingBtn">Muat Roster Ada</button>
      </div>
    </div>
    <div class="empty-state" id="pickerHint" style="margin:0 16px 16px; display:none;">Belum ada roster untuk bulan/tahun ini. Klik <b>Buka Kalender</b> untuk buat baru (otomatis disimpan saat pertama kali buka).</div>
  </div>

  <!-- CALENDAR SECTION (hidden initially) -->
  <div class="card" id="calendarCard" style="display:none;">
    <h2>
      <span id="calendarTitle">Kalender Shift</span>
      <span class="roster-info" id="calendarMeta"></span>
    </h2>
    <div class="shift-legend" id="shiftLegend"></div>
    <div class="calendar-wrap" id="calendarWrap">
      <div class="empty-state" id="calendarEmpty">Memuat kalender...</div>
      <table class="calendar-table" id="calendarTable" style="display:none;">
        <thead>
          <tr>
            <th class="agent-col">Agent / Tanggal</th>
          </tr>
        </thead>
        <tbody id="calendarBody"></tbody>
      </table>
    </div>
    <div class="toolbar">
        <div class="toolbar-left">
        <!-- Tambah Agent with dropdown -->
        <div id="addAgentDropdownContainer" style="position:relative; display:inline-block;">
          <button class="btn-ghost btn-sm" id="addAgentDropdownBtn" style="cursor:pointer;">+ Tambah Agent ▼</button>
          <div id="addAgentOptions">
            <button data-group="Supervisor">Supervisor</button>
            <button data-group="Engineer on Site (EOS)">Engineer on Site (EOS)</button>
            <button data-group="Helpdesk">Helpdesk</button>
          </div>
        </div>
        <button class="btn-ghost btn-sm" id="manageRostersBtn">Kelola Roster</button>
        <button class="btn-ghost btn-sm" id="autoFillWeekendsBtn">Isi Weekend (OFF)</button>
        <button class="btn-ghost btn-sm" id="clearAllBtn">Kosongkan Semua</button>
      </div>
      <div class="toolbar-right">
        <button class="btn-ghost btn-sm" id="exportExcelBtn">Ekspor Excel</button>
        <button class="btn-primary" id="saveAllShiftsBtn">Simpan Semua Shift</button>
        <button class="btn-ghost" id="backToPickerBtn">← Ganti Bulan/Tahun</button>
      </div>
    </div>
  </div>

  <!-- MANAGE ROSTER SECTION (hidden initially) -->
  <div class="card" id="manageCard" style="display:none;">
    <h2>
      <span>Kelola Roster Tersimpan</span>
    </h2>
    <div id="manageListContent" style="padding:4px;">
      <div class="empty-state" id="manageEmptyList">Memuat...</div>
      <div id="manageList" style="display:none;"></div>
    </div>
  </div>
</div>

<script>
// Wait for DOM to be fully ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    document.getElementById('btn-bot').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('bot-bubble').classList.toggle('show'); });
    document.addEventListener('click', (e) => { const b = document.getElementById('bot-bubble'); if (b.classList.contains('show') && !e.target.closest('.bot-helper')) b.classList.remove('show'); });
    document.getElementById('btn-logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; });
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => { if (d && d.email) document.getElementById('whoami').textContent = d.email; }).catch(() => {});
  } catch (err) {
    console.error('Init error:', err);
  }

  const MONTHS = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAY_NAMES = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const SHIFT_CODES = {
  'B2': {label:'B2', color:'#111827', bg:'transparent'},
  'C2': {label:'C2', color:'#111827', bg:'transparent'},
  'D1': {label:'D1', color:'#111827', bg:'transparent'},
  'D2': {label:'D2', color:'#111827', bg:'transparent'},
  'E2': {label:'E2', color:'#111827', bg:'transparent'},
  'F1': {label:'F1', color:'#111827', bg:'transparent'},
  'H1': {label:'H1', color:'#111827', bg:'transparent'},
  'I2': {label:'I2', color:'#111827', bg:'transparent'},
  'J1': {label:'J1', color:'#111827', bg:'transparent'},
  'K1': {label:'K1', color:'#111827', bg:'transparent'},
  'L':  {label:'L',  color:'#111827', bg:'transparent'},
  'M':  {label:'M',  color:'#111827', bg:'transparent'},
  'OFF':{label:'OFF',color:'#198754', bg:'rgba(25,135,84,.18)'},
  'CT': {label:'CT', color:'#0d6efd', bg:'rgba(13,110,253,.18)'},
  'TR': {label:'TR', color:'#fd7e14', bg:'rgba(253,126,20,.18)'},
  '-':  {label:'-',  color:'#dc3545', bg:'rgba(220,53,69,.18)'},
  '':   {label:'—',  color:'var(--slate-soft)', bg:'transparent'}
};

// Initial section definitions — these define the ORDER and DEFAULT colors
// The agent-to-section mapping is stored in a data structure, not hardcoded
const SECTION_DEFS = [
  {name:'Supervisor', count:3, color:'#e8f5e9'},
  {name:'Engineer on Site (EOS)', count:4, color:'#fff3e0'},
  {name:'Helpdesk', count:99, color:'#e3f2fd'}
];

// Preset agent names dropdown
const PRESET_AGENT_NAMES = [
  'Kelana Fransiscus Sianipar',
  'Aditya Putra Patria',
  'Dien Darul Dienurillah',
  'Gusti Frans Gunawan',
  'Hasudungan Silaban',
  'Ade Bahtiar Soleh',
  'Rizki Muhammad',
  'Aji Fikrian Akbar',
  'Yohanes Harryanto',
  'Agus Rudiansyah',
  'Deki Ahmad Fauzi',
  'Pendi Suhendi',
  'M. Ilham Saputra',
  'Ahmad Ridwan',
  'Muhammad Panji Dwi Nugroho'
];

// NS = count of codes E2, F1, H1, I2, J1, K1, L, M (per JIDWIL 2026)
function isNSCode(code) {
  return code === 'E2' || code === 'F1' || code === 'H1' || code === 'I2' || code === 'J1' || code === 'K1' || code === 'L' || code === 'M';
}
// LS = count of L + M only
function isLSCode(code) {
  return code === 'L' || code === 'M';
}
// OFF = count of "OFF"; CT = count of "CT"
// TOTAL HL = OFF + CT ; TOTAL HK = total_day_cols - TOTAL_HL

// Compute per-agent stats (mirrors the JIDWIL 2026 sheet formulas)
function computeAgentStatsForRow(shiftsForAgent, daysInMonth) {
  let NS = 0, LS = 0, OFF = 0, CT = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const code = shiftsForAgent[d] || '';
    if (isNSCode(code)) NS++;
    if (isLSCode(code)) LS++;
    if (code === 'OFF') OFF++;
    if (code === 'CT') CT++;
  }
  const TOTAL_HL = OFF + CT;
  const TOTAL_HK = daysInMonth - TOTAL_HL;
  return { NS, LS, OFF, CT, TOTAL_HL, TOTAL_HK };
}

// Section layout: which agent belongs to which section
// { agentIndex -> sectionName }
let agentSections = {};

let currentRoster = null;
let currentCalendarAgents = {};
let shiftMap = {};
let currentRosterId = null;

// Helper: format date as "1-Oct-26"
function formatDateShort(date) {
  const day = date.getDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[date.getMonth()];
  const yr = String(date.getFullYear()).slice(-2);
  return day + '-' + mon + '-' + yr;
}

// Helper: format day name as "Mon", "Tue", ...
function dayNameShort(date) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[date.getDay()];
}

// ============ API HELPERS ============
async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({error: 'Request failed'}));
    throw new Error(err.error || 'Request failed: ' + res.status);
  }
  return res.json();
}

async function upsertRostering(bulan, tahun, jumlahKaryawan, hariLiburNasional, cutiBersama) {
  return apiFetch('/api/rostering', {
    method: 'POST',
    body: JSON.stringify({ bulan, tahun, jumlah_karyawan: jumlahKaryawan, hari_libur_nasional: hariLiburNasional, cuti_bersama: cutiBersama })
  });
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

async function checkExistingRoster(bulan, tahun) {
  const rosters = await apiFetch('/api/rostering');
  return rosters.find(r => r.bulan === bulan && r.tahun === tahun) || null;
}

async function openCalendar(bulan, tahun) {
  let existing = null;
  try {
    existing = await checkExistingRoster(bulan, tahun);
  } catch (err) {
    console.error('Failed to check existing roster:', err);
  }
  if (existing) {
    currentRosterId = existing.id;
    currentRoster = existing;
    await openCalendarFromRoster(existing);
    return;
  }
  // New roster: default 10 agents, sections assigned in order (3 Sup, 4 EOS, rest Helpdesk)
  const jumlahDefault = 10;
  currentRoster = { bulan: bulan, tahun: tahun, jumlah_karyawan: jumlahDefault, hari_libur_nasional: 0, cuti_bersama: 0, id: null };
  currentRosterId = null;
  currentCalendarAgents = {};
  shiftMap = {};
  agentSections = {};
  // Assign default sections (3 Supervisor, 4 EOS, rest Helpdesk)
  for (let i = 1; i <= jumlahDefault; i++) {
    if (i <= 3) agentSections[i] = 'Supervisor';
    else if (i <= 7) agentSections[i] = 'Engineer on Site (EOS)';
    else agentSections[i] = 'Helpdesk';
    currentCalendarAgents[i] = 'Agent ' + i;
  }
  // Persist new roster to DB so it gets an ID
  try {
    const result = await upsertRostering(bulan, tahun, jumlahDefault, 0, 0);
    currentRosterId = result.id;
    currentRoster.id = result.id;
  } catch (err) {
    console.error('Failed to create roster:', err);
  }
  showCalendarView();
  renderCalendar();
}

async function openCalendarFromRoster(roster) {
  currentRoster = roster;
  currentRosterId = roster.id;
  showCalendarView();
  try {
    const shifts = await getShifts(roster.id);
    buildShiftMap(shifts);
    shifts.forEach(s => {
      if (!currentCalendarAgents[s.agent_index]) currentCalendarAgents[s.agent_index] = 'Agent ' + s.agent_index;
    });
    // Assign default sections for agents that don't have one
    // 3 Supervisor (idx 1-3), 4 EOS (idx 4-7), rest Helpdesk
    for (let i = 1; i <= roster.jumlah_karyawan; i++) {
      if (!agentSections[i]) {
        if (i <= 3) {
          agentSections[i] = 'Supervisor';
        } else if (i <= 7) {
          agentSections[i] = 'Engineer on Site (EOS)';
        } else {
          agentSections[i] = 'Helpdesk';
        }
      }
      if (!currentCalendarAgents[i]) currentCalendarAgents[i] = 'Agent ' + i;
    }
    renderCalendar();
  } catch (err) {
    alert('Gagal memuat shift: ' + err.message);
    renderCalendar();
  }
}

function showCalendarView() {
  document.getElementById('pickerCard').style.display = 'none';
  document.getElementById('calendarCard').style.display = 'block';
  document.getElementById('calendarTitle').textContent = MONTHS[currentRoster.bulan] + ' ' + currentRoster.tahun;
  updateCalendarMeta();
}

function updateCalendarMeta() {
  const counts = {};
  Object.values(agentSections).forEach(s => counts[s] = (counts[s] || 0) + 1);
  const metaText = 'Total: ' + currentRoster.jumlah_karyawan + ' agent • ' +
    Object.entries(counts).map(([k,v]) => v + ' ' + k).join(', ');
  document.getElementById('calendarMeta').textContent = metaText;
}

// Build per-agent stats row: NS, LS, OFF, CT, TOTAL HL, TOTAL HK
// Per-agent stats using JIDWIL 2026 sheet formulas
function computeAgentStats(agentIdx) {
  const hariDalamBulan = new Date(currentRoster.tahun, currentRoster.bulan, 0).getDate();
  const shiftsForAgent = shiftMap[agentIdx] || {};
  return computeAgentStatsForRow(shiftsForAgent, hariDalamBulan);
}

// Render per-agent stat strip below the calendar table
function renderCalendarStats() {
  const statsContainer = document.getElementById('calendarStats') || (() => {
    const el = document.createElement('div');
    el.id = 'calendarStats';
    el.style.cssText = 'margin-top:8px; font-size:10px;';
    const wrap = document.getElementById('calendarWrap');
    if (wrap) wrap.appendChild(el);
    return el;
  })();
  if (!currentRoster) { statsContainer.innerHTML = ''; return; }

  const ordered = Object.keys(currentCalendarAgents).map(Number).sort((a,b)=>a-b);
  let html = '<div style="display:flex; flex-direction:column; gap:4px;">';
  ordered.forEach(idx => {
    const stats = computeAgentStats(idx);
    const name = currentCalendarAgents[idx] || ('Agent ' + idx);
    html += '<div style="border:1px solid var(--line); border-radius:4px; padding:4px 8px; background:var(--card-bg,#fff);">';
    html += '<b>' + name + '</b>: ';
    html += 'NS=' + stats.NS + ' | LS=' + stats.LS + ' | OFF=' + stats.OFF + ' | CT=' + stats.CT + ' | TOTAL HL=' + stats.TOTAL_HL + ' | TOTAL HK=' + stats.TOTAL_HK;
    html += '</div>';
  });
  // Team summary
  let sNS=0,sLS=0,sOFF=0,sCT=0;
  ordered.forEach(idx => { const s=computeAgentStats(idx); sNS+=s.NS; sLS+=s.LS; sOFF+=s.OFF; sCT+=s.CT; });
  const hariDalamBulan = new Date(currentRoster.tahun, currentRoster.bulan, 0).getDate();
  const grandHL = sOFF + sCT;
  const grandHK = hariDalamBulan * ordered.length - grandHL;
  html += '<div style="border-top:1px solid var(--line); padding-top:4px; font-weight:600; margin-top:4px;">Team: NS='+(sNS)+' LS='+(sLS)+' OFF='+(sOFF)+' CT='+(sCT)+' TOTAL HL='+(grandHL)+' TOTAL HK='+(grandHK)+'</div></div>';
  statsContainer.innerHTML = html;
}

function backToPicker() {
  document.getElementById('calendarCard').style.display = 'none';
  document.getElementById('pickerCard').style.display = 'block';
  document.getElementById('calendarEmpty').style.display = 'block';
  document.getElementById('calendarTable').style.display = 'none';
  currentRoster = null;
  currentRosterId = null;
  currentCalendarAgents = {};
  shiftMap = {};
  agentSections = {};
}

// ============ CALENDAR RENDERING ============
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

function buildShiftMap(shifts) {
  shiftMap = {};
  shifts.forEach(s => {
    if (!shiftMap[s.agent_index]) shiftMap[s.agent_index] = {};
    shiftMap[s.agent_index][s.tanggal] = s.shift_code;
  });
}

function renderCalendar() {
  if (!currentRoster) return;
  const hariDalamBulan = new Date(currentRoster.tahun, currentRoster.bulan, 0).getDate();
  const firstDayOfWeek = new Date(currentRoster.tahun, currentRoster.bulan - 1, 1).getDay();

  renderShiftLegend();

  const thead = document.querySelector('#calendarTable thead');
  thead.innerHTML = '';

  const dateHeaderRow = document.createElement('tr');
  const dayNameHeaderRow = document.createElement('tr');
  const dayNumberHeaderRow = document.createElement('tr');

  const agentHeader = document.createElement('th');
  agentHeader.className = 'agent-col';
  agentHeader.textContent = 'Agent / Tanggal';
  agentHeader.rowSpan = 3;
  agentHeader.style.background = '#fbfcfd';
  agentHeader.style.position = 'sticky';
  agentHeader.style.left = '0';
  agentHeader.style.zIndex = '20';
  agentHeader.style.padding = '6px 10px';
  agentHeader.style.borderBottom = '1.5px solid var(--line)';
  agentHeader.style.fontWeight = '700';
  agentHeader.style.fontSize = '9.5px';
  agentHeader.style.textTransform = 'uppercase';
  agentHeader.style.letterSpacing = '.04em';
  agentHeader.style.color = 'var(--slate-soft)';
  dateHeaderRow.appendChild(agentHeader);
  // Rows 2 & 3: NO first cell — agentHeader rowSpan=3 already covers this column

  for (let d = 1; d <= hariDalamBulan; d++) {
    const date = new Date(currentRoster.tahun, currentRoster.bulan - 1, d);
    const dayName = DAY_NAMES[date.getDay()];
    const isWeekend = (date.getDay() === 0 || date.getDay() === 6);

    // Row 1: date
    const dateTh = document.createElement('th');
    dateTh.textContent = d + '-' + MONTHS[currentRoster.bulan].substring(0,3) + '-' + String(currentRoster.tahun).slice(-2);
    dateTh.style.width = '56px';
    dateTh.style.minWidth = '56px';
    dateTh.style.padding = '6px 3px';
    dateTh.style.borderBottom = '1.5px solid var(--line)';
    dateTh.style.fontWeight = '700';
    dateTh.style.fontSize = '9.5px';
    dateTh.style.textAlign = 'center';
    dateTh.style.textTransform = 'uppercase';
    dateTh.style.letterSpacing = '.04em';
    dateTh.style.color = 'var(--slate-soft)';
    if (isWeekend) dateTh.style.background = 'rgba(179,67,47,.05)';
    dateHeaderRow.appendChild(dateTh);

    // Row 2: day name
    const dayNameTh = document.createElement('th');
    dayNameTh.textContent = dayName;
    dayNameTh.style.width = '56px';
    dayNameTh.style.minWidth = '56px';
    dayNameTh.style.padding = '2px 3px';
    dayNameTh.style.borderBottom = '1.5px solid var(--line)';
    dayNameTh.style.fontWeight = '600';
    dayNameTh.style.fontSize = '9px';
    dayNameTh.style.textAlign = 'center';
    dayNameTh.style.color = isWeekend ? 'var(--red)' : 'var(--slate-soft)';
    dayNameHeaderRow.appendChild(dayNameTh);

    // Row 3: day number
    const dayNumTh = document.createElement('th');
    dayNumTh.textContent = d;
    dayNumTh.style.width = '56px';
    dayNumTh.style.minWidth = '56px';
    dayNumTh.style.padding = '2px 3px';
    dayNumTh.style.borderBottom = '1.5px solid var(--line)';
    dayNumTh.style.fontWeight = '600';
    dayNumTh.style.fontSize = '9px';
    dayNumTh.style.textAlign = 'center';
    dayNumTh.style.color = isWeekend ? 'var(--red)' : 'var(--slate-soft)';
    dayNumberHeaderRow.appendChild(dayNumTh);
  }

  thead.appendChild(dateHeaderRow);
  thead.appendChild(dayNameHeaderRow);
  thead.appendChild(dayNumberHeaderRow);

  // Build tbody with dynamic sections
  const tbody = document.getElementById('calendarBody');
  tbody.innerHTML = '';

  // Build ordered list of (agentIndex, sectionName) pairs and group them
  const agentOrder = [];
  for (let i = 1; i <= currentRoster.jumlah_karyawan; i++) {
    const sec = agentSections[i] || 'Helpdesk';
    agentOrder.push({idx: i, section: sec});
  }

  // Sort by SECTION_DEFS order so agents of the same section are grouped together
  // even if they were added out of order (e.g., EOS added after Helpdesk)
  const sectionSortOrder = {};
  SECTION_DEFS.forEach((s, i) => { sectionSortOrder[s.name] = i; });
  agentOrder.sort((a, b) => {
    const oa = sectionSortOrder[a.section] !== undefined ? sectionSortOrder[a.section] : 99;
    const ob = sectionSortOrder[b.section] !== undefined ? sectionSortOrder[b.section] : 99;
    return oa - ob;
  });

  // Group by section (now agents of same section are contiguous)
  const sectionGroups = [];
  let currentGroup = null;
  agentOrder.forEach(a => {
    if (currentGroup && currentGroup.section === a.section) {
      currentGroup.agents.push(a.idx);
    } else {
      currentGroup = {section: a.section, agents: [a.idx]};
      sectionGroups.push(currentGroup);
    }
  });

  sectionGroups.forEach((group) => {
    const secDef = SECTION_DEFS.find(s => s.name === group.section) || {name: group.section, count: group.agents.length, color:'#f0f4f8'};

    // Section header row — match thead structure: agent-col cell + span for day columns
    const sectionRow = document.createElement('tr');
    sectionRow.className = 'section-row';
    
    // First cell: corresponds to sticky agent column (blank but same width)
    const agentColCell = document.createElement('td');
    agentColCell.className = 'agent-col';
    agentColCell.style.position = 'sticky';
    agentColCell.style.left = '0';
    agentColCell.style.zIndex = '15';
    agentColCell.style.background = secDef.color;
    agentColCell.style.padding = '8px 10px';
    agentColCell.style.borderBottom = '1px solid #eef1f4';
    agentColCell.style.borderRight = '1px solid #eef1f4';
    agentColCell.style.fontWeight = '600';
    agentColCell.style.fontSize = '11px';
    agentColCell.style.width = '190px';
    agentColCell.style.minWidth = '190px';
    sectionRow.appendChild(agentColCell);
    
    // Second cell: spans all day columns
    const sectionCell = document.createElement('td');
    sectionCell.colSpan = hariDalamBulan;
    sectionCell.textContent = group.section;
    sectionCell.style.background = secDef.color;
    sectionCell.style.fontWeight = '600';
    sectionCell.style.fontSize = '11px';
    sectionCell.style.textAlign = 'center';
    sectionCell.style.padding = '8px';
    sectionCell.style.borderTop = '2px solid var(--line)';
    sectionCell.style.borderBottom = '1px solid #eef1f4';
    sectionRow.appendChild(sectionCell);
    tbody.appendChild(sectionRow);

    // Agent rows for this section
    group.agents.forEach(agentIndex => {
      const tr = document.createElement('tr');

      // Agent name cell (sticky)
      const agentNameCell = document.createElement('td');
      agentNameCell.className = 'agent-col';
      agentNameCell.style.position = 'sticky';
      agentNameCell.style.left = '0';
      agentNameCell.style.zIndex = '15';
      agentNameCell.style.background = 'var(--card)';
      agentNameCell.style.padding = '6px 10px';
      agentNameCell.style.borderBottom = '1px solid #eef1f4';
      agentNameCell.style.borderRight = '1px solid #eef1f4';

      const agentNameWrapper = document.createElement('div');
      agentNameWrapper.className = 'agent-row-name';

      // Dropdown nama agent — pilih dari 15 preset nama, atau ketik custom
      const agentNameSelect = document.createElement('select');
      agentNameSelect.className = 'agent-name-select';
      agentNameSelect.dataset.agent = agentIndex;
      // Add a "Custom" option slot + the preset names
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = ' — Pilih nama — ';
      agentNameSelect.appendChild(placeholder);
      PRESET_AGENT_NAMES.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        agentNameSelect.appendChild(opt);
      });
      // Set current value if it matches a preset; otherwise show placeholder but allow edit via "other"
      const currentName = currentCalendarAgents[agentIndex] || '';
      if (PRESET_AGENT_NAMES.includes(currentName)) {
        agentNameSelect.value = currentName;
      } else if (currentName) {
        // Non-preset name: add as a temporary option so it shows
        const custom = document.createElement('option');
        custom.value = currentName;
        custom.textContent = currentName + ' (custom) —';
        agentNameSelect.insertBefore(custom, agentNameSelect.children[1]);
        agentNameSelect.value = currentName;
      }
      agentNameSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          currentCalendarAgents[e.target.dataset.agent] = val;
        }
      });
      // Allow manual typing fallback — if user wants a custom name not in list,
      // they can type after double-clicking; for now dropdown is the primary UX.
      agentNameWrapper.appendChild(agentNameSelect);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Hapus agent ini';
      deleteBtn.className = 'agent-delete-btn';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Hapus agent ' + agentIndex + '?')) {
          deleteAgent(agentIndex);
        }
      };
      agentNameWrapper.appendChild(agentNameSelect);
      agentNameWrapper.appendChild(deleteBtn);
      agentNameCell.appendChild(agentNameWrapper);
      tr.appendChild(agentNameCell);

      // Shift cells for each day
      for (let d = 1; d <= hariDalamBulan; d++) {
        const shiftCode = (shiftMap[agentIndex] && shiftMap[agentIndex][d]) || '';
        const shiftInfo = SHIFT_CODES[shiftCode] || SHIFT_CODES[''];
        const td = document.createElement('td');
        td.style.padding = '3px 2px';
        td.style.borderBottom = '1px solid #eef1f4';
        td.style.borderRight = '1px solid #eef1f4';
        td.style.height = '34px';
        td.style.verticalAlign = 'middle';

        const dow = (firstDayOfWeek + d - 1) % 7;
        if (dow === 0 || dow === 6) td.classList.add('weekend');

        const select = document.createElement('select');
        select.className = 'shift-select shift-' + shiftCode;
        select.dataset.agent = agentIndex;
        select.dataset.tanggal = d;
        select.style.background = shiftInfo.bg;
        select.style.color = shiftInfo.color;

        for (const code in SHIFT_CODES) {
          if (SHIFT_CODES.hasOwnProperty(code)) {
            const inf = SHIFT_CODES[code];
            const option = document.createElement('option');
            option.value = code;
            if (code === shiftCode) option.selected = true;
            option.style.background = inf.bg;
            option.style.color = inf.color;
            if (code === '') option.textContent = '—';
            else option.textContent = code;
            select.appendChild(option);
          }
        }
        td.appendChild(select);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });
  });

  // Attach change listeners
  tbody.querySelectorAll('.shift-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const agent = parseInt(e.target.dataset.agent, 10);
      const tanggal = parseInt(e.target.dataset.tanggal, 10);
      const val = e.target.value;
      e.target.className = 'shift-select shift-' + val;
      const info = SHIFT_CODES[val] || SHIFT_CODES[''];
      e.target.style.background = info.bg;
      e.target.style.color = info.color;
      if (!shiftMap[agent]) shiftMap[agent] = {};
      if (val) shiftMap[agent][tanggal] = val;
      else delete shiftMap[agent][tanggal];
    });
  });

  document.getElementById('calendarEmpty').style.display = 'none';
  document.getElementById('calendarTable').style.display = 'table';
  updateCalendarMeta();
  renderCalendarStats();
}

function deleteAgent(agentIndex) {
  const deletedSection = agentSections[agentIndex];
  delete currentCalendarAgents[agentIndex];
  delete shiftMap[agentIndex];
  delete agentSections[agentIndex];
  // Re-index agents > agentIndex (shift down)
  const newAgents = {};
  const newShiftMap = {};
  const newAgentSections = {};
  let newIdx = 1;
  for (let i = 1; i <= currentRoster.jumlah_karyawan; i++) {
    if (i === agentIndex) continue;
    if (currentCalendarAgents[i]) newAgents[newIdx] = currentCalendarAgents[i];
    if (shiftMap[i]) newShiftMap[newIdx] = shiftMap[i];
    if (agentSections[i]) newAgentSections[newIdx] = agentSections[i];
    newIdx++;
  }
  currentCalendarAgents = newAgents;
  shiftMap = newShiftMap;
  agentSections = newAgentSections;
  currentRoster.jumlah_karyawan = newIdx - 1;
  renderCalendar();
}

// Tambah agent with dropdown — pick section
// Moved inside DOMContentLoaded
function addAgentToSection(sectionName) {
  currentRoster.jumlah_karyawan++;
  const newIdx = currentRoster.jumlah_karyawan;
  currentCalendarAgents[newIdx] = 'Agent ' + newIdx;
  agentSections[newIdx] = sectionName;

  // Collect all agents with their section + shifts, then re-sort by section order
  const allAgents = [];
  for (let i = 1; i <= newIdx; i++) {
    allAgents.push({
      name: currentCalendarAgents[i] || ('Agent ' + i),
      section: agentSections[i] || 'Helpdesk',
      shifts: shiftMap[i] || {}
    });
  }

  // Sort by SECTION_DEFS order — Helpdesk (catch-all) goes last
  const sectionOrder = {};
  SECTION_DEFS.forEach((s, i) => { sectionOrder[s.name] = i; });
  allAgents.sort((a, b) => {
    const oa = sectionOrder[a.section] !== undefined ? sectionOrder[a.section] : 99;
    const ob = sectionOrder[b.section] !== undefined ? sectionOrder[b.section] : 99;
    return oa - ob;
  });

  // Re-assign indices
  currentCalendarAgents = {};
  shiftMap = {};
  agentSections = {};
  for (let i = 0; i < allAgents.length; i++) {
    const idx = i + 1;
    currentCalendarAgents[idx] = allAgents[i].name;
    agentSections[idx] = allAgents[i].section;
    shiftMap[idx] = allAgents[i].shifts;
  }

  renderCalendar();
  setTimeout(() => {
    const rows = document.querySelectorAll('#calendarBody tr:not(.section-row)');
    if (rows[rows.length - 1]) rows[rows.length - 1].scrollIntoView({behavior:'smooth', block:'center'});
  }, 0);
}

// Default "+ Tambah Agent" (without dropdown) behavior when clicking the button directly
// Falls back to Helpdesk section
function addAgentDefault() {
  addAgentToSection('Helpdesk');
}

// Export to Excel — with sub-section headers (SPV, EOS, Helpdesk)
async function exportToExcel() {
  if (!currentRoster || !currentRosterId) {
    alert('Simpan roster dulu sebelum export');
    return;
  }
  try {
    const roster = await getRostering(currentRosterId);
    const shifts = await getShifts(currentRosterId);

    const hariDalamBulan = new Date(roster.tahun, roster.bulan, 0).getDate();
    const firstDay = new Date(roster.tahun, roster.bulan - 1, 1).getDay();

    // Build shift lookup
    const dbShiftMap = {};
    shifts.forEach(s => {
      if (!dbShiftMap[s.agent_index]) dbShiftMap[s.agent_index] = {};
      dbShiftMap[s.agent_index][s.tanggal] = s.shift_code;
    });

    // Build agent list in section order (same as renderCalendar)
    const agentOrder = [];
    for (let i = 1; i <= roster.jumlah_karyawan; i++) {
      agentOrder.push({idx: i, section: agentSections[i] || 'Helpdesk'});
    }
    // Group by section preserving SECTION_DEFS order
    const sectionOrder = {};
    SECTION_DEFS.forEach((s, i) => { sectionOrder[s.name] = i; });
    agentOrder.sort((a, b) => {
      const oa = sectionOrder[a.section] !== undefined ? sectionOrder[a.section] : 99;
      const ob = sectionOrder[b.section] !== undefined ? sectionOrder[b.section] : 99;
      return oa - ob;
    });
    const sectionGroups = [];
    let currentGroup = null;
    agentOrder.forEach(a => {
      if (currentGroup && currentGroup.section === a.section) {
        currentGroup.agents.push(a.idx);
      } else {
        currentGroup = {section: a.section, agents: [a.idx]};
        sectionGroups.push(currentGroup);
      }
    });

    // Build worksheet data — match JIDWIL 2026 sheet pattern
    const wsData = [];

    // Header row: Tanggal, then dates formatted "1-Oct-26", then stats columns
    const statsCols = ['NS', 'LS', 'OFF', 'CT', 'TOTAL HL', 'TOTAL HK'];
    const headerRow = ['Tanggal'];
    for (let d = 1; d <= hariDalamBulan; d++) {
      const date = new Date(roster.tahun, roster.bulan - 1, d);
      headerRow.push(formatDateShort(date));
    }
    // Add stats column headers
    headerRow.push(...statsCols);
    wsData.push(headerRow);

    // Day name row: Hari, then Mon/Tue/etc, then empty for stats cols
    const dayNameRow = ['Hari'];
    for (let d = 1; d <= hariDalamBulan; d++) {
      const date = new Date(roster.tahun, roster.bulan - 1, d);
      dayNameRow.push(DAY_NAMES[date.getDay()]);
    }
    // Add empty cells for stats columns
    dayNameRow.push(...Array(statsCols.length).fill(''));
    wsData.push(dayNameRow);

    // Section rows with agents — dedup section header (1x, not per line)
    const statOffset = hariDalamBulan + 1; // column after last date

    sectionGroups.forEach((group) => {
      const secDef = SECTION_DEFS.find(s => s.name === group.section) || {name: group.section};

      // Section header row (merged — fill all cells)
      const sectionRow = Array(hariDalamBulan + 1 + statsCols.length).fill('');
      sectionRow[0] = group.section;
      wsData.push(sectionRow);

      // Agent rows for this section
      group.agents.forEach(agentIdx => {
        const agentName = currentCalendarAgents[agentIdx] || ('Agent ' + agentIdx);
        const row = new Array(hariDalamBulan + 1 + statsCols.length).fill('');
        row[0] = agentName;

        // Fill shift codes per day
        const shiftsForAgent = dbShiftMap[agentIdx] || {};
        for (let d = 1; d <= hariDalamBulan; d++) {
          const code = shiftsForAgent[d] || '';
          row[d] = code;
        }

        // Compute stats per JIDWIL 2026 sheet formulas:
        // NS = COUNTIF(H*,I*,J*,K*,L,M)  // codes starting with H/I/J/K + L + M
        // LS = COUNTIF(L,M)  // L and M only
        // OFF = COUNTIF(OFF)
        // CT = COUNTIF(CT)
        // TOTAL HL = OFF + CT
        // TOTAL HK = hariDalamBulan - TOTAL HL
        const stats = computeAgentStatsForRow(shiftsForAgent, hariDalamBulan);
        row[statOffset + 0] = stats.NS;        // NS
        row[statOffset + 1] = stats.LS;        // LS
        row[statOffset + 2] = stats.OFF;       // OFF
        row[statOffset + 3] = stats.CT;        // CT
        row[statOffset + 4] = stats.TOTAL_HL;  // TOTAL HL
        row[statOffset + 5] = stats.TOTAL_HK;  // TOTAL HK

        wsData.push(row);
      });
    });

    // Create workbook with styling
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Styling colors (RGB hex for excel)
    const colorMap = {
      'OFF': 'ffcdd2',   // hijau light-ish? sheet: OFF green -> use light green
      'CT': 'bbd8f0',    // biru
      'TR': 'ffe0b2',    // oranye
      '-': 'f8d7da',    // merah
      '': 'ffffff'
    };
    // Use proper per requirement: OFF=green, CT=blue, TR=orange, -=red
    const excelColor = {
      'OFF': 'd4edda',  // light green
      'CT': 'cce5ff',   // light blue
      'TR': 'ffe5cc',   // light orange
      '-': 'f8d7da',    // light red
      '': 'ffffff'
    };

    const range = XLSX.utils.decode_range(ws['!ref'] || '');
    let rowIdx = 0;
    sectionGroups.forEach((group) => {
      // Find section header row (first row where col0 === group.section)
      let sectionHeaderRow = -1;
      for (let r = rowIdx; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({r, c: 0})];
        if (cell && cell.v === group.section) { sectionHeaderRow = r; break; }
      }
      if (sectionHeaderRow < 0) sectionHeaderRow = rowIdx;
      rowIdx = sectionHeaderRow + 1;

      // Style section header row — hijau muda background, bold font
      const secDef = SECTION_DEFS.find(s => s.name === group.section) || {name: group.section, color: '#E8F5E9'};
      const sectionHeaderColor = secDef.color || '#E8F5E9'; // light green from SECTION_DEFS
      for (let c = 0; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({r: sectionHeaderRow, c: c});
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            fill: {fgColor: {rgb: sectionHeaderColor.replace('#','')}},
            font: {bold: true},
            alignment: {horizontal: 'center'}
          };
        }
      }

      // Style header row (row 0) and day-name row (row 1) — hijau muda background
      const headerColor = '#E8F5E9'; // light green
      for (let r = 0; r <= 1; r++) {
        for (let c = 0; c <= range.e.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({r, c});
          if (ws[cellAddress]) {
            ws[cellAddress].s = Object.assign(ws[cellAddress].s || {}, {
              fill: {fgColor: {rgb: headerColor.replace('#','')}},
              font: {bold: r === 0 ? true : false}
            });
          }
        }
      }

      // Style shift cells (agent rows after this section header)
      const agentRowCount = group.agents.length;
      for (let r = sectionHeaderRow + 1; r <= sectionHeaderRow + agentRowCount; r++) {
        const agentRow = ws[XLSX.utils.encode_cell({r, c: 0})];
        // name cell bold
        if (agentRow) agentRow.s = Object.assign(agentRow.s || {}, {font: {bold: false}});
        for (let c = 1; c <= hariDalamBulan; c++) {
          const cellAddress = XLSX.utils.encode_cell({r, c});
          const cell = ws[cellAddress];
          if (cell && cell.v) {
            const col = excelColor[cell.v] || 'ffffff';
            cell.s = Object.assign(cell.s || {}, {fill: {fgColor: {rgb: col}}, font: {bold: true}});
          }
        }
      }

      rowIdx = sectionHeaderRow + 1 + agentRowCount;
    });

    XLSX.utils.book_append_sheet(wb, ws, MONTHS[roster.bulan] + ' ' + roster.tahun);
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = MONTHS[roster.bulan] + '_' + roster.tahun + '_Rostering.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Gagal export: ' + err.message);
  }
}

// ============ MANAGE ROSTER SECTION ============
async function loadManageList() {
  const container = document.getElementById('manageList');
  const empty = document.getElementById('manageEmptyList');
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
      const sectionCount = {};
      return '<div class="saved-roster">' +
        '<div class="saved-roster-info">' +
          '<span class="saved-roster-title">' + MONTHS[r.bulan] + ' ' + r.tahun + '</span>' +
          '<span class="saved-roster-meta">' + r.jumlah_karyawan + ' karyawan • Dibuat: ' + tglStr + '</span>' +
        '</div>' +
        '<div class="saved-roster-actions">' +
          '<button class="btn-ghost btn-sm edit-roster" data-id="' + r.id + '">Edit</button>' +
          '<button class="btn-danger btn-sm delete-roster" data-id="' + r.id + '">Hapus</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.edit-roster').forEach(btn => {
      btn.addEventListener('click', () => editManageRoster(btn.dataset.id));
    });
    container.querySelectorAll('.delete-roster').forEach(btn => {
      btn.addEventListener('click', () => deleteManageRoster(btn.dataset.id));
    });
  } catch (err) {
    empty.textContent = 'Gagal memuat: ' + err.message;
  }
}

let manageMode = false;

async function saveCurrentShifts() {
  if (!currentRoster) return;
  const shifts = [];
  document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
    const agent = parseInt(sel.dataset.agent, 10);
    const tanggal = parseInt(sel.dataset.tanggal, 10);
    const code = sel.value;
    if (code) shifts.push({ agent_index: agent, tanggal, shift_code: code });
  });
  try {
    if (!currentRosterId) {
      const result = await upsertRostering(currentRoster.bulan, currentRoster.tahun, currentRoster.jumlah_karyawan, currentRoster.hari_libur_nasional, currentRoster.cuti_bersama);
      currentRosterId = result.id;
      currentRoster.id = result.id;
    }
    await saveShifts(currentRosterId, shifts);
  } catch (err) {
    console.error('Save failed:', err);
  }
}

async function editManageRoster(id) {
  // Load roster ke calendar view
  const roster = await getRostering(id);
  currentRoster = roster;
  currentRosterId = roster.id;
  currentCalendarAgents = {};
  shiftMap = {};
  agentSections = {};
  showCalendarView();
  // Show calendar card
  document.getElementById('manageCard').style.display = 'none';
  document.getElementById('calendarCard').style.display = 'block';
  manageMode = false;
  // Assign sections + load shifts
  for (let i = 1; i <= roster.jumlah_karyawan; i++) {
    if (i <= 3) agentSections[i] = 'Supervisor';
    else if (i <= 7) agentSections[i] = 'Engineer on Site (EOS)';
    else agentSections[i] = 'Helpdesk';
    currentCalendarAgents[i] = 'Agent ' + i;
  }
  try {
    const shifts = await getShifts(roster.id);
    buildShiftMap(shifts);
    shifts.forEach(s => {
      if (!currentCalendarAgents[s.agent_index]) currentCalendarAgents[s.agent_index] = 'Agent ' + s.agent_index;
    });
    renderCalendar();
  } catch (err) {
    renderCalendar();
  }
}

async function deleteManageRoster(id) {
  const roster = await getRostering(id);
  if (!confirm('Hapus roster ' + MONTHS[roster.bulan] + ' ' + roster.tahun + '? Semua shift juga akan terhapus.')) return;
  try {
    await apiFetch('/api/rostering/' + id, { method: 'DELETE' });
    alert('Roster dihapus');
    await loadManageList();
  } catch (err) {
    alert('Gagal hapus: ' + err.message);
  }
}

// Initial: set default tahun to current year
  document.getElementById('rosterTahun').value = new Date().getFullYear();

  // ============ PICKER HANDLERS (inside DOMContentLoaded) ============
  document.getElementById('openCalendarBtn').addEventListener('click', async () => {
    const bulan = parseInt(document.getElementById('rosterBulan').value, 10);
    const tahun = parseInt(document.getElementById('rosterTahun').value, 10);
    if (!bulan || !tahun) { alert('Pilih bulan dan tahun terlebih dahulu'); return; }
    await openCalendar(bulan, tahun);
  });

  document.getElementById('loadExistingBtn').addEventListener('click', async () => {
    const bulan = parseInt(document.getElementById('rosterBulan').value, 10);
    const tahun = parseInt(document.getElementById('rosterTahun').value, 10);
    if (!bulan || !tahun) { alert('Pilih bulan dan tahun terlebih dahulu'); return; }
    const existing = await checkExistingRoster(bulan, tahun);
    if (existing) {
      currentRosterId = existing.id;
      currentRoster = existing;
      await openCalendarFromRoster(existing);
    } else {
      alert('Tidak ada roster untuk ' + MONTHS[bulan] + ' ' + tahun);
    }
  });

  document.getElementById('backToPickerBtn').addEventListener('click', backToPicker);

  // Tambah agent dropdown
  const addAgentOptions = document.getElementById('addAgentOptions');
  const addAgentDropdownBtn = document.getElementById('addAgentDropdownBtn');
  addAgentDropdownBtn.addEventListener('click', () => {
    if (addAgentOptions.style.display === 'block') addAgentOptions.style.display = 'none';
    else addAgentOptions.style.display = 'block';
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#addAgentDropdownContainer')) addAgentOptions.style.display = 'none';
  });
  addAgentOptions.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-group');
      addAgentToSection(section);
      addAgentOptions.style.display = 'none';
    });
  });

  // Toolbar buttons
  document.getElementById('autoFillWeekendsBtn').addEventListener('click', () => {
    if (!currentRoster) return;
    const firstDay = new Date(currentRoster.tahun, currentRoster.bulan - 1, 1).getDay();
    document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
      const d = parseInt(sel.dataset.tanggal, 10);
      const dow = (firstDay + d - 1) % 7;
      if ((dow === 0 || dow === 6) && !sel.value) {
        sel.value = 'OFF';
        sel.dispatchEvent(new Event('change'));
      }
    });
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Kosongkan SEMUA shift di kalender ini?')) return;
    document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
      sel.value = '';
      sel.dispatchEvent(new Event('change'));
    });
  });

  document.getElementById('saveAllShiftsBtn').addEventListener('click', async () => {
    if (!currentRoster) return;
    const shifts = [];
    document.querySelectorAll('#calendarBody .shift-select').forEach(sel => {
      const agent = parseInt(sel.dataset.agent, 10);
      const tanggal = parseInt(sel.dataset.tanggal, 10);
      const code = sel.value;
      if (code) shifts.push({ agent_index: agent, tanggal, shift_code: code });
    });
    try {
      if (!currentRosterId) {
        const result = await upsertRostering(currentRoster.bulan, currentRoster.tahun, currentRoster.jumlah_karyawan, currentRoster.hari_libur_nasional, currentRoster.cuti_bersama);
        currentRosterId = result.id;
        currentRoster.id = result.id;
        document.getElementById('calendarMeta').textContent = 'Jumlah agent: ' + currentRoster.jumlah_karyawan + ' • Tersimpan (ID: ' + result.id + ')';
      }
      await saveShifts(currentRosterId, shifts);
      alert('Shift berhasil disimpan! (' + shifts.length + ' entries)');
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    }
  });

  document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

  document.getElementById('manageRostersBtn').addEventListener('click', async () => {
    if (currentRoster && currentRosterId) {
      const saveConfirm = confirm('Simpan shift sebelum pindah ke Kelola Roster?');
      if (saveConfirm) await saveCurrentShifts();
    }
    document.getElementById('calendarCard').style.display = 'none';
    document.getElementById('pickerCard').style.display = 'none';
    document.getElementById('manageCard').style.display = 'block';
    manageMode = true;
    await loadManageList();
  });
});
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