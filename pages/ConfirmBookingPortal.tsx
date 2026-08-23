import React, { useState, useEffect } from 'react';
import { 
  getBookingFormTemplate, 
  createBookingFormSubmission, 
  DEFAULT_BOOKING_FORM_TEMPLATE,
  genericGet
} from '../services/firestore';
import { BookingFormTemplate, Course, Diploma } from '../types';

export interface CountryOption {
  code: string;
  dialCode: string;
  nameAr: string;
  flag: string;
}

export const COUNTRIES_LIST: CountryOption[] = [
  { code: 'EG', dialCode: '+20', nameAr: 'مصر', flag: '🇪🇬' },
  { code: 'SA', dialCode: '+966', nameAr: 'السعودية', flag: '🇸🇦' },
  { code: 'AE', dialCode: '+971', nameAr: 'الإمارات', flag: '🇦🇪' },
  { code: 'KW', dialCode: '+965', nameAr: 'الكويت', flag: '🇰🇼' },
  { code: 'QA', dialCode: '+974', nameAr: 'قطر', flag: '🇶🇦' },
  { code: 'OM', dialCode: '+968', nameAr: 'عمان', flag: '🇴🇲' },
  { code: 'BH', dialCode: '+973', nameAr: 'البحرين', flag: '🇧🇭' },
  { code: 'JO', dialCode: '+962', nameAr: 'الأردن', flag: '🇯🇴' },
  { code: 'IQ', dialCode: '+964', nameAr: 'العراق', flag: '🇮🇶' },
  { code: 'LY', dialCode: '+218', nameAr: 'ليبيا', flag: '🇱🇾' },
  { code: 'SD', dialCode: '+249', nameAr: 'السودان', flag: '🇸🇩' },
  { code: 'PS', dialCode: '+970', nameAr: 'فلسطين', flag: '🇵🇸' },
  { code: 'MA', dialCode: '+212', nameAr: 'المغرب', flag: '🇲🇦' },
  { code: 'DZ', dialCode: '+213', nameAr: 'الجزائر', flag: '🇩🇿' },
  { code: 'TN', dialCode: '+216', nameAr: 'تونس', flag: '🇹🇳' },
  { code: 'LB', dialCode: '+961', nameAr: 'لبنان', flag: '🇱🇧' },
  { code: 'SY', dialCode: '+963', nameAr: 'سوريا', flag: '🇸🇾' },
  { code: 'YE', dialCode: '+967', nameAr: 'اليمن', flag: '🇾🇪' },
  { code: 'TR', dialCode: '+90', nameAr: 'تركيا', flag: '🇹🇷' },
  { code: 'US', dialCode: '+1', nameAr: 'أمريكا / كندا', flag: '🇺🇸' },
  { code: 'GB', dialCode: '+44', nameAr: 'المملكة المتحدة', flag: '🇬🇧' },
  { code: 'DE', dialCode: '+49', nameAr: 'ألمانيا', flag: '🇩🇪' },
  { code: 'FR', dialCode: '+33', nameAr: 'فرنسا', flag: '🇫🇷' },
  { code: 'IT', dialCode: '+39', nameAr: 'إيطاليا', flag: '🇮🇹' },
  { code: 'OTHER', dialCode: '+', nameAr: 'دولة أخرى', flag: '🌐' },
];

export const smartCleanPhone = (
  rawInput: string,
  dialCode: string,
  setDialCodeCallback?: (dc: string) => void
): { cleanedDigits: string; fullInternational: string; activeDialCode: string; warningText?: string } => {
  if (!rawInput) {
    return { cleanedDigits: '', fullInternational: dialCode, activeDialCode: dialCode };
  }

  let text = rawInput.trim();

  // Convert Arabic numerals to Western digits
  text = text.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  // Strip spaces, dashes, dots, brackets
  text = text.replace(/[\s\-\(\)\.\/]/g, '');

  let currentCode = dialCode.trim() || '+20';
  let warning: string | undefined = undefined;

  // Case A: User pasted a number starting with '+'
  if (text.startsWith('+')) {
    const sorted = [...COUNTRIES_LIST].filter(c => c.dialCode !== '+').sort((a, b) => b.dialCode.length - a.dialCode.length);
    const matched = sorted.find(c => text.startsWith(c.dialCode));
    if (matched) {
      currentCode = matched.dialCode;
      text = text.substring(matched.dialCode.length);
      if (setDialCodeCallback) setDialCodeCallback(matched.dialCode);
    } else {
      text = text.replace(/^\+/, '');
    }
  }

  // Case B: User typed or pasted dial code digits without '+' e.g. "201024689480" or "966501234567"
  const pureCodeDigits = currentCode.replace('+', '');
  if (pureCodeDigits && text.startsWith(pureCodeDigits) && text.length > pureCodeDigits.length + 6) {
    const candidate = text.substring(pureCodeDigits.length);
    if (!candidate.startsWith('0') || candidate.length > 7) {
      text = candidate;
    }
  }

  // Case C: User entered leading zero (e.g., 01024689480 or 0501234567)
  if (text.startsWith('0')) {
    text = text.replace(/^0+/, '');
    warning = 'تم حذف الصفر الزائد تلقائياً لمنع التكرار مع كود الدولة';
  }

  // Keep only digits
  const cleanedDigits = text.replace(/\D/g, '');

  const fullInternational = currentCode.startsWith('+') 
    ? `${currentCode}${cleanedDigits}` 
    : `+${currentCode}${cleanedDigits}`;

  return {
    cleanedDigits,
    fullInternational,
    activeDialCode: currentCode,
    warningText: warning
  };
};

