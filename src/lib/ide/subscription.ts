/**
 * Pro subscription status tracking
 * Stores { purchasedAt: ISO timestamp } in localStorage for paid users
 */

const STORAGE_KEY = "labbench.proSubscription";
const DAILY_CREDITS = 5;

export interface SubscriptionData {
  purchasedAt: string; // ISO timestamp of purchase
}

/**
 * Load subscription status from localStorage.
 * Returns null if no active subscription, or the subscription data if purchased.
 */
export function loadSubscription(): SubscriptionData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as SubscriptionData;
    if (typeof parsed.purchasedAt !== "string") return null;
    
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save subscription to localStorage (called after successful payment).
 */
export function saveSubscription(subscription: SubscriptionData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscription));
}

/**
 * Clear subscription from localStorage (if needed for testing or cancellation).
 */
export function clearSubscription(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if subscription is still active (within current billing month).
 * Subscriptions are valid from purchase date through end of that calendar month.
 */
export function isSubscriptionActive(subscription: SubscriptionData | null): boolean {
  if (!subscription) return false;
  
  try {
    const purchaseDate = new Date(subscription.purchasedAt);
    const now = new Date();
    
    // Subscription is valid until the last day of the purchase month
    const purchaseMonth = purchaseDate.getMonth();
    const purchaseYear = purchaseDate.getFullYear();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Same month and year = active. Also active if we're in the next month but purchase was recent enough
    if (currentYear === purchaseYear && currentMonth === purchaseMonth) {
      return true;
    }
    
    // If purchase was this month and subscription started, it's active for this entire month
    // After month ends, subscription expires
    return false;
  } catch {
    return false;
  }
}

/**
 * Get credit limit for current session.
 * Paid users get unlimited (return a very large number).
 * Free users get daily 5/5.
 */
export function getCreditLimit(isPaid: boolean): number {
  return isPaid ? 999999 : DAILY_CREDITS;
}
