import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { PreRegisteredAccount, SubscriptionType } from './types';

interface PreRegisteredTabProps {
  preRegisteredAccounts: PreRegisteredAccount[];
  types: SubscriptionType[];
  loading: boolean;
  onRefresh: () => void;
  canManage: boolean;
  openAddModalInitially?: boolean;
}

export function PreRegisteredTab({
  preRegisteredAccounts,
  types,
  loading,
  onRefresh,
  canManage,
  openAddModalInitially = false
}: PreRegisteredTabProps) {
  const lang = 'ar';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PreRegisteredAccount | null>(null);

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const [visibleMasterPasswords, setVisibleMasterPasswords] = useState<{ [id: string]: boolean }>({});

  // Search/Filters/Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest_added');

  // Form states
  const [typeId, setTypeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [status, setStatus] = useState<'free' | 'paid'>('free');
  const [notes, setNotes] = useState('');

  // Handle initial modal state if requested
  useEffect(() => {
    if (openAddModalInitially) {
      openAddModal();
    }
  }, [openAddModalInitially]);

  const togglePasswordVisibility = async (id: string, emailStr: string) => {
    const isNowVisible = !visiblePasswords[id];
    setVisiblePasswords(prev => ({ ...prev, [id]: isNowVisible }));

    if (isNowVisible) {
      try {
        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'FREE_ACCOUNT_PASSWORD_VIEWED',
          description: `User viewed password for pre-registered free account (${emailStr})`,
          performedBy: 'Authorized Staff',
          performedByEmail: ''
        });
      } catch (err) {
        console.error('Failed to log audit:', err);
      }
    }
  };

  const toggleMasterPasswordVisibility = (id: string) => {
    setVisibleMasterPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setTypeId(types[0]?.id || '');
    setEmail('');
    setPassword('');
    setMasterPassword('');
    setStatus('free');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (acc: PreRegisteredAccount) => {
    setEditingAccount(acc);
    setTypeId(acc.typeId || '');
    setEmail(acc.email || '');
    setPassword(acc.password || '');
    setMasterPassword(acc.masterPassword || '');
    setStatus(acc.status || 'free');
    setNotes(acc.notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !typeId) return;

    const data: any = {
      typeId,
      email: email.trim(),
      password,
      status,
      notes,
      updatedAt: new Date().toISOString()
    };

    if (canManage) {
      data.masterPassword = masterPassword;
    }

    try {
      if (editingAccount) {
        await updateDoc(doc(db, 'preRegisteredAccounts', editingAccount.id), data);

        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'FREE_ACCOUNT_UPDATED',
          description: `Updated free-pool account ${email}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'preRegisteredAccounts'), data);

        await addDoc(collection(db, 'auditLogs'), {
          timestamp: new Date().toISOString(),
          section: 'Program Subscriptions',
          action: 'FREE_ACCOUNT_CREATED',
          description: `Added new free-pool account ${email}`,
          performedBy: 'Staff',
          performedByEmail: ''
        });
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error saving pre-registered account:', err);
    }
  };

  const handleDelete = async (acc: PreRegisteredAccount) => {
    const confirmMsg = lang === 'ar' 
      ? 'هل أنت متأكد من حذف هذا الحساب الجاهز؟ لن تتمكن من استعادته.' 
      : 'Are you sure you want to delete this pre-registered account? This action cannot be undone.';
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'preRegisteredAccounts', acc.id));
      await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        section: 'Program Subscriptions',
        action: 'FREE_ACCOUNT_DELETED',
        description: `Deleted free-pool account ${acc.email}`,
        performedBy: 'Staff',
        performedByEmail: ''
      });
      onRefresh();
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  // Filter and sort accounts
  const filteredAccounts = React.useMemo(() => {
    let list = preRegisteredAccounts.filter(acc => {
      const matchesSearch = acc.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (acc.notes && acc.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = selectedTypeFilter === 'all' || acc.typeId === selectedTypeFilter;
      const matchesStatus = selectedStatusFilter === 'all' || acc.status === selectedStatusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });

    list.sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return (a.email || '').localeCompare(b.email || '');
      }
      if (sortBy === 'newest_added') {
        const dateA = a.createdAt || a.updatedAt || '';
        const dateB = b.createdAt || b.updatedAt || '';
        return dateB.localeCompare(dateA);
      }
      if (sortBy === 'oldest_added') {
        const dateA = a.createdAt || a.updatedAt || '';
        const dateB = b.createdAt || b.updatedAt || '';
        return dateA.localeCompare(dateB);
      }
      if (sortBy === 'status_free_first') {
        if (a.status === 'free' && b.status !== 'free') return -1;
        if (a.status !== 'free' && b.status === 'free') return 1;
        return (a.email || '').localeCompare(b.email || '');
      }
      if (sortBy === 'program_name') {
        const typeA = types.find(t => t.id === a.typeId)?.name || '';
        const typeB = types.find(t => t.id === b.typeId)?.name || '';
        return typeA.localeCompare(typeB, 'ar');
      }
      return 0;
    });

    return list;
  }, [preRegisteredAccounts, searchTerm, selectedTypeFilter, selectedStatusFilter, sortBy, types]);

  return (
    <div className="space-y-6">
      {/* Tab Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-envelope text-primary-500"></i>
            {lang === 'ar' ? 'مخزن الحسابات الجاهزة (Free Tier Pool)' : 'Pre-registered Free Accounts Pool'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' 
              ? 'الحسابات المسجلة مسبقاً على المواقع والجاهزة للاستخدام والاشتراك بها للعملاء الجدد عند الحاجة.' 
              : 'Pre-registered accounts on service platforms, ready to be upgraded to paid tier upon new customer requests.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white font-black text-xs hover:bg-primary-700 transition-all duration-200 shadow-sm self-start md:self-auto"
          >
            <i className="fas fa-plus"></i>
            {lang === 'ar' ? 'إضافة إيميل جاهز جديد' : 'Add New Ready Email'}
          </button>
        )}
      </div>

      {/* Filters bar */}
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
          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 rounded-xl border border-transparent">
            <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{lang === 'ar' ? 'ترتيب حسب:' : 'Sort by:'}</span>
            <select
              className="bg-transparent text-xs font-bold outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="newest_added">{lang === 'ar' ? 'المُضاف حديثاً' : 'Newest Added'}</option>
              <option value="alphabetical">{lang === 'ar' ? 'أبجدي (حسب الإيميل)' : 'Alphabetical (Email)'}</option>
              <option value="status_free_first">{lang === 'ar' ? 'حسب الإتاحة (المتاح أولاً)' : 'Available First'}</option>
              <option value="program_name">{lang === 'ar' ? 'حسب نوع البرنامج' : 'By Program'}</option>
              <option value="oldest_added">{lang === 'ar' ? 'الأقدم إضافة' : 'Oldest Added'}</option>
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
            value={selectedStatusFilter}
            onChange={e => setSelectedStatusFilter(e.target.value)}
          >
            <option value="all">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
            <option value="free">{lang === 'ar' ? 'متاح (Free)' : 'Available (Free)'}</option>
            <option value="paid">{lang === 'ar' ? 'مستخدم كمدفوع (Paid)' : 'Used as Paid (Paid)'}</option>
          </select>
        </div>
      </div>

      {/* Table & List */}
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
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'نوع البرنامج' : 'Software Program'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'البريد الإلكتروني' : 'Login Email'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'كلمة المرور للموقع' : 'Site Password'}</th>
                  {canManage && <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الباسورد الرئيسي' : 'Master Password'}</th>}
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'تاريخ الإضافة' : 'Date Added'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'الحالة الحالية' : 'Current Status'}</th>
                  {canManage && <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                {filteredAccounts.map((acc) => {
                  const type = types.find(t => t.id === acc.typeId);

                  return (
                    <tr key={acc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                      <td className="p-4 font-black text-gray-900 dark:text-white">
                        {type?.name || (lang === 'ar' ? 'غير معروف' : 'Unknown')}
                      </td>
                      <td className="p-4 font-mono font-bold text-gray-600 dark:text-gray-300">
                        {acc.email}
                      </td>
                      <td className="p-4 font-mono font-bold">
                        <div className="flex items-center gap-2">
                          <span>{visiblePasswords[acc.id] ? acc.password : '••••••••'}</span>
                          <button
                            onClick={() => togglePasswordVisibility(acc.id, acc.email)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                            <i className={`fas ${visiblePasswords[acc.id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                        </div>
                      </td>
                      {canManage && (
                        <td className="p-4 font-mono font-bold text-red-600 dark:text-red-400">
                          <div className="flex items-center gap-2">
                            <span>{visibleMasterPasswords[acc.id] ? acc.masterPassword || '-' : '••••••••'}</span>
                            <button
                              onClick={() => toggleMasterPasswordVisibility(acc.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                              <i className={`fas ${visibleMasterPasswords[acc.id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="p-4 text-gray-500 max-w-[150px] truncate">
                        {acc.notes || '-'}
                      </td>
                      <td className="p-4 font-bold text-gray-400 font-mono text-[11px]">
                        {acc.createdAt ? new Date(acc.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                          acc.status === 'free' 
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/20' 
                            : 'bg-green-50 text-green-600 dark:bg-green-950/20'
                        }`}>
                          {acc.status === 'free' ? (lang === 'ar' ? 'متاح (فري)' : 'Available (Free)') : (lang === 'ar' ? 'مدفوع (مستخدم)' : 'Paid (Used)')}
                        </span>
                      </td>
                      {canManage && (
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => openEditModal(acc)}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              onClick={() => handleDelete(acc)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 8 : 6} className="text-center py-12 text-xs text-gray-400 font-bold">
                      {lang === 'ar' ? 'لا توجد إيميلات جاهزة مطابقة بعد.' : 'No matching pre-registered emails found.'}
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
                {editingAccount ? (lang === 'ar' ? 'تعديل بيانات الحساب الجاهز' : 'Edit Ready Email Details') : (lang === 'ar' ? 'إضافة إيميل جاهز جديد' : 'Add New Ready Email')}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'برنامج الترخيص' : 'Software Program'}</label>
                <select
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                  value={typeId}
                  onChange={e => setTypeId(e.target.value)}
                >
                  {types.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'البريد الإلكتروني المسجل' : 'Registered Email'}</label>
                  <input
                    type="email"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. adobe.free1@gmail.com"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'الباسوورد الخاص بالموقع' : 'Site Password'}</label>
                  <input
                    type="text"
                    required
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Site Login Password"
                  />
                </div>
              </div>

              {canManage && (
                <div className="p-3 bg-red-50/20 dark:bg-red-950/10 border border-red-100/30 dark:border-red-900/20 rounded-2xl">
                  <label className="text-[10px] font-black text-red-500 uppercase block mb-1">
                    {lang === 'ar' ? 'الباسورد الرئيسي (للأدمن فقط - مخفي من الموظفين)' : 'Master Password (Admin Only - Hidden from staff)'}
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/40 text-sm font-bold rounded-xl outline-none text-red-700 dark:text-red-300"
                    value={masterPassword}
                    onChange={e => setMasterPassword(e.target.value)}
                    placeholder="Admin Master Password"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'الحالة الحالية' : 'Current Status'}</label>
                  <select
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                  >
                    <option value="free">{lang === 'ar' ? 'متاح (Free)' : 'Available (Free)'}</option>
                    <option value="paid">{lang === 'ar' ? 'مستخدم كمدفوع (Paid)' : 'Used as Paid (Paid)'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">{lang === 'ar' ? 'ملاحظات إضافية' : 'Notes'}</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 text-sm font-bold rounded-xl outline-none"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
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
                  {lang === 'ar' ? 'حفظ الحساب' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
