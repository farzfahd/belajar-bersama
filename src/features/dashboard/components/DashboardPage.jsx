import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../../shared/components/Avatar';
import Badge from '../../../shared/ui/Badge';
import EmptyState from '../../../shared/ui/EmptyState';
import { useAuthState } from '../../auth/hooks/useAuthState';
import { useSpace } from '../../space/hooks/useSpace';
import { useUserProfile } from '../../space/hooks/useUserProfile';
import { spaceRoles } from '../../space/services/spaceService';
import { useSpaceId } from '../../space/SpaceContext';
import { useNotes } from '../../notes/hooks/useNotes';
import { useNoteStates } from '../../notes/hooks/useNoteStates';
import { visibleActiveNotes } from '../../notes/utils/visibility';
import { useResources } from '../../resources/hooks/useResources';
import { useResourceStates } from '../../resources/hooks/useResourceStates';
import { visibleActiveResources } from '../../resources/utils/visibility';
import { useTopics } from '../../topics/hooks/useTopics';
import { topicPath } from '../../topics/utils/tree';
import { timeAgo } from '../../../shared/utils/time';
import { statusLabel, statusTone } from '../../../shared/utils/status';
import DashboardProgressPreview from './DashboardProgressPreview';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function NumberStat({ value, label }) {
  return (
    <div className="min-w-[96px]">
      <div className="font-head text-[28px] leading-none text-ink">{value}</div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
        {label}
      </div>
    </div>
  );
}

// Baris daftar: rute internal pakai <Link> (client-side), URL luar pakai <a>
// dengan rel=noopener. Target klik menyatu agar gaya tetap sama.
function RowLink({ to, title, meta, badge }) {
  const external = !String(to || '').startsWith('/');
  const className =
    'flex min-h-[44px] items-center justify-between gap-3 border-b border-line py-2.5 transition hover:bg-bg2';
  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-ink">{title}</span>
        {meta && (
          <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[.05em] text-dimmer">
            {meta}
          </span>
        )}
      </span>
      {badge}
    </>
  );
  if (external) {
    return (
      <li>
        <a href={to} target="_blank" rel="noopener noreferrer" className={className}>
          {body}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link to={to} className={className}>
        {body}
      </Link>
    </li>
  );
}

