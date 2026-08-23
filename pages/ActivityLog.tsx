
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getActivityLogs } from '../services/firestore';
import { ActivityLog as ActivityLogType } from '../types';
import * as XLSX from 'xlsx';

const ActivityLog: React.FC = () => {
  const { t, isRTL } = useTheme();
  const { hasPermission } = useAuth();

  if (!hasPermission('viewActivityLog')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6 text-3xl">
          <i className="fas fa-lock"></i>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md">You do not have permission to view the system activity log.</p>
      </div>
    );
  }

  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [logLimit, setLogLimit] = useState(25);

  // Filter state (Default: Today only)
  const [dateFilter, setDateFilter] = useState({ 
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const fetchData = async (limitCount = logLimit) => {
    setLoading(true);
    try {
      const data = await getActivityLogs(limitCount);
      setLogs(data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } catch (error) {
      console.error("Error fetching activity logs:", error);
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
      
      const matchesSection = sectionFilter === 'All' || log.section === sectionFilter;
      
      const logDate = log.timestamp.split('T')[0];
      const matchesDate = logDate >= dateFilter.start && logDate <= dateFilter.end;

      return matchesSearch && matchesSection && matchesDate;
    });
  }, [logs, searchTerm, sectionFilter, dateFilter]);

  const exportToExcel = () => {
    const exportData = filteredLogs.map(log => ({
      'User': log.userName,
      'Email': log.userId,
      'Action': log.action,
      'Section': log.section,
      'Client': log.clientName || 'N/A',
      'Details': log.details,
      'Timestamp': new Date(log.timestamp).toLocaleString(isRTL ? 'ar-EG' : 'en-US')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activity Log");
    XLSX.writeFile(wb, `ActivityLog_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
  };

  const sections = ['All', ...Array.from(new Set(logs.map(l => l.section)))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
            <i className="fas fa-history text-primary"></i>
            {isRTL ? 'سجل النشاطات' : 'Activity Log'}
          </h1>
          <p className="text-gray-500 mt-1">{isRTL ? 'تتبع جميع العمليات التي تمت في النظام' : 'Track all operations performed in the system'}</p>
        </div>
        <button 
          onClick={exportToExcel}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20 active:scale-95"
        >
          <i className="fas fa-file-excel"></i>
          {isRTL ? 'تصدير إكسل' : 'Export Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">{isRTL ? 'بحث' : 'Search'}</label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text"
              placeholder={isRTL ? 'بحث عن مستخدم، عميل، أو تفاصيل...' : 'Search user, client, or details...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-primary transition-all"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">{isRTL ? 'القسم' : 'Section'}</label>
          <select 
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-primary transition-all"
          >
            {sections.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">{isRTL ? 'من تاريخ' : 'From Date'}</label>
          <input 
            type="date"
            value={dateFilter.start}
            onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-primary transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">{isRTL ? 'إلى تاريخ' : 'To Date'}</label>
          <input 
            type="date"
            value={dateFilter.end}
            onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'المستخدم' : 'User'}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'العملية' : 'Action'}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'القسم' : 'Section'}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'العميل' : 'Client'}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'التفاصيل' : 'Details'}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-400">{isRTL ? 'التاريخ والوقت' : 'Timestamp'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-gray-400 font-medium">{isRTL ? 'جاري تحميل السجلات...' : 'Loading logs...'}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900/50 rounded-full flex items-center justify-center text-gray-300 text-2xl">
                        <i className="fas fa-search"></i>
                      </div>
                      <p className="text-gray-400 font-medium">{isRTL ? 'لا توجد سجلات مطابقة' : 'No matching logs found'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 dark:text-white">{log.userName}</span>
                        <span className="text-xs text-gray-400">{log.userId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{log.section}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{log.clientName || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate group-hover:max-w-none group-hover:whitespace-normal transition-all">
                        {log.details}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-right">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {new Date(log.timestamp).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(log.timestamp).toLocaleTimeString(isRTL ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
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

export default ActivityLog;
