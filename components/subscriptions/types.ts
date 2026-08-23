export interface MultiSeatOffer {
  id: string;
  name: string;
  seatsCount: number;
  totalPrice: number;
  savingAmount: number;
}

export interface SubscriptionType {
  id: string;
  name: string;
  billingCycle: 'monthly' | 'yearly' | 'lifetime' | 'custom';
  cost: number;
  description?: string;
  enabled: boolean;
  seatPrice?: number; // سعر المقعد الفردي
  offers?: MultiSeatOffer[]; // عروض تعدد المقاعد
}

export interface PaymentMethod {
  id: string;
  name: string;
  cardDetails?: string;
  expiryDate?: string;
  enabled: boolean;
  status?: 'active' | 'suspended' | 'blocked';
  isSuspended?: boolean;
  suspensionReason?: string;
}

export interface SubscriptionAccount {
  id: string;
  typeId: string; // references SubscriptionType
  email: string;
  password?: string;
  masterPassword?: string; // Admin-only master password
  paymentMethodId: string; // references PaymentMethod
  cost: number;
  billingDate: string; // next renewal date (YYYY-MM-DD)
  maxSeats: number;
  activeSeats: number;
  status: 'active' | 'suspended' | 'expired' | 'restricted' | 'reserved' | 'canceled';
  notes?: string;
  isReserved?: boolean;
  reservationReason?: string;
  // Cancellation Requirement Settings
  requiresCancellation?: boolean;
  cancellationDeadline?: string;
  cancellationReason?: string;
  cancellationConfirmed?: boolean;
  cancellationConfirmedAt?: string;
  adobeVerified?: boolean;
  adobeVerifiedBy?: string;
  createdAt?: string;
  // Trial & Payment Period Settings for Accounts
  hasTrial?: boolean;
  trialPeriod?: '1_week' | '3_months' | 'custom' | 'none';
  trialDays?: number;
  trialStartDate?: string;
  trialEndDate?: string;
  firstBillingDate?: string;
  isPaid?: boolean; // Payment status to provider/site
}

export interface SubscriptionAlert {
  id: string;
  accountId: string; // references SubscriptionAccount
  reminderDate: string; // YYYY-MM-DD
  message: string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'acknowledged';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  step1Done?: boolean; // تواصل مع دعم adobe لازالة الفيزا من الاكونت
  step2Done?: boolean; // الغاء اشتراك الاكونت دا .. وبعدها عمل اكونتات جديده بديلة له
}

export interface CustomerSubscription {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  salesRep?: string; // السيلز المسؤول عن العميل
  accountId: string; // references SubscriptionAccount
  seatIndex: number;
  price: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'canceled';
  paymentStatus: 'paid' | 'pending' | 'overdue';
  seatsCount?: number; // عدد المقاعد
  selectedOfferId?: string; // العرض المختار
  basePrice?: number; // السعر قبل الخصم الإضافي
  additionalDiscount?: number; // الخصم الإضافي
  discountReason?: string; // سبب الخصم الإضافي
  savingAmount?: number; // مبلغ التوفير الإجمالي
  renewalOption?: 'same_discount' | 'base_price'; // خيار سعر التجديد القادم
  createdAt?: string;
  // Temporary / Compensation trial subscription settings (غير محتسب إيراداً)
  isTemporaryCompensation?: boolean;
  compensationDays?: number;
  compensationReason?: string;
}

export interface ProgramSubscriptionExpense {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface ProgramSubscriptionRevenue {
  id: string;
  customerSubId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  section: string;
  action: string;
  description: string;
  performedBy: string;
  performedByEmail: string;
  details?: any;
}

export interface PreRegisteredAccount {
  id: string;
  typeId: string; // references SubscriptionType
  email: string;
  password?: string;
  masterPassword?: string; // Admin-only master password (hidden from staff)
  status: 'free' | 'paid';
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}
