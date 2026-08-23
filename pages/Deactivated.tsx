
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, restoreBooking } from '../services/firestore';
import { Booking, Customer, Group, Course, Diploma, SalesStaff } from '../types';

const Deactivated: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore Modal State
  const [restoreModalId, setRestoreModalId] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  
  // Mandatory Confirmation for Refunded Restore
  const [showRepaymentConfirm, setShowRepaymentConfirm] = useState(false);
  const [repaymentConfirmed, setRepaymentConfirmed] = useState<boolean | null>(null);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DEACTIVATED' | 'REFUNDED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const setThisMonthPreset = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${y}-${m}-01`;
    const lastDayObj = new Date(y, now.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const setLastMonthPreset = () => {
    const now = new Date();
    let y = now.getFullYear();
    let mObj = now.getMonth() - 1;
    if (mObj < 0) {
      mObj = 11;
      y -= 1;
    }
    const m = String(mObj + 1).padStart(2, '0');
    const firstDay = `${y}-${m}-01`;
    const lastDayObj = new Date(y, mObj + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('ALL');
    setSearchQuery('');
  };

  const fetchData = async () => {
    setLoading(true);
    const [b, c, g, crs, d, s] = await Promise.all([
      genericGet<Booking>('bookings'),
      genericGet<Customer>('customers'),
      genericGet<Group>('groups'),
      genericGet<Course>('catalog_courses'),
      genericGet<Diploma>('catalog_diplomas'),
      genericGet<SalesStaff>('sales_staff')
    ]);
    setBookings(b.filter(x => (x.status === 'DEACTIVATED' || x.status === 'REFUNDED') && !x.isDeleted));
    setCustomers(c);
    setGroups(g);
    setCourses(crs);
    setDiplomas(d);
    setSalesStaff(s);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleStartRestore = (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    setRestoreModalId(bookingId);
    setRestoreReason('');
    
    // Check if there is any refunded history (status is REFUNDED or has refundedTotal > 0)
    if (booking.status === 'REFUNDED' || (booking.refundedTotal && booking.refundedTotal > 0)) {
        setShowRepaymentConfirm(true);
        setRepaymentConfirmed(null);
    } else {
        setShowRepaymentConfirm(false);
        setRepaymentConfirmed(false); // No repayment check needed for simple deactivations
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreModalId || !restoreReason.trim()) return;
    
    const booking = bookings.find(b => b.id === restoreModalId);
    const hasRefund = booking?.status === 'REFUNDED' || (booking?.refundedTotal && booking.refundedTotal > 0);

    // Permission Guard
    if (hasRefund && !hasPermission('restoreBookings')) {
        alert("Access Denied: Only authorized personnel can restore refunded bookings.");
        return;
    }

    // Process Guard
    if (hasRefund && repaymentConfirmed !== true) {
        return; 
    }

    setIsRestoring(true);
    try {
      await restoreBooking(restoreModalId, restoreReason, repaymentConfirmed === true);
      setRestoreModalId(null);
      setRestoreReason('');
      setRepaymentConfirmed(null);
      setShowRepaymentConfirm(false);
      await fetchData();
    } catch (err: any) {
      alert("Restore failed: " + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const canRestore = hasPermission('restoreBookings');

  const filteredBookings = useMemo(() => {
    let list = [...bookings];
    if (!hasPermission('viewAllBookings')) {
      const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);
      if (linkedStaff) {
        list = list.filter(b => b.salesId === linkedStaff.id);
      } else if (salesStaff.length > 0) {
        return [];
      }
    }

    // Filter by status
    if (statusFilter === 'REFUNDED') {
      list = list.filter(b => b.status === 'REFUNDED' || (b.refundedTotal && b.refundedTotal > 0));
    } else if (statusFilter === 'DEACTIVATED') {
      list = list.filter(b => b.status === 'DEACTIVATED' && (!b.refundedTotal || b.refundedTotal === 0));
    }

    // Filter by date range
    if (startDate) {
      list = list.filter(b => {
        const d = (b.deactivatedAt || b.bookingDate || '').split('T')[0];
        return d >= startDate;
      });
    }
    if (endDate) {
      list = list.filter(b => {
        const d = (b.deactivatedAt || b.bookingDate || '').split('T')[0];
        return d <= endDate;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(b => {
        const cust = customers.find(c => c.id === b.customerId);
        const grp = groups.find(g => g.id === b.groupId);
        const prod = [...courses, ...diplomas].find(p => p.id === grp?.productId);
        return (
          cust?.name?.toLowerCase().includes(q) ||
          cust?.phone?.includes(q) ||
          cust?.whatsapp?.includes(q) ||
          prod?.name?.toLowerCase().includes(q) ||
          b.deactivatedReason?.toLowerCase().includes(q)
        );
      });
    }

    // Sort by newest first (deactivatedAt or bookingDate descending)
    list.sort((a, b) => {
      const dateA = a.deactivatedAt || a.bookingDate || '';
      const dateB = b.deactivatedAt || b.bookingDate || '';
      return dateB.localeCompare(dateA);
    });

    return list;
  }, [bookings, userProfile, salesStaff, hasPermission, statusFilter, startDate, endDate, searchQuery, customers, groups, courses, diplomas]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black mb-1 uppercase tracking-tight">Deactivated & Refunded Records</h1>
          <p className="text-gray-500 font-medium text-xs">سجل الحجوزات الملغاة والمستردة - مرتبة من الأحدث إلى الأقدم مع إمكانية التصفية والفلاتر.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-black text-xs px-4 py-2 rounded-2xl border border-red-200 dark:border-red-900">
            الإجمالي: {filteredBookings.length} سجل
          </span>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 mb-8 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <i className="fas fa-search absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="text"
              placeholder="بحث باسم الطالب، الهاتف، الكورس..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 rtl:pl-4 rtl:pr-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 rounded-xl text-xs font-semibold text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Date Range Selection */}
          <div className="md:col-span-5 flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
            <span className="text-gray-400 self-end pb-2 font-bold">-</span>
            <div className="flex-1">
              <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Quick Presets & Reset */}
          <div className="md:col-span-3 flex items-center justify-end gap-1.5 self-end pb-0.5">
            <button
              onClick={setThisMonthPreset}
              className="px-2.5 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl text-[10px] font-bold transition-all"
            >
              هذا الشهر
            </button>
            <button
              onClick={setLastMonthPreset}
              className="px-2.5 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl text-[10px] font-bold transition-all"
            >
              الشهر السابق
            </button>
            {(startDate || endDate || searchQuery || statusFilter !== 'ALL') && (
              <button
                onClick={resetFilters}
                className="px-2.5 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-[10px] font-bold transition-all"
                title="إعادة ضبط"
              >
                <i className="fas fa-undo"></i>
              </button>
            )}
          </div>
        </div>

        {/* Status Tab Filters */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-[10px] font-black uppercase text-gray-400 ml-2">الحالة:</span>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black transition-all ${
              statusFilter === 'ALL'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setStatusFilter('DEACTIVATED')}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black transition-all ${
              statusFilter === 'DEACTIVATED'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            DEACTIVATED (بدون استرداد)
          </button>
          <button
            onClick={() => setStatusFilter('REFUNDED')}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black transition-all ${
              statusFilter === 'REFUNDED'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            REFUNDED (تم الاسترداد)
          </button>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-left rtl:text-right">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-6 py-5 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400">Customer & Course</th>
              <th className="px-6 py-5 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400">Termination Intel</th>
              <th className="px-6 py-5 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400">Net Financials</th>
              <th className="px-6 py-5 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 text-center">Status</th>
              <th className="px-6 py-5 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filteredBookings.map(booking => {
              const cust = customers.find(c => c.id === booking.customerId);
              const grp = groups.find(g => g.id === booking.groupId);
              const prod = [...courses, ...diplomas].find(p => p.id === grp?.productId);
              return (
                <tr key={booking.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-6 py-6">
                    <p className="font-bold text-gray-900 dark:text-white mb-0.5">{cust?.name}</p>
                    <p className="text-[10px] text-primary-600 font-black uppercase tracking-widest">{prod?.name}</p>
                    <p className="text-[9px] text-gray-400 font-medium mt-1">{grp?.scheduleLabel}</p>
                  </td>
                  <td className="px-6 py-6 max-w-xs">
                    <div className="flex items-start space-x-2 rtl:space-x-reverse">
                      <i className="fas fa-quote-left text-gray-300 text-[10px] mt-1"></i>
                      <p className="text-xs italic text-gray-600 dark:text-gray-400 leading-relaxed">
                        {booking.deactivatedReason || 'No reason provided'}
                      </p>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase tracking-tighter">On: {booking.deactivatedAt?.split('T')[0]}</p>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-[9px] font-black text-gray-400 uppercase w-12">Paid</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{booking.paymentSummary.paidTotal.toLocaleString()}</span>
                      </div>
                      {(booking.refundedTotal || 0) > 0 && (
                        <div className="flex items-center space-x-2 rtl:space-x-reverse mt-1">
                          <span className="text-[9px] font-black text-red-400 uppercase w-12">Refund</span>
                          <span className="text-sm font-black text-red-600">-{booking.refundedTotal?.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center">
                    {booking.status === 'REFUNDED' ? (
                      <span className="px-3 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase shadow-sm border border-red-100">REFUNDED</span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest border border-gray-200">DEACTIVATED</span>
                    )}
                  </td>
                  <td className="px-6 py-6 text-right">
                    {canRestore && (
                      <button 
                        onClick={() => handleStartRestore(booking.id)} 
                        className="px-5 py-2 bg-primary-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                      >
                        {t('restore')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredBookings.length === 0 && !loading && (
          <div className="py-24 text-center">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
              <i className="fas fa-ban text-3xl"></i>
            </div>
            <p className="text-gray-400 font-black uppercase text-xs tracking-widest">No Termination Records Found</p>
          </div>
        )}
      </div>

      {/* Restore Modal */}
      {restoreModalId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-primary-100 dark:border-primary-900 overflow-hidden">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight text-center mb-2">
                {showRepaymentConfirm ? t('restoreRefundedTitle') : t('restore')}
            </h2>
            
            {showRepaymentConfirm && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 p-4 rounded-2xl mb-6">
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-bold mb-3">
                        {t('repaymentConfirmMsg').replace('{{amount}}', (bookings.find(b => b.id === restoreModalId)?.refundedTotal || 0).toString())}
                    </p>
                    <div className="flex gap-2">
                        <button 
                            type="button" 
                            onClick={() => setRepaymentConfirmed(true)} 
                            className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase border transition-all ${repaymentConfirmed === true ? 'bg-green-600 text-white border-green-700' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                        >
                            YES - Repaid
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setRepaymentConfirmed(false)} 
                            className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase border transition-all ${repaymentConfirmed === false ? 'bg-red-600 text-white border-red-700' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                        >
                            NO - Not Repaid
                        </button>
                    </div>
                    {repaymentConfirmed === false && (
                        <p className="mt-3 text-[9px] text-red-600 font-black animate-pulse uppercase text-center">{t('repaymentRequired')}</p>
                    )}
                </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Reason for restoration *</label>
                <textarea 
                    required 
                    className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none min-h-[100px] text-sm border-2 border-transparent focus:border-primary-500 transition-all" 
                    value={restoreReason} 
                    onChange={e => setRestoreReason(e.target.value)} 
                    placeholder="e.g. Student reconsidered, money returned..." 
                />
              </div>

              <div className="flex flex-col space-y-2 pt-4">
                <button 
                    onClick={handleRestoreConfirm} 
                    disabled={!restoreReason.trim() || isRestoring || (showRepaymentConfirm && repaymentConfirmed !== true)} 
                    className="w-full py-4 bg-primary-600 text-white rounded-2xl font-black uppercase shadow-lg shadow-primary-500/30 disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                >
                    {isRestoring ? 'PROCESSING...' : 'ACTIVATE RECORD'}
                </button>
                <button 
                    onClick={() => { setRestoreModalId(null); setRepaymentConfirmed(null); }} 
                    disabled={isRestoring}
                    className="w-full py-2 text-gray-400 font-bold text-xs uppercase"
                >
                    Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deactivated;
