// Pembersihan artefak uji emulator — WAJIB TERFILTER (bukan hapus massal).
//
// Dua insiden yang menjadi alasan modul ini ada:
//   1. Seluruh koleksi `spaces` terhapus saat "bersih-bersih artefak uji",
//      termasuk ruang asli pengguna.
//   2. Seluruh akun Auth emulator terhapus karena memakai endpoint
//      hapus-semua (`DELETE .../accounts` tanpa uid).
//
// Aturan pagar di modul ini:
//   - Hanya akun beremail uji yang boleh dihapus, dan hanya bila email-nya
//     cocok `lbtest-<peran>-<run>@example.test` (TEST_EMAIL_RE).
//   - Hanya ruang yang boleh dihapus bila SEMUA memberIds-nya akun uji.
//   - Tidak pernah memanggil endpoint hapus-semua; akun dihapus satu per satu.
//   - Default dry-run; harus ada flag --apply untuk benar-benar menghapus.
//   - Semua target diperiksa ulang sebelum dihapus; kalau ada satu saja yang
//     tidak lolos, operasi BATAL (tidak ada penghapusan sebagian).
//
// Pakai:  node tests/helpers/cleanup-test-data.mjs            (dry-run)
//         node tests/helpers/cleanup-test-data.mjs --apply    (hapus)

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const TEST_EMAIL_RE = /^lbtest-[a-z0-9-]+@example\.test$/;
export const DEFAULT_PROJECT = 'demo-learning-berdua';
export function isTestEmail(email) {
  return TEST_EMAIL_RE.test(String(email || '').trim().toLowerCase());
}

// Email uji yang dijamin cocok pola (konvensi penamaan satu sumber).
export function testEmail(role, run = Date.now()) {
  const email = `lbtest-${String(role).toLowerCase()}-${run}@example.test`;
  if (!isTestEmail(email)) throw new Error(`Email uji tidak sesuai pola: ${email}`);
  return email;
}

function emulatorHosts() {
  const firestore = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const auth = (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099').split(':');
  return {
    firestore: `http://${firestore[0]}:${firestore[1]}`,
    auth: `http://${auth[0]}:${auth[1]}`
  };
}

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${url} -> ${res.status} ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// Hanya list/read; tidak ada endpoint hapus-semua di modul ini.
// CATATAN: `GET /emulator/v1/projects/{p}/accounts` mengembalikan 405 di
// emulator terpasang; daftar akun harus lewat Identity Toolkit
// `accounts:query` (POST) — pola yang sama dipakai VerifyScreen.
export async function listAuthAccounts(project = DEFAULT_PROJECT) {
  const { auth } = emulatorHosts();
  const data = await jsonRequest(
    `${auth}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:query`,
    { method: 'POST', body: JSON.stringify({ returnUserInfo: true }) }
  );
  const list = data?.userInfo || data?.users || [];
  return list.map((u) => ({ uid: u.localId, email: String(u.email || '') }));
}

// Hapus satu akun (bukan hapus-semua). Endpoint emulator yang tersedia di
// versi terpasang: Identity Toolkit `accounts:delete` (butuh localId + email).
// `DELETE /emulator/v1/.../accounts/{uid}` membalas 404 di versi ini.
export async function deleteAuthAccount(uid, email, project = DEFAULT_PROJECT) {
  const { auth } = emulatorHosts();
  await jsonRequest(`${auth}/identitytoolkit.googleapis.com/v1/accounts:delete?key=${project}`, {
    method: 'POST',
    body: JSON.stringify({ localId: uid, email })
  });
}

const docBase = (project) =>
  `${emulatorHosts().firestore}/v1/projects/${project}/databases/(default)/documents`;

function decodeFields(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    if ('stringValue' in value) out[key] = value.stringValue;
    else if ('booleanValue' in value) out[key] = value.booleanValue;
    else if ('integerValue' in value) out[key] = Number(value.integerValue);
    else if ('arrayValue' in value) out[key] = (value.arrayValue.values || []).map((v) => v.stringValue ?? null);
  }
  return out;
}

