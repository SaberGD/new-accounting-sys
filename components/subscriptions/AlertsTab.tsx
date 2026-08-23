import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { SubscriptionAccount, SubscriptionType, PaymentMethod, CustomerSubscription, SubscriptionAlert, PreRegisteredAccount } from './types';
import { sortAccountsByPriority, formatAccountDaysRemainingLabel, addOneMonthToDateStr, parseLocalDate } from './utils';

interface AlertsTabProps {
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  methods?: PaymentMethod[];
  customerSubs: CustomerSubscription[];
  preRegisteredAccounts?: PreRegisteredAccount[];
  canManage: boolean;
  onShowToast?: (msg: string) => void;
}

export function AlertsTab({
  accounts,
  types,
  methods = [],
  customerSubs,
  preRegisteredAccounts = [],
  canManage,
  onShowToast
}: AlertsTabProps) {
  const lang = 'ar';
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form states for new custom alert
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [message, setMessage] = useState('');

  // Renew & Transfer Modal state
  const [renewTransferSub, setRenewTransferSub] = useState<CustomerSubscription | null>(null);
  const [renewTransferTargetAccountId, setRenewTransferTargetAccountId] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sub-tabs inside alerts manager
  const [subTab, setSubTab] = useState<'all' | 'obligations' | 'trainees' | 'platforms' | 'cancellations' | 'custom' | 'allocation' | 'archive'>('all');

  // Load custom alerts in real-time
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'subscriptionAlerts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionAlert));
      setAlerts(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading alerts:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 1. DYNAMIC TRAINEE COLLECTION ALERTS (النوع الأول: تحصيل اشتراكات المتدربين)
  const traineeAlerts = React.useMemo(() => {
    const list: Array<{
      id: string;
      sub: CustomerSubscription;
      programName: string;
      accountEmail: string;
      accountBillingDate: string;
      diffDays: number;
      isOverdue: boolean;
    }> = [];

    customerSubs.forEach(sub => {
      if (sub.status !== 'active') return;

      const acc = accounts.find(a => a.id === sub.accountId);
      const type = types.find(t => t.id === acc?.typeId);
      const programName = type?.name || 'برنامج غير معروف';

      const end = new Date(sub.endDate);
      end.setHours(0, 0, 0, 0);
      const diffTime = end.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Trigger if payment is overdue, pending, or subscription ends in 3 days or less
      const isOverdueStatus = sub.paymentStatus === 'overdue' || sub.paymentStatus === 'pending';
      const isExpiringSoon = diffDays <= 3;

      if (isOverdueStatus || isExpiringSoon) {
        list.push({
          id: `trainee-alert-${sub.id}`,
          sub,
          programName,
          accountEmail: acc?.email || 'لا يوجد حساب مرتب',
          accountBillingDate: acc?.billingDate || '',
          diffDays,
          isOverdue: diffDays < 0 || isOverdueStatus
        });
      }
    });

    return list;
  }, [customerSubs, accounts, types, today]);

  // 2. DYNAMIC PLATFORM RENEWAL ALERTS (النوع الثاني: تجديد الحسابات والمواقع قبل موعدها بيومين)
  const platformRenewalAlerts = React.useMemo(() => {
    const list: Array<{
      id: string;
      account: SubscriptionAccount;
      programName: string;
      diffDays: number;
    }> = [];

    accounts.forEach(acc => {
      if (acc.status !== 'active') return;

      // Exclude accounts marked for cancellation (do NOT show in standard renewals)
      if (acc.requiresCancellation && !acc.cancellationConfirmed) return;

      const type = types.find(t => t.id === acc.typeId);
      const programName = type?.name || 'برنامج غير معروف';

      if (!acc.billingDate) return;

      const billing = new Date(acc.billingDate);
      billing.setHours(0, 0, 0, 0);
      const diffTime = billing.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Alert triggers 2 days before renewal (diffDays <= 2)
      if (diffDays <= 2) {
        list.push({
          id: `platform-renewal-${acc.id}`,
          account: acc,
          programName,
          diffDays
        });
      }
    });

    return list;
  }, [accounts, types, today]);

  // 2.5 DYNAMIC REQUIRED CANCELLATIONS (تنبيهات إلغاء الحسابات التجريبية والمؤقتة قبل الموعد)
  const cancellationAlerts = React.useMemo(() => {
    const list: Array<{
      id: string;
      account: SubscriptionAccount;
      programName: string;
      cancellationDeadline: string;
      cancellationReason: string;
      diffDays: number;
      isOverdue: boolean;
    }> = [];

    accounts.forEach(acc => {
      if (acc.requiresCancellation && !acc.cancellationConfirmed && acc.status !== 'canceled' && acc.status !== 'expired') {
        const type = types.find(t => t.id === acc.typeId);
        const programName = type?.name || 'برنامج غير معروف';
        const deadlineStr = acc.cancellationDeadline || acc.trialEndDate || acc.billingDate;

        if (!deadlineStr) return;

        const deadlineDate = parseLocalDate(deadlineStr);
        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Show alert when cancellation deadline is within 3 days or overdue
        if (diffDays <= 3) {
          list.push({
            id: `cancellation-alert-${acc.id}`,
            account: acc,
            programName,
            cancellationDeadline: deadlineStr,
            cancellationReason: acc.cancellationReason || 'حساب تجريبي يلزم إلغاء اشتراكه لمنع الشحن التلقائي',
            diffDays,
            isOverdue: diffDays < 0
          });
        }
      }
    });

    return list.sort((a, b) => a.diffDays - b.diffDays);
  }, [accounts, types, today]);

  // GENERAL UPCOMING OBLIGATIONS & EXPIRATIONS (التزامات وتجديدات الفترة القادمة عموماً)
  const upcomingObligations = React.useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'platform_account' | 'customer_seat';
      title: string;
      subtitle: string;
      email: string;
      date: string;
      diffDays: number;
      amount: number;
      currency: string;
      rawDate: number;
      item: any;
    }> = [];

    // 1. Account Platform Renewals
    accounts.forEach(acc => {
      // Exclude accounts marked for cancellation from obligations
      if (acc.requiresCancellation && !acc.cancellationConfirmed) return;

      const dueDateStr = acc.hasTrial && acc.trialEndDate ? acc.trialEndDate : acc.billingDate;
      if (!dueDateStr) return;
      const type = types.find(t => t.id === acc.typeId);
      const programName = type?.name || 'حساب ترخيص';
      const date = parseLocalDate(dueDateStr);
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const todayStr = today.toISOString().split('T')[0];
      const isTrial = acc.hasTrial && acc.trialPeriod !== 'none' && acc.trialEndDate && todayStr <= acc.trialEndDate;

      list.push({
        id: `obl-acc-${acc.id}`,
        kind: 'platform_account',
        title: isTrial ? `أول خصم/دفعة بعد الفترة التجريبية [${programName}]` : `تجديد حساب موقع [${programName}]`,
        subtitle: isTrial ? `انتهاء الفترة التجريبية وبداية التحصيل للموقع (${acc.email})` : `التزام سداد للموقع الرسمي (${acc.email})`,
        email: acc.email,
        date: dueDateStr,
        diffDays,
        amount: acc.cost || 0,
        currency: 'ر.س',
        rawDate: date.getTime(),
        item: acc
      });
    });

    // 2. Customer Seat Expirations
    customerSubs.forEach(sub => {
      if (sub.status !== 'active' || !sub.endDate) return;
      const acc = accounts.find(a => a.id === sub.accountId);
      const type = types.find(t => t.id === acc?.typeId);
      const programName = type?.name || 'برنامج';
      const date = parseLocalDate(sub.endDate);
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      list.push({
        id: `obl-sub-${sub.id}`,
        kind: 'customer_seat',
        title: `تحصيل اشتراك العميل: ${sub.customerName}`,
        subtitle: `برنامج [${programName}] - حساب: ${acc?.email || 'N/A'}`,
        email: acc?.email || '',
        date: sub.endDate,
        diffDays,
        amount: sub.price || 0,
        currency: 'EGP',
        rawDate: date.getTime(),
        item: sub
      });
    });

    return list.sort((a, b) => a.rawDate - b.rawDate);
  }, [accounts, types, customerSubs, today]);

  // 3. DYNAMIC SYSTEM ALLOCATION ALERTS (المقاعد الشاغرة وعدم دمج التجديد)
  const allocationAlerts = React.useMemo(() => {
    const list: Array<{
      id: string;
      type: 'underfilled' | 'split_payment';
      email: string;
      message: string;
      suggestedAction: string;
    }> = [];

    accounts.forEach(acc => {
      if (acc.status !== 'active') return;

      const programType = types.find(t => t.id === acc.typeId);
      const programName = programType?.name || 'برنامج غير معروف';

      const activeSeatsInAcc = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active');
      const activeCount = activeSeatsInAcc.reduce((sum, s) => sum + (s.seatsCount || 1), 0);

      // Underfilled seats priority
      if (acc.maxSeats > 1 && activeCount > 0 && activeCount < acc.maxSeats) {
        const emptySeats = acc.maxSeats - activeCount;
        list.push({
          id: `alloc-underfilled-${acc.id}`,
          type: 'underfilled',
          email: acc.email,
          message: `تنبيه مقاعد شاغرة: الحساب (${acc.email}) لبرنامج [${programName}] يحتوي على ${emptySeats} مقاعد شاغرة من أصل ${acc.maxSeats}. يرجى تسكين أي مشترك جديد في هذا الحساب كأولوية قصوى.`,
          suggestedAction: 'قم بسحب وتسكين المشتركين الجدد في هذا الحساب أولاً قبل فتح حسابات جديدة.'
        });
      }

      // Split payments renewal
      if (acc.maxSeats > 1 && activeCount > 1) {
        const paidSeats = activeSeatsInAcc.filter(s => s.paymentStatus === 'paid');
        const unpaidSeats = activeSeatsInAcc.filter(s => s.paymentStatus !== 'paid');

        if (paidSeats.length > 0 && unpaidSeats.length > 0) {
          list.push({
            id: `alloc-split-${acc.id}`,
            type: 'split_payment',
            email: acc.email,
            message: `تنبيه عدم تجديد مشترك: الحساب (${acc.email}) لبرنامج [${programName}] يحتوي على مشترك سدد والآخر متأخر أو معلق. يرجى نقل الملتزم لدمجه مع الملتزمين الآخرين وتفريغ الحساب.`,
            suggestedAction: 'الدمج المقترح: ابحث عن حساب آخر غير مكتمل وانقل المشترك الملتزم إليه لتفادي التكلفة العالية.'
          });
        }
      }
    });

    return list;
  }, [accounts, types, customerSubs]);

  // ACTIONS FOR TRAINEE ALERTS
  const handleMarkTraineeAsPaid = async (sub: CustomerSubscription) => {
    if (!canManage) return;
    try {
      // Handle renewal pricing rule if it's a one-time discount
      const isOneTimeDiscount = sub.renewalOption === 'base_price';
      const newEndDate = addOneMonthToDateStr(sub.endDate);
      const updatePayload: any = {
        paymentStatus: 'paid',
        endDate: newEndDate,
        status: 'active'
      };

      if (isOneTimeDiscount) {
        updatePayload.price = sub.basePrice || sub.price;
        updatePayload.additionalDiscount = 0;
        updatePayload.discountReason = '';
        updatePayload.selectedOfferId = '';
        updatePayload.savingAmount = 0;
        updatePayload.renewalOption = 'same_discount';
      }

      await updateDoc(doc(db, 'customerSubscriptions', sub.id), updatePayload);

      // Log action
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'TRAINEE_PAYMENT_RECORDED',
        description: `تم تسجيل سداد وتجديد اشتراك المتدرب (${sub.customerName}) وتمديد تاريخ الانتهاء إلى ${newEndDate}.`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      if (onShowToast) {
        onShowToast(`تم تسجيل سداد وتجديد المشترك أ/ ${sub.customerName} حتى ${newEndDate} بنجاح!`);
      }
    } catch (err) {
      console.error('Error marking trainee as paid:', err);
    }
  };

  const handleConfirmRenewAndTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !renewTransferSub || !renewTransferTargetAccountId) return;

    const sourceAccountId = renewTransferSub.accountId;
    const targetAccountId = renewTransferTargetAccountId;
    const newEndDate = addOneMonthToDateStr(renewTransferSub.endDate);

    try {
      // 1. Update customer subscription
      const updatePayload: any = {
        accountId: targetAccountId,
        paymentStatus: 'paid',
        endDate: newEndDate,
        status: 'active'
      };

      if (renewTransferSub.renewalOption === 'base_price') {
        updatePayload.price = renewTransferSub.basePrice || renewTransferSub.price;
        updatePayload.additionalDiscount = 0;
        updatePayload.discountReason = '';
        updatePayload.selectedOfferId = '';
        updatePayload.savingAmount = 0;
        updatePayload.renewalOption = 'same_discount';
      }

      await updateDoc(doc(db, 'customerSubscriptions', renewTransferSub.id), updatePayload);

      // 2. Recalculate active seats for source and target accounts if changed
      if (sourceAccountId !== targetAccountId) {
        const sourceActiveCount = customerSubs.filter(s => s.accountId === sourceAccountId && s.id !== renewTransferSub.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
        const targetActiveCount = customerSubs.filter(s => s.accountId === targetAccountId && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0) + (renewTransferSub.seatsCount || 1);

        await updateDoc(doc(db, 'subscriptionAccounts', sourceAccountId), {
          activeSeats: sourceActiveCount
        });
        await updateDoc(doc(db, 'subscriptionAccounts', targetAccountId), {
          activeSeats: targetActiveCount
        });
      }

      // 3. Add Audit Log
      const srcAcc = accounts.find(a => a.id === sourceAccountId);
      const destAcc = accounts.find(a => a.id === targetAccountId);

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'TRAINEE_RENEWED_AND_TRANSFERRED',
        description: `تم سداد وتجديد اشتراك المتدرب (${renewTransferSub.customerName}) ونقله من الحساب (${srcAcc?.email || 'N/A'}) إلى الحساب (${destAcc?.email || 'N/A'}) بتاريخ انتهاء جديد ${newEndDate}.`,
        performedBy: 'Staff',
        performedByEmail: '',
        details: {
          customerId: renewTransferSub.customerId,
          customerName: renewTransferSub.customerName,
          sourceAccount: srcAcc?.email,
          targetAccount: destAcc?.email,
          newEndDate
        }
      });

      if (onShowToast) {
        onShowToast(`تم سداد وتجديد ونقل اشتراك أ/ ${renewTransferSub.customerName} بنجاح حتى ${newEndDate}!`);
      }

      setRenewTransferSub(null);
      setRenewTransferTargetAccountId('');
    } catch (err) {
      console.error('Error renewing and transferring sub:', err);
    }
  };

  const handleCancelTraineeSub = async (sub: CustomerSubscription) => {
    if (!canManage) return;
    if (!window.confirm(`هل أنت متأكد من إيقاف اشتراك المتدرب أ/ ${sub.customerName} وتفريغ المقعد الخاص به؟`)) return;

    try {
      await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
        status: 'canceled',
        paymentStatus: 'overdue'
      });

      // Update seats count on parent account
      const acc = accounts.find(a => a.id === sub.accountId);
      if (acc) {
        const activeSeatsInAcc = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active' && s.id !== sub.id).reduce((sum, s) => sum + (s.seatsCount || 1), 0);
        await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
          activeSeats: activeSeatsInAcc
        });
      }

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'TRAINEE_SUB_CANCELED_VIA_ALERT',
        description: `تم إيقاف اشتراك المتدرب (${sub.customerName}) وتفريغ مقعده بسبب عدم تجديد الاشتراك.`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      if (onShowToast) {
        onShowToast(`تم إلغاء وتفريغ مقعد المشترك أ/ ${sub.customerName} بنجاح.`);
      }
    } catch (err) {
      console.error('Error canceling trainee subscription:', err);
    }
  };

  // ACTIONS FOR PLATFORM RENEWAL ALERTS
  // 1. Confirm balance and advance billing date (تم التأكد من الرصيد)
  const handleConfirmPlatformBalance = async (acc: SubscriptionAccount, programName: string) => {
    if (!canManage) return;

    // Advance billing date based on program cycle or default to +30 days
    const currentBillingDate = acc.billingDate;
    const date = new Date(currentBillingDate);
    const type = types.find(t => t.id === acc.typeId);

    if (isNaN(date.getTime())) {
      date.setTime(today.getTime());
    }

    if (type?.billingCycle === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1); // standard monthly
    }

    const nextBillingDate = date.toISOString().split('T')[0];

    try {
      // Update account next renewal date
      await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
        billingDate: nextBillingDate
      });

      // Log action
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'PLATFORM_RENEWAL_CONFIRMED',
        description: `تم تأكيد وجود رصيد كافي وتجديد حساب المنصة (${acc.email}) لبرنامج [${programName}]. تاريخ التجديد القادم تم تحديثه إلى ${nextBillingDate}.`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      if (onShowToast) {
        onShowToast(`تم تأكيد وجود الرصيد وتحديث موعد التجديد القادم إلى ${nextBillingDate} للحساب ${acc.email}`);
      }
    } catch (err) {
      console.error('Error confirming platform balance:', err);
    }
  };

  // 2. Stop Subscription & Return Email to pre-registered free tier (إيقاف الاشتراك)
  const handleStopPlatformSubscription = async (acc: SubscriptionAccount, programName: string) => {
    if (!canManage) return;
    if (!window.confirm(`تحذير: هل أنت متأكد من إيقاف الاشتراك في الحساب (${acc.email}) وتحويله إلى حالة معلق (suspended) وإعادة الإيميل إلى قائمة الانتظار المجانية (Free Tier)؟`)) return;

    try {
      // A. Change SubscriptionAccount status to suspended
      await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
        status: 'suspended'
      });

      // B. Find matching email in preRegisteredAccounts and set its status back to 'free'
      const preReg = preRegisteredAccounts.find(
        p => p.email.trim().toLowerCase() === acc.email.trim().toLowerCase()
      );

      if (preReg) {
        await updateDoc(doc(db, 'preRegisteredAccounts', preReg.id), {
          status: 'free',
          updatedAt: new Date().toISOString()
        });
      }

      // C. Also set all active trainees in this account to 'canceled' or expired so they know
      const activeTraineesInAcc = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active');
      for (const sub of activeTraineesInAcc) {
        await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
          status: 'expired',
          paymentStatus: 'overdue'
        });
      }

      // D. Log the action
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'PLATFORM_SUB_SUSPENDED_VIA_ALERT',
        description: `تم تعليق حساب المنصة (${acc.email}) وإعادته للـ Free Tier بنجاح. تم تحويل كافة المشتركين المسكنين عليه لحالة منتهي.`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      if (onShowToast) {
        onShowToast(`تم إيقاف الاشتراك بنجاح وتحويل الحساب (${acc.email}) إلى معلق وإعادته للـ Free Tier.`);
      }
    } catch (err) {
      console.error('Error stopping platform subscription:', err);
    }
  };

  // 3. Confirm Cancellation for Must-Cancel Accounts (تأكيد إلغاء الحسابات التجريبية قبل الخصم)
  const handleConfirmAccountCancellation = async (acc: SubscriptionAccount) => {
    if (!canManage) return;
    if (!window.confirm(`تأكيد هام: هل قمت بإلغاء الاشتراك لهذا الحساب التجريبي (${acc.email}) على الموقع الرسمي بالفعل لتفادي الخصم المالي؟`)) return;

    try {
      await updateDoc(doc(db, 'subscriptionAccounts', acc.id), {
        cancellationConfirmed: true,
        cancellationConfirmedAt: new Date().toISOString(),
        status: 'canceled',
        notes: (acc.notes ? acc.notes + '\n' : '') + `[تم تأكيد إلغاء الاشتراك من الموقع بتاريخ ${new Date().toLocaleDateString('ar-EG')}]`
      });

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'ACCOUNT_CANCELLATION_CONFIRMED',
        description: `تم تأكيد إلغاء اشتراك الحساب التجريبي (${acc.email}) وإغلاقه لتفادي أي رسوم تجديد تلقائي.`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      if (onShowToast) {
        onShowToast(`تم تأكيد إلغاء اشتراك الحساب (${acc.email}) وتأمينه بنجاح!`);
      }
    } catch (err) {
      console.error('Error confirming account cancellation:', err);
    }
  };

  // ACTIONS FOR CUSTOM ALERTS
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !reminderDate || !message.trim()) return;

    try {
      await addDoc(collection(db, 'subscriptionAlerts'), {
        accountId: selectedAccountId,
        reminderDate,
        message: message.trim(),
        createdAt: new Date().toISOString(),
        createdBy: 'الأدمن',
        status: 'active',
        step1Done: false,
        step2Done: false
      });

      setSelectedAccountId('');
      setReminderDate('');
      setMessage('');
      setModalOpen(false);

      if (onShowToast) {
        onShowToast('تمت إضافة التنبيه المخصص بنجاح!');
      }
    } catch (err) {
      console.error('Error creating custom alert:', err);
    }
  };

  const handleToggleStep = async (alertId: string, step: 1 | 2, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'subscriptionAlerts', alertId), {
        [step === 1 ? 'step1Done' : 'step2Done']: !currentValue
      });
    } catch (err) {
      console.error('Error toggling step progress:', err);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!canManage) return;
    try {
      await updateDoc(doc(db, 'subscriptionAlerts', alertId), {
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: 'الأدمن'
      });
      if (onShowToast) {
        onShowToast('تمت أرشفة وتأكيد التنبيه بنجاح.');
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!canManage) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا التنبيه نهائياً؟')) return;
    try {
      await deleteDoc(doc(db, 'subscriptionAlerts', alertId));
      if (onShowToast) {
        onShowToast('تم حذف التنبيه المخصص.');
      }
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  const activeCustomAlerts = alerts.filter(a => a.status === 'active');
  const archivedCustomAlerts = alerts.filter(a => a.status === 'acknowledged');

  // 4. UNIFIED ALL ALERTS (الأقسام مجتمعة بترميز لوني ومستوى الاستعجال)
  const unifiedAlerts = React.useMemo(() => {
    const list: Array<{
      id: string;
      category: 'trainees' | 'platforms' | 'cancellations' | 'custom' | 'allocation';
      categoryName: string;
      categoryIcon: string;
      colorClass: string;
      badgeClass: string;
      timestamp: number;
      data: any;
    }> = [];

    cancellationAlerts.forEach(c => {
      const deadline = parseLocalDate(c.cancellationDeadline);
      list.push({
        id: c.id,
        category: 'cancellations',
        categoryName: lang === 'ar' ? 'إلغاء الاشتراكات التجريبية' : 'Required Cancellations',
        categoryIcon: 'fas fa-ban',
        colorClass: 'border-purple-200 dark:border-purple-900/40 hover:border-purple-400 bg-purple-50/20 dark:bg-purple-950/20',
        badgeClass: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
        timestamp: isNaN(deadline.getTime()) ? 0 : deadline.getTime(),
        data: c
      });
    });

    traineeAlerts.forEach(t => {
      const end = parseLocalDate(t.sub.endDate);
      list.push({
        id: t.id,
        category: 'trainees',
        categoryName: lang === 'ar' ? 'تحصيل المتدربين' : 'Trainees Collection',
        categoryIcon: 'fas fa-user-graduate',
        colorClass: 'border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-800/50 bg-indigo-50/10 hover:bg-indigo-50/20 dark:bg-indigo-950/5 dark:hover:bg-indigo-950/10',
        badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30',
        timestamp: isNaN(end.getTime()) ? 0 : end.getTime(),
        data: t
      });
    });

    platformRenewalAlerts.forEach(p => {
      const billing = parseLocalDate(p.account.billingDate);
      list.push({
        id: p.id,
        category: 'platforms',
        categoryName: lang === 'ar' ? 'تجديد الحسابات والمواقع' : 'Platforms Renewal',
        categoryIcon: 'fas fa-globe',
        colorClass: 'border-rose-100 dark:border-rose-900/30 hover:border-rose-300 dark:hover:border-rose-800/50 bg-rose-50/10 hover:bg-rose-50/20 dark:bg-rose-950/5 dark:hover:bg-rose-950/10',
        badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-900/30',
        timestamp: isNaN(billing.getTime()) ? 0 : billing.getTime(),
        data: p
      });
    });

    activeCustomAlerts.forEach(c => {
      const reminder = c.reminderDate ? new Date(c.reminderDate) : new Date();
      list.push({
        id: c.id,
        category: 'custom',
        categoryName: lang === 'ar' ? 'تنبيه مخصص' : 'Custom Alert',
        categoryIcon: 'fas fa-user-edit',
        colorClass: 'border-amber-100 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-800/50 bg-amber-50/10 hover:bg-amber-50/20 dark:bg-amber-950/5 dark:hover:bg-amber-950/10',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/30',
        timestamp: isNaN(reminder.getTime()) ? 0 : reminder.getTime(),
        data: c
      });
    });

    allocationAlerts.forEach(a => {
      list.push({
        id: a.id,
        category: 'allocation',
        categoryName: lang === 'ar' ? 'تنبيه المقاعد والدمج' : 'Allocation & Seats',
        categoryIcon: 'fas fa-chart-pie',
        colorClass: 'border-cyan-100 dark:border-cyan-900/30 hover:border-cyan-300 dark:hover:border-cyan-800/50 bg-cyan-50/10 hover:bg-cyan-50/20 dark:bg-cyan-950/5 dark:hover:bg-cyan-950/10',
        badgeClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-100/50 dark:border-cyan-900/30',
        timestamp: today.getTime() + (1000 * 60 * 60 * 24 * 7),
        data: a
      });
    });

    // Chronological order (soonest/most overdue first)
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [cancellationAlerts, traineeAlerts, platformRenewalAlerts, activeCustomAlerts, allocationAlerts, today]);

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Alert Header Dashboard */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm gap-4">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-bell text-red-500 animate-bounce"></i>
            نظام التنبيهات والتحصيل وإدارة تجديد الاشتراكات
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            تابع تحصيل مبالغ المتدربين وتأكيد رصيد بطاقات الدفع للحسابات قبل التجديد أو إيقافها وإعادتها لقسم الانتظار المجاني.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-plus-circle"></i>
            إضافة تنبيه مخصص لحساب
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher Bar */}
      <div className="flex flex-wrap gap-1 bg-gray-100/80 dark:bg-gray-800/60 p-1 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
        <button
          onClick={() => setSubTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'all'
              ? 'bg-red-500 text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <i className="fas fa-layer-group"></i>
          <span>جميع التنبيهات مجمعة</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'all' ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
          }`}>
            {cancellationAlerts.length + traineeAlerts.length + platformRenewalAlerts.length + activeCustomAlerts.length + allocationAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('cancellations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'cancellations'
              ? 'bg-purple-700 text-white shadow-md'
              : 'text-gray-500 hover:text-purple-700 dark:hover:text-purple-400'
          }`}
        >
          <i className="fas fa-ban"></i>
          <span>إلغاء الحسابات التجريبية (Must Cancel)</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'cancellations' ? 'bg-white/30 text-white' : 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
          }`}>
            {cancellationAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('obligations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'obligations'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400'
          }`}
        >
          <i className="fas fa-calendar-check"></i>
          <span>🗓️ التزامات وتجديدات القادمة (عموماً)</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'obligations' ? 'bg-white/30 text-white' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          }`}>
            {upcomingObligations.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('trainees')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'trainees'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400'
          }`}
        >
          <i className="fas fa-user-graduate"></i>
          <span>تحصيل المتدربين</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'trainees' ? 'bg-white/30 text-white' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
          }`}>
            {traineeAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('platforms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'platforms'
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-gray-500 hover:text-rose-600 dark:hover:text-rose-400'
          }`}
        >
          <i className="fas fa-globe"></i>
          <span>تجديد المواقع والحسابات</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'platforms' ? 'bg-white/30 text-white' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
          }`}>
            {platformRenewalAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('custom')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'custom'
              ? 'bg-amber-500 text-white shadow-md'
              : 'text-gray-500 hover:text-amber-600 dark:hover:text-amber-400'
          }`}
        >
          <i className="fas fa-user-edit"></i>
          <span>التنبيهات المخصصة المضافة</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'custom' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
          }`}>
            {activeCustomAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('allocation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'allocation'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400'
          }`}
        >
          <i className="fas fa-chart-pie"></i>
          <span>تنبيهات المقاعد الشاغرة والدمج</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'allocation' ? 'bg-white/30 text-white' : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300'
          }`}>
            {allocationAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('archive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            subTab === 'archive'
              ? 'bg-gray-600 text-white shadow-md'
              : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <i className="fas fa-archive"></i>
          <span>الأرشيف التاريخي</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
            subTab === 'archive' ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300'
          }`}>
            {archivedCustomAlerts.length}
          </span>
        </button>
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}
      {subTab === 'obligations' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                <i className="fas fa-calendar-alt text-emerald-600"></i>
                جدول التزامات وتجديدات القادمة (حسب تواريخ الاستحقاق المستقبلية)
              </h4>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                جدول زمني يوضح جميع التزامات سداد الحسابات والمواقع للموقع الرسمي + تواريخ تجديد واشتراكات العملاء القادمة عموماً مرتبة بالأقرب دائماً.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 rounded-xl">
                إجمالي الالتزامات القادمة: {upcomingObligations.length}
              </span>
            </div>
          </div>

          {upcomingObligations.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">لا توجد أي التزامات مسجلة للفترة القادمة.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'نوع الالتزام' : 'Kind'}</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'تفاصيل الالتزام / العنوان' : 'Obligation Title'}</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'البريد المرتبط' : 'Associated Account'}</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'المبلغ المطلوب' : 'Amount'}</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'تاريخ التجديد/الانتهاء' : 'Due Date'}</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400">{lang === 'ar' ? 'الوقت المتبقي' : 'Days Left'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                    {upcomingObligations.map(obl => (
                      <tr key={obl.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                        <td className="p-4">
                          {obl.kind === 'platform_account' ? (
                            <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 font-black text-[10px] rounded-lg border border-rose-200 dark:border-rose-900/40 flex items-center gap-1 w-fit">
                              <i className="fas fa-globe text-[10px]"></i>
                              تجديد موقع/منصة
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-black text-[10px] rounded-lg border border-indigo-200 dark:border-indigo-900/40 flex items-center gap-1 w-fit">
                              <i className="fas fa-user text-[10px]"></i>
                              تحصيل عميل
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-black text-gray-900 dark:text-white">
                          <div>{obl.title}</div>
                          <div className="text-[10px] font-normal text-gray-400 mt-0.5">{obl.subtitle}</div>
                        </td>
                        <td className="p-4 font-mono font-bold text-gray-600 dark:text-gray-300">
                          {obl.email || '-'}
                        </td>
                        <td className="p-4 font-mono font-black text-gray-900 dark:text-white">
                          {obl.amount.toLocaleString()} {obl.currency}
                        </td>
                        <td className="p-4 font-mono font-bold text-gray-700 dark:text-gray-300">
                          {obl.date}
                        </td>
                        <td className="p-4">
                          {obl.diffDays < 0 ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 font-extrabold text-[10px] rounded-md">
                              متأخر {Math.abs(obl.diffDays)} يوم
                            </span>
                          ) : obl.diffDays === 0 ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-extrabold text-[10px] rounded-md animate-pulse">
                              اليوم ⚠️
                            </span>
                          ) : obl.diffDays <= 3 ? (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-extrabold text-[10px] rounded-md border border-amber-200">
                              خلال {obl.diffDays} أيام
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-[10px] rounded-md">
                              متبقي {obl.diffDays} يوم
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

      {subTab === 'all' && (
        <div className="space-y-4">
          <div className="bg-primary-50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-900/30 p-4 rounded-2xl">
            <h4 className="text-xs font-extrabold text-primary-800 dark:text-primary-300 flex items-center gap-2">
              <i className="fas fa-layer-group"></i>
              تنبيهات مجمعة لكل الأقسام مع ترميز لوني مميز
            </h4>
            <p className="text-[11px] text-primary-700 dark:text-primary-400 mt-1">
              تعرض هذه القائمة كافة التنبيهات النشطة من جميع الأقسام مرتبة بحسب موعد الاستحقاق للتذكير والتحصيل السريع. ولكل قسم لون مميز لسهولة التعرف الفوري عليه.
            </p>
          </div>

          {unifiedAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-300 dark:text-gray-600 mx-auto mb-3">
                <i className="fas fa-bell-slash text-lg"></i>
              </div>
              <p className="text-xs text-gray-400 font-bold">رائع! لا توجد أي تنبيهات معلقة حالياً في جميع الأقسام.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {unifiedAlerts.map((item) => {
                if (item.category === 'cancellations') {
                  const c = item.data;
                  return (
                    <div
                      key={item.id}
                      className={`p-5 rounded-3xl border text-xs flex flex-col justify-between gap-4 shadow-sm transition-all duration-200 hover:shadow-md ${item.colorClass}`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-center pb-2 border-b border-purple-200/50 dark:border-purple-800/50">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${item.badgeClass}`}>
                            <i className={item.categoryIcon}></i>
                            {item.categoryName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            c.diffDays <= 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/60' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60'
                          }`}>
                            {c.diffDays < 0 ? '🚨 انتهى الموعد النهائي!' : c.diffDays === 0 ? '⚠️ اليوم موعد الإلغاء!' : `باقي ${c.diffDays} أيام`}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{c.account.email}</span>
                          <span className="text-[10px] font-black text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/50 px-2 py-0.5 rounded-md">
                            {c.programName}
                          </span>
                        </div>

                        <div className="p-3 rounded-2xl bg-purple-100/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40 space-y-1">
                          <div className="font-black text-[9px] uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1">
                            <i className="fas fa-sticky-note"></i>
                            <span>سبب الإلغاء المشروح عند الإضافة:</span>
                          </div>
                          <p className="text-xs font-bold text-purple-950 dark:text-purple-100 leading-relaxed">
                            {c.cancellationReason}
                          </p>
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-1 text-gray-600 dark:text-gray-300">
                          <span>تاريخ الموعد النهائي للإلغاء:</span>
                          <span className="font-mono font-black text-rose-600 dark:text-rose-400">{c.cancellationDeadline}</span>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex justify-end border-t border-purple-200/50 dark:border-purple-800/50 pt-3">
                          <button
                            onClick={() => handleConfirmAccountCancellation(c.account)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-[10px] transition-colors shadow-sm"
                          >
                            <i className="fas fa-check-circle"></i>
                            <span>تأكيد إلغاء الاشتراك وإغلاق الحساب</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (item.category === 'trainees') {
                  const { sub, programName, accountEmail, accountBillingDate, diffDays } = item.data;
                  return (
                    <div
                      key={item.id}
                      className={`p-5 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm transition-all duration-200 ${item.colorClass}`}
                    >
                      <div className="space-y-2">
                        {/* Unified Top Category Badge */}
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100/50 dark:border-gray-700/50">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${item.badgeClass}`}>
                            <i className={item.categoryIcon}></i>
                            {item.categoryName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                            sub.paymentStatus === 'overdue' ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                          }`}>
                            {sub.paymentStatus === 'overdue' ? 'متأخر السداد' : 'انتظار الدفع'}
                          </span>
                        </div>

                        <div>
                          <span className="font-black text-sm text-gray-900 dark:text-white block">
                            {sub.customerName}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400 block mt-0.5">
                            هاتف: {sub.customerPhone}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs py-2 border-t border-b border-gray-50 dark:border-gray-700/50">
                          <div>
                            <span className="text-gray-400 block text-[10px]">البرنامج التدريبي</span>
                            <span className="font-extrabold text-gray-800 dark:text-gray-200">{programName}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">قيمة الاشتراك</span>
                            <span className="font-extrabold text-red-600 dark:text-red-400">{sub.price} ر.س</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">حساب المنصة</span>
                            <span className="font-mono font-bold text-gray-700 dark:text-gray-300 text-[10px] truncate block" title={accountEmail}>
                              {accountEmail}
                            </span>
                            {accountBillingDate && (
                              <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                                ⏳ {formatAccountDaysRemainingLabel(accountBillingDate)}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">تاريخ الانتهاء</span>
                            <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{sub.endDate}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[11px] pt-1">
                          <span className="text-gray-500">حالة التذكير:</span>
                          {diffDays < 0 ? (
                            <span className="text-red-600 font-black">منتهي منذ {Math.abs(diffDays)} أيام!</span>
                          ) : diffDays === 0 ? (
                            <span className="text-amber-600 font-black">ينتهي اليوم!</span>
                          ) : (
                            <span className="text-blue-600 font-black">متبقي {diffDays} أيام على التجديد</span>
                          )}
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex flex-wrap gap-1.5 justify-end border-t dark:border-gray-700 pt-3">
                          <a
                            href={`https://wa.me/${sub.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `مرحباً أ/ ${sub.customerName}، نود تذكيركم بموعد تجديد اشتراككم في برنامج [${programName}] بقيمة ${sub.price} ر.س والمستحق بتاريخ ${sub.endDate}. لضمان عدم انقطاع الخدمة والوصول إلى المنصة، يرجى سداد الاشتراك وتأكيد التحويل. شكراً لكم.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] transition-colors shadow-sm"
                          >
                            <i className="fab fa-whatsapp text-xs"></i>
                            <span>واتساب</span>
                          </a>

                          <button
                            onClick={() => handleMarkTraineeAsPaid(sub)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-black text-[10px] transition-colors shadow-sm"
                            title="تجديد الاشتراك لشهر آخر بنفس الحساب الحالي"
                          >
                            <i className="fas fa-check"></i>
                            <span>دفع وتجديد</span>
                          </button>

                          <button
                            onClick={() => {
                              setRenewTransferSub(sub);
                              setRenewTransferTargetAccountId('');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] transition-colors shadow-sm"
                            title="تجديد الاشتراك ونقله إلى حساب متاح بالأولوية"
                          >
                            <i className="fas fa-exchange-alt"></i>
                            <span>دفع وتحويل لأيميل آخر</span>
                          </button>

                          <button
                            onClick={() => handleCancelTraineeSub(sub)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-950/20 text-gray-600 font-black text-[10px] transition-colors"
                            title="إيقاف الاشتراك وتفريغ المقعد"
                          >
                            <i className="fas fa-times-circle"></i>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (item.category === 'platforms') {
                  const { account, programName, diffDays } = item.data;
                  const linkedMethod = methods.find(m => m.id === account.paymentMethodId);
                  const isCardBlocked = linkedMethod && (linkedMethod.status === 'blocked' || linkedMethod.status === 'suspended' || linkedMethod.isSuspended || linkedMethod.enabled === false);

                  return (
                    <div
                      key={item.id}
                      className={`p-6 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden ${
                        isCardBlocked 
                          ? 'border-red-500/80 ring-2 ring-red-500/30' 
                          : item.colorClass
                      }`}
                    >
                      <div className="absolute top-0 right-0 left-0 h-1 bg-red-500 animate-pulse"></div>

                      <div className="space-y-2">
                        {/* Unified Top Category Badge */}
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100/50 dark:border-gray-700/50">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${item.badgeClass}`}>
                            <i className={item.categoryIcon}></i>
                            {item.categoryName}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                            diffDays <= 0 ? 'bg-red-100 text-red-600 dark:bg-red-950' : 'bg-amber-100 text-amber-600 dark:bg-amber-950'
                          }`}>
                            {diffDays < 0 ? 'متأخر جداً' : diffDays === 0 ? 'التجديد اليوم!' : diffDays === 1 ? 'تجديد غداً' : `متبقي ${diffDays} يوم`}
                          </span>
                        </div>

                        <div>
                          <span className="font-mono text-xs text-gray-400 block">حساب المنصة المطلوب شحنه</span>
                          <span className="font-black text-sm text-gray-900 dark:text-white block mt-0.5">
                            {account.email}
                          </span>
                        </div>

                        {/* HIGH PRIORITY WARNING IF CARD IS SUSPENDED / BLOCKED */}
                        {isCardBlocked ? (
                          <div className="bg-red-600 text-white p-3.5 rounded-2xl space-y-1.5 shadow-md animate-pulse border border-red-400">
                            <div className="flex items-center gap-2 font-black text-xs text-amber-200">
                              <i className="fas fa-exclamation-triangle text-base"></i>
                              <span>⚠️ يجب تغيير الفيزا لأنها اتوقفت!</span>
                            </div>
                            <p className="text-[11px] font-bold leading-relaxed text-red-100">
                              الفيزا المربوطة بهذا الحساب (<strong className="underline font-black">{linkedMethod?.name || 'بطاقة محظورة'}</strong>) اتوقفت/محظورة. مش هينفع نجدد بنفس الفيزا ويجب ربط بطاقة جديدة فوراً قبل موعد التجديد.
                            </p>
                          </div>
                        ) : (
                          <div className="bg-red-50/50 dark:bg-red-950/10 p-3 rounded-2xl border border-red-100/50 dark:border-red-900/20 text-xs">
                            <div className="grid grid-cols-2 gap-y-2 font-bold text-gray-700 dark:text-gray-300">
                              <div>البرنامج / المنصة:</div>
                              <div className="text-left text-gray-900 dark:text-white">{programName}</div>

                              <div>وسيلة الدفع المربوطة:</div>
                              <div className="text-left font-black text-slate-800 dark:text-slate-200">
                                {linkedMethod?.name || 'غير محددة'}
                              </div>

                              <div>مبلغ التجديد المطلوب:</div>
                              <div className="text-left text-red-600 dark:text-red-400 font-black">{account.cost} ر.س</div>

                              <div>تاريخ التجديد المستهدف:</div>
                              <div className="text-left font-mono text-gray-900 dark:text-white">{account.billingDate}</div>
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-gray-400 leading-relaxed font-bold">
                          💡 يرجى التأكد من وجود رصيد كافٍ بالفيزا المرتبطة وتعديل الفيزا إن كانت موقوفة.
                        </p>
                      </div>

                      {canManage && (
                        <div className="grid grid-cols-2 gap-3 border-t dark:border-gray-700 pt-3">
                          <button
                            onClick={() => handleConfirmPlatformBalance(account, programName)}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs transition-colors shadow-sm"
                          >
                            <i className="fas fa-check-double"></i>
                            <span>تم التأكد من الرصيد</span>
                          </button>

                          <button
                            onClick={() => handleStopPlatformSubscription(account, programName)}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white font-black text-xs transition-all"
                          >
                            <i className="fas fa-stop-circle"></i>
                            <span>إيقاف الاشتراك</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (item.category === 'custom') {
                  const alert = item.data;
                  const acc = accounts.find(a => a.id === alert.accountId);
                  const type = types.find(t => t.id === acc?.typeId);
                  const isOverdue = new Date(alert.reminderDate) <= new Date();

                  return (
                    <div
                      key={item.id}
                      className={`p-6 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden ${item.colorClass}`}
                    >
                      {isOverdue && <div className="absolute top-0 right-0 left-0 h-1 bg-red-500"></div>}

                      <div className="space-y-2">
                        {/* Unified Top Category Badge */}
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100/50 dark:border-gray-700/50">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${item.badgeClass}`}>
                            <i className={item.categoryIcon}></i>
                            {item.categoryName}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                            isOverdue ? 'bg-red-50 text-red-600 dark:bg-red-950/20' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20'
                          }`}>
                            تاريخ التنبيه: {alert.reminderDate}
                          </span>
                        </div>

                        <div>
                          <span className="font-black text-xs text-gray-900 dark:text-white block">
                            {type?.name || 'برنامج غير معروف'}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400 block mt-0.5">
                            الحساب: {acc?.email || 'إيميل غير معروف'}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 leading-relaxed mt-2 whitespace-pre-wrap">
                          {alert.message}
                        </p>
                      </div>

                      {/* Step trackers */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100/50 dark:border-gray-800/50 space-y-3">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          📋 خطوات الحل والتأكيد الإلزامية:
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={!!alert.step1Done}
                              onChange={() => handleToggleStep(alert.id, 1, !!alert.step1Done)}
                              className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                            />
                            <span className={`font-bold ${alert.step1Done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                              1. التواصل مع دعم Adobe لإزالة الفيزا من الحساب
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={!!alert.step2Done}
                              onChange={() => handleToggleStep(alert.id, 2, !!alert.step2Done)}
                              className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                            />
                            <span className={`font-bold ${alert.step2Done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                              2. إلغاء اشتراك الأكونت هذا.. وعمل أكونتات جديدة بديلة له
                            </span>
                          </label>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex gap-2 justify-end border-t dark:border-gray-700 pt-3">
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase transition-colors shadow-sm"
                          >
                            <i className="fas fa-check-double"></i>
                            <span>أرشفة التنبيه</span>
                          </button>
                          <button
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (item.category === 'allocation') {
                  const sys = item.data;
                  return (
                    <div
                      key={item.id}
                      className={`p-5 rounded-3xl border text-xs flex flex-col justify-between gap-3 shadow-sm transition-all duration-200 hover:shadow-md ${item.colorClass}`}
                    >
                      <div className="space-y-2">
                        {/* Unified Top Category Badge */}
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100/50 dark:border-gray-700/50">
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black ${item.badgeClass}`}>
                            <i className={item.categoryIcon}></i>
                            {item.categoryName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            sys.type === 'split_payment' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40'
                          }`}>
                            {sys.type === 'split_payment' ? 'دمج مالي مطلوب' : 'أولوية تسكين'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[10px] opacity-70">{sys.email}</span>
                        </div>
                        <p className="font-bold leading-relaxed">{sys.message}</p>
                      </div>

                      <div className="p-3 rounded-2xl bg-white/60 dark:bg-gray-800/60 border border-black/5 dark:border-white/5 space-y-1">
                        <div className="font-black text-[9px] uppercase tracking-wider text-gray-500">
                          💡 الحل المقترح والإجراء الذكي:
                        </div>
                        <p className="text-[11px] font-extrabold text-primary-600 dark:text-primary-400">{sys.suggestedAction}</p>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      )}

      {/* RENDER ACTIVE SUBTAB CONTENT */}
      {subTab === 'cancellations' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/30 p-4 rounded-2xl">
            <h4 className="text-xs font-extrabold text-purple-900 dark:text-purple-300 flex items-center gap-2">
              <i className="fas fa-ban text-purple-600"></i>
              تنبيهات إلغاء الاشتراكات للحسابات التجريبية والمؤقتة (Must Cancel Accounts)
            </h4>
            <p className="text-[11px] text-purple-800 dark:text-purple-400 mt-1">
              حسابات تم إنشاؤها للتجربة أو الاستخدام المؤقت ويلزم إلغاء اشتراكها من الموقع الرسمي قبل موعد الموعد المحدد لتفادي الخصم التلقائي المالي. لا تظهر هذه الحسابات في قائمة التجديد التلقائي لضمان الأمان الأقصى.
            </p>
          </div>

          {cancellationAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/50 rounded-full flex items-center justify-center text-purple-400 mx-auto mb-3">
                <i className="fas fa-check-double text-lg"></i>
              </div>
              <p className="text-xs text-gray-400 font-bold">لا توجد أي حسابات تجريبية ملزمة بالإلغاء حالياً!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {cancellationAlerts.map(c => (
                <div
                  key={c.id}
                  className="p-5 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm border-purple-200 dark:border-purple-900/40 hover:shadow-md transition-all duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs font-bold text-gray-900 dark:text-white block">
                          {c.account.email}
                        </span>
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                          البرنامج: {c.programName}
                        </span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        c.diffDays <= 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/60' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60'
                      }`}>
                        {c.diffDays < 0 ? '🚨 انتهى الموعد النهائي!' : c.diffDays === 0 ? '⚠️ اليوم موعد الإلغاء!' : `باقي ${c.diffDays} أيام`}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40 space-y-1">
                      <span className="text-[10px] font-black uppercase text-purple-800 dark:text-purple-300 block">
                        💡 سبب الإلغاء المشروح عند الإضافة:
                      </span>
                      <p className="text-xs font-extrabold text-purple-950 dark:text-purple-100 leading-relaxed">
                        {c.cancellationReason}
                      </p>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-1 border-t border-purple-100 dark:border-purple-900/30">
                      <span className="text-gray-500 font-bold">تاريخ الموعد النهائي للإلغاء:</span>
                      <span className="font-mono font-black text-rose-600 dark:text-rose-400">{c.cancellationDeadline}</span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex justify-end border-t dark:border-gray-700 pt-3">
                      <button
                        onClick={() => handleConfirmAccountCancellation(c.account)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs transition-colors shadow-sm"
                      >
                        <i className="fas fa-check-circle"></i>
                        <span>تأكيد إلغاء الاشتراك وإغلاق الحساب نهائياً</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'trainees' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-4 rounded-2xl">
            <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <i className="fas fa-info-circle"></i>
              النوع الأول: تنبيهات تحصيل اشتراكات المتدربين
            </h4>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              تظهر هنا اشتراكات المتدربين النشطة حالياً والتي حان موعد تجديدها (أو متبقي عليها أقل من 3 أيام) أو معلقة السداد، وذلك لتقوم بالتواصل معهم للتجديد وتحصيل المستحقات.
            </p>
          </div>

          {traineeAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-300 dark:text-gray-600 mx-auto mb-3">
                <i className="fas fa-user-check text-lg"></i>
              </div>
              <p className="text-xs text-gray-400 font-bold">كل اشتراكات المتدربين مسددة وحالة التحصيل ممتازة!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {traineeAlerts.map(({ id, sub, programName, accountEmail, accountBillingDate, diffDays, isOverdue }) => (
                <div
                  key={id}
                  className="p-5 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm border-gray-100 dark:border-gray-700 hover:shadow-md transition-all duration-200"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-black text-sm text-gray-900 dark:text-white block">
                          {sub.customerName}
                        </span>
                        <span className="font-mono text-[10px] text-gray-400 block mt-0.5">
                          هاتف: {sub.customerPhone}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        sub.paymentStatus === 'overdue' ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                      }`}>
                        {sub.paymentStatus === 'overdue' ? 'متأخر السداد' : 'انتظار الدفع'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-t border-b border-gray-50 dark:border-gray-700/50">
                      <div>
                        <span className="text-gray-400 block text-[10px]">البرنامج التدريبي</span>
                        <span className="font-extrabold text-gray-800 dark:text-gray-200">{programName}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">قيمة الاشتراك</span>
                        <span className="font-extrabold text-red-600 dark:text-red-400">{sub.price} ر.س</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">حساب المنصة</span>
                        <span className="font-mono font-bold text-gray-700 dark:text-gray-300 text-[10px] truncate block" title={accountEmail}>
                          {accountEmail}
                        </span>
                        {accountBillingDate && (
                          <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                            ⏳ {formatAccountDaysRemainingLabel(accountBillingDate)}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">تاريخ الانتهاء</span>
                        <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{sub.endDate}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] pt-1">
                      <span className="text-gray-500">حالة التذكير:</span>
                      {diffDays < 0 ? (
                        <span className="text-red-600 font-black">منتهي منذ {Math.abs(diffDays)} أيام!</span>
                      ) : diffDays === 0 ? (
                        <span className="text-amber-600 font-black">ينتهي اليوم!</span>
                      ) : (
                        <span className="text-blue-600 font-black">متبقي {diffDays} أيام على التجديد</span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap gap-1.5 justify-end border-t dark:border-gray-700 pt-3">
                      <a
                        href={`https://wa.me/${sub.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `مرحباً أ/ ${sub.customerName}، نود تذكيركم بموعد تجديد اشتراككم في برنامج [${programName}] بقيمة ${sub.price} ر.س والمستحق بتاريخ ${sub.endDate}. لضمان عدم انقطاع الخدمة والوصول إلى المنصة، يرجى سداد الاشتراك وتأكيد التحويل. شكراً لكم.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] transition-colors shadow-sm"
                      >
                        <i className="fab fa-whatsapp text-xs"></i>
                        <span>واتساب</span>
                      </a>

                      <button
                        onClick={() => handleMarkTraineeAsPaid(sub)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-black text-[10px] transition-colors shadow-sm"
                        title="تجديد الاشتراك لشهر آخر بنفس الحساب الحالي"
                      >
                        <i className="fas fa-check"></i>
                        <span>دفع وتجديد</span>
                      </button>

                      <button
                        onClick={() => {
                          setRenewTransferSub(sub);
                          setRenewTransferTargetAccountId('');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] transition-colors shadow-sm"
                        title="تجديد الاشتراك ونقله إلى حساب متاح بالأولوية"
                      >
                        <i className="fas fa-exchange-alt"></i>
                        <span>دفع وتحويل لأيميل آخر</span>
                      </button>

                      <button
                        onClick={() => handleCancelTraineeSub(sub)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-950/20 text-gray-600 font-black text-[10px] transition-colors"
                        title="إيقاف الاشتراك وتفريغ المقعد"
                      >
                        <i className="fas fa-times-circle"></i>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'platforms' && (
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 rounded-2xl">
            <h4 className="text-xs font-extrabold text-red-800 dark:text-red-300 flex items-center gap-2">
              <i className="fas fa-shield-alt"></i>
              النوع الثاني: تنبيهات تجديد حسابات المواقع والمنصات (تأكيد الرصيد أو إيقاف الاشتراك)
            </h4>
            <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
              يصدر هذا التنبيه تلقائياً قبل تاريخ تجديد الحساب بيومين أو أقل. يجب فحص البطاقة البنكية وتأكيد وجود رصيد لتفادي السحب الفاشل، أو اختيار إيقاف الاشتراك فوراً لتعليق الحساب وإعادة الإيميل لقسم الانتظار المجاني.
            </p>
          </div>

          {platformRenewalAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-300 dark:text-gray-600 mx-auto mb-3">
                <i className="fas fa-calendar-check text-lg"></i>
              </div>
              <p className="text-xs text-gray-400 font-bold">لا توجد حسابات منصات مستحقة التجديد خلال الـ 48 ساعة القادمة. كل الحسابات آمنة ومجددة!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {platformRenewalAlerts.map(({ id, account, programName, diffDays }) => (
                <div
                  key={id}
                  className="p-6 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm border-red-100 dark:border-red-900/20 hover:shadow-md transition-all duration-200 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 left-0 h-1.5 bg-red-500 animate-pulse"></div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs text-gray-400 block">حساب المنصة المطلوب شحنه</span>
                        <span className="font-black text-sm text-gray-900 dark:text-white block mt-0.5">
                          {account.email}
                        </span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                        diffDays <= 0 ? 'bg-red-100 text-red-600 dark:bg-red-950' : 'bg-amber-100 text-amber-600 dark:bg-amber-950'
                      }`}>
                        {diffDays < 0 ? 'متأخر جداً' : diffDays === 0 ? 'التجديد اليوم!' : diffDays === 1 ? 'تجديد غداً' : `متبقي ${diffDays} يوم`}
                      </span>
                    </div>

                    <div className="bg-red-50/50 dark:bg-red-950/10 p-3 rounded-2xl border border-red-100/50 dark:border-red-900/20 text-xs">
                      <div className="grid grid-cols-2 gap-y-2 font-bold text-gray-700 dark:text-gray-300">
                        <div>البرنامج / المنصة:</div>
                        <div className="text-left text-gray-900 dark:text-white">{programName}</div>

                        <div>مبلغ التجديد المطلوب:</div>
                        <div className="text-left text-red-600 dark:text-red-400 font-black">{account.cost} ر.س</div>

                        <div>تاريخ التجديد المستهدف:</div>
                        <div className="text-left font-mono text-gray-900 dark:text-white">{account.billingDate}</div>

                        <div>المقاعد المشغولة حالياً:</div>
                        <div className="text-left text-gray-900 dark:text-white">{account.activeSeats} / {account.maxSeats}</div>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-400 leading-relaxed font-bold">
                      💡 يرجى التأكد من وجود رصيد كافٍ بالفيزا المرتبطة لتجنب تعليق الحساب. في حال عدم السداد الفوري، انقر على إيقاف الاشتراك فوراً لضمان إرجاع الحساب للـ Free Tier وتعليق المشتركين تلقائياً.
                    </p>
                  </div>

                  {canManage && (
                    <div className="grid grid-cols-2 gap-3 border-t dark:border-gray-700 pt-3">
                      {/* Button 1: Confirmed balance */}
                      <button
                        onClick={() => handleConfirmPlatformBalance(account, programName)}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs transition-colors shadow-sm"
                        title="تم التحقق من الفيزا وبها رصيد وسيتم التجديد التلقائي"
                      >
                        <i className="fas fa-check-double"></i>
                        <span>تم التأكد من الرصيد</span>
                      </button>

                      {/* Button 2: Stop subscription */}
                      <button
                        onClick={() => handleStopPlatformSubscription(account, programName)}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white font-black text-xs transition-all"
                        title="إيقاف وسحب الحساب وتحويله إلى Free Tier وتعليقه"
                      >
                        <i className="fas fa-stop-circle"></i>
                        <span>إيقاف الاشتراك</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'custom' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
              <i className="fas fa-user-edit text-primary-500"></i>
              التنبيهات المخصصة المضافة يدوياً لحسابات معينة
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-12 text-xs text-gray-400 font-bold">جاري تحميل التنبيهات المخصصة...</div>
          ) : activeCustomAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">لا توجد تنبيهات مخصصة نشطة حالياً. انقر على الزر بالأعلى لإضافة تنبيه مخصص يدوياً.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activeCustomAlerts.map((alert) => {
                const acc = accounts.find(a => a.id === alert.accountId);
                const type = types.find(t => t.id === acc?.typeId);
                const isOverdue = new Date(alert.reminderDate) <= new Date();

                return (
                  <div
                    key={alert.id}
                    className="p-6 rounded-3xl border bg-white dark:bg-gray-800 flex flex-col justify-between gap-4 shadow-sm border-gray-100 dark:border-gray-700 hover:shadow-md transition-all duration-200 relative overflow-hidden"
                  >
                    {isOverdue && <div className="absolute top-0 right-0 left-0 h-1 bg-red-500"></div>}

                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-black text-xs text-gray-900 dark:text-white block">
                            {type?.name || 'برنامج غير معروف'}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400 block mt-0.5">
                            الحساب: {acc?.email || 'إيميل غير معروف'}
                          </span>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                          isOverdue ? 'bg-red-50 text-red-600 dark:bg-red-950/20' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20'
                        }`}>
                          تاريخ التنبيه: {alert.reminderDate}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 leading-relaxed mt-2 whitespace-pre-wrap">
                        {alert.message}
                      </p>
                    </div>

                    {/* Step trackers */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100/50 dark:border-gray-800/50 space-y-3">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        📋 خطوات الحل والتأكيد الإلزامية:
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                          <input
                            type="checkbox"
                            checked={!!alert.step1Done}
                            onChange={() => handleToggleStep(alert.id, 1, !!alert.step1Done)}
                            className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                          />
                          <span className={`font-bold ${alert.step1Done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            1. التواصل مع دعم Adobe لإزالة الفيزا من الحساب
                          </span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                          <input
                            type="checkbox"
                            checked={!!alert.step2Done}
                            onChange={() => handleToggleStep(alert.id, 2, !!alert.step2Done)}
                            className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                          />
                          <span className={`font-bold ${alert.step2Done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            2. إلغاء اشتراك الأكونت هذا.. وعمل أكونتات جديدة بديلة له
                          </span>
                        </label>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex gap-2 justify-end border-t dark:border-gray-700 pt-3">
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase transition-colors shadow-sm"
                        >
                          <i className="fas fa-check-double"></i>
                          <span>أرشفة التنبيه</span>
                        </button>
                        <button
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'allocation' && (
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
            <i className="fas fa-chart-pie text-primary-500"></i>
            تنبيهات المقاعد الشاغرة وعدم دمج الاشتراكات للحسابات المشتركة
          </h3>

          {allocationAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">لا توجد حسابات غير مكتملة أو معلقة الدمج. كفاءة استهلاك المقاعد ممتازة!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {allocationAlerts.map((sys) => (
                <div
                  key={sys.id}
                  className={`p-5 rounded-3xl border text-xs flex flex-col justify-between gap-3 shadow-sm transition-all duration-200 hover:shadow-md ${
                    sys.type === 'split_payment'
                      ? 'bg-red-50/40 dark:bg-red-950/10 border-red-100 dark:border-red-900/30 text-red-900 dark:text-red-100'
                      : 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30 text-amber-900 dark:text-amber-100'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        sys.type === 'split_payment' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40'
                      }`}>
                        {sys.type === 'split_payment' ? 'دمج مالي مطلوب' : 'أولوية تسكين'}
                      </span>
                      <span className="font-mono text-[10px] opacity-70">{sys.email}</span>
                    </div>
                    <p className="font-bold leading-relaxed">{sys.message}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/60 dark:bg-gray-800/60 border border-black/5 dark:border-white/5 space-y-1">
                    <div className="font-black text-[9px] uppercase tracking-wider text-gray-500">
                      💡 الحل المقترح والإجراء الذكي:
                    </div>
                    <p className="text-[11px] font-extrabold text-primary-600 dark:text-primary-400">{sys.suggestedAction}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'archive' && (
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
            <i className="fas fa-archive text-primary-500"></i>
            الأرشيف التاريخي للتنبيهات المؤرشفة والمكتملة
          </h3>

          {archivedCustomAlerts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">الأرشيف فارغ حالياً.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">الحساب</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">الرسالةالتذكيرية</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">تاريخ الاستحقاق</th>
                      <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">المؤرشف بواسطة</th>
                      {canManage && <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-left">إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                    {archivedCustomAlerts.map(alert => {
                      const acc = accounts.find(a => a.id === alert.accountId);
                      return (
                        <tr key={alert.id} className="opacity-70 hover:opacity-100 transition-opacity">
                          <td className="p-4 font-mono font-bold text-gray-900 dark:text-white">
                            {acc?.email || 'غير معروف'}
                          </td>
                          <td className="p-4 font-bold text-gray-600 dark:text-gray-300">
                            {alert.message}
                          </td>
                          <td className="p-4 font-mono font-bold">
                            {alert.reminderDate}
                          </td>
                          <td className="p-4">
                            <span className="font-extrabold text-green-600">
                              {alert.acknowledgedBy || 'الأدمن'} ({alert.acknowledgedAt?.split('T')[0]})
                            </span>
                          </td>
                          {canManage && (
                            <td className="p-4 text-left">
                              <button
                                onClick={() => handleDeleteAlert(alert.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Custom Alert Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-plus-circle text-red-500"></i>
                إضافة تنبيه/تذكير جديد لحساب
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Account select */}
              <div>
                <label className="text-[10px] font-black text-gray-400 block mb-1">
                  اختر حساب ترخيص البرنامج
                </label>
                <select
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                >
                  <option value="">-- اختر الحساب --</option>
                  {accounts.map(acc => {
                    const type = types.find(t => t.id === acc.typeId);
                    return (
                      <option key={acc.id} value={acc.id}>
                        [{type?.name || 'غير معروف'}] {acc.email}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="text-[10px] font-black text-gray-400 block mb-1">
                  تاريخ الاستحقاق والتذكير بالضبط
                </label>
                <input
                  type="date"
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none text-right"
                  value={reminderDate}
                  onChange={e => setReminderDate(e.target.value)}
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-[10px] font-black text-gray-400 block mb-1">
                  نص التذكير / سبب التنبيه
                </label>
                <textarea
                  required
                  rows={3}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  placeholder="مثال: سينتهي عرض خصم السنة في هذا التاريخ وسيرتفع السعر"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-4 justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 text-xs font-black text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-sm"
                >
                  إضافة التنبيه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENEW & TRANSFER MODAL */}
      {renewTransferSub && (() => {
        const currentAcc = accounts.find(a => a.id === renewTransferSub.accountId);
        const currentType = types.find(t => t.id === currentAcc?.typeId);
        const programName = currentType?.name || 'البرنامج التدريبي';

        // Available target accounts sorted by priority (longest duration first)
        const availableAccounts = sortAccountsByPriority(
          accounts.filter(a => 
            a.typeId === currentAcc?.typeId && 
            a.status === 'active' && 
            !a.isReserved
          )
        );

        const targetAcc = accounts.find(a => a.id === renewTransferTargetAccountId);
        const newEndDate = addOneMonthToDateStr(renewTransferSub.endDate);
        const salesRepText = renewTransferSub.salesRep || 'غير محدد';

        const transferMsgText = targetAcc ? `اسم العميل: ${renewTransferSub.customerName}
رقم الواتساب: ${renewTransferSub.customerPhone || 'غير محدد'}
السيلز المسؤول: ${salesRepText}

----------------------------------------
مرحباً أ/ ${renewTransferSub.customerName} 👋،
تم تأكيد تجديد اشتراكك ونقله إلى الحساب الجديد بنجاح:

• البرنامج: ${programName}
• الحساب الجديد: ${targetAcc.email}
• كلمة المرور: ${targetAcc.password || 'موجودة لديكم'}
• تاريخ التجديد والانتهاء الجديد: ${newEndDate}

📌 ملاحظة هامة: الاشتراك بنفس البيانات القديمة ينتهي في نفس الموعد الجديد (${newEndDate})، وهو مجرد تجديد وتغيير/تحويل للحساب فقط.

شكراً لاختيارك لنا! ❤️` : '';

        return (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[90vh] flex flex-col my-auto">
              <div className="p-5 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <i className="fas fa-sync-alt text-sm"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white">
                      دفع وتجديد وتحويل على إيميل آخر
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold">
                      تجديد الاشتراك لمدة شهر وتسكينه على حساب متاح بالأولوية
                    </p>
                  </div>
                </div>
                <button onClick={() => setRenewTransferSub(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <i className="fas fa-times text-base"></i>
                </button>
              </div>

              <form onSubmit={handleConfirmRenewAndTransfer} className="p-5 space-y-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
                {/* Info Box */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">اسم العميل:</span>
                    <span className="font-black text-gray-900 dark:text-white">{renewTransferSub.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">رقم الواتساب:</span>
                    <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{renewTransferSub.customerPhone || 'غير محدد'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">السيلز المسؤول:</span>
                    <span className="font-black text-primary-600 dark:text-primary-400">{salesRepText}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
                    <span className="text-gray-400 font-bold">البرنامج:</span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">{programName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">تاريخ الانتهاء الجديد:</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{newEndDate}</span>
                  </div>
                </div>

                {/* Dropdown for available accounts */}
                <div>
                  <label className="text-[11px] font-black text-gray-700 dark:text-gray-300 block mb-1">
                    اختر الحساب الجديد المتاح المفضل للتحويل (مرتبة بالأولوية للأطول مدة):
                  </label>
                  <select
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none border border-gray-200 dark:border-gray-600"
                    value={renewTransferTargetAccountId}
                    onChange={e => setRenewTransferTargetAccountId(e.target.value)}
                  >
                    <option value="">-- اختر حساب ترخيص متاح --</option>
                    {availableAccounts.map(a => {
                      const activeCount = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
                      const freeSeats = a.maxSeats - activeCount;
                      const isSame = a.id === renewTransferSub.accountId;
                      return (
                        <option key={a.id} value={a.id} disabled={freeSeats <= 0}>
                          {a.email} {isSame ? '(الحساب الحالي)' : ''} ({freeSeats} مقاعد متاحة) - ⏳ {formatAccountDaysRemainingLabel(a.billingDate)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Generated Message box */}
                {targetAcc && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-black text-gray-700 dark:text-gray-300 block">
                        💬 رسالة خدمة العملاء (مجهزة للنسخ):
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(transferMsgText);
                          setCopiedKey('renew_transfer_msg');
                          setTimeout(() => setCopiedKey(null), 2000);
                        }}
                        className="px-2.5 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px] font-black rounded-lg transition-colors flex items-center gap-1"
                      >
                        <i className={`fas ${copiedKey === 'renew_transfer_msg' ? 'fa-check' : 'fa-copy'}`}></i>
                        <span>{copiedKey === 'renew_transfer_msg' ? 'تم النسخ!' : 'نسخ الرسالة'}</span>
                      </button>
                    </div>

                    <textarea
                      readOnly
                      rows={8}
                      className="w-full p-3 bg-gray-50 dark:bg-gray-900 font-mono text-[11px] text-gray-800 dark:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-700 outline-none leading-relaxed"
                      value={transferMsgText}
                    />
                  </div>
                )}

                {/* Submit button */}
                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setRenewTransferSub(null)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={!renewTransferTargetAccountId}
                    className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-md"
                  >
                    <i className="fas fa-check-circle"></i>
                    <span>تأكيد السداد والتجديد والتحويل</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
