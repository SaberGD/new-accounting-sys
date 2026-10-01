
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Role, PermissionKey, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { userProfile, logout, hasPermission, setImpersonatedRole, impersonatedRole, setImpersonatedUserId, impersonatedUserId } = useAuth();
  const { lang, setLanguage, theme, setTheme, t } = useTheme();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [impersonationModal, setImpersonationModal] = useState<{ role: Role, users: UserProfile[] } | null>(null);
  const location = useLocation();

  // Progressive Web App (PWA) Support
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS Safari Detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;
    if (isIosDevice && !isStandalone) {
      setShowIOSHint(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA Installation outcome: ${outcome}`);
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setImpersonationModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const allNavItems: { to: string; icon: string; label: string; permission: PermissionKey }[] = [
    { to: '/', icon: 'fa-chart-line', label: 'dashboard', permission: 'viewDashboard' },
    { to: '/program-subscriptions', icon: 'fa-cubes', label: 'programSubscriptions', permission: 'viewProgramSubscriptions' },
    { to: '/catalog', icon: 'fa-book', label: 'catalog', permission: 'viewCatalog' },
    { to: '/offers', icon: 'fa-tag', label: 'offers', permission: 'viewOffers' },
    { to: '/promo-codes', icon: 'fa-ticket', label: 'promoCodes', permission: 'viewOffers' },
    { to: '/branches', icon: 'fa-map-marker-alt', label: 'branches', permission: 'viewBranches' },
    { to: '/groups', icon: 'fa-users-rectangle', label: 'groups', permission: 'viewGroups' },
    { to: '/bookings', icon: 'fa-calendar-check', label: 'bookings', permission: 'viewBookings' },
    { to: '/booking-forms', icon: 'fa-wpforms', label: 'bookingForms', permission: 'viewBookings' },
    { to: '/event-forms', icon: 'fa-calendar-check', label: 'eventForms', permission: 'viewEventForms' },
    { to: '/customers', icon: 'fa-address-book', label: 'customers', permission: 'viewCustomers' },
    { to: '/student-search', icon: 'fa-magnifying-glass-chart', label: 'studentSearch', permission: 'viewCustomers' },
    { to: '/deactivated', icon: 'fa-ban', label: 'deactivated', permission: 'viewBookings' },
    { to: '/installments', icon: 'fa-file-invoice-dollar', label: 'installments', permission: 'viewInstallments' },
    { to: '/revenue', icon: 'fa-money-bill-trend-up', label: 'revenue', permission: 'viewRevenue' },
    { to: '/cashflow', icon: 'fa-sack-dollar', label: 'cashFlow', permission: 'viewCashFlow' },
    { to: '/sales-staff', icon: 'fa-user-tie', label: 'salesStaff', permission: 'viewSalesStaff' },
    { to: '/complaints', icon: 'fa-exclamation-triangle', label: 'complaints', permission: 'viewComplaints' },
    { to: '/activity-log', icon: 'fa-history', label: 'activityLog', permission: 'viewActivityLog' },
    { to: '/rescheduled-logs', icon: 'fa-calendar-alt', label: 'rescheduledLogs', permission: 'viewReschedulingLogs' },
    { to: '/exports', icon: 'fa-file-export', label: 'exports', permission: 'viewExports' },
    { to: '/permissions', icon: 'fa-shield-halved', label: 'Permissions Control', permission: 'viewUsers' },
    { to: '/users', icon: 'fa-user-plus', label: 'users', permission: 'viewUsers' },
    { to: '/settings', icon: 'fa-cog', label: 'settings', permission: 'viewSettings' },
    { to: '/guide', icon: 'fa-circle-info', label: 'systemGuide', permission: 'viewGuide' },
  ];

  const handleImpersonationClick = async (role: Role) => {
    const q = query(collection(db, 'users'), where('role', '==', role), where('isActive', '==', true));
    const snap = await getDocs(q);
    const users = snap.docs.map(doc => ({ ...doc.data(), uid: doc.id } as any as UserProfile));
    setImpersonationModal({ role, users });
  };

  const finalizeImpersonation = (user: UserProfile) => {
    setImpersonatedRole(user.role);
    setImpersonatedUserId(user.uid);
    setImpersonationModal(null);
  };

  const clearImpersonation = () => {
    setImpersonatedRole(null);
    setImpersonatedUserId(null);
  };

  const navItems = allNavItems.filter(item => hasPermission(item.permission));

  const activeClass = "sg-accounting-nav-item is-active flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 text-white transition-all";
  const inactiveClass = "sg-accounting-nav-item flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 text-gray-500 dark:text-gray-400 transition-all";

  return (
    <div className="sg-accounting-shell min-h-screen flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Impersonation User List Modal */}
      {impersonationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight dark:text-white">
                  {t('chooseUser')} ({t(impersonationModal.role as any)})
                </h3>
              </div>
              <button onClick={() => setImpersonationModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                <i className="fas fa-times text-gray-400"></i>
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {impersonationModal.users.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic">No active users found for this role.</div>
              ) : (
                impersonationModal.users.map(u => (
                  <button 
                    key={u.uid}
                    onClick={() => finalizeImpersonation(u)}
                    className="w-full text-left p-4 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-2xl transition-all flex items-center space-x-4 rtl:space-x-reverse group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-primary-600 font-bold group-hover:bg-primary-600 group-hover:text-white transition-all">
                      {u.displayName[0]}
                    </div>
                    <div>
                      <div className="font-bold text-sm dark:text-white">{u.displayName}</div>
                      <div className="text-[10px] text-gray-400">{u.email}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
              <button onClick={() => setImpersonationModal(null)} className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS PWA Installation Guide Modal */}
      {isIOSModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border dark:border-gray-700 p-6 animate-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-sm dark:text-white flex items-center gap-2">
                <i className="fab fa-apple text-xl text-red-600 dark:text-red-500"></i>
                تثبيت سيستم الحسابات على آيفونك
              </h3>
              <button onClick={() => setIsIOSModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                <i className="fas fa-times text-gray-400"></i>
              </button>
            </div>
            
            <div className="space-y-4 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              <p className="font-semibold text-gray-800 dark:text-gray-100">
                لإضافة السيستم كأيقونة على الشاشة الرئيسية لجهازك، اتبع الخطوات التالية في متصفح Safari:
              </p>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                <p>اضغط على زر المشاركة <i className="fas fa-share-square text-primary-600 text-lg mx-1"></i> في شريط Safari السفلي أو العلوي.</p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                <p>مرر القائمة لأسفل ثم اختر <strong className="text-gray-800 dark:text-white">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> <i className="far fa-plus-square text-lg text-primary-600 mx-1"></i>.</p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/60 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                <p>اضغط على <strong className="text-gray-800 dark:text-white">إضافة (Add)</strong> في الزاوية العلوية اليمنى.</p>
              </div>
            </div>

            <button 
              onClick={() => setIsIOSModalOpen(false)}
              className="mt-6 w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-primary-500/20"
            >
              فهمت، شكراً لك
            </button>
          </div>
        </div>
      )}

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[40] lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        className={`sg-accounting-sidebar fixed inset-y-0 left-0 z-[50] w-64 transform bg-white dark:bg-gray-800 border-r dark:border-gray-700 transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        rtl:left-auto rtl:right-0 rtl:border-l rtl:border-r-0 rtl:lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : 'rtl:translate-x-full'}`}
      >
        <div className="h-full flex flex-col px-4 py-6">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="sg-accounting-brand">
              <img src="/saber-group-logo.png" alt="Saber Group" />
              <span>{lang === 'ar' ? 'النظام المالي' : 'FINANCIAL OS'}</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-gray-400 hover:text-gray-600">
              <i className="fas fa-times"></i>
            </button>
          </div>

          <nav className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar px-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? activeClass : inactiveClass)}
              >
                <i className={`fas ${item.icon} w-6 text-center text-lg`}></i>
                <span className="font-semibold text-sm truncate">{t(item.label as any) || item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="pt-6 border-t dark:border-gray-700 mt-6">
            {/* PWA Install Button for Android / Chrome / Windows / Mac */}
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="flex items-center justify-center space-x-2 rtl:space-x-reverse w-full px-4 py-3 mb-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] animate-pulse"
              >
                <i className="fas fa-mobile-screen-button text-base"></i>
                <span>تثبيت سيستم الحسابات</span>
              </button>
            )}

            {/* iOS Help Hint Button for Safari */}
            {showIOSHint && (
              <button 
                onClick={() => setIsIOSModalOpen(true)}
                className="flex items-center justify-center space-x-2 rtl:space-x-reverse w-full px-4 py-3 mb-3 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 font-bold text-xs border border-primary-200 dark:border-primary-800 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <i className="fab fa-apple text-base"></i>
                <span>تثبيت على الآيفون</span>
              </button>
            )}

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl mb-4">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-600 text-xs font-bold">
                  {userProfile?.displayName?.[0]}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-bold truncate dark:text-white">{userProfile?.displayName}</span>
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest">{userProfile?.role}</span>
                </div>
              </div>
            </div>
            <button onClick={logout} className="flex items-center space-x-3 rtl:space-x-reverse w-full px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all font-bold text-sm">
              <i className="fas fa-sign-out-alt w-6"></i>
              <span>{t('logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col lg:ml-64 rtl:lg:ml-0 rtl:lg:mr-64 min-w-0">
        <header className="sg-accounting-header h-16 bg-white/95 dark:bg-gray-800 backdrop-blur-md border-b dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-[30] transition-colors duration-300">
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <i className="fas fa-bars text-xl"></i>
            </button>
            <h2 className="text-lg font-bold lg:flex hidden items-center space-x-2">
              <span className="text-gray-400">System</span>
              <span className="text-gray-300">/</span>
              <span className="text-primary-600">SGCA Admin</span>
            </h2>

            {/* Impersonation - check ORIGINAL user profile role, not effective role */}
            {userProfile?.role === 'admin' && (
              <div className="hidden md:flex items-center bg-gray-100 dark:bg-gray-900/50 p-1 rounded-xl ml-4 rtl:mr-4 border border-gray-200 dark:border-gray-700">
                <span className="px-3 text-[9px] font-black uppercase text-gray-400 tracking-widest">{t('viewAs')}:</span>
                <button 
                  onClick={() => clearImpersonation()}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${!impersonatedRole ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {t('admin')}
                </button>
                <button 
                  onClick={() => handleImpersonationClick('supervisor')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${impersonatedRole === 'supervisor' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {t('supervisor')}
                </button>
                <button 
                  onClick={() => handleImpersonationClick('manager')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${impersonatedRole === 'manager' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {t('manager')}
                </button>
                <button 
                  onClick={() => handleImpersonationClick('training_team_leader')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${impersonatedRole === 'training_team_leader' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {t('training')}
                </button>
                <button 
                  onClick={() => handleImpersonationClick('sales')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${impersonatedRole === 'sales' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {t('sales')}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            {impersonatedRole && (
               <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black animate-pulse border border-amber-200 uppercase">
                  MODE: {impersonatedRole}
               </div>
            )}
            
            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-full">
              <button onClick={() => setLanguage('en')} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${lang === 'en' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-600' : 'text-gray-400'}`}>EN</button>
              <button onClick={() => setLanguage('ar')} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${lang === 'ar' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-600' : 'text-gray-400'}`}>AR</button>
            </div>

            <div className="sg-accounting-theme-switch" role="group" aria-label={lang === 'ar' ? 'اختيار المظهر' : 'Choose theme'}>
              <button type="button" className={theme === 'light' ? 'is-active' : ''} onClick={() => setTheme('light')} title={lang === 'ar' ? 'الوضع الفاتح' : 'Light mode'} aria-label={lang === 'ar' ? 'الوضع الفاتح' : 'Light mode'} aria-pressed={theme === 'light'}>
                <i className="fas fa-sun"></i>
              </button>
              <button type="button" className={theme === 'dark' ? 'is-active' : ''} onClick={() => setTheme('dark')} title={lang === 'ar' ? 'الوضع الداكن' : 'Dark mode'} aria-label={lang === 'ar' ? 'الوضع الداكن' : 'Dark mode'} aria-pressed={theme === 'dark'}>
                <i className="fas fa-moon"></i>
              </button>
            </div>
          </div>
        </header>
        <main className="sg-accounting-content flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
