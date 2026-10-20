// Helper bersama untuk pencarian tiket (membaca kolom dari raw_json).
export const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseTs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return (!isFinite(v) || v < 20000) ? null : Math.round((v - 25569) * 86400000);
  const s = String(v).trim();
  if (!s || s === '-') return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

// 'plain' = teks tanpa zona waktu (tampil apa adanya), 'iso' = UTC (tampil lokal)
export function dateMode(v) {
  if (typeof v === 'number') return 'plain';
  if (typeof v === 'string') return /(Z|[+-]\d{2}:?\d{2})$/.test(v.trim()) ? 'iso' : 'plain';
  return 'iso';
}

export const DETAIL_CANDIDATES = {
  ticket_id:             ['ticketid', 'idticket', 'noticket', 'ticketno', 'ticketnumber', 'id'],
  ticket_subject:        ['subject', 'ticketsubject', 'title', 'judul', 'summary'],
  ticket_detail_subcategory: ['detailsubcategory', 'detailsubcat', 'subcategorydetail'],
  ticket_status:         ['status', 'ticketstatus', 'statusticket'],
  ticket_severity:       ['severity', 'ticketseverity', 'severitylevel', 'priority', 'prioritas'],
  ticket_unit:           ['unit', 'posisi', 'position', 'currentunit', 'currentposition', 'unitposisi', 'posisiunit', 'posisitiket', 'assignedunit', 'unitkerja', 'unitname'],
  ticket_created_by:     ['createdby', 'createby', 'openby', 'openedby', 'creator', 'reporter', 'dibuatoleh', 'pembuat', 'requester', 'createdname', 'createduser'],
  ticket_remarks:        ['remarks', 'remark', 'catatan', 'keterangan', 'notes', 'note', 'resolution', 'solusi'],
  ticket_feedback:       ['feedback', 'feedbackcustomer', 'customerfeedback', 'feedbackuser', 'feedbackpelanggan'],
  ticket_date_open:      ['dateopen'],
  ticket_date_onprogress:['dateonprogress', 'onprogressdate', 'dateprogress', 'dateinprogress', 'tglonprogress'],
  ticket_date_pending:   ['datepending', 'pendingdate', 'datependingticket', 'tglpending'],
  ticket_date_resolved:  ['dateresolved', 'resolveddate', 'dateresolve', 'tglresolved'],
  ticket_date_reopen:    ['datereopen', 'reopendate', 'datereopened', 'tglreopen'],
  ticket_date_closed:    ['dateclosed', 'dateclose', 'closeddate', 'tglclosed'],
  ticket_date_lastupdate:['datelastupdate', 'lastupdate', 'lastupdated', 'dateupdate', 'dateupdated', 'updatedat', 'tglupdate']
};

export function resolveColumns(keys, config) {
  const byNorm = {};
  keys.forEach(k => { if (!(norm(k) in byNorm)) byNorm[norm(k)] = k; });
  const out = {};
  Object.keys(DETAIL_CANDIDATES).forEach(cfgKey => {
    let found = null;
    const override = config[cfgKey] || (cfgKey === 'ticket_detail_subcategory' ? config.ticket_detailSubCategory : '');
    if (override && byNorm[norm(override)]) found = byNorm[norm(override)];
    if (!found) for (const c of DETAIL_CANDIDATES[cfgKey]) { if (byNorm[c]) { found = byNorm[c]; break; } }
    out[cfgKey] = found;
  });
  return out;
}
