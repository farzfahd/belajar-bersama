// Entry untuk render statis komponen kartu soal (CP2 redesign).
// Dipakai oleh shot-question-cards.mjs — BUKAN bagian test suite.
import { renderToStaticMarkup } from 'react-dom/server';
import QuestionCardTypeFields from '../src/features/quizzes/components/QuestionCardTypeFields.jsx';

const T = (type, extra = {}) => ({ type, prompt: '', ...extra });

export const SAMPLES = {
  single: {
    label: 'Pilihan Ganda',
    value: T('single', {
      options: ['1', '2', '3', '4'],
      answerIndex: 1,
    })
  },
  short_answer: {
    label: 'Isian Singkat',
    value: T('short_answer', { acceptedAnswers: ['Fotosintesis', 'fotosintesis', 'Fotosintesis!'] })
  },
  boolean: {
    label: 'Benar / Salah',
    value: T('boolean', { correctBoolean: true })
  },
  essay: {
    label: 'Uraian (manual)',
    value: T('essay', { sampleAnswer: 'Jelaskan siklus air beserta setiap tahapannya.' })
  },
  matching: {
    label: 'Menjodohkan',
    value: T('matching', {
      pairs: [
        { left: 'Mitokondria', right: 'Respirasi sel' },
        { left: 'Kloroplas', right: 'Fotosintesis' }
      ]
    })
  },
  ordering: {
    label: 'Mengurutkan',
    value: T('ordering', { items: ['Evaporasi', 'Kondensasi', 'Curah hujan', 'Koleksi air'] })
  },
  numerical: {
    label: 'Numerik',
    value: T('numerical', { correctValue: 9.81, tolerance: 0.01 })
  },
  code: {
    label: 'Soal Kode (manual)',
    value: T('code', {
      starterCode: 'def luas(p, l):\n    # isi',
      expectedOutput: '20'
    })
  },
  multiple: {
    label: 'Pilihan Ganda Kompleks',
    value: T('multiple', {
      options: ['Bisaberrahan', 'Tidak bisa', 'Hanya cair', 'Hanya gas'],
      correctIndices: [0, 1]
    })
  },
  case_study: {
    label: 'Studi Kasus + 2 sub-soal',
    value: T('case_study', {
      caseText:
        'Sebuah warung ingin mengurangi 30% sampah plastik. Timnya harus menentukan langkah berikutnya berdasarkan data yang tersedia.',
      subQuestions: [
        { type: 'single', options: ['Penarikan Pasar', 'Insentif', 'Edukasi', 'Denda'], answerIndex: 2 },
        { type: 'numerical', correctValue: 30, tolerance: 0 }
      ]
    })
  }
};

export function renderAll() {
  return Object.entries(SAMPLES)
    .map(
      ([key, s]) => `
      <section class="block" data-type="${key}">
        <p class="eyebrow">${s.label}</p>
        ${renderToStaticMarkup(
          <QuestionCardTypeFields value={s.value} onChange={() => {}} disabled={false} />
        )}
      </section>`
    )
    .join('\n');
}
