
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericGetQuery } from '../services/firestore';
import { Payment, Booking, Refund, SalesStaff, Customer } from '../types';
import { where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const CashFlow: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;

  if (!hasPermission('viewCashFlow')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6 text-3xl">
          <i className="fas fa-lock"></i>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">You do not have permission to view cash flow reports or financial movement data.</p>
      </div>
    );
  }
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state (Default: Today only)
  const [dateFilter, setDateFilter] = useState({ 
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, r, s] = await Promise.all([
        genericGetQuery<Payment>('payments', [
          where('paymentDate', '>=', dateFilter.start),
          where('paymentDate', '<=', dateFilter.end)
        ]),
        genericGetQuery<Refund>('refunds', [
          where('refundDate', '>=', dateFilter.start),
          where('refundDate', '<=', dateFilter.end)
        ]),
        genericGet<SalesStaff>('sales_staff')
      ]);

      setPayments(p);
      setRefunds(r);
      setSalesStaff(s);

      // Extract unique bookingIds and customerIds
      const bookingIds = Array.from(new Set([
        ...p.map(item => item.bookingId),
        ...r.map(item => item.bookingId)
      ].filter(Boolean)));

      const customerIds = Array.from(new Set([
        ...p.map(item => item.customerId),
        ...r.map(item => (item as any).customerId)
      ].filter(Boolean)));

      let bList: Booking[] = [];
      let cList: Customer[] = [];

      // Batch query related bookings and customers if any exist
      if (bookingIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < bookingIds.length; i += 30) {
          chunks.push(bookingIds.slice(i, i + 30));
        }
        const bDocs = await Promise.all(
          chunks.map(chunk => genericGetQuery<Booking>('bookings', [where('id', 'in', chunk)]))
        );
        bList = bDocs.flat();
      }

      if (customerIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < customerIds.length; i += 30) {
          chunks.push(customerIds.slice(i, i + 30));
        }
        const cDocs = await Promise.all(
          chunks.map(chunk => genericGetQuery<Customer>('customers', [where('id', 'in', chunk)]))
        );
        cList = cDocs.flat();
      }

      setBookings(bList);
      setCustomers(cList);
    } catch (err) {
      console.error("Error fetching CashFlow data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    // فلترة المدفوعات بناءً على تاريخ الدفع الفعلي
    const filteredPayments = payments.filter(p => 
      !p.isDeleted && 
      p.paymentDate >= dateFilter.start && 
      p.paymentDate <= dateFilter.end
    );

    // فلترة المرتجعات بناءً على تاريخ الاسترداد الفعلي
    const filteredRefunds = refunds.filter(r => 
      !r.isDeleted && 
      !(r as any).isReversed &&
      r.refundDate >= dateFilter.start && 
      r.refundDate <= dateFilter.end
    );

    // تجميع الحركات المالية حسب الموظف (بناءً على الحجز المرتبط بالدفعة)
    const repStats: Record<string, { name: string, total: number, count: number }> = {};
    salesStaff.forEach(s => repStats[s.id] = { name: s.fullName, total: 0, count: 0 });

    const linkedStaff = !hasPermission('viewAllBookings') ? salesStaff.find(s => s.userId === userProfile?.uid) : null;

    filteredPayments.forEach(p => {
      const b = bookings.find(bk => bk.id === p.bookingId);
      if (b && b.salesId && repStats[b.salesId]) {
        // If not viewAllBookings, only include if it's their own booking
        if (linkedStaff && b.salesId !== linkedStaff.id) return;
        
        repStats[b.salesId].total += p.amount;
        repStats[b.salesId].count += 1;
      }
    });

    // Filter refunds too if needed, but usually refunds are admin-only
    const finalRefunds = linkedStaff 
      ? filteredRefunds.filter(r => {
          const b = bookings.find(bk => bk.id === r.bookingId);
          return b && b.salesId === linkedStaff.id;
        })
      : filteredRefunds;

    const totalIn = filteredPayments.reduce((sum, p) => {
      if (linkedStaff) {
        const b = bookings.find(bk => bk.id === p.bookingId);
        if (!b || b.salesId !== linkedStaff.id) return sum;
      }
      return sum + p.amount;
    }, 0);
    
    const totalOut = finalRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
    const net = totalIn - totalOut;

    // تجميع حسب وسيلة الدفع
    const methodStats: Record<string, number> = {};
    filteredPayments.forEach(p => {
      if (linkedStaff) {
        const b = bookings.find(bk => bk.id === p.bookingId);
        if (!b || b.salesId !== linkedStaff.id) return;
      }
      methodStats[p.method] = (methodStats[p.method] || 0) + p.amount;
    });

    return { 
      totalIn, 
      totalOut, 
      net, 
      repStats: Object.values(repStats).filter(r => r.total > 0).sort((a,b) => b.total - a.total),
      methodStats,
      transactions: [
        ...filteredPayments.filter(p => {
          if (linkedStaff) {
            const b = bookings.find(bk => bk.id === p.bookingId);
            return b && b.salesId === linkedStaff.id;
          }
          return true;
        }).map(p => ({ ...p, type: 'IN' as const })),
        ...finalRefunds.map(r => ({ ...r, type: 'OUT' as const, amount: r.refundAmount, paymentDate: r.refundDate }))
      ].sort((a,b) => b.paymentDate?.localeCompare(a.paymentDate || '') || 0)
    };
  }, [payments, refunds, bookings, dateFilter, salesStaff]);

  const handleExport = () => {
    const data = stats.transactions.map(t => {
      const b = bookings.find(bk => bk.id === (t as any).bookingId);
      const c = customers.find(cust => cust.id === (t as any).customerId);
      return {
        'Date': (t as any).paymentDate || (t as any).refundDate,
        'Type': t.type,
        'Student': c?.name || 'N/A',
        'Amount': t.amount,
        'Method': t.method,
        'Reference': t.transactionRef || '-',
        'Sales Rep': b?.salesName || 'N/A',
        'Note': (t as any).note || (t as any).reason || ''
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Flow");
    XLSX.writeFile(workbook, `CashFlow_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2 uppercase tracking-tight">{t('cashFlow')}</h1>
          <p className="text-gray-500 font-medium">Actual cash movement based on <span className="text-green-600 font-bold">Payment Date</span>.</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4 mb-8 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Period From</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border border-transparent focus:border-primary-500 text-sm font-bold" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Period To</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none border border-transparent focus:border-primary-500 text-sm font-bold" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} />
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-black transition-all text-sm">Apply Filter</button>
          <button onClick={handleExport} className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 text-sm uppercase">
            <i className="fas fa-file-excel"></i> Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Collected (Cash In)</p>
          <h2 className="text-3xl font-black text-green-600">{stats.totalIn.toLocaleString()} <span className="text-xs">EGP</span></h2>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Refunds (Cash Out)</p>
          <h2 className="text-3xl font-black text-red-500">{stats.totalOut.toLocaleString()} <span className="text-xs">EGP</span></h2>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-primary-100 dark:border-primary-900">
          <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1">Net Cash Movement</p>
          <h2 className="text-3xl font-black text-primary-600">{stats.net.toLocaleString()} <span className="text-xs">EGP</span></h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Cash Breakdown */}
        <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-black uppercase text-[10px] tracking-widest text-gray-400 mb-6">Collections By Rep</h3>
                <div className="space-y-4">
                    {stats.repStats.map(r => (
                        <div key={r.name} className="flex justify-between items-center">
                            <div>
                                <p className="font-bold text-sm">{r.name}</p>
                                <p className="text-[9px] text-gray-400 uppercase font-black">{r.count} Payments</p>
                            </div>
                            <span className="font-black text-green-600">{r.total.toLocaleString()}</span>
                        </div>
                    ))}
                    {stats.repStats.length === 0 && <p className="text-center py-4 text-gray-400 italic text-xs">No collections in this period.</p>}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-black uppercase text-[10px] tracking-widest text-gray-400 mb-6">By Payment Method</h3>
                <div className="space-y-4">
                    {Object.entries(stats.methodStats).map(([method, amount]) => (
                        <div key={method} className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-600 uppercase">{t(method as any)}</span>
                            <span className="font-black text-gray-900 dark:text-white">{amount.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Transaction List */}
        <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20">
                    <h3 className="font-black uppercase text-xs tracking-widest text-gray-500">Transaction History (Period)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left rtl:text-right">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-4 font-black text-[9px] uppercase text-gray-400">Date</th>
                                <th className="px-6 py-4 font-black text-[9px] uppercase text-gray-400">Student</th>
                                <th className="px-6 py-4 font-black text-[9px] uppercase text-gray-400 text-center">Type</th>
                                <th className="px-6 py-4 font-black text-[9px] uppercase text-gray-400">Method</th>
                                <th className="px-6 py-4 font-black text-[9px] uppercase text-gray-400 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {stats.transactions.map((t, idx) => {
                                const c = customers.find(cust => cust.id === (t as any).customerId);
                                return (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-[11px] font-bold text-gray-500">{(t as any).paymentDate || (t as any).refundDate}</td>
                                        <td className="px-6 py-4 text-xs font-bold">{c?.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${t.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span>
                                        </td>
                                        <td className="px-6 py-4 text-[10px] font-medium text-gray-400 uppercase tracking-tighter">{(t as any).method?.replace('_',' ')}</td>
                                        <td className={`px-6 py-4 text-right font-black text-sm ${t.type === 'IN' ? 'text-green-600' : 'text-red-500'}`}>{t.type === 'OUT' ? '-' : ''}{t.amount.toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                            {stats.transactions.length === 0 && (
                                <tr><td colSpan={5} className="py-20 text-center text-gray-400 italic text-sm">No cash movements recorded in this period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CashFlow;
