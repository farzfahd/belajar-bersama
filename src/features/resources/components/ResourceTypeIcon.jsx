import {
  IconBlocks,
  IconBook,
  IconBooks,
  IconCap,
  IconChart,
  IconDoc,
  IconFilm,
  IconGlobe,
  IconImage,
  IconLink,
  IconPaperclip
} from '../../../shared/icons';
import { resourceTypeIconKey } from '../utils/icons';

// Pemetaan kunci ikon (lihat utils/icons.js) -> komponen SVG.
const ICON_BY_KEY = {
  globe: IconGlobe,
  film: IconFilm,
  book: IconBook,
  doc: IconDoc,
  cap: IconCap,
  books: IconBooks,
  chart: IconChart,
  blocks: IconBlocks,
  image: IconImage,
  paperclip: IconPaperclip,
  link: IconLink
};

// Ikon jenis resource. `type` adalah nilai enum dari constants.
export default function ResourceTypeIcon({ type, size = 15, className = '' }) {
  const Icon = ICON_BY_KEY[resourceTypeIconKey(type)] || IconLink;
  return <Icon size={size} className={className} />;
}
