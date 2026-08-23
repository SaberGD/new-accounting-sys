import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { CustomerSubscription, SubscriptionAccount, SubscriptionType, ProgramSubscriptionExpense, ProgramSubscriptionRevenue } from './types';
import { WhatsAppRedirectModal } from './WhatsAppRedirectModal';
import { isAccountPaidSoFar } from './utils';

interface ReportsTabProps {
  customerSubs: CustomerSubscription[];
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  expenses: ProgramSubscriptionExpense[];
  revenues: ProgramSubscriptionRevenue[];
}

export function ReportsTab({
  customerSubs,
  accounts,
  types,
  expenses,
  revenues
}: ReportsTabProps) {
  const lang = 'ar';

  // WhatsApp states
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [selectedSubForWhatsApp, setSelectedSubForWhatsApp] = useState<CustomerSubscription | null>(null);

  // Financial aggregation
  const totalPaidAccountsCost = accounts
    .filter(isAccountPaidSoFar)
    .reduce((sum, a) => sum + (a.cost || 0), 0);
  const totalExpensesFromLog = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExpenses = Math.max(totalPaidAccountsCost, totalExpensesFromLog);

  const totalPaidCustomerSubs = customerSubs
    .filter(s => s.paymentStatus === 'paid' && !s.isTemporaryCompensation)
    .reduce((sum, s) => sum + (s.price || 0), 0);
  const totalRevenuesFromLog = revenues.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalRevenues = Math.max(totalPaidCustomerSubs, totalRevenuesFromLog);

  const netEarnings = totalRevenues - totalExpenses;

  // Compile unified transactions list sorted by date desc
  const allTransactions = [
    ...expenses.map(e => {
      const acc = accounts.find(a => a.id === e.accountId);
      const type = types.find(t => t.id === acc?.typeId);
      return {
        id: e.id,
        type: 'expense' as const,
        amount: e.amount,
        date: e.date,
        label: `${lang === 'ar' ? 'تجديد حساب' : 'Account purchase'}: ${type?.name || ''} (${acc?.email || ''})`,
        note: e.note
      };
    }),
    ...revenues.map(r => {
      const sub = customerSubs.find(s => s.id === r.customerSubId);
      const acc = accounts.find(a => a.id === sub?.accountId);
      const type = types.find(t => t.id === acc?.typeId);
      return {
        id: r.id,
        type: 'revenue' as const,
        amount: r.amount,
        date: r.date,
        label: `${lang === 'ar' ? 'تحصيل مقعد العميل' : 'Client seat fee'}: ${sub?.customerName || ''} (${type?.name || ''})`,
        note: r.note
      };
    })
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      
      {/* Visual Aggregation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Total Expenses */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center text-lg">
            <i className="fas fa-arrow-down-long"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'إجمالي النفقات الفعلية' : 'Total Expenses'}
            </div>
            <div className="text-xl font-black text-gray-950 dark:text-white mt-1">
              {totalExpenses.toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'تكاليف شراء التراخيص المدفوعة' : 'Accumulated software license costs'}
            </div>
          </div>
        </div>

        {/* Total Revenues */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500 flex items-center justify-center text-lg">
            <i className="fas fa-arrow-up-long"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'إجمالي التحصيلات الفعلية' : 'Total Revenue Collected'}
            </div>
            <div className="text-xl font-black text-gray-950 dark:text-white mt-1">
              {totalRevenues.toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'المبالغ المحصلة من مقاعد العملاء' : 'Accumulated client seat payments'}
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg ${
            netEarnings >= 0 
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' 
              : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500'
          }`}>
            <i className="fas fa-scale-balanced"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'صافي الأرباح المحققة' : 'Net Profits'}
            </div>
            <div className={`text-xl font-black mt-1 ${
              netEarnings >= 0 ? 'text-amber-500' : 'text-rose-500'
            }`}>
              {netEarnings.toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'الفرق الفعلي بين الوارد والمنصرف' : 'Actual collected net margins'}
            </div>
          </div>
        </div>

      </div>

      {/* Financial Transactions list */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'دفتر المعاملات المالية المباشرة' : 'Financial Transactions Ledger'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' ? 'سجل تاريخي بكافة المبالغ المدفوعة لشراء التراخيص أو المحصلة من المشتركين.' : 'A historical list of all subscription purchases and client seat collections.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'نوع المعاملة' : 'Transaction Type'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'البيان' : 'Description'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                <th className="p-4 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
              {allTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all duration-150">
                  <td className="p-4 font-mono font-bold text-gray-500">
                    {tx.date}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      tx.type === 'revenue'
                        ? 'bg-green-50 text-green-600 dark:bg-green-950/20'
                        : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                    }`}>
                      {tx.type === 'revenue' ? (lang === 'ar' ? 'وارد / إيراد' : 'Revenue') : (lang === 'ar' ? 'منصرف / تكلفة' : 'Expense')}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-gray-800 dark:text-gray-200">
                    {tx.label}
                  </td>
                  <td className="p-4 text-gray-400 font-bold">
                    {tx.note || '—'}
                  </td>
                  <td className={`p-4 text-right font-black text-sm ${
                    tx.type === 'revenue' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {tx.type === 'revenue' ? '+' : '-'}{tx.amount.toLocaleString()} EGP
                  </td>
                </tr>
              ))}

              {allTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-xs text-gray-400 font-bold">
                    {lang === 'ar' ? 'لا يوجد معاملات مالية مسجلة بعد.' : 'No financial transactions registered yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Subscriptions History Report Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-6" dir="rtl">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-history text-primary-500"></i>
            <span>سجل اشتراكات وتفاصيل العملاء التفصيلية</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            ابحث عن متدرب لمشاهدة تاريخه الكامل، عدد مرات الاشتراك، من متى إلى متى، وتفاصيل الحسابات وقيمة المبالغ المدفوعة.
          </p>
        </div>

        {/* State and Search Logic */}
        {(() => {
          // Dynamic internal component scoping to keep states clean
          const [selectedKey, setSelectedKey] = useState<string | null>(null);
          const [searchTerm, setSearchTerm] = useState('');

          // Group subscriptions by Customer Name + Phone
          const clientGroups = React.useMemo(() => {
            const groups: { [key: string]: {
              name: string;
              phone: string;
              subs: CustomerSubscription[];
              totalPaid: number;
              totalCount: number;
            }} = {};

            customerSubs.forEach(sub => {
              const trimmedName = (sub.customerName || '').trim();
              const trimmedPhone = (sub.customerPhone || '').trim();
              if (!trimmedName) return;

              const key = `${trimmedName}__${trimmedPhone}`;
              if (!groups[key]) {
                groups[key] = {
                  name: trimmedName,
                  phone: trimmedPhone,
                  subs: [],
                  totalPaid: 0,
                  totalCount: 0
                };
              }

              groups[key].subs.push(sub);
              groups[key].totalCount += 1;
              if (sub.paymentStatus === 'paid') {
                groups[key].totalPaid += (sub.price || 0);
              }
            });

            // Convert to array and sort subs within each group by startDate desc
            return Object.values(groups).map(g => {
              g.subs.sort((a, b) => b.startDate.localeCompare(a.startDate));
              return g;
            });
          }, [customerSubs]);

          // Filter groups based on search term
          const filteredClients = clientGroups.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.phone.includes(searchTerm)
          );

          const selectedClient = selectedKey ? clientGroups.find(g => `${g.name}__${g.phone}` === selectedKey) : null;

          return (
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                  <i className="fas fa-search text-xs"></i>
                </div>
                <input
                  type="text"
                  placeholder="ابحث عن العميل بالاسم الكامل أو رقم الهاتف..."
                  className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 text-xs font-bold rounded-2xl outline-none focus:ring-1 focus:ring-primary-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Panel: Clients List */}
                <div className={`${selectedClient ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-3`}>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                    العملاء المسجلون ({filteredClients.length})
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {filteredClients.map((client) => {
                      const clientKey = `${client.name}__${client.phone}`;
                      const isSelected = selectedKey === clientKey;
                      return (
                        <div
                          key={clientKey}
                          onClick={() => setSelectedKey(isSelected ? null : clientKey)}
                          className={`p-4 rounded-2xl border transition-all duration-150 cursor-pointer flex justify-between items-center ${
                            isSelected 
                              ? 'bg-primary-50 border-primary-200 dark:bg-primary-950/20 dark:border-primary-900/40 text-primary-950 dark:text-primary-100 shadow-sm'
                              : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="space-y-1">
                            <span className="font-extrabold text-xs block">{client.name}</span>
                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-gray-400">
                              <span>{client.phone || '—'}</span>
                              {client.phone && client.subs[0] && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSubForWhatsApp(client.subs[0]);
                                    setWhatsAppModalOpen(true);
                                  }}
                                  className="text-emerald-500 hover:text-emerald-600 p-0.5 rounded transition-colors cursor-pointer"
                                  title="إرسال واتساب"
                                >
                                  <i className="fab fa-whatsapp text-xs font-black"></i>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-left space-y-1">
                            <span className="px-2 py-0.5 text-[9px] rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-black block">
                              اشترك {client.totalCount} مرات
                            </span>
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-extrabold block">
                              دفع {client.totalPaid.toLocaleString()} ر.س
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {filteredClients.length === 0 && (
                      <p className="text-center py-10 text-xs text-gray-400 font-bold italic">
                        لا يوجد متدرب مطابق لبحثك.
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Panel: Selected Client's Details */}
                {selectedClient && (
                  <div className="lg:col-span-7 bg-gray-50/50 dark:bg-gray-950/20 border border-gray-100 dark:border-gray-800/40 p-6 rounded-3xl space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-200/50 dark:border-gray-700/50">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white">
                          السجل التاريخي للمشترك: {selectedClient.name}
                        </h3>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono flex items-center gap-1.5">
                          <span>هاتف المتدرب: {selectedClient.phone || 'N/A'}</span>
                          {selectedClient.phone && selectedClient.subs[0] && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSubForWhatsApp(selectedClient.subs[0]);
                                setWhatsAppModalOpen(true);
                              }}
                              className="text-emerald-500 hover:text-emerald-600 p-0.5 rounded transition-colors cursor-pointer"
                              title="تواصل واتساب"
                            >
                              <i className="fab fa-whatsapp text-xs font-black"></i>
                            </button>
                          )}
                        </p>
                      </div>
                      <button 
                        onClick={() => setSelectedKey(null)}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >
                        <i className="fas fa-times-circle text-lg"></i>
                      </button>
                    </div>

                    {/* Stats Dashboard for selected client */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="text-[9px] text-gray-400 font-black block uppercase tracking-wider">عدد مرات الاشتراك الكلي</span>
                        <span className="text-lg font-black block mt-1">{selectedClient.totalCount} مرات</span>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="text-[9px] text-gray-400 font-black block uppercase tracking-wider">إجمالي المبالغ المدفوعة</span>
                        <span className="text-lg font-black block text-emerald-600 dark:text-emerald-400 mt-1">
                          {selectedClient.totalPaid.toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>

                    {/* Timeline of subscriptions */}
                    <div className="space-y-4">
                      <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-wider">
                        جدول تفاصيل الاشتراكات من البداية للنهاية
                      </h4>

                      <div className="space-y-3">
                        {selectedClient.subs.map((sub, index) => {
                          const acc = accounts.find(a => a.id === sub.accountId);
                          const type = types.find(t => t.id === acc?.typeId);

                          return (
                            <div 
                              key={sub.id} 
                              className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3 relative overflow-hidden"
                            >
                              {/* Left status bar */}
                              <div className={`absolute top-0 bottom-0 right-0 w-1.5 ${
                                sub.status === 'active' ? 'bg-green-500' : sub.status === 'canceled' ? 'bg-gray-400' : 'bg-red-500'
                              }`}></div>

                              <div className="flex justify-between items-start pr-2">
                                <div>
                                  <span className="font-extrabold text-xs text-gray-900 dark:text-white block">
                                    {type?.name || 'برنامج غير معروف'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 block font-mono mt-0.5">
                                    الحساب المرتبط: {acc?.email || 'لا يوجد إيميل مرتبط'}
                                  </span>
                                </div>

                                <div className="flex gap-1.5">
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                    sub.status === 'active' 
                                      ? 'bg-green-50 text-green-600 dark:bg-green-950/20' 
                                      : sub.status === 'canceled'
                                      ? 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                                      : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                                  }`}>
                                    {sub.status === 'active' ? 'نشط' : sub.status === 'canceled' ? 'ملغي' : 'منتهي'}
                                  </span>

                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                    sub.paymentStatus === 'paid'
                                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20'
                                      : 'bg-red-50 text-red-600 dark:bg-red-950/20'
                                  }`}>
                                    {sub.paymentStatus === 'paid' ? 'مسدد' : 'غير مسدد'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl pr-4">
                                <div>
                                  <span className="text-gray-400 block text-[9px]">تاريخ البدء</span>
                                  <span className="font-mono">{sub.startDate || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[9px]">تاريخ الانتهاء</span>
                                  <span className="font-mono">{sub.endDate || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block text-[9px]">المبلغ المستحق</span>
                                  <span className="font-mono text-red-500 font-extrabold">{sub.price || 0} ر.س</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* WhatsApp Redirect Helper Modal */}
      {whatsAppModalOpen && selectedSubForWhatsApp && (
        <WhatsAppRedirectModal
          isOpen={whatsAppModalOpen}
          onClose={() => {
            setWhatsAppModalOpen(false);
            setSelectedSubForWhatsApp(null);
          }}
          customerSub={selectedSubForWhatsApp}
          account={accounts.find(a => a.id === selectedSubForWhatsApp.accountId)}
          type={types.find(t => t.id === accounts.find(a => a.id === selectedSubForWhatsApp.accountId)?.typeId)}
        />
      )}
    </div>
  );
}
