
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  setDoc, 
  orderBy, 
  limit, 
  increment, 
  runTransaction,
  writeBatch,
  getCountFromServer,
  startAfter,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './errorHandling';
import { getCorrectISOString, getCorrectDate } from './timeService';
import { 
  Course, Group, Booking, Payment, Customer, Offer, 
  Diploma, InstallmentPlan, Refund, Installment, Repayment, BookingLog, ActivityLog, SalesStaff, PaymentMethod, PromoCode,
  BookingFormTemplate, BookingFormSubmission, BookingFormField
} from '../types';

export const addBookingLog = async (log: Omit<BookingLog, 'id'>) => {
  return await addDoc(collection(db, 'booking_logs'), cleanData({ ...log, isDeleted: false }));
};

export const logActivity = async (log: Omit<ActivityLog, 'id'>) => {
  return await addDoc(collection(db, 'activity_logs'), cleanData({ ...log, isDeleted: false }));
};

export const getBookingLogs = async (bookingId: string): Promise<BookingLog[]> => {
  const q = query(
    collection(db, 'booking_logs'), 
    where('bookingId', '==', bookingId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as BookingLog))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

export const genericGetDoc = async <T,>(collectionName: string, id: string): Promise<T | null> => {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  if (data.isDeleted) return null;
  return { id: snap.id, ...data } as T;
};

export const genericGetCount = async (collectionName: string, constraints: QueryConstraint[] = []) => {
  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getCountFromServer(q);
  return snap.data().count;
};

export const genericGetPaginated = async <T,>(
  collectionName: string, 
  limitCount: number, 
  lastDoc: any = null,
  constraints: QueryConstraint[] = []
): Promise<{ data: T[], lastDoc: any }> => {
  const qConstraints = [...constraints];
  
  // Use bookingDate for ordering if it's the bookings collection, otherwise createdAt
  const orderField = collectionName === 'bookings' ? 'bookingDate' : 'createdAt';
  qConstraints.push(orderBy(orderField, 'desc'));

  if (lastDoc) {
    qConstraints.push(startAfter(lastDoc));
  }
  
  qConstraints.push(limit(limitCount));
  
  try {
    const q = query(collection(db, collectionName), ...qConstraints);
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)) as T[];
    return { 
      data, 
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null 
    };
  } catch (error: any) {
    console.error(`Error fetching paginated ${collectionName}:`, error);
    throw error;
  }
};

export const getAggregatedStats = async (): Promise<any> => {
  const snap = await getDoc(doc(db, 'stats', 'dashboard'));
  if (!snap.exists()) {
    // Return empty defaults if not setup yet
    return {
      collected: 0,
      outstanding: 0,
      expected: 0,
      bookingsCount: 0,
      whatsappPending: 0,
      salesStats: []
    };
  }
  return snap.data();
};

const applyStatsDelta = (transaction: any, statsSnap: any, delta: Partial<{ 
  collected: number, 
  outstanding: number, 
  expected: number, 
  bookingsCount: number, 
  whatsappPending: number 
}>, salesDelta?: { salesId: string, collected: number, bookingsCount: number } | { salesId: string, collected: number, bookingsCount: number }[]) => {
  const statsRef = doc(db, 'stats', 'dashboard');
  
  let currentData = statsSnap.exists() ? statsSnap.data() : {
    collected: 0,
    outstanding: 0,
    expected: 0,
    bookingsCount: 0,
    whatsappPending: 0,
    salesStats: []
  };

  const newData = {
    collected: currentData.collected + (delta.collected || 0),
    outstanding: currentData.outstanding + (delta.outstanding || 0),
    expected: currentData.expected + (delta.expected || 0),
    bookingsCount: currentData.bookingsCount + (delta.bookingsCount || 0),
    whatsappPending: currentData.whatsappPending + (delta.whatsappPending || 0),
    salesStats: [...(currentData.salesStats || [])]
  };

  const deltas = Array.isArray(salesDelta) ? salesDelta : (salesDelta ? [salesDelta] : []);
  
  deltas.forEach(d => {
    if (d && d.salesId) {
      const idx = newData.salesStats.findIndex((s: any) => s.id === d.salesId);
      if (idx !== -1) {
        newData.salesStats[idx].collected += (d.collected || 0);
        newData.salesStats[idx].bookingsCount += (d.bookingsCount || 0);
      }
    }
  });

  transaction.set(statsRef, newData, { merge: true });
};

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
}
const collectionCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache TTL for static / read-heavy collections

export const clearCollectionCache = (collectionName?: string) => {
  if (collectionName) {
    collectionCache.delete(collectionName);
  } else {
    collectionCache.clear();
  }
};

export const getActivityLogs = async (limitCount = 50): Promise<ActivityLog[]> => {
  try {
    const q = query(
      collection(db, 'activity_logs'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ActivityLog))
      .filter(item => !(item as any).isDeleted);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return [];
  }
};

export const genericGetQuery = async <T,>(
  collectionName: string, 
  constraints: QueryConstraint[] = []
): Promise<T[]> => {
  try {
    const q = query(collection(db, collectionName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(item => item.isDeleted !== true) as T[];
  } catch (error) {
    console.error(`Error querying ${collectionName}:`, error);
    return [];
  }
};

export const genericGet = async <T,>(collectionName: string, forceRefresh = false): Promise<T[]> => {
  const now = Date.now();
  if (!forceRefresh && collectionCache.has(collectionName)) {
    const cached = collectionCache.get(collectionName)!;
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T[];
    }
  }

  try {
    const q = query(collection(db, collectionName));
    const snapshot = await getDocs(q);
    const data = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(item => item.isDeleted !== true) as T[];

    collectionCache.set(collectionName, { data, timestamp: now });
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
    throw error;
  }
};

export const genericAdd = async (collectionName: string, data: any, performedBy?: { name: string, email: string }) => {
  try {
    const docRef = await addDoc(collection(db, collectionName), { ...data, isDeleted: false });
    clearCollectionCache(collectionName);
    if (performedBy) {
      await logActivity({
        userId: performedBy.email,
        userName: performedBy.name,
        userEmail: performedBy.email,
        action: `ADD_${collectionName.toUpperCase()}`,
        timestamp: new Date().toISOString(),
        section: collectionName,
        details: `Added new item to ${collectionName} with ID ${docRef.id}`
      });
    }
    return docRef;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionName);
    throw error;
  }
};

