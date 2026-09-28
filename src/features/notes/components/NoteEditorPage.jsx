import {
  IconBold,
  IconChecklist,
  IconEdit,
  IconEmptyNote,
  IconFlag,
  IconImage,
  IconItalic,
  IconLink,
  IconList,
  IconQuote,
  IconTable
} from '../../../shared/icons';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import EmptyState from '../../../shared/ui/EmptyState';
import Input from '../../../shared/ui/Input';
import Select from '../../../shared/ui/Select';
import TagInput from '../../../shared/ui/TagInput';
import PageLoading from '../../../shared/components/PageLoading';
import { useToast } from '../../../shared/components/ToastProvider';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useTopics } from '../../topics/hooks/useTopics';
import { useNotes } from '../hooks/useNotes';
import { useTagSuggestions } from '../../search/hooks/useTagSuggestions';
import { createNote, updateNote } from '../services/noteService';
import { noteVisibleTo } from '../utils/visibility';
import { STATUS, STATUS_LABEL, LEVEL_LABEL } from '../../../lib/constants';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { toErrorMessage } from '../../../shared/utils/errors';
import { isHttpUrl, normalizeTags } from '../../../shared/utils/validate';
import Markdown from './Markdown';
import MarkdownEditor from './MarkdownEditor';
import TopicFormModal from '../../topics/components/TopicFormModal';
import Modal from '../../../shared/ui/Modal';
import { reportNote } from '../services/noteService';

// Label indikator autosave di atas editor.
const SAVE_LABEL = {
  idle: 'siap',
  dirty: 'belum disimpan',
  saving: 'menyimpan…',
  saved: 'tersimpan',
  error: 'gagal menyimpan'
};

