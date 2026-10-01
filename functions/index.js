import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();

const DEFAULT_PASSWORD = '123456';
const SUPER_ADMIN_EMAIL = 'saber.gd.fl@gmail.com';

/**
 * Admin-only: resets another user's password to DEFAULT_PASSWORD and flags
 * their profile with mustChangePassword so the app forces them to pick a new
 * one on their next login. Existing sessions are revoked.
 */
export const adminResetPassword = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const db = getFirestore();
  const callerEmail = (caller.token.email || '').toLowerCase();
  const isSuperAdmin = callerEmail === SUPER_ADMIN_EMAIL && caller.token.email_verified === true;
  const callerDoc = await db.doc(`users/${caller.uid}`).get();
  const callerProfile = callerDoc.data();
  if (!isSuperAdmin && (callerProfile?.role !== 'admin' || callerProfile?.isActive === false)) {
    throw new HttpsError('permission-denied', 'Only admins can reset passwords.');
  }

  const targetEmail = String(request.data?.email || '').trim().toLowerCase();
  if (!targetEmail) {
    throw new HttpsError('invalid-argument', 'Target email is required.');
  }
  if (targetEmail === callerEmail) {
    throw new HttpsError('failed-precondition', 'You cannot reset your own password from here.');
  }
  if (targetEmail === SUPER_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'The super admin password cannot be reset.');
  }

  let target;
  try {
    target = await getAuth().getUserByEmail(targetEmail);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'This user has not created an account yet.');
    }
    throw err;
  }

  await getAuth().updateUser(target.uid, { password: DEFAULT_PASSWORD });
  await getAuth().revokeRefreshTokens(target.uid);

  const now = new Date().toISOString();
  await db.doc(`users/${target.uid}`).set({
    mustChangePassword: true,
    passwordResetAt: FieldValue.serverTimestamp(),
    passwordResetBy: callerEmail,
  }, { merge: true });

  await db.collection('activity_logs').add({
    userId: callerEmail,
    userName: callerProfile?.displayName || callerEmail,
    userEmail: callerEmail,
    action: 'reset_password',
    timestamp: now,
    section: 'users',
    targetId: target.uid,
    targetName: targetEmail,
    details: `Password reset to default for ${targetEmail}`,
    isDeleted: false,
  });

  return { ok: true };
});