export const genericUpdate = async (collectionName: string, id: string, data: any, performedBy?: { name: string, email: string }) => {
  try {
    await updateDoc(doc(db, collectionName, id), data);
    clearCollectionCache(collectionName);
    if (performedBy) {
      await logActivity({
        userId: performedBy.email,
        userName: performedBy.name,
        userEmail: performedBy.email,
        action: `UPDATE_${collectionName.toUpperCase()}`,
        timestamp: new Date().toISOString(),
        section: collectionName,
        details: `Updated item in ${collectionName} with ID ${id}`
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
    throw error;
  }
};

export const upsertDoc = async (collectionName: string, id: string, data: any, performedBy?: { name: string, email: string }) => {
  try {
    await setDoc(doc(db, collectionName, id), data, { merge: true });
    clearCollectionCache(collectionName);
    if (performedBy) {
      await logActivity({
        userId: performedBy.email,
        userName: performedBy.name,
        userEmail: performedBy.email,
        action: `UPSERT_${collectionName.toUpperCase()}`,
        timestamp: new Date().toISOString(),
        section: collectionName,
        details: `Upserted item in ${collectionName} with ID ${id}`
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
    throw error;
  }
};

export const genericDelete = async (collectionName: string, id: string, performedBy?: { name: string, email: string }) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
    clearCollectionCache(collectionName);
    if (performedBy) {
      await logActivity({
        userId: performedBy.email,
        userName: performedBy.name,
        userEmail: performedBy.email,
        action: `DELETE_${collectionName.toUpperCase()}`,
        timestamp: new Date().toISOString(),
        section: collectionName,
        details: `Deleted item from ${collectionName} with ID ${id}`
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
    throw error;
  }
};

export const updateWhatsAppStatus = async (bookingId: string, added: boolean) => {
  return await updateDoc(doc(db, 'bookings', bookingId), {
    'whatsappStatus.added': added
  });
};

export const findCustomerByWhatsApp = async (whatsapp: string): Promise<Customer | null> => {
  const q = query(collection(db, 'customers'), where('whatsapp', '==', whatsapp), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data() as Customer;
  if (data.isDeleted) return null;
  return { id: snap.docs[0].id, ...data };
};

export const checkBookingDuplicate = async (whatsapp: string, groupId: string | null): Promise<boolean> => {
  if (!groupId) return false;
  const customer = await findCustomerByWhatsApp(whatsapp);
  if (!customer) return false;
  const q = query(
    collection(db, 'bookings'),
    where('customerId', '==', customer.id),
    where('groupId', '==', groupId),
    where('status', '==', 'ACTIVE'),
    where('isDeleted', '==', false)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

export const migrateCustomerCountryCodes = async () => {
  const snap = await getDocs(collection(db, 'customers'));
  let count = 0;
  const batchSize = 100;
  let batch = writeBatch(db);

  for (let i = 0; i < snap.docs.length; i++) {
    const d = snap.docs[i];
    const data = d.data();
    const needsCode = !data.countryCode || data.countryCode === 'undefined';
    const needsFull = !data.fullWhatsapp || data.fullWhatsapp.includes('undefined');

    if (needsCode || needsFull) {
      const code = (data.countryCode && data.countryCode !== 'undefined') ? data.countryCode : '+20';
      const whatsapp = data.whatsapp || '';
      const cleanWa = whatsapp.replace(/^0+/, '');
      const cleanCode = code.replace('+', '');
      const full = `${cleanCode}${cleanWa}`;

      batch.update(d.ref, {
        countryCode: code,
        fullWhatsapp: full
      });
      count++;
    }

    if (count % batchSize === 0 && count > 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (count > 0) await batch.commit();
  return count;
};

export const getGroupsByStatus = async (status: 'UPCOMING' | 'STARTED' | 'FINISHED'): Promise<Group[]> => {
  const q = query(collection(db, 'groups'), where('status', '==', status));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
};

export const getGroupActiveCount = async (groupId: string): Promise<number> => {
  const q = query(
    collection(db, 'bookings'), 
    where('groupId', '==', groupId), 
    where('status', '==', 'ACTIVE')
  );
  const snap = await getDocs(q);
  return snap.docs.filter(d => !d.data().isDeleted).length;
};

export const cleanData = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(v => cleanData(v));
  }
  if (data !== null && typeof data === 'object') {
    const fresh: any = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        fresh[key] = cleanData(data[key]);
      }
    });
    return fresh;
  }
  return data;
};

export const syncAggregatedStats = async () => {
  const [bookings, staff] = await Promise.all([
    genericGet<Booking>('bookings'),
    genericGet<SalesStaff>('sales_staff')
  ]);

  const validBookings = bookings.filter(b => !b.isDeleted && b.status !== 'DELETED');
  
  let collected = 0;
  let outstanding = 0;
  let expected = 0;
  let bookingsCount = 0;
  let whatsappPending = 0;
  
  const salesLeaderboard: Record<string, { id: string, name: string, collected: number, bookingsCount: number }> = {};
  staff.forEach(s => {
    salesLeaderboard[s.id] = { id: s.id, name: s.fullName, collected: 0, bookingsCount: 0 };
  });

  validBookings.forEach(b => {
    // Collected amount includes all paid totals even from DEACTIVATED or REFUNDED bookings
    collected += (b.paymentSummary.paidTotal || 0);

    if (b.status === 'ACTIVE') {
      outstanding += b.paymentSummary.remaining;
      expected += b.pricing.finalPriceSnapshot;
      bookingsCount++;
      
      if (b.whatsappStatus?.eligible && !b.whatsappStatus?.added && b.bookingType !== 'deferred') {
        whatsappPending++;
      }
    }

    if (b.salesId && salesLeaderboard[b.salesId]) {
      salesLeaderboard[b.salesId].collected += (b.paymentSummary.paidTotal || 0);
      salesLeaderboard[b.salesId].bookingsCount += 1;
    }
  });

  const stats = {
    collected,
    outstanding,
    expected,
    bookingsCount,
    whatsappPending,
    salesStats: Object.values(salesLeaderboard).sort((a,b) => b.collected - a.collected).slice(0, 5),
    lastSyncedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'stats', 'dashboard'), stats);
  return stats;
};

export const createBooking = async (
  bookingData: Omit<Booking, 'id'>, 
  customerData: Omit<Customer, 'id'>,
  installmentPlan: Omit<InstallmentPlan, 'bookingId'>,
  initialPayment?: Omit<Payment, 'id' | 'bookingId' | 'customerId'>,
  performedBy?: { name: string, email: string }
) => {
  const existingCustomer = await findCustomerByWhatsApp(customerData.whatsapp);
  return await runTransaction(db, async (transaction) => {
    // ALL READS FIRST
    const statsRef = doc(db, 'stats', 'dashboard');
    const statsSnap = await transaction.get(statsRef);
    
    if (bookingData.groupId) {
      const groupRef = doc(db, 'groups', bookingData.groupId);
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists()) throw new Error("Group not found");
      const group = groupSnap.data() as Group;
      const activeCount = await getGroupActiveCount(bookingData.groupId);
      if (activeCount >= group.capacity) throw new Error("Group capacity reached. Cannot create booking.");
    }
    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      transaction.update(doc(db, 'customers', customerId), cleanData({ ...customerData, isDeleted: false }) as any);
    } else {
      const customerRef = doc(collection(db, 'customers'));
      customerId = customerRef.id;
      transaction.set(customerRef, cleanData({ ...customerData, isDeleted: false }));
    }
    const bookingRef = doc(collection(db, 'bookings'));
    transaction.set(bookingRef, cleanData({ ...bookingData, customerId, status: 'ACTIVE', isDeleted: false, hasRefund: false, createdAt: (bookingData as any).createdAt || getCorrectISOString() }));
    if (bookingData.pricing?.appliedPromoCode?.code) {
      const codeId = bookingData.pricing.appliedPromoCode.code.toUpperCase().trim();
      const promoRef = doc(db, 'promo_codes', codeId);
      transaction.update(promoRef, { useCount: increment(1) });
    }
    const planRef = doc(db, 'installment_plans', bookingRef.id);
    transaction.set(planRef, cleanData({ ...installmentPlan, bookingId: bookingRef.id }));
    if (initialPayment) {
      const paymentRef = doc(collection(db, 'payments'));
      transaction.set(paymentRef, cleanData({ ...initialPayment, bookingId: bookingRef.id, customerId, isDeleted: false }));
    }

    // Log Creation
    const logRef = doc(collection(db, 'booking_logs'));
    const logData = {
      bookingId: bookingRef.id,
      timestamp: getCorrectISOString(),
      action: 'CREATED',
      description: `Booking created for ${customerData.name}. Initial Deposit: ${installmentPlan.deposit} EGP.`,
      performedBy: performedBy?.name || initialPayment?.createdByUid || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        pricing: bookingData.pricing,
        paymentSummary: bookingData.paymentSummary,
        installments: installmentPlan.installments,
        receiptLink: bookingData.receiptLink || null,
        snapshotAfter: {
          booking: { ...bookingData, id: bookingRef.id, customerId, status: 'ACTIVE' },
          customer: { ...customerData, id: customerId },
          installmentPlan: { ...installmentPlan, bookingId: bookingRef.id }
        }
      }
    };
    transaction.set(logRef, cleanData(logData));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    const customerName = customerData.name;
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || initialPayment?.createdByUid || 'System',
      userName: performedBy?.name || 'System',
      action: 'CREATE_BOOKING',
      timestamp: getCorrectISOString(),
      section: 'Bookings',
      targetId: bookingRef.id,
      targetName: customerName,
      clientId: customerId,
      clientName: customerName,
      details: `Created booking for ${customerName} in group ${bookingData.groupId || 'Deferred'}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const isWaPending = bookingData.whatsappStatus?.eligible && !bookingData.whatsappStatus?.added && bookingData.bookingType !== 'deferred';
    applyStatsDelta(transaction, statsSnap, {
      collected: installmentPlan.deposit,
      outstanding: bookingData.paymentSummary.remaining,
      expected: bookingData.pricing.finalPriceSnapshot,
      bookingsCount: 1,
      whatsappPending: isWaPending ? 1 : 0
    }, {
      salesId: bookingData.salesId,
      collected: installmentPlan.deposit,
      bookingsCount: 1
    });

    return bookingRef.id;
  });
};

export const assignGroupToBooking = async (
  bookingId: string, 
  groupId: string,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const groupRef = doc(db, 'groups', groupId);
    const statsRef = doc(db, 'stats', 'dashboard');

    // ALL READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const groupSnap = await transaction.get(groupRef);
    const planSnap = await transaction.get(planRef);

    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    if (booking.groupId === groupId) throw new Error("Student is already assigned to this group.");
    
    if (!groupSnap.exists()) throw new Error("Group not found");
    const group = groupSnap.data() as Group;
    if (group.productId !== booking.productId) throw new Error("Cannot assign to a group of a different product.");
    
    const activeCount = await getGroupActiveCount(groupId);
    if (activeCount >= group.capacity) throw new Error("Target group is at full capacity.");
    
    if (!planSnap.exists()) throw new Error("Installment plan not found.");
    const plan = planSnap.data() as InstallmentPlan;

    // LOGIC & WRITES
    const baseDateStr = group.startDate;
    const baseDate = new Date(baseDateStr);
    baseDate.setDate(baseDate.getDate() - 2); // Rule: 2 days before start
    const firstDateStr = baseDate.toISOString().split('T')[0];

    const type = plan.installmentType || 'monthly';
    const planType = plan.planType || 'none';

    const updatedInstallments = plan.installments.map((inst, idx) => {
      if (inst.status === 'paid' || inst.status === 'cancelled') return inst;
      
      const d = new Date(firstDateStr);
      
      // If it was a smart plan, try to maintain intervals
      if (planType === '10_days') {
        d.setDate(d.getDate() + (idx * 10));
      } else if (planType === '15_days') {
        d.setDate(d.getDate() + (idx * 15));
      } else if (planType === '60_days') {
        d.setDate(d.getDate() + (idx * 30));
      } else {
        // Fallback to legacy weekly/monthly if type was set
        if (type === 'weekly') d.setDate(d.getDate() + (idx * 7));
        else if (idx > 0) d.setMonth(d.getMonth() + idx);
      }
      
      return { ...inst, dueDate: d.toISOString().split('T')[0], originalDueDate: inst.originalDueDate || inst.dueDate };
    });

    transaction.update(bookingRef, cleanData({
      groupId: groupId, bookingType: 'assigned', assigned_at: new Date().toISOString(),
      'paymentSummary.next_due_date': updatedInstallments.find(i => i.status === 'pending' || i.status === 'delayed')?.dueDate || null
    }));
    transaction.update(planRef, cleanData({ installments: updatedInstallments }));

    // Log Assignment
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: bookingId,
      timestamp: new Date().toISOString(),
      action: 'ASSIGNED',
      description: `Booking assigned to group: ${group.scheduleLabel}. Installments rescheduled.`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        groupId,
        previousGroupId: booking.groupId || null,
        previousBookingType: booking.bookingType || null,
        previousInstallments: plan.installments || [],
        installments: updatedInstallments,
        snapshotBefore: {
          booking: { ...booking },
          installmentPlan: { ...plan }
        },
        snapshotAfter: {
          booking: { ...booking, groupId, bookingType: 'assigned' },
          installmentPlan: { ...plan, installments: updatedInstallments }
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'ASSIGN_GROUP',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      details: `Assigned booking for ${customerName} to group ${group.scheduleLabel}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    // If it was deferred, it might now enter the WA pending queue
    const isNowWaPending = booking.paymentSummary.remaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added;
    if (isNowWaPending) {
       applyStatsDelta(transaction, statsSnap, {
         whatsappPending: 1
       });
    }
  });
};

export const rescheduleRemainingInstallments = async (
  bookingId: string, 
  newCount: number, 
  startDate: string, 
  reason: string, 
  customInstallments?: Installment[],
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    
    // READS FIRST
    const bSnap = await transaction.get(bookingRef);
    const pSnap = await transaction.get(planRef);
    if (!bSnap.exists() || !pSnap.exists()) throw new Error("Records not found.");
    
    const booking = bSnap.data() as Booking;
    const plan = pSnap.data() as InstallmentPlan;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    // LOGIC
    const historical = plan.installments.filter(i => i.status === 'paid' || i.status === 'cancelled');
    let finalInstallments: Installment[] = [];
    if (customInstallments) finalInstallments = [...historical, ...customInstallments];
    else {
      const remainingBalance = booking.paymentSummary.remaining;
      if (remainingBalance <= 0) throw new Error("No remaining balance to reschedule.");
      const type = plan.installmentType || 'monthly';
      const amountPerInst = remainingBalance / newCount;
      const newInstallments: Installment[] = [];
      for (let i = 0; i < newCount; i++) {
        const d = new Date(startDate);
        if (type === 'weekly') d.setDate(d.getDate() + (i * 7));
        else d.setMonth(d.getMonth() + i);
        const inst: Installment = { 
          dueDate: d.toISOString().split('T')[0], 
          amount: Math.round(amountPerInst), 
          status: 'pending', 
          notifiedOnWhatsApp: false, 
          delayReason: reason
        };
        if (historical.length === 0 && i === 0) inst.label = 'قسط استكمال البداية';
        newInstallments.push(inst);
      }
      finalInstallments = [...historical, ...newInstallments];
    }

    // WRITES
    transaction.update(planRef, cleanData({ installments: finalInstallments, rescheduled_at: new Date().toISOString() }));
    const firstPending = finalInstallments.find(i => i.status === 'pending' || i.status === 'delayed');
    transaction.update(bookingRef, cleanData({ 'paymentSummary.next_due_date': firstPending?.dueDate || null, rescheduled_at: new Date().toISOString() }));

    // Log Reschedule
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: bookingId,
      timestamp: new Date().toISOString(),
      action: 'RESCHEDULED',
      description: `Installments rescheduled. Reason: ${reason}`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        installments: finalInstallments,
        previousInstallments: plan.installments || [],
        reason,
        snapshotBefore: {
          booking: { ...booking },
          installmentPlan: { ...plan }
        },
        snapshotAfter: {
          booking: { ...booking },
          installmentPlan: { ...plan, installments: finalInstallments }
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'RESCHEDULE_INSTALLMENTS',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Rescheduled installments for ${customerName}. Reason: ${reason}`,
      isDeleted: false
    }));
  });
};

export const updateBooking = async (
  bookingId: string, 
  bookingData: Partial<Booking>, 
  customerData: Partial<Customer>,
  performedBy?: { name: string, email: string },
  newDeposit?: number,
  paymentMethodForNewDeposit?: PaymentMethod,
  transactionRefForNewDeposit?: string
) => {
  // Query non-deleted payments outside/before the transaction
  const paymentsQuery = query(collection(db, 'payments'), where('bookingId', '==', bookingId), where('isDeleted', '==', false));
  const paymentsSnap = await getDocs(paymentsQuery);
  const paymentDocs = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));

  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    // ALL READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const currentBooking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', currentBooking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || customerData.name || 'Unknown';

    let currentPaid = currentBooking.paymentSummary.paidTotal || 0;
    let oldDeposit = 0;

    // Find the initial deposit payment document
    const initialDepositPay = paymentDocs.find(p => p.note === 'Initial Deposit' || p.note === 'الدفع المبدئي');
    if (initialDepositPay) {
      oldDeposit = initialDepositPay.amount || 0;
    } else {
      const sortedPayments = [...paymentDocs].sort((a,b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));
      if (sortedPayments.length > 0) {
        oldDeposit = sortedPayments[0].amount || 0;
      }
    }

    let updatedPaidTotal = currentPaid;
    let depositDiff = 0;

    if (newDeposit !== undefined) {
      depositDiff = newDeposit - oldDeposit;
      updatedPaidTotal = currentPaid + depositDiff;

      if (initialDepositPay) {
        if (newDeposit === 0) {
          transaction.update(doc(db, 'payments', initialDepositPay.id), { isDeleted: true, deletedAt: new Date().toISOString() });
        } else {
          transaction.update(doc(db, 'payments', initialDepositPay.id), { 
            amount: newDeposit,
            method: paymentMethodForNewDeposit || initialDepositPay.method,
            transactionRef: transactionRefForNewDeposit !== undefined ? transactionRefForNewDeposit : (initialDepositPay.transactionRef || '')
          });
        }
      } else if (newDeposit > 0) {
        const newPaymentRef = doc(collection(db, 'payments'));
        const newPaymentData = {
          bookingId,
          customerId: currentBooking.customerId,
          amount: newDeposit,
          method: paymentMethodForNewDeposit || 'cash_office',
          transactionRef: transactionRefForNewDeposit || '',
          paymentDate: bookingData.bookingDate || currentBooking.bookingDate || new Date().toISOString().split('T')[0],
          note: 'Initial Deposit',
          isDeleted: false,
          createdByUid: ''
        };
        transaction.set(newPaymentRef, newPaymentData);
      }
    }

    const finalPrice = bookingData.pricing?.finalPriceSnapshot !== undefined 
      ? bookingData.pricing.finalPriceSnapshot 
      : currentBooking.pricing.finalPriceSnapshot;

    const newRemaining = Math.max(0, finalPrice - updatedPaidTotal);
    bookingData.paymentSummary = { 
      ...currentBooking.paymentSummary, 
      paidTotal: updatedPaidTotal, 
      remaining: newRemaining 
    };

    if (!bookingData.whatsappStatus) bookingData.whatsappStatus = { ...currentBooking.whatsappStatus };
    bookingData.whatsappStatus.eligible = newRemaining <= (finalPrice * 0.5);

    // Sales Reassignment Tracking
    let salesChangeNote = "";
    if (bookingData.salesId && bookingData.salesId !== currentBooking.salesId) {
      bookingData.salesReassigned = true;
      bookingData.reassignedBy = performedBy?.name || 'System';
      bookingData.reassignedAt = new Date().toISOString();
      bookingData.previousSalesName = currentBooking.salesName;
      salesChangeNote = ` Sales reassigned from ${currentBooking.salesName} to ${bookingData.salesName} by ${performedBy?.name || 'System'}.`;
      if (!currentBooking.originalSalesId) {
        bookingData.originalSalesId = currentBooking.salesId;
        bookingData.originalSalesName = currentBooking.salesName;
      }
    }

    transaction.update(doc(db, 'customers', currentBooking.customerId), cleanData(customerData) as any);
    transaction.update(bookingRef, cleanData(bookingData) as any);

    const oldPromoCode = currentBooking.pricing?.appliedPromoCode?.code;
    const newPromoCode = bookingData.pricing?.appliedPromoCode?.code;
    if (oldPromoCode !== newPromoCode) {
      if (oldPromoCode) {
        const oldCodeId = oldPromoCode.toUpperCase().trim();
        const oldPromoRef = doc(db, 'promo_codes', oldCodeId);
        transaction.update(oldPromoRef, { useCount: increment(-1) });
      }
      if (newPromoCode) {
        const newCodeId = newPromoCode.toUpperCase().trim();
        const newPromoRef = doc(db, 'promo_codes', newCodeId);
        transaction.update(newPromoRef, { useCount: increment(1) });
      }
    }

    // Log Update
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: bookingId,
      timestamp: new Date().toISOString(),
      action: 'UPDATED',
      description: `Booking details updated.${salesChangeNote}${newDeposit !== undefined ? ` Deposit updated from ${oldDeposit} to ${newDeposit} EGP.` : ''}`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        bookingData,
        customerData,
        receiptLink: bookingData.receiptLink || null,
        depositChanged: newDeposit !== undefined,
        oldDeposit,
        newDeposit,
        previousBooking: { ...currentBooking },
        previousCustomer: { ...(customerSnap.data() as Customer) },
        snapshotBefore: {
          booking: { ...currentBooking },
          customer: { ...(customerSnap.data() as Customer) }
        },
        snapshotAfter: {
          booking: { ...currentBooking, ...bookingData },
          customer: { ...(customerSnap.data() as Customer), ...customerData }
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'UPDATE_BOOKING',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      details: `Updated booking for ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const delta: any = {};
    const priceDiff = bookingData.pricing?.finalPriceSnapshot !== undefined 
      ? bookingData.pricing.finalPriceSnapshot - currentBooking.pricing.finalPriceSnapshot 
      : 0;

    delta.expected = priceDiff;
    delta.collected = depositDiff;
    delta.outstanding = priceDiff - depositDiff;

    const wasWaPending = currentBooking.whatsappStatus?.eligible && !currentBooking.whatsappStatus?.added && currentBooking.bookingType !== 'deferred';
    const isNowWaPending = (bookingData.whatsappStatus?.eligible || (bookingData.paymentSummary?.remaining || currentBooking.paymentSummary.remaining) <= ((bookingData.pricing?.finalPriceSnapshot || currentBooking.pricing.finalPriceSnapshot) * 0.5)) && 
                           !(bookingData.whatsappStatus?.added || currentBooking.whatsappStatus?.added) && 
                           (bookingData.bookingType || currentBooking.bookingType) !== 'deferred';
    
    delta.whatsappPending = (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0);

    const salesDeltas: any[] = [];
    if (bookingData.salesId && bookingData.salesId !== currentBooking.salesId) {
      // Move collected and bookingsCount to new sales
      salesDeltas.push({
        salesId: bookingData.salesId,
        collected: updatedPaidTotal || 0,
        bookingsCount: 1
      });
      // Subtract from old sales
      salesDeltas.push({
        salesId: currentBooking.salesId,
        collected: -currentPaid || 0,
        bookingsCount: -1
      });
    } else {
      if (depositDiff !== 0) {
        salesDeltas.push({
          salesId: currentBooking.salesId,
          collected: depositDiff,
          bookingsCount: 0
        });
      }
    }

    applyStatsDelta(transaction, statsSnap, delta, salesDeltas);
  });
};

export const updateBookingInstallmentPlan = async (
  bookingId: string,
  installmentPlan: {
    deposit: number;
    installments: Installment[];
    planType: string;
    planLabel: string;
  }
) => {
  const planRef = doc(db, 'installment_plans', bookingId);
  const bookingRef = doc(db, 'bookings', bookingId);
  
  await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    const bookingSnap = await transaction.get(bookingRef);
    
    if (!planSnap.exists()) {
      transaction.set(planRef, cleanData({
        bookingId,
        deposit: installmentPlan.deposit,
        installments: installmentPlan.installments,
        planType: installmentPlan.planType,
        planLabel: installmentPlan.planLabel
      }));
    } else {
      transaction.update(planRef, cleanData({
        deposit: installmentPlan.deposit,
        installments: installmentPlan.installments,
        planType: installmentPlan.planType,
        planLabel: installmentPlan.planLabel
      }));
    }
    
    const firstPending = installmentPlan.installments.find(i => i.status === 'pending' || i.status === 'delayed');
    if (bookingSnap.exists()) {
      transaction.update(bookingRef, {
        'paymentSummary.next_due_date': firstPending?.dueDate || null
      });
    }
  });
};

