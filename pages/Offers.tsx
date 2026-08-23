
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, softDeleteDoc } from '../services/firestore';
import { Offer, Course, Diploma } from '../types';
import DeleteModal from '../components/DeleteModal';

const Offers: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<{ id: string, name: string, type: 'course' | 'diploma', basePrice: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Offer, 'id'>>({ productId: '', productType: 'course', offerPrice: 0, reason: '', enabled: true });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [offs, crs, dips] = await Promise.all([
      genericGet<Offer>('offers'),
      genericGet<Course>('catalog_courses'),
      genericGet<Diploma>('catalog_diplomas')
    ]);
    setOffers(offs);
    const combined = [
      ...crs.map(c => ({ id: c.id, name: c.name, type: 'course' as const, basePrice: c.basePrice })),
      ...dips.map(d => ({ id: d.id, name: d.name, type: 'diploma' as const, basePrice: d.basePrice }))
    ];
    setProducts(combined);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    if (editingId) await genericUpdate('offers', editingId, formData, performedBy);
    else await genericAdd('offers', formData, performedBy);
    setModalOpen(false); fetchData();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">{t('offers')}</h1>
        {hasPermission('manageOffers') && (
          <button onClick={() => { setEditingId(null); setFormData({ productId: '', productType: 'course', offerPrice: 0, reason: '', enabled: true }); setModalOpen(true); }} className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30"><i className="fas fa-plus mr-2"></i> {t('add')}</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {offers.map(offer => {
          const product = products.find(p => p.id === offer.productId);
          const savings = product ? product.basePrice - offer.offerPrice : 0;
          return (
            <div key={offer.id} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-6">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${offer.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{offer.enabled ? 'Active' : 'Disabled'}</span>
                <div className="flex space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasPermission('manageOffers') && (
                    <button onClick={() => { setEditingId(offer.id); setFormData({ ...offer }); setModalOpen(true); }} className="text-blue-500"><i className="fas fa-edit"></i></button>
                  )}
                  {hasPermission('deleteRecords') && (
                    <button onClick={() => { setDeleteId(offer.id); setDeleteName(product?.name || 'Offer'); }} className="text-red-500"><i className="fas fa-trash"></i></button>
                  )}
                </div>
              </div>
              <h3 className="text-xl font-black mb-1">{product?.name}</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-4 font-bold">{offer.reason}</p>
              
              <div className="mt-6 pt-6 border-t dark:border-gray-700 flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Offer Price</p>
                  <p className="text-3xl font-black text-primary-600">{offer.offerPrice.toLocaleString()} <span className="text-xs">EGP</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-green-600 uppercase font-bold">You Save</p>
                  <p className="text-lg font-bold text-green-600">-${savings.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-[9px] text-gray-400 mt-2 font-medium italic">Instead of base price {product?.basePrice.toLocaleString()} EGP</p>
            </div>
          );
        })}
        {offers.length === 0 && !loading && <div className="col-span-full py-20 text-center text-gray-400 italic">No offers created yet.</div>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-6">{editingId ? t('edit') : t('add')} Offer</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Product</label>
              <select required value={formData.productId} onChange={e => { const p = products.find(x => x.id === e.target.value); setFormData({ ...formData, productId: e.target.value, productType: p?.type || 'course' }); }} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none"><option value="">Select Course/Diploma</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">New Price (EGP)</label>
              <input type="number" required value={formData.offerPrice} onChange={e => setFormData({ ...formData, offerPrice: Number(e.target.value) })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none" /></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Reason / Title</label>
              <input type="text" required value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none" placeholder="e.g. Summer 2024 Discount" /></div>
              <label className="flex items-center space-x-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl cursor-pointer"><input type="checkbox" checked={formData.enabled} onChange={e => setFormData({ ...formData, enabled: e.target.checked })} /><span className="text-sm font-bold">Offer is active</span></label>
              <div className="flex justify-end space-x-3 pt-6"><button type="button" onClick={() => setModalOpen(false)} className="px-6 py-2 font-bold text-gray-400">Cancel</button><button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30">Save Offer</button></div>
            </form>
          </div>
        </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined; await softDeleteDoc('offers', deleteId, userProfile?.uid || '', performedBy); } setDeleteId(null); fetchData(); }} itemName={deleteName} />
    </div>
  );
};

export default Offers;
