import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericGetQuery, genericGetDoc } from '../services/firestore';
import { 
  Customer, Booking, Payment, InstallmentPlan, SalesStaff, 
  BookingLog, Complaint, BookingFormSubmission 
} from '../types';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../firebase';

// Smart Arabic Normalization Helper
export const normalizeArabic = (text: string | null | undefined): string => {
  if (!text) return '';
  let str = text.toString().trim().toLowerCase();
  // Remove diacritics / Harakat
  str = str.replace(/[\u064B-\u0652\u0670]/g, '');
  // Remove Tatweel
  str = str.replace(/ـ/g, '');
  // Normalize all Alef variants (أ, إ, آ, ٱ, ٲ, ٳ, ٵ) to standard Alef 'ا'
  str = str.replace(/[أإآٱٲٳٵ]/g, 'ا');
  // Normalize Yaa / Alef Maqsoora
  str = str.replace(/ى/g, 'ي');
  // Normalize Taa Marboota
  str = str.replace(/ة/g, 'ه');
  // Normalize Hamza variants
  str = str.replace(/ؤ/g, 'و');
  str = str.replace(/ئ/g, 'ي');
  str = str.replace(/ء/g, '');
  // Collapse whitespace
  str = str.replace(/\s+/g, ' ');
  return str;
};

// Normalize Digits Helper (Phone numbers)
const normalizeDigits = (phone: string | null | undefined): string => {
  if (!phone) return '';
  let digits = phone.toString().replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length >= 11) {
    digits = '0' + digits.substring(2);
  }
  return digits;
};

