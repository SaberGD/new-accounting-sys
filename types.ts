
export type Role = 'admin' | 'supervisor' | 'manager' | 'training_team_leader' | 'sales';

// مفاتيح الصلاحيات المتاحة في النظام
export type PermissionKey = 
  | 'viewDashboard' 
  | 'viewCatalog' 
  | 'viewOffers' 
  | 'viewBranches' 
  | 'viewGroups' 
  | 'viewBookings' 
  | 'createBookings'
  | 'viewCustomers' 
  | 'manageCustomers'
  | 'viewInstallments' 
  | 'viewRevenue' 
  | 'viewCashFlow'
  | 'viewExports' 
  | 'viewUsers' 
  | 'viewSettings' 
  | 'viewSalesStaff' 
  | 'viewGuide'
  | 'viewHistory'
  | 'editBookings'
  | 'editGroups'
  | 'deleteRecords'
  | 'issueRefunds'
  | 'editInstallments'
  | 'manageSystemTools'
  | 'impersonation'
  | 'addCompletionPayment'
  | 'assignGroups'
  | 'deactivateBookings'
  | 'restoreBookings'
  | 'printInvoices'
  | 'manageUsers'
  | 'manageSettings'
  | 'manageSalesStaff'
  | 'manageCatalog'
  | 'manageOffers'
  | 'manageBranches'
  | 'viewAllBookings'
  | 'viewActivityLog'
  | 'viewReschedulingLogs'
  | 'reverseActions'
  | 'viewComplaints'
  | 'manageComplaints'
  | 'viewProgramSubscriptions'
  | 'manageBookingForms';

export type PermissionsMap = {
  [key in PermissionKey]: {
    [role in Role]: boolean;
  };
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: any;
  createdAt: any;
}

export interface AllowedUser {
  email: string; // Key is emailLower
  name: string;
  role: Role;
  isActive: boolean;
}

export interface ForeignPrice {
  price: number;
  priceAfterDiscount?: number;
}

export interface PriceHistoryEntry {
  price: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string; // YYYY-MM-DD
  changedAt: string; // ISO String
  changedBy?: string;
  foreignPrices?: {
    [currency: string]: ForeignPrice;
  };
  note?: string;
}

export interface Course {
  id: string;
  name: string;
  basePrice: number;
  active: boolean;
  foreignPrices?: {
    [currency: string]: ForeignPrice;
  };
  priceHistory?: PriceHistoryEntry[];
}

export interface Diploma {
  id: string;
  name: string;
  courseIds: string[];
  extraItems: string[];
  basePrice: number;
  active: boolean;
  foreignPrices?: {
    [currency: string]: ForeignPrice;
  };
  priceHistory?: PriceHistoryEntry[];
}

// Workshop: a sub-product of a Course. Booking a workshop assigns the
// customer to one of the PARENT COURSE's existing groups — workshops never
// have their own groups. Kept structurally identical to Course (basePrice /
// foreignPrices / priceHistory) so it works with the same pricing utilities.
export interface Workshop {
  id: string;
  name: string;
  parentCourseId: string;
  basePrice: number;
  active: boolean;
  foreignPrices?: {
    [currency: string]: ForeignPrice;
  };
  priceHistory?: PriceHistoryEntry[];
}

export interface Offer {
  id: string;
  productId: string; // Course or Diploma ID
  productType: 'course' | 'diploma';
  offerPrice: number;
  reason: string;
  enabled: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  isActive: boolean;
  createdAt?: any;
}

export interface Group {
  id: string;
  groupCode?: string; // New: Unique name or code for the group
  productType: 'course' | 'diploma';
  productId: string;
  productName?: string;
  startDate: string;
  daysOfWeek: string[];
  timeStart: string;
  timeEnd: string;
  scheduleLabel: string;
  capacity: number;
  trainer: string;
  supervisor: string;
  status: 'UPCOMING' | 'STARTED' | 'FINISHED';
  isOnline: boolean;
  branchId?: string;
  whatsappGroupLink?: string;
  telegramGroupLink?: string;
  telegramChannelLink?: string;
  availableForBooking: boolean;
  delay?: {
    originalDate: string;
    delayedDate: string;
    reason: string;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  countryCode: string; // e.g., "+20"
  whatsapp: string;    // Raw number without code
  fullWhatsapp: string; // Combined for search/logic
  email: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedByUid?: string;
}

export interface PaymentSummary {
  paidTotal: number;
  remaining: number;
  next_due_date?: string | null;
}

export interface BookingPricing {
  basePriceSnapshot: number;
  appliedOffer?: {
    isApplied: boolean;
    offerId: string;
    offerReason: string;
    offerPrice: number;
  };
  appliedPromoCode?: {
    code: string;
    discountAmount: number;
    reason: string;
    assignedToId: string;
    assignedToName: string;
  };
  savingsSnapshot: number;
  extraDiscountSnapshot: number;
  extraDiscountReason?: string;
  isScholarship: boolean;
  scholarshipReason?: string;
  finalPriceSnapshot: number;
}

export type BookingStatus = 'ACTIVE' | 'DEACTIVATED' | 'REFUNDED' | 'DELETED';
export type BookingType = 'assigned' | 'deferred';

export interface InternationalDetails {
  isInternational: boolean;
  currency: string; // e.g. 'USD', 'SAR', 'EUR'
  exchangeRate: number; // rate to EGP e.g. 48.5
  originalPrice: number; // Foreign course price before discount
  finalPrice: number; // Foreign course price after discount
  discountAmount: number; // Foreign discount
  paidAmount: number; // Foreign deposit/paid
  remainingAmount: number; // Foreign remaining
  taxPercent: number; // e.g. 14
  taxAmount: number; // e.g. 14 USD
  commissionPercent: number; // e.g. 3
  commissionAmount: number; // e.g. 3 USD
  netAmount: number; // Foreign net revenue (paidAmount - taxAmount - commissionAmount)
  convertedEgpNet: number; // netAmount * exchangeRate
}

export interface Booking {
  id: string;
  customerId: string;
  groupId: string | null;
  productId: string; // Added to track course/diploma/workshop even if groupId is null
  productType: 'course' | 'diploma' | 'workshop';
  bookingType: BookingType;
  bookingDate: string; // YYYY-MM-DD
  groupStatusAtBooking?: string;
  pricing: BookingPricing;
  paymentSummary: PaymentSummary;
  whatsappStatus: {
    eligible: boolean;
    added: boolean;
  };
  status: BookingStatus;
  deactivatedAt?: string;
  deactivatedReason?: string;
  deactivatedByUid?: string;
  refundEligible?: boolean;
  refundEligibilityReason?: string;
  hasRefund?: boolean;
  refundedTotal?: number;
  lastRefundAt?: string;
  restoreReason?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedByUid?: string;
  rescheduled_at?: string;
  assigned_at?: string;
  salesId: string;
  salesName: string;
  createdAt?: string;
  originalSalesId?: string;
  originalSalesName?: string;
  previousSalesName?: string;
  salesReassigned?: boolean;
  reassignedBy?: string;
  reassignedAt?: string;
  receiptLink?: string;
  isInternational?: boolean;
  internationalDetails?: InternationalDetails;
  unscheduledAgreement?: UnscheduledAgreement;
}

export interface UnscheduledFollowUpNote {
  text: string;
  agreedDate?: string;
  suggestedCount?: number;
  addedBy: string;
  addedByName: string;
  timestamp: string;
}

export interface UnscheduledAgreement {
  agreementNote?: string;
  agreedDate?: string;
  suggestedCount?: number;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
  notesHistory?: UnscheduledFollowUpNote[];
}

export interface InstallmentNote {
  text: string;
  addedBy: string; // userId
  addedByName: string;
  timestamp: string;
}

export interface Installment {
  dueDate: string;
  amount: number;
  status: 'pending' | 'paid' | 'delayed' | 'cancelled';
  notifiedOnWhatsApp: boolean;
  delayContacted?: boolean;
  delayReason?: string;
  originalDueDate?: string;
  rescheduleReason?: string;
  label?: string;
  remindedBySales?: {
    uid: string;
    name: string;
    timestamp: string;
  };
  verifiedBySupervisor?: {
    uid: string;
    name: string;
    timestamp: string;
  };
  notes?: InstallmentNote[];
}

export interface InstallmentPlan {
  bookingId: string;
  deposit: number;
  installments: Installment[];
  installmentType?: 'weekly' | 'monthly';
  planType?: string;
  planLabel?: string;
  rescheduled_at?: string;
}

export type PaymentMethod = 'vodafone_cash' | 'instapay' | 'cash_office' | 'etisalat_cash' | 'paypal';

export interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  groupId: string | null;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  transactionRef?: string;
  receiptLink?: string;
  note?: string;
  createdByUid: string;
  isDeleted?: boolean;
  isReversed?: boolean;
  reversedAt?: string;
  editedAt?: string;
  editedByUid?: string;
  originalAmount?: number;
}

export interface Refund {
  id: string;
  bookingId: string;
  customerId: string;
  groupId: string | null;
  refundAmount: number;
  refundDate: string;
  method: PaymentMethod;
  transactionRef?: string;
  reason: string;
  createdByUid: string;
  isDeleted?: boolean;
  editedAt?: string;
  editedByUid?: string;
  originalAmount?: number;
  isReversed?: boolean;
  reversedAt?: string;
}

export interface SalesStaff {
  id: string;
  fullName: string;
  isActive: boolean;
  createdAt: any;
  isDeleted?: boolean;
  userId?: string; // Linked system user account UID
}

export interface Repayment {
  id: string;
  bookingId: string;
  amount: number;
  repaymentDate: string;
  method: PaymentMethod;
  transactionRef?: string;
  note?: string;
  createdByUid: string;
  isDeleted?: boolean;
  isReversed?: boolean;
  reversedAt?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  timestamp: string;
  section: string;
  targetId?: string;
  targetName?: string;
  clientId?: string;
  clientName?: string;
  details: string;
}

export type ComplaintStatus = 'pending' | 'active' | 'closed';

export interface ComplaintLog {
  text: string;
  uid: string;
  name: string;
  timestamp: string;
  contactMethod?: 'whatsapp' | 'mobile' | 'other';
  updateSentToWhatsapp?: boolean;
}

export interface Complaint {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: ComplaintStatus;
  subject: string;
  details: string;
  assignedToId?: string;
  assignedToName?: string;
  parties?: string;
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  lastUpdateSentToWhatsapp?: boolean;
  history: ComplaintLog[];
}

export interface CustomerNote {
  id: string;
  customerId: string;
  text: string;
  uid: string;
  name: string;
  timestamp: string;
}

export interface BookingLog {
  id: string;
  bookingId: string;
  timestamp: string;
  action: string;
  description: string;
  performedBy: string;
  performedByEmail?: string;
  details?: {
    pricing?: BookingPricing;
    paymentSummary?: PaymentSummary;
    installments?: Installment[];
    [key: string]: any;
  };
}

export interface PromoCode {
  id: string;
  code: string;
  discountAmount: number;
  assignedToId: string;
  assignedToName: string;
  assignedToType: 'trainer' | 'sales' | 'user' | 'other';
  startDate: string;
  endDate: string;
  reason: string;
  useCount: number;
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  isActive: boolean;
}

export interface BookingFormField {
  id: string;
  label: string;
  type: 'text' | 'tel' | 'select' | 'radio' | 'checkbox' | 'number' | 'textarea' | 'terms';
  placeholder?: string;
  required: boolean;
  options?: string[];
  systemKey?: 'name' | 'phone' | 'countryCode' | 'whatsapp' | 'email' | 'englishName' | 'selectedProduct' | 'studiedSoftware' | 'attendanceMethod' | 'paidAmount' | 'transferSenderNumber' | 'paymentMethod' | 'termsAgreed';
  enabled: boolean;
  helpText?: string;
}

export interface BookingFormTemplate {
  id: string;
  title: string;
  description?: string;
  termsLink: string;
  termsText?: string;
  fields: BookingFormField[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BookingFormSubmission {
  id: string;
  formId: string;
  customerName: string;
  phone: string;
  countryCode: string;
  whatsapp: string;
  email?: string;
  englishName: string;
  productId?: string;
  productName: string;
  productType?: 'course' | 'diploma';
  studiedSoftware: 'yes' | 'no';
  attendanceMethod: 'online' | 'offline_hq';
  paidAmount: number;
  transferSenderNumber: string;
  paymentMethod: string;
  termsAgreed: boolean;
  additionalAnswers?: Record<string, any>;
  submittedAt: string;
  status: 'new' | 'imported' | 'archived';
  importedBookingId?: string;
  importedAt?: string;
  importedBy?: string;
  isScholarship?: boolean;
  formType?: 'standard' | 'scholarship';
  scholarshipReason?: string;
  installmentPlan?: string;
  installmentPlanNotes?: string;
}
