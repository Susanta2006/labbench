/**
 * Daily AI credit tracking with automatic reset at midnight.
 * Stores { date: "YYYY-MM-DD", credits: number } in localStorage.
 */

const STORAGE_KEY = "labbench.aiCredits";
const DAILY_CREDITS = 5;

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreditData {
  date: string;
  used: number;
}

/**
 * Load credits from localStorage and auto-reset if it's a new day.
 * Returns object with current date and used credits count.
 */
export function loadCredits(): CreditData {
  const today = getTodayDate();
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // First time: initialize with today's date and 0 used
      return { date: today, used: 0 };
    }
    
    const parsed = JSON.parse(stored) as CreditData;
    
    // Check if stored date matches today
    if (parsed.date === today) {
      // Same day: return as-is
      return parsed;
    }
    
    // Different day: reset credits
    return { date: today, used: 0 };
  } catch {
    // Parse error or invalid data: reset to today
    return { date: today, used: 0 };
  }
}

/**
 * Save credits to localStorage.
 */
export function saveCredits(credits: CreditData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credits));
}

/**
 * Get remaining credits for today.
 */
export function getRemainingCredits(credits: CreditData): number {
  return Math.max(0, DAILY_CREDITS - credits.used);
}

/**
 * Increment used credits by 1 (when user makes an AI request).
 */
export function useOneCredit(credits: CreditData): CreditData {
  const today = getTodayDate();
  
  // Ensure date is current (in case it was a stale date)
  const current = credits.date === today ? credits : { date: today, used: 0 };
  
  // Increment used count if not at limit
  if (current.used < DAILY_CREDITS) {
    current.used += 1;
  }
  
  return current;
}