export const issueRefund = async (
  refundData: Omit<Refund, 'id'>,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', refundData.bookingId);
    const planRef = doc(db, 'installment_plans', refundData.bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');
    
    // READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const planSnap = await transaction.get(planRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found");
    
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    if (booking.status === 'REFUNDED') throw new Error("Booking already refunded.");

    // LOGIC & WRITES
    const refundRef = doc(collection(db, 'refunds'));
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) - refundData.refundAmount;
    const newRefundedTotal = (booking.refundedTotal || 0) + refundData.refundAmount;
    
    transaction.set(refundRef, { ...refundData, isDeleted: false, isReversed: false });
    transaction.update(bookingRef, {
      status: 'REFUNDED', hasRefund: true, 'paymentSummary.paidTotal': newPaidTotal,
      refundedTotal: newRefundedTotal, lastRefundAt: refundData.refundDate,
      'paymentSummary.remaining': 0, deactivatedAt: booking.deactivatedAt || new Date().toISOString(),
      deactivatedReason: booking.deactivatedReason || `Refund Issued: ${refundData.reason}`
    });
    if (planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const installments = plan.installments.map(inst => inst.status === 'pending' || inst.status === 'delayed' ? { ...inst, status: 'cancelled' } : inst);
      transaction.update(planRef, { installments });
    }

    // Log Refund
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: refundData.bookingId,
      timestamp: new Date().toISOString(),
      action: 'REFUNDED',
      description: `Refund issued: ${refundData.refundAmount} EGP. Reason: ${refundData.reason}`,
      performedBy: performedBy?.name || refundData.createdByUid || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        refundId: refundRef.id,
        refundAmount: refundData.refundAmount,
        reason: refundData.reason
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || refundData.createdByUid || 'System',
      userName: performedBy?.name || 'System',
      action: 'ISSUE_REFUND',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: refundData.bookingId,
      targetName: customerName,
      details: `Issued refund of ${refundData.refundAmount} EGP for ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    // After refund, booking becomes non-active, so it's definitely NOT in WaPending queue anymore
    applyStatsDelta(transaction, statsSnap, {
      collected: -refundData.refundAmount,
      outstanding: -booking.paymentSummary.remaining, // Balance goes to 0
      expected: -booking.pricing.finalPriceSnapshot, // Booking is gone from counts
      bookingsCount: -1,
      whatsappPending: wasWaPending ? -1 : 0
    }, {
      salesId: booking.salesId,
      collected: -refundData.refundAmount,
      bookingsCount: -1
    });
  });
};

export const deactivateBooking = async (
  bookingId: string, 
  reason: string, 
  uid: string, 
  refundEligible: boolean = false, 
  eligibilityReason: string = "",
  performedBy?: { name: string, email: string }
) => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const planRef = doc(db, 'installment_plans', bookingId);
  
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) throw new Error("Booking not found");
  const booking = bookingSnap.data() as Booking;
  if (booking.status !== 'ACTIVE') throw new Error("Can only deactivate active bookings.");
  
  const planSnap = await getDoc(planRef);
  const batch = writeBatch(db);
  batch.update(bookingRef, {
    status: 'DEACTIVATED', deactivatedAt: new Date().toISOString(), deactivatedReason: reason,
    deactivatedByUid: uid, refundEligible, refundEligibilityReason: eligibilityReason, 'paymentSummary.remaining': 0
  });
  if (planSnap.exists()) {
    const installments = (planSnap.data().installments || []).map((inst: any) => inst.status === 'pending' || inst.status === 'delayed' ? { ...inst, status: 'cancelled' } : inst);
    batch.update(planRef, { installments });
  }

  // Log Deactivation
  const logRef = doc(collection(db, 'booking_logs'));
  batch.set(logRef, cleanData({
    bookingId: bookingId,
    timestamp: new Date().toISOString(),
    action: 'DEACTIVATED',
    description: `Booking deactivated. Reason: ${reason}`,
    performedBy: performedBy?.name || uid || 'System',
    performedByEmail: performedBy?.email || '',
    details: {
      reason,
      refundEligible,
      eligibilityReason,
      previousStatus: booking.status,
      previousInstallments: planSnap.exists() ? planSnap.data().installments : [],
      snapshotBefore: {
        booking: { ...booking },
        installmentPlan: planSnap.exists() ? { ...planSnap.data() } : null
      }
    }
  }));

  // System Activity Log
  const activityLogRef = doc(collection(db, 'activity_logs'));
  const customerSnap = await getDoc(doc(db, 'customers', booking.customerId));
  const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';
  
  batch.set(activityLogRef, cleanData({
    userId: performedBy?.email || uid || 'System',
    userName: performedBy?.name || 'System',
    action: 'DEACTIVATE_BOOKING',
    timestamp: new Date().toISOString(),
    section: 'Bookings',
    targetId: bookingId,
    targetName: customerName,
    details: `Deactivated booking for ${customerName}. Reason: ${reason}`,
    isDeleted: false
  }));

  // Since we use writeBatch here, we need a different approach or convert it to transaction
  // But writeBatch is fine, we just add the update to it manually
  const statsRef = doc(db, 'stats', 'dashboard');
  const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
  
  batch.update(statsRef, {
    collected: increment(0), // Doesn't change
    outstanding: increment(-booking.paymentSummary.remaining),
    expected: increment(-booking.pricing.finalPriceSnapshot),
    bookingsCount: increment(-1),
    whatsappPending: increment(wasWaPending ? -1 : 0)
  });

  return await batch.commit();
};

export const restoreBooking = async (
  bookingId: string, 
  reason: string = "", 
  repaidRefund: boolean = false,
  performedBy?: { name: string, email: string }
) => {
  const refundsQuery = query(collection(db, 'refunds'), where('bookingId', '==', bookingId));
  const refundsSnap = await getDocs(refundsQuery);
  const activeRefunds = refundsSnap.docs.filter(d => !d.data().isDeleted && !d.data().isReversed);
  
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');
    
    // READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const planSnap = await transaction.get(planRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    // CHECK CAPACITY (Another READ if needed)
    if (booking.groupId) {
      const groupRef = doc(db, 'groups', booking.groupId);
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists()) throw new Error("Group not found");
      const group = groupSnap.data() as Group;
      const activeCount = await getGroupActiveCount(booking.groupId);
      if (activeCount >= group.capacity) throw new Error("Cannot restore: Group is already full.");
    }

    // LOGIC
    let updatedPaidTotal = booking.paymentSummary.paidTotal || 0;
    let updatedRefundedTotal = booking.refundedTotal || 0;
    let hasRefund = booking.hasRefund || false;
    if (repaidRefund && updatedRefundedTotal > 0) {
      updatedPaidTotal += updatedRefundedTotal;
      updatedRefundedTotal = 0;
      hasRefund = false;
      activeRefunds.forEach(rDoc => { transaction.update(rDoc.ref, { isReversed: true, reversedAt: new Date().toISOString() }); });
    }
    const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - updatedPaidTotal);

    // WRITES
    transaction.update(bookingRef, {
      status: 'ACTIVE', deactivatedAt: null, deactivatedReason: null, deactivatedByUid: null,
      restoreReason: reason, 'paymentSummary.paidTotal': updatedPaidTotal, 'paymentSummary.remaining': newRemaining,
      refundedTotal: updatedRefundedTotal, hasRefund: hasRefund, 'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
    });
    if (planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const installments = plan.installments.map(inst => inst.status === 'cancelled' ? { ...inst, status: 'pending' } : inst);
      transaction.update(planRef, { installments });
    }

    // Log Restore
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: bookingId,
      timestamp: new Date().toISOString(),
      action: 'RESTORED',
      description: `Booking restored. Reason: ${reason}`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        reason,
        repaidRefund,
        previousStatus: booking.status,
        previousPaidTotal: booking.paymentSummary.paidTotal,
        previousRemaining: booking.paymentSummary.remaining,
        snapshotBefore: {
          booking: { ...booking },
          installmentPlan: planSnap.exists() ? { ...planSnap.data() } : null
        },
        snapshotAfter: {
          booking: { ...booking, status: 'ACTIVE', paymentSummary: { ...booking.paymentSummary, paidTotal: updatedPaidTotal, remaining: newRemaining } },
          installmentPlan: planSnap.exists() ? { ...planSnap.data(), installments: planSnap.data().installments.map((inst: any) => inst.status === 'cancelled' ? { ...inst, status: 'pending' } : inst) } : null
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'RESTORE_BOOKING',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      details: `Restored booking for ${customerName}. Reason: ${reason}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && (booking.bookingType !== 'deferred' || repaidRefund);
    
    applyStatsDelta(transaction, statsSnap, {
      collected: repaidRefund ? updatedPaidTotal - booking.paymentSummary.paidTotal : 0,
      outstanding: newRemaining,
      expected: booking.pricing.finalPriceSnapshot,
      bookingsCount: 1,
      whatsappPending: isNowWaPending ? 1 : 0
    }, {
      salesId: booking.salesId,
      collected: repaidRefund ? updatedPaidTotal - booking.paymentSummary.paidTotal : 0,
      bookingsCount: 1
    });
  });
};