// Editor catatan: mode buat (/notes/new) atau ubah (/notes/:noteId).
// Catatan milik partner dibuka read-only (hanya pemilik boleh menulis).
export default function NoteEditorPage() {
  const { noteId } = useParams();
  const [params] = useSearchParams();
  const spaceId = useSpaceId();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthState();
  const { data: notes, loading } = useNotes(spaceId);
  const { data: topics } = useTopics(spaceId);
  const tagSuggestions = useTagSuggestions(spaceId);

  const isNew = !noteId || noteId === 'new';
  // Catatan privat milik partner tidak pernah sampai ke partner:
  // rules sudah menolak (noteVisibleTo) dan useNotes hanya mengambil
  // shared + milik sendiri.
  const found = isNew ? null : notes.find((n) => n.id === noteId);
  const note = found && noteVisibleTo(found, user?.uid) ? found : null;
  const from = params.get('from');
  const backTo = from || '/learn?tab=notes';

  const orderedTopics = [...topics].sort(
    (a, b) => a.level - b.level || a.order - b.order || a.title.localeCompare(b.title)
  );
  const initialTopicId = params.get('topicId') || orderedTopics[0]?.id || '';

  const empty = {
    title: '',
    description: '',
    topicId: initialTopicId,
    status: 'draft',
    visibility: 'private',
    difficulty: 'beginner',
    tags: [],
    body: ''
  };
  const [form, setForm] = useState(empty);
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
  const modeTabRefs = useRef([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const openedKey = useRef(null);
  const bodyRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ text: '', url: '' });
  const [linkUrlError, setLinkUrlError] = useState(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState({ alt: '', url: '' });
  const [imageUrlError, setImageUrlError] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // 'idle'|'dirty'|'saving'|'saved'|'error'
  const lastSavedRef = useRef(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState('error');
  const [reportMessage, setReportMessage] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const moveModeTab = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % 2;
    if (event.key === 'ArrowLeft') next = (index - 1 + 2) % 2;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 1;
    setMode(next === 0 ? 'edit' : 'preview');
    modeTabRefs.current[next]?.focus();
  };
  // Buat topik baru langsung dari editor catatan (dropdown Topik belum punya
  // topik dan tidak ada jalur membuat topik di sini sebelumnya).
  const [topicOpen, setTopicOpen] = useState(false);

  // Riwayat undo/redo body (Ctrl+Z/Y) mencakup pengetikan & operasi toolbar.
  const past = useRef([]);
  const future = useRef([]);
  const lastTypeAt = useRef(0);

  const recordHistory = (val) => {
    const p = past.current;
    if (p[p.length - 1] !== val) p.push(val);
    if (p.length > 100) p.shift();
    future.current = [];
  };
  const clearHistory = () => {
    past.current = [];
    future.current = [];
  };
  const jumpTo = (val) => {
    setForm((f) => ({ ...f, body: val }));
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(val.length, val.length);
      }
    });
  };
  const undo = () => {
    const p = past.current;
    if (!p.length) return;
    const prev = p.pop();
    future.current.push(form.body);
    jumpTo(prev);
  };
  const redo = () => {
    const f = future.current;
    if (!f.length) return;
    const next = f.pop();
    past.current.push(form.body);
    jumpTo(next);
  };

  const editMode = isNew || params.get('edit') === '1';

  // Muat isi catatan setelah snapshot benar-benar menyediakan dokumennya.
  useEffect(() => {
    if (!isNew && !note) return;
    if (openedKey.current === noteId) return;
    openedKey.current = noteId;
    if (!isNew && note) {
      setForm({
        title: note.title || '',
        description: note.description || '',
        topicId: note.topicId || '',
        status: note.status || 'draft',
        visibility: note.visibility || 'private',
        difficulty: note.difficulty || 'beginner',
        tags: normalizeTags(Array.isArray(note.tags) ? note.tags : []),
        body: note.body || ''
      });
      setMode('edit');
    } else if (isNew) {
      setForm((f) => ({ ...empty, topicId: f.topicId || initialTopicId }));
    }
    clearHistory();
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, isNew, note]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // --- Bantuan markdown: toolbar + pintasan (Ctrl+B/I/K). Data tetap markdown.
  const setBody = (fn) => setForm((f) => ({ ...f, body: fn(f.body) }));

  // bungkus teks terpilih dengan prefix/suffix; toggle: bila sudah terbungkus
  // penanda yang sama, Ctrl+B/I justru melepas pembungkus (bukan menambah bintang)
  const wrapSelection = (prefix, suffix, placeholder) => {
    const el = bodyRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = form.body.slice(s, e);

    // kasus A: seleksi sudah memuat penanda utuh → lepas penandanya
    if (
      sel &&
      sel.startsWith(prefix) &&
      sel.endsWith(suffix) &&
      sel.length >= prefix.length + suffix.length + 1
    ) {
      const inner = sel.slice(prefix.length, sel.length - suffix.length);
      recordHistory(form.body);
      setBody((b) => b.slice(0, s) + inner + b.slice(e));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s, s + inner.length);
      });
      return;
    }
    // kasus B: penanda tepat di luar seleksi → lepas pembungkus.
    // Penanda tunggal '*' yang menempel pada bintang ganda (**...**) bukan
    // pembungkus italic — jangan dilepas (agar Ctrl+I tak merusak bold).
    const pre = form.body.slice(s - prefix.length, s);
    const post = form.body.slice(e, e + suffix.length);
    if (sel && pre === prefix && post === suffix) {
      const singleStar = prefix === '*' || suffix === '*';
      const pl = prefix.length;
      const sl = suffix.length;
      const gluedL = form.body[s - pl - 1] === '*';
      const gluedR = form.body[e + sl] === '*';
      if (singleStar && gluedL && gluedR) {
        // seleksi di dalam ***...*** (bold+italic): lepas satu bintang per sisi
        if (form.body[s - pl - 2] === '*' && form.body[e + sl + 1] === '*') {
          recordHistory(form.body);
          setBody((b) => b.slice(0, s - 1) + sel + b.slice(e + 1));
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(s - 1, s - 1 + sel.length);
          });
          return;
        }
        // selain itu: '*' menempel bintang ganda (teks bold polos) → biarkan bungkus
      } else if (!singleStar || (!gluedL && !gluedR)) {
        const ns = s - prefix.length;
        recordHistory(form.body);
        setBody((b) => b.slice(0, ns) + sel + b.slice(e + suffix.length));
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(ns, ns + sel.length);
        });
        return;
      }
    }
    // kasus markas: bungkus (seleksi kosong → placeholder)
    recordHistory(form.body);
    const content = sel || placeholder;
    setBody((b) => b.slice(0, s) + prefix + content + suffix + b.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length + content.length);
    });
  };

  // Enter pada baris list: lanjutkan penanda yang sama; baris list kosong + Enter
  // menutup list. Penomoran bertambah otomatis (1. → 2., dst).
  const onEnterList = (e) => {
    const el = bodyRef.current;
    if (!el) return false;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    if (s !== en) return false;
    const val = form.body;
    const lineStart = val.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
    const line = val.slice(lineStart);
    const m = line.match(/^(\s*)(>|[-*+]|\d+\.)(\s+|$)(\[[ xX]\]\s+)?/);
    if (!m) return false;
    const suffix = line.slice(m[0].length);
    const isBare = !suffix.trim();
    recordHistory(val);
    if (isBare) {
      const next = val.slice(0, lineStart) + val.slice(lineStart + m[0].length);
      setForm((f) => ({ ...f, body: next }));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(lineStart, lineStart);
      });
      return true;
    }
    let marker = m[2];
    const num = marker.match(/^(\d+)\.$/);
    if (num) marker = `${Number(num[1]) + 1}.`;
    const insert = `\n${m[1]}${marker}${m[3] && /\s$/.test(m[3]) ? m[3] : ' '}${m[4] || ''}`;
    const next = val.slice(0, s) + insert + val.slice(en);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + insert.length, s + insert.length);
    });
    return true;
  };

  // sisipkan awalan di awal baris kursor (sub judul/daftar/kutipan)
  const linePrefix = (prefix) => {
    const el = bodyRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = form.body.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
    recordHistory(form.body);
    setBody((b) => b.slice(0, lineStart) + prefix + b.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    });
  };

  const openLink = () => {
    const el = bodyRef.current;
    const sel = el ? form.body.slice(el.selectionStart, el.selectionEnd) : '';
    setLinkDraft({ text: sel, url: '' });
    setLinkUrlError(null);
    setLinkOpen(true);
  };

  const openImage = () => {
    const el = bodyRef.current;
    const sel = el ? form.body.slice(el.selectionStart, el.selectionEnd) : '';
    setImageDraft({ alt: sel.trim(), url: '' });
    setImageUrlError(null);
    setImageOpen(true);
  };

  const applyImage = () => {
    const url = imageDraft.url.trim();
    if (!isHttpUrl(url)) {
      setImageUrlError('URL gambar wajib diawali http:// atau https://.');
      return;
    }
    const el = bodyRef.current;
    const s = el ? el.selectionStart : form.body.length;
    const e = el ? el.selectionEnd : s;
    const alt = imageDraft.alt.trim() || 'gambar';
    const md = `![${alt}](${url})`;
    recordHistory(form.body);
    setBody((b) => b.slice(0, s) + md + b.slice(e));
    setImageOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + md.length, s + md.length);
    });
  };

  // Sisipkan blok siap pakai (blok kode / tabel) dan letakkan kursor di bagian
  // yang paling sering diedit: baris isi kode atau sel kosong pertama.
  const insertBlock = (text, cursorOffset) => {
    const el = bodyRef.current;
    const s = el ? el.selectionStart : form.body.length;
    const e = el ? el.selectionEnd : s;
    recordHistory(form.body);
    setBody((b) => `${b.slice(0, s)}${text}${b.slice(e)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + cursorOffset, s + cursorOffset);
    });
  };

  const CODE_BLOCK = { text: '```\n\n```', cursorOffset: 4 };
  const TABLE_BLOCK = {
    text: '| Kolom 1 | Kolom 2 |\n| --- | --- |\n|  |  |',
    cursorOffset: 46
  };

  const applyLink = () => {
    const url = linkDraft.url.trim();
    if (!isHttpUrl(url)) {
      setLinkUrlError('URL wajib diawali http:// atau https://.');
      return;
    }
    const el = bodyRef.current;
    const text = linkDraft.text.trim() || 'tautan';
    const s = el ? el.selectionStart : form.body.length;
    const e = el ? el.selectionEnd : s;
    const link = `[${text}](${url})`;
    recordHistory(form.body);
    setBody((b) => b.slice(0, s) + link + b.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + link.length, s + link.length);
    });
    setLinkOpen(false);
  };

  // Ketik biasa: simpan riwayat tiap ~700ms atau perubahan besar (paste/hapus blok).
  const onBodyChange = (e) => {
    const value = e.target.value;
    const t = Date.now();
    const delta = Math.abs(value.length - form.body.length);
    if (t - lastTypeAt.current > 700 || delta !== 1) recordHistory(form.body);
    lastTypeAt.current = t;
    setForm((f) => ({ ...f, body: value }));
  };

  const onBodyKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' && !mod) {
      if (onEnterList(e)) return;
    } else if (mod && k === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (mod && k === 'z') {
      e.preventDefault();
      undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && k === 'b') {
      e.preventDefault();
      wrapSelection('**', '**', 'tebal');
    } else if (mod && k === 'i') {
      e.preventDefault();
      wrapSelection('*', '*', 'miring');
    } else if (mod && k === 'k') {
      e.preventDefault();
      openLink();
    }
  };

  // Ikon toolbar memakai SVG agar konsisten dengan sistem ikon; label teks
  // (B, I, H, `, ```) sengaja dibiarkan monospace seperti sebelumnya.
  const TOOL_BUTTONS = [
    { key: 'bold', icon: IconBold, title: 'Tebal (Ctrl+B)', onClick: () => wrapSelection('**', '**', 'tebal') },
    { key: 'italic', icon: IconItalic, title: 'Miring (Ctrl+I)', onClick: () => wrapSelection('*', '*', 'miring') },
    { key: 'heading', label: 'H', title: 'Sub judul — mulai baris dengan ##', onClick: () => linePrefix('## ') },
    { key: 'link', icon: IconLink, title: 'Sisipkan link (Ctrl+K)', onClick: openLink },
    { key: 'list', icon: IconList, title: 'Daftar', onClick: () => linePrefix('- ') },
    { key: 'check', icon: IconChecklist, title: 'Checklist', onClick: () => linePrefix('- [ ] ') },
    { key: 'code', label: '`', title: 'Kode inline', onClick: () => wrapSelection('`', '`', 'kode') },
    { key: 'codeblock', label: '```', title: 'Blok kode', onClick: () => insertBlock(CODE_BLOCK.text, CODE_BLOCK.cursorOffset) },
    { key: 'table', icon: IconTable, title: 'Sisipkan tabel', onClick: () => insertBlock(TABLE_BLOCK.text, TABLE_BLOCK.cursorOffset) },
    { key: 'image', icon: IconImage, title: 'Sisipkan gambar via URL', onClick: openImage },
    { key: 'quote', icon: IconQuote, title: 'Kutipan', onClick: () => linePrefix('> ') },
  ];

  const buildPayload = (f) => ({
    title: String(f.title || '').trim(),
    description: String(f.description || '').trim(),
    topicId: f.topicId,
    status: f.status,
    visibility: f.visibility,
    difficulty: f.difficulty,
    tags: normalizeTags(f.tags),
    body: f.body
  });

  const payloadKey = (payload) => JSON.stringify(payload);

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      setError('Judul wajib diisi.');
      return;
    }
    if (!form.topicId || !orderedTopics.some((t) => t.id === form.topicId)) {
      setError('Pilih topik tempat catatan ini menempel.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title,
        description: form.description.trim(),
        topicId: form.topicId,
        status: form.status,
        visibility: form.visibility,
        difficulty: form.difficulty,
        tags: normalizeTags(form.tags),
        body: form.body
      };
      if (isNew) {
        const id = await createNote(spaceId, payload);
        toast.success('Catatan dibuat.');
        navigate(`/notes/${id}?from=${encodeURIComponent(backTo)}`, { replace: true });
      } else {
        await updateNote(spaceId, noteId, payload);
        lastSavedRef.current = payloadKey(payload);
        setSaveState('saved');
        toast.success('Catatan disimpan.');
      }
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    setReportBusy(true);
    try {
      await reportNote(spaceId, note.id, reportType, reportMessage);
      toast.success('Report terkirim.');
      setReportMessage('');
      setReportOpen(false);
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setReportBusy(false);
    }
  };

  // --- Autosave (hanya catatan yang sudah ada & milik sendiri) ---
  // Catatan baru tetap butuh tombol Simpan (belum punya id di Firestore).
  // Debounce 2 detik; indikator: belum disimpan · menyimpan… · tersimpan.
  const editable = editMode && !isNew && note && note.ownerId === user?.uid;
  useEffect(() => {
    if (!editable) return undefined;
    const payload = buildPayload(form);
    if (!payload.title || !payload.topicId) return undefined;
    if (payloadKey(payload) === lastSavedRef.current) return undefined;

    setSaveState('dirty');
    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await updateNote(spaceId, noteId, payload);
        lastSavedRef.current = payloadKey(payload);
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(toErrorMessage(e));
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editable, noteId, spaceId]);

  // Baseline: begitu catatan termuat, tandai isi saat ini sebagai tersimpan.
  useEffect(() => {
    if (!editable || !note) return;
    lastSavedRef.current = payloadKey(buildPayload(form));
    setSaveState('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, editable]);

  if (loading && !notes.length) {
    return (
      <PageLoading label="Memuat catatan…" />
    );
  }

  if (!isNew && !note) {
    return (
      <EmptyState
        icon={<IconEmptyNote size={26} />}
        title="Catatan tidak ditemukan"
        description="Catatan ini mungkin sudah dihapus oleh pemiliknya."
        action={<Link to={backTo}><Button variant="ghost">← Kembali</Button></Link>}
      />
    );
  }

  const readOnly = !isNew && note.ownerId !== user?.uid;

  if (!editMode) {
    return (
      <div className="space-y-5">
        <Link to={backTo} className="inline-flex min-h-[44px] items-center font-mono text-[10.5px] uppercase tracking-[.05em] text-dim hover:text-ink">
          ← Kembali
        </Link>
        <section className="card space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(note.status)}>{statusLabel(note.status)}</Badge>
            <Badge tone={note.visibility === 'shared' ? 'accent' : 'dim'}>
              {note.visibility === 'shared' ? 'Dibagikan' : 'Private'}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
              milik partner · dibaca saja
            </span>
          </div>
          <h1 className="font-head text-2xl leading-tight text-ink">{note.title}</h1>
          {note.description && (
            <p className="text-[14px] leading-relaxed text-dim">{note.description}</p>
          )}
          {Array.isArray(note.tags) && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <span key={t} className="rounded-full border border-line bg-bg2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.05em] text-dim">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </section>
        <Markdown text={note.body || ''} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {note.ownerId === user?.uid ? (
            <Link to={`/notes/${note.id}?edit=1&from=${encodeURIComponent(backTo)}`}>
              <Button><IconEdit size={15} /> Edit catatan</Button>
            </Link>
          ) : (
            <Button variant="ghost" onClick={() => setReportOpen(true)}><IconFlag size={15} /> Report</Button>
          )}
        </div>
        <Modal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          title="Report catatan"
          subtitle="Sampaikan kesalahan, kritik, atau saran kepada pemilik catatan."
          footer={
            <>
              <Button variant="ghost" onClick={() => setReportOpen(false)}>Batal</Button>
              <Button loading={reportBusy} onClick={submitReport}>Kirim report</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Select label="Jenis report" value={reportType} onChange={(event) => setReportType(event.target.value)}>
              <option value="error">Ada kesalahan</option>
              <option value="feedback">Kritik atau saran</option>
            </Select>
            <div>
              <label className="eyebrow block" htmlFor="note-report-message">Pesan</label>
              <textarea
                id="note-report-message"
                value={reportMessage}
                onChange={(event) => setReportMessage(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Jelaskan bagian yang perlu diperbaiki…"
                className="mt-1.5 min-h-[120px] w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[13.5px] text-ink"
              />
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={backTo} className="inline-flex min-h-[44px] items-center font-mono text-[10.5px] uppercase tracking-[.05em] text-dim hover:text-ink">
          ← Kembali
        </Link>
        <div role="tablist" aria-label="Tampilan editor" className="flex border-b border-line">
          {['edit', 'preview'].map((m, index) => (
            <button
               key={m}
               ref={(node) => { modeTabRefs.current[index] = node; }}
               id={`note-mode-tab-${m}`}
               role="tab"
               aria-selected={mode === m}
               aria-controls="note-mode-tabpanel"
               tabIndex={mode === m ? 0 : -1}
               onClick={() => setMode(m)}
               onKeyDown={(event) => moveModeTab(event, index)}
               className={`-mb-px min-h-[44px] border-b-2 px-3 text-[12.5px] transition-colors ${
                mode === m ? 'border-b-accent font-semibold text-ink' : 'border-b-transparent text-dim hover:text-ink'
              }`}
            >
              {m === 'edit' ? 'Editor' : 'Pratinjau'}
            </button>
          ))}
        </div>
      </div>

      <div id="note-mode-tabpanel" role="tabpanel" aria-labelledby={`note-mode-tab-${mode}`} tabIndex={0}>
        {mode === 'edit' ? (
        <div className="space-y-4">
          <Input
            label="Judul"
            value={form.title}
            onChange={set('title')}
            maxLength={200}
            autoFocus
            error={error && !form.title ? 'Judul wajib diisi.' : undefined}
          />

          <Input
            label="Deskripsi singkat"
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
            placeholder="Ringkasan satu atau dua kalimat tentang catatan ini"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow block" htmlFor="note-topic">
                Topik
              </label>
              <div className="mt-1.5 flex items-stretch gap-1.5">
                <Select
                  id="note-topic"
                  value={form.topicId}
                  onChange={set('topicId')}
                  className="flex-1"
                >
                  <option value="" disabled>
                    Pilih topik…
                  </option>
                  {orderedTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {'·  '.repeat(t.level)}
                      {t.title} ({LEVEL_LABEL[t.level]})
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  title="Buat topik baru"
                  aria-label="Buat topik baru"
                  onClick={() => setTopicOpen(true)}
                   className="flex h-11 min-w-10 shrink-0 self-center items-center justify-center rounded-smc border border-line bg-bg2 px-2 text-[16px] font-semibold text-ink transition hover:border-ink"
                >
                  ＋
                </button>
              </div>
              {orderedTopics.length === 0 && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-dimmer">
                  Belum ada topik di ruang ini. Klik ＋ untuk membuat subject pertama (selanjutnya
                  kelola struktur di halaman Roadmap).
                </p>
              )}
            </div>
            <Select label="Status" value={form.status} onChange={set('status')}>
              {STATUS.note.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Visibilitas" value={form.visibility} onChange={set('visibility')}>
              <option value="private">Private — hanya kamu</option>
              <option value="shared">Dibagikan — terlihat partner</option>
            </Select>
            <Select label="Tingkat kesulitan" value={form.difficulty} onChange={set('difficulty')}>
              {STATUS.difficulty.map((d) => (
                <option key={d} value={d}>
                  {STATUS_LABEL[d]}
                </option>
              ))}
            </Select>
          </div>

          <TagInput
            value={form.tags}
            onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            suggestions={tagSuggestions}
          />

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="note-body" className="eyebrow block">
                Isi (Markdown)
              </label>
              <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
                {isNew ? 'Ctrl+B tebal · Ctrl+I miring · Ctrl+K link' : `${SAVE_LABEL[saveState]} · Ctrl+B tebal · Ctrl+I miring · Ctrl+K link`}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 border-b border-line pb-1.5">
              {TOOL_BUTTONS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  title={b.title}
                  aria-label={b.title}
                  onClick={b.onClick}
                   className="flex h-11 min-w-11 items-center justify-center rounded-smc border border-line bg-bg2 px-1.5 font-mono text-[11.5px] text-dim transition hover:border-ink hover:text-ink"
                >
                  {b.icon ? <b.icon size={15} /> : b.label}
                </button>
              ))}
            </div>
            {linkOpen && (
              <div className="mt-1.5 space-y-2 rounded-smc border border-line bg-bg2 p-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    label="Teks"
                    value={linkDraft.text}
                    onChange={(e) => setLinkDraft((d) => ({ ...d, text: e.target.value }))}
                  />
                  <Input
                    label="URL"
                    value={linkDraft.url}
                    onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
                    placeholder="https://…"
                    error={linkUrlError}
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => setLinkOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={applyLink}>Sisipkan</Button>
                </div>
              </div>
            )}
            {imageOpen && (
              <div className="mt-1.5 space-y-2 rounded-smc border border-line bg-bg2 p-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    label="Teks alternatif"
                    value={imageDraft.alt}
                    onChange={(e) => setImageDraft((d) => ({ ...d, alt: e.target.value }))}
                    hint="Dibaca screen reader bila gambar gagal dimuat."
                  />
                  <Input
                    label="URL gambar"
                    value={imageDraft.url}
                    onChange={(e) => setImageDraft((d) => ({ ...d, url: e.target.value }))}
                    placeholder="https://…"
                    error={imageUrlError}
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => setImageOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={applyImage}>Sisipkan</Button>
                </div>
              </div>
            )}
            <MarkdownEditor
              id="note-body"
              inputRef={bodyRef}
              value={form.body}
              onChange={onBodyChange}
              onKeyDown={onBodyKeyDown}
              maxLength={100000}
              placeholder={
                '# Judul kecil\n\nTulis **bold**, *miring*, `kode`, daftar, tabel, atau gambar. LaTeX $x^2$ dan blok $$\\frac{a}{b}$$ dirender di pratinjau.\n\n- poin 1\n- poin 2\n'
              }
            />
            <p className="mt-1 text-right font-mono text-[10.5px] text-dimmer">
              {form.body.length.toLocaleString('id-ID')}/100.000
            </p>
          </div>

          {error && !(!form.title && error === 'Judul wajib diisi.') && (
            <p className="text-[12.5px] text-accent">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(backTo)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={save} loading={busy}>
              {isNew ? 'Simpan catatan' : 'Simpan perubahan'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="card space-y-2">
          <h1 className="font-head text-2xl leading-tight text-ink">
            {form.title.trim() || 'Tanpa judul'}
          </h1>
          {!form.body.trim() && (
            <p className="text-[13px] text-dimmer">Isi masih kosong — belum ada pratinjau.</p>
          )}
          <Markdown text={form.body} />
        </div>
      )}
      </div>

      {/* Buat topik baru langsung dari sini; topik terpilih otomatis menempel */}
      <TopicFormModal
        open={topicOpen}
        onClose={() => setTopicOpen(false)}
        spaceId={spaceId}
        onSaved={(id) => setForm((f) => ({ ...f, topicId: id }))}
      />
    </div>
  );
}
