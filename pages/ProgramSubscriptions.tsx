import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/errorHandling';

// Import our modular tab components
import { SubscriptionType, PaymentMethod, SubscriptionAccount, CustomerSubscription, ProgramSubscriptionExpense, ProgramSubscriptionRevenue, AuditLog, PreRegisteredAccount } from '../components/subscriptions/types';
import { DashboardTab } from '../components/subscriptions/DashboardTab';
import { TypesTab } from '../components/subscriptions/TypesTab';
import { MethodsTab } from '../components/subscriptions/MethodsTab';
import { AccountsTab } from '../components/subscriptions/AccountsTab';
import { CustomersTab } from '../components/subscriptions/CustomersTab';
import { CollectionsTab } from '../components/subscriptions/CollectionsTab';
import { ReportsTab } from '../components/subscriptions/ReportsTab';
import { AuditLogTab } from '../components/subscriptions/AuditLogTab';
import { TemplatesTab } from '../components/subscriptions/TemplatesTab';
import { AlertsTab } from '../components/subscriptions/AlertsTab';
import { PreRegisteredTab } from '../components/subscriptions/PreRegisteredTab';

export default function ProgramSubscriptions() {
  const { lang: themeLang, t } = useTheme();
  const lang = 'ar';
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Core subscription collections states
  const [types, setTypes] = useState<SubscriptionType[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<SubscriptionAccount[]>([]);
  const [customerSubs, setCustomerSubs] = useState<CustomerSubscription[]>([]);
  const [expenses, setExpenses] = useState<ProgramSubscriptionExpense[]>([]);
  const [revenues, setRevenues] = useState<ProgramSubscriptionRevenue[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [preRegisteredAccounts, setPreRegisteredAccounts] = useState<PreRegisteredAccount[]>([]);

  const [loading, setLoading] = useState(true);

  // Tab ordering states
  const [orderedTabIds, setOrderedTabIds] = useState<string[]>([
    'dashboard',
    'alerts',
    'types',
    'methods',
    'accounts',
    'preRegistered',
    'customers',
    'collections',
    'reports',
    'audit',
    'templates'
  ]);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [tempOrderedIds, setTempOrderedIds] = useState<string[]>([]);

  const canManage = hasPermission('manageSettings') || hasPermission('manageUsers');

  // Show a standard toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Set up real-time listener sync
  useEffect(() => {
    setLoading(true);

    const unsubTypes = onSnapshot(collection(db, 'subscriptionTypes'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionType));
      setTypes(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'subscriptionTypes');
    });

    const unsubMethods = onSnapshot(collection(db, 'paymentMethods'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod));
      setMethods(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'paymentMethods');
    });

    const unsubAccounts = onSnapshot(collection(db, 'subscriptionAccounts'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionAccount));
      setAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'subscriptionAccounts');
    });

    const unsubCustomerSubs = onSnapshot(collection(db, 'customerSubscriptions'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerSubscription));
      setCustomerSubs(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'customerSubscriptions');
    });

    const unsubExpenses = onSnapshot(collection(db, 'programSubscriptionExpenses'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProgramSubscriptionExpense));
      setExpenses(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'programSubscriptionExpenses');
    });

    const unsubRevenues = onSnapshot(collection(db, 'programSubscriptionRevenues'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProgramSubscriptionRevenue));
      setRevenues(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'programSubscriptionRevenues');
    });

    const unsubPreRegistered = onSnapshot(collection(db, 'preRegisteredAccounts'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PreRegisteredAccount));
      setPreRegisteredAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'preRegisteredAccounts');
    });

    // Audit logs sorted by timestamp desc
    const qAudit = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));
    const unsubAudit = onSnapshot(qAudit, (snap) => {
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as AuditLog))
        .filter(log => log.section === 'Program Subscriptions');
      setAuditLogs(list);
      setLoading(false);
    }, (err) => {
      // Non-admins might not have read access to auditLogs, handle gracefully
      console.warn("Audit logs access restricted or failed:", err);
      setLoading(false);
    });

    const unsubTabsOrder = onSnapshot(doc(db, 'subscriptionSettings', 'tabsOrder'), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().order)) {
        setOrderedTabIds(docSnap.data().order);
      }
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn("No permission to read subscriptionSettings tabsOrder, falling back to default tab order.");
      } else {
        handleFirestoreError(err, OperationType.GET, 'subscriptionSettings/tabsOrder');
      }
    });

    return () => {
      unsubTypes();
      unsubMethods();
      unsubAccounts();
      unsubCustomerSubs();
      unsubExpenses();
      unsubRevenues();
      unsubPreRegistered();
      unsubAudit();
      unsubTabsOrder();
    };
  }, []);

  // Shared refresh trigger for lists
  const triggerRefresh = () => {
    showToast(lang === 'ar' ? 'تم تحديث البيانات المزامنة بنجاح!' : 'Data synchronized successfully!');
  };

  const sortedTabsConfig = React.useMemo(() => {
    const baseTabs = [
      { id: 'dashboard', label: lang === 'ar' ? 'لوحة التحكم' : 'Dashboard', icon: 'fa-chart-line' },
      { id: 'alerts', label: lang === 'ar' ? 'قائمة التنبيهات' : 'Reminders & Alerts', icon: 'fa-bell' },
      { id: 'types', label: lang === 'ar' ? 'أنواع البرامج' : 'Subscription Types', icon: 'fa-cubes' },
      { id: 'methods', label: lang === 'ar' ? 'وسائل الدفع' : 'Payment Cards', icon: 'fa-credit-card' },
      { id: 'accounts', label: lang === 'ar' ? 'حسابات التراخيص' : 'Charged Accounts', icon: 'fa-envelope-open' },
      { id: 'preRegistered', label: lang === 'ar' ? 'مخزن الحسابات الجاهزة' : 'Ready Free Accounts', icon: 'fa-mail-bulk' },
      { id: 'customers', label: lang === 'ar' ? 'اشتراكات العملاء' : 'Customer Seats', icon: 'fa-user-check' },
      { id: 'collections', label: lang === 'ar' ? 'المتابعة والتحصيل' : 'Collections', icon: 'fa-wallet' },
      { id: 'reports', label: lang === 'ar' ? 'التقارير المالية' : 'Financial Reports', icon: 'fa-file-invoice-dollar' },
      { id: 'audit', label: lang === 'ar' ? 'سجل الأمان' : 'Security Audit', icon: 'fa-shield-halved' },
      { id: 'templates', label: lang === 'ar' ? 'قوالب واتساب' : 'WhatsApp Templates', icon: 'fa-comment-dots' },
    ];

    return [...baseTabs].sort((a, b) => {
      let indexA = orderedTabIds.indexOf(a.id);
      let indexB = orderedTabIds.indexOf(b.id);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  }, [orderedTabIds, lang]);

  const openReorderModal = () => {
    setTempOrderedIds([...orderedTabIds]);
    setReorderModalOpen(true);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newIds = [...tempOrderedIds];
    const temp = newIds[index];
    newIds[index] = newIds[index - 1];
    newIds[index - 1] = temp;
    setTempOrderedIds(newIds);
  };

  const moveDown = (index: number) => {
    if (index === tempOrderedIds.length - 1) return;
    const newIds = [...tempOrderedIds];
    const temp = newIds[index];
    newIds[index] = newIds[index + 1];
    newIds[index + 1] = temp;
    setTempOrderedIds(newIds);
  };

  const saveTabsOrder = async () => {
    try {
      await setDoc(doc(db, 'subscriptionSettings', 'tabsOrder'), {
        order: tempOrderedIds
      });
      setOrderedTabIds(tempOrderedIds);
      setReorderModalOpen(false);
      showToast('تم حفظ الترتيب الجديد للتبويبات بنجاح!');
    } catch (err) {
      console.error('Error saving tabs order:', err);
      showToast('فشل في حفظ ترتيب التبويبات.');
      handleFirestoreError(err, OperationType.WRITE, 'subscriptionSettings/tabsOrder');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      
      {/* Title Header Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <i className="fas fa-cubes text-primary-500"></i>
            {lang === 'ar' ? 'إدارة اشتراكات البرامج' : 'Software Subscription Management'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {lang === 'ar' 
              ? 'المركز الشامل لإدارة وتوزيع مقاعد تراخيص البرامج للعملاء ومتابعة الحسابات والتحصيلات بشكل مستقل.' 
              : 'The central hub for managing software license seat distribution, card payment methods, and financial reporting.'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openReorderModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            <i className="fas fa-sort-amount-down"></i>
            <span>ترتيب أقسام الصفحة (Admin)</span>
          </button>
        )}
      </div>

      {/* Tabs Menu Selection */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b dark:border-gray-700 scrollbar-none">
        {sortedTabsConfig.map((tab) => {
          // Hide templates tab from sales role
          if (tab.id === 'templates' && !canManage) return null;
          if (tab.id === 'audit' && !canManage) return null;

          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap shadow-sm border ${
                isActive 
                  ? 'bg-primary-600 text-white border-primary-500' 
                  : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-950 dark:hover:text-white border-gray-100 dark:border-gray-700'
              }`}
            >
              <i className={`fas ${tab.icon}`}></i>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Render active tab */}
      <div className="transition-opacity duration-300">
        {activeTab === 'dashboard' && (
          <DashboardTab
            customerSubs={customerSubs}
            accounts={accounts}
            types={types}
            expenses={expenses}
            revenues={revenues}
            onSetTab={setActiveTab}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsTab
            accounts={accounts}
            types={types}
            methods={methods}
            customerSubs={customerSubs}
            preRegisteredAccounts={preRegisteredAccounts}
            canManage={canManage}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'types' && (
          <TypesTab
            types={types}
            loading={loading}
            onRefresh={triggerRefresh}
            canManage={canManage}
          />
        )}

        {activeTab === 'methods' && (
          <MethodsTab
            methods={methods}
            loading={loading}
            onRefresh={triggerRefresh}
            canManage={canManage}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsTab
            accounts={accounts}
            types={types}
            methods={methods}
            customerSubs={customerSubs}
            preRegisteredAccounts={preRegisteredAccounts}
            loading={loading}
            onRefresh={triggerRefresh}
            canManage={canManage}
            onSetTab={setActiveTab}
          />
        )}

        {activeTab === 'preRegistered' && (
          <PreRegisteredTab
            preRegisteredAccounts={preRegisteredAccounts}
            types={types}
            loading={loading}
            onRefresh={triggerRefresh}
            canManage={canManage}
          />
        )}

        {activeTab === 'customers' && (
          <CustomersTab
            customerSubs={customerSubs}
            accounts={accounts}
            types={types}
            loading={loading}
            onRefresh={triggerRefresh}
            canManage={canManage}
          />
        )}

        {activeTab === 'collections' && (
          <CollectionsTab
            customerSubs={customerSubs}
            accounts={accounts}
            types={types}
            onRefresh={triggerRefresh}
            canManage={canManage}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            customerSubs={customerSubs}
            accounts={accounts}
            types={types}
            expenses={expenses}
            revenues={revenues}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogTab
            logs={auditLogs}
            loading={loading}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesTab
            canManage={canManage}
            onShowToast={showToast}
          />
        )}
      </div>

      {/* Tab Reordering Modal Dialog (Admin Only) */}
      {reorderModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
              <div>
                <h3 className="text-sm font-black text-gray-950 dark:text-white flex items-center gap-2">
                  <i className="fas fa-arrows-alt-v text-amber-500"></i>
                  <span>إعادة ترتيب أقسام وتبويبات الصفحة</span>
                </h3>
                <p className="text-[10px] text-gray-400 mt-1">
                  قم بتحريك الأقسام للأعلى أو الأسفل لتغيير موقع ظهورها الفعلي في الصفحة.
                </p>
              </div>
              <button
                onClick={() => setReorderModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="fas fa-times-circle text-lg"></i>
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
              {tempOrderedIds.map((tabId, idx) => {
                const tabConfigItem = sortedTabsConfig.find(t => t.id === tabId) || {
                  label: tabId,
                  icon: 'fa-cube'
                };

                return (
                  <div
                    key={tabId}
                    className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800/60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-gray-200/50 dark:bg-gray-800 text-[10px] font-mono font-black text-gray-500 flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-black text-gray-950 dark:text-white flex items-center gap-2">
                        <i className={`fas ${tabConfigItem.icon} text-gray-400 w-4`}></i>
                        {tabConfigItem.label}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      {/* Move Up */}
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition-colors border ${
                          idx === 0
                            ? 'text-gray-300 border-gray-100 dark:text-gray-700 dark:border-gray-800 cursor-not-allowed'
                            : 'text-gray-600 border-gray-200 hover:bg-gray-100 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer'
                        }`}
                        title="تحريك للأعلى"
                      >
                        <i className="fas fa-arrow-up"></i>
                      </button>

                      {/* Move Down */}
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === tempOrderedIds.length - 1}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition-colors border ${
                          idx === tempOrderedIds.length - 1
                            ? 'text-gray-300 border-gray-100 dark:text-gray-700 dark:border-gray-800 cursor-not-allowed'
                            : 'text-gray-600 border-gray-200 hover:bg-gray-100 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer'
                        }`}
                        title="تحريك للأسفل"
                      >
                        <i className="fas fa-arrow-down"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50/50 dark:bg-gray-900/10">
              <button
                onClick={() => setReorderModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-950 dark:hover:text-white font-black text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={saveTabsOrder}
                className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs shadow-sm transition-colors cursor-pointer flex items-center gap-2"
              >
                <i className="fas fa-save"></i>
                <span>حفظ الترتيب الجديد</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Success Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 rtl:right-auto rtl:left-6 z-50 bg-gray-900 text-white py-3 px-5 rounded-2xl shadow-xl flex items-center gap-3 border border-gray-800 animate-fade-in animate-pulse">
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px]">
            <i className="fas fa-check"></i>
          </div>
          <span className="font-bold text-xs">{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
