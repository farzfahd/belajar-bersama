// Ikon jenis resource (font emoji, tanpa aset eksternal).
export function resourceTypeIcon(type) {
  return (
    {
      website: '🌐',
      youtube: '▶️',
      book: '📖',
      pdf: '📄',
      paper: '📑',
      course: '🎓',
      documentation: '📚',
      dataset: '📊',
      repository: '🧱',
      video: '🎬',
      image: '🖼️',
      file: '📎'
    }[type] || '🔗'
  );
}

// ID video YouTube dari berbagai bentuk URL (youtu.be, watch, embed, shorts,
// live, beserta parameter). Mengembalikan null bila bukan YouTube.
export function youtubeId(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') return segments[0] || null;
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null;
  }
  if (segments[0] === 'watch') return parsed.searchParams.get('v') || null;
  if (['embed', 'shorts', 'live', 'v'].includes(segments[0]) && segments[1]) {
    return segments[1];
  }
  return null;
}

// URL thumbnail YouTube. Null bila URL bukan YouTube. Butuh internet; saat
// offline atau gagal dimuat, pemanggil memakai ikon jenis sebagai pengganti.
export function youtubeThumb(url) {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
}

// Deteksi jenis resource dari URL: YouTube → 'youtube'. Dipakai form agar user
// tidak harus memilih manual.
export function detectResourceType(url, fallback = 'website') {
  return youtubeId(url) ? 'youtube' : fallback;
}