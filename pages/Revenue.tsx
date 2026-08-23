
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericGetQuery } from '../services/firestore';
import { Payment, Booking, Group, Course, Diploma, Refund, SalesStaff } from '../types';
import { where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const Revenue: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;

  if (!hasPermission('viewRevenue')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6 text-3xl">
          <i className="fas fa-lock"></i>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">You do not have permission to view revenue reports or financial data.</p>
      </div>
    );
  }
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [dateFilter, setDateFilter] = useState({ 
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [selectedSalesId, setSelectedSalesId] = useState<string>('all');
  
  // Dual Targets
  const [manualCollectedTarget, setManualCollectedTarget] = useState<number>(0);
  const [manualExpectedTarget, setManualExpectedTarget] = useState<number>(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [b, p, r, g, crs, d, s] = await Promise.all([
        genericGetQuery<Booking>('bookings', [
          where('bookingDate', '>=', dateFilter.start),
          where('bookingDate', '<=', dateFilter.end)
        ]),
        genericGetQuery<Payment>('payments', [
          where('paymentDate', '>=', dateFilter.start),
          where('paymentDate', '<=', dateFilter.end)
        ]),
        genericGetQuery<Refund>('refunds', [
          where('refundDate', '>=', dateFilter.start),
          where('refundDate', '<=', dateFilter.end)
        ]),
        genericGet<Group>('groups'),
        genericGet<Course>('catalog_courses'),
        genericGet<Diploma>('catalog_diplomas'),
        genericGet<SalesStaff>('sales_staff')
      ]);

      // If there are additional payments/refunds for these bookings paid outside date range, we can also fetch payments for these bookingIds
      const bookingIds = b.map(item => item.id);
      let extraPayments: Payment[] = [];
      let extraRefunds: Refund[] = [];

      if (bookingIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < bookingIds.length; i += 30) {
          chunks.push(bookingIds.slice(i, i + 30));
        }
        const [bPayments, bRefunds] = await Promise.all([
          Promise.all(chunks.map(chunk => genericGetQuery<Payment>('payments', [where('bookingId', 'in', chunk)]))),
          Promise.all(chunks.map(chunk => genericGetQuery<Refund>('refunds', [where('bookingId', 'in', chunk)])))
        ]);
        extraPayments = bPayments.flat();
        extraRefunds = bRefunds.flat();
      }

      // Merge and deduplicate
      const paymentMap = new Map<string, Payment>();
      p.concat(extraPayments).forEach(item => paymentMap.set(item.id, item));

      const refundMap = new Map<string, Refund>();
      r.concat(extraRefunds).forEach(item => refundMap.set(item.id, item));

      setBookings(b);
      setPayments(Array.from(paymentMap.values()));
      setRefunds(Array.from(refundMap.values()));
      setGroups(g);
      setCourses(crs);
      setDiplomas(d);
      setSalesStaff(s);
    } catch (err) {
      console.error("Error fetching Revenue data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!hasPermission('viewAllBookings') && salesStaff.length > 0) {
      const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);
      if (linkedStaff) {
        setSelectedSalesId(linkedStaff.id);
      }
    }
  }, [salesStaff, userProfile, hasPermission]);

  const getStats = () => {
    // 1. الفلترة الأساسية بناءً على تاريخ الحجز (Booking Date)
    const filteredByDateBookings = bookings.filter(b => 
      !b.isDeleted &&
      b.bookingDate >= dateFilter.start && 
      b.bookingDate <= dateFilter.end
    );

    // 2. تطبيق فلتر موظف المبيعات إذا تم اختياره
    const targetBookings = selectedSalesId === 'all' 
      ? filteredByDateBookings 
      : filteredByDateBookings.filter(b => b.salesId === selectedSalesId);
    
    const targetBookingIds = new Set(targetBookings.map(b => b.id));

    // 3. المحصل: نجمع كل المدفوعات المرتبطة بهذه الحجوزات (بصرف النظر عن تاريخ الدفعة نفسه)
    // لأن المستخدم يريد معرفة "كم حصلنا من مبيعات هذه الفترة"
    const relevantPayments = payments.filter(p => 
      !p.isDeleted && 
      targetBookingIds.has(p.bookingId)
    );
    
    const relevantRefunds = refunds.filter(r => 
      !r.isDeleted && 
      !(r as any).isReversed &&
      targetBookingIds.has(r.bookingId)
    );
    
    const collectedAmount = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
    const refundedAmount = relevantRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
    const netCollected = collectedAmount - refundedAmount;

    // 4. المتوقع: إجمالي قيم العقود لهذه الحجوزات (التي ليست منح)
    const filteredActiveBookings = targetBookings.filter(b => 
      !b.pricing.isScholarship &&
      b.status !== 'DELETED'
    );
    
    const expected = filteredActiveBookings.reduce((sum, b) => sum + b.pricing.finalPriceSnapshot, 0);
    const outstanding = filteredActiveBookings.reduce((sum, b) => {
        // إذا كان الحجز ملغي أو مسترد، فالمتبقي عليه فعلياً 0
        if (b.status === 'DEACTIVATED' || b.status === 'REFUNDED') return sum;
        return sum + b.paymentSummary.remaining;
    }, 0);

    return { 
      collected: netCollected, 
      outstanding, 
      expected, 
      bookingsCount: targetBookings.length 
    };
  };

  const { collected, outstanding, expected, bookingsCount } = getStats();

  const getSalesSummary = () => {
    const summary: Record<string, { 
      name: string, 
      collected: number, 
      expected: number, 
      expectedPure: number,
      count: number,
      reassignedCount: number 
    }> = {};
    
    salesStaff.forEach(s => {
      summary[s.id] = { name: s.fullName, collected: 0, expected: 0, expectedPure: 0, count: 0, reassignedCount: 0 };
    });

    // نمر على الحجوزات التي تقع في الفترة المختارة
    bookings.forEach(b => {
      if (b.isDeleted || !b.salesId) return;
      if (!summary[b.salesId]) summary[b.salesId] = { name: b.salesName || 'Unknown', collected: 0, expected: 0, expectedPure: 0, count: 0, reassignedCount: 0 };
      
      const isWithinPeriod = b.bookingDate >= dateFilter.start && b.bookingDate <= dateFilter.end;
      
      if (isWithinPeriod) {
        summary[b.salesId].count += 1;
        if (b.salesReassigned) {
          summary[b.salesId].reassignedCount += 1;
        }
        if (!b.pricing.isScholarship) {
            summary[b.salesId].expected += b.pricing.finalPriceSnapshot;
            if (!b.salesReassigned) {
              summary[b.salesId].expectedPure += b.pricing.finalPriceSnapshot;
            }
        }

        // نجمع المحصل لهذا الحجز تحديداً وننسبه لموظف المبيعات الذي أغلقه
        const bPayments = payments.filter(p => !p.isDeleted && p.bookingId === b.id);
        const bRefunds = refunds.filter(r => !r.isDeleted && !(r as any).isReversed && r.bookingId === b.id);
        
        const bCollected = bPayments.reduce((sum, p) => sum + p.amount, 0) - bRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
        summary[b.salesId].collected += bCollected;
      }
    });

    return Object.entries(summary)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.expectedPure - a.expectedPure);
  };

  const salesSummaryData = getSalesSummary();

  const handleExportReport = () => {
    let reportRows = [];
    
    if (selectedSalesId === 'all') {
      reportRows = salesSummaryData
        .filter(s => s.count > 0 || s.collected !== 0 || s.expected !== 0)
        .map(item => ({
          'Start Date': dateFilter.start,
          'End Date': dateFilter.end,
          'Sales Representative': item.name,
          'New Books (In Period)': item.count,
          'Pure Sales (No Reassign)': item.expectedPure,
          'Total Sales (Expected)': item.expected,
          'Collected So Far (From these Books)': item.collected,
          'Achievement %': manualExpectedTarget > 0 ? `${Math.round((item.expected / manualExpectedTarget) * 100)}%` : '0%'
        }));
    } else {
      const staff = salesStaff.find(s => s.id === selectedSalesId);
      reportRows = [{
        'Start Date': dateFilter.start,
        'End Date': dateFilter.end,
        'Sales Representative': staff?.fullName || 'Selected Rep',
        'New Books': bookingsCount,
        'Collected (Accrued)': collected,
        'Expected (Revenue)': expected
      }];
    }

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue Report");
    const filename = `Sales_Accrual_Report_${dateFilter.start}_to_${dateFilter.end}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const getAchievementUI = (actual: number, target: number) => {
    const achievementPercent = target > 0 ? Math.round((actual / target) * 100) : 0;
    
    let barColor = "bg-gray-200";
    let textColor = "text-gray-400";
    
    if (target > 0) {
        barColor = "bg-red-500";
        textColor = "text-red-500";
        if (achievementPercent >= 100) { barColor = "bg-purple-600"; textColor = "text-purple-600"; }
        else if (achievementPercent >= 90) { barColor = "bg-green-500"; textColor = "text-green-500"; }
        else if (achievementPercent >= 50) { barColor = "bg-amber-500"; textColor = "text-amber-500"; }
    }

    return (
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                    className={`${barColor} h-full transition-all duration-700`} 
                    style={{ width: `${Math.min(100, achievementPercent)}%` }}
                ></div>
            </div>
            <span className={`text-[9px] font-black min-w-[30px] text-right ${textColor}`}>{achievementPercent}%</span>
        </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2">Revenue & Sales Accrual</h1>
          <p className="text-gray-500 font-medium">Reports are filtered based on <span className="text-primary-600 font-bold">Booking Date</span> (The date assigned to the student).</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/10 px-4 py-2 rounded-2xl border border-amber-100 dark:border-amber-800/30 flex items-center gap-2">
           <i className="fas fa-info-circle text-amber-600"></i>
           <span className="text-[10px] font-bold text-amber-700 uppercase">Cohort Mode Active</span>
        </div>
      </div>

      {/* Filter & Target Bar */}
      <div className="flex flex-wrap gap-4 mb-8 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Booking Date From</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border border-transparent focus:border-primary-500 text-sm font-bold" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Booking Date To</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border border-transparent focus:border-primary-500 text-sm font-bold" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Sales Rep</label>
          <select 
            disabled={!hasPermission('viewAllBookings')}
            className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border border-transparent focus:border-primary-500 font-bold text-sm disabled:opacity-50" 
            value={selectedSalesId} 
            onChange={e => setSelectedSalesId(e.target.value)}
          >
            <option value="all">{t('allSales')}</option>
            {salesStaff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        </div>
        
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-black text-green-600 mb-2 uppercase tracking-widest font-bold">Target: Collected</label>
          <input type="number" className="w-full p-3 bg-green-50 dark:bg-green-900/10 text-green-700 rounded-xl outline-none border-2 border-green-100 dark:border-green-900/30 font-black text-sm" value={manualCollectedTarget} onChange={e => setManualCollectedTarget(Number(e.target.value))} />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] font-black text-primary-500 mb-2 uppercase tracking-widest font-bold">Target: Sales (Expected)</label>
          <input type="number" className="w-full p-3 bg-primary-50 dark:bg-primary-900/10 text-primary-600 rounded-xl outline-none border-2 border-primary-100 dark:border-primary-900/30 font-black text-sm" value={manualExpectedTarget} onChange={e => setManualExpectedTarget(Number(e.target.value))} />
        </div>

        <div className="flex gap-2">
          <button onClick={fetchData} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-black transition-all text-sm uppercase tracking-widest">Apply</button>
          <button onClick={handleExportReport} className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all text-sm uppercase tracking-widest flex items-center gap-2">
            <i className="fas fa-file-excel"></i>
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expected Revenue (Sales)</p>
          <h2 className="text-2xl font-black text-primary-600">{expected.toLocaleString()} <span className="text-xs">EGP</span></h2>
          <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase">Total value of bookings made in period</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Collected So Far</p>
          <h2 className="text-2xl font-black text-green-600">{collected.toLocaleString()} <span className="text-xs">EGP</span></h2>
          <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase">Total payments from the above bookings</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Still Outstanding</p>
          <h2 className="text-2xl font-black text-amber-600">{outstanding.toLocaleString()} <span className="text-xs">EGP</span></h2>
          <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase">Remaining for current active cohort</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bookings Count</p>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">{bookingsCount} <span className="text-xs">RECORDS</span></h2>
          <p className="text-[9px] text-gray-400 mt-2 font-bold uppercase">New students in selected period</p>
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-10">
        <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20 flex justify-between items-center">
          <h3 className="font-black uppercase text-xs tracking-[0.2em] text-gray-500">Sales Achievement Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Sales Representative</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-gray-400 text-center">Books</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-indigo-400" title="Expected revenue from original non-reassigned bookings">Sales (Pure)</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-primary-400" title="Total expected revenue including reassigned bookings">Sales (Total)</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-gray-400" style={{ width: '180px' }}>Achievement</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Collected (So Far)</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-gray-400" style={{ width: '180px' }}>Collection %</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {salesSummaryData.filter(s => s.count > 0 || s.collected !== 0 || s.expected !== 0).map(item => (
                <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-6 py-4"><p className="font-bold text-sm">{item.name}</p></td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-black text-gray-500 text-xs">{item.count}</span>
                      {item.reassignedCount > 0 && (
                        <span className="text-[8px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-bold mt-1 border border-amber-100 flex items-center gap-1" title={`${item.reassignedCount} of these bookings were reassigned from other sales reps`}>
                          <i className="fas fa-exchange-alt text-[7px]"></i>
                          {item.reassignedCount} reassigned
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-black text-indigo-600 text-sm">{item.expectedPure.toLocaleString()}</td>
                  <td className="px-6 py-4 font-black text-primary-600 text-sm">
                    <div className="flex flex-col">
                      <span>{item.expected.toLocaleString()}</span>
                      {item.reassignedCount > 0 && (
                        <span className="text-[8px] text-gray-400 font-bold">
                          incl. {(item.expected - item.expectedPure).toLocaleString()} reassigned
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">{getAchievementUI(item.expected, manualExpectedTarget)}</td>
                  <td className="px-6 py-4 font-black text-green-600 text-sm">{item.collected.toLocaleString()}</td>
                  <td className="px-6 py-4">{getAchievementUI(item.collected, manualCollectedTarget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Revenue;
