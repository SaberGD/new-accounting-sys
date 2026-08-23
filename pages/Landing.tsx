import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const Landing: React.FC = () => {
  const { theme, toggleTheme, lang, setLanguage } = useTheme();
  const { currentUser, userProfile, gateStatus } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'analytics' | 'bookings' | 'search' | 'security'>('analytics');

  // If user is already logged in and authorized, provide a quick banner to jump straight to Dashboard
  const isLoggedIn = currentUser && userProfile && gateStatus === 'allowed';

  const isAr = lang === 'ar';

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans relative selection:bg-primary-500 selection:text-white`}>
      
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-primary-600/15 via-indigo-600/10 to-transparent blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -z-10"></div>

      {/* TOP NAVBAR */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl transition-all duration-200 border-b ${theme === 'dark' ? 'bg-[#0b0f19]/80 border-slate-800/80' : 'bg-white/80 border-slate-200/80'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3.5 group">
            <div className="w-11 h-11 bg-gradient-to-tr from-primary-600 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary-500/30 group-hover:scale-105 transition-transform duration-300">
              SG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg md:text-xl tracking-tight bg-gradient-to-r from-slate-900 via-primary-700 to-indigo-900 dark:from-white dark:via-primary-300 dark:to-indigo-300 bg-clip-text text-transparent">
                  SABER GROUP
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-primary-500/15 text-primary-600 dark:text-primary-300 border border-primary-500/20">
                  SYSTEM
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                {isAr ? 'نظام الحسابات والإيرادات الموحد' : 'Enterprise Accounting & Revenue System'}
              </p>
            </div>
          </Link>

          {/* Center Navigation Links (Hidden on small screens) */}
          <nav className="hidden lg:flex items-center gap-8 text-xs font-bold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {isAr ? 'المميزات والموديولات' : 'Features & Modules'}
            </a>
            <a href="#demo-preview" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {isAr ? 'عرض الواجهة' : 'System Preview'}
            </a>
            <a href="#security" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {isAr ? 'الأمان والرقابة' : 'Security & Audit'}
            </a>
            <a href="#stats" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {isAr ? 'إحصائيات النظام' : 'System Stats'}
            </a>
          </nav>

          {/* Controls & Actions */}
          <div className="flex items-center gap-2.5">
            
            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                theme === 'dark' 
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
              }`}
              title={isAr ? 'Switch to English' : 'التحويل للغة العربية'}
            >
              <i className="fas fa-globe text-primary-500"></i>
              <span>{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Dark / Light Theme Switcher */}
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl transition-all border ${
                theme === 'dark' 
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-amber-400 border-slate-700' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} text-sm`}></i>
            </button>

            {/* Login / Dashboard Button */}
            {isLoggedIn ? (
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <i className="fas fa-gauge-high"></i>
                <span>{isAr ? 'لوحة التحكم' : 'Go to Dashboard'}</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 bg-gradient-to-r from-primary-600 via-indigo-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-primary-600/30 transition-all flex items-center gap-2 group"
              >
                <i className="fas fa-right-to-bracket text-xs group-hover:translate-x-0.5 transition-transform"></i>
                <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          
          {/* Top Pill Announcement */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-black bg-gradient-to-r from-primary-500/10 via-indigo-500/10 to-purple-500/10 border border-primary-500/30 text-primary-600 dark:text-primary-300 shadow-sm animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>{isAr ? '✨ الإصدار المالي المطور v3.5 - نظام إدارة المبيعات والإيرادات القيادي' : '✨ Enterprise Accounting & Financial Suite v3.5 Live'}</span>
          </div>

          {/* Hero Main Headline */}
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15]">
              {isAr ? (
                <>
                  النظام المحاسبي والمالي الموحد{' '}
                  <span className="bg-gradient-to-r from-primary-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                    لمجموعة صابر SGCA
                  </span>
                </>
              ) : (
                <>
                  SABER GROUP Unified Enterprise{' '}
                  <span className="bg-gradient-to-r from-primary-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                    Financial Engine
                  </span>
                </>
              )}
            </h1>

            <p className="text-base sm:text-lg md:text-xl font-semibold text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
              {isAr ? (
                'منظومة سحابية متكاملة للتحكم الشامل بالإيرادات والمقبوضات، متابعة تحصيل الأقساط، إدارة الحجوزات والدبلومات، والاستعلام الذكي الفوري بأعلى مستويات الدقة والأمان.'
              ) : (
                'All-in-one cloud financial intelligence platform to automate revenue tracking, installment collection, academy course bookings, and real-time smart audit trail.'
              )}
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-primary-600 via-indigo-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white rounded-2xl font-black text-sm md:text-base shadow-2xl shadow-primary-600/40 hover:shadow-primary-600/60 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 group"
            >
              <span>{isAr ? 'الدخول إلى النظام المالي' : 'Launch System Login'}</span>
              <i className={`fas ${isAr ? 'fa-arrow-left' : 'fa-arrow-right'} text-sm group-hover:translate-x-1 transition-transform`}></i>
            </button>

            <a
              href="#demo-preview"
              className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm md:text-base transition-all border flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-sm'
              }`}
            >
              <i className="fas fa-laptop-code text-primary-500"></i>
              <span>{isAr ? 'استكشاف إمكانيات النظام' : 'Explore Platform Features'}</span>
            </a>
          </div>

          {/* Trust Badges */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-xs font-bold text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <i className="fas fa-shield-halved text-emerald-500 text-base"></i>
              <span>{isAr ? 'حماية مشفرة وصلاحيات دقيقة' : 'Bank-Grade Security'}</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="fas fa-bolt text-amber-500 text-base"></i>
              <span>{isAr ? 'مزامنة لحظية وتدفق نقدي مباشر' : 'Real-Time Cash Flow'}</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="fas fa-magnifying-glass-chart text-indigo-500 text-base"></i>
              <span>{isAr ? 'استعلام ذكي وتطابق تلقائي' : 'Smart Fuzzy Search'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE SYSTEM PREVIEW / DASHBOARD SHOWCASE */}
      <section id="demo-preview" className="py-12 md:py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center space-y-3 mb-10">
            <h2 className="text-xs font-black tracking-widest text-primary-500 uppercase">
              {isAr ? 'معاينة الواجهة التفاعلية' : 'LIVE SYSTEM INTERFACE'}
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black">
              {isAr ? 'شاشة تحكم مالية قيادية مصممة لاتخاذ القرار' : 'Executive Financial Command Center'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-semibold">
              {isAr ? 'تنقل بين الموديولات للتعرف على كفاءة واجهات النظام المحاسبي لمجموعة صابر.' : 'Explore the live preview tabs below to see how SGCA streamlines financial workflows.'}
            </p>
          </div>

          {/* Preview Container Mockup */}
          <div className={`rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl transition-all ${
            theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            
            {/* Top Mock Window Bar */}
            <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
              theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-mono font-bold text-slate-500 mr-2 ml-2">
                  app.saber-group.com/dashboard
                </span>
              </div>

              {/* Module Switcher Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'analytics'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <i className="fas fa-chart-line mr-1.5 ml-1.5"></i>
                  <span>{isAr ? 'الإيرادات والتحليلات' : 'Analytics & Revenue'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('bookings')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'bookings'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <i className="fas fa-graduation-cap mr-1.5 ml-1.5"></i>
                  <span>{isAr ? 'الحجوزات والأقساط' : 'Bookings & Installments'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('search')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'search'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <i className="fas fa-magnifying-glass-chart mr-1.5 ml-1.5"></i>
                  <span>{isAr ? 'الاستعلام الذكي 360°' : 'Smart Search 360'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('security')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'security'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  <i className="fas fa-user-shield mr-1.5 ml-1.5"></i>
                  <span>{isAr ? 'الصلاحيات والسجلات' : 'Audit & Security'}</span>
                </button>
              </div>
            </div>

            {/* Mock Preview Content Area */}
            <div className="p-6 md:p-8 space-y-6">
              
              {activeTab === 'analytics' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20">
                      <span className="text-[11px] font-bold text-blue-500 dark:text-blue-400 block mb-1">
                        إجمالي الإيرادات المسجلة
                      </span>
                      <p className="text-2xl font-black text-blue-600 dark:text-blue-300">1,245,800 ج.م</p>
                      <span className="text-[10px] text-emerald-500 font-bold">↑ +14.2% مقارنة بالشهر السابق</span>
                    </div>

                    <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                      <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400 block mb-1">
                        نسبة تحصيل الأقساط
                      </span>
                      <p className="text-2xl font-black text-emerald-600 dark:text-emerald-300">98.4%</p>
                      <span className="text-[10px] text-emerald-500 font-bold">✅ معدل تحصيل ممتاز</span>
                    </div>

                    <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                      <span className="text-[11px] font-bold text-purple-500 dark:text-purple-400 block mb-1">
                        الحجوزات والمجموعات النشطة
                      </span>
                      <p className="text-2xl font-black text-purple-600 dark:text-purple-300">482 حجز / 38 مجموعة</p>
                      <span className="text-[10px] text-purple-400 font-bold">📚 ممتدة على 4 فروع</span>
                    </div>

                    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                      <span className="text-[11px] font-bold text-amber-500 dark:text-amber-400 block mb-1">
                        المقبوضات اليومية النقدية
                      </span>
                      <p className="text-2xl font-black text-amber-600 dark:text-amber-300">42,500 ج.م</p>
                      <span className="text-[10px] text-amber-400 font-bold">⚡ مطابقة تلقائية للخزينة</span>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-1 text-right">
                      <h4 className="font-black text-base text-white">تحليلات المبيعات والإيرادات اللحظية</h4>
                      <p className="text-xs text-slate-400">تقارير بيانية تفاعلية تدعم التصدير الفوري لمستندات Excel و PDF مع فلترة الفروع ومسؤولي المبيعات.</p>
                    </div>
                    <button
                      onClick={() => navigate('/login')}
                      className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold text-xs shrink-0"
                    >
                      تجربة التقرير الكامل
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'bookings' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>دبلومة المحاسبة المالية الشاملة (دبلومة مكثفة)</span>
                      <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">مؤهلة للتفعيل (مستكفي 50%)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 w-3/4"></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                      <span>المدفوع: 3,750 ج.م من أصل 5,000 ج.م</span>
                      <span>النسبة: 75%</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>كورس التحليل المالي والإكسل المتقدم</span>
                      <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 rounded-full">قسط قادم خلال 3 أيام</span>
                    </div>
                    <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 w-1/2"></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                      <span>المدفوع: 1,500 ج.م من أصل 3,000 ج.م</span>
                      <span>النسبة: 50%</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'search' && (
                <div className="space-y-4 animate-fade-in text-center py-4">
                  <div className="max-w-xl mx-auto relative">
                    <input
                      type="text"
                      readOnly
                      value="مصطفي احمد - 01012345678"
                      className="w-full py-3.5 px-12 bg-slate-800 text-slate-200 rounded-2xl border border-primary-500/40 text-xs font-bold font-mono"
                    />
                    <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-primary-400"></i>
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-md">
                      تطابق فوري
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto font-semibold">
                    محرك البحث يبحث تلقائياً بالاسم المطاطي، أرقام الواتساب، رقم الوصل، كود الحجز، وتفاصيل الأقساط في أقل من 50 مللي ثانية!
                  </p>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in text-xs">
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/60 space-y-2">
                    <i className="fas fa-user-lock text-primary-400 text-lg"></i>
                    <h5 className="font-bold text-white">صلاحيات أدوار حازمة</h5>
                    <p className="text-slate-400 text-[11px]">عزل تام بين موظفي المبيعات، المحاسبين، ومديري الفروع مع منع التداخل.</p>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/60 space-y-2">
                    <i className="fas fa-list-check text-indigo-400 text-lg"></i>
                    <h5 className="font-bold text-white">سجل حركات رقمي محمي</h5>
                    <p className="text-slate-400 text-[11px]">تسجيل دقيق لكل عمليات الإضافة، التعديل، التحويل، والإلغاء بالتاريخ والمستخدم.</p>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/60 space-y-2">
                    <i className="fas fa-cloud-arrow-up text-teal-400 text-lg"></i>
                    <h5 className="font-bold text-white">نسخ احتياطي واستعادت مستندات</h5>
                    <p className="text-slate-400 text-[11px]">حفظ تلقائي لكافة البيانات واستمارات التأكيد على خوادم سحابية آمنة.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CORE MODULES & FEATURES GRID */}
      <section id="features" className="py-16 md:py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="text-center space-y-3">
            <h2 className="text-xs font-black tracking-widest text-primary-500 uppercase">
              {isAr ? 'منظومة متكاملة' : 'CORE MODULES & FEATURES'}
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black">
              {isAr ? 'كل ما تحتاجه لإدارة مالية وأكاديمية متكاملة' : 'Everything You Need for Enterprise Accounting'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-semibold">
              {isAr 
                ? 'تم تصميم موديولات النظام خصيصاً لتلبية متطلبات الأكاديميات ومجموعات التدريب والمؤسسات المالية بكفاءة عالية.' 
                : 'Designed specifically to manage academy sales pipelines, revenue tracking, and group installments.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Feature 1 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-blue-500/30">
                <i className="fas fa-chart-pie"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'إدارة الإيرادات والتنقل النقدي' : 'Revenue & Cash Flow Engine'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'متابعة المقبوضات الخزينية اليومية، مقارنة الإيرادات بين الفروع، وتصدير التقارير الرسمية بدقة متناهية.' 
                  : 'Track daily treasury inflows, reconcile cash balances across branches, and generate certified financial statements.'}
              </p>
            </div>

            {/* Feature 2 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/30">
                <i className="fas fa-file-invoice-dollar"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'نظام الأقساط والتفعيل الذكي (50%)' : 'Smart Installment & Activation'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'فحص تلقائي لمستكفي سداد 50% لمنح أهلية التفعيل، مع متابعة مواعيد استحقاق الأقساط والتعليقات.' 
                  : 'Automated 50% payment threshold verification to grant course activation, complete with delay alerts.'}
              </p>
            </div>

            {/* Feature 3 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-purple-600 to-pink-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-purple-500/30">
                <i className="fas fa-magnifying-glass-chart"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'الاستعلام الذكي الموحد 360°' : 'Unified Smart Search Engine'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'محرك بحث يستوعب أخطاء الكتابة العربية (أ/ا، ة/ه، ى/ي)، والبحث بالهاتف أو رقم الإيصال لعرض ملف الطالب كاملاً.' 
                  : 'Fuzzy logic search that normalizes Arabic characters and phone formats to display complete student financial profiles instantly.'}
              </p>
            </div>

            {/* Feature 4 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-amber-600 to-orange-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-amber-500/30">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'كتالوج الكورسات والمجموعات' : 'Course & Diploma Catalog'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'تنسيق الدورات والدبلومات مع الخصومات المباشرة، الأكواد الترويجية، وجدولة المجموعات الدراسية لكل فرع.' 
                  : 'Manage training programs, diploma pricing tiers, active promo codes, and group schedules across branches.'}
              </p>
            </div>

            {/* Feature 5 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-blue-700 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/30">
                <i className="fas fa-wpforms"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'بوابة التأكيد الإلكترونية' : 'Public Confirmation Portal'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'رابط مباشر للطلاب لتأكيد الحجز، رفع صورة المحفظة النقدية، وتحديد الاسم بالإنجليزية ورغبة الحضور.' 
                  : 'Self-service student booking confirmation portal for uploading payment receipts and attendance preferences.'}
              </p>
            </div>

            {/* Feature 6 */}
            <div className={`p-8 rounded-3xl border transition-all hover:-translate-y-1 space-y-4 ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800 hover:border-primary-500/50' : 'bg-white border-slate-200 hover:border-primary-400 shadow-sm hover:shadow-md'
            }`}>
              <div className="w-14 h-14 bg-gradient-to-tr from-teal-600 to-emerald-700 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-teal-500/30">
                <i className="fas fa-shield-halved"></i>
              </div>
              <h4 className="text-lg font-black">{isAr ? 'سجل العمليات والرقابة المشددة' : 'Audit Logs & Permissions'}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isAr 
                  ? 'سجل غير قابل للتلاعب يرصد جميع العمليات، التعديلات المالية، والإلغاءات لضمان أعلى مستويات النزاهة.' 
                  : 'Immutable digital audit log tracking every user interaction, price edit, and cancellation for full control.'}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section id="stats" className="py-16 bg-gradient-to-r from-primary-900 via-indigo-950 to-slate-950 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            
            <div className="space-y-1">
              <span className="text-3xl sm:text-5xl font-black text-primary-400">99.9%</span>
              <p className="text-xs sm:text-sm font-bold text-slate-300">
                {isAr ? 'جاهزية واستقرار النظام' : 'System Uptime & Reliability'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-3xl sm:text-5xl font-black text-emerald-400">100%</span>
              <p className="text-xs sm:text-sm font-bold text-slate-300">
                {isAr ? 'مطابقة للبحث الذكي العربي' : 'Fuzzy Arabic Accuracy'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-3xl sm:text-5xl font-black text-purple-400">360°</span>
              <p className="text-xs sm:text-sm font-bold text-slate-300">
                {isAr ? 'رؤية مالية وشاملة' : 'Financial Visibility'}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-3xl sm:text-5xl font-black text-amber-400">0%</span>
              <p className="text-xs sm:text-sm font-bold text-slate-300">
                {isAr ? 'تكرار أو خطأ محاسبي' : 'Accounting Redundancy'}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* CTA FOOTER BANNER */}
      <section className="py-20 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-primary-600 via-indigo-600 to-purple-700 text-white rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-6 relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <h3 className="text-2xl sm:text-4xl font-black">
                {isAr ? 'هل أنت مستعد لبدء العمل على المنظومة المالية؟' : 'Ready to Access the SABER GROUP System?'}
              </h3>
              <p className="text-xs sm:text-sm max-w-2xl mx-auto text-primary-100 font-medium">
                {isAr 
                  ? 'سجّل دخولك الآن باستخدام حسابك المصرح به للوصول إلى لوحة التحكم، الحسابات، والتقارير المالية.' 
                  : 'Sign in with your authorized credentials to manage bookings, installments, and executive reports.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => navigate('/login')}
                  className="px-8 py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-black text-sm shadow-xl transition-all hover:scale-105 inline-flex items-center gap-2"
                >
                  <i className="fas fa-lock text-primary-600"></i>
                  <span>{isAr ? 'تسجيل الدخول للنظام المالي' : 'Secure Login Portal'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className={`py-8 border-t text-xs font-bold transition-colors ${
        theme === 'dark' ? 'bg-[#080b12] border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-600'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-primary-600 rounded-lg flex items-center justify-center text-white font-black text-[10px]">
              SG
            </div>
            <span>© {new Date().getFullYear()} SABER GROUP ACCOUNTING SYSTEM (SGCA). All Rights Reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{isAr ? 'النظام يعمل بكفاءة 100%' : 'All Systems Operational'}</span>
            </span>
            <button
              onClick={() => navigate('/login')}
              className="hover:text-primary-500 transition-colors"
            >
              {isAr ? 'بوابة الدخول' : 'Sign In'}
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default Landing;