function timeValue(ts) {
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

// Halaman awal "buku catatan": sapaan serif + batang progres + 3 seksi ringkas.
// Data dihitung dari listener live yang sudah ada (notes, resources, states),
// jadi privasi tetap mengikuti Firestore Rules.
export default function DashboardPage() {
  const { user } = useAuthState();
  const spaceId = useSpaceId();
  const { data: space } = useSpace(spaceId);
  const roles = spaceRoles(space, user?.uid);
  const partner = useUserProfile(roles?.partner);
  const me = useUserProfile(user?.uid);
  const uid = user?.uid;

  const { data: notes } = useNotes(spaceId);
  const { data: noteStates } = useNoteStates(spaceId);
  const { data: resources } = useResources(spaceId);
  const { data: resourceStates } = useResourceStates(spaceId);
  const { data: topics } = useTopics(spaceId);

  const fillPct = (roles?.filled ? 2 : 1) * 50;

  const myNotes = useMemo(
    () =>
      visibleActiveNotes(notes, uid)
        .filter((n) => n.ownerId === uid)
        .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt)),
    [notes, uid]
  );

  const partnerNotes = useMemo(
    () =>
      visibleActiveNotes(notes, uid)
        .filter((n) => n.ownerId !== uid)
        .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt)),
    [notes, uid]
  );

  // Resource yang sedang dibaca status terakhir milik user ini.
  const myReading = useMemo(() => {
    const stateByResource = new Map();
    for (const state of resourceStates || []) {
      if (state.uid !== uid) continue;
      stateByResource.set(state.resourceId, state);
    }
    return visibleActiveResources(resources, uid)
      .map((resource) => ({ resource, state: stateByResource.get(resource.id) }))
      .filter((item) => item.state?.status === 'reading')
      .sort((a, b) => timeValue(b.state.updatedAt) - timeValue(a.state.updatedAt));
  }, [resources, resourceStates, uid]);

  const myBookmarks = useMemo(
    () => (noteStates || []).filter((s) => s.uid === uid && s.bookmarked).length,
    [noteStates, uid]
  );

  const together = useMemo(() => {
    const activeNotes = visibleActiveNotes(notes, uid);
    const sharedNotes = activeNotes.filter((n) => n.visibility === 'shared');
    const doneTopics = topics.filter((t) => t.status === 'completed').length;
    return {
      topics: topics.length,
      doneTopics,
      notes: activeNotes.length,
      sharedNotes: sharedNotes.length
    };
  }, [notes, topics, uid]);

  return (
    <div className="space-y-8">
      {/* Hero: entri jurnal */}
      <section className="card flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">learning berdua · ruang {space?.name || '…'}</div>
            <h1 className="mt-1 font-head text-[26px] leading-tight text-ink">
              {greeting()}, {me.data?.displayName || 'kamu'} 👋
            </h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-dim">
              Ringkasan belajar berdua: catatan dan bacaanmu, aktivitas partner, dan progres
              bersama.
            </p>
          </div>
          <NumberStat value={roles?.filled ? '2/2' : '1/2'} label="anggota" />
        </div>

        <div className="h-[6px] w-full overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${fillPct}%`,
              backgroundColor: roles?.filled ? 'var(--ok)' : 'var(--accent)'
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[['me', me.data, 'Kamu'], ['partner', partner.data, 'Partner']].map(([who, p, label]) => {
            const memberUid = who === 'me' ? uid : roles?.partner;
            return (
              <span
                key={who}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-bg2 py-1 pl-1 pr-3"
              >
                <Avatar name={p?.displayName || label} color={p?.color} size={26} />
                <span className="text-[12.5px] font-medium text-ink">
                  {p?.displayName || (memberUid ? 'Memuat…' : '—')}
                </span>
                <Badge tone={who === 'me' ? 'accent' : 'dim'}>{label}</Badge>
              </span>
            );
          })}
        </div>
      </section>

      {/* Personal */}
      <section>
        <h2 className="section-title">Personal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card">
            <div className="eyebrow mb-2">Catatan terbaru milikmu</div>
            {myNotes.length === 0 ? (
              <EmptyState
                icon="📝"
                title="Belum ada catatan"
                description="Catatan Markdown yang kamu tulis akan muncul di sini."
              />
            ) : (
              <ul>
                {myNotes.slice(0, 4).map((note) => (
                  <RowLink
                    key={note.id}
                    to={`/notes/${note.id}`}
                    title={note.title}
                    meta={`${topicPath(note.topicId, topics) || 'Tanpa topik'} · ${timeAgo(note.updatedAt)}`}
                    badge={
                      <Badge tone={statusTone(note.status)}>{statusLabel(note.status)}</Badge>
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="eyebrow mb-2">Resource yang sedang kamu baca</div>
            {myReading.length === 0 ? (
              <EmptyState
                icon="▶️"
                title="Tidak ada bacaan aktif"
                description="Resource yang kamu tandai “Sedang dibaca” akan tampil di sini."
              />
            ) : (
              <ul>
                {myReading.slice(0, 4).map(({ resource, state }) => (
                  <RowLink
                    key={resource.id}
                    to={resource.url}
                    title={resource.title || resource.url}
                    meta={`${topicPath(resource.topicId, topics) || 'Tanpa topik'} · ${timeAgo(state.updatedAt)}`}
                    badge={<Badge tone="warn">dibaca</Badge>}
                  />
                ))}
              </ul>
            )}
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[.06em] text-dimmer">
              {myBookmarks} catatan ditandai buku · {myNotes.length} catatan milikmu
            </p>
          </div>
        </div>
      </section>

      {/* Partner */}
      <section>
        <h2 className="section-title">Partner</h2>
        <div className="card">
          {partnerNotes.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="Belum ada catatan shared dari partner"
              description="Catatan yang partner bagikan ke ruang ini akan tampil di sini."
            />
          ) : (
            <ul>
              {partnerNotes.slice(0, 5).map((note) => (
                <RowLink
                  key={note.id}
                  to={`/notes/${note.id}`}
                  title={note.title}
                  meta={`${partner.data?.displayName || 'Partner'} · ${topicPath(note.topicId, topics) || 'Tanpa topik'} · ${timeAgo(note.updatedAt)}`}
                  badge={<Badge tone="accent">shared</Badge>}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Together */}
      <section>
        <h2 className="section-title">Together</h2>
        <div className="card">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <NumberStat
              value={`${together.doneTopics}/${together.topics}`}
              label="topik selesai"
            />
            <NumberStat value={together.notes} label="total catatan" />
            <NumberStat value={together.sharedNotes} label="catatan shared" />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-dim">
            {together.notes === 0
              ? 'Belum ada materi. Mulai dari Roadmap: buat topik pertama, lalu tulis catatan.'
              : `Kalian sudah menulis ${together.notes} catatan di ruang ini, ${together.sharedNotes} di antaranya dibagikan ke dua orang.`}
          </p>
        </div>
        <div className="mt-6">
          <DashboardProgressPreview />
        </div>
      </section>
    </div>
  );
}
