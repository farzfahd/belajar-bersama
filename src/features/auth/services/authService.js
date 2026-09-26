import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile as updateAuthProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { ROOT, SCHEMA_VERSION } from '../../../lib/constants';
import { colorForUid, displayNameFromEmail } from '../../../shared/utils/identity';

export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const name = String(displayName || '').trim().slice(0, 60);
  if (name) await updateAuthProfile(cred.user, { displayName: name });
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function resendVerification(user) {
  await sendEmailVerification(user);
}

export async function signOutCurrent() {
  await signOut(auth);
}

// Idempoten: buat profil users/{uid} jika belum ada.
export async function ensureProfile(uid) {
  const ref = doc(db, ROOT.users, uid);
  const snap = await getDoc(ref);
  const me = auth.currentUser;
  const fallbackName = me?.displayName || displayNameFromEmail(me?.email || '');
  if (snap.exists()) {
    const current = snap.data();
    const patch = {};
    if (typeof current.displayName !== 'string' || !current.displayName.trim()) {
      patch.displayName = String(fallbackName || 'Pengguna').trim().slice(0, 60) || 'Pengguna';
    }
    if (typeof current.avatar !== 'string') patch.avatar = '';
    if (typeof current.color !== 'string' || !current.color) patch.color = colorForUid(uid);
    if (!('spaceId' in current)) patch.spaceId = null;
    if (current.schemaVersion !== SCHEMA_VERSION) patch.schemaVersion = SCHEMA_VERSION;
    if (Object.keys(patch).length > 0) {
      await setDoc(ref, patch, { merge: true });
      return { ...current, ...patch };
    }
    return current;
  }
  const data = {
    displayName: String(fallbackName || 'Pengguna').trim().slice(0, 60) || 'Pengguna',
    avatar: '',
    color: colorForUid(uid),
    spaceId: null,
    schemaVersion: SCHEMA_VERSION
  };
  await setDoc(ref, data);
  return data;
}

export async function updateProfile(uid, patch) {
  const ref = doc(db, ROOT.users, uid);
  await setDoc(ref, patch, { merge: true });
}