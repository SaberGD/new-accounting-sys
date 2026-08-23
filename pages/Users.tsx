
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, upsertDoc, genericDelete } from '../services/firestore';
import { AllowedUser, UserProfile } from '../types';
import DeleteModal from '../components/DeleteModal';
import { serverTimestamp } from 'firebase/firestore';

const Users: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [isModalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<AllowedUser>({ email: '', name: '', role: 'manager', isActive: true });
  const [isEditing, setIsEditing] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allowed, reg] = await Promise.all([
        genericGet<AllowedUser>('allowed_users'),
        genericGet<UserProfile>('users')
      ]);
      setAllowedUsers(allowed);
      // Ensure unique profiles by UID to avoid duplicate key errors
      const uniqueProfiles = reg.reduce((acc: UserProfile[], current) => {
        const x = acc.find(item => item.uid === current.uid);
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setProfiles(uniqueProfiles);
    } catch (err) {
      console.error("Fetch users error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = formData.email.trim().toLowerCase();
    
    if (!normalizedEmail) {
      setStatusMsg({ type: 'error', text: "Email address is required." });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      const invitationData: any = {
        email: normalizedEmail,
        name: formData.name,
        role: formData.role,
        isActive: formData.isActive,
      };

      // Only set invitation metadata on first creation or if specifically desired
      if (!isEditing) {
        invitationData.invitedAt = serverTimestamp();
        invitationData.invitedByUid = userProfile?.uid || 'system';
      }

      // We use email as document ID for allowed_users
      await upsertDoc('allowed_users', normalizedEmail, invitationData);
      
      setStatusMsg({ type: 'success', text: `Successfully saved invitation for ${formData.name}.` });
      
      // Auto-close modal after success delay
      setTimeout(() => {
        setModalOpen(false);
        setStatusMsg(null);
      }, 1500);

      fetchData();
    } catch (err: any) {
      console.error("Invitation save error:", err);
      setStatusMsg({ type: 'error', text: `Failed to save: ${err.message || 'Unknown error'}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRole = async (uid: string, email: string, newRole: any) => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      // 1. Update the user profile
      await upsertDoc('users', uid, { role: newRole });
      
      // 2. Update the allowed_users invitation to keep it in sync
      const normalizedEmail = email.toLowerCase();
      const allowedDoc = await genericGet<AllowedUser>('allowed_users');
      const existingAllowed = allowedDoc.find(a => a.email.toLowerCase() === normalizedEmail);
      
      if (existingAllowed) {
        await upsertDoc('allowed_users', normalizedEmail, { ...existingAllowed, role: newRole });
      }

      setStatusMsg({ type: 'success', text: "Role updated successfully." });
      fetchData();
    } catch (err: any) {
      console.error("Role update error:", err);
      setStatusMsg({ type: 'error', text: `Failed to update role: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncRoles = async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      const [allowed, reg] = await Promise.all([
        genericGet<AllowedUser>('allowed_users'),
        genericGet<UserProfile>('users')
      ]);

      let updatedCount = 0;
      for (const profile of reg) {
        const allowedEntry = allowed.find(a => a.email.toLowerCase() === profile.email.toLowerCase());
        if (allowedEntry && allowedEntry.role !== profile.role) {
          await upsertDoc('users', profile.uid, { role: allowedEntry.role });
          updatedCount++;
        }
      }

      setStatusMsg({ type: 'success', text: `Sync complete. Updated ${updatedCount} user profiles.` });
      fetchData();
    } catch (err: any) {
      console.error("Sync error:", err);
      setStatusMsg({ type: 'error', text: `Sync failed: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!hasPermission('manageUsers')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <i className="fas fa-lock text-4xl text-red-500 mb-4"></i>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-gray-500">Only authorized personnel can manage system invitations.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Users & Invitations</h1>
        <div className="flex gap-3">
          <button
            onClick={handleSyncRoles}
            disabled={isSyncing || isSaving}
            className="bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/30 flex items-center gap-2"
          >
            {isSyncing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
            Sync Roles
          </button>
          <button
            onClick={() => { setIsEditing(false); setFormData({ email: '', name: '', role: 'manager', isActive: true }); setModalOpen(true); setStatusMsg(null); }}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30"
          >
            <i className="fas fa-user-plus mr-2 rtl:ml-2"></i> Invite User
          </button>
        </div>
      </div>

      {statusMsg && !isModalOpen && (
        <div className={`p-4 rounded-xl mb-6 flex items-center animate-in fade-in slide-in-from-top-2 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          <i className={`fas ${statusMsg.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-3`}></i>
          <span className="text-sm font-bold">{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><i className="fas fa-times"></i></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Invitations List */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
            <h3 className="font-bold">Pending / Active Invitations</h3>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {allowedUsers.map(u => (
              <div key={u.email} className="p-6 flex justify-between items-center">
                <div>
                  <p className="font-bold">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded mt-1 inline-block ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                </div>
                <div className="flex space-x-3 rtl:space-x-reverse">
                  <button onClick={() => { setIsEditing(true); setFormData(u); setModalOpen(true); setStatusMsg(null); }} className="flex flex-col items-center text-blue-500 hover:text-blue-700 transition-colors">
                    <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
                    <i className="fas fa-edit"></i>
                  </button>
                  <button onClick={() => { setDeleteId(u.email); setDeleteName(u.name); }} className="flex flex-col items-center text-red-500 hover:text-red-700 transition-colors">
                    <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
            {allowedUsers.length === 0 && !loading && (
              <div className="p-10 text-center text-gray-400 italic">No invitations yet.</div>
            )}
          </div>
        </div>

        {/* Registered Users List */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
            <h3 className="font-bold">Registered Profiles</h3>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {profiles.map(p => (
              <div key={p.uid} className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4 rtl:space-x-reverse">
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center font-bold text-primary-600 uppercase">{p.displayName[0]}</div>
                  <div>
                    <p className="font-bold">{p.displayName}</p>
                    <p className="text-[10px] text-gray-400 font-mono">UID: {p.uid.substring(0, 8)}...</p>
                    <p className="text-[10px] text-gray-400 font-medium">{p.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <select 
                    className="text-[11px] font-bold bg-gray-50 dark:bg-gray-700 border-none rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-500"
                    value={p.role}
                    onChange={(e) => handleUpdateRole(p.uid, p.email, e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="admin">Admin</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Manager</option>
                    <option value="training_team_leader">Training TL</option>
                    <option value="sales">Sales</option>
                  </select>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold uppercase">Online</span>
                </div>
              </div>
            ))}
            {profiles.length === 0 && !loading && (
              <div className="p-10 text-center text-gray-400 italic">No profiles created yet.</div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">{isEditing ? 'Edit Invitation' : 'Invite User'}</h2>
            
            {statusMsg && (
              <div className={`p-4 rounded-xl mb-6 flex items-center ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <i className={`fas ${statusMsg.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-3`}></i>
                <span className="text-sm font-bold">{statusMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Email Address *</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  required 
                  disabled={isEditing || isSaving} 
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all disabled:opacity-50" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Full Name *</label>
                <input 
                  type="text" 
                  placeholder="John Doe" 
                  required 
                  disabled={isSaving}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Access Level *</label>
                <select 
                  disabled={isSaving}
                  className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold" 
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value as any})}
                >
                  <option value="manager">Manager (Read/Write)</option>
                  <option value="supervisor">Supervisor (Full Control - No Users)</option>
                  <option value="training_team_leader">Training Team Leader (Groups/Bookings Only)</option>
                  <option value="sales">Sales (View Own Data Only)</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>
              <div className="flex items-center space-x-3 rtl:space-x-reverse bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl">
                <input 
                  type="checkbox" 
                  disabled={isSaving}
                  checked={formData.isActive} 
                  onChange={e => setFormData({...formData, isActive: e.target.checked})} 
                  id="active-user"
                  className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="active-user" className="text-sm font-bold cursor-pointer">Account is Active</label>
              </div>
              <div className="flex justify-end space-x-3 rtl:space-x-reverse pt-6 border-t dark:border-gray-700">
                <button type="button" disabled={isSaving} onClick={() => setModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs tracking-widest">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-10 py-3 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center"
                >
                  {isSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i> SAVING...</> : 'SAVE INVITATION'}
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
            await genericDelete('allowed_users', deleteId);
            setDeleteId(null);
            fetchData();
          }
        }}
        itemName={deleteName}
      />
    </div>
  );
};

export default Users;
