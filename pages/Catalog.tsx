
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, genericDelete } from '../services/firestore';
import { Course, Diploma } from '../types';
import DeleteModal from '../components/DeleteModal';
import * as XLSX from 'xlsx';

const Catalog: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [activeTab, setActiveTab] = useState<'courses' | 'diplomas'>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Forms
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    basePrice: 0,
    active: true,
    courseIds: [] as string[],
    usdPrice: 0,
    usdPriceAfterDiscount: 0,
    sarPrice: 0,
    eurPrice: 0
  });
  
  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const canDelete = hasPermission('deleteRecords');

  const fetchData = async () => {
    setLoading(true);
    const [c, d] = await Promise.all([
      genericGet<Course>('catalog_courses'),
      genericGet<Diploma>('catalog_diplomas')
    ]);
    setCourses(c);
    setDiplomas(d);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExportCatalog = () => {
    const data = [
      ...courses.map(c => ({ 'Product Type': 'COURSE', 'Name': c.name, 'Price (EGP)': c.basePrice, 'Status': c.active ? 'Active' : 'Inactive' })),
      ...diplomas.map(d => ({ 'Product Type': 'DIPLOMA', 'Name': d.name, 'Price (EGP)': d.basePrice, 'Status': d.active ? 'Active' : 'Inactive' }))
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");
    XLSX.writeFile(workbook, `SG_Catalog_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const collection = activeTab === 'courses' ? 'catalog_courses' : 'catalog_diplomas';
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;

    const foreignPrices: Record<string, { price: number; priceAfterDiscount?: number }> = {};
    if (formData.usdPrice > 0) {
      foreignPrices['USD'] = {
        price: formData.usdPrice,
        priceAfterDiscount: formData.usdPriceAfterDiscount > 0 ? formData.usdPriceAfterDiscount : undefined
      };
    }
    if (formData.sarPrice > 0) {
      foreignPrices['SAR'] = { price: formData.sarPrice };
    }
    if (formData.eurPrice > 0) {
      foreignPrices['EUR'] = { price: formData.eurPrice };
    }

    const payload = {
      name: formData.name,
      basePrice: formData.basePrice,
      active: formData.active,
      ...(activeTab === 'diplomas' ? { courseIds: formData.courseIds } : {}),
      foreignPrices: Object.keys(foreignPrices).length > 0 ? foreignPrices : undefined
    };

    if (editingId) {
      await genericUpdate(collection, editingId, payload, performedBy);
    } else {
      await genericAdd(collection, payload, performedBy);
    }
    setModalOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (deleteId) {
      const collection = activeTab === 'courses' ? 'catalog_courses' : 'catalog_diplomas';
      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      await genericDelete(collection, deleteId, performedBy);
      setDeleteId(null);
      fetchData();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('catalog')}</h1>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Courses & Diplomas Pricing</p>
        </div>
        <div className="flex gap-3">
          {hasPermission('viewExports') && (
            <button 
              onClick={handleExportCatalog}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all text-sm uppercase flex items-center gap-2"
            >
              <i className="fas fa-file-excel"></i>
              Export Price List
            </button>
          )}
          {hasPermission('manageCatalog') && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  name: '',
                  basePrice: 0,
                  active: true,
                  courseIds: [],
                  usdPrice: 0,
                  usdPriceAfterDiscount: 0,
                  sarPrice: 0,
                  eurPrice: 0
                });
                setModalOpen(true);
              }}
              className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-transform active:scale-95"
            >
              <i className="fas fa-plus mr-2"></i> {t('add')}
            </button>
          )}
        </div>
      </div>

      <div className="flex space-x-4 rtl:space-x-reverse mb-6 border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab('courses')}
          className={`pb-2 px-4 font-bold text-sm transition-colors ${activeTab === 'courses' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}
        >
          {t('courses')}
        </button>
        <button
          onClick={() => setActiveTab('diplomas')}
          className={`pb-2 px-4 font-bold text-sm transition-colors ${activeTab === 'diplomas' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}
        >
          {t('diplomas')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTab === 'courses' ? (
          courses.map(course => (
            <div key={course.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative group overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${course.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {course.active ? t('active') : t('inactive')}
                </span>
                <div className="flex space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasPermission('manageCatalog') && (
                    <button onClick={() => {
                      setEditingId(course.id);
                      setFormData({
                        name: course.name,
                        basePrice: course.basePrice,
                        active: course.active,
                        courseIds: [],
                        usdPrice: course.foreignPrices?.USD?.price || 0,
                        usdPriceAfterDiscount: course.foreignPrices?.USD?.priceAfterDiscount || 0,
                        sarPrice: course.foreignPrices?.SAR?.price || 0,
                        eurPrice: course.foreignPrices?.EUR?.price || 0
                      });
                      setModalOpen(true);
                    }} className="text-blue-500"><i className="fas fa-edit"></i></button>
                  )}
                  {hasPermission('deleteRecords') && (
                    <button onClick={() => { setDeleteId(course.id); setDeleteName(course.name); }} className="text-red-500"><i className="fas fa-trash"></i></button>
                  )}
                </div>
              </div>
              <h3 className="text-xl font-black mb-4">{course.name}</h3>
              <div className="mt-4 pt-4 border-t dark:border-gray-700">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Base Price (EGP)</p>
                <p className="text-3xl font-black text-primary-600">{course.basePrice.toLocaleString()} <span className="text-xs">EGP</span></p>
                
                {course.foreignPrices?.USD?.price && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40">
                    <span className="text-[10px] font-black text-blue-600 uppercase block mb-1">السعر الدولي (USD)</span>
                    <div className="flex items-center gap-2 font-black text-sm text-blue-900 dark:text-blue-200">
                      <span>${course.foreignPrices.USD.price} USD</span>
                      {course.foreignPrices.USD.priceAfterDiscount ? (
                        <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-md">
                          بعد الخصم: ${course.foreignPrices.USD.priceAfterDiscount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          diplomas.map(diploma => (
            <div key={diploma.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative group overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${diploma.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {diploma.active ? t('active') : t('inactive')}
                </span>
                <div className="flex space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasPermission('manageCatalog') && (
                    <button onClick={() => {
                      setEditingId(diploma.id);
                      setFormData({
                        name: diploma.name,
                        basePrice: diploma.basePrice,
                        active: diploma.active,
                        courseIds: diploma.courseIds || [],
                        usdPrice: diploma.foreignPrices?.USD?.price || 0,
                        usdPriceAfterDiscount: diploma.foreignPrices?.USD?.priceAfterDiscount || 0,
                        sarPrice: diploma.foreignPrices?.SAR?.price || 0,
                        eurPrice: diploma.foreignPrices?.EUR?.price || 0
                      });
                      setModalOpen(true);
                    }} className="flex flex-col items-center text-blue-500">
                      <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
                      <i className="fas fa-edit"></i>
                    </button>
                  )}
                  {hasPermission('deleteRecords') && (
                    <button onClick={() => { setDeleteId(diploma.id); setDeleteName(diploma.name); }} className="flex flex-col items-center text-red-500">
                      <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              </div>
              <h3 className="text-xl font-black mb-1">{diploma.name}</h3>
              <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-4">{diploma.courseIds?.length || 0} Unified Courses</p>
              <div className="mt-4 pt-4 border-t dark:border-gray-700">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Diploma Price</p>
                <p className="text-3xl font-black text-primary-600">{diploma.basePrice.toLocaleString()} <span className="text-xs">EGP</span></p>

                {diploma.foreignPrices?.USD?.price && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40">
                    <span className="text-[10px] font-black text-blue-600 uppercase block mb-1">السعر الدولي (USD)</span>
                    <div className="flex items-center gap-2 font-black text-sm text-blue-900 dark:text-blue-200">
                      <span>${diploma.foreignPrices.USD.price} USD</span>
                      {diploma.foreignPrices.USD.priceAfterDiscount ? (
                        <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-md">
                          بعد الخصم: ${diploma.foreignPrices.USD.priceAfterDiscount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-lg my-8">
            <h2 className="text-xl font-black uppercase tracking-tight mb-6">{editingId ? t('edit') : t('add')} Record</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">{t('name')}</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">{t('basePrice')} (بالجنيه المصري)</label>
                <input type="number" required value={formData.basePrice} onChange={e => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-black" />
              </div>

              {/* Foreign Currency Pricing Options */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border dark:border-gray-700 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-blue-600 dark:text-blue-400">
                  <i className="fas fa-globe"></i>
                  <span>تسعير العملات الأجنبية (اختياري - للتحويل من الخارج)</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">السعر بالدولار ($ USD)</label>
                    <input
                      type="number"
                      placeholder="مثال: 100"
                      value={formData.usdPrice || ''}
                      onChange={e => setFormData({ ...formData, usdPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">السعر بالدولار بعد الخصم ($)</label>
                    <input
                      type="number"
                      placeholder="مثال: 80"
                      value={formData.usdPriceAfterDiscount || ''}
                      onChange={e => setFormData({ ...formData, usdPriceAfterDiscount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">السعر بالريال السعودي (ر.س SAR)</label>
                    <input
                      type="number"
                      placeholder="اختياري"
                      value={formData.sarPrice || ''}
                      onChange={e => setFormData({ ...formData, sarPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">السعر باليورو (€ EUR)</label>
                    <input
                      type="number"
                      placeholder="اختياري"
                      value={formData.eurPrice || ''}
                      onChange={e => setFormData({ ...formData, eurPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {activeTab === 'diplomas' && (
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Included Courses</label>
                   {/* Fix: Explicitly cast selectedOptions to resolve 'unknown' property access error */}
                   <select multiple className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl h-32 font-medium" value={formData.courseIds} onChange={e => setFormData({ ...formData, courseIds: Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value) })}>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                   </select>
                </div>
              )}
              <label className="flex items-center space-x-3 rtl:space-x-reverse bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl cursor-pointer"><input type="checkbox" checked={formData.active} onChange={e => setFormData({ ...formData, active: e.target.checked })} /><span className="text-sm font-bold">Product is available for booking</span></label>
              <div className="flex justify-end gap-3 pt-6 border-t dark:border-gray-700">
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs">Cancel</button>
                <button type="submit" className="px-10 py-3 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-500/30">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} itemName={deleteName} />
    </div>
  );
};

export default Catalog;
