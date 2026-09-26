import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { genericGetDoc, genericAdd } from '../services/firestore';
import { EventForm, EventFormField } from '../types';

const EventFormPublic: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<EventForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sameAsWhatsapp, setSameAsWhatsapp] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!formId) { setLoading(false); return; }
      const data = await genericGetDoc<EventForm>('event_forms', formId);
      setForm(data);
      setLoading(false);
    };
    load();
  }, [formId]);

  const whatsappField = form?.fields.find(f => f.type === 'whatsapp');

  const handleChange = (field: EventFormField, value: string) => {
    setAnswers(prev => ({ ...prev, [field.id]: value }));
  };

  const handleSameAsWhatsapp = (field: EventFormField, checked: boolean) => {
    setSameAsWhatsapp(prev => ({ ...prev, [field.id]: checked }));
    if (checked && whatsappField) {
      setAnswers(prev => ({ ...prev, [field.id]: prev[whatsappField.id] || '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErrorMessage('');

    for (const field of form.fields) {
      const value = (answers[field.id] || '').trim();
      if (field.required && !value) {
        setErrorMessage(`من فضلك أكمل حقل "${field.label}"`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const finalAnswers: Record<string, string> = {};
      form.fields.forEach(f => { finalAnswers[f.id] = (answers[f.id] || '').trim(); });
      await genericAdd('event_form_submissions', {
        formId: form.id,
        answers: finalAnswers,
        submittedAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMessage('حدث خطأ أثناء إرسال البيانات، برجاء المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4" dir="rtl">
        <i className="fas fa-spinner fa-spin text-3xl text-primary-400"></i>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4 text-center" dir="rtl">
        <i className="fas fa-exclamation-circle text-4xl text-red-400 mb-4"></i>
        <h1 className="text-xl font-black">الفورم غير موجود</h1>
        <p className="text-slate-400 text-sm mt-2">الرابط ده غير صحيح أو الفورم اتحذف.</p>
      </div>
    );
  }

  if (!form.isOpen) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4 text-center" dir="rtl">
        <i className="fas fa-lock text-4xl text-amber-400 mb-4"></i>
        <h1 className="text-xl font-black">{form.eventName}</h1>
        <p className="text-slate-400 text-sm mt-2">التسجيل في الفورم ده مقفول حالياً.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <i className="fas fa-check text-2xl text-emerald-400"></i>
          </div>
          <h1 className="text-xl font-black text-white">تم التسجيل بنجاح!</h1>
          <p className="text-slate-400 text-sm mt-2">شكراً لتسجيلك في {form.eventName}. هنتواصل معاك قريباً.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start py-8 px-4 font-sans" dir="rtl">
      <div className="w-full max-w-xl text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-black bg-primary-500/10 text-primary-400 border-primary-500/20">
          <i className="fas fa-calendar-check"></i>
          <span>استمارة تسجيل</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{form.eventName}</h1>
        {form.description && (
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto font-medium">{form.description}</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-sm"
      >
        {errorMessage && (
          <div className="p-4 bg-red-950/60 border border-red-800/80 rounded-2xl text-red-200 text-xs font-bold flex items-center gap-3">
            <i className="fas fa-exclamation-triangle text-red-400 text-lg"></i>
            <span>{errorMessage}</span>
          </div>
        )}

        {form.fields.map((field, index) => (
          <div key={field.id} className="space-y-2">
            <label className="block text-xs font-black text-slate-200 uppercase tracking-wide">
              {index + 1}. {field.label} {field.required && <span className="text-red-400">*</span>}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                required={field.required}
                value={answers[field.id] || ''}
                onChange={e => handleChange(field, e.target.value)}
                rows={3}
                className="w-full p-4 bg-slate-800/80 border border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
              />
            ) : field.type === 'phone' ? (
              <div className="space-y-2">
                <input
                  type="tel"
                  required={field.required && !sameAsWhatsapp[field.id]}
                  disabled={!!sameAsWhatsapp[field.id]}
                  value={answers[field.id] || ''}
                  onChange={e => handleChange(field, e.target.value)}
                  dir="ltr"
                  className="w-full p-4 bg-slate-800/80 border border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm text-left disabled:opacity-50"
                />
                {field.allowSameAsWhatsapp && whatsappField && (
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!sameAsWhatsapp[field.id]}
                      onChange={e => handleSameAsWhatsapp(field, e.target.checked)}
                    />
                    نفس رقم الواتساب
                  </label>
                )}
              </div>
            ) : (
              <input
                type={field.type === 'url' ? 'url' : field.type === 'whatsapp' ? 'tel' : 'text'}
                required={field.required}
                value={answers[field.id] || ''}
                onChange={e => handleChange(field, e.target.value)}
                dir={field.type === 'whatsapp' || field.type === 'url' ? 'ltr' : 'auto'}
                placeholder={field.type === 'url' ? 'https://...' : undefined}
                className={`w-full p-4 bg-slate-800/80 border border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm ${field.type === 'whatsapp' || field.type === 'url' ? 'text-left' : ''}`}
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-black text-base rounded-2xl shadow-xl shadow-primary-600/25 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {submitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
          {submitting ? 'جاري الإرسال...' : 'إرسال'}
        </button>
      </form>
    </div>
  );
};

export default EventFormPublic;
