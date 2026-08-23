
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getAggregatedStats, syncAggregatedStats, genericGet } from '../services/firestore';
import { Payment, Booking, SalesStaff } from '../types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const Dashboard: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    collected: 0,
    outstanding: 0,
    expected: 0,
    bookingsCount: 0,
    whatsappPending: 0
  });
  const [salesStats, setSalesStats] = useState<{name: string, collected: number, reassignedCount: number, id?: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // State for Privacy Mode (Hidden by default)
  const [showFinancials, setShowFinancials] = useState(false);

  // Dynamic permission checks
  const canViewRevenue = hasPermission('viewRevenue');
  const canSyncStats = ['admin', 'manager', 'supervisor'].includes(userProfile?.role || '');
  const canViewProgramSubs = hasPermission('viewProgramSubscriptions');

  // Program Subscriptions aggregated stats state
  const [subStats, setSubStats] = useState({
    activeTraineesCount: 0,
    unpaidSeatsCount: 0,
    activeAccountsCount: 0,
    totalMaxSeats: 0,
    totalActiveSeats: 0,
  });

  // Performance Analysis State (On-demand execution)
  const [analysisMode, setAnalysisMode] = useState<'month' | 'range'>('month');
  const [analysisMonth, setAnalysisMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [analysisStartDate, setAnalysisStartDate] = useState('');
  const [analysisEndDate, setAnalysisEndDate] = useState('');
  
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    startDate: string;
    endDate: string;
    periodLabel: string;
    totalBookings: number;
    activeBookings: number;
    refundedBookings: number;
    deactivatedNoRefundBookings: number;
    pendingBookings: number;
    totalCollected: number;
    totalRefunded: number;
    totalOutstanding: number;
    netCollected: number;
    completionRate: number;
    refundRate: number;
    deactivatedRate: number;
    salesBreakdown: {
      salesName: string;
      total: number;
      active: number;
      refunded: number;
      deactivated: number;
      collected: number;
    }[];
  } | null>(null);

  const handleApplyAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      let start = '';
      let end = '';
      let label = '';

      if (analysisMode === 'month') {
        if (!analysisMonth) {
          alert('يرجى تحديد الشهر للتحليل');
          setAnalysisLoading(false);
          return;
        }
        const [yearStr, monthStr] = analysisMonth.split('-');
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        start = `${yearStr}-${monthStr}-01`;
        const lastDayObj = new Date(y, m, 0);
        const lastDayStr = String(lastDayObj.getDate()).padStart(2, '0');
        end = `${yearStr}-${monthStr}-${lastDayStr}`;
        label = `شهر ${monthStr}/${yearStr}`;
      } else {
        if (!analysisStartDate || !analysisEndDate) {
          alert('يرجى تحديد تاريخ البداية والنهاية للتحليل');
          setAnalysisLoading(false);
          return;
        }
        start = analysisStartDate;
        end = analysisEndDate;
        label = `الفترة من ${start} إلى ${end}`;
      }

      // Fetch bookings ONLY on demand when user clicks Apply
      const allBookings = await genericGet<Booking>('bookings');
      
      // Filter bookings created/entered within the specified period
      const periodBookings = allBookings.filter(b => {
        if (b.isDeleted) return false;
        const bDate = (b.bookingDate || b.createdAt || '').split('T')[0];
        if (!bDate) return false;
        return bDate >= start && bDate <= end;
      });

      const totalBookings = periodBookings.length;
      
      const activeBookings = periodBookings.filter(b => 
        b.status === 'ACTIVE'
      ).length;

      const refundedBookings = periodBookings.filter(b => 
        b.status === 'REFUNDED' || ((b.refundedTotal || 0) > 0)
      ).length;

      const deactivatedNoRefundBookings = periodBookings.filter(b => 
        b.status === 'DEACTIVATED' && (!b.refundedTotal || b.refundedTotal === 0)
      ).length;

      const totalCollected = periodBookings.reduce((sum, b) => sum + (b.paymentSummary?.paidTotal || 0), 0);
      const totalRefunded = periodBookings.reduce((sum, b) => sum + (b.refundedTotal || 0), 0);
      const totalOutstanding = periodBookings.reduce((sum, b) => sum + (b.status === 'ACTIVE' ? (b.paymentSummary?.remaining || 0) : 0), 0);
      const netCollected = totalCollected - totalRefunded;

      const completionRate = totalBookings > 0 ? Math.round((activeBookings / totalBookings) * 100) : 0;
      const refundRate = totalBookings > 0 ? Math.round((refundedBookings / totalBookings) * 100) : 0;
      const deactivatedRate = totalBookings > 0 ? Math.round((deactivatedNoRefundBookings / totalBookings) * 100) : 0;

      // Group by Sales Rep
      const salesMap: Record<string, {
        salesName: string;
        total: number;
        active: number;
        refunded: number;
        deactivated: number;
        collected: number;
      }> = {};

      periodBookings.forEach(b => {
        const sName = b.salesName || 'غير محدد';
        if (!salesMap[sName]) {
          salesMap[sName] = { salesName: sName, total: 0, active: 0, refunded: 0, deactivated: 0, collected: 0 };
        }
        salesMap[sName].total += 1;
        salesMap[sName].collected += (b.paymentSummary?.paidTotal || 0);
        
        if (b.status === 'REFUNDED' || (b.refundedTotal && b.refundedTotal > 0)) {
          salesMap[sName].refunded += 1;
        } else if (b.status === 'DEACTIVATED') {
          salesMap[sName].deactivated += 1;
        } else if (b.status === 'ACTIVE') {
          salesMap[sName].active += 1;
        }
      });

      const salesBreakdown = Object.values(salesMap).sort((a, b) => b.total - a.total);

      setAnalysisResult({
        startDate: start,
        endDate: end,
        periodLabel: label,
        totalBookings,
        activeBookings,
        refundedBookings,
        deactivatedNoRefundBookings,
        pendingBookings: totalBookings - (activeBookings + refundedBookings + deactivatedNoRefundBookings),
        totalCollected,
        totalRefunded,
        totalOutstanding,
        netCollected,
        completionRate,
        refundRate,
        deactivatedRate,
        salesBreakdown
      });

    } catch (err) {
      console.error("Error performing period analysis:", err);
      alert("حدث خطأ أثناء جلب وتحليل البيانات.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Listener for Program Subscriptions real-time stats
  useEffect(() => {
    if (!canViewProgramSubs) return;

    const qSubs = query(collection(db, 'customerSubscriptions'), where('status', '==', 'active'));
    const unsubSubs = onSnapshot(qSubs, (snapshot) => {
      let activeCount = snapshot.size;
      let unpaidCount = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.paymentStatus !== 'paid') {
          unpaidCount++;
        }
      });
      setSubStats(prev => ({
        ...prev,
        activeTraineesCount: activeCount,
        unpaidSeatsCount: unpaidCount
      }));
    }, (error) => {
      console.error("Error in customerSubscriptions listener:", error);
    });

    const qAccs = query(collection(db, 'subscriptionAccounts'), where('status', '==', 'active'));
    const unsubAccounts = onSnapshot(qAccs, (snapshot) => {
      let activeAccs = 0;
      let maxSeatsSum = 0;
      let activeSeatsSum = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        activeAccs++;
        maxSeatsSum += (Number(data.maxSeats) || 0);
        activeSeatsSum += (Number(data.activeSeats) || 0);
      });
      setSubStats(prev => ({
        ...prev,
        activeAccountsCount: activeAccs,
        totalMaxSeats: maxSeatsSum,
        totalActiveSeats: activeSeatsSum
      }));
    }, (error) => {
      console.error("Error in subscriptionAccounts listener:", error);
    });

    return () => {
      unsubSubs();
      unsubAccounts();
    };
  }, [canViewProgramSubs]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const aggregated = await getAggregatedStats();
      
      setSalesStats(aggregated.salesStats || []);
      setStats({
        collected: aggregated.collected || 0,
        outstanding: aggregated.outstanding || 0,
        expected: aggregated.expected || 0,
        bookingsCount: aggregated.bookingsCount || 0,
        whatsappPending: aggregated.whatsappPending || 0
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSync = async () => {
    if (!canSyncStats || syncing) return;
    setSyncing(true);
    try {
      await syncAggregatedStats();
      await fetchStats();
      alert('Dashboard stats synchronized successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to sync dashboard stats.');
    } finally {
      setSyncing(false);
    }
  };

  const allCards = [
    { id: 'collected', title: 'collected', value: stats.collected, icon: 'fa-sack-dollar', prefix: 'fas', color: 'text-green-600', bg: 'bg-green-100', permission: 'viewRevenue', isFinancial: true },
    { id: 'outstanding', title: 'outstanding', value: stats.outstanding, icon: 'fa-clock-rotate-left', prefix: 'fas', color: 'text-amber-600', bg: 'bg-amber-100', permission: 'viewRevenue', isFinancial: true },
    { id: 'expected', title: 'expected', value: stats.expected, icon: 'fa-chart-line', prefix: 'fas', color: 'text-primary-600', bg: 'bg-primary-100', permission: 'viewRevenue', isFinancial: true },
    { id: 'wa', title: 'WhatsApp Queue', value: stats.whatsappPending, icon: 'fa-whatsapp', prefix: 'fab', color: 'text-[#25D366]', bg: 'bg-[#25D366]/10', isNumber: true, isWa: true, permission: 'viewDashboard', isFinancial: false },
  ];

  const visibleCards = allCards.filter(card => hasPermission(card.permission as any));

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">{t('dashboard')}</h1>
          <p className="text-gray-500 font-medium">
            {canViewRevenue ? 'Real-time revenue & sales intelligence.' : 'Daily operations & student queue.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canSyncStats && (
            <button 
              onClick={handleSync}
              disabled={syncing}
              className={`flex items-center space-x-2 rtl:space-x-reverse px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${syncing ? 'bg-gray-100 text-gray-400' : 'bg-primary-600 text-white shadow-primary-500/20 hover:bg-primary-700'}`}
            >
              <i className={`fas ${syncing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
              <span>{syncing ? 'Syncing...' : 'Sync Dashboard'}</span>
            </button>
          )}

          {/* Toggle Privacy Mode Button - Only shown if they have revenue permission */}
          {canViewRevenue && (
            <button 
              onClick={() => setShowFinancials(!showFinancials)}
              className={`flex items-center space-x-2 rtl:space-x-reverse px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${showFinancials ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-gray-900 text-white shadow-gray-900/20'}`}
            >
              <i className={`fas ${showFinancials ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              <span>{showFinancials ? 'Hide Stats' : 'Show Stats'}</span>
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${canViewRevenue ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-1 max-w-md'}`}>
        {visibleCards.map((card, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow relative overflow-hidden group">
            {card.isWa && stats.whatsappPending > 0 && (
               <div className="absolute top-0 right-0 p-2">
                 <span className="flex h-2 w-2 relative">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-[#25D366]"></span>
                 </span>
               </div>
            )}
            <div className={`w-12 h-12 ${card.bg} rounded-2xl flex items-center justify-center mb-6`}>
              <i className={`${card.prefix} ${card.icon} text-xl ${card.color}`}></i>
            </div>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{t(card.title as any)}</p>
            
            {/* Conditional Value Masking */}
            <h3 className={`text-3xl font-black mt-1 ${card.isWa && stats.whatsappPending > 0 ? 'text-[#25D366]' : ''}`}>
              {loading ? '...' : (card.isFinancial && !showFinancials) ? '••••••' : (card.isNumber ? card.value : `${card.value.toLocaleString()}`)}
              {!card.isNumber && (!card.isFinancial || showFinancials) && <span className="text-xs ml-1 text-gray-400">EGP</span>}
            </h3>
            
            {card.isWa && (
              <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase tracking-tight">Eligible students awaiting group entry</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Performance - Hidden behind the same toggle for privacy */}
        {canViewRevenue && (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 transition-all">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-black uppercase text-xs tracking-[0.2em] text-gray-500">Top Sales Performance</h3>
              <i className="fas fa-crown text-amber-500"></i>
            </div>
            
            {!showFinancials ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-40">
                <i className="fas fa-lock text-3xl mb-4 text-gray-300"></i>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Financial Data Hidden</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {salesStats.filter(s => s.collected > 0).map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{s.name}</span>
                        {s.reassignedCount > 0 && (
                          <span className="text-[7px] text-amber-500 font-black uppercase tracking-tighter flex items-center gap-1">
                             <i className="fas fa-exchange-alt"></i>
                             Includes {s.reassignedCount} reassigned
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-black text-primary-600">{s.collected.toLocaleString()} EGP</span>
                  </div>
                ))}
                {salesStats.length === 0 && <p className="text-center py-10 text-gray-400 italic">No sales data logged yet.</p>}
              </div>
            )}
          </div>
        )}

        <div className={`${canViewRevenue ? '' : 'lg:col-span-2'} bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700`}>
          <div className="flex justify-between items-center mb-8">
             <h3 className="font-black uppercase text-xs tracking-[0.2em] text-gray-500">Quick System Access</h3>
             {!canViewRevenue && <i className="fas fa-bolt text-primary-600"></i>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {hasPermission('createBookings') && (
              <button 
                onClick={() => navigate('/bookings?action=new')}
                className="p-6 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-300 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-100 transition-all border border-primary-100 dark:border-primary-900 text-center flex flex-col items-center"
              >
                <i className="fas fa-plus mb-3 block text-2xl"></i>
                <span>New Booking</span>
              </button>
            )}
            <button 
              onClick={() => navigate('/bookings')}
              className={`p-6 bg-[#25D366]/5 text-[#25D366] rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#25D366]/10 transition-all border border-[#25D366]/20 text-center flex flex-col items-center ${!hasPermission('createBookings') ? 'col-span-2' : ''}`}
            >
              <i className="fab fa-whatsapp mb-3 block text-2xl"></i>
              <span>WhatsApp Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Program Licensing Dashboard Section */}
      {canViewProgramSubs && (
        <div className="mt-10 bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 text-right" dir="rtl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-cubes text-primary-500"></i>
                <span>متابعة تراخيص البرامج والاشتراكات</span>
              </h3>
              <p className="text-[10px] text-gray-400 mt-1 font-bold">ملخص مباشر لإشغال المقاعد والحسابات والتحصيل المالي في السيستم.</p>
            </div>
            <span className="px-3 py-1 bg-primary-50 dark:bg-primary-950/20 text-primary-600 dark:text-primary-400 rounded-full font-black text-[9px] uppercase tracking-wider">
              مباشر (Live)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {/* Metric 1 */}
            <div className="p-5 rounded-3xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/30 dark:border-blue-900/20">
              <span className="text-[10px] text-blue-500 dark:text-blue-400 font-black block uppercase tracking-wider mb-1">المشتركين النشطين</span>
              <span className="text-2xl font-black text-blue-950 dark:text-white block">{subStats.activeTraineesCount} مشترك</span>
              <span className="text-[9px] text-gray-400 block mt-1 font-bold">يمتلكون مقاعد نشطة في برامج التراخيص</span>
            </div>

            {/* Metric 2 */}
            <div className="p-5 rounded-3xl bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/30 dark:border-amber-900/20">
              <span className="text-[10px] text-amber-500 dark:text-amber-400 font-black block uppercase tracking-wider mb-1">اشتراكات مستحقة التحصيل</span>
              <span className="text-2xl font-black text-amber-950 dark:text-white block">{subStats.unpaidSeatsCount} مقعد غير مسدد</span>
              <span className="text-[9px] text-gray-400 block mt-1 font-bold">تتطلب المتابعة والتحصيل الفوري</span>
            </div>

            {/* Metric 3 */}
            <div className="p-5 rounded-3xl bg-green-50/50 dark:bg-green-950/10 border border-green-100/30 dark:border-green-900/20">
              <span className="text-[10px] text-green-500 dark:text-green-400 font-black block uppercase tracking-wider mb-1">نسبة إشغال المقاعد</span>
              <span className="text-2xl font-black text-green-950 dark:text-white block">
                {subStats.totalMaxSeats > 0 ? Math.round((subStats.totalActiveSeats / subStats.totalMaxSeats) * 100) : 0}%
              </span>
              <span className="text-[9px] text-gray-400 block mt-1 font-bold">
                تم حجز {subStats.totalActiveSeats} من أصل {subStats.totalMaxSeats} مقعد متاح
              </span>
            </div>

            {/* Metric 4 */}
            <div className="p-5 rounded-3xl bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100/30 dark:border-purple-900/20">
              <span className="text-[10px] text-purple-500 dark:text-purple-400 font-black block uppercase tracking-wider mb-1">الحسابات النشطة</span>
              <span className="text-2xl font-black text-purple-950 dark:text-white block">{subStats.activeAccountsCount} حساب</span>
              <span className="text-[9px] text-gray-400 block mt-1 font-bold">حسابات ترخيص رئيسية مفعلة</span>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">روابط الوصول السريع لأقسام التراخيص</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={() => navigate('/program-subscriptions?tab=customers')}
                className="p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-right cursor-pointer flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center shrink-0">
                  <i className="fas fa-users text-xs"></i>
                </div>
                <div>
                  <span className="text-xs font-black block text-gray-950 dark:text-white">مقاعد العملاء</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5 font-bold">توزيع وإدارة المشتركين</span>
                </div>
              </button>

              <button
                onClick={() => navigate('/program-subscriptions?tab=collections')}
                className="p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-right cursor-pointer flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center shrink-0">
                  <i className="fas fa-hand-holding-dollar text-xs"></i>
                </div>
                <div>
                  <span className="text-xs font-black block text-gray-950 dark:text-white">التحصيل والمتابعة</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5 font-bold">الفواتير المعلقة والواتساب</span>
                </div>
              </button>

              <button
                onClick={() => navigate('/program-subscriptions?tab=alerts')}
                className="p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-right cursor-pointer flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                  <i className="fas fa-bell text-xs"></i>
                </div>
                <div>
                  <span className="text-xs font-black block text-gray-950 dark:text-white">الأعطال والتنبيهات</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5 font-bold">تذكيرات وقرب تجديد الحسابات</span>
                </div>
              </button>

              <button
                onClick={() => navigate('/program-subscriptions?tab=reports')}
                className="p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 text-right cursor-pointer flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center shrink-0">
                  <i className="fas fa-chart-bar text-xs"></i>
                </div>
                <div>
                  <span className="text-xs font-black block text-gray-950 dark:text-white">سجل العميل والتقارير</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5 font-bold">سجلات المشتركين والتحليل</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly & Custom Period Performance Analytics Section */}
      <div className="mt-10 bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 text-right" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-chart-pie text-primary-600 dark:text-primary-400"></i>
              <span>تحليل أداء الحجوزات للفترة (Booking Performance Analytics)</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1 font-bold">
              حدد الشهر أو الفترة الزمنية، ثم اضغط على <span className="text-primary-600 font-black">"تطبيق التحليل"</span> لحساب الحجوزات والمستردات والمكتملة.
            </p>
          </div>
          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900 shrink-0 self-start md:self-auto flex items-center gap-1.5">
            <i className="fas fa-shield-alt"></i>
            <span>حساب يدوي (عند الطلب فقط لتقليل القراءات)</span>
          </span>
        </div>

        {/* Filter Controls */}
        <div className="bg-gray-50 dark:bg-gray-750 p-5 rounded-3xl mb-6 border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col md:flex-row items-end gap-4">
            {/* Mode selector */}
            <div className="w-full md:w-auto shrink-0">
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">نوع تحديد الفترة</label>
              <div className="flex gap-1 bg-white dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setAnalysisMode('month')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    analysisMode === 'month'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  تحديد شهر
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode('range')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    analysisMode === 'range'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  فترة مخصصة
                </button>
              </div>
            </div>

            {/* Inputs */}
            {analysisMode === 'month' ? (
              <div className="flex-1 w-full">
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">اختر الشهر والسنة</label>
                <input
                  type="month"
                  value={analysisMonth}
                  onChange={e => setAnalysisMonth(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-primary-500"
                />
              </div>
            ) : (
              <div className="flex-1 w-full flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">من تاريخ</label>
                  <input
                    type="date"
                    value={analysisStartDate}
                    onChange={e => setAnalysisStartDate(e.target.value)}
                    className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">إلى تاريخ</label>
                  <input
                    type="date"
                    value={analysisEndDate}
                    onChange={e => setAnalysisEndDate(e.target.value)}
                    className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl text-xs font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
            )}

            {/* Apply Button */}
            <button
              type="button"
              onClick={handleApplyAnalysis}
              disabled={analysisLoading}
              className="w-full md:w-auto px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-primary-500/20 active:scale-95 flex items-center justify-center gap-2 shrink-0"
            >
              <i className={`fas ${analysisLoading ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
              <span>{analysisLoading ? 'جاري التحليل...' : 'تطبيق التحليل'}</span>
            </button>
          </div>
        </div>

        {/* Empty state / Prompt */}
        {!analysisResult && !analysisLoading && (
          <div className="py-12 text-center bg-gray-50/50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 bg-primary-50 dark:bg-primary-950/40 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-chart-line text-xl"></i>
            </div>
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xs mb-1">تقرير أداء الحجوزات جاهز للطلب</h4>
            <p className="text-[11px] text-gray-400 max-w-md mx-auto">
              حدد الشهر المطلوب من الأعلى ثم اضغط على زر <strong className="text-primary-600">"تطبيق التحليل"</strong> لعرض الإحصائيات التفصيلية.
            </p>
          </div>
        )}

        {/* Results output */}
        {analysisResult && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-primary-50/80 dark:bg-primary-950/30 p-4 rounded-2xl border border-primary-100 dark:border-primary-900">
              <span className="font-black text-xs text-primary-900 dark:text-primary-200 flex items-center gap-2">
                <i className="fas fa-calendar-check text-primary-600"></i>
                <span>تقرير الفترة: {analysisResult.periodLabel}</span>
              </span>
              <span className="text-[10px] text-gray-500 font-bold">
                تاريخ النطاق: {analysisResult.startDate} إلى {analysisResult.endDate}
              </span>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1 */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">إجمالي الحجوزات المدخلة</span>
                <span className="text-3xl font-black text-gray-900 dark:text-white block">{analysisResult.totalBookings}</span>
                <span className="text-[10px] text-gray-400 font-bold block mt-1">حجز جديد في هذه الفترة</span>
              </div>

              {/* Metric 2 */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 shadow-sm bg-gradient-to-b from-emerald-50/30 dark:from-emerald-950/10 to-transparent">
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">حجوزات نشطة / مستمرة</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{analysisResult.activeBookings}</span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">({analysisResult.completionRate}%)</span>
                </div>
                <span className="text-[10px] text-gray-400 font-bold block mt-1">حجز مستمر أو مكتمل بالدورة</span>
              </div>

              {/* Metric 3 */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-red-100 dark:border-red-900/40 shadow-sm bg-gradient-to-b from-red-50/30 dark:from-red-950/10 to-transparent">
                <span className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">ملغاة مع استرداد (REFUNDED)</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-red-600 dark:text-red-400">{analysisResult.refundedBookings}</span>
                  <span className="text-xs font-bold text-red-700 dark:text-red-300">({analysisResult.refundRate}%)</span>
                </div>
                <span className="text-[10px] text-red-500 font-bold block mt-1">إجمالي المسترد: {analysisResult.totalRefunded.toLocaleString()} EGP</span>
              </div>

              {/* Metric 4 */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-amber-100 dark:border-amber-900/40 shadow-sm bg-gradient-to-b from-amber-50/30 dark:from-amber-950/10 to-transparent">
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">ملغاة بدون استرداد (DEACTIVATED)</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{analysisResult.deactivatedNoRefundBookings}</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">({analysisResult.deactivatedRate}%)</span>
                </div>
                <span className="text-[10px] text-gray-400 font-bold block mt-1">إلغاء عادي بدون استرداد مالي</span>
              </div>
            </div>

            {/* Financial Summary */}
            {canViewRevenue && (
              <div className="bg-gray-50 dark:bg-gray-750 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase block">المحصل من حجوزات الفترة</span>
                  <span className="text-xl font-black text-green-600 dark:text-green-400">{analysisResult.totalCollected.toLocaleString()} EGP</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase block">صافي المحصل (بعد خصم المسترد)</span>
                  <span className="text-xl font-black text-primary-600 dark:text-primary-400">{analysisResult.netCollected.toLocaleString()} EGP</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase block">المتبقي المطلوب تحصيله (الحجوزات النشطة)</span>
                  <span className="text-xl font-black text-amber-600 dark:text-amber-400">{analysisResult.totalOutstanding.toLocaleString()} EGP</span>
                </div>
              </div>
            )}

            {/* Sales Breakdown */}
            {analysisResult.salesBreakdown.length > 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h4 className="font-black text-xs uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                  <i className="fas fa-user-check text-primary-500"></i>
                  <span>تفصيل إنجاز موظفي المبيعات للحجوزات المدخلة خلال هذه الفترة</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700 text-[10px] font-black text-gray-400 uppercase">
                        <th className="pb-3">مسؤول المبيعات</th>
                        <th className="pb-3 text-center">إجمالي الحجوزات</th>
                        <th className="pb-3 text-center">نشط (Active)</th>
                        <th className="pb-3 text-center">مسترد (Refund)</th>
                        <th className="pb-3 text-center">ملغي (Deact.)</th>
                        {canViewRevenue && <th className="pb-3 text-left">المحصل</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {analysisResult.salesBreakdown.map((s, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                          <td className="py-3 font-bold text-gray-900 dark:text-white">{s.salesName}</td>
                          <td className="py-3 text-center font-black text-gray-800 dark:text-gray-200">{s.total}</td>
                          <td className="py-3 text-center font-bold text-emerald-600">{s.active}</td>
                          <td className="py-3 text-center font-bold text-red-600">{s.refunded}</td>
                          <td className="py-3 text-center font-bold text-amber-600">{s.deactivated}</td>
                          {canViewRevenue && <td className="py-3 text-left font-black text-primary-600">{s.collected.toLocaleString()} EGP</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
