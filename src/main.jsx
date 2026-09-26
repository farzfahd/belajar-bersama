import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './app/App';
import { initAppCheck } from './lib/firebase';
import './index.css';

// App Check hanya berjalan di lingkungan asli (mode emulator dilewati di dalamnya).
initAppCheck().catch(() => {
  // Gagal inisialisasi App Check: biarkan app tetap berjalan, error akan
  // terlihat sebagai 403 dari ServerTimestamp bila sudah enforce.
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);