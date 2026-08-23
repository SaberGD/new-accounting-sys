import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface TemplatesTabProps {
  canManage: boolean;
  onShowToast: (msg: string) => void;
}

export function TemplatesTab({ canManage, onShowToast }: TemplatesTabProps) {
  const lang = 'ar';

  const [templates, setTemplates] = useState([
    {
      id: 'renewal_reminder',
      title: lang === 'ar' ? 'تذكير بموعد التجديد قريباً' : 'Upcoming Renewal Reminder',
      text: lang === 'ar'
        ? `أهلاً يا [اسم_العميل] 👋،\n\nنود تذكيرك بأن اشتراك برنامج [اسم_البرنامج] الخاص بك سينتهي قريباً بتاريخ [تاريخ_الانتهاء].\n\nلتجنب انقطاع الخدمة، يرجى سداد قيمة الاشتراك البالغة [السعر] جنيه.\n\nشكراً لثقتك بنا! ❤️`
        : `Hi [customer_name] 👋,\n\nWe would like to remind you that your [program_name] subscription seat is due for renewal on [end_date].\n\nTo ensure uninterrupted service, please complete the renewal payment of [price] EGP.\n\nThank you for choosing us! ❤️`
    },
    {
      id: 'seat_delivery',
      title: lang === 'ar' ? 'تسليم بيانات الحساب الجديد' : 'Deliver New Credentials',
      text: lang === 'ar'
        ? `أهلاً يا [اسم_العميل] 👋🎉،\n\nتم تفعيل مقعد الترخيص الخاص بك بنجاح في برنامج [اسم_البرنامج].\n\nبيانات تسجيل الدخول:\n📧 البريد الإلكتروني: [الإيميل]\n🔑 كلمة المرور: [الرمز]\n\nيرجى عدم تغيير كلمة مرور الحساب لأنها مشتركة مع عملاء آخرين.\n\nمشاهدة ممتعة وعمل موفق! 🚀`
        : `Hi [customer_name] 👋🎉,\n\nYour licensed seat for [program_name] has been activated successfully!\n\nHere are your access details:\n📧 Email: [email]\n🔑 Password: [password]\n\n*Important:* Please do not change the password as this account is shared with other seats.\n\nHappy creating! 🚀`
    },
    {
      id: 'expired_warning',
      title: lang === 'ar' ? 'تنبيه انتهاء الاشتراك فعلياً' : 'License Expired Warning',
      text: lang === 'ar'
        ? `عزيزنا [اسم_العميل] 👋،\n\nنحيطك علماً بأن اشتراك برنامج [اسم_البرنامج] الخاص بك قد انتهى فعلياً بتاريخ [تاريخ_الانتهاء].\n\nيرجى التجديد وسداد قيمة الاشتراك [السعر] جنيه لإعادة تفعيل حسابك مرة أخرى.\n\nإذا كنت قد قمت بالسداد بالفعل، يرجى تجاهل هذه الرسالة.`
        : `Dear [customer_name] 👋,\n\nThis is to notify you that your [program_name] license seat expired on [end_date].\n\nTo reactivate your seat, please complete the renewal payment of [price] EGP.\n\nIf you have already paid, please ignore this message.`
    }
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(lang === 'ar' ? 'تم نسخ القالب بنجاح إلى الحافظة!' : 'Template copied to clipboard successfully!');
  };

  const startEditing = (id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  };

  const saveEdit = (id: string) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, text: editText } : t));
    setEditingId(null);
    onShowToast(lang === 'ar' ? 'تم حفظ التعديل بنجاح!' : 'Template modified successfully!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-black text-gray-900 dark:text-white">
          {lang === 'ar' ? 'قوالب رسائل واتساب للتنبيه والتحصيل' : 'WhatsApp Notification Templates'}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {lang === 'ar' ? 'قوالب جاهزة لنسخها والتواصل بها مع العملاء مباشرة، مع علامات متغيرة يمكن استبدالها تلقائياً.' : 'Prepared text templates for customer communication, with placeholders to substitute values.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {templates.map((tpl) => (
          <div key={tpl.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fab fa-whatsapp text-emerald-500 text-base"></i>
                {tpl.title}
              </h3>
              
              {editingId === tpl.id ? (
                <textarea
                  className="w-full h-48 p-3 text-xs bg-gray-50 dark:bg-gray-700 font-bold rounded-xl outline-none resize-none font-mono"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                />
              ) : (
                <div className="w-full h-48 p-3.5 bg-gray-50 dark:bg-gray-700/50 rounded-2xl text-xs text-gray-600 dark:text-gray-300 font-bold whitespace-pre-wrap overflow-y-auto font-mono select-all">
                  {tpl.text}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end border-t border-gray-50 dark:border-gray-700 pt-3">
              {editingId === tpl.id ? (
                <>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700 text-[10px] font-black uppercase text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    onClick={() => saveEdit(tpl.id)}
                    className="px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-black uppercase shadow-sm"
                  >
                    {lang === 'ar' ? 'حفظ' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  {canManage && (
                    <button
                      onClick={() => startEditing(tpl.id, tpl.text)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 font-black text-[10px] uppercase transition-all"
                    >
                      <i className="fas fa-edit mr-1"></i>
                      {lang === 'ar' ? 'تعديل' : 'Edit'}
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(tpl.text)}
                    className="px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-black text-[10px] uppercase transition-all shadow-sm"
                  >
                    <i className="fas fa-copy mr-1"></i>
                    {lang === 'ar' ? 'نسخ القالب' : 'Copy Template'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
