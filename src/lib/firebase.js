import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator
} from 'firebase/firestore';

const env = import.meta.env;
const hasRealConfig = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
  .every((key) => {
    const value = env[key];
    return Boolean(value) && !String(value).startsWith('ISI');
  });
export const USE_EMULATORS = env.VITE_USE_EMULATORS === 'true';

const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-learning-berdua';

// Semua nilai VITE_* selalu publik (ikut terbundle). Jangan taruh secret di frontend.
// Tanpa config asli kita tetap bisa dev: emulator Auth/Firestore menerima apiKey dummy.
const firebaseConfig = hasRealConfig
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      appId: env.VITE_FIREBASE_APP_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || ''
    }
  : {
      apiKey: 'emulator-only-key',
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
      appId: 'emulator-only-app',
      messagingSenderId: '',
      storageBucket: ''
    };

export const firebaseReady = hasRealConfig || USE_EMULATORS;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  // Produksi: cache lokal = dukungan offline; tabManager agar sinkron antar tab.
  // Mode emulator: pakai memory-cache — cache persisten + resume-token memicu
  // "INTERNAL ASSERTION FAILED: Unexpected state" (bug SDK 10.14.1) saat
  // listener koleksi bongkar-pasang di emulator.
  localCache: USE_EMULATORS
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// App Check: hanya di lingkungan asli, bukan emulator, dan saat site key ada.
// Menggunakan provider reCAPTCHA Enterprise terbaru. Dipanggil dari main.jsx.
export async function initAppCheck() {
  if (USE_EMULATORS || !hasRealConfig || !env.VITE_RECAPTCHA_SITE_KEY) return null;
  if (env.VITE_APPCHECK_DEBUG_TOKEN === 'true') {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  } else if (env.VITE_APPCHECK_DEBUG_TOKEN) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

export { hasRealConfig };
