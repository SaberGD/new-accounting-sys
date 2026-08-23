import React, { useState, useEffect } from 'react';
import { 
  getBookingFormSubmissions, 
  searchBookingFormSubmissions,
  getBookingFormTemplate, 
  saveBookingFormTemplate, 
  updateBookingFormSubmissionStatus, 
  deleteBookingFormSubmission,
  DEFAULT_BOOKING_FORM_TEMPLATE 
} from '../services/firestore';
import { BookingFormSubmission, BookingFormTemplate, BookingFormField } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export const BookingForms: React.FC = () => {
  const { userProfile, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'submissions' | 'builder'>('submissions');
  const [submissions, setSubmissions] = useState<BookingFormSubmission[]>([]);
  const [template, setTemplate] = useState<BookingFormTemplate>(DEFAULT_BOOKING_FORM_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'imported' | 'archived'>('all');
  
  // Selected Submission Modal
  const [selectedSubmission, setSelectedSubmission] = useState<BookingFormSubmission | null>(null);

  // Form Builder Editing State
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTermsLink, setEditTermsLink] = useState('');
  const [editFields, setEditFields] = useState<BookingFormField[]>([]);
  const [toastMessage, setToastMessage] = useState('');

  const [isSearchResult, setIsSearchResult] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'scholarship'>('all');

  const getPublicFormUrl = (route: string = 'confirm-booking') => {
    if (typeof window === 'undefined') return `/#/${route}`;
    const origin = window.location.origin;
    const path = window.location.pathname.replace(/\/(confirm-booking|confirm-scholarship|booking-form|scholarship-form|booking-forms)?\/?$/, '');
    return `${origin}${path}/#/${route}`;
  };
  const publicFormUrl = getPublicFormUrl('confirm-booking');
  const publicScholarshipUrl = getPublicFormUrl('confirm-scholarship');

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setIsSearchResult(false);
      loadData();
      return;
    }
    setLoading(true);
    setIsSearchResult(true);
    try {
      const results = await searchBookingFormSubmissions(searchQuery);
      setSubmissions(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [subs, tmpl] = await Promise.all([
        getBookingFormSubmissions(),
        getBookingFormTemplate('default')
      ]);
      setSubmissions(subs);
      setTemplate(tmpl);
      
      setEditTitle(tmpl.title || DEFAULT_BOOKING_FORM_TEMPLATE.title);
      setEditDescription(tmpl.description || DEFAULT_BOOKING_FORM_TEMPLATE.description || '');
      setEditTermsLink(tmpl.termsLink || DEFAULT_BOOKING_FORM_TEMPLATE.termsLink);
      setEditFields(tmpl.fields || DEFAULT_BOOKING_FORM_TEMPLATE.fields);
    } catch (error) {
      console.error('Error loading booking forms data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicFormUrl);
    showToast('تم نسخ رابط استمارة تأكيد الحجز إلى الحافظة بنجاح 📋');
  };

  const handleCopyScholarshipLink = () => {
    navigator.clipboard.writeText(publicScholarshipUrl);
    showToast('تم نسخ رابط استمارة المنحة المجانية إلى الحافظة بنجاح 🎓');
  };

  const handleSaveTemplate = async () => {
    try {
      setSavingTemplate(true);
      const updatedTmpl: BookingFormTemplate = {
        ...template,
        title: editTitle.trim(),
        description: editDescription.trim(),
        termsLink: editTermsLink.trim(),
        fields: editFields,
        updatedAt: new Date().toISOString()
      };
      await saveBookingFormTemplate(updatedTmpl);
      setTemplate(updatedTmpl);
      showToast('تم حفظ تعديلات استمارة التأكيد ورابط الشروط والأحكام بنجاح ✅');
    } catch (err) {
      console.error('Error saving template:', err);
      alert('حدث خطأ أثناء حفظ النموذج.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAddField = (type: BookingFormField['type'] = 'text') => {
    const hasOptions = type === 'select' || type === 'radio' || type === 'checkbox';
    const newField: BookingFormField = {
      id: `field_${Date.now()}`,
      label: 'سؤال جديد',
      type: type,
      placeholder: '',
      required: false,
      enabled: true,
      options: hasOptions ? ['خيار 1', 'خيار 2'] : undefined
    };
    setEditFields([...editFields, newField]);
  };

  const handleRemoveField = (fieldId: string) => {
    const targetField = editFields.find(f => f.id === fieldId);
    const confirmMsg = targetField?.systemKey
      ? `هل أنت متأكد من حذف هذا السؤال الأساسي (${targetField.label})؟\n(يمكنك استعادة الأسئلة الافتراضية في أي وقت من زر استعادة الأسئلة).`
      : `هل أنت متأكد من حذف هذا السؤال (${targetField?.label || 'السؤال'})؟`;
    
    if (!window.confirm(confirmMsg)) return;
    setEditFields(editFields.filter(f => f.id !== fieldId));
    showToast('تم حذف السؤال بنجاح 🗑️');
  };

  const handleResetDefaultFields = () => {
    if (!window.confirm('هل تريد استعادة جميع الأسئلة والأساسية الافتراضية للنموذج؟ سيتم إلغاء التغييرات غير المحفوظة.')) return;
    setEditFields(DEFAULT_BOOKING_FORM_TEMPLATE.fields);
    showToast('تمت استعادة الأسئلة الافتراضية بنجاح ✅');
  };

  const handleUpdateField = (fieldId: string, updates: Partial<BookingFormField>) => {
    setEditFields(editFields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
  };

  const handleUpdateFieldType = (fieldId: string, newType: BookingFormField['type']) => {
    const hasOptions = newType === 'select' || newType === 'radio' || newType === 'checkbox';
    setEditFields(editFields.map(f => {
      if (f.id !== fieldId) return f;
      return {
        ...f,
        type: newType,
        options: hasOptions ? (f.options && f.options.length > 0 ? f.options : ['خيار 1', 'خيار 2']) : undefined
      };
    }));
  };

  const handleAddOptionToField = (fieldId: string, optionText: string) => {
    if (!optionText.trim()) return;
    setEditFields(editFields.map(f => {
      if (f.id !== fieldId) return f;
      const currentOpts = f.options || [];
      return {
        ...f,
        options: [...currentOpts, optionText.trim()]
      };
    }));
  };

  const handleRemoveOptionFromField = (fieldId: string, optionIndex: number) => {
    setEditFields(editFields.map(f => {
      if (f.id !== fieldId) return f;
      const currentOpts = f.options || [];
      return {
        ...f,
        options: currentOpts.filter((_, idx) => idx !== optionIndex)
      };
    }));
  };

  const handleUpdateOptionText = (fieldId: string, optionIndex: number, newText: string) => {
    setEditFields(editFields.map(f => {
      if (f.id !== fieldId) return f;
      const currentOpts = [...(f.options || [])];
      currentOpts[optionIndex] = newText;
      return {
        ...f,
        options: currentOpts
      };
    }));
  };

  const handleToggleStatus = async (sub: BookingFormSubmission, newStatus: 'new' | 'imported' | 'archived') => {
    try {
      await updateBookingFormSubmissionStatus(sub.id, newStatus, undefined, userProfile?.displayName);
      setSubmissions(submissions.map(s => s.id === sub.id ? { ...s, status: newStatus } : s));
      showToast('تم تحديث حالة الاستجابة بنجاح');
      if (selectedSubmission?.id === sub.id) {
        setSelectedSubmission({ ...selectedSubmission, status: newStatus });
      }
    } catch (error) {
      console.error('Error updating submission status:', error);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('هل أنت تأكد من حذف هذه الاستجابة نهائياً؟')) return;
    try {
      await deleteBookingFormSubmission(id);
      setSubmissions(submissions.filter(s => s.id !== id));
      if (selectedSubmission?.id === id) setSelectedSubmission(null);
      showToast('تم حذف الاستجابة');
    } catch (error) {
      console.error('Error deleting submission:', error);
    }
  };

  const handleImportToBooking = (sub: BookingFormSubmission) => {
    navigate('/bookings', { state: { importFormSubmission: sub } });
  };

  const filteredSubmissions = submissions.filter(s => {
    const isScholarship = s.isScholarship || s.formType === 'scholarship' || s.paymentMethod === 'free_grant';
    if (typeFilter === 'standard' && isScholarship) return false;
    if (typeFilter === 'scholarship' && !isScholarship) return false;

    const matchesSearch = 
      s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery) ||
      s.whatsapp.includes(searchQuery) ||
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.productName.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && s.status === statusFilter;
  });

  const newCount = submissions.filter(s => s.status === 'new').length;
  const importedCount = submissions.filter(s => s.status === 'imported').length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-5 z-50 bg-emerald-600 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400 animate-in slide-in-from-top-2 duration-300">
          {toastMessage}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-primary-600 dark:text-primary-400 mb-1">
            <i className="fas fa-wpforms"></i>
            <span>تأكيد البيانات والأستجابات</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            استجابات نماذج تأكيد الحجز (Confirmation Forms)
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            إدارة وتتبع استجابات الطلاب بعد الحجز، واستيراد بيانات العميل بنقرة واحدة للحجوزات.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Standard Form Links */}
          <button
            onClick={handleCopyLink}
            className="px-3.5 py-2.5 bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-2xl font-black text-xs border border-primary-200 dark:border-primary-800 flex items-center gap-1.5 transition-all"
            title="نسخ رابط استمارة تأكيد الحجز العادية"
          >
            <i className="fas fa-copy text-primary-600"></i>
            <span>نسخ رابط الفورم</span>
          </button>

          <a
            href={publicFormUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black text-xs shadow-md shadow-primary-600/20 flex items-center gap-1.5 transition-all"
            title="معاينة استمارة تأكيد الحجز"
          >
            <i className="fas fa-external-link-alt"></i>
            <span>معاينة</span>
          </a>

          {/* Scholarship Form Links */}
          <button
            onClick={handleCopyScholarshipLink}
            className="px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-2xl font-black text-xs border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 transition-all"
            title="نسخ رابط استمارة التقديم على المنحة المجانية"
          >
            <i className="fas fa-graduation-cap text-emerald-600"></i>
            <span>نسخ رابط المنحة 🎓</span>
          </button>

          <a
            href={publicScholarshipUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
            title="معاينة استمارة المنحة المجانية"
          >
            <i className="fas fa-external-link-alt"></i>
            <span>معاينة المنحة</span>
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`pb-3 px-5 font-black text-xs uppercase tracking-wide flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'submissions'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
          }`}
        >
          <i className="fas fa-list-check"></i>
          <span>استجابات الطلاب ({submissions.length})</span>
          {newCount > 0 && (
            <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px]">
              {newCount} جديد
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('builder')}
          className={`pb-3 px-5 font-black text-xs uppercase tracking-wide flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'builder'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
          }`}
        >
          <i className="fas fa-sliders"></i>
          <span>تعديل إعدادات ونصوص النموذج (Form Builder)</span>
        </button>
      </div>

      {/* TAB 1: SUBMISSIONS LIST */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* 48-Hour Notice Badge */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
            <div className="flex items-center gap-2">
              <i className="fas fa-clock text-amber-600 dark:text-amber-400"></i>
              <span>
                {isSearchResult
                  ? `نتائج البحث عن: "${searchQuery}"`
                  : 'توفير القراءات: يتم عرض استجابات الطلاب المسجلين خلال آخر 48 ساعة فقط تلقائياً.'}
              </span>
            </div>
            {isSearchResult && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchResult(false);
                  loadData();
                }}
                className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 underline text-[11px] font-black"
              >
                العودة لآخر 48 ساعة
              </button>
            )}
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-lg">
              <div className="relative flex-1">
                <i className="fas fa-search absolute right-3 top-3 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="ابحث باسم الطالب، الموبايل، الواتساب، الكورس..."
                  className="w-full pr-9 pl-8 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold dark:text-white focus:outline-none focus:border-primary-500"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value && isSearchResult) {
                      setIsSearchResult(false);
                      loadData();
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      if (isSearchResult) {
                        setIsSearchResult(false);
                        loadData();
                      }
                    }}
                    className="absolute left-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer disabled:opacity-50"
              >
                <i className="fas fa-magnifying-glass"></i>
                <span>بحث</span>
              </button>
            </form>

            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl w-full sm:w-auto text-xs font-bold">
                <span className="px-2 text-gray-400">النوع:</span>
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    typeFilter === 'all' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setTypeFilter('standard')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    typeFilter === 'standard' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  حجز عادي
                </button>
                <button
                  onClick={() => setTypeFilter('scholarship')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    typeFilter === 'scholarship' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  منح مجانية 🎓
                </button>
              </div>

              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl w-full sm:w-auto text-xs font-bold">
                <span className="px-2 text-gray-400">الحالة:</span>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'all' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  الكل ({submissions.length})
                </button>
                <button
                  onClick={() => setStatusFilter('new')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'new' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  جديد ({newCount})
                </button>
                <button
                  onClick={() => setStatusFilter('imported')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'imported' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  تم الاستيراد ({importedCount})
                </button>
              </div>
            </div>
          </div>

          {/* Submissions Table */}
          {loading ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-xs font-bold text-gray-500">جاري تحميل الاستجابات...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 space-y-3">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-full flex items-center justify-center mx-auto text-2xl">
                <i className="fas fa-inbox"></i>
              </div>
              <p className="text-sm font-black text-gray-700 dark:text-gray-300">لا توجد استجابات مطابقة للبحث</p>
              <p className="text-xs text-gray-400">شارك رابط الاستمارة مع الطلاب بعد الحجز لتأكيد بياناتهم بنفسهم.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-black border-b border-gray-100 dark:border-gray-700">
                    <tr>
                      <th className="p-4">بيانات العميل</th>
                      <th className="p-4">الكورس المحجوز</th>
                      <th className="p-4">المدفوع ووسيلة الدفع</th>
                      <th className="p-4">الشهادة والواتساب</th>
                      <th className="p-4">الحالة والتاريخ</th>
                      <th className="p-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 font-medium">
                    {filteredSubmissions.map(sub => {
                      const isSchol = sub.isScholarship || sub.formType === 'scholarship' || sub.paymentMethod === 'free_grant';
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="p-4">
                            <div className="font-black text-gray-900 dark:text-white text-sm flex items-center gap-1.5">
                              <span>{sub.customerName}</span>
                              {isSchol && (
                                <span className="inline-block px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md font-black text-[10px]">
                                  🎓 منحة مجانية
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 font-bold dir-ltr text-right">{sub.phone}</div>
                            {sub.email && (
                              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold dir-ltr text-right">{sub.email}</div>
                            )}
                          </td>

                          <td className="p-4">
                            <span className="font-black text-primary-600 dark:text-primary-400 block">{sub.productName}</span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {sub.attendanceMethod === 'online' ? '🌐 أونلاين' : '🏢 أوفلاين بالمقر'}
                            </span>
                          </td>

                          <td className="p-4">
                            {isSchol ? (
                              <div>
                                <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs block">
                                  منحة مجانية (0 ج.م)
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold">بدون رسوم تحويل</span>
                              </div>
                            ) : (
                              <>
                                <div className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                  {sub.paidAmount} EGP
                                </div>
                                <div className="text-[10px] text-gray-500 font-bold">
                                  وسيلة: {sub.paymentMethod}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  من رقم: {sub.transferSenderNumber}
                                </div>
                                {sub.installmentPlan && (
                                  <div className="text-[10px] text-primary-600 dark:text-primary-400 font-bold mt-0.5">
                                    التقسيط: {
                                      sub.installmentPlan === '10_days' ? 'كل 10 أيام (4 أقساط)' :
                                      sub.installmentPlan === '15_days' ? 'كل 15 يوم (3 أقساط)' :
                                      sub.installmentPlan === '60_days' ? 'خلال 60 يوم (قسطين)' :
                                      sub.installmentPlan === 'custom_cs' ? 'اتفاق خاص مع المبيعات' : 'كامل المبلغ'
                                    }
                                  </div>
                                )}
                              </>
                            )}
                          </td>

                        <td className="p-4">
                          <div className="text-[11px] font-bold text-gray-800 dark:text-gray-200">
                            {sub.englishName}
                          </div>
                          <div className="text-[11px] font-bold text-emerald-600 dir-ltr text-right">
                            {sub.whatsapp}
                          </div>
                        </td>

                        <td className="p-4">
                          {sub.status === 'new' && (
                            <span className="inline-block px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 rounded-full font-black text-[10px] border border-amber-300 dark:border-amber-700 mb-1">
                              جديد
                            </span>
                          )}
                          {sub.status === 'imported' && (
                            <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 rounded-full font-black text-[10px] border border-emerald-300 dark:border-emerald-700 mb-1">
                              تم الاستيراد لحجز
                            </span>
                          )}
                          {sub.status === 'archived' && (
                            <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-full font-black text-[10px] mb-1">
                              مؤرشف
                            </span>
                          )}
                          <div className="text-[10px] text-gray-400">
                            {new Date(sub.submittedAt).toLocaleDateString('ar-EG')}
                          </div>
                        </td>

                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSubmission(sub)}
                              title="عرض كافة التفاصيل"
                              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-all"
                            >
                              <i className="fas fa-eye text-xs"></i>
                            </button>

                            <button
                              onClick={() => handleImportToBooking(sub)}
                              title="استيراد وإنشاء حجز"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-sm flex items-center gap-1 transition-all"
                            >
                              <i className="fas fa-file-import"></i>
                              <span>استيراد</span>
                            </button>

                            <button
                              onClick={() => handleDeleteSubmission(sub.id)}
                              title="حذف الاستجابة"
                              className="p-2 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl font-bold transition-all"
                            >
                              <i className="fas fa-trash text-xs"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FORM BUILDER & SETTINGS */}
      {activeTab === 'builder' && (
        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-100 dark:border-gray-700 space-y-6 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-pen-to-square text-primary-600"></i>
              <span>إعدادات نموذج تأكيد الحجز ورابط التعاقد</span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              يمكنك تعديل عنوان النموذج، الوصف، رابط ملف الشروط والأحكام (PDF)، وإضافة أو تعديل الأسئلة المطلوبة من الطالب.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-700 dark:text-gray-300 block">
                عنوان الاستمارة (Title)
              </label>
              <input
                type="text"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold dark:text-white"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
            </div>

            {/* Terms Link Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-emerald-600 dark:text-emerald-400 block flex items-center gap-1">
                <i className="fas fa-link"></i>
                <span>رابط ملف الشروط والأحكام (Terms & Conditions PDF)</span>
              </label>
              <input
                type="url"
                className="w-full p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-gray-900 dark:text-white dir-ltr text-right"
                value={editTermsLink}
                onChange={e => setEditTermsLink(e.target.value)}
              />
            </div>
          </div>

          {/* Description Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-gray-700 dark:text-gray-300 block">
              الوصف أو الملاحظات التوضيحية أعلى الاستمارة
            </label>
            <textarea
              rows={2}
              className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold dark:text-white"
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
            ></textarea>
          </div>

          {/* Fields Customizer Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="fas fa-list-ol text-primary-600"></i>
                  <span>أسئلة وحقول نموذج تأكيد البيانات ({editFields.length})</span>
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  يمكنك تعديل نوع كل سؤال (نص، خيارات متعددة، قائمة، إلخ)، إضافة خيارات الإجابة، أو حذف أي سؤال.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaultFields}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="استعادة الأسئلة الأساسية الافتراضية للنموذج"
                >
                  <i className="fas fa-rotate-right text-xs"></i>
                  <span>استعادة الافتراضي</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddField('text')}
                  className="px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <i className="fas fa-plus"></i>
                  <span>إضافة سؤال جديد</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {editFields.map((field, index) => {
                const isOptionType = field.type === 'select' || field.type === 'radio' || field.type === 'checkbox';

                return (
                  <div 
                    key={field.id}
                    className={`p-5 rounded-2xl border transition-all space-y-4 ${
                      field.enabled 
                        ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600' 
                        : 'bg-gray-100/60 dark:bg-gray-800/60 border-gray-200/60 dark:border-gray-700/60 opacity-70'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-600 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/80 text-primary-600 dark:text-primary-300 text-xs font-black flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="font-bold text-xs text-gray-800 dark:text-gray-200">
                          {field.systemKey ? (
                            <span className="bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 px-2.5 py-1 rounded-lg text-[10px] font-black border border-primary-200 dark:border-primary-800">
                              📌 حقل أساسي بالنظام: {field.systemKey}
                            </span>
                          ) : (
                            <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-black border border-amber-200 dark:border-amber-800">
                              ✨ سؤال مخصص
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={field.enabled !== false}
                            onChange={e => handleUpdateField(field.id, { enabled: e.target.checked })}
                            className="w-4 h-4 rounded text-primary-600 accent-primary-600"
                          />
                          <span>مُفعل</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={e => handleUpdateField(field.id, { required: e.target.checked })}
                            className="w-4 h-4 rounded text-red-600 accent-red-600"
                          />
                          <span className="text-red-600 dark:text-red-400 font-black">مطلوب *</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => handleRemoveField(field.id)}
                          className="px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                          title="حذف هذا السؤال"
                        >
                          <i className="fas fa-trash-can text-xs"></i>
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>

                    {/* Question Input & Type Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block">
                          عنوان السؤال / النص
                        </label>
                        <input
                          type="text"
                          placeholder="اكتب عنوان السؤال هنا..."
                          className="w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold dark:text-white focus:outline-none focus:border-primary-500"
                          value={field.label}
                          onChange={e => handleUpdateField(field.id, { label: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block">
                          نوع الإجابة / السؤال (Field Type)
                        </label>
                        <select
                          className="w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
                          value={field.type}
                          onChange={e => handleUpdateFieldType(field.id, e.target.value as BookingFormField['type'])}
                        >
                          <option value="text">📝 نص قصير (Text Field)</option>
                          <option value="textarea">📄 فقرة / نص طويل (Paragraph)</option>
                          <option value="radio">🔘 خيارات متعددة (Radio Buttons)</option>
                          <option value="checkbox">☑️ مربعات اختيار (Checkboxes)</option>
                          <option value="select">🔽 قائمة منسدلة / كومبو بوكس (Dropdown List)</option>
                          <option value="number">🔢 رقم (Number)</option>
                          <option value="tel">📞 رقم هاتف (Phone Number)</option>
                        </select>
                      </div>
                    </div>

                    {/* HelpText / Placeholder */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block">
                        نص توضيحي أو إرشادي للعميل (Placeholder / Help text)
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: برجاء إدخال اسمك رباعياً مثل البطاقة"
                        className="w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-bold dark:text-white focus:outline-none focus:border-primary-500"
                        value={field.placeholder || field.helpText || ''}
                        onChange={e => handleUpdateField(field.id, { placeholder: e.target.value, helpText: e.target.value })}
                      />
                    </div>

                    {/* Options Manager for Radio, Checkbox, Select */}
                    {isOptionType && (
                      <div className="p-4 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-primary-600 dark:text-primary-400 flex items-center gap-1.5">
                            <i className="fas fa-list-check"></i>
                            <span>خيارات السؤال / الإجابات المتاحة ({field.options?.length || 0})</span>
                          </label>
                          <span className="text-[10px] text-gray-400">
                            {field.type === 'checkbox' ? 'يمكن للعميل اختيار أكثر من خيار' : 'يختار العميل خياراً واحداً فقط'}
                          </span>
                        </div>

                        {/* List of current options */}
                        <div className="space-y-2">
                          {(field.options || []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 font-bold">
                                {field.type === 'radio' ? '🔘' : field.type === 'checkbox' ? '☑️' : '🔹'} {optIdx + 1}.
                              </span>
                              <input
                                type="text"
                                value={opt}
                                onChange={e => handleUpdateOptionText(field.id, optIdx, e.target.value)}
                                className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white focus:outline-none focus:border-primary-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionFromField(field.id, optIdx)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                                title="حذف هذا الخيار"
                              >
                                <i className="fas fa-times text-xs"></i>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add option input */}
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                          <input
                            type="text"
                            id={`add_opt_input_${field.id}`}
                            placeholder="+ إضافة خيار جديد..."
                            className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white focus:outline-none focus:border-primary-500"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const inputEl = e.currentTarget as HTMLInputElement;
                                handleAddOptionToField(field.id, inputEl.value);
                                inputEl.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const inputEl = document.getElementById(`add_opt_input_${field.id}`) as HTMLInputElement;
                              if (inputEl) {
                                handleAddOptionToField(field.id, inputEl.value);
                                inputEl.value = '';
                              }
                            }}
                            className="px-3 py-2 bg-primary-100 dark:bg-primary-950 hover:bg-primary-200 text-primary-700 dark:text-primary-300 rounded-lg text-xs font-bold border border-primary-200 dark:border-primary-800 transition-all flex items-center gap-1"
                          >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>إضافة الخيار</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Save Button */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              {savingTemplate ? (
                <span>جاري الحفظ...</span>
              ) : (
                <>
                  <i className="fas fa-save"></i>
                  <span>حفظ التعديلات الآن</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW SUBMISSION DETAILS MODAL */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 flex items-center justify-center text-lg">
                  <i className="fas fa-file-invoice"></i>
                </div>
                <div>
                  <h3 className="font-black text-base dark:text-white">تفاصيل استجابة الطالب</h3>
                  <p className="text-xs text-gray-400 dir-ltr text-right">{selectedSubmission.submittedAt}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <div>
                  <span className="text-gray-400 font-bold block">الاسم رباعي:</span>
                  <span className="font-black text-gray-900 dark:text-white text-sm">{selectedSubmission.customerName}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">الاسم بالإنجليزية (الشهادة):</span>
                  <span className="font-black text-primary-600 dark:text-primary-400 text-sm">{selectedSubmission.englishName}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">رقم الموبايل:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200 dir-ltr text-right block">{selectedSubmission.phone}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">رقم الواتساب:</span>
                  <span className="font-bold text-emerald-600 dir-ltr text-right block">{selectedSubmission.whatsapp}</span>
                </div>
                <div className="col-span-2 border-t pt-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold block">إيميل الجيميل (لحضور المحاضرات):</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 dir-ltr text-right block">{selectedSubmission.email || 'غير محدد'}</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-2">
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">الكورس المحجوز:</span>
                  <span className="font-black text-gray-900 dark:text-white">{selectedSubmission.productName}</span>
                </div>
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">طريقة الحضور:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {selectedSubmission.attendanceMethod === 'online' ? '🌐 أونلاين' : '🏢 أوفلاين بالمقر'}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">درست البرامج قبل كدا؟</span>
                  <span className="font-bold">{selectedSubmission.studiedSoftware === 'yes' ? 'نعم' : 'لا'}</span>
                </div>
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">المبلغ المدفوع:</span>
                  <span className="font-black text-amber-500 text-sm">{selectedSubmission.paidAmount} EGP</span>
                </div>
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">وسيلة الدفع:</span>
                  <span className="font-bold">{selectedSubmission.paymentMethod}</span>
                </div>
                <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                  <span className="text-gray-400 font-bold">الرقم المحول منه:</span>
                  <span className="font-bold">{selectedSubmission.transferSenderNumber}</span>
                </div>
                {selectedSubmission.installmentPlan && (
                  <div className="flex justify-between border-b pb-2 dark:border-gray-600">
                    <span className="text-gray-400 font-bold">نظام التقسيط المختار:</span>
                    <span className="font-black text-primary-600 dark:text-primary-400">
                      {
                        selectedSubmission.installmentPlan === '10_days' ? 'النظام الأول (كل 10 أيام - 4 أقساط)' :
                        selectedSubmission.installmentPlan === '15_days' ? 'النظام الثاني (كل 15 يوم - 3 أقساط)' :
                        selectedSubmission.installmentPlan === '60_days' ? 'النظام الثالث (خلال 60 يوم - قسطين)' :
                        selectedSubmission.installmentPlan === 'custom_cs' ? 'اتفاق خاص مع خدمة العملاء / المبيعات' :
                        'سداد كامل المبلغ (بدون تقسيط)'
                      }
                    </span>
                  </div>
                )}
                {selectedSubmission.installmentPlanNotes && (
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-bold">تفاصيل اتفاق خدمة العملاء:</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">{selectedSubmission.installmentPlanNotes}</span>
                  </div>
                )}
              </div>

              {(selectedSubmission.isScholarship || selectedSubmission.scholarshipReason) && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-900 dark:text-emerald-200 space-y-1.5">
                  <div className="font-black text-xs flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <i className="fas fa-graduation-cap text-base"></i>
                    <span>طلب منحة دراسية مجانية 100% 🎓</span>
                  </div>
                  {selectedSubmission.scholarshipReason && (
                    <p className="text-xs text-gray-700 dark:text-gray-300 bg-white/60 dark:bg-gray-800/60 p-2.5 rounded-xl border border-emerald-200/50 dark:border-emerald-800/50 mt-1">
                      <span className="font-bold text-gray-500 dark:text-gray-400 block mb-0.5">سبب طلب المنحة / الملاحظات:</span>
                      {selectedSubmission.scholarshipReason}
                    </p>
                  )}
                </div>
              )}

              {selectedSubmission.additionalAnswers && Object.keys(selectedSubmission.additionalAnswers).length > 0 && (
                <div className="bg-amber-50/50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2">
                  <h4 className="font-black text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <i className="fas fa-clipboard-list"></i>
                    <span>إجابات الأسئلة الإضافية المخصصة:</span>
                  </h4>
                  <div className="space-y-1.5 pt-1 text-xs">
                    {Object.entries(selectedSubmission.additionalAnswers).map(([fId, ans], idx) => {
                      const fLabel = template.fields.find(f => f.id === fId)?.label || `سؤال (${fId})`;
                      const displayAns = Array.isArray(ans) ? ans.join(', ') : String(ans);
                      return (
                        <div key={idx} className="flex justify-between border-b border-amber-100 dark:border-amber-900/50 pb-1.5">
                          <span className="text-gray-500 dark:text-gray-400 font-bold">{fLabel}:</span>
                          <span className="font-black text-gray-900 dark:text-white">{displayAns || 'لم يحدد'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                <i className="fas fa-check-circle text-emerald-500"></i>
                <span>الموافقة على الشروط والأحكام: تم الموافقة ✅</span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t dark:border-gray-700 flex justify-between gap-2">
              <button
                onClick={() => handleImportToBooking(selectedSubmission)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs flex items-center gap-2 shadow-md"
              >
                <i className="fas fa-file-import"></i>
                <span>استيراد وإنشاء حجز الآن</span>
              </button>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-5 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingForms;
