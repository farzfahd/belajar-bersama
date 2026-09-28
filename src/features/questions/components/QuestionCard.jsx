import { IconEdit, IconEye, IconFlag, IconFolder, IconRestore, IconTarget, IconTrash } from '../../../shared/icons';
import Badge from '../../../shared/ui/Badge';
import Button from '../../../shared/ui/Button';
import { QUESTION_TYPE_LABELS, STATUS_LABEL } from '../../../lib/constants';
import { timeAgo } from '../../../shared/utils/time';

function OwnerChip({ name, isMe }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated py-0.5 px-2 text-[11px] font-medium text-ink">
      <span>{isMe ? 'Kamu' : name || 'Partner'}</span>
    </span>
  );
}

export default function QuestionCard({
  question,
  topic,
  isOwner,
  ownerName,
  trashed = false,
  onPreview,
  onEdit,
  onTrash,
  onRestore,
  onPurge,
  onReport
}) {
  const typeLabel = QUESTION_TYPE_LABELS[question.type] || 'Pilihan Ganda';
  const difficultyTone =
    question.difficulty === 'beginner'
      ? 'dim'
      : question.difficulty === 'intermediate'
      ? 'warn'
      : 'accent';

  return (
    <div className="card space-y-3 py-4 transition-colors hover:border-linestrong">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{typeLabel}</Badge>
          <Badge tone={difficultyTone}>{STATUS_LABEL[question.difficulty] || question.difficulty}</Badge>
          <Badge tone={question.visibility === 'shared' ? 'ok' : 'dim'}>
            {question.visibility === 'shared' ? 'Bersama' : 'Pribadi'}
          </Badge>
          {question.points && (
            <span className="font-mono text-[11px] text-dimmer">
              <IconTarget size={12} /> {question.points} Poin
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-dimmer">
          <OwnerChip isMe={isOwner} name={ownerName} />
          <span>·</span>
          <span>{timeAgo(question.createdAt || question.updatedAt)}</span>
        </div>
      </div>

      {topic && (
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-dimmer">
          <IconFolder size={12} /> {topic.title}
        </div>
      )}

      <div className="font-body text-[14.5px] leading-relaxed text-ink line-clamp-3">
        {question.prompt}
      </div>

      {/* Rincian cepat tipe */}
      {question.type === 'single' || question.type === 'multiple' ? (
        <div className="text-[12px] text-dimmer">
          {question.options?.length || 0} pilihan opsi
        </div>
      ) : question.type === 'matching' ? (
        <div className="text-[12px] text-dimmer">
          {question.pairs?.length || 0} pasang penjodohan
        </div>
      ) : question.type === 'ordering' ? (
        <div className="text-[12px] text-dimmer">
          {question.items?.length || 0} item urutan
        </div>
      ) : null}

      {/* Tags */}
      {Array.isArray(question.tags) && question.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {question.tags.map((t) => (
            <span key={t} className="font-mono text-[10px] text-dimmer bg-bg2 px-1.5 py-0.5 rounded">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--border)_60%,transparent)]">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => onPreview(question)}>
            <IconEye size={15} /> Pratinjau
          </Button>
          {!isOwner && !trashed && (
            <Button variant="ghost" size="sm" onClick={() => onReport?.(question)}>
              <IconFlag size={15} /> Lapor
            </Button>
          )}
        </div>

        {isOwner && (
          <div className="flex items-center gap-1.5">
            {!trashed ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(question)}>
                  <IconEdit size={15} /> Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => onTrash(question)}>
                  <IconTrash size={15} /> Sampah
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => onRestore(question)}>
                  <IconRestore size={15} /> Pulihkan
                </Button>
                <Button variant="danger" size="sm" onClick={() => onPurge(question)}>
                  <IconTrash size={15} /> Hapus Permanen
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
