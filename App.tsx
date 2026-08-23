
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import { PermissionKey } from './types';
import ErrorBoundary from './components/ErrorBoundary';
import { initializeTimeOffset } from './services/timeService';

import Dashboard from './pages/Dashboard';
import Catalog from './pages/Catalog';
import Offers from './pages/Offers';
import PromoCodes from './pages/PromoCodes';
import Groups from './pages/Groups';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Branches from './pages/Branches';
import Bookings from './pages/Bookings';
import Customers from './pages/Customers';
import StudentSearch from './pages/StudentSearch';
import Deactivated from './pages/Deactivated';
import Installments from './pages/Installments';
import Revenue from './pages/Revenue';
import CashFlow from './pages/CashFlow';
import Exports from './pages/Exports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import SalesStaff from './pages/SalesStaff';
import Complaints from './pages/Complaints';
import SystemGuide from './pages/SystemGuide';
import ActivityLog from './pages/ActivityLog';
import RescheduledLogs from './pages/RescheduledLogs';
import PermissionsControl from './pages/PermissionsControl';
import ProgramSubscriptions from './pages/ProgramSubscriptions';
import ConfirmBookingPortal from './pages/ConfirmBookingPortal';
import BookingForms from './pages/BookingForms';
import Landing from './pages/Landing';

const ProtectedRoute: React.FC<{ children: React.ReactNode, permission?: PermissionKey }> = ({ children, permission }) => {
  const { currentUser, userProfile, loading, gateStatus, hasPermission, isAuthReady } = useAuth();

  if (!isAuthReady || (currentUser && !userProfile && gateStatus === 'checking')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-2 h-2 bg-primary-600 rounded-full animate-ping"></div>
          </div>
        </div>
        <p className="mt-6 text-gray-600 dark:text-gray-400 font-bold tracking-widest text-xs uppercase animate-pulse">
          {gateStatus === 'checking' ? 'Verifying Access...' : 'Syncing SGCA...'}
        </p>
      </div>
    );
  }

  if (!currentUser || gateStatus === 'denied' || gateStatus === 'error') {
    return <Navigate to="/landing" replace />;
  }

  if (!userProfile) return <Navigate to="/landing" replace />;

  // Dynamic Permission Check
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};


const App: React.FC = () => {
  useEffect(() => {
    initializeTimeOffset();

    // Handle direct path access to public form without hash
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path === '/confirm-scholarship' || path === '/scholarship-form') {
        window.location.href = `${window.location.origin}${window.location.search}#/confirm-scholarship`;
      } else if (path === '/confirm-booking' || path === '/booking-form') {
        window.location.href = `${window.location.origin}${window.location.search}#/confirm-booking`;
      }
    }
  }, []);

  useEffect(() => {
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        const val = target.value;
        if (!val) return;
        
        // Convert any Arabic-Indic (٠-٩) or Persian (۰-۹) digits
        const converted = val
          .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
          .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
          
        if (val !== converted) {
          // Keep cursor position
          const selectionStart = target.selectionStart;
          const selectionEnd = target.selectionEnd;
          
          const nativeValueSetter = Object.getOwnPropertyDescriptor(
            target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
            'value'
          )?.set;

          if (nativeValueSetter) {
            nativeValueSetter.call(target, converted);
          } else {
            target.value = converted;
          }
          
          // Dispatch input event so React state is updated
          target.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Restore cursor position
          if (selectionStart !== null && selectionEnd !== null) {
            try {
              target.setSelectionRange(selectionStart, selectionEnd);
            } catch (err) {
              // Ignore errors for input types that don't support selection range (like number, email)
            }
          }
        }
      }
    };

    window.addEventListener('input', handleInput, true);
    return () => {
      window.removeEventListener('input', handleInput, true);
    };
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <Router>
            <Routes>
            <Route path="/landing" element={<Landing />} />
            <Route path="/welcome" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            {/* Public Standalone Confirmation Portal Route */}
            <Route path="/confirm-booking" element={<ConfirmBookingPortal />} />
            <Route path="/booking-form" element={<ConfirmBookingPortal />} />
            <Route path="/confirm-scholarship" element={<ConfirmBookingPortal formType="scholarship" />} />
            <Route path="/scholarship-form" element={<ConfirmBookingPortal formType="scholarship" />} />
            
            <Route path="/" element={<ProtectedRoute permission="viewDashboard"><Dashboard /></ProtectedRoute>} />
            <Route path="/catalog" element={<ProtectedRoute permission="viewCatalog"><Catalog /></ProtectedRoute>} />
            <Route path="/offers" element={<ProtectedRoute permission="viewOffers"><Offers /></ProtectedRoute>} />
            <Route path="/promo-codes" element={<ProtectedRoute permission="viewOffers"><PromoCodes /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute permission="viewGroups"><Groups /></ProtectedRoute>} />
            <Route path="/branches" element={<ProtectedRoute permission="viewBranches"><Branches /></ProtectedRoute>} />
            <Route path="/bookings" element={<ProtectedRoute permission="viewBookings"><Bookings /></ProtectedRoute>} />
            <Route path="/booking-forms" element={<ProtectedRoute permission="viewBookings"><BookingForms /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute permission="viewCustomers"><Customers /></ProtectedRoute>} />
            <Route path="/student-search" element={<ProtectedRoute permission="viewCustomers"><StudentSearch /></ProtectedRoute>} />
            <Route path="/deactivated" element={<ProtectedRoute permission="viewBookings"><Deactivated /></ProtectedRoute>} />
            <Route path="/installments" element={<ProtectedRoute permission="viewInstallments"><Installments /></ProtectedRoute>} />
            <Route path="/revenue" element={<ProtectedRoute permission="viewRevenue"><Revenue /></ProtectedRoute>} />
            <Route path="/cashflow" element={<ProtectedRoute permission="viewCashFlow"><CashFlow /></ProtectedRoute>} />
            <Route path="/exports" element={<ProtectedRoute permission="viewExports"><Exports /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute permission="viewUsers"><Users /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute permission="viewSettings"><Settings /></ProtectedRoute>} />
            <Route path="/sales-staff" element={<ProtectedRoute permission="viewSalesStaff"><SalesStaff /></ProtectedRoute>} />
            <Route path="/complaints" element={<ProtectedRoute permission="viewComplaints"><Complaints /></ProtectedRoute>} />
            <Route path="/program-subscriptions" element={<ProtectedRoute permission="viewProgramSubscriptions"><ProgramSubscriptions /></ProtectedRoute>} />
            <Route path="/activity-log" element={<ProtectedRoute permission="viewActivityLog"><ActivityLog /></ProtectedRoute>} />
            <Route path="/rescheduled-logs" element={<ProtectedRoute permission="viewReschedulingLogs"><RescheduledLogs /></ProtectedRoute>} />
            <Route path="/guide" element={<ProtectedRoute permission="viewGuide"><SystemGuide /></ProtectedRoute>} />
            
            {/* Control Panel strictly for Admin with dynamic check */}
            <Route path="/permissions" element={<ProtectedRoute permission="viewUsers"><PermissionsControl /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  </ErrorBoundary>
  );
};

export default App;
