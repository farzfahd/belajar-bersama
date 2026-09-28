// Resolusi provider App Check — modul murni (tanpa import Firebase) supaya
// bisa diuji langsung oleh tests/deploy-config-check.mjs. Mem-import
// src/lib/firebase.js dari test tidak mungkin: file itu memakai import.meta.env
// yang hanya ada di dalam bundler Vite.
//
// Project ini memakai reCAPTCHA ENTERPRISE (Google Cloud Fraud Defense).
// reCAPTCHA v3 TIDAK dipakai: key Enterprise tidak valid untuk v3, jadi salah
// provider berarti token tidak pernah tervalidasi.
//
// Fallback ke 'enterprise' BUKAN ke 'v3' dengan sengaja. Dulu fallback-nya
// 'v3', sehingga build produksi yang env-nya kosong/salah ketik diam-diam
// memakai provider yang salah (regresi 2026-09-27).

export const RECAPTCHA_ENTERPRISE = 'enterprise';
export const RECAPTCHA_V3 = 'v3';

export const DEFAULT_RECAPTCHA_PROVIDER = RECAPTCHA_ENTERPRISE;

// Nilai yang dikenali. Selain dua ini, diperlakukan sebagai tidak dikenal →
// jatuh ke default (enterprise), bukan diam-diam jadi v3.
const KNOWN = new Set([RECAPTCHA_ENTERPRISE, RECAPTCHA_V3]);

/**
 * Ubah nilai env mentah menjadi nama provider yang sah.
 * @param {string|undefined|null} raw nilai VITE_RECAPTCHA_PROVIDER
 * @returns {'enterprise'|'v3'} selalu salah satu dari dua nilai sah
 */
export function resolveRecaptchaProvider(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return DEFAULT_RECAPTCHA_PROVIDER;
  return KNOWN.has(value) ? value : DEFAULT_RECAPTCHA_PROVIDER;
}