import { IconClose } from '../../../shared/icons';
import { useEffect, useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Input from '../../../shared/ui/Input';
import { useToast } from '../../../shared/components/ToastProvider';
import {
  QUESTION_LIMITS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  STATUS
} from '../../../lib/constants';
import {
  adjustAnswerIndexOnOptionRemove,
  adjustCorrectIndicesOnOptionRemove,
  createQuestion,
  updateQuestion
} from '../services/questionService';
import { toErrorMessage } from '../../../shared/utils/errors';
import SubQuestionEditor from './SubQuestionEditor';
import { MatchingEditor } from './MatchingBoard';

export default function QuestionFormModal({
  open,
  onClose,
  spaceId,
  topics = [],
  initialData = null,
  onSaved
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1: Tipe, 2: Konten & Kunci, 3: Metadata

  // Form State
  const [type, setType] = useState('single');
  const [prompt, setPrompt] = useState('');
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState('beginner');
  const [visibility, setVisibility] = useState('shared');
  const [points, setPoints] = useState(10);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [tagInput, setTagInput] = useState('');

  // Tipe 1 & 2: Options
  const [options, setOptions] = useState(['', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [correctIndices, setCorrectIndices] = useState([0]);

  // Tipe 3: Boolean
  const [correctBoolean, setCorrectBoolean] = useState(true);

  // Tipe 4: Short Answer
  const [acceptedAnswers, setAcceptedAnswers] = useState(['']);

  // Tipe 5: Essay
  const [sampleAnswer, setSampleAnswer] = useState('');

  // Tipe 6: Matching
  const [pairs, setPairs] = useState([
    { left: '', right: '' },
    { left: '', right: '' }
  ]);
  // Draft editor penjodohhan (baris + sambungan, termasuk yang belum
  // dipasangkan). `pairs` tetap answer key yang dipakai attempt & grading.
  const [pairDraft, setPairDraft] = useState(null);

  // Tipe 7: Ordering
  const [items, setItems] = useState(['', '']);

  // Tipe 8: Numerical
  const [correctValue, setCorrectValue] = useState('');
  const [tolerance, setTolerance] = useState('0');

  // Tipe 9: Code
  const [starterCode, setStarterCode] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [sampleSolution, setSampleSolution] = useState('');

  // Tipe 10: Case Study
  const [caseText, setCaseText] = useState('');
  // Sub-soal studi kasus: maksimal SATU tingkat (lihat SubQuestionEditor).
  const [subQuestions, setSubQuestions] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setType(initialData.type || 'single');
      setPrompt(initialData.prompt || '');
      setTopicId(initialData.topicId || (topics[0]?.id || ''));
      setDifficulty(initialData.difficulty || 'beginner');
      setVisibility(initialData.visibility || 'shared');
      setPoints(initialData.points || 10);
      setTimeLimitSeconds(initialData.timeLimitSeconds || 0);
      setExplanation(initialData.explanation || '');
      setTagInput((initialData.tags || []).join(', '));

      setOptions(initialData.options?.length >= 2 ? initialData.options : ['', '']);
      setAnswerIndex(initialData.answerIndex ?? 0);
      setCorrectIndices(initialData.correctIndices?.length ? initialData.correctIndices : [0]);

      setCorrectBoolean(initialData.correctBoolean ?? true);
      setAcceptedAnswers(initialData.acceptedAnswers?.length ? initialData.acceptedAnswers : ['']);
      setSampleAnswer(initialData.sampleAnswer || '');
      setPairs(initialData.pairs?.length >= 2 ? initialData.pairs : [{ left: '', right: '' }, { left: '', right: '' }]);
      // Draft editor penjodohhan: ikut dimuat supaya baris yang belum
      // dipasangkan tidak hilang saat modal dibuka lagi.
      setPairDraft(initialData.pairDraft ?? null);
      setItems(initialData.items?.length >= 2 ? initialData.items : ['', '']);
      setCorrectValue(initialData.correctValue !== undefined ? String(initialData.correctValue) : '');
      setTolerance(initialData.tolerance !== undefined ? String(initialData.tolerance) : '0');
      setStarterCode(initialData.starterCode || '');
      setExpectedOutput(initialData.expectedOutput || '');
      setSampleSolution(initialData.sampleSolution || '');
      setCaseText(initialData.caseText || '');
      // Memuat sub-soal yang sudah tersimpan supaya mode edit tidak kehilangan isi.
      setSubQuestions(Array.isArray(initialData.subQuestions) ? initialData.subQuestions : []);
      setStep(2); // langsung ke konten jika edit
    } else {
      setType('single');
      setPrompt('');
      setTopicId(topics[0]?.id || '');
      setDifficulty('beginner');
      setVisibility('shared');
      setPoints(10);
      setTimeLimitSeconds(0);
      setExplanation('');
      setTagInput('');

      setOptions(['', '']);
      setAnswerIndex(0);
      setCorrectIndices([0]);

      setCorrectBoolean(true);
      setAcceptedAnswers(['']);
      setSampleAnswer('');
      setPairs([{ left: '', right: '' }, { left: '', right: '' }]);
      setPairDraft(null);
      setItems(['', '']);
      setCorrectValue('');
      setTolerance('0');
      setStarterCode('');
      setExpectedOutput('');
      setSampleSolution('');
      setCaseText('');
      setSubQuestions([]);
      setStep(1);
    }
  }, [open, initialData, topics]);

  // Option Handlers for Single/Multiple
  const handleAddOption = () => {
    if (options.length >= QUESTION_LIMITS.maxOptions) {
      toast.error(`Maksimal ${QUESTION_LIMITS.maxOptions} opsi pilihan.`);
      return;
    }
    setOptions([...options, '']);
  };

  const handleRemoveOption = (indexToRemove) => {
    if (options.length <= QUESTION_LIMITS.minOptions) {
      toast.error(`Minimal ${QUESTION_LIMITS.minOptions} opsi pilihan.`);
      return;
    }
    const newOptions = options.filter((_, idx) => idx !== indexToRemove);
    setOptions(newOptions);

    // Sesuaikan indeks kunci jawaban agar konsisten
    setAnswerIndex((curr) => adjustAnswerIndexOnOptionRemove(indexToRemove, curr));
    setCorrectIndices((curr) => adjustCorrectIndicesOnOptionRemove(indexToRemove, curr));
  };

  const handleOptionChange = (idx, value) => {
    const updated = [...options];
    updated[idx] = value;
    setOptions(updated);
  };

  const handleSave = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      toast.error('Pertanyaan tidak boleh kosong.');
      setStep(2);
      return;
    }
    if (!topicId) {
      toast.error('Pilih topik untuk soal ini.');
      setStep(3);
      return;
    }

    // Validasi opsi duplikat & isi
    if (type === 'single' || type === 'multiple') {
      const cleanOptions = options.map((o) => o.trim());
      if (cleanOptions.some((o) => !o)) {
        toast.error('Semua pilihan opsi harus diisi.');
        setStep(2);
        return;
      }
      const set = new Set(cleanOptions);
      if (set.size !== cleanOptions.length) {
        toast.error('Terdapat teks opsi yang duplikat.');
        setStep(2);
        return;
      }
      if (type === 'multiple' && correctIndices.length === 0) {
        toast.error('Pilih setidaknya satu jawaban benar.');
        setStep(2);
        return;
      }
    }

    const payload = {
      type,
      prompt: cleanPrompt,
      topicId,
      difficulty,
      visibility,
      points: Number(points) || 10,
      timeLimitSeconds: Number(timeLimitSeconds) || 0,
      explanation: explanation.trim(),
      tags: tagInput.split(',').map((t) => t.trim()).filter(Boolean),
      options,
      answerIndex,
      correctIndices,
      correctBoolean,
      acceptedAnswers: acceptedAnswers.map((a) => a.trim()).filter(Boolean),
      sampleAnswer: sampleAnswer.trim(),
      pairs,
      // Hanya dipakai untuk tipe `matching`; tipe lain mengabaikannya.
      pairDraft,
      items: items.map((i) => i.trim()).filter(Boolean),
      correctValue: Number(correctValue),
      tolerance: Number(tolerance) || 0,
      starterCode,
      expectedOutput,
      sampleSolution,
      caseText,
      subQuestions
    };

    setSubmitting(true);
    try {
      // `onSaved` menerima id soal (baru atau yang diperbarui) supaya pemanggil
      // lain — misalnya Quiz Editor — bisa langsung memakai ulang soal itu.
      let savedId = initialData?.id || null;
      if (initialData?.id) {
        await updateQuestion(spaceId, initialData.id, payload);
        toast.success('Soal berhasil diperbarui.');
      } else {
        savedId = await createQuestion(spaceId, payload);
        toast.success('Soal baru berhasil ditambahkan.');
      }
      onClose();
      if (onSaved) onSaved(savedId);
    } catch (err) {
      toast.error(toErrorMessage(err, 'Gagal menyimpan soal.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialData ? 'Edit Soal' : 'Buat Soal Baru'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Step Tabs */}
        <div className="flex border-b border-line gap-4 text-[13px] font-medium">
          <button
            type="button"
            className={`pb-2 transition ${step === 1 ? 'border-b-2 border-accent text-accent font-semibold' : 'text-dim hover:text-ink'}`}
            onClick={() => setStep(1)}
          >
            1. Tipe Soal
          </button>
          <button
            type="button"
            className={`pb-2 transition ${step === 2 ? 'border-b-2 border-accent text-accent font-semibold' : 'text-dim hover:text-ink'}`}
            onClick={() => setStep(2)}
          >
            2. Pertanyaan & Kunci
          </button>
          <button
            type="button"
            className={`pb-2 transition ${step === 3 ? 'border-b-2 border-accent text-accent font-semibold' : 'text-dim hover:text-ink'}`}
            onClick={() => setStep(3)}
          >
            3. Metadata & Topik
          </button>
        </div>

        {/* STEP 1: Pilih Tipe Soal */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="text-[12.5px] text-dimmer">Pilih salah satu dari 10 tipe soal:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(QUESTION_TYPES).map(([tKey, tVal]) => (
                <button
                  key={tKey}
                  type="button"
                  onClick={() => {
                    setType(tVal);
                    setStep(2);
                  }}
                  className={`flex flex-col text-left p-3 rounded-smc border transition ${
                    type === tVal
                      ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink'
                      : 'border-line hover:border-linestrong text-dim'
                  }`}
                >
                  <span className="font-semibold text-[13.5px]">{QUESTION_TYPE_LABELS[tKey]}</span>
                  <span className="text-[11.5px] text-dimmer capitalize mt-0.5">{tKey.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Pertanyaan & Kunci Jawaban */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-dimmer">
                Tipe: <b className="text-accent">{QUESTION_TYPE_LABELS[type]}</b>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setStep(1)}>
                Ganti Tipe
              </Button>
            </div>

            <div>
              <label className="eyebrow block mb-1.5">Pertanyaan (Prompt) *</label>
              <textarea
                rows={3}
                placeholder="Tuliskan teks pertanyaan di sini (mendukung Markdown)..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-smc border border-line bg-bg2 p-3 text-[14px] text-ink focus:border-accent"
              />
            </div>

            {/* Opsi untuk Single Choice */}
            {type === 'single' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="eyebrow">
                    Pilihan Jawaban (Pilih radio untuk jawaban benar) *
                  </label>
                  <span className="text-[11px] text-dimmer">
                    {options.length}/{QUESTION_LIMITS.maxOptions} opsi
                  </span>
                </div>

                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-single"
                      title="Tandai sebagai kunci jawaban"
                      checked={answerIndex === idx}
                      onChange={() => setAnswerIndex(idx)}
                      className="accent-accent h-4 w-4 shrink-0"
                    />
                    <input
                      type="text"
                      placeholder={`Opsi ${idx + 1}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      className="flex-1 min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                    />
                    <button
                      type="button"
                      disabled={options.length <= QUESTION_LIMITS.minOptions}
                      onClick={() => handleRemoveOption(idx)}
                      className="text-dim hover:text-accent disabled:opacity-30 p-1.5"
                      title="Hapus opsi"
                    >
                      <IconClose size={15} />
                    </button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={options.length >= QUESTION_LIMITS.maxOptions}
                  onClick={handleAddOption}
                >
                  ＋ Tambah Opsi
                </Button>
              </div>
            )}

            {/* Opsi untuk Multiple Select */}
            {type === 'multiple' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="eyebrow">
                    Pilihan Jawaban (Centang semua jawaban benar) *
                  </label>
                  <span className="text-[11px] text-dimmer">
                    {options.length}/{QUESTION_LIMITS.maxOptions} opsi
                  </span>
                </div>

                {options.map((opt, idx) => {
                  const isChecked = correctIndices.includes(idx);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        title="Tandai sebagai salah satu kunci jawaban"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCorrectIndices([...correctIndices, idx].sort((a, b) => a - b));
                          } else {
                            setCorrectIndices(correctIndices.filter((i) => i !== idx));
                          }
                        }}
                        className="accent-accent h-4 w-4 shrink-0"
                      />
                      <input
                        type="text"
                        placeholder={`Opsi ${idx + 1}`}
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        className="flex-1 min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                      />
                      <button
                        type="button"
                        disabled={options.length <= QUESTION_LIMITS.minOptions}
                        onClick={() => handleRemoveOption(idx)}
                        className="text-dim hover:text-accent disabled:opacity-30 p-1.5"
                        title="Hapus opsi"
                      >
                        <IconClose size={15} />
                      </button>
                    </div>
                  );
                })}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={options.length >= QUESTION_LIMITS.maxOptions}
                  onClick={handleAddOption}
                >
                  ＋ Tambah Opsi
                </Button>
              </div>
            )}

            {/* Benar / Salah */}
            {type === 'boolean' && (
              <div className="space-y-2">
                <label className="eyebrow block">Kunci Jawaban Benar</label>
                <div className="flex gap-4">
                  {[
                    { label: 'Benar (True)', val: true },
                    { label: 'Salah (False)', val: false }
                  ].map(({ label, val }) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer text-[13.5px]">
                      <input
                        type="radio"
                        name="correct-bool"
                        checked={correctBoolean === val}
                        onChange={() => setCorrectBoolean(val)}
                        className="accent-accent"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Isian Singkat */}
            {type === 'short_answer' && (
              <div className="space-y-2">
                <label className="eyebrow block">Variasi Jawaban Diterima (Case-Insensitive)</label>
                {acceptedAnswers.map((ans, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Jawaban yang diterima ${idx + 1}`}
                      value={ans}
                      onChange={(e) => {
                        const copy = [...acceptedAnswers];
                        copy[idx] = e.target.value;
                        setAcceptedAnswers(copy);
                      }}
                      className="flex-1 min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                    />
                    {acceptedAnswers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setAcceptedAnswers(acceptedAnswers.filter((_, i) => i !== idx))}
                        className="text-dim hover:text-accent p-1"
                      >
                        <IconClose size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAcceptedAnswers([...acceptedAnswers, ''])}
                >
                  ＋ Tambah Variasi Jawaban
                </Button>
              </div>
            )}

            {/* Uraian / Esai */}
            {type === 'essay' && (
              <div>
                <label className="eyebrow block mb-1.5">Contoh Jawaban / Rubrik Penilaian</label>
                <textarea
                  rows={3}
                  placeholder="Panduan jawaban atau rubrik untuk evaluasi manual..."
                  value={sampleAnswer}
                  onChange={(e) => setSampleAnswer(e.target.value)}
                  className="w-full rounded-smc border border-line bg-bg2 p-3 text-[13.5px] text-ink"
                />
              </div>
            )}

            {/* Menjodohkan - editor yang sama dengan kartu inline di kuis */}
            {type === 'matching' && (
              <MatchingEditor
                pairs={pairs}
                pairDraft={pairDraft}
                onChange={(nextPairs, nextDraft) => {
                  setPairs(Array.isArray(nextPairs) && nextPairs.length ? nextPairs : [{ left: '', right: '' }]);
                  setPairDraft(nextDraft);
                }}
              />
            )}

            {/* Mengurutkan */}
            {type === 'ordering' && (
              <div className="space-y-2">
                <label className="eyebrow block">Item Urutan yang Benar (Dari Atas ke Bawah)</label>
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-dimmer w-6">{idx + 1}.</span>
                    <input
                      type="text"
                      placeholder={`Langkah ${idx + 1}`}
                      value={it}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[idx] = e.target.value;
                        setItems(copy);
                      }}
                      className="flex-1 min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                    />
                    {items.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="text-dim hover:text-accent"
                      >
                        <IconClose size={15} />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setItems([...items, ''])}
                >
                  ＋ Tambah Langkah Urutan
                </Button>
              </div>
            )}

            {/* Numerik */}
            {type === 'numerical' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="eyebrow block mb-1">Nilai Angka Benar *</label>
                  <input
                    type="number"
                    step="any"
                    value={correctValue}
                    onChange={(e) => setCorrectValue(e.target.value)}
                    className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                    placeholder="Contoh: 42"
                  />
                </div>
                <div>
                  <label className="eyebrow block mb-1">Toleransi (±)</label>
                  <input
                    type="number"
                    step="any"
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                    className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
                    placeholder="Contoh: 0.1"
                  />
                </div>
              </div>
            )}

            {/* Soal Kode */}
            {type === 'code' && (
              <div className="space-y-3">
                <div>
                  <label className="eyebrow block mb-1">Kode Awal (Starter Code)</label>
                  <textarea
                    rows={4}
                    value={starterCode}
                    onChange={(e) => setStarterCode(e.target.value)}
                    className="w-full font-mono text-[12.5px] rounded-smc border border-line bg-bg2 p-3 text-ink"
                    placeholder="Contoh: def solusi(x): pass"
                  />
                </div>
                <div>
                  <label className="eyebrow block mb-1">Contoh Solusi Lengkap</label>
                  <textarea
                    rows={4}
                    value={sampleSolution}
                    onChange={(e) => setSampleSolution(e.target.value)}
                    className="w-full font-mono text-[12.5px] rounded-smc border border-line bg-bg2 p-3 text-ink"
                    placeholder="Contoh: def solusi(x): return x * 2"
                  />
                </div>
              </div>
            )}

            {/* Studi Kasus */}
            {type === 'case_study' && (
              <div className="space-y-3">
                <div>
                  <label className="eyebrow block mb-1">Teks Kasus / Cerita Studi *</label>
                  <textarea
                    rows={5}
                    value={caseText}
                    onChange={(e) => setCaseText(e.target.value)}
                    className="w-full rounded-smc border border-line bg-bg2 p-3 text-[13.5px] text-ink"
                    placeholder="Tuliskan latar belakang kasus yang lengkap di sini..."
                  />
                </div>
                <SubQuestionEditor value={subQuestions} onChange={setSubQuestions} disabled={submitting} />
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Metadata */}
        {step === 3 && (
          <div className="space-y-3.5">
            <div>
              <label className="eyebrow block mb-1">Topik Pembelajaran *</label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
              >
                <option value="">Pilih Topik...</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.level === 0 ? 'Topik: ' : t.level === 1 ? '  └─ ' : '    └─ '}
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="eyebrow block mb-1">Tingkat Kesulitan</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
                >
                  <option value="beginner">Pemula</option>
                  <option value="intermediate">Menengah</option>
                  <option value="advanced">Lanjutan</option>
                </select>
              </div>

              <div>
                <label className="eyebrow block mb-1">Visibilitas</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-2 text-[13px] text-ink"
                >
                  <option value="shared">Bersama (Partner)</option>
                  <option value="private">Pribadi</option>
                </select>
              </div>

              <div>
                <label className="eyebrow block mb-1">Bobot Poin</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13px] text-ink"
                />
              </div>

              <div>
                <label className="eyebrow block mb-1">Batas Waktu (dtk)</label>
                <input
                  type="number"
                  min="0"
                  value={timeLimitSeconds}
                  onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
                  className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13px] text-ink"
                  placeholder="0 = bebas"
                />
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-1">Tag (Pisahkan koma)</label>
              <input
                type="text"
                placeholder="Contoh: probabilitas, kalkulus, penting"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="w-full min-h-[38px] rounded-smc border border-line bg-bg2 px-3 text-[13.5px] text-ink"
              />
            </div>

            <div>
              <label className="eyebrow block mb-1">Pembahasan / Penjelasan Jawaban</label>
              <textarea
                rows={3}
                placeholder="Penjelasan yang tampil setelah pengerja menjawab..."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="w-full rounded-smc border border-line bg-bg2 p-3 text-[13.5px] text-ink"
              />
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-line">
          <div>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                ← Kembali
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Batal
            </Button>
            {step < 3 ? (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Lanjut →
              </Button>
            ) : (
              <Button size="sm" loading={submitting} onClick={handleSave}>
                Simpan Soal
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
