// Validasi sisi client (UX). Keamanan sebenarnya ditegakkan di Firestore Rules.

export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeTag(t) {
  return String(t == null ? '' : t).trim().toLowerCase().slice(0, 40);
}

// Dihilangkan duplikat, diurutkan, maks 20 (sesuai Rules).
export function normalizeTags(input) {
  const seen = new Set();
  const list = Array.isArray(input) ? input : [];
  for (const t of list) {
    const v = normalizeTag(t);
    if (v) seen.add(v);
  }
  return [...seen].slice(0, 20);
}

export function cleanupInviteCode(input) {
  return String(input == null ? '' : input).trim().replace(/\s+/g, '');
}