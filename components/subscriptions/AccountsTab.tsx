import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { SubscriptionAccount, SubscriptionType, PaymentMethod, CustomerSubscription, PreRegisteredAccount } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { sortAccountsByPriority, formatAccountDaysRemainingLabel } from './utils';

interface AccountsTabProps {
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  methods: PaymentMethod[];
  customerSubs: CustomerSubscription[];
  preRegisteredAccounts?: PreRegisteredAccount[];
  loading: boolean;
  onRefresh: () => void;
  canManage: boolean;
  onSetTab?: (tabId: string) => void;
}

export function AccountsTab({
  accounts,
  types,
  methods,
  customerSubs,
  preRegisteredAccounts = [],
  loading,
  onRefresh,
  canManage,
  onSetTab
}: AccountsTabProps) {
  const lang = 'ar';
  const { userProfile } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SubscriptionAccount | null>(null);

  // Password visibility state
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const [visibleMasterPasswords, setVisibleMasterPasswords] = useState<{ [id: string]: boolean }>({});

  // Copy feedback state
  const [copiedKeys, setCopiedKeys] = useState<{ [key: string]: boolean }>({});
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeys(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedKeys(prev => ({ ...prev, [key]: false }));
    }, 1500);
  };

  // Form states
  const [typeId, setTypeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [baseCost, setBaseCost] = useState(0);
  const [cost, setCost] = useState(0);
  const [billingDate, setBillingDate] = useState('');
  const [maxSeats, setMaxSeats] = useState(5);
  const [status, setStatus] = useState<'active' | 'suspended' | 'expired' | 'restricted' | 'reserved'>('active');
  const [notes, setNotes] = useState('');
  const [isReserved, setIsReserved] = useState(false);
  const [reservationReason, setReservationReason] = useState('');
  const [selectedPreRegisteredId, setSelectedPreRegisteredId] = useState('');

  // Account Trial & Payment period states
  const [hasTrial, setHasTrial] = useState(false);
  const [trialPeriod, setTrialPeriod] = useState<'none' | '1_week' | '3_months' | 'custom'>('none');
  const [trialDays, setTrialDays] = useState(7);
  const [trialStartDate, setTrialStartDate] = useState('');
  const [trialEndDate, setTrialEndDate] = useState('');
  const [isPaid, setIsPaid] = useState(true);

  // Required Cancellation States (حسابات ملزمة بالإلغاء قبل موعد محدد)
  const [requiresCancellation, setRequiresCancellation] = useState(false);
  const [cancellationDeadline, setCancellationDeadline] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');

  // Transfer modal state for restricted / reassigning accounts
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [sourceAccountForReassign, setSourceAccountForReassign] = useState<SubscriptionAccount | null>(null);
  const [targetAccountIdForReassign, setTargetAccountIdForReassign] = useState('');
  const [customerModes, setCustomerModes] = useState<{ [subId: string]: 'transfer' | 'refund' }>({});
  const [customerTargetAccounts, setCustomerTargetAccounts] = useState<{ [subId: string]: string }>({});

  // Adobe verification state
  const [adobeVerified, setAdobeVerified] = useState(false);
  const [adobeVerifiedBy, setAdobeVerifiedBy] = useState('');

  const toggleMasterPasswordVisibility = (id: string) => {
    setVisibleMasterPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePasswordVisibility = async (id: string, emailStr: string) => {
    const isNowVisible = !visiblePasswords[id];
    setVisiblePasswords(prev => ({ ...prev, [id]: isNowVisible }));

    if (isNowVisible) {
      try {
        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'PASSWORD_VIEWED',
          description: `User viewed password for subscription account (${emailStr})`,
          performedBy: 'Authorized Staff',
          performedByEmail: ''
        });
      } catch (err) {
        console.error('Failed to log audit log:', err);
      }
    }
  };

  // Helper to calculate trial dates & next billing date
  const updateTrialCalculation = (period: 'none' | '1_week' | '3_months' | 'custom', customD?: number) => {
    setTrialPeriod(period);
    if (period === 'none') {
      setHasTrial(false);
      return;
    }
    setHasTrial(true);
    const start = new Date();
    setTrialStartDate(start.toISOString().split('T')[0]);

    let days = 7;
    if (period === '1_week') days = 7;
    else if (period === '3_months') days = 90;
    else if (period === 'custom') days = customD !== undefined ? customD : trialDays;

    const end = new Date();
    end.setDate(end.getDate() + days);
    const endStr = end.toISOString().split('T')[0];
    setTrialEndDate(endStr);
    
    // Set first billing date after trial ends
    setBillingDate(endStr);

    // Sync cancellation deadline if cancellation is required
    if (requiresCancellation) {
      setCancellationDeadline(endStr);
    }
  };

  const openAddModal = () => {
    setEditingAccount(null);
    const initialTypeId = types[0]?.id || '';
    setTypeId(initialTypeId);
    setSelectedPreRegisteredId('');
    setEmail('');
    setPassword('');
    setMasterPassword('');
    setPaymentMethodId(methods[0]?.id || '');
    setBaseCost(0);
    setCost(0);
    setBillingDate('');
    setMaxSeats(5);
    setStatus('active');
    setNotes('');
    setIsReserved(false);
    setReservationReason('');
    setAdobeVerified(false);
    setAdobeVerifiedBy('');
    setHasTrial(false);
    setTrialPeriod('none');
    setTrialDays(7);
    setTrialStartDate('');
    setTrialEndDate('');
    setIsPaid(true);
    setRequiresCancellation(false);
    setCancellationDeadline('');
    setCancellationReason('');
    setModalOpen(true);
  };

  const openEditModal = (acc: SubscriptionAccount) => {
    setEditingAccount(acc);
    setTypeId(acc.typeId || '');
    setEmail(acc.email || '');
    setPassword(acc.password || '');
    setMasterPassword(acc.masterPassword || '');
    setPaymentMethodId(acc.paymentMethodId || '');
    const currentCost = acc.cost || 0;
    const savedBase = (acc as any).baseCost !== undefined ? (acc as any).baseCost : Math.round((currentCost / 1.17) * 100) / 100;
    setBaseCost(savedBase);
    setCost(currentCost);
    setBillingDate(acc.billingDate || '');
    setMaxSeats(acc.maxSeats || 5);
    setStatus(acc.status || 'active');
    setNotes(acc.notes || '');
    setIsReserved(acc.isReserved || acc.status === 'reserved');
    setReservationReason(acc.reservationReason || '');
    setAdobeVerified(acc.adobeVerified || false);
    setAdobeVerifiedBy(acc.adobeVerifiedBy || '');
    setSelectedPreRegisteredId('');

    setHasTrial(acc.hasTrial || false);
    setTrialPeriod(acc.trialPeriod || 'none');
    setTrialDays(acc.trialDays || 7);
    setTrialStartDate(acc.trialStartDate || '');
    setTrialEndDate(acc.trialEndDate || '');
    setIsPaid(acc.isPaid !== false);

    setRequiresCancellation(acc.requiresCancellation || false);
    setCancellationDeadline(acc.cancellationDeadline || acc.trialEndDate || acc.billingDate || '');
    setCancellationReason(acc.cancellationReason || '');

    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !typeId) return;

    // Count currently assigned seats (cannot exceed maxSeats)
    const assignedSeatsCount = customerSubs.filter(s => s.accountId === editingAccount?.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);

    // Calculate final cost including 14% VAT and 3% procurement fee
    const finalCalculatedCost = Math.round(Number(baseCost) * 1.17 * 100) / 100;

    const data: any = {
      typeId,
      email,
      password,
      paymentMethodId,
      baseCost: Number(baseCost),
      cost: finalCalculatedCost,
      billingDate,
      maxSeats: Number(maxSeats),
      activeSeats: assignedSeatsCount,
      status,
      notes,
      isReserved: status === 'reserved' || isReserved,
      reservationReason: (status === 'reserved' || isReserved) ? (reservationReason || 'استخدام داخلي للأكاديمية / تحت الاختبار') : '',
      adobeVerified,
      adobeVerifiedBy: adobeVerified ? (adobeVerifiedBy || userProfile?.displayName || 'Authorized Staff') : '',
      hasTrial,
      trialPeriod,
      trialDays: Number(trialDays),
      trialStartDate,
      trialEndDate,
      firstBillingDate: billingDate,
      isPaid,
      requiresCancellation: requiresCancellation,
      cancellationDeadline: requiresCancellation ? (cancellationDeadline.trim() || trialEndDate || billingDate || '') : '',
      cancellationReason: requiresCancellation ? cancellationReason : '',
      cancellationConfirmed: requiresCancellation ? (editingAccount?.cancellationConfirmed || false) : false,
      createdAt: editingAccount?.createdAt || new Date().toISOString()
    };

    if (canManage) {
      data.masterPassword = masterPassword;
    }

    try {
      if (editingAccount) {
        await updateDoc(doc(db, 'subscriptionAccounts', editingAccount.id), data);
        
        // Log sensitive account details update
        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'ACCOUNT_UPDATED',
          description: `Updated details for subscription account ${email}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      } else {
        await addDoc(collection(db, 'subscriptionAccounts'), data);

        // Update pre-registered account status to paid so it is no longer shown in the pool
        if (selectedPreRegisteredId) {
          await updateDoc(doc(db, 'preRegisteredAccounts', selectedPreRegisteredId), {
            status: 'paid',
            updatedAt: new Date().toISOString()
          });
        }

        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'ACCOUNT_CREATED',
          description: `Registered new subscription account ${email}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error saving subscription account:', err);
    }
  };

  // Reassign all active customers from restricted/selected source account to target account
  const handleConfirmBatchReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountForReassign || !targetAccountIdForReassign) return;

    const sourceAccountId = sourceAccountForReassign.id;
    const targetAcc = accounts.find(a => a.id === targetAccountIdForReassign);
    if (!targetAcc) return;

    const customersToMove = customerSubs.filter(s => s.accountId === sourceAccountId && s.status === 'active');
    if (customersToMove.length === 0) {
      alert(lang === 'ar' ? 'لا يوجد عملاء نشطين مسكنين على هذا الحساب لنقلهم.' : 'No active customers to transfer.');
      return;
    }

    try {
      // Transfer each customer subscription
      for (const sub of customersToMove) {
        await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
          accountId: targetAccountIdForReassign
        });
      }

      // Recalculate seats
      const newTargetActiveSeats = customerSubs
        .filter(s => s.accountId === targetAccountIdForReassign && s.status === 'active')
        .reduce((sum, s) => sum + (s.seatsCount || 1), 0) + customersToMove.reduce((sum, s) => sum + (s.seatsCount || 1), 0);

      await updateDoc(doc(db, 'subscriptionAccounts', sourceAccountId), { activeSeats: 0 });
      await updateDoc(doc(db, 'subscriptionAccounts', targetAccountIdForReassign), { activeSeats: newTargetActiveSeats });

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'RESTRICTED_ACCOUNT_CUSTOMERS_REASSIGNED',
        description: `Reassigned ${customersToMove.length} customers from restricted account ${sourceAccountForReassign.email} to active account ${targetAcc.email}`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      setReassignModalOpen(false);
      setSourceAccountForReassign(null);
      setTargetAccountIdForReassign('');
      onRefresh();
      alert(lang === 'ar' ? `تم تحويل ${customersToMove.length} عميل بنجاح إلى الحساب الجديد: ${targetAcc.email}` : `Successfully transferred ${customersToMove.length} customers to ${targetAcc.email}`);
    } catch (err) {
      console.error('Error batch reassigning customers:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء نقل العملاء.' : 'Error transferring customers.');
    }
  };

  // Helper to calculate pro-rata refund for a subscription on a restricted account
  const calcProRataRefund = (sub: CustomerSubscription) => {
    const paidAmount = sub.price || 0;
    
    const start = new Date(sub.startDate || new Date().toISOString().split('T')[0]);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(sub.endDate || new Date().toISOString().split('T')[0]);
    end.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalMs = Math.max(0, end.getTime() - start.getTime());
    const totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)));

    const usedMs = Math.max(0, today.getTime() - start.getTime());
    const daysUsed = Math.min(totalDays, Math.max(0, Math.floor(usedMs / (1000 * 60 * 60 * 24))));

    const dailyRate = paidAmount / totalDays;
    const usedValue = Math.round(daysUsed * dailyRate);
    const refundAmount = Math.max(0, Math.round(paidAmount - usedValue));

    return {
      paidAmount,
      totalDays,
      daysUsed,
      usedValue,
      refundAmount,
      startDateStr: sub.startDate || start.toISOString().split('T')[0],
      endDateStr: sub.endDate || end.toISOString().split('T')[0]
    };
  };

  // Individual customer transfer handler
  const handleSingleTransfer = async (sub: CustomerSubscription, targetAccId: string) => {
    if (!targetAccId) {
      alert(lang === 'ar' ? 'يرجى اختيار الحساب البديل أولاً' : 'Please select target account first');
      return;
    }
    const targetAcc = accounts.find(a => a.id === targetAccId);
    if (!targetAcc) return;

    try {
      await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
        accountId: targetAccId
      });

      if (sourceAccountForReassign) {
        const activeSourceSeats = customerSubs
          .filter(s => s.accountId === sourceAccountForReassign.id && s.id !== sub.id && s.status === 'active')
          .reduce((sum, s) => sum + (s.seatsCount || 1), 0);
        await updateDoc(doc(db, 'subscriptionAccounts', sourceAccountForReassign.id), { activeSeats: activeSourceSeats });
      }

      const activeTargetSeats = customerSubs
        .filter(s => s.accountId === targetAccId && s.status === 'active')
        .reduce((sum, s) => sum + (s.seatsCount || 1), 0) + (sub.seatsCount || 1);
      await updateDoc(doc(db, 'subscriptionAccounts', targetAccId), { activeSeats: activeTargetSeats });

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'SINGLE_CUSTOMER_REASSIGNED',
        description: `Reassigned customer ${sub.customerName} from ${sourceAccountForReassign?.email} to ${targetAcc.email}`,
        performedBy: userProfile?.displayName || 'Staff',
        performedByEmail: ''
      });

      onRefresh();
      alert(lang === 'ar' ? `تم تحويل العميل ${sub.customerName} بنجاح إلى ${targetAcc.email}` : `Transferred ${sub.customerName} to ${targetAcc.email}`);
    } catch (err) {
      console.error('Error single transfer:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء تحويل العميل' : 'Error transferring customer');
    }
  };

  // Individual customer refund handler
  const handleSingleRefund = async (sub: CustomerSubscription) => {
    const { refundAmount, daysUsed, totalDays } = calcProRataRefund(sub);
    
    if (!confirm(lang === 'ar' 
      ? `تأكيد إجراء الاسترداد والخصم من الإيرادات:\n\nالعميل: ${sub.customerName}\nمبلغ الـ Refund المسترد: ${refundAmount} ج.م\nأيام الاستهلاك: ${daysUsed} من أصل ${totalDays} يوم\n\nهل أنت تأكد من تسجيل عملية الـ Refund وتأكيد الخصم؟`
      : `Confirm refund of ${refundAmount} EGP for ${sub.customerName}?`
    )) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];

      await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
        status: 'canceled',
        refundAmount: refundAmount,
        refundDate: todayStr,
        refundReason: 'Restricted account refund'
      });

      if (refundAmount > 0) {
        await addDoc(collection(db, 'programSubscriptionRevenues'), {
          customerSubId: sub.id,
          amount: -refundAmount,
          date: todayStr,
          note: `خصم استرداد (Refund) للعميل ${sub.customerName} (${daysUsed}/${totalDays} يوم مستهلك) - حساب محظور (${sourceAccountForReassign?.email})`
        });
      }

      if (sourceAccountForReassign) {
        const activeSourceSeats = customerSubs
          .filter(s => s.accountId === sourceAccountForReassign.id && s.id !== sub.id && s.status === 'active')
          .reduce((sum, s) => sum + (s.seatsCount || 1), 0);
        await updateDoc(doc(db, 'subscriptionAccounts', sourceAccountForReassign.id), { activeSeats: activeSourceSeats });
      }

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'CUSTOMER_REFUND_DONE',
        description: `Processed refund of ${refundAmount} EGP for ${sub.customerName}`,
        performedBy: userProfile?.displayName || 'Staff',
        performedByEmail: ''
      });

      onRefresh();
      alert(lang === 'ar' ? `تم تأكيد الاسترداد للعميل ${sub.customerName} بنجاح وتم الخصم من الإيرادات!` : `Refund recorded successfully.`);
    } catch (err) {
      console.error('Error processing refund:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء تسجيل الاسترداد' : 'Error processing refund');
    }
  };

  const handleDelete = async (acc: SubscriptionAccount) => {
    const assignedSeats = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active').length;
    if (assignedSeats > 0) {
      alert(lang === 'ar' 
        ? `لا يمكن حذف هذا الحساب لأنه مرتبط بـ ${assignedSeats} اشتراك نشط للعملاء. يرجى نقلهم أولاً.`
        : `Cannot delete account because it has ${assignedSeats} active customer seats. Please reassign them first.`
      );
      return;
    }
    if (!confirm(lang === 'ar' ? `هل أنت تأكد من حذف الحساب ${acc.email}؟` : `Are you sure you want to delete ${acc.email}?`)) return;

    try {
      await deleteDoc(doc(db, 'subscriptionAccounts', acc.id));
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'ACCOUNT_DELETED',
        description: `Deleted subscription account ${acc.email}`,
        performedBy: 'Staff',
        performedByEmail: ''
      });
      onRefresh();
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  // Search, filter, and sorting states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [filterPaymentType, setFilterPaymentType] = useState<'all' | 'paid' | 'trial'>('all');
  const [sortBy, setSortBy] = useState('newest_added');

  // Filter and sort accounts
  const filteredAccounts = React.useMemo(() => {
    let list = accounts.filter(acc => {
      const matchesSearch = (acc.email || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (acc.notes && acc.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = selectedTypeFilter === 'all' || acc.typeId === selectedTypeFilter;
      const matchesStatus = selectedStatusFilter === 'all' 
        || acc.status === selectedStatusFilter 
        || (selectedStatusFilter === 'reserved' && (acc.status === 'reserved' || acc.isReserved));

      const isAccountTrial = acc.isPaid === false || acc.hasTrial === true || (acc.trialPeriod && acc.trialPeriod !== 'none');
      const matchesPaymentType = filterPaymentType === 'all'
        || (filterPaymentType === 'paid' && !isAccountTrial)
        || (filterPaymentType === 'trial' && isAccountTrial);

      return matchesSearch && matchesType && matchesStatus && matchesPaymentType;
    });

    list.sort((a, b) => {
      const activeA = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      const activeB = customerSubs.filter(s => s.accountId === b.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      const openSeatsA = (a.maxSeats || 0) - activeA;
      const openSeatsB = (b.maxSeats || 0) - activeB;

      if (selectedStatusFilter === 'restricted' || sortBy === 'refund_desc') {
        const activeSubsA = customerSubs.filter(s => s.accountId === a.id && s.status === 'active');
        const activeSubsB = customerSubs.filter(s => s.accountId === b.id && s.status === 'active');
        const refundA = activeSubsA.reduce((sum, sub) => sum + calcProRataRefund(sub).refundAmount, 0);
        const refundB = activeSubsB.reduce((sum, sub) => sum + calcProRataRefund(sub).refundAmount, 0);
        if (refundB !== refundA) {
          return refundB - refundA;
        }
      }

      if (sortBy === 'alphabetical') {
        return (a.email || '').localeCompare(b.email || '');
      }
      if (sortBy === 'newest_added') {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      }
      if (sortBy === 'availability_desc') {
        if (openSeatsB !== openSeatsA) {
          return openSeatsB - openSeatsA;
        }
        return (a.email || '').localeCompare(b.email || '');
      }
      if (sortBy === 'availability_asc') {
        if (openSeatsA !== openSeatsB) {
          return openSeatsA - openSeatsB;
        }
        return (a.email || '').localeCompare(b.email || '');
      }
      if (sortBy === 'renewal_date') {
        const dateA = a.billingDate || '9999-12-31';
        const dateB = b.billingDate || '9999-12-31';
        return dateA.localeCompare(dateB);
      }
      if (sortBy === 'program_name') {
        const typeA = types.find(t => t.id === a.typeId)?.name || '';
        const typeB = types.find(t => t.id === b.typeId)?.name || '';
        return typeA.localeCompare(typeB, 'ar');
      }
      return 0;
    });

    return list;
  }, [accounts, searchTerm, selectedTypeFilter, selectedStatusFilter, filterPaymentType, sortBy, customerSubs, types]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'حسابات تراخيص البرامج المشتراة' : 'Software Subscription Accounts'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' ? 'إدارة وتتبع بيانات حسابات البرامج المشتركة، مثل الإيميل، كلمة المرور، وتاريخ التجديد القادم.' : 'Track logins, passwords, billing cards, next renewal dates, and seats usage.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white font-black text-xs hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-plus"></i>
            {lang === 'ar' ? 'إضافة حساب جديد' : 'Add New Account'}
          </button>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input
            type="text"
            placeholder={lang === 'ar' ? 'البحث بالبريد الإلكتروني أو الملاحظات...' : 'Search by email or notes...'}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-3">
          {/* Sorting Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 rounded-xl border border-transparent">
            <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{lang === 'ar' ? 'ترتيب حسب:' : 'Sort by:'}</span>
            <select
              className="bg-transparent text-xs font-bold outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="newest_added">{lang === 'ar' ? 'المُضاف حديثاً' : 'Newest Added'}</option>
              <option value="refund_desc">{lang === 'ar' ? 'إجمالي الـ Refund (الأعلى أولاً)' : 'Total Refund (Highest First)'}</option>
              <option value="alphabetical">{lang === 'ar' ? 'أبجدي (حسب الإيميل)' : 'Alphabetical (Email)'}</option>
              <option value="availability_desc">{lang === 'ar' ? 'حسب الإتاحة (الأماكن الفاضية أولاً)' : 'Available Open Seats First'}</option>
              <option value="availability_asc">{lang === 'ar' ? 'الأكثر إشغالاً' : 'Fullest Accounts First'}</option>
              <option value="renewal_date">{lang === 'ar' ? 'تاريخ التجديد القادم' : 'Renewal Date'}</option>
              <option value="program_name">{lang === 'ar' ? 'حسب نوع البرنامج' : 'By Program'}</option>
            </select>
          </div>

          <select
            className="p-2 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
            value={selectedTypeFilter}
            onChange={e => setSelectedTypeFilter(e.target.value)}
          >
            <option value="all">{lang === 'ar' ? 'كل أنواع البرامج' : 'All Programs'}</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <select
            className="p-2 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
            value={filterPaymentType}
            onChange={e => setFilterPaymentType(e.target.value as 'all' | 'paid' | 'trial')}
          >
            <option value="all">{lang === 'ar' ? 'نوع الحساب (الكل)' : 'All Payment Types'}</option>
            <option value="paid">{lang === 'ar' ? '💳 حسابات مدفوعة (Paid)' : 'Paid Accounts'}</option>
            <option value="trial">{lang === 'ar' ? '🎁 تجريبي / فترات تجريبية (Trial Period)' : 'Trial Period'}</option>
          </select>

          <select
            className="p-2 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
            value={selectedStatusFilter}
            onChange={e => setSelectedStatusFilter(e.target.value)}
          >
            <option value="all">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
            <option value="active">{lang === 'ar' ? 'نشط (Active)' : 'Active'}</option>
            <option value="reserved">{lang === 'ar' ? '🔒 محجوز للاستخدام الداخلي (Reserved)' : '🔒 Reserved'}</option>
            <option value="restricted">{lang === 'ar' ? 'محظور / مقيد (Restricted)' : 'Restricted'}</option>
            <option value="suspended">{lang === 'ar' ? 'موقوف (Suspended)' : 'Suspended'}</option>
            <option value="expired">{lang === 'ar' ? 'منتهي (Expired)' : 'Expired'}</option>
          </select>
        </div>
      </div>

      {/* Banner for Restricted Accounts */}
      {accounts.some(a => a.status === 'restricted') && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 font-bold">
              <i className="fas fa-ban text-lg"></i>
            </div>
            <div>
              <h4 className="text-xs font-black text-rose-900 dark:text-rose-200">
                {lang === 'ar' ? '⚠️ تنبيه: يوجد حسابات ترخيص مقيدة (Restricted)' : '⚠️ Warning: Some licensing accounts are restricted'}
              </h4>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                {lang === 'ar' ? 'يمكنك تحويل العملاء المسكنين عليها فوراً إلى حسابات نشطة أخرى متاحة.' : 'You can reassign their active customer seats to other available accounts now.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedStatusFilter('restricted')}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all duration-150 shrink-0"
          >
            {lang === 'ar' ? 'عرض الحسابات المقيدة' : 'View Restricted'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-gray-400 font-bold">
          {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'نوع البرنامج' : 'Software Type'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'البريد الإلكتروني' : 'Login Email'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</th>
                  {canManage && <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الباسورد الرئيسي' : 'Master Password'}</th>}
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'وسيلة الدفع' : 'Billing Card'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">{lang === 'ar' ? 'المقاعد' : 'Seats Utilization'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'التجديد القادم' : 'Next Renewal'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'التكلفة الإجمالية' : 'Total Cost'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  {canManage && <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                {filteredAccounts.map((acc) => {
                  const type = types.find(t => t.id === acc.typeId);
                  const method = methods.find(m => m.id === acc.paymentMethodId);
                  
                  // Calculate active seats count from customer subscriptions
                  const activeSeatsCount = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);

                  return (
                    <tr key={acc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                      <td className="p-4 font-black text-gray-900 dark:text-white">
                        {type?.name || (lang === 'ar' ? 'غير معروف' : 'Unknown')}
                      </td>
                      <td className="p-4 font-mono font-bold text-gray-600 dark:text-gray-300">
                        <div className="flex items-center gap-1.5 group/email">
                          <span>{acc.email}</span>
                          <button
                            onClick={() => handleCopy(acc.email, `${acc.id}-email`)}
                            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-1"
                            title={lang === 'ar' ? 'نسخ البريد الإلكتروني' : 'Copy Email'}
                          >
                            <i className={`fas ${copiedKeys[`${acc.id}-email`] ? 'fa-check text-green-500 animate-bounce' : 'fa-copy text-[11px]'}`}></i>
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 font-sans flex items-center gap-1">
                          <i className="far fa-calendar-alt text-[9px]"></i>
                          <span>{lang === 'ar' ? 'تاريخ الإضافة:' : 'Date Added:'} {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}</span>
                        </div>
                        {acc.adobeVerified ? (
                          <div className="flex items-center gap-1 mt-1 text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 w-fit px-1.5 py-0.5 rounded-lg font-bold font-sans">
                            <i className="fas fa-check-circle text-[10px]"></i>
                            <span>مشترك ومجرب ({acc.adobeVerifiedBy})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-1 text-[9px] text-amber-500 bg-amber-50 dark:bg-amber-950/20 w-fit px-1.5 py-0.5 rounded-lg font-bold font-sans">
                            <i className="fas fa-exclamation-triangle text-[10px]"></i>
                            <span>غير مؤكد بعد</span>
                          </div>
                        )}

                        {(() => {
                          const activeSubsForAcc = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active');
                          const accountRefundTotal = activeSubsForAcc.reduce((sum, s) => sum + calcProRataRefund(s).refundAmount, 0);
                          if (acc.status === 'restricted' || accountRefundTotal > 0) {
                            return (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 w-fit px-2 py-0.5 rounded-lg font-extrabold font-mono shadow-2xs">
                                <i className="fas fa-undo text-[10px] text-amber-600"></i>
                                <span>إجمالي الـ Refund الداخلي: {accountRefundTotal} ج.م ({activeSubsForAcc.length} عميل)</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>
                      <td className="p-4 font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <span>{visiblePasswords[acc.id] ? acc.password : '••••••••'}</span>
                          <div className="flex items-center">
                            <button
                              onClick={() => togglePasswordVisibility(acc.id, acc.email)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                              title={visiblePasswords[acc.id] ? (lang === 'ar' ? 'إخفاء' : 'Hide') : (lang === 'ar' ? 'إظهار' : 'Show')}
                            >
                              <i className={`fas ${visiblePasswords[acc.id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                            <button
                              onClick={() => handleCopy(acc.password, `${acc.id}-password`)}
                              className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-1"
                              title={lang === 'ar' ? 'نسخ كلمة المرور' : 'Copy Password'}
                            >
                              <i className={`fas ${copiedKeys[`${acc.id}-password`] ? 'fa-check text-green-500 animate-bounce' : 'fa-copy text-[11px]'}`}></i>
                            </button>
                          </div>
                        </div>
                      </td>
                      {canManage && (
                        <td className="p-4 font-mono font-bold text-red-600 dark:text-red-400">
                          <div className="flex items-center gap-1.5">
                            <span>{visibleMasterPasswords[acc.id] ? acc.masterPassword || '-' : '••••••••'}</span>
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleMasterPasswordVisibility(acc.id)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                                title={visibleMasterPasswords[acc.id] ? (lang === 'ar' ? 'إخفاء' : 'Hide') : (lang === 'ar' ? 'إظهار' : 'Show')}
                              >
                                <i className={`fas ${visibleMasterPasswords[acc.id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                              </button>
                              {acc.masterPassword && (
                                <button
                                  onClick={() => handleCopy(acc.masterPassword, `${acc.id}-master`)}
                                  className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-1"
                                  title={lang === 'ar' ? 'نسخ الباسورد الرئيسي' : 'Copy Master Password'}
                                >
                                  <i className={`fas ${copiedKeys[`${acc.id}-master`] ? 'fa-check text-green-500 animate-bounce' : 'fa-copy text-[11px]'}`}></i>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-bold">
                        <div>{method?.name || (lang === 'ar' ? 'غير محدد' : 'Not linked')}</div>
                        {method && (method.status === 'suspended' || method.status === 'blocked' || method.isSuspended || method.enabled === false) && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-1.5 py-0.5 rounded-md w-fit">
                              <i className="fas fa-exclamation-triangle text-[9px]"></i>
                              <span>الفيزا متوقفة/محظورة!</span>
                            </span>
                            <span className="text-[9px] text-red-500 font-bold">
                              يجب تغيير الفيزا قبل التجديد
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {acc.status === 'reserved' || acc.isReserved ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-0.5 rounded-lg border border-purple-200 dark:border-purple-900/40 whitespace-nowrap">
                              🔒 غير متاح للحجز ({activeSeatsCount} / {acc.maxSeats})
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold">{activeSeatsCount} / {acc.maxSeats}</span>
                            <div className="w-16 bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-primary-600 h-full rounded-full" 
                                style={{ width: `${(activeSeatsCount / (acc.maxSeats || 1)) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-bold text-gray-700 dark:text-gray-300 font-mono">
                        <div>{acc.billingDate || 'N/A'}</div>
                        {acc.hasTrial && (
                          <div className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-md mt-1 w-fit flex items-center gap-1 font-sans">
                            <i className="fas fa-gift text-[9px]"></i>
                            <span>تجريبي حتى {acc.trialEndDate || acc.billingDate}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-black text-gray-900 dark:text-white font-mono">
                        {(() => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const isInTrial = acc.hasTrial && acc.trialPeriod !== 'none' && acc.trialEndDate && todayStr <= acc.trialEndDate;

                          if (isInTrial) {
                            return (
                              <div className="space-y-0.5">
                                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs block">
                                  0 ر.س <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/40 font-sans">مجاني (فترة تجريبية)</span>
                                </span>
                                <span className="block text-[9px] text-purple-700 dark:text-purple-300 font-bold font-sans">
                                  أول دفعة: {acc.cost || 0} ر.س في {acc.trialEndDate || acc.billingDate}
                                </span>
                              </div>
                            );
                          }

                          if (acc.isPaid === false) {
                            return (
                              <div className="space-y-0.5">
                                <span className="text-amber-600 dark:text-amber-400 font-extrabold text-xs block">
                                  {acc.cost || 0} ر.س
                                </span>
                                <span className="block text-[9px] text-amber-700 dark:text-amber-300 font-extrabold bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded w-fit font-sans">
                                  ⏳ في انتظار الدفع للموقع
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div>
                              <span className="text-xs font-black">{acc.cost || 0} ر.س</span>
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/30 px-1 py-0.5 rounded block w-fit mt-0.5 font-sans">
                                ✓ مدفوع
                              </span>
                              {((acc as any).baseCost !== undefined && (acc as any).baseCost > 0) && (
                                <span className="block text-[9px] text-gray-400 font-normal mt-0.5">
                                  (الأساسي: {(acc as any).baseCost} ر.س + 17%)
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        {acc.status === 'reserved' || acc.isReserved ? (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center gap-1 w-fit">
                              <i className="fas fa-lock text-[10px]"></i>
                              <span>{lang === 'ar' ? '🔒 محجوز' : 'Reserved'}</span>
                            </span>
                            {(acc.reservationReason || acc.notes) && (
                              <span className="block text-[10px] text-purple-800 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-900/40 max-w-[180px] truncate" title={acc.reservationReason || acc.notes}>
                                💡 {acc.reservationReason || acc.notes}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                            acc.status === 'active' 
                              ? 'bg-green-50 text-green-600 dark:bg-green-950/20' 
                              : acc.status === 'restricted'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 font-black'
                              : acc.status === 'suspended'
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                              : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                          }`}>
                            {acc.status === 'restricted' ? (lang === 'ar' ? 'محظور (Restricted)' : 'Restricted') : acc.status}
                          </span>
                        )}

                        {acc.requiresCancellation && (
                          <div className="mt-1">
                            {acc.cancellationConfirmed ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 border border-emerald-200 block w-fit">
                                ✓ تم إلغاؤه
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800 block w-fit truncate max-w-[170px]" title={`يلزم الإلغاء قبل ${acc.cancellationDeadline}: ${acc.cancellationReason}`}>
                                🚫 إلغاء قبل {acc.cancellationDeadline}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      {canManage && (
                        <td className="p-4 text-right">
                          <div className="flex gap-1.5 justify-end items-center">
                            {/* Quick Reserve/Unreserve button */}
                            <button
                              onClick={async () => {
                                const isCurrentlyReserved = acc.status === 'reserved' || acc.isReserved;
                                if (isCurrentlyReserved) {
                                  if (confirm(lang === 'ar' ? 'هل تريد إلغاء حجز هذا الحساب وإعادته لنشط؟' : 'Unreserve this account?')) {
                                    await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
                                      status: 'active',
                                      isReserved: false,
                                      reservationReason: ''
                                    });
                                    onRefresh();
                                  }
                                } else {
                                  const reason = prompt(
                                    lang === 'ar' ? 'أدخل سبب حجز الحساب (مثال: تحت الاختبار، استخدام داخلي):' : 'Enter reservation reason:',
                                    acc.reservationReason || 'استخدام داخلي للأكاديمية'
                                  );
                                  if (reason !== null) {
                                    await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
                                      status: 'reserved',
                                      isReserved: true,
                                      reservationReason: reason.trim() || 'استخدام داخلي للأكاديمية / تحت الاختبار'
                                    });
                                    onRefresh();
                                  }
                                }
                              }}
                              className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                                acc.status === 'reserved' || acc.isReserved
                                  ? 'text-purple-700 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300'
                                  : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                              }`}
                              title={acc.status === 'reserved' || acc.isReserved ? (lang === 'ar' ? 'إلغاء حجز الحساب' : 'Unreserve Account') : (lang === 'ar' ? 'حجز الحساب (الاستخدام الداخلي/الاختبار)' : 'Reserve Account')}
                            >
                              <i className={`fas ${acc.status === 'reserved' || acc.isReserved ? 'fa-lock-open text-purple-600' : 'fa-lock'}`}></i>
                            </button>

                            {activeSeatsCount > 0 && (
                              <button
                                onClick={() => {
                                  setSourceAccountForReassign(acc);
                                  setTargetAccountIdForReassign('');
                                  setReassignModalOpen(true);
                                }}
                                className="px-2 py-1 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40 flex items-center gap-1"
                                title={lang === 'ar' ? 'تحويل العملاء إلى حساب آخر' : 'Reassign Customers'}
                              >
                                <i className="fas fa-exchange-alt text-[10px]"></i>
                                <span className="hidden sm:inline">{lang === 'ar' ? 'تحويل العملاء' : 'Transfer'}</span>
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(acc)}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                              title={lang === 'ar' ? 'تعديل الحساب' : 'Edit Account'}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              onClick={() => handleDelete(acc)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                              title={lang === 'ar' ? 'حذف الحساب' : 'Delete Account'}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 9 : 7} className="text-center py-12 text-xs text-gray-400 font-bold">
                      {lang === 'ar' ? 'لا يوجد حسابات مضافة بعد.' : 'No software subscription accounts registered yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[85vh] flex flex-col my-auto">
            <div className="p-5 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">
                {editingAccount ? (lang === 'ar' ? 'تعديل حساب ترخيص' : 'Edit Subscription Account') : (lang === 'ar' ? 'إضافة حساب جديد' : 'Add Software Account')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'برنامج الترخيص' : 'Software Program'}</label>
                  <select
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={typeId}
                    onChange={e => {
                      const newId = e.target.value;
                      setTypeId(newId);
                      if (!editingAccount) {
                        setSelectedPreRegisteredId('');
                        setEmail('');
                        setPassword('');
                        setMasterPassword('');
                      }
                    }}
                  >
                    {types.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'وسيلة الدفع المستخدمة' : 'Billing Payment Card'}</label>
                  <select
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={paymentMethodId}
                    onChange={e => setPaymentMethodId(e.target.value)}
                  >
                    {methods.map(m => {
                      const isCardBlocked = m.status === 'blocked' || m.status === 'suspended' || m.isSuspended || m.enabled === false;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} {isCardBlocked ? '(⛔ متوقفة / محظورة)' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {(() => {
                    const selectedMethod = methods.find(m => m.id === paymentMethodId);
                    if (selectedMethod && (selectedMethod.status === 'blocked' || selectedMethod.status === 'suspended' || selectedMethod.isSuspended || selectedMethod.enabled === false)) {
                      return (
                        <div className="mt-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                          <i className="fas fa-exclamation-triangle text-sm mt-0.5 shrink-0"></i>
                          <div>
                            <div>تنبيه: هذه البطاقة البنكية ({selectedMethod.name}) متوقفة أو محظورة حالياً!</div>
                            <div className="text-[10px] font-extrabold text-red-500 dark:text-red-300 mt-0.5">
                              يجب اختيار بطاقة بنكية أُخرى نشطة، لأن الحساب لن يتمكن من التجديد التلقائي بهذه الفيزا.
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {!editingAccount ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                      {lang === 'ar' ? 'البريد الإلكتروني الجاهز (Free Tier Pool)' : 'Ready Email (Free Tier Pool)'}
                    </label>
                    {preRegisteredAccounts.filter(acc => acc.typeId === typeId && acc.status === 'free').length > 0 ? (
                      <select
                        required
                        className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                        value={selectedPreRegisteredId}
                        onChange={e => {
                          const idVal = e.target.value;
                          setSelectedPreRegisteredId(idVal);
                          const found = preRegisteredAccounts.find(x => x.id === idVal);
                          if (found) {
                            setEmail(found.email);
                            setPassword(found.password || '');
                            setMasterPassword(found.masterPassword || '');
                          } else {
                            setEmail('');
                            setPassword('');
                            setMasterPassword('');
                          }
                        }}
                      >
                        <option value="">{lang === 'ar' ? '-- اختر بريد إلكتروني جاهز --' : '-- Select a ready email --'}</option>
                        {preRegisteredAccounts
                          .filter(acc => acc.typeId === typeId && acc.status === 'free')
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.email}</option>
                          ))
                        }
                      </select>
                    ) : (
                      <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          {lang === 'ar' ? '⚠️ لا توجد حسابات فري جاهزة متاحة لهذا البرنامج حالياً.' : '⚠️ No ready free accounts available for this program.'}
                        </p>
                        {onSetTab && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalOpen(false);
                              onSetTab('preRegistered');
                            }}
                            className="mt-2 flex items-center gap-2 justify-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-black rounded-xl transition-all duration-200 w-full"
                          >
                            <i className="fas fa-plus"></i>
                            {lang === 'ar' ? 'إضافة إيميل جاهز جديد أولاً' : 'Add New Ready Email First'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedPreRegisteredId && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'البريد الإلكتروني' : 'Login Email'}</label>
                        <input
                          type="text"
                          disabled
                          className="w-full p-3 bg-gray-100 dark:bg-gray-800 text-sm font-bold rounded-xl outline-none cursor-not-allowed opacity-70"
                          value={email}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'كلمة المرور للموقع' : 'Site Password'}</label>
                        <input
                          type="text"
                          disabled
                          className="w-full p-3 bg-gray-100 dark:bg-gray-800 text-sm font-bold rounded-xl outline-none cursor-not-allowed opacity-70"
                          value={password}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'البريد الإلكتروني للحساب' : 'Login Email'}</label>
                    <input
                      type="email"
                      required
                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. adobe@saber.com"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                    <input
                      type="text"
                      required
                      className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Login Password"
                    />
                  </div>
                </div>
              )}

              {canManage && (
                <div className="p-3 bg-red-50/20 dark:bg-red-950/10 border border-red-100/30 dark:border-red-900/20 rounded-2xl">
                  <label className="text-[10px] font-black text-red-500 uppercase block mb-1">
                    {lang === 'ar' ? 'الباسورد الرئيسي (للأدمن فقط - لا يظهر للموظفين)' : 'Master Password (Admin Only - Hidden from staff)'}
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/40 text-sm font-bold rounded-xl outline-none text-red-700 dark:text-red-300"
                    value={masterPassword}
                    onChange={e => setMasterPassword(e.target.value)}
                    placeholder="Admin Master Password"
                    disabled={!editingAccount && !selectedPreRegisteredId}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'سعر التجديد الأساسي' : 'Base Renewal Cost'}</label>
                  <input
                    type="number"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={baseCost}
                    onChange={e => {
                      const base = Number(e.target.value);
                      setBaseCost(base);
                      setCost(Math.round(base * 1.17 * 100) / 100);
                    }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'تاريخ التجديد' : 'Next Renewal'}</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={billingDate}
                    onChange={e => setBillingDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'أقصى عدد مقاعد' : 'Max Seats'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={maxSeats}
                    onChange={e => setMaxSeats(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Automatic Tax & Fee Breakdown Display */}
              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-100/40 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300 space-y-2">
                <div className="font-extrabold flex items-center gap-1.5">
                  <i className="fas fa-calculator text-blue-500 animate-pulse"></i>
                  <span>{lang === 'ar' ? '📊 تفاصيل الرسوم والضرائب التلقائية:' : '📊 Automatic Fees & Taxes Breakdown:'}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-[11px] font-bold">
                  <span>{lang === 'ar' ? 'السعر الأساسي المدخل:' : 'Base Renewal Price Entered:'}</span>
                  <span className="text-left font-mono">{baseCost || 0} ر.س</span>

                  <span>{lang === 'ar' ? 'ضريبة القيمة المضافة (14%):' : 'VAT (14%):'}</span>
                  <span className="text-left font-mono text-red-500">+{Math.round((baseCost || 0) * 0.14 * 100) / 100} ر.س</span>

                  <span>{lang === 'ar' ? 'عمولة تدبير العملة (3%):' : 'Currency Procurement Fee (3%):'}</span>
                  <span className="text-left font-mono text-red-500">+{Math.round((baseCost || 0) * 0.03 * 100) / 100} ر.س</span>

                  <span className="border-t border-blue-100 dark:border-blue-900/40 pt-1.5 mt-1 text-xs font-black text-blue-950 dark:text-blue-100">{lang === 'ar' ? 'إجمالي السعر بعد الرسوم (الذي يُعتمد بالسيستم):' : 'Total Price with Fees:'}</span>
                  <span className="border-t border-blue-100 dark:border-blue-900/40 pt-1.5 mt-1 text-left font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {Math.round((baseCost || 0) * 1.17 * 100) / 100} ر.س
                  </span>
                </div>
              </div>

              {/* Adobe Subscription Verification Checkmark */}
              <div className="p-4 rounded-2xl border transition-all duration-200 bg-emerald-50/10 dark:bg-emerald-950/5 border-emerald-100 dark:border-emerald-900/40 text-right" dir="rtl">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-emerald-600 border-gray-300 focus:ring-emerald-500 mt-0.5 cursor-pointer accent-emerald-600 shrink-0"
                    checked={adobeVerified}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAdobeVerified(checked);
                      if (checked) {
                        setAdobeVerifiedBy(userProfile?.displayName || 'Authorized Staff');
                      } else {
                        setAdobeVerifiedBy('');
                      }
                    }}
                  />
                  <div className="space-y-1 text-right">
                    <span className="text-xs font-black text-gray-800 dark:text-gray-200 block leading-relaxed">
                      هل تم التأكد أن الإيميل حالياً مشترك بالموقع الرئيسي لأدوبي وتم تجربة الإيميل بنجاح؟
                    </span>
                    {adobeVerified ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg w-fit mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <i className="fas fa-shield-alt text-xs animate-pulse"></i>
                        <span>المسؤول المباشر عن التجربة والعميل: <strong>{adobeVerifiedBy}</strong></span>
                      </div>
                    ) : (
                      <span className="text-[9px] text-gray-400 block mt-0.5 font-bold">
                        الرجاء تحديد الخيار بعد فحص حساب العميل على موقع Adobe الرسمي لتسجيل المسؤولية.
                      </span>
                    )}
                  </div>
                </label>
              </div>

              {/* Trial Period Selection for Account */}
              <div className="p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                    <i className="fas fa-gift text-purple-600 animate-bounce"></i>
                    <span>{lang === 'ar' ? '🎁 نوع الحساب: فترة تجريبية أم اشتراك مباشر؟' : '🎁 Account Type: Trial or Direct Paid?'}</span>
                  </label>
                  {hasTrial && (
                    <span className="text-[10px] font-black text-purple-600 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">
                      {lang === 'ar' ? 'فترة تجريبية مفعلة' : 'Trial Active'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">{lang === 'ar' ? 'نظام الاشتراك' : 'Subscription Mode'}</label>
                    <select
                      className="w-full p-2.5 bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900/40 text-xs font-bold rounded-xl outline-none"
                      value={trialPeriod}
                      onChange={e => updateTrialCalculation(e.target.value as any)}
                    >
                      <option value="none">{lang === 'ar' ? 'بدون فترة تجريبية (اشتراك مدفوع مباشر)' : 'No Trial (Paid directly)'}</option>
                      <option value="1_week">{lang === 'ar' ? 'أسبوع واحد تجريبي (7 أيام)' : '1 Week Trial (7 days)'}</option>
                      <option value="3_months">{lang === 'ar' ? '3 شهور تجريبية (90 يوم)' : '3 Months Trial (90 days)'}</option>
                      <option value="custom">{lang === 'ar' ? 'أيام مخصصة' : 'Custom Days'}</option>
                    </select>
                  </div>

                  {trialPeriod === 'custom' && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 block mb-1">{lang === 'ar' ? 'عدد الأيام' : 'Days Count'}</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full p-2.5 bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900/40 text-xs font-bold rounded-xl outline-none"
                        value={trialDays}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setTrialDays(val);
                          updateTrialCalculation('custom', val);
                        }}
                      />
                    </div>
                  )}
                </div>

                {hasTrial ? (
                  <div className="p-3 bg-white/90 dark:bg-gray-900/90 rounded-xl text-[11px] space-y-1.5 border border-purple-200 dark:border-purple-900/40 font-bold text-purple-950 dark:text-purple-200">
                    <div className="flex justify-between">
                      <span>{lang === 'ar' ? 'تاريخ بداية التجربة:' : 'Trial Start:'}</span>
                      <span className="font-mono">{trialStartDate || new Date().toISOString().split('T')[0]}</span>
                    </div>
                    <div className="flex justify-between text-purple-700 dark:text-purple-300">
                      <span>{lang === 'ar' ? 'تاريخ نهاية التجربة:' : 'Trial End:'}</span>
                      <span className="font-mono">{trialEndDate}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-extrabold pt-1 border-t border-purple-100 dark:border-purple-900/30">
                      <span>{lang === 'ar' ? 'تاريخ أول خصم/دفعة للموقع:' : 'First Site Billing Date:'}</span>
                      <span className="font-mono">{trialEndDate}</span>
                    </div>
                    <div className="p-2 bg-purple-50 dark:bg-purple-950/40 rounded-lg text-[10px] text-purple-800 dark:text-purple-300 font-black flex items-center gap-1.5 mt-1">
                      <i className="fas fa-info-circle text-purple-600"></i>
                      <span>تنويه: الحساب في فترة تجريبية مجانية، ولن يُحسب سعره كدفعة مصروفات على السيستم حتى حلول تاريخ أول تجديد ({trialEndDate}).</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white/90 dark:bg-gray-900/90 rounded-xl text-[11px] space-y-2 border border-gray-200 dark:border-gray-700">
                    <label className="text-[11px] font-black text-gray-800 dark:text-gray-200 block">
                      {lang === 'ar' ? '💳 حالة التحصيل والدفع المباشر للموقع:' : '💳 Account Payment Status:'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name="isPaidOption"
                          checked={isPaid === true}
                          onChange={() => setIsPaid(true)}
                          className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-emerald-700 dark:text-emerald-400 font-black">
                          {lang === 'ar' ? '✓ تم الدفع للموقع (يُحسب ضمن المصروفات)' : '✓ Paid (Include in Expenses)'}
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name="isPaidOption"
                          checked={isPaid === false}
                          onChange={() => setIsPaid(false)}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-amber-600 dark:text-amber-400 font-black">
                          {lang === 'ar' ? '⏳ في انتظار الدفع (لا يُحسب كمعاملة مدفوعة)' : '⏳ Pending / Unpaid'}
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Required Cancellation Block (حسابات للتجربة يلزم إلغاؤها قبل تاريخ معين) */}
              <div className="p-4 bg-rose-50/70 dark:bg-rose-950/20 rounded-2xl border border-rose-200/80 dark:border-rose-900/40 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresCancellation}
                    onChange={e => {
                      const val = e.target.checked;
                      setRequiresCancellation(val);
                      if (val && !cancellationDeadline) {
                        setCancellationDeadline(trialEndDate || billingDate || '');
                      }
                    }}
                    className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="text-xs font-black text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                    <i className="fas fa-ban text-rose-600"></i>
                    {lang === 'ar' ? '⚠️ هذا الحساب للتجربة/مؤقت ويلزم إلغاء اشتراكه قبل موعد محدد (Must Cancel)' : '⚠️ Must Cancel Before Deadline (Trial/Testing Account)'}
                  </span>
                </label>

                {requiresCancellation && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in slide-in-from-top-1">
                    <div>
                      <label className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase block mb-1">
                        {lang === 'ar' ? '📅 الموعد النهائي للإلغاء (Cancellation Deadline)' : 'Cancellation Deadline'}
                      </label>
                      <input
                        type="date"
                        className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-extrabold rounded-xl border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 outline-none"
                        value={cancellationDeadline}
                        onChange={e => setCancellationDeadline(e.target.value)}
                        required={requiresCancellation}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase block mb-1">
                        {lang === 'ar' ? '💡 سبب الإلغاء / ملاحظة الإلغاء' : 'Cancellation Reason / Note'}
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 outline-none"
                        value={cancellationReason}
                        onChange={e => setCancellationReason(e.target.value)}
                        placeholder={lang === 'ar' ? 'مثال: تجربة مجانية لمدة أسبوع - إلغاء قبل الخصم التلقائي...' : 'e.g. Trial account - cancel before renewal...'}
                        required={requiresCancellation}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'حالة الحساب' : 'Status'}</label>
                  <select
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none animate-in"
                    value={status}
                    onChange={e => {
                      const newStatus = e.target.value as any;
                      setStatus(newStatus);
                      if (newStatus === 'reserved') {
                        setIsReserved(true);
                      } else {
                        setIsReserved(false);
                      }
                    }}
                  >
                    <option value="active">Active (نشط)</option>
                    <option value="reserved">🔒 Reserved (محجوز - غير متاح للحجز)</option>
                    <option value="restricted">Restricted (محظور / مقيد)</option>
                    <option value="suspended">Suspended (موقوف)</option>
                    <option value="expired">Expired (منتهي)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'ملاحظات إضافية' : 'Additional Notes'}</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
              </div>

              {(status === 'reserved' || isReserved) && (
                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 rounded-2xl border border-purple-200 dark:border-purple-900/40 text-xs text-purple-900 dark:text-purple-200 space-y-2 animate-in fade-in slide-in-from-top-1">
                  <div className="font-extrabold flex items-center gap-1.5 text-purple-800 dark:text-purple-300">
                    <i className="fas fa-lock text-purple-600"></i>
                    <span>{lang === 'ar' ? 'سبب حجز الحساب (ملاحظة الحجز الداخلية):' : 'Reservation Reason / Internal Note:'}</span>
                  </div>
                  <input
                    type="text"
                    className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl border border-purple-200 dark:border-purple-800 outline-none text-purple-900 dark:text-purple-200"
                    value={reservationReason}
                    onChange={e => setReservationReason(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: تحت الاختبار، استخدام داخلي للأكاديمية...' : 'e.g. Under testing, internal academy use...'}
                  />
                  <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium leading-relaxed">
                    {lang === 'ar' 
                      ? '💡 تنبيه: الحساب المحجوز يظل مسجلاً بالسيستم وتعمل تنبيهات تجديده ومصروفاته وتذكيراته بشكل طبيعي، ولكنه لا يظهر كخيار متاح لتسكين العملاء.'
                      : 'Note: Reserved account stays on system for renewals & reminders, but is hidden from customer assignment.'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4 justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 text-xs font-black uppercase text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-black uppercase shadow-sm"
                >
                  {lang === 'ar' ? 'حفظ الحساب' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Customers Modal for Restricted / Source Accounts */}
      {reassignModalOpen && sourceAccountForReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden my-8 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-rose-50/70 dark:bg-rose-950/30">
              <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200 font-black text-sm">
                <i className="fas fa-user-shield text-lg text-rose-600 animate-pulse"></i>
                <div>
                  <div className="text-base font-black">
                    {lang === 'ar' ? 'إدارة عملاء الحساب المقيد / المحظور' : 'Manage Restricted Account Customers'}
                  </div>
                  <div className="text-[11px] font-mono text-rose-600 dark:text-rose-400 font-bold">
                    {sourceAccountForReassign.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setReassignModalOpen(false);
                  setSourceAccountForReassign(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Info banner */}
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/40 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
                <div className="font-extrabold text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <i className="fas fa-exclamation-circle text-amber-600"></i>
                  <span>{lang === 'ar' ? 'خيارات التعامل مع العملاء المسكنين على هذا الحساب:' : 'Options for assigned customers:'}</span>
                </div>
                <p className="leading-relaxed text-[11px] font-medium">
                  عند حظر أو تقييد حساب، يمكنك إما <strong>تحويل العميل لحساب بديل جديد</strong> وإرسال إيميل والباسوورد الجديد له، أو إجراء <strong>استرداد بقيمة الأيام المتبقية (Pro-rata Refund)</strong> ويتم خصم المبلغ تلقائياً من الإيرادات والسيستم.
                </p>
              </div>

              {/* Bulk Transfer Accordion / Card (Option for speed) */}
              {(() => {
                const assignedSubs = customerSubs
                  .filter(s => s.accountId === sourceAccountForReassign.id && s.status === 'active')
                  .sort((a, b) => calcProRataRefund(b).refundAmount - calcProRataRefund(a).refundAmount);
                if (assignedSubs.length === 0) {
                  return (
                    <div className="p-8 text-center bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl">
                        <i className="fas fa-check"></i>
                      </div>
                      <div className="text-sm font-black text-gray-800 dark:text-gray-200">
                        {lang === 'ar' ? 'لا يوجد عملاء نشطين متبقين على هذا الحساب!' : 'No active customers remaining on this account!'}
                      </div>
                      <p className="text-xs text-gray-500">
                        {lang === 'ar' ? 'تم تحويل كافة العملاء أو استرداد اشتراكاتهم بنجاح.' : 'All customers have been reassigned or refunded.'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Quick Bulk Transfer Box */}
                    <details className="bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-200 dark:border-gray-600/50 p-4 group">
                      <summary className="cursor-pointer font-black text-xs text-gray-700 dark:text-gray-300 flex items-center justify-between select-none">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-bolt text-amber-500"></i>
                          <span>{lang === 'ar' ? 'تحويل سريع جماعي لكل العملاء دفعة واحدة (Bulk Reassign)' : 'Quick Bulk Transfer All'}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-normal">اضغط للتوسيع ▾</span>
                      </summary>
                      <form onSubmit={handleConfirmBatchReassign} className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                            اختر الحساب المستهدف الناشط (الذي يحتوي على أماكن فاضية):
                          </label>
                          <select
                            className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl outline-none border border-gray-200 dark:border-gray-600"
                            value={targetAccountIdForReassign}
                            onChange={e => setTargetAccountIdForReassign(e.target.value)}
                          >
                            <option value="">-- اختر حساب ترخيص جديد --</option>
                            {sortAccountsByPriority(
                              accounts.filter(a => a.id !== sourceAccountForReassign.id && a.typeId === sourceAccountForReassign.typeId && a.status === 'active' && !a.isReserved)
                            ).map(a => {
                              const activeS = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
                              const openS = (a.maxSeats || 0) - activeS;
                              return (
                                <option key={a.id} value={a.id} disabled={openS <= 0}>
                                  {a.email} ({openS > 0 ? `${openS} أماكن شاغرة` : 'مكتمل بالكامل'}) - ⏳ {formatAccountDaysRemainingLabel(a.billingDate)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <button
                          type="submit"
                          disabled={!targetAccountIdForReassign}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black rounded-xl flex items-center gap-2"
                        >
                          <i className="fas fa-exchange-alt"></i>
                          <span>تحويل كافة العملاء ({assignedSubs.length}) للحساب المختار</span>
                        </button>
                      </form>
                    </details>

                    {/* Per-Customer Management Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <div className="text-xs font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <i className="fas fa-sort-amount-down text-rose-600 text-sm"></i>
                        <span>مرتبين حسب الأعلى في مبلغ الـ Refund أولاً ({assignedSubs.length} عملاء)</span>
                      </div>
                      <span className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-900/40 font-mono">
                        إجمالي الـ Refund المحتمل: {assignedSubs.reduce((sum, s) => sum + calcProRataRefund(s).refundAmount, 0)} ج.م
                      </span>
                    </div>

                    {/* Customer Cards List */}
                    <div className="space-y-4">
                      {assignedSubs.map((sub, idx) => {
                        const mode = customerModes[sub.id] || 'transfer';
                        const selectedTargetId = customerTargetAccounts[sub.id] || '';
                        const targetAcc = accounts.find(a => a.id === selectedTargetId);
                        const refundDetails = calcProRataRefund(sub);

                        // Message texts
                        const salesRepText = sub.salesRep || 'غير محدد';
                        const transferMsgText = targetAcc ? `اسم العميل: ${sub.customerName}
رقم الواتساب: ${sub.customerPhone || 'غير محدد'}
السيلز المسؤول: ${salesRepText}

----------------------------------------
مرحباً ${sub.customerName}👋،
تم تحويل اشتراكك بنجاح إلى الحساب الجديد:
📧 البريد الإلكتروني: ${targetAcc.email}
🔑 كلمة المرور: ${targetAcc.password || '-'}

📌 تنبيه هام: الاشتراك بنفس البيانات القديمة وتاريخ الانتهاء هو نفسه (${sub.endDate || 'المحدد مسبقاً'})، وهو مجرد تغيير/تحويل للحساب فقط.

برجاء عدم مشاركة الايميل مع اي حد والفتح من جهاز واحد فقط وعدم تغييره .. التزم بعدد الاجهزة اللي اشتركت بناء عليه.` : '';

                        const refundMsgText = `اسم العميل: ${sub.customerName}
رقم الواتساب: ${sub.customerPhone || 'غير محدد'}
السيلز المسؤول: ${salesRepText}

----------------------------------------
أهلاً بك عزيزي العميل ${sub.customerName}👋،
إخطار استرداد اشتراك (Refund):
- تاريخ بداية اشتراكك: ${refundDetails.startDateStr}
- إجمالي المبلغ المدفوع: ${refundDetails.paidAmount} ج.م
- استهلكت: ${refundDetails.daysUsed} يوم من أصل ${refundDetails.totalDays} يوم
- قيمة الاستهلاك الفعلي: ${refundDetails.usedValue} ج.م
- المبلغ المتبقي المستحق لك للاسترداد (Refund): ${refundDetails.refundAmount} ج.م

سيتم رد المبلغ بالطريقة المناسبة لك (فودافون كاش أو إنستاباي).`;

                        return (
                          <div key={sub.id} className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-sm space-y-3">
                            {/* Customer Header Info */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                              <div className="space-y-0.5">
                                <div className="text-xs font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 flex items-center justify-center text-[10px] font-mono font-black">
                                    {idx + 1}
                                  </span>
                                  <span>{sub.customerName}</span>
                                  <span className="text-[10px] font-mono text-gray-500 dir-ltr">({sub.customerPhone})</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold flex items-center gap-3 pr-7">
                                  <span>بداية الاشتراك: {sub.startDate || '-'}</span>
                                  <span>النهاية: {sub.endDate || '-'}</span>
                                </div>
                              </div>

                              <div className="text-left font-mono pr-7 sm:pr-0">
                                <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  دفع: {sub.price || 0} ج.م
                                </div>
                                <div className="text-[9px] text-gray-400 font-sans">
                                  ({sub.seatsCount || 1} مقعد)
                                </div>
                              </div>
                            </div>

                            {/* Mode Toggle Switcher */}
                            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-bold">
                              <button
                                type="button"
                                onClick={() => setCustomerModes(prev => ({ ...prev, [sub.id]: 'transfer' }))}
                                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                  mode === 'transfer'
                                    ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm font-black'
                                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                              >
                                <i className="fas fa-exchange-alt text-xs"></i>
                                <span>1. تحويل لحساب آخر</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setCustomerModes(prev => ({ ...prev, [sub.id]: 'refund' }))}
                                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                  mode === 'refund'
                                    ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 shadow-sm font-black'
                                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                              >
                                <i className="fas fa-hand-holding-usd text-xs"></i>
                                <span>2. استرداد المبلغ (Refund)</span>
                              </button>
                            </div>

                            {/* MODE 1: TRANSFER CUSTOMER */}
                            {mode === 'transfer' && (
                              <div className="p-3.5 bg-blue-50/40 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30 space-y-3">
                                <div>
                                  <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-1">
                                    اختر الحساب المستهدف الناشط لنقل العميل إليه:
                                  </label>
                                  <select
                                    className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl outline-none border border-gray-200 dark:border-gray-600"
                                    value={selectedTargetId}
                                    onChange={e => setCustomerTargetAccounts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                  >
                                    <option value="">-- اختر حساب ترخيص بديل --</option>
                                    {sortAccountsByPriority(
                                      accounts.filter(a => a.id !== sourceAccountForReassign.id && a.typeId === sourceAccountForReassign.typeId && a.status === 'active')
                                    ).map(a => {
                                      const activeS = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
                                      const openS = (a.maxSeats || 0) - activeS;
                                      return (
                                        <option key={a.id} value={a.id} disabled={openS <= 0}>
                                          {a.email} ({openS > 0 ? `${openS} أماكن شاغرة` : 'مكتمل بالكامل'}) - ⏳ {formatAccountDaysRemainingLabel(a.billingDate)}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>

                                {targetAcc && (
                                  <div className="space-y-2">
                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-900/50 space-y-1 text-xs">
                                      <div className="text-[10px] font-black text-blue-800 dark:text-blue-300 block mb-1">
                                        💬 الرسالة المجهزة للعميل (جاهزة للنسخ والإرسال):
                                      </div>
                                      <pre className="text-[11px] font-sans font-bold text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 leading-relaxed">
                                        {transferMsgText}
                                      </pre>
                                    </div>

                                    <div className="flex flex-wrap gap-2 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(transferMsgText, `sub-transfer-msg-${sub.id}`)}
                                        className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center gap-1.5"
                                      >
                                        <i className={`fas ${copiedKeys[`sub-transfer-msg-${sub.id}`] ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                                        <span>{copiedKeys[`sub-transfer-msg-${sub.id}`] ? 'تم نسخ الرسالة ✓' : 'نسخ الرسالة للعميل'}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleSingleTransfer(sub, selectedTargetId)}
                                        className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                                      >
                                        <i className="fas fa-check-circle"></i>
                                        <span>تأكيد نقل العميل وتحديث السيستم</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* MODE 2: REFUND CUSTOMER */}
                            {mode === 'refund' && (
                              <div className="p-3.5 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/30 space-y-3">
                                {/* Calculation Breakdown Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400 block font-normal">المبلغ المدفوع</span>
                                    <span className="font-mono text-gray-900 dark:text-white">{refundDetails.paidAmount} ج.م</span>
                                  </div>

                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400 block font-normal">مدة الاشتراك الإجمالية</span>
                                    <span className="font-mono text-gray-900 dark:text-white">{refundDetails.totalDays} يوم</span>
                                  </div>

                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <span className="text-[9px] text-gray-400 block font-normal">الأيام المستهلكة</span>
                                    <span className="font-mono text-amber-600 dark:text-amber-400">{refundDetails.daysUsed} يوم ({refundDetails.usedValue} ج.م)</span>
                                  </div>

                                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                                    <span className="text-[9px] text-emerald-700 dark:text-emerald-300 block font-bold">مبلغ الـ Refund المتبقي</span>
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">{refundDetails.refundAmount} ج.م</span>
                                  </div>
                                </div>

                                {/* Generated Refund WhatsApp Message Box */}
                                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-900/40 space-y-1 text-xs">
                                  <div className="text-[10px] font-black text-amber-800 dark:text-amber-300 block mb-1">
                                    💬 نص رسالة الـ Refund المجهزة للعميل:
                                  </div>
                                  <pre className="text-[11px] font-sans font-bold text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 leading-relaxed">
                                    {refundMsgText}
                                  </pre>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2 justify-end items-center">
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(refundMsgText, `sub-refund-msg-${sub.id}`)}
                                    className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center gap-1.5"
                                  >
                                    <i className={`fas ${copiedKeys[`sub-refund-msg-${sub.id}`] ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                                    <span>{copiedKeys[`sub-refund-msg-${sub.id}`] ? 'تم نسخ رسالة الـ Refund ✓' : 'نسخ رسالة الـ Refund'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSingleRefund(sub)}
                                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                                  >
                                    <i className="fas fa-check-double"></i>
                                    <span>تأكيد الاسترداد وإنهاء الاشتراك (خصم من الإيرادات)</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setReassignModalOpen(false);
                  setSourceAccountForReassign(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-black uppercase hover:bg-gray-300 transition-colors"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
