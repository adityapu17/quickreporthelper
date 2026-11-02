// Login lewat Hades (Firebase Auth) untuk halaman "Ticket Log" di Hades.
// Hades mengirim Firebase ID token milik user yang sedang login di header Authorization: Bearer <token>.
// Token HANYA diterima untuk GET /api/ticketing/search (baca saja) -- lihat _middleware.js.
//
// Verifikasi berlapis:
//  1. Tanda tangan RS256 dicek dengan kunci publik Google (JWK securetoken), plus aud/iss/exp.
//  2. Profil users/{uid} di Firestore Hades harus ada dan tidak disabled. Ini penting: pendaftaran Firebase
//     bisa dipanggil siapa saja, jadi token valid saja BELUM berarti user itu terdaftar oleh admin Hades.
//     Profil dibaca dengan token user itu sendiri, sehingga aturan Firestore yang menentukan.
//  3. Kalau admin Hades menyembunyikan menu Ticket Log dari role user (settings/menuVisibility),
//     role non-admin ditolak di sini juga, bukan hanya disembunyikan di tampilan.

const PROJECT_ID = 'peruri-helpdesk-kb';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
const ACCESS_TTL_MS = 60 * 1000;     // hasil cek profil di-cache 1 menit per uid
const JWK_TTL_MS = 60 * 60 * 1000;   // kunci Google di-cache 1 jam

let jwkCache = { keys: null, exp: 0 };
const accessCache = new Map();

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function getKeys(force) {
  if (!force && jwkCache.keys && Date.now() < jwkCache.exp) return jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error('Kunci verifikasi Google tidak bisa diambil.');
  const j = await res.json();
  jwkCache = { keys: j.keys || [], exp: Date.now() + JWK_TTL_MS };
  return jwkCache.keys;
}

// Mengembalikan { uid, email } kalau token valid, atau melempar Error.
export async function verifyFirebaseToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Token tidak valid.');
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch (e) { throw new Error('Token tidak valid.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Token tidak valid.');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID || payload.iss !== 'https://securetoken.google.com/' + PROJECT_ID) throw new Error('Token bukan dari Hades.');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Sesi Hades kedaluwarsa, silakan muat ulang halaman.');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('Token tidak valid.');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('Token tidak valid.');

  let jwk = (await getKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find((k) => k.kid === header.kid); // Google merotasi kunci
  if (!jwk) throw new Error('Token tidak valid.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('Token tidak valid.');
  return { uid: payload.sub, email: payload.email || '' };
}

// Cek profil Hades. Mengembalikan { ok: true, role } atau { ok: false, reason }.
export async function checkHadesAccess(token, uid) {
  const hit = accessCache.get(uid);
  if (hit && Date.now() < hit.exp) return hit.result;

  const headers = { Authorization: 'Bearer ' + token };
  const [uRes, sRes] = await Promise.all([
    fetch(FIRESTORE + '/users/' + encodeURIComponent(uid), { headers }),
    fetch(FIRESTORE + '/settings/menuVisibility', { headers })
  ]);

  let result;
  if (uRes.status !== 200) {
    result = { ok: false, reason: 'Akun kamu belum terdaftar di Hades.' };
  } else {
    const f = (await uRes.json()).fields || {};
    const role = (f.role && f.role.stringValue) || 'member';
    let hidden = [];
    if (sRes.status === 200) {
      const sf = (await sRes.json()).fields || {};
      hidden = (((sf.hiddenForUser || {}).arrayValue || {}).values || []).map((v) => v.stringValue);
    }
    if (f.disabled && f.disabled.booleanValue === true) result = { ok: false, reason: 'Akun Hades kamu dinonaktifkan.' };
    else if (role !== 'admin' && hidden.includes('ticketlog')) result = { ok: false, reason: 'Ticket Log tidak diaktifkan untuk role user.' };
    else result = { ok: true, role };
  }
  accessCache.set(uid, { exp: Date.now() + ACCESS_TTL_MS, result });
  if (accessCache.size > 500) accessCache.clear();
  return result;
}

// Origin Hades yang boleh memanggil API ini dari browser. Tambah domain lain lewat env HADES_ORIGINS
// (pisahkan dengan koma), mis. kalau Hades pakai custom domain.
export function hadesOrigins(env) {
  const extra = (env && env.HADES_ORIGINS ? String(env.HADES_ORIGINS) : '').split(',').map((s) => s.trim()).filter(Boolean);
  return ['https://hades-peruri.gabel.workers.dev', ...extra];
}
