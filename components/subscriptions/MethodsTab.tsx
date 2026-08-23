import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { PaymentMethod } from './types';

interface MethodsTabProps {
  methods: PaymentMethod[];
  loading: boolean;
  onRefresh: () => void;
  canManage: boolean;
}

export function MethodsTab({ methods, loading, onRefresh, canManage }: MethodsTabProps) {
  const lang = 'ar';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [cardDetails, setCardDetails] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<'active' | 'suspended' | 'blocked'>('active');
  const [suspensionReason, setSuspensionReason] = useState('');

  const openAddModal = () => {
    setEditingMethod(null);
    setName('');
    setCardDetails('');
    setExpiryDate('');
    setEnabled(true);
    setStatus('active');
    setSuspensionReason('');
    setModalOpen(true);
  };

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method);
    setName(method.name || '');
    setCardDetails(method.cardDetails || '');
    setExpiryDate(method.expiryDate || '');
    setEnabled(method.enabled !== false);
    setStatus(method.status || (method.isSuspended ? 'blocked' : 'active'));
    setSuspensionReason(method.suspensionReason || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const isCardBlocked = status === 'suspended' || status === 'blocked';

    const data = {
      name,
      cardDetails,
      expiryDate,
      enabled: !isCardBlocked && enabled,
      status,
      isSuspended: isCardBlocked,
      suspensionReason: isCardBlocked ? suspensionReason : ''
    };

    try {
      if (editingMethod) {
        await updateDoc(doc(db, 'paymentMethods', editingMethod.id), data);
      } else {
        await addDoc(collection(db, 'paymentMethods'), data);
      }

      // Log audit
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'PAYMENT_CARD_UPDATED',
        description: `تم ${editingMethod ? 'تحديث' : 'إضافة'} بيانات البطاقة البنكية (${name}) وحالتها هي (${status === 'blocked' ? 'محظورة / اتوقفت' : status === 'suspended' ? 'موقوفة مؤقتاً' : 'نشطة'}).`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error saving payment method:', err);
    }
  };

  const handleToggleBlockStatus = async (method: PaymentMethod) => {
    const isCurrentlyBlocked = method.status === 'blocked' || method.status === 'suspended' || method.isSuspended;
    const newStatus = isCurrentlyBlocked ? 'active' : 'blocked';
    
    const confirmMsg = isCurrentlyBlocked
      ? `هل تريد إلغاء حظر البطاقة (${method.name}) وإعادتها للخدمة النشطة؟`
      : `هل أنت متأكد من حظر / إيقاف البطاقة (${method.name})؟\nسيتم إظهار تحذير في جميع الحسابات المربوطة بها لتغيير الفيزا قبل موعد التجديد!`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'paymentMethods', method.id), {
        status: newStatus,
        isSuspended: !isCurrentlyBlocked,
        enabled: isCurrentlyBlocked,
        suspensionReason: isCurrentlyBlocked ? '' : 'تم إيقاف/حظر الفيزا بطلب من المستخدم'
      });

      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'PAYMENT_CARD_STATUS_CHANGED',
        description: `تم تغيير حالة الفيزا (${method.name}) إلى (${newStatus === 'blocked' ? 'محظورة / اتوقفت' : 'نشطة'}).`,
        performedBy: 'Staff',
        performedByEmail: ''
      });

      onRefresh();
    } catch (err) {
      console.error('Error toggling payment card block status:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(lang === 'ar' ? 'هل أنت متأكد من حذف وسيلة الدفع هذه؟' : 'Are you sure you want to delete this payment card?')) return;
    try {
      await deleteDoc(doc(db, 'paymentMethods', id));
      onRefresh();
    } catch (err) {
      console.error('Error deleting payment card:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'بطاقات ووسائل الدفع لشراء التراخيص' : 'Billing Cards & Payment Methods'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' ? 'إدارة البطاقات المربوطة التي يتم الدفع بها للحصول على اشتراكات البرامج.' : 'Manage cards or channels used to purchase external subscriptions.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white font-black text-xs hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-plus"></i>
            {lang === 'ar' ? 'إضافة بطاقة جديدة' : 'Add New Card'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-gray-400 font-bold">
          {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {methods.map((m) => {
            const isBlocked = m.status === 'blocked' || m.status === 'suspended' || m.isSuspended || m.enabled === false;
            const isFullyBlocked = m.status === 'blocked' || m.isSuspended;

            return (
              <div 
                key={m.id} 
                className={`relative p-6 rounded-2xl border shadow-lg min-h-[170px] flex flex-col justify-between overflow-hidden transition-all duration-200 ${
                  isBlocked
                    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-white border-red-800/80'
                    : 'bg-gradient-to-br from-slate-800 to-slate-900 text-white border-slate-700'
                }`}
              >
                <div className="absolute right-4 top-4 text-slate-700 text-4xl opacity-20 pointer-events-none">
                  <i className="fas fa-credit-card"></i>
                </div>

                <div className="z-10">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                        <span>{m.name}</span>
                        {isBlocked && (
                          <span className="text-[10px] font-black text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded-md border border-red-500/30">
                            ⛔ اتوقفت / محظورة
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 tracking-wider uppercase">
                        {m.cardDetails || '•••• •••• •••• ••••'}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      !isBlocked
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                        : isFullyBlocked 
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {!isBlocked 
                        ? (lang === 'ar' ? 'نشطة' : 'Active') 
                        : isFullyBlocked 
                        ? (lang === 'ar' ? 'محظورة / اتوقفت' : 'Blocked') 
                        : (lang === 'ar' ? 'موقوفة' : 'Suspended')}
                    </span>
                  </div>

                  {m.suspensionReason && (
                    <div className="mt-2 text-[10px] font-bold text-red-300 bg-red-900/30 p-2 rounded-xl border border-red-700/50">
                      ⚠️ {m.suspensionReason}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-end mt-4 border-t border-slate-700/60 pt-3 z-10">
                  <div>
                    <span className="text-[9px] text-slate-400 block uppercase font-mono tracking-widest">{lang === 'ar' ? 'تاريخ الانتهاء' : 'EXP DATE'}</span>
                    <span className="text-xs font-mono font-bold text-slate-200">{m.expiryDate || 'MM/YY'}</span>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleBlockStatus(m)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-colors ${
                          isBlocked
                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
                            : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40'
                        }`}
                        title={isBlocked ? 'إلغاء الحظر وتفعيل الفيزا' : 'حظر أو إيقاف هذه الفيزا'}
                      >
                        <i className={`fas ${isBlocked ? 'fa-check-circle' : 'fa-ban'} ml-1`}></i>
                        <span>{isBlocked ? 'إلغاء الحظر' : 'إيقاف / حظر'}</span>
                      </button>

                      <button
                        onClick={() => openEditModal(m)}
                        className="p-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800"
                        title="تعديل البيانات"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="p-1.5 rounded-lg text-xs text-rose-400 hover:bg-slate-800"
                        title="حذف البطاقة"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {methods.length === 0 && (
            <div className="md:col-span-3 text-center py-12 text-xs text-gray-400 font-bold">
              {lang === 'ar' ? 'لا يوجد بطاقات دفع مضافة بعد.' : 'No payment methods added yet.'}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 max-h-[85vh] flex flex-col my-auto">
            <div className="p-5 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">
                {editingMethod ? (lang === 'ar' ? 'تعديل بيانات البطاقة' : 'Edit Card Details') : (lang === 'ar' ? 'إضافة بطاقة جديدة' : 'Add New Payment Card')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'اسم البطاقة / الجهة' : 'Card / Source Name'}</label>
                <input
                  type="text"
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={lang === 'ar' ? 'مثال: فودافون كاش أو بطاقة الأهلي' : 'e.g. CIB Titanium, Vodafone Cash...'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'أرقام البطاقة / الحساب (أو أخر 4 أرقام)' : 'Card Numbers / Last 4'}</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={cardDetails}
                    onChange={e => setCardDetails(e.target.value)}
                    placeholder="e.g. •••• 4321"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'تاريخ الانتهاء' : 'Expiry'}</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none text-center font-mono"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    placeholder="MM/YY"
                  />
                </div>
              </div>

              {/* Card Status Option */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                  {lang === 'ar' ? 'حالة البطاقة البنكية' : 'Card Status'}
                </label>
                <select
                  value={status}
                  onChange={e => {
                    const newStatus = e.target.value as 'active' | 'suspended' | 'blocked';
                    setStatus(newStatus);
                    if (newStatus === 'active') {
                      setEnabled(true);
                    } else {
                      setEnabled(false);
                    }
                  }}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                >
                  <option value="active">🟢 {lang === 'ar' ? 'نشطة (تعمل بشكل طبيعي)' : 'Active & Working'}</option>
                  <option value="suspended">🟡 {lang === 'ar' ? 'موقوفة مؤقتاً' : 'Suspended'}</option>
                  <option value="blocked">🔴 {lang === 'ar' ? 'محظورة / اتوقفت تماماً (يتطلب تغيير الفيزا)' : 'Blocked / Stopped'}</option>
                </select>
              </div>

              {(status === 'suspended' || status === 'blocked') && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl space-y-2">
                  <div className="text-xs font-black text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>تنبيه هـام عند حظر أو إيقاف الفيزا:</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 font-bold leading-relaxed">
                    عند اختيار حالة إيقاف أو حظر، سيظهر تنبيه أحمر بارز في جدول وحسابات التراخيص المربوطة بهذه الفيزا لتوجيه الفريق بضرورة تغيير الفيزا قبل موعد تجديد الحساب!
                  </p>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-1">
                      {lang === 'ar' ? 'سبب الإيقاف / الحظر (اختياري)' : 'Suspension Reason'}
                    </label>
                    <input
                      type="text"
                      className="w-full p-2.5 bg-white dark:bg-gray-800 text-xs font-bold rounded-lg outline-none border border-red-200 dark:border-red-800"
                      value={suspensionReason}
                      onChange={e => setSuspensionReason(e.target.value)}
                      placeholder="مثال: تم إيقاف الفيزا من البنك، أو تجاوز حد السحب..."
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled-method"
                  className="w-4 h-4 rounded text-primary-600"
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />
                <label htmlFor="enabled-method" className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase">
                  {lang === 'ar' ? 'متاحة كخيار اختيار مفعل' : 'Enabled & Active'}
                </label>
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
                  {lang === 'ar' ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
