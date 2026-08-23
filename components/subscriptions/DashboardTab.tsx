import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { SubscriptionType, SubscriptionAccount, CustomerSubscription, ProgramSubscriptionExpense, ProgramSubscriptionRevenue } from './types';
import { isAccountPaidSoFar } from './utils';

interface DashboardTabProps {
  customerSubs: CustomerSubscription[];
  accounts: SubscriptionAccount[];
  types: SubscriptionType[];
  expenses: ProgramSubscriptionExpense[];
  revenues: ProgramSubscriptionRevenue[];
  onSetTab: (tabId: string) => void;
}

export function DashboardTab({
  customerSubs,
  accounts,
  types,
  expenses,
  revenues,
  onSetTab
}: DashboardTabProps) {
  const lang = 'ar';

  // Metrics calculations
  const activeSubsCount = customerSubs.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.seatsCount || 1), 0);
  
  // Total seats available across all active accounts
  const activeAccounts = accounts.filter(a => a.status === 'active');
  const totalAvailableSeats = activeAccounts.reduce((sum, a) => sum + (a.maxSeats || 0), 0);

  // Overall Financial Totals So Far (التكلفة الإجمالية المدفوعة، الإيرادات، والربح حتى الآن)
  // 1. Total Paid License Accounts Cost (التكلفة الإجمالية المدفوعة لحسابات التراخيص حتى الآن - باستثناء النسخ التجريبية غير المدفوعة)
  const totalPaidAccountsCost = accounts
    .filter(isAccountPaidSoFar)
    .reduce((sum, a) => sum + (a.cost || 0), 0);
  const totalExpensesLogged = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalCostSoFar = Math.max(totalPaidAccountsCost, totalExpensesLogged);

  // 2. Total Collected Revenue from Customer Subscriptions (إجمالي الوارد من اشتراكات العملاء)
  const totalPaidCustomerSubs = customerSubs
    .filter(s => s.paymentStatus === 'paid' && !s.isTemporaryCompensation)
    .reduce((sum, s) => sum + (s.price || 0), 0);
  const totalRevenuesLogged = revenues.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalRevenueSoFar = Math.max(totalPaidCustomerSubs, totalRevenuesLogged);

  // 3. Overall Net Profit (صافي الربح الإجمالي بين الوارد والمدفوع)
  const totalProfitSoFar = totalRevenueSoFar - totalCostSoFar;
  
  // Total monthly cost of active accounts (excluding trial accounts and unpaid accounts)
  const todayStr = new Date().toISOString().split('T')[0];
  const totalMonthlyCost = activeAccounts.reduce((sum, a) => {
    // Check if account is currently in a trial period
    const isInTrial = a.hasTrial && a.trialPeriod !== 'none' && a.trialEndDate && todayStr <= a.trialEndDate;
    if (isInTrial) {
      return sum; // 0 cost during trial period
    }

    // Check if account payment to provider is pending / unpaid
    if (a.isPaid === false) {
      return sum;
    }

    const type = types.find(t => t.id === a.typeId);
    if (!type) return sum + (a.cost || 0);
    // If billing is yearly, normalize to monthly
    if (type.billingCycle === 'yearly') {
      return sum + (a.cost || 0) / 12;
    }
    return sum + (a.cost || 0);
  }, 0);

  // Total monthly revenue from active customer seats
  const totalMonthlyRevenue = customerSubs
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + (s.price || 0), 0);

  const profitMargin = totalMonthlyRevenue - totalMonthlyCost;

  // Group accounts by type for seat utilization chart
  const seatStatsByType = types.map(type => {
    const typeAccounts = accounts.filter(a => a.typeId === type.id && a.status === 'active');
    const maxSeats = typeAccounts.reduce((sum, a) => sum + (a.maxSeats || 0), 0);
    const assignedSeats = customerSubs.filter(s => {
      const acc = accounts.find(a => a.id === s.accountId);
      return s.status === 'active' && acc && acc.typeId === type.id;
    }).reduce((sum, s) => sum + (s.seatsCount || 1), 0);

    return {
      name: type.name,
      maxSeats,
      assignedSeats,
      percent: maxSeats > 0 ? Math.round((assignedSeats / maxSeats) * 100) : 0
    };
  });

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: OVERALL CUMULATIVE FINANCIALS (حتى الآن) */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-6 rounded-3xl text-white shadow-xl space-y-4 border border-gray-800">
        <div className="flex justify-between items-center pb-2 border-b border-gray-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-black">
              <i className="fas fa-coins"></i>
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide">الملخص المالي التراكمي (حتى الآن)</h2>
              <p className="text-[10px] text-gray-400 font-bold">إجمالي التكاليف والإيرادات وصافي الأرباح الفعلية المسجلة</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-black">
            محدث مباشرة ⚡
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Total Cost So Far */}
          <div id="stat-total-cost" className="bg-white/5 dark:bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center text-lg font-black shrink-0">
              <i className="fas fa-arrow-down-long"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                {lang === 'ar' ? 'التكلفة الإجمالية المدفوعة حتى الآن' : 'Total Paid Cost So Far'}
              </div>
              <div className="text-xl font-black text-red-400 mt-0.5">
                {Math.round(totalCostSoFar).toLocaleString()} EGP
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                شراء وتجديد تراخيص الحسابات
              </div>
            </div>
          </div>

          {/* Total Revenue So Far */}
          <div id="stat-total-revenue" className="bg-white/5 dark:bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-lg font-black shrink-0">
              <i className="fas fa-arrow-up-long"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                {lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}
              </div>
              <div className="text-xl font-black text-emerald-400 mt-0.5">
                {Math.round(totalRevenueSoFar).toLocaleString()} EGP
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                تحصيلات مبيعات مقاعد المشتركين
              </div>
            </div>
          </div>

          {/* Total Profit So Far */}
          <div id="stat-total-profit" className="bg-white/5 dark:bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0 ${
              totalProfitSoFar >= 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'
            }`}>
              <i className="fas fa-chart-line"></i>
            </div>
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                {lang === 'ar' ? 'صافي الربح الإجمالي' : 'Total Net Profit'}
              </div>
              <div className={`text-xl font-black mt-0.5 ${
                totalProfitSoFar >= 0 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {Math.round(totalProfitSoFar).toLocaleString()} EGP
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                الفارق الفعلي بين الوارد والمنصرف
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: MONTHLY OPERATIONAL METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Active Seats */}
        <div id="stat-seats" className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center text-lg">
            <i className="fas fa-user-check"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'المقاعد النشطة' : 'Active Seats'}
            </div>
            <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
              {activeSubsCount} / {totalAvailableSeats}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'مقعد مخصص حالياً' : 'Currently allocated seats'}
            </div>
          </div>
        </div>

        {/* Monthly Cost */}
        <div id="stat-cost" className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 flex items-center justify-center text-lg">
            <i className="fas fa-hand-holding-dollar"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'التكلفة الشهرية' : 'Monthly Cost'}
            </div>
            <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
              {Math.round(totalMonthlyCost).toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'تكلفة ترخيص الحسابات نشطة' : 'Estimated recurring cost'}
            </div>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div id="stat-revenue" className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center text-lg">
            <i className="fas fa-wallet"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'الإيرادات الشهرية المتوقعة' : 'Est. Monthly Revenue'}
            </div>
            <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
              {Math.round(totalMonthlyRevenue).toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'إجمالي الاشتراكات النشطة' : 'From active allocated seats'}
            </div>
          </div>
        </div>

        {/* Monthly Profit Margin */}
        <div id="stat-margin" className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg ${
            profitMargin >= 0 
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' 
              : 'bg-red-50 dark:bg-red-900/20 text-red-500'
          }`}>
            <i className="fas fa-chart-line"></i>
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {lang === 'ar' ? 'صافي الربح المتوقع' : 'Est. Monthly Profit'}
            </div>
            <div className={`text-xl font-black mt-1 ${
              profitMargin >= 0 ? 'text-amber-500' : 'text-red-500'
            }`}>
              {Math.round(profitMargin).toLocaleString()} EGP
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {lang === 'ar' ? 'العائد بعد خصم التكاليف' : 'Net recurring profit margin'}
            </div>
          </div>
        </div>

      </div>

      {/* Seat Utilization & Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Seat Utilization List */}
        <div id="utilization-box" className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-black text-gray-900 dark:text-white">
              {lang === 'ar' ? 'استهلاك المقاعد حسب البرنامج' : 'Seat Utilization by Software'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {lang === 'ar' ? 'نسب المقاعد المحجوزة للعملاء من إجمالي المقاعد المتاحة.' : 'Percentage of seats assigned to clients from active accounts.'}
            </p>
          </div>

          <div className="space-y-4">
            {seatStatsByType.map((stat, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-black text-gray-700 dark:text-gray-300">{stat.name}</span>
                  <span className="font-mono font-bold text-gray-500">
                    {stat.assignedSeats} / {stat.maxSeats} ({stat.percent}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(stat.percent, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
            {seatStatsByType.length === 0 && (
              <div className="text-center py-6 text-xs text-gray-400 font-bold">
                {lang === 'ar' ? 'لا يوجد برامج مضافة بعد.' : 'No programs added yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div id="quick-actions-box" className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {lang === 'ar' ? 'روابط سريعة' : 'Quick Actions'}
          </h2>
          
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => onSetTab('customers')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 hover:bg-primary-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-left transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-user-plus text-primary-500 text-sm"></i>
                <span className="text-xs font-black text-gray-800 dark:text-white">
                  {lang === 'ar' ? 'تخصيص مقعد لعميل جديد' : 'Assign New Client Seat'}
                </span>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-[10px]"></i>
            </button>

            <button 
              onClick={() => onSetTab('accounts')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 hover:bg-primary-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-left transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-envelope-open text-primary-500 text-sm"></i>
                <span className="text-xs font-black text-gray-800 dark:text-white">
                  {lang === 'ar' ? 'إضافة حساب ترخيص جديد' : 'Add New Software Account'}
                </span>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-[10px]"></i>
            </button>

            <button 
              onClick={() => onSetTab('collections')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 hover:bg-primary-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-left transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-wallet text-primary-500 text-sm"></i>
                <span className="text-xs font-black text-gray-800 dark:text-white">
                  {lang === 'ar' ? 'مراجعة التحصيلات المعلقة' : 'Review Overdue Collections'}
                </span>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-[10px]"></i>
            </button>

            <button 
              onClick={() => onSetTab('reports')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 hover:bg-primary-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 text-left transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <i className="fas fa-file-invoice-dollar text-primary-500 text-sm"></i>
                <span className="text-xs font-black text-gray-800 dark:text-white">
                  {lang === 'ar' ? 'عرض التقارير المالية' : 'View Financial Reports'}
                </span>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-[10px]"></i>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
