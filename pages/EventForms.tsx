import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, genericDelete } from '../services/firestore';
import { EventForm, EventFormField, EventFormFieldType, EventFormSubmission } from '../types';
import DeleteModal from '../components/DeleteModal';
import * as XLSX from 'xlsx';

const FIELD_TYPE_LABELS: Record<EventFormFieldType, string> = {
  text: 'نص قصير',
  whatsapp: 'رقم واتساب',
  phone: 'رقم تليفون',
  url: 'رابط (Behance / بورتفوليو..)',
  textarea: 'نص طويل / ملاحظات',
};

const FIELD_TYPE_ICONS: Record<EventFormFieldType, string> = {
  text: 'fa-font',
  whatsapp: 'fa-whatsapp',
  phone: 'fa-phone',
  url: 'fa-link',
  textarea: 'fa-align-left',
};

const genId = () => Math.random().toString(36).slice(2, 10);

const defaultFields = (): EventFormField[] => [
  { id: genId(), label: 'الاسم', type: 'text', required: true },
  { id: genId(), label: 'رقم الواتساب', type: 'whatsapp', required: true },
];

const EventForms: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;

  const [forms, setForms] = useState<EventForm[]>([]);
  const [submissions, setSubmissions] = useState<EventFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<EventFormField[]>(defaultFields());

  const [responsesForm, setResponsesForm] = useState<EventForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canManage = hasPermission('manageEventForms');

  const fetchData = async () => {
    setLoading(true);
    const [f, s] = await Promise.all([
      genericGet<EventForm>('event_forms'),
      genericGet<EventFormSubmission>('event_form_submissions'),
    ]);
    setForms(f.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    setSubmissions(s);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const submissionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    submissions.forEach(s => { map[s.formId] = (map[s.formId] || 0) + 1; });
    return map;
  }, [submissions]);

  const openCreateModal = () => {
    setEditingId(null);
    setEventName('');
    setDescription('');
    setFields(defaultFields());
    setModalOpen(true);
  };

  const openEditModal = (form: EventForm) => {
    setEditingId(form.id);
    setEventName(form.eventName);
    setDescription(form.description || '');
    setFields(form.fields.map(f => ({ ...f })));
    setModalOpen(true);
  };

  const addField = (type: EventFormFieldType) => {
    setFields(prev => [...prev, { id: genId(), label: '', type, required: true, allowSameAsWhatsapp: type === 'phone' }]);
  };

  const updateField = (id: string, patch: Partial<EventFormField>) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) { alert('اسم الفعالية مطلوب'); return; }
    if (fields.length === 0) { alert('أضف سؤال واحد على الأقل'); return; }
    if (fields.some(f => !f.label.trim())) { alert('كل سؤال لازم يكون له نص'); return; }

    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    const data = { eventName: eventName.trim(), description: description.trim(), fields };
    if (editingId) {
      await genericUpdate('event_forms', editingId, data, performedBy);
    } else {
      await genericAdd('event_forms', { ...data, isOpen: true, createdAt: new Date().toISOString(), createdBy: userProfile?.displayName || 'System' }, performedBy);
    }
    setModalOpen(false);
    fetchData();
  };

  const toggleOpen = async (form: EventForm) => {
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    await genericUpdate('event_forms', form.id, {
      isOpen: !form.isOpen,
      closedAt: form.isOpen ? new Date().toISOString() : null,
    }, performedBy);
    fetchData();
  };

  const copyLink = (formId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/event-form/${formId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportResponses = (form: EventForm) => {
    const rows = submissions
      .filter(s => s.formId === form.id)
      .sort((a, b) => (a.submittedAt || '').localeCompare(b.submittedAt || ''))
      .map(s => {
        const row: Record<string, any> = {};
        form.fields.forEach(f => { row[f.label] = s.answers[f.id] || ''; });
        row['تاريخ التسجيل'] = s.submittedAt ? new Date(s.submittedAt).toLocaleString('ar-EG') : '';
        return row;
      });
    if (rows.length === 0) { alert('لا يوجد بيانات لتصديرها بعد'); return; }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Responses');
    XLSX.writeFile(workbook, `${form.eventName.replace(/[^\w؀-ۿ]+/g, '_')}_Responses_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!hasPermission('viewEventForms')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <i className="fas fa-lock text-4xl text-red-500 mb-4"></i>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-gray-500">Only authorized personnel can manage event forms.</p>
      </div>
    );
  }

  const responsesRows = responsesForm ? submissions.filter(s => s.formId === responsesForm.id).sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')) : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('eventForms')}</h1>
          <p className="text-xs text-gray-400 mt-1">استمارات جمع بيانات للفعاليات والورش المجانية - أسئلة مخصصة لكل فعالية</p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30"
          >
            <i className="fas fa-plus mr-2 rtl:ml-2"></i> فورم جديد
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forms.map(form => (
          <div key={form.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full w-fit ${form.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {form.isOpen ? 'مفتوح للتسجيل' : 'مقفول'}
              </span>
              <span className="text-[10px] text-gray-400 font-bold">
                <i className="fas fa-users mr-1"></i>{submissionCounts[form.id] || 0} رد
              </span>
            </div>

            <h3 className="text-lg font-bold mb-1">{form.eventName}</h3>
            {form.description && <p className="text-xs text-gray-400 mb-3 line-clamp-2">{form.description}</p>}
            <p className="text-[10px] text-gray-400 mb-4">{form.fields.length} سؤال</p>

            <div className="mt-auto space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => copyLink(form.id)}
                  className="flex-1 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                >
                  <i className={`fas ${copiedId === form.id ? 'fa-check' : 'fa-link'} mr-1`}></i>
                  {copiedId === form.id ? 'اتنسخ!' : 'نسخ الرابط'}
                </button>
                <button
                  onClick={() => setResponsesForm(form)}
                  className="flex-1 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary-100 dark:border-primary-800 hover:bg-primary-100 transition-colors"
                >
                  <i className="fas fa-table mr-1"></i> الردود
                </button>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleOpen(form)}
                    className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                      form.isOpen
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-100 dark:border-red-900/40 hover:bg-red-100'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-600 border border-green-100 dark:border-green-900/40 hover:bg-green-100'
                    }`}
                  >
                    <i className={`fas ${form.isOpen ? 'fa-lock' : 'fa-lock-open'} mr-1`}></i>
                    {form.isOpen ? 'قفل' : 'فتح'}
                  </button>
                  <button onClick={() => openEditModal(form)} className="px-3 py-2 text-blue-500 hover:text-blue-700"><i className="fas fa-edit"></i></button>
                  {hasPermission('deleteRecords') && (
                    <button onClick={() => { setDeleteId(form.id); setDeleteName(form.eventName); }} className="px-3 py-2 text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {forms.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center text-gray-400 italic">لا توجد فورمات فعاليات بعد. أنشئ أول واحدة.</div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-2xl my-8">
            <h2 className="text-xl font-bold mb-6">{editingId ? 'تعديل الفورم' : 'فورم فعالية جديد'}</h2>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">اسم الفعالية * (هيظهر فوق الفورم)</label>
                <input
                  type="text"
                  required
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold"
                  placeholder="مثال: ورشة التصميم المجانية"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">وصف مختصر (اختياري)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  placeholder="هيظهر تحت اسم الفعالية في الفورم"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">الأسئلة</label>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start gap-2 mb-2">
                        <i className={`fas ${FIELD_TYPE_ICONS[field.type]} text-primary-500 mt-3.5`}></i>
                        <input
                          type="text"
                          required
                          value={field.label}
                          onChange={e => updateField(field.id, { label: e.target.value })}
                          placeholder="نص السؤال"
                          className="flex-1 p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm font-bold"
                        />
                        <select
                          value={field.type}
                          onChange={e => updateField(field.id, { type: e.target.value as EventFormFieldType })}
                          className="p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-xs font-bold"
                        >
                          {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between pl-6 rtl:pr-6">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer">
                            <input type="checkbox" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} />
                            إجباري
                          </label>
                          {field.type === 'phone' && (
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer" title="يظهر checkbox للزائر يختار بيه إن رقمه نفس الواتساب">
                              <input type="checkbox" checked={!!field.allowSameAsWhatsapp} onChange={e => updateField(field.id, { allowSameAsWhatsapp: e.target.checked })} />
                              اسمح بـ "نفس رقم الواتساب"
                            </label>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-primary-600 disabled:opacity-20"><i className="fas fa-arrow-up text-[10px]"></i></button>
                          <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-primary-600 disabled:opacity-20"><i className="fas fa-arrow-down text-[10px]"></i></button>
                          <button type="button" onClick={() => removeField(field.id)} className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600"><i className="fas fa-trash text-[10px]"></i></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {(Object.keys(FIELD_TYPE_LABELS) as EventFormFieldType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addField(type)}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-[10px] font-bold hover:bg-primary-50 hover:text-primary-600 transition-colors"
                    >
                      <i className={`fas ${FIELD_TYPE_ICONS[type]} mr-1`}></i> + {FIELD_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 rtl:space-x-reverse pt-6 border-t dark:border-gray-700">
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs tracking-widest">إلغاء</button>
                <button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-500/20">
                  {editingId ? 'حفظ التعديلات' : 'إنشاء الفورم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Responses Modal */}
      {responsesForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-5xl my-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold">{responsesForm.eventName}</h2>
                <p className="text-xs text-gray-400">{responsesRows.length} رد مسجل</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exportResponses(responsesForm)}
                  className="px-5 py-2.5 bg-green-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-green-500/30"
                >
                  <i className="fas fa-file-excel mr-2"></i> تصدير Excel
                </button>
                <button onClick={() => setResponsesForm(null)} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left rtl:text-right text-gray-400 uppercase tracking-widest text-[10px] border-b dark:border-gray-700">
                    {responsesForm.fields.map(f => <th key={f.id} className="py-3 px-3 font-black">{f.label}</th>)}
                    <th className="py-3 px-3 font-black">تاريخ التسجيل</th>
                  </tr>
                </thead>
                <tbody>
                  {responsesRows.map(row => (
                    <tr key={row.id} className="border-b dark:border-gray-700/50">
                      {responsesForm.fields.map(f => <td key={f.id} className="py-3 px-3 font-bold">{row.answers[f.id] || '—'}</td>)}
                      <td className="py-3 px-3 text-gray-400">{row.submittedAt ? new Date(row.submittedAt).toLocaleString('ar-EG') : '—'}</td>
                    </tr>
                  ))}
                  {responsesRows.length === 0 && (
                    <tr><td colSpan={responsesForm.fields.length + 1} className="py-10 text-center text-gray-400 italic">لسه مفيش ردود.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
            await genericDelete('event_forms', deleteId, performedBy);
            setDeleteId(null);
            fetchData();
          }
        }}
        itemName={deleteName}
      />
    </div>
  );
};

export default EventForms;
