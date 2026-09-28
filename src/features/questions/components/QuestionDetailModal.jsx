import { IconArrowDown, IconArrowRight, IconArrowUp, IconCheck, IconClose, IconFlag, IconKey, IconNotes, IconPlay } from '../../../shared/icons';
import { useState } from 'react';
import Modal from '../../../shared/ui/Modal';
import Button from '../../../shared/ui/Button';
import Badge from '../../../shared/ui/Badge';
import EmptyState from '../../../shared/ui/EmptyState';
import { QUESTION_REPORT_TYPE_LABELS, QUESTION_TYPE_LABELS } from '../../../lib/constants';
import { gradeQuestionAnswer } from '../utils/grading';
import { useQuestionReports } from '../hooks/useQuestionReports';
import { timeAgo } from '../../../shared/utils/time';

export default function QuestionDetailModal({
  open,
  spaceId,
  question,
  isOwner,
  onReport,
  onClose
}) {
  const [tab, setTab] = useState('preview'); // 'preview' | 'key' | 'reports'
  const [userAnswer, setUserAnswer] = useState(null);
  const [gradingResult, setGradingResult] = useState(null);

  // Hanya pemilik soal yang boleh LIST report (lihat catatan di
  // `firestore.rules`), jadi listener hanya dipasang untuk owner. Pelapor
  // mendapat konfirmasi lewat toast, bukan daftar report.
  const { data: reports = [], loading: reportsLoading, error: reportsError } = useQuestionReports(
    spaceId,
    question?.id || null,
    { enabled: open && tab === 'reports' && isOwner && Boolean(question?.id) }
  );

  if (!question) return null;

  const type = question.type || 'single';
  const typeLabel = QUESTION_TYPE_LABELS[type] || 'Pilihan Ganda';

  const handleGrade = () => {
    const res = gradeQuestionAnswer(question, userAnswer);
    setGradingResult(res);
  };

  const resetSimulation = () => {
    setUserAnswer(null);
    setGradingResult(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Detail Soal: ${typeLabel}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-line gap-4 text-[13px] font-medium">
          <button
            type="button"
            className={`pb-2 transition-colors ${
              tab === 'preview'
                ? 'border-b-2 border-accent text-accent font-semibold'
                : 'text-dim hover:text-ink'
            }`}
            onClick={() => setTab('preview')}
          >
            <span className="inline-flex items-center gap-1.5"><IconPlay size={15} /> Simulasi Pengerja</span>
          </button>
          <button
            type="button"
            className={`pb-2 transition-colors ${
              tab === 'key'
                ? 'border-b-2 border-accent text-accent font-semibold'
                : 'text-dim hover:text-ink'
            }`}
            onClick={() => setTab('key')}
          >
            <span className="inline-flex items-center gap-1.5"><IconKey size={15} /> Kunci Jawaban & Pembahasan</span>
          </button>
          <button
            type="button"
            className={`pb-2 transition-colors ${
              tab === 'reports'
                ? 'border-b-2 border-accent text-accent font-semibold'
                : 'text-dim hover:text-ink'
            }`}
            onClick={() => setTab('reports')}
          >
            <span className="inline-flex items-center gap-1.5">
              <IconFlag size={15} /> Laporan {isOwner && reports.length > 0 ? `(${reports.length})` : ''}
            </span>
          </button>
        </div>

        {/* Prompt */}
        <div className="rounded-smc border border-line bg-bg2 p-3 space-y-2">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
            Pertanyaan
          </div>
          <div className="font-body text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
            {question.prompt}
          </div>
        </div>

        {/* Tab 1: Simulasi Pengerja */}
        {tab === 'preview' && (
          <div className="space-y-4">
            {type === 'single' && (
              <div className="space-y-2">
                <div className="text-[12px] text-dimmer">Pilih satu jawaban:</div>
                {(question.options || []).map((opt, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-2.5 rounded-smc border cursor-pointer transition ${
                      userAnswer === idx
                        ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink'
                        : 'border-line hover:border-linestrong text-dim'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preview-single"
                      checked={userAnswer === idx}
                      onChange={() => setUserAnswer(idx)}
                      className="accent-accent"
                    />
                    <span className="text-[13.5px]">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {type === 'multiple' && (
              <div className="space-y-2">
                <div className="text-[12px] text-dimmer">Pilih satu atau lebih jawaban:</div>
                {(question.options || []).map((opt, idx) => {
                  const selected = Array.isArray(userAnswer) && userAnswer.includes(idx);
                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 p-2.5 rounded-smc border cursor-pointer transition ${
                        selected
                          ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink'
                          : 'border-line hover:border-linestrong text-dim'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const curr = Array.isArray(userAnswer) ? [...userAnswer] : [];
                          if (e.target.checked) {
                            setUserAnswer([...curr, idx]);
                          } else {
                            setUserAnswer(curr.filter((i) => i !== idx));
                          }
                        }}
                        className="accent-accent"
                      />
                      <span className="text-[13.5px]">{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {type === 'boolean' && (
              <div className="flex gap-4">
                {[
                  { label: 'Benar', val: true },
                  { label: 'Salah', val: false }
                ].map(({ label, val }) => (
                  <label
                    key={label}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-smc border cursor-pointer transition ${
                      userAnswer === val
                        ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink font-semibold'
                        : 'border-line hover:border-linestrong text-dim'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preview-bool"
                      checked={userAnswer === val}
                      onChange={() => setUserAnswer(val)}
                      className="accent-accent"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}

            {type === 'short_answer' && (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Ketik jawaban singkat..."
                  value={userAnswer || ''}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full rounded-smc border border-line bg-bg2 px-3 py-2 text-[13.5px] text-ink"
                />
              </div>
            )}

            {type === 'essay' && (
              <div className="space-y-1">
                <textarea
                  rows={4}
                  placeholder="Ketik esai atau uraian..."
                  value={userAnswer || ''}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full rounded-smc border border-line bg-bg2 p-3 text-[13.5px] text-ink"
                />
              </div>
            )}

            {type === 'numerical' && (
              <div className="space-y-1">
                <input
                  type="number"
                  step="any"
                  placeholder="Masukkan angka..."
                  value={userAnswer ?? ''}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full rounded-smc border border-line bg-bg2 px-3 py-2 text-[13.5px] text-ink"
                />
              </div>
            )}

            {type === 'matching' && (
              <div className="space-y-2">
                <div className="text-[12px] text-dimmer">Jodohkan item di kiri dengan pilihan di kanan:</div>
                {(question.pairs || []).map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-1/2 p-2 rounded-smc border border-line bg-bg2 text-[13px] text-ink">
                      {p.left}
                    </span>
                    <IconArrowRight size={15} className="shrink-0 text-dim" />
                    <select
                      className="w-1/2 p-2 rounded-smc border border-line bg-bg2 text-[13px] text-ink"
                      value={userAnswer?.[p.left] || ''}
                      onChange={(e) => {
                        setUserAnswer({
                          ...(userAnswer || {}),
                          [p.left]: e.target.value
                        });
                      }}
                    >
                      <option value="">Pilih pasangan...</option>
                      {question.pairs.map((optP, pIdx) => (
                        <option key={pIdx} value={optP.right}>
                          {optP.right}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {type === 'ordering' && (
              <div className="space-y-2">
                <div className="text-[12px] text-dimmer">Urutan saat ini (gunakan tombol untuk menggeser):</div>
                {((Array.isArray(userAnswer) && userAnswer.length === question.items?.length)
                  ? userAnswer
                  : (question.items || [])
                ).map((it, idx, arr) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-smc border border-line bg-bg2">
                    <span className="text-[13px] text-ink">{idx + 1}. {it}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...arr];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          setUserAnswer(next);
                        }}
                      >
                        <IconArrowUp size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === arr.length - 1}
                        onClick={() => {
                          const next = [...arr];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          setUserAnswer(next);
                        }}
                      >
                        <IconArrowDown size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {type === 'code' && (
              <div className="space-y-1">
                <textarea
                  rows={5}
                  placeholder="Tulis kode..."
                  value={userAnswer ?? (question.starterCode || '')}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  className="w-full font-mono text-[13px] rounded-smc border border-line bg-bg2 p-3 text-ink"
                />
              </div>
            )}

            {type === 'case_study' && (
              <div className="space-y-3">
                <div className="p-3 rounded-smc border border-line bg-bg2 text-[13.5px] leading-relaxed">
                  <div className="font-mono text-[10px] uppercase text-dimmer mb-1">Kasus Studi</div>
                  {question.caseText}
                </div>
                <div className="text-[12px] text-dimmer">
                  {question.subQuestions?.length || 0} Sub-Pertanyaan
                </div>
              </div>
            )}

            {/* Actions for simulation */}
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" onClick={handleGrade}>
                <IconCheck size={15} /> Periksa Jawaban
              </Button>
              <Button size="sm" variant="ghost" onClick={resetSimulation}>
                Reset
              </Button>
            </div>

            {/* Simulation Result Output */}
            {gradingResult && (
              <div
                className={`p-3 rounded-smc border ${
                  gradingResult.isManual
                    ? 'border-line bg-bg2'
                    : gradingResult.isCorrect
                    ? 'border-[color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[13.5px]">
                    {gradingResult.isManual
                      ? <span className="inline-flex items-center gap-1.5"><IconNotes size={15} /> Memerlukan Pemeriksaan Manual</span>
                      : gradingResult.isCorrect
                      ? <span className="inline-flex items-center gap-1.5 text-ok"><IconCheck size={15} /> Jawaban Benar!</span>
                      : <span className="inline-flex items-center gap-1.5 text-accent"><IconClose size={15} /> Jawaban Kurang Tepat</span>}
                  </span>
                  <span className="font-mono text-[12px]">
                    +{gradingResult.pointsEarned} / {question.points || 10} Poin
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Kunci & Pembahasan */}
        {tab === 'key' && (
          <div className="space-y-4">
            <div className="p-3 rounded-smc border border-line bg-bg2 space-y-2">
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                Kunci Jawaban Resmi
              </div>

              {type === 'single' && (
                <div className="text-[14px] text-ink">
                  Opsi Benar: <b>{question.options?.[question.answerIndex] ?? '—'}</b>
                  <span className="text-dim text-[12px] ml-2">(Indeks: {question.answerIndex})</span>
                </div>
              )}

              {type === 'multiple' && (
                <div className="space-y-1">
                  <div className="text-[12px] text-dimmer">Daftar Opsi Benar:</div>
                  {(question.correctIndices || []).map((idx) => (
                    <div key={idx} className="text-[13.5px] text-ink">
                      • {question.options?.[idx]}
                    </div>
                  ))}
                </div>
              )}

              {type === 'boolean' && (
                <div className="text-[14px] font-semibold text-ink">
                  {question.correctBoolean ? 'BENAR (True)' : 'SALAH (False)'}
                </div>
              )}

              {type === 'short_answer' && (
                <div className="space-y-1">
                  <div className="text-[12px] text-dimmer">Variasi Jawaban Diterima:</div>
                  {(question.acceptedAnswers || []).map((ans, idx) => (
                    <div key={idx} className="text-[13.5px] text-ink">• {ans}</div>
                  ))}
                </div>
              )}

              {type === 'essay' && (
                <div className="space-y-1">
                  <div className="text-[12px] text-dimmer">Contoh Jawaban / Rubrik:</div>
                  <div className="text-[13.5px] text-ink whitespace-pre-wrap">
                    {question.sampleAnswer || '—'}
                  </div>
                </div>
              )}

              {type === 'numerical' && (
                <div className="text-[14px] text-ink">
                  Nilai: <b>{question.correctValue}</b> (Toleransi: ±{question.tolerance || 0})
                </div>
              )}

              {type === 'matching' && (
                <div className="space-y-1">
                  <div className="text-[12px] text-dimmer">Pasangan Benar:</div>
                  {(question.pairs || []).map((p, idx) => (
                    <div key={idx} className="text-[13px] text-ink">
                      <b>{p.left}</b> <IconArrowRight size={13} className="inline align-[-2px] text-dimmer" /> {p.right}
                    </div>
                  ))}
                </div>
              )}

              {type === 'ordering' && (
                <div className="space-y-1">
                  <div className="text-[12px] text-dimmer">Urutan Benar:</div>
                  {(question.items || []).map((it, idx) => (
                    <div key={idx} className="text-[13px] text-ink">
                      {idx + 1}. {it}
                    </div>
                  ))}
                </div>
              )}

              {type === 'code' && (
                <div className="space-y-2">
                  {question.sampleSolution && (
                    <div>
                      <div className="text-[12px] text-dimmer">Solusi Contoh:</div>
                      <pre className="font-mono text-[12px] p-2 rounded bg-bg text-ink whitespace-pre-wrap">
                        {question.sampleSolution}
                      </pre>
                    </div>
                  )}
                  {question.expectedOutput && (
                    <div>
                      <div className="text-[12px] text-dimmer">Output yang Diharapkan:</div>
                      <pre className="font-mono text-[12px] p-2 rounded bg-bg text-ink whitespace-pre-wrap">
                        {question.expectedOutput}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pembahasan */}
            <div className="p-3 rounded-smc border border-line bg-bg2 space-y-1">
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
                Pembahasan / Penjelasan
              </div>
              <div className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">
                {question.explanation || 'Belum ada penjelasan tambahan untuk soal ini.'}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Laporan Soal */}
        {tab === 'reports' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12.5px] leading-relaxed text-dim">
                {isOwner
                  ? 'Laporan dari partner tentang soal ini. Perbaiki soalnya bila memang ada yang keliru - laporan tidak dihapus, jadi riwayatnya tetap tersimpan.'
                  : 'Keluhan soal ini dikirim ke pemilik soal. Laporan tidak bisa diedit atau dihapus, jadi rupiahkan dengan spesifik.'}
              </p>
              {!isOwner && !question.deletedAt && (
                <Button size="sm" variant="ghost" onClick={() => onReport?.(question)}>
                  <IconFlag size={15} /> Lapor Soal
                </Button>
              )}
            </div>

            {!isOwner && (
              <p className="rounded-smc border border-line bg-bg2 px-3 py-2.5 text-[12.5px] text-dimmer">
                Riwayat laporan milikmu tidak ditampilkan di sini - yang perlu
                acted upon adalah pemilik soal.
              </p>
            )}

            {isOwner && reportsError && (
              <div className="rounded-smc border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[13px] text-ink">
                Gagal memuat laporan: {reportsError}
              </div>
            )}

            {isOwner && !reportsError && reportsLoading && (
              <div className="py-6 text-center text-[12.5px] text-dimmer">Memuat laporan...</div>
            )}

            {isOwner && !reportsError && !reportsLoading && reports.length === 0 && (
              <EmptyState
                title="Belum Ada Laporan"
                description="Belum ada partner yang melaporkan soal ini."
              />
            )}

            {isOwner && reports.length > 0 && (
              <ul className="space-y-2">
                {reports.map((r) => (
                  <li key={r.id} className="rounded-smc border border-line bg-bg2 px-3 py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="accent">
                        {QUESTION_REPORT_TYPE_LABELS[r.type] || r.type}
                      </Badge>
                      <span className="font-mono text-[10.5px] text-dimmer">
                        {timeAgo(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
