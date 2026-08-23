
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PermissionKey, PermissionsMap, Role } from '../types';

const PermissionsControl: React.FC = () => {
  const { permissions, userProfile, defaultPermissions } = useAuth();
  const { t } = useTheme();
  const [localPermissions, setLocalPermissions] = useState<PermissionsMap | null>(permissions);
  const [isSaving, setIsSaving] = useState(false);

  // Fallback to permissions from context if local state is null (first load)
  React.useEffect(() => {
    if (permissions && !localPermissions) {
      setLocalPermissions(permissions);
    }
  }, [permissions]);

  if (userProfile?.role !== 'admin') {
    return <div className="p-20 text-center font-black uppercase text-red-500">Admin Only Access</div>;
  }

  const permissionList: { key: PermissionKey; label: string; group: string }[] = [
    { key: 'viewDashboard', label: 'Dashboard Access', group: 'Navigation' },
    { key: 'viewCatalog', label: 'Catalog Access', group: 'Navigation' },
    { key: 'viewOffers', label: 'Offers Access', group: 'Navigation' },
    { key: 'viewBranches', label: 'Branches Access', group: 'Navigation' },
    { key: 'viewGroups', label: 'Groups Access', group: 'Navigation' },
    { key: 'viewBookings', label: 'Bookings Access', group: 'Navigation' },
    { key: 'viewCustomers', label: 'Customers Access', group: 'Navigation' },
    { key: 'viewInstallments', label: 'Installments Access', group: 'Navigation' },
    { key: 'viewRevenue', label: 'Sales Revenue (Cohort)', group: 'Navigation' },
    { key: 'viewCashFlow', label: 'Daily Cash Flow (Actual)', group: 'Navigation' },
    { key: 'viewExports', label: 'Exports Access', group: 'Navigation' },
    { key: 'viewUsers', label: 'User Management', group: 'Navigation' },
    { key: 'viewSettings', label: 'System Settings', group: 'Navigation' },
    { key: 'viewSalesStaff', label: 'Sales Staff Management', group: 'Navigation' },
    { key: 'viewGuide', label: 'System Guide', group: 'Navigation' },
    { key: 'viewAllBookings', label: 'View All Bookings (vs Own Only)', group: 'Navigation' },
    { key: 'viewHistory', label: 'View Audit Logs', group: 'Actions' },
    { key: 'editBookings', label: 'Edit Booking Details', group: 'Actions' },
    { key: 'editGroups', label: 'Edit Group Details', group: 'Actions' },
    { key: 'addCompletionPayment', label: 'Add Completion Payments', group: 'Actions' },
    { key: 'assignGroups', label: 'Assign Groups to Bookings', group: 'Actions' },
    { key: 'deactivateBookings', label: 'Deactivate Bookings', group: 'Actions' },
    { key: 'restoreBookings', label: 'Restore Refunded Bookings', group: 'Actions' },
    { key: 'printInvoices', label: 'Print Invoices', group: 'Actions' },
    { key: 'deleteRecords', label: 'Soft Delete Permission', group: 'Actions' },
    { key: 'issueRefunds', label: 'Issue Refunds', group: 'Actions' },
    { key: 'editInstallments', label: 'Reschedule Installments', group: 'Actions' },
    { key: 'manageUsers', label: 'Manage Users/Roles', group: 'Management' },
    { key: 'manageSettings', label: 'Manage System Settings', group: 'Management' },
    { key: 'manageSalesStaff', label: 'Manage Sales Staff', group: 'Management' },
    { key: 'manageCatalog', label: 'Manage Catalog/Pricing', group: 'Management' },
    { key: 'manageOffers', label: 'Manage Offers', group: 'Management' },
    { key: 'manageBranches', label: 'Manage Branches', group: 'Management' },
    { key: 'manageSystemTools', label: 'Data Integrity Tools', group: 'System' },
    { key: 'impersonation', label: 'Role Impersonation (View As)', group: 'System' },
  ];

  const handleToggle = (key: PermissionKey, role: Role) => {
    if (!localPermissions) return;
    
    // Safety check: ensure key exists in local state
    const currentKeyState = localPermissions[key] || { admin: true, supervisor: false, manager: false };
    
    const updated = {
      ...localPermissions,
      [key]: {
        ...currentKeyState,
        [role]: !currentKeyState[role]
      }
    };
    setLocalPermissions(updated);
  };

  const savePermissions = async () => {
    if (!localPermissions) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'permissions'), localPermissions);
      alert("Permissions updated successfully across the system!");
    } catch (err) {
      alert("Failed to save permissions.");
    } finally {
      setIsSaving(false);
    }
  };

  const groupedPermissions = permissionList.reduce((acc, curr) => {
    if (!acc[curr.group]) acc[curr.group] = [];
    acc[curr.group].push(curr);
    return acc;
  }, {} as Record<string, typeof permissionList>);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Permissions Matrix</h1>
          <p className="text-gray-500 font-medium italic mt-1">Control system access per role dynamically.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => {
              if (!localPermissions) return;
              if (window.confirm("This will copy all Supervisor permissions to the Manager role. Continue?")) {
                const updated = { ...localPermissions };
                Object.keys(updated).forEach(key => {
                  const k = key as PermissionKey;
                  updated[k] = {
                    ...updated[k],
                    manager: updated[k].supervisor
                  };
                });
                setLocalPermissions(updated);
              }
            }}
            disabled={isSaving}
            className="px-6 py-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-2xl font-bold hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <i className="fas fa-sync-alt"></i>
            Sync Manager with Supervisor
          </button>
          <button 
            onClick={async () => {
              if (window.confirm("Are you sure you want to reset all permissions to system defaults? This will overwrite your current settings.")) {
                setIsSaving(true);
                try {
                  await setDoc(doc(db, 'settings', 'permissions'), defaultPermissions);
                  setLocalPermissions(defaultPermissions);
                  alert("Permissions reset to defaults!");
                } catch (err) {
                  alert("Failed to reset permissions.");
                } finally {
                  setIsSaving(false);
                }
              }
            }}
            disabled={isSaving}
            className="px-6 py-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <i className="fas fa-undo"></i>
            Reset Defaults
          </button>
          <button 
            onClick={savePermissions}
            disabled={isSaving}
            className="px-10 py-4 bg-primary-600 text-white rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
          >
            {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-arrow-up"></i>}
            Sync Permissions
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-left rtl:text-right">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-gray-400">Feature / Ability</th>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-red-500 text-center">Admin</th>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-amber-600 text-center">Supervisor</th>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-blue-600 text-center">Manager</th>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-purple-600 text-center">Training</th>
              <th className="px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] text-green-600 text-center">Sales</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {Object.entries(groupedPermissions).map(([group, list]) => (
              <React.Fragment key={group}>
                <tr className="bg-gray-100/30 dark:bg-gray-900/20">
                  <td colSpan={6} className="px-8 py-3 text-[9px] font-black uppercase tracking-widest text-primary-600">{group}</td>
                </tr>
                {list.map((item) => (
                  <tr key={item.key} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors group">
                    <td className="px-8 py-5">
                      <p className="font-bold text-sm text-gray-700 dark:text-gray-200">{item.label}</p>
                      <p className="text-[9px] text-gray-400 font-mono">{item.key}</p>
                    </td>
                    {(['admin', 'supervisor', 'manager', 'training_team_leader', 'sales'] as Role[]).map((role) => {
                      const isSystemAdmin = role === 'admin';
                      const isChecked = isSystemAdmin ? true : (localPermissions?.[item.key]?.[role] || false);
                      
                      return (
                        <td key={role} className="px-8 py-5 text-center">
                          <label className={`inline-flex items-center ${isSystemAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                            <input 
                              type="checkbox" 
                              className="hidden" 
                              checked={isChecked}
                              onChange={() => !isSystemAdmin && handleToggle(item.key, role)}
                              disabled={isSystemAdmin}
                            />
                            <div className={`w-12 h-6 rounded-full p-1 transition-all ${isChecked ? (role === 'admin' ? 'bg-red-500' : role === 'supervisor' ? 'bg-amber-500' : role === 'manager' ? 'bg-blue-500' : role === 'training_team_leader' ? 'bg-purple-500' : 'bg-green-500') : 'bg-gray-200 dark:bg-gray-600'}`}>
                              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-all ${isChecked ? 'translate-x-6' : 'translate-x-0'}`}></div>
                            </div>
                          </label>
                          {isSystemAdmin && <p className="text-[7px] font-black uppercase text-red-500 mt-1">System Locked</p>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
        <div className="flex gap-4">
            <i className="fas fa-info-circle text-blue-500 text-xl mt-1"></i>
            <div>
                <h4 className="font-black text-xs uppercase text-blue-700 dark:text-blue-300 mb-1">Dynamic Permission Sync</h4>
                <p className="text-xs text-blue-600/70 dark:text-blue-400 font-medium leading-relaxed">
                    Changes here take effect immediately for all logged-in users. Revoking "Revenue Access" will hide the sidebar link and block the URL for the selected role instantly.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionsControl;
