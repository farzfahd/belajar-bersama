import { IconBookmark, IconCheck, IconEdit, IconFlag, IconRestore, IconTrash } from '../../../shared/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import Spinner from '../../../shared/components/Spinner';
import { useToast } from '../../../shared/components/ToastProvider';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import { STATUS_LABEL } from '../../../lib/constants';
import { timeAgo } from '../../../shared/utils/time';
import { toErrorMessage } from '../../../shared/utils/errors';
import { setNoteState } from '../services/noteService';

function OwnerChip({ name, color, title }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated py-0.5 pl-1 pr-2"
      title={title}
    >
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11.5px] font-medium text-ink">{name}</span>
    </span>
  );
}

// Kartu catatan: identitas, deskripsi singkat, kontrol state per-user
// (bookmark/"dipahami"), lalu aksi pemilik (edit / hapus / pulihkan / permanen).
export default function NoteCard({
  note,
  spaceId,
  topics = [],
  me,
  states = [],
  ownerName,
  ownerColor,
  trashed = false,
  onEdit,
  onReport,
  onDelete,
  onRestore,
  onPurge
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const topic = topics.find((t) => t.id === note.topicId);
  const myState = states.find((s) => s.uid === me && s.noteId === note.id);
  const bookmarked = myState?.bookmarked === true;
  const understood = myState?.understood === true;
  const partnerUnderstood = states.filter(
    (s) => s.noteId === note.id && s.uid !== me && s.understood === true
  ).length;

  const toggle = async (patch) => {
    setBusy(true);
    try {
      await setNoteState(
        spaceId,
        note.id,
        {
          bookmarked: patch.bookmarked ?? bookmarked,
          understood: patch.understood ?? understood
        },
        note.visibility
      );
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card space-y-2.5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-[14.5px] font-medium text-ink">
          {trashed ? (
            <span className="line-through decoration-line">{note.title}</span>
          ) : (
            <Link
              to={`/notes/${note.id}`}
               className="inline-flex min-h-[44px] items-center transition hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              {note.title}
            </Link>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {topic && (
            <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
              {topic.title}
            </span>
          )}
          <OwnerChip
            name={ownerName(note.ownerId)}
            color={ownerColor(note.ownerId)}
            title={note.ownerId === me ? 'Catatan milik kamu' : 'Catatan milik partner'}
          />
          <Badge tone={statusTone(note.status)}>{statusLabel(note.status)}</Badge>
          <Badge tone={note.visibility === 'shared' ? 'accent' : 'dim'}>
            {note.visibility === 'shared' ? 'Dibagikan' : 'Private'}
          </Badge>
        </div>
      </div>

      {Array.isArray(note.tags) && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line bg-bg2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.05em] text-dim"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <p className="line-clamp-2 text-[13px] leading-relaxed text-dim">
        {note.description || 'Belum ada deskripsi singkat.'}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
            diperbarui {timeAgo(note.updatedAt)}
          </span>
          {partnerUnderstood > 0 && (
            <Badge tone="ok">✓ dipahami partner</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!trashed && (
            <>
              {note.ownerId === me && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle({ bookmarked: !bookmarked })}
                    disabled={busy}
                  >
                    {busy ? <Spinner size={12} /> : null}
                    <span className={bookmarked ? 'text-accent' : ''}><IconBookmark size={15} /></span>
                    {bookmarked ? 'Dibukukan' : 'Buku'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle({ understood: !understood })}
                    disabled={busy}
                  >
                    {busy ? <Spinner size={12} /> : null}
                    <span className={understood ? 'text-ok' : ''}><IconCheck size={15} /></span>
                    {understood ? 'Dipahami' : 'Pahami'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit?.(note)}>
                    <IconEdit size={15} /> Edit
                  </Button>
                </>
              )}
              {note.ownerId === me && (
                <Button variant="danger" size="sm" onClick={() => onDelete?.(note)}>
                  <IconTrash size={15} />
                </Button>
              )}
              {note.ownerId !== me && (
                <Button variant="ghost" size="sm" onClick={() => onReport?.(note)}>
                  <IconFlag size={15} /> Report
                </Button>
              )}
            </>
          )}
          {trashed && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onRestore?.(note)}>
                <IconRestore size={15} /> Pulihkan
              </Button>
              <Button variant="danger" size="sm" onClick={() => onPurge?.(note)}>
                <IconTrash size={15} /> Hapus permanen
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
