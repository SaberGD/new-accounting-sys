
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getCorrectDate, getCorrectISOString, getCairoDateString } from '../services/timeService';
import { 
  genericGet, 
  genericGetQuery,
  addPaymentAndUpdateBooking, 
  updateInstallmentDelay, 
  markInstallmentNotified,
  rescheduleRemainingInstallments,
  toggleInstallmentDelayContacted,
  updateInstallmentDelayInfo,
  toggleInstallmentSalesReminder,
  toggleInstallmentSupervisorVerification,
  addInstallmentNote
} from '../services/firestore';
import { where } from 'firebase/firestore';
import { InstallmentPlan, Booking, Customer, Payment, PaymentMethod, Installment, SalesStaff } from '../types';
import HistoryModal from '../components/HistoryModal';

interface DueListItem {
  plan: InstallmentPlan;
  booking: Booking;
  customer: Customer;
  inst: Installment;
  index: number;
}

interface SalesInstallmentStats {
  salesId: string;
  salesName: string;
  overdueClientsCount: number;
  overdueInstallmentsCount: number;
  overdueTotalAmount: number;
  todayClientsCount: number;
  todayTotalAmount: number;
}


// Memoized Installment Card for high performance
const InstallmentCard = React.memo(({ 
  item, 
  userProfile, 
  hasPermission,
  onMarkNotified,
  onToggleDelayContacted,
  onPay,
  onReschedule,
  onUpdateDelayTracking,
  toggleSalesReminder,
  toggleSupervisorVerify,
  onAddNote,
  onViewHistory
}: {
  item: DueListItem;
  userProfile: any;
  hasPermission: (p: any) => boolean;
  onMarkNotified: (bid: string, idx: number) => void;
  onToggleDelayContacted: (bid: string, idx: number) => void;
  onPay: (bid: string, idx: number, amt: number) => void;
  onReschedule: (bid: string, idx: number, booking: Booking) => void;
  onUpdateDelayTracking: (item: DueListItem) => void;
  toggleSalesReminder: (bid: string, idx: number) => void;
  toggleSupervisorVerify: (bid: string, idx: number) => void;
  onAddNote: (bid: string, idx: number) => void;
  onViewHistory: (b: Booking) => void;
}) => {
  const { plan, customer, inst, index, booking } = item;
  
  return (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border ${inst.label ? 'border-primary-500 bg-primary-50/10' : 'border-gray-100 dark:border-gray-700'} hover:shadow-lg transition-shadow`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg">{customer.name}</h3>
            {hasPermission('viewHistory') && (
              <button onClick={() => onViewHistory(booking)} className="text-gray-400 hover:text-indigo-500 transition-colors" title="View History Log">
                <i className="fas fa-history text-xs"></i>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">{customer.whatsapp}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[9px] font-black bg-primary-50 dark:bg-primary-900/20 text-primary-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">
              <i className="fas fa-user-tie mr-1"></i> {booking.salesName || 'Unknown Sales'}
            </span>
            {plan.planLabel && (
              <span className="text-[9px] font-black bg-amber-50 dark:bg-amber-900/20 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-amber-100 dark:border-amber-900/30">
                <i className="fas fa-file-invoice-dollar mr-1"></i> {plan.planLabel}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          {inst.label && <p className="text-[8px] font-black text-primary-500 uppercase mb-1">{inst.label}</p>}
          <p className="text-xl font-black text-primary-600">{inst.amount.toLocaleString()} ج.م</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase">{inst.dueDate}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-50 dark:border-gray-700/50 mb-4">
        <div className="text-center">
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Price</p>
          <p className="text-[11px] font-bold">{booking.pricing.finalPriceSnapshot.toLocaleString()}</p>
        </div>
        <div className="text-center border-x border-gray-50 dark:border-gray-700/50">
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Paid Total</p>
          <p className="text-[11px] font-bold text-green-600">{booking.paymentSummary.paidTotal.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Remaining</p>
          <p className="text-[11px] font-bold text-red-500">{booking.paymentSummary.remaining.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2">
        {hasPermission('editInstallments') ? (
          <>
            <button onClick={() => onPay(plan.bookingId, index, inst.amount)} className="py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-green-500/20">Pay</button>
            <button onClick={() => onReschedule(plan.bookingId, index, booking)} className="py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold">Reschedule</button>
          </>
        ) : (
          <div className="col-span-2 flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 rounded-xl text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <i className="fas fa-info-circle mr-2"></i> View Only
          </div>
        )}
        <button onClick={() => onMarkNotified(plan.bookingId, index)} className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${inst.notifiedOnWhatsApp ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 dark:bg-gray-700 text-gray-400'}`}><i className="fab fa-whatsapp mr-1"></i> Notified</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-gray-50/50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-700">
        <div className={`flex flex-col gap-1 p-2 rounded-xl transition-all ${inst.remindedBySales ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30' : 'border border-transparent'}`}>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={!!inst.remindedBySales} 
              onChange={() => toggleSalesReminder(plan.bookingId, index)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 transition-transform group-hover:scale-110"
            />
            <span className={`text-[10px] font-black uppercase transition-colors ${inst.remindedBySales ? 'text-blue-600' : 'text-gray-500'}`}>Sales Reminder</span>
          </label>
          {inst.remindedBySales && (
            <p className="text-[9px] text-blue-600 font-bold ml-6 animate-in fade-in slide-in-from-left-1">
               <i className="fas fa-check-circle mr-1"></i>
               {inst.remindedBySales.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={!!inst.verifiedBySupervisor} 
              disabled={userProfile?.role !== 'supervisor' && userProfile?.role !== 'manager' && userProfile?.role !== 'admin'}
              onChange={() => toggleSupervisorVerify(plan.bookingId, index)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
            />
            <span className="text-[10px] font-black text-gray-500 uppercase">Supervisor Verify</span>
          </label>
          {inst.verifiedBySupervisor && (
            <p className="text-[9px] text-purple-600 font-bold ml-6">
               <i className="fas fa-shield-alt mr-1"></i>
               {inst.verifiedBySupervisor.name}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <button 
          onClick={() => onAddNote(plan.bookingId, index)}
          className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            inst.notes && inst.notes.length > 0 
              ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-lg shadow-indigo-500/20' 
              : 'bg-gray-50 dark:bg-gray-700/50 border-transparent text-gray-400'
          }`}
        >
          <i className="fas fa-sticky-note mr-2"></i>
          {inst.notes && inst.notes.length > 0 ? `Notes (${inst.notes.length})` : 'Add Note (Optional)'}
        </button>
        {inst.notes && inst.notes.length > 0 && (
          <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1">
            {inst.notes.map((n, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-indigo-50 dark:border-indigo-900/30 text-[10px]">
                <p className="text-gray-700 dark:text-gray-200 font-medium mb-1">{n.text}</p>
                <div className="flex justify-between items-center text-[8px] font-bold text-indigo-400 uppercase">
                  <span>{n.addedByName}</span>
                  <span>{new Date(n.timestamp).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-dashed border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={inst.delayContacted || false} 
              onChange={() => onToggleDelayContacted(plan.bookingId, index)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">تم التواصل بخصوص التأخير</span>
          </label>
          {inst.delayReason && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">مؤجل</span>
          )}
        </div>
        
        {inst.delayReason && (
          <div className="mb-3 p-2 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/30">
            <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
              <i className="fas fa-comment-dots mr-1"></i> {inst.delayReason}
            </p>
            {inst.originalDueDate && (
              <p className="text-[8px] text-amber-600 mt-1 italic">الموعد الأصلي: {inst.originalDueDate}</p>
            )}
          </div>
        )}

        <button 
          onClick={() => onUpdateDelayTracking(item)}
          className="w-full py-2 bg-gray-50 dark:bg-gray-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-500 hover:text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-transparent hover:border-amber-200"
        >
          <i className="fas fa-calendar-plus mr-1"></i> {inst.delayReason ? 'تعديل بيانات التأخير' : 'إضافة سبب التأخير والموعد الجديد'}
        </button>
      </div>
    </div>
  );
});

const Installments: React.FC = () => {
  const { t, lang } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [activeTab, setActiveTab] = useState<'today' | 'soon' | 'overdue' | 'all'>('today');

  if (!hasPermission('viewInstallments')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6 text-3xl">
          <i className="fas fa-lock"></i>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">You do not have permission to view financial installments or collection data.</p>
      </div>
    );
  }
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);

  // Memoized maps for O(1) lookups
  const bookingsMap = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach(b => map.set(b.id, b));
    return map;
  }, [bookings]);

  const customersMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const salesStaffMap = useMemo(() => {
    const map = new Map<string, SalesStaff>();
    salesStaff.forEach(s => map.set(s.id, s));
    return map;
  }, [salesStaff]);

  const salesStats = useMemo(() => {
    const todayStr = getCairoDateString();
    const statsMap = new Map<string, {
      salesName: string;
      overdueCustomers: Set<string>;
      overdueInstCount: number;
      overdueAmount: number;
      todayCustomers: Set<string>;
      todayAmount: number;
    }>();

    const getEntry = (salesId: string, salesName: string) => {
      if (!statsMap.has(salesId)) {
        statsMap.set(salesId, {
          salesName: salesName || 'Unknown Sales',
          overdueCustomers: new Set<string>(),
          overdueInstCount: 0,
          overdueAmount: 0,
          todayCustomers: new Set<string>(),
          todayAmount: 0,
        });
      }
      return statsMap.get(salesId)!;
    };

    plans.forEach(plan => {
      const booking = bookingsMap.get(plan.bookingId);
      if (!booking || booking.status !== 'ACTIVE') return;
      if (booking.paymentSummary && booking.paymentSummary.remaining <= 0) return;

      const salesId = booking.salesId || 'unknown';
      const salesName = booking.salesName || 'Unknown Sales';

      plan.installments.forEach(inst => {
        if (inst.status === 'paid' || inst.status === 'cancelled') return;

        const isOverdue = inst.dueDate < todayStr;
        const isToday = inst.dueDate === todayStr;

        if (isOverdue) {
          const entry = getEntry(salesId, salesName);
          entry.overdueCustomers.add(booking.customerId);
          entry.overdueInstCount += 1;
          entry.overdueAmount += inst.amount;
        } else if (isToday) {
          const entry = getEntry(salesId, salesName);
          entry.todayCustomers.add(booking.customerId);
          entry.todayAmount += inst.amount;
        }
      });
    });

    const list: SalesInstallmentStats[] = [];
    statsMap.forEach((val, key) => {
      list.push({
        salesId: key,
        salesName: val.salesName,
        overdueClientsCount: val.overdueCustomers.size,
        overdueInstallmentsCount: val.overdueInstCount,
        overdueTotalAmount: val.overdueAmount,
        todayClientsCount: val.todayCustomers.size,
        todayTotalAmount: val.todayAmount,
      });
    });

    // Filter based on permissions: if sales staff, only show their own
    const canSeeAll = hasPermission('viewAllBookings');
    const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);

    if (!canSeeAll && linkedStaff) {
      return list.filter(item => item.salesId === linkedStaff.id);
    }

    return list.sort((a, b) => (b.overdueTotalAmount + b.todayTotalAmount) - (a.overdueTotalAmount + a.todayTotalAmount));
  }, [plans, bookingsMap, salesStaff, userProfile, hasPermission]);

  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggleSalesReminder = React.useCallback(async (bookingId: string, index: number) => {
    if (!userProfile) return;
    const originalState = [...plans];
    
    // Optimistic Update
    setPlans(prev => prev.map(p => {
      if (p.bookingId === bookingId) {
        const newInst = p.installments.map((inst, i) => {
          if (i === index) {
            const updated = { ...inst };
            if (updated.remindedBySales) {
              delete updated.remindedBySales;
            } else {
              updated.remindedBySales = { 
                uid: userProfile.uid, 
                name: userProfile.displayName, 
                timestamp: getCorrectISOString() 
              };
            }
            return updated;
          }
          return inst;
        });
        return { ...p, installments: newInst };
      }
      return p;
    }));

    try {
      await toggleInstallmentSalesReminder(bookingId, index, { uid: userProfile.uid, name: userProfile.displayName });
    } catch (err) {
      setPlans(originalState);
      alert("Error updating sales reminder");
    }
  }, [userProfile, plans]);

  const handleToggleSupervisorVerify = React.useCallback(async (bookingId: string, index: number) => {
    if (!userProfile) return;
    const originalState = [...plans];

    setPlans(prev => prev.map(p => {
      if (p.bookingId === bookingId) {
        const newInst = p.installments.map((inst, i) => {
          if (i === index) {
            const updated = { ...inst };
            if (updated.verifiedBySupervisor) {
              delete updated.verifiedBySupervisor;
            } else {
              updated.verifiedBySupervisor = { 
                uid: userProfile.uid, 
                name: userProfile.displayName, 
                timestamp: getCorrectISOString() 
              };
            }
            return updated;
          }
          return inst;
        });
        return { ...p, installments: newInst };
      }
      return p;
    }));

    try {
      await toggleInstallmentSupervisorVerification(bookingId, index, { uid: userProfile.uid, name: userProfile.displayName });
    } catch (err) {
      setPlans(originalState);
      alert("Error updating supervisor verification");
    }
  }, [userProfile, plans]);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [selectedSalesId, setSelectedSalesId] = useState('all');
  const [groupBy, setGroupBy] = useState<'none' | 'sales' | 'date'>('none');

  // Actions State
  const [delayModal, setDelayModal] = useState<{ planId: string, index: number, booking: Booking } | null>(null);
  const [delayData, setDelayData] = useState({ reason: '', date: '', newCount: 1 });
  
  // Reschedule State
  const [reschedulePlan, setReschedulePlan] = useState<Installment[]>([]);
  const [useUniformInterval, setUseUniformInterval] = useState(false);
  const [uniformDays, setUniformDays] = useState(30);

  const [paymentModal, setPaymentModal] = useState<{ planId: string, index: number, amount: number } | null>(null);
  const [paymentData, setPaymentData] = useState({ method: 'cash_office' as PaymentMethod, ref: '', note: '', receiptLink: '' });

  const [delayTrackingModal, setDelayTrackingModal] = useState<{ planId: string, index: number, inst: Installment, booking: Booking } | null>(null);
  const [delayTrackingData, setDelayTrackingData] = useState({ reason: '', newDate: '', installments: [] as Installment[] });

  const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
  const [activeHistoryBooking, setActiveHistoryBooking] = useState<Booking | null>(null);

  const handleMarkNotified = React.useCallback(async (bookingId: string, index: number) => {
    const originalState = [...plans];
    // Optimistic Update
    setPlans(prev => prev.map(p => {
      if (p.bookingId === bookingId) {
        const newInst = [...p.installments];
        if (newInst[index]) {
          newInst[index] = { ...newInst[index], notifiedOnWhatsApp: !newInst[index].notifiedOnWhatsApp };
        }
        return { ...p, installments: newInst };
      }
      return p;
    }));

    try {
      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      await markInstallmentNotified(bookingId, index, performedBy);
    } catch (err) {
      console.error("Failed to toggle notified status:", err);
      setPlans(originalState);
      alert("حدث خطأ أثناء تحديث الحالة. يرجى المحاولة مرة أخرى.");
    }
  }, [userProfile, plans]);

  const handleToggleDelayContacted = React.useCallback(async (bookingId: string, index: number) => {
    const originalState = [...plans];
    // Optimistic Update
    setPlans(prev => prev.map(p => {
      if (p.bookingId === bookingId) {
        const newInst = [...p.installments];
        if (newInst[index]) {
          newInst[index] = { ...newInst[index], delayContacted: !newInst[index].delayContacted };
        }
        return { ...p, installments: newInst };
      }
      return p;
    }));

    try {
      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      await toggleInstallmentDelayContacted(bookingId, index, performedBy);
    } catch (err) {
      console.error("Failed to toggle delay contacted status:", err);
      setPlans(originalState);
      alert("Failed to update status. Please try again.");
    }
  }, [userProfile, plans]);

  const handleUpdateDelayTracking = async () => {
    if (!delayTrackingModal) return;
    if (!delayTrackingData.reason.trim()) {
      alert("يجب كتابة سبب التأخير أو تفاصيل ما تم الاتفاق عليه");
      return;
    }
    setIsProcessing(true);
    try {
      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      await updateInstallmentDelayInfo(
        delayTrackingModal.planId, 
        delayTrackingModal.index, 
        delayTrackingData.installments, 
        delayTrackingData.reason, 
        performedBy
      );
      setDelayTrackingModal(null);
      fetchData();
    } catch (err) {
      console.error("Failed to update delay info:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelayTrackingLocalEdit = (idx: number, field: 'dueDate' | 'amount', value: any) => {
    const updated = [...delayTrackingData.installments];
    if (!updated[idx]) return;

    if (field === 'dueDate') {
        const oldDate = new Date(updated[idx].dueDate);
        const newDate = new Date(value);
        
        updated[idx].dueDate = value;

        if (useUniformInterval) {
            for (let i = idx + 1; i < updated.length; i++) {
                const prevDate = new Date(updated[i-1].dueDate);
                prevDate.setDate(prevDate.getDate() + uniformDays);
                updated[i].dueDate = prevDate.toISOString().split('T')[0];
            }
        } else {
            const diffTime = newDate.getTime() - oldDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            for (let i = idx + 1; i < updated.length; i++) {
                const nextDate = new Date(updated[i].dueDate);
                nextDate.setDate(nextDate.getDate() + diffDays);
                updated[i].dueDate = nextDate.toISOString().split('T')[0];
            }
        }
    } else {
        updated[idx].amount = Number(value);
    }
    setDelayTrackingData(prev => ({ ...prev, installments: updated }));
  };

  useEffect(() => {
    if (!hasPermission('viewAllBookings') && userProfile && salesStaff.length > 0) {
      const linkedStaff = salesStaff.find(s => s.userId === userProfile.uid);
      if (linkedStaff) {
        setSelectedSalesId(linkedStaff.id);
      }
    }
  }, [salesStaff, userProfile, hasPermission]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all installment plans, bookings, customers, and sales staff
      const [p, b, c, s] = await Promise.all([
        genericGet<InstallmentPlan>('installment_plans'),
        genericGet<Booking>('bookings'),
        genericGet<Customer>('customers'),
        genericGet<SalesStaff>('sales_staff')
      ]);

      // 2. Filter active bookings and plans that have unpaid/un-cancelled installments
      const activeBookings = b.filter(bk => !bk.status || bk.status === 'ACTIVE' || (bk.status as string) === 'active');
      const activeBookingIds = new Set(activeBookings.map(item => item.id));

      const activePlans = p.filter(plan => {
        if (!activeBookingIds.has(plan.bookingId)) return false;
        return plan.installments && plan.installments.some(inst => inst.status !== 'paid' && inst.status !== 'cancelled');
      });

      setPlans(activePlans);
      setBookings(activeBookings);
      setCustomers(c);
      setSalesStaff(s);
    } catch (err) {
      console.error("Error fetching Installments data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const dueList = useMemo(() => {
    const todayStr = getCairoDateString();
    const soonDate = getCorrectDate(); soonDate.setDate(soonDate.getDate() + 3);
    const soonStr = getCairoDateString(soonDate);

    // Get linked staff for sales role filtering
    const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);
    const canSeeAll = hasPermission('viewAllBookings');

    let items: DueListItem[] = [];

    plans.forEach(plan => {
      const booking = bookingsMap.get(plan.bookingId);
      if (!booking) return;
      if (booking.status && booking.status !== 'ACTIVE' && (booking.status as string) !== 'active') return;
      if (booking.paymentSummary && booking.paymentSummary.remaining <= 0) return;
      
      let customer = customersMap.get(booking.customerId);
      if (!customer) {
        // Fallback customer object so installments are NEVER hidden if customer document is missing
        customer = {
          id: booking.customerId || 'unknown',
          name: (booking as any).customerName || 'عميل غير معرف',
          phone: (booking as any).customerPhone || (booking as any).phone || '',
          whatsapp: (booking as any).customerPhone || (booking as any).phone || '',
          fullWhatsapp: (booking as any).customerPhone || (booking as any).phone || '',
          countryCode: '+20',
          email: (booking as any).email || ''
        };
      }

      // Privacy Filter: Sales staff only see their own bookings' installments
      if (!canSeeAll) {
        if (salesStaff.length > 0) {
          if (!linkedStaff || booking.salesId !== linkedStaff.id) return;
        }
      }

      plan.installments.forEach((inst, idx) => {
        if (inst.status === 'paid' || inst.status === 'cancelled') return;

        const nameMatches = searchQuery === '' || 
          customer!.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          (customer!.whatsapp && customer!.whatsapp.includes(searchQuery)) ||
          (customer!.phone && customer!.phone.includes(searchQuery));
          
        if (!nameMatches) return;

        if (dateFilter.start && inst.dueDate < dateFilter.start) return;
        if (dateFilter.end && inst.dueDate > dateFilter.end) return;

        if (selectedSalesId !== 'all' && booking.salesId !== selectedSalesId) return;

        if (!dateFilter.start && !dateFilter.end) {
          const isToday = inst.dueDate === todayStr;
          const isSoon = inst.dueDate > todayStr && inst.dueDate <= soonStr;
          const isOverdue = inst.dueDate < todayStr;
          if (activeTab === 'today' && !isToday) return;
          if (activeTab === 'soon' && !isSoon) return;
          if (activeTab === 'overdue' && !isOverdue) return;
        }
        items.push({ plan, booking, customer: customer!, inst, index: idx });
      });
    });
    return items.sort((a, b) => a.inst.dueDate.localeCompare(b.inst.dueDate));
  }, [plans, bookingsMap, customersMap, activeTab, searchQuery, dateFilter, selectedSalesId, userProfile, salesStaff, hasPermission]);

  const filteredDueList = dueList; // Logic moved to dueList to avoid double filtering

  const groupedDueList = useMemo(() => {
    if (groupBy === 'none') return { 'All': filteredDueList } as Record<string, DueListItem[]>;

    const groups: Record<string, DueListItem[]> = {};
    filteredDueList.forEach(item => {
      let key = 'Other';
      if (groupBy === 'sales') {
        key = item.booking.salesName || 'Unknown Sales';
      } else if (groupBy === 'date') {
        key = item.inst.dueDate;
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    // Sort keys if grouping by date
    if (groupBy === 'date') {
      return Object.keys(groups).sort().reduce((obj, key) => {
        obj[key] = groups[key];
        return obj;
      }, {} as Record<string, DueListItem[]>);
    }

    return groups;
  }, [filteredDueList, groupBy]);

  const handlePay = async () => {
    if (!paymentModal) return;
    const { planId, index, amount } = paymentModal;
    const booking = bookings.find(b => b.id === planId);
    if (!booking) return;
    
    // Check if overdue and reason is missing
    const plan = plans.find(p => p.bookingId === planId);
    if (plan && plan.installments[index]) {
      const inst = plan.installments[index];
      const todayStr = getCairoDateString();
      if (inst.dueDate < todayStr && !paymentData.note.trim()) {
        alert("هذا القسط متأخر، يجب ذكر السبب في الملاحظات");
        return;
      }
    }

    setIsProcessing(true);
    try {
        await addPaymentAndUpdateBooking({ 
          bookingId: planId, 
          customerId: booking.customerId, 
          groupId: booking.groupId, 
          paymentDate: getCairoDateString(), 
          amount, 
          method: paymentData.method, 
          transactionRef: paymentData.ref, 
          receiptLink: paymentData.receiptLink,
          note: paymentData.note || 'Installment Payment', 
          createdByUid: userProfile?.uid || '' 
        }, index, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' });
        setPaymentModal(null); setPaymentData({ method: 'cash_office', ref: '', note: '', receiptLink: '' }); fetchData();
    } catch(e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleReschedule = async () => {
      if (!delayModal) return;
      if (!delayData.reason.trim()) {
        alert("يجب كتابة سبب إعادة الجدولة أو التأجيل");
        return;
      }
      setIsProcessing(true);
      try {
          await rescheduleRemainingInstallments(delayModal.planId, reschedulePlan.length, '', delayData.reason, reschedulePlan, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' });
          setDelayModal(null); fetchData();
      } catch(err: any) { alert("Error: " + err.message); } finally { setIsProcessing(false); }
  };

  const handleUpdateCount = (count: number) => {
      if (!delayModal || count < 1) return;
      const remainingBalance = delayModal.booking.paymentSummary.remaining;
      const perInst = remainingBalance / count;
      const originalPlan = plans.find(p => p.bookingId === delayModal.planId);
      const type = originalPlan?.installmentType || 'monthly';
      const firstDate = reschedulePlan[0]?.dueDate || getCairoDateString();

      const newList: Installment[] = [];
      for(let i=0; i<count; i++) {
          const d = new Date(firstDate);
          if (useUniformInterval) {
              d.setDate(d.getDate() + (i * uniformDays));
          } else {
              if (type === 'weekly') d.setDate(d.getDate() + (i * 7));
              else d.setMonth(d.getMonth() + i);
          }
          newList.push({
              dueDate: d.toISOString().split('T')[0],
              amount: perInst,
              status: 'pending',
              notifiedOnWhatsApp: false
          });
      }
      setReschedulePlan(newList);
      setDelayData(prev => ({ ...prev, newCount: count }));
  };

  const handleLocalEdit = (idx: number, field: 'dueDate' | 'amount', value: any) => {
    const updated = [...reschedulePlan];
    if (!updated[idx]) return;

    if (field === 'dueDate') {
        const oldDate = new Date(updated[idx].dueDate);
        const newDate = new Date(value);
        
        // تحديث تاريخ القسط الحالي
        updated[idx].dueDate = value;

        if (useUniformInterval) {
            // ترحيل بناءً على فواصل زمنية ثابتة (Uniform Intervals)
            for (let i = idx + 1; i < updated.length; i++) {
                const prevDate = new Date(updated[i-1].dueDate);
                prevDate.setDate(prevDate.getDate() + uniformDays);
                updated[i].dueDate = prevDate.toISOString().split('T')[0];
            }
        } else {
            // ترحيل بناءً على فارق الأيام (Smart Shift / Delta)
            const diffTime = newDate.getTime() - oldDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            for (let i = idx + 1; i < updated.length; i++) {
                const nextDate = new Date(updated[i].dueDate);
                nextDate.setDate(nextDate.getDate() + diffDays);
                updated[i].dueDate = nextDate.toISOString().split('T')[0];
            }
        }
    } else {
        updated[idx].amount = Number(value);
    }
    setReschedulePlan(updated);
  };

  const statsForDelay = useMemo(() => {
      if (!delayModal) return null;
      const plan = plans.find(p => p.bookingId === delayModal.planId);
      if (!plan) return null;
      const paid = plan.installments.filter(i => i.status === 'paid').length;
      const pendingList = plan.installments.filter(i => i.status === 'pending' || i.status === 'delayed');
      return { paid, pending: pendingList.length, remaining: delayModal.booking.paymentSummary.remaining, pendingList };
  }, [delayModal, plans]);

  useEffect(() => {
    if (statsForDelay?.pendingList) {
        setReschedulePlan(statsForDelay.pendingList);
        setDelayData(prev => ({ ...prev, newCount: statsForDelay.pending }));
    }
  }, [statsForDelay]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">{t('installments')} / Collections</h1>

      {/* Sales Installment Summary Cards */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-6 bg-primary-500 rounded-full"></div>
          <h2 className="text-lg font-black dark:text-white">
            {lang === 'ar' ? '📊 ملخص الأقساط ومتابعة السيلز' : '📊 Sales Installments Performance Summary'}
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {salesStats.length === 0 ? (
            <div className="col-span-full p-6 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-100 dark:border-gray-700">
              {lang === 'ar' ? 'لا توجد أقساط مستحقة اليوم أو متأخرة حالياً.' : 'No due or overdue installments currently.'}
            </div>
          ) : (
            salesStats.map(stat => (
              <div key={stat.salesId} className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4 border-b border-gray-50 dark:border-gray-700/50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 flex items-center justify-center font-bold text-sm">
                      <i className="fas fa-user-tie"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-gray-800 dark:text-gray-100 text-sm md:text-base">{stat.salesName}</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{lang === 'ar' ? 'مسؤول المبيعات' : 'Sales Representative'}</p>
                    </div>
                  </div>
                  
                  {/* Quick Badge */}
                  {(stat.overdueClientsCount > 0) && (
                    <span className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[10px] font-black px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/30 animate-pulse">
                      {lang === 'ar' ? 'تنبيه تأخير' : 'Overdue Alert'}
                    </span>
                  )}
                </div>

                {/* Stats Sections */}
                <div className="grid grid-cols-2 gap-4">
                  
                  {/* Overdue (المتأخرات) */}
                  <div className="bg-red-50/40 dark:bg-red-950/10 rounded-2xl p-4 border border-red-100/30 dark:border-red-950/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-extrabold text-[11px] mb-2">
                        <i className="fas fa-exclamation-circle text-xs"></i>
                        <span>{lang === 'ar' ? 'المتأخرات (Overdue)' : 'Overdue'}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {lang === 'ar' ? 'العملاء: ' : 'Clients: '}
                          <strong className="text-red-600 dark:text-red-400 font-black">{stat.overdueClientsCount}</strong>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {lang === 'ar' ? 'الأقساط: ' : 'Installments: '}
                          <strong className="text-red-600 dark:text-red-400 font-black">{stat.overdueInstallmentsCount}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-red-100/30 dark:border-red-950/20">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{lang === 'ar' ? 'المبلغ الإجمالي' : 'Total Amount'}</p>
                      <p className="text-base font-black text-red-600 dark:text-red-400">{stat.overdueTotalAmount.toLocaleString()} ج.م</p>
                    </div>
                  </div>

                  {/* Today (مستحق اليوم) */}
                  <div className="bg-emerald-50/40 dark:bg-emerald-950/10 rounded-2xl p-4 border border-emerald-100/30 dark:border-emerald-950/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-[11px] mb-2">
                        <i className="fas fa-calendar-check text-xs"></i>
                        <span>{lang === 'ar' ? 'مستحق اليوم (Today)' : 'Due Today'}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {lang === 'ar' ? 'العملاء: ' : 'Clients: '}
                          <strong className="text-emerald-600 dark:text-emerald-400 font-black">{stat.todayClientsCount}</strong>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {lang === 'ar' ? 'الوضع: ' : 'Status: '}
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded">
                            {stat.todayClientsCount > 0 ? (lang === 'ar' ? 'مستحق' : 'Active') : (lang === 'ar' ? 'لا يوجد' : 'None')}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-emerald-100/30 dark:border-emerald-950/20">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{lang === 'ar' ? 'المبلغ المطلوب' : 'Total Required'}</p>
                      <p className="text-base font-black text-emerald-600 dark:text-emerald-400">{stat.todayTotalAmount.toLocaleString()} ج.م</p>
                    </div>
                  </div>

                </div>
                
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 items-end">
        <div className="lg:col-span-1">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Search Trainee</label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input type="text" placeholder="Enter name or WhatsApp..." className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none font-medium text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Sales Representative</label>
          <select 
            className={`w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold ${!hasPermission('viewAllBookings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            value={selectedSalesId} 
            onChange={e => setSelectedSalesId(e.target.value)}
            disabled={!hasPermission('viewAllBookings')}
          >
            {hasPermission('viewAllBookings') && <option value="all">All Sales</option>}
            {salesStaff.filter(s => s.isActive).filter(s => {
              if (hasPermission('viewAllBookings')) return true;
              return s.userId === userProfile?.uid;
            }).map(s => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Due From</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Due To</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Group By</label>
          <select 
            className="w-full p-3 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-xl outline-none text-sm font-bold border border-primary-100" 
            value={groupBy} 
            onChange={e => setGroupBy(e.target.value as any)}
          >
            <option value="none">No Grouping</option>
            <option value="sales">Sales Representative</option>
            <option value="date">Due Date</option>
          </select>
        </div>
      </div>

      {!dateFilter.start && !dateFilter.end && (
        <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
          {([['today','dueToday'], ['soon','dueSoon'], ['overdue','Overdue'], ['all','allUpcoming']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === key ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600' : 'text-gray-500'}`}>{t(label as any)}</button>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {(Object.entries(groupedDueList) as [string, DueListItem[]][]).map(([groupName, items]) => (
          <div key={groupName}>
            {groupBy !== 'none' && (
              <div className="flex items-center gap-4 mb-4">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 bg-gray-50 dark:bg-gray-800 px-4 py-1 rounded-full border dark:border-gray-700">
                  {groupBy === 'sales' ? <i className="fas fa-user-tie mr-2"></i> : <i className="fas fa-calendar-alt mr-2"></i>}
                  {groupName} ({items.length})
                </h2>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) => (
                <InstallmentCard 
                  key={`${item.plan.bookingId}-${item.index}`}
                  item={item}
                  userProfile={userProfile}
                  hasPermission={hasPermission}
                  onMarkNotified={handleMarkNotified}
                  onToggleDelayContacted={handleToggleDelayContacted}
                  onPay={(pid, idx, amt) => setPaymentModal({ planId: pid, index: idx, amount: amt })}
                  onReschedule={(pid, idx, b) => setDelayModal({ planId: pid, index: idx, booking: b })}
                  onUpdateDelayTracking={(i) => {
                    const fullPlan = plans.find(p => p.bookingId === i.plan.bookingId);
                    setDelayTrackingModal({ planId: i.plan.bookingId, index: i.index, inst: i.inst, booking: i.booking });
                    setDelayTrackingData({ 
                      reason: i.inst.delayReason || i.inst.rescheduleReason || '', 
                      newDate: i.inst.dueDate,
                      installments: fullPlan?.installments || []
                    });
                  }}
                  toggleSalesReminder={handleToggleSalesReminder}
                  toggleSupervisorVerify={handleToggleSupervisorVerify}
                  onAddNote={(pid, idx) => {
                    const noteText = prompt("Add a note to this installment:");
                    if (noteText && userProfile) {
                      const addNoteHandler = async () => {
                         await addInstallmentNote(pid, idx, { text: noteText, uid: userProfile.uid, name: userProfile.displayName });
                         fetchData();
                      };
                      addNoteHandler();
                    }
                  }}
                  onViewHistory={(b) => {
                    setActiveHistoryBooking(b);
                    setHistoryModalOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {filteredDueList.length === 0 && !loading && <div className="py-20 text-center text-gray-400 italic font-medium">No results matching your filters.</div>}
      </div>

      {/* Enhanced Reschedule Modal */}
      {delayModal && statsForDelay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tight">إعادة جدولة الأقساط</h2>
                <button onClick={() => setDelayModal(null)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-6 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border dark:border-gray-600">
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">إجمالي المتبقي</p>
                    <p className="text-sm font-bold text-red-500">{statsForDelay.remaining.toLocaleString()} ج.م</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">أقساط مدفوعة</p>
                    <p className="text-sm font-bold text-green-600">{statsForDelay.paid}</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">أقساط متبقية</p>
                    <p className="text-sm font-bold text-primary-600">{statsForDelay.pending}</p>
                </div>
            </div>

            {/* Smart Intervals Option */}
            <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-[1.5rem] mb-6 border border-amber-200 dark:border-amber-900/50">
                <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={useUniformInterval} 
                            onChange={e => setUseUniformInterval(e.target.checked)} 
                            className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500" 
                        />
                        <span className="text-xs font-black text-amber-700 uppercase">تفعيل فواصل زمنية ثابتة</span>
                    </label>
                    {useUniformInterval && (
                        <span className="text-[9px] font-bold text-amber-600 bg-white px-2 py-1 rounded-full shadow-sm">ترحيل بناءً على عدد الأيام</span>
                    )}
                </div>
                {useUniformInterval && (
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-amber-600 w-24">عدد الأيام الفاصلة:</span>
                        <input 
                            type="number" 
                            className="flex-1 p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-xs font-black" 
                            value={uniformDays} 
                            onChange={e => setUniformDays(Number(e.target.value))} 
                        />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">تعديل عدد الأقساط المتبقية</label>
                    <input 
                        type="number" 
                        min="1" 
                        className="w-full p-3 bg-primary-50 dark:bg-primary-900/20 text-primary-600 font-bold rounded-xl outline-none border border-primary-100" 
                        value={delayData.newCount} 
                        onChange={e => handleUpdateCount(Number(e.target.value))} 
                    />
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">سبب التعديل / التأجيل</label>
                    <input 
                        type="text" 
                        className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" 
                        value={delayData.reason} 
                        onChange={e => setDelayData({...delayData, reason: e.target.value})} 
                        placeholder="اختياري..."
                    />
                </div>
            </div>

            <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">قائمة الأقساط (تعديل التاريخ يرحل ما بعده تلقائياً)</label>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded italic ${useUniformInterval ? 'text-amber-600 bg-amber-50' : 'text-primary-600 bg-primary-50'}`}>
                        {useUniformInterval ? 'Fixed Interval Mode' : 'Smart Delta Mode'}
                    </span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar border-y dark:border-gray-700 py-4">
                    {reschedulePlan.map((inst, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600 hover:border-primary-300 transition-all">
                            <span className="w-8 text-[10px] font-black text-gray-400 text-center">#{idx+1}</span>
                            <div className="flex-1">
                                <input 
                                    type="date" 
                                    className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500" 
                                    value={inst.dueDate} 
                                    onChange={e => handleLocalEdit(idx, 'dueDate', e.target.value)} 
                                />
                            </div>
                            <div className="w-28">
                                <input 
                                    type="number" 
                                    className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none font-bold text-center" 
                                    value={inst.amount} 
                                    onChange={e => handleLocalEdit(idx, 'amount', e.target.value)} 
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between text-[10px] font-bold text-gray-400 px-2">
                    <span>إجمالي الخطة:</span>
                    <span className={Math.abs(reschedulePlan.reduce((s,i)=>s+i.amount,0) - statsForDelay.remaining) < 1 ? 'text-green-600' : 'text-red-500'}>
                        {reschedulePlan.reduce((s,i)=>s+i.amount,0).toLocaleString()} / {statsForDelay.remaining.toLocaleString()} ج.م
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <button 
                    onClick={handleReschedule} 
                    disabled={isProcessing || Math.abs(reschedulePlan.reduce((s,i)=>s+i.amount,0) - statsForDelay.remaining) > 1} 
                    className="w-full py-4 bg-primary-600 text-white rounded-2xl font-black shadow-lg shadow-primary-500/20 uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95 transition-all"
                >
                    {isProcessing ? 'جاري الحفظ...' : 'حفظ وإعادة الجدولة الذكية'}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Delay Tracking Modal */}
      {delayTrackingModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight">متابعة تأخير القسط</h2>
              <button onClick={() => setDelayTrackingModal(null)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-6 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border dark:border-gray-600">
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">إجمالي المتبقي</p>
                    <p className="text-sm font-bold text-red-500">{delayTrackingModal.booking.paymentSummary.remaining.toLocaleString()} ج.م</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">أقساط مدفوعة</p>
                    <p className="text-sm font-bold text-green-600">{delayTrackingData.installments.filter(i => i.status === 'paid').length}</p>
                </div>
                <div className="text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">أقساط متبقية</p>
                    <p className="text-sm font-bold text-primary-600">{delayTrackingData.installments.filter(i => i.status !== 'paid' && i.status !== 'cancelled').length}</p>
                </div>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-[1.5rem] border border-amber-200 dark:border-amber-900/50">
                <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={useUniformInterval} 
                            onChange={e => setUseUniformInterval(e.target.checked)} 
                            className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500" 
                        />
                        <span className="text-xs font-black text-amber-700 uppercase">تفعيل فواصل زمنية ثابتة</span>
                    </label>
                </div>
                {useUniformInterval && (
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-amber-600 w-24">عدد الأيام الفاصلة:</span>
                        <input 
                            type="number" 
                            className="flex-1 p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-xs font-black" 
                            value={uniformDays} 
                            onChange={e => setUniformDays(Number(e.target.value))} 
                        />
                    </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">سبب التأخير / ما تم الاتفاق عليه</label>
                <textarea 
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm min-h-[80px] resize-none border border-transparent focus:border-amber-500" 
                  value={delayTrackingData.reason} 
                  onChange={e => setDelayTrackingData({...delayTrackingData, reason: e.target.value})} 
                  placeholder="اكتب هنا تفاصيل التواصل مع العميل..."
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">قائمة الأقساط (تعديل التاريخ يرحل ما بعده تلقائياً)</label>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar border-y dark:border-gray-700 py-4">
                    {delayTrackingData.installments.map((inst, idx) => (
                        <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${idx === delayTrackingModal.index ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700/50 border-transparent dark:border-gray-600'}`}>
                            <span className="w-8 text-[10px] font-black text-gray-400 text-center">#{idx+1}</span>
                            <div className="flex-1">
                                <input 
                                    type="date" 
                                    className={`w-full p-2 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 ${inst.status === 'paid' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`} 
                                    value={inst.dueDate} 
                                    onChange={e => handleDelayTrackingLocalEdit(idx, 'dueDate', e.target.value)} 
                                    disabled={inst.status === 'paid'}
                                />
                            </div>
                            <div className="w-28">
                                <input 
                                    type="number" 
                                    className={`w-full p-2 rounded-lg text-xs outline-none font-bold text-center ${inst.status === 'paid' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`} 
                                    value={inst.amount} 
                                    onChange={e => handleDelayTrackingLocalEdit(idx, 'amount', e.target.value)} 
                                    disabled={inst.status === 'paid'}
                                />
                            </div>
                            <div className="w-16 text-center">
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${inst.status === 'paid' ? 'bg-green-100 text-green-600' : inst.status === 'delayed' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {inst.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 rtl:space-x-reverse">
                <button 
                  onClick={() => setDelayTrackingModal(null)} 
                  className="px-6 py-2 font-bold text-gray-400" 
                  disabled={isProcessing}
                >
                  إلغاء
                </button>
                <button 
                  onClick={handleUpdateDelayTracking} 
                  className="px-8 py-3 bg-amber-600 text-white rounded-xl font-black shadow-lg shadow-amber-500/20 disabled:opacity-50" 
                  disabled={isProcessing || !delayTrackingData.reason}
                >
                  {isProcessing ? 'جاري الحفظ...' : 'حفظ البيانات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">تحصيل قسط</h2>
            <div className="space-y-4">
              <input type="number" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-bold text-lg" value={paymentModal.amount} readOnly />
              <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border-2 border-transparent focus:border-primary-500 font-medium" value={paymentData.method} onChange={e => setPaymentData({...paymentData, method: e.target.value as any})}><option value="cash_office">Office Cash</option><option value="vodafone_cash">Vodafone Cash</option><option value="instapay">InstaPay</option><option value="etisalat_cash">Etisalat Cash</option><option value="paypal">PayPal</option></select>
              <input type="text" placeholder="رقم المرجع..." className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none" value={paymentData.ref} onChange={e => setPaymentData({...paymentData, ref: e.target.value})} />
              <input type="text" placeholder="رابط الإيصال (اختياري)..." className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none" value={paymentData.receiptLink} onChange={e => setPaymentData({...paymentData, receiptLink: e.target.value})} />
              <textarea placeholder="ملاحظات / سبب التأخير (إلزامي في حالة التأخير)..." className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none min-h-[80px]" value={paymentData.note} onChange={e => setPaymentData({...paymentData, note: e.target.value})} />
              <div className="flex justify-end space-x-3 pt-6"><button onClick={() => setPaymentModal(null)} className="px-6 py-2 font-bold text-gray-400" disabled={isProcessing}>إلغاء</button><button onClick={handlePay} className="px-8 py-3 bg-green-600 text-white rounded-xl font-black shadow-lg shadow-green-500/20" disabled={isProcessing}>{isProcessing ? 'جاري...' : 'تأكيد التحصيل'}</button></div>
            </div>
          </div>
        </div>
      )}

      <HistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setHistoryModalOpen(false)} 
        booking={activeHistoryBooking} 
        customers={customers} 
        onDataChanged={fetchData}
      />
    </div>
  );
};

export default Installments;