export const softDeleteDoc = async (collectionName: string, id: string, uid: string, performedBy?: { name: string, email: string }) => {
  const ref = doc(db, collectionName, id);
  const deleteData: any = { isDeleted: true, deletedAt: new Date().toISOString(), deletedByUid: uid };
  if (collectionName === 'bookings') {
    const batch = writeBatch(db);
    const bookingSnap = await getDoc(ref);
    if (!bookingSnap.exists()) return;
    const booking = bookingSnap.data() as Booking;

    const paymentsQuery = query(collection(db, 'payments'), where('bookingId', '==', id));
    const paymentsSnap = await getDocs(paymentsQuery);
    paymentsSnap.forEach(pDoc => { batch.update(pDoc.ref, { isDeleted: true, deletedAt: deleteData.deletedAt, deletedByUid: uid }); });
    const refundsQuery = query(collection(db, 'refunds'), where('bookingId', '==', id));
    const refundsSnap = await getDocs(refundsQuery);
    refundsSnap.forEach(rDoc => { batch.update(rDoc.ref, { isDeleted: true, deletedAt: deleteData.deletedAt, deletedByUid: uid }); });
    const planRef = doc(db, 'installment_plans', id);
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      const installments = (planSnap.data().installments || []).map((inst: any) => inst.status === 'pending' || inst.status === 'delayed' ? { ...inst, status: 'cancelled' } : inst);
      batch.update(planRef, { installments });
    }
    batch.update(ref, { ...deleteData, status: 'DELETED' });
    if (booking.pricing?.appliedPromoCode?.code) {
      const codeId = booking.pricing.appliedPromoCode.code.toUpperCase().trim();
      const promoRef = doc(db, 'promo_codes', codeId);
      batch.update(promoRef, { useCount: increment(-1) });
    }

    const statsRef = doc(db, 'stats', 'dashboard');
    const isActive = booking.status === 'ACTIVE';
    const wasWaPending = isActive && booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    
    batch.update(statsRef, {
      collected: increment(-(booking.paymentSummary.paidTotal || 0)),
      outstanding: increment(isActive ? -booking.paymentSummary.remaining : 0),
      expected: increment(isActive ? -booking.pricing.finalPriceSnapshot : 0),
      bookingsCount: increment(isActive ? -1 : 0),
      whatsappPending: increment(wasWaPending ? -1 : 0)
    });

    await batch.commit();
  } else {
    await updateDoc(ref, deleteData);
  }

  if (performedBy) {
    await logActivity({
      userId: performedBy.email,
      userName: performedBy.name,
      userEmail: performedBy.email,
      action: `SOFT_DELETE_${collectionName.toUpperCase()}`,
      timestamp: new Date().toISOString(),
      section: collectionName,
      details: `Soft deleted item from ${collectionName} with ID ${id}`
    });
  }
};

export const addPaymentAndUpdateBooking = async (
  payment: Omit<Payment, 'id'>, 
  installmentIndex?: number,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', payment.bookingId);
    const planRef = doc(db, 'installment_plans', payment.bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');
    
    // READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const planSnap = await transaction.get(planRef);
    
    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';
    
    // LOGIC & WRITES
    const paymentRef = doc(collection(db, 'payments'));
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) + payment.amount;
    const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - newPaidTotal);
    
    transaction.set(paymentRef, cleanData({ ...payment, isDeleted: false }));
    transaction.update(bookingRef, cleanData({
      'paymentSummary.paidTotal': newPaidTotal, 'paymentSummary.remaining': newRemaining,
      'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
    }));
    if (installmentIndex !== undefined && planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const installments = [...plan.installments];
      if (installments[installmentIndex]) {
        installments[installmentIndex].status = 'paid';
        transaction.update(planRef, cleanData({ installments }));
        transaction.update(bookingRef, cleanData({ 'paymentSummary.next_due_date': installments.find(i => i.status === 'pending' || i.status === 'delayed')?.dueDate || null }));
      }
    }

    // Log Payment
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: payment.bookingId,
      timestamp: new Date().toISOString(),
      action: 'PAYMENT',
      description: `Payment received: ${payment.amount} EGP via ${payment.method}.`,
      performedBy: performedBy?.name || payment.createdByUid || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        paymentId: paymentRef.id,
        amount: payment.amount,
        method: payment.method,
        installmentIndex,
        transactionRef: payment.transactionRef || null,
        receiptLink: payment.receiptLink || null,
        paymentSummary: {
          paidTotal: newPaidTotal,
          remaining: newRemaining
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || payment.createdByUid || 'System',
      userName: performedBy?.name || 'System',
      action: 'ADD_PAYMENT',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: payment.bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Received payment of ${payment.amount} EGP for ${customerName}${payment.note ? `. Note/Reason: ${payment.note}` : ''}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    
    applyStatsDelta(transaction, statsSnap, {
      collected: payment.amount,
      outstanding: -payment.amount,
      whatsappPending: (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0)
    }, {
      salesId: booking.salesId,
      collected: payment.amount,
      bookingsCount: 0
    });
  });
};

export const addCompletionPayment = async (
  payment: Omit<Payment, 'id'> & { customInstallments?: Installment[] },
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', payment.bookingId);
    const planRef = doc(db, 'installment_plans', payment.bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    // CRITICAL FIX: ALL READS MUST BE FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const planSnap = await transaction.get(planRef);

    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';
    
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) + payment.amount;
    const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - newPaidTotal);
    
    const paymentRef = doc(collection(db, 'payments'));

    // START WRITES
    const { customInstallments, ...paymentData } = payment;
    transaction.set(paymentRef, { ...paymentData, isDeleted: false });
    
    transaction.update(bookingRef, {
      'paymentSummary.paidTotal': newPaidTotal,
      'paymentSummary.remaining': newRemaining,
      'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
    });

    if (planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      let updatedInstallments: Installment[] = [];

      if (customInstallments && customInstallments.length > 0) {
        updatedInstallments = customInstallments;
      } else {
        const pendingIndices = plan.installments
          .map((inst, idx) => (inst.status === 'pending' || inst.status === 'delayed') ? idx : -1)
          .filter(idx => idx !== -1);

        if (pendingIndices.length > 0) {
          // Default logic: Keep the first pending installment as is, redistribute the rest
          const firstPendingIdx = pendingIndices[0];
          const firstPendingAmt = plan.installments[firstPendingIdx].amount;
          
          const remainingAfterFirst = Math.max(0, newRemaining - firstPendingAmt);
          const otherPendingIndices = pendingIndices.slice(1);
          const count = otherPendingIndices.length;
          const baseAmount = count > 0 ? Math.floor(remainingAfterFirst / count) : 0;
          const remainder = count > 0 ? remainingAfterFirst % count : 0;

          updatedInstallments = plan.installments.map((inst, idx) => {
            if (idx === firstPendingIdx) {
              // Mark as Initial Completion if not already marked
              return { ...inst, label: inst.label || 'قسط استكمال البداية' };
            }
            const otherIdx = otherPendingIndices.indexOf(idx);
            if (otherIdx !== -1) {
              const isLast = otherIdx === count - 1;
              return { ...inst, amount: isLast ? baseAmount + remainder : baseAmount };
            }
            return inst;
          });
        }
      }

      if (updatedInstallments.length > 0) {
        transaction.update(planRef, { installments: updatedInstallments });
        const firstActive = updatedInstallments.find(i => i.status === 'pending' || i.status === 'delayed');
        transaction.update(bookingRef, { 'paymentSummary.next_due_date': firstActive?.dueDate || null });
      }
    }

    // Log Completion
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId: payment.bookingId,
      timestamp: new Date().toISOString(),
      action: 'COMPLETION_PAYMENT',
      description: `Completion payment received: ${payment.amount} EGP.`,
      performedBy: performedBy?.name || payment.createdByUid || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        paymentId: paymentRef.id,
        amount: payment.amount,
        method: payment.method,
        note: payment.note || null,
        transactionRef: payment.transactionRef || null,
        receiptLink: payment.receiptLink || null,
        paymentSummary: {
          paidTotal: newPaidTotal,
          remaining: newRemaining
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || payment.createdByUid || 'System',
      userName: performedBy?.name || 'System',
      action: 'COMPLETION_PAYMENT',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: payment.bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Received completion payment of ${payment.amount} EGP for ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    
    applyStatsDelta(transaction, statsSnap, {
      collected: payment.amount,
      outstanding: -payment.amount,
      whatsappPending: (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0)
    }, {
      salesId: booking.salesId,
      collected: payment.amount,
      bookingsCount: 0
    });
  });
};

export const withdrawAmount = async (
  bookingId: string,
  amount: number,
  method: string,
  ref: string,
  note: string,
  newInstallments: Installment[],
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    // ALL READS FIRST
    const statsSnap = await transaction.get(statsRef);
    const bookingSnap = await transaction.get(bookingRef);
    const planSnap = await transaction.get(planRef);

    if (!bookingSnap.exists()) throw new Error("Booking not found");
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';
    
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) - amount;
    const newRemaining = booking.pricing.finalPriceSnapshot - newPaidTotal;

    // 1. Create Refund Record
    const refundRef = doc(collection(db, 'refunds'));
    transaction.set(refundRef, {
      id: refundRef.id,
      bookingId,
      amount,
      method,
      ref,
      note,
      createdAt: new Date().toISOString(),
      performedBy: performedBy?.name || 'System',
      isReversed: false
    });

    // 2. Update Booking
    transaction.update(bookingRef, {
      'paymentSummary.paidTotal': newPaidTotal,
      'paymentSummary.remaining': newRemaining,
      updatedAt: new Date().toISOString()
    });

    // 3. Update Plan
    if (planSnap.exists()) {
      transaction.update(planRef, {
        installments: newInstallments,
        updatedAt: new Date().toISOString()
      });
    }

    // 4. Log Action
    const logRef = doc(collection(db, 'booking_logs'));
    transaction.set(logRef, cleanData({
      bookingId,
      timestamp: new Date().toISOString(),
      action: 'REFUNDED',
      description: `Withdrawal of ${amount} EGP via ${method}.`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        refundId: refundRef.id,
        amount,
        method,
        ref: ref || null,
        note: note || null,
        isPartialWithdrawal: true,
        paymentSummary: {
          paidTotal: newPaidTotal,
          remaining: newRemaining
        }
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'WITHDRAW_AMOUNT',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Withdrew ${amount} EGP from ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';

    applyStatsDelta(transaction, statsSnap, {
      collected: -amount,
      outstanding: amount,
      whatsappPending: (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0)
    }, {
      salesId: booking.salesId,
      collected: -amount,
      bookingsCount: 0
    });
  });
};

export const reversePayment = async (
  bookingId: string,
  logId: string,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const logRef = doc(db, 'booking_logs', logId);
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    const [logSnap, bookingSnap, planSnap, statsSnap] = await Promise.all([
      transaction.get(logRef),
      transaction.get(bookingRef),
      transaction.get(planRef),
      transaction.get(statsRef)
    ]);

    if (!logSnap.exists() || !bookingSnap.exists()) throw new Error("Records not found.");
    const log = logSnap.data() as BookingLog;
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    if (log.action !== 'PAYMENT' && log.action !== 'COMPLETION_PAYMENT') {
      throw new Error("Only payment actions can be reversed with this function.");
    }

    if (log.details?.isReversed) throw new Error("This action has already been reversed.");

    const amount = log.details?.amount || 0;
    const paymentId = log.details?.paymentId || null;

    // 1. Update Payment Record if ID exists
    if (paymentId) {
      const paymentRef = doc(db, 'payments', paymentId);
      transaction.update(paymentRef, { 
        isReversed: true, 
        reversedAt: new Date().toISOString() 
      });
    }

    // 2. Update Booking Totals
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) - amount;
    const newRemaining = (booking.paymentSummary.remaining || 0) + amount;
    
    transaction.update(bookingRef, {
      'paymentSummary.paidTotal': newPaidTotal,
      'paymentSummary.remaining': newRemaining,
      'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
    });

    // 3. Revert Installment Status if applicable
    if (planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const installments = [...plan.installments];
      
      if (log.action === 'PAYMENT' && log.details?.installmentIndex !== undefined) {
        const idx = log.details.installmentIndex;
        if (installments[idx] && installments[idx].status === 'paid') {
          installments[idx].status = 'pending';
          transaction.update(planRef, { installments });
          
          // Update next due date
          const firstPending = installments.find(i => i.status === 'pending' || i.status === 'delayed');
          transaction.update(bookingRef, { 'paymentSummary.next_due_date': firstPending?.dueDate || null });
        }
      } else if (log.action === 'COMPLETION_PAYMENT') {
        // For completion payments, we don't easily know the previous state unless we stored it.
        // But we can at least try to find the first 'pending' installment and maybe adjust it?
        // Actually, the user might have to reschedule manually if it was a complex redistribution.
      }
    }

    // 4. Mark Log as Reversed
    transaction.update(logRef, { 'details.isReversed': true, 'details.reversedAt': new Date().toISOString() });

    // 5. Create Reversal Log
    const revLogRef = doc(collection(db, 'booking_logs'));
    transaction.set(revLogRef, cleanData({
      bookingId,
      timestamp: new Date().toISOString(),
      action: 'PAYMENT_REVERSED',
      description: `Payment of ${amount} EGP reversed (Action ID: ${logId}).`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        originalLogId: logId,
        amount,
        paymentId
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'REVERSE_PAYMENT',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Reversed payment of ${amount} EGP for ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
    
    applyStatsDelta(transaction, statsSnap, {
      collected: -amount,
      outstanding: amount,
      whatsappPending: (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0)
    }, {
      salesId: booking.salesId,
      collected: -amount,
      bookingsCount: 0
    });
  });
};

