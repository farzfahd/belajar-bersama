// Utilitas pohon topik. Topik = { id, parentId, level, order, ... }.

// Index byId + peta anak (sudah terurut order).
export function indexTopics(topics = []) {
  const byId = new Map();
  const kids = new Map();
  for (const t of topics) {
    byId.set(t.id, t);
    const pid = t.parentId || '';
    if (!kids.has(pid)) kids.set(pid, []);
    kids.get(pid).push(t);
  }
  for (const arr of kids.values()) arr.sort((a, b) => a.order - b.order);
  return { byId, kids };
}

// Akar-akaran pohon (level 0 + topik yatim); children direkursi.
export function treeRoots(topics = []) {
  const { byId, kids } = indexTopics(topics);
  const build = (arr) =>
    arr.map((t) => ({ topic: t, children: build(kids.get(t.id) || []) }));
  const roots = [...(kids.get('') || [])];
  for (const t of topics) {
    if (t.parentId && !byId.has(t.parentId) && !roots.includes(t)) roots.push(t);
  }
  return build(roots);
}

// Semua id keturunan topicId (tanpa topicId sendiri).
export function descendantIds(topicId, topics = []) {
  const { kids } = indexTopics(topics);
  const out = [];
  const stack = [topicId];
  while (stack.length) {
    const id = stack.pop();
    for (const c of kids.get(id) || []) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}

// Jalur dari akar ke topicId: [subject, ...topic] — dipakai breadcrumb.
export function topicPath(topicId, topics = []) {
  const { byId } = indexTopics(topics);
  const path = [];
  let cur = byId.get(topicId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return path;
}

// Total materi per topik (termasuk seluruh keturunan).
// counter = Map topicId -> jumlah (notes/resource) langsung.
export function subtreeTotals(topics = [], counter = {}) {
  const { kids } = indexTopics(topics);
  const sum = (id) => {
    let total = counter[id] || 0;
    for (const c of kids.get(id) || []) total += sum(c.id);
    return total;
  };
  const map = {};
  for (const t of topics) map[t.id] = sum(t.id);
  return map;
}

// Kemajuan topik = SELURUH keturunan (topic + subtopic), bukan hanya anak
// langsung. Tanpa ini angka "Kemajuan subtopik" di halaman Subject cuma
// menghitung Topic dan mengabaikan Subtopic di bawahnya.
// Fallback: topik tanpa keturunan memakai status itself (100% bila completed).
export function progressStats(topics = [], topicId, ownStatus = '') {
  const ids = descendantIds(topicId, topics);
  const scope = ids.length ? ids : [topicId];
  const byId = new Map((Array.isArray(topics) ? topics : []).map((t) => [t.id, t]));
  const list = scope.map((id) => byId.get(id)).filter(Boolean);
  const total = list.length;
  const completed = list.filter((t) => t.status === 'completed').length;
  const pct = total ? Math.round((completed / total) * 100) : ownStatus === 'completed' ? 100 : 0;
  return { total, completed, pct };
}

// Nomor ulang 0..n-1 TANPA sort ulang (urutan array sudah final).
function numberInPlace(list = []) {
  return list.map((t, i) => ({ id: t.id, parentId: t.parentId ?? null, level: t.level, order: i }));
}

// Nomor ulang urutan sibling menjadi 0..n-1 (dipakai setelah pindah/urut).
// Sibling dengan order sama atau bolong tidak lagi merusak urutan.
export function renumberSiblings(list = []) {
  return numberInPlace(
    [...(Array.isArray(list) ? list : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
}

// Geser satu topik ke atas/bawah di antara siblingnya, lalu nomor ulang.
// dir -1 = naik, dir 1 = turun. Mengembalikan [] bila tidak ada perubahan.
export function reorderSiblings(siblings = [], movingId, dir = -1) {
  const sorted = [...(Array.isArray(siblings) ? siblings : [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  const from = sorted.findIndex((t) => t.id === movingId);
  const to = from + (dir < 0 ? -1 : 1);
  if (from < 0 || to < 0 || to >= sorted.length) return [];
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  // PENTING: jangan sort ulang di sini (urutan hasil splice sudah final).
  return numberInPlace(sorted);
}