import { IconEdit, IconPlay, IconTrash } from '../../../shared/icons';
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
import { setResourceState } from '../services/resourceService';
import ResourceTypeIcon from './ResourceTypeIcon';
import YouTubeThumb from './YouTubeThumb';

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

// Kartu resource: identitas tautan + status baca per anggota.
export default function ResourceCard({
  resource,
  spaceId,
  topics = [],
  me,
  states = [],
  partner = null,
  ownerName,
  ownerColor,
  onEdit,
  onDelete
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const topic = topics.find((t) => t.id === resource.topicId);
  const myState = states.find((s) => s.uid === me && s.resourceId === resource.id);
  const myStatus = myState?.status || 'not_started';
  const partnerState = states.find((s) => s.uid === partner && s.resourceId === resource.id);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await setResourceState(spaceId, resource.id, status, resource.visibility);
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card space-y-2.5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {resource.type === 'youtube' ? (
            <YouTubeThumb url={resource.url} type={resource.type} className="h-9 w-16" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-smc border border-line text-[15px]">
              <ResourceTypeIcon type={resource.type} size={16} />
            </span>
          )}
          <div className="min-w-0">
            {topic && (
              <Link
                to={`/roadmap/${topic.id}`}
                 className="inline-flex min-h-[44px] items-center font-mono text-[10px] uppercase tracking-[.05em] text-dimmer transition hover:text-ink"
              >
                {topic.title}
              </Link>
            )}
            <h3 className="truncate text-[14.5px] font-medium text-ink">
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                   className="inline-flex min-h-[44px] items-center transition hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {resource.title || resource.url}
                </a>
              ) : (
                resource.title || resource.url
              )}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <OwnerChip
            name={ownerName(resource.addedBy)}
            color={ownerColor(resource.addedBy)}
            title={resource.addedBy === me ? 'Resource milik kamu' : 'Resource milik partner'}
          />
          <Badge>{STATUS_LABEL[resource.type] || resource.type}</Badge>
          <Badge tone={resource.visibility === 'shared' ? 'accent' : 'dim'}>
            {resource.visibility === 'shared' ? 'Dibagikan' : 'Private'}
          </Badge>
        </div>
      </div>

      {resource.author && (
        <div className="font-mono text-[10.5px] uppercase tracking-[.05em] text-dimmer">
          oleh {resource.author}
        </div>
      )}

      {Array.isArray(resource.tags) && resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resource.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line bg-bg2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.05em] text-dim"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {resource.description && <p className="text-[13px] leading-relaxed text-dim">{resource.description}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
            diperbarui {timeAgo(resource.updatedAt)}
          </span>
          {resource.estimatedMinutes > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
              ± {resource.estimatedMinutes} mnt
            </span>
          )}
          <Badge tone={statusTone(resource.difficulty)}>{statusLabel(resource.difficulty)}</Badge>
          {partnerState?.status === 'completed' && <Badge tone="ok">✓ selesai partner</Badge>}
          {partnerState?.status === 'reading' && <Badge tone="warn"><IconPlay size={12} /> dibaca partner</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label
               className={`inline-flex min-h-[44px] items-center gap-2 rounded-smc border px-2.5 text-[12px] font-medium transition ${
                myStatus === 'completed'
                  ? 'border-[color-mix(in_srgb,var(--ok)_38%,transparent)] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok'
                  : 'border-line bg-bg2 text-dim hover:text-ink'
              } ${busy ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={myStatus === 'completed'}
                disabled={busy}
                onChange={(e) => setStatus(e.target.checked ? 'completed' : 'not_started')}
                className="h-4 w-4 accent-[var(--ok)]"
              />
              Sudah dilihat
            </label>
            <button
              type="button"
              onClick={() => setStatus(myStatus === 'reading' ? 'not_started' : 'reading')}
              disabled={busy}
              aria-pressed={myStatus === 'reading'}
               className={`min-h-[44px] rounded-smc border px-2.5 text-[12px] font-medium transition hover:text-ink focus-visible:outline-2 focus-visible:outline-accent ${
                myStatus === 'reading'
                  ? 'border-[color-mix(in_srgb,var(--warn)_38%,transparent)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn'
                  : 'border-line bg-bg2 text-dim'
              }`}
            >
              <IconPlay size={15} /> Sedang dibaca
            </button>
            {busy && <Spinner size={12} />}
          </div>
          {resource.addedBy === me && (
            <Button variant="ghost" size="sm" onClick={() => onEdit?.(resource)}>
              <IconEdit size={15} /> Edit
            </Button>
          )}
          {resource.addedBy === me && (
            <Button variant="danger" size="sm" onClick={() => onDelete?.(resource)}>
              <IconTrash size={15} />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}