export const reverseRefund = async (
  bookingId: string,
  logId: string,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const logRef = doc(db, 'booking_logs', logId);
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    const [logSnap, bookingSnap, planSnap, statsSnap] = await Promise.all([
      transaction.get(logRef),
      transaction.get(bookingRef),
      transaction.get(planRef),
      transaction.get(statsRef)
    ]);

    if (!logSnap.exists() || !bookingSnap.exists()) throw new Error("Records not found.");
    const log = logSnap.data() as BookingLog;
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    if (log.action !== 'REFUNDED') {
      throw new Error("Only refund actions can be reversed with this function.");
    }

    if (log.details?.isReversed) throw new Error("This action has already been reversed.");

    const amount = log.details?.refundAmount || log.details?.amount || 0;
    const refundId = log.details?.refundId || null;

    // 1. Update Refund Record if ID exists
    if (refundId) {
      const refundRef = doc(db, 'refunds', refundId);
      transaction.update(refundRef, { 
        isReversed: true, 
        reversedAt: new Date().toISOString() 
      });
    }

    // 2. Update Booking Totals
    const newPaidTotal = (booking.paymentSummary.paidTotal || 0) + amount;
    const newRefundedTotal = Math.max(0, (booking.refundedTotal || 0) - amount);
    const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - newPaidTotal);
    
    transaction.update(bookingRef, {
      status: newRemaining > 0 ? 'ACTIVE' : booking.status, // If it was refunded, it might become active again
      'paymentSummary.paidTotal': newPaidTotal,
      refundedTotal: newRefundedTotal,
      hasRefund: newRefundedTotal > 0,
      'paymentSummary.remaining': newRemaining,
      'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
    });

    // 3. Revert Installment Status if applicable
    if (planSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const installments = plan.installments.map(inst => inst.status === 'cancelled' ? { ...inst, status: 'pending' } : inst);
      transaction.update(planRef, { installments });
      
      const firstPending = installments.find(i => i.status === 'pending' || i.status === 'delayed');
      transaction.update(bookingRef, { 'paymentSummary.next_due_date': firstPending?.dueDate || null });
    }

    // 4. Mark Log as Reversed
    transaction.update(logRef, { 'details.isReversed': true, 'details.reversedAt': new Date().toISOString() });

    // 5. Create Reversal Log
    const revLogRef = doc(collection(db, 'booking_logs'));
    transaction.set(revLogRef, cleanData({
      bookingId,
      timestamp: new Date().toISOString(),
      action: 'REFUND_REVERSED',
      description: `Refund of ${amount} EGP reversed (Action ID: ${logId}).`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        originalLogId: logId,
        amount,
        refundId
      }
    }));

    // System Activity Log
    const activityLogRef = doc(collection(db, 'activity_logs'));
    
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'REVERSE_REFUND',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `Reversed refund of ${amount} EGP for ${customerName}`,
      isDeleted: false
    }));

    // Update Aggregated Stats
    const isBecomingActive = newRemaining > 0;
    const isNowWaPending = isBecomingActive && newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';

    applyStatsDelta(transaction, statsSnap, {
      collected: amount,
      outstanding: isBecomingActive ? newRemaining : 0,
      expected: isBecomingActive ? booking.pricing.finalPriceSnapshot : 0,
      bookingsCount: isBecomingActive ? 1 : 0,
      whatsappPending: isNowWaPending ? 1 : 0
    }, {
      salesId: booking.salesId,
      collected: amount,
      bookingsCount: isBecomingActive ? 1 : 0
    });
  });
};

export const rollbackBookingAction = async (
  bookingId: string,
  logId: string,
  performedBy?: { name: string, email: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const logRef = doc(db, 'booking_logs', logId);
    const bookingRef = doc(db, 'bookings', bookingId);
    const planRef = doc(db, 'installment_plans', bookingId);
    const statsRef = doc(db, 'stats', 'dashboard');

    const [logSnap, bookingSnap, planSnap, statsSnap] = await Promise.all([
      transaction.get(logRef),
      transaction.get(bookingRef),
      transaction.get(planRef),
      transaction.get(statsRef)
    ]);

    if (!logSnap.exists()) throw new Error("سجل الحركة غير موجود.");
    if (!bookingSnap.exists()) throw new Error("بيانات الحجز غير موجودة.");

    const log = logSnap.data() as BookingLog;
    const booking = bookingSnap.data() as Booking;
    const customerSnap = await transaction.get(doc(db, 'customers', booking.customerId));
    const customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

    if (log.details?.isReversed) {
      throw new Error("تم التراجع عن هذه الحركة بالفعل مسبقاً.");
    }

    const action = log.action;
    let descriptionText = `تم التراجع عن حركة (${action}) واستعادة الحالة`;

    // 1. Financial Reversals
    if (action === 'PAYMENT' || action === 'COMPLETION_PAYMENT') {
      const amount = log.details?.amount || 0;
      const paymentId = log.details?.paymentId || null;

      if (paymentId) {
        const paymentRef = doc(db, 'payments', paymentId);
        transaction.update(paymentRef, { 
          isReversed: true, 
          reversedAt: new Date().toISOString(),
          reversedBy: performedBy?.name || 'System'
        });
      }

      const newPaidTotal = Math.max(0, (booking.paymentSummary.paidTotal || 0) - amount);
      const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - newPaidTotal);
      
      transaction.update(bookingRef, {
        'paymentSummary.paidTotal': newPaidTotal,
        'paymentSummary.remaining': newRemaining,
        'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
      });

      if (planSnap.exists()) {
        const plan = planSnap.data() as InstallmentPlan;
        const installments = [...plan.installments];
        
        if (action === 'PAYMENT' && log.details?.installmentIndex !== undefined) {
          const idx = log.details.installmentIndex;
          if (installments[idx] && installments[idx].status === 'paid') {
            installments[idx].status = 'pending';
            transaction.update(planRef, { installments });
            const firstPending = installments.find(i => i.status === 'pending' || i.status === 'delayed');
            transaction.update(bookingRef, { 'paymentSummary.next_due_date': firstPending?.dueDate || null });
          }
        }
      }

      const wasWaPending = booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
      const isNowWaPending = newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';
      
      applyStatsDelta(transaction, statsSnap, {
        collected: -amount,
        outstanding: amount,
        whatsappPending: (isNowWaPending ? 1 : 0) - (wasWaPending ? 1 : 0)
      }, {
        salesId: booking.salesId,
        collected: -amount,
        bookingsCount: 0
      });

      descriptionText = `تم إلغاء دفعة بقيمة ${amount} ج.م واستعادة الرصيد السابق.`;

    } else if (action === 'REFUNDED') {
      const amount = log.details?.refundAmount || log.details?.amount || 0;
      const refundId = log.details?.refundId || null;

      if (refundId) {
        const refundRef = doc(db, 'refunds', refundId);
        transaction.update(refundRef, { 
          isReversed: true, 
          reversedAt: new Date().toISOString() 
        });
      }

      const newPaidTotal = (booking.paymentSummary.paidTotal || 0) + amount;
      const newRefundedTotal = Math.max(0, (booking.refundedTotal || 0) - amount);
      const newRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - newPaidTotal);
      
      transaction.update(bookingRef, {
        status: newRemaining > 0 ? 'ACTIVE' : booking.status,
        'paymentSummary.paidTotal': newPaidTotal,
        refundedTotal: newRefundedTotal,
        hasRefund: newRefundedTotal > 0,
        'paymentSummary.remaining': newRemaining,
        'whatsappStatus.eligible': newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
      });

      if (planSnap.exists()) {
        const plan = planSnap.data() as InstallmentPlan;
        const installments = plan.installments.map(inst => inst.status === 'cancelled' ? { ...inst, status: 'pending' } : inst);
        transaction.update(planRef, { installments });
        const firstPending = installments.find(i => i.status === 'pending' || i.status === 'delayed');
        transaction.update(bookingRef, { 'paymentSummary.next_due_date': firstPending?.dueDate || null });
      }

      const isBecomingActive = newRemaining > 0;
      const isNowWaPending = isBecomingActive && newRemaining <= (booking.pricing.finalPriceSnapshot * 0.5) && !booking.whatsappStatus?.added && booking.bookingType !== 'deferred';

      applyStatsDelta(transaction, statsSnap, {
        collected: amount,
        outstanding: isBecomingActive ? newRemaining : 0,
        expected: isBecomingActive ? booking.pricing.finalPriceSnapshot : 0,
        bookingsCount: isBecomingActive ? 1 : 0,
        whatsappPending: isNowWaPending ? 1 : 0
      }, {
        salesId: booking.salesId,
        collected: amount,
        bookingsCount: isBecomingActive ? 1 : 0
      });

      descriptionText = `تم التراجع عن استرداد بقيمة ${amount} ج.م وإعادة المبلغ لحساب الحجز.`;

    } else if (action === 'UPDATED') {
      const snapBefore = log.details?.snapshotBefore;
      if (snapBefore?.booking) {
        transaction.update(bookingRef, cleanData(snapBefore.booking) as any);
      }
      if (snapBefore?.customer && customerSnap.exists()) {
        transaction.update(doc(db, 'customers', booking.customerId), cleanData(snapBefore.customer) as any);
      }
      
      if (!snapBefore) {
        if (log.details?.depositChanged) {
          const oldDep = log.details.oldDeposit ?? 0;
          const newDep = log.details.newDeposit ?? 0;
          const depositDiff = oldDep - newDep;
          const updatedPaid = (booking.paymentSummary.paidTotal || 0) + depositDiff;
          const updatedRemaining = Math.max(0, booking.pricing.finalPriceSnapshot - updatedPaid);

          transaction.update(bookingRef, {
            'paymentSummary.paidTotal': updatedPaid,
            'paymentSummary.remaining': updatedRemaining,
            'whatsappStatus.eligible': updatedRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
          });

          applyStatsDelta(transaction, statsSnap, {
            collected: depositDiff,
            outstanding: -depositDiff
          }, {
            salesId: booking.salesId,
            collected: depositDiff,
            bookingsCount: 0
          });
        }
        if (log.details?.previousCustomer && customerSnap.exists()) {
          transaction.update(doc(db, 'customers', booking.customerId), cleanData(log.details.previousCustomer) as any);
        }
        if (log.details?.previousBooking) {
          transaction.update(bookingRef, cleanData(log.details.previousBooking) as any);
        }
      }
      descriptionText = `تم التراجع عن تعديلات الحجز واستعادة البيانات السابقة.`;

    } else if (action === 'ASSIGNED' || action === 'GROUP_ASSIGNED') {
      const snapBefore = log.details?.snapshotBefore;
      const prevGroupId = snapBefore?.booking?.groupId ?? log.details?.previousGroupId ?? null;
      const prevBookingType = snapBefore?.booking?.bookingType ?? log.details?.previousBookingType ?? (prevGroupId ? 'assigned' : 'deferred');
      
      transaction.update(bookingRef, cleanData({
        groupId: prevGroupId,
        bookingType: prevBookingType
      }));

      const prevInstallments = snapBefore?.installmentPlan?.installments ?? log.details?.previousInstallments;
      if (prevInstallments && planSnap.exists()) {
        transaction.update(planRef, cleanData({ installments: prevInstallments }));
        const firstPending = prevInstallments.find((i: any) => i.status === 'pending' || i.status === 'delayed');
        transaction.update(bookingRef, cleanData({ 'paymentSummary.next_due_date': firstPending?.dueDate || null }));
      }
      descriptionText = `تم التراجع عن تسكين المجموعة وإعادة حالة الحجز السابقة.`;

    } else if (action === 'RESCHEDULED') {
      const snapBefore = log.details?.snapshotBefore;
      const prevInstallments = snapBefore?.installmentPlan?.installments ?? log.details?.previousInstallments;
      if (prevInstallments && planSnap.exists()) {
        transaction.update(planRef, cleanData({ installments: prevInstallments }));
        const firstPending = prevInstallments.find((i: any) => i.status === 'pending' || i.status === 'delayed');
        transaction.update(bookingRef, cleanData({ 'paymentSummary.next_due_date': firstPending?.dueDate || null }));
      }
      descriptionText = `تم التراجع عن إعادة الجدولة واستعادة مواعيد الأقساط السابقة.`;

    } else if (action === 'DEACTIVATED') {
      const snapBefore = log.details?.snapshotBefore;
      const prevRemaining = snapBefore?.booking?.paymentSummary?.remaining ?? booking.pricing.finalPriceSnapshot - (booking.paymentSummary.paidTotal || 0);

      transaction.update(bookingRef, {
        status: 'ACTIVE',
        deactivatedAt: null,
        deactivatedReason: null,
        deactivatedByUid: null,
        'paymentSummary.remaining': prevRemaining,
        'whatsappStatus.eligible': prevRemaining <= (booking.pricing.finalPriceSnapshot * 0.5)
      });

      if (planSnap.exists()) {
        const plan = planSnap.data() as InstallmentPlan;
        const installments = plan.installments.map(inst => inst.status === 'cancelled' ? { ...inst, status: 'pending' } : inst);
        transaction.update(planRef, { installments });
      }

      applyStatsDelta(transaction, statsSnap, {
        outstanding: prevRemaining,
        expected: booking.pricing.finalPriceSnapshot,
        bookingsCount: 1,
        whatsappPending: (prevRemaining <= booking.pricing.finalPriceSnapshot * 0.5 && !booking.whatsappStatus?.added) ? 1 : 0
      }, {
        salesId: booking.salesId,
        collected: 0,
        bookingsCount: 1
      });
      descriptionText = `تم التراجع عن إلغاء التفعيل وإعادة الحجز إلى الحالة النشطة.`;

    } else if (action === 'RESTORED') {
      transaction.update(bookingRef, {
        status: 'DEACTIVATED',
        deactivatedAt: new Date().toISOString(),
        deactivatedReason: 'Reverted restore action',
        'paymentSummary.remaining': 0
      });

      if (planSnap.exists()) {
        const plan = planSnap.data() as InstallmentPlan;
        const installments = plan.installments.map(inst => inst.status === 'pending' || inst.status === 'delayed' ? { ...inst, status: 'cancelled' } : inst);
        transaction.update(planRef, { installments });
      }

      applyStatsDelta(transaction, statsSnap, {
        outstanding: -booking.paymentSummary.remaining,
        expected: -booking.pricing.finalPriceSnapshot,
        bookingsCount: -1,
        whatsappPending: (booking.whatsappStatus?.eligible && !booking.whatsappStatus?.added) ? -1 : 0
      }, {
        salesId: booking.salesId,
        collected: 0,
        bookingsCount: -1
      });
      descriptionText = `تم التراجع عن استعادة الحجز وإعادته للملغيات.`;

    } else if (action === 'PLAN_UPDATED') {
      const snapBefore = log.details?.snapshotBefore;
      if (snapBefore?.installmentPlan && planSnap.exists()) {
        transaction.update(planRef, cleanData(snapBefore.installmentPlan));
      }
      descriptionText = `تم التراجع عن تعديل خطة الأقساط واستعادة الخطة السابقة.`;
    } else {
      // General fallback if snapBefore exists
      const snapBefore = log.details?.snapshotBefore;
      if (snapBefore?.booking) {
        transaction.update(bookingRef, cleanData(snapBefore.booking) as any);
      }
      if (snapBefore?.customer && customerSnap.exists()) {
        transaction.update(doc(db, 'customers', booking.customerId), cleanData(snapBefore.customer) as any);
      }
      if (snapBefore?.installmentPlan && planSnap.exists()) {
        transaction.update(planRef, cleanData(snapBefore.installmentPlan) as any);
      }
      descriptionText = `تم التراجع عن حركة (${action}) واستعادة نقطة الحفظ السابقة.`;
    }

    // 2. Mark Original Log as Reversed
    transaction.update(logRef, { 
      'details.isReversed': true, 
      'details.reversedAt': new Date().toISOString(),
      'details.reversedBy': performedBy?.name || 'System'
    });

    // 3. Create Audit Reversal Log in booking_logs
    const revLogRef = doc(collection(db, 'booking_logs'));
    transaction.set(revLogRef, cleanData({
      bookingId,
      timestamp: new Date().toISOString(),
      action: 'ACTION_REVERSED',
      description: `${descriptionText} (مرجع الحركة: ${logId}).`,
      performedBy: performedBy?.name || 'System',
      performedByEmail: performedBy?.email || '',
      details: {
        originalLogId: logId,
        originalAction: action,
        reversedDetails: log.details || {}
      }
    }));

    // 4. Create Activity Log in activity_logs
    const activityLogRef = doc(collection(db, 'activity_logs'));
    transaction.set(activityLogRef, cleanData({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      action: 'ROLLBACK_ACTION',
      timestamp: new Date().toISOString(),
      section: 'Bookings',
      targetId: bookingId,
      targetName: customerName,
      clientId: booking.customerId,
      clientName: customerName,
      details: `تراجع عن حركة ${action} للعميل ${customerName}. ${descriptionText}`,
      isDeleted: false
    }));
  });
};

export const restoreBookingToPoint = rollbackBookingAction;

export const hasPaymentsForBooking = async (bookingId: string): Promise<boolean> => {
  const q = query(collection(db, 'payments'), where('bookingId', '==', bookingId), where('isDeleted', '==', false));
  const snap = await getDocs(q);
  return !snap.empty;
};

export const getBookingPayments = async (bookingId: string): Promise<Payment[]> => {
  try {
    const q = query(collection(db, 'payments'), where('bookingId', '==', bookingId), where('isDeleted', '==', false));
    const snap = await getDocs(q);
    const list: Payment[] = [];
    snap.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as Payment);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'payments');
    return [];
  }
};

export const updateInstallmentDelay = async (bookingId: string, index: number, reason: string, newDate: string, performedBy?: { name: string, email: string }) => {
  try {
    let customerName = 'Unknown';
    let customerId = '';

    await runTransaction(db, async (transaction) => {
      const planRef = doc(db, 'installment_plans', bookingId);
      const bookingRef = doc(db, 'bookings', bookingId);
      
      const planSnap = await transaction.get(planRef);
      const bookingSnap = await transaction.get(bookingRef);
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!bookingSnap.exists()) throw new Error("Booking not found");
      
      const booking = bookingSnap.data() as Booking;
      customerId = booking.customerId;
      const customerSnap = await transaction.get(doc(db, 'customers', customerId));
      customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

      const plan = planSnap.data() as InstallmentPlan;
      const installments = [...plan.installments];
      
      if (installments[index]) {
        installments[index].originalDueDate = installments[index].originalDueDate || installments[index].dueDate;
        installments[index].dueDate = newDate;
        installments[index].status = 'delayed';
        installments[index].delayReason = reason;
        
        transaction.update(planRef, { installments });
      }
    });

    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'UPDATE_INSTALLMENT_DELAY',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: bookingId,
      targetName: customerName,
      clientId: customerId,
      clientName: customerName,
      details: `Delayed installment for ${customerName}. Reason: ${reason}`
    });
  } catch (error) {
    console.error("Error updating installment delay:", error);
    throw error;
  }
};

export const markInstallmentNotified = async (bookingId: string, index: number, performedBy?: { name: string, email: string }) => {
  try {
    let customerName = 'Unknown';
    let customerId = '';
    let result = false;

    await runTransaction(db, async (transaction) => {
      const planRef = doc(db, 'installment_plans', bookingId);
      const bookingRef = doc(db, 'bookings', bookingId);
      
      const planSnap = await transaction.get(planRef);
      const bookingSnap = await transaction.get(bookingRef);
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!bookingSnap.exists()) throw new Error("Booking not found");
      
      const booking = bookingSnap.data() as Booking;
      customerId = booking.customerId;
      const customerSnap = await transaction.get(doc(db, 'customers', customerId));
      customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

      const plan = planSnap.data() as InstallmentPlan;
      const installments = [...plan.installments];
      
      if (installments[index]) {
        installments[index].notifiedOnWhatsApp = !installments[index].notifiedOnWhatsApp;
        result = installments[index].notifiedOnWhatsApp;
        transaction.update(planRef, { installments });
      }
    });

    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'MARK_INSTALLMENT_NOTIFIED',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: bookingId,
      targetName: customerName,
      clientId: customerId,
      clientName: customerName,
      details: `Toggled WhatsApp notification status for installment ${index} of ${customerName} to ${result}`
    });
  } catch (error) {
    console.error("Error marking installment notified:", error);
    throw error;
  }
};

export const updateInstallmentDelayInfo = async (
  bookingId: string, 
  index: number, 
  allInstallments: Installment[], 
  reason: string, 
  performedBy?: { name: string, email: string }
) => {
  try {
    let customerName = 'Unknown';
    let customerId = '';

    await runTransaction(db, async (transaction) => {
      const planRef = doc(db, 'installment_plans', bookingId);
      const bookingRef = doc(db, 'bookings', bookingId);
      
      const planSnap = await transaction.get(planRef);
      const bookingSnap = await transaction.get(bookingRef);
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!bookingSnap.exists()) throw new Error("Booking not found");
      
      const booking = bookingSnap.data() as Booking;
      customerId = booking.customerId;
      const customerSnap = await transaction.get(doc(db, 'customers', customerId));
      customerName = (customerSnap.data() as Customer)?.name || 'Unknown';
      
      if (allInstallments[index]) {
        const originalDate = allInstallments[index].originalDueDate || allInstallments[index].dueDate;
        allInstallments[index].originalDueDate = originalDate;
        allInstallments[index].delayReason = reason;
        allInstallments[index].status = 'delayed';
        allInstallments[index].delayContacted = true;
      }

      transaction.update(planRef, { installments: allInstallments });
    });

    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'UPDATE_INSTALLMENT_DELAY_INFO',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: bookingId,
      targetName: customerName,
      clientId: customerId,
      clientName: customerName,
      details: `Updated delay info for ${customerName}. Reason: ${reason}`
    });
  } catch (error) {
    console.error("Error updating installment delay info:", error);
    throw error;
  }
};

export const toggleInstallmentDelayContacted = async (
  bookingId: string, 
  index: number, 
  performedBy?: { name: string, email: string }
) => {
  try {
    const planRef = doc(db, 'installment_plans', bookingId);
    const bookingRef = doc(db, 'bookings', bookingId);
    
    let result: boolean = false;
    let customerName = 'Unknown';
    let customerId = '';

    await runTransaction(db, async (transaction) => {
      const planSnap = await transaction.get(planRef);
      const bookingSnap = await transaction.get(bookingRef);
      if (!planSnap.exists()) throw new Error("Plan not found");
      if (!bookingSnap.exists()) throw new Error("Booking not found");
      
      const booking = bookingSnap.data() as Booking;
      customerId = booking.customerId;
      const customerSnap = await transaction.get(doc(db, 'customers', customerId));
      customerName = (customerSnap.data() as Customer)?.name || 'Unknown';

      const plan = planSnap.data() as InstallmentPlan;
      const installments = [...plan.installments];
      
      if (installments[index]) {
        installments[index].delayContacted = !installments[index].delayContacted;
        result = installments[index].delayContacted;
        transaction.update(planRef, { installments });
      }
    });

    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'TOGGLE_DELAY_CONTACTED',
      timestamp: new Date().toISOString(),
      section: 'Installments',
      targetId: bookingId,
      targetName: customerName,
      clientId: customerId,
      clientName: customerName,
      details: `Toggled delay contacted status for installment ${index} of ${customerName} to ${result}`
    });
  } catch (error) {
    console.error("Error toggling delay contacted:", error);
    throw error;
  }
};

export const bulkReassignSales = async (fromSalesId: string, toSalesId: string, toSalesName: string, performedBy?: { name: string, email: string }) => {
  const q = query(
    collection(db, 'bookings'),
    where('salesId', '==', fromSalesId),
    where('status', '==', 'ACTIVE'),
    where('isDeleted', '==', false)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;

  snap.docs.forEach(d => {
    const data = d.data() as Booking;
    batch.update(d.ref, {
      salesId: toSalesId,
      salesName: toSalesName,
      // Only set original if it's not already set (to avoid losing the very first original)
      originalSalesId: data.originalSalesId || fromSalesId,
      originalSalesName: data.originalSalesName || data.salesName
    });
    count++;
  });

  if (count > 0) {
    await batch.commit();
    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'BULK_REASSIGN_SALES',
      timestamp: new Date().toISOString(),
      section: 'Settings',
      details: `Reassigned ${count} bookings from ${fromSalesId} to ${toSalesId} (${toSalesName})`
    });
  }
  return count;
};

export const bulkRevertSales = async (originalSalesId: string, performedBy?: { name: string, email: string }) => {
  const q = query(
    collection(db, 'bookings'),
    where('originalSalesId', '==', originalSalesId),
    where('status', '==', 'ACTIVE'),
    where('isDeleted', '==', false)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;

  snap.docs.forEach(d => {
    const data = d.data() as Booking;
    batch.update(d.ref, {
      salesId: data.originalSalesId,
      salesName: data.originalSalesName,
      originalSalesId: null,
      originalSalesName: null
    });
    count++;
  });

  if (count > 0) {
    await batch.commit();
    await logActivity({
      userId: performedBy?.email || 'System',
      userName: performedBy?.name || 'System',
      userEmail: performedBy?.email || 'System',
      action: 'BULK_REVERT_SALES',
      timestamp: new Date().toISOString(),
      section: 'Settings',
      details: `Reverted ${count} bookings for original sales ID: ${originalSalesId}`
    });
  }
  return count;
};

export const getReassignedCount = async (originalSalesId: string): Promise<number> => {
  const q = query(
    collection(db, 'bookings'),
    where('originalSalesId', '==', originalSalesId),
    where('status', '==', 'ACTIVE'),
    where('isDeleted', '==', false)
  );
  const snap = await getDocs(q);
  return snap.size;
};

export const bulkRescheduleInstallments = async () => {
  const bookingsSnap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'ACTIVE')));
  let updatedCount = 0;
  for (const bDoc of bookingsSnap.docs) {
    const booking = bDoc.data() as Booking;
    if (booking.isDeleted === true || booking.bookingType === 'deferred') continue;
    const planRef = doc(db, 'installment_plans', bDoc.id);
    const planSnap = await getDoc(planRef);
    const groupSnap = await getDoc(doc(db, 'groups', booking.groupId!));
    if (planSnap.exists() && groupSnap.exists()) {
      const plan = planSnap.data() as InstallmentPlan;
      const group = groupSnap.data() as Group;
      const baseDateStr = group.startDate;
      if (!baseDateStr) continue;
      const type = plan.installmentType || 'monthly';
      const remainingBalance = booking.paymentSummary.remaining;
      const historical = plan.installments.filter(i => i.status === 'paid' || i.status === 'cancelled');
      const futureToReplace = plan.installments.filter(i => i.status === 'pending' || i.status === 'delayed');
      const countToReplace = futureToReplace.length;
      if (remainingBalance <= 0) {
          const cleanInstallments = plan.installments.map(i => (i.status === 'pending' || i.status === 'delayed') ? { ...i, status: 'cancelled' } as Installment : i);
          await updateDoc(planRef, { installments: cleanInstallments });
          await updateDoc(bDoc.ref, { 'paymentSummary.next_due_date': null });
          updatedCount++;
          continue;
      }
      const effectiveFutureCount = countToReplace > 0 ? countToReplace : 1;
      const perInstAmount = remainingBalance / effectiveFutureCount;
      const newInstallments: Installment[] = [];
      for (let i = 0; i < effectiveFutureCount; i++) {
        const d = new Date(baseDateStr);
        if (type === 'weekly') d.setDate(d.getDate() + ((i + 1) * 7));
        else d.setMonth(d.getMonth() + (i + 1));
        newInstallments.push({ dueDate: d.toISOString().split('T')[0], amount: perInstAmount, status: 'pending', notifiedOnWhatsApp: false });
      }
      const finalSet = [...historical, ...newInstallments];
      await updateDoc(planRef, { installments: finalSet, rescheduled_at: new Date().toISOString() });
      await updateDoc(bDoc.ref, { 'paymentSummary.next_due_date': newInstallments.find(i => i.status === 'pending')?.dueDate || null, rescheduled_at: new Date().toISOString() });
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await logActivity({
      userId: 'System',
      userName: 'System',
      userEmail: 'System',
      action: 'BULK_RESCHEDULE_INSTALLMENTS',
      timestamp: new Date().toISOString(),
      section: 'Settings',
      details: `Bulk rescheduled installments for ${updatedCount} active bookings`
    });
  }
  return updatedCount;
};

export const recalculateRevenueFields = async () => {
  const bookingsSnap = await getDocs(collection(db, 'bookings'));
  let count = 0;
  for (const bDoc of bookingsSnap.docs) {
    if (bDoc.data().isDeleted === true) continue;
    const bookingId = bDoc.id;
    const pSnap = await getDocs(query(collection(db, 'payments'), where('bookingId', '==', bookingId), where('isDeleted', '==', false)));
    const rSnap = await getDocs(query(collection(db, 'refunds'), where('bookingId', '==', bookingId), where('isDeleted', '==', false), where('isReversed', '==', false)));
    const paidTotal = pSnap.docs.reduce((sum, p) => sum + (p.data().amount || 0), 0) - rSnap.docs.reduce((sum, r) => sum + (r.data().refundAmount || 0), 0);
    const refundedTotal = rSnap.docs.reduce((sum, r) => sum + (r.data().refundAmount || 0), 0);
    const finalPrice = bDoc.data().pricing?.finalPriceSnapshot || 0;
    const remaining = (bDoc.data().status === 'ACTIVE') ? Math.max(0, finalPrice - paidTotal) : 0;
    await updateDoc(bDoc.ref, {
      'paymentSummary.paidTotal': paidTotal, 'paymentSummary.remaining': remaining,
      'refundedTotal': refundedTotal, 'hasRefund': refundedTotal > 0, 'whatsappStatus.eligible': remaining <= (finalPrice * 0.5)
    });
    count++;
  }
  return count;
};

export const restoreSystemFromBackup = async (data: { [collectionName: string]: any[] }, onProgress?: (msg: string) => void) => {
  const collectionsToRestore = Object.keys(data);
  let totalOps = 0;

  for (const coll of collectionsToRestore) {
    if (onProgress) onProgress(`Restoring ${coll}...`);
    const docs = data[coll];
    const batchSize = 400; // Safe limit for Firestore batch
    
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(item => {
            const { id, ...docData } = item;
            const ref = doc(db, coll, id);
            batch.set(ref, docData);
            totalOps++;
        });
        await batch.commit();
        if (onProgress) onProgress(`Restored ${Math.min(i + batchSize, docs.length)} of ${docs.length} in ${coll}`);
    }
  }
  return totalOps;
};

export const repairBookedCounts = async () => 0;
export const cleanOrphanPayments = async () => {
  const pSnap = await getDocs(collection(db, 'payments'));
  let count = 0;
  for (const pDoc of pSnap.docs) {
    if (pDoc.data().isDeleted) continue;
    const bSnap = await getDoc(doc(db, 'bookings', pDoc.data().bookingId));
    if (!bSnap.exists() || bSnap.data()?.isDeleted) { await updateDoc(pDoc.ref, { isDeleted: true, note: 'Orphaned' }); count++; }
  }
  return count;
};

export const wipeCollection = async (collectionName: string, onProgress?: (msg: string) => void) => {
  const snap = await getDocs(collection(db, collectionName));
  const batchSize = 500;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = snap.docs.slice(i, i + batchSize);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    if (onProgress) onProgress(`Wiped ${Math.min(i+batchSize, snap.docs.length)} of ${snap.docs.length} from ${collectionName}`);
  }
};

export const toggleInstallmentSalesReminder = async (
  bookingId: string, 
  index: number, 
  salesUser: { uid: string, name: string }
) => {
  const planRef = doc(db, 'installment_plans', bookingId);
  await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Plan not found");
    const plan = planSnap.data() as InstallmentPlan;
    const installments = [...plan.installments];
    
    if (installments[index]) {
      if (installments[index].remindedBySales) {
        delete (installments[index] as any).remindedBySales;
      } else {
        installments[index].remindedBySales = {
          uid: salesUser.uid,
          name: salesUser.name,
          timestamp: new Date().toISOString()
        };
      }
      transaction.update(planRef, { installments });
    }
  });
};

export const toggleInstallmentSupervisorVerification = async (
  bookingId: string, 
  index: number, 
  supervisorUser: { uid: string, name: string }
) => {
  const planRef = doc(db, 'installment_plans', bookingId);
  await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Plan not found");
    const plan = planSnap.data() as InstallmentPlan;
    const installments = [...plan.installments];
    
    if (installments[index]) {
      if (installments[index].verifiedBySupervisor) {
        delete (installments[index] as any).verifiedBySupervisor;
      } else {
        installments[index].verifiedBySupervisor = {
          uid: supervisorUser.uid,
          name: supervisorUser.name,
          timestamp: new Date().toISOString()
        };
      }
      transaction.update(planRef, { installments });
    }
  });
};

export const addInstallmentNote = async (
  bookingId: string,
  index: number,
  note: { text: string, uid: string, name: string }
) => {
  return await runTransaction(db, async (transaction) => {
    const planRef = doc(db, 'installment_plans', bookingId);
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Plan not found");
    const plan = planSnap.data() as InstallmentPlan;
    const installments = [...plan.installments];
    
    if (installments[index]) {
      if (!installments[index].notes) installments[index].notes = [];
      installments[index].notes!.push({
        text: note.text,
        addedBy: note.uid,
        addedByName: note.name,
        timestamp: getCorrectISOString()
      });
      transaction.update(planRef, { installments });
    }
  });
};

export const getPromoCodes = async (): Promise<PromoCode[]> => {
  try {
    const q = query(collection(db, 'promo_codes'));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(item => item.isDeleted !== true) as PromoCode[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'promo_codes');
    throw error;
  }
};

export const createPromoCode = async (data: Omit<PromoCode, 'id' | 'useCount'>) => {
  try {
    const codeId = data.code.toUpperCase().trim();
    const docRef = doc(db, 'promo_codes', codeId);
    
    // Check if it already exists (including deleted ones)
    const snap = await getDoc(docRef);
    if (snap.exists() && !snap.data().isDeleted) {
      throw new Error(`Promo code "${codeId}" already exists.`);
    }

    const newPromo = {
      ...data,
      code: codeId,
      useCount: 0,
      isDeleted: false
    };
    
    await setDoc(docRef, newPromo);
    return codeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `promo_codes`);
    throw error;
  }
};

