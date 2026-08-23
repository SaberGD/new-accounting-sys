
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getCairoDateString } from '../services/timeService';
import { 
  genericGet, 
  genericGetDoc,
  genericGetCount,
  genericGetPaginated,
  createBooking, 
  updateBooking,
  updateBookingInstallmentPlan,
  softDeleteDoc,
  deactivateBooking,
  issueRefund,
  hasPaymentsForBooking,
  getBookingPayments,
  updateWhatsAppStatus,
  addCompletionPayment,
  withdrawAmount,
  assignGroupToBooking,
  checkBookingDuplicate,
  getBookingLogs,
  findCustomerByWhatsApp,
  rescheduleRemainingInstallments,
  getPromoCodes,
  getBookingFormSubmissions,
  searchBookingFormSubmissions
} from '../services/firestore';
import { 
  Booking, Customer, Group, Course, Diploma, Offer, Installment, InstallmentPlan, PaymentMethod, SalesStaff, BookingLog, Branch, Payment, PromoCode, InternationalDetails, BookingFormSubmission
} from '../types';
import DeleteModal from '../components/DeleteModal';
import HistoryModal from '../components/HistoryModal';
import { where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { smartCleanPhone } from './ConfirmBookingPortal';

export const cleanLocalPhone = (raw: string, defaultDialCode: string = '+20') => {
  if (!raw) return { cleanLocal: '', countryCode: defaultDialCode, nationality: (defaultDialCode === '+20' ? 'egyptian' : 'other') as 'egyptian' | 'other' };

  const { cleanedDigits, activeDialCode } = smartCleanPhone(raw, defaultDialCode);

  let countryCode = activeDialCode || defaultDialCode || '+20';
  let nationality: 'egyptian' | 'other' = countryCode === '+20' ? 'egyptian' : 'other';

  let cleanLocal = cleanedDigits;
  // If Egyptian number (+20), ensure 11 digits starting with '01' if 10 digits starting with '1'
  if (countryCode === '+20') {
    if (cleanLocal.length === 10 && cleanLocal.startsWith('1')) {
      cleanLocal = '0' + cleanLocal;
    }
  }

  return { cleanLocal, countryCode, nationality };
};

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ValidationErrors { [key: string]: string; }

const COUNTRIES = [
  { name: 'Egypt', code: '+20', flag: '🇪🇬' },
  { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { name: 'UAE', code: '+971', flag: '🇦🇪' },
  { name: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { name: 'Qatar', code: '+974', flag: '🇶🇦' },
  { name: 'Jordan', code: '+962', flag: '🇯🇴' },
  { name: 'Oman', code: '+968', flag: '🇴🇲' },
  { name: 'Bahrain', code: '+973', flag: '🇧🇭' },
  { name: 'Libya', code: '+218', flag: '🇱🇾' },
  { name: 'Sudan', code: '+249', flag: '🇸🇩' },
  { name: 'Palestine', code: '+970', flag: '🇵🇸' },
  { name: 'Iraq', code: '+964', flag: '🇮🇶' },
  { name: 'Lebanon', code: '+961', flag: '🇱🇧' },
  { name: 'USA', code: '+1', flag: '🇺🇸' },
  { name: 'UK', code: '+44', flag: '🇬🇧' },
  { name: 'Germany', code: '+49', flag: '🇩🇪' },
].sort((a, b) => a.name.localeCompare(b.name));

const Bookings: React.FC = () => {
  const { t, isRtl } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const location = useLocation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [lastBookingDoc, setLastBookingDoc] = useState<any>(null);
  const [hasMoreBookings, setHasMoreBookings] = useState(true);
  const [totalBookingsCount, setTotalBookingsCount] = useState(0);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupSearch, setGroupSearch] = useState('');
  const [waFilter, setWaFilter] = useState<'all' | 'added' | 'pending' | 'not_eligible'>('all');
  const [salesFilter, setSalesFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'assigned' | 'deferred'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [paymentPlanLocked, setPaymentPlanLocked] = useState(false);
  
  // Action Modals State
  const [isDeactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [isRefundModalOpen, setRefundModalOpen] = useState(false);
  const [isCompletionModalOpen, setCompletionModalOpen] = useState(false);
  const [completionMode, setCompletionMode] = useState<'collect' | 'withdraw'>('collect');
  const [isAssignModalOpen, setAssignModalOpen] = useState(false);
  const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
  const [activeActionBooking, setActiveActionBooking] = useState<Booking | null>(null);
  
  const [deactivationData, setDeactivationData] = useState({ reason: '', refundEligible: false, eligibilityReason: '' });
  const [refundData, setRefundData] = useState({ amount: 0, reason: '', method: 'cash_office' as PaymentMethod, ref: '' });
  const [completionData, setCompletionData] = useState({ amount: 0, method: 'cash_office' as PaymentMethod, ref: '', note: '', receiptLink: '' });
  const [completionInstallments, setCompletionInstallments] = useState<Installment[]>([]);
  const [selectedAssignGroupId, setSelectedAssignGroupId] = useState('');

  // Import Form Submissions State
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [formSubmissions, setFormSubmissions] = useState<BookingFormSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState('');

  const handleOpenImportModal = async () => {
    try {
      setLoadingSubmissions(true);
      setImportModalOpen(true);
      const subs = await getBookingFormSubmissions(48);
      setFormSubmissions(subs.filter(s => s.status !== 'archived'));
    } catch (err) {
      console.error('Error loading form submissions:', err);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleSearchSubmissionsInModal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!submissionSearch.trim()) {
      handleOpenImportModal();
      return;
    }
    setLoadingSubmissions(true);
    try {
      const results = await searchBookingFormSubmissions(submissionSearch);
      setFormSubmissions(results.filter(s => s.status !== 'archived'));
    } catch (err) {
      console.error('Error searching submissions:', err);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleSelectSubmissionToImport = (sub: BookingFormSubmission) => {
    const targetCode = sub.countryCode || '+20';
    const waCleaned = cleanLocalPhone(sub.whatsapp || '', targetCode);
    const phoneCleaned = cleanLocalPhone(sub.phone || '', waCleaned.countryCode || targetCode);

    setCustomerData({
      name: sub.customerName,
      phone: phoneCleaned.cleanLocal,
      whatsapp: waCleaned.cleanLocal,
      countryCode: waCleaned.countryCode,
      email: sub.email || '',
      nationality: waCleaned.nationality
    });

    setDeposit(sub.paidAmount || 0);
    setTransactionRef(sub.transferSenderNumber || '');

    const methodMap: Record<string, PaymentMethod> = {
      vodafone_cash: 'vodafone_cash',
      instapay: 'instapay',
      cash_office: 'cash_office',
      etisalat_cash: 'etisalat_cash',
      paypal: 'paypal'
    };
    if (methodMap[sub.paymentMethod]) {
      setPaymentMethod(methodMap[sub.paymentMethod]);
    } else {
      setPaymentMethod('cash_office');
    }

    if (sub.productId) {
      const match = [...courses, ...diplomas].find(p => p.id === sub.productId);
      if (match) setSelectedProductId(match.id);
    } else if (sub.productName) {
      const match = [...courses, ...diplomas].find(p => 
        p.name.toLowerCase().includes(sub.productName.toLowerCase()) || 
        sub.productName.toLowerCase().includes(p.name.toLowerCase())
      );
      if (match) setSelectedProductId(match.id);
    }

    // Map student selected installment plan
    if (sub.installmentPlan === '10_days') {
      setInstallmentPlanType('10_days');
      setInstallmentCount(4);
      setShowInstallmentPreview(true);
    } else if (sub.installmentPlan === '15_days') {
      setInstallmentPlanType('15_days');
      setInstallmentCount(3);
      setShowInstallmentPreview(true);
    } else if (sub.installmentPlan === '60_days') {
      setInstallmentPlanType('60_days');
      setInstallmentCount(2);
      setShowInstallmentPreview(true);
    } else if (sub.installmentPlan === 'custom_cs') {
      setInstallmentPlanType('manual');
      setShowInstallmentPreview(false);
    } else {
      setInstallmentPlanType('none');
      setInstallmentCount(0);
      setShowInstallmentPreview(false);
    }

    setEditingBookingId(null);
    setImportModalOpen(false);
    setModalOpen(true);
  };

  useEffect(() => {
    if (location.state?.importFormSubmission) {
      handleSelectSubmissionToImport(location.state.importFormSubmission);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Promo Code States
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromoCodeObj, setAppliedPromoCodeObj] = useState<PromoCode | null>(null);
  const [promoValidationError, setPromoValidationError] = useState('');

  const getPromoStatus = (promo: PromoCode): 'active' | 'expired' | 'scheduled' => {
    if (!promo.isActive) return 'expired';
    const today = new Date().toISOString().split('T')[0];
    if (today < promo.startDate) return 'scheduled';
    if (today > promo.endDate) return 'expired';
    return 'active';
  };

  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const modalFormRef = useRef<HTMLDivElement>(null);

  // Form State for Create/Edit
  const [customerData, setCustomerData] = useState({ 
    name: '', 
    whatsapp: '', 
    phone: '', 
    email: '',
    countryCode: '+20',
    nationality: 'egyptian' as 'egyptian' | 'other'
  });
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isDeferred, setIsDeferred] = useState(false);
  const [selectedSalesId, setSelectedSalesId] = useState('');
  const [extraDiscount, setExtraDiscount] = useState(0);
  const [extraDiscountReason, setExtraDiscountReason] = useState('');
  const [isScholarship, setIsScholarship] = useState(false);
  const [scholarshipReason, setScholarshipReason] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_office');
  const [transactionRef, setTransactionRef] = useState('');
  const [receiptLink, setReceiptLink] = useState('');
  const [bookingDate, setBookingDate] = useState(getCairoDateString());

  // International Booking States
  const [isInternational, setIsInternational] = useState(false);
  const [internationalCurrency, setInternationalCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(48.5);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [foreignCoursePrice, setForeignCoursePrice] = useState(0);
  const [foreignOfferPrice, setForeignOfferPrice] = useState(0);
  const [applyForeignOffer, setApplyForeignOffer] = useState(false);
  const [foreignPaidAmount, setForeignPaidAmount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(14);
  const [commissionPercent, setCommissionPercent] = useState(3);
  const [internationalFilter, setInternationalFilter] = useState<'all' | 'domestic' | 'international'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  const updateForeignPricesForProduct = (pId: string, curr: string, currentRate: number = exchangeRate) => {
    const prod = [...courses, ...diplomas].find(p => p.id === pId);
    if (prod?.foreignPrices?.[curr]) {
      const fp = prod.foreignPrices[curr];
      setForeignCoursePrice(fp.price || 0);
      if (fp.priceAfterDiscount && fp.priceAfterDiscount > 0 && fp.priceAfterDiscount < fp.price) {
        setForeignOfferPrice(fp.priceAfterDiscount);
        setApplyForeignOffer(true);
      } else {
        setForeignOfferPrice(0);
        setApplyForeignOffer(false);
      }
    } else if (prod) {
      const estimated = Math.round(prod.basePrice / (currentRate || 1));
      setForeignCoursePrice(estimated);
      setForeignOfferPrice(0);
      setApplyForeignOffer(false);
    } else {
      setForeignCoursePrice(0);
      setForeignOfferPrice(0);
      setApplyForeignOffer(false);
    }
  };

  const fetchExchangeRate = async (curr: string) => {
    if (curr === 'EGP') {
      setExchangeRate(1);
      return;
    }
    setIsFetchingRate(true);
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${curr}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates && data.rates['EGP']) {
          setExchangeRate(Math.round(data.rates['EGP'] * 100) / 100);
          setIsFetchingRate(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Exchange rate fetch error, fallback used:", err);
    }
    const fallbacks: Record<string, number> = {
      USD: 48.5,
      SAR: 12.9,
      EUR: 52.8,
      AED: 13.2,
      GBP: 62.5
    };
    setExchangeRate(fallbacks[curr] || 48.5);
    setIsFetchingRate(false);
  };

  // New Installment States
  const [installmentPlanType, setInstallmentPlanType] = useState<'none' | '10_days' | '15_days' | '60_days' | 'manual'>('none');
  const [showInstallmentPreview, setShowInstallmentPreview] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(0);
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');
  const [firstInstallmentAmount, setFirstInstallmentAmount] = useState<number | ''>('');
  const [intervalDays, setIntervalDays] = useState(30);
  const [isManualInstallments, setIsManualInstallments] = useState(false);
  const [manualInstallments, setManualInstallments] = useState<Installment[]>([]);

  // Reschedule State for Edit
  const [rescheduleEnabled, setRescheduleEnabled] = useState(false);
  const [rescheduleCount, setRescheduleCount] = useState(0);
  const [rescheduleFirstDate, setRescheduleFirstDate] = useState('');
  const [rescheduleInterval, setRescheduleInterval] = useState(30);
  const [rescheduleManual, setRescheduleManual] = useState(false);
  const [rescheduleList, setRescheduleList] = useState<Installment[]>([]);
  const [rescheduleReason, setRescheduleReason] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const canViewRevenue = hasPermission('viewRevenue');

  useEffect(() => {
    if (!hasPermission('viewAllBookings') && userProfile && salesStaff.length > 0) {
      const linkedStaff = salesStaff.find(s => s.userId === userProfile.uid);
      if (linkedStaff) {
        setSalesFilter(linkedStaff.id);
      }
    }
  }, [salesStaff, userProfile, hasPermission]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const sortBookingsNewestFirst = (arr: Booking[]) => {
    return [...arr].sort((a, b) => {
      const aCreated = (a as any).createdAt;
      const bCreated = (b as any).createdAt;
      if (aCreated && bCreated) {
        const createdComp = bCreated.localeCompare(aCreated);
        if (createdComp !== 0) return createdComp;
      } else if (aCreated && !bCreated) {
        return -1;
      } else if (!aCreated && bCreated) {
        return 1;
      }
      const dateComp = (b.bookingDate || '').localeCompare(a.bookingDate || '');
      if (dateComp !== 0) return dateComp;
      return (b.id || '').localeCompare(a.id || '');
    });
  };

  const fetchData = async (isLoadMore = false) => {
    if (isLoadMore && !hasMoreBookings) return;
    setLoading(true);
    console.log("Fetching bookings...", { 
      isLoadMore, 
      lastBookingDoc, 
      salesFilter, 
      groupFilter, 
      typeFilter, 
      paymentFilter,
      waFilter,
      dateFilter,
      debouncedSearch 
    });
    try {
      // 1. Fetch Sales Staff First if not loaded yet (needed for filtering)
      let currentStaff = salesStaff;
      let currentCustomers = customers;

      if (salesStaff.length === 0 || customers.length === 0) {
        const [s, c] = await Promise.all([
          genericGet<SalesStaff>('sales_staff'),
          genericGet<Customer>('customers')
        ]);
        currentStaff = s;
        currentCustomers = c;
        setSalesStaff(s);
        setCustomers(c);
      }

      // Construct Query Constraints for Bookings
      const constraints: any[] = [];
      
      // debouncedSearch optimization
      const searchStr = debouncedSearch.toLowerCase().trim();
      if (searchStr) {
        // Find matching customer IDs from full list
        const matchedCustomerIds = currentCustomers
          .filter(c => 
            c.name.toLowerCase().includes(searchStr) || 
            (c.whatsapp && c.whatsapp.includes(searchStr)) ||
            (c.fullWhatsapp && c.fullWhatsapp.includes(searchStr))
          )
          .map(c => c.id)
          .slice(0, 30); // Firestore 'in' limit

        if (matchedCustomerIds.length > 0) {
          constraints.push(where('customerId', 'in', matchedCustomerIds));
        } else if (!/^[a-zA-Z0-9]+$/.test(searchStr)) {
          // If a search is provided but no customers match, we might get zero results.
          // In complex scenarios, we'd need a cloud function or Algolia.
        }
      }
      
      // salesFilter
      if (salesFilter !== 'all') {
        constraints.push(where('salesId', '==', salesFilter));
      } else if (!hasPermission('viewAllBookings')) {
        const linkedStaff = currentStaff.find(s => s.userId === userProfile?.uid);
        if (linkedStaff) {
          constraints.push(where('salesId', '==', linkedStaff.id));
        }
      }

      // groupFilter
      if (groupFilter !== 'all') {
        constraints.push(where('groupId', '==', groupFilter));
      }

      // typeFilter
      if (typeFilter !== 'all') {
        constraints.push(where('bookingType', '==', typeFilter === 'assigned' ? 'assigned' : 'deferred'));
      }

      // paymentFilter
      if (paymentFilter !== 'all') {
        if (paymentFilter === 'pending') {
          constraints.push(where('paymentSummary.remaining', '>', 0));
        } else if (paymentFilter === 'paid') {
          constraints.push(where('paymentSummary.remaining', '==', 0));
        }
      }

      // waFilter
      if (waFilter !== 'all') {
        if (waFilter === 'added') {
          constraints.push(where('whatsappStatus.added', '==', true));
        } else if (waFilter === 'pending') {
          constraints.push(where('whatsappStatus.eligible', '==', true));
          constraints.push(where('whatsappStatus.added', '==', false));
        } else if (waFilter === 'not_eligible') {
          constraints.push(where('whatsappStatus.eligible', '==', false));
        }
      }

      // dateFilter
      if (dateFilter.start) {
        constraints.push(where('bookingDate', '>=', dateFilter.start));
      }
      if (dateFilter.end) {
        constraints.push(where('bookingDate', '<=', dateFilter.end));
      }

      // Initial Fetch
      if (!isLoadMore) {
        const [count, paginated, g, crs, d, o, br, prm] = await Promise.all([
          genericGetCount('bookings', constraints),
          genericGetPaginated<Booking>('bookings', 10, null, constraints),
          genericGet<Group>('groups'),
          genericGet<Course>('catalog_courses'),
          genericGet<Diploma>('catalog_diplomas'),
          genericGet<Offer>('offers'),
          genericGet<Branch>('branches'),
          getPromoCodes()
        ]);
        
        console.log("Initial fetch results:", paginated.data.length);
        setTotalBookingsCount(count);
        // Filter out deleted items client-side if server query is broad
        const visibleData = paginated.data.filter(b => b.status !== 'DELETED' && !b.isDeleted);
        setBookings(sortBookingsNewestFirst(visibleData));
        setLastBookingDoc(paginated.lastDoc);
        setHasMoreBookings(paginated.data.length >= 10);
        
        setGroups(g);
        setCourses(crs);
        setDiplomas(d);
        setOffers(o);
        setBranches(br);
        setPromoCodes(prm);
      } else {
        // Load More
        const paginated = await genericGetPaginated<Booking>('bookings', 10, lastBookingDoc, constraints);
        console.log("Load more results:", paginated.data.length);
        const visibleData = paginated.data.filter(b => b.status !== 'DELETED' && !b.isDeleted);
        setBookings(prev => sortBookingsNewestFirst([...prev, ...visibleData]));
        setLastBookingDoc(paginated.lastDoc);
        setHasMoreBookings(paginated.data.length >= 10);
      }
      setIndexError(null);
    } catch (err: any) {
      console.error("Fetch data error:", err);
      if (err?.message?.includes('index')) {
        const indexUrl = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
        setIndexError(indexUrl ? `This query requires a Firestore index: ${indexUrl}` : "This query requires a Firestore index. Check console for link.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    // Trigger initial fetch on filter changes
    fetchData(false); 
  }, [salesFilter, typeFilter, groupFilter, dateFilter, waFilter, paymentFilter, debouncedSearch]); 

  // Handle Quick Action from Dashboard
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new' && hasPermission('createBookings')) {
      openNewBookingModal();
    }
  }, [location.search, hasPermission]);

  const openNewBookingModal = () => {
    setEditingBookingId(null);
    setPaymentPlanLocked(false);
    setCustomerData({ name: '', whatsapp: '', phone: '', email: '', countryCode: '+20', nationality: 'egyptian' });
    setCountrySearch('');
    setSelectedProductId('');
    setSelectedOfferId('');
    setSelectedSalesId('');
    setIsDeferred(false);
    setExtraDiscount(0);
    setExtraDiscountReason('');
    setIsScholarship(false);
    setScholarshipReason('');
    setDeposit(0);
    setTransactionRef('');
    setPromoCodeInput('');
    setAppliedPromoCodeObj(null);
    setPromoValidationError('');
    setReceiptLink('');
    setIsManualInstallments(false);
    setIsInternational(false);
    setInternationalCurrency('USD');
    setExchangeRate(48.5);
    setForeignCoursePrice(0);
    setForeignOfferPrice(0);
    setApplyForeignOffer(false);
    setForeignPaidAmount(0);
    setTaxPercent(14);
    setCommissionPercent(3);
    setInstallmentPlanType('none');
    setShowInstallmentPreview(false);
    setInstallmentCount(0);
    setFirstInstallmentDate('');
    setFirstInstallmentAmount('');
    setRescheduleEnabled(false);
    setRescheduleCount(0);
    setRescheduleFirstDate('');
    setRescheduleReason('');
    setPaymentFilter('all');
    setValidationErrors({});
    setSaveError(null);
    setModalOpen(true);
  };

  const filteredBookings = useMemo(() => {
    // Optimization: Create maps for faster lookups
    const customerMap = new Map<string, Customer>(customers.map(c => [c.id, c]));
    const groupMap = new Map<string, Group>(groups.map(g => [g.id, g]));
    const searchStr = searchQuery.toLowerCase().trim();

    let list = bookings;
    
    // Client-side search (fallback/augmentation)
    if (searchStr) {
      list = list.filter(b => {
        const cust = customerMap.get(b.customerId);
        const grp = groupMap.get(b.groupId || '');
        
        return (cust?.name?.toLowerCase().includes(searchStr) || false) || 
               (cust?.whatsapp?.includes(searchStr) || false) || 
               (cust?.fullWhatsapp?.includes(searchStr) || false) ||
               (grp?.groupCode?.toLowerCase().includes(searchStr) || false) ||
               (grp?.productName?.toLowerCase().includes(searchStr) || false) ||
               (b.id.toLowerCase().includes(searchStr));
      });
    }

    // Secondary client-side filters (in case server queries are slightly broader or results are still loading)
    if (typeFilter !== 'all') {
      list = list.filter(b => b.bookingType === (typeFilter === 'assigned' ? 'assigned' : 'deferred'));
    }

    if (groupFilter !== 'all') {
      list = list.filter(b => b.groupId === groupFilter);
    }

    if (dateFilter.start || dateFilter.end) {
      list = list.filter(b => {
        if (dateFilter.start && b.bookingDate < dateFilter.start) return false;
        if (dateFilter.end && b.bookingDate > dateFilter.end) return false;
        return true;
      });
    }

    if (waFilter !== 'all') {
      list = list.filter(b => {
        if (waFilter === 'added') return b.whatsappStatus?.added;
        if (waFilter === 'pending') return b.whatsappStatus?.eligible && !b.whatsappStatus?.added;
        if (waFilter === 'not_eligible') return !b.whatsappStatus?.eligible;
        return true;
      });
    }

    if (paymentFilter !== 'all') {
      list = list.filter(b => {
        if (paymentFilter === 'pending') return b.paymentSummary.remaining > 0;
        if (paymentFilter === 'paid') return b.paymentSummary.remaining <= 0;
        return true;
      });
    }

    if (salesFilter !== 'all') {
      list = list.filter(b => b.salesId === salesFilter);
    }

    if (internationalFilter !== 'all') {
      list = list.filter(b => {
        if (internationalFilter === 'international') return !!b.isInternational;
        if (internationalFilter === 'domestic') return !b.isInternational;
        return true;
      });
    }

    return sortBookingsNewestFirst(list);
  }, [bookings, customers, groups, searchQuery, waFilter, paymentFilter, typeFilter, groupFilter, dateFilter, salesFilter, internationalFilter, methodFilter]);

  const sortedGroupsForFilter = useMemo(() => {
    const sorted = [...groups].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const filtered = sorted.filter(g => {
      const search = groupSearch.toLowerCase();
      return g.groupCode?.toLowerCase().includes(search) || 
             g.productName?.toLowerCase().includes(search) ||
             g.scheduleLabel?.toLowerCase().includes(search);
    });

    const upcoming = filtered.filter(g => g.status === 'UPCOMING');
    const started = filtered.filter(g => g.status === 'STARTED');
    const finished = filtered.filter(g => g.status === 'FINISHED');

    return { upcoming, started, finished };
  }, [groups, groupSearch]);

  const handleExportReport = () => {
    if (filteredBookings.length === 0) return alert("No data to export");
    const reportData = filteredBookings.map((b, idx) => {
      const cust = customers.find(c => c.id === b.customerId);
      const grp = groups.find(g => g.id === b.groupId);
      const prod = [...courses, ...diplomas].find(p => p.id === (b.productId || grp?.productId));
      return {
        'No.': idx + 1,
        'Student Name': cust?.name || 'N/A',
        'WhatsApp': cust?.fullWhatsapp || 'N/A',
        'Booking Date': b.bookingDate,
        'Type': b.groupId ? 'Assigned' : 'Deferred',
        'Product': prod?.name || 'N/A',
        'Group / Schedule': grp?.scheduleLabel || (b.groupId ? 'Unknown Group' : 'Waiting Assignment'),
        ...(canViewRevenue ? {
          'Price': b.pricing.finalPriceSnapshot,
          'Paid': b.paymentSummary.paidTotal,
          'Remaining': b.paymentSummary.remaining,
        } : {}),
        'Sales Rep': b.salesName || 'N/A',
        'Status': b.status
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Bookings");
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Bookings_Report_${date}.xlsx`);
  };

  useEffect(() => {
    if (!editingBookingId && !firstInstallmentDate) {
        const targetGroup = groups.find(g => g.id === selectedGroupId);
        const baseDate = targetGroup ? new Date(targetGroup.startDate) : new Date(bookingDate);
        baseDate.setMonth(baseDate.getMonth() + 1);
        setFirstInstallmentDate(baseDate.toISOString().split('T')[0]);
    }
  }, [selectedGroupId, bookingDate, editingBookingId, groups, firstInstallmentDate]);

  const groupOccupancy = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach(b => {
      if (b.status === 'ACTIVE' && b.groupId && !b.isDeleted) {
        map[b.groupId] = (map[b.groupId] || 0) + 1;
      }
    });
    return map;
  }, [bookings]);

  const pricingDetails = useMemo(() => {
    const product = [...courses, ...diplomas].find(p => p.id === selectedProductId);
    const basePrice = product?.basePrice || 0;
    const offer = offers.find(o => o.id === selectedOfferId && o.productId === selectedProductId);
    const priceAfterOffer = offer ? offer.offerPrice : basePrice;
    const savings = offer ? basePrice - offer.offerPrice : 0;
    
    // Deduct promo code discount if applied
    const promoDiscount = appliedPromoCodeObj ? appliedPromoCodeObj.discountAmount : 0;

    let finalPrice = priceAfterOffer - extraDiscount - promoDiscount;
    if (isScholarship) finalPrice = 0;
    return { 
      basePrice, 
      offer, 
      savings, 
      extraDiscount: isScholarship ? 0 : extraDiscount, 
      promoDiscount,
      finalPrice: Math.max(0, finalPrice) 
    };
  }, [selectedProductId, selectedOfferId, offers, extraDiscount, isScholarship, courses, diplomas, appliedPromoCodeObj]);

  const generateAutoInstallments = () => {
    if (isInternational) {
      const effectivePrice = (applyForeignOffer && foreignOfferPrice > 0) ? foreignOfferPrice : foreignCoursePrice;
      const remainingForeign = Math.max(0, effectivePrice - foreignPaidAmount);
      if (remainingForeign <= 0) return [];

      const targetGroup = groups.find(g => g.id === selectedGroupId);
      const baseDate = targetGroup ? new Date(targetGroup.startDate) : new Date(bookingDate);
      // Due date for international remaining balance is at least 3 days before group start date
      baseDate.setDate(baseDate.getDate() - 3);
      const dueDateStr = baseDate.toISOString().split('T')[0];
      const remainingEgp = Math.round(remainingForeign * exchangeRate * 100) / 100;

      return [{
        dueDate: dueDateStr,
        amount: remainingEgp,
        status: 'pending',
        notifiedOnWhatsApp: false,
        label: `متبقي السداد الدولي (${remainingForeign} ${internationalCurrency})`
      }];
    }

    const totalRemaining = pricingDetails.finalPrice - deposit;
    if (totalRemaining <= 0) return [];

    const targetGroup = groups.find(g => g.id === selectedGroupId);
    const baseDate = targetGroup ? new Date(targetGroup.startDate) : new Date(bookingDate);
    // first installment date is 2 days before group start date
    baseDate.setDate(baseDate.getDate() - 2);
    const firstDateStr = baseDate.toISOString().split('T')[0];

    const list: Installment[] = [];

    // Rule: First installment completes 50% of total price
    const halfPrice = Math.round(pricingDetails.finalPrice / 2);
    let firstAmt = Math.max(0, halfPrice - deposit);

    // If no plan selected, just one installment for full remaining
    if (installmentPlanType === 'none') {
      list.push({ 
        dueDate: firstDateStr, 
        amount: totalRemaining, 
        status: 'pending', 
        notifiedOnWhatsApp: false, 
        label: 'Full Payment Before Start' 
      });
      return list;
    }

    let count = 0;
    let days = 0;

    if (installmentPlanType === '10_days') {
      count = installmentCount || 4;
      days = 10;
    } else if (installmentPlanType === '15_days') {
      count = installmentCount || 3;
      days = 15;
    } else if (installmentPlanType === '60_days') {
      count = installmentCount || 2;
      days = 30;
    }

    if (count > 0) {
      const remainingAfterFirst = totalRemaining - firstAmt;
      
      // Distribute the rest equally
      const restCount = count - 1;
      const perInstRest = restCount > 0 ? Math.floor(remainingAfterFirst / restCount) : 0;
      let distributedRest = 0;

      for (let i = 0; i < count; i++) {
        const d = new Date(firstDateStr);
        d.setDate(d.getDate() + (i * days));
        
        let amt = 0;
        if (i === 0) {
          amt = firstAmt;
        } else if (i === count - 1) {
          amt = remainingAfterFirst - distributedRest;
        } else {
          amt = perInstRest;
          distributedRest += perInstRest;
        }

        const inst: Installment = { 
          dueDate: d.toISOString().split('T')[0], 
          amount: amt, 
          status: 'pending', 
          notifiedOnWhatsApp: false
        };
        if (i === 0) inst.label = 'قسط استكمال البداية (50%)';
        list.push(inst);
      }
      return list;
    }
    
    return [];
  };

  useEffect(() => {
    if (!isManualInstallments) {
      setManualInstallments(generateAutoInstallments());
    }
  }, [
    pricingDetails.finalPrice, deposit, installmentPlanType, installmentCount, 
    isManualInstallments, selectedGroupId, bookingDate,
    isInternational, foreignCoursePrice, foreignOfferPrice, applyForeignOffer, foreignPaidAmount, exchangeRate, internationalCurrency
  ]);

  const handlePreviewInstallments = () => {
    setManualInstallments(generateAutoInstallments());
    setShowInstallmentPreview(true);
    setIsManualInstallments(false);
  };

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES;
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.includes(countrySearch));
  }, [countrySearch]);

  const handleWhatsappInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+') || (cleanDigits.length > 10 && (cleanDigits.startsWith('20') || cleanDigits.startsWith('966') || cleanDigits.startsWith('965') || cleanDigits.startsWith('971')))) {
      const cleaned = cleanLocalPhone(raw, customerData.countryCode);
      setCustomerData({
        ...customerData,
        whatsapp: cleaned.cleanLocal,
        countryCode: cleaned.countryCode,
        nationality: cleaned.nationality
      });
    } else {
      setCustomerData({ ...customerData, whatsapp: cleanDigits });
    }
  };

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+') || (cleanDigits.length > 10 && (cleanDigits.startsWith('20') || cleanDigits.startsWith('966') || cleanDigits.startsWith('965') || cleanDigits.startsWith('971')))) {
      const cleaned = cleanLocalPhone(raw, customerData.countryCode);
      setCustomerData({
        ...customerData,
        phone: cleaned.cleanLocal
      });
    } else {
      setCustomerData({ ...customerData, phone: cleanDigits });
    }
  };

  const getPricingWithPromo = (promoObj: PromoCode | null) => {
    const product = [...courses, ...diplomas].find(p => p.id === selectedProductId);
    const basePrice = product?.basePrice || 0;
    const offer = offers.find(o => o.id === selectedOfferId && o.productId === selectedProductId);
    const priceAfterOffer = offer ? offer.offerPrice : basePrice;
    const savings = offer ? basePrice - offer.offerPrice : 0;
    
    // Deduct promo code discount if applied
    const promoDiscount = promoObj ? promoObj.discountAmount : 0;

    let finalPrice = priceAfterOffer - extraDiscount - promoDiscount;
    if (isScholarship) finalPrice = 0;
    return { 
      basePrice, 
      offer, 
      savings, 
      extraDiscount: isScholarship ? 0 : extraDiscount, 
      promoDiscount,
      finalPrice: Math.max(0, finalPrice) 
    };
  };

  const validateForm = (currentPromoObj: PromoCode | null = appliedPromoCodeObj): boolean => {
    const errors: ValidationErrors = {};
    if (!customerData.name.trim()) errors.customerName = "Full Name is required";
    if (!customerData.whatsapp.trim()) errors.whatsapp = "WhatsApp number is required";
    else if (customerData.nationality === 'egyptian' && customerData.whatsapp.length !== 11) errors.whatsapp = "رقم الموبايل المصري يجب أن يكون 11 رقم";
    if (!selectedProductId) errors.productId = "Please select a product";
    if (!isDeferred && !selectedGroupId) errors.groupId = "Please select a group or mark as deferred";
    if (!selectedSalesId) errors.salesId = "Sales Representative is required";
    if (isScholarship && !scholarshipReason.trim()) errors.scholarshipReason = "Scholarship reason is required";
    if (!isScholarship && extraDiscount > 0 && !extraDiscountReason.trim()) errors.extraDiscountReason = "Reason for discount is required";
    
    const pricing = getPricingWithPromo(currentPromoObj);
    if (installmentPlanType !== 'none' || showInstallmentPreview) {
        const totalManual = manualInstallments.reduce((sum, i) => sum + i.amount, 0);
        const expectedRemaining = pricing.finalPrice - deposit;
        if (expectedRemaining > 0 && Math.abs(totalManual - expectedRemaining) > 1) errors.installments = `إجمالي مبالغ الأقساط (${totalManual.toLocaleString()}) يجب أن يساوي المتبقي (${expectedRemaining.toLocaleString()})`;
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      modalFormRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const handleStartBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    let currentPromo = appliedPromoCodeObj;
    if (promoCodeInput.trim() && !appliedPromoCodeObj) {
      const clean = promoCodeInput.trim().toUpperCase();
      const found = promoCodes.find(p => p.code === clean);
      if (!found) {
        setPromoValidationError(isRtl ? 'كود غير صحيح' : 'Invalid code');
        return;
      }
      const status = getPromoStatus(found);
      if (status === 'expired') {
        setPromoValidationError(isRtl ? 'هذا الكود منتهي أو معطل' : 'This code is expired/disabled');
        return;
      }
      if (status === 'scheduled') {
        setPromoValidationError(isRtl ? 'هذا الكود يبدأ صلاحيته لاحقاً' : 'This code is scheduled for later');
        return;
      }
      // Auto-apply this promo code!
      setAppliedPromoCodeObj(found);
      currentPromo = found;
    }

    if (!validateForm(currentPromo)) return;
    // Fix: Remove leading zeros from whatsapp for international full number
    const cleanWa = customerData.whatsapp.replace(/^0+/, '');
    const fullWhatsapp = `${customerData.countryCode.replace('+', '')}${cleanWa}`;
    setIsSaving(true);
    setSaveError(null);
    try {
        if (!editingBookingId) {
            const isDuplicate = await checkBookingDuplicate(customerData.whatsapp, isDeferred ? null : selectedGroupId);
            if (isDuplicate) {
                setSaveError("عفواً، هذا الطالب مسجل بالفعل في هذه المجموعة. لا يمكن تكرار الحجز لنفس الشخص في نفس الجروب.");
                setIsSaving(false);
                return;
            }

            // Revoke permission for sales to add new customers
            if (!hasPermission('manageCustomers')) {
              const existingCustomer = await findCustomerByWhatsApp(customerData.whatsapp);
              if (!existingCustomer) {
                setSaveError("عفواً، لا تملك صلاحية إضافة عميل جديد. يرجى التأكد من أن العميل مسجل مسبقاً أو التواصل مع الإدارة.");
                setIsSaving(false);
                return;
              }
            }
        }
        proceedWithSave(fullWhatsapp, currentPromo);
    } catch (err: any) {
        setSaveError(err.message || "An error occurred during verification.");
        setIsSaving(false);
    }
  };

  const proceedWithSave = async (fullWhatsapp: string, currentPromoObj: PromoCode | null = appliedPromoCodeObj) => {
    try {
      const pricing = getPricingWithPromo(currentPromoObj);
      const { basePrice, offer, savings, finalPrice } = pricing;
      const appliedPromoCode = currentPromoObj ? {
        code: currentPromoObj.code,
        discountAmount: currentPromoObj.discountAmount,
        reason: currentPromoObj.reason,
        assignedToId: currentPromoObj.assignedToId,
        assignedToName: currentPromoObj.assignedToName
      } : undefined;

      const salesMember = salesStaff.find(s => s.id === selectedSalesId);
      const salesName = salesMember?.fullName || 'Unknown';
      const productType = diplomas.find(d => d.id === selectedProductId) ? 'diploma' : 'course';
      const finalCustomerData = { name: customerData.name, whatsapp: customerData.whatsapp, countryCode: customerData.countryCode, fullWhatsapp: fullWhatsapp, phone: customerData.phone, email: customerData.email };

      // Calculate international details if enabled
      const effectiveForeignPrice = (applyForeignOffer && foreignOfferPrice > 0) ? foreignOfferPrice : foreignCoursePrice;
      const foreignDiscountAmount = applyForeignOffer ? Math.max(0, foreignCoursePrice - foreignOfferPrice) : 0;
      const netForeignPaid = foreignPaidAmount - (foreignPaidAmount * (taxPercent / 100)) - (foreignPaidAmount * (commissionPercent / 100));
      const calculatedEgpDeposit = isInternational ? Math.round(netForeignPaid * exchangeRate * 100) / 100 : deposit;
      const effectiveDeposit = isInternational ? calculatedEgpDeposit : deposit;

      const internationalDetails: InternationalDetails | undefined = isInternational ? {
        isInternational: true,
        currency: internationalCurrency,
        exchangeRate,
        originalPrice: foreignCoursePrice,
        finalPrice: effectiveForeignPrice,
        discountAmount: foreignDiscountAmount,
        paidAmount: foreignPaidAmount,
        remainingAmount: Math.max(0, effectiveForeignPrice - foreignPaidAmount),
        taxPercent,
        taxAmount: Math.round(foreignPaidAmount * (taxPercent / 100) * 100) / 100,
        commissionPercent,
        commissionAmount: Math.round(foreignPaidAmount * (commissionPercent / 100) * 100) / 100,
        netAmount: Math.round(netForeignPaid * 100) / 100,
        convertedEgpNet: calculatedEgpDeposit
      } : undefined;

      // Calculate pricing snapshots
      const finalPricing = isInternational ? {
        basePriceSnapshot: Math.round(foreignCoursePrice * exchangeRate * 100) / 100,
        appliedOffer: { isApplied: applyForeignOffer, offerId: '', offerReason: 'تسعير الحجز الدولي', offerPrice: Math.round(foreignOfferPrice * exchangeRate * 100) / 100 },
        appliedPromoCode: undefined,
        savingsSnapshot: Math.round(foreignDiscountAmount * exchangeRate * 100) / 100,
        extraDiscountSnapshot: 0,
        extraDiscountReason: '',
        isScholarship: false,
        scholarshipReason: '',
        finalPriceSnapshot: Math.round(effectiveForeignPrice * exchangeRate * 100) / 100
      } : {
        basePriceSnapshot: basePrice,
        appliedOffer: offer ? { isApplied: true, offerId: offer.id, offerReason: offer.reason, offerPrice: offer.offerPrice } : { isApplied: false, offerId: '', offerReason: '', offerPrice: 0 },
        appliedPromoCode,
        savingsSnapshot: savings,
        extraDiscountSnapshot: isScholarship ? 0 : extraDiscount,
        extraDiscountReason: isScholarship ? '' : extraDiscountReason,
        isScholarship,
        scholarshipReason: isScholarship ? scholarshipReason : '',
        finalPriceSnapshot: finalPrice
      };

      const finalPriceForSystem = finalPricing.finalPriceSnapshot;

      if (editingBookingId) {
        const bookingData: Partial<Booking> = {
          groupId: isDeferred ? null : selectedGroupId, bookingType: isDeferred ? 'deferred' : 'assigned', bookingDate, salesId: selectedSalesId, salesName, productId: selectedProductId, productType,
          receiptLink,
          isInternational,
          internationalDetails,
          pricing: finalPricing
        };
        
        // Alert if group changed and installments exist
        const originalBooking = bookings.find(b => b.id === editingBookingId);
        if (originalBooking && originalBooking.groupId !== (isDeferred ? null : selectedGroupId)) {
            if (window.confirm("لقد قمت بتغيير المجموعة. هل تريد ترحيل مواعيد الأقساط حسب موعد الجروب الجديد؟\n(ملاحظة: سيتم الحفاظ على نفس الفواصل الزمنية وعدد الأقساط المتبقية)")) {
                // Auto-reschedule logic
                const targetGroup = groups.find(g => g.id === selectedGroupId);
                if (targetGroup) {
                    const newStartDate = new Date(targetGroup.startDate);
                    newStartDate.setDate(newStartDate.getDate() - 2);
                    const newStartDateStr = newStartDate.toISOString().split('T')[0];
                    
                    const plan = await genericGetDoc<InstallmentPlan>('installment_plans', editingBookingId);
                    if (plan) {
                        const pendingCount = plan.installments.filter(i => i.status === 'pending' || i.status === 'delayed').length;
                        if (pendingCount > 0) {
                            setRescheduleEnabled(true);
                            setRescheduleCount(pendingCount);
                            setRescheduleFirstDate(newStartDateStr);
                            setRescheduleReason('ترحيل تلقائي للمواعيد لتغير موعد الجروب');
                        }
                    }
                }
            }
        }

        await updateBooking(
          editingBookingId, 
          bookingData, 
          finalCustomerData as any, 
          { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' },
          effectiveDeposit,
          isInternational ? 'paypal' : paymentMethod,
          transactionRef
        );

        // Update the installment plan if rescheduling is not explicitly enabled
        if (!rescheduleEnabled) {
          const installments = manualInstallments;
          let planLabel = isInternational ? "سداد حجز دولي (استكمال المتبقي قبل الكورس بـ 3 أيام)" : "Full Payment Before Start Date";
          if (!isInternational) {
            if (installmentPlanType === '10_days') planLabel = `النظام الأول (كل ١٠ ايام) ${installmentCount} أقساط`;
            else if (installmentPlanType === '15_days') planLabel = `النظام الثاني (كل ١٥ يوم) ${installmentCount} أقساط`;
            else if (installmentPlanType === '60_days') planLabel = `النظام الثالث (٦٠ يوم) ${installmentCount} أقساط`;
            if (isManualInstallments) planLabel = "Modified Manually";
          }

          await updateBookingInstallmentPlan(editingBookingId, {
            deposit: effectiveDeposit,
            installments,
            planType: isInternational ? 'none' : installmentPlanType,
            planLabel
          });
        } else if (rescheduleCount > 0) {
          await rescheduleRemainingInstallments(
            editingBookingId, 
            rescheduleCount, 
            rescheduleFirstDate, 
            rescheduleReason || 'Rescheduled during edit',
            rescheduleManual ? rescheduleList : undefined
          );
        }
      } else {
        const installments = manualInstallments;
        let planLabel = isInternational ? "سداد حجز دولي (استكمال المتبقي قبل الكورس بـ 3 أيام)" : "Full Payment Before Start Date";
        if (!isInternational) {
          if (installmentPlanType === '10_days') planLabel = `النظام الأول (كل ١٠ ايام) ${installmentCount} أقساط`;
          else if (installmentPlanType === '15_days') planLabel = `النظام الثاني (كل ١٥ يوم) ${installmentCount} أقساط`;
          else if (installmentPlanType === '60_days') planLabel = `النظام الثالث (٦٠ يوم) ${installmentCount} أقساط`;
          if (isManualInstallments) planLabel = "Modified Manually";
        }

        const bookingData: Omit<Booking, 'id'> = {
          customerId: '', groupId: isDeferred ? null : selectedGroupId, productId: selectedProductId, productType, bookingType: isDeferred ? 'deferred' : 'assigned', bookingDate, status: 'ACTIVE', salesId: selectedSalesId, salesName,
          receiptLink,
          isInternational,
          internationalDetails,
          pricing: finalPricing,
          paymentSummary: { paidTotal: effectiveDeposit, remaining: Math.max(0, finalPriceForSystem - effectiveDeposit), next_due_date: installments[0]?.dueDate || null },
          whatsappStatus: { eligible: (finalPriceForSystem - effectiveDeposit) <= (finalPriceForSystem * 0.5), added: false }
        };
        const initialPayment = effectiveDeposit > 0 ? { amount: effectiveDeposit, method: isInternational ? 'paypal' : paymentMethod, transactionRef, paymentDate: bookingDate, groupId: isDeferred ? null : selectedGroupId, note: isInternational ? `Initial Deposit (International: ${foreignPaidAmount} ${internationalCurrency})` : 'Initial Deposit', createdByUid: userProfile?.uid || '' } : undefined;
        await createBooking(bookingData as any, finalCustomerData as any, { deposit: effectiveDeposit, installments, planType: isInternational ? 'none' : installmentPlanType, planLabel }, initialPayment as any, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' });
      }
      setModalOpen(false); setEditingBookingId(null); fetchData();
    } catch (err: any) { setSaveError(err.message || "An unexpected error occurred while saving the booking."); } finally { setIsSaving(false); }
  };

  const handleEditBooking = async (booking: Booking) => {
    if (booking.status === 'REFUNDED') return alert("Refunded bookings cannot be edited.");
    setEditingBookingId(booking.id);
    setActiveActionBooking(booking);
    const cust = customers.find(c => c.id === booking.customerId);
    
    // Retrieve payments to decide if payment plan is locked and to get deposit info
    const payments = await getBookingPayments(booking.id);
    const otherPayments = payments.filter(p => p.note !== 'Initial Deposit' && p.note !== 'الدفع المبدئي');
    const hasOtherPayments = otherPayments.length > 0;
    setPaymentPlanLocked(hasOtherPayments);

    const targetCc = cust?.countryCode || '+20';
    const waCleaned = cleanLocalPhone(cust?.whatsapp || '', targetCc);
    const phoneCleaned = cleanLocalPhone(cust?.phone || '', waCleaned.countryCode || targetCc);

    setCustomerData({ 
      name: cust?.name || '', 
      whatsapp: waCleaned.cleanLocal, 
      phone: phoneCleaned.cleanLocal, 
      email: cust?.email || '', 
      countryCode: waCleaned.countryCode, 
      nationality: waCleaned.nationality 
    });

    let pId = booking.productId || '';
    if (!pId && booking.groupId) {
      const grp = groups.find(g => g.id === booking.groupId);
      if (grp) pId = grp.productId;
    }
    setSelectedProductId(pId); 

    setSelectedOfferId(booking.pricing.appliedOffer?.offerId || ''); 
    setSelectedGroupId(booking.groupId || ''); 
    setIsDeferred(booking.bookingType === 'deferred'); 
    setSelectedSalesId(booking.salesId || ''); 
    setExtraDiscount(booking.pricing.extraDiscountSnapshot || 0); 
    setExtraDiscountReason(booking.pricing.extraDiscountReason || ''); 
    setIsScholarship(booking.pricing.isScholarship || false); 
    setScholarshipReason(booking.pricing.scholarshipReason || ''); 
    setBookingDate(booking.bookingDate || ''); 
    setReceiptLink(booking.receiptLink || '');

    if (booking.isInternational && booking.internationalDetails) {
      const intl = booking.internationalDetails;
      setIsInternational(true);
      setInternationalCurrency(intl.currency || 'USD');
      setExchangeRate(intl.exchangeRate || 48.5);
      setForeignCoursePrice(intl.originalPrice || 0);
      setForeignOfferPrice(intl.finalPrice || (intl.originalPrice - (intl.discountAmount || 0)));
      setApplyForeignOffer((intl.discountAmount || 0) > 0 || (intl.finalPrice > 0 && intl.finalPrice < intl.originalPrice));
      setForeignPaidAmount(intl.paidAmount || 0);
      setTaxPercent(intl.taxPercent ?? 14);
      setCommissionPercent(intl.commissionPercent ?? 3);
    } else {
      setIsInternational(false);
      setForeignCoursePrice(0);
      setForeignOfferPrice(0);
      setApplyForeignOffer(false);
      setForeignPaidAmount(0);
    }

    if (booking.pricing.appliedPromoCode) {
      setPromoCodeInput(booking.pricing.appliedPromoCode.code);
      setAppliedPromoCodeObj({
        id: booking.pricing.appliedPromoCode.code,
        code: booking.pricing.appliedPromoCode.code,
        discountAmount: booking.pricing.appliedPromoCode.discountAmount,
        reason: booking.pricing.appliedPromoCode.reason,
        assignedToId: booking.pricing.appliedPromoCode.assignedToId,
        assignedToName: booking.pricing.appliedPromoCode.assignedToName,
      } as any);
    } else {
      setPromoCodeInput('');
      setAppliedPromoCodeObj(null);
    }
    setPromoValidationError('');

    // Retrieve initial deposit details from payments
    const initialDepositPay = payments.find(p => p.note === 'Initial Deposit' || p.note === 'الدفع المبدئي');
    if (initialDepositPay) {
      setDeposit(initialDepositPay.amount || 0);
      setPaymentMethod(initialDepositPay.method || 'cash_office');
      setTransactionRef(initialDepositPay.transactionRef || '');
    } else {
      const sortedPayments = [...payments].sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));
      if (sortedPayments.length > 0) {
        setDeposit(sortedPayments[0].amount || 0);
        setPaymentMethod(sortedPayments[0].method || 'cash_office');
        setTransactionRef(sortedPayments[0].transactionRef || '');
      } else {
        setDeposit(0);
        setPaymentMethod('cash_office');
        setTransactionRef('');
      }
    }

    // Load current installment plan
    try {
      const plan = await genericGetDoc<InstallmentPlan>('installment_plans', booking.id);
      if (plan) {
        setInstallmentPlanType((plan.planType || 'none') as any);
        setInstallmentCount(plan.installments?.length || 0);
        const isManual = plan.planType === 'manual' || plan.planType === 'manual_modified';
        setIsManualInstallments(isManual);
        setManualInstallments(plan.installments || []);
        setShowInstallmentPreview(plan.installments && plan.installments.length > 0);
      } else {
        setInstallmentPlanType('none');
        setInstallmentCount(0);
        setIsManualInstallments(false);
        setManualInstallments([]);
        setShowInstallmentPreview(false);
      }
    } catch (e) {
      console.error("Error fetching installment plan during edit:", e);
      setInstallmentPlanType('none');
      setInstallmentCount(0);
      setIsManualInstallments(false);
      setManualInstallments([]);
      setShowInstallmentPreview(false);
    }

    setSaveError(null); 
    setModalOpen(true);
  };

  useEffect(() => {
    if (!rescheduleManual && rescheduleCount > 0 && rescheduleFirstDate && activeActionBooking) {
      const remainingAmount = activeActionBooking.paymentSummary.remaining;
      if (remainingAmount <= 0) {
        setRescheduleList([]);
        return;
      }
      const perInst = remainingAmount / rescheduleCount;
      const list: Installment[] = [];
      for (let i = 0; i < rescheduleCount; i++) {
        const d = new Date(rescheduleFirstDate);
        d.setDate(d.getDate() + (i * rescheduleInterval));
        list.push({ dueDate: d.toISOString().split('T')[0], amount: perInst, status: 'pending', notifiedOnWhatsApp: false });
      }
      setRescheduleList(list);
    }
  }, [rescheduleCount, rescheduleFirstDate, rescheduleInterval, rescheduleManual, activeActionBooking]);

  const handleManualInstallmentChange = (index: number, field: 'dueDate' | 'amount', value: any) => {
    const newList = [...manualInstallments];
    if (newList[index]) {
      newList[index] = { ...newList[index], [field]: field === 'amount' ? Number(value) : value };
      setManualInstallments(newList);
    }
  };

  const handleRescheduleListChange = (index: number, field: 'dueDate' | 'amount', value: any) => {
    const newList = [...rescheduleList];
    if (newList[index]) {
      newList[index] = { ...newList[index], [field]: field === 'amount' ? Number(value) : value };
      setRescheduleList(newList);
    }
  };

  const handleAssignGroup = async () => {
    if (!activeActionBooking || !selectedAssignGroupId) return;
    setIsSaving(true);
    try { 
      await assignGroupToBooking(activeActionBooking.id, selectedAssignGroupId, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' }); 
      setAssignModalOpen(false); 
      setSelectedAssignGroupId(''); 
      fetchData(); 
    } catch (err: any) { 
      alert("Assignment Error: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleDeactivate = async () => {
    if (!activeActionBooking) return;
    if (!deactivationData.reason.trim()) return alert(t('deactivatedReason') + " is required");
    await deactivateBooking(activeActionBooking.id, deactivationData.reason, userProfile?.uid || '', deactivationData.refundEligible, deactivationData.eligibilityReason, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' });
    setDeactivateModalOpen(false); fetchData();
  };

  const handleRefund = async () => {
    if (!activeActionBooking) return;
    const paidTotal = activeActionBooking.paymentSummary.paidTotal || 0;
    if (refundData.amount <= 0 || refundData.amount > paidTotal + 1) return alert(`Invalid refund amount. (Max: ${paidTotal})`);
    if (!refundData.reason.trim()) return alert(t('refundReason') + " is required");
    
    setIsSaving(true);
    try { 
      await issueRefund({ 
        bookingId: activeActionBooking.id, 
        customerId: activeActionBooking.customerId, 
        groupId: activeActionBooking.groupId, 
        refundAmount: refundData.amount, 
        refundDate: new Date().toISOString().split('T')[0], 
        method: refundData.method, 
        transactionRef: refundData.ref, 
        reason: refundData.reason, 
        createdByUid: userProfile?.uid || '' 
      }, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' }); 
      setRefundModalOpen(false); 
      setRefundData({ amount: 0, reason: '', method: 'cash_office', ref: '' });
      fetchData(); 
    } catch (err: any) { 
      alert("Refund Error: " + err.message); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompletion = async () => {
    if (!activeActionBooking) return;
    if (completionData.amount <= 0) return alert("Amount must be > 0.");
    
    if (completionMode === 'collect') {
      if (completionData.amount > activeActionBooking.paymentSummary.remaining + 1) return alert("Completion exceeds balance.");
    } else {
      if (completionData.amount > activeActionBooking.paymentSummary.paidTotal) return alert("Withdrawal exceeds paid total.");
    }
    
    setIsSaving(true);
    try {
      if (completionMode === 'collect') {
        await addCompletionPayment({
          bookingId: activeActionBooking.id,
          customerId: activeActionBooking.customerId,
          groupId: activeActionBooking.groupId,
          amount: completionData.amount,
          paymentDate: new Date().toISOString().split('T')[0],
          method: completionData.method,
          transactionRef: completionData.ref,
          receiptLink: completionData.receiptLink,
          note: completionData.note || 'Completion',
          createdByUid: userProfile?.uid || '',
          customInstallments: completionInstallments
        }, { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' });
      } else {
        await withdrawAmount(
          activeActionBooking.id,
          completionData.amount,
          completionData.method,
          completionData.ref,
          completionData.note || 'Withdrawal',
          completionInstallments,
          { name: userProfile?.displayName || 'Unknown', email: userProfile?.email || 'Unknown' }
        );
      }
      setCompletionModalOpen(false);
      setCompletionData({ amount: 0, method: 'cash_office', ref: '', note: '', receiptLink: '' });
      setCompletionInstallments([]);
      fetchData();
    } catch (err: any) {
      alert(`${completionMode === 'collect' ? 'Completion' : 'Withdrawal'} Error: ` + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const updateCompletionSchedule = async () => {
      if (!isCompletionModalOpen || !activeActionBooking) return;
      
      try {
        const plan = await genericGetDoc<InstallmentPlan>('installment_plans', activeActionBooking.id);
        if (!plan || !plan.installments) return;

        const currentInstallments = plan.installments;
        const amount = completionMode === 'collect' ? completionData.amount : -completionData.amount;
        const newPaidTotal = (activeActionBooking.paymentSummary.paidTotal || 0) + amount;
        const newRemaining = Math.max(0, activeActionBooking.pricing.finalPriceSnapshot - newPaidTotal);

        const pendingIndices = currentInstallments
          .map((inst, idx) => (inst.status === 'pending' || inst.status === 'delayed') ? idx : -1)
          .filter(idx => idx !== -1);

        if (pendingIndices.length > 0) {
          const firstPendingIdx = pendingIndices[0];
          const firstPendingAmt = currentInstallments[firstPendingIdx].amount;
          
          const remainingAfterFirst = Math.max(0, newRemaining - firstPendingAmt);
          const otherPendingIndices = pendingIndices.slice(1);
          const count = otherPendingIndices.length;
          
          if (count > 0) {
            const baseAmount = Math.floor(remainingAfterFirst / count);
            const remainder = remainingAfterFirst % count;

            const updated = currentInstallments.map((inst, idx) => {
              if (idx === firstPendingIdx) {
                return { ...inst, label: inst.label || 'قسط استكمال البداية' };
              }
              const otherIdx = otherPendingIndices.indexOf(idx);
              if (otherIdx !== -1) {
                const isLast = otherIdx === count - 1;
                return { ...inst, amount: isLast ? baseAmount + remainder : baseAmount };
              }
              return inst;
            });
            setCompletionInstallments(updated);
          } else {
            // Only one pending installment, it takes the whole remaining balance
            const updated = currentInstallments.map((inst, idx) => {
              if (idx === firstPendingIdx) {
                return { ...inst, amount: newRemaining, label: inst.label || 'قسط استكمال البداية' };
              }
              return inst;
            });
            setCompletionInstallments(updated);
          }
        }
      } catch (err) {
        console.error("Error updating completion schedule:", err);
      }
    };

    updateCompletionSchedule();
  }, [isCompletionModalOpen, completionData.amount, activeActionBooking, completionMode]);

  const handleCompletionInstallmentChange = (index: number, field: 'dueDate' | 'amount', value: any) => {
    const newList = [...completionInstallments];
    if (newList[index]) {
      newList[index] = { ...newList[index], [field]: field === 'amount' ? Number(value) : value };
      setCompletionInstallments(newList);
    }
  };

  const handleViewHistory = (booking: Booking) => {
    setActiveActionBooking(booking);
    setHistoryModalOpen(true);
  };

  const toggleWaAdded = async (booking: Booking) => {
    if (!booking.whatsappStatus?.eligible) return;
    await updateWhatsAppStatus(booking.id, !booking.whatsappStatus.added); fetchData();
  };

  const handleExportPDF = async (booking: Booking) => {
    const cust = customers.find(c => c.id === booking.customerId);
    const grp = groups.find(g => g.id === booking.groupId);
    let prod = [...courses, ...diplomas].find(p => p.id === booking.productId);
    if (!prod && grp) prod = [...courses, ...diplomas].find(p => p.id === grp.productId);
    
    // Fetch installment plan
    let plan: InstallmentPlan | null = null;
    try {
      plan = await genericGetDoc<InstallmentPlan>('installment_plans', booking.id);
    } catch (e) {
      console.warn("No installment plan found for this booking.");
    }

    // Fetch payments to find the deposit method
    let payments: Payment[] = [];
    try {
      const allPayments = await genericGet<Payment>('payments');
      payments = allPayments.filter(p => p.bookingId === booking.id && !p.isDeleted);
    } catch (e) {
      console.error("Error fetching payments for PDF:", e);
    }

    const firstPayment = payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))[0];
    const depositMethod = firstPayment?.method || 'cash_office';
    
    const paymentMethodLabelsAr: Record<string, string> = {
      cash_office: 'نقدي (مقر الأكاديمية)',
      instapay: 'انستا باي (InstaPay)',
      vodafone_cash: 'فودافون كاش (Vodafone Cash)',
      etisalat_cash: 'اتصالات كاش (Etisalat Cash)',
      bank_transfer: 'تحويل بنكي',
      fawry: 'فوري',
      other: 'وسائل دفع أخرى'
    };

    const invoiceId = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issueDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ');
    
    // Determine location/branch
    let branchName = 'غير محدد';
    if (grp) {
      if (grp.isOnline) {
        branchName = 'اون لاين (محاضرات مسجلة وتفاعلية)';
      } else if (grp.branchId) {
        const br = branches.find(b => b.id === grp.branchId);
        branchName = br?.name || 'مقر الأكاديمية';
      }
    } else if (booking.bookingType === 'deferred') {
      branchName = 'سيتم تحديده عند التسكين';
    }

    // Create container for PDF content
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = "'Cairo', 'Arial', sans-serif";
    container.style.direction = 'rtl';
    container.style.padding = '0';
    
    container.innerHTML = `
      <div style="width: 100%; min-height: 1120px; background: white; display: flex; flex-direction: column; position: relative;">
        <!-- Header with Gradient -->
        <div style="background: linear-gradient(135deg, #000 0%, #FF5A00 100%); padding: 60px 40px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
          <div style="min-width: 280px;">
            <div style="font-size: 34px; font-weight: 900; margin-bottom: 25px; white-space: nowrap;">إيصال سداد حجز</div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 700; width: 300px; margin: 0 auto;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                <span style="color: rgba(255,255,255,0.7);">رقم الفاتورة</span>
                <span style="color: #FF5A00; direction: ltr;">${invoiceId}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                <span style="color: rgba(255,255,255,0.7);">تاريخ الإصدار</span>
                <span style="direction: ltr;">${issueDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: rgba(255,255,255,0.7);">رقم الحجز</span>
                <span style="color: #FF5A00; direction: ltr;">BK-${booking.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 40px 50px;">
          <!-- Customer & Course Info -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-bottom: 40px;">
            <!-- Customer Info (Right) -->
            <div style="direction: rtl;">
              <div style="display: flex; align-items: center; gap: 10px; color: #FF5A00; font-size: 18px; font-weight: 900; margin-bottom: 20px;">
                <i class="fas fa-user-circle"></i>
                <span>بيانات العميل</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px; color: #333;">
                <div style="display: flex; gap: 10px;"><span style="color: #999; width: 80px;">الاسم :</span> <span style="font-weight: 800;">${cust?.name}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #999; width: 80px;">رقم الهاتف :</span> <span style="font-weight: 800; direction: ltr;">${cust?.countryCode} ${cust?.whatsapp}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #999; width: 80px;">البريد الإلكتروني :</span> <span style="font-weight: 800;">${cust?.email || '-'}</span></div>
              </div>
            </div>
            <!-- Course Info (Left) -->
            <div style="direction: rtl;">
              <div style="display: flex; align-items: center; gap: 10px; color: #FF5A00; font-size: 18px; font-weight: 900; margin-bottom: 20px;">
                <i class="fas fa-book-open"></i>
                <span>بيانات الدورة</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px; color: #333;">
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">اسم الدورة :</span> <span style="font-weight: 800;">${prod?.name || 'غير محدد'} ${prod?.type === 'diploma' ? '(دبلومة)' : '(كورس)'}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">الفرع / الموقع :</span> <span style="font-weight: 800; color: #1e40af;">${branchName}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">المجموعة :</span> <span style="font-weight: 800;">${
                  grp ? (() => {
                    const label = grp.scheduleLabel || '';
                    const parts = label.split(' — ');
                    const days = parts[0] || '';
                    const time = parts[1] || '';
                    const codeLabel = grp.groupCode ? `[${grp.groupCode}] ` : '';
                    return `${codeLabel}${days} — ${grp.startDate} — ${time}`;
                  })() : 'حجز مؤجل'
                }</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">تاريخ البداية :</span> <span style="font-weight: 800; direction: ltr;">${grp?.startDate || 'سيحدد لاحقاً'}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">تاريخ التسجيل :</span> <span style="font-weight: 800; direction: ltr;">${booking.bookingDate.split('-').reverse().join(' / ')}</span></div>
                <div style="display: flex; gap: 10px;"><span style="color: #FF7A00; width: 80px;">مدة الدورة :</span> <span style="font-weight: 800;">3 شهور (تقريبي)</span></div>
              </div>
            </div>
          </div>

          <!-- Pricing Breakdown -->
          <div style="border: 1px solid #eee; border-radius: 20px; padding: 25px; background: #fafafa; margin-bottom: 30px; direction: rtl;">
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 16px; margin-bottom: 20px; color: #333;">
              <i class="fas fa-receipt" style="color: #FF5A00;"></i>
              <span>${booking.isInternational && booking.internationalDetails ? `تفاصيل الرسوم والتحويل الدولي (${booking.internationalDetails.currency})` : 'تفاصيل الرسوم والخصومات'}</span>
            </div>
            ${booking.isInternational && booking.internationalDetails ? (() => {
              const intl = booking.internationalDetails;
              const curr = intl.currency || 'USD';
              return `
              <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px;">
                <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                  <span style="color: #666; font-weight: 700;">سعر الدورة الأصلي بالـ (${curr}):</span>
                  <span style="font-weight: 900; color: #000;">${intl.originalPrice} ${curr}</span>
                </div>
                ${intl.discountAmount > 0 ? `
                <div style="display: flex; justify-content: space-between; color: #059669; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                  <span style="font-weight: 700;">الخصم المطبق:</span>
                  <span style="font-weight: 900;">- ${intl.discountAmount} ${curr}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; color: #1d4ed8; background: #eff6ff; padding: 12px; border-radius: 12px; border: 1px solid #bfdbfe;">
                  <span>إجمالي سعر الدورة بالـ (${curr}):</span>
                  <span>${intl.finalPrice} ${curr}</span>
                </div>

                <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee; margin-top: 5px;">
                  <span style="color: #666; font-weight: 700;">المبلغ المحول بالـ (${curr}):</span>
                  <span style="font-weight: 900; color: #166534;">${intl.paidAmount} ${curr}</span>
                </div>
                ${intl.taxAmount > 0 ? `
                <div style="display: flex; justify-content: space-between; color: #dc2626; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                  <span style="font-weight: 700;">خصم الضرائب (${intl.taxPercent}%):</span>
                  <span style="font-weight: 900;">- ${intl.taxAmount} ${curr}</span>
                </div>
                ` : ''}
                ${intl.commissionAmount > 0 ? `
                <div style="display: flex; justify-content: space-between; color: #d97706; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                  <span style="font-weight: 700;">خصم عمولة التحويل (${intl.commissionPercent}%):</span>
                  <span style="font-weight: 900;">- ${intl.commissionAmount} ${curr}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; color: #059669; background: #f0fdf4; padding: 12px; border-radius: 12px; border: 1px solid #bbf7d0;">
                  <span>الصافي المستلم بالـ (${curr}):</span>
                  <span>${intl.netAmount} ${curr}</span>
                </div>
              </div>
              `;
            })() : `
            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px;">
              <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="color: #666; font-weight: 700;">سعر الدورة الرسمي قبل الخصم:</span>
                <span style="font-weight: 900; color: #000;">${booking.pricing.basePriceSnapshot.toLocaleString()} EGP</span>
              </div>
              
              ${booking.pricing.appliedOffer?.isApplied ? `
              <div style="display: flex; justify-content: space-between; color: #059669; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="font-weight: 700;">العرض المطبق (${booking.pricing.appliedOffer.offerReason}):</span>
                <span style="font-weight: 900;">- ${(booking.pricing.basePriceSnapshot - (booking.pricing.appliedOffer.offerPrice || 0)).toLocaleString()} EGP</span>
              </div>
              ` : ''}
              
              ${booking.pricing.extraDiscountSnapshot > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #059669; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="font-weight: 700;">خصم إضافي (${booking.pricing.extraDiscountReason}):</span>
                <span style="font-weight: 900;">- ${booking.pricing.extraDiscountSnapshot.toLocaleString()} EGP</span>
              </div>
              ` : ''}

              ${booking.pricing.appliedPromoCode ? `
              <div style="display: flex; justify-content: space-between; color: #4f46e5; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                <span style="font-weight: 700;">كود الخصم المطبق (${booking.pricing.appliedPromoCode.code}):</span>
                <span style="font-weight: 900;">- ${booking.pricing.appliedPromoCode.discountAmount.toLocaleString()} EGP</span>
              </div>
              ` : ''}

              ${booking.pricing.isScholarship ? `
              <div style="display: flex; justify-content: space-between; color: #2563eb; font-weight: 900; background: #eff6ff; padding: 10px; border-radius: 10px;">
                <span>منحة دراسية معتمدة:</span>
                <span>بخصم 100% (مجاني)</span>
              </div>
              ` : `
              <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; color: #FF5A00; background: #fff; padding: 15px; border-radius: 15px; border: 1px solid #FF5A00; margin-top: 5px;">
                <span>إجمالي سعر الدورة النهائي:</span>
                <span>${booking.pricing.finalPriceSnapshot.toLocaleString()} EGP</span>
              </div>

              <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; color: #1e3a8a; background: #eff6ff; padding: 12px 15px; border-radius: 12px; border: 1px solid #bfdbfe; margin-top: 10px;">
                <span>الدفعة الأولى (مقدم الحجز المدفوع):</span>
                <span>${(plan?.deposit || 0).toLocaleString()} EGP</span>
              </div>
              `}
            </div>
            `}
          </div>

          <!-- Payment Summary Cards -->
          <div style="border: 1px solid #eee; border-radius: 20px; padding: 25px; background: #fff; margin-bottom: 30px;">
            <div style="display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 16px; margin-bottom: 20px;">
              <i class="fas fa-credit-card" style="color: #FF5A00;"></i>
              <span>موقف السداد الحالي</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
              <div style="border: 1px solid #eee; border-radius: 15px; padding: 15px; display: flex; align-items: center; gap: 12px; background: #f0fdf4; border-color: #bbf7d0;">
                <div style="background: #fff; width: 35px; height: 35px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #16a34a; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><i class="fas fa-check-circle"></i></div>
                <div>
                  <div style="font-size: 10px; color: #166534; font-weight: 800;">إجمالي المدفوع حتى الآن</div>
                  <div style="font-size: 18px; font-weight: 900; color: #166534;">
                    ${booking.isInternational && booking.internationalDetails 
                      ? `${booking.internationalDetails.paidAmount} ${booking.internationalDetails.currency}`
                      : `${booking.paymentSummary.paidTotal.toLocaleString()} EGP`}
                  </div>
                </div>
              </div>
              <div style="border: 1px solid #eee; border-radius: 15px; padding: 15px; display: flex; align-items: center; gap: 12px; background: #fef2f2; border-color: #fecaca;">
                <div style="background: #fff; width: 35px; height: 35px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #dc2626; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><i class="fas fa-exclamation-triangle"></i></div>
                <div>
                  <div style="font-size: 10px; color: #991b1b; font-weight: 800;">المبلغ المتبقي</div>
                  <div style="font-size: 18px; font-weight: 900; color: #dc2626;">
                    ${booking.isInternational && booking.internationalDetails 
                      ? `${booking.internationalDetails.remainingAmount} ${booking.internationalDetails.currency}`
                      : `${booking.paymentSummary.remaining.toLocaleString()} EGP`}
                  </div>
                </div>
              </div>
              <div style="border: 1px solid #eee; border-radius: 15px; padding: 15px; display: flex; align-items: center; gap: 12px; background: #f8fafc; border-color: #e2e8f0;">
                <div style="background: #fff; width: 35px; height: 35px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #64748b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"><i class="fas fa-wallet"></i></div>
                <div>
                  <div style="font-size: 10px; color: #475569; font-weight: 800;">وسيلة دفع الحجز</div>
                  <div style="font-size: 13px; font-weight: 900; color: #1e293b;">
                    ${booking.isInternational ? 'PayPal (باي بال)' : (paymentMethodLabelsAr[depositMethod] || depositMethod)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Installment Bar & Table -->
          ${booking.isInternational ? `
          <div style="background: #0f172a; border-radius: 12px; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; color: white; margin-bottom: 2px;">
             <div style="font-size: 14px; font-weight: 800; font-family: 'Montserrat', sans-serif;">
               <span style="color: #FF5A00;">International Payment Policy:</span> 
               <span style="color: #fff;">Full balance due at least 3 days before course start date</span>
             </div>
             <div style="display: flex; align-items: center; gap: 10px;">
               <span style="font-size: 16px; font-weight: 900;">سداد الحجز الدولي</span>
               <i class="fas fa-globe" style="color: #38bdf8; font-size: 20px;"></i>
             </div>
          </div>
          <div style="text-align: center; font-size: 11px; font-weight: 800; color: #666; margin-bottom: 15px;">* الحجوزات الخارجية لا تخضع لنظام الأقساط. يلزم استكمال المتبقي قبل بداية الكورس بـ 3 أيام كحد أقصى.</div>

          ${plan?.installments && plan.installments.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; border-radius: 15px; overflow: hidden; margin-bottom: 10px; border: 1px solid #eee; direction: rtl;">
            <thead style="background: #0f172a; color: white; font-size: 13px;">
              <tr>
                <th style="padding: 12px; text-align: center;">بيان السداد</th>
                <th style="padding: 12px; text-align: center;">آخر موعد للاستكمال</th>
                <th style="padding: 12px; text-align: center;">المبلغ المتبقي بالعملة الأجنبية</th>
                <th style="padding: 12px; text-align: center;">حالة السداد</th>
              </tr>
            </thead>
            <tbody style="font-size: 14px; font-weight: 700;">
              ${plan.installments.map(inst => {
                const curr = booking.internationalDetails?.currency || 'USD';
                const remForeign = booking.internationalDetails?.remainingAmount || 0;
                const statusLabel = inst.status === 'paid' ? 'تم الدفع بالكامل' : 'قيد الانتظار';
                const statusColor = inst.status === 'paid' ? '#16a34a' : '#d97706';
                const statusBg = inst.status === 'paid' ? '#f0fdf4' : '#fffbeb';

                return `
                <tr style="border-bottom: 1px solid #eee; background: #fff;">
                  <td style="padding: 12px; text-align: center; font-weight: 800; color: #1e293b;">متبقي سداد رسوم الكورس</td>
                  <td style="padding: 12px; text-align: center; font-weight: 800; direction: ltr;">${inst.dueDate.split('-').reverse().join(' / ')} <span style="font-size: 10px; color: #dc2626; display: block;">(قبل الكورس بـ 3 أيام)</span></td>
                  <td style="padding: 12px; text-align: center; font-size: 16px; font-weight: 900; color: #dc2626;">${remForeign} ${curr}</td>
                  <td style="padding: 12px; text-align: center;">
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 900; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}33;">
                      ${statusLabel}
                    </span>
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ` : `
          <div style="text-align: center; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; color: #166534; font-weight: 800; font-size: 13px; margin-bottom: 15px; direction: rtl;">
            ✅ تم تسديد رسوم الحجز الدولي بالكامل. لا يوجد مبلغ متبقي.
          </div>
          `}
          ` : `
          <!-- Installment Bar -->
          <div style="background: #000; border-radius: 12px; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; color: white; margin-bottom: 2px;">
             <div style="font-size: 14px; font-weight: 800; font-family: 'Montserrat', sans-serif;">
               <span style="color: #FF5A00;">Installment Plan:</span> 
               <span style="color: #fff;">${
                 plan?.planType === '10_days' ? `Every 10 Days (${plan.installments.length} Installments)` :
                 plan?.planType === '15_days' ? `Every 15 Days (${plan.installments.length} Installments)` :
                 plan?.planType === '60_days' ? `Every 30 Days (${plan.installments.length} Installments)` :
                 plan?.planLabel || 'Custom Payment Plan'
               }</span>
             </div>
             <div style="display: flex; align-items: center; gap: 10px;">
               <span style="font-size: 16px; font-weight: 900;">نظام التقسيط</span>
               <i class="fas fa-calendar-alt" style="color: #FF5A00; font-size: 20px;"></i>
             </div>
          </div>
          <div style="text-align: center; font-size: 11px; font-weight: 800; color: #666; margin-bottom: 15px;">أول قسط قبل بداية الدورة بيومين (استكمال 50% من إجمالي سعر الدورة)</div>

          <!-- Installment Summary Info -->
          ${plan?.installments ? (() => {
            const paidCount = plan.installments.filter(i => i.status === 'paid').length;
            const totalCount = plan.installments.length;
            const paidValue = plan.installments.filter(i => i.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
            const remainingValue = plan.installments.filter(i => i.status !== 'paid').reduce((acc, curr) => acc + curr.amount, 0);
            
            return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #fdf2f2; border: 1px solid #fee2e2; padding: 12px 25px; border-radius: 12px; margin-bottom: 15px; direction: rtl;">
              <div style="display: flex; gap: 20px; font-size: 13px; font-weight: 800; color: #991b1b;">
                <span>تم سداد: <span style="color: #166534;">${paidCount}</span> من أصل <span style="color: #000;">${totalCount}</span> أقساط</span>
                <span>إجمالي المبلغ المتبقي بالأقساط: <span style="color: #dc2626;">${remainingValue.toLocaleString()} EGP</span></span>
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #666;">* يشمل المبلغ المتبقي جميع الأقساط غير المسددة</div>
            </div>
            `;
          })() : ''}

          <!-- Installment Table -->
          <table style="width: 100%; border-collapse: collapse; border-radius: 15px; overflow: hidden; margin-bottom: 10px; border: 1px solid #eee;">
            <thead style="background: #333; color: white; font-size: 13px;">
              <tr>
                <th style="padding: 15px; text-align: center; border-left: 1px solid #444;">رقم القسط</th>
                <th style="padding: 15px; text-align: center; border-left: 1px solid #444;">تاريخ الاستحقاق</th>
                <th style="padding: 15px; text-align: center; border-left: 1px solid #444;">قيمة القسط</th>
                <th style="padding: 15px; text-align: center; border-left: 1px solid #444;">حالة السداد</th>
                <th style="padding: 15px; text-align: center;">ملاحظات</th>
              </tr>
            </thead>
            <tbody style="font-size: 14px; font-weight: 700;">
              ${plan?.installments ? plan.installments.map((inst, idx) => {
                const statusLabel = 
                  inst.status === 'paid' ? 'تم الدفع' : 
                  inst.status === 'delayed' ? 'متأخر' : 
                  inst.status === 'cancelled' ? 'ملغي' : 'قيد الانتظار';
                
                const statusColor = 
                  inst.status === 'paid' ? '#16a34a' : 
                  inst.status === 'delayed' ? '#dc2626' : 
                  inst.status === 'cancelled' ? '#94a3b8' : '#d97706';
                
                const statusBg = 
                  inst.status === 'paid' ? '#f0fdf4' : 
                  inst.status === 'delayed' ? '#fef2f2' : 
                  inst.status === 'cancelled' ? '#f8fafc' : '#fffbeb';

                return `
                <tr style="border-bottom: 1px solid #eee; background: ${inst.status === 'paid' ? '#fcfcfc' : '#fff'};">
                  <td style="padding: 12px; text-align: center; color: #666; font-size: 16px; font-weight: 900;">${idx + 1}</td>
                  <td style="padding: 12px; text-align: center;">
                    <div style="margin-bottom: 2px; direction: ltr;">${inst.dueDate.split('-').reverse().join(' / ')}</div>
                    ${idx === 0 ? '<div style="font-size: 9px; color: #666; font-weight: 700;">(قبل بداية الدورة)</div>' : ''}
                  </td>
                  <td style="padding: 12px; text-align: center; font-size: 16px; font-weight: 900;">${inst.amount.toLocaleString()} EGP</td>
                  <td style="padding: 12px; text-align: center;">
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 900; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}33;">
                      ${statusLabel}
                    </span>
                  </td>
                  <td style="padding: 12px; text-align: center; font-size: 11px; color: #666;">
                    ${idx === 0 ? 'استكمال 50%' : idx === plan.installments.length - 1 ? 'القسط الأخير' : inst.label || '-'}
                  </td>
                </tr>
              `}).join('') : `
                <tr>
                  <td colspan="5" style="padding: 40px; text-align: center; color: #999;">لا يوجد خطة أقساط مسجلة</td>
                </tr>
              `}
              <tr style="background: #000; color: white;">
                <td colspan="2" style="padding: 15px; text-align: right; font-weight: 900; border-left: 1px solid #444;">إجمالي مبالغ الأقساط</td>
                <td style="padding: 15px; text-align: center; font-size: 16px; font-weight: 900; color: #FF5A00; border-left: 1px solid #444;">${plan?.installments?.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString() || 0} EGP</td>
                <td colspan="2" style="padding: 15px;"></td>
              </tr>
            </tbody>
          </table>
          `}
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 11px; font-weight: 700; color: #666; margin-bottom: 40px;">
            <i class="fas fa-info-circle"></i>
            <span>في حالة تغيير موعد بداية الدورة، سيتم إعادة جدولة الأقساط وفق الموعد الجديد.</span>
          </div>

          <!-- Footer Boxes -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px;">
            <!-- Notes -->
            <div style="border: 1px solid #eee; border-radius: 20px; padding: 20px; position: relative; background: #fff;">
              <div style="display: flex; flex-direction: row-reverse; justify-content: flex-end; align-items: center; gap: 10px; color: #FF5A00; font-weight: 900; margin-bottom: 15px;">
                 <i class="fas fa-headphones-alt"></i>
                 <span>ملاحظات</span>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 11px; font-weight: 700; color: #444; line-height: 2;">
                <li>• يرجى الالتزام بمواعيد السداد المحددة.</li>
                <li>• سيتم إرسال تذكير قبل كل موعد استحقاق.</li>
                <li>• تواصل معنا عبر جروب الدورة لأي استفسارات.</li>
              </ul>
            </div>
            <!-- Terms -->
            <div style="border: 1px solid #eee; border-radius: 20px; padding: 20px; text-align: right; background: #fff;">
              <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; color: #FF5A00; font-weight: 900; margin-bottom: 15px;">
                 <span>شروط الحجز</span>
                 <i class="fas fa-file-invoice"></i>
              </div>
              <div style="font-size: 10px; color: #444; line-height: 1.6; font-weight: 700;">
                بمجرد تأكيد الحجز في الدورة التدريبية، يُعد ذلك موافقة مبدئية على شروط وقواعد الحجز الخاصة بالأكاديمية، والتي يتم إرسالها للدارس بعد إتمام عملية الحجز.
                <br>
                في حال وجود أي استفسار أو رغبة في التعديل أو الإلغاء، يُرجى التواصل مع الأكاديمية خلال <span style="color: #FF5A00;">24 ساعة</span> من وقت الحجز.
                <br>
                بعد انقضاء هذه المدة، يُعتبر الدارس موافقاً على جميع الشروط والأحكام المنظمة للحجز والدورة التدريبية.
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Bar -->
        <div style="margin-top: auto; background: #FF5A00; padding: 15px 50px; display: flex; justify-content: space-between; align-items: center; color: white;">
          <div style="display: flex; gap: 25px; align-items: center; font-size: 11px; font-weight: 700; direction: ltr;">
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-phone"></i> +20 110 169 4022</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fab fa-facebook-f"></i> sabergroup.courses</div>
            <div style="border-left: 1px solid rgba(255,255,255,0.3); height: 15px;"></div>
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fab fa-instagram"></i> sabergroup.egc</div>
          </div>
          <div style="font-family: 'Montserrat', sans-serif; font-style: italic; font-weight: 800; font-size: 18px; letter-spacing: 0.5px;">Learn. Apply. Grow.</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    
    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, (pdfHeight - 20) / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${cust?.name || 'Customer'} Invoice.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Error generating PDF. Please try again.");
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div>
      {indexError && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 text-orange-800 rounded-2xl flex items-center gap-3 font-bold text-sm">
          <i className="fas fa-exclamation-triangle"></i>
          <span>{indexError}</span>
          <button onClick={() => fetchData(false)} className="ml-auto underline">Retry</button>
        </div>
      )}
      <div className="flex justify-between items-center mb-8 px-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            {t('bookings')}
            <span className="text-sm bg-primary-100 text-primary-600 px-3 py-1 rounded-full font-black">
              {totalBookingsCount.toLocaleString()} {t('records')}
            </span>
          </h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">
            Showing {filteredBookings.length} of {totalBookingsCount}
          </p>
        </div>
        <div className="flex gap-4">
          {hasPermission('viewExports') && (
            <button onClick={handleExportReport} className="px-6 py-2.5 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 flex items-center gap-2">
              <i className="fas fa-file-excel"></i>
              Export Report
            </button>
          )}
          {hasPermission('createBookings') && (
            <>
              <button 
                onClick={handleOpenImportModal} 
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <i className="fas fa-file-import"></i>
                <span>استيراد من تأكيد الحجز</span>
              </button>
              <button onClick={openNewBookingModal} className="px-6 py-2.5 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2">
                <i className="fas fa-plus-circle"></i>
                {t('add')}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-4 items-end bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="relative flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Search Student / Group</label>
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input type="text" placeholder="Name, WhatsApp, Group Code..." className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none font-medium text-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
        
        <div className="w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Type</label>
          <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
            <option value="all">All Types</option>
            <option value="assigned">Assigned</option>
            <option value="deferred">Deferred</option>
          </select>
        </div>

        <div className="w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Payment</label>
          <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as any)}>
            <option value="all">All Payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Fully Paid</option>
          </select>
        </div>

        <div className="w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">WA Status</label>
          <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={waFilter} onChange={e => setWaFilter(e.target.value as any)}>
            <option value="all">All WA</option>
            <option value="added">Added ✅</option>
            <option value="pending">Pending ⏳</option>
            <option value="not_eligible">Not Eligible ❌</option>
          </select>
        </div>

        <div className="w-[220px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Filter Group</label>
          <div className="space-y-1">
            <input 
              type="text" 
              placeholder="Search group..." 
              className="w-full px-3 py-1.5 text-[10px] bg-gray-50 dark:bg-gray-700 rounded-lg outline-none border border-gray-100 dark:border-gray-600 focus:border-primary-500"
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
            />
            <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
              <option value="all">All Groups</option>
              {sortedGroupsForFilter.started.length > 0 && (
                <optgroup label="🟡 STARTED">
                  {sortedGroupsForFilter.started.map(g => {
                    const count = groupOccupancy[g.id] || 0;
                    return (
                      <option key={g.id} value={g.id}>
                        {g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel} ({count}/{g.capacity})
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {sortedGroupsForFilter.upcoming.length > 0 && (
                <optgroup label="🟢 UPCOMING">
                  {sortedGroupsForFilter.upcoming.map(g => {
                    const count = groupOccupancy[g.id] || 0;
                    return (
                      <option key={g.id} value={g.id}>
                        {g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel} ({count}/{g.capacity})
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {sortedGroupsForFilter.finished.length > 0 && (
                <optgroup label="🔴 FINISHED">
                  {sortedGroupsForFilter.finished.map(g => {
                    const count = groupOccupancy[g.id] || 0;
                    return (
                      <option key={g.id} value={g.id}>
                        {g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel} ({count}/{g.capacity})
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <div className="w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Sales Rep</label>
          <select 
            className={`w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold ${!hasPermission('viewAllBookings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            value={salesFilter} 
            onChange={e => setSalesFilter(e.target.value)}
            disabled={!hasPermission('viewAllBookings')}
          >
            {hasPermission('viewAllBookings') && <option value="all">All Sales</option>}
            {salesStaff.filter(s => {
              if (hasPermission('viewAllBookings')) return true;
              return s.userId === userProfile?.uid;
            }).map(s => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </div>

        <div className="w-[140px]">
          <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">From</label>
          <input type="date" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} />
        </div>

        <button onClick={() => { setDateFilter({ start: '', end: '' }); setGroupFilter('all'); setGroupSearch(''); setTypeFilter('all'); setPaymentFilter('all'); setWaFilter('all'); setSalesFilter('all'); setSearchQuery(''); }} className="p-3 text-gray-400 hover:text-red-500 transition-colors">
          <i className="fas fa-times-circle"></i>
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-left rtl:text-right min-w-[1100px]">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400">
            <tr>
              <th className="px-4 py-4 font-black text-[10px] uppercase tracking-widest w-12 text-center">#</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Student & Booking Date</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Product & Schedule</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-center">WA Status</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-center">Status</th>
              {canViewRevenue && (
                <>
                  <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Pricing</th>
                  <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">Payments</th>
                </>
              )}
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filteredBookings.map((booking, idx) => {
              const cust = customers.find(c => c.id === booking.customerId);
              const grp = groups.find(g => g.id === booking.groupId);
              let prod = [...courses, ...diplomas].find(p => p.id === booking.productId);
              if (!prod && grp) prod = [...courses, ...diplomas].find(p => p.id === grp.productId);
              const waEligible = booking.whatsappStatus?.eligible;
              const waAdded = booking.whatsappStatus?.added;
              
              // Reliable WhatsApp Link
              const cleanWa = cust?.whatsapp ? cust.whatsapp.replace(/^0+/, '') : '';
              const cleanCode = cust?.countryCode?.replace('+', '') || '20';
              const waUrl = `https://wa.me/${cleanCode}${cleanWa}`;
              
              return (
                <tr key={booking.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-4 py-4 text-center text-[11px] font-black text-gray-400">{idx + 1}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sm">{cust?.name}</p>
                      {booking.isInternational && (
                        <span className="text-[9px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-black border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                          🌐 {booking.internationalDetails?.paidAmount} {booking.internationalDetails?.currency || 'USD'}
                        </span>
                      )}
                      {booking.salesName && (
                        <span className={`text-[9px] ${booking.salesReassigned ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'} px-2 py-0.5 rounded-full font-bold border ${booking.salesReassigned ? 'border-amber-100 dark:border-amber-800' : 'border-indigo-100 dark:border-indigo-800'} flex items-center gap-1`} title={booking.salesReassigned ? `Reassigned from ${booking.previousSalesName} by ${booking.reassignedBy} on ${booking.reassignedAt?.split('T')[0]}` : ''}>
                          <i className={`fas ${booking.salesReassigned ? 'fa-exchange-alt' : 'fa-user-tie'} text-[8px]`}></i>
                          {booking.salesName}
                          {booking.salesReassigned && <span className="ml-1 text-[7px] opacity-75">(Reassigned)</span>}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400 font-medium">{cust?.countryCode || '+20'}{cust?.whatsapp}</span>
                      <span className="text-[9px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 font-bold">Booked: {booking.bookingDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4"><p className="font-semibold text-xs">{prod?.name || 'Loading / N/A'}</p>{!booking.groupId ? <span className="text-[8px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase mt-1 inline-block">Deferred Booking</span> : <p className="text-[9px] text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full inline-block mt-1 font-bold">{grp?.scheduleLabel || 'Unassigned Group'}</p>}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center gap-3">
                      <button onClick={() => toggleWaAdded(booking)} disabled={!waEligible || booking.status !== 'ACTIVE' || !booking.groupId} className={`relative group transition-all ${waEligible && booking.groupId ? 'hover:scale-110' : 'opacity-30 cursor-not-allowed'}`}><i className={`fab fa-whatsapp text-lg ${!waEligible || !booking.groupId ? 'text-gray-400' : waAdded ? 'text-[#25D366]' : 'text-amber-500 animate-pulse'}`}></i>{waEligible && waAdded && <i className="fas fa-check absolute -bottom-1 -right-1 text-[8px] bg-white rounded-full p-0.5 text-[#25D366] shadow-sm"></i>}</button>
                      {cust && (
                        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-[#25D366] hover:bg-green-50 transition-all border border-transparent hover:border-green-200" title="Open WhatsApp Chat"><i className="fas fa-external-link-alt text-[10px]"></i></a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center"><span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${booking.status === 'ACTIVE' ? 'bg-green-100 text-green-600 border-green-200' : booking.status === 'REFUNDED' ? 'bg-red-100 text-red-600 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{booking.status}</span></td>
                  {canViewRevenue && (
                    <>
                      <td className="px-6 py-4">
                        <p className="font-black text-sm">{booking.pricing.finalPriceSnapshot.toLocaleString()} EGP</p>
                        {booking.pricing.savingsSnapshot > 0 && <p className="text-[9px] text-green-600 font-bold">Saved: {booking.pricing.savingsSnapshot.toLocaleString()}</p>}
                        {booking.pricing.extraDiscountSnapshot > 0 && booking.pricing.extraDiscountReason && <p className="text-[9px] text-amber-600 font-bold italic truncate max-w-[120px]">{booking.pricing.extraDiscountReason}</p>}
                        {booking.pricing.appliedPromoCode && (
                          <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-black italic bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded mt-0.5 inline-block" title={booking.pricing.appliedPromoCode.reason}>
                            Code: {booking.pricing.appliedPromoCode.code} (-{booking.pricing.appliedPromoCode.discountAmount})
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4"><p className="text-xs font-bold text-green-600">{booking.paymentSummary.paidTotal.toLocaleString()}</p><p className="text-[9px] text-gray-400 font-bold uppercase">{booking.paymentSummary.remaining.toLocaleString()} Left</p></td>
                    </>
                  )}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center space-x-1 rtl:space-x-reverse">
                      {hasPermission('assignGroups') && booking.status === 'ACTIVE' && (
                        <button 
                          onClick={() => { setActiveActionBooking(booking); setAssignModalOpen(true); setSelectedAssignGroupId(''); }} 
                          className="px-3 py-1 bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase hover:bg-amber-100 transition-colors border border-amber-200 dark:border-amber-900/30"
                          title={booking.groupId ? (isRtl ? 'تغيير/نقل مجموعة الطالب' : 'Change Student Group') : (isRtl ? 'تسكين الطالب في مجموعة' : 'Assign to Group')}
                        >
                          {booking.groupId ? (isRtl ? 'تغيير المجموعة' : 'Change Group') : (isRtl ? 'تسكين بجروب' : 'Assign Group')}
                        </button>
                      )}
                      {hasPermission('viewHistory') && (
                        <button onClick={() => handleViewHistory(booking)} className="flex flex-col items-center p-2 text-gray-400 hover:text-indigo-600 transition-colors" title={t('history')}>
                          <span className="text-[7px] font-black uppercase mb-1">{t('history')}</span>
                          <i className="fas fa-history text-xs"></i>
                        </button>
                      )}
                      {hasPermission('printInvoices') && (
                        <button onClick={() => handleExportPDF(booking)} className="flex flex-col items-center p-2 text-gray-400 hover:text-red-500 transition-colors" title="Export PDF">
                          <span className="text-[7px] font-black uppercase mb-1">Export PDF</span>
                          <i className="fas fa-file-pdf text-xs"></i>
                        </button>
                      )}
                      {booking.status === 'ACTIVE' && (
                        <>
                          {hasPermission('addCompletionPayment') && (
                            <button onClick={() => { setActiveActionBooking(booking); setCompletionMode('collect'); setCompletionData({ amount: booking.paymentSummary.remaining, method: 'cash_office', ref: '', note: '', receiptLink: '' }); setCompletionModalOpen(true); }} className="flex flex-col items-center p-2 text-gray-400 hover:text-green-600 transition-colors" title={t('addCompletion')}>
                              <span className="text-[7px] font-black uppercase mb-1">{t('addCompletion')}</span>
                              <i className="fas fa-money-bill-transfer text-xs"></i>
                            </button>
                          )}
                          {hasPermission('issueRefunds') && (
                            <button onClick={() => { setActiveActionBooking(booking); setCompletionMode('withdraw'); setCompletionData({ amount: 0, method: 'cash_office', ref: '', note: '', receiptLink: '' }); setCompletionModalOpen(true); }} className="flex flex-col items-center p-2 text-gray-400 hover:text-red-600 transition-colors" title={t('withdrawal')}>
                              <span className="text-[7px] font-black uppercase mb-1">{t('withdrawal')}</span>
                              <i className="fas fa-money-bill-wave text-xs"></i>
                            </button>
                          )}
                          {hasPermission('issueRefunds') && (
                             <button onClick={() => { setActiveActionBooking(booking); setRefundData({ amount: booking.paymentSummary.paidTotal, reason: '', method: 'cash_office', ref: '' }); setRefundModalOpen(true); }} className="flex flex-col items-center p-2 text-gray-400 hover:text-red-500 transition-colors" title={t('issueRefund')}>
                               <span className="text-[7px] font-black uppercase mb-1">{t('refund')}</span>
                               <i className="fas fa-hand-holding-dollar text-xs"></i>
                             </button>
                          )}
                          {hasPermission('editBookings') && (
                            <button onClick={() => handleEditBooking(booking)} className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-500 transition-colors" title={t('edit')}>
                              <span className="text-[7px] font-black uppercase mb-1">{t('edit')}</span>
                              <i className="fas fa-edit text-xs"></i>
                            </button>
                          )}
                          {hasPermission('deactivateBookings') && (
                            <button onClick={() => { setActiveActionBooking(booking); setDeactivateModalOpen(true); }} className="flex flex-col items-center p-2 text-gray-400 hover:text-orange-500 transition-colors" title={t('deactivate')}>
                              <span className="text-[7px] font-black uppercase mb-1">{t('deactivate')}</span>
                              <i className="fas fa-ban text-xs"></i>
                            </button>
                          )}
                        </>
                      )}
                      {hasPermission('deleteRecords') && (
                        <button onClick={() => { setDeleteId(booking.id); setDeleteName(`Booking: ${cust?.name}`); }} className="flex flex-col items-center p-2 text-gray-300 hover:text-red-600 transition-colors" title={t('delete')}>
                          <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredBookings.length === 0 && !loading && <div className="py-20 text-center text-gray-400 italic font-bold">No records found.</div>}
        
        {hasMoreBookings && (
          <div className="p-8 border-t dark:border-gray-700 flex justify-center bg-gray-50/30 dark:bg-gray-800/20">
            <button 
              onClick={() => fetchData(true)} 
              disabled={loading}
              className="px-10 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-3"
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  Loading...
                </>
              ) : (
                <>
                  <i className="fas fa-arrow-down"></i>
                  Load More Bookings
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div ref={modalFormRef} className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-6xl my-auto max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 pb-4 border-b dark:border-gray-700">{editingBookingId ? 'Edit Booking' : 'New System Booking'}</h2>
            {(saveError || validationErrors.installments || validationErrors.extraDiscountReason) && <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded-xl"><p className="text-xs text-red-600 font-black">{saveError || validationErrors.installments || validationErrors.whatsapp || validationErrors.extraDiscountReason}</p></div>}
            <form onSubmit={handleStartBooking} className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 border-b pb-2">1. Customer</h3>
                <input type="text" placeholder="Full Name *" required className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={customerData.name} onChange={e => setCustomerData({...customerData, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                    <button type="button" onClick={() => setCustomerData({...customerData, nationality: 'egyptian', countryCode: '+20'})} className={`py-2 text-[10px] font-black uppercase rounded-lg transition-all ${customerData.nationality === 'egyptian' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-400'}`}>Egyptian 🇪🇬</button>
                    <button type="button" onClick={() => setCustomerData({...customerData, nationality: 'other'})} className={`py-2 text-[10px] font-black uppercase rounded-lg transition-all ${customerData.nationality === 'other' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-400'}`}>Other 🌏</button>
                </div>
                {customerData.nationality === 'other' && (
                    <div className="space-y-2">
                        <div className="relative"><i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" placeholder="Search Country..." className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 rounded-t-xl outline-none text-xs" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} /></div>
                        <div className="max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-700 rounded-b-xl border dark:border-gray-600 custom-scrollbar">{filteredCountries.map(c => <button key={c.code} type="button" onClick={() => { setCustomerData({...customerData, countryCode: c.code}); setCountrySearch(''); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/30 flex justify-between items-center ${customerData.countryCode === c.code ? 'bg-primary-50 dark:bg-primary-900/30 font-bold' : ''}`}><span>{c.flag} {c.name}</span><span className="text-primary-600 font-bold">{c.code}</span></button>)}</div>
                    </div>
                )}
                <div className="flex gap-2"><div className="w-20 p-3 bg-gray-100 dark:bg-gray-600 rounded-xl text-center text-sm font-black text-gray-500">{customerData.countryCode}</div><div className="flex-1 relative"><input type="text" placeholder={`WhatsApp ${customerData.nationality === 'egyptian' ? '(11 digits)' : ''} *`} required className={`w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-black tracking-widest ${validationErrors.whatsapp ? 'border-2 border-red-500' : ''}`} value={customerData.whatsapp} onChange={handleWhatsappInput} /></div></div>
                {validationErrors.whatsapp && <p className="text-[9px] text-red-500 font-bold px-2">{validationErrors.whatsapp}</p>}
                <input type="text" placeholder="Alt Phone" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" value={customerData.phone} onChange={handlePhoneInput} />
                <input type="email" placeholder="Email" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm" value={customerData.email} onChange={e => setCustomerData({...customerData, email: e.target.value})} />
              </div>
              <div className="lg:col-span-1 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 border-b pb-2">2. Product & Sales</h3>
                <select required className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={selectedProductId} onChange={e => { const pId = e.target.value; setSelectedProductId(pId); setSelectedGroupId(''); if (isInternational) { updateForeignPricesForProduct(pId, internationalCurrency); } }}><option value="">Select Course/Diploma</option>{[...courses, ...diplomas].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl"><label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" checked={isDeferred} onChange={e => setIsDeferred(e.target.checked)} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" /><span className="text-xs font-black text-amber-600 uppercase">Deferred (Unassigned Group)</span></label></div>
                {!isDeferred && (<div className="space-y-2"><select required={!isDeferred} className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}><option value="">Select Group</option>{groups.filter(g => g.productId === selectedProductId && g.status !== 'FINISHED').map(g => { const count = groupOccupancy[g.id] || 0; const statusIcon = g.status === 'UPCOMING' ? '🟢' : '🟡'; const statusText = g.status === 'UPCOMING' ? 'Upcoming' : 'Started'; return <option key={g.id} value={g.id} className={g.status === 'UPCOMING' ? 'text-green-600' : 'text-amber-600'}>{statusIcon} {statusText} | {g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel} ({count}/{g.capacity})</option>; })}</select>{selectedGroupId && <div className="flex justify-between items-center px-2"><span className="text-[10px] font-black uppercase text-gray-400">Occupancy:</span><span className={`text-xs font-bold ${(groupOccupancy[selectedGroupId] || 0) >= (groups.find(g => g.id === selectedGroupId)?.capacity || 0) ? 'text-red-500' : 'text-primary-600'}`}>{groupOccupancy[selectedGroupId] || 0} / {groups.find(g => g.id === selectedGroupId)?.capacity} Trainees</span></div>}</div>)}
                <select required className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={selectedSalesId} onChange={e => setSelectedSalesId(e.target.value)}><option value="">Sales Representative</option>{salesStaff.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select>
                <input type="date" required className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
              </div>
              {canViewRevenue && (
                <>
                  <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 border-b pb-2">3. Pricing</h3>
                    {isInternational ? (
                      <div className="p-5 bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-3xl shadow-xl space-y-2">
                        <div className="flex items-center gap-2 text-blue-300 font-black text-xs">
                          <i className="fas fa-globe text-blue-400"></i>
                          <span>تسعير الحجز الدولي</span>
                        </div>
                        <p className="text-xs text-blue-100 leading-relaxed font-semibold">
                          🌐 الحجز بالعملة الأجنبية مفصول تماماً عن سعر الجنيه المصري. يتم تحديد السعر والعرض والخصومات بالعملة الأجنبية بالأسفل.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="p-5 bg-gray-900 text-white rounded-3xl shadow-xl text-center"><div className="text-[10px] opacity-50 uppercase mb-1 font-black tracking-widest">FINAL PRICE</div><div className="text-3xl font-black text-primary-400">{pricingDetails.finalPrice.toLocaleString()} EGP</div></div>
                        <select className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold" value={selectedOfferId} onChange={e => setSelectedOfferId(e.target.value)} disabled={isScholarship}><option value="">No Offer</option>{offers.filter(o => o.productId === selectedProductId && (o.enabled || o.id === selectedOfferId)).map(o => <option key={o.id} value={o.id}>{o.reason}</option>)}</select>
                        <div className="space-y-2"><input type="number" placeholder="Extra Discount" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-black" value={extraDiscount} onChange={e => setExtraDiscount(Number(e.target.value))} disabled={isScholarship} />{!isScholarship && extraDiscount > 0 && <div className="relative animate-in fade-in slide-in-from-top-1"><input type="text" placeholder="Reason for discount *" className={`w-full p-2 bg-amber-50 dark:bg-amber-900/20 border-2 rounded-xl outline-none text-xs font-bold ${validationErrors.extraDiscountReason ? 'border-red-500' : 'border-amber-100'}`} value={extraDiscountReason} onChange={e => setExtraDiscountReason(e.target.value)} /></div>}</div>
                        
                        {/* Promo Code Input Widget */}
                        <div className="space-y-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl animate-in fade-in-50">
                          <label className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 block">
                            {isRtl ? 'كود الخصم - اختياري (Promo Code - Optional)' : 'Promo Code (Optional)'}
                          </label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder={isRtl ? "مثال: SABER10" : "e.g. SABER10"}
                              className="flex-1 p-2 bg-white dark:bg-gray-800 dark:border-gray-700 border rounded-xl outline-none text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100"
                              value={promoCodeInput}
                              onChange={e => {
                                setPromoCodeInput(e.target.value.toUpperCase().replace(/\s+/g, ''));
                                setPromoValidationError('');
                              }}
                              disabled={isScholarship}
                            />
                            {appliedPromoCodeObj ? (
                              <button 
                                type="button"
                                onClick={() => {
                                  setAppliedPromoCodeObj(null);
                                  setPromoCodeInput('');
                                }}
                                className="px-3 py-2 bg-red-100 dark:bg-red-950 hover:bg-red-200 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-xl font-bold text-xs"
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            ) : (
                              <button 
                                type="button"
                                onClick={() => {
                                  const clean = promoCodeInput.trim().toUpperCase();
                                  if (!clean) return;
                                  const found = promoCodes.find(p => p.code === clean);
                                  if (!found) {
                                    setPromoValidationError(isRtl ? 'كود غير صحيح' : 'Invalid code');
                                    return;
                                  }
                                  const status = getPromoStatus(found);
                                  if (status === 'expired') {
                                    setPromoValidationError(isRtl ? 'هذا الكود منتهي أو معطل' : 'This code is expired/disabled');
                                    return;
                                  }
                                  if (status === 'scheduled') {
                                    setPromoValidationError(isRtl ? 'هذا الكود يبدأ صلاحيته لاحقاً' : 'This code is scheduled for later');
                                    return;
                                  }
                                  setAppliedPromoCodeObj(found);
                                  setPromoValidationError('');
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs"
                                disabled={isScholarship || !promoCodeInput.trim()}
                              >
                                {isRtl ? 'تطبيق' : 'Apply'}
                              </button>
                            )}
                          </div>
                          {appliedPromoCodeObj && (
                            <div className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                              <i className="fas fa-check-circle"></i>
                              {isRtl 
                                ? `تم تطبيق خصم ${appliedPromoCodeObj.discountAmount} جنيه (${appliedPromoCodeObj.assignedToName})` 
                                : `Applied ${appliedPromoCodeObj.discountAmount} EGP discount (${appliedPromoCodeObj.assignedToName})`}
                            </div>
                          )}
                          {promoValidationError && (
                            <div className="text-[11px] font-bold text-red-500 mt-1">
                              {promoValidationError}
                            </div>
                          )}
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl space-y-3"><label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer"><input type="checkbox" checked={isScholarship} onChange={e => setIsScholarship(e.target.checked)} className="w-5 h-5 rounded text-green-600 focus:ring-green-500" /><span className="text-sm font-black text-green-600 uppercase tracking-wide">Scholarship (Free)</span></label>{isScholarship && <input type="text" placeholder="Reason for scholarship..." required className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-xs font-bold" value={scholarshipReason} onChange={e => setScholarshipReason(e.target.value)} />}</div>
                      </>
                    )}

                    {/* International Transfer (تحويل من خارج مصر) Toggle & Calculator */}
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 rounded-2xl border border-blue-200 dark:border-blue-800/50 space-y-3">
                      <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInternational}
                          onChange={e => {
                            const checked = e.target.checked;
                            setIsInternational(checked);
                            if (checked) {
                              setPaymentMethod('paypal');
                              setInstallmentPlanType('none');
                              fetchExchangeRate(internationalCurrency);
                              updateForeignPricesForProduct(selectedProductId, internationalCurrency);
                            }
                          }}
                          className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-xs font-black text-blue-700 dark:text-blue-300 block">
                            🌐 تحويل من خارج مصر (حجز دولي)
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            دفع بالدولار / العملات الأجنبية وتحديد عمولة تحويل والضرائب
                          </span>
                        </div>
                      </label>

                      {isInternational && (
                        <div className="space-y-3 pt-2 border-t border-blue-200 dark:border-blue-800/40 animate-in fade-in">
                          {/* Currency & Exchange Rate Row */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block mb-1">العملة المتاحة</label>
                              <select
                                value={internationalCurrency}
                                onChange={e => {
                                  const curr = e.target.value;
                                  setInternationalCurrency(curr);
                                  fetchExchangeRate(curr);
                                  updateForeignPricesForProduct(selectedProductId, curr);
                                }}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                              >
                                <option value="USD">🇺🇸 دولار أمريكي (USD $)</option>
                                <option value="SAR">🇸🇦 ريال سعودي (SAR ر.س)</option>
                                <option value="EUR">🇪🇺 يورو (EUR €)</option>
                                <option value="AED">🇦🇪 درهم إماراتي (AED د.إ)</option>
                                <option value="GBP">🇬🇧 جنيه إسترليني (GBP £)</option>
                              </select>
                            </div>

                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block">سعر الصرف (EGP)</label>
                                <button
                                  type="button"
                                  onClick={() => fetchExchangeRate(internationalCurrency)}
                                  className="text-[9px] text-blue-600 font-bold hover:underline"
                                  title="تحديث سعر الصرف الحالي"
                                >
                                  {isFetchingRate ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                                </button>
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                value={exchangeRate || ''}
                                onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-black text-xs text-blue-800 dark:text-blue-200"
                              />
                            </div>
                          </div>

                          {/* Foreign Prices Row: Normal Price & Offer Price */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                                السعر الطبيعي ({internationalCurrency})
                              </label>
                              <input
                                type="number"
                                placeholder="مثال: 100"
                                value={foreignCoursePrice || ''}
                                onChange={e => setForeignCoursePrice(parseFloat(e.target.value) || 0)}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-black text-xs"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 block mb-1">
                                سعر العرض / بعد الخصم ({internationalCurrency})
                              </label>
                              <input
                                type="number"
                                placeholder="مثال: 80"
                                value={foreignOfferPrice || ''}
                                onChange={e => setForeignOfferPrice(parseFloat(e.target.value) || 0)}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-black text-xs text-indigo-700 dark:text-indigo-300"
                              />
                            </div>
                          </div>

                          {/* Optional Apply Offer Toggle */}
                          {foreignOfferPrice > 0 && (
                            <div className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-xl border border-indigo-200 dark:border-indigo-800/60 shadow-sm">
                              <label className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={applyForeignOffer}
                                  onChange={e => setApplyForeignOffer(e.target.checked)}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                  تطبيق سعر العرض ({foreignOfferPrice} {internationalCurrency} بدلاً من {foreignCoursePrice} {internationalCurrency})
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Foreign Paid Amount Entry */}
                          <div>
                            <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                              المبلغ المدفوع بالعملة ({internationalCurrency})
                            </label>
                            <input
                              type="number"
                              placeholder="أدخل المبلغ المدفوع بالعملة"
                              value={foreignPaidAmount || ''}
                              onChange={e => setForeignPaidAmount(parseFloat(e.target.value) || 0)}
                              className="w-full p-2.5 bg-white dark:bg-gray-800 rounded-xl outline-none font-black text-xs text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                            />
                          </div>

                          {/* Tax & Commission Percent Inputs */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block mb-1">نسبة الضرائب (%)</label>
                              <input
                                type="number"
                                value={taxPercent}
                                onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300 block mb-1">نسبة عمولة التحويل (%)</label>
                              <input
                                type="number"
                                value={commissionPercent}
                                onChange={e => setCommissionPercent(parseFloat(e.target.value) || 0)}
                                className="w-full p-2 bg-white dark:bg-gray-800 rounded-xl outline-none font-bold text-xs"
                              />
                            </div>
                          </div>

                          {/* Calculation Summary Breakdown Box */}
                          {(() => {
                            const effectivePrice = (applyForeignOffer && foreignOfferPrice > 0) ? foreignOfferPrice : foreignCoursePrice;
                            const remaining = Math.max(0, effectivePrice - foreignPaidAmount);
                            const taxVal = foreignPaidAmount * (taxPercent / 100);
                            const commVal = foreignPaidAmount * (commissionPercent / 100);
                            const netVal = foreignPaidAmount - taxVal - commVal;
                            const convertedEgp = netVal * exchangeRate;

                            return (
                              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800/60 text-xs space-y-1.5 shadow-sm">
                                <div className="flex justify-between font-bold text-gray-700 dark:text-gray-300">
                                  <span>السعر المطلوب للدورة:</span>
                                  <span className="font-black text-indigo-600 dark:text-indigo-400">{effectivePrice} {internationalCurrency}</span>
                                </div>
                                <div className="flex justify-between font-bold text-gray-700 dark:text-gray-300">
                                  <span>المبلغ المدفوع بالـ {internationalCurrency}:</span>
                                  <span>{foreignPaidAmount} {internationalCurrency}</span>
                                </div>
                                <div className="flex justify-between font-bold text-red-600 dark:text-red-400">
                                  <span>المبلغ المتبقي بالـ {internationalCurrency}:</span>
                                  <span>{remaining.toFixed(2)} {internationalCurrency}</span>
                                </div>
                                {foreignPaidAmount > 0 && (
                                  <>
                                    <div className="flex justify-between text-red-600 dark:text-red-400 font-bold border-t border-gray-100 dark:border-gray-700 pt-1.5">
                                      <span>خصم الضرائب ({taxPercent}%):</span>
                                      <span>-{taxVal.toFixed(2)} {internationalCurrency}</span>
                                    </div>
                                    <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                                      <span>خصم عمولة التحويل ({commissionPercent}%):</span>
                                      <span>-{commVal.toFixed(2)} {internationalCurrency}</span>
                                    </div>
                                    <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 flex justify-between font-black text-emerald-600 dark:text-emerald-400">
                                      <span>الصافي المستلم بالـ {internationalCurrency}:</span>
                                      <span>{netVal.toFixed(2)} {internationalCurrency}</span>
                                    </div>
                                    <div className="pt-1 border-t border-gray-100 dark:border-gray-700 flex justify-between font-black text-blue-600 dark:text-blue-400">
                                      <span>المعادل بالمصري للنظام (بسعر {exchangeRate}):</span>
                                      <span>
                                        {convertedEgp.toLocaleString(undefined, { maximumFractionDigits: 2 })} EGP
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 border-b pb-2">4. Payment & Installments</h3>
                    
                    {/* Always Editable Deposit Input */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">
                          {editingBookingId ? 'المبلغ المدفوع كدفعة أولى (مقدم)' : 'المبلغ المدفوع الآن (مقدم)'}
                        </label>
                        <input 
                          type="number" 
                          placeholder="Deposit Paid Now" 
                          className="w-full p-3 bg-primary-50 dark:bg-primary-900/30 text-primary-600 rounded-xl font-black text-sm border-2 border-primary-200 dark:border-primary-900" 
                          value={isInternational ? Math.round((foreignPaidAmount - (foreignPaidAmount * (taxPercent / 100)) - (foreignPaidAmount * (commissionPercent / 100))) * exchangeRate * 100) / 100 : deposit} 
                          onChange={e => { setDeposit(Number(e.target.value)); setShowInstallmentPreview(false); }} 
                          disabled={isInternational}
                        />
                        {isInternational && (
                          <p className="text-[9px] text-blue-600 font-bold mt-1">
                            * يتم حساب المقدم أوتوماتيكياً بعد خصم الضرائب والعمولة والتحويل للجنيه المصري.
                          </p>
                        )}
                      </div>
                      {(deposit > 0 || isInternational) && (
                        <div className="space-y-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl animate-in fade-in slide-in-from-top-1">
                          <div className="grid grid-cols-2 gap-2">
                             <select className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-[10px] font-bold" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}>
                               <option value="cash_office">Office Cash</option>
                               <option value="instapay">InstaPay</option>
                               <option value="vodafone_cash">Vodafone Cash</option>
                               <option value="etisalat_cash">Etisalat Cash</option>
                               <option value="paypal">PayPal (باي بال)</option>
                             </select>
                             <input type="text" placeholder="Ref..." className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-[10px] font-bold" value={transactionRef} onChange={e => setTransactionRef(e.target.value)} />
                          </div>
                          {!editingBookingId && (
                            <input type="text" placeholder="Receipt Link (Optional)..." className="w-full p-2 bg-white dark:bg-gray-800 rounded-lg outline-none text-[10px] font-bold" value={receiptLink} onChange={e => setReceiptLink(e.target.value)} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Installment Scheduler - Conditionally Locked if payments exist */}
                    <div className={paymentPlanLocked ? 'opacity-50 pointer-events-none mt-4' : 'space-y-4 mt-4'}>
                      {isInternational ? (
                        <div className="bg-amber-50/90 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2">
                          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-black text-xs">
                            <i className="fas fa-exclamation-triangle text-amber-600"></i>
                            <span>نظام السداد للحجز الدولي (خارج مصر)</span>
                          </div>
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-relaxed">
                            🚫 لا تتوفر أنظمة تقسيط للحجوزات الخارجية بالعملة الأجنبية.
                          </p>
                          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                            📌 يلزم دفع كامل المبلغ أو الجزء المتاح الآن، مع التزام الطالب باستكمال باقي المبلغ قبل بداية الكورس بـ 3 أيام كحد أقصى.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-[2rem] border-2 border-primary-100 dark:border-primary-900 animate-in zoom-in-95 duration-300">
                          <label className="text-xs font-black text-primary-600 uppercase block mb-3 flex items-center">
                             <i className="fas fa-calculator mr-2"></i> اختر نظام التقسيط
                          </label>
                          <select 
                            className="w-full p-4 bg-white dark:bg-gray-700 rounded-2xl outline-none text-sm font-bold border-2 border-transparent focus:border-primary-500 shadow-sm transition-all"
                            value={installmentPlanType}
                            onChange={e => {
                               const type = e.target.value as any;
                               setInstallmentPlanType(type);
                               let defaultCount = 0;
                               if (type === '10_days') defaultCount = 4;
                               else if (type === '15_days') defaultCount = 3;
                               else if (type === '60_days') defaultCount = 2;
                               setInstallmentCount(defaultCount);
                               setShowInstallmentPreview(false);
                            }}
                          >
                            <option value="none">Settle Balance Before Start Date (Full Payment)</option>
                            <option value="10_days">النظام الأول (كل ١٠ ايام) ٤ أقساط</option>
                            <option value="15_days">النظام الثاني (كل ١٥ يوم) ٣ أقساط</option>
                            <option value="60_days">النظام الثالث (٦٠ يوم) قسطين</option>
                          </select>

                          {installmentPlanType !== 'none' && (
                            <div className="mt-4 animate-in fade-in slide-in-from-top-1">
                              <label className="text-[10px] font-black text-primary-600 uppercase block mb-1">
                                <i className="fas fa-list-ol mr-1"></i> عدد الأقساط (تعديل يدوي)
                              </label>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => { setInstallmentCount(Math.max(1, installmentCount - 1)); setShowInstallmentPreview(false); }} className="w-10 h-10 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl flex items-center justify-center text-primary-600 hover:bg-primary-50 transition-colors"><i className="fas fa-minus"></i></button>
                                <input 
                                  type="number" 
                                  className="flex-1 p-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl text-center font-black text-sm outline-none focus:border-primary-500"
                                  value={installmentCount}
                                  onChange={e => { setInstallmentCount(Number(e.target.value)); setShowInstallmentPreview(false); }}
                                />
                                <button type="button" onClick={() => { setInstallmentCount(installmentCount + 1); setShowInstallmentPreview(false); }} className="w-10 h-10 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl flex items-center justify-center text-primary-600 hover:bg-primary-50 transition-colors"><i className="fas fa-plus"></i></button>
                              </div>
                            </div>
                          )}

                          {!showInstallmentPreview ? (
                            <button 
                                type="button" 
                                onClick={handlePreviewInstallments}
                                className="mt-4 w-full py-3 bg-primary-600 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-primary-500/20 active:scale-95 transition-all"
                            >
                                <i className="fas fa-eye mr-2"></i> عرض الأقساط (Preview)
                            </button>
                          ) : (
                            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm">
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">جدول الأقساط</h4>
                                        <button 
                                            type="button" 
                                            onClick={() => setIsManualInstallments(!isManualInstallments)}
                                            className={`text-[9px] font-black uppercase px-2 py-1 rounded ${isManualInstallments ? 'bg-amber-600 text-white' : 'text-primary-600 hover:bg-primary-50'}`}
                                        >
                                            {isManualInstallments ? 'إلغاء التعديل اليدوي' : 'تعديل يدوي'}
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                        {manualInstallments.map((inst, idx) => (
                                            <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                                <span className="text-[9px] font-black text-gray-400 w-4">#{idx+1}</span>
                                                <input 
                                                    type="date" 
                                                    disabled={!isManualInstallments}
                                                    className="flex-1 bg-transparent text-[11px] font-bold outline-none"
                                                    value={inst.dueDate}
                                                    onChange={e => handleManualInstallmentChange(idx, 'dueDate', e.target.value)}
                                                />
                                                <input 
                                                    type="number" 
                                                    disabled={!isManualInstallments}
                                                    className="w-20 bg-white dark:bg-gray-800 p-1 rounded-lg text-[11px] font-black text-center outline-none"
                                                    value={inst.amount}
                                                    onChange={e => handleManualInstallmentChange(idx, 'amount', e.target.value)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    {isManualInstallments && (
                                        <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-100 flex justify-between items-center">
                                            <span className="text-[9px] font-bold text-amber-600">Plan Status:</span>
                                            <span className="text-[9px] font-black text-amber-600 uppercase">Modified Manually</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              {isManualInstallments && <div className="lg:col-span-4 bg-gray-50 dark:bg-gray-700/30 p-8 rounded-[2rem] border-2 border-dashed border-gray-200 dark:border-gray-600"><div className="flex justify-between items-center mb-6"><h3 className="text-sm font-black uppercase tracking-widest">مراجعة وتعديل جدول الأقساط</h3><div className="text-[10px] font-bold text-gray-400">فحص الإجمالي: <span className={Math.abs(manualInstallments.reduce((sum,i)=>sum+i.amount,0) - (pricingDetails.finalPrice - deposit)) < 1 ? 'text-green-600' : 'text-red-500'}>{manualInstallments.reduce((sum,i)=>sum+i.amount,0).toLocaleString()} / {(pricingDetails.finalPrice - deposit).toLocaleString()}</span></div></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{manualInstallments.map((inst, idx) => <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border dark:border-gray-700 flex flex-col gap-2"><span className="text-[9px] font-black text-primary-600 uppercase">قسط #{idx + 1}</span><div className="flex gap-2"><input type="date" className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs outline-none" value={inst.dueDate} onChange={e => handleManualInstallmentChange(idx, 'dueDate', e.target.value)} /><input type="number" className="w-24 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs outline-none font-bold text-center" value={inst.amount} onChange={e => handleManualInstallmentChange(idx, 'amount', e.target.value)} /></div></div>)}</div></div>}
              
              {editingBookingId && (
                <div className="lg:col-span-4 bg-indigo-50 dark:bg-indigo-900/10 p-8 rounded-[2rem] border-2 border-indigo-100 dark:border-indigo-900/30 mt-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-indigo-700">إعادة جدولة المبلغ المتبقي</h3>
                      <p className="text-[10px] text-indigo-500 font-bold mt-1">يمكنك إعادة تقسيم المبلغ المتبقي على أقساط جديدة</p>
                    </div>
                    <label className="flex items-center space-x-3 cursor-pointer bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-indigo-200">
                      <input type="checkbox" checked={rescheduleEnabled} onChange={e => setRescheduleEnabled(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-xs font-black text-indigo-600 uppercase">تفعيل إعادة الجدولة</span>
                    </label>
                  </div>

                  {rescheduleEnabled && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">المبلغ المدفوع</p>
                          <p className="text-lg font-black text-green-600">{activeActionBooking?.paymentSummary.paidTotal.toLocaleString()} EGP</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">المبلغ المتبقي</p>
                          <p className="text-lg font-black text-red-600">{activeActionBooking?.paymentSummary.remaining.toLocaleString()} EGP</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">إجمالي الحجز</p>
                          <p className="text-lg font-black text-primary-600">{activeActionBooking?.pricing.finalPriceSnapshot.toLocaleString()} EGP</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">عدد الأقساط الجديدة</label>
                          <input type="number" className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm font-bold border border-indigo-100" value={rescheduleCount} onChange={e => setRescheduleCount(Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">تاريخ أول قسط</label>
                          <input type="date" className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm font-bold border border-indigo-100" value={rescheduleFirstDate} onChange={e => setRescheduleFirstDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">الفاصل (أيام)</label>
                          <input type="number" className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm font-bold border border-indigo-100" value={rescheduleInterval} onChange={e => setRescheduleInterval(Number(e.target.value))} />
                        </div>
                        <div className="md:col-span-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">سبب إعادة الجدولة</label>
                          <input type="text" className="w-full p-3 bg-white dark:bg-gray-800 rounded-xl outline-none text-sm font-bold border border-indigo-100" value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="مثلاً: طلب العميل..." />
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">جدول الأقساط الجديد المقترح</h4>
                        <button type="button" onClick={() => setRescheduleManual(!rescheduleManual)} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">
                          {rescheduleManual ? 'العودة للتوزيع التلقائي' : 'تعديل يدوي للمبالغ/التواريخ'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rescheduleList.map((inst, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-indigo-50 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-black text-indigo-600 uppercase">قسط #{idx + 1}</span>
                              {inst.label && <span className="text-[8px] font-black text-indigo-500 uppercase">{inst.label}</span>}
                            </div>
                            <div className="flex gap-2">
                              <input type="date" className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs outline-none" value={inst.dueDate} onChange={e => handleRescheduleListChange(idx, 'dueDate', e.target.value)} disabled={!rescheduleManual} />
                              <input type="number" className="w-24 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs outline-none font-bold text-center" value={inst.amount} onChange={e => handleRescheduleListChange(idx, 'amount', e.target.value)} disabled={!rescheduleManual} />
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-end text-[10px] font-bold text-gray-400">
                        <span>إجمالي الأقساط الجديدة: </span>
                        <span className={`ml-2 ${Math.abs(rescheduleList.reduce((s,i)=>s+i.amount,0) - (activeActionBooking?.paymentSummary.remaining || 0)) < 1 ? 'text-green-600' : 'text-red-500'}`}>
                          {rescheduleList.reduce((s,i)=>s+i.amount,0).toLocaleString()} / {activeActionBooking?.paymentSummary.remaining.toLocaleString()} EGP
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="lg:col-span-4 flex justify-end gap-4 pt-8 border-t dark:border-gray-700"><button type="button" onClick={() => setModalOpen(false)} className="px-8 py-3 text-gray-400 font-bold uppercase text-xs tracking-widest">Discard</button><button type="submit" disabled={isSaving} className="px-14 py-4 bg-primary-600 text-white rounded-2xl font-black shadow-2xl transition-all disabled:opacity-50">{isSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : (editingBookingId ? 'UPDATE BOOKING' : 'CONFIRM & BOOK')}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {isRefundModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-red-600">إصدار مرتجع (Refund)</h2>
                <button onClick={() => setRefundModalOpen(false)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 flex justify-between items-center">
                    <span className="text-xs font-black text-red-600 uppercase">Max Refundable:</span>
                    <span className="text-sm font-black text-red-700">{activeActionBooking?.paymentSummary.paidTotal.toLocaleString()} EGP</span>
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">المبلغ المرتجع</label>
                    <input type="number" className="w-full p-4 bg-gray-50 dark:bg-gray-700 text-red-600 font-black text-xl rounded-2xl outline-none border-2 border-transparent focus:border-red-500" value={refundData.amount} onChange={e => setRefundData({...refundData, amount: Number(e.target.value)})} />
                </div>
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">سبب المرتجع *</label>
                    <textarea required placeholder="اكتب سبب المرتجع هنا بالتفصيل..." className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm min-h-[80px]" value={refundData.reason} onChange={e => setRefundData({...refundData, reason: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <select className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold border dark:border-gray-600" value={refundData.method} onChange={e => setRefundData({...refundData, method: e.target.value as any})}>
                        <option value="cash_office">Office Cash</option>
                        <option value="instapay">InstaPay</option>
                        <option value="vodafone_cash">Vodafone Cash</option>
                        <option value="etisalat_cash">Etisalat Cash</option>
                    </select>
                    <input type="text" placeholder="Ref/Txn #" className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm border dark:border-gray-600" value={refundData.ref} onChange={e => setRefundData({...refundData, ref: e.target.value})} />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                    <button onClick={() => setRefundModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs">Discard</button>
                    <button onClick={handleRefund} disabled={isSaving || refundData.amount <= 0 || !refundData.reason} className="px-8 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-500/20 active:scale-95 transition-transform disabled:opacity-30">
                        {isSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : 'Confirm Refund'}
                    </button>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* Completion/Withdrawal Modal */}
      {isCompletionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <h2 className={`text-xl font-bold ${completionMode === 'collect' ? 'text-green-600' : 'text-red-600'}`}>
                  {completionMode === 'collect' ? 'استكمال تحصيل مبلغ' : 'سحب مبلغ من الحجز'}
                </h2>
                <button onClick={() => setCompletionModalOpen(false)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border flex justify-between items-center ${completionMode === 'collect' ? 'bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30' : 'bg-green-50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30'}`}>
                      <span className={`text-xs font-black uppercase ${completionMode === 'collect' ? 'text-amber-600' : 'text-green-600'}`}>
                        {completionMode === 'collect' ? 'Outstanding Balance:' : 'Total Paid:'}
                      </span>
                      <span className={`text-sm font-black ${completionMode === 'collect' ? 'text-amber-700' : 'text-green-700'}`}>
                        {completionMode === 'collect' ? activeActionBooking?.paymentSummary.remaining.toLocaleString() : activeActionBooking?.paymentSummary.paidTotal.toLocaleString()} EGP
                      </span>
                  </div>
                  <div>
                      <div className="flex justify-between items-end mb-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase block">
                          {completionMode === 'collect' ? 'المبلغ المراد تحصيله' : 'المبلغ المراد سحبه'}
                        </label>
                        {completionMode === 'collect' && (
                          <button onClick={() => setCompletionData({...completionData, amount: activeActionBooking?.paymentSummary.remaining || 0})} className="text-[9px] font-black text-primary-600 uppercase hover:underline">Pay Full Balance</button>
                        )}
                      </div>
                      <input type="number" className={`w-full p-4 font-black text-xl rounded-2xl outline-none border-2 border-transparent transition-all ${completionMode === 'collect' ? 'bg-green-50 dark:bg-green-900/10 text-green-700 focus:border-green-500' : 'bg-red-50 dark:bg-red-900/10 text-red-700 focus:border-red-500'}`} value={completionData.amount} onChange={e => setCompletionData({...completionData, amount: Number(e.target.value)})} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <select className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm font-bold border dark:border-gray-600" value={completionData.method} onChange={e => setCompletionData({...completionData, method: e.target.value as any})}>
                          <option value="cash_office">Office Cash</option>
                          <option value="instapay">InstaPay</option>
                          <option value="vodafone_cash">Vodafone Cash</option>
                          <option value="etisalat_cash">Etisalat Cash</option>
                      </select>
                      <input type="text" placeholder="Ref/Txn #" className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm border dark:border-gray-600" value={completionData.ref} onChange={e => setCompletionData({...completionData, ref: e.target.value})} />
                  </div>
                  <input type="text" placeholder="Receipt Link (Image/PDF)" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm border dark:border-gray-600" value={completionData.receiptLink} onChange={e => setCompletionData({...completionData, receiptLink: e.target.value})} />
                  <input type="text" placeholder="Notes (Optional)" className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-sm border dark:border-gray-600" value={completionData.note} onChange={e => setCompletionData({...completionData, note: e.target.value})} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b pb-2">New Installment Schedule</h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {completionInstallments.length > 0 ? (
                      completionInstallments.map((inst, idx) => {
                        const isInitialCompletion = inst.label === 'قسط استكمال البداية';
                        return (
                          <div key={idx} className={`p-3 rounded-2xl border transition-all ${isInitialCompletion ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-gray-50 border-gray-100 dark:bg-gray-700/50 dark:border-gray-600'}`}>
                            <div className="flex justify-between items-center mb-2">
                              <span className={`text-[9px] font-black uppercase ${isInitialCompletion ? 'text-indigo-600' : 'text-gray-400'}`}>
                                {isInitialCompletion ? 'قسط استكمال البداية' : `Installment #${idx + 1}`}
                              </span>
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${inst.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                {inst.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <input 
                                type="date" 
                                className="flex-1 p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none border dark:border-gray-600" 
                                value={inst.dueDate} 
                                onChange={e => handleCompletionInstallmentChange(idx, 'dueDate', e.target.value)}
                                disabled={inst.status === 'paid'}
                              />
                              <input 
                                type="number" 
                                className={`w-24 p-2 bg-white dark:bg-gray-800 rounded-lg text-xs outline-none border dark:border-gray-600 font-bold text-center ${isInitialCompletion ? 'text-indigo-600' : ''}`} 
                                value={inst.amount} 
                                onChange={e => handleCompletionInstallmentChange(idx, 'amount', e.target.value)}
                                disabled={inst.status === 'paid'}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-10 text-center text-gray-400 italic text-xs">No pending installments to update.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t dark:border-gray-700">
                  <button onClick={() => setCompletionModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 uppercase text-xs">Discard</button>
                  <button onClick={handleCompletion} disabled={isSaving || completionData.amount <= 0} className={`px-8 py-3 text-white rounded-xl font-black shadow-lg active:scale-95 transition-transform disabled:opacity-30 ${completionMode === 'collect' ? 'bg-green-600 shadow-green-500/20' : 'bg-red-600 shadow-red-500/20'}`}>
                      {isSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : completionMode === 'collect' ? 'Confirm Collection' : 'Confirm Withdrawal'}
                  </button>
              </div>
            </div>
          </div>
      )}

      {/* Deactivate Modal */}
      {isDeactivateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-6 text-orange-600">{t('deactivate')}</h2>
            <div className="space-y-4">
              <textarea 
                placeholder={t('deactivatedReason') + " *"} 
                className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none min-h-[100px]" 
                value={deactivationData.reason} 
                onChange={e => setDeactivationData({...deactivationData, reason: e.target.value})} 
              />
              <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/10 p-4 rounded-2xl border border-orange-100">
                <input type="checkbox" id="refundElig" checked={deactivationData.refundEligible} onChange={e => setDeactivationData({...deactivationData, refundEligible: e.target.checked})} />
                <label htmlFor="refundElig" className="text-sm font-bold text-orange-700">مؤهل لاسترجاع المبلغ مدفوع؟</label>
              </div>
              {deactivationData.refundEligible && (
                  <input type="text" placeholder="سبب أحقية الاسترجاع..." className="w-full p-3 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none text-xs" value={deactivationData.eligibilityReason} onChange={e => setDeactivationData({...deactivationData, eligibilityReason: e.target.value})} />
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setDeactivateModalOpen(false)} className="px-6 py-2 font-bold text-gray-400">Discard</button>
                <button onClick={handleDeactivate} className="px-8 py-3 bg-orange-600 text-white rounded-xl font-black shadow-lg shadow-orange-500/20 uppercase tracking-widest">Confirm Deactivate</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {isAssignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md">
              <h2 className="text-xl font-bold mb-2">
                {activeActionBooking?.groupId ? (isRtl ? 'تغيير / نقل مجموعة الطالب' : 'Change Student Group') : (isRtl ? 'تسكين في مجموعة' : 'Assign to Group')}
              </h2>
              <p className="text-xs text-gray-500 mb-6">
                {isRtl ? 'يرجى اختيار المجموعة المستهدفة لهذا الطالب.' : 'Please select target group for this student.'}
              </p>
              <div className="space-y-4">
                <select className="w-full p-4 bg-gray-50 dark:bg-gray-700 rounded-2xl outline-none font-bold text-xs" value={selectedAssignGroupId} onChange={e => setSelectedAssignGroupId(e.target.value)}>
                    <option value="">{isRtl ? 'اختر المجموعة المستهدفة' : 'Select Target Group'}</option>
                    {groups
                      .filter(g => g.productId === activeActionBooking?.productId && g.status !== 'FINISHED' && g.id !== activeActionBooking?.groupId)
                      .map(g => (
                        <option key={g.id} value={g.id}>{g.groupCode || g.productName} | {g.startDate} | {g.scheduleLabel} ({groupOccupancy[g.id] || 0}/{g.capacity})</option>
                    ))}
                </select>
                <div className="flex justify-end gap-3 pt-6 border-t dark:border-gray-700">
                    <button onClick={() => setAssignModalOpen(false)} className="px-6 py-2 font-bold text-gray-400 text-xs">{isRtl ? 'إلغاء' : 'Discard'}</button>
                    <button onClick={handleAssignGroup} disabled={isSaving || !selectedAssignGroupId} className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-black shadow-lg shadow-primary-500/20 text-xs transition-all">
                        {isSaving ? <i className="fas fa-spinner fa-spin mr-2"></i> : (isRtl ? 'حفظ وتحديث المواعيد' : 'Save & Sync Schedule')}
                    </button>
                </div>
              </div>
            </div>
          </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) { const performedBy = userProfile ? { name: userProfile.displayName, email: userProfile.email } : undefined; await softDeleteDoc('bookings', deleteId, userProfile?.uid || '', performedBy); setDeleteId(null); fetchData(); } }} itemName={deleteName} />
      
      <HistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setHistoryModalOpen(false)} 
        booking={activeActionBooking} 
        customers={customers} 
      />

      {/* Import Form Submission Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b dark:border-gray-700">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <i className="fas fa-file-signature"></i>
                  <span>استيراد بيانات العميل من استمارة الحجز</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1">اختر الاستمارة المؤكدة بواسطة العميل لملء الحجز تلقائياً</p>
              </div>
              <button 
                onClick={() => setImportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 flex items-center justify-center hover:bg-gray-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="py-3 space-y-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                <i className="fas fa-clock text-amber-600"></i>
                <span>تلقائياً: يتم عرض استمارات آخر 48 ساعة فقط. اكتب الاسم أو الرقم واضغط "بحث" للوصول لأي استمارة أقدم.</span>
              </div>
              <form onSubmit={handleSearchSubmissionsInModal} className="flex gap-2">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  <input
                    type="text"
                    placeholder="ابحث باسم الطالب أو رقم الواتساب..."
                    className="w-full pr-9 pl-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl text-xs font-bold outline-none border border-gray-200 dark:border-gray-600 focus:border-emerald-500"
                    value={submissionSearch}
                    onChange={e => {
                      setSubmissionSearch(e.target.value);
                      if (!e.target.value) handleOpenImportModal();
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingSubmissions}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  بحث
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {loadingSubmissions ? (
                <div className="p-12 text-center text-gray-400">
                  <i className="fas fa-circle-notch fa-spin text-2xl mb-2 text-emerald-500"></i>
                  <p className="text-xs font-bold">جاري تحميل الاستمارات المكتملة...</p>
                </div>
              ) : formSubmissions.length === 0 ? (
                <div className="p-12 text-center text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                  <i className="fas fa-inbox text-3xl mb-2 text-gray-300"></i>
                  <p className="text-xs font-bold">لا توجد استمارات مؤكدة حتى الآن</p>
                </div>
              ) : (
                formSubmissions
                  .filter(s => 
                    !submissionSearch || 
                    s.customerName.toLowerCase().includes(submissionSearch.toLowerCase()) || 
                    s.whatsapp.includes(submissionSearch) ||
                    s.phone.includes(submissionSearch)
                  )
                  .map(sub => (
                    <div 
                      key={sub.id} 
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 rounded-2xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm dark:text-white">{sub.customerName}</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 px-2 py-0.5 rounded-full font-black">
                            {sub.attendanceMethod === 'online' ? '🌐 أونلاين' : '🏛️ بالمقر'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 font-semibold">
                          <span><i className="fab fa-whatsapp text-emerald-500 mr-1"></i>{sub.countryCode || '+20'}{sub.whatsapp}</span>
                          <span><i className="fas fa-book text-amber-500 mr-1"></i>{sub.productName}</span>
                          <span><i className="fas fa-money-bill-wave text-green-600 mr-1"></i>المبلغ: {sub.paidAmount} ج.م</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSelectSubmissionToImport(sub)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all"
                      >
                        <i className="fas fa-file-import"></i>
                        <span>استيراد لإنشاء الحجز</span>
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-4 mt-4 border-t dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-5 py-2 text-xs font-bold text-gray-400 hover:text-gray-600"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
