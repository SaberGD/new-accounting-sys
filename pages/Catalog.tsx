
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, genericDelete } from '../services/firestore';
import { Course, Diploma, CatalogCategory } from '../types';
import DeleteModal from '../components/DeleteModal';
import * as XLSX from 'xlsx';

type ProductKind = 'courses' | 'diplomas';

const COLLECTIONS: Record<ProductKind, string> = {
  courses: 'catalog_courses',
  diplomas: 'catalog_diplomas'
};

const DEFAULT_CATEGORIES = ['برامج مُنفصلة', 'دبلومة كاملة', 'ورش مُتخصصة'];

const emptyForm = {
  name: '',
  basePrice: 0,
  active: true,
  courseIds: [] as string[],
  categoryId: '',
  usdPrice: 0,
  usdPriceAfterDiscount: 0,
  sarPrice: 0,
  eurPrice: 0
};

const Catalog: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [activeTab, setActiveTab] = useState<'categories' | ProductKind>('categories');
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Forms
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<ProductKind>('courses');
  const [formData, setFormData] = useState(emptyForm);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteKind, setDeleteKind] = useState<ProductKind>('courses');
  const [deleteName, setDeleteName] = useState('');

  // Category manager
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const canManage = hasPermission('manageCatalog');
  const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;

  const sortedCategories = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const categoryName = (id?: string | null) => categories.find(c => c.id === id)?.name;

  const fetchCategories = async (forceRefresh = false) => {
    // Kept out of the core Promise.all on purpose: if the catalog_categories
    // rule isn't published yet, the rest of the catalog must still load.
    try {
      setCategories(await genericGet<CatalogCategory>('catalog_categories', forceRefresh));
      setCategoriesError(false);
    } catch (err) {
      console.error('Failed to load catalog categories:', err);
      setCategoriesError(true);
    }
  };

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
    fetchCategories();
  }, []);

  const handleExportCatalog = () => {
    const data = [
      ...courses.map(c => ({ 'Product Type': 'COURSE', 'Category': categoryName(c.categoryId) || '-', 'Name': c.name, 'Price (EGP)': c.basePrice, 'Status': c.active ? 'Active' : 'Inactive' })),
      ...diplomas.map(d => ({ 'Product Type': 'DIPLOMA', 'Category': categoryName(d.categoryId) || '-', 'Name': d.name, 'Price (EGP)': d.basePrice, 'Status': d.active ? 'Active' : 'Inactive' }))
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");
    XLSX.writeFile(workbook, `SG_Catalog_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormKind(activeTab === 'diplomas' ? 'diplomas' : 'courses');
    setFormData(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (kind: ProductKind, item: Course | Diploma) => {
    setEditingId(item.id);
    setFormKind(kind);
    setFormData({
      name: item.name,
      basePrice: item.basePrice,
      active: item.active,
      courseIds: kind === 'diplomas' ? ((item as Diploma).courseIds || []) : [],
      categoryId: item.categoryId || '',
      usdPrice: item.foreignPrices?.USD?.price || 0,
      usdPriceAfterDiscount: item.foreignPrices?.USD?.priceAfterDiscount || 0,
      sarPrice: item.foreignPrices?.SAR?.price || 0,
      eurPrice: item.foreignPrices?.EUR?.price || 0
    });
    setModalOpen(true);
  };

  const openDelete = (kind: ProductKind, item: Course | Diploma) => {
    setDeleteKind(kind);
    setDeleteId(item.id);
    setDeleteName(item.name);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const collection = COLLECTIONS[formKind];

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
      categoryId: formData.categoryId || null,
      ...(formKind === 'diplomas' ? { courseIds: formData.courseIds } : {}),
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
      await genericDelete(COLLECTIONS[deleteKind], deleteId, performedBy);
      setDeleteId(null);
      fetchData();
    }
  };

  // ---------- Category management ----------

  const runCategoryAction = async (action: () => Promise<unknown>) => {
    setIsSavingCategory(true);
    try {
      await action();
      await fetchCategories(true);
    } catch (err: any) {
      console.error('Category action failed:', err);
      alert(`حصل خطأ: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const nextOrder = () => categories.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    runCategoryAction(async () => {
      await genericAdd('catalog_categories', { name, order: nextOrder() }, performedBy);
      setNewCategoryName('');
    });
  };

  const handleAddDefaultCategories = () => {
    runCategoryAction(async () => {
      let order = nextOrder();
      for (const name of DEFAULT_CATEGORIES) {
        if (!categories.some(c => c.name === name)) {
          await genericAdd('catalog_categories', { name, order: order++ }, performedBy);
        }
      }
    });
  };

  const handleRenameCategory = (id: string) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    runCategoryAction(async () => {
      await genericUpdate('catalog_categories', id, { name }, performedBy);
      setEditingCategoryId(null);
    });
  };

  const handleMoveCategory = (index: number, direction: -1 | 1) => {
    const other = sortedCategories[index + direction];
    const current = sortedCategories[index];
    if (!other || !current) return;
    runCategoryAction(async () => {
      // Re-number everything so legacy/duplicate order values can't block the swap.
      const reordered = [...sortedCategories];
      reordered[index] = other;
      reordered[index + direction] = current;
      await Promise.all(reordered.map((c, i) => genericUpdate('catalog_categories', c.id, { order: i + 1 })));
    });
  };

  const handleDeleteCategory = (category: CatalogCategory) => {
    const count = [...courses, ...diplomas].filter(i => i.categoryId === category.id).length;
    const msg = count > 0
      ? `حذف تصنيف "${category.name}"؟ فيه ${count} عنصر هيتنقلوا لـ "بدون تصنيف".`
      : `حذف تصنيف "${category.name}"؟`;
    if (!window.confirm(msg)) return;
    runCategoryAction(() => genericDelete('catalog_categories', category.id, performedBy));
  };

  // ---------- Rendering helpers ----------

  const renderUsdBox = (item: Course | Diploma) => item.foreignPrices?.USD?.price ? (
    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40">
      <span className="text-[10px] font-black text-blue-600 uppercase block mb-1">السعر الدولي (USD)</span>
      <div className="flex items-center gap-2 font-black text-sm text-blue-900 dark:text-blue-200">
        <span>${item.foreignPrices.USD.price} USD</span>
        {item.foreignPrices.USD.priceAfterDiscount ? (
          <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-md">
            بعد الخصم: ${item.foreignPrices.USD.priceAfterDiscount}
          </span>
        ) : null}
      </div>
    </div>
  ) : null;

  const renderCategoryBadge = (item: Course | Diploma) => {
    const name = categoryName(item.categoryId);
    return name ? (
      <span className="inline-block mb-3 px-2.5 py-0.5 text-[10px] font-black rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
        <i className="fas fa-tag mr-1 rtl:ml-1"></i>{name}
      </span>
    ) : null;
  };

  const renderItemActions = (kind: ProductKind, item: Course | Diploma) => (
    <div className="flex space-x-3 rtl:space-x-reverse">
      {canManage && (
        <button onClick={() => openEditModal(kind, item)} className="flex flex-col items-center text-blue-500">
          <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
          <i className="fas fa-edit"></i>
        </button>
      )}
      {hasPermission('deleteRecords') && (
        <button onClick={() => openDelete(kind, item)} className="flex flex-col items-center text-red-500">
          <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
          <i className="fas fa-trash"></i>
        </button>
      )}
    </div>
  );

  const renderCategoryList = (title: string, items: { kind: ProductKind; item: Course | Diploma }[], key: string, muted = false) => (
    <div key={key} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className={`px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between ${muted ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-primary-50/60 dark:bg-primary-900/20'}`}>
        <h3 className="font-black text-lg flex items-center gap-2">
          <i className={`fas ${muted ? 'fa-question-circle text-gray-400' : 'fa-tag text-primary-600'}`}></i>
          {title}
        </h3>
        <span className="text-xs font-bold text-gray-500">{items.length} عنصر</span>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400 italic">لا يوجد عناصر في التصنيف ده</div>
      ) : (
        <div className="divide-y dark:divide-gray-700">
          {items.map(({ kind, item }) => (
            <div key={`${kind}-${item.id}`} className="px-6 py-4 flex flex-wrap items-center gap-4 group">
              <div className="flex-1 min-w-[200px]">
                <p className="font-black">{item.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${kind === 'diplomas' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {kind === 'diplomas' ? 'دبلومة' : 'كورس'}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${item.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {item.active ? t('active') : t('inactive')}
                  </span>
                </div>
              </div>
              <div className="text-end">
                <p className="text-xl font-black text-primary-600">{item.basePrice.toLocaleString()} <span className="text-xs">EGP</span></p>
                {item.foreignPrices?.USD?.price ? (
                  <p className="text-xs font-bold text-blue-600">
                    ${item.foreignPrices.USD.price}
                    {item.foreignPrices.USD.priceAfterDiscount ? <span className="text-green-600"> → ${item.foreignPrices.USD.priceAfterDiscount}</span> : null}
                  </p>
                ) : null}
              </div>
              {renderItemActions(kind, item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCategoriesView = () => {
    const allItems: { kind: ProductKind; item: Course | Diploma }[] = [
      ...courses.map(item => ({ kind: 'courses' as const, item })),
      ...diplomas.map(item => ({ kind: 'diplomas' as const, item }))
    ];
    const knownIds = new Set(categories.map(c => c.id));
    const uncategorized = allItems.filter(({ item }) => !item.categoryId || !knownIds.has(item.categoryId));

    return (
      <div className="space-y-6">
        {categoriesError && (
          <div className="p-4 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-sm font-bold">
            <i className="fas fa-exclamation-triangle mr-2 rtl:ml-2"></i>
            مش قادر يقرا التصنيفات. اتأكد إن قواعد Firestore فيها catalog_categories واتعملها Publish من Firebase Console.
          </div>
        )}
        {sortedCategories.length === 0 && !categoriesError && (
          <div className="p-8 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
            <p className="font-bold text-gray-500 mb-4">لسه مفيش تصنيفات. ابدأ بإضافة التصنيفات من زرار "إدارة التصنيفات".</p>
            {canManage && (
              <button onClick={handleAddDefaultCategories} disabled={isSavingCategory} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold disabled:opacity-60">
                <i className="fas fa-magic mr-2 rtl:ml-2"></i>
                إضافة التصنيفات الأساسية ({DEFAULT_CATEGORIES.join(' / ')})
              </button>
            )}
          </div>
        )}
        {sortedCategories.map(category =>
          renderCategoryList(
            category.name,
            allItems.filter(({ item }) => item.categoryId === category.id),
            category.id
          )
        )}
        {uncategorized.length > 0 && renderCategoryList('بدون تصنيف', uncategorized, '__uncategorized', true)}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('catalog')}</h1>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Courses & Diplomas Pricing</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {hasPermission('viewExports') && (
            <button
              onClick={handleExportCatalog}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all text-sm uppercase flex items-center gap-2"
            >
              <i className="fas fa-file-excel"></i>
              Export Price List
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setCategoryModalOpen(true)}
              className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-500/30 text-sm flex items-center gap-2"
            >
              <i className="fas fa-tags"></i>
              إدارة التصنيفات
            </button>
          )}
          {canManage && (
            <button
              onClick={openAddModal}
              className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-transform active:scale-95"
            >
              <i className="fas fa-plus mr-2"></i> {t('add')}
            </button>
          )}
        </div>
      </div>

      <div className="flex space-x-4 rtl:space-x-reverse mb-6 border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-2 px-4 font-bold text-sm transition-colors ${activeTab === 'categories' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500'}`}
        >
          <i className="fas fa-list mr-1 rtl:ml-1"></i> حسب التصنيف
        </button>
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

      {loading ? (
        <div className="p-10 text-center text-gray-400"><i className="fas fa-spinner fa-spin"></i></div>
      ) : activeTab === 'categories' ? (
        renderCategoriesView()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTab === 'courses' ? (
            courses.map(course => (
              <div key={course.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${course.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {course.active ? t('active') : t('inactive')}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {renderItemActions('courses', course)}
                  </div>
                </div>
                {renderCategoryBadge(course)}
                <h3 className="text-xl font-black mb-4">{course.name}</h3>
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Base Price (EGP)</p>
                  <p className="text-3xl font-black text-primary-600">{course.basePrice.toLocaleString()} <span className="text-xs">EGP</span></p>
                  {renderUsdBox(course)}
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
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {renderItemActions('diplomas', diploma)}
                  </div>
                </div>
                {renderCategoryBadge(diploma)}
                <h3 className="text-xl font-black mb-1">{diploma.name}</h3>
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-4">{diploma.courseIds?.length || 0} Unified Courses</p>
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Diploma Price</p>
                  <p className="text-3xl font-black text-primary-600">{diploma.basePrice.toLocaleString()} <span className="text-xs">EGP</span></p>
                  {renderUsdBox(diploma)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-lg my-8">
            <h2 className="text-xl font-black uppercase tracking-tight mb-6">{editingId ? t('edit') : t('add')} Record</h2>
            <form onSubmit={handleSave} className="space-y-4">
              {!editingId && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">نوع المنتج</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['courses', 'diplomas'] as ProductKind[]).map(kind => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setFormKind(kind)}
                        className={`p-3 rounded-xl font-bold text-sm border-2 transition-colors ${formKind === kind ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-transparent bg-gray-50 dark:bg-gray-700 text-gray-500'}`}
                      >
                        {kind === 'courses' ? t('courses') : t('diplomas')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">{t('name')}</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">التصنيف</label>
                <select value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-bold">
                  <option value="">بدون تصنيف</option>
                  {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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

              {formKind === 'diplomas' && (
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

      {/* Category Manager Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black"><i className="fas fa-tags text-amber-500 mr-2 rtl:ml-2"></i> إدارة التصنيفات</h2>
              <button onClick={() => { setCategoryModalOpen(false); setEditingCategoryId(null); }} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
            </div>

            <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="اسم التصنيف الجديد"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                disabled={isSavingCategory}
                className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none font-bold"
              />
              <button type="submit" disabled={isSavingCategory || !newCategoryName.trim()} className="px-5 bg-primary-600 text-white rounded-xl font-bold disabled:opacity-50">
                <i className="fas fa-plus"></i>
              </button>
            </form>

            {sortedCategories.length === 0 ? (
              <div className="text-center">
                <p className="text-sm text-gray-400 italic mb-4">مفيش تصنيفات لسه.</p>
                <button onClick={handleAddDefaultCategories} disabled={isSavingCategory} className="px-5 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl font-bold text-sm disabled:opacity-50">
                  إضافة التصنيفات الأساسية
                </button>
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-2xl">
                {sortedCategories.map((category, index) => (
                  <div key={category.id} className="p-3 flex items-center gap-2">
                    <div className="flex flex-col">
                      <button onClick={() => handleMoveCategory(index, -1)} disabled={index === 0 || isSavingCategory} className="text-gray-400 hover:text-primary-600 disabled:opacity-20 text-xs" title="لفوق">
                        <i className="fas fa-chevron-up"></i>
                      </button>
                      <button onClick={() => handleMoveCategory(index, 1)} disabled={index === sortedCategories.length - 1 || isSavingCategory} className="text-gray-400 hover:text-primary-600 disabled:opacity-20 text-xs" title="لتحت">
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>
                    {editingCategoryId === category.id ? (
                      <>
                        <input
                          type="text"
                          autoFocus
                          value={editingCategoryName}
                          onChange={e => setEditingCategoryName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRenameCategory(category.id); } }}
                          className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg outline-none font-bold"
                        />
                        <button onClick={() => handleRenameCategory(category.id)} disabled={isSavingCategory} className="text-green-600 px-2"><i className="fas fa-check"></i></button>
                        <button onClick={() => setEditingCategoryId(null)} className="text-gray-400 px-2"><i className="fas fa-times"></i></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-bold">{category.name}</span>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {[...courses, ...diplomas].filter(i => i.categoryId === category.id).length} عنصر
                        </span>
                        <button onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} disabled={isSavingCategory} className="text-blue-500 px-2"><i className="fas fa-edit"></i></button>
                        <button onClick={() => handleDeleteCategory(category)} disabled={isSavingCategory} className="text-red-500 px-2"><i className="fas fa-trash"></i></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} itemName={deleteName} />
    </div>
  );
};

export default Catalog;
