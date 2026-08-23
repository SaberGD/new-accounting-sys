import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { CustomerSubscription, SubscriptionAccount, SubscriptionType } from './types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { WhatsAppRedirectModal } from './WhatsAppRedirectModal';
import { sortAccountsByPriority, formatAccountDaysRemainingLabel } from './utils';

interface CustomersTabProps {
  customerSubs: CustomerSubscription[];
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  loading: boolean;
  onRefresh: () => void;
  canManage: boolean;
}

export function CustomersTab({
  customerSubs,
  accounts,
  types,
  loading,
  onRefresh,
  canManage
}: CustomersTabProps) {
  const lang = 'ar';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<CustomerSubscription | null>(null);

  // WhatsApp states
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [selectedSubForWhatsApp, setSelectedSubForWhatsApp] = useState<CustomerSubscription | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [accountId, setAccountId] = useState('');
  const [price, setPrice] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'expired' | 'canceled'>('active');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'overdue'>('paid');

  // Refund modal state
  const [refundSub, setRefundSub] = useState<CustomerSubscription | null>(null);
  const [refundReason, setRefundReason] = useState('بناءً على طلب العميل');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Temporary / Compensation subscription states (3 days trial/testing for a user)
  const [isTemporaryCompensation, setIsTemporaryCompensation] = useState(false);
  const [compensationDays, setCompensationDays] = useState(3);
  const [compensationReason, setCompensationReason] = useState('');

  // Search, sorting and filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest_added');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Pricing states
  const [seatsCount, setSeatsCount] = useState<number>(1);
  const [pricingMode, setPricingMode] = useState<'single' | 'offer' | 'custom'>('single');
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [basePrice, setBasePrice] = useState<number>(0);
  const [additionalDiscount, setAdditionalDiscount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [renewalOption, setRenewalOption] = useState<'same_discount' | 'base_price'>('same_discount');

  // Get active type and account
  const activeAccount = accounts.find(a => a.id === accountId);
  const activeType = activeAccount ? types.find(t => t.id === activeAccount.typeId) : null;

  // Automatically update prices and seat count based on pricingMode and selectedOfferId
  React.useEffect(() => {
    if (!activeType) {
      setBasePrice(0);
      setSeatsCount(1);
      return;
    }

    if (pricingMode === 'single') {
      const sPrice = activeType.seatPrice || 0;
      setBasePrice(sPrice);
      setSeatsCount(1);
      setSelectedOfferId('');
    } else if (pricingMode === 'offer') {
      let currentOffer = activeType.offers?.find(o => o.id === selectedOfferId);
      
      // If the currentOffer cannot be found, but activeType actually has offers,
      // default to the first available offer instead of falling back to 1 seat
      if (!currentOffer && activeType.offers && activeType.offers.length > 0) {
        currentOffer = activeType.offers[0];
        setSelectedOfferId(currentOffer.id);
      }

      if (currentOffer) {
        setBasePrice(currentOffer.totalPrice);
        setSeatsCount(currentOffer.seatsCount || 2);
      } else {
        // Fallback to single if no offers are available
        setPricingMode('single');
        setBasePrice(activeType.seatPrice || 0);
        setSeatsCount(1);
        setSelectedOfferId('');
      }
    } else {
      // In custom mode, basePrice is edited manually, so we do not overwrite it on every type change unless it was 0
      if (basePrice === 0) {
        setBasePrice(activeType.seatPrice || 0);
      }
      setSelectedOfferId('');
    }
  }, [accountId, pricingMode, selectedOfferId, activeType]);

  // Recalculate final price whenever basePrice or additionalDiscount changes
  React.useEffect(() => {
    if (pricingMode !== 'custom') {
      setPrice(Math.max(0, basePrice - additionalDiscount));
    }
  }, [basePrice, additionalDiscount, pricingMode]);

  // Transfer states
  const [transferSub, setTransferSub] = useState<CustomerSubscription | null>(null);
  const [transferAccountId, setTransferAccountId] = useState('');
  const [notifiedCustomer, setNotifiedCustomer] = useState(false);
  const [transferTemplate, setTransferTemplate] = useState('');

  const handleCopySubscriberCredentials = (sub: CustomerSubscription) => {
    const acc = accounts.find(a => a.id === sub.accountId);
    const type = types.find(t => t.id === acc?.typeId);
    const pass = acc?.password || acc?.masterPassword || (lang === 'ar' ? 'موجودة لديكم' : 'Provided separately');

    const msg = lang === 'ar'
      ? `مرحباً ${sub.customerName} 👋
إليك تفاصيل اشتراكك وبيانات الدخول الخاصة بك:

📌 البرنامج: ${type?.name || 'غير محدد'}
👤 اسم المشترك: ${sub.customerName}
📞 رقم الهاتف: ${sub.customerPhone || 'غير محدد'}

🔑 بيانات الدخول:
📧 البريد الإلكتروني: ${acc?.email || 'غير محدد'}
🔒 كلمة المرور: ${pass}

📅 تفاصيل الاشتراك:
• تاريخ البدء: ${sub.startDate || '-'}
• تاريخ الانتهاء: ${sub.endDate || '-'}
• قيمة الاشتراك: ${sub.isTemporaryCompensation ? `تجريبي تعويضي (${sub.compensationDays || 3} أيام)` : `${(sub.price || 0).toLocaleString()} EGP`}
• حالة السداد: ${sub.paymentStatus === 'paid' ? 'تم السداد ✅' : sub.paymentStatus === 'pending' ? 'معلق ⏳' : 'متأخر ⚠️'}

نتمنى لك تجربة ممتعة ومفيدة! 🌸`
      : `Hello ${sub.customerName} 👋
Here are your subscription and login credentials:

📌 Program: ${type?.name || 'N/A'}
👤 Subscriber: ${sub.customerName}
📞 Phone: ${sub.customerPhone || 'N/A'}

🔑 Login Credentials:
📧 Email: ${acc?.email || 'N/A'}
🔒 Password: ${pass}

📅 Subscription Details:
• Start Date: ${sub.startDate || '-'}
• End Date: ${sub.endDate || '-'}
• Price: ${sub.isTemporaryCompensation ? `Compensation (${sub.compensationDays || 3} days)` : `${(sub.price || 0).toLocaleString()} EGP`}
• Payment Status: ${sub.paymentStatus}

Wish you a great experience! 🌸`;

    navigator.clipboard.writeText(msg);
    setCopiedKey(`sub-credentials-${sub.id}`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const openTransferModal = (sub: CustomerSubscription) => {
    setTransferSub(sub);
    setTransferAccountId('');
    setNotifiedCustomer(false);
    setTransferTemplate('');
  };

  const handleSelectTransferAccount = (accId: string, sub: CustomerSubscription) => {
    setTransferAccountId(accId);
    const targetAcc = accounts.find(a => a.id === accId);
    if (targetAcc) {
      const salesRepText = sub.salesRep || 'غير محدد';
      const template = lang === 'ar' 
        ? `اسم العميل: ${sub.customerName}
رقم الواتساب: ${sub.customerPhone || 'غير محدد'}
السيلز المسؤول: ${salesRepText}

----------------------------------------
مرحباً ${sub.customerName}👋،
تم نقل اشتراكك لبرنامج الترخيص بنجاح إلى الحساب الجديد:

📧 البريد الإلكتروني: ${targetAcc.email}
🔑 كلمة المرور: ${targetAcc.password || '-'}

📌 تنبيه هام: الاشتراك بنفس البيانات القديمة وتاريخ الانتهاء هو نفسه (${sub.endDate || 'المحدد مسبقاً'})، وهو مجرد تغيير/تحويل للحساب فقط.

شكراً لاختيارك لنا! ❤️`
        : `Customer Name: ${sub.customerName}
WhatsApp Phone: ${sub.customerPhone || 'N/A'}
Sales Representative: ${salesRepText}

----------------------------------------
Hello ${sub.customerName},
Your license seat subscription has been successfully transferred to the new account:

Email: ${targetAcc.email}
Password: ${targetAcc.password || '-'}

Note: The subscription retains the exact same previous data and end date (${sub.endDate || 'N/A'}), this is an account transfer only.

Thank you for choosing us!`;
      setTransferTemplate(template);
    } else {
      setTransferTemplate('');
    }
  };

  const handleConfirmRefund = async (sub: CustomerSubscription) => {
    if (!sub) return;
    try {
      // 1. Update customer subscription status to canceled
      await updateDoc(doc(db, 'customerSubscriptions', sub.id), {
        status: 'canceled',
        refundReason
      });

      // 2. Recalculate active seats
      const currentActiveCount = customerSubs
        .filter(s => s.accountId === sub.accountId && s.status === 'active' && s.id !== sub.id)
        .reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      
      await updateDoc(doc(db, 'subscriptionAccounts', sub.accountId), {
        activeSeats: currentActiveCount
      });

      // 3. Add audit log
      const refundInfo = calcProRataRefund(sub);
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'CLIENT_SUBSCRIPTION_REFUNDED',
        description: `Refunded customer ${sub.customerName} amount ${refundInfo.refundAmount} EGP`,
        performedBy: 'Staff',
        performedByEmail: '',
        details: {
          customerId: sub.customerId,
          customerName: sub.customerName,
          paidAmount: refundInfo.paidAmount,
          refundAmount: refundInfo.refundAmount,
          reason: refundReason
        }
      });

      setRefundSub(null);
      onRefresh();
    } catch (err) {
      console.error('Error processing refund:', err);
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSub || !transferAccountId) return;

    const sourceAccountId = transferSub.accountId;
    const targetAccountId = transferAccountId;

    try {
      // 1. Update customer subscription document with the new accountId
      await updateDoc(doc(db, 'customerSubscriptions', transferSub.id), {
        accountId: targetAccountId
      });

      // 2. Recalculate active seats for the source and target accounts
      const sourceActiveCount = customerSubs.filter(s => s.accountId === sourceAccountId && s.id !== transferSub.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      const targetActiveCount = customerSubs.filter(s => s.accountId === targetAccountId && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0) + (transferSub.seatsCount || 1);

      await updateDoc(doc(db, 'subscriptionAccounts', sourceAccountId), {
        activeSeats: sourceActiveCount
      });
      await updateDoc(doc(db, 'subscriptionAccounts', targetAccountId), {
        activeSeats: targetActiveCount
      });

      // 3. Add an audit log
      const srcAcc = accounts.find(a => a.id === sourceAccountId);
      const destAcc = accounts.find(a => a.id === targetAccountId);
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'SUBSCRIPTION_TRANSFERRED',
        description: `Transferred customer ${transferSub.customerName} subscription from ${srcAcc?.email || 'Unknown'} to ${destAcc?.email || 'Unknown'}`,
        performedBy: 'Staff',
        performedByEmail: '',
        details: {
          customerId: transferSub.customerId,
          customerName: transferSub.customerName,
          sourceAccount: srcAcc?.email,
          targetAccount: destAcc?.email,
          notified: notifiedCustomer,
          messageSent: transferTemplate
        }
      });

      setTransferSub(null);
      onRefresh();
    } catch (err) {
      console.error('Error transferring subscription:', err);
    }
  };

  const handleExportPDF = async (sub: CustomerSubscription) => {
    const acc = accounts.find(a => a.id === sub.accountId);
    const type = types.find(t => t.id === acc?.typeId);

    const invoiceId = `INV-SUB-${sub.id.slice(0, 8).toUpperCase()}`;
    const issueDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ');

    const getLastPaymentDate = (endDateStr: string) => {
      if (!endDateStr) return 'غير محدد';
      try {
        const d = new Date(endDateStr);
        if (isNaN(d.getTime())) return 'غير محدد';
        d.setDate(d.getDate() - 2);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ');
      } catch (e) {
        return 'غير محدد';
      }
    };
    const lastPaymentDate = getLastPaymentDate(sub.endDate);

    // Create container for PDF content
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = "'Cairo', 'Arial', sans-serif";
    container.style.direction = 'rtl';
    container.style.padding = '0';

    container.innerHTML = `
      <!-- PAGE 1: Receipt -->
      <div id="invoice-page1" style="width: 800px; height: 1130px; background: white; display: flex; flex-direction: column; position: relative; box-sizing: border-box; overflow: hidden; margin-bottom: 20px;">
        <!-- Header with Gradient -->
        <div style="background: linear-gradient(135deg, #000 0%, #FF5A00 100%); padding: 60px 40px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
          <div style="min-width: 280px;">
            <div style="font-size: 34px; font-weight: 900; margin-bottom: 25px; white-space: nowrap;">إيصال سداد اشتراك برنامج</div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 700; width: 320px; margin: 0 auto;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                <span style="color: rgba(255,255,255,0.7);">رقم الفاتورة</span>
                <span style="color: #FF5A00; direction: ltr;">${invoiceId}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                <span style="color: rgba(255,255,255,0.7);">تاريخ الإصدار</span>
                <span style="direction: ltr;">${issueDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: rgba(255,255,255,0.7);">رقم الاشتراك</span>
                <span style="color: #FF5A00; direction: ltr;">SUB-${sub.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 40px 50px;">
          <!-- Customer & Program Info -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-bottom: 40px;">
            <!-- Customer Info (Right) -->
            <div style="direction: rtl;">
              <div style="display: flex; align-items: center; gap: 10px; color: #FF5A00; font-size: 18px; font-weight: 900; margin-bottom: 20px;">
                <span>بيانات العميل</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px; color: #333;">
                <div style="display: flex; gap: 10px;"><span style="color: #999; width: 80px;">الاسم :</span> <span style="font-weight: 800;">${sub.customerName}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #999; width: 80px;">رقم الهاتف :</span> <span style="font-weight: 800; direction: ltr;">${sub.customerPhone || '-'}</span></div>
              </div>
            </div>
            <!-- Program Info (Left) -->
            <div style="direction: rtl;">
              <div style="display: flex; align-items: center; gap: 10px; color: #FF5A00; font-size: 18px; font-weight: 900; margin-bottom: 20px;">
                <span>بيانات الاشتراك</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px; color: #333;">
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 90px;">اسم البرنامج :</span> <span style="font-weight: 800;">${type?.name || 'غير محدد'}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 90px;">حساب الدخول :</span> <span style="font-weight: 800; color: #1e40af;">${acc?.email || 'سيتم إرساله للعميل'}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 90px;">تاريخ البدء :</span> <span style="font-weight: 800; direction: ltr;">${sub.startDate.split('-').reverse().join(' / ')}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 90px;">تاريخ التجديد :</span> <span style="font-weight: 800; direction: ltr; color: #dc2626;">${sub.endDate ? sub.endDate.split('-').reverse().join(' / ') : 'غير محدد'}</span></div>
              </div>
            </div>
          </div>

          <!-- Pricing Breakdown -->
          <div style="border: 1px solid #eee; border-radius: 20px; padding: 25px; background: #fafafa; margin-bottom: 30px; direction: rtl;">
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 16px; margin-bottom: 20px; color: #333;">
              <span>تفاصيل الرسوم والاشتراك</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px;">
              <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="color: #666; font-weight: 700;">عدد المقاعد المحجوزة:</span>
                <span style="font-weight: 900; color: #000;">${sub.seatsCount || 1} ${sub.seatsCount && sub.seatsCount > 1 ? 'مقاعد' : 'مقعد فردي'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="color: #666; font-weight: 700;">السعر الأساسي:</span>
                <span style="font-weight: 900; color: #000;">${(sub.basePrice || sub.price || 0).toLocaleString()} EGP</span>
              </div>

              ${sub.additionalDiscount && sub.additionalDiscount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee; color: #dc2626;">
                <span style="font-weight: 700;">خصم إضافي خاص:</span>
                <span style="font-weight: 900;">- ${sub.additionalDiscount.toLocaleString()} EGP (${sub.discountReason || ''})</span>
              </div>
              ` : ''}

              ${sub.savingAmount && sub.savingAmount > 0 ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 15px; border-radius: 12px; color: #166534; font-weight: 800; font-size: 13px; margin: 10px 0;">
                <span>وفرت في عرض المقاعد:</span>
                <span>وفرت ${sub.savingAmount.toLocaleString()} جنيه في عرض ${sub.seatsCount || 2} مقاعد</span>
              </div>
              ` : ''}
              
              <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; color: #FF5A00; background: #fff; padding: 15px; border-radius: 15px; border: 1px solid #FF5A00; margin-top: 5px;">
                <span>إجمالي القيمة المدفوعة:</span>
                <span>${(sub.price || 0).toLocaleString()} EGP</span>
              </div>
            </div>
          </div>

          <!-- Subscription Status Bar -->
          <div style="border: 1px solid #eee; border-radius: 20px; padding: 25px; background: #fff; margin-bottom: 35px; direction: rtl;">
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 16px; margin-bottom: 20px;">
              <span>حالة الاشتراك والتجديد</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
              <div style="border: 1px solid #eee; border-radius: 15px; padding: 15px; display: flex; align-items: center; gap: 12px; background: #f0fdf4; border-color: #bbf7d0;">
                <div>
                  <div style="font-size: 10px; color: #166534; font-weight: 800;">تاريخ التجديد الشهري القادم</div>
                  <div style="font-size: 16px; font-weight: 900; color: #166534; direction: ltr; text-align: right;">${sub.endDate ? sub.endDate.split('-').reverse().join(' / ') : '-'}</div>
                </div>
              </div>
              <div style="border: 1px solid #eee; border-radius: 15px; padding: 15px; display: flex; align-items: center; gap: 12px; background: #fffbeb; border-color: #fef3c7;">
                <div>
                  <div style="font-size: 10px; color: #92400e; font-weight: 800;">آخر موعد لدفع التجديد</div>
                  <div style="font-size: 16px; font-weight: 900; color: #b45309; direction: ltr; text-align: right;">${lastPaymentDate}</div>
                </div>
              </div>
            </div>
            <div style="text-align: center; font-size: 11px; font-weight: 800; color: #666; margin-top: 15px;">* يجب دفع التجديد الشهري في تاريخ الاستحقاق لتجنب إيقاف الخدمة أو تعطيل حساب الترخيص تلقائياً.</div>
          </div>

          <!-- Footer Notes & Terms -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; direction: rtl;">
            <!-- Notes -->
            <div style="border: 1px solid #eee; border-radius: 20px; padding: 20px; text-align: right; background: #fff;">
              <div style="display: flex; justify-content: flex-start; align-items: center; gap: 10px; color: #FF5A00; font-weight: 900; margin-bottom: 15px; flex-direction: row-reverse;">
                 <span style="margin-right: 10px;">ملاحظات هامة</span>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 11px; font-weight: 700; color: #444; line-height: 2;">
                <li>• الدعم الفني للبرنامج متاح طوال فترة الاشتراك.</li>
                <li>• سيتم إرسال تذكير تلقائي قبل موعد التجديد بـ 3 أيام.</li>
                <li>• في حالة الاستفسارات، يرجى التواصل مع إدارة اشتراكات البرامج.</li>
              </ul>
            </div>
            <!-- Terms -->
            <div style="border: 1px solid #eee; border-radius: 20px; padding: 20px; text-align: right; background: #fff;">
              <div style="display: flex; justify-content: flex-start; align-items: center; gap: 10px; color: #FF5A00; font-weight: 900; margin-bottom: 15px; flex-direction: row-reverse;">
                 <span style="margin-right: 10px;">شروط استخدام المقاعد</span>
              </div>
              <div style="font-size: 10px; color: #444; line-height: 1.6; font-weight: 700;">
                الحساب مخصص للاستخدام الشخصي فقط للعميل المسجل، ويُمنع منعاً باتاً مشاركة بيانات الدخول مع أي شخص آخر.
                <br>
                في حالة رغبة العميل في إلغاء الاشتراك، يرجى إبلاغ الدعم الفني قبل تاريخ التجديد بـ 48 ساعة على الأكثر.
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Bar -->
        <div style="margin-top: auto; background: #FF5A00; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; color: white;">
          <div style="display: flex; gap: 25px; align-items: center; font-size: 11px; font-weight: 700; direction: ltr;">
            <div style="display: flex; align-items: center; gap: 8px;"> +20 110 169 4022</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"> sabergroup.courses</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"> sabergroup.egc</div>
          </div>
          <div style="font-family: 'Montserrat', sans-serif; font-style: italic; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">Learn. Apply. Grow.</div>
        </div>
      </div>

      <!-- PAGE 2: Rules & Important Instructions -->
      <div id="invoice-page2" style="width: 800px; height: 1130px; background: white; display: flex; flex-direction: column; position: relative; box-sizing: border-box; overflow: hidden;">
        <!-- Header with Gradient -->
        <div style="background: linear-gradient(135deg, #000 0%, #FF5A00 100%); padding: 35px 40px; color: white; display: flex; align-items: center; justify-content: center; text-align: center; gap: 15px; margin-bottom: 25px;">
          <span style="font-size: 26px; font-weight: 900;">⚠️ تعليمات مهمة للحفاظ على حسابك واستمرار الخدمة</span>
        </div>

        <div style="padding: 0 50px; display: flex; flex-direction: column; flex-grow: 1;">
          <!-- Welcome message -->
          <div style="border: 1px solid #ffedd5; background: #fffdfa; border-radius: 15px; padding: 18px; font-size: 13.5px; font-weight: 700; color: #c2410c; margin-bottom: 25px; line-height: 1.8; text-align: center;">
            تم تفعيل حسابك بنجاح، ويمكنك الآن استخدام الخدمات المتاحة ضمن اشتراكك بشكل طبيعي. <br/>
            نرجو الالتزام بالتعليمات التالية للحفاظ على استقرار الحساب وتجنب أي مشاكل أو إيقاف للخدمة:
          </div>

          <!-- Allowed / Forbidden bento boxes -->
          <div style="display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 25px;">
            <!-- Allowed -->
            <div style="border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 20px; padding: 20px; text-align: right;">
              <div style="display: flex; align-items: center; gap: 10px; color: #166534; font-size: 15px; font-weight: 900; margin-bottom: 12px; flex-direction: row-reverse; justify-content: flex-end;">
                <span style="margin-left: 8px; background: #166534; color: white; border-radius: 50px; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px;">✓</span>
                <span style="font-weight: 900;">✅ مسموح لك:</span>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 12.5px; font-weight: 700; color: #14532d; line-height: 1.8; space-y: 6px;">
                <li style="margin-bottom: 6px;">• استخدام الحساب بشكل طبيعي في البرامج والخدمات المشمولة بالاشتراك.</li>
                <li style="margin-bottom: 6px;">• تسجيل الدخول من أجهزتك واستخدام التطبيقات حسب حدود الاشتراك الخاص بك.</li>
                <li>• حفظ ملفاتك واستخدام الأدوات المتاحة لك بشكل طبيعي.</li>
              </ul>
            </div>

            <!-- Forbidden -->
            <div style="border: 1px solid #fecaca; background: #fef2f2; border-radius: 20px; padding: 20px; text-align: right;">
              <div style="display: flex; align-items: center; gap: 10px; color: #991b1b; font-size: 15px; font-weight: 900; margin-bottom: 12px; flex-direction: row-reverse; justify-content: flex-end;">
                <span style="margin-left: 8px; background: #991b1b; color: white; border-radius: 50px; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px;">!</span>
                <span style="font-weight: 900;">⚠️ ممنوع إجراء أي تعديلات على بيانات الحساب:</span>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 12.5px; font-weight: 700; color: #7f1d1d; line-height: 1.8; space-y: 6px;">
                <li style="margin-bottom: 6px;">• عدم إضافة أي بريد إلكتروني كـ Recovery Email / Secondary Email.</li>
                <li style="margin-bottom: 6px;">• عدم تغيير البريد الأساسي أو كلمة المرور.</li>
                <li style="margin-bottom: 6px;">• عدم تعديل بيانات الحساب أو معلومات الأمان.</li>
                <li style="margin-bottom: 6px;">• عدم تفعيل أي إعدادات أمان أو طرق استرداد جديدة بدون الرجوع إلينا.</li>
                <li style="margin-bottom: 6px;">• عدم مشاركة بيانات الحساب مع أي شخص آخر.</li>
                <li>• عدم استخدام الحساب بطريقة تخالف سياسات الخدمة أو تؤثر على باقي المستخدمين.</li>
              </ul>
            </div>
          </div>

          <!-- Explanations and Penalties -->
          <div style="border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 20px; padding: 20px; text-align: right; margin-bottom: 25px;">
            <div style="color: #334155; font-size: 14.5px; font-weight: 900; margin-bottom: 8px;">لماذا هذه التعليمات؟</div>
            <div style="font-size: 11.5px; color: #475569; font-weight: 700; line-height: 1.8; margin-bottom: 15px;">
              الحسابات يتم إدارتها ضمن نظام اشتراكات لضمان استمرار الخدمة لجميع المشتركين، وأي تعديل على بيانات الحساب أو إعدادات الأمان قد يؤدي إلى فقدان التحكم بالحساب أو توقف الخدمة.
            </div>
            
            <div style="border-top: 1px dashed #cbd5e1; padding-top: 15px; margin-top: 12px;">
              <div style="color: #b91c1c; font-size: 13.5px; font-weight: 900; margin-bottom: 8px;">في حالة اكتشاف أي محاولة لـ:</div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11.5px; color: #7f1d1d; font-weight: 800; margin-bottom: 15px;">
                <div>• تغيير بيانات الحساب.</div>
                <div>• ربط الحساب ببريد شخصي.</div>
                <div>• نقل ملكية الحساب.</div>
                <div>• استخدام الحساب خارج حدود الاشتراك.</div>
              </div>
              <div style="font-size: 11.5px; color: #b91c1c; font-weight: 900; line-height: 1.8; background: #fef2f2; padding: 12px; border-radius: 12px; border: 1px solid #fee2e2;">
                سيتم اتخاذ الإجراءات اللازمة وقد يتم إيقاف الاشتراك وإلغاء الوصول للحساب دون استرجاع قيمة الاشتراك المدفوعة.
              </div>
            </div>
          </div>

          <!-- Bottom friendly notice -->
          <div style="text-align: center; font-size: 12.5px; font-weight: 900; color: #1e293b; line-height: 1.8; margin-bottom: auto; padding: 10px 0;">
            نؤكد أن الهدف هو حماية حسابك وضمان استمرار الخدمة، ويمكنك استخدام الحساب بحرية كاملة طالما يتم استخدامه ضمن الحدود المسموحة.
            <br/>
            <span style="font-size: 15px; color: #FF5A00; font-weight: 950; display: block; margin-top: 8px;">شكرًا لثقتك ❤️</span>
          </div>
        </div>

        <!-- Bottom Bar -->
        <div style="margin-top: auto; background: #FF5A00; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; color: white;">
          <div style="display: flex; gap: 25px; align-items: center; font-size: 11px; font-weight: 700; direction: ltr;">
            <div style="display: flex; align-items: center; gap: 8px;"> +20 110 169 4022</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"> sabergroup.courses</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"> sabergroup.egc</div>
          </div>
          <div style="font-family: 'Montserrat', sans-serif; font-style: italic; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">Learn. Apply. Grow.</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    
    try {
      const element1 = container.querySelector('#invoice-page1') as HTMLElement;
      const element2 = container.querySelector('#invoice-page2') as HTMLElement;

      const canvas1 = await html2canvas(element1, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const canvas2 = await html2canvas(element2, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Page 1 rendering
      const imgWidth1 = canvas1.width;
      const imgHeight1 = canvas1.height;
      const ratio1 = Math.min(pdfWidth / imgWidth1, (pdfHeight - 20) / imgHeight1);
      const imgX1 = (pdfWidth - imgWidth1 * ratio1) / 2;
      const imgY1 = 10;
      
      const imgData1 = canvas1.toDataURL('image/png');
      pdf.addImage(imgData1, 'PNG', imgX1, imgY1, imgWidth1 * ratio1, imgHeight1 * ratio1);
      
      // Page 2 rendering
      pdf.addPage();
      const imgWidth2 = canvas2.width;
      const imgHeight2 = canvas2.height;
      const ratio2 = Math.min(pdfWidth / imgWidth2, (pdfHeight - 20) / imgHeight2);
      const imgX2 = (pdfWidth - imgWidth2 * ratio2) / 2;
      const imgY2 = 10;
      
      const imgData2 = canvas2.toDataURL('image/png');
      pdf.addImage(imgData2, 'PNG', imgX2, imgY2, imgWidth2 * ratio2, imgHeight2 * ratio2);

      pdf.save(`${sub.customerName || 'Customer'} Subscription.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Error generating PDF. Please try again.");
    } finally {
      document.body.removeChild(container);
    }
  };

  const openAddModal = () => {
    setEditingSub(null);
    setCustomerName('');
    setCustomerPhone('');
    setSalesRep('');
    
    // Default to first active account with open seats
    const availableAccount = accounts.find(a => {
      const activeSeats = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      return a.status === 'active' && activeSeats < a.maxSeats;
    });

    setAccountId(availableAccount?.id || '');
    setPrice(0);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setStatus('active');
    setPaymentStatus('paid');

    setPricingMode('single');
    setSelectedOfferId('');
    setBasePrice(0);
    setAdditionalDiscount(0);
    setDiscountReason('');
    setSeatsCount(1);
    setRenewalOption('same_discount');

    setIsTemporaryCompensation(false);
    setCompensationDays(3);
    setCompensationReason('');

    setModalOpen(true);
  };

  const openEditModal = (sub: CustomerSubscription) => {
    setEditingSub(sub);
    setCustomerName(sub.customerName || '');
    setCustomerPhone(sub.customerPhone || '');
    setSalesRep(sub.salesRep || '');
    setAccountId(sub.accountId || '');
    setPrice(sub.price || 0);
    setStartDate(sub.startDate || '');
    setEndDate(sub.endDate || '');
    setStatus(sub.status || 'active');
    setPaymentStatus(sub.paymentStatus || 'paid');

    setSeatsCount(sub.seatsCount || 1);
    setAdditionalDiscount(sub.additionalDiscount || 0);
    setDiscountReason(sub.discountReason || '');
    setBasePrice(sub.basePrice || sub.price || 0);
    setRenewalOption(sub.renewalOption || 'same_discount');

    setIsTemporaryCompensation(sub.isTemporaryCompensation || false);
    setCompensationDays(sub.compensationDays || 3);
    setCompensationReason(sub.compensationReason || '');

    if (sub.selectedOfferId) {
      setPricingMode('offer');
      setSelectedOfferId(sub.selectedOfferId);
    } else if (sub.basePrice && sub.basePrice !== sub.price) {
      setPricingMode('single');
    } else {
      setPricingMode((sub.seatsCount && sub.seatsCount > 1) ? 'custom' : 'single');
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !accountId) return;

    // Check account limit
    const targetAccount = accounts.find(a => a.id === accountId);
    if (!targetAccount) return;

    const currentActiveSeats = customerSubs.filter(s => s.accountId === accountId && s.status === 'active' && s.id !== editingSub?.id).reduce((sum, s) => sum + (s.seatsCount || 1), 0);

    if (status === 'active' && (currentActiveSeats + Number(seatsCount)) > targetAccount.maxSeats) {
      alert(lang === 'ar' ? 'عذراً! هذا الحساب مكتمل بالكامل ولا توجد مقاعد شاغرة كافية لهذا العدد.' : 'Sorry! This license account does not have enough vacant seats for this count.');
      return;
    }

    if (additionalDiscount > 0 && !discountReason.trim()) {
      alert(lang === 'ar' ? 'يرجى كتابة سبب الخصم الإضافي.' : 'Please enter a reason for the additional discount.');
      return;
    }

    const calculatedSaving = pricingMode === 'offer'
      ? (activeType?.offers?.find(o => o.id === selectedOfferId)?.savingAmount || 0) + Number(additionalDiscount)
      : Number(additionalDiscount);

    const data: any = {
      customerId: '',
      customerName,
      customerPhone,
      salesRep,
      accountId,
      price: isTemporaryCompensation ? 0 : Number(price),
      startDate,
      endDate,
      status,
      paymentStatus: isTemporaryCompensation ? 'paid' : paymentStatus,
      seatIndex: currentActiveSeats + 1,
      seatsCount: Number(seatsCount),
      selectedOfferId: pricingMode === 'offer' ? selectedOfferId : '',
      basePrice: Number(basePrice),
      additionalDiscount: Number(additionalDiscount),
      discountReason: additionalDiscount > 0 ? discountReason : '',
      savingAmount: calculatedSaving,
      renewalOption,
      isTemporaryCompensation,
      compensationDays: isTemporaryCompensation ? Number(compensationDays) : 0,
      compensationReason: isTemporaryCompensation ? compensationReason : '',
      createdAt: editingSub?.createdAt || new Date().toISOString()
    };

    try {
      if (editingSub) {
        await updateDoc(doc(db, 'customerSubscriptions', editingSub.id), data);
        
        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'CLIENT_SEAT_UPDATED',
          description: `Updated client seat subscription for ${customerName}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      } else {
        await addDoc(collection(db, 'customerSubscriptions'), data);
        
        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'CLIENT_SEAT_ASSIGNED',
          description: `Assigned new program license seat to client ${customerName}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      }

      // Also trigger a recalculation of activeSeats in SubscriptionAccount
      const otherActiveSubs = customerSubs.filter(s => s.accountId === accountId && s.status === 'active' && s.id !== editingSub?.id);
      const updatedActiveSeatsCount = otherActiveSubs.reduce((sum, s) => sum + (s.seatsCount || 1), 0) + (status === 'active' ? Number(seatsCount) : 0);

      await updateDoc(doc(db, 'subscriptionAccounts', accountId), {
        activeSeats: updatedActiveSeatsCount
      });

      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error saving customer subscription seat:', err);
    }
  };

  const handleDelete = async (sub: CustomerSubscription) => {
    if (!window.confirm(lang === 'ar' ? 'هل أنت متأكد من إلغاء وحذف هذا المقعد؟' : 'Are you sure you want to release and delete this seat?')) return;
    try {
      await deleteDoc(doc(db, 'customerSubscriptions', sub.id));
      
      // Reduce active seats in account
      const currentActiveCount = customerSubs.filter(s => s.accountId === sub.accountId && s.status === 'active' && s.id !== sub.id).reduce((sum, s) => sum + (s.seatsCount || 1), 0);
      await updateDoc(doc(db, 'subscriptionAccounts', sub.accountId), {
        activeSeats: currentActiveCount
      });

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'CLIENT_SEAT_RELEASED',
        description: `Released license seat for client ${sub.customerName}`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      onRefresh();
    } catch (err) {
      console.error('Error deleting seat subscription:', err);
    }
  };

  // Helper to calculate pro-rata refund for customer subscription
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
      refundAmount
    };
  };

  // Filter and sort customer subscriptions
  const filteredCustomerSubs = React.useMemo(() => {
    let list = [...customerSubs];

    // 1. Search Filter (Search by customer name, phone, assigned email/account or program type)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      list = list.filter(sub => {
        const acc = accounts.find(a => a.id === sub.accountId);
        const type = types.find(t => t.id === acc?.typeId);
        
        const nameMatch = sub.customerName?.toLowerCase().includes(searchLower);
        const phoneMatch = sub.customerPhone?.includes(searchLower);
        const salesRepMatch = sub.salesRep?.toLowerCase().includes(searchLower);
        const emailMatch = acc?.email?.toLowerCase().includes(searchLower);
        const programMatch = type?.name?.toLowerCase().includes(searchLower);

        return nameMatch || phoneMatch || salesRepMatch || emailMatch || programMatch;
      });
    }

    // 2. Month Filter (based on endDate YYYY-MM-DD)
    if (filterMonth !== 'all') {
      list = list.filter(sub => {
        if (!sub.endDate) return false;
        const parts = sub.endDate.split('-');
        if (parts.length < 2) return false;
        return parts[1] === filterMonth; // e.g. "07" or "08"
      });
    }

    // 3. Status Filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'temporary') {
        list = list.filter(sub => sub.isTemporaryCompensation || (sub.price || 0) === 0);
      } else if (filterStatus === 'paid') {
        list = list.filter(sub => !sub.isTemporaryCompensation && (sub.price || 0) > 0);
      } else if (filterStatus === 'restricted') {
        list = list.filter(sub => {
          const acc = accounts.find(a => a.id === sub.accountId);
          return acc?.status === 'restricted';
        });
      } else {
        list = list.filter(sub => sub.status === filterStatus);
      }
    }

    // 4. Sorting
    list.sort((a, b) => {
      const accA = accounts.find(acc => acc.id === a.accountId);
      const accB = accounts.find(acc => acc.id === b.accountId);
      const typeA = types.find(t => t.id === accA?.typeId);
      const typeB = types.find(t => t.id === accB?.typeId);

      // If restricted filter active or explicit refund_desc sort, sort by highest refund amount first
      if (filterStatus === 'restricted' || sortBy === 'refund_desc') {
        const refundA = calcProRataRefund(a).refundAmount;
        const refundB = calcProRataRefund(b).refundAmount;
        return refundB - refundA;
      }

      if (sortBy === 'newest_added') {
        const timeA = a.createdAt || a.startDate || '';
        const timeB = b.createdAt || b.startDate || '';
        return timeB.localeCompare(timeA);
      }
      
      if (sortBy === 'alphabetical') {
        return (a.customerName || '').localeCompare(a.customerName || '', 'ar');
      }

      if (sortBy === 'email_alphabetical') {
        const emailA = accA?.email || '';
        const emailB = accB?.email || '';
        return emailA.localeCompare(emailB);
      }

      if (sortBy === 'program') {
        const nameA = typeA?.name || '';
        const nameB = typeB?.name || '';
        return nameA.localeCompare(nameB, 'ar');
      }

      if (sortBy === 'sub_type') {
        const billingA = typeA?.billingCycle || '';
        const billingB = typeB?.billingCycle || '';
        return billingA.localeCompare(billingB, 'ar');
      }

      if (sortBy === 'expiry_date') {
        const dateA = a.endDate || '9999-12-31';
        const dateB = b.endDate || '9999-12-31';
        return dateA.localeCompare(dateB);
      }

      return 0;
    });

    return list;
  }, [customerSubs, accounts, types, searchTerm, filterMonth, filterStatus, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'مقاعد اشتراكات العملاء' : 'Customer Licensed Seats'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' ? 'توزيع وإسناد مقاعد تراخيص البرامج للعملاء ومتابعة تواريخ بدئها وانتهائها.' : 'Distribute and assign login credentials seats to active paying customers.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white font-black text-xs hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-user-plus"></i>
            {lang === 'ar' ? 'تخصيص مقعد جديد' : 'Assign New Seat'}
          </button>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col md:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 relative">
          <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input
            type="text"
            placeholder={lang === 'ar' ? 'البحث بالاسم، الهاتف، البريد أو البرنامج...' : 'Search by name, phone, email or program...'}
            className="w-full pl-4 pr-9 py-2.5 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none border border-transparent focus:border-primary-500 transition-colors"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters and Sorting dropdowns */}
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
              <option value="refund_desc">{lang === 'ar' ? 'مبلغ الـ Refund (الأعلى أولاً)' : 'Refund Amount (Highest First)'}</option>
              <option value="alphabetical">{lang === 'ar' ? 'أبجدي (حسب اسم العميل)' : 'Alphabetical (Customer Name)'}</option>
              <option value="email_alphabetical">{lang === 'ar' ? 'أبجدي (حسب بريد الحساب)' : 'Alphabetical (Account Email)'}</option>
              <option value="program">{lang === 'ar' ? 'حسب البرنامج' : 'By Program'}</option>
              <option value="sub_type">{lang === 'ar' ? 'حسب نوع الاشتراك' : 'By Subscription Type'}</option>
              <option value="expiry_date">{lang === 'ar' ? 'حسب تاريخ الانتهاء' : 'By Expiry Date'}</option>
            </select>
          </div>

          {/* Month Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 rounded-xl border border-transparent">
            <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{lang === 'ar' ? 'شهر الانتهاء:' : 'Expiry Month:'}</span>
            <select
              className="bg-transparent text-xs font-bold outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
            >
              <option value="all">{lang === 'ar' ? 'كل الشهور' : 'All Months'}</option>
              <option value="01">{lang === 'ar' ? 'يناير (1)' : 'January (1)'}</option>
              <option value="02">{lang === 'ar' ? 'فبراير (2)' : 'February (2)'}</option>
              <option value="03">{lang === 'ar' ? 'مارس (3)' : 'March (3)'}</option>
              <option value="04">{lang === 'ar' ? 'أبريل (4)' : 'April (4)'}</option>
              <option value="05">{lang === 'ar' ? 'مايو (5)' : 'May (5)'}</option>
              <option value="06">{lang === 'ar' ? 'يونيو (6)' : 'June (6)'}</option>
              <option value="07">{lang === 'ar' ? 'يوليو (7) 🍉' : 'July (7) 🍉'}</option>
              <option value="08">{lang === 'ar' ? 'أغسطس (8) ☀️' : 'August (8) ☀️'}</option>
              <option value="09">{lang === 'ar' ? 'سبتمبر (9)' : 'September (9)'}</option>
              <option value="10">{lang === 'ar' ? 'أكتوبر (10)' : 'October (10)'}</option>
              <option value="11">{lang === 'ar' ? 'نوفمبر (11)' : 'November (11)'}</option>
              <option value="12">{lang === 'ar' ? 'ديسمبر (12)' : 'December (12)'}</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 rounded-xl border border-transparent">
            <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{lang === 'ar' ? 'الحالة:' : 'Status:'}</span>
            <select
              className="bg-transparent text-xs font-bold outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
              <option value="active">{lang === 'ar' ? 'نشط (Active)' : 'Active'}</option>
              <option value="paid">{lang === 'ar' ? '💳 مدفوع فقط (Paid)' : 'Paid Only'}</option>
              <option value="temporary">{lang === 'ar' ? '🎁 تجريبي / تعويضي / مجاني' : 'Trial / Compensation'}</option>
              <option value="restricted">{lang === 'ar' ? '⚠️ حسابات مقيدة (Restricted)' : 'Restricted Accounts'}</option>
              <option value="expired">{lang === 'ar' ? 'منتهي (Expired)' : 'Expired'}</option>
              <option value="canceled">{lang === 'ar' ? 'ملغي (Canceled)' : 'Canceled'}</option>
            </select>
          </div>
        </div>
      </div>

      {filterStatus === 'restricted' && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 flex items-center justify-center text-lg flex-shrink-0">
              <i className="fas fa-sort-amount-down"></i>
            </div>
            <div>
              <div className="font-extrabold text-sm text-rose-800 dark:text-rose-300">
                مرتبين تلقائياً حسب الأعلى في مبلغ الـ Refund إلى الأقل
              </div>
              <div className="text-[11px] font-medium text-rose-700 dark:text-rose-400 mt-0.5 leading-relaxed">
                الهدف: تحويل أصحاب أكبر المبالغ أولاً إلى أماكن شاغرة لتوفير السيولة، وما يتبقى بعد نفاذ الأماكن المتاحة يكونون أقل الناس حسمياً في المبلغ عند الاسترداد.
              </div>
            </div>
          </div>
          <div className="text-left font-mono font-black text-rose-600 dark:text-rose-400 text-xs whitespace-nowrap bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 shadow-2xs">
            عدد العملاء: {filteredCustomerSubs.length} | الإجمالي: {filteredCustomerSubs.reduce((sum, s) => sum + calcProRataRefund(s).refundAmount, 0)} ج.م
          </div>
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
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'العميل' : 'Customer Name'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'البرنامج المسند' : 'Software App'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'حساب الدخول' : 'License Login'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'سعر الاشتراك' : 'Seat Price'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'تاريخ البدء والانتهاء' : 'Dates Period'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'تاريخ الإضافة' : 'Date Added'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'حالة السداد' : 'Payment'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                {filteredCustomerSubs.map((sub) => {
                  const acc = accounts.find(a => a.id === sub.accountId);
                  const type = types.find(t => t.id === acc?.typeId);

                  return (
                    <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                      <td className="p-4 font-black text-gray-900 dark:text-white">
                        <div>{sub.customerName}</div>
                        <div className="text-[10px] text-purple-600 dark:text-purple-400 font-extrabold flex items-center gap-1 mt-0.5">
                          <i className="fas fa-user-tie text-xs"></i>
                          <span>السيلز: {sub.salesRep || 'غير محدد'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold text-gray-500">
                        <div className="flex items-center gap-1.5 justify-start">
                          <span>{sub.customerPhone || 'N/A'}</span>
                          {sub.customerPhone && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSubForWhatsApp(sub);
                                setWhatsAppModalOpen(true);
                              }}
                              className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/20 cursor-pointer"
                              title="إرسال رسالة واتساب"
                            >
                              <i className="fab fa-whatsapp text-sm font-black"></i>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-gray-700 dark:text-gray-300 font-bold">
                        {type?.name || (lang === 'ar' ? 'غير معروف' : 'Unknown')}
                      </td>
                      <td className="p-4 font-mono font-bold text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-700 dark:text-gray-300">{acc?.email || 'N/A'}</span>
                          {acc?.email && (
                            <button
                              type="button"
                              onClick={() => handleCopySubscriberCredentials(sub)}
                              className="text-purple-600 hover:text-purple-700 p-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors cursor-pointer"
                              title={lang === 'ar' ? 'نسخ الإيميل والباسورد وتفاصيل الاشتراك' : 'Copy Credentials & Details'}
                            >
                              <i className={`fas ${copiedKey === `sub-credentials-${sub.id}` ? 'fa-check text-emerald-500' : 'fa-copy'} text-xs`}></i>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-bold text-primary-500">
                        <div className="flex flex-col">
                          {sub.isTemporaryCompensation ? (
                            <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-black bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 px-2 py-1 rounded-lg w-fit flex items-center gap-1 shadow-sm">
                              <i className="fas fa-gift text-indigo-500 animate-pulse"></i>
                              <span>تجريبي تعويضي ({sub.compensationDays || 3} أيام)</span>
                            </span>
                          ) : (
                            <span className="font-extrabold text-sm">{(sub.price || 0).toLocaleString()} EGP</span>
                          )}
                          {sub.seatsCount && sub.seatsCount > 1 && (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-extrabold mt-0.5 bg-purple-50 dark:bg-purple-950/20 px-1 py-0.5 rounded w-fit">
                              {sub.seatsCount} {lang === 'ar' ? 'مقاعد' : 'seats'}
                            </span>
                          )}
                          {!sub.isTemporaryCompensation && sub.savingAmount && sub.savingAmount > 0 ? (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold mt-1 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded w-fit">
                              {lang === 'ar' ? 'وفرت ' : 'Saved '}{sub.savingAmount} EGP
                            </span>
                          ) : null}
                          {!sub.isTemporaryCompensation && sub.additionalDiscount && sub.additionalDiscount > 0 ? (
                            <span className="text-[9px] text-rose-500 font-bold mt-1 block" title={sub.discountReason}>
                              {lang === 'ar' ? 'خصم إضافي: ' : 'Extra discount: '}{sub.additionalDiscount} EGP ({sub.discountReason})
                            </span>
                          ) : null}
                          {!sub.isTemporaryCompensation && sub.renewalOption === 'base_price' ? (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold mt-1 bg-amber-50 dark:bg-amber-950/20 px-1 py-0.5 rounded w-fit" title={lang === 'ar' ? 'الخصم لمرة واحدة فقط، التجديد القادم بالسعر الأساسي' : 'One-time discount, next renewal is at base price'}>
                              {lang === 'ar' ? '⚠️ الخصم لمرة واحدة' : '⚠️ One-time Discount'}
                            </span>
                          ) : (!sub.isTemporaryCompensation && ((sub.additionalDiscount && sub.additionalDiscount > 0) || (sub.savingAmount && sub.savingAmount > 0)) ? (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold mt-1 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded w-fit" title={lang === 'ar' ? 'التجديد مستمر بنفس السعر المخفض كل شهر' : 'Renewal continues at the same discounted price every month'}>
                              {lang === 'ar' ? '✓ التجديد بنفس الخصم' : '✓ Permanent Discount'}
                            </span>
                          ) : null)}

                          {(filterStatus === 'restricted' || sortBy === 'refund_desc' || acc?.status === 'restricted') && (
                            <span className="text-[10px] text-amber-800 dark:text-amber-300 font-extrabold mt-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 rounded-lg w-fit flex items-center gap-1 shadow-2xs font-mono">
                              <i className="fas fa-undo text-amber-500"></i>
                              <span>الـ Refund المستحق: {calcProRataRefund(sub).refundAmount} ج.م</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold text-gray-600 dark:text-gray-300">
                        <div className="flex flex-col">
                          <span>{lang === 'ar' ? 'من:' : 'From:'} {sub.startDate}</span>
                          <span>{lang === 'ar' ? 'إلى:' : 'To:'} {sub.endDate || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-bold text-gray-400 font-mono text-[11px]">
                        {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : (sub.startDate ? new Date(sub.startDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-')}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          sub.paymentStatus === 'paid'
                            ? 'bg-green-50 text-green-600 dark:bg-green-950/20'
                            : sub.paymentStatus === 'pending'
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                            : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                        }`}>
                          {sub.paymentStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          sub.status === 'active'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                        }`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end items-center">
                          <button
                            type="button"
                            onClick={() => handleCopySubscriberCredentials(sub)}
                            className={`p-1.5 rounded-lg flex items-center gap-1 font-black text-[10px] uppercase transition-colors ${
                              copiedKey === `sub-credentials-${sub.id}`
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/10'
                            }`}
                            title={lang === 'ar' ? 'نسخ الإيميل والباسورد وتفاصيل الاشتراك' : 'Copy Email, Password & Details'}
                          >
                            <i className={`fas ${copiedKey === `sub-credentials-${sub.id}` ? 'fa-check text-emerald-500' : 'fa-key'} text-xs`}></i>
                            <span>{copiedKey === `sub-credentials-${sub.id}` ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : (lang === 'ar' ? 'نسخ البيانات' : 'Copy Info')}</span>
                          </button>

                          <button
                            onClick={() => handleExportPDF(sub)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/10 flex items-center gap-1 font-black text-[10px] uppercase transition-colors"
                            title={lang === 'ar' ? 'تصدير إيصال PDF' : 'Export PDF Receipt'}
                          >
                            <i className="fas fa-file-pdf text-xs"></i>
                            <span>{lang === 'ar' ? 'إيصال' : 'PDF'}</span>
                          </button>

                          {sub.status === 'active' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openTransferModal(sub)}
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/10 flex items-center gap-1 font-black text-[10px] uppercase transition-colors"
                                title={lang === 'ar' ? 'تحويل الاشتراك' : 'Transfer Subscription'}
                              >
                                <i className="fas fa-exchange-alt text-xs"></i>
                                <span>{lang === 'ar' ? 'تحويل' : 'Transfer'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setRefundSub(sub)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/10 flex items-center gap-1 font-black text-[10px] uppercase transition-colors"
                                title={lang === 'ar' ? 'استرجاع المبلغ (Refund)' : 'Refund Subscription'}
                              >
                                <i className="fas fa-undo text-xs"></i>
                                <span>{lang === 'ar' ? 'استرجاع' : 'Refund'}</span>
                              </button>
                            </>
                          )}

                          {canManage && (
                            <>
                              <button
                                onClick={() => openEditModal(sub)}
                                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                                title={lang === 'ar' ? 'تعديل' : 'Edit'}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() => handleDelete(sub)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                title={lang === 'ar' ? 'حذف' : 'Delete'}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredCustomerSubs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-xs text-gray-400 font-bold">
                      {lang === 'ar' ? 'لا يوجد عملاء مخصصين لمقاعد تراخيص مطابقة للبحث.' : 'No customer license seats matched your search criteria.'}
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
                {editingSub ? (lang === 'ar' ? 'تعديل بيانات المقعد' : 'Edit Licensed Seat') : (lang === 'ar' ? 'تخصيص مقعد لعميل جديد' : 'Assign New Client Seat')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'اسم العميل' : 'Customer Name'}</label>
                  <input
                    type="text"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Mohamed Aly"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'هاتف العميل' : 'Customer Phone'}</label>
                  <input
                    type="tel"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 01012345678"
                  />
                </div>
              </div>

              {/* Sales Representative Field */}
              <div>
                <label className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase block mb-1 flex items-center gap-1">
                  <i className="fas fa-user-tie"></i>
                  <span>{lang === 'ar' ? 'السيلز المسؤول عن العميل (Sales Rep)' : 'Assigned Sales Representative'}</span>
                </label>
                <input
                  type="text"
                  list="salesRepsOptionsList"
                  className="w-full p-3 bg-purple-50/40 dark:bg-purple-950/20 text-sm font-bold rounded-xl outline-none border border-purple-100 dark:border-purple-900/40 text-purple-950 dark:text-purple-200 placeholder:text-purple-300 dark:placeholder:text-purple-700"
                  value={salesRep}
                  onChange={e => setSalesRep(e.target.value)}
                  placeholder={lang === 'ar' ? 'اختر أو اكتب اسم السيلز المسؤول...' : 'Select or type sales rep name...'}
                />
                <datalist id="salesRepsOptionsList">
                  <option value="سابر" />
                  <option value="أحمد" />
                  <option value="محمود" />
                  <option value="سارة" />
                  <option value="مريم" />
                  <option value="علي" />
                  <option value="فريق المبيعات" />
                </datalist>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                  {lang === 'ar' ? 'اختر الحساب والترخيص (المقاعد الشاغرة)' : 'Select Software Account (Available Seats)'}
                </label>
                <select
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                >
                  <option value="">{lang === 'ar' ? '-- اختر الحساب --' : '-- Choose Account --'}</option>
                  {sortAccountsByPriority(accounts).map(acc => {
                    const type = types.find(t => t.id === acc.typeId);
                    const activeSeats = customerSubs.filter(s => s.accountId === acc.id && s.status === 'active' && s.id !== editingSub?.id).reduce((sum, s) => sum + (s.seatsCount || 1), 0);
                    const freeSeats = (acc.maxSeats || 5) - activeSeats;
                    const isReservedAcc = acc.status === 'reserved' || acc.isReserved;
                    const isRestrictedAcc = acc.status === 'restricted';
                    const isDisabled = (freeSeats <= 0 && status === 'active') || isReservedAcc || isRestrictedAcc;

                    let label = `${type?.name || ''} - ${acc.email}`;
                    if (isReservedAcc) {
                      label += ` (🔒 محجوز: ${acc.reservationReason || 'غير متاح للحجز'})`;
                    } else if (isRestrictedAcc) {
                      label += ` (⚠️ محظور / مقيد)`;
                    } else {
                      label += ` (${freeSeats} ${lang === 'ar' ? 'مقاعد متبقية' : 'seats left'}) - ⏳ ${formatAccountDaysRemainingLabel(acc.billingDate)}`;
                    }

                    return (
                      <option key={acc.id} value={acc.id} disabled={isDisabled}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {activeType && (
                <div className="p-4 bg-emerald-50/10 dark:bg-emerald-950/5 border border-emerald-100/40 dark:border-emerald-900/20 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase block">
                      {lang === 'ar' ? 'نظام تحديد سعر الاشتراك' : 'Subscription Pricing Rules'}
                    </span>
                    <span className="text-[9px] font-bold text-gray-400">
                      ({lang === 'ar' ? 'سعر المقعد الفردي:' : 'Single seat:'} {activeType.seatPrice || 0} EGP)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPricingMode('single')}
                      className={`p-2.5 rounded-xl border text-[11px] font-extrabold transition-all cursor-pointer ${
                        pricingMode === 'single'
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {lang === 'ar' ? 'مقعد فردي' : 'Single Seat'}
                    </button>

                    <button
                      type="button"
                      disabled={!activeType.offers || activeType.offers.length === 0}
                      onClick={() => {
                        setPricingMode('offer');
                        if (activeType.offers && activeType.offers.length > 0) {
                          setSelectedOfferId(activeType.offers[0].id);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-[11px] font-extrabold transition-all disabled:opacity-50 cursor-pointer ${
                        pricingMode === 'offer'
                          ? 'bg-purple-500 border-purple-500 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {lang === 'ar' ? 'عرض مجهز' : 'Select Offer'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPricingMode('custom')}
                      className={`p-2.5 rounded-xl border text-[11px] font-extrabold transition-all cursor-pointer ${
                        pricingMode === 'custom'
                          ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {lang === 'ar' ? 'سعر مخصص' : 'Custom Price'}
                    </button>
                  </div>

                  {pricingMode === 'offer' && activeType.offers && activeType.offers.length > 0 && (
                    <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                      <label className="text-[9px] font-black text-gray-400 uppercase block">{lang === 'ar' ? 'اختر العرض المتاح' : 'Choose Available Offer'}</label>
                      <select
                        className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl border border-gray-100 dark:border-gray-700 outline-none text-purple-600 dark:text-purple-400"
                        value={selectedOfferId}
                        onChange={e => setSelectedOfferId(e.target.value)}
                      >
                        {activeType.offers.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({o.seatsCount} {lang === 'ar' ? 'مقاعد بسعر' : 'seats @'} {o.totalPrice} EGP)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-100/20">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                        {lang === 'ar' ? 'عدد المقاعد المحجوزة' : 'Seats Count'}
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
                        value={seatsCount}
                        disabled={pricingMode !== 'custom'}
                        onChange={e => setSeatsCount(Math.max(1, Number(e.target.value)))}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                        {lang === 'ar' ? 'السعر الأساسي (EGP)' : 'Base Price'}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
                        value={basePrice}
                        disabled={pricingMode !== 'custom'}
                        onChange={e => {
                          setBasePrice(Number(e.target.value));
                          setPrice(Number(e.target.value));
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-100/20">
                    <div>
                      <label className="text-[10px] font-black text-rose-500 uppercase block mb-1">
                        {lang === 'ar' ? 'خصم إضافي (EGP)' : 'Additional Discount (EGP)'}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        className="w-full p-2.5 bg-rose-50/30 dark:bg-rose-950/5 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-100/40 dark:border-rose-900/20 outline-none"
                        value={additionalDiscount}
                        onChange={e => setAdditionalDiscount(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-rose-500 uppercase block mb-1">
                        {lang === 'ar' ? 'سبب الخم الإضافي' : 'Discount Reason'}
                      </label>
                      <input
                        type="text"
                        required={additionalDiscount > 0}
                        placeholder={lang === 'ar' ? 'اكتب السبب (إجباري في حال الخصم)' : 'Required if discount > 0'}
                        className="w-full p-2.5 bg-rose-50/30 dark:bg-rose-950/5 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl border border-rose-100/40 dark:border-rose-900/20 outline-none placeholder:text-rose-300/80"
                        value={discountReason}
                        onChange={e => setDiscountReason(e.target.value)}
                      />
                    </div>
                  </div>

                  {pricingMode === 'offer' && (
                    <div className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-extrabold p-2.5 rounded-xl border border-purple-100/10">
                      {lang === 'ar' ? 'التوفير التلقائي في عرض المقاعد المتعددة:' : 'Savings in multi-seat offer:'}{' '}
                      {(activeType.offers?.find(o => o.id === selectedOfferId)?.savingAmount || 0) + additionalDiscount} EGP
                    </div>
                  )}

                  <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black p-3 rounded-xl border border-emerald-100/20 flex justify-between items-center">
                    <span>{lang === 'ar' ? 'المبلغ النهائي المطلوب دفعه:' : 'Final Payable Amount:'}</span>
                    <span className="text-sm font-black underline">{price} EGP</span>
                  </div>
                </div>
              )}

              {/* نظام احتساب سعر التجديد القادم */}
              <div className="p-3 bg-gray-50/50 dark:bg-gray-700/30 rounded-2xl border border-gray-100/50 dark:border-gray-700/50 space-y-2">
                <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase block">
                  {lang === 'ar' ? '⚙️ نظام احتساب سعر التجديد القادم' : '⚙️ Next Renewal Pricing Rule'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRenewalOption('same_discount')}
                    className={`p-2 rounded-xl border text-[11px] font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      renewalOption === 'same_discount'
                        ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <span className="font-extrabold">{lang === 'ar' ? 'تجديد بنفس الخصم/العرض' : 'Same Discount/Offer'}</span>
                    <span className={`text-[9px] ${renewalOption === 'same_discount' ? 'text-primary-100' : 'text-gray-400'}`}>
                      {lang === 'ar' ? 'دائم كل شهر' : 'Permanent monthly'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRenewalOption('base_price')}
                    className={`p-2 rounded-xl border text-[11px] font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      renewalOption === 'base_price'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <span className="font-extrabold">{lang === 'ar' ? 'الخصم لمرة واحدة فقط' : 'One-time Discount Only'}</span>
                    <span className={`text-[9px] ${renewalOption === 'base_price' ? 'text-amber-100' : 'text-gray-400'}`}>
                      {lang === 'ar' ? 'التجديد القادم بالسعر الأساسي' : 'Next renewal @ base price'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Temporary Compensation Subscription Block */}
              <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      checked={isTemporaryCompensation}
                      onChange={e => {
                        const checked = e.target.checked;
                        setIsTemporaryCompensation(checked);
                        if (checked) {
                          setPrice(0);
                          setPaymentStatus('paid');
                          const today = new Date();
                          const sDate = today.toISOString().split('T')[0];
                          const end = new Date(today);
                          end.setDate(end.getDate() + Number(compensationDays || 3));
                          const eDate = end.toISOString().split('T')[0];
                          setStartDate(sDate);
                          setEndDate(eDate);
                        }
                      }}
                    />
                    <span>{lang === 'ar' ? '🎁 اشتراك مؤقت / تجريبي تعويضي (3 أيام تجربة للعميل)' : '🎁 Temporary / Compensation Subscription (3-Day Test)'}</span>
                  </label>
                </div>

                {isTemporaryCompensation && (
                  <div className="space-y-3 pt-1 border-t border-indigo-100 dark:border-indigo-900/30 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-1">{lang === 'ar' ? 'مدة التجربة التعويضية (أيام)' : 'Compensation Days'}</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl border border-indigo-100 dark:border-indigo-900/40 outline-none"
                          value={compensationDays}
                          onChange={e => {
                            const days = Number(e.target.value);
                            setCompensationDays(days);
                            const today = new Date();
                            const end = new Date(today);
                            end.setDate(end.getDate() + days);
                            setEndDate(end.toISOString().split('T')[0]);
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-gray-500 block mb-1">{lang === 'ar' ? 'سبب المنح / التجربة' : 'Reason / Note'}</label>
                        <input
                          type="text"
                          placeholder={lang === 'ar' ? 'مثلاً: حل مشكلة / تجربة فنية' : 'e.g. issue resolution'}
                          className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-xl border border-indigo-100 dark:border-indigo-900/40 outline-none"
                          value={compensationReason}
                          onChange={e => setCompensationReason(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-100/60 dark:bg-indigo-900/40 p-2 rounded-lg font-extrabold flex items-center gap-1.5">
                      <i className="fas fa-info-circle text-xs"></i>
                      <span>
                        {lang === 'ar' 
                          ? `سيتم احتساب هذا الاشتراك كمجاني (0 ج.م) لمدة ${compensationDays} أيام وتاريخ انتهائه المكتمل هو ${endDate}`
                          : `Set as free sub for ${compensationDays} days. Auto expires on ${endDate}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'حالة السداد' : 'Payment Status'}</label>
                  <select
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value as any)}
                  >
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'الحالة' : 'Status'}</label>
                  <select
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                  >
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>
              </div>

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
                  {lang === 'ar' ? 'تخصيص وحفظ' : 'Assign & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Subscription Modal */}
      {transferSub && (() => {
        const currentAcc = accounts.find(a => a.id === transferSub.accountId);
        const currentType = types.find(t => t.id === currentAcc?.typeId);
        
        // Find other active accounts of the same type that have available seats (sorted by priority)
        const availableAccounts = sortAccountsByPriority(
          accounts.filter(a => 
            a.id !== transferSub.accountId && 
            a.typeId === currentAcc?.typeId && 
            a.status === 'active' &&
            !a.isReserved
          )
        );

        return (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[85vh] flex flex-col my-auto">
              <div className="p-5 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-exchange-alt text-amber-500"></i>
                  {lang === 'ar' ? 'تحويل اشتراك العميل إلى حساب آخر' : 'Transfer Client Subscription'}
                </h3>
                <button onClick={() => setTransferSub(null)} className="text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <form onSubmit={handleConfirmTransfer} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
                {/* Details block */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">{lang === 'ar' ? 'اسم العميل:' : 'Client Name:'}</span>
                    <span className="font-black text-gray-900 dark:text-white">{transferSub.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">{lang === 'ar' ? 'البرنامج الحالي:' : 'Current Program:'}</span>
                    <span className="font-black text-primary-500">{currentType?.name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">{lang === 'ar' ? 'الحساب الحالي:' : 'Current Account:'}</span>
                    <span className="font-mono font-bold text-gray-600 dark:text-gray-300">{currentAcc?.email}</span>
                  </div>
                </div>

                {/* Target account selection */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                    {lang === 'ar' ? 'اختر الحساب البديل المتاح' : 'Select Target Subscription Account'}
                  </label>
                  <select
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={transferAccountId}
                    onChange={e => handleSelectTransferAccount(e.target.value, transferSub)}
                  >
                    <option value="">{lang === 'ar' ? '-- اختر حساباً بمقاعد فارغة --' : '-- Choose Account --'}</option>
                    {availableAccounts.map(a => {
                      const activeCount = customerSubs.filter(s => s.accountId === a.id && s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
                      const freeSeats = a.maxSeats - activeCount;
                      return (
                        <option key={a.id} value={a.id} disabled={freeSeats <= 0}>
                          {a.email} ({freeSeats} {lang === 'ar' ? 'مقاعد متاحة' : 'free seats'}) - ⏳ {formatAccountDaysRemainingLabel(a.billingDate)}
                        </option>
                      );
                    })}
                  </select>
                  {availableAccounts.length === 0 && (
                    <div className="text-[11px] font-bold text-red-500 mt-1">
                      {lang === 'ar' 
                        ? 'عفواً، لا توجد حسابات نشطة بديلة أخرى لهذا البرنامج تحتوي على مقاعد شاغرة حالياً.' 
                        : 'No other active accounts for this software have empty seats.'}
                    </div>
                  )}
                </div>

                {/* editable template */}
                {transferAccountId && (
                  <div className="space-y-3 animate-in fade-in-50">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black text-amber-600 uppercase block">
                          {lang === 'ar' ? 'رسالة تبليغ العميل وخدمة العملاء' : 'Client Notification Template'}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(transferTemplate);
                            setCopiedKey('transfer-modal-copy');
                            setTimeout(() => setCopiedKey(null), 2500);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold flex items-center gap-1 hover:bg-purple-200"
                        >
                          <i className={`fas ${copiedKey === 'transfer-modal-copy' ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                          <span>{copiedKey === 'transfer-modal-copy' ? 'تم النسخ ✓' : 'نسخ الرسالة لخدمة العملاء'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={6}
                        className="w-full p-3 bg-amber-50/20 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 text-xs font-bold rounded-xl outline-none text-gray-800 dark:text-gray-200 leading-relaxed"
                        value={transferTemplate}
                        onChange={e => setTransferTemplate(e.target.value)}
                      />
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-green-50/30 dark:bg-green-950/10 border border-green-100/50 dark:border-green-900/20 rounded-xl">
                      <input
                        type="checkbox"
                        id="notifiedCheck"
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                        checked={notifiedCustomer}
                        onChange={e => setNotifiedCustomer(e.target.checked)}
                      />
                      <label htmlFor="notifiedCheck" className="text-xs font-black text-emerald-600 dark:text-emerald-400 cursor-pointer select-none">
                        {lang === 'ar' ? 'نعم، تم تبليغ العميل بالإيميل والباسورد الجديد بالفعل' : 'Yes, I have notified the customer with the new email/password'}
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4 justify-end">
                  <button
                    type="button"
                    onClick={() => setTransferSub(null)}
                    className="px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 text-xs font-black uppercase text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={!transferAccountId || !notifiedCustomer}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black uppercase shadow-sm flex items-center gap-2"
                  >
                    <i className="fas fa-check"></i>
                    {lang === 'ar' ? 'هل أنت متأكد؟ تأكيد النقل والتحويل' : 'Confirm Transfer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Refund Modal */}
      {refundSub && (() => {
        const refundAcc = accounts.find(a => a.id === refundSub.accountId);
        const refundType = types.find(t => t.id === refundAcc?.typeId);
        const refundDetails = calcProRataRefund(refundSub);
        const salesRepText = refundSub.salesRep || 'غير محدد';

        const refundMessageText = `اسم العميل: ${refundSub.customerName}
رقم الواتساب: ${refundSub.customerPhone || 'غير محدد'}
السيلز المسؤول: ${salesRepText}

----------------------------------------
أهلاً بك عزيزي العميل ${refundSub.customerName}👋،
إخطار استرداد اشتراك (Refund):
- البرنامج: ${refundType?.name || 'برنامج الترخيص'}
- بريد الحساب: ${refundAcc?.email || '-'}
- تاريخ بداية اشتراكك: ${refundSub.startDate || '-'}
- إجمالي المبلغ المدفوع: ${refundDetails.paidAmount} ج.م
- استهلكت: ${refundDetails.daysUsed} يوم من أصل ${refundDetails.totalDays} يوم
- قيمة الاستهلاك الفعلي: ${refundDetails.usedValue} ج.م
- المبلغ المتبقي المستحق لك للاسترداد (Refund): ${refundDetails.refundAmount} ج.م

سيتم رد المبلغ بالطريقة المناسبة لك (فودافون كاش أو إنستاباي).`;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
            <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-xl w-full p-6 space-y-4 border border-rose-100 dark:border-rose-900/40 shadow-2xl">
              <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                    <i className="fas fa-undo"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900 dark:text-white">
                      {lang === 'ar' ? 'طلب استرجاع اشتراك (Refund)' : 'Process Subscription Refund'}
                    </h3>
                    <p className="text-[10px] text-gray-400">
                      العميل: <strong className="text-gray-700 dark:text-gray-300">{refundSub.customerName}</strong> | السيلز: <strong className="text-purple-600">{salesRepText}</strong>
                    </p>
                  </div>
                </div>
                <button onClick={() => setRefundSub(null)} className="text-gray-400 hover:text-gray-600">
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                  <span className="text-[9px] text-gray-400 block font-normal">المبلغ المدفوع</span>
                  <span className="font-mono text-gray-900 dark:text-white">{refundDetails.paidAmount} ج.م</span>
                </div>

                <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                  <span className="text-[9px] text-gray-400 block font-normal">إجمالي الأيام</span>
                  <span className="font-mono text-gray-900 dark:text-white">{refundDetails.totalDays} يوم</span>
                </div>

                <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                  <span className="text-[9px] text-gray-400 block font-normal">الأيام المستهلكة</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">{refundDetails.daysUsed} يوم ({refundDetails.usedValue} ج.م)</span>
                </div>

                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  <span className="text-[9px] text-rose-700 dark:text-rose-300 block font-bold">المبلغ المسترد (Refund)</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400 font-extrabold text-sm">{refundDetails.refundAmount} ج.م</span>
                </div>
              </div>

              {/* Refund Reason Input */}
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase block mb-1">
                  {lang === 'ar' ? 'سبب الاسترجاع (Refund Reason)' : 'Refund Reason'}
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-700 text-xs font-bold rounded-xl outline-none"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="e.g. بناءً على طلب العميل"
                />
              </div>

              {/* Message to Customer Service Box */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase block">
                    💬 رسالة خدمة العملاء المجهزة (جاهزة للنسخ)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(refundMessageText);
                      setCopiedKey('refund-msg-copy');
                      setTimeout(() => setCopiedKey(null), 2500);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold flex items-center gap-1 hover:bg-purple-200"
                  >
                    <i className={`fas ${copiedKey === 'refund-msg-copy' ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                    <span>{copiedKey === 'refund-msg-copy' ? 'تم النسخ ✓' : 'نسخ الرسالة لخدمة العملاء'}</span>
                  </button>
                </div>
                <pre className="text-[11px] font-sans font-bold text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700 leading-relaxed max-h-40 overflow-y-auto">
                  {refundMessageText}
                </pre>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setRefundSub(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmRefund(refundSub)}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                >
                  <i className="fas fa-check-circle"></i>
                  <span>{lang === 'ar' ? 'تأكيد الـ Refund وإلغاء الاشتراك' : 'Confirm Refund'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* WhatsApp Redirect Helper Modal */}
      {whatsAppModalOpen && selectedSubForWhatsApp && (
        <WhatsAppRedirectModal
          isOpen={whatsAppModalOpen}
          onClose={() => {
            setWhatsAppModalOpen(false);
            setSelectedSubForWhatsApp(null);
          }}
          customerSub={selectedSubForWhatsApp}
          account={accounts.find(a => a.id === selectedSubForWhatsApp.accountId)}
          type={types.find(t => t.id === accounts.find(a => a.id === selectedSubForWhatsApp.accountId)?.typeId)}
        />
      )}
    </div>
  );
}
