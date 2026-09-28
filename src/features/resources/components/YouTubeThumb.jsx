import { useEffect, useState } from 'react';
import { youtubeThumb } from '../utils/icons';
import ResourceTypeIcon from './ResourceTypeIcon';

// Thumbnail YouTube untuk resource bertipe youtube. Butuh internet: bila gagal
// dimuat (offline, diblokir, atau URL bukan video) jatuh ke ikon jenis — tidak
// pernah menampilkan gambar rusak.
export default function YouTubeThumb({ url, type = 'youtube', className = '' }) {
  const src = youtubeThumb(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-smc border border-line bg-bg2 text-[15px] ${className}`}
        aria-hidden="true"
      >
        <ResourceTypeIcon type={type} size={17} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-smc border border-line object-cover ${className}`}
    />
  );
}
