import { SubscriptionAccount } from './types';

/**
 * Safely parses a YYYY-MM-DD date string into a local midnight Date object
 * without timezone shift issues.
 */
export function parseLocalDate(dateStr?: string): Date {
  if (!dateStr) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const cleanStr = dateStr.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculates remaining days until account billing/renewal date.
 */
export function getAccountDaysRemaining(billingDate?: string): number {
  if (!billingDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseLocalDate(billingDate);
  if (isNaN(target.getTime())) return 0;
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats a clean Arabic human-readable string for account renewal days remaining.
 */
export function formatAccountDaysRemainingLabel(billingDate?: string): string {
  if (!billingDate) return 'تجديد غير محدد';
  const days = getAccountDaysRemaining(billingDate);
  if (days > 0) {
    return `باقي ${days} يوم ع التجديد (${billingDate})`;
  } else if (days === 0) {
    return `ينتهي اليوم (${billingDate})`;
  } else {
    return `منتهي منذ ${Math.abs(days)} يوم (${billingDate})`;
  }
}

/**
 * Sorts accounts by renewal priority:
 * 1st priority: Active & available accounts.
 * 2nd priority: Longest remaining duration (highest remaining days first, e.g. 30+ days).
 */
export function sortAccountsByPriority(accounts: SubscriptionAccount[]): SubscriptionAccount[] {
  return [...accounts].sort((a, b) => {
    // Active & available status priority
    const aAvailable = a.status === 'active' && !a.isReserved ? 1 : 0;
    const bAvailable = b.status === 'active' && !b.isReserved ? 1 : 0;
    if (aAvailable !== bAvailable) return bAvailable - aAvailable;

    // Remaining days descending (longest remaining time comes first)
    const daysA = getAccountDaysRemaining(a.billingDate);
    const daysB = getAccountDaysRemaining(b.billingDate);
    return daysB - daysA;
  });
}

export function isAccountPaidSoFar(acc: SubscriptionAccount): boolean {
  // 1. If explicitly unpaid / pending payment to provider
  if (acc.isPaid === false) {
    return false;
  }

  // 2. If currently in trial period (hasTrial is true, trialPeriod !== 'none')
  const todayStr = new Date().toISOString().split('T')[0];
  if (acc.hasTrial && acc.trialPeriod && acc.trialPeriod !== 'none') {
    if (!acc.trialEndDate || todayStr <= acc.trialEndDate) {
      return false; // Still in trial period, no cost paid so far
    }
  }

  return true;
}

/**
 * Adds 1 month (or 30 days) to a date string (YYYY-MM-DD), returning YYYY-MM-DD
 */
export function addOneMonthToDateStr(dateStr?: string): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  }
  base.setMonth(base.getMonth() + 1);
  return base.toISOString().split('T')[0];
}
