import crypto from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

// ---------------------------------------------------------------------------
// Accounting -> Training portal access sync.
// Every booking change that affects access (status, paid amount, price,
// deactivation reason) is pushed to the training system's `accountingSync`
// endpoint, which blocks/unblocks the matching student (students carry the
// `sourceBookingId` they were exported from). A daily reconcile re-sends all
// bookings in case a push was lost. Requests are HMAC-signed with the
// ACCOUNTING_SYNC_KEY secret, which must hold the same value in both projects.
// ---------------------------------------------------------------------------

const ACCOUNTING_SYNC_KEY = defineSecret('ACCOUNTING_SYNC_KEY');

const TRAINING_SYNC_URL =
  process.env.TRAINING_SYNC_URL || 'https://us-central1-sg-tms-v2.cloudfunctions.net/accountingSync';

const RECONCILE_CHUNK = 200;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The access-relevant state of a booking. Same 50% rule as the export in
 * pages/Groups.tsx: paid / (paid + remaining). The status is checked first
 * because deactivateBooking zeroes `remaining`, which would read as 100%.
 */
export function bookingAccessState(bookingId, b) {
  if (!b) return { bookingId, status: 'DELETED', eligible: false, paidPercentage: null, reason: '' };
  const status = b.isDeleted === true ? 'DELETED' : String(b.status || 'ACTIVE').toUpperCase();
  const paid = Number(b.paymentSummary?.paidTotal) || 0;
  const remaining = Number(b.paymentSummary?.remaining) || 0;
  let total = paid + remaining;
  if (total <= 0) total = Number(b.pricing?.finalPriceSnapshot) || 0;
  // Nothing to pay (scholarship / free booking) counts as fully paid.
  const paidPercentage = total > 0 ? round1((paid / total) * 100) : 100;
  return {
    bookingId,
    status,
    eligible: status === 'ACTIVE' && paidPercentage >= 50,
    paidPercentage,
    reason: status === 'ACTIVE' ? '' : String(b.deactivatedReason || '').slice(0, 500),
  };
}

const sameState = (a, b) =>
  a.status === b.status && a.eligible === b.eligible && a.reason === b.reason;

async function postToTraining(payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', ACCOUNTING_SYNC_KEY.value())
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const res = await fetch(TRAINING_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sg-timestamp': timestamp,
      'x-sg-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`training sync HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

export const syncBookingToTraining = onDocumentWritten(
  { document: 'bookings/{bookingId}', secrets: [ACCOUNTING_SYNC_KEY], timeoutSeconds: 90 },
  async (event) => {
    const bookingId = event.params.bookingId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after && !before) return;
    // A brand-new booking has no training student yet; nothing to sync.
    if (!before) return;

    const prevState = bookingAccessState(bookingId, before);
    const nextState = bookingAccessState(bookingId, after);
    if (sameState(prevState, nextState)) return;

    try {
      const result = await postToTraining({ mode: 'event', bookings: [nextState] });
      console.log('training sync', bookingId, JSON.stringify({ state: nextState, result }));
    } catch (err) {
      // Never throw: the booking write already succeeded, and the daily
      // reconcile will pick this booking up again.
      console.error('training sync failed', bookingId, err?.message || err);
    }
  }
);

export const reconcileTrainingAccess = onSchedule(
  {
    schedule: '15 3 * * *',
    timeZone: 'Africa/Cairo',
    secrets: [ACCOUNTING_SYNC_KEY],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection('bookings')
      .select('status', 'isDeleted', 'paymentSummary', 'pricing.finalPriceSnapshot', 'deactivatedReason')
      .get();
    const states = snap.docs.map((d) => bookingAccessState(d.id, d.data()));
    const runId = `run_${new Date().toISOString().slice(0, 10)}`;

    let changed = 0;
    let failedChunks = 0;
    for (let i = 0; i < states.length; i += RECONCILE_CHUNK) {
      try {
        const result = await postToTraining({
          mode: 'reconcile',
          runId,
          bookings: states.slice(i, i + RECONCILE_CHUNK),
        });
        changed += result?.changed || 0;
      } catch (err) {
        failedChunks++;
        console.error('training reconcile chunk failed', i, err?.message || err);
      }
    }
    console.log('training reconcile done', JSON.stringify({ bookings: states.length, changed, failedChunks, runId }));
  }
);
