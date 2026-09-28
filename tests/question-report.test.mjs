import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COL,
  QUESTION_REPORT_LIMITS,
  QUESTION_REPORT_TYPE_LABELS,
  QUESTION_REPORT_TYPES
} from '../src/lib/constants.js';
import {
  REPORT_TYPE_VALUES,
  normalizeQuestionReport
} from '../src/features/questions/utils/questionReport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
const service = readFileSync(join(root, 'src/features/questions/services/questionService.js'), 'utf8');

// Blok rules khusus report soal (subkoleksi di bawah questions).
const reportBlock = (() => {
  const start = rules.indexOf('match /spaces/{spaceId}/questions/{questionId}/reports/{reportId}');
  assert.notEqual(start, -1, 'blok rules untuk reports soal harus ada');
  // Blok ini berakhir di match berikutnya pada indentasi yang sama.
  const rest = rules.slice(start + 1);
  const end = rest.search(/\n {4}match \//);
  return end === -1 ? rules.slice(start) : rules.slice(start, start + 1 + end);
})();

describe('konstanta report soal', () => {
  it('lima jenis report, semuanya punya label Bahasa Indonesia', () => {
    assert.deepEqual(REPORT_TYPE_VALUES.slice().sort(), [
      'ambiguous',
      'duplicate',
      'other',
      'typo',
      'wrong_answer'
    ]);
    for (const type of REPORT_TYPE_VALUES) {
      assert.ok(QUESTION_REPORT_TYPE_LABELS[type], `label untuk "${type}" wajib ada`);
    }
    assert.equal(Object.keys(QUESTION_REPORT_TYPE_LABELS).length, REPORT_TYPE_VALUES.length);
  });

  it('report soal memakai subkoleksi `reports`, BUKAN koleksi top-level', () => {
    assert.equal(COL.questionReports, 'reports');
    assert.notEqual(COL.questionReports, COL.noteReports);
  });

  it('batas panjang pesan mengikuti rules (2.000)', () => {
    assert.equal(QUESTION_REPORT_LIMITS.maxMessage, 2000);
    assert.ok(reportBlock.includes('request.resource.data.message.size() <= 2000'));
  });
});

describe('normalizeQuestionReport', () => {
  it('memangkas spasi di kedua ujung', () => {
    assert.deepEqual(normalizeQuestionReport('typo', '  ada salah ketik  '), {
      type: 'typo',
      message: 'ada salah ketik'
    });
  });

  it('semua jenis report resmi diterima', () => {
    for (const type of REPORT_TYPE_VALUES) {
      assert.equal(normalizeQuestionReport(type, 'keterangan').type, type);
    }
  });

  it('jenis tidak dikenal / kosong ditolak', () => {
    assert.throws(() => normalizeQuestionReport('ngelapor', 'x'), /Jenis report/i);
    assert.throws(() => normalizeQuestionReport('', 'x'), /Jenis report/i);
    assert.throws(() => normalizeQuestionReport(undefined, 'x'), /Jenis report/i);
  });

  it('pesan kosong (spasi saja) ditolak', () => {
    assert.throws(() => normalizeQuestionReport('other', '   '), /wajib diisi/i);
    assert.throws(() => normalizeQuestionReport('other', ''), /wajib diisi/i);
  });

  it('pesan melebihi 2.000 karakter ditolak, tepat 2.000 diterima', () => {
    const max = 'a'.repeat(QUESTION_REPORT_LIMITS.maxMessage);
    assert.equal(normalizeQuestionReport('other', max).message.length, QUESTION_REPORT_LIMITS.maxMessage);
    assert.throws(() => normalizeQuestionReport('other', `${max}a`), /maksimal/i);
  });
});

describe('rules reports soal', () => {
  it('daftar jenis di rules sama persis dengan client', () => {
    const fromRules = [...reportBlock.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((v) => REPORT_TYPE_VALUES.includes(v));
    assert.deepEqual(
      [...new Set(fromRules)].sort(),
      REPORT_TYPE_VALUES.slice().sort(),
      'client harus mengikuti rules, bukan sebaliknya'
    );
  });

  it('report abadi: update & delete selalu ditolak', () => {
    assert.ok(reportBlock.includes('allow update, delete: if false;'));
  });

  it('pelapor harus anggota ruang dan(report miliknya sendiri', () => {
    assert.ok(reportBlock.includes('allow create: if isMember(spaceId)'));
    assert.ok(reportBlock.includes('request.resource.data.reporterId == request.auth.uid'));
  });

  it('report atas soal sendiri DITOLAK (createdBy != auth.uid)', () => {
    assert.ok(
      reportBlock.includes('.data.createdBy != request.auth.uid'),
      'melapor soal sendiri tidak berguna dan harus dilarang rules'
    );
  });

  it('report atas soal yang tidak terlihat pelapor DITOLAK', () => {
    assert.ok(reportBlock.includes('questionVisibleTo('));
  });

  it('questionId di dalam dokumen harus sama dengan di path', () => {
    assert.ok(reportBlock.includes('request.resource.data.questionId == questionId'));
  });

  it('skema minimal: type + message + createdAt + schemaVersion', () => {
    assert.ok(reportBlock.includes('request.resource.data.message is string'));
    assert.ok(reportBlock.includes('request.resource.data.message.size() > 0'));
    assert.ok(reportBlock.includes('request.resource.data.createdAt is timestamp'));
    assert.ok(reportBlock.includes('request.resource.data.schemaVersion == 1'));
  });

  it('owner boleh list polos; pelapor hanya boleh get (dibatasi rules engine)', () => {
    // Isi tiap rule diambil satu per satu, bukan "apa pun setelahnya" - kalau
    // tidak, `resource.data` dari rule `create` ikut terhitung dan tesnya
    // memeriksa hal yang salah.
    const ruleBody = (name) => {
      const from = reportBlock.indexOf(`allow ${name}:`);
      assert.notEqual(from, -1, `rule "allow ${name}" harus ada`);
      const rest = reportBlock.slice(from);
      const next = rest.slice(1).search(/\n {6}allow |\n {6}\/\//);
      return next === -1 ? rest : rest.slice(0, next + 1);
    };

    const getRule = ruleBody('get');
    const listRule = ruleBody('list');

    // `get`: pemilik soal ATAU pelapor sendiri.
    assert.ok(getRule.includes('.data.createdBy == request.auth.uid'));
    assert.ok(getRule.includes('resource.data.reporterId == request.auth.uid'));

    // `list`: HANYA pemilik soal. Begitu `resource.data` muncul (walau di
    // dalam OR), query polos owner ikut tidak terbuktikan rules-nya - ini
    // dibuktikan tes emulator, bukan asumsi.
    assert.ok(listRule.includes('.data.createdBy == request.auth.uid'));
    assert.ok(
      !listRule.includes('resource.data'),
      'resource.data di rule list membuat query polos owner tidak terbuktikan'
    );
  });
});

describe('service reports soal', () => {
  it('menulis ke subkoleksi reports di bawah soal', () => {
    assert.ok(
      service.includes('COL.questions, questionId, COL.questionReports'),
      'report harus nested di bawah soal supaya owner bisa listener polos'
    );
  });

  it('dokumen report menyimpan questionId, reporterId, dan schemaVersion', () => {
    assert.ok(service.includes('questionId,'));
    assert.ok(service.includes('reporterId: uid'));
    assert.ok(service.includes('schemaVersion: SCHEMA_VERSION'));
  });

  it('listener report hanya untuk owner: tanpa filter reporterId', () => {
    assert.ok(service.includes("orderBy('createdAt', 'desc')"));
    assert.ok(
      !service.includes('onlyMine'),
      'UI tidak boleh mencoba list report sebagai pelapor - rules menolaknya'
    );
  });
});
