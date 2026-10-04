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
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The access-relevant state of a booking. Same 50% rule as the export in
 * pages/Groups.tsx: paid / (paid + remaining). The status is checked first
 * because deactivateBooking zeroes `remaining`, which would read as 100%.
 */
export function bookingAccessState(bookingId, b) {
  if (!b) return { bookingId, status: 'DELETED', eligible: false, paidPercentage: null, reason: '', totalPrice: null, paidTotal: null };
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
    // Shown to training staff as sensitive data (price / paid so far, EGP).
    totalPrice: round2(Number(b.pricing?.finalPriceSnapshot) || total),
    paidTotal: round2(paid),
  };
}

/**
 * Every format a phone may be stored in on the training side
 * ("01xxxxxxxxx", "+201xxxxxxxxx", "201xxxxxxxxx", or "+<intl>").
 */
export function phoneVariants(raw) {
  if (raw === null || raw === undefined) return [];
  let d = String(raw)
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  const eg = d.match(/^(?:20|0)?(1[0125]\d{8})$/);
  if (eg) return ['0' + eg[1], '+20' + eg[1], '20' + eg[1]];
  return d.length >= 8 ? ['+' + d, d] : [];
}

function customerPhones(c) {
  if (!c) return [];
  const raw = [c.phone, c.whatsapp, c.fullWhatsapp, c.countryCode && c.whatsapp ? `${c.countryCode}${c.whatsapp}` : null];
  return [...new Set(raw.flatMap(phoneVariants))].slice(0, 12);
}

/**
 * Lets the training side link students imported without a sourceBookingId:
 * the customer's phone variants, the accounting group of the booking, and how
 * many live bookings that customer has (to tell apart several courses).
 */
function linkInfo(b, customer, customerBookingCount) {
  return {
    customerId: b?.customerId || null,
    groupId: b?.groupId || null,
    phones: customerPhones(customer),
    customerBookingCount,
  };
}

const isLiveBooking = (b) => b && b.isDeleted !== true && String(b.status || 'ACTIVE').toUpperCase() !== 'DELETED';

const sameState = (a, b) =>
  a.status === b.status && a.eligible === b.eligible && a.reason === b.reason &&
  a.totalPrice === b.totalPrice && a.paidTotal === b.paidTotal;

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
      if (after?.customerId) {
        try {
          const db = getFirestore();
          const [customerSnap, customerBookings] = await Promise.all([
            db.doc(`customers/${after.customerId}`).get(),
            db.collection('bookings').where('customerId', '==', after.customerId).select('status', 'isDeleted').get(),
          ]);
          Object.assign(nextState, linkInfo(
            after,
            customerSnap.exists ? customerSnap.data() : null,
            customerBookings.docs.filter((d) => isLiveBooking(d.data())).length,
          ));
        } catch (err) {
          console.error('training sync: could not load link info', bookingId, err?.message || err);
        }
      }
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
      .select('status', 'isDeleted', 'paymentSummary', 'pricing.finalPriceSnapshot', 'deactivatedReason', 'customerId', 'groupId')
      .get();
    const customersSnap = await db.collection('customers').select('phone', 'whatsapp', 'fullWhatsapp', 'countryCode').get();
    const customers = new Map(customersSnap.docs.map((d) => [d.id, d.data()]));
    const liveCount = new Map();
    snap.docs.forEach((d) => {
      const b = d.data();
      if (b.customerId && isLiveBooking(b)) liveCount.set(b.customerId, (liveCount.get(b.customerId) || 0) + 1);
    });
    const states = snap.docs.map((d) => {
      const b = d.data();
      return {
        ...bookingAccessState(d.id, b),
        ...linkInfo(b, customers.get(b.customerId), liveCount.get(b.customerId) || 0),
      };
    });
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
