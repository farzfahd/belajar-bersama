import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { toErrorMessage } from '../utils/errors';

// Pola dual-listener: beberapa query Firestore digabung jadi satu daftar.
//
// Mengapa tidak satu query polos? Firestore hanya bisa membuktikan aturan
// security_rules pada query LIST bila field yang dicek rules ada di
// where-clause; query tanpa filter itu DENY (bukan "disaring"). Karena itu
// koleksi privat (notes/resources/states) dibaca dengan DUA query —
// "shared" dan "milik sendiri" — lalu digabung di client. Filter privasi di
// aplikasi (utils/visibility.js) tetap dipakai sebagai lapisan kedua.
//
// buildQueries : () => Query[] | null   (null = belum siap / belum login)
// deps         : dependensi effect, mis. [spaceId, uid]
// options      : { enabled, compare }
export function useMergedSnapshots(buildQueries, deps = [], options = {}) {
  const { enabled = true, compare } = options;
  const [state, setState] = useState({ data: [], loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }
    const queries = buildQueries();
    if (!queries || queries.length === 0) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }

    const buckets = queries.map(() => new Map());
    const ready = queries.map(() => false);
    // Tunggu semua listener memberi snapshot pertama supaya daftar tidak
    // sempat tampil setengah (mis. shared sudah, milik sendiri belum).
    const publish = () => {
      if (!ready.every(Boolean)) return;
      const merged = new Map();
      buckets.forEach((b) => b.forEach((doc, id) => merged.set(id, doc)));
      const data = [...merged.values()];
      setState({ data: compare ? data.sort(compare) : data, loading: false, error: null });
    };

    const unsubs = queries.map((q, i) =>
      onSnapshot(
        q,
        (snap) => {
          buckets[i] = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
          ready[i] = true;
          publish();
        },
        (err) => setState((s) => ({ ...s, loading: false, error: toErrorMessage(err) }))
      )
    );
    return () => unsubs.forEach((un) => un());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return state;
}

// Urut terbaru lebih dulu (dipakai daftar notes & resources).
export function byUpdatedDesc(a, b) {
  return toMillis(b.updatedAt) - toMillis(a.updatedAt);
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}
