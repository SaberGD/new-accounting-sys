
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, softDeleteDoc, bulkReassignSales, bulkRevertSales, getReassignedCount } from '../services/firestore';
import { SalesStaff as SalesStaffType, UserProfile } from '../types';
import DeleteModal from '../components/DeleteModal';
import { serverTimestamp } from 'firebase/firestore';

const SalesStaff: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [staff, setStaff] = useState<SalesStaffType[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignedCounts, setReassignedCounts] = useState<Record<string, number>>({});

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<SalesStaffType, 'id' | 'createdAt'>>({
    fullName: '',
    isActive: true,
    userId: ''
  });

  const [reassignModal, setReassignModal] = useState(false);
  const [reassignData, setReassignData] = useState({ fromId: '', toId: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [staffData, profilesData] = await Promise.all([
      genericGet<SalesStaffType>('sales_staff'),
      genericGet<UserProfile>('users')
    ]);
    setStaff(staffData);
    // Ensure unique profiles by UID to avoid duplicate key errors
    const uniqueProfiles = profilesData.reduce((acc: UserProfile[], current) => {
      const x = acc.find(item => item.uid === current.uid);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);
    setProfiles(uniqueProfiles);

    // Fetch reassigned counts
    const counts: Record<string, number> = {};
    await Promise.all(staffData.map(async (s) => {
      counts[s.id] = await getReassignedCount(s.id);
    }));
    setReassignedCounts(counts);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    if (editingId) {
      await genericUpdate('sales_staff', editingId, formData, performedBy);
    } else {
      await genericAdd('sales_staff', { ...formData, createdAt: serverTimestamp() }, performedBy);
    }
    setModalOpen(false);
    fetchData();
  };

  const handleBulkReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignData.fromId || !reassignData.toId) return;
    if (reassignData.fromId === reassignData.toId) {
      alert("Source and target sales staff cannot be the same.");
      return;
    }

    setIsProcessing(true);
    try {
      const target = staff.find(s => s.id === reassignData.toId);
      if (!target) throw new Error("Target sales staff not found");

      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      const count = await bulkReassignSales(reassignData.fromId, reassignData.toId, target.fullName, performedBy);
      alert(`Successfully reassigned ${count} active bookings.`);
      setReassignModal(false);
      fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkRevert = async (salesId: string) => {
    if (!confirm("Are you sure you want to return all reassigned customers to this sales representative?")) return;
    
    setIsProcessing(true);
    try {
      const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
      const count = await bulkRevertSales(salesId, performedBy);
      alert(`Successfully reverted ${count} bookings.`);
      fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasPermission('manageSalesStaff')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <i className="fas fa-lock text-4xl text-red-500 mb-4"></i>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-gray-500">Only authorized personnel can manage sales staff.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">{t('salesStaff')}</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setReassignModal(true)}
            className="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/30 flex items-center gap-2"
          >
            <i className="fas fa-exchange-alt"></i> Bulk Reassign
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ fullName: '', isActive: true, userId: '' });
              setModalOpen(true);
            }}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30"
          >
            <i className="fas fa-plus mr-2 rtl:ml-2"></i> {t('add')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map(member => (
          <div key={member.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col space-y-1">
                <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full w-fit ${member.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {member.isActive ? t('active') : t('inactive')}
                </span>
                {member.userId && (
                  <span className="text-[10px] text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded-full w-fit">
                    <i className="fas fa-link mr-1"></i> Linked to Account
                  </span>
                )}
                {reassignedCounts[member.id] > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                      <i className="fas fa-external-link-alt mr-1"></i> {reassignedCounts[member.id]} Reassigned
                    </span>
                    <button 
                      onClick={() => handleBulkRevert(member.id)}
                      disabled={isProcessing}
                      className="text-[10px] text-white bg-amber-500 px-2 py-0.5 rounded-full font-black hover:bg-amber-600 transition-colors"
                      title="Return all reassigned customers back to this representative"
                    >
                      REVERT
                    </button>
                  </div>
                )}
              </div>
              <div className="flex space-x-2 rtl:space-x-reverse">
                {hasPermission('manageSalesStaff') && (
                  <button onClick={() => { setEditingId(member.id); setFormData({ fullName: member.fullName, isActive: member.isActive, userId: member.userId || '' }); setModalOpen(true); }} className="text-blue-500 hover:text-blue-700"><i className="fas fa-edit"></i></button>
                )}
                {hasPermission('deleteRecords') && (
                  <button onClick={() => { setDeleteId(member.id); setDeleteName(member.fullName); }} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4 rtl:space-x-reverse">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 font-bold text-xl">
                {member.fullName[0]}
              </div>
              <div>
                <h3 className="text-lg font-bold">{member.fullName}</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Sales Representative</p>
              </div>
            </div>
          </div>
        ))}
        {staff.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center text-gray-400 italic">No sales staff found. Add your team members.</div>
        )}
      </div>

      {reassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-2">Bulk Reassign Customers</h2>
            <p className="text-xs text-gray-400 mb-6 italic">Move all active bookings from one representative to another temporarily.</p>
            
            <form onSubmit={handleBulkReassign} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Source Representative (From)</label>
                <select
                  required
                  value={reassignData.fromId}
                  onChange={e => setReassignData({ ...reassignData, fromId: e.target.value })}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold"
                >
                  <option value="">Select Source</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-center py-2">
                <i className="fas fa-arrow-down text-gray-300 text-xl"></i>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Target Representative (To)</label>
                <select
                  required
                  value={reassignData.toId}
                  onChange={e => setReassignData({ ...reassignData, toId: e.target.value })}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold"
                >
                  <option value="">Select Target</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t dark:border-gray-700">
                <button type="button" onClick={() => setReassignModal(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs tracking-widest">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isProcessing}
                  className="px-8 py-3 bg-amber-500 text-white rounded-xl font-black shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
                >
                  {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-exchange-alt"></i>}
                  REASSIGN ALL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{editingId ? t('edit') : t('add')} Staff Member</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">{t('name')} *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Link to User Account</label>
                <select
                  value={formData.userId}
                  onChange={e => setFormData({ ...formData, userId: e.target.value })}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold"
                >
                  <option value="">Not Linked</option>
                  {profiles.map(p => (
                    <option key={p.uid} value={p.uid}>{p.displayName} ({p.email})</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1 px-1 italic">Linking allows this user to see only their own customers when logged in with the 'sales' role.</p>
              </div>
              <div className="flex items-center space-x-3 rtl:space-x-reverse bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="isActive" className="text-sm font-bold cursor-pointer">Member is Active</label>
              </div>
              <div className="flex justify-end space-x-3 pt-6 border-t dark:border-gray-700">
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs tracking-widest">Cancel</button>
                <button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-500/20 hover:scale-[1.02] active:scale-95 transition-all">
                  {editingId ? 'UPDATE MEMBER' : 'ADD MEMBER'}
                </button>
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
            await softDeleteDoc('sales_staff', deleteId, userProfile?.uid || '', performedBy);
            setDeleteId(null);
            fetchData();
          }
        }}
        itemName={deleteName}
      />
    </div>
  );
};

export default SalesStaff;
