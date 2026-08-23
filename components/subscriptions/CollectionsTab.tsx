import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { CustomerSubscription, SubscriptionAccount, SubscriptionType } from './types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { WhatsAppRedirectModal } from './WhatsAppRedirectModal';

interface CollectionsTabProps {
  customerSubs: CustomerSubscription[];
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  onRefresh: () => void;
  canManage: boolean;
}

export function CollectionsTab({
  customerSubs,
  accounts,
  types,
  onRefresh,
  canManage
}: CollectionsTabProps) {
  const lang = 'ar';
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<CustomerSubscription | null>(null);

  // WhatsApp states
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [selectedSubForWhatsApp, setSelectedSubForWhatsApp] = useState<CustomerSubscription | null>(null);

  // Collect form states
  const [amountCollected, setAmountCollected] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Filter pending/overdue customer seats
  const pendingCollections = customerSubs.filter(s => s.paymentStatus !== 'paid');

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
      <div style="width: 100%; min-height: 1120px; background: white; display: flex; flex-direction: column; position: relative;">
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
                <span style="color: #666; font-weight: 700;">سعر مقعد الترخيص الشهري:</span>
                <span style="font-weight: 900; color: #000;">${(sub.price || 0).toLocaleString()} EGP</span>
              </div>
              
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
    `;

    document.body.appendChild(container);
    
    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, (pdfHeight - 20) / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${sub.customerName || 'Customer'} Subscription.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Error generating PDF. Please try again.");
    } finally {
      document.body.removeChild(container);
    }
  };

  const openCollectModal = (sub: CustomerSubscription) => {
    setSelectedSub(sub);
    setAmountCollected(sub.price || 0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setModalOpen(true);
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    try {
      // 1. Add revenue log
      await addDoc(collection(db, 'programSubscriptionRevenues'), {
        customerSubId: selectedSub.id,
        amount: Number(amountCollected),
        date: paymentDate,
        note: notes || `Collected renewal payment for ${selectedSub.customerName}`
      });

      // 2. Mark subscription as paid & handle renewal pricing rule
      const isOneTimeDiscount = selectedSub.renewalOption === 'base_price';
      const updatePayload: any = {
        paymentStatus: 'paid',
        status: 'active'
      };

      if (isOneTimeDiscount) {
        updatePayload.price = selectedSub.basePrice || selectedSub.price;
        updatePayload.additionalDiscount = 0;
        updatePayload.discountReason = '';
        updatePayload.selectedOfferId = '';
        updatePayload.savingAmount = 0;
        updatePayload.renewalOption = 'same_discount';
      }

      await updateDoc(doc(db, 'customerSubscriptions', selectedSub.id), updatePayload);

      // 3. Log Audit action
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'COLLECTION_RECORDED',
        description: `Recorded payment of ${amountCollected} EGP for client seat ${selectedSub.customerName}`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error collecting payment:', err);
    }
  };

  const handleSendWhatsApp = (sub: CustomerSubscription) => {
    setSelectedSubForWhatsApp(sub);
    setWhatsAppModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-black text-gray-900 dark:text-white">
          {lang === 'ar' ? 'متابعة وتحصيل اشتراكات التراخيص' : 'Billing Collections & Follow-up'}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {lang === 'ar' ? 'عرض ومتابعة مقاعد العملاء غير المسددة، وتسجيل الدفعات، وإرسال تنبيهات التجديد.' : 'Follow up on unpaid or overdue seat subscriptions, record collections, and send WhatsApp reminders.'}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'العميل' : 'Customer Name'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'البرنامج' : 'Software App'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'المبلغ المطلوب' : 'Due Amount'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'حالة السداد' : 'Payment'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'إجراءات التحصيل والتنبيه' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
              {pendingCollections.map((sub) => {
                const acc = accounts.find(a => a.id === sub.accountId);
                const type = types.find(t => t.id === acc?.typeId);

                return (
                  <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                    <td className="p-4 font-black text-gray-900 dark:text-white">
                      {sub.customerName}
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
                    <td className="p-4 font-bold text-rose-500">
                      <div>{(sub.price || 0).toLocaleString()} EGP</div>
                      {sub.renewalOption === 'base_price' ? (
                        <div className="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold mt-0.5" title={lang === 'ar' ? 'الخصم لمرة واحدة فقط، التجديد القادم سيكون بالسعر الأساسي' : 'One-time discount, next renewal is at base price'}>
                          {lang === 'ar' ? '⚠️ خصم لمرة واحدة' : '⚠️ One-time'}
                        </div>
                      ) : ((sub.additionalDiscount && sub.additionalDiscount > 0) || (sub.savingAmount && sub.savingAmount > 0) ? (
                        <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold mt-0.5" title={lang === 'ar' ? 'التجديد بنفس السعر المخفض كل شهر' : 'Renew at discounted price'}>
                          {lang === 'ar' ? '✓ تجديد بالخصم' : '✓ Discounted Renewal'}
                        </div>
                      ) : null)}
                    </td>
                    <td className="p-4 font-mono font-bold text-gray-600 dark:text-gray-300">
                      {sub.endDate || 'N/A'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        sub.paymentStatus === 'pending'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                          : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                      }`}>
                        {sub.paymentStatus}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleExportPDF(sub)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase hover:bg-rose-600 transition-all shadow-sm"
                          title={lang === 'ar' ? 'تصدير إيصال PDF' : 'Export PDF Receipt'}
                        >
                          <i className="fas fa-file-pdf text-xs"></i>
                          {lang === 'ar' ? 'إيصال' : 'PDF'}
                        </button>

                        <button
                          onClick={() => handleSendWhatsApp(sub)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white font-black text-[10px] uppercase hover:bg-emerald-600 transition-all shadow-sm"
                        >
                          <i className="fab fa-whatsapp text-xs"></i>
                          {lang === 'ar' ? 'تذكير واتساب' : 'Remind'}
                        </button>
                        
                        {canManage && (
                          <button
                            onClick={() => openCollectModal(sub)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white font-black text-[10px] uppercase hover:bg-primary-700 transition-all shadow-sm"
                          >
                            <i className="fas fa-hand-holding-dollar"></i>
                            {lang === 'ar' ? 'تسجيل تحصيل' : 'Collect'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {pendingCollections.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-xs text-gray-400 font-bold">
                    {lang === 'ar' ? 'رائع! تم تحصيل جميع مستحقات الاشتراكات بالكامل.' : 'Excellent! All subscription seat collections are up to date.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Payment Modal */}
      {modalOpen && selectedSub && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[85vh] flex flex-col my-auto">
            <div className="p-5 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">
                {lang === 'ar' ? 'تسجيل تحصيل دفعة اشتراك' : 'Record Seat Subscription Collection'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleCollect} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'العميل' : 'Customer'}</span>
                <div className="text-sm font-black text-gray-800 dark:text-white p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  {selectedSub.customerName} ({selectedSub.customerPhone})
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'المبلغ المحصل' : 'Collected Amount'}</label>
                  <input
                    type="number"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={amountCollected}
                    onChange={e => setAmountCollected(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'تاريخ السداد' : 'Payment Date'}</label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <input
                  type="text"
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={lang === 'ar' ? 'فودافون كاش، كاش بالفرع، إلخ...' : 'e.g. Vodafone cash, cash on premise'}
                />
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
                  {lang === 'ar' ? 'تسجيل السداد' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
