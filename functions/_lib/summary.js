// Shared input validation for the "Summary Interaction" API routes.
const CHANNELS = ['Email', 'Voice', 'WhatsApp', 'Manual'];
const PRODUK = ['Perisai', 'E-Meterai'];

function baseCheck(b) {
  if (!b || typeof b !== 'object') return 'Body tidak valid';
  if (!Number.isInteger(b.bulan) || b.bulan < 1 || b.bulan > 12) return 'Bulan harus 1-12';
  if (!Number.isInteger(b.tahun) || b.tahun < 2000 || b.tahun > 2100) return 'Tahun tidak valid';
  if (typeof b.totalInteraksi !== 'number' || !isFinite(b.totalInteraksi) || b.totalInteraksi < 0) return 'Total interaksi tidak valid';
  return null;
}

export function validateChannel(b) {
  const base = baseCheck(b);
  if (base) return base;
  if (!CHANNELS.includes(b.channel)) return 'Channel harus Email, Voice, atau WhatsApp';
  for (const k of ['responseTime', 'aht', 'scr']) {
    if (b[k] != null && (typeof b[k] !== 'number' || !isFinite(b[k]) || b[k] < 0)) return k + ' tidak valid';
  }
  return null;
}

export function validateProduk(b) {
  const base = baseCheck(b);
  if (base) return base;
  if (!PRODUK.includes(b.produk)) return 'Produk harus Perisai atau E-Meterai';
  return null;
}
