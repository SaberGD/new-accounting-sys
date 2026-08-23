
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericAdd, genericUpdate, genericDelete, assignGroupToBooking } from '../services/firestore';
import { Group, Course, Diploma, Branch, Booking, Customer } from '../types';
import DeleteModal from '../components/DeleteModal';
import * as XLSX from 'xlsx';

const DAYS_OF_WEEK = [
  { id: 'SAT', label: 'Saturday' },
  { id: 'SUN', label: 'Sunday' },
  { id: 'MON', label: 'Monday' },
  { id: 'TUE', label: 'Tuesday' },
  { id: 'WED', label: 'Wednesday' },
  { id: 'THU', label: 'Thursday' },
  { id: 'FRI', label: 'Friday' },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const mins = i % 2 === 0 ? '00' : '30';
  return `${hours.toString().padStart(2, '0')}:${mins}`;
});

const formatTime12h = (time: string) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const Groups: React.FC = () => {
  const { t, lang } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [groups, setGroups] = useState<Group[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [products, setProducts] = useState<{ id: string, name: string, type: 'course' | 'diploma' }[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'STARTED' | 'FINISHED'>('UPCOMING');
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'MONTH' | 'TYPE_COURSE' | 'STUDENT_COUNT'>('DEFAULT');
  const [exportStatus, setExportStatus] = useState<'UPCOMING' | 'STARTED' | 'FINISHED' | 'ALL'>('UPCOMING');
  const [showSummary, setShowSummary] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedTraineesGroup, setSelectedTraineesGroup] = useState<Group | null>(null);
  const [reassignBooking, setReassignBooking] = useState<{ booking: Booking; customerName: string } | null>(null);
  const [targetGroupId, setTargetGroupId] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  // Export for Training System States
  const [selectedExportGroup, setSelectedExportGroup] = useState<Group | null>(null);
  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [exportTotalSessions, setExportTotalSessions] = useState(22);
  const [exportSessionDuration, setExportSessionDuration] = useState(120);
  const [exportTelegramLink, setExportTelegramLink] = useState('');
  const [exportWhatsappLink, setExportWhatsappLink] = useState('');
  const [exportRecordingsUrl, setExportRecordingsUrl] = useState('');
  const [exportEvaluationSessions, setExportEvaluationSessions] = useState('1, 4, 7, 10, 13, 16, 19, 22');
  const [exportNotes, setExportNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<Group, 'id' | 'scheduleLabel'>>({
    groupCode: '', // New field
    productId: '',
    productType: 'course',
    startDate: '',
    daysOfWeek: [],
    timeStart: '18:00',
    timeEnd: '21:00',
    capacity: 20,
    trainer: '',
    supervisor: '',
    status: 'UPCOMING',
    isOnline: false,
    availableForBooking: true,
    branchId: '',
    whatsappGroupLink: '',
    telegramGroupLink: '',
    telegramChannelLink: ''
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const formatMonthArabic = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    
    let part = '';
    if (day <= 10) part = 'أول';
    else if (day >= 11 && day <= 20) part = 'منتصف';
    else part = 'نهاية';
    
    return `${part} شهر ${month}`;
  };

  const getDayArabic = (dayId: string) => {
    const map: Record<string, string> = {
      'SAT': 'السبت', 'SUN': 'الأحد', 'MON': 'الإثنين', 'TUE': 'الثلاثاء', 'WED': 'الأربعاء', 'THU': 'الخميس', 'FRI': 'الجمعة'
    };
    return map[dayId] || dayId;
  };

  const availableSlotsSummary = useMemo(() => {
    // Only groups that are UPCOMING and availableForBooking=true
    const activeGroups = groups.filter(g => g.status === 'UPCOMING' && g.availableForBooking);
    
    const byProduct: Record<string, Group[]> = {};
    activeGroups.forEach(g => {
      if (!byProduct[g.productId]) byProduct[g.productId] = [];
      byProduct[g.productId].push(g);
    });

    let summaryText = "";
    Object.entries(byProduct).forEach(([prodId, prodGroups]) => {
      const productName = products.find(p => p.id === prodId)?.name || 'Product';
      summaryText += `مواعيد حجز ${productName} المتاحه ✨\n`;

      const online = prodGroups.filter(g => g.isOnline);
      const offline = prodGroups.filter(g => !g.isOnline);

      if (offline.length > 0) {
        summaryText += `📍 أوف لاين (بالمقر)\n`;
        const bySchedule: Record<string, Group[]> = {};
        offline.forEach(g => {
          const scheduleKey = g.daysOfWeek.map(d => getDayArabic(d)).join(' & ');
          if (!bySchedule[scheduleKey]) bySchedule[scheduleKey] = [];
          bySchedule[scheduleKey].push(g);
        });

        Object.entries(bySchedule).forEach(([days, scheduledGroups]) => {
          summaryText += `🗓 ${days}\n`;
          scheduledGroups.forEach(g => {
            summaryText += `من ${formatTime12h(g.timeStart).replace(' AM', ' ص').replace(' PM', ' م')} إلى ${formatTime12h(g.timeEnd).replace(' AM', ' ص').replace(' PM', ' م')} | يبدأ ${formatMonthArabic(g.startDate)}\n`;
          });
        });
      }

      if (online.length > 0) {
        summaryText += `📍 أون لاين\n`;
        const bySchedule: Record<string, Group[]> = {};
        online.forEach(g => {
          const scheduleKey = g.daysOfWeek.map(d => getDayArabic(d)).join(' & ');
          if (!bySchedule[scheduleKey]) bySchedule[scheduleKey] = [];
          bySchedule[scheduleKey].push(g);
        });

        Object.entries(bySchedule).forEach(([days, scheduledGroups]) => {
          summaryText += `🗓 ${days}\n`;
          scheduledGroups.forEach(g => {
            summaryText += `من ${formatTime12h(g.timeStart).replace(' AM', ' ص').replace(' PM', ' م')} إلى ${formatTime12h(g.timeEnd).replace(' AM', ' ص').replace(' PM', ' م')} | يبدأ ${formatMonthArabic(g.startDate)}\n`;
          });
        });
      }
      summaryText += `\n`;
    });

    return summaryText.trim();
  }, [groups, products]);

  const scheduleLabel = useMemo(() => {
    const days = formData.daysOfWeek
      .map(d => DAYS_OF_WEEK.find(dw => dw.id === d)?.label.substring(0, 3))
      .join(' & ');
    return `${days} — ${formatTime12h(formData.timeStart)} to ${formatTime12h(formData.timeEnd)}`;
  }, [formData.daysOfWeek, formData.timeStart, formData.timeEnd]);

  const occupancyMap = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach(b => {
      if (b.status === 'ACTIVE' && b.groupId && !b.isDeleted) {
        map[b.groupId] = (map[b.groupId] || 0) + 1;
      }
    });
    return map;
  }, [bookings]);

  const deferredCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach(b => {
      if (b.status === 'ACTIVE' && !b.groupId && b.productId && !b.isDeleted) {
        map[b.productId] = (map[b.productId] || 0) + 1;
      }
    });
    return map;
  }, [bookings]);

  const fetchData = async () => {
    setLoading(true);
    const [grps, bks, crs, dips, brs, custs] = await Promise.all([
      genericGet<Group>('groups'),
      genericGet<Booking>('bookings'),
      genericGet<Course>('catalog_courses'),
      genericGet<Diploma>('catalog_diplomas'),
      genericGet<Branch>('branches'),
      genericGet<Customer>('customers')
    ]);
    
    const combined = [
      ...crs.map(c => ({ id: c.id, name: c.name, type: 'course' as const })),
      ...dips.map(d => ({ id: d.id, name: d.name, type: 'diploma' as const }))
    ];
    setProducts(combined);
    setBranches(brs);
    setBookings(bks);
    setCustomers(custs);

    const filtered = grps.filter(g => g.status === activeTab).map(g => ({
        ...g,
        productName: combined.find(p => p.id === g.productId)?.name || 'Unknown Product'
    }));
    setGroups(filtered);
    setLoading(false);
  };

  const sortedGroups = useMemo(() => {
    let list = [...groups];

    if (sortBy === 'STUDENT_COUNT') {
      return list.sort((a, b) => (occupancyMap[b.id] || 0) - (occupancyMap[a.id] || 0));
    }

    if (sortBy === 'TYPE_COURSE') {
      return list.sort((a, b) => {
        // Then by product name
        const nameA = a.productName?.toLowerCase() || '';
        const nameB = b.productName?.toLowerCase() || '';
        
        // Check for Beginner/Advanced keywords if they exist
        const isBegA = nameA.includes('مبتدئ') || nameA.includes('beginner');
        const isBegB = nameB.includes('مبتدئ') || nameB.includes('beginner');
        const isAdvA = nameA.includes('متقدم') || nameA.includes('advanced');
        const isAdvB = nameB.includes('متقدم') || nameB.includes('advanced');

        // Level first (Beginner then Advanced)
        if (isBegA && !isBegB) return -1;
        if (!isBegA && isBegB) return 1;
        if (isAdvA && !isAdvB) return -1;
        if (!isAdvA && isAdvB) return 1;

        // Then Online vs Offline (Online first)
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;

        return nameA.localeCompare(nameB);
      });
    }

    if (sortBy === 'MONTH') {
      return list.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }

    return list;
  }, [groups, sortBy, occupancyMap]);

  const groupedByMonth = useMemo<Record<string, Group[]> | null>(() => {
    if (sortBy !== 'MONTH') return null;
    
    const groupsByMonth: Record<string, Group[]> = {};
    sortedGroups.forEach(g => {
      if (!g.startDate) return;
      const date = new Date(g.startDate);
      const monthYear = date.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });
      if (!groupsByMonth[monthYear]) groupsByMonth[monthYear] = [];
      groupsByMonth[monthYear].push(g);
    });
    return groupsByMonth;
  }, [sortedGroups, sortBy, lang]);

  const traineesForGroup = useMemo(() => {
    if (!selectedTraineesGroup) return [];
    return bookings
      .filter(b => b.groupId === selectedTraineesGroup.id && b.status === 'ACTIVE' && !b.isDeleted)
      .map(b => {
        const cust = customers.find(c => c.id === b.customerId);
        return {
          booking: b,
          customer: cust
        };
      });
  }, [bookings, customers, selectedTraineesGroup]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleExportReport = async () => {
    const allGroups = await genericGet<Group>('groups');
    const statusOrder = { 'UPCOMING': 0, 'STARTED': 1, 'FINISHED': 2 };
    
    // Filter by selected status
    let filteredGroups = allGroups;
    if (exportStatus !== 'ALL') {
      filteredGroups = allGroups.filter(g => g.status === exportStatus);
    }

    const reportRows: any[] = [];
    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

    sortedProducts.forEach(prod => {
      const prodGroups = filteredGroups.filter(g => g.productId === prod.id);
      const deferredCount = bookings.filter(b => b.productId === prod.id && b.bookingType === 'deferred' && b.status === 'ACTIVE').length;
      
      if (prodGroups.length === 0 && deferredCount === 0) return;

      // Add Product Header
      reportRows.push({
        'Course / Diploma': `>>> ${prod.name.toUpperCase()} <<<`,
        'Status': 'PRODUCT SUMMARY',
        'Location': 'N/A',
        'Start Date': 'N/A',
        'Schedule': 'N/A',
        'Occupancy': 'N/A',
        'Capacity': 'N/A',
        'Trainer': 'N/A',
        'Deferred Students': deferredCount,
      });

      // Divide into Online and Branch
      const onlineGroups = prodGroups.filter(g => g.isOnline).sort((a, b) => a.startDate.localeCompare(b.startDate));
      const branchGroups = prodGroups.filter(g => !g.isOnline).sort((a, b) => {
        const brA = branches.find(br => br.id === a.branchId)?.name || '';
        const brB = branches.find(br => br.id === b.branchId)?.name || '';
        if (brA !== brB) return brA.localeCompare(brB);
        return a.startDate.localeCompare(b.startDate);
      });

      if (onlineGroups.length > 0) {
        reportRows.push({ 'Course / Diploma': '--- ONLINE GROUPS ---' });
        onlineGroups.forEach(g => {
          const enrolled = occupancyMap[g.id] || 0;
          reportRows.push({
            'Group Code': g.groupCode || '-',
            'Course / Diploma': prod.name,
            'Status': g.status,
            'Location': 'ONLINE',
            'Start Date': g.startDate,
            'Schedule': g.scheduleLabel,
            'Occupancy': enrolled,
            'Capacity': g.capacity,
            'Trainer': g.trainer || 'TBD',
          });
        });
      }

      if (branchGroups.length > 0) {
        reportRows.push({ 'Course / Diploma': '--- BRANCH GROUPS ---' });
        branchGroups.forEach(g => {
          const br = branches.find(b => b.id === g.branchId);
          const enrolled = occupancyMap[g.id] || 0;
          reportRows.push({
            'Group Code': g.groupCode || '-',
            'Course / Diploma': prod.name,
            'Status': g.status,
            'Location': br?.name || 'Offline Branch',
            'Start Date': g.startDate,
            'Schedule': g.scheduleLabel,
            'Occupancy': enrolled,
            'Capacity': g.capacity,
            'Trainer': g.trainer || 'TBD',
          });
        });
      }

      reportRows.push({}); // Empty row for spacing
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Groups Report");
    XLSX.writeFile(workbook, `Groups_Report_${exportStatus}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.daysOfWeek.length === 0) return alert("Select at least one day.");
    if (formData.timeStart >= formData.timeEnd) return alert("End time must be after start time.");
    const payload = { ...formData, scheduleLabel };
    const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined;
    if (editingId) await genericUpdate('groups', editingId, payload, performedBy);
    else await genericAdd('groups', payload, performedBy);
    setModalOpen(false); fetchData();
  };

  const toggleDay = (dayId: string) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(dayId) ? prev.daysOfWeek.filter(d => d !== dayId) : [...prev.daysOfWeek, dayId]
    }));
  };

  const getSessionDurationInput = (start: string, end: string): number => {
    if (!start || !end) return 120;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const diff = endMins - startMins;
    return diff > 0 ? diff : 120;
  };

  const normalizePhoneNumber = (num: string): string => {
    if (!num) return "";
    let cleaned = num.trim().replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+20')) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('201') && cleaned.length === 12) {
      cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
  };

  const handleOpenTrainingExport = (group: Group) => {
    setSelectedExportGroup(group);
    const dur = getSessionDurationInput(group.timeStart, group.timeEnd);
    setExportSessionDuration(dur);
    setExportTotalSessions(22);
    setExportTelegramLink(group.telegramGroupLink || '');
    setExportWhatsappLink(group.whatsappGroupLink || '');
    setExportRecordingsUrl(group.telegramChannelLink || '');
    setExportEvaluationSessions('1, 4, 7, 10, 13, 16, 19, 22');
    setExportNotes('');
    setExportModalOpen(true);
  };

  const activeBookingsForGroup = useMemo(() => {
    if (!selectedExportGroup) return [];
    return bookings.filter(b => b.groupId === selectedExportGroup.id && b.status === 'ACTIVE' && !b.isDeleted);
  }, [bookings, selectedExportGroup]);

  const studentsToExport = useMemo(() => {
    return activeBookingsForGroup.map(b => {
      const cust = customers.find(c => c.id === b.customerId);
      const rawPhone = cust?.phone || "";
      const normalizedPhone = normalizePhoneNumber(rawPhone);
      const rawWhatsapp = cust?.whatsapp || cust?.fullWhatsapp || rawPhone;
      const normalizedWhatsapp = normalizePhoneNumber(rawWhatsapp) || normalizedPhone;
      
      let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending';
      const paid = b.paymentSummary?.paidTotal || 0;
      const rem = b.paymentSummary?.remaining || 0;
      const totalPrice = b.pricing?.finalPrice || (paid + rem);
      const paidPercentage = totalPrice > 0 ? Number(((paid / totalPrice) * 100).toFixed(1)) : 0;
      const is50PercentPaid = paidPercentage >= 50;
      const hasCompleted50Percent = is50PercentPaid ? "YES" : "NO";
      const activationStatus = is50PercentPaid ? "ELIGIBLE_ACTIVE" : "PENDING_50_PERCENT_MOCK";

      if (rem === 0) {
        paymentStatus = 'paid';
      } else if (paid > 0) {
        paymentStatus = 'partial';
      } else {
        paymentStatus = 'pending';
      }

      return {
        sourceBookingId: b.id,
        sourceCustomerId: cust?.id || b.customerId,
        fullName: cust?.name || "Unknown Student",
        phone: normalizedPhone,
        whatsapp: normalizedWhatsapp,
        email: cust?.email || "",
        githubProfile: "",
        linkedinProfile: "",
        paymentStatus: paymentStatus,
        paidTotal: paid,
        totalPrice: totalPrice,
        paidPercentage: paidPercentage,
        is50PercentPaid: is50PercentPaid,
        hasCompleted50Percent: hasCompleted50Percent,
        activationStatus: activationStatus,
        bookingDate: b.bookingDate || "",
        salesName: b.salesName || "",
        notes: ""
      };
    });
  }, [activeBookingsForGroup, customers]);

  const exportWarnings = useMemo(() => {
    const list: string[] = [];
    if (!selectedExportGroup) return list;

    if (!exportWhatsappLink) {
      list.push(lang === 'ar' ? 'رابط جروب الواتساب غير محدد' : 'WhatsApp Group Link is missing');
    }
    if (!exportTelegramLink) {
      list.push(lang === 'ar' ? 'رابط جروب التليجرام غير محدد' : 'Telegram Group Link is missing');
    }
    if (!exportRecordingsUrl) {
      list.push(lang === 'ar' ? 'رابط تليجرام تسجيلات المحاضرات غير محدد' : 'Recordings Channel Link is missing');
    }
    if (!selectedExportGroup.trainer || selectedExportGroup.trainer.toUpperCase() === 'TBD') {
      list.push(lang === 'ar' ? 'اسم المدرب غير محدد (TBD)' : 'Trainer is TBD / not assigned');
    }
    
    const studentWithNoEmail = studentsToExport.some(s => !s.email);
    if (studentWithNoEmail) {
      list.push(lang === 'ar' ? 'بعض الطلاب لا يملكون بريداً إلكترونياً (سيتم تصديره كقيمة فارغة)' : 'Some students are missing an email address (will be exported as empty string)');
    }

    return list;
  }, [selectedExportGroup, exportWhatsappLink, exportTelegramLink, exportRecordingsUrl, studentsToExport, lang]);

  const handleDownloadJSON = () => {
    if (!selectedExportGroup) return;

    const evalSessions = exportEvaluationSessions
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    const courseName = selectedExportGroup.productName || 'Unknown Course';
    const courseLevel = `${courseName} Level`;
    const courseType = selectedExportGroup.isOnline ? "online" : "offline";
    const branchName = selectedExportGroup.isOnline ? "Online" : (branches.find(b => b.id === selectedExportGroup.branchId)?.name || 'Offline Branch');
    
    const trainerVal = (selectedExportGroup.trainer && selectedExportGroup.trainer.toUpperCase() !== 'TBD') ? selectedExportGroup.trainer : null;

    const exportData = {
      exportVersion: "1.0",
      sourceSystem: "accounting-bookings-system",
      exportedAt: new Date().toISOString(),
      group: {
        sourceGroupId: selectedExportGroup.id,
        courseName: courseName,
        courseLevel: courseLevel,
        courseType: courseType,
        branchName: branchName,
        trainerName: trainerVal,
        supervisorName: selectedExportGroup.supervisor || null,
        status: selectedExportGroup.status.toLowerCase(),
        startDate: selectedExportGroup.startDate,
        daysOfWeek: selectedExportGroup.daysOfWeek,
        sessionTime: selectedExportGroup.timeStart,
        sessionDurationMinutes: exportSessionDuration,
        totalSessions: exportTotalSessions,
        capacity: selectedExportGroup.capacity,
        bookedCount: studentsToExport.length,
        telegramLink: exportTelegramLink,
        whatsappLink: exportWhatsappLink,
        recordingsBaseUrl: exportRecordingsUrl,
        evaluationSessions: evalSessions,
        notes: exportNotes
      },
      students: studentsToExport,
      trainingSystemMissingFields: {
        batchCode: "AUTO_GENERATED_BY_TRAINING_SYSTEM",
        assignedTrainerIds: [],
        groupSupervisorId: null,
        telegramLink: exportTelegramLink,
        whatsappLink: exportWhatsappLink,
        recordingsBaseUrl: exportRecordingsUrl,
        lectureTitlesTemplate: "AUTO_FROM_COURSE_TEMPLATE",
        evaluationSessions: evalSessions
      }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    
    const normalizedCourseName = courseName.toLowerCase().replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
    const filename = `training-import-${normalizedCourseName}-${selectedExportGroup.startDate}.json`;

    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showSuccessToast(lang === 'ar' ? 'تم تصدير ملف JSON بنجاح!' : 'JSON Export completed successfully!');
    setExportModalOpen(false);
  };

  const handleDownloadCSV = () => {
    if (!selectedExportGroup) return;

    const headers = [
      'Source Booking ID',
      'Source Customer ID',
      'Full Name',
      'Phone',
      'WhatsApp',
      'Email',
      'Payment Status',
      'Paid Total',
      'Total Price',
      'Paid Percentage',
      'is50PercentPaid',
      'hasCompleted50Percent',
      'Activation Status',
      'Booking Date',
      'Sales Name'
    ];

    const rows = studentsToExport.map(s => [
      s.sourceBookingId,
      s.sourceCustomerId,
      s.fullName,
      s.phone,
      s.whatsapp,
      s.email,
      s.paymentStatus,
      s.paidTotal,
      s.totalPrice,
      `${s.paidPercentage}%`,
      s.is50PercentPaid,
      s.hasCompleted50Percent,
      s.activationStatus,
      s.bookingDate,
      s.salesName
    ]);

    const csvContent = "\uFEFF"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const courseName = selectedExportGroup.productName || 'Unknown Course';
    const normalizedCourseName = courseName.toLowerCase().replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
    const filename = `students-export-${normalizedCourseName}-${selectedExportGroup.startDate}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showSuccessToast(lang === 'ar' ? 'تم تصدير ملف CSV بنجاح!' : 'CSV Export completed successfully!');
    setExportModalOpen(false);
  };

  const handleDownloadExcel = () => {
    if (!selectedExportGroup) return;

    const reportRows = studentsToExport.map(s => ({
      'Source Booking ID': s.sourceBookingId,
      'Source Customer ID': s.sourceCustomerId,
      'Full Name': s.fullName,
      'Phone': s.phone,
      'WhatsApp': s.whatsapp,
      'Email': s.email,
      'Payment Status': s.paymentStatus,
      'Paid Total': s.paidTotal,
      'Total Price': s.totalPrice,
      'Paid Percentage': `${s.paidPercentage}%`,
      'is50PercentPaid': s.is50PercentPaid,
      'hasCompleted50Percent': s.hasCompleted50Percent,
      'Activation Status': s.is50PercentPaid ? 'مؤهل للتفعيل (نشط)' : 'معلق لحين استكمال 50% (Mock Data)',
      'Booking Date': s.bookingDate,
      'Sales Name': s.salesName
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Trainees Export");

    const courseName = selectedExportGroup.productName || 'Unknown Course';
    const normalizedCourseName = courseName.toLowerCase().replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
    const filename = `students-export-${normalizedCourseName}-${selectedExportGroup.startDate}.xlsx`;

    XLSX.writeFile(workbook, filename);

    showSuccessToast(lang === 'ar' ? 'تم تصدير ملف Excel بنجاح!' : 'Excel Export completed successfully!');
    setExportModalOpen(false);
  };

  const showSuccessToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const renderGroupCard = (group: Group) => {
    const currentBooked = occupancyMap[group.id] || 0;
    return (
      <div key={group.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden group">
        <div className="absolute top-0 right-0 flex">
           {group.isOnline && <div className="bg-blue-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">Online</div>}
           {group.availableForBooking && <div className="bg-green-500 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest border-l border-white/20">Available</div>}
           {group.groupCode && <div className="bg-gray-900 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest border-l border-white/20">{group.groupCode}</div>}
        </div>
        
        <div className="flex justify-between items-start mb-4">
            <span className={`px-2 py-1 text-xs font-bold rounded ${group.status === 'UPCOMING' ? 'bg-amber-100 text-amber-700' : group.status === 'STARTED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{group.status}</span>
            <div className="flex space-x-2 rtl:space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity">
                {hasPermission('editGroups') && (
                  <button onClick={() => { 
                    setEditingId(group.id); 
                    setFormData({ 
                      groupCode: group.groupCode || '',
                      productId: group.productId || '',
                      productType: group.productType || 'course',
                      startDate: group.startDate || '',
                      daysOfWeek: group.daysOfWeek || [],
                      timeStart: group.timeStart || '10:00',
                      timeEnd: group.timeEnd || '13:00',
                      capacity: group.capacity || 20,
                      trainer: group.trainer || '',
                      supervisor: group.supervisor || '',
                      status: group.status || 'UPCOMING',
                      isOnline: group.isOnline || false,
                      availableForBooking: group.availableForBooking !== undefined ? group.availableForBooking : true,
                      branchId: group.branchId || '',
                      whatsappGroupLink: group.whatsappGroupLink || '',
                      telegramGroupLink: group.telegramGroupLink || '',
                      telegramChannelLink: group.telegramChannelLink || ''
                    }); 
                    setModalOpen(true); 
                  }} className="flex flex-col items-center text-blue-500">
                    <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
                    <i className="fas fa-edit"></i>
                  </button>
                )}
                {hasPermission('deleteRecords') && (
                  <button onClick={() => { setDeleteId(group.id); setDeleteName(`${group.groupCode || group.productName} (${group.startDate})`); }} className="flex flex-col items-center text-red-500">
                    <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                    <i className="fas fa-trash"></i>
                  </button>
                )}
            </div>
        </div>
        <h3 className="text-lg font-bold mb-1">{group.productName}</h3>
        {group.groupCode && <p className="text-[10px] text-gray-400 font-black uppercase mb-1">{group.groupCode}</p>}
        <p className="text-sm text-gray-500 mb-1 flex items-center"><i className="far fa-calendar-alt mr-2 rtl:ml-2"></i> {group.startDate}</p>
        <p className="text-sm font-semibold text-primary-600 mb-4">{group.scheduleLabel}</p>
        
        <div className="flex gap-2 mb-4">
          {group.whatsappGroupLink && (
            <a href={group.whatsappGroupLink} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 flex items-center justify-center hover:scale-110 transition-transform shadow-sm" title="WhatsApp Group">
              <i className="fab fa-whatsapp"></i>
            </a>
          )}
          {group.telegramGroupLink && (
            <a href={group.telegramGroupLink} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center hover:scale-110 transition-transform shadow-sm" title="Telegram Group">
              <i className="fab fa-telegram"></i>
            </a>
          )}
          {group.telegramChannelLink && (
            <a href={group.telegramChannelLink} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center hover:scale-110 transition-transform shadow-sm" title="Recordings Channel">
              <i className="fas fa-microphone-lines"></i>
            </a>
          )}
        </div>

        <div className="space-y-2 mb-6 border-t dark:border-gray-700 pt-4">
            <div className="flex justify-between text-sm"><span className="text-gray-500">{t('trainer')}</span><span className="font-medium">{group.trainer || 'TBD'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">{t('branch')}</span><span className="font-medium">{group.isOnline ? t('online') : (branches.find(b => b.id === group.branchId)?.name || 'N/A')}</span></div>
            <div className="mt-4">
                <div className="flex justify-between text-xs mb-1"><span>{t('booked')}: {currentBooked} / {group.capacity}</span><span>{Math.round((currentBooked / group.capacity) * 100)}%</span></div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden"><div className="bg-primary-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, (currentBooked / group.capacity) * 100)}%` }}></div></div>
            </div>
        </div>

        <div className="flex justify-between items-center gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button 
            onClick={() => setSelectedTraineesGroup(group)}
            className="flex-1 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all border border-indigo-100/50 dark:border-indigo-900/20 cursor-pointer"
          >
            <i className="fas fa-users text-xs"></i>
            <span>{lang === 'ar' ? `الطلاب المشتركون (${currentBooked})` : `Show Trainees (${currentBooked})`}</span>
          </button>

          {hasPermission('viewExports') && (
            <button 
              onClick={() => handleOpenTrainingExport(group)}
              className="py-2 px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all border border-purple-100/50 dark:border-purple-800/20 cursor-pointer"
              title={lang === 'ar' ? 'تصدير لنظام التدريب' : 'Export for Training'}
            >
              <i className="fas fa-file-export"></i>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('groups')}</h1>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Management & Capacity Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPermission('viewExports') && (
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-1">
              <select 
                value={exportStatus} 
                onChange={(e) => setExportStatus(e.target.value as any)}
                className="bg-transparent border-none text-xs font-bold uppercase tracking-widest px-3 py-2 outline-none"
              >
                <option value="UPCOMING">Upcoming Only</option>
                <option value="STARTED">Started Only</option>
                <option value="FINISHED">Finished Only</option>
                <option value="ALL">All Statuses</option>
              </select>
              <button 
                onClick={handleExportReport}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold shadow-md hover:bg-purple-700 transition-all text-[10px] uppercase flex items-center gap-2"
              >
                <i className="fas fa-file-invoice"></i>
                Export Report
              </button>
            </div>
          )}
          {hasPermission('editGroups') && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({ groupCode: '', productId: '', productType: 'course', startDate: '', daysOfWeek: [], timeStart: '10:00', timeEnd: '13:00', capacity: 20, trainer: '', supervisor: '', status: activeTab, isOnline: false, availableForBooking: true, branchId: '', whatsappGroupLink: '', telegramGroupLink: '', telegramChannelLink: '' });
                setModalOpen(true);
              }}
              className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-500/30"
            >
              <i className="fas fa-plus mr-2"></i> {t('add')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="flex space-x-2 rtl:space-x-reverse p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
          {(['UPCOMING', 'STARTED', 'FINISHED'] as const).map(status => (
            <button key={status} onClick={() => setActiveTab(status)} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === status ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600' : 'text-gray-500'}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</button>
          ))}
        </div>

        <div className="flex items-center bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-1.5">
          <span className="text-[10px] font-black uppercase text-gray-400 px-3 tracking-widest">{lang === 'ar' ? 'ترتيب حسب' : 'Sort By'}</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none text-sm font-bold px-3 py-1 outline-none min-w-[150px]"
          >
            <option value="DEFAULT">{lang === 'ar' ? 'الافتراضي' : 'Default'}</option>
            <option value="MONTH">{lang === 'ar' ? 'الشهر' : 'Month'}</option>
            <option value="TYPE_COURSE">{lang === 'ar' ? 'النوع والدورة' : 'Type & Course'}</option>
            <option value="STUDENT_COUNT">{lang === 'ar' ? 'عدد الطلاب' : 'Student Count'}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><i className="fas fa-circle-notch fa-spin text-primary-600 text-2xl"></i></div>
      ) : (
        <div className="space-y-10">
          {sortBy === 'MONTH' && groupedByMonth ? (
            (Object.entries(groupedByMonth) as [string, Group[]][]).map(([month, monthGroups]) => (
              <div key={month} className="space-y-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black uppercase tracking-tighter text-gray-900 dark:text-white bg-primary-50 dark:bg-primary-900/30 px-6 py-2 rounded-2xl border border-primary-100 dark:border-primary-800">
                    {month}
                  </h2>
                  <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{monthGroups.length} Groups</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {monthGroups.map(group => renderGroupCard(group))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedGroups.map(group => renderGroupCard(group))}
            </div>
          )}
          
          {sortedGroups.length === 0 && <div className="py-20 text-center text-gray-400">No {activeTab.toLowerCase()} groups found.</div>}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
              <h2 className="text-xl font-bold flex items-center">
                <i className={`fas ${editingId ? 'fa-edit' : 'fa-plus'} mr-3 rtl:ml-3 text-primary-600`}></i>
                {editingId ? t('edit') : t('add')} {t('groups')}
              </h2>
              <button 
                onClick={() => setModalOpen(false)}
                type="button"
                className="p-3 bg-white dark:bg-gray-700 rounded-2xl shadow-sm hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 flex flex-col custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Group Name / Code</label>
                  <input type="text" placeholder="e.g. G101-AUG" className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-bold" value={formData.groupCode} onChange={e => setFormData({ ...formData, groupCode: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Target Product</label>
                  <select required value={formData.productId} onChange={e => { const prod = products.find(p => p.id === e.target.value); setFormData({ ...formData, productId: e.target.value, productType: prod?.type || 'course' }); }} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-bold"><option value="">Select a course or diploma</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type === 'course' ? 'C' : 'D'})</option>)}</select>
                </div>
                
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-700/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <div className="md:col-span-3 text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Group Links (Optional)</div>
                  <div>
                    <label className="block text-[10px] font-bold text-green-600 mb-1">WhatsApp Group</label>
                    <input type="url" placeholder="https://chat.whatsapp.com/..." className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-green-500" value={formData.whatsappGroupLink} onChange={e => setFormData({...formData, whatsappGroupLink: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-blue-500 mb-1">Telegram Group</label>
                    <input type="url" placeholder="https://t.me/..." className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500" value={formData.telegramGroupLink} onChange={e => setFormData({...formData, telegramGroupLink: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-500 mb-1">Recordings Channel</label>
                    <input type="url" placeholder="https://t.me/..." className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500" value={formData.telegramChannelLink} onChange={e => setFormData({...formData, telegramChannelLink: e.target.value})} />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-3">{t('days')}</label>
                  <div className="flex flex-wrap gap-2">{DAYS_OF_WEEK.map(day => (<button key={day.id} type="button" onClick={() => toggleDay(day.id)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${formData.daysOfWeek.includes(day.id) ? 'bg-primary-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>{day.label}</button>))}</div>
                </div>
                <div><label className="block text-sm font-semibold mb-2">{t('startTime')}</label><select value={formData.timeStart} onChange={e => setFormData({ ...formData, timeStart: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl">{TIME_OPTIONS.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}</select></div>
                <div><label className="block text-sm font-semibold mb-2">{t('endTime')}</label><select value={formData.timeEnd} onChange={e => setFormData({ ...formData, timeEnd: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl">{TIME_OPTIONS.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}</select></div>
                <div><label className="block text-sm font-semibold mb-2">Group Start Date</label><input type="date" required value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none" /></div>
                <div><label className="block text-sm font-semibold mb-2">Trainer Name</label><input type="text" value={formData.trainer} onChange={e => setFormData({ ...formData, trainer: e.target.value })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl" placeholder="Enter trainer name" /></div>
                <div><label className="block text-sm font-semibold mb-2">Capacity</label><input type="number" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl" /></div>
                <div><label className="block text-sm font-semibold mb-2">Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"><option value="UPCOMING">Upcoming</option><option value="STARTED">Started</option><option value="FINISHED">Finished</option></select></div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 md:col-span-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl">
                  <label className="flex items-center cursor-pointer group">
                    <input type="checkbox" checked={formData.isOnline} onChange={e => setFormData({ ...formData, isOnline: e.target.checked })} className="hidden" />
                    <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${formData.isOnline ? 'bg-primary-600' : 'bg-gray-300'}`}>
                      <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${formData.isOnline ? 'translate-x-5' : ''}`}></div>
                    </div>
                    <span className="ml-3 rtl:mr-3 font-semibold text-sm">Online Group</span>
                  </label>

                  <label className="flex items-center cursor-pointer group">
                    <input type="checkbox" checked={formData.availableForBooking} onChange={e => setFormData({ ...formData, availableForBooking: e.target.checked })} className="hidden" />
                    <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${formData.availableForBooking ? 'bg-green-600' : 'bg-gray-300'}`}>
                      <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${formData.availableForBooking ? 'translate-x-5' : ''}`}></div>
                    </div>
                    <span className="ml-3 rtl:mr-3 font-semibold text-sm text-green-600">متاح للحجز</span>
                  </label>

                  {!formData.isOnline && <div className="flex-1"><select required={!formData.isOnline} value={formData.branchId} onChange={e => setFormData({ ...formData, branchId: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg outline-none text-sm"><option value="">Select Branch (Location)</option>{branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                </div>
                <div className="md:col-span-2">
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 rounded-2xl"><span className="text-xs uppercase font-bold text-primary-600">Generated Schedule Label</span><p className="font-bold text-lg">{scheduleLabel || 'Select days and time'}</p></div>
                </div>
              </div>

              {/* Action Buttons sticky or at the bottom of form scroll */}
              <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 pt-6 flex justify-end space-x-3 rtl:space-x-reverse mt-auto">
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-3 text-gray-500 font-bold">{t('cancel')}</button>
                <button type="submit" className="px-10 py-3 bg-primary-600 text-white rounded-xl font-bold shadow-lg">{t('save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Available Slots Summary Section */}
      {availableSlotsSummary && (
        <div className="mt-16 border-t dark:border-gray-700 pt-10">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter text-indigo-600 dark:text-indigo-400">
                {lang === 'ar' ? 'ملخص المواعيد المتاحة حالياً' : 'Available Slots Summary'}
              </h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Copy & Share with Customers</p>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(availableSlotsSummary);
                alert(lang === 'ar' ? 'تم النسخ!' : 'Copied to clipboard!');
              }}
              className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
            >
              <i className="fas fa-copy mr-2"></i> {t('copy')}
            </button>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border-2 border-dashed border-indigo-100 dark:border-indigo-900/50 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300 leading-relaxed text-center rtl:text-right">
              {availableSlotsSummary}
            </pre>
          </div>
        </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined; await genericDelete('groups', deleteId, performedBy); setDeleteId(null); fetchData(); } }} itemName={deleteName} />

      {isExportModalOpen && selectedExportGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col my-8 overflow-hidden transform scale-100 transition-all">
            
            {/* Header */}
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-purple-50/50 dark:bg-purple-950/20">
              <h2 className="text-xl font-bold flex items-center text-purple-700 dark:text-purple-400">
                <i className="fas fa-file-export mr-3 rtl:ml-3"></i>
                {lang === 'ar' ? 'تصدير البيانات لنظام التدريب' : 'Export Group to Training System'}
              </h2>
              <button 
                onClick={() => setExportModalOpen(false)}
                type="button"
                className="p-3 bg-white dark:bg-gray-700 rounded-2xl shadow-sm hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-h-[75vh]">
              
              {/* Stats / Metadata Overview */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/35 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                    {lang === 'ar' ? 'اسم الدورة' : 'Course Name'}
                  </span>
                  <p className="font-bold text-xs text-gray-800 dark:text-gray-100 truncate">{selectedExportGroup.productName}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/35 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                    {lang === 'ar' ? 'تاريخ البدء' : 'Start Date'}
                  </span>
                  <p className="font-bold text-xs text-gray-800 dark:text-gray-100">{selectedExportGroup.startDate}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/35 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                    {lang === 'ar' ? 'إجمالي الطلاب' : 'Total Students'}
                  </span>
                  <p className="font-bold text-base text-purple-600 dark:text-purple-400">{studentsToExport.length}</p>
                </div>
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
                  <span className="block text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider mb-1">
                    {lang === 'ar' ? 'مستكملي 50% (مؤهل للتفعيل)' : 'Eligible (>=50% Paid)'}
                  </span>
                  <p className="font-black text-base text-emerald-700 dark:text-emerald-300">
                    {studentsToExport.filter(s => s.is50PercentPaid).length}
                  </p>
                </div>
                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-800/40">
                  <span className="block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 tracking-wider mb-1">
                    {lang === 'ar' ? 'أقل من 50% (Mock Data / معلق)' : 'Pending (<50% Paid)'}
                  </span>
                  <p className="font-black text-base text-amber-700 dark:text-amber-300">
                    {studentsToExport.filter(s => !s.is50PercentPaid).length}
                  </p>
                </div>
              </div>

              {/* Editing Missing Or Config Fields */}
              <div className="bg-purple-50/10 dark:bg-purple-900/5 p-6 rounded-3xl border border-purple-100/50 dark:border-purple-900/20 space-y-4">
                <h3 className="text-sm font-black uppercase text-purple-700 dark:text-purple-400 tracking-wider mb-3">
                  {lang === 'ar' ? 'تخصيص الحقول الاختيارية والناقصة' : 'Configure Optional & Missing Fields'}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'إجمالي عدد المحاضرات' : 'Total Sessions'}
                    </label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs font-bold"
                      value={exportTotalSessions}
                      onChange={e => setExportTotalSessions(parseInt(e.target.value) || 22)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'مدة المحاضرة (بالدقائق)' : 'Session Duration (Mins)'}
                    </label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs font-bold"
                      value={exportSessionDuration}
                      onChange={e => setExportSessionDuration(parseInt(e.target.value) || 120)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'رقم محاضرات التقييم' : 'Evaluation Sessions'}
                    </label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs font-bold"
                      placeholder="e.g. 1, 4, 7, 10..."
                      value={exportEvaluationSessions}
                      onChange={e => setExportEvaluationSessions(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'رابط جروب الواتساب' : 'WhatsApp Link'}
                    </label>
                    <input 
                      type="url" 
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs"
                      placeholder="https://..."
                      value={exportWhatsappLink}
                      onChange={e => setExportWhatsappLink(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'رابط جروب التليجرام' : 'Telegram Link'}
                    </label>
                    <input 
                      type="url" 
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs"
                      placeholder="https://..."
                      value={exportTelegramLink}
                      onChange={e => setExportTelegramLink(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'رابط قناة التسجيلات' : 'Recordings Channel URL'}
                    </label>
                    <input 
                      type="url" 
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs"
                      placeholder="https://..."
                      value={exportRecordingsUrl}
                      onChange={e => setExportRecordingsUrl(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {lang === 'ar' ? 'ملاحظات إضافية' : 'Additional Notes'}
                    </label>
                    <textarea 
                      className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-xs h-16 resize-none"
                      placeholder="..."
                      value={exportNotes}
                      onChange={e => setExportNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Warnings Checklist */}
              {exportWarnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-5 rounded-2xl space-y-2">
                  <h4 className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2 animate-pulse">
                    <i className="fas fa-exclamation-triangle"></i>
                    {lang === 'ar' ? 'تنبيهات جودة البيانات' : 'Data Warnings / Missing Info'}
                  </h4>
                  <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {exportWarnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Booked Students Preview List */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold">
                    {lang === 'ar' ? 'قائمة الطلاب المصدرين' : 'Active Students Preview'}
                  </h3>
                  <span className="text-xs text-gray-400">({studentsToExport.length} {lang === 'ar' ? 'طالب مؤكد' : 'confirmed students'})</span>
                </div>
                
                {studentsToExport.length === 0 ? (
                  <div className="p-6 text-center border border-dashed rounded-2xl text-gray-400 text-xs">
                    {lang === 'ar' ? 'لا يوجد طلاب مؤكدين في هذا الجروب بعد.' : 'No active students found in this group.'}
                  </div>
                ) : (
                  <div className="border dark:border-gray-700 rounded-2xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-xs text-left rtl:text-right">
                      <thead className="bg-gray-50 dark:bg-gray-900/60 sticky top-0 text-gray-400 font-bold border-b dark:border-gray-700">
                        <tr>
                          <th className="px-4 py-2">{lang === 'ar' ? 'الاسم بالكامل' : 'Full Name'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'الواتساب' : 'WhatsApp'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'حالة الدفع' : 'Payment'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'نسبة المدفوع' : 'Paid %'}</th>
                          <th className="px-4 py-2">{lang === 'ar' ? 'تفعيل (>=50%)' : 'Activation (>=50%)'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {studentsToExport.map((stu, sIdx) => (
                          <tr key={sIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                            <td className="px-4 py-2 font-bold">{stu.fullName}</td>
                            <td className="px-4 py-2 font-mono text-[11px]">{stu.phone || '-'}</td>
                            <td className="px-4 py-2 font-mono text-[11px]">{stu.whatsapp || '-'}</td>
                            <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">{stu.email || '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                                stu.paymentStatus === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                                stu.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                                'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              }`}>
                                {stu.paymentStatus}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-bold text-[11px] text-gray-700 dark:text-gray-300">
                              {stu.paidPercentage}%
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {stu.is50PercentPaid ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  ✅ مؤهل للتفعيل (نشط)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  ⏳ معلق / Mock Data
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

            {/* Action Buttons */}
            <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 flex flex-col sm:flex-row justify-between items-center gap-4">
              <button 
                type="button" 
                onClick={() => setExportModalOpen(false)} 
                className="w-full sm:w-auto px-6 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs"
              >
                {t('cancel')}
              </button>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button 
                  type="button" 
                  onClick={handleDownloadExcel}
                  disabled={studentsToExport.length === 0}
                  className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  <i className="fas fa-file-excel"></i>
                  {lang === 'ar' ? 'تصدير الطلاب (Excel)' : 'Export Students (Excel)'}
                </button>
                <button 
                  type="button" 
                  onClick={handleDownloadCSV}
                  disabled={studentsToExport.length === 0}
                  className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-primary-600 border border-primary-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  <i className="fas fa-file-csv"></i>
                  {lang === 'ar' ? 'تصدير الطلاب (CSV)' : 'Export Students (CSV)'}
                </button>
                <button 
                  type="button" 
                  onClick={handleDownloadJSON}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all"
                >
                  <i className="fas fa-file-code"></i>
                  {lang === 'ar' ? 'تحميل ملف الاستيراد (JSON)' : 'Download JSON Import File'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Trainees List Modal */}
      {selectedTraineesGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-700 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-primary-600 p-6 text-white flex justify-between items-start">
              <div>
                <span className="bg-white/20 text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-full border border-white/10 tracking-widest block w-fit mb-2">
                  {selectedTraineesGroup.groupCode || (lang === 'ar' ? 'مجموعة تدريبية' : 'TRAINING GROUP')}
                </span>
                <h2 className="text-xl font-black mb-1">{selectedTraineesGroup.productName}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-indigo-100 font-bold mt-1">
                  <span>📅 {selectedTraineesGroup.startDate}</span>
                  <span>⏱️ {selectedTraineesGroup.scheduleLabel}</span>
                  <span>👨‍🏫 {lang === 'ar' ? 'المدرب: ' : 'Trainer: '}{selectedTraineesGroup.trainer || 'TBD'}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTraineesGroup(null)}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all cursor-pointer text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              
              <div className="flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-950/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/10">
                <div className="text-xs font-bold text-indigo-800 dark:text-indigo-400">
                  <i className="fas fa-info-circle mr-1 rtl:ml-1"></i>
                  {lang === 'ar' 
                    ? 'قائمة بجميع الطلاب المسجلين رسمياً والمؤكد حجزهم في هذه المجموعة.' 
                    : 'List of all officially registered and confirmed trainees in this group.'}
                </div>
                <div className="text-sm font-black text-indigo-900 dark:text-white">
                  {lang === 'ar' ? 'العدد الكلي: ' : 'Total: '}
                  {traineesForGroup.length} / {selectedTraineesGroup.capacity}
                </div>
              </div>

              {traineesForGroup.length === 0 ? (
                <div className="py-16 text-center text-gray-400 dark:text-gray-500 italic">
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-users-slash text-2xl text-gray-300"></i>
                  </div>
                  {lang === 'ar' ? 'لا يوجد طلاب مسجلون في هذه المجموعة حالياً.' : 'No trainees registered in this group yet.'}
                </div>
              ) : (
                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left rtl:text-right">
                      <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-extrabold uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                        <tr>
                          <th className="px-5 py-3">{lang === 'ar' ? 'بيانات الطالب' : 'Trainee Info'}</th>
                          <th className="px-5 py-3">{lang === 'ar' ? 'التواصل السريع' : 'Quick Contact'}</th>
                          <th className="px-5 py-3">{lang === 'ar' ? 'مسؤول المبيعات' : 'Sales Rep'}</th>
                          <th className="px-5 py-3">{lang === 'ar' ? 'موقف الدفع' : 'Payment Status'}</th>
                          <th className="px-5 py-3">{lang === 'ar' ? 'تاريخ الحجز' : 'Booking Date'}</th>
                          <th className="px-5 py-3 text-right">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                        {traineesForGroup.map(({ booking, customer }, idx) => (
                          <tr key={booking.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                            
                            {/* Student Info */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/30 dark:to-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                                  {customer?.name?.slice(0, 1).toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <div className="font-extrabold text-gray-800 dark:text-gray-100 text-sm">{customer?.name || (lang === 'ar' ? 'عميل غير معروف' : 'Unknown Customer')}</div>
                                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{customer?.email || '-'}</div>
                                </div>
                              </div>
                            </td>

                            {/* Contact Links */}
                            <td className="px-5 py-3.5">
                              {customer ? (
                                <div className="flex items-center gap-2">
                                  {/* WhatsApp Direct */}
                                  <a 
                                    href={`https://wa.me/${(customer.countryCode || '+20').replace('+', '')}${customer.whatsapp}`}
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg font-black text-[10px] flex items-center gap-1 transition-all border border-emerald-100/50 dark:border-emerald-900/10 cursor-pointer"
                                    title={lang === 'ar' ? 'مراسلة عبر واتساب' : 'WhatsApp Chat'}
                                  >
                                    <i className="fab fa-whatsapp text-xs"></i>
                                    <span>{lang === 'ar' ? 'واتساب' : 'WhatsApp'}</span>
                                  </a>

                                  {/* Direct Call */}
                                  <a 
                                    href={`tel:${customer.countryCode || '+20'}${customer.whatsapp}`}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-all border border-gray-100 dark:border-gray-600 cursor-pointer"
                                    title={lang === 'ar' ? 'اتصال هاتف' : 'Direct Call'}
                                  >
                                    <i className="fas fa-phone-alt text-[10px]"></i>
                                  </a>

                                  {/* Copy phone */}
                                  <button 
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${customer.countryCode || '+20'}${customer.whatsapp}`);
                                      alert(lang === 'ar' ? 'تم نسخ الرقم بنجاح!' : 'Phone number copied successfully!');
                                    }}
                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-lg transition-all border border-gray-100 dark:border-gray-600 cursor-pointer"
                                    title={lang === 'ar' ? 'نسخ الرقم' : 'Copy Number'}
                                  >
                                    <i className="far fa-copy text-[10px]"></i>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>

                            {/* Sales Representative */}
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-gray-700 dark:text-gray-300">{booking.salesName || '-'}</div>
                              <div className="text-[9px] text-gray-400 uppercase tracking-widest">{lang === 'ar' ? 'السيلز المسؤول' : 'Handled By'}</div>
                            </td>

                            {/* Payment Status */}
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase w-fit tracking-wide ${
                                  booking.paymentSummary?.remaining === 0 ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30' :
                                  (booking.paymentSummary?.paidTotal || 0) > 0 ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30' :
                                  'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                                }`}>
                                  {booking.paymentSummary?.remaining === 0 
                                    ? (lang === 'ar' ? 'خالص السداد' : 'Fully Paid') 
                                    : (booking.paymentSummary?.paidTotal || 0) > 0 
                                      ? (lang === 'ar' ? 'سداد جزئي' : 'Partially Paid') 
                                      : (lang === 'ar' ? 'متبقي بالكامل' : 'Not Paid')}
                                </span>
                                <div className="text-[10px] text-gray-500 font-bold font-mono">
                                  <span>{booking.paymentSummary?.paidTotal?.toLocaleString()}</span> / <span className="text-gray-400">{((booking.paymentSummary?.paidTotal || 0) + (booking.paymentSummary?.remaining || 0)).toLocaleString()} ج.م</span>
                                </div>
                              </div>
                            </td>

                            {/* Booking Date */}
                            <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                              {booking.bookingDate ? booking.bookingDate.split('-').reverse().join('/') : '-'}
                              <div className="text-[9px] text-gray-400 font-bold capitalize">{booking.bookingType === 'deferred' ? (lang === 'ar' ? 'حجز مؤجل' : 'Deferred') : (lang === 'ar' ? 'جروب محدد' : 'Assigned')}</div>
                            </td>

                            {/* Actions Column */}
                            <td className="px-5 py-3.5 text-right">
                              {(hasPermission('assignGroups') || hasPermission('editGroups')) && (
                                <button
                                  onClick={() => { setReassignBooking({ booking, customerName: customer?.name || 'Student' }); setTargetGroupId(''); }}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-black border border-amber-200 dark:border-amber-900/30 transition-all cursor-pointer shadow-sm"
                                  title={lang === 'ar' ? 'تغيير/نقل مجموعة الطالب' : 'Change Student Group'}
                                >
                                  <i className="fas fa-exchange-alt mr-1 rtl:ml-1"></i>
                                  {lang === 'ar' ? 'تغيير المجموعة' : 'Change Group'}
                                </button>
                              )}
                            </td>

                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 flex justify-end">
              <button 
                onClick={() => setSelectedTraineesGroup(null)}
                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs cursor-pointer"
              >
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Reassign Student Group Sub-Modal */}
      {reassignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-black mb-1 text-gray-900 dark:text-white">
              {lang === 'ar' ? 'تغيير / نقل مجموعة الطالب' : 'Change Student Group'}
            </h3>
            <p className="text-xs text-gray-500 mb-4 font-bold">
              {reassignBooking.customerName}
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5 text-gray-700 dark:text-gray-300">
                  {lang === 'ar' ? 'المجموعة الجديدة المستهدفة:' : 'Target Group:'}
                </label>
                <select 
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-bold text-xs" 
                  value={targetGroupId} 
                  onChange={e => setTargetGroupId(e.target.value)}
                >
                  <option value="">{lang === 'ar' ? 'اختر المجموعة المستهدفة' : 'Select Target Group'}</option>
                  {groups
                    .filter(g => g.productId === reassignBooking.booking.productId && g.status !== 'FINISHED' && g.id !== reassignBooking.booking.groupId)
                    .map(g => (
                      <option key={g.id} value={g.id}>
                        {g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel}
                      </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
                <button 
                  onClick={() => setReassignBooking(null)} 
                  className="px-4 py-2 font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  disabled={!targetGroupId || isReassigning}
                  onClick={async () => {
                    if (!targetGroupId) return;
                    setIsReassigning(true);
                    try {
                      await assignGroupToBooking(
                        reassignBooking.booking.id, 
                        targetGroupId, 
                        { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' }
                      );
                      alert(lang === 'ar' ? 'تم نقل الطالب وتحديث مواعيد الأقساط بنجاح!' : 'Student transferred successfully!');
                      setReassignBooking(null);
                      // Refresh data
                      const updatedBookings = await genericGet<Booking>('bookings');
                      setBookings(updatedBookings);
                    } catch (err: any) {
                      alert("Error transferring student: " + err.message);
                    } finally {
                      setIsReassigning(false);
                    }
                  }} 
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black shadow-lg text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isReassigning ? <i className="fas fa-spinner fa-spin mr-1"></i> : (lang === 'ar' ? 'تأكيد النقل' : 'Confirm Transfer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Success Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-green-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
          <i className="fas fa-check-circle text-lg"></i>
          <span className="font-bold text-sm">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default Groups;
