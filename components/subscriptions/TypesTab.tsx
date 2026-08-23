import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { SubscriptionType } from './types';

interface TypesTabProps {
  types: SubscriptionType[];
  loading: boolean;
  onRefresh: () => void;
  canManage: boolean;
}

export function TypesTab({ types, loading, onRefresh, canManage }: TypesTabProps) {
  const lang = 'ar';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SubscriptionType | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'lifetime' | 'custom'>('monthly');
  const [cost, setCost] = useState(0);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [seatPrice, setSeatPrice] = useState<number>(0);
  const [offers, setOffers] = useState<any[]>([]);

  const addOffer = () => {
    setOffers(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        name: '',
        seatsCount: 2,
        totalPrice: 0,
        savingAmount: 0
      }
    ]);
  };

  const updateOffer = (index: number, key: string, value: any) => {
    setOffers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      
      if (key === 'seatsCount' || key === 'totalPrice') {
        const sCount = Number(key === 'seatsCount' ? value : updated[index].seatsCount) || 0;
        const tPrice = Number(key === 'totalPrice' ? value : updated[index].totalPrice) || 0;
        updated[index].savingAmount = Math.max(0, (sCount * (seatPrice || 0)) - tPrice);
      }
      
      return updated;
    });
  };

  const removeOffer = (index: number) => {
    setOffers(prev => prev.filter((_, i) => i !== index));
  };

  const openAddModal = () => {
    setEditingType(null);
    setName('');
    setBillingCycle('monthly');
    setCost(0);
    setDescription('');
    setEnabled(true);
    setSeatPrice(0);
    setOffers([]);
    setModalOpen(true);
  };

  const openEditModal = (type: SubscriptionType) => {
    setEditingType(type);
    setName(type.name || '');
    setBillingCycle(type.billingCycle || 'monthly');
    setCost(type.cost || 0);
    setDescription(type.description || '');
    setEnabled(type.enabled !== false);
    setSeatPrice(type.seatPrice || 0);
    setOffers(type.offers || []);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Recalculate saving amounts for offers before saving
    const finalizedOffers = offers.map(off => {
      const sCount = Number(off.seatsCount) || 0;
      const tPrice = Number(off.totalPrice) || 0;
      const saving = Math.max(0, (sCount * Number(seatPrice)) - tPrice);
      return {
        ...off,
        seatsCount: sCount,
        totalPrice: tPrice,
        savingAmount: saving
      };
    });

    const data = {
      name,
      billingCycle,
      cost: Number(cost),
      description,
      enabled,
      seatPrice: Number(seatPrice),
      offers: finalizedOffers
    };

    try {
      if (editingType) {
        await updateDoc(doc(db, 'subscriptionTypes', editingType.id), data);
      } else {
        await addDoc(collection(db, 'subscriptionTypes'), data);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error saving subscription type:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا النوع؟' : 'Are you sure you want to delete this type?')) return;
    try {
      await deleteDoc(doc(db, 'subscriptionTypes', id));
      onRefresh();
    } catch (err) {
      console.error('Error deleting subscription type:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'أنواع اشتراكات البرامج' : 'Program Subscription Types'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' ? 'تحديد البرامج المتاحة للاشتراك، دورات الدفع الخاصة بها، والتكلفة الأساسية.' : 'Configure software types, their renewal periods, and standard costs.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white font-black text-xs hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-plus"></i>
            {lang === 'ar' ? 'إضافة نوع برنامج' : 'Add Program Type'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-gray-400 font-bold">
          {lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {types.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="font-black text-sm text-gray-900 dark:text-white">{t.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    t.enabled 
                      ? 'bg-green-50 text-green-600 dark:bg-green-950/20' 
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                  }`}>
                    {t.enabled ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                  </span>
                </div>
                
                <p className="text-xs text-gray-400 mt-2 line-clamp-2 min-h-[2rem]">
                  {t.description || (lang === 'ar' ? 'لا يوجد وصف.' : 'No description provided.')}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 border-gray-50 dark:border-gray-700">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">{lang === 'ar' ? 'دورة الدفع' : 'Billing Cycle'}</span>
                    <span className="text-xs font-black text-gray-800 dark:text-gray-200 capitalize">
                      {t.billingCycle === 'monthly' ? (lang === 'ar' ? 'شهري' : 'Monthly') :
                       t.billingCycle === 'yearly' ? (lang === 'ar' ? 'سنوي' : 'Yearly') :
                       t.billingCycle === 'lifetime' ? (lang === 'ar' ? 'مدى الحياة' : 'Lifetime') :
                       (lang === 'ar' ? 'مخصص' : 'Custom')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">{lang === 'ar' ? 'تكلفة الحساب' : 'Account Cost'}</span>
                    <span className="text-xs font-black text-primary-500">{(t.cost ?? 0).toLocaleString()} EGP</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/50 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">{lang === 'ar' ? 'سعر المقعد الفردي' : 'Single Seat Price'}</span>
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{(t.seatPrice ?? 0).toLocaleString()} EGP</span>
                  </div>
                </div>

                {t.offers && t.offers.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/50 space-y-1">
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">{lang === 'ar' ? 'عروض المقاعد المتاحة' : 'Available Offers'}</span>
                    <div className="flex flex-wrap gap-1">
                      {t.offers.map(o => (
                        <span key={o.id} className="text-[9px] font-bold bg-purple-50 dark:bg-purple-950/25 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded border border-purple-100/10 block w-full">
                          <span className="flex justify-between items-center">
                            <span>{o.name}: {o.seatsCount} {lang === 'ar' ? 'مقاعد بسعر' : 'seats @'} {o.totalPrice} EGP</span>
                            {o.savingAmount > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[8px]">
                                ({lang === 'ar' ? 'وفرت ' : 'Saved '}{o.savingAmount} EGP)
                              </span>
                            )}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex gap-2 justify-end border-t pt-3 mt-4 border-gray-50 dark:border-gray-700">
                  <button
                    onClick={() => openEditModal(t)}
                    className="p-1.5 rounded-lg text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              )}
            </div>
          ))}

          {types.length === 0 && (
            <div className="md:col-span-3 text-center py-12 text-xs text-gray-400 font-bold">
              {lang === 'ar' ? 'لا يوجد أنواع برامج مضافة بعد.' : 'No subscription types added yet.'}
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
                {editingType ? (lang === 'ar' ? 'تعديل نوع البرنامج' : 'Edit Program Type') : (lang === 'ar' ? 'إضافة نوع برنامج جديد' : 'Add New Program Type')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'الاسم' : 'Name'}</label>
                <input
                  type="text"
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={lang === 'ar' ? 'مثال: Photoshop' : 'e.g. Adobe Creative Cloud'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'دورة الدفع' : 'Billing Cycle'}</label>
                  <select
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={billingCycle}
                    onChange={e => setBillingCycle(e.target.value as any)}
                  >
                    <option value="monthly">{lang === 'ar' ? 'شهري' : 'Monthly'}</option>
                    <option value="yearly">{lang === 'ar' ? 'سنوي' : 'Yearly'}</option>
                    <option value="lifetime">{lang === 'ar' ? 'مدى الحياة' : 'Lifetime'}</option>
                    <option value="custom">{lang === 'ar' ? 'مخصص' : 'Custom'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'التكلفة بالجنيه' : 'Cost (EGP)'}</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={cost}
                    onChange={e => setCost(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700/60 pt-3">
                <label className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase block mb-1">
                  {lang === 'ar' ? 'سعر المقعد الفردي للعميل (EGP)' : 'Client Single Seat Price (EGP)'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  className="w-full p-3 bg-emerald-50/20 dark:bg-emerald-950/5 text-sm font-bold rounded-xl border border-emerald-100/40 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 outline-none"
                  value={seatPrice}
                  onChange={e => setSeatPrice(Number(e.target.value))}
                  placeholder="e.g. 420"
                />
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700/60 pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase block">
                    {lang === 'ar' ? 'عروض تعدد المقاعد للعملاء' : 'Multi-Seat Offers'}
                  </label>
                  <button
                    type="button"
                    onClick={addOffer}
                    className="flex items-center gap-1 text-[9px] font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="fas fa-plus"></i>
                    {lang === 'ar' ? 'إضافة عرض جديد' : 'Add Offer'}
                  </button>
                </div>

                {offers.length === 0 ? (
                  <p className="text-[10px] text-gray-400 font-bold italic">
                    {lang === 'ar' ? 'لا يوجد عروض تعدد مقاعد مضافة بعد.' : 'No multi-seat offers defined yet.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {offers.map((off, idx) => (
                      <div key={off.id} className="p-3 bg-purple-50/10 dark:bg-purple-950/5 rounded-xl border border-purple-100/30 dark:border-purple-950/30 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-black text-gray-400 block mb-0.5">{lang === 'ar' ? 'اسم العرض' : 'Offer Name'}</label>
                            <input
                              type="text"
                              required
                              className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-lg border border-gray-100 dark:border-gray-700 outline-none"
                              value={off.name}
                              onChange={e => updateOffer(idx, 'name', e.target.value)}
                              placeholder={lang === 'ar' ? 'مثال: عرض المقعدين' : 'e.g. Double Seat Offer'}
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-black text-gray-400 block mb-0.5">{lang === 'ar' ? 'عدد المقاعد' : 'Seats Count'}</label>
                            <input
                              type="number"
                              required
                              min="2"
                              className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-lg border border-gray-100 dark:border-gray-700 outline-none"
                              value={off.seatsCount}
                              onChange={e => updateOffer(idx, 'seatsCount', Number(e.target.value))}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[9px] font-black text-gray-400 block mb-0.5">{lang === 'ar' ? 'السعر الإجمالي للعرض (EGP)' : 'Total Price'}</label>
                            <input
                              type="number"
                              required
                              min="0"
                              className="w-full p-2 bg-white dark:bg-gray-800 text-xs font-bold rounded-lg border border-gray-100 dark:border-gray-700 outline-none"
                              value={off.totalPrice}
                              onChange={e => updateOffer(idx, 'totalPrice', Number(e.target.value))}
                              placeholder="e.g. 720"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => removeOffer(idx)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg mt-4 cursor-pointer"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>

                        <div className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-md w-fit">
                          {lang === 'ar' ? 'التوفير التلقائي للعميل:' : 'Customer savings:'} {Math.max(0, (off.seatsCount * seatPrice) - off.totalPrice)} EGP
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                <textarea
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none h-20 resize-none"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب تفاصيل أو مميزات هذا الترخيص...' : 'Enter license tier specifics...'}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  className="w-4 h-4 rounded text-primary-600"
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />
                <label htmlFor="enabled" className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase">
                  {lang === 'ar' ? 'متاح للاستخدام' : 'Enabled & Active'}
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
