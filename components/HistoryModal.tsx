import React, { useState, useEffect } from 'react';
import { Booking, BookingLog, Customer, UserProfile } from '../types';
import { getBookingLogs, genericGet, rollbackBookingAction } from '../services/firestore';
import { useAuth } from '../contexts/AuthContext';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  customers: Customer[];
  onDataChanged?: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, booking, customers, onDataChanged }) => {
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [logs, setLogs] = useState<BookingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [confirmReversal, setConfirmReversal] = useState<BookingLog | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && booking) {
      fetchLogs();
      fetchUsers();
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, booking]);

  const fetchUsers = async () => {
    try {
      const users = await genericGet<UserProfile>('users');
      const map: Record<string, string> = {};
      users.forEach(u => {
        if (u.uid && u.displayName) {
          map[u.uid] = u.displayName;
        }
      });
      setUserMap(map);
    } catch (err) {
      console.error("Error fetching users for log resolution:", err);
    }
  };

  const fetchLogs = async () => {
    if (!booking) return;
    setLoading(true);
    try {
      const data = await getBookingLogs(booking.id);
      setLogs(data);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (log: BookingLog) => {
    if (!booking) return;
    setReversingId(log.id);
    setErrorMessage(null);
    try {
      const performer = { 
        name: userProfile?.displayName || 'Unknown', 
        email: userProfile?.email || '' 
      };
      
      await rollbackBookingAction(booking.id, log.id, performer);
      
      setSuccessMessage(`تم التراجع عن حركة (${getActionLabel(log.action)}) بنجاح واستعادة حالة العميل.`);
      setConfirmReversal(null);
      await fetchLogs();
      if (onDataChanged) {
        onDataChanged();
      }
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("Error during rollback:", err);
      setErrorMessage(`تعذر التراجع: ${err.message || 'حدث خطأ غير متوقع'}`);
    } finally {
      setReversingId(null);
    }
  };

  if (!isOpen) return null;

  const customerName = customers.find(c => c.id === booking?.customerId)?.name || 'Unknown';

  const resolvePerformer = (performer: string | undefined) => {
    if (!performer) return 'النظام (System)';
    if (userMap[performer]) return userMap[performer];
    return performer;
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'CREATED': return 'إنشاء الحجز الأول';
      case 'PAYMENT': return 'استلام دفعة / قسط';
      case 'COMPLETION_PAYMENT': return 'دفعة استكمال البداية';
      case 'REFUNDED': return 'استرداد / خصم مالي';
      case 'UPDATED': return 'تعديل بيانات الحجز / العميل';
      case 'ASSIGNED':
      case 'GROUP_ASSIGNED': return 'تسكين / تغيير المجموعة';
      case 'RESCHEDULED': return 'إعادة جدولة الأقساط';
      case 'PLAN_UPDATED': return 'تعديل خطة الأقساط';
      case 'DEACTIVATED': return 'إلغاء تفعيل الحجز';
      case 'RESTORED': return 'استعادة الحجز الملغي';
      case 'PAYMENT_REVERSED': return 'إلغاء دفعة سابقة';
      case 'REFUND_REVERSED': return 'إلغاء استرداد سابق';
      case 'ACTION_REVERSED': return 'تراجع عن حركة سابقة';
      default: return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200';
      case 'PAYMENT':
      case 'COMPLETION_PAYMENT': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200';
      case 'REFUNDED': return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200';
      case 'UPDATED': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200';
      case 'ASSIGNED':
      case 'GROUP_ASSIGNED': return 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200';
      case 'RESCHEDULED': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200';
      case 'DEACTIVATED': return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200';
      case 'RESTORED': return 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200';
      case 'ACTION_REVERSED':
      case 'PAYMENT_REVERSED':
      case 'REFUND_REVERSED': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300';
      default: return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATED': return 'fa-plus-circle';
      case 'PAYMENT':
      case 'COMPLETION_PAYMENT': return 'fa-money-bill-wave';
      case 'REFUNDED': return 'fa-undo';
      case 'UPDATED': return 'fa-edit';
      case 'ASSIGNED':
      case 'GROUP_ASSIGNED': return 'fa-users';
      case 'RESCHEDULED': return 'fa-calendar-alt';
      case 'PLAN_UPDATED': return 'fa-tasks';
      case 'DEACTIVATED': return 'fa-ban';
      case 'RESTORED': return 'fa-check-circle';
      case 'ACTION_REVERSED':
      case 'PAYMENT_REVERSED':
      case 'REFUND_REVERSED': return 'fa-history';
      default: return 'fa-info-circle';
    }
  };

  const isRollbackable = (log: BookingLog) => {
    if (log.details?.isReversed) return false;
    // Audit records of reversals shouldn't be reversed directly
    if (log.action === 'ACTION_REVERSED' || log.action === 'PAYMENT_REVERSED' || log.action === 'REFUND_REVERSED') return false;
    // Check user permissions
    return hasPermission('reverseActions') || userProfile?.role === 'admin' || userProfile?.role === 'supervisor' || userProfile?.role === 'manager';
  };

  const getRollbackExplanation = (log: BookingLog) => {
    switch (log.action) {
      case 'PAYMENT':
      case 'COMPLETION_PAYMENT':
        return `سيتم إلغاء هذه الدفعة بقيمة ${log.details?.amount || 0} ج.م، وإعادة المبلغ المتبقي على العميل وتعديل حالة القسط المرتبط إلى مستحق، مع تحديث الإحصائيات المالية.`;
      case 'REFUNDED':
        return `سيتم إلغاء هذا الاسترداد بقيمة ${log.details?.refundAmount || log.details?.amount || 0} ج.م وإعادة المبلغ إلى حساب العميل مع إعادة تفعيل الأقساط الملغاة.`;
      case 'UPDATED':
        return 'سيتم التراجع عن التعديلات التي تمت على بيانات الحجز أو العميل أو الديبوزيت واستعادة نقطة الحفظ السابقة.';
      case 'ASSIGNED':
      case 'GROUP_ASSIGNED':
        return 'سيتم التراجع عن تسكين أو تغيير المجموعة وإعادة الطالب إلى حالته ومجموعته وجدولته السابقة.';
      case 'RESCHEDULED':
        return 'سيتم إلغاء الجدولة الحالية واستعادة مواعيد وقيم الأقساط كما كانت قبل عملية إعادة الجدولة.';
      case 'DEACTIVATED':
        return 'سيتم إعادة تفعيل الحجز (Active) واستعادة الأقساط الملغاة والمبلغ المتبقي وحالة الواتساب.';
      case 'RESTORED':
        return 'سيتم التراجع عن استعادة الحجز وإعادته إلى قائمة الحجوزات الملغاة.';
      case 'PLAN_UPDATED':
        return 'سيتم استعادة خطة الأقساط السابقة كما كانت قبل التعديل.';
      case 'CREATED':
        return 'سيتم استعادة الحالة الأولية للحجز عند الإنشاء.';
      default:
        return 'سيتم التراجع عن هذه الحركة واستعادة حالة العميل والحجز كما كانت قبل تنفيذها.';
    }
  };

  const handlePrintSummary = () => {
    if (!booking || logs.length === 0) return;
    const w = window.open('', '_blank');
    if (!w) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>سجل حركات العميل - ${customerName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; direction: rtl; }
            .header { border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 24px; font-weight: bold; color: #4f46e5; }
            .customer-info { margin-bottom: 30px; background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; }
            .log-item { border-bottom: 1px solid #e5e7eb; padding: 15px 0; }
            .log-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .action-tag { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; background: #eef2ff; color: #4f46e5; display: inline-block; }
            .timestamp { font-size: 11px; color: #6b7280; direction: ltr; }
            .description { font-size: 14px; font-weight: 600; margin: 8px 0; color: #111827; }
            .details { font-size: 12px; color: #4b5563; background: #f3f4f6; padding: 12px; border-radius: 8px; margin-top: 10px; }
            .performed-by { font-size: 11px; color: #9ca3af; margin-top: 6px; font-weight: 600; }
            .reversed-badge { color: #dc2626; font-weight: bold; margin-right: 8px; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">سجل حركات وتاريخ العميل</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</div>
            </div>
            <div style="font-size: 18px; font-weight: bold; color: #374151;">SG ACADEMY</div>
          </div>
          
          <div class="customer-info">
            <div style="font-size: 11px; font-weight: 800; color: #6b7280;">اسم العميل</div>
            <div style="font-size: 20px; font-weight: bold; color: #111827; margin-bottom: 8px;">${customerName}</div>
            <div style="font-size: 11px; font-weight: 800; color: #6b7280;">رقم الحجز (Booking ID)</div>
            <div style="font-size: 13px; font-family: monospace; color: #4b5563;">${booking.id}</div>
          </div>

          <div class="logs">
            ${logs.map(log => `
              <div class="log-item">
                <div class="log-header">
                  <div>
                    <span class="action-tag">${getActionLabel(log.action)} (${log.action})</span>
                    ${log.details?.isReversed ? `<span class="reversed-badge">[تم التراجع عن هذه الحركة]</span>` : ''}
                  </div>
                  <span class="timestamp">${new Date(log.timestamp).toLocaleString('ar-EG')}</span>
                </div>
                <div class="description" style="${log.details?.isReversed ? 'text-decoration: line-through; color: #9ca3af;' : ''}">${log.description}</div>
                <div class="performed-by">بواسطة: ${resolvePerformer(log.performedBy)} ${log.performedByEmail ? `(${log.performedByEmail})` : ''}</div>
                ${log.details ? `
                  <div class="details">
                    ${log.details.amount ? `<div>المبلغ: ${log.details.amount} ج.م</div>` : ''}
                    ${log.details.refundAmount ? `<div>مبلغ الاسترداد: ${log.details.refundAmount} ج.م</div>` : ''}
                    ${log.details.paymentSummary ? `<div>المدفوع: ${log.details.paymentSummary.paidTotal} ج.م | المتبقي: ${log.details.paymentSummary.remaining} ج.م</div>` : ''}
                    ${log.details.reason ? `<div>السبب: ${log.details.reason}</div>` : ''}
                    ${log.details.isReversed ? `<div style="color: #dc2626; font-weight: bold; margin-top: 4px;">تم التراجع عن هذه الحركة في: ${new Date(log.details.reversedAt).toLocaleString('ar-EG')}</div>` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
          
          <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            نظام إدارة الحجوزات والحسابات - SG ACADEMY
          </div>
        </body>
      </html>
    `;

    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.print();
      w.close();
    };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative border border-gray-100 dark:border-gray-700">
        
        {/* Confirmation Overlay for Rollback / Restore Point */}
        {confirmReversal && (
          <div className="absolute inset-0 z-[110] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md flex items-center justify-center p-6 md:p-8 rounded-[2rem]">
            <div className="max-w-lg text-center w-full">
              <div className="w-20 h-20 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl shadow-inner animate-pulse">
                <i className="fas fa-history"></i>
              </div>
              <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-3">
                تأكيد التراجع واستعادة حالة العميل
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-6 leading-relaxed">
                {getRollbackExplanation(confirmReversal)}
              </p>

              {/* Movement Summary Card */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 text-right mb-6 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b dark:border-gray-600">
                  <span className="text-gray-500 font-bold">نوع الحركة:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400">{getActionLabel(confirmReversal.action)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b dark:border-gray-600">
                  <span className="text-gray-500 font-bold">تاريخ التنفيذ:</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300" dir="ltr">{new Date(confirmReversal.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b dark:border-gray-600">
                  <span className="text-gray-500 font-bold">المنفذ:</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">{resolvePerformer(confirmReversal.performedBy)}</span>
                </div>
                {confirmReversal.details?.amount !== undefined && (
                  <div className="flex justify-between items-center pb-2 border-b dark:border-gray-600">
                    <span className="text-gray-500 font-bold">المبلغ المرتبط:</span>
                    <span className="font-black text-emerald-600 text-sm">{confirmReversal.details.amount} ج.م</span>
                  </div>
                )}
                {confirmReversal.details?.refundAmount !== undefined && (
                  <div className="flex justify-between items-center pb-2 border-b dark:border-gray-600">
                    <span className="text-gray-500 font-bold">مبلغ الاسترداد:</span>
                    <span className="font-black text-rose-600 text-sm">{confirmReversal.details.refundAmount} ج.م</span>
                  </div>
                )}
                <p className="text-gray-600 dark:text-gray-300 italic pt-1">
                  "{confirmReversal.description}"
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => handleRollback(confirmReversal)}
                  disabled={reversingId !== null}
                  className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {reversingId ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري استعادة الحالة...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-undo-alt"></i>
                      <span>نعم، تراجع عن الحركة واستعد الحالة</span>
                    </>
                  )}
                </button>
                <button 
                  onClick={() => setConfirmReversal(null)}
                  disabled={reversingId !== null}
                  className="px-6 py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-gray-900 dark:text-white">
              <span className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
                <i className="fas fa-history"></i>
              </span>
              سجل حركات وتاريخ العميل
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">
              العميل: <span className="text-indigo-600 dark:text-indigo-400 font-black">{customerName}</span>
              {booking && (
                <span className="mr-3 font-mono text-[11px] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg text-gray-600 dark:text-gray-300">
                  ID: {booking.id.slice(0, 10)}...
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrintSummary} 
              className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all flex items-center gap-2 border border-indigo-100 dark:border-indigo-800/50"
              title="طباعة ملخص الحركات"
            >
              <i className="fas fa-print"></i>
              <span>طباعة السجل</span>
            </button>
            <button 
              onClick={onClose} 
              className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <i className="fas fa-check-circle text-emerald-500 text-sm"></i>
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <i className="fas fa-exclamation-circle text-rose-500 text-sm"></i>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* Logs Timeline */}
        <div className="flex-1 overflow-y-auto pl-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-xs font-black text-gray-400">جاري تحميل سجل الحركات...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl text-gray-300 dark:text-gray-500">
                <i className="fas fa-clipboard-list"></i>
              </div>
              <p className="text-gray-400 font-bold text-sm">لا يوجد سجل حركات متاح لهذا الحجز حتى الآن.</p>
            </div>
          ) : (
            <div className="relative border-r-2 border-indigo-100 dark:border-indigo-900/40 mr-4 pr-7 space-y-6 py-3">
              {logs.map((log) => {
                const canRollback = isRollbackable(log);
                const isReversed = log.details?.isReversed;

                return (
                  <div key={log.id} className={`relative transition-all ${isReversed ? 'opacity-65' : ''}`}>
                    {/* Timeline Node Dot */}
                    <div className={`absolute -right-[36px] top-1.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 border-4 z-10 shadow-sm transition-all ${
                      isReversed 
                        ? 'border-gray-400 dark:border-gray-600' 
                        : log.action === 'CREATED' 
                        ? 'border-emerald-500' 
                        : log.action === 'PAYMENT' || log.action === 'COMPLETION_PAYMENT'
                        ? 'border-blue-500'
                        : log.action === 'REFUNDED'
                        ? 'border-rose-500'
                        : 'border-indigo-500'
                    }`}></div>

                    {/* Card Body */}
                    <div className={`p-4 md:p-5 rounded-2xl border transition-all ${
                      isReversed 
                        ? 'border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40' 
                        : 'bg-gray-50/80 dark:bg-gray-700/30 border-gray-200/80 dark:border-gray-700/60 hover:border-indigo-300 dark:hover:border-indigo-600 shadow-sm'
                    }`}>
                      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black border flex items-center gap-1.5 ${getActionColor(log.action)}`}>
                            <i className={`fas ${getActionIcon(log.action)} text-[10px]`}></i>
                            <span>{getActionLabel(log.action)}</span>
                          </span>

                          {isReversed && (
                            <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[10px] font-black flex items-center gap-1">
                              <i className="fas fa-undo text-[9px]"></i>
                              تم التراجع عن الحركة
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500" dir="ltr">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>

                          {/* Restore / Rollback Action Button */}
                          {canRollback && (
                            <button 
                              onClick={() => setConfirmReversal(log)}
                              className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm group"
                              title="تراجع عن هذه الحركة واستعادة الحالة كما كانت قبلها (Restore Point)"
                            >
                              <i className="fas fa-undo-alt text-[10px] transition-transform group-hover:-rotate-45"></i>
                              <span>تراجع / نقطة استعادة</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Movement Description */}
                      <p className={`text-sm font-bold mb-3 ${isReversed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                        {log.description}
                      </p>
                      
                      {/* Detailed State Info */}
                      {log.details && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700">
                          {log.details.paymentSummary && (
                            <div>
                              <p className="font-black text-gray-400 text-[10px] uppercase mb-1 border-b dark:border-gray-700 pb-1">
                                حالة المدفوعات عند الحركة
                              </p>
                              <div className="flex justify-between py-0.5">
                                <span className="text-gray-500">إجمالي المدفوع:</span>
                                <span className="font-bold text-emerald-600">{log.details.paymentSummary.paidTotal} ج.م</span>
                              </div>
                              <div className="flex justify-between py-0.5">
                                <span className="text-gray-500">المبلغ المتبقي:</span>
                                <span className="font-bold text-rose-600">{log.details.paymentSummary.remaining} ج.م</span>
                              </div>
                            </div>
                          )}

                          {log.details.installments && (
                            <div>
                              <p className="font-black text-gray-400 text-[10px] uppercase mb-1 border-b dark:border-gray-700 pb-1">
                                خطة الأقساط ({log.details.installments.length} أقساط)
                              </p>
                              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                {log.details.installments.map((inst, i) => (
                                  <div key={i} className="flex justify-between items-center gap-2 py-0.5 text-[11px] border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-gray-400" dir="ltr">{inst.dueDate}</span>
                                      {inst.label && <span className="text-[9px] font-black text-indigo-500">({inst.label})</span>}
                                    </div>
                                    <span className={`font-bold ${inst.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                      {inst.amount} ج.م
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(log.details.amount !== undefined || log.details.refundAmount !== undefined) && (
                            <div className={`col-span-full flex items-center gap-2 font-black text-xs ${isReversed ? 'text-gray-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                              <i className="fas fa-coins"></i>
                              <span>قيمة الحركة: {log.details.amount || log.details.refundAmount} ج.م</span>
                              {log.details.method && (
                                <span className="font-normal text-gray-500">({log.details.method})</span>
                              )}
                            </div>
                          )}

                          {log.details.reason && (
                            <div className="col-span-full text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 p-2 rounded-lg">
                              <span className="font-bold text-gray-500">السبب المسجل: </span>
                              <span>{log.details.reason}</span>
                            </div>
                          )}

                          {isReversed && (
                            <div className="col-span-full p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 font-bold flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <i className="fas fa-info-circle text-rose-500"></i>
                                <span>تم التراجع عن هذه الحركة في: <span dir="ltr">{new Date(log.details.reversedAt).toLocaleString()}</span></span>
                              </div>
                              {log.details.reversedBy && (
                                <span className="text-[11px] text-rose-500">بواسطة: {log.details.reversedBy}</span>
                              )}
                            </div>
                          )}

                          {log.details.receiptLink && (
                            <div className="col-span-full">
                              <a 
                                href={log.details.receiptLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 font-bold"
                              >
                                <i className="fas fa-file-invoice"></i>
                                <span>عرض صورة الإيصال المرفق</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Performer Footer */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 font-medium border-t border-gray-100 dark:border-gray-700/50 pt-2">
                        <div className="flex items-center gap-1.5">
                          <i className="fas fa-user-circle text-gray-400"></i>
                          <span>المنفذ: <strong className="text-gray-600 dark:text-gray-300">{resolvePerformer(log.performedBy)}</strong></span>
                          {log.performedByEmail && (
                            <span className="text-[10px] text-gray-400">({log.performedByEmail})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-400 font-medium">
            إجمالي الحركات المسجلة: <strong className="text-indigo-600 dark:text-indigo-400">{logs.length}</strong> حركة
          </div>
          <button 
            onClick={onClose} 
            className="px-8 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          >
            إغلاق السجل
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
