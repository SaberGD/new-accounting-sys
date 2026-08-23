
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, genericDelete } from '../services/firestore';
import { Branch } from '../types';
import DeleteModal from '../components/DeleteModal';
import { serverTimestamp } from 'firebase/firestore';

const Branches: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Branch, 'id'>>({
    name: '',
    address: '',
    isActive: true
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const data = await genericGet<Branch>('branches');
    setBranches(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    if (editingId) {
      await genericUpdate('branches', editingId, formData, performedBy);
    } else {
      await genericAdd('branches', { ...formData, createdAt: serverTimestamp() }, performedBy);
    }
    setModalOpen(false);
    fetchData();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">{t('branches')}</h1>
        {hasPermission('manageBranches') && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ name: '', address: '', isActive: true });
              setModalOpen(true);
            }}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg"
          >
            <i className="fas fa-plus mr-2 rtl:ml-2"></i> {t('add')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => (
          <div key={branch.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-1 text-xs font-bold rounded ${branch.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {branch.isActive ? t('active') : t('inactive')}
              </span>
              <div className="flex space-x-2 rtl:space-x-reverse">
                {hasPermission('manageBranches') && (
                  <button onClick={() => { setEditingId(branch.id); setFormData({ ...branch }); setModalOpen(true); }} className="flex flex-col items-center text-blue-500">
                    <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
                    <i className="fas fa-edit"></i>
                  </button>
                )}
                {hasPermission('deleteRecords') && (
                  <button onClick={() => { setDeleteId(branch.id); setDeleteName(branch.name); }} className="flex flex-col items-center text-red-500">
                    <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                    <i className="fas fa-trash"></i>
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">{branch.name}</h3>
            <p className="text-sm text-gray-500 mb-2 flex items-start"><i className="fas fa-map-marker-alt mt-1 mr-2 rtl:ml-2"></i> {branch.address || 'No address provided'}</p>
          </div>
        ))}
        {branches.length === 0 && !loading && (
          <div className="col-span-full py-10 text-center text-gray-400 italic">No branches found. Add some offline locations.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-6">{editingId ? t('edit') : t('add')}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('name')}</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('address')}</label>
                <textarea
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 outline-none"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2 rtl:ml-2"
                />
                <label>{t('active')}</label>
              </div>
              <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-500">{t('cancel')}</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 text-white rounded-lg">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
            await genericDelete('branches', deleteId, performedBy);
            setDeleteId(null);
            fetchData();
          }
        }}
        itemName={deleteName}
      />
    </div>
  );
};

export default Branches;
