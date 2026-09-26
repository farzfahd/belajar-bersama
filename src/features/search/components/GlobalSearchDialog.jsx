import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../../../shared/ui/Modal';
import Input from '../../../shared/ui/Input';
import Spinner from '../../../shared/components/Spinner';
import { isHttpUrl } from '../../../shared/utils/validate';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpaceId } from '../../space/SpaceContext';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { resourceTypeIcon } from '../../resources/utils/icons';

const KIND_LABEL = {
  topic: 'Topik',
  note: 'Catatan',
  resource: 'Resource'
};

function kindIcon(result) {
  if (result.kind === 'topic') return '🗺️';
  if (result.kind === 'note') return '📝';
  return resourceTypeIcon(result.type);
}

function SearchResult({ result, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className="flex w-full items-start gap-3 border-b border-line px-1 py-3 text-left transition hover:bg-bg2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-smc border border-line bg-bg2 text-[15px]">
        {kindIcon(result)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9.5px] uppercase tracking-[.06em] text-dimmer">
          <span>{KIND_LABEL[result.kind] || result.kind}</span>
          {result.topicPath && <span className="truncate normal-case tracking-normal">{result.topicPath}</span>}
        </span>
        <span className="mt-0.5 block truncate text-[14px] font-medium text-ink">{result.title}</span>
        {result.text && <span className="mt-1 block line-clamp-2 text-[12.5px] leading-relaxed text-dim">{result.text}</span>}
        {result.tags.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {result.tags.slice(0, 5).map((item) => (
              <span key={item} className="font-mono text-[9.5px] uppercase tracking-[.05em] text-dimmer">
                #{item}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="mt-2 shrink-0 text-dimmer" aria-hidden="true">
        {result.kind === 'resource' ? '↗' : '→'}
      </span>
    </button>
  );
}

export default function GlobalSearchDialog({ open, onClose }) {
  const spaceId = useSpaceId();
  const { user } = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const { results, tags, loading, error } = useGlobalSearch({
    spaceId,
    uid: user?.uid,
    query,
    tag
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setTag('');
    }
  }, [open]);

  const selectResult = (result) => {
    onClose();
    if (result.kind === 'resource') {
      if (isHttpUrl(result.url)) window.open(result.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const from = `${location.pathname}${location.search}`;
    const destination =
      result.kind === 'note'
        ? `/notes/${result.id}?from=${encodeURIComponent(from)}`
        : `/roadmap/${result.id}`;
    navigate(destination);
  };

  const tagOptions = tag
    ? [{ tag, count: tags.find((item) => item.tag === tag)?.count || 0 }, ...tags.filter((item) => item.tag !== tag)]
    : tags;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cari di ruang"
      subtitle="Temukan topik, catatan, dan resource yang sudah kamu simpan."
      wide
    >
      <Input
        id="global-search-input"
        label="Pencarian"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari judul, isi, tag, atau topik…"
        autoFocus
      />

      {tagOptions.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow mb-2">Tag</div>
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.slice(0, 14).map((item) => {
              const active = item.tag === tag;
              return (
                <button
                  key={item.tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTag(active ? '' : item.tag)}
                   className={`min-h-[44px] rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.05em] transition ${
                    active
                      ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent'
                      : 'border-line bg-bg2 text-dim hover:border-linestrong hover:text-ink'
                  }`}
                >
                  #{item.tag} <span className="ml-1 text-dimmer">{item.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow">Hasil</div>
          {!loading && !error && <span className="font-mono text-[10px] text-dimmer">{results.length} hasil</span>}
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        )}
        {error && <p className="py-5 text-[13px] text-accent">{error}</p>}
        {!loading && !error && results.length === 0 && (
          <p className="py-8 text-center text-[13px] text-dim">
            {query || tag ? 'Tidak ada yang cocok dengan pencarian ini.' : 'Belum ada materi untuk dicari.'}
          </p>
        )}
        {!loading && !error && results.length > 0 && (
          <div className="mt-1 max-h-[52vh] overflow-y-auto pr-1">
            {results.map((result) => (
              <SearchResult key={result.key} result={result} onSelect={selectResult} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
