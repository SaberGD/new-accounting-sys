import { Course, Diploma, ForeignPrice, PriceHistoryEntry } from '../types';

/**
 * Returns the effective base price and foreign price of a course/diploma at a given date.
 * If no price history exists or date is unspecified, defaults to current product.basePrice.
 */
export function getProductPriceAtDate(
  product: Course | Diploma | undefined,
  dateStr?: string,
  currency?: string
): {
  basePrice: number;
  foreignPrice?: ForeignPrice;
  isHistorical: boolean;
  historyEntry?: PriceHistoryEntry;
} {
  if (!product) {
    return { basePrice: 0, foreignPrice: undefined, isHistorical: false };
  }

  const targetDate = dateStr ? dateStr.split('T')[0] : new Date().toISOString().split('T')[0];

  if (product.priceHistory && product.priceHistory.length > 0) {
    // Sort entries by effectiveFrom ascending
    const sorted = [...product.priceHistory].sort((a, b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || ''));

    // Check if targetDate falls within an entry's effective window
    const exactMatch = sorted.find(entry => {
      const from = entry.effectiveFrom || '1970-01-01';
      const to = entry.effectiveTo || '9999-12-31';
      return targetDate >= from && targetDate <= to;
    });

    if (exactMatch) {
      const fp = currency && exactMatch.foreignPrices ? exactMatch.foreignPrices[currency] : undefined;
      return {
        basePrice: exactMatch.price,
        foreignPrice: fp,
        isHistorical: true,
        historyEntry: exactMatch
      };
    }

    // If date is before earliest recorded entry, use the earliest entry (the initial price before any changes)
    if (targetDate < (sorted[0].effectiveFrom || '9999-12-31')) {
      const earliest = sorted[0];
      const fp = currency && earliest.foreignPrices ? earliest.foreignPrices[currency] : undefined;
      return {
        basePrice: earliest.price,
        foreignPrice: fp,
        isHistorical: true,
        historyEntry: earliest
      };
    }

    // If date is after latest entry
    const latest = sorted[sorted.length - 1];
    const fp = currency && latest.foreignPrices ? latest.foreignPrices[currency] : undefined;
    return {
      basePrice: latest.price ?? product.basePrice,
      foreignPrice: fp ?? (currency && product.foreignPrices ? product.foreignPrices[currency] : undefined),
      isHistorical: false,
      historyEntry: latest
    };
  }

  // Fallback to current product price
  const fp = currency && product.foreignPrices ? product.foreignPrices[currency] : undefined;
  return {
    basePrice: product.basePrice || 0,
    foreignPrice: fp,
    isHistorical: false
  };
}

/**
 * Calculates day before a given YYYY-MM-DD date string
 */
export function getPreviousDayString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

/**
 * Builds or updates the priceHistory array when editing a Course or Diploma in Catalog
 */
export function buildUpdatedPriceHistory(
  existingProduct: (Course | Diploma) | undefined,
  newBasePrice: number,
  effectiveFromDate: string,
  newForeignPrices?: Record<string, ForeignPrice>,
  userProfile?: { displayName?: string; email?: string },
  note?: string
): PriceHistoryEntry[] {
  const nowIso = new Date().toISOString();
  const userName = userProfile?.displayName || userProfile?.email || 'Admin';
  const effectiveDate = effectiveFromDate || nowIso.split('T')[0];

  const currentHistory: PriceHistoryEntry[] = existingProduct?.priceHistory ? [...existingProduct.priceHistory] : [];

  // If this is a brand new product
  if (!existingProduct) {
    return [{
      price: newBasePrice,
      effectiveFrom: effectiveDate,
      changedAt: nowIso,
      changedBy: userName,
      foreignPrices: newForeignPrices,
      note: note || 'السعر الأولي عند إنشاء الكورس'
    }];
  }

  const oldBasePrice = existingProduct.basePrice || 0;
  const isPriceChanged = oldBasePrice !== newBasePrice;

  // If there's no history yet on the existing product
  if (currentHistory.length === 0) {
    if (isPriceChanged) {
      // Create previous entry for the old price
      const oldEffectiveTo = getPreviousDayString(effectiveDate);
      const oldEntry: PriceHistoryEntry = {
        price: oldBasePrice,
        effectiveFrom: '2020-01-01',
        effectiveTo: oldEffectiveTo,
        changedAt: nowIso,
        changedBy: 'System (Legacy Price)',
        foreignPrices: existingProduct.foreignPrices,
        note: 'السعر القديم قبل التعديل'
      };

      const newEntry: PriceHistoryEntry = {
        price: newBasePrice,
        effectiveFrom: effectiveDate,
        changedAt: nowIso,
        changedBy: userName,
        foreignPrices: newForeignPrices,
        note: note || `تعديل السعر من ${oldBasePrice} إلى ${newBasePrice}`
      };

      return [oldEntry, newEntry];
    } else {
      // Same price, initialize single entry
      return [{
        price: newBasePrice,
        effectiveFrom: '2020-01-01',
        changedAt: nowIso,
        changedBy: userName,
        foreignPrices: newForeignPrices || existingProduct.foreignPrices,
        note: note || 'تثبيت السعر الأساسي'
      }];
    }
  }

  // If history already exists
  if (isPriceChanged) {
    // Sort existing history
    const sorted = [...currentHistory].sort((a, b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || ''));
    
    // Close the latest entry that doesn't have effectiveTo or whose effectiveTo is after new effectiveDate
    const lastOpenIndex = sorted.findIndex(e => !e.effectiveTo || e.effectiveTo >= effectiveDate);
    if (lastOpenIndex !== -1) {
      sorted[lastOpenIndex] = {
        ...sorted[lastOpenIndex],
        effectiveTo: getPreviousDayString(effectiveDate)
      };
    }

    const newEntry: PriceHistoryEntry = {
      price: newBasePrice,
      effectiveFrom: effectiveDate,
      changedAt: nowIso,
      changedBy: userName,
      foreignPrices: newForeignPrices,
      note: note || `تعديل السعر إلى ${newBasePrice}`
    };

    return [...sorted, newEntry];
  } else {
    // Price not changed, just update foreignPrices or note if needed on the latest entry
    return currentHistory;
  }
}
