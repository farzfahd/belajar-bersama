import { IDENTITY } from '../../lib/constants';

export function colorForUid(uid = '') {
  if (!uid) return IDENTITY.defaultColor;
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return IDENTITY.colors[h % IDENTITY.colors.length];
}

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function displayNameFromEmail(email = '') {
  const base = String(email).split('@')[0] || '';
  return base.replace(/[._-]+/g, ' ').trim() || 'Pelajar';
}