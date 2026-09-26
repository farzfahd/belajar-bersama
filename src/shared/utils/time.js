function toMs(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

export function fmtDateTime(value) {
  const d = new Date(toMs(value));
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function fmtDate(value) {
  return new Date(toMs(value)).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function timeAgo(value) {
  const ms = toMs(value);
  if (!ms) return '';
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 45) return 'baru saja';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(ms);
}

export function isExpired(expiresAt) {
  return toMs(expiresAt) <= Date.now();
}