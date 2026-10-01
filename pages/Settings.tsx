
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  recalculateRevenueFields, 
  repairBookedCounts, 
  cleanOrphanPayments, 
  wipeCollection,
  bulkRescheduleInstallments,
  migrateCustomerCountryCodes,
  autoReconcileAllInstallmentPlans
} from '../services/firestore';

const Settings: React.FC = () => {
  const { t, lang, setLanguage, theme, toggleTheme } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const navigate = useNavigate();
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  
  // Reset Modal State
  const [isResetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetStatus, setResetStatus] = useState<string[]>([]);
  const [isResetting, setIsResetting] = useState(false);

  const runTool = async (name: string, fn: () => Promise<any>) => {
    if (!confirm(`Run ${name}? This will scan and update Firestore documents.`)) return;
    setLoadingTool(name);
    try {
      const result = await fn();
      if (typeof result === 'number') {
        alert(`${name} completed. Affected ${result} records.`);
      } else {
        alert(`${name} completed successfully.`);
      }
    } catch (err: any) {
      alert(`Error running ${name}: ${err.message}`);
    } finally {
      setLoadingTool(null);
    }
  };

  const handleFullReset = async () => {
    if (resetConfirmText.toUpperCase() !== 'RESET') return;
    
    setIsResetting(true);
    setResetStatus(["Initializing Wipe..."]);

    const collectionsToWipe = [
      'catalog_courses',
      'catalog_diplomas',
      'offers',
      'branches',
      'groups',
      'customers',
      'bookings',
      'payments',
      'refunds',
      'installment_plans'
    ];

    try {
      for (const coll of collectionsToWipe) {
        setResetStatus(prev => [...prev, `Wiping ${coll}...`]);
        await wipeCollection(coll, (msg) => {
          setResetStatus(prev => [...prev.slice(0, -1), msg]);
        });
      }
      setResetStatus(prev => [...prev, "✓ Data wiped successfully."]);
      alert(t('resetSuccess'));
      window.location.reload(); 
    } catch (err: any) {
      console.error(err);
      setResetStatus(prev => [...prev, `❌ ERROR: ${err.message}`]);
    } finally {
      setIsResetting(false);
    }
  };

  const sections = [
    { 
      title: 'Appearance', 
      icon: 'fa-palette', 
      items: [
        { label: 'Theme Mode', value: theme.toUpperCase(), action: toggleTheme, actionLabel: theme === 'light' ? 'Switch to Dark' : 'Switch to Light' },
        { label: 'Language', value: lang.toUpperCase(), action: () => setLanguage(lang === 'en' ? 'ar' : 'en'), actionLabel: 'Toggle EN/AR' }
      ]
    },
    {
      title: 'Organization',
      icon: 'fa-building',
      items: [
        { label: 'Branches Management', value: 'Offline Centers', action: () => navigate('/branches'), actionLabel: 'Manage Locations' }
      ]
    }
  ];

  const integrityTools = [
    { label: 'Reconcile & Sync Installments (مزامنة وإصلاح خطط الأقساط مع المدفوعات)', action: () => runTool('Installments Auto-Reconciliation', async () => {
        const res = await autoReconcileAllInstallmentPlans();
        return res.reconciledCount;
      }) 
    },
    { label: t('recalculateRevenue'), action: () => runTool('Revenue Recalculation', recalculateRevenueFields) },
    { label: t('repairGroupCount'), action: () => runTool('Group Count Repair', repairBookedCounts) },
    { label: 'Clean Orphan Payments', action: () => runTool('Orphan Payments Cleanup', cleanOrphanPayments) },
    { label: 'Reschedule Installments (Group Start Date)', action: () => runTool('Bulk Installment Rescheduling', bulkRescheduleInstallments) },
    { label: 'Fix WhatsApp Country Codes (Migrate undefined)', action: () => runTool('WhatsApp Data Migration', migrateCustomerCountryCodes) }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">System Settings</h1>
      <p className="text-gray-500 mb-10">Configure your SGCA experience and manage organization resources.</p>

      <div className="space-y-8">
        {/* Saber identity has two deliberate display modes. */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 bg-gray-50/30 dark:bg-gray-700/20 flex items-center justify-between">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <i className="fas fa-palette text-primary-600 text-lg"></i>
              <div>
                <h3 className="font-bold uppercase text-xs tracking-widest text-gray-500">
                  {lang === 'ar' ? 'مظهر النظام' : 'System Appearance'}
                </h3>
                <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                  {lang === 'ar' ? 'هوية صابر جروب متاحة بوضع فاتح ووضع داكن' : 'Saber Group identity in light and dark modes'}
                </p>
              </div>
            </div>
            <span className="text-xs font-black px-3.5 py-1 bg-primary-100 dark:bg-primary-900/60 text-primary-600 rounded-full">
              {lang === 'ar' ? 'وضعان' : '2 MODES'}
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* Mode Selector Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border dark:border-gray-700/80">
              <div>
                <p className="font-bold text-sm text-gray-800 dark:text-gray-200">
                  {lang === 'ar' ? 'نمط الواجهة (فاتح / داكن)' : 'Display Mode (Light / Dark)'}
                </p>
                <p className="text-xs text-gray-400">
                  {lang === 'ar' ? 'التحكم في إضاءة خلفية النظام بالكامل للعين' : 'Toggle between night dark and bright light themes'}
                </p>
              </div>
              <button 
                onClick={toggleTheme}
                className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 shadow-md shadow-primary-500/20 transition-all flex items-center space-x-2 rtl:space-x-reverse"
              >
                <i className={`fas ${theme === 'dark' ? 'fa-sun text-amber-300' : 'fa-moon text-indigo-300'}`}></i>
                <span>{theme === 'dark' ? (lang === 'ar' ? 'التحويل للنمط الفاتح' : 'Switch to Light Mode') : (lang === 'ar' ? 'التحويل للنمط الداكن' : 'Switch to Dark Mode')}</span>
              </button>
            </div>

          </div>
        </div>

        {sections.map(sec => (
          <div key={sec.title} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-6 border-b dark:border-gray-700 bg-gray-50/30 dark:bg-gray-700/20 flex items-center">
              <i className={`fas ${sec.icon} text-primary-600 mr-3 rtl:ml-3`}></i>
              <h3 className="font-bold uppercase text-xs tracking-widest text-gray-500">{sec.title}</h3>
            </div>
            <div className="divide-y dark:divide-gray-700">
              {sec.items.map(item => (
                <div key={item.label} className="p-6 flex flex-wrap items-center justify-between gap-4">
                  <div><p className="font-bold text-gray-700 dark:text-gray-200">{item.label}</p><p className="text-sm text-gray-400 font-medium">{item.value}</p></div>
                  {item.action && <button onClick={item.action} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-primary-600 hover:text-white rounded-xl text-sm font-bold transition-all">{item.actionLabel}</button>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {hasPermission('manageSettings') && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-red-100 dark:border-red-900/30 overflow-hidden">
            <div className="p-6 border-b dark:border-gray-700 bg-red-50/30 dark:bg-red-900/10 flex items-center">
              <i className="fas fa-tools text-red-600 mr-3 rtl:ml-3"></i>
              <h3 className="font-bold uppercase text-xs tracking-widest text-red-600">{t('integrityTools')}</h3>
            </div>
            <div className="divide-y dark:divide-gray-700">
              {integrityTools.map(tool => (
                <div key={tool.label} className="p-6 flex items-center justify-between">
                  <p className="font-bold text-gray-700 dark:text-gray-200">{tool.label}</p>
                  <button 
                    disabled={!!loadingTool}
                    onClick={tool.action}
                    className="px-6 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-500/20"
                  >
                    {loadingTool ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-play mr-2"></i>}
                    {t('runTool')}
                  </button>
                </div>
              ))}
              <div className="p-6 flex items-center justify-between bg-red-50/20 dark:bg-red-900/5">
                <div>
                  <p className="font-black text-red-600 uppercase tracking-wider">{t('fullSystemReset')}</p>
                  <p className="text-xs text-gray-500 mt-1">Delete all business data (courses, bookings, payments, etc.)</p>
                </div>
                <button 
                  onClick={() => setResetModalOpen(true)}
                  className="px-6 py-2 bg-red-100 text-red-700 hover:bg-red-600 hover:text-white rounded-xl text-sm font-black transition-all border border-red-200"
                >
                  DANGER: SYSTEM RESET
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-red-200 dark:border-red-900">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-xl shadow-red-500/10">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <h2 className="text-3xl font-black mb-4 text-gray-900 dark:text-white uppercase tracking-tight">{t('fullSystemReset')}</h2>
              <p className="text-red-600 font-bold mb-8 leading-relaxed px-4">{t('resetWarning')}</p>
              
              {!isResetting ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{t('typeResetToConfirm')}</label>
                    <input 
                      type="text" 
                      placeholder="RESET"
                      value={resetConfirmText}
                      onChange={e => setResetConfirmText(e.target.value)}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none text-center font-black tracking-widest border-2 border-transparent focus:border-red-500 transition-all dark:text-white"
                    />
                  </div>
                  <div className="flex flex-col space-y-3">
                    <button 
                      onClick={handleFullReset}
                      disabled={resetConfirmText.toUpperCase() !== 'RESET'}
                      className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-2xl shadow-red-500/30 disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      EXECUTE WIPE
                    </button>
                    <button 
                      onClick={() => { setResetModalOpen(false); setResetConfirmText(''); }}
                      className="w-full py-4 text-gray-400 font-bold"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center">
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full mb-6 overflow-hidden">
                      <div className="h-full bg-red-600 animate-pulse w-full"></div>
                    </div>
                    <p className="font-black text-xs text-gray-400 uppercase tracking-widest mb-4">{t('resetInProgress')}</p>
                    <div className="w-full max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl text-left text-[10px] font-mono space-y-1">
                      {resetStatus.map((s, i) => (
                        <div key={i} className={s.startsWith('✓') ? 'text-green-600' : s.startsWith('❌') ? 'text-red-600' : 'text-gray-500'}>
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-20 py-10 border-t dark:border-gray-700 flex justify-between items-center text-xs text-gray-400 font-bold uppercase tracking-widest">
        <span>© 2025 Saber Group Courses Academy</span>
        <span className="text-primary-600">SGCA Revenue & CRM System</span>
      </div>
    </div>
  );
};

export default Settings;