interface ConfirmBookingPortalProps {
  formType?: 'standard' | 'scholarship';
}

export const ConfirmBookingPortal: React.FC<ConfirmBookingPortalProps> = ({ formType: propFormType }) => {
  const isScholarshipFromUrl = typeof window !== 'undefined' && (
    window.location.hash.includes('scholarship') || 
    window.location.pathname.includes('scholarship') ||
    window.location.search.includes('type=scholarship')
  );
  const isScholarshipForm = propFormType === 'scholarship' || isScholarshipFromUrl;

  const [template, setTemplate] = useState<BookingFormTemplate>(DEFAULT_BOOKING_FORM_TEMPLATE);
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Form Fields State
  const [customerName, setCustomerName] = useState('');
  const [countryCode, setCountryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [waCountryCode, setWaCountryCode] = useState('+20');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [email, setEmail] = useState('');
  const [detectedCountryName, setDetectedCountryName] = useState<string | null>(null);

  const [englishName, setEnglishName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductType, setSelectedProductType] = useState<'course' | 'diploma'>('course');
  const [studiedSoftware, setStudiedSoftware] = useState<'yes' | 'no'>('no');
  const [attendanceMethod, setAttendanceMethod] = useState<'online' | 'offline_hq'>('online');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [transferSenderNumber, setTransferSenderNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('vodafone_cash');
  const [installmentPlan, setInstallmentPlan] = useState<string>('full_payment');
  const [installmentPlanNotes, setInstallmentPlanNotes] = useState<string>('');
  const [scholarshipReason, setScholarshipReason] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [additionalAnswers, setAdditionalAnswers] = useState<Record<string, any>>({});
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [tmpl, cList, dList] = await Promise.all([
          getBookingFormTemplate('default'),
          genericGet<Course>('catalog_courses'),
          genericGet<Diploma>('catalog_diplomas')
        ]);
        setTemplate(tmpl);
        setCourses(cList.filter(c => c.active !== false));
        setDiplomas(dList.filter(d => d.active !== false));
      } catch (err) {
        console.error('Error loading confirmation form data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Auto Detect Location by IP
    const detectIpCountry = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const code = data.country_calling_code || (data.country_code ? COUNTRIES_LIST.find(c => c.code === data.country_code)?.dialCode : null);
          if (code) {
            const formattedCode = code.startsWith('+') ? code : `+${code}`;
            const match = COUNTRIES_LIST.find(c => c.dialCode === formattedCode || c.code === data.country_code);
            if (match) {
              setCountryCode(match.dialCode);
              setWaCountryCode(match.dialCode);
              setDetectedCountryName(`${match.flag} ${match.nameAr} (${match.dialCode})`);
            }
          }
        }
      } catch (e) {
        try {
          const res2 = await fetch('https://ip-api.com/json/?fields=countryCode');
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.countryCode) {
              const match2 = COUNTRIES_LIST.find(c => c.code === data2.countryCode);
              if (match2) {
                setCountryCode(match2.dialCode);
                setWaCountryCode(match2.dialCode);
                setDetectedCountryName(`${match2.flag} ${match2.nameAr} (${match2.dialCode})`);
              }
            }
          }
        } catch (err) {
          // Keep default
        }
      }
    };

    detectIpCountry();
  }, []);

  const handlePhoneInputChange = (rawVal: string) => {
    const res = smartCleanPhone(rawVal, countryCode, (newCode) => {
      setCountryCode(newCode);
      if (sameAsPhone) setWaCountryCode(newCode);
    });
    setPhone(res.cleanedDigits);
    if (sameAsPhone) {
      setWhatsapp(res.cleanedDigits);
    }
  };

  const handleCountryCodeSelect = (newCode: string) => {
    setCountryCode(newCode);
    const res = smartCleanPhone(phone, newCode);
    setPhone(res.cleanedDigits);
    if (sameAsPhone) {
      setWaCountryCode(newCode);
      setWhatsapp(res.cleanedDigits);
    }
  };

  const handleWaInputChange = (rawVal: string) => {
    const res = smartCleanPhone(rawVal, waCountryCode, setWaCountryCode);
    setWhatsapp(res.cleanedDigits);
  };

  const handleWaCountrySelect = (newCode: string) => {
    setWaCountryCode(newCode);
    const res = smartCleanPhone(whatsapp, newCode);
    setWhatsapp(res.cleanedDigits);
  };

  const handleToggleSameAsPhone = (checked: boolean) => {
    setSameAsPhone(checked);
    if (checked) {
      setWaCountryCode(countryCode);
      setWhatsapp(phone);
    }
  };

  const phoneAnalysis = smartCleanPhone(phone, countryCode);
  const waAnalysis = smartCleanPhone(sameAsPhone ? phone : whatsapp, sameAsPhone ? countryCode : waCountryCode);

  const handleProductChange = (val: string) => {
    setSelectedProductId(val);
    if (!val) {
      setSelectedProductName('');
      return;
    }
    const [type, id] = val.split('_');
    if (type === 'course') {
      const c = courses.find(item => item.id === id);
      if (c) {
        setSelectedProductName(c.name);
        setSelectedProductType('course');
      }
    } else if (type === 'diploma') {
      const d = diplomas.find(item => item.id === id);
      if (d) {
        setSelectedProductName(d.name);
        setSelectedProductType('diploma');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!customerName.trim()) {
      setErrorMessage('برجاء كتابة الاسم كاملاً');
      return;
    }

    if (!phoneAnalysis.cleanedDigits) {
      setErrorMessage('برجاء كتابة رقم الموبايل الأساسي بشكل صحيح');
      return;
    }

    if (!waAnalysis.cleanedDigits) {
      setErrorMessage('برجاء كتابة رقم الواتس أب بشكل صحيح');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('برجاء كتابة بريد الجيميل (Gmail) الصحيح لحضور المحاضرات');
      return;
    }

    if (!englishName.trim()) {
      setErrorMessage('برجاء كتابة الاسم باللغة الانجليزية لاستخراج الشهادة');
      return;
    }
    if (!selectedProductId) {
      setErrorMessage('برجاء اختيار الكورس أو الدبلومة المحجوزة');
      return;
    }
    if (!isScholarshipForm) {
      if (!paidAmount || Number(paidAmount) <= 0) {
        setErrorMessage('برجاء كتابة المبلغ المدفوع أثناء الحجز');
        return;
      }
      if (!transferSenderNumber.trim()) {
        setErrorMessage('برجاء كتابة الرقم الذي تم التحويل منه أو اختيار "تم الحجز من المقر"');
        return;
      }
    }
    if (!termsAgreed) {
      setErrorMessage('برجاء الموافقة على الشروط والأحكام لإتمام تأكيد الحجز');
      return;
    }

    try {
      setSubmitting(true);
      const subId = await createBookingFormSubmission({
        formId: isScholarshipForm ? 'scholarship' : (template.id || 'default'),
        customerName: customerName.trim(),
        phone: phoneAnalysis.cleanedDigits,
        countryCode: phoneAnalysis.activeDialCode,
        whatsapp: waAnalysis.fullInternational,
        email: email.trim(),
        englishName: englishName.trim(),
        productId: selectedProductId.split('_')[1] || selectedProductId,
        productName: selectedProductName,
        productType: selectedProductType,
        studiedSoftware,
        attendanceMethod,
        paidAmount: isScholarshipForm ? 0 : Number(paidAmount),
        transferSenderNumber: isScholarshipForm ? 'منحة مجانية' : transferSenderNumber.trim(),
        paymentMethod: isScholarshipForm ? 'free_grant' : paymentMethod,
        termsAgreed: true,
        additionalAnswers,
        isScholarship: isScholarshipForm,
        formType: isScholarshipForm ? 'scholarship' : 'standard',
        scholarshipReason: isScholarshipForm ? scholarshipReason.trim() : undefined,
        installmentPlan: isScholarshipForm ? undefined : installmentPlan,
        installmentPlanNotes: isScholarshipForm ? undefined : (installmentPlan === 'custom_cs' ? installmentPlanNotes.trim() : undefined)
      });

      setSubmissionId(subId);
      setSubmittedSuccess(true);
    } catch (err: any) {
      console.error('Error submitting form:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء إرسال البيانات. برجاء المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4" dir="rtl">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-sm text-slate-300">جاري تحميل استمارة تأكيد الحجز...</p>
      </div>
    );
  }

  if (submittedSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/30">
            <i className="fas fa-check-circle text-4xl"></i>
          </div>
          <div>
            <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-black mb-2 border border-emerald-500/20">
              تم استلام البيانات بنجاح ✅
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">شكراً لك، {customerName}!</h1>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              تم تأكيد بيانات حجزك للكورس: <strong className="text-primary-400">{selectedProductName}</strong> بنجاح.
            </p>
          </div>

          <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/50 text-right space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-700/50 pb-2">
              <span className="text-slate-400 font-bold">الاسم بالإنجليزية (الشهادة):</span>
              <span className="font-black text-white">{englishName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700/50 pb-2">
              <span className="text-slate-400 font-bold">رقم التواصل والواتس أب:</span>
              <span className="font-black text-emerald-400 dir-ltr">{whatsapp}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700/50 pb-2">
              <span className="text-slate-400 font-bold">إيميل الجيميل (المحاضرات):</span>
              <span className="font-black text-blue-300 dir-ltr">{email}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700/50 pb-2">
              <span className="text-slate-400 font-bold">المبلغ المدفوع:</span>
              <span className="font-black text-amber-400">{paidAmount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">طريقة الحضور:</span>
              <span className="font-black text-blue-400">
                {attendanceMethod === 'online' ? '🌐 أونلاين' : '🏢 أوفلاين بالمقر'}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <a
              href={`https://wa.me/201012345678?text=${encodeURIComponent(`مرحباً، قمت بتأكيد بيانات حجز الكورس (${selectedProductName}) باسم (${customerName}). كود التأكيد: ${submissionId}`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-3 w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/30 transition-all"
            >
              <i className="fab fa-whatsapp text-xl"></i>
              <span>مراسلة الدعم الفني على الواتس أب</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start py-8 px-4 font-sans" dir="rtl">
      {/* Header Banner */}
      <div className="w-full max-w-2xl text-center space-y-3 mb-8">
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-black ${
          isScholarshipForm 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
            : 'bg-primary-500/10 text-primary-400 border-primary-500/20'
        }`}>
          <i className={isScholarshipForm ? "fas fa-graduation-cap" : "fas fa-file-signature"}></i>
          <span>{isScholarshipForm ? 'استمارة التقديم على المنحة المجانية 🎓' : 'استمارة تأكيد بيانات الحجز الرسمية'}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {isScholarshipForm ? 'استمارة التقديم على المنحة الدراسية المجانية' : (template.title || 'فورم تأكيد بيانات الحجز')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto font-medium">
          {isScholarshipForm 
            ? 'برجاء ملء البيانات التالية بدقة للتقديم والتسجيل في المنحة المجانية المعتمدة من الأكاديمية.' 
            : (template.description || 'برجاء ملء وتأكيد كافة بياناتك بدقة لإتمام إجراءات الحجز واستخراج الشهادة بالاسم الصحيح.')}
        </p>
      </div>

      {/* Main Form Container */}
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-sm"
      >
        {errorMessage && (
          <div className="p-4 bg-red-950/60 border border-red-800/80 rounded-2xl text-red-200 text-xs font-bold flex items-center gap-3 animate-in fade-in duration-200">
            <i className="fas fa-exclamation-triangle text-red-400 text-lg"></i>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Trainee Name */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            1. الاسم كاملاً (الاسم رباعي) <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="مثال: أحمد محمد علي حسن"
            className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
          />
        </div>

        {/* 2. Primary Phone Number & Country Select */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
              2. رقم الموبايل الأساسي <span className="text-red-400">*</span>
            </label>
            {detectedCountryName && (
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <i className="fas fa-location-arrow text-[9px]"></i>
                <span>تم التعرف على دولتك تلقائياً: {detectedCountryName}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Country Select Dropdown */}
            <div className="sm:col-span-1 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">اختر الدولة / الكود</label>
              <select
                className="w-full p-3.5 bg-slate-800/90 border border-slate-700 rounded-2xl text-xs font-bold text-emerald-400 focus:outline-none focus:border-primary-500 cursor-pointer"
                value={countryCode}
                onChange={e => handleCountryCodeSelect(e.target.value)}
              >
                {COUNTRIES_LIST.map(c => (
                  <option key={`c_${c.code}`} value={c.dialCode}>
                    {c.flag} {c.nameAr} ({c.dialCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Phone Number Input */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">رقم الموبايل</label>
              <input
                type="tel"
                required
                placeholder="مثال: 1012345678"
                className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 dir-ltr text-right"
                value={phone}
                onChange={e => handlePhoneInputChange(e.target.value)}
              />
            </div>
          </div>

          {/* Live Feedback & Warnings */}
          {phoneAnalysis.warningText && (
            <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800/60 p-2.5 rounded-xl font-bold flex items-center gap-1.5 animate-in fade-in">
              <i className="fas fa-magic text-amber-400"></i>
              <span>{phoneAnalysis.warningText}</span>
            </p>
          )}

          {phoneAnalysis.cleanedDigits && (
            <div className="text-[11px] font-mono text-emerald-400 bg-slate-900/90 border border-emerald-500/30 p-2.5 rounded-xl flex items-center justify-between">
              <span className="text-slate-400 font-sans font-bold">الرقم الدولي المعتمد للتواصل:</span>
              <span className="font-bold dir-ltr bg-emerald-950/80 px-2.5 py-0.5 rounded-lg border border-emerald-500/40 text-emerald-300">
                {phoneAnalysis.fullInternational}
              </span>
            </div>
          )}
        </div>

        {/* 3. WhatsApp Number Used for Booking */}
        <div className="space-y-3 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
              3. رقم الواتس أب الذي تم الحجز من خلاله <span className="text-red-400">*</span>
            </label>

            {!sameAsPhone ? (
              <button
                type="button"
                onClick={() => handleToggleSameAsPhone(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer self-start sm:self-auto"
              >
                <i className="fas fa-copy text-xs"></i>
                <span>استخدام رقم موبايلك الأساسي؟ اضغط هنا</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleSameAsPhone(false)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer self-start sm:self-auto"
              >
                <i className="fas fa-pen text-xs"></i>
                <span>استخدام رقم واتس مختلف؟ اضغط هنا</span>
              </button>
            )}
          </div>

          {!sameAsPhone ? (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-1 space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400">كود الدولة للواتس</label>
                  <select
                    className="w-full p-3.5 bg-slate-800/90 border border-slate-700 rounded-2xl text-xs font-bold text-emerald-400 focus:outline-none focus:border-primary-500 cursor-pointer"
                    value={waCountryCode}
                    onChange={e => handleWaCountrySelect(e.target.value)}
                  >
                    {COUNTRIES_LIST.map(c => (
                      <option key={`wa_c_${c.code}`} value={c.dialCode}>
                        {c.flag} {c.nameAr} ({c.dialCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400">رقم الواتس أب</label>
                  <input
                    type="tel"
                    required
                    placeholder="مثال: 1012345678"
                    className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 dir-ltr text-right"
                    value={whatsapp}
                    onChange={e => handleWaInputChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Helper Note */}
              <div className="p-3 bg-slate-900/80 border border-slate-700/50 rounded-xl text-[11px] flex flex-wrap items-center justify-between gap-2 text-slate-300">
                <span className="flex items-center gap-1.5">
                  <i className="fas fa-info-circle text-primary-400"></i>
                  <span>هل رقم الواتس هو نفسه رقمك الأساسي أعلاه؟</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleSameAsPhone(true)}
                  className="font-black text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30 transition-all cursor-pointer"
                >
                  استخدام رقم موبايلك الأساسي اضغط هنا
                </button>
              </div>

              {waAnalysis.warningText && (
                <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800/60 p-2.5 rounded-xl font-bold flex items-center gap-1.5 animate-in fade-in">
                  <i className="fas fa-magic text-amber-400"></i>
                  <span>{waAnalysis.warningText}</span>
                </p>
              )}

              {waAnalysis.cleanedDigits && (
                <div className="text-[11px] font-mono text-emerald-400 bg-slate-900/90 border border-emerald-500/30 p-2.5 rounded-xl flex items-center justify-between">
                  <span className="text-slate-400 font-sans font-bold">رقم الواتس أب النهائي المعتمد:</span>
                  <span className="font-bold dir-ltr bg-emerald-950/80 px-2.5 py-0.5 rounded-lg border border-emerald-500/40 text-emerald-300">
                    {waAnalysis.fullInternational}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-xs flex flex-wrap items-center justify-between gap-3 text-slate-200 font-medium animate-in fade-in">
              <div className="flex items-center gap-2">
                <i className="fab fa-whatsapp text-emerald-400 text-lg"></i>
                <div>
                  <p className="font-bold text-white">تم اعتماد نفس رقم الموبايل الأساسي للواتس أب</p>
                  <p className="text-[11px] text-emerald-300 font-mono dir-ltr text-right">
                    {phoneAnalysis.fullInternational || 'لم يُكتب رقم بعد'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSameAsPhone(false)}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                <i className="fas fa-pen ml-1"></i>
                استخدام رقم واتس مختلف
              </button>
            </div>
          )}
        </div>

        {/* 4. Gmail Email for Attending Lectures */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            4. البريد الإلكتروني (إيميل الجيميل - Gmail) لحضور المحاضرات <span className="text-red-400">*</span>
          </label>

          <p className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 p-2.5 rounded-xl flex items-center gap-2">
            <i className="fab fa-google text-cyan-400"></i>
            <span>📧 سيتم إضافتك بهذا البريد لمنحك صلاحيات مشاهدة محاضرات ومواد الكورس على Google Drive / Zoom</span>
          </p>

          <input
            type="email"
            required
            placeholder="مثال: example@gmail.com"
            className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 dir-ltr text-right"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        {/* 5. English Name for Certificate */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            5. الاسم باللغة الانجليزية <span className="text-red-400">*</span>
          </label>

          <p className="text-[11px] font-semibold text-blue-300 bg-blue-950/40 border border-blue-800/50 p-2.5 rounded-xl flex items-center gap-2">
            <i className="fas fa-certificate text-blue-400"></i>
            <span>📜 بنفس الطريقة اللي حابب تستلم الشهادة بيها</span>
          </p>

          <input
            type="text"
            required
            placeholder="e.g. Ahmed Mohamed Ali"
            className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 dir-ltr text-right uppercase tracking-wider"
            value={englishName}
            onChange={e => setEnglishName(e.target.value)}
          />
        </div>

        {/* 6. Course Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            6. الحجز لأي كورس / دبلومة <span className="text-red-400">*</span>
          </label>
          <select
            required
            className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-primary-500"
            value={selectedProductId}
            onChange={e => handleProductChange(e.target.value)}
          >
            <option value="">-- اختر الكورس / الدبلومة من القائمة --</option>

            {diplomas.length > 0 && (
              <optgroup label="🎓 الدبلومات المتاحة">
                {diplomas.map(d => (
                  <option key={`diploma_${d.id}`} value={`diploma_${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}

            {courses.length > 0 && (
              <optgroup label="📚 الكورسات المتاحة">
                {courses.map(c => (
                  <option key={`course_${c.id}`} value={`course_${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* 7. Studied software before? */}
        <div className="space-y-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/60">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            7. درست البرامج الخاصة بالكورس قبل كده ولا لأ؟ <span className="text-red-400">*</span>
          </label>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-white">
              <input
                type="radio"
                name="studiedSoftware"
                value="yes"
                checked={studiedSoftware === 'yes'}
                onChange={() => setStudiedSoftware('yes')}
                className="w-4 h-4 text-primary-500 focus:ring-primary-500 bg-slate-700 border-slate-600"
              />
              <span>نعم، درستها سابقاً</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-white">
              <input
                type="radio"
                name="studiedSoftware"
                value="no"
                checked={studiedSoftware === 'no'}
                onChange={() => setStudiedSoftware('no')}
                className="w-4 h-4 text-primary-500 focus:ring-primary-500 bg-slate-700 border-slate-600"
              />
              <span>لا، لم أدرسها من قبل</span>
            </label>
          </div>
        </div>

        {/* 8. Attendance Method */}
        <div className="space-y-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/60">
          <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
            8. طريقة الحضور المفضلة <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label 
              onClick={() => setAttendanceMethod('online')}
              className={`p-4 rounded-2xl border cursor-pointer flex items-center gap-3 transition-all ${
                attendanceMethod === 'online'
                  ? 'bg-primary-600/20 border-primary-500 text-white shadow-lg'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name="attendanceMethod"
                value="online"
                checked={attendanceMethod === 'online'}
                onChange={() => setAttendanceMethod('online')}
                className="w-4 h-4 text-primary-500"
              />
              <div>
                <div className="font-black text-xs">🌐 أونلاين (Online)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">متابعة تفاعلية ومحاضرات مباشرة</div>
              </div>
            </label>

            <label 
              onClick={() => setAttendanceMethod('offline_hq')}
              className={`p-4 rounded-2xl border cursor-pointer flex items-center gap-3 transition-all ${
                attendanceMethod === 'offline_hq'
                  ? 'bg-primary-600/20 border-primary-500 text-white shadow-lg'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name="attendanceMethod"
                value="offline_hq"
                checked={attendanceMethod === 'offline_hq'}
                onChange={() => setAttendanceMethod('offline_hq')}
                className="w-4 h-4 text-primary-500"
              />
              <div>
                <div className="font-black text-xs">🏢 أوفلاين بالمقر</div>
                <div className="text-[10px] text-slate-400 mt-0.5">حضور مباشر بقاعات الأكاديمية</div>
              </div>
            </label>
          </div>
        </div>

        {/* 9. Paid Amount & Payment Method OR Scholarship Details */}
        {isScholarshipForm ? (
          <div className="p-5 bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border-2 border-emerald-500/50 rounded-2xl space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-emerald-400 font-black text-sm">
              <i className="fas fa-graduation-cap text-xl"></i>
              <span>نوع التقديم: منحة دراسية مجانية 100% 🎓</span>
            </div>
            <p className="text-xs text-emerald-200/90 leading-relaxed font-semibold">
              هذه الاستمارة مخصصة للمتقدمين للحصول على منحة دراسية مجانية كاملة بدون أي رسوم مالية.
            </p>
            <div className="pt-2 space-y-1.5">
              <label className="block text-xs font-black text-slate-200">
                سبب طلب المنحة المجانية / ملاحظات إضافية (اختياري):
              </label>
              <textarea
                placeholder="اكتب هنا سبب طلب الحصول على المنحة أو أي تفاصيل ترغب في إضافتها..."
                className="w-full p-3.5 bg-slate-900/90 border border-emerald-500/40 rounded-2xl text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 min-h-[90px]"
                value={scholarshipReason}
                onChange={e => setScholarshipReason(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            {/* 9. Paid Amount */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
                9. المبلغ المدفوع أثناء الحجز <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="مثال: 500 أو 1000"
                className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-black text-amber-400 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            {/* 10. Transfer Sender Number */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
                10. الرقم اللي حولنا منه مبلغ الحجز <span className="text-red-400">*</span>
              </label>

              <p className="text-[11px] font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 p-2.5 rounded-xl flex items-center gap-2">
                <i className="fas fa-info-circle text-emerald-400"></i>
                <span>💡 لو حجزت من المقر - دفعت كاش - اكتب "تم الحجز من المقر"</span>
              </p>

              <input
                type="text"
                required
                placeholder="مثال: 01099998888 أو اكتب (تم الحجز من المقر)"
                className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                value={transferSenderNumber}
                onChange={e => setTransferSenderNumber(e.target.value)}
              />
            </div>

            {/* 11. Payment Method */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
                11. حجزت من خلال (وسيلة الدفع المُتاحة) <span className="text-red-400">*</span>
              </label>
              <select
                required
                className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-primary-500"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                <option value="vodafone_cash">📱 فودافون كاش (Vodafone Cash)</option>
                <option value="instapay">⚡ إنستا باي (Instapay)</option>
                <option value="bank_transfer">🏦 تحويل بنكي (Bank Transfer)</option>
                <option value="paypal">💳 باي بال / الفيزا الدولية (PayPal)</option>
                <option value="cash_office">💵 نقداً بالمقر (Cash at HQ)</option>
                <option value="etisalat_cash">📱 اتصالات كاش / أورنج كاش</option>
                <option value="other">🌐 وسيلة أخرى</option>
              </select>
            </div>

            {/* 12. Installment Plan Selection */}
            <div className="space-y-3 pt-3 border-t border-slate-700/60">
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-200 uppercase tracking-wide flex items-center justify-between">
                  <span>12. نظام التقسيط المُفضل <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-amber-400 font-bold bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md">
                    ملاحظة: أول قسط هو استكمال 50% من إجمالي الكورس
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 font-medium">
                  اختر نظام التقسيط المتاح والمناسب لك، أو اختر "اتفاق خاص مع خدمة العملاء" في حال تم التنسيق المسبق مع المبيعات:
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-1">
                {/* Option 1: Full Payment */}
                <label
                  onClick={() => setInstallmentPlan('full_payment')}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    installmentPlan === 'full_payment'
                      ? 'bg-primary-950/60 border-primary-500 shadow-md ring-1 ring-primary-500/50'
                      : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="installmentPlan"
                    value="full_payment"
                    checked={installmentPlan === 'full_payment'}
                    onChange={() => setInstallmentPlan('full_payment')}
                    className="mt-1 text-primary-500 focus:ring-primary-500"
                  />
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-white">سداد كامل المبلغ (بدون تقسيط)</span>
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-bold">دفعة واحدة</span>
                    </div>
                    <p className="text-[11px] text-slate-300/80 leading-relaxed">
                      سداد إجمالي رسوم الدورة كاملاً قبل موعد بداية الكورس.
                    </p>
                  </div>
                </label>

                {/* Option 2: 10 Days Plan */}
                <label
                  onClick={() => setInstallmentPlan('10_days')}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    installmentPlan === '10_days'
                      ? 'bg-primary-950/60 border-primary-500 shadow-md ring-1 ring-primary-500/50'
                      : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="installmentPlan"
                    value="10_days"
                    checked={installmentPlan === '10_days'}
                    onChange={() => setInstallmentPlan('10_days')}
                    className="mt-1 text-primary-500 focus:ring-primary-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-white">النظام الأول: تقسيط كل 10 أيام (4 أقساط)</span>
                      <span className="text-[10px] bg-primary-900/80 text-primary-300 border border-primary-700/60 px-2 py-0.5 rounded-md font-bold">الأكثر طلباً ⭐</span>
                    </div>
                    <div className="text-[11px] text-slate-300/90 leading-relaxed space-y-0.5">
                      <p>• <strong className="text-amber-400">القسط الأول (استكمال 50%):</strong> يُسدد لتغطية 50% من إجمالي قيمة الكورس قبل بدء الكورس واختيار الموعد.</p>
                      <p>• <strong className="text-emerald-400">باقي المبلغ (50%):</strong> يُقسم على 3 أقساط متساوية كل 10 أيام من بداية الكورس.</p>
                    </div>
                  </div>
                </label>

                {/* Option 3: 15 Days Plan */}
                <label
                  onClick={() => setInstallmentPlan('15_days')}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    installmentPlan === '15_days'
                      ? 'bg-primary-950/60 border-primary-500 shadow-md ring-1 ring-primary-500/50'
                      : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="installmentPlan"
                    value="15_days"
                    checked={installmentPlan === '15_days'}
                    onChange={() => setInstallmentPlan('15_days')}
                    className="mt-1 text-primary-500 focus:ring-primary-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-white">النظام الثاني: تقسيط كل 15 يوم (3 أقساط)</span>
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-bold">3 أقساط</span>
                    </div>
                    <div className="text-[11px] text-slate-300/90 leading-relaxed space-y-0.5">
                      <p>• <strong className="text-amber-400">القسط الأول (استكمال 50%):</strong> يُسدد لتغطية 50% من إجمالي قيمة الكورس قبل بدء الكورس واختيار الموعد.</p>
                      <p>• <strong className="text-emerald-400">باقي المبلغ (50%):</strong> يُقسم على قسطين متساويين كل 15 يوم من بداية الكورس.</p>
                    </div>
                  </div>
                </label>

                {/* Option 4: 60 Days Plan */}
                <label
                  onClick={() => setInstallmentPlan('60_days')}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    installmentPlan === '60_days'
                      ? 'bg-primary-950/60 border-primary-500 shadow-md ring-1 ring-primary-500/50'
                      : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="installmentPlan"
                    value="60_days"
                    checked={installmentPlan === '60_days'}
                    onChange={() => setInstallmentPlan('60_days')}
                    className="mt-1 text-primary-500 focus:ring-primary-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-white">النظام الثالث: تقسيط خلال 60 يوم (قسطين)</span>
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-bold">قسطين فقط</span>
                    </div>
                    <div className="text-[11px] text-slate-300/90 leading-relaxed space-y-0.5">
                      <p>• <strong className="text-amber-400">القسط الأول (استكمال 50%):</strong> يُسدد لتغطية 50% من إجمالي قيمة الكورس قبل بدء الكورس واختيار الموعد.</p>
                      <p>• <strong className="text-emerald-400">القسط الثاني والأخير (50% المتبقية):</strong> يُسدد كاملاً خلال 60 يوم من تاريخ الحجز.</p>
                    </div>
                  </div>
                </label>

                {/* Option 5: Custom Agreement with Customer Service */}
                <label
                  onClick={() => setInstallmentPlan('custom_cs')}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    installmentPlan === 'custom_cs'
                      ? 'bg-purple-950/60 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                      : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="installmentPlan"
                    value="custom_cs"
                    checked={installmentPlan === 'custom_cs'}
                    onChange={() => setInstallmentPlan('custom_cs')}
                    className="mt-1 text-purple-500 focus:ring-purple-500"
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-purple-300">اتفاق خاص مع خدمة العملاء / المبيعات 🤝</span>
                      <span className="text-[10px] bg-purple-900/80 text-purple-200 border border-purple-700/60 px-2 py-0.5 rounded-md font-bold">اتفاق خاص</span>
                    </div>
                    <p className="text-[11px] text-slate-300/80 leading-relaxed">
                      اختر هذا الخيار في حال تم الاتفاق المسبق مع خدمة العملاء أو ممثل المبيعات على نظام تقسيط أو جدول مواعيد مختلف.
                    </p>
                  </div>
                </label>
              </div>

              {/* Notes for custom CS agreement */}
              {installmentPlan === 'custom_cs' && (
                <div className="pt-2 animate-in fade-in duration-200">
                  <label className="block text-[11px] font-bold text-purple-300 mb-1">
                    ملاحظات أو تفاصيل الاتفاق الخاص مع خدمة العملاء (اختياري):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: تم الاتفاق على دفع المتبقي على قسطين نهاية كل شهر..."
                    className="w-full p-3 bg-slate-900/90 border border-purple-500/50 rounded-xl text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                    value={installmentPlanNotes}
                    onChange={e => setInstallmentPlanNotes(e.target.value)}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Dynamic Custom Questions Created via Form Builder */}
        {template.fields
          .filter(f => !f.systemKey && f.enabled !== false)
          .map((field, idx) => {
            const val = additionalAnswers[field.id];

            return (
              <div key={field.id} className="space-y-2.5 p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80">
                <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
                  {idx + 12}. {field.label} {field.required && <span className="text-red-400">*</span>}
                </label>

                {field.helpText && (
                  <p className="text-[11px] font-semibold text-slate-300 bg-slate-900/60 border border-slate-700/60 p-2.5 rounded-xl">
                    💡 {field.helpText}
                  </p>
                )}

                {/* 1. Text Field / Phone Field */}
                {(field.type === 'text' || field.type === 'tel' || !field.type) && (
                  <input
                    type={field.type === 'tel' ? 'tel' : 'text'}
                    required={field.required}
                    placeholder={field.placeholder || 'اكتب الإجابة هنا...'}
                    className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                    value={val || ''}
                    onChange={e => setAdditionalAnswers({ ...additionalAnswers, [field.id]: e.target.value })}
                  />
                )}

                {/* 2. Textarea / Paragraph */}
                {field.type === 'textarea' && (
                  <textarea
                    rows={3}
                    required={field.required}
                    placeholder={field.placeholder || 'اكتب التفاصيل هنا...'}
                    className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                    value={val || ''}
                    onChange={e => setAdditionalAnswers({ ...additionalAnswers, [field.id]: e.target.value })}
                  ></textarea>
                )}

                {/* 3. Number */}
                {field.type === 'number' && (
                  <input
                    type="number"
                    required={field.required}
                    placeholder={field.placeholder || 'أدخل الرقم...'}
                    className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                    value={val !== undefined ? val : ''}
                    onChange={e => setAdditionalAnswers({ ...additionalAnswers, [field.id]: e.target.value })}
                  />
                )}

                {/* 4. Dropdown Select / Combo Box */}
                {field.type === 'select' && (
                  <select
                    required={field.required}
                    className="w-full p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-primary-500"
                    value={val || ''}
                    onChange={e => setAdditionalAnswers({ ...additionalAnswers, [field.id]: e.target.value })}
                  >
                    <option value="">-- اختر الإجابة --</option>
                    {(field.options || []).map((opt, oIdx) => (
                      <option key={oIdx} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {/* 5. Radio Buttons / Multiple Choice */}
                {field.type === 'radio' && (
                  <div className="space-y-2 pt-1">
                    {(field.options || []).map((opt, oIdx) => (
                      <label key={oIdx} className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-200 bg-slate-900/50 p-2.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all">
                        <input
                          type="radio"
                          name={`custom_radio_${field.id}`}
                          value={opt}
                          checked={val === opt}
                          onChange={() => setAdditionalAnswers({ ...additionalAnswers, [field.id]: opt })}
                          className="w-4 h-4 text-primary-500 focus:ring-primary-500"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 6. Checkboxes */}
                {field.type === 'checkbox' && (
                  <div className="space-y-2 pt-1">
                    {(field.options || []).map((opt, oIdx) => {
                      const currentVals: string[] = Array.isArray(val) ? val : [];
                      const isChecked = currentVals.includes(opt);
                      return (
                        <label key={oIdx} className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-200 bg-slate-900/50 p-2.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...currentVals, opt]
                                : currentVals.filter(v => v !== opt);
                              setAdditionalAnswers({ ...additionalAnswers, [field.id]: next });
                            }}
                            className="w-4 h-4 rounded text-primary-500 accent-primary-500"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {/* 11. Terms and Conditions */}
        <div className="space-y-3 p-5 bg-slate-800/80 border border-indigo-500/30 rounded-3xl">
          <div className="flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-wide">
            <i className="fas fa-file-contract text-base"></i>
            <span>الشروط والأحكام الخاصة بالتعاقد (حجز الكورس)</span>
          </div>

          <div className="p-3 bg-slate-900/80 border border-slate-700/80 rounded-2xl flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300 font-medium">
              📄 يمكنك مراجعة وثيقة الشروط والأحكام الرسمية للحجز:
            </span>
            <a
              href={template.termsLink || 'https://drive.google.com/file/d/1SjJEb-aIGrLDjJvknn5MZ0ATiisNEXWe/view?usp=sharing'}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 shrink-0 transition-all shadow-md"
            >
              <span>فتح الملق</span>
              <i className="fas fa-external-link-alt text-[10px]"></i>
            </a>
          </div>

          <p className="text-[11px] font-semibold text-amber-300 bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-xl flex items-center gap-2">
            <i className="fas fa-comments text-amber-400"></i>
            <span>💬 بيتم إرسالها ليك مع لينك الفورم .. ارجع للواتس أب تأكد أنك قرأتها بالكامل</span>
          </p>

          <label className="flex items-center gap-3 pt-2 cursor-pointer group">
            <input
              type="radio"
              required
              name="termsAgreed"
              checked={termsAgreed}
              onChange={() => setTermsAgreed(true)}
              className="w-5 h-5 text-emerald-500 focus:ring-emerald-500 bg-slate-700 border-slate-600 cursor-pointer"
            />
            <span className="text-xs font-black text-emerald-400 group-hover:text-emerald-300 transition-colors">
              نعم قرأتها وموافق عليها بالكامل
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-black text-base rounded-2xl shadow-xl shadow-primary-600/25 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>جاري إرسال وتأكيد البيانات...</span>
            </>
          ) : (
            <>
              <i className="fas fa-paper-plane"></i>
              <span>إرسال وتأكيد البيانات الآن</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default ConfirmBookingPortal;
