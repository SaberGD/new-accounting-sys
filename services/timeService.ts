import { db } from '../firebase';

let timeOffset = 0;

// Immediately check for any saved offset in localStorage so we have a good approximation without layout shifts
try {
  const savedOffset = localStorage.getItem('server_time_offset');
  if (savedOffset) {
    timeOffset = parseInt(savedOffset, 10) || 0;
  }
} catch (e) {
  console.warn('[TimeService] localStorage not available:', e);
}

/**
 * Initializes the clock offset by comparing client local time with actual server time.
 * Falls back to highly available public Time APIs if same-origin header check fails.
 */
export const initializeTimeOffset = async () => {
  try {
    // Strategy 1: Same-Origin HEAD Request (extremely reliable, CORS-free, uses our own server clock)
    const startTime = Date.now();
    const response = await fetch('/?cache-bust=' + startTime, { method: 'HEAD' });
    const dateHeader = response.headers.get('date') || response.headers.get('Date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      const endTime = Date.now();
      const roundTrip = endTime - startTime;
      
      // Target time is server time adjusted by half of round-trip network latency
      const correctedServerMs = serverMs + Math.round(roundTrip / 2);
      timeOffset = correctedServerMs - endTime;
      
      try {
        localStorage.setItem('server_time_offset', timeOffset.toString());
      } catch (e) {}
      
      console.log(`[TimeService] Same-origin synchronized. Offset: ${timeOffset}ms`);
      return;
    }
  } catch (err) {
    console.warn('[TimeService] Same-origin head fetch failed. Moving to fallback APIs:', err);
  }

  // Strategy 2: Fallback to World Time API (Cairo Zone)
  try {
    const startTime = Date.now();
    const res = await fetch('https://worldtimeapi.org/api/timezone/Africa/Cairo');
    const data = await res.json();
    if (data && data.datetime) {
      const serverMs = new Date(data.datetime).getTime();
      const endTime = Date.now();
      const roundTrip = endTime - startTime;
      const correctedServerMs = serverMs - Math.round(roundTrip / 2); // API reports time at request, adjust back by half latency
      timeOffset = correctedServerMs - endTime;
      
      try {
        localStorage.setItem('server_time_offset', timeOffset.toString());
      } catch (e) {}
      
      console.log(`[TimeService] WorldTimeAPI synchronized. Offset: ${timeOffset}ms`);
      return;
    }
  } catch (err) {
    console.warn('[TimeService] WorldTimeAPI fallback failed:', err);
  }

  // Strategy 3: Fallback to TimeAPI.io (Cairo Zone)
  try {
    const startTime = Date.now();
    const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Africa/Cairo');
    const data = await res.json();
    if (data && data.dateTime) {
      // Append Z to parse as UTC/ISO equivalent if not explicitly offset-zoned
      const serverMs = new Date(data.dateTime.endsWith('Z') ? data.dateTime : data.dateTime + 'Z').getTime();
      const endTime = Date.now();
      timeOffset = serverMs - endTime;
      
      try {
        localStorage.setItem('server_time_offset', timeOffset.toString());
      } catch (e) {}
      
      console.log(`[TimeService] TimeAPI.io synchronized. Offset: ${timeOffset}ms`);
      return;
    }
  } catch (err) {
    console.error('[TimeService] All time sync strategies failed. Reverting to device clock.', err);
  }
};

/**
 * Returns a new Date object adjusted for local system clock skew.
 */
export const getCorrectDate = (): Date => {
  return new Date(Date.now() + timeOffset);
};

/**
 * Returns the current ISO string of the synchronized date.
 */
export const getCorrectISOString = (): string => {
  return getCorrectDate().toISOString();
};

/**
 * Converts a Date (or defaults to the synchronized current date) to Cairo timezone-specific YYYY-MM-DD string.
 * This guarantees the date is perfectly aligned with Cairo timezone, regardless of client machine settings.
 */
export const getCairoDateString = (date?: Date): string => {
  const targetDate = date || getCorrectDate();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(targetDate);
    const year = parts.find(p => p.type === 'year')?.value || '1970';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    return `${year}-${month}-${day}`;
  } catch (e) {
    // Safe standard fallback in case Intl.DateTimeFormat fails
    const d = targetDate;
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }
};

/**
 * Formats a Date to a human readable Cairo timezone date and time string.
 */
export const formatCairoDateTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return d.toLocaleString();
  }
};
