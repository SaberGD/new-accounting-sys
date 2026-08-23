
import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, restoreSystemFromBackup, wipeCollection } from '../services/firestore';
import { Booking, Group, Course, Diploma, SalesStaff, Customer, Payment, InstallmentPlan, Branch, Refund } from '../types';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const Exports: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [loading, setLoading] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Cache for lookup data
  const [catalog, setCatalog] = useState<any[]>([]);
  const [staff, setStaff] = useState<SalesStaff[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    const loadLookups = async () => {
      const [crs, dips, stf, grps, brs] = await Promise.all([
        genericGet<Course>('catalog_courses'),
        genericGet<Diploma>('catalog_diplomas'),
        genericGet<SalesStaff>('sales_staff'),
        genericGet<Group>('groups'),
        genericGet<Branch>('branches')
      ]);
      setCatalog([...crs, ...dips]);
      setStaff(stf);
      setGroups(grps);
      setBranches(brs);
    };
    loadLookups();
  }, []);

  const getProcessedData = async (collectionName: string) => {
    const rawData = await genericGet(collectionName);
    let processed: any[] = [];

    switch (collectionName) {
      case 'customers':
        processed = rawData.map((c: Customer) => ({
          'Full Name': c.name,
          'Country Code': c.countryCode || '+20',
          'WhatsApp Number': c.whatsapp,
          'Full Phone': c.fullWhatsapp || `${c.countryCode || '+20'}${c.whatsapp}`,
          'Alt Phone': c.phone || 'N/A',
          'Email': c.email || 'N/A'
        }));
        break;

      case 'bookings':
        const [allC] = await Promise.all([genericGet<Customer>('customers')]);
        processed = rawData.map((b: Booking) => {
          const cust = allC.find(c => c.id === b.customerId);
          const grp = groups.find(g => g.id === b.groupId);
          const prod = catalog.find(p => p.id === (b.productId || grp?.productId));
          return {
            'Full Name': cust?.name || 'N/A',
            'WhatsApp Full': cust?.fullWhatsapp || 'N/A',
            'Booking Date': b.bookingDate,
            'Product Name': prod?.name || 'N/A',
            'Group Code': grp?.groupCode || '-',
            'Base Price': b.pricing.basePriceSnapshot,
            'Final Price': b.pricing.finalPriceSnapshot,
            'Paid Amount': b.paymentSummary.paidTotal,
            'Remaining Amount': b.paymentSummary.remaining,
            'Status': b.status,
            'Sales Rep': b.salesName || 'N/A',
            'Booking ID': b.id
          };
        });
        break;

      case 'groups':
        const activeB = await genericGet<Booking>('bookings');
        const occMap: Record<string, number> = {};
        const defMap: Record<string, number> = {};
        activeB.forEach(b => {
          if (b.status === 'ACTIVE' && !b.isDeleted) {
            if (b.groupId) occMap[b.groupId] = (occMap[b.groupId] || 0) + 1;
            else if (b.productId) defMap[b.productId] = (defMap[b.productId] || 0) + 1;
          }
        });
        const sortedCatalog = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
        sortedCatalog.forEach(prod => {
          const pGroups = (rawData as Group[]).filter(g => g.productId === prod.id);
          if (pGroups.length > 0 || (defMap[prod.id] || 0) > 0) {
            processed.push({ 'Course / Diploma': `--- ${prod.name.toUpperCase()} ---`, 'Status': 'SUMMARY', 'DEFERRED (Waiting)': defMap[prod.id] || 0 });
            pGroups.forEach(g => {
              const br = branches.find(b => b.id === g.branchId);
              processed.push({
                'Group Code': g.groupCode || '-',
                'Course / Diploma': prod.name,
                'Status': g.status,
                'Location': g.isOnline ? 'ONLINE' : (br?.name || 'Office Branch'),
                'Start Date': g.startDate,
                'Schedule': g.scheduleLabel,
                'Enrolled': occMap[g.id] || 0,
                'WhatsApp Group': g.whatsappGroupLink || '',
                'Telegram Group': g.telegramGroupLink || '',
                'Recordings Channel': g.telegramChannelLink || ''
              });
            });
            processed.push({});
          }
        });
        break;

      case 'payments':
        const [bkL] = await Promise.all([genericGet<Booking>('bookings')]);
        processed = rawData.map((p: Payment) => {
          const bk = bkL.find(x => x.id === p.bookingId);
          const prod = catalog.find(x => x.id === (bk?.productId));
          return { 'Payment Date': p.paymentDate, 'Amount': p.amount, 'Method': t(p.method as any), 'Product': prod?.name || 'Unknown', 'Ref': p.transactionRef || 'N/A' };
        });
        break;

      case 'installment_plans':
        const [allBks, allCusts] = await Promise.all([
          genericGet<Booking>('bookings'),
          genericGet<Customer>('customers')
        ]);
        processed = rawData.flatMap((plan: InstallmentPlan) => {
          const bk = allBks.find(b => b.id === plan.bookingId);
          const cust = allCusts.find(c => c.id === bk?.customerId);
          const prod = catalog.find(p => p.id === (bk?.productId));
          
          return plan.installments.map((inst, idx) => ({
            'Customer Name': cust?.name || 'N/A',
            'WhatsApp': cust?.fullWhatsapp || 'N/A',
            'Product': prod?.name || 'N/A',
            'Booking ID': plan.bookingId,
            'Installment #': idx + 1,
            'Label': inst.label || `Installment ${idx + 1}`,
            'Due Date': inst.dueDate,
            'Original Due Date': inst.originalDueDate || '-',
            'Amount': inst.amount,
            'Status': inst.status,
            'WhatsApp Notified': inst.notifiedOnWhatsApp ? 'YES' : 'NO',
            'Delay Contacted': inst.delayContacted ? 'YES' : 'NO',
            'Delay Reason': inst.delayReason || '-'
          }));
        });
        break;

      case 'activity_logs':
        processed = rawData.map((log: any) => ({
          'Timestamp': log.timestamp,
          'User': log.userName,
          'Email': log.userEmail,
          'Action': log.action,
          'Section': log.section,
          'Target': log.targetName || '-',
          'Client': log.clientName || '-',
          'Details': log.details
        }));
        break;

      case 'booking_logs':
        processed = rawData.map((log: any) => ({
          'Timestamp': log.timestamp,
          'Booking ID': log.bookingId,
          'Action': log.action,
          'Performed By': log.performedBy,
          'Email': log.performedByEmail || '-',
          'Description': log.description
        }));
        break;

      case 'users':
        processed = rawData.map((u: any) => ({ 'Name': u.displayName, 'Email': u.email, 'Role': u.role, 'Status': u.isActive ? 'Active' : 'Inactive' }));
        break;
      
      default:
        processed = rawData;
    }
    return processed;
  };

  const exportToExcel = (data: any[], filename: string) => {
    if (data.length === 0) return null;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, filename);
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  };

  const handleExportExcel = async (collectionName: string) => {
    setLoading(collectionName);
    try {
      const processed = await getProcessedData(collectionName);
      const excelBuffer = exportToExcel(processed, collectionName);
      if (excelBuffer) {
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${collectionName}_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) { console.error(err); alert("Export failed"); }
    finally { setLoading(null); }
  };

  const handleFullBackup = async () => {
    setLoading('backup');
    const zip = new JSZip();
    const collections = [
        'allowed_users', 'catalog_courses', 'catalog_diplomas', 'offers', 
        'branches', 'groups', 'customers', 'bookings', 'payments', 
        'refunds', 'installment_plans', 'sales_staff', 'users',
        'activity_logs', 'booking_logs', 'settings'
    ];
    
    try {
      const rawSystemData: { [key: string]: any[] } = {};

      for (const coll of collections) {
        const q = query(collection(db, coll));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        rawSystemData[coll] = docs;

        const excelData = await getProcessedData(coll);
        const buffer = exportToExcel(excelData, coll);
        if (buffer) zip.file(`reports/${coll}_report.xlsx`, buffer);
      }

      zip.file('SYSTEM_RESTORE_DATA_DO_NOT_EDIT.json', JSON.stringify({
          version: "1.0",
          timestamp: new Date().toISOString(),
          data: rawSystemData
      }));

      const vcfString = (rawSystemData['customers'] || []).filter(c => !c.isDeleted).map(c => {
        const fullNum = c.fullWhatsapp || `${c.countryCode || '+20'}${c.whatsapp}`;
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;TYPE=CELL,VOICE:${fullNum}\nEND:VCARD`;
      }).join('\n');
      zip.file('contacts_backup.vcf', vcfString);

      const content = await zip.generateAsync({ type: 'blob' });
      const now = new Date();
      const ts = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}-${now.getMinutes().toString().padStart(2,'0')}`;
      
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SG_FULL_PACKUP_${ts}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Backup generation failed");
    } finally {
      setLoading(null);
    }
  };

  const handleImportClick = () => {
      if (!confirm("تحذير: استيراد نسخة احتياطية سيؤدي إلى استبدال كافة البيانات الحالية. هل أنت متأكد؟")) return;
      fileInputRef.current?.click();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setLoading('import');
      setImportStatus(["Opening backup package..."]);
      const zip = new JSZip();
      
      try {
          const contents = await zip.loadAsync(file);
          const restoreFile = contents.file('SYSTEM_RESTORE_DATA_DO_NOT_EDIT.json');
          
          if (!restoreFile) throw new Error("This ZIP file is not a valid SGCA backup. Missing restore data.");
          
          const jsonString = await restoreFile.async('string');
          const backupObj = JSON.parse(jsonString);
          const dataToRestore = backupObj.data;

          if (!dataToRestore) throw new Error("Invalid backup structure.");

          setImportStatus(prev => [...prev, "Backup verified. Clearing existing data..."]);
          
          const collectionsToWipe = Object.keys(dataToRestore);
          for (const coll of collectionsToWipe) {
              await wipeCollection(coll, (msg) => {
                  setImportStatus(prev => [...prev.slice(0, -1), msg]);
              });
          }

          setImportStatus(prev => [...prev, "Existing data cleared. Restoring from backup..."]);

          await restoreSystemFromBackup(dataToRestore, (msg) => {
              setImportStatus(prev => [...prev, msg]);
          });

          setImportStatus(prev => [...prev, "✓ System Restored Successfully! Reloading..."]);
          setTimeout(() => window.location.reload(), 2000);

      } catch (err: any) {
          console.error(err);
          setImportStatus(prev => [...prev, `❌ ERROR: ${err.message}`]);
          alert("Import Failed: " + err.message);
      } finally {
          setLoading(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
      }
  };

  const handleExportVcf = async () => {
    setLoading('vcf');
    try {
      const customers = await genericGet<Customer>('customers');
      const vcardString = customers.filter(c => !c.isDeleted).map(c => {
        const fullNum = c.fullWhatsapp || `${c.countryCode || '+20'}${c.whatsapp}`;
        let vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;TYPE=CELL,VOICE:${fullNum}`;
        if (c.phone && c.phone !== c.whatsapp) vcard += `\nTEL;TYPE=HOME,VOICE:${c.phone}`;
        if (c.email) vcard += `\nEMAIL:${c.email}`;
        vcard += `\nEND:VCARD`;
        return vcard;
      }).join('\n');

      const blob = new Blob([vcardString], { type: 'text/vcard' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SG_Contacts_${new Date().toISOString().split('T')[0]}.vcf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) { console.error(err); alert("VCF Export failed"); }
    finally { setLoading(null); }
  };

  const getCrmExportRows = async () => {
    const [allBookings, allCustomers] = await Promise.all([
      genericGet<Booking>('bookings'),
      genericGet<Customer>('customers')
    ]);

    return allBookings
      .filter(b => b.status === 'ACTIVE' && !b.isDeleted)
      .map(b => {
        const cust = allCustomers.find(c => c.id === b.customerId);
        const grp = groups.find(g => g.id === b.groupId);
        const prod = catalog.find(p => p.id === (b.productId || grp?.productId));
        const isInt = !!b.isInternational;
        const intD = b.internationalDetails;

        const phoneVal = cust?.fullWhatsapp || (cust ? `${cust.countryCode || '+20'}${cust.whatsapp}` : '') || cust?.phone || '';

        return {
          name: cust?.name || 'غير معروف',
          phone: phoneVal,
          salesAgentName: b.salesName || 'غير محدد',
          gender: '',
          source: 'OTHER',
          profileLink: '',
          status: 'BOOKED',
          bookedCourseName: prod?.name || grp?.productName || 'غير محدد',
          totalPrice: b.pricing?.finalPriceSnapshot ?? 0,
          paidAmount: b.paymentSummary?.paidTotal ?? 0,
          bookingDate: b.bookingDate || '',
          isExternalTransfer: isInt ? 'true' : 'false',
          originalCurrency: isInt && intD?.currency ? intD.currency : '',
          originalTotalPrice: isInt && intD?.finalPrice ? intD.finalPrice : '',
          originalPaidAmount: isInt && intD?.paidAmount ? intD.paidAmount : '',
          exchangeRateUsed: isInt && intD?.exchangeRate ? intD.exchangeRate : ''
        };
      });
  };

  const handleCrmExportCsv = async () => {
    setLoading('crm_csv');
    try {
      const rows = await getCrmExportRows();
      const headers = [
        'name', 'phone', 'salesAgentName', 'gender', 'source', 'profileLink',
        'status', 'bookedCourseName', 'totalPrice', 'paidAmount', 'bookingDate',
        'isExternalTransfer', 'originalCurrency', 'originalTotalPrice',
        'originalPaidAmount', 'exchangeRateUsed'
      ];

      let csvContent = '\uFEFF' + headers.join(',') + '\n';
      rows.forEach(row => {
        const line = headers.map(h => {
          let val = String((row as any)[h] ?? '');
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',');
        csvContent += line + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CRM_Bulk_Bookings_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("CRM Export CSV failed");
    } finally {
      setLoading(null);
    }
  };

  const handleCrmExportExcel = async () => {
    setLoading('crm_excel');
    try {
      const rows = await getCrmExportRows();
      const excelBuffer = exportToExcel(rows, 'CRM_Bookings_Export');
      if (excelBuffer) {
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `CRM_Bulk_Bookings_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error(err);
      alert("CRM Export Excel failed");
    } finally {
      setLoading(null);
    }
  };

  const exportTypes = [
    { label: 'Customers', collection: 'customers', icon: 'fa-address-book', color: 'bg-blue-500' },
    { label: 'Bookings', collection: 'bookings', icon: 'fa-calendar-check', color: 'bg-indigo-500' },
    { label: 'Payments', collection: 'payments', icon: 'fa-money-bill-wave', color: 'bg-green-500' },
    { label: 'Installment Plans', collection: 'installment_plans', icon: 'fa-file-invoice-dollar', color: 'bg-amber-500' },
    { label: 'Activity Logs', collection: 'activity_logs', icon: 'fa-list-check', color: 'bg-rose-500' },
    { label: 'Booking History', collection: 'booking_logs', icon: 'fa-clock-rotate-left', color: 'bg-teal-500' },
    { label: 'Groups Report', collection: 'groups', icon: 'fa-users-rectangle', color: 'bg-purple-500' },
    { label: 'System Users', collection: 'users', icon: 'fa-user-shield', color: 'bg-gray-600' }
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Data Management & Packups</h1>
          <p className="text-gray-500">Secure your academy's entire infrastructure.</p>
        </div>
        <div className="flex gap-3">
            {hasPermission('manageSystemTools') && (
                <>
                    <input type="file" id="backup-file" ref={fileInputRef} className="hidden" accept=".zip" onChange={handleFileImport} />
                    <button 
                        disabled={!!loading}
                        onClick={handleImportClick}
                        className="px-6 py-3.5 bg-amber-600 text-white rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
                    >
                        {loading === 'import' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-arrow-up"></i>}
                        Import Backup
                    </button>
                </>
            )}
            <button 
              disabled={!!loading}
              onClick={handleFullBackup}
              className="px-8 py-3.5 bg-gray-900 dark:bg-primary-600 text-white rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3 border border-white/10"
            >
              {loading === 'backup' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-box-archive"></i>}
              Full Packup (.ZIP)
            </button>
        </div>
      </div>

      {loading === 'import' && (
          <div className="mb-10 bg-gray-900 text-green-400 p-6 rounded-[2rem] font-mono text-xs shadow-2xl animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                  <i className="fas fa-terminal"></i>
                  <span className="font-black uppercase tracking-widest">Restoration in Progress</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {importStatus.map((s, i) => <div key={i}>{"> "} {s}</div>)}
              </div>
          </div>
      )}

      {/* CRM Bulk Export Card */}
      <div className="mb-8 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[11px] font-bold uppercase tracking-wider mb-3">
              <i className="fas fa-rocket"></i>
              <span>New CRM Integration</span>
            </div>
            <h2 className="text-2xl font-black mb-2">تصدير الحجوزات لنظام CRM الجديد (Bulk Export)</h2>
            <p className="text-xs text-emerald-100 leading-relaxed font-medium">
              تصدير كافة الحجوزات النشطة بملف متوافق 100% مع الهيدرز و الشروط المطلوبة للنظام الجديد (16 عمود تشمل البيانات المالية، التوليفات الخارجية، وتفاصيل المبيعات) بترميز UTF-8 لدعم العربية بدون رموز غريبة.
            </p>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
            <button 
              disabled={!!loading}
              onClick={handleCrmExportCsv}
              className="px-6 py-3.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-2xl font-black text-xs shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {loading === 'crm_csv' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-csv text-emerald-600 text-base"></i>}
              <span>تصدير ملف CSV (UTF-8)</span>
            </button>
            <button 
              disabled={!!loading}
              onClick={handleCrmExportExcel}
              className="px-6 py-3.5 bg-emerald-950/40 text-white hover:bg-emerald-950/60 border border-white/20 rounded-2xl font-black text-xs shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {loading === 'crm_excel' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel text-emerald-300 text-base"></i>}
              <span>تصدير ملف Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exportTypes.map(type => (
          <div key={type.collection} className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center group">
            <div className={`w-16 h-16 ${type.color} text-white rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-lg shadow-current/20 group-hover:scale-110 transition-transform`}>
              <i className={`fas ${type.icon}`}></i>
            </div>
            <h3 className="font-bold text-lg mb-2">{type.label}</h3>
            <p className="text-xs text-gray-400 mb-8 uppercase tracking-widest">Collection: {type.collection}</p>
            
            <div className="w-full space-y-2">
              <button 
                disabled={!!loading}
                onClick={() => handleExportExcel(type.collection)}
                className="w-full py-3 bg-gray-50 dark:bg-gray-700 hover:bg-green-600 hover:text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {loading === type.collection ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-file-excel mr-2"></i>}
                {t('exportExcel')}
              </button>

              {type.collection === 'customers' && (
                <button 
                  disabled={!!loading}
                  onClick={handleExportVcf}
                  className="w-full py-3 bg-gray-50 dark:bg-gray-700 hover:bg-blue-600 hover:text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {loading === 'vcf' ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-id-card mr-2"></i>}
                  {t('exportVcf')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-amber-50 dark:bg-amber-900/10 p-6 rounded-[2rem] border border-amber-100 dark:border-amber-900/30">
        <div className="flex gap-4">
          <div className="w-12 h-12 shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-600 rounded-2xl flex items-center justify-center text-xl">
            <i className="fas fa-circle-info"></i>
          </div>
          <div>
            <h4 className="font-black text-sm mb-1 uppercase tracking-wide">Backup & Restore Guide</h4>
            <p className="text-xs text-gray-500 leading-relaxed font-medium">
                When you perform a <strong>Full Packup</strong>, the system generates a ZIP file containing Excel reports for analysis AND a special <code>SYSTEM_RESTORE_DATA_DO_NOT_EDIT.json</code> file. To restore the system, simply upload the SAME ZIP file using the <strong>Import Backup</strong> button. The system will automatically handle unzipping and data mapping.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Exports;
