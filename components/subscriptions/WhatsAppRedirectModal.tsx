import React, { useState, useEffect } from 'react';
import { CustomerSubscription, SubscriptionAccount, SubscriptionType } from './types';

interface WhatsAppRedirectModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerSub: CustomerSubscription;
  account?: SubscriptionAccount;
  type?: SubscriptionType;
}

export function WhatsAppRedirectModal({
  isOpen,
  onClose,
  customerSub,
  account,
  type
}: WhatsAppRedirectModalProps) {
  const lang = 'ar';

  const [redirectType, setRedirectType] = useState<'direct' | 'template'>('direct');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('renewal_reminder');
  const [customMessage, setCustomMessage] = useState('');

  // Built-in templates with localized placeholders
  const defaultTemplates = [
    {
      id: 'renewal_reminder',
      title: 'تذكير بموعد التجديد قريباً',
      text: `أهلاً يا [اسم_العميل] 👋،\n\nنود تذكيرك بأن اشتراك برنامج [اسم_البرنامج] الخاص بك سينتهي قريباً بتاريخ [تاريخ_الانتهاء].\n\nلتجنب انقطاع الخدمة، يرجى سداد قيمة الاشتراك البالغة [السعر] ر.س.\n\nشكراً لثقتك بنا! ❤️`
    },
    {
      id: 'seat_delivery',
      title: 'تسليم بيانات الحساب الجديد',
      text: `أهلاً يا [اسم_العميل] 👋🎉،\n\nتم تفعيل مقعد الترخيص الخاص بك بنجاح في برنامج [اسم_البرنامج].\n\nبيانات تسجيل الدخول:\n📧 البريد الإلكتروني: [الإيميل]\n🔑 كلمة المرور: [الرمز]\n\nيرجى عدم تغيير كلمة مرور الحساب لأنها مشتركة مع عملاء آخرين.\n\nعمل موفق! 🚀`
    },
    {
      id: 'expired_warning',
      title: 'تنبيه انتهاء الاشتراك فعلياً',
      text: `عزيزنا [اسم_العميل] 👋،\n\nنحيطك علماً بأن اشتراك برنامج [اسم_البرنامج] الخاص بك قد انتهى فعلياً بتاريخ [تاريخ_الانتهاء].\n\nيرجى التجديد وسداد قيمة الاشتراك [السعر] ر.س لإعادة تفعيل حسابك مرة أخرى.\n\nإذا كنت قد قمت بالسداد بالفعل، يرجى تجاهل هذه الرسالة.`
    }
  ];

  // Substitute placeholders with actual subscription & account details
  const getSubstitutedMessage = (tplText: string) => {
    let msg = tplText;
    msg = msg.replace(/\[اسم_العميل\]/g, customerSub.customerName || '');
    msg = msg.replace(/\[customer_name\]/g, customerSub.customerName || '');
    msg = msg.replace(/\[رقم_الواتساب\]/g, customerSub.customerPhone || '');
    msg = msg.replace(/\[customer_phone\]/g, customerSub.customerPhone || '');
    msg = msg.replace(/\[السيلز_المسؤول\]/g, customerSub.salesRep || 'غير محدد');
    msg = msg.replace(/\[sales_rep\]/g, customerSub.salesRep || 'Unassigned');
    msg = msg.replace(/\[اسم_البرنامج\]/g, type?.name || 'برنامج الترخيص');
    msg = msg.replace(/\[program_name\]/g, type?.name || 'برنامج الترخيص');
    msg = msg.replace(/\[تاريخ_الانتهاء\]/g, customerSub.endDate || '');
    msg = msg.replace(/\[end_date\]/g, customerSub.endDate || '');
    msg = msg.replace(/\[السعر\]/g, String(customerSub.price || 0));
    msg = msg.replace(/\[price\]/g, String(customerSub.price || 0));
    msg = msg.replace(/\[الإيميل\]/g, account?.email || '—');
    msg = msg.replace(/\[email\]/g, account?.email || '—');
    msg = msg.replace(/\[الرمز\]/g, account?.password || '—');
    msg = msg.replace(/\[password\]/g, account?.password || '—');
    return msg;
  };

  // Synchronize or generate custom message preview whenever template or redirect type changes
  useEffect(() => {
    if (redirectType === 'direct') {
      setCustomMessage('');
    } else {
      const selectedTpl = defaultTemplates.find(t => t.id === selectedTemplateId);
      if (selectedTpl) {
        setCustomMessage(getSubstitutedMessage(selectedTpl.text));
      }
    }
  }, [redirectType, selectedTemplateId, customerSub, account, type]);

  if (!isOpen) return null;

  const handleSend = () => {
    const phone = customerSub.customerPhone;
    if (!phone) {
      alert('لا يوجد رقم هاتف مسجل لهذا العميل!');
      return;
    }

    // Format phone number to be compatible with wa.me (remove spaces, leading zeroes, replace with country code if needed)
    let formattedPhone = phone.replace(/[^0-9]/g, '');
    
    // Auto prefix Saudi (966) if it's a local 9-digit or 10-digit number starting with 5 or 05
    if (formattedPhone.startsWith('05') && formattedPhone.length === 10) {
      formattedPhone = '966' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('5') && formattedPhone.length === 9) {
      formattedPhone = '966' + formattedPhone;
    } else if (formattedPhone.startsWith('01') && formattedPhone.length === 11) {
      // Egyptian number
      formattedPhone = '20' + formattedPhone.slice(1);
    }

    const textParam = redirectType === 'template' && customMessage ? `?text=${encodeURIComponent(customMessage)}` : '';
    const url = `https://wa.me/${formattedPhone}${textParam}`;
    
    window.open(url, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
          <div>
            <h3 className="text-sm font-black text-gray-950 dark:text-white flex items-center gap-2">
              <i className="fab fa-whatsapp text-emerald-500 text-lg"></i>
              <span>مساعد إرسال واتساب للعميل</span>
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">
              العميل: <strong className="text-gray-700 dark:text-gray-300">{customerSub.customerName}</strong> | هاتف: <strong className="text-gray-700 dark:text-gray-300">{customerSub.customerPhone}</strong> | السيلز: <strong className="text-purple-600 dark:text-purple-400">{customerSub.salesRep || 'غير محدد'}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <i className="fas fa-times-circle text-lg"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {/* Action Type Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase block">نوع الإجراء المطلق</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRedirectType('direct')}
                className={`p-3.5 rounded-2xl border transition-all text-xs font-black flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  redirectType === 'direct'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-900'
                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-external-link-alt text-base text-emerald-500"></i>
                <span>تحويل مباشر فقط</span>
              </button>

              <button
                type="button"
                onClick={() => setRedirectType('template')}
                className={`p-3.5 rounded-2xl border transition-all text-xs font-black flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  redirectType === 'template'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-900'
                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <i className="fas fa-file-alt text-base text-emerald-500"></i>
                <span>إرسال بقالب جاهز</span>
              </button>
            </div>
          </div>

          {/* Template Selection Panel */}
          {redirectType === 'template' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase block">اختر القالب المناسب</label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {defaultTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-3 rounded-xl border text-xs font-bold flex justify-between items-center cursor-pointer transition-all ${
                        selectedTemplateId === tpl.id
                          ? 'bg-gray-100 border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-950 dark:text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-200'
                      }`}
                    >
                      <span>{tpl.title}</span>
                      <i className={`fas ${selectedTemplateId === tpl.id ? 'fa-check-circle text-emerald-500' : 'fa-circle text-gray-100 dark:text-gray-700'}`}></i>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Editor/Preview */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase block">معاينة وتعديل نص الرسالة</label>
                <textarea
                  className="w-full h-36 p-3 text-xs bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 font-bold rounded-xl outline-none border border-gray-100 dark:border-gray-800 font-mono resize-none focus:ring-1 focus:ring-emerald-500"
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                />
                <span className="text-[9px] text-gray-400 block">
                  يمكنك تعديل الرسالة يدوياً قبل النقر على تحويل وفتح الواتساب.
                </span>
              </div>

            </div>
          )}

          {redirectType === 'direct' && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-2xl border border-gray-100 dark:border-gray-800 text-xs text-gray-500 text-center py-8">
              <i className="fab fa-whatsapp text-3xl text-emerald-500 mb-2 block"></i>
              <span>سيتم توجيهك مباشرة لفتح شات العميل على الواتساب دون إرفاق نص مسبق.</span>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-6 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50/50 dark:bg-gray-900/10">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-950 dark:hover:text-white font-black text-xs transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSend}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-2"
          >
            <i className="fab fa-whatsapp"></i>
            <span>تأكيد وتحويل للواتساب</span>
          </button>
        </div>

      </div>
    </div>
  );
}
