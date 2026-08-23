
import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, COLOR_THEMES, ColorThemeId } from '../contexts/ThemeContext';
import { Role, PermissionKey, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { userProfile, logout, hasPermission, setImpersonatedRole, impersonatedRole, setImpersonatedUserId, impersonatedUserId } = useAuth();
  const { lang, setLanguage, theme, colorTheme, toggleTheme, setColorTheme, t } = useTheme();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [impersonationModal, setImpersonationModal] = useState<{ role: Role, users: UserProfile[] } | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const activeClass = "flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-500/30 transition-all transform scale-[1.02]";
  const inactiveClass = "flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all";

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
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

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[40] lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-[50] w-64 transform bg-white dark:bg-gray-800 border-r dark:border-gray-700 transition-transform duration-300 ease-in-out lg:translate-x-0 
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        rtl:left-auto rtl:right-0 rtl:border-l rtl:border-r-0 rtl:lg:translate-x-0 
        ${isSidebarOpen ? 'translate-x-0' : 'rtl:translate-x-full'}`}
      >
        <div className="h-full flex flex-col px-4 py-6">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary-500/20">SG</div>
              <span className="text-xl font-bold tracking-tight dark:text-white">SG ACADEMY</span>
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
        <header className="h-16 bg-white/95 dark:bg-gray-800 backdrop-blur-md border-b dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-[30] transition-colors duration-300">
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

            {/* Color Palette Popover Button */}
            <div className="relative" ref={paletteRef}>
              <button 
                onClick={() => setPaletteOpen(!isPaletteOpen)}
                className={`p-2.5 w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-all ${isPaletteOpen ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-600 scale-105 ring-2 ring-primary-500/30' : 'text-primary-600'}`}
                title="تغيير ثيم ومظهر الموقع (Themes)"
              >
                <i className="fas fa-palette text-base"></i>
              </button>

              {isPaletteOpen && (
                <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-3 w-80 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border dark:border-gray-700 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b dark:border-gray-700">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                      <i className="fas fa-swatchbook text-primary-600"></i>
                      <span className="font-bold text-xs uppercase tracking-wider dark:text-white">
                        {lang === 'ar' ? 'ثيمات ومظهر النظام' : 'System Themes'}
                      </span>
                    </div>
                    <span className="text-[10px] bg-primary-100 dark:bg-primary-900/60 text-primary-600 px-2.5 py-0.5 rounded-full font-bold">
                      8 ثيمات متكاملة
                    </span>
                  </div>

                  {/* Mode Toggle inside Popover */}
                  <div className="mb-4 bg-gray-50 dark:bg-gray-900 p-2.5 rounded-2xl flex items-center justify-between border dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 px-1">
                      {lang === 'ar' ? 'نمط النظام (فاتح / داكن)' : 'System Mode (Light/Dark)'}
                    </span>
                    <button 
                      onClick={toggleTheme}
                      className="flex items-center space-x-2 rtl:space-x-reverse px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 shadow-sm border dark:border-gray-700 text-xs font-bold text-primary-600 hover:scale-105 transition-all"
                    >
                      <i className={`fas ${theme === 'dark' ? 'fa-sun text-amber-400' : 'fa-moon text-indigo-400'}`}></i>
                      <span>{theme === 'dark' ? (lang === 'ar' ? 'داكن' : 'Dark') : (lang === 'ar' ? 'فاتح' : 'Light')}</span>
                    </button>
                  </div>

                  <p className="text-[11px] font-bold text-gray-400 mb-2.5 px-1">
                    {lang === 'ar' ? 'اختر ثيم ألوان النظام بالكامل:' : 'Select full system color theme:'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar p-0.5">
                    {Object.values(COLOR_THEMES).map((ct) => {
                      const isSelected = colorTheme === ct.id;
                      return (
                        <button
                          key={ct.id}
                          onClick={() => {
                            setColorTheme(ct.id as ColorThemeId);
                          }}
                          className={`p-2.5 rounded-2xl text-left rtl:text-right transition-all flex flex-col justify-between border ${
                            isSelected 
                              ? 'bg-primary-50/70 dark:bg-primary-950/50 border-primary-500 shadow-md ring-2 ring-primary-500/20' 
                              : 'bg-gray-50/80 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700/80 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1.5">
                            <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] shadow-sm" style={{ backgroundColor: ct.primaryHex }}>
                                <i className={`fas ${ct.icon}`}></i>
                              </div>
                              <div className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: ct.bgPreviewHex }} title="لون خلفية النظام"></div>
                            </div>
                            {isSelected && (
                              <i className="fas fa-check-circle text-primary-600 text-xs animate-in zoom-in"></i>
                            )}
                          </div>
                          <span className="font-bold text-xs text-gray-800 dark:text-gray-100 truncate block">
                            {lang === 'ar' ? ct.nameAr.split(' ')[0] : ct.nameEn}
                          </span>
                          <span className="text-[9px] text-gray-400 font-semibold truncate block mt-0.5">
                            {lang === 'ar' ? ct.badgeAr : ct.badgeEn}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button onClick={toggleTheme} className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500" title="تبديل الإضاءة">
              <i className={`fas ${theme === 'dark' ? 'fa-sun text-amber-400' : 'fa-moon text-indigo-400'}`}></i>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
