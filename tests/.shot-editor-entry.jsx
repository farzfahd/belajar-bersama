// Entry untuk render statis DAFTAR KARTU SOAL pada Quiz Editor.
// Dipakai oleh shot-editor-cards.mjs — BUKAN bagian test suite.
import { renderToStaticMarkup } from 'react-dom/server';
import QuestionCard from '../src/features/quizzes/components/QuestionCard.jsx';
import { emptyQuestionDraft } from '../src/features/quizzes/utils/questionCard.js';

const base = (extra) => ({ ...emptyQuestionDraft('t1'), ...extra });

const CARDS = [
  {
    key: 'q1',
    index: 0,
    questionId: 'q1',
    canMoveUp: false,
    canMoveDown: true,
    autoFocus: false,
    draft: base({
      type: 'single',
      prompt: 'Organel apa yang berperan sebagai "pusat energi" sel?',
      options: ['Mitokondria', 'Kloroplas', 'Nukleus', 'Ribosom'],
      answerIndex: 0
    })
  },
  {
    key: 'q2',
    index: 1,
    questionId: 'q2',
    canMoveUp: true,
    canMoveDown: true,
    autoFocus: false,
    draft: base({
      type: 'boolean',
      prompt: 'Fotosintesis menghasilkan oksigen sebagai byproduct.',
      correctBoolean: true
    })
  },
  {
    key: 'q3',
    index: 2,
    questionId: 'q3',
    canMoveUp: true,
    canMoveDown: false,
    autoFocus: false,
    draft: base({
      type: 'numerical',
      prompt: 'Berapakah gaya gravitasi di permukaan bumi? (m/s²)',
      correctValue: 9.81,
      tolerance: 0.01
    })
  },
  {
    // Kartu baru: expanded + fokus, belum punya id soal (position null).
    key: 'new_1',
    index: 3,
    questionId: null,
    canMoveUp: false,
    canMoveDown: false,
    autoFocus: true,
    state: 'saved',
    draft: base({
      type: 'multiple',
      prompt: 'Pilih semua pernyataan yang benar tentang ekosistem.',
      options: ['Biodiversitas penting', 'Rantai makanan saling terhubung', 'Semua energi datang dari matahari'],
      correctIndices: [0, 2]
    })
  }
];

export function renderAll() {
  return `
  <h2 class="section-title">Daftar soal (4)</h2>
  <ul class="space-y-3">
    ${CARDS.map((c) =>
      renderToStaticMarkup(
        <QuestionCard
          key={c.key}
          draft={c.draft}
          questionId={c.questionId}
          index={c.index}
          total={CARDS.length}
          topics={[{ id: 't1', title: 'Biologi' }]}
          spaceId="sp1"
          draggable
          canMoveUp={c.canMoveUp}
          canMoveDown={c.canMoveDown}
          autoFocus={c.autoFocus}
        />
      )
    ).join('\n')}
  </ul>`;
}
