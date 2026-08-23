
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, AllowedUser, Role, PermissionKey, PermissionsMap } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  gateStatus: 'idle' | 'checking' | 'allowed' | 'denied' | 'error';
  logout: () => Promise<void>;
  setAuthError: (error: string | null) => void;
  // Impersonation
  impersonatedRole: Role | null;
  setImpersonatedRole: (role: Role | null) => void;
  impersonatedUserId: string | null;
  setImpersonatedUserId: (userId: string | null) => void;
  effectiveRole: Role | undefined;
  effectiveProfile: UserProfile | null;
  isAuthReady: boolean;
  // Dynamic Permissions
  permissions: PermissionsMap | null;
  hasPermission: (key: PermissionKey) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default permissions fallback if firestore doc doesn't exist
const defaultPermissions: PermissionsMap = {
  viewDashboard: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewCatalog: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewOffers: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewBranches: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewGroups: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewBookings: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  createBookings: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  viewCustomers: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  manageCustomers: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewInstallments: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: true },
  viewRevenue: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewCashFlow: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewExports: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewUsers: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewSettings: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewSalesStaff: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  viewGuide: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewHistory: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  editBookings: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  editGroups: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  deleteRecords: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  issueRefunds: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  editInstallments: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  manageSystemTools: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  impersonation: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  addCompletionPayment: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  assignGroups: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  deactivateBookings: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  restoreBookings: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  printInvoices: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  manageUsers: { admin: true, supervisor: false, manager: false, training_team_leader: false, sales: false },
  manageSettings: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  manageSalesStaff: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: false },
  manageCatalog: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  manageOffers: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  manageBranches: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  viewAllBookings: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: false },
  viewActivityLog: { admin: true, supervisor: false, manager: false, training_team_leader: false, sales: false },
  viewReschedulingLogs: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  reverseActions: { admin: true, supervisor: false, manager: false, training_team_leader: false, sales: false },
  viewComplaints: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  manageComplaints: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
  viewProgramSubscriptions: { admin: true, supervisor: true, manager: true, training_team_leader: false, sales: true },
  manageBookingForms: { admin: true, supervisor: true, manager: true, training_team_leader: true, sales: true },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [gateStatus, setGateStatus] = useState<'idle' | 'checking' | 'allowed' | 'denied' | 'error'>('idle');
  const [impersonatedRole, setImpersonatedRole] = useState<Role | null>(null);
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null);

  useEffect(() => {
    if (impersonatedUserId) {
      const fetchImpersonatedProfile = async () => {
        const docSnap = await getDoc(doc(db, 'users', impersonatedUserId));
        if (docSnap.exists()) {
          setImpersonatedProfile(docSnap.data() as UserProfile);
        }
      };
      fetchImpersonatedProfile();
    } else {
      setImpersonatedProfile(null);
    }
  }, [impersonatedUserId]);

  useEffect(() => {
    // Listen to permissions settings document with error handling
    const unsubPerms = onSnapshot(
      doc(db, 'settings', 'permissions'), 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as PermissionsMap;
          // Merge with default permissions to ensure new keys are always present
          const merged: PermissionsMap = { ...defaultPermissions };
          (Object.keys(defaultPermissions) as PermissionKey[]).forEach(key => {
             if (data[key]) {
               merged[key] = { ...defaultPermissions[key], ...data[key] };
             }
          });
          setPermissions(merged);
        } else {
          setPermissions(defaultPermissions);
        }
      },
      (error) => {
        // Silently fail to default permissions if the user doesn't have access yet (e.g. logged out)
        if (error.code === 'permission-denied') {
          setPermissions(defaultPermissions);
        } else {
          console.error("Firestore permissions snapshot error:", error);
        }
      }
    );

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setGateStatus('checking');
        const emailLower = user.email?.toLowerCase() || '';
        const superAdminEmail = "saber.gd.fl@gmail.com";
        
        try {
          const allowedDoc = await getDoc(doc(db, 'allowed_users', emailLower));
          const isSuperAdmin = emailLower === superAdminEmail;
          
          let isAllowed = isSuperAdmin || (allowedDoc.exists() && allowedDoc.data()?.isActive);
          let allowedData = allowedDoc.exists() ? (allowedDoc.data() as AllowedUser) : null;

          // If not in allowed_users, check if they already have a profile in 'users' (for existing users)
          if (!isAllowed) {
            const usersQuery = query(collection(db, 'users'), where('email', '==', emailLower), limit(1));
            const usersSnap = await getDocs(usersQuery);
            if (!usersSnap.empty) {
              const existingUser = usersSnap.docs[0].data() as UserProfile;
              if (existingUser.isActive) {
                isAllowed = true;
                allowedData = {
                  email: existingUser.email,
                  name: existingUser.displayName,
                  role: existingUser.role,
                  isActive: existingUser.isActive
                };
              }
            }
          }

          if (!isAllowed) {
            setGateStatus('denied');
            setAuthError("Access denied: Not invited or account is inactive.");
            await signOut(auth);
          } else {
            const profileRef = doc(db, 'users', user.uid);
            const profileDoc = await getDoc(profileRef);
            
            const userData = {
              uid: user.uid,
              email: emailLower,
              displayName: allowedData?.name || user.displayName || 'Admin',
              role: allowedData?.role || (isSuperAdmin ? 'admin' : 'manager'),
              isActive: true,
              lastLoginAt: serverTimestamp(),
            };

            if (!profileDoc.exists()) {
              await setDoc(profileRef, { ...userData, createdAt: serverTimestamp() });
            } else {
              await setDoc(profileRef, userData, { merge: true });
            }

            setUserProfile((await getDoc(profileRef)).data() as UserProfile);
            setGateStatus('allowed');
            setCurrentUser(user);
          }
        } catch (error: any) {
          setGateStatus('error');
          setAuthError(`Verification Error: ${error.message}`);
          await signOut(auth);
        }
      } else {
        setGateStatus('idle');
        setCurrentUser(null);
        setUserProfile(null);
        setImpersonatedRole(null);
        setImpersonatedUserId(null);
      }
      setLoading(false);
    });

    return () => {
      unsubPerms();
      unsubAuth();
    };
  }, []);

  const logout = () => signOut(auth);

  const effectiveRole = (userProfile?.role === 'admin' && impersonatedRole) 
    ? impersonatedRole 
    : userProfile?.role;

  const effectiveProfile = (userProfile?.role === 'admin' && impersonatedProfile)
    ? impersonatedProfile
    : userProfile;

  const hasPermission = (key: PermissionKey): boolean => {
    // Admins ALWAYS have full permission unless they are explicitly impersonating another role
    if (userProfile?.role === 'admin' && !impersonatedRole) return true;
    
    if (!effectiveRole) return false;
    // If permissions haven't loaded yet, use defaults
    const currentPermissions = permissions || defaultPermissions;
    return currentPermissions[key]?.[effectiveRole] ?? false;
  };

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      userProfile, 
      loading, 
      authError, 
      gateStatus,
      logout, 
      setAuthError,
      impersonatedRole,
      setImpersonatedRole,
      impersonatedUserId,
      setImpersonatedUserId,
      effectiveRole,
      effectiveProfile,
      permissions,
      hasPermission,
      isAuthReady: !loading && permissions !== null
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
