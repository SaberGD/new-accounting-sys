import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  getPromoCodes, createPromoCode, updatePromoCode, deletePromoCode, 
  genericGet 
} from '../services/firestore';
import { PromoCode, Group, SalesStaff, UserProfile } from '../types';
import DeleteModal from '../components/DeleteModal';

const PromoCodes: React.FC = () => {
  const { t, isRtl } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;

  // State
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'scheduled'>('all');

  // Modal State
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [code, setCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [assignedToType, setAssignedToType] = useState<'trainer' | 'sales' | 'user' | 'other'>('trainer');
  const [assignedToId, setAssignedToId] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [customTrainerName, setCustomTrainerName] = useState('');
  const [customOtherName, setCustomOtherName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Deletion state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  // Check if current user is admin or supervisor (who can manage)
  const canManage = userProfile?.role === 'admin' || userProfile?.role === 'supervisor';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [promos, grps, staff, usrs] = await Promise.all([
        getPromoCodes(),
        genericGet<Group>('groups'),
        genericGet<SalesStaff>('sales_staff'),
        genericGet<UserProfile>('users')
      ]);
      setPromoCodes(promos);
      setGroups(grps);
      setSalesStaff(staff);
      setUsers(usrs);
    } catch (err) {
      console.error('Error fetching promo codes data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute unique trainers from groups
  const uniqueTrainers = useMemo(() => {
    const trainers = groups
      .map(g => g.trainer?.trim())
      .filter(Boolean);
    return Array.from(new Set(trainers));
  }, [groups]);

  // Handle setting assignee details when type or ID changes
  useEffect(() => {
    if (assignedToType === 'trainer') {
      if (assignedToId === 'custom') {
        setAssignedToName(customTrainerName);
      } else {
        setAssignedToName(assignedToId);
      }
    } else if (assignedToType === 'sales') {
      const selected = salesStaff.find(s => s.id === assignedToId);
      setAssignedToName(selected ? selected.fullName : '');
    } else if (assignedToType === 'user') {
      const selected = users.find(u => u.uid === assignedToId);
      setAssignedToName(selected ? (selected.displayName || selected.email) : '');
    } else {
      setAssignedToName(customOtherName);
    }
  }, [assignedToType, assignedToId, customTrainerName, customOtherName, salesStaff, users]);

  // Handle open modal
  const openModal = (promo: PromoCode | null = null) => {
    setErrorMsg('');
    if (promo) {
      setEditingId(promo.id);
      setCode(promo.code);
      setDiscountAmount(promo.discountAmount);
      setAssignedToType(promo.assignedToType);
      
      if (promo.assignedToType === 'trainer') {
        if (uniqueTrainers.includes(promo.assignedToId)) {
          setAssignedToId(promo.assignedToId);
          setCustomTrainerName('');
        } else {
          setAssignedToId('custom');
          setCustomTrainerName(promo.assignedToName);
        }
      } else if (promo.assignedToType === 'sales' || promo.assignedToType === 'user') {
        setAssignedToId(promo.assignedToId);
      } else {
        setAssignedToId('');
        setCustomOtherName(promo.assignedToName);
      }

      setStartDate(promo.startDate);
      setEndDate(promo.endDate);
      setReason(promo.reason);
      setIsActive(promo.isActive);
    } else {
      setEditingId(null);
      setCode('');
      setDiscountAmount(0);
      setAssignedToType('trainer');
      setAssignedToId('');
      setCustomTrainerName('');
      setCustomOtherName('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setReason('');
      setIsActive(true);
    }
    setModalOpen(true);
  };

  // Form Submit Action
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setErrorMsg('');
    setSubmitting(true);

    const cleanCode = code.toUpperCase().replace(/\s+/g, '').trim();
    if (!cleanCode) {
      setErrorMsg('Promo Code is required');
      setSubmitting(false);
      return;
    }

    if (discountAmount <= 0) {
      setErrorMsg('Discount Amount must be greater than 0');
      setSubmitting(false);
      return;
    }

    if (!startDate || !endDate) {
      setErrorMsg('Validity dates are required');
      setSubmitting(false);
      return;
    }

    if (startDate > endDate) {
      setErrorMsg('Start Date cannot be after End Date');
      setSubmitting(false);
      return;
    }

    const finalAssignedId = assignedToType === 'trainer' && assignedToId === 'custom' ? customTrainerName : assignedToId;
    if (!assignedToName.trim()) {
      setErrorMsg('Assignee Name is required');
      setSubmitting(false);
      return;
    }

    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;

    try {
      if (editingId) {
        // Edit Mode
        const updatedPromo: Partial<PromoCode> = {
          code: cleanCode,
          discountAmount,
          assignedToType,
          assignedToId: finalAssignedId,
          assignedToName,
          startDate,
          endDate,
          reason,
          isActive
        };
        await updatePromoCode(editingId, updatedPromo);
      } else {
        // Create Mode
        const newPromo: Omit<PromoCode, 'id' | 'useCount'> = {
          code: cleanCode,
          discountAmount,
          assignedToType,
          assignedToId: finalAssignedId,
          assignedToName,
          startDate,
          endDate,
          reason,
          isActive,
          createdAt: new Date().toISOString(),
          createdByUid: userProfile?.uid || '',
          createdByName: userProfile?.displayName || 'System'
        };
        await createPromoCode(newPromo);
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine Promo Code Status
  const getPromoStatus = (promo: PromoCode): 'active' | 'expired' | 'scheduled' => {
    if (!promo.isActive) return 'expired';
    const today = new Date().toISOString().split('T')[0];
    if (today < promo.startDate) return 'scheduled';
    if (today > promo.endDate) return 'expired';
    return 'active';
  };

  // Filter & Search Logic
  const filteredPromos = useMemo(() => {
    return promoCodes.filter(promo => {
      // Search query
      const matchSearch = 
        promo.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        promo.assignedToName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        promo.reason.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchSearch) return false;

      // Status Filter
      const status = getPromoStatus(promo);
      if (statusFilter === 'all') return true;
      return status === statusFilter;
    });
  }, [promoCodes, searchQuery, statusFilter]);

  return (
    <div className="p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            {t('promoCodes')}
            <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-3 py-1 rounded-full font-black">
              {filteredPromos.length} {t('records')}
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            {isRtl ? 'إدارة أكواد الخصم وتوزيعها وتتبع حجوزاتها' : 'Manage discount codes, assignees, and track booking usages'}
          </p>
        </div>
        {canManage && (
          <button 
            onClick={() => openModal(null)} 
            className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2 active:scale-95"
          >
            <i className="fas fa-plus-circle"></i>
            {isRtl ? 'إنشاء كود جديد' : 'Create Promo Code'}
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 items-stretch md:items-center bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="relative flex-1">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">
            {isRtl ? 'البحث عن كود / اسم / سبب' : 'Search Code / Assignee / Reason'}
          </label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text" 
              placeholder={isRtl ? "ابحث عن الكود، اسم المدرب، سبب الخصم..." : "Search by code, assignee, reason..."}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none font-medium text-sm border border-transparent focus:border-primary-500 transition-all"
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
            />
          </div>
        </div>

        <div className="w-full md:w-[200px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">
            {isRtl ? 'حالة الكود' : 'Status Filter'}
          </label>
          <select 
            className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 border border-transparent focus:border-primary-500 rounded-2xl outline-none text-sm font-bold transition-all"
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="all">{isRtl ? 'كل الحالات' : 'All Statuses'}</option>
            <option value="active">{isRtl ? 'نشط الآن' : 'Active Now'}</option>
            <option value="expired">{isRtl ? 'منتهي / معطل' : 'Expired / Off'}</option>
            <option value="scheduled">{isRtl ? 'مجدول مستقبلاً' : 'Scheduled'}</option>
          </select>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-75">{isRtl ? 'إجمالي الأكواد' : 'TOTAL PROMO CODES'}</p>
            <p className="text-4xl font-black mt-2">{promoCodes.length}</p>
          </div>
          <div className="text-xs font-semibold opacity-90 flex items-center gap-1 mt-4">
            <i className="fas fa-ticket text-[10px]"></i>
            {isRtl ? 'نشط في السيستم حالياً' : 'registered promo vouchers'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-75">{isRtl ? 'الحجوزات المكتملة بالأكواد' : 'TOTAL BOOKINGS APPLIED'}</p>
            <p className="text-4xl font-black mt-2">
              {promoCodes.reduce((sum, item) => sum + (item.useCount || 0), 0)}
            </p>
          </div>
          <div className="text-xs font-semibold opacity-90 flex items-center gap-1 mt-4">
            <i className="fas fa-check-circle text-[10px]"></i>
            {isRtl ? 'إجمالي استخدامات الحجز' : 'total client uses across codes'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-75">{isRtl ? 'أقوى كود أداءً' : 'BEST PERFORMING CODE'}</p>
            <p className="text-2xl font-black mt-2 truncate max-w-[200px]">
              {promoCodes.length > 0 
                ? [...promoCodes].sort((a,b) => b.useCount - a.useCount)[0].useCount > 0 
                  ? [...promoCodes].sort((a,b) => b.useCount - a.useCount)[0].code 
                  : 'N/A'
                : 'N/A'}
            </p>
          </div>
          <div className="text-xs font-semibold opacity-90 flex items-center gap-1 mt-4">
            <i className="fas fa-fire text-[10px]"></i>
            {isRtl ? 'الأعلى استخداماً في الحجوزات' : 'highest conversion discount'}
          </div>
        </div>
      </div>

      {/* Main Table view */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-xs font-black text-gray-400 uppercase tracking-widest">{isRtl ? 'جاري التحميل...' : 'Loading Voucher Data...'}</p>
          </div>
        ) : (
          <table className="w-full text-left rtl:text-right min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400">
              <tr>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest w-12 text-center">#</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{isRtl ? 'الكود' : 'Voucher Code'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{isRtl ? 'قيمة الخصم' : 'Discount EGP'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{isRtl ? 'تابع لمن (المدرب / المستخدم)' : 'Assigned To / Owner'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{isRtl ? 'فترة الصلاحية' : 'Validity Duration'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{isRtl ? 'سبب الخصم' : 'Reason / Details'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-center">{isRtl ? 'عدد الحجوزات' : 'Use Count'}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                {canManage && <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-right">{isRtl ? 'إجراءات' : 'Actions'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredPromos.map((promo, idx) => {
                const status = getPromoStatus(promo);
                return (
                  <tr key={promo.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-6 py-5 text-center text-xs font-bold text-gray-400">{idx + 1}</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-800">
                          {promo.code}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 font-black text-sm text-gray-900 dark:text-gray-100">
                      {promo.discountAmount.toLocaleString()} EGP
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                          promo.assignedToType === 'trainer' ? 'bg-amber-100 text-amber-600' :
                          promo.assignedToType === 'sales' ? 'bg-indigo-100 text-indigo-600' :
                          promo.assignedToType === 'user' ? 'bg-purple-100 text-purple-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {promo.assignedToType === 'trainer' && <i className="fas fa-chalkboard-user"></i>}
                          {promo.assignedToType === 'sales' && <i className="fas fa-user-tie"></i>}
                          {promo.assignedToType === 'user' && <i className="fas fa-user"></i>}
                          {promo.assignedToType === 'other' && <i className="fas fa-asterisk"></i>}
                        </span>
                        <div>
                          <p className="font-bold text-xs">{promo.assignedToName}</p>
                          <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">
                            {promo.assignedToType}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {isRtl ? 'من:' : 'From:'} <span className="font-mono text-[11px] font-black text-gray-400">{promo.startDate}</span>
                      </p>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-0.5">
                        {isRtl ? 'إلى:' : 'To:'} <span className="font-mono text-[11px] font-black text-gray-400">{promo.endDate}</span>
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[150px]" title={promo.reason}>
                        {promo.reason || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="font-black text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                        {promo.useCount || 0} {isRtl ? 'حجز' : 'Bookings'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                        status === 'active' ? 'bg-green-100 text-green-700 border-green-200' :
                        status === 'scheduled' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-red-100 text-red-700 border-red-200'
                      }`}>
                        {status === 'active' && (isRtl ? 'نشط' : 'Active')}
                        {status === 'scheduled' && (isRtl ? 'مجدول' : 'Scheduled')}
                        {status === 'expired' && (isRtl ? 'منتهي / معطل' : 'Expired')}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => openModal(promo)}
                            className="w-7 h-7 rounded-lg text-blue-500 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 flex items-center justify-center transition-colors"
                            title={t('edit')}
                          >
                            <i className="fas fa-edit text-xs"></i>
                          </button>
                          <button 
                            onClick={() => { setDeleteId(promo.id); setDeleteName(promo.code); }}
                            className="w-7 h-7 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors"
                            title={t('delete')}
                          >
                            <i className="fas fa-trash-alt text-xs"></i>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {filteredPromos.length === 0 && !loading && (
          <div className="py-24 text-center text-gray-400 italic font-bold">
            {isRtl ? 'لا يوجد أكواد مطابقة لخيارات البحث.' : 'No promotional codes found matching the filters.'}
          </div>
        )}
      </div>

      {/* Save Code Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black mb-6 pb-4 border-b dark:border-gray-700 text-gray-900 dark:text-gray-100">
              {editingId ? (isRtl ? 'تعديل كود الخصم' : 'Edit Promo Code') : (isRtl ? 'إنشاء كود خصم جديد' : 'New Promo Code')}
            </h2>

            {errorMsg && (
              <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded-xl">
                <p className="text-xs text-red-600 dark:text-red-400 font-bold">{errorMsg}</p>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              {/* Code Name */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">
                  {isRtl ? 'اسم الكود (بدون مسافات) *' : 'Voucher Code (No Spaces) *'}
                </label>
                <input 
                  type="text" 
                  required 
                  disabled={!!editingId} // Code itself is immutable once created (since it is the ID)
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none font-bold text-sm tracking-wider uppercase border-2 border-transparent focus:border-primary-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  placeholder="e.g. SABER200"
                  value={code} 
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                />
              </div>

              {/* Discount Amount */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">
                  {isRtl ? 'قيمة الخصم (جنيه مصري) *' : 'Discount Amount (EGP) *'}
                </label>
                <input 
                  type="number" 
                  required 
                  min="1"
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none font-black text-sm border-2 border-transparent focus:border-primary-500 transition-all" 
                  value={discountAmount || ''} 
                  onChange={e => setDiscountAmount(Number(e.target.value))}
                />
              </div>

              {/* Assign To (تابع لمين) */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border dark:border-gray-700 space-y-4">
                <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase block tracking-widest">
                  {isRtl ? 'صاحب الكود (تابع لمين) *' : 'Voucher Owner (Belongs To) *'}
                </label>
                
                <div className="grid grid-cols-4 gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                  {(['trainer', 'sales', 'user', 'other'] as const).map(type => (
                    <button 
                      key={type}
                      type="button" 
                      onClick={() => { setAssignedToType(type); setAssignedToId(''); }}
                      className={`py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${
                        assignedToType === type ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-500'
                      }`}
                    >
                      {type === 'trainer' && (isRtl ? 'مدرب' : 'Trainer')}
                      {type === 'sales' && (isRtl ? 'سيلز' : 'Sales')}
                      {type === 'user' && (isRtl ? 'مستخدم' : 'User')}
                      {type === 'other' && (isRtl ? 'آخر' : 'Other')}
                    </button>
                  ))}
                </div>

                {/* Trainer Select */}
                {assignedToType === 'trainer' && (
                  <div className="space-y-3">
                    <select 
                      required 
                      className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold"
                      value={assignedToId}
                      onChange={e => setAssignedToId(e.target.value)}
                    >
                      <option value="">{isRtl ? 'اختر مدرباً من المسجلين' : 'Select Registered Trainer'}</option>
                      {uniqueTrainers.map(tr => (
                        <option key={tr} value={tr}>{tr}</option>
                      ))}
                      <option value="custom">{isRtl ? '📝 كتابة اسم مدرب آخر غير مسجل' : '📝 Enter Custom Trainer Name'}</option>
                    </select>

                    {assignedToId === 'custom' && (
                      <input 
                        type="text" 
                        required 
                        placeholder={isRtl ? "اكتب اسم المدرب بالكامل *" : "Type Trainer Full Name *"}
                        className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold border"
                        value={customTrainerName}
                        onChange={e => setCustomTrainerName(e.target.value)}
                      />
                    )}
                  </div>
                )}

                {/* Sales Select */}
                {assignedToType === 'sales' && (
                  <select 
                    required 
                    className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold"
                    value={assignedToId}
                    onChange={e => setAssignedToId(e.target.value)}
                  >
                    <option value="">{isRtl ? 'اختر مندوب مبيعات' : 'Select Sales Staff'}</option>
                    {salesStaff.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                )}

                {/* User Select */}
                {assignedToType === 'user' && (
                  <select 
                    required 
                    className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold"
                    value={assignedToId}
                    onChange={e => setAssignedToId(e.target.value)}
                  >
                    <option value="">{isRtl ? 'اختر مستخدماً من النظام' : 'Select System User'}</option>
                    {users.filter(u => u.isActive).map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                    ))}
                  </select>
                )}

                {/* Custom Other Name */}
                {assignedToType === 'other' && (
                  <input 
                    type="text" 
                    required 
                    placeholder={isRtl ? "اكتب الاسم بالكامل *" : "Type Owner Full Name *"}
                    className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold"
                    value={customOtherName}
                    onChange={e => setCustomOtherName(e.target.value)}
                  />
                )}
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">
                    {isRtl ? 'تاريخ البدء *' : 'Start Date *'}
                  </label>
                  <input 
                    type="date" 
                    required 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none text-xs font-bold border-2 border-transparent focus:border-primary-500 transition-all" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">
                    {isRtl ? 'تاريخ الانتهاء *' : 'End Date *'}
                  </label>
                  <input 
                    type="date" 
                    required 
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none text-xs font-bold border-2 border-transparent focus:border-primary-500 transition-all" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Reason / Title */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest">
                  {isRtl ? 'سبب الخصم (المناسبة) *' : 'Reason / Campaign *'}
                </label>
                <input 
                  type="text" 
                  required 
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none text-sm font-semibold border-2 border-transparent focus:border-primary-500 transition-all" 
                  placeholder={isRtl ? "مثال: خصم المحاضرة التعريفية للمدرب صابر" : "e.g. Intro Lecture Voucher for Coach Saber"}
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                />
              </div>

              {/* Is Active Status checkbox */}
              <label className="flex items-center space-x-3 rtl:space-x-reverse bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl cursor-pointer border border-transparent hover:border-primary-100 dark:hover:border-primary-900 transition-all">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                  checked={isActive} 
                  onChange={e => setIsActive(e.target.checked)} 
                />
                <span className="text-sm font-black text-gray-700 dark:text-gray-300">
                  {isRtl ? 'تفعيل الكود (متاح للاستخدام فوراً)' : 'Voucher is enabled (usable)'}
                </span>
              </label>

              {/* Form Controls */}
              <div className="flex justify-end gap-3 pt-6 border-t dark:border-gray-700">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)} 
                  className="px-6 py-3 font-black text-xs uppercase tracking-wider text-gray-400 hover:text-gray-500"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-500/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  {submitting && <i className="fas fa-circle-notch fa-spin"></i>}
                  {editingId ? (isRtl ? 'حفظ التعديلات' : 'Save Changes') : (isRtl ? 'إنشاء الكود' : 'Create Voucher')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={async () => { 
          if (deleteId) { 
            await deletePromoCode(deleteId); 
          } 
          setDeleteId(null); 
          fetchData(); 
        }} 
        itemName={deleteName} 
      />
    </div>
  );
};

export default PromoCodes;
