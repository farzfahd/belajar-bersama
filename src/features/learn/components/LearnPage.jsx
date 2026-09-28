import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../../app/layout/PageHeader';
import { IconLearn, IconLink, IconNotes } from '../../../shared/icons';
import NotesPanel from '../../notes/components/NotesPanel';
import ResourcesPanel from '../../resources/components/ResourcesPanel';

const TABS = [
  {
    key: 'notes',
    label: 'Notes',
    icon: IconNotes
  },
  {
    key: 'resources',
    label: 'Resources',
    icon: IconLink
  }
];

// Halaman Learn: tab Notes / Resources.
export default function LearnPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'notes';
  const tabRefs = useRef([]);

  const moveTab = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    setParams({ tab: TABS[next].key });
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="belajar bersama · materi"
        icon={<IconLearn size={26} />}
        title="Learn"
        description="Semua materi menempel pada sebuah topik di Roadmap. Kedua anggota bisa berbagi catatan (Markdown) dan sumber belajar di ruang ini."
      />

      <div role="tablist" aria-label="Jenis materi" className="flex border-b border-line">
        {TABS.map((t, index) => (
          <button
            key={t.key}
             id={`learn-tab-${t.key}`}
              ref={(node) => { tabRefs.current[index] = node; }}
              role="tab"
              aria-selected={t.key === tab}
              aria-controls="learn-tabpanel"
             tabIndex={t.key === tab ? 0 : -1}
             onClick={() => setParams({ tab: t.key })}
             onKeyDown={(event) => moveTab(event, index)}
            className={`-mb-px min-h-[44px] border-b-2 px-4 text-[13.5px] transition-colors ${
              t.key === tab
                ? 'border-b-accent font-semibold text-ink'
                : 'border-b-transparent text-dim hover:text-ink'
            }`}
          >
            <span className="inline-flex items-center gap-1.5"><t.icon size={15} /> {t.label}</span>
          </button>
        ))}
      </div>

       <div
         id="learn-tabpanel"
         role="tabpanel"
         aria-labelledby={`learn-tab-${tab}`}
         tabIndex={0}
       >
         {tab === 'notes' ? <NotesPanel /> : <ResourcesPanel />}
       </div>
    </div>
  );
}