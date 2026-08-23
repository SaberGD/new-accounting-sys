
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getActivityLogs } from '../services/firestore';
import { ActivityLog as ActivityLogType } from '../types';
import * as XLSX from 'xlsx';

const RescheduledLogs: React.FC = () => {
  const { t, isRTL } = useTheme();
  const { hasPermission } = useAuth();

  if (!hasPermission('viewReschedulingLogs')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6 text-3xl">
          <i className="fas fa-lock"></i>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">You do not have permission to view rescheduling logs.</p>
      </div>
    );
  }

  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [logLimit, setLogLimit] = useState(25);

  // Filter state (Default: Last 30 days)
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 30);
  const [dateFilter, setDateFilter] = useState({ 
    start: defaultStart.toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const fetchData = async (limitCount = logLimit) => {
    setLoading(true);
    try {
      const data = await getActivityLogs(limitCount);
      // Filter for rescheduling actions only
      const reschedulingActions = ['RESCHEDULE_INSTALLMENTS', 'UPDATE_INSTALLMENT_DELAY'];
      const filtered = data.filter(log => reschedulingActions.includes(log.action));
      setLogs(filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } catch (error) {
      console.error("Error fetching rescheduling logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(logLimit);
  }, [logLimit]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase());
      
      const logDate = log.timestamp.split('T')[0];
      const matchesDate = logDate >= dateFilter.start && logDate <= dateFilter.end;

      return matchesSearch && matchesDate;
    });
  }, [logs, searchTerm, dateFilter]);

  const exportToExcel = () => {
    const exportData = filteredLogs.map(log => ({
      'Staff Name': log.userName,
      'Staff Email': log.userId,
      'Student Name': log.clientName || 'N/A',
      'Action': log.action === 'RESCHEDULE_INSTALLMENTS' ? 'Reschedule' : 'Delay Tracker Update',
      'Reason / Details': log.details,
      'Timestamp': new Date(log.timestamp).toLocaleString(isRTL ? 'ar-EG' : 'en-US')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rescheduling Logs");
    XLSX.writeFile(wb, `ReschedulingLogs_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
            <i className="fas fa-calendar-alt text-amber-500"></i>
            {isRTL ? 'سجل إعادة الجدولة' : 'Rescheduling Logs'}
          </h1>
          <p className="text-gray-500 mt-1">{isRTL ? 'متابعة عمليات إعادة جدولة الأقساط وتأخيراتها' : 'Track all installment rescheduling and delay updates'}</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={fetchData}
                className="p-3 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl hover:bg-gray-200 transition-all"
                title="Refresh"
            >
                <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
            </button>
            <button 
                onClick={exportToExcel}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20 active:scale-95 text-sm"
            >
                <i className="fas fa-file-excel"></i>
                {isRTL ? 'تصدير إكسل' : 'Export Excel'}
            </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">{isRTL ? 'بحث سريع' : 'Quick Search'}</label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text"
              placeholder={isRTL ? 'بحث عن موظف، طالب، أو سبب...' : 'Search staff, student, or reason...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm font-medium"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">{isRTL ? 'من تاريخ' : 'From Date'}</label>
          <input 
            type="date"
            value={dateFilter.start}
            onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm font-medium"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">{isRTL ? 'إلى تاريخ' : 'To Date'}</label>
          <input 
            type="date"
            value={dateFilter.end}
            onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm font-medium"
          />
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-3xl border border-amber-100 dark:border-amber-900/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">إجمالي العمليات</p>
            <p className="text-3xl font-black text-amber-700">{filteredLogs.length}</p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-900/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">إعادة جدولة كلية</p>
            <p className="text-3xl font-black text-indigo-700">{filteredLogs.filter(l => l.action === 'RESCHEDULE_INSTALLMENTS').length}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-900/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">تحديث بيانات التأخير</p>
            <p className="text-3xl font-black text-emerald-700">{filteredLogs.filter(l => l.action === 'UPDATE_INSTALLMENT_DELAY').length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto text-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{isRTL ? 'الموظف' : 'Staff Member'}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">{isRTL ? 'نوع العملية' : 'Action Type'}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{isRTL ? 'الطالب' : 'Student'}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{isRTL ? 'السبب والتفاصيل' : 'Reason & Details'}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">{isRTL ? 'الوقت والتاريخ' : 'Timestamp'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px]">{isRTL ? 'جاري استرجاع السجلات...' : 'Retrieving Logs...'}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-gray-300 text-2xl shadow-inner">
                        <i className="fas fa-calendar-times"></i>
                      </div>
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">{isRTL ? 'لا توجد سجلات إعادة جدولة في هذه الفترة' : 'No rescheduling logs found for this period'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-black text-gray-900 dark:text-white uppercase tracking-tight">{log.userName}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{log.userId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${log.action === 'RESCHEDULE_INSTALLMENTS' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {log.action === 'RESCHEDULE_INSTALLMENTS' ? (isRTL ? 'إعادة جدولة' : 'Reschedule') : (isRTL ? 'تأخير' : 'Delay')}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-[10px] font-black group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors uppercase">
                          {log.clientName?.charAt(0)}
                        </div>
                        <span className="font-bold text-gray-700 dark:text-gray-300">{log.clientName || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium italic max-w-md leading-relaxed">
                        {log.details.replace(`Rescheduled installments for ${log.clientName}. Reason: `, '').replace(`Updated delay info and potentially rescheduled installments for ${log.clientName}: Reason: `, '')}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right font-mono text-[10px] text-gray-400">
                      {new Date(log.timestamp).toLocaleString(isRTL ? 'ar-EG' : 'en-GB', { 
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t dark:border-gray-700 flex justify-center bg-gray-50/50 dark:bg-gray-800">
          <button
            onClick={() => setLogLimit(prev => prev + 25)}
            disabled={loading}
            className="px-6 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
            {loading ? 'Loading...' : 'Load More Logs'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RescheduledLogs;