export const updatePromoCode = async (id: string, data: Partial<PromoCode>) => {
  try {
    const docRef = doc(db, 'promo_codes', id);
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promo_codes/${id}`);
    throw error;
  }
};

export const deletePromoCode = async (id: string) => {
  try {
    const docRef = doc(db, 'promo_codes', id);
    await updateDoc(docRef, { isDeleted: true, isActive: false, deletedAt: new Date().toISOString() });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `promo_codes/${id}`);
    throw error;
  }
};

// ===============================================================
// Booking Confirmation Portal Forms & Submissions
// ===============================================================

export const DEFAULT_BOOKING_FORM_TEMPLATE: BookingFormTemplate = {
  id: 'default',
  title: 'فورم تأكيد بيانات الحجز - أكاديمية SGCA',
  description: 'برجاء مراجعة وتأكيد كافة بياناتك بدقة لإتمام إجراءات التسجيل واستخراج الشهادة بالاسم الصحيح.',
  termsLink: 'https://drive.google.com/file/d/1SjJEb-aIGrLDjJvknn5MZ0ATiisNEXWe/view?usp=sharing',
  termsText: 'بيتم إرسال الشروط والأحكام الخاصة بالتعاقد مع لينك الفورم .. ارجع للواتس أب وتأكد أنك قرأتها بالكامل.',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  fields: [
    { id: 'f1', label: 'الاسم رباعي', type: 'text', placeholder: 'مثال: محمد أحمد علي محمود', required: true, systemKey: 'name', enabled: true },
    { id: 'f2', label: 'رقم الموبايل', type: 'tel', placeholder: 'مثال: 01012345678', required: true, systemKey: 'phone', enabled: true },
    { id: 'f3', label: 'رقم الواتس أب اللي حجزنا من خلاله', type: 'tel', placeholder: 'مثال: +201012345678 أو +966501234567', required: true, systemKey: 'whatsapp', helpText: 'برجاء كتابة كود الدولة لو خارج مصر', enabled: true },
    { id: 'f3_email', label: 'إيميل الجيميل (Gmail) لحضور المحاضرات', type: 'text', placeholder: 'مثال: example@gmail.com', required: true, systemKey: 'email', helpText: 'سيتم استخدام هذا البريد لمنحك صلاحيات مشاهدة محاضرات ومواد الكورس على Google Drive / Zoom', enabled: true },
    { id: 'f4', label: 'الاسم باللغة الانجليزية', type: 'text', placeholder: 'مثال: Mohamed Ahmed Ali', required: true, systemKey: 'englishName', helpText: 'بنفس الطريقة اللي حابب تستلم الشهادة بيها', enabled: true },
    { id: 'f5', label: 'الحجز لأي كورس', type: 'select', required: true, systemKey: 'selectedProduct', enabled: true },
    { id: 'f6', label: 'درست البرامج قبل كده ولا لأ', type: 'radio', options: ['نعم', 'لا'], required: true, systemKey: 'studiedSoftware', enabled: true },
    { id: 'f7', label: 'طريقة الحضور', type: 'radio', options: ['أونلاين', 'أوفلاين بالمقر'], required: true, systemKey: 'attendanceMethod', enabled: true },
    { id: 'f8', label: 'المبلغ المدفوع أثناء الحجز', type: 'number', placeholder: 'المبلغ بالجنيه أو بالعملة الأجنبية', required: true, systemKey: 'paidAmount', enabled: true },
    { id: 'f9', label: 'الرقم اللي حولنا منه مبلغ الحجز', type: 'text', placeholder: 'رقم المحفظة / الحساب / تم الحجز من المقر', required: true, systemKey: 'transferSenderNumber', helpText: 'لو حجزت من المقر - دفعت كاش - اكتب "تم الحجز من المقر"', enabled: true },
    { id: 'f10', label: 'حجزت من خلال (وسيلة الدفع)', type: 'select', options: ['فودافون كاش', 'إنستا باي', 'تحويل بنكي', 'باي بال', 'نقداً بالمقر', 'اتصالات كاش', 'أخرى'], required: true, systemKey: 'paymentMethod', enabled: true },
    { id: 'f11', label: 'قرأت الشروط والأحكام الخاصة بالتعاقد (حجز الكورس)', type: 'terms', required: true, systemKey: 'termsAgreed', enabled: true }
  ]
};

export const getBookingFormTemplate = async (formId: string = 'default'): Promise<BookingFormTemplate> => {
  try {
    const docRef = doc(db, 'booking_forms', formId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as BookingFormTemplate;
    }
    return DEFAULT_BOOKING_FORM_TEMPLATE;
  } catch (error) {
    console.warn('Could not load template from firestore, using default:', error);
    return DEFAULT_BOOKING_FORM_TEMPLATE;
  }
};

export const saveBookingFormTemplate = async (template: BookingFormTemplate): Promise<void> => {
  try {
    const docRef = doc(db, 'booking_forms', template.id || 'default');
    const updated = {
      ...template,
      updatedAt: new Date().toISOString()
    };
    await setDoc(docRef, cleanData(updated));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `booking_forms/${template.id}`);
    throw error;
  }
};

export const createBookingFormSubmission = async (
  data: Omit<BookingFormSubmission, 'id' | 'submittedAt' | 'status'>
): Promise<string> => {
  try {
    const newSubmission = {
      ...data,
      submittedAt: new Date().toISOString(),
      status: 'new' as const,
      isDeleted: false
    };
    const ref = await addDoc(collection(db, 'booking_form_submissions'), cleanData(newSubmission));
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'booking_form_submissions');
    throw error;
  }
};

export const getBookingFormSubmissions = async (lastHours: number = 48): Promise<BookingFormSubmission[]> => {
  try {
    const cutoffDate = new Date(Date.now() - (lastHours * 60 * 60 * 1000)).toISOString();
    const q = query(
      collection(db, 'booking_form_submissions'),
      where('submittedAt', '>=', cutoffDate),
      orderBy('submittedAt', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BookingFormSubmission))
      .filter(s => !(s as any).isDeleted);
  } catch (error) {
    console.error('Error fetching booking form submissions:', error);
    // Fallback without cutoff if index or property fails
    try {
      const fallbackQ = query(collection(db, 'booking_form_submissions'), orderBy('submittedAt', 'desc'), limit(50));
      const snap = await getDocs(fallbackQ);
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BookingFormSubmission))
        .filter(s => !(s as any).isDeleted);
    } catch (e) {
      return [];
    }
  }
};

export const searchBookingFormSubmissions = async (rawQuery: string): Promise<BookingFormSubmission[]> => {
  if (!rawQuery.trim()) return [];
  const qStr = rawQuery.trim();
  const phoneQuery = qStr.replace(/\D/g, '');

  const matchedSubmissions = new Map<string, BookingFormSubmission>();

  try {
    const queries = [];
    if (phoneQuery.length >= 3) {
      queries.push(query(collection(db, 'booking_form_submissions'), where('phone', '==', qStr), limit(20)));
      queries.push(query(collection(db, 'booking_form_submissions'), where('whatsapp', '==', qStr), limit(20)));
      if (phoneQuery !== qStr) {
        queries.push(query(collection(db, 'booking_form_submissions'), where('phone', '==', phoneQuery), limit(20)));
        queries.push(query(collection(db, 'booking_form_submissions'), where('whatsapp', '==', phoneQuery), limit(20)));
      }
    } else {
      queries.push(query(collection(db, 'booking_form_submissions'), where('customerName', '>=', qStr), where('customerName', '<=', qStr + '\uf8ff'), limit(20)));
    }

    const snaps = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
    snaps.forEach(snap => {
      if (snap) {
        snap.docs.forEach(doc => {
          const sub = { id: doc.id, ...doc.data() } as BookingFormSubmission;
          if (!(sub as any).isDeleted) {
            matchedSubmissions.set(sub.id, sub);
          }
        });
      }
    });

    // Fallback scan recent submissions if direct queries yielded no results
    if (matchedSubmissions.size === 0) {
      const fallbackSnap = await getDocs(query(collection(db, 'booking_form_submissions'), orderBy('submittedAt', 'desc'), limit(150))).catch(() => null);
      if (fallbackSnap) {
        const normQ = qStr.toLowerCase();
        fallbackSnap.docs.forEach(doc => {
          const sub = { id: doc.id, ...doc.data() } as BookingFormSubmission;
          if (!(sub as any).isDeleted) {
            if (
              sub.customerName?.toLowerCase().includes(normQ) ||
              sub.phone?.includes(qStr) ||
              sub.whatsapp?.includes(qStr) ||
              sub.englishName?.toLowerCase().includes(normQ) ||
              sub.productName?.toLowerCase().includes(normQ)
            ) {
              matchedSubmissions.set(sub.id, sub);
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Error searching booking form submissions:', err);
  }

  return Array.from(matchedSubmissions.values());
};

export const updateBookingFormSubmissionStatus = async (
  id: string,
  status: 'new' | 'imported' | 'archived',
  importedBookingId?: string,
  importedBy?: string
): Promise<void> => {
  try {
    const docRef = doc(db, 'booking_form_submissions', id);
    const updates: any = { status };
    if (status === 'imported') {
      updates.importedAt = new Date().toISOString();
      if (importedBookingId) updates.importedBookingId = importedBookingId;
      if (importedBy) updates.importedBy = importedBy;
    }
    await updateDoc(docRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `booking_form_submissions/${id}`);
    throw error;
  }
};

export const deleteBookingFormSubmission = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, 'booking_form_submissions', id);
    await updateDoc(docRef, { isDeleted: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `booking_form_submissions/${id}`);
    throw error;
  }
};

export interface PriceAuditResult {
  bookingId: string;
  customerName: string;
  productName: string;
  bookingDate: string;
  oldBasePriceSnapshot: number;
  newCorrectBasePrice: number;
  oldRemaining: number;
  newRemaining: number;
  installmentsAdjusted: boolean;
}

export const reconcileInstallmentsForBooking = async (bookingId: string): Promise<boolean> => {
  try {
    const bookingDoc = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingDoc.exists()) return false;
    const booking = { id: bookingDoc.id, ...bookingDoc.data() } as Booking;
    if (booking.isDeleted) return false;

    // Get all valid payments for this booking
    const paySnap = await getDocs(query(collection(db, 'payments'), where('bookingId', '==', bookingId)));
    const payments = paySnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)).filter(p => !p.isDeleted && !p.isReversed);
    const paidTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Get refunds
    const refSnap = await getDocs(query(collection(db, 'refunds'), where('bookingId', '==', bookingId)));
    const refunds = refSnap.docs.map(d => ({ id: d.id, ...d.data() } as Refund)).filter(r => !r.isDeleted && !r.isReversed);
    const refundedTotal = refunds.reduce((sum, r) => sum + (r.refundAmount || 0), 0);

    const netPaid = Math.max(0, paidTotal - refundedTotal);
    const finalPrice = booking.pricing?.finalPriceSnapshot ?? (netPaid + (booking.paymentSummary?.remaining || 0));
    const newRemaining = Math.max(0, finalPrice - netPaid);

    // Fetch Plan
    const planDoc = await getDoc(doc(db, 'installment_plans', bookingId));
    let nextDueDate: string | null = null;

    if (planDoc.exists()) {
      const plan = planDoc.data() as InstallmentPlan;
      if (plan.installments && plan.installments.length > 0) {
        let cumulativePaid = netPaid - (plan.deposit || 0);
        const updatedInstallments = plan.installments.map(inst => {
          if (cumulativePaid >= inst.amount && inst.amount > 0) {
            cumulativePaid -= inst.amount;
            return { ...inst, status: 'paid' as const };
          } else if (cumulativePaid > 0) {
            // Partially covered, but kept pending with updated balance
            cumulativePaid = 0;
            return { ...inst, status: inst.status === 'paid' ? ('pending' as const) : inst.status };
          } else {
            return { ...inst, status: inst.status === 'paid' && newRemaining > 0 ? ('pending' as const) : inst.status };
          }
        });

        // Find next due date
        const pendingInst = updatedInstallments.find(i => i.status === 'pending' || i.status === 'delayed');
        nextDueDate = pendingInst ? pendingInst.dueDate : null;

        await updateDoc(doc(db, 'installment_plans', bookingId), {
          installments: updatedInstallments
        });
      }
    }

    // Update Booking Payment Summary
    await updateDoc(doc(db, 'bookings', bookingId), {
      'paymentSummary.paidTotal': netPaid,
      'paymentSummary.remaining': newRemaining,
      'paymentSummary.next_due_date': nextDueDate,
      'whatsappStatus.eligible': (finalPrice - netPaid) <= (finalPrice * 0.5)
    });

    return true;
  } catch (error) {
    console.error(`Error reconciling booking ${bookingId}:`, error);
    return false;
  }
};

export const autoReconcileAllInstallmentPlans = async (): Promise<{ totalChecked: number; reconciledCount: number }> => {
  try {
    const bSnap = await getDocs(query(collection(db, 'bookings'), where('isDeleted', '==', false)));
    const activeBookings = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)).filter(b => b.status === 'ACTIVE');

    let reconciledCount = 0;
    for (const b of activeBookings) {
      const success = await reconcileInstallmentsForBooking(b.id);
      if (success) reconciledCount++;
    }

    return { totalChecked: activeBookings.length, reconciledCount };
  } catch (error) {
    console.error("Error in autoReconcileAllInstallmentPlans:", error);
    return { totalChecked: 0, reconciledCount: 0 };
  }
};

export const auditAndEnforceHistoricalBookingPrices = async (params: {
  productId?: string;
  cutoffDate?: string;
  historicalBasePrice?: number;
  dryRun: boolean;
  performedBy?: { name: string; email: string; uid?: string };
}): Promise<{ scannedCount: number; adjustedCount: number; results: PriceAuditResult[] }> => {
  try {
    const [courses, diplomas, bookingsSnap, customers] = await Promise.all([
      genericGet<Course>('catalog_courses'),
      genericGet<Diploma>('catalog_diplomas'),
      getDocs(query(collection(db, 'bookings'), where('isDeleted', '==', false))),
      genericGet<Customer>('customers')
    ]);

    const products = [...courses, ...diplomas];
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const productMap = new Map(products.map(p => [p.id, p]));

    const allBookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)).filter(b => b.status === 'ACTIVE');

    const cutoff = params.cutoffDate || new Date().toISOString().split('T')[0];
    const results: PriceAuditResult[] = [];
    let adjustedCount = 0;

    for (const b of allBookings) {
      if (params.productId && b.productId !== params.productId) continue;
      const bDate = b.bookingDate ? b.bookingDate.split('T')[0] : '';
      if (!bDate || bDate >= cutoff) continue; // Only historical bookings before cutoff date

      const prod = productMap.get(b.productId);
      if (!prod) continue;

      const cust = customerMap.get(b.customerId);
      const custName = cust?.name || 'Unknown Student';

      let targetHistoricalPrice = params.historicalBasePrice && params.historicalBasePrice > 0 ? params.historicalBasePrice : 0;
      if (!targetHistoricalPrice) {
        // Look up historical price from course priceHistory
        if (prod.priceHistory && prod.priceHistory.length > 0) {
          const sorted = [...prod.priceHistory].sort((x, y) => (x.effectiveFrom || '').localeCompare(y.effectiveFrom || ''));
          for (let i = sorted.length - 1; i >= 0; i--) {
            if (bDate >= sorted[i].effectiveFrom) {
              targetHistoricalPrice = sorted[i].price;
              break;
            }
          }
          if (!targetHistoricalPrice && sorted.length > 0) targetHistoricalPrice = sorted[0].price;
        }
      }

      if (!targetHistoricalPrice) continue;

      const currentBasePriceSnapshot = b.pricing?.basePriceSnapshot || 0;
      if (currentBasePriceSnapshot !== targetHistoricalPrice) {
        const oldRemaining = b.paymentSummary?.remaining || 0;
        const paidTotal = b.paymentSummary?.paidTotal || 0;

        // Recalculate savings & final price with historical base price
        const offerDiscount = (b.pricing?.appliedOffer?.isApplied && b.pricing?.appliedOffer?.offerPrice) 
          ? Math.max(0, targetHistoricalPrice - b.pricing.appliedOffer.offerPrice) 
          : 0;
        const promoDiscount = b.pricing?.appliedPromoCode?.discountAmount || 0;
        const extraDiscount = b.pricing?.extraDiscountSnapshot || 0;

        const newFinalPrice = b.pricing?.isScholarship ? 0 : Math.max(0, targetHistoricalPrice - offerDiscount - promoDiscount - extraDiscount);
        const newRemaining = Math.max(0, newFinalPrice - paidTotal);

        results.push({
          bookingId: b.id,
          customerName: custName,
          productName: prod.name,
          bookingDate: bDate,
          oldBasePriceSnapshot: currentBasePriceSnapshot,
          newCorrectBasePrice: targetHistoricalPrice,
          oldRemaining,
          newRemaining,
          installmentsAdjusted: !params.dryRun
        });

        if (!params.dryRun) {
          await updateDoc(doc(db, 'bookings', b.id), {
            'pricing.basePriceSnapshot': targetHistoricalPrice,
            'pricing.savingsSnapshot': offerDiscount,
            'pricing.finalPriceSnapshot': newFinalPrice,
            'paymentSummary.remaining': newRemaining
          });

          // Reconcile installments
          await reconcileInstallmentsForBooking(b.id);
          adjustedCount++;
        }
      }
    }

    if (!params.dryRun && adjustedCount > 0 && params.performedBy) {
      await logActivity({
        userId: params.performedBy.uid || 'admin',
        userName: params.performedBy.name,
        userEmail: params.performedBy.email,
        action: 'AUDIT_HISTORICAL_PRICES',
        section: 'Catalog',
        details: `Audited and enforced historical prices on ${adjustedCount} bookings registered before ${cutoff}.`,
        timestamp: new Date().toISOString()
      });
    }

    return {
      scannedCount: allBookings.length,
      adjustedCount: params.dryRun ? results.length : adjustedCount,
      results
    };
  } catch (error) {
    console.error("Error in auditAndEnforceHistoricalBookingPrices:", error);
    throw error;
  }
};