const StudentSearch: React.FC = () => {
  const { lang, t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [searchParams, setSearchParams] = useSearchParams();

  // Primary Collections Data (Populated on demand via targeted search)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [bookingLogs, setBookingLogs] = useState<BookingLog[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<BookingFormSubmission[]>([]);

  // Search State
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(searchParams.get('id') || null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Customer Notes State
  const [customerNotes, setCustomerNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Active Tab for Student Details View
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'payments' | 'installments' | 'form' | 'logs' | 'notes' | 'complaints'>('overview');

  // Print Modal State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Copy Link Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch Single Customer Details on Demand
  const fetchSingleCustomerDetails = async (cId: string) => {
    setLoading(true);
    try {
      const cust = await genericGetDoc<Customer>('customers', cId);
      if (cust) {
        setCustomers([cust]);
        setSelectedCustomerId(cust.id);

        const bSnap = await getDocs(query(collection(db, 'bookings'), where('customerId', '==', cId)));
        const fetchedBookings = bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)).filter(b => !b.isDeleted);
        setBookings(fetchedBookings);

        const pSnap = await getDocs(query(collection(db, 'payments'), where('customerId', '==', cId)));
        const fetchedPayments = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)).filter(p => !p.isDeleted);
        setPayments(fetchedPayments);

        const bIds = fetchedBookings.map(b => b.id);
        if (bIds.length > 0) {
          const plans = await Promise.all(bIds.map(bId => genericGetDoc<InstallmentPlan>('installment_plans', bId)));
          setInstallmentPlans(plans.filter((p): p is InstallmentPlan => p !== null));

          const logSnaps = await Promise.all(bIds.map(bId => getDocs(query(collection(db, 'booking_logs'), where('bookingId', '==', bId)))));
          const fetchedLogs: BookingLog[] = [];
          logSnaps.forEach(snap => snap.docs.forEach(d => fetchedLogs.push({ id: d.id, ...d.data() } as BookingLog)));
          setBookingLogs(fetchedLogs);
        }

        const compSnap = await getDocs(query(collection(db, 'complaints'), where('customerId', '==', cId)));
        setComplaints(compSnap.docs.map(d => ({ id: d.id, ...d.data() } as Complaint)));

        const phoneDigs = normalizeDigits(cust.phone || cust.whatsapp);
        if (phoneDigs.length >= 3) {
          const formSnap = await getDocs(query(collection(db, 'booking_form_submissions'), where('phone', '==', phoneDigs)));
          setFormSubmissions(formSnap.docs.map(d => ({ id: d.id, ...d.data() } as BookingFormSubmission)));
        }
      }
    } catch (e) {
      console.error('Error fetching single customer:', e);
    } finally {
      setLoading(false);
    }
  };

  // TARGETED DIRECT SEARCH (Minimizes Firestore Reads)
  const handleSearch = async (overrideQuery?: string) => {
    const qStr = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    if (!qStr) {
      setCustomers([]);
      setBookings([]);
      setPayments([]);
      setInstallmentPlans([]);
      setBookingLogs([]);
      setComplaints([]);
      setFormSubmissions([]);
      setHasSearched(false);
      setSelectedCustomerId(null);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setSelectedCustomerId(null);

    try {
      const rawQuery = qStr;
      const normQuery = normalizeArabic(rawQuery);
      const phoneQuery = normalizeDigits(rawQuery);

      const candidateCustomerMap = new Map<string, Customer>();

      // 1. Direct Customer ID lookup
      try {
        const custDoc = await genericGetDoc<Customer>('customers', rawQuery);
        if (custDoc && !custDoc.isDeleted) {
          candidateCustomerMap.set(custDoc.id, custDoc);
        }
      } catch (e) {}

      // 2. Phone / WhatsApp targeted queries
      if (phoneQuery.length >= 3) {
        const phoneQueries = [
          query(collection(db, 'customers'), where('phone', '==', rawQuery), limit(20)),
          query(collection(db, 'customers'), where('whatsapp', '==', rawQuery), limit(20)),
          query(collection(db, 'customers'), where('fullWhatsapp', '==', rawQuery), limit(20))
        ];
        if (phoneQuery !== rawQuery) {
          phoneQueries.push(
            query(collection(db, 'customers'), where('phone', '==', phoneQuery), limit(20)),
            query(collection(db, 'customers'), where('whatsapp', '==', phoneQuery), limit(20)),
            query(collection(db, 'customers'), where('fullWhatsapp', '==', phoneQuery), limit(20))
          );
        }

        const phoneSnaps = await Promise.all(phoneQueries.map(q => getDocs(q).catch(() => null)));
        phoneSnaps.forEach(snap => {
          if (snap) {
            snap.docs.forEach(doc => {
              const data = { id: doc.id, ...doc.data() } as Customer;
              if (!data.isDeleted) candidateCustomerMap.set(data.id, data);
            });
          }
        });
      }

      // 3. Name & Email targeted queries
      if (normQuery.length >= 1) {
        const nameQueries = [
          query(collection(db, 'customers'), where('email', '==', rawQuery.toLowerCase()), limit(20)),
          query(collection(db, 'customers'), where('name', '>=', rawQuery), where('name', '<=', rawQuery + '\uf8ff'), limit(30)),
          query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(150)) // Fallback scan for recent active students
        ];

        const nameSnaps = await Promise.all(nameQueries.map(q => getDocs(q).catch(() => null)));
        nameSnaps.forEach(snap => {
          if (!snap) return;
          snap.docs.forEach(doc => {
            const data = { id: doc.id, ...doc.data() } as Customer;
            if (!data.isDeleted) {
              const custNormName = normalizeArabic(data.name);
              const custNormEmail = normalizeArabic(data.email);
              if (
                data.id === rawQuery ||
                (custNormName && custNormName.includes(normQuery)) ||
                (custNormEmail && custNormEmail.includes(normQuery)) ||
                (data.name && data.name.includes(rawQuery))
              ) {
                candidateCustomerMap.set(data.id, data);
              }
            }
          });
        });
      }

      // 4. Receipt Number lookup in payments
      if (rawQuery.length >= 2) {
        const payQ = query(collection(db, 'payments'), where('receiptNumber', '==', rawQuery), limit(10));
        const paySnap = await getDocs(payQ).catch(() => null);
        if (paySnap && !paySnap.empty) {
          for (const pDoc of paySnap.docs) {
            const pData = pDoc.data() as Payment;
            if (pData.customerId && !candidateCustomerMap.has(pData.customerId)) {
              const c = await genericGetDoc<Customer>('customers', pData.customerId);
              if (c && !c.isDeleted) candidateCustomerMap.set(c.id, c);
            }
          }
        }
      }

      // 5. Booking ID lookup
      if (rawQuery.length >= 2) {
        const bDoc = await genericGetDoc<Booking>('bookings', rawQuery);
        if (bDoc && bDoc.customerId && !candidateCustomerMap.has(bDoc.customerId)) {
          const c = await genericGetDoc<Customer>('customers', bDoc.customerId);
          if (c && !c.isDeleted) candidateCustomerMap.set(c.id, c);
        }
      }

      // 6. Form Submissions lookup
      if (phoneQuery.length >= 3) {
        const formQ1 = query(collection(db, 'booking_form_submissions'), where('phone', '==', phoneQuery), limit(10));
        const formQ2 = query(collection(db, 'booking_form_submissions'), where('whatsapp', '==', phoneQuery), limit(10));
        const [formSnap1, formSnap2] = await Promise.all([getDocs(formQ1).catch(() => null), getDocs(formQ2).catch(() => null)]);

        const matchedFormSubs: BookingFormSubmission[] = [];
        if (formSnap1) formSnap1.docs.forEach(d => matchedFormSubs.push({ id: d.id, ...d.data() } as BookingFormSubmission));
        if (formSnap2) formSnap2.docs.forEach(d => matchedFormSubs.push({ id: d.id, ...d.data() } as BookingFormSubmission));
        setFormSubmissions(matchedFormSubs);
      }

      let candidateCustomers = Array.from(candidateCustomerMap.values());

      // Permission check for sales staff roles
      if (!hasPermission('viewAllBookings')) {
        const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);
        if (linkedStaff) {
          const allowedCustIds = new Set<string>();
          for (const cust of candidateCustomers) {
            const bSnap = await getDocs(query(collection(db, 'bookings'), where('customerId', '==', cust.id)));
            const custBookings = bSnap.docs.map(d => d.data() as Booking);
            if (custBookings.some(b => b.salesId === linkedStaff.id)) {
              allowedCustIds.add(cust.id);
            }
          }
          candidateCustomers = candidateCustomers.filter(c => allowedCustIds.has(c.id));
        } else {
          candidateCustomers = [];
        }
      }

      setCustomers(candidateCustomers);

      // Fetch bookings, payments, installment plans, logs, complaints ONLY for candidate customer IDs!
      const candidateCustIds = candidateCustomers.map(c => c.id);
      if (candidateCustIds.length > 0) {
        // Fetch Bookings
        const bookingFetches = candidateCustIds.map(cId =>
          getDocs(query(collection(db, 'bookings'), where('customerId', '==', cId)))
        );
        const bookingSnaps = await Promise.all(bookingFetches);
        const fetchedBookings: Booking[] = [];
        bookingSnaps.forEach(snap => {
          snap.docs.forEach(doc => {
            const b = { id: doc.id, ...doc.data() } as Booking;
            if (!b.isDeleted) fetchedBookings.push(b);
          });
        });
        setBookings(fetchedBookings);

        const fetchedBookingIds = fetchedBookings.map(b => b.id);

        // Fetch Payments
        const paymentFetches = candidateCustIds.map(cId =>
          getDocs(query(collection(db, 'payments'), where('customerId', '==', cId)))
        );
        const paymentSnaps = await Promise.all(paymentFetches);
        const fetchedPayments: Payment[] = [];
        paymentSnaps.forEach(snap => {
          snap.docs.forEach(doc => {
            const p = { id: doc.id, ...doc.data() } as Payment;
            if (!p.isDeleted) fetchedPayments.push(p);
          });
        });
        setPayments(fetchedPayments);

        // Fetch Installment Plans
        if (fetchedBookingIds.length > 0) {
          const planFetches = fetchedBookingIds.map(bId =>
            genericGetDoc<InstallmentPlan>('installment_plans', bId)
          );
          const planResults = await Promise.all(planFetches);
          setInstallmentPlans(planResults.filter((p): p is InstallmentPlan => p !== null));

          // Fetch Booking Logs
          const logFetches = fetchedBookingIds.map(bId =>
            getDocs(query(collection(db, 'booking_logs'), where('bookingId', '==', bId)))
          );
          const logSnaps = await Promise.all(logFetches);
          const fetchedLogs: BookingLog[] = [];
          logSnaps.forEach(snap => {
            snap.docs.forEach(doc => {
              fetchedLogs.push({ id: doc.id, ...doc.data() } as BookingLog);
            });
          });
          setBookingLogs(fetchedLogs);
        }

        // Fetch Complaints
        const complaintFetches = candidateCustIds.map(cId =>
          getDocs(query(collection(db, 'complaints'), where('customerId', '==', cId)))
        );
        const complaintSnaps = await Promise.all(complaintFetches);
        const fetchedComplaints: Complaint[] = [];
        complaintSnaps.forEach(snap => {
          snap.docs.forEach(doc => {
            fetchedComplaints.push({ id: doc.id, ...doc.data() } as Complaint);
          });
        });
        setComplaints(fetchedComplaints);

        // Auto select if exactly 1 customer found
        if (candidateCustomers.length === 1) {
          setSelectedCustomerId(candidateCustomers[0].id);
        }
      }
    } catch (err) {
      console.error('Error during targeted search:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch sales staff reference once
    genericGet<SalesStaff>('sales_staff').then(s => setSalesStaff(s)).catch(() => {});

    const initId = searchParams.get('id');
    const initQ = searchParams.get('q');

    if (initId) {
      fetchSingleCustomerDetails(initId);
    } else if (initQ) {
      handleSearch(initQ);
    }
  }, []);

  // Fetch Notes for Selected Customer
  const fetchCustomerNotes = async (cId: string) => {
    try {
      const notesRef = collection(db, 'customer_notes');
      const q = query(notesRef, where('customerId', '==', cId), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      setCustomerNotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error('Error fetching customer notes:', e);
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerNotes(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  // Handle Adding Note
  const handleAddNote = async () => {
    if (!selectedCustomerId || !newNoteText.trim() || !userProfile) return;
    setAddingNote(true);
    try {
      const notesRef = collection(db, 'customer_notes');
      await addDoc(notesRef, {
        customerId: selectedCustomerId,
        text: newNoteText.trim(),
        uid: userProfile.uid,
        name: userProfile.displayName || userProfile.email || 'Admin',
        timestamp: serverTimestamp()
      });
      setNewNoteText('');
      await fetchCustomerNotes(selectedCustomerId);
      showToast('تمت إضافة الملاحظة بنجاح');
    } catch (e) {
      console.error('Error adding note:', e);
      alert('حدث خطأ أثناء حفظ الملاحظة');
    } finally {
      setAddingNote(false);
    }
  };

  // SMART SEARCH RESULTS (Populated on demand)
  const searchResults = customers;

  // Selected Customer Entity
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Selected Customer Connected Data
  const selectedCustomerBookings = useMemo(() => {
    if (!selectedCustomerId) return [];
    return bookings.filter(b => b.customerId === selectedCustomerId);
  }, [bookings, selectedCustomerId]);

  const selectedCustomerBookingIds = useMemo(() => {
    return new Set(selectedCustomerBookings.map(b => b.id));
  }, [selectedCustomerBookings]);

  const selectedCustomerPayments = useMemo(() => {
    if (!selectedCustomerId) return [];
    return payments
      .filter(p => p.customerId === selectedCustomerId || selectedCustomerBookingIds.has(p.bookingId))
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [payments, selectedCustomerId, selectedCustomerBookingIds]);

  const selectedCustomerInstallmentPlans = useMemo(() => {
    if (selectedCustomerBookings.length === 0) return [];
    return installmentPlans.filter(ip => selectedCustomerBookingIds.has(ip.bookingId));
  }, [installmentPlans, selectedCustomerBookingIds, selectedCustomerBookings]);

  const selectedCustomerLogs = useMemo(() => {
    if (selectedCustomerBookings.length === 0) return [];
    return bookingLogs
      .filter(l => selectedCustomerBookingIds.has(l.bookingId))
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [bookingLogs, selectedCustomerBookingIds, selectedCustomerBookings]);

  const selectedCustomerComplaints = useMemo(() => {
    if (!selectedCustomer) return [];
    return complaints.filter(c => 
      c.customerId === selectedCustomer.id || 
      normalizeArabic(c.customerName) === normalizeArabic(selectedCustomer.name)
    );
  }, [complaints, selectedCustomer]);

  const selectedCustomerFormSubmission = useMemo(() => {
    if (!selectedCustomer) return null;
    const phoneDigs = normalizeDigits(selectedCustomer.phone || selectedCustomer.whatsapp);
    return formSubmissions.find(f => 
      (f.phone && normalizeDigits(f.phone) === phoneDigs) ||
      (f.whatsapp && normalizeDigits(f.whatsapp) === phoneDigs) ||
      normalizeArabic(f.customerName) === normalizeArabic(selectedCustomer.name)
    ) || null;
  }, [formSubmissions, selectedCustomer]);

  // Financial Stats Calculation
  const financialSummary = useMemo(() => {
    let totalCourseValue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    selectedCustomerBookings.forEach(b => {
      const price = b.pricing?.finalPriceSnapshot || (b.paymentSummary?.paidTotal || 0) + (b.paymentSummary?.remaining || 0);
      const paid = b.paymentSummary?.paidTotal || 0;
      const rem = b.paymentSummary?.remaining || 0;

      if (b.status === 'ACTIVE') {
        totalCourseValue += price;
        totalPaid += paid;
        totalRemaining += rem;
      }
    });

    return { totalCourseValue, totalPaid, totalRemaining };
  }, [selectedCustomerBookings]);

  // Primary Sales Staff for Selected Customer
  const customerSalesRep = useMemo(() => {
    if (!selectedCustomer) return 'غير محدد';
    if (selectedCustomer.salesId) {
      const found = salesStaff.find(s => s.id === selectedCustomer.salesId);
      if (found) return found.name;
    }
    const firstBooking = selectedCustomerBookings[0];
    if (firstBooking) return firstBooking.salesName || 'غير محدد';
    return 'غير محدد';
  }, [selectedCustomer, salesStaff, selectedCustomerBookings]);

  // Select Customer & Update URL
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setSearchParams({ id: cust.id, q: searchQuery });
  };

  // Copy Direct Link
  const handleCopyDirectLink = () => {
    if (!selectedCustomer) return;
    const url = `${window.location.origin}${window.location.pathname}#/student-search?id=${selectedCustomer.id}`;
    navigator.clipboard.writeText(url);
    showToast('تم نسخ رابط ملف الطالب للشاربورد');
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white font-bold px-6 py-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center gap-2 animate-bounce">
          <i className="fas fa-check-circle text-emerald-400"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <div className="bg-gradient-to-r from-primary-900 via-slate-900 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden border border-primary-800/40">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-primary-500/20 text-primary-300 border border-primary-500/30 mb-2">
                <i className="fas fa-microchip"></i>
                <span>محرك الاستعلام الذكي الموحد</span>
              </span>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                <i className="fas fa-magnifying-glass-chart text-primary-400"></i>
                <span>استعلام كامل عن عميل / طالب</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-300 font-semibold mt-1">
                ابحث بأي طريقة (بالاسم الذكي، أرقام الهاتف، البريد، الكود، رقم الوصل) للوصول لكافة تفاصيل الحساب والحجوزات والأقساط.
              </p>
            </div>

            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCustomerId(null);
                setSearchParams({});
              }}
              className="self-start md:self-auto px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 rounded-2xl border border-slate-700 font-bold text-xs transition-all flex items-center gap-2"
            >
              <i className="fas fa-rotate-left"></i>
              <span>بحث جديد</span>
            </button>
          </div>

          {/* Smart Search Bar Input with Direct Search Button */}
          <div className="pt-2">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex flex-col sm:flex-row gap-3 max-w-3xl"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) {
                      setSelectedCustomerId(null);
                      setCustomers([]);
                      setHasSearched(false);
                    }
                  }}
                  placeholder="ابحث بالاسم، رقم التليفون، البريد، كود الحجز، أو رقم الوصل..."
                  className="w-full pl-12 pr-12 py-4 bg-slate-900/90 text-white placeholder-slate-400 font-bold text-sm md:text-base rounded-2xl border-2 border-primary-500/40 focus:border-primary-400 focus:outline-none shadow-2xl transition-all"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-400 text-lg">
                  <i className="fas fa-search"></i>
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCustomerId(null);
                      setCustomers([]);
                      setHasSearched(false);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                  >
                    <i className="fas fa-times-circle text-lg"></i>
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !searchQuery.trim()}
                className="px-8 py-4 bg-gradient-to-r from-primary-600 via-indigo-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-black text-base rounded-2xl shadow-xl shadow-primary-600/30 transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-magnifying-glass"></i>
                )}
                <span>بحث</span>
              </button>
            </form>

            <div className="flex items-center gap-2 mt-2.5 text-xs font-bold text-emerald-300 bg-emerald-950/40 px-3.5 py-1.5 rounded-xl border border-emerald-500/30 w-fit">
              <i className="fas fa-leaf text-emerald-400"></i>
              <span>استعلام مُستهدف ومباشر: اكتب الاسم أو الرقم ثم اضغط "بحث" لقراءة بيانات هذا الطالب فقط وتوفير استهلاك القاعدة</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold text-xs animate-pulse">جاري الاستعلام المباشر من قاعدة البيانات...</p>
        </div>
      )}

      {/* SEARCH RESULTS LIST */}
      {!loading && hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <i className="fas fa-users text-primary-600"></i>
              <span>نتائج البحث ({searchResults.length})</span>
            </h2>

            {selectedCustomer && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                تم اختيار: <strong className="text-primary-600 dark:text-primary-400">{selectedCustomer.name}</strong>
              </span>
            )}
          </div>

          {searchResults.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-full flex items-center justify-center mx-auto text-2xl">
                <i className="fas fa-user-slash"></i>
              </div>
              <h3 className="font-black text-gray-800 dark:text-gray-100 text-base">لا يوجد نتائج مطابقة للبحث</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                تأكد من كتابة الاسم أو الرقم بشكل صحيح. يمكنك تجربة كتابة جزء من الاسم أو أول أرقام التليفون.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map(cust => {
                const isSelected = cust.id === selectedCustomerId;
                const custBookings = bookings.filter(b => b.customerId === cust.id);
                const activeBookingsCount = custBookings.filter(b => b.status === 'ACTIVE').length;
                const totalPaidAmount = custBookings.reduce((sum, b) => sum + (b.paymentSummary?.paidTotal || 0), 0);

                return (
                  <div
                    key={cust.id}
                    onClick={() => handleSelectCustomer(cust)}
                    className={`p-5 rounded-3xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-2 border-primary-500 shadow-xl ring-4 ring-primary-500/10'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-4 left-4 bg-primary-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-md">
                        محدد الآن ✅
                      </span>
                    )}

                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-black text-base rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                        {cust.name ? cust.name.trim().charAt(0) : '؟'}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <h3 className="font-black text-sm text-gray-900 dark:text-white truncate">
                          {cust.name}
                        </h3>

                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                          <i className="fab fa-whatsapp text-emerald-500"></i>
                          <span>{cust.fullWhatsapp || cust.phone || 'بدون رقم'}</span>
                        </div>

                        {cust.email && (
                          <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 truncate">
                            {cust.email}
                          </div>
                        )}

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60 mt-2 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-gray-500 dark:text-gray-400">
                              📦 {custBookings.length} {custBookings.length === 1 ? 'حجز' : 'حجوزات'}:
                            </span>
                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                              💰 {totalPaidAmount.toLocaleString()} ج.م
                            </span>
                          </div>

                          {custBookings.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {custBookings.map(b => (
                                <span
                                  key={b.id}
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1.5 border shadow-sm ${
                                    b.productType === 'diploma'
                                      ? 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-800'
                                      : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-800'
                                  }`}
                                >
                                  <span>{b.productType === 'diploma' ? '🎓' : '📚'}</span>
                                  <span className="truncate max-w-[200px]">{b.productName}</span>
                                  {b.groupName && (
                                    <span className="text-[10px] opacity-80 font-bold bg-white/60 dark:bg-black/30 px-1.5 py-0.5 rounded-md">
                                      {b.groupName}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] font-semibold text-gray-400 italic">
                              لا توجد كورس/دبلومة مسجلة
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SELECTED STUDENT 360-DEGREE FULL PROFILE */}
      {selectedCustomer && (
        <div className="space-y-6 pt-4 animate-fadeIn">
          
          {/* Student Profile Card Header */}
          <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6">
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100 dark:border-gray-700">
              
              {/* Main Personal Info */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-primary-600 via-indigo-600 to-purple-700 text-white font-black text-2xl md:text-3xl rounded-3xl flex items-center justify-center shadow-xl shrink-0">
                  {selectedCustomer.name ? selectedCustomer.name.trim().charAt(0) : '؟'}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">
                      {selectedCustomer.name}
                    </h2>
                    <span className="px-3 py-1 bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 text-xs font-black rounded-full border border-primary-200 dark:border-primary-800">
                      كود العميل: {selectedCustomer.id.slice(0, 8)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                    <a
                      href={`https://wa.me/${(selectedCustomer.fullWhatsapp || selectedCustomer.phone || '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800"
                    >
                      <i className="fab fa-whatsapp text-sm"></i>
                      <span>{selectedCustomer.fullWhatsapp || selectedCustomer.phone}</span>
                    </a>

                    {selectedCustomer.email && (
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <i className="fas fa-envelope text-slate-400"></i>
                        <span>{selectedCustomer.email}</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                      <i className="fas fa-user-tie"></i>
                      <span>المسؤول: {customerSalesRep}</span>
                    </span>
                  </div>

                  {/* Booked Courses Badges in Student Header */}
                  {selectedCustomerBookings.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-gray-700 dark:text-gray-300 flex items-center gap-1">
                        <i className="fas fa-graduation-cap text-primary-500"></i>
                        <span>الكورسات/الدبلومات المحجوزة:</span>
                      </span>
                      {selectedCustomerBookings.map(b => (
                        <span
                          key={b.id}
                          className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-2 border shadow-sm ${
                            b.productType === 'diploma'
                              ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-800'
                              : 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800'
                          }`}
                        >
                          <span>{b.productType === 'diploma' ? '🎓 دبلومة' : '📚 كورس'}</span>
                          <span className="font-black text-gray-900 dark:text-white">{b.productName}</span>
                          {b.groupName && (
                            <span className="text-[10px] bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded-md font-bold text-gray-800 dark:text-gray-200">
                              {b.groupName}
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold text-white ${b.status === 'ACTIVE' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                            {b.status === 'ACTIVE' ? 'نشط' : 'ملغى'}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Header Action Tools */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white dark:bg-gray-700 dark:hover:bg-gray-600 rounded-2xl font-bold text-xs transition-all shadow-md flex items-center gap-2"
                >
                  <i className="fas fa-print text-primary-400"></i>
                  <span>طباعة كشف الحساب</span>
                </button>

                <button
                  onClick={handleCopyDirectLink}
                  className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 rounded-2xl font-bold text-xs border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-2"
                >
                  <i className="fas fa-link"></i>
                  <span>مشاركة الرابط</span>
                </button>
              </div>
            </div>

            {/* Overall Financial Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-200/80 dark:border-gray-700/80">
                <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  📦 إجمالي الحجوزات
                </span>
                <p className="text-xl font-black text-gray-900 dark:text-white">
                  {selectedCustomerBookings.length} دورة / دبلومة
                </p>
              </div>

              <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200/60 dark:border-blue-800/40">
                <span className="block text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
                  💳 إجمالي قيمة الكورسات
                </span>
                <p className="text-xl font-black text-blue-700 dark:text-blue-300">
                  {financialSummary.totalCourseValue.toLocaleString()} ج.م
                </p>
              </div>

              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
                <span className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                  ✅ إجمالي المدفوع
                </span>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                  {financialSummary.totalPaid.toLocaleString()} ج.م
                </p>
              </div>

              <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-800/40">
                <span className="block text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                  ⏳ المتبقي المستحق
                </span>
                <p className="text-xl font-black text-amber-700 dark:text-amber-300">
                  {financialSummary.totalRemaining.toLocaleString()} ج.م
                </p>
              </div>
            </div>
          </div>

          {/* TAB NAVIGATION BAR */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-700 no-scrollbar">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-layer-group"></i>
              <span>ملخص الشامل (Overview)</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'bookings'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-graduation-cap"></i>
              <span>الحجوزات والدورات ({selectedCustomerBookings.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'payments'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-receipt"></i>
              <span>سجل المقبوضات ({selectedCustomerPayments.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('installments')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'installments'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-file-invoice-dollar"></i>
              <span>جدول الأقساط والتعليقات</span>
            </button>

            {selectedCustomerFormSubmission && (
              <button
                onClick={() => setActiveTab('form')}
                className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                  activeTab === 'form'
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                <i className="fas fa-wpforms"></i>
                <span>استمارة التأكيد</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('notes')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'notes'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-comment-dots"></i>
              <span>الملاحظات ({customerNotes.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'logs'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-history"></i>
              <span>سجل الحركات ({selectedCustomerLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('complaints')}
              className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'complaints'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <i className="fas fa-exclamation-triangle"></i>
              <span>الشكاوى ({selectedCustomerComplaints.length})</span>
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Active Bookings Quick Cards */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-book-bookmark text-primary-500"></i>
                  <span>دورات وحجوزات الطالب المسجلة</span>
                </h3>

                {selectedCustomerBookings.length === 0 ? (
                  <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border text-center text-gray-400 font-bold text-xs">
                    لا يوجد حجوزات مسجلة لهذا العميل حتى الآن.
                  </div>
                ) : (
                  selectedCustomerBookings.map(b => {
                    const price = b.pricing?.finalPriceSnapshot || (b.paymentSummary?.paidTotal || 0) + (b.paymentSummary?.remaining || 0);
                    const paid = b.paymentSummary?.paidTotal || 0;
                    const rem = b.paymentSummary?.remaining || 0;
                    const pct = price > 0 ? Math.round((paid / price) * 100) : 0;

                    return (
                      <div key={b.id} className="p-5 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/60 pb-3">
                          <div>
                            <span className="text-[10px] font-black uppercase text-primary-600 dark:text-primary-400">
                              {b.productType === 'diploma' ? '🎓 دبلومة' : '📚 كورس'}
                            </span>
                            <h4 className="font-black text-base text-gray-900 dark:text-white">
                              {b.productName}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-black ${
                              b.status === 'ACTIVE' 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : b.status === 'DEACTIVATED'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {b.status === 'ACTIVE' ? 'نشط' : b.status === 'DEACTIVATED' ? 'ملغى/موقوف' : b.status}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="block text-gray-400 text-[10px] font-bold">المجموعة</span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{b.groupName || 'غير معين'}</span>
                          </div>
                          <div>
                            <span className="block text-gray-400 text-[10px] font-bold">مسؤول المبيعات</span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{b.salesName}</span>
                          </div>
                          <div>
                            <span className="block text-gray-400 text-[10px] font-bold">تاريخ الحجز</span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">{b.bookingDate}</span>
                          </div>
                          <div>
                            <span className="block text-gray-400 text-[10px] font-bold">نوع الحجز</span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {b.bookingType === 'assigned' ? 'مجموعة محددة' : 'مؤجل'}
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1 pt-2">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-600 dark:text-gray-400">سداد الدورة: {pct}%</span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {paid.toLocaleString()} ج.م من أصل {price.toLocaleString()} ج.م
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Quick Notes & Actions */}
              <div className="space-y-6">
                
                {/* Notes Widget */}
                <div className="p-5 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                  <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <i className="fas fa-sticky-note text-amber-500"></i>
                      <span>ملاحظات العميل السريعة</span>
                    </span>
                    <span className="text-xs text-gray-400">{customerNotes.length}</span>
                  </h3>

                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      placeholder="اكتب ملاحظة جديدة عن الطالب..."
                      className="w-full p-3 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary-500"
                    ></textarea>
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !newNoteText.trim()}
                      className="w-full py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all"
                    >
                      {addingNote ? 'جاري الحفظ...' : '+ إضافة الملاحظة'}
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-60 overflow-y-auto pt-2">
                    {customerNotes.length === 0 ? (
                      <p className="text-[11px] text-gray-400 font-bold text-center py-2">لا توجد ملاحظات مسجلة.</p>
                    ) : (
                      customerNotes.map(n => (
                        <div key={n.id} className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl space-y-1">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{n.text}</p>
                          <div className="flex justify-between text-[10px] text-gray-400">
                            <span>بواسطة: {n.name}</span>
                            <span>{n.timestamp?.toDate ? n.timestamp.toDate().toLocaleDateString('ar-EG') : ''}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Form Submission Quick Summary */}
                {selectedCustomerFormSubmission && (
                  <div className="p-5 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-3xl border border-indigo-700/50 shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                        <i className="fas fa-wpforms"></i>
                        <span>بيانات استمارة التأكيد</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        مستلمة ✅
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-semibold text-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[10px]">الاسم بالإنجليزية:</span>
                        <strong className="text-white">{selectedCustomerFormSubmission.englishName || 'غير محدد'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">طريقة الحضور المفضلة:</span>
                        <strong className="text-amber-300">
                          {selectedCustomerFormSubmission.attendanceMethod === 'online' ? 'أونلاين (Online)' : 'المقر (Offline HQ)'}
                        </strong>
                      </div>
                      {selectedCustomerFormSubmission.transferSenderNumber && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">رقم تحويل المحفظة:</span>
                          <strong className="text-emerald-300">{selectedCustomerFormSubmission.transferSenderNumber}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BOOKINGS DETAILS */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-graduation-cap text-primary-500"></i>
                <span>تفاصيل دورات وحجوزات العميل</span>
              </h3>

              {selectedCustomerBookings.map(b => {
                const price = b.pricing?.finalPriceSnapshot || (b.paymentSummary?.paidTotal || 0) + (b.paymentSummary?.remaining || 0);
                const paid = b.paymentSummary?.paidTotal || 0;
                const rem = b.paymentSummary?.remaining || 0;

                return (
                  <div key={b.id} className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-6">
                    
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
                      <div>
                        <span className="text-xs font-black uppercase text-primary-600 dark:text-primary-400">
                          كود الحجز: {b.id}
                        </span>
                        <h4 className="text-lg font-black text-gray-900 dark:text-white">
                          {b.productName}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl">
                          {b.productType === 'diploma' ? '🎓 دبلومة' : '📚 كورس'}
                        </span>
                        <span className={`px-3 py-1 rounded-xl text-xs font-black ${
                          b.status === 'ACTIVE' 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        }`}>
                          {b.status}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                        <span className="text-gray-400 block text-[10px] font-bold">المجموعة والفرع</span>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{b.groupName || 'غير معين'}</p>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                        <span className="text-gray-400 block text-[10px] font-bold">مسؤول المبيعات</span>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{b.salesName}</p>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                        <span className="text-gray-400 block text-[10px] font-bold">السعر النهائي</span>
                        <p className="font-black text-blue-600 dark:text-blue-400">{price.toLocaleString()} ج.م</p>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                        <span className="text-gray-400 block text-[10px] font-bold">المدفوع والمتبقي</span>
                        <p className="font-black text-emerald-600 dark:text-emerald-400">
                          {paid.toLocaleString()} / <span className="text-amber-600">{rem.toLocaleString()} ج.م</span>
                        </p>
                      </div>
                    </div>

                    {/* Pricing Details */}
                    {b.pricing && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 text-xs space-y-2">
                        <span className="font-black text-gray-700 dark:text-gray-300 block mb-1">تفاصيل التسعير والخصومات:</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div>السعر الأساسي: <strong>{b.pricing.basePriceSnapshot || price} ج.م</strong></div>
                          {b.pricing.appliedPromoCode && (
                            <div className="text-emerald-600 font-bold">
                              كود خصم: ({b.pricing.appliedPromoCode.code}) -{b.pricing.appliedPromoCode.discountAmount} ج.م
                            </div>
                          )}
                          {b.pricing.extraDiscountSnapshot > 0 && (
                            <div className="text-purple-600 font-bold">
                              خصم إضافي: -{b.pricing.extraDiscountSnapshot} ج.م ({b.pricing.extraDiscountReason || 'سبب غير محدد'})
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: PAYMENTS HISTORY */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-receipt text-primary-500"></i>
                <span>سجل المقبوضات والدفعات المعتمدة</span>
              </h3>

              {selectedCustomerPayments.length === 0 ? (
                <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border text-center text-gray-400 font-bold text-xs">
                  لا توجد مقبوضات أو دفعات سابقة.
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 font-black uppercase">
                        <tr>
                          <th className="px-5 py-3">التاريخ والوقت</th>
                          <th className="px-5 py-3">المبلغ</th>
                          <th className="px-5 py-3">طريقة الدفع</th>
                          <th className="px-5 py-3">رقم المحول / المرجع</th>
                          <th className="px-5 py-3">رقم الإيصال</th>
                          <th className="px-5 py-3">المسؤول عن التسجيل</th>
                          <th className="px-5 py-3">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {selectedCustomerPayments.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                            <td className="px-5 py-3.5 font-bold text-gray-800 dark:text-gray-200">
                              {p.paymentDate}
                            </td>
                            <td className="px-5 py-3.5 font-black text-emerald-600 dark:text-emerald-400">
                              {p.amount.toLocaleString()} ج.م
                            </td>
                            <td className="px-5 py-3.5 font-bold text-gray-700 dark:text-gray-300">
                              {p.method}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-indigo-600 dark:text-indigo-400">
                              {p.transferSenderNumber || p.id.slice(0, 8)}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-gray-600 dark:text-gray-400">
                              {p.receiptNumber || 'بدون إيصال'}
                            </td>
                            <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">
                              {p.createdBy || 'سيستم'}
                            </td>
                            <td className="px-5 py-3.5">
                              {p.isReversed ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                  ملغى / مسترجع ⛔
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  مكتمل ✅
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INSTALLMENT SCHEDULE & NOTES */}
          {activeTab === 'installments' && (
            <div className="space-y-6">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-file-invoice-dollar text-primary-500"></i>
                <span>جدول الأقساط والتعليقات على الحساب</span>
              </h3>

              {selectedCustomerInstallmentPlans.length === 0 ? (
                <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border text-center text-gray-400 font-bold text-xs">
                  لا توجد خطة أقساط مسجلة لهذا الطالب.
                </div>
              ) : (
                selectedCustomerInstallmentPlans.map(ip => {
                  const linkedBooking = selectedCustomerBookings.find(b => b.id === ip.bookingId);

                  return (
                    <div key={ip.bookingId} className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                        <h4 className="font-black text-sm text-gray-900 dark:text-white">
                          خطة أقساط: {linkedBooking?.productName || ip.bookingId}
                        </h4>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          الدفعة الأولى المقدمة: {ip.deposit.toLocaleString()} ج.م
                        </span>
                      </div>

                      {/* Installment Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 font-black">
                            <tr>
                              <th className="px-4 py-2.5">القسط</th>
                              <th className="px-4 py-2.5">المبلغ</th>
                              <th className="px-4 py-2.5">تاريخ الاستحقاق</th>
                              <th className="px-4 py-2.5">الحالة</th>
                              <th className="px-4 py-2.5">تنبيه الواتساب</th>
                              <th className="px-4 py-2.5">التعليقات والملاحظات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {ip.installments.map((inst, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                                <td className="px-4 py-3 font-black text-gray-800 dark:text-gray-200">
                                  القسط #{idx + 1}
                                </td>
                                <td className="px-4 py-3 font-black text-primary-600 dark:text-primary-400">
                                  {inst.amount.toLocaleString()} ج.م
                                </td>
                                <td className="px-4 py-3 font-bold text-gray-700 dark:text-gray-300">
                                  {inst.dueDate}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                    inst.status === 'paid'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : inst.status === 'delayed'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  }`}>
                                    {inst.status === 'paid' ? 'مدفوع ✅' : inst.status === 'delayed' ? 'مؤجل ⏳' : 'مستحق 🕒'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                  {inst.notifiedOnWhatsApp ? 'تم الإرسال 📲' : 'لم يرسل'}
                                </td>
                                <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 max-w-xs">
                                  {inst.notes && inst.notes.length > 0 ? (
                                    <div className="space-y-1 text-[11px]">
                                      {inst.notes.map((note, nIdx) => (
                                        <div key={nIdx} className="bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200/50 dark:border-amber-800/40">
                                          <p className="font-bold text-amber-900 dark:text-amber-200">{note.text}</p>
                                          <p className="text-[9px] text-amber-700 dark:text-amber-400 mt-0.5">
                                            بواسطة: {note.addedByName} - {note.timestamp}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-[11px]">لا توجد تعليقات</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 5: FORM SUBMISSION */}
          {activeTab === 'form' && selectedCustomerFormSubmission && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-wpforms text-primary-500"></i>
                <span>استمارة التأكيد المسجلة بواسطة الطالب</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                  <span className="text-gray-400 block text-[10px]">الاسم بالكامل في الاستمارة:</span>
                  <p className="text-gray-900 dark:text-white">{selectedCustomerFormSubmission.customerName}</p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                  <span className="text-gray-400 block text-[10px]">الاسم بالإنجليزية:</span>
                  <p className="text-gray-900 dark:text-white">{selectedCustomerFormSubmission.englishName}</p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                  <span className="text-gray-400 block text-[10px]">رقم الهاتف والواتساب:</span>
                  <p className="text-gray-900 dark:text-white">{selectedCustomerFormSubmission.phone}</p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl">
                  <span className="text-gray-400 block text-[10px]">طريقة الحضور المحددة:</span>
                  <p className="text-primary-600 dark:text-primary-400">
                    {selectedCustomerFormSubmission.attendanceMethod === 'online' ? 'أونلاين' : 'المقر الرئيسي'}
                  </p>
                </div>
              </div>

              {/* Dynamic Custom Question Answers */}
              {selectedCustomerFormSubmission.additionalAnswers && Object.keys(selectedCustomerFormSubmission.additionalAnswers).length > 0 && (
                <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2">
                  <h4 className="font-black text-xs text-amber-800 dark:text-amber-300">
                    إجابات الأسئلة المخصصة:
                  </h4>
                  <div className="space-y-1 text-xs">
                    {Object.entries(selectedCustomerFormSubmission.additionalAnswers).map(([k, v], idx) => (
                      <div key={idx} className="flex justify-between border-b border-amber-100 dark:border-amber-900/50 pb-1">
                        <span className="text-gray-500 dark:text-gray-400 font-bold">{k}:</span>
                        <span className="font-black text-gray-900 dark:text-white">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: CUSTOMER NOTES */}
          {activeTab === 'notes' && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-comment-dots text-primary-500"></i>
                <span>ملاحظات سابقة عن العميل</span>
              </h3>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="اكتب ملاحظة جديدة..."
                  className="flex-1 p-3 bg-gray-50 dark:bg-gray-700/60 border rounded-2xl text-xs font-bold focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNoteText.trim()}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs"
                >
                  حفظ
                </button>
              </div>

              <div className="space-y-2 pt-2">
                {customerNotes.map(n => (
                  <div key={n.id} className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border flex justify-between items-start text-xs">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{n.text}</p>
                      <p className="text-[10px] text-gray-400 mt-1">بواسطة: {n.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SYSTEM AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-history text-primary-500"></i>
                <span>سجل التغييرات والعمليات على حساب الطالب</span>
              </h3>

              {selectedCustomerLogs.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-8">لا يوجد سجل حركات سابقة.</div>
              ) : (
                <div className="space-y-2">
                  {selectedCustomerLogs.map(log => (
                    <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-black text-primary-600 dark:text-primary-400 block">{log.action}</span>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{log.description}</p>
                        <span className="text-[10px] text-gray-400">بواسطة: {log.performedBy} ({log.performedByEmail})</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: COMPLAINTS */}
          {activeTab === 'complaints' && (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-amber-500"></i>
                <span>سجل الشكاوى للبلاغات</span>
              </h3>

              {selectedCustomerComplaints.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-8">لا توجد شكاوى أو بلاغات سابقة لهذا الطالب.</div>
              ) : (
                <div className="space-y-3">
                  {selectedCustomerComplaints.map(comp => (
                    <div key={comp.id} className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-1 text-xs">
                      <div className="flex justify-between font-black">
                        <span className="text-amber-900 dark:text-amber-200">{comp.subject}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">{comp.status}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{comp.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* PRINT STUDENT FILE MODAL */}
      {isPrintModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-gray-900 rounded-3xl max-w-3xl w-full p-8 space-y-6 shadow-2xl relative print:p-0 print:shadow-none print:w-full">
            
            {/* Header branding */}
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-2xl font-black text-gray-900">تقرير كشف حساب طالب</h2>
                <p className="text-xs text-gray-500 font-bold">تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
              </div>

              <div className="text-right print:hidden">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-bold text-xs shadow-md mr-2"
                >
                  <i className="fas fa-print ml-1"></i> طباعة الآن
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-2xl border">
              <div><strong>اسم الطالب:</strong> {selectedCustomer.name}</div>
              <div><strong>رقم الهاتف / الواتساب:</strong> {selectedCustomer.fullWhatsapp || selectedCustomer.phone}</div>
              <div><strong>البريد الإلكتروني:</strong> {selectedCustomer.email || 'غير مسجل'}</div>
              <div><strong>مسؤول المبيعات:</strong> {customerSalesRep}</div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-3 text-center text-xs font-bold">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                إجمالي الدورات: {financialSummary.totalCourseValue.toLocaleString()} ج.م
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
                المدفوع: {financialSummary.totalPaid.toLocaleString()} ج.م
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                المتبقي: {financialSummary.totalRemaining.toLocaleString()} ج.م
              </div>
            </div>

            {/* Bookings List */}
            <div className="space-y-2">
              <h4 className="font-black text-xs uppercase text-gray-500">بيانات الحجوزات:</h4>
              <table className="w-full text-right text-xs border border-collapse">
                <thead className="bg-gray-100 font-bold">
                  <tr>
                    <th className="border p-2">الكورس / الدبلومة</th>
                    <th className="border p-2">المجموعة</th>
                    <th className="border p-2">الحالة</th>
                    <th className="border p-2">المدفوع</th>
                    <th className="border p-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCustomerBookings.map(b => (
                    <tr key={b.id}>
                      <td className="border p-2 font-bold">{b.productName}</td>
                      <td className="border p-2">{b.groupName || 'غير معين'}</td>
                      <td className="border p-2">{b.status}</td>
                      <td className="border p-2 font-bold text-emerald-700">{b.paymentSummary?.paidTotal || 0} ج.م</td>
                      <td className="border p-2 font-bold text-amber-700">{b.paymentSummary?.remaining || 0} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payment Receipts List */}
            <div className="space-y-2">
              <h4 className="font-black text-xs uppercase text-gray-500">سجل الدفعات والمقبوضات:</h4>
              <table className="w-full text-right text-xs border border-collapse">
                <thead className="bg-gray-100 font-bold">
                  <tr>
                    <th className="border p-2">التاريخ</th>
                    <th className="border p-2">المبلغ</th>
                    <th className="border p-2">وسيلة الدفع</th>
                    <th className="border p-2">رقم المحول / المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCustomerPayments.map(p => (
                    <tr key={p.id}>
                      <td className="border p-2">{p.paymentDate}</td>
                      <td className="border p-2 font-bold">{p.amount} ج.م</td>
                      <td className="border p-2">{p.method}</td>
                      <td className="border p-2">{p.transferSenderNumber || p.receiptNumber || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 text-center text-[10px] text-gray-400 font-bold border-t">
              مستخرج تلقائياً من نظام إدارة العملاء والماليات - جميع الحقوق محفوظة © {new Date().getFullYear()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudentSearch;