async function listDocs(project, collectionPath) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${docBase(project)}/${collectionPath}?pageSize=300&mask.fieldPaths=name${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await jsonRequest(url);
    docs.push(...(data?.documents || []));
    pageToken = data?.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function deleteDoc(project, name) {
  await jsonRequest(`${docBase(project)}/${name}`, { method: 'DELETE' });
}

const SPACE_SUBCOLLECTIONS = ['topics', 'notes', 'noteStates', 'resources', 'resourceStates'];

// Kumpulkan target yang AMAN dihapus. Kalau ada target yang tidak lolos
// predicate, fungsi ini melempar error (fail-closed) sebelum deletes apa pun.
export async function collectTestTargets(project = DEFAULT_PROJECT) {
  const accounts = await listAuthAccounts(project);
  const testAccounts = accounts.filter((a) => isTestEmail(a.email));
  const testUids = new Set(testAccounts.map((a) => a.uid));

  const spaceDocs = await listDocs(project, 'spaces');
  const spaces = [];
  const skippedSpaces = [];
  for (const doc of spaceDocs) {
    const name = doc.name.split('/documents/')[1];
    const id = name.split('/')[1];
    const data = decodeFields(doc);
    const members = Array.isArray(data.memberIds) ? data.memberIds : [];
    const allTest = members.length > 0 && members.every((uid) => testUids.has(uid));
    if (allTest) spaces.push({ id, name, members });
    else skippedSpaces.push({ id, name, members });
  }

  const inviteDocs = await listDocs(project, 'invites');
  const testSpaceIds = new Set(spaces.map((s) => s.id));
  const invites = inviteDocs
    .map((doc) => {
      const name = doc.name.split('/documents/')[1];
      return { name, ...decodeFields(doc) };
    })
    .filter((inv) => testSpaceIds.has(inv.spaceId));

  return { project, accounts, testAccounts, testUids, spaces, skippedSpaces, invites };
}

export async function cleanupTestData({ project = DEFAULT_PROJECT, apply = false, log = console.log } = {}) {
  const targets = await collectTestTargets(project);
  const { testAccounts, spaces, invites } = targets;

  log(`[cleanup] akun uji   : ${testAccounts.length} (${testAccounts.map((a) => a.email).join(', ') || '-'})`);
  log(`[cleanup] ruang uji  : ${spaces.length} (${spaces.map((s) => s.id).join(', ') || '-'})`);
  log(`[cleanup] undangan   : ${invites.length}`);
  log(
    `[cleanup] DILEWATI (bukan akun uji): ${targets.accounts.length - testAccounts.length} akun, ` +
      `${targets.skippedSpaces.length} ruang`
  );

  // Fail-closed: jangan pernah ada akun/ruang yang bisa ikut terhapus.
  const unsafeAccounts = targets.accounts.filter((a) => !isTestEmail(a.email) && targets.testUids.has(a.uid));
  if (unsafeAccounts.length) throw new Error('Ada uid yang tidak dikenal penamaannya — operasi dibatalkan.');
  if (!apply) {
    log('[cleanup] mode dry-run. Tambahkan --apply untuk benar-benar menghapus.');
    return { applied: false, ...targets };
  }

  for (const account of testAccounts) {
    await deleteAuthAccount(account.uid, account.email, project);
    log(`[cleanup] hapus akun  : ${account.email}`);
  }

  for (const space of spaces) {
    for (const sub of SPACE_SUBCOLLECTIONS) {
      const docs = await listDocs(project, `spaces/${space.id}/${sub}`);
      for (const doc of docs) {
        const name = doc.name.split('/documents/')[1];
        await deleteDoc(project, name);
      }
      if (docs.length) log(`[cleanup] hapus ${sub}: ${docs.length} dokumen di ruang ${space.id}`);
    }
    await deleteDoc(project, `spaces/${space.id}`);
    log(`[cleanup] hapus ruang : ${space.id}`);
  }

  for (const invite of invites) {
    await deleteDoc(project, invite.name);
  }

  // Profil users/{uid} milik akun uji (rules tidak mengizinkan hapus dari client).
  for (const account of testAccounts) {
    try {
      await deleteDoc(project, `users/${account.uid}`);
    } catch {
      /* profil mungkin sudah tidak ada */
    }
  }

  log('[cleanup] selesai.');
  return { applied: true, ...targets };
}

const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const apply = process.argv.includes('--apply');
  const projectArg = process.argv.find((a) => a.startsWith('--project='));
  const project = projectArg ? projectArg.split('=')[1] : DEFAULT_PROJECT;
  cleanupTestData({ project, apply }).catch((err) => {
    console.error('[cleanup] GAGAL:', err.message);
    process.exit(1);
  });
}
