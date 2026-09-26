import { useMemo, useState } from 'react';
import Badge from '../../../shared/ui/Badge';
import Spinner from '../../../shared/components/Spinner';
import { QUESTION_TYPE_LABELS, STATUS_LABEL } from '../../../lib/constants';

// Panel pemilihan soal dari bank soal. Presentasional: TIDAK membuka listener
// Firestore sendiri (data dikirim dari pemanggil), sehingga satu useQuestions
// cukup untuk satu halaman. Dipakai di dalam QuizFormModal (buat kuis) dan
// QuestionPickerModal (tambah dari bank).
export default function QuestionPicker({
  questions = [],
  topics = [],
  loading = false,
  error = null,
  selected = [],
  onToggle,
  emptyHint = 'Belum ada soal di bank soal. Buat soal dulu lewat tombol "+ Buat Soal".'
}) {
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (q.deletedAt) return false;
      if (topicFilter && q.topicId !== topicFilter) return false;
      if (typeFilter && q.type !== typeFilter) return false;
      if (difficultyFilter && q.difficulty !== difficultyFilter) return false;
      if (needle) {
        const inPrompt = (q.prompt || '').toLowerCase().includes(needle);
        const inTags = (q.tags || []).some((t) => t.toLowerCase().includes(needle));
        if (!inPrompt && !inTags) return false;
      }
      return true;
    });
  }, [questions, search, topicFilter, typeFilter, difficultyFilter]);

  const topicTitle = (id) => topics.find((t) => t.id === id)?.title || 'Tanpa topik';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari prompt atau tag…"
          aria-label="Cari soal"
          className="min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13px] text-ink placeholder:text-dimmer"
        />
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          aria-label="Filter topik"
          className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
        >
          <option value="">Semua Topik</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter tipe"
          className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
        >
          <option value="">Semua Tipe</option>
          {Object.entries(QUESTION_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          aria-label="Filter kesulitan"
          className="min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
        >
          <option value="">Semua Kesulitan</option>
          <option value="beginner">Pemula</option>
          <option value="intermediate">Menengah</option>
          <option value="advanced">Lanjutan</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <p className="rounded-smc border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[13px] text-ink">
          Gagal memuat bank soal: {error.message || String(error)}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-smc border border-dashed border-linestrong px-3 py-6 text-center text-[13px] text-dim">
          {questions.length === 0 ? emptyHint : 'Tidak ada soal yang cocok dengan filter.'}
        </p>
      ) : (
        <ul className="max-h-[46vh] overflow-y-auto divide-y divide-line border-t border-line">
          {filtered.map((q) => {
            const isSelected = selectedSet.has(q.id);
            return (
              <li key={q.id}>
                <label className="flex cursor-pointer items-start gap-3 py-2.5 hover:bg-bg2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(q.id)}
                    className="mt-1 accent-accent"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="accent">{QUESTION_TYPE_LABELS[q.type] || 'Pilihan Ganda'}</Badge>
                      <Badge tone="dim">{STATUS_LABEL[q.difficulty] || q.difficulty}</Badge>
                      <span className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                        {topicTitle(q.topicId)} · {q.points ?? 10} poin
                      </span>
                    </span>
                    <span className="line-clamp-2 block text-[13.5px] leading-relaxed text-ink">
                      {q.prompt}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
