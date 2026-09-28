import { IconEmptyNote } from '../icons';

// F2: proporsional terhadap isi, bukan tinggi tetap. Ikon 32px (bukan
// dominan), padding vertikal modest, dashed border tipis.
export default function EmptyState({ icon = <IconEmptyNote size={32} />, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-smc border border-dashed border-line bg-transparent px-5 py-7 text-center">
      <span className="inline-flex text-dimmer" aria-hidden="true">{icon}</span>
      <h3 className="font-head text-[15px] leading-snug text-ink">{title}</h3>
      {description && <p className="max-w-md text-[12.5px] leading-relaxed text-dim">{description}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}