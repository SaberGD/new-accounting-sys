import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { AuditLog } from './types';

interface AuditLogTabProps {
  logs: AuditLog[];
  loading: boolean;
}

export function AuditLogTab({ logs, loading }: AuditLogTabProps) {
  const lang = 'ar';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-black text-gray-900 dark:text-white">
          {lang === 'ar' ? 'سجل الأمان والعمليات الحساسة' : 'Security Operations Audit Log'}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {lang === 'ar' ? 'سجل كامل وغير قابل للتعديل للعمليات الحساسة مثل عرض كلمات المرور، تعديل الحسابات، وتوزيع التراخيص.' : 'A read-only immutable log of sensitive credential accesses, seat assignments, and account updates.'}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-gray-400 font-bold">
          {lang === 'ar' ? 'جاري تحميل سجل الأمان...' : 'Loading safety log...'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'التوقيت' : 'Timestamp'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'نوع العملية' : 'Action Event'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'التفاصيل' : 'Log Description'}</th>
                  <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'المسؤول' : 'Performed By'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                    <td className="p-4 font-mono font-bold text-gray-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        log.action === 'PASSWORD_VIEWED'
                          ? 'bg-red-50 text-red-600 dark:bg-red-950/20'
                          : log.action.includes('CREATED') || log.action.includes('ASSIGNED')
                          ? 'bg-green-50 text-green-600 dark:bg-green-950/20'
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-gray-700 dark:text-gray-300">
                      {log.description}
                    </td>
                    <td className="p-4 text-right font-bold text-gray-900 dark:text-white">
                      {log.performedBy || 'System Staff'}
                    </td>
                  </tr>
                ))}

                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-xs text-gray-400 font-bold">
                      {lang === 'ar' ? 'لا يوجد سجلات أمان مسجلة بعد.' : 'No security logs recorded yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
