
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const SystemGuide: React.FC = () => {
  const { lang } = useTheme();

  return (
    <div className="max-w-5xl mx-auto py-10" dir="rtl">
      {/* Header Section */}
      <div className="text-center mb-16">
        <div className="inline-block px-4 py-1.5 mb-4 bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full text-[10px] font-black uppercase tracking-widest">
          Saber Group Academy CRM
        </div>
        <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-4">دليل استخدام نظام SGCA</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto font-medium text-lg">
          أهلاً بكم في المنصة المتكاملة لإدارة الإيرادات وشؤون الطلاب. هذا الدليل يشرح آلية العمل وصلاحيات المستخدمين.
        </p>
      </div>

      {/* Main Workflow Section */}
      <div className="mb-20">
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center text-xs">1</span>
          دورة حياة الحجز (Workflow)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {[
            { title: "تعريف الكتالوج", desc: "إضافة الكورسات والدبلومات والأسعار الأساسية.", icon: "fa-book" },
            { title: "تجهيز المجموعات", desc: "تحديد المواعيد، الفروع، والمدربين.", icon: "fa-users" },
            { title: "إنشاء الحجز", desc: "تسجيل بيانات العميل وربطها بمندوب المبيعات.", icon: "fa-calendar-plus" },
            { title: "تحصيل الأقساط", desc: "متابعة المبالغ المحصلة والمتبقية بشكل دوري.", icon: "fa-money-bill-transfer" },
          ].map((step, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm relative z-10">
              <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900/30 text-primary-600 rounded-xl flex items-center justify-center mb-4 text-lg">
                <i className={`fas ${step.icon}`}></i>
              </div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">{step.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-medium">{step.desc}</p>
            </div>
          ))}
          {/* Arrow Connectors (Visible on MD+) */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gray-100 dark:bg-gray-800 -z-0"></div>
        </div>
      </div>

      {/* Roles & Permissions Section */}
      <div className="mb-20">
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-8 flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center text-xs">2</span>
          الصلاحيات وأدوار المستخدمين
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Admin */}
          <div className="bg-red-50/30 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-8 rounded-[2.5rem] relative overflow-hidden group">
            <div className="absolute -top-4 -right-4 text-8xl text-red-100 dark:text-red-900/20 opacity-50"><i className="fas fa-shield-halved"></i></div>
            <h3 className="text-red-600 font-black text-xl mb-4">المدير العام (Admin)</h3>
            <ul className="space-y-3">
              {["التحكم الكامل في كافة أجزاء النظام.","إدارة المستخدمين ومنح الصلاحيات.","استخدام أدوات صيانة البيانات (Integrity Tools).","مسح البيانات (Full Reset).","عرض كافة التقارير المالية التفصيلية."].map((p, i) => (
                <li key={i} className="text-xs font-bold text-red-800 dark:text-red-300 flex items-start gap-2">
                  <i className="fas fa-check-circle mt-0.5"></i> {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Supervisor */}
          <div className="bg-primary-50/30 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 p-8 rounded-[2.5rem] relative overflow-hidden">
            <div className="absolute -top-4 -right-4 text-8xl text-primary-100 dark:text-primary-900/20 opacity-50"><i className="fas fa-user-tie"></i></div>
            <h3 className="text-primary-600 font-black text-xl mb-4">المشرف (Supervisor)</h3>
            <ul className="space-y-3">
              {["إدارة المجموعات والكورسات والطلاب.","إصدار المرتجعات (Refunds).","استعادة الحجوزات الملغاة (Restore).","تعديل خطط الأقساط (Installment Plans).","عرض التقارير المالية والتحصيل."].map((p, i) => (
                <li key={i} className="text-xs font-bold text-primary-800 dark:text-primary-300 flex items-start gap-2">
                  <i className="fas fa-check-circle mt-0.5"></i> {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Manager */}
          <div className="bg-gray-50/50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 p-8 rounded-[2.5rem] relative overflow-hidden">
            <div className="absolute -top-4 -right-4 text-8xl text-gray-200 dark:text-gray-600/20 opacity-50"><i className="fas fa-briefcase"></i></div>
            <h3 className="text-gray-900 dark:text-white font-black text-xl mb-4">الموظف (Manager)</h3>
            <ul className="space-y-3">
              {["إنشاء حجوزات جديدة للطلاب.","تسجيل عمليات الدفع والتحصيل.","متابعة المجموعات والطلاب.","عرض تقارير الأداء الشخصي.","* لا يمكنه حذف البيانات أو إصدار مرتجعات."].map((p, i) => (
                <li key={i} className="text-xs font-bold text-gray-600 dark:text-gray-400 flex items-start gap-2">
                  <i className="fas fa-check-circle mt-0.5"></i> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Features Detail */}
      <div className="bg-white dark:bg-gray-800 rounded-[3rem] p-10 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-10 text-center">مميزات نظام SGCA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="flex gap-4">
            <div className="w-12 h-12 shrink-0 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-2xl flex items-center justify-center text-xl"><i className="fas fa-sack-dollar"></i></div>
            <div>
              <h4 className="font-black text-sm mb-2 uppercase tracking-wide">التقارير المالية المزدوجة</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">النظام يدعم تتبع إجمالي المبيعات المتوقعة (Expected) مقابل المبالغ المحصلة فعلياً (Collected) لضمان دقة الحسابات.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 shrink-0 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center text-xl"><i className="fab fa-whatsapp"></i></div>
            <div>
              <h4 className="font-black text-sm mb-2 uppercase tracking-wide">تكامل الواتساب الذكي</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">تتبع حالة إضافة الطلاب لجروبات الواتساب بشكل آلي بمجرد دفع 50% أو أكثر من قيمة الكورس.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-2xl flex items-center justify-center text-xl"><i className="fas fa-chart-line"></i></div>
            <div>
              <h4 className="font-black text-sm mb-2 uppercase tracking-wide">أهداف المبيعات (Targets)</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">إمكانية تحديد مستهدف شهري لكل موظف مبيعات ومتابعة نسبة الإنجاز اللحظية عبر لوحة التقارير.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 shrink-0 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-2xl flex items-center justify-center text-xl"><i className="fas fa-shield-virus"></i></div>
            <div>
              <h4 className="font-black text-sm mb-2 uppercase tracking-wide">سلامة البيانات</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">أدوات مدمجة لإعادة حساب المبالغ المالية وتصحيح أي أخطاء ناتجة عن انقطاع الإنترنت أو مشاكل المزامنة.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center mt-16 text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em]">
        © 2025 Saber Group Academy • Financial Intelligence System
      </div>
    </div>
  );
};

export default SystemGuide;
