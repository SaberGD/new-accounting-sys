import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

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

// ---------------------------------------------------------------------------
// AI summary of the Dashboard performance analysis.
// The Groq key lives in Firebase Secrets (never in the frontend bundle); the
// deploy workflow copies it there from the GROQ_API_KEY GitHub secret.
// Providers are OpenAI-compatible and tried in order, so a fallback can be
// added to AI_PROVIDERS later without touching the rest.
// ---------------------------------------------------------------------------

const GROQ_API_KEY = defineSecret('GROQ_API_KEY');

const AI_DAILY_LIMIT_PER_USER = 30;

const AI_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    secret: GROQ_API_KEY,
  },
];

const AI_SYSTEM_PROMPT = `أنت محلل أعمال لأكاديمية "صابر جروب" للكورسات التدريبية في مصر.
هتستلم أرقام تقرير أداء الحجوزات لفترة معينة بصيغة JSON.
اكتب ملخص قصير بالعربي (لهجة مهنية واضحة) فيه:
1. أهم 3 ملاحظات عن الأداء.
2. أي مؤشر مقلق (نسبة استرداد أو إلغاء عالية، متبقي تحصيل كبير).
3. مقارنة سريعة بين موظفي المبيعات لو موجودين.
4. توصيتين عمليتين.
استخدم الأرقام كما هي بالظبط ولا تعيد حسابها ولا تخترع أرقام غير موجودة.
لو مفيش أرقام مالية في البيانات متتكلمش عن الفلوس.
الرد بصيغة Markdown بسيطة (عناوين ونقاط)، ومتزودش عن 250 كلمة.`;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : undefined);

// Whitelist the analysis fields so the function can't be used as a generic LLM proxy.
function sanitizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {
    periodLabel: str(raw.periodLabel),
    startDate: str(raw.startDate, 10),
    endDate: str(raw.endDate, 10),
    totalBookings: num(raw.totalBookings),
    activeBookings: num(raw.activeBookings),
    refundedBookings: num(raw.refundedBookings),
    deactivatedNoRefundBookings: num(raw.deactivatedNoRefundBookings),
    pendingBookings: num(raw.pendingBookings),
    completionRate: num(raw.completionRate),
    refundRate: num(raw.refundRate),
    deactivatedRate: num(raw.deactivatedRate),
    totalCollected: num(raw.totalCollected),
    totalRefunded: num(raw.totalRefunded),
    totalOutstanding: num(raw.totalOutstanding),
    netCollected: num(raw.netCollected),
    currency: 'EGP',
    salesBreakdown: Array.isArray(raw.salesBreakdown)
      ? raw.salesBreakdown.slice(0, 50).map((s) => ({
          salesName: str(s?.salesName, 60),
          total: num(s?.total),
          active: num(s?.active),
          refunded: num(s?.refunded),
          deactivated: num(s?.deactivated),
          collected: num(s?.collected),
        }))
      : [],
  };
  if (out.totalBookings === undefined) return null;
  return out;
}

async function callProvider(provider, analysis) {
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.secret.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(analysis) },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${provider.name} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider.name} returned an empty answer`);
  return text;
}

export const aiSummarizeAnalysis = onCall(
  { secrets: [GROQ_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const db = getFirestore();
    const callerEmail = (caller.token.email || '').toLowerCase();
    const isSuperAdmin = callerEmail === SUPER_ADMIN_EMAIL && caller.token.email_verified === true;
    if (!isSuperAdmin) {
      const profile = (await db.doc(`users/${caller.uid}`).get()).data();
      if (!profile || profile.isActive !== true) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
    }

    const analysis = sanitizeAnalysis(request.data?.analysis);
    if (!analysis) {
      throw new HttpsError('invalid-argument', 'Analysis data is required.');
    }

    // Per-user daily cap so one account can't burn the shared free quota.
    const today = new Date().toISOString().slice(0, 10);
    const usageRef = db.doc(`ai_usage/${caller.uid}_${today}`);
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = snap.exists ? snap.data().count || 0 : 0;
      if (count >= AI_DAILY_LIMIT_PER_USER) return false;
      tx.set(usageRef, { uid: caller.uid, email: callerEmail, date: today, count: count + 1 }, { merge: true });
      return true;
    });
    if (!allowed) {
      throw new HttpsError('resource-exhausted', `Daily AI limit reached (${AI_DAILY_LIMIT_PER_USER}).`);
    }

    const errors = [];
    for (const provider of AI_PROVIDERS) {
      try {
        const summary = await callProvider(provider, analysis);
        return { summary, provider: provider.name, model: provider.model };
      } catch (err) {
        console.error('AI provider failed', provider.name, err?.message || err);
        errors.push(provider.name);
      }
    }
    throw new HttpsError('unavailable', `All AI providers failed (${errors.join(', ')}).`);
  }
);
