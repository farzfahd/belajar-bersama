import { STATUS_LABEL } from '../../lib/constants';

// Warna badge sesuai status (tone Tailwind semantic: ok/warn/accent/dim).
export function statusTone(status) {
  return (
    {
      not_started: 'dim',
      learning: 'warn',
      completed: 'ok',
      draft: 'dim',
      shared: 'accent',
      reviewed: 'ok',
      needs_revision: 'warn',
      reading: 'warn'
    }[status] || 'dim'
  );
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || status || '—';
}