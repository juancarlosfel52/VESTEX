// ═══════════════════════════════════════════════════════════
//  CANONICAL U.S. MARKET TRADING DATE
//  Single source of truth for "what trading day is this record?"
//
//  Why this module exists:
//  The pipeline cron fires at 21:00 America/New_York. At that moment UTC is
//  already the NEXT calendar day, so `new Date().toISOString().split('T')[0]`
//  stamped tomorrow's date on tonight's records:
//
//    Mon 21:00 ET -> Tue ID      Thu 21:00 ET -> Fri ID
//    Tue 21:00 ET -> Wed ID      Fri 21:00 ET -> SAT ID  (never journaled)
//    Wed 21:00 ET -> Thu ID      (no Sunday run) -> MONDAY NEVER CREATED
//
//  That silently deleted one trading day per week from the V2 shadow
//  experiment (~20% of all data) and manufactured a junk weekend row in its
//  place. Confirmed live: research_journal was missing Jul 20, Jul 27 and
//  Aug 3 — every Monday — while db-integrity flagged a Saturday row.
//
//  Scope note: this module is intentionally NOT applied to the legacy
//  `predictions` collection. Its writer and verifyPredictions() form a matched
//  pair that share the same UTC skew, and System A / signalPerformance
//  learning is frozen. Changing that pairing is a separate decision.
// ═══════════════════════════════════════════════════════════

const ET_TZ = 'America/New_York';

// en-CA renders as YYYY-MM-DD
const _etFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * The U.S. market calendar date for a given instant, in America/New_York.
 * DST-safe (Intl handles the offset). Returns 'YYYY-MM-DD'.
 */
function getTradingDate(date = new Date()) {
  return _etFormatter.format(date);
}

// ── Pure date helpers (UTC arithmetic on calendar values, no TZ involved) ──

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dow(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun .. 6=Sat
}

function shift(y, m, d, days) {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function nthWeekday(y, m, weekday, n) {
  const first = dow(y, m, 1);
  const day = 1 + ((weekday - first + 7) % 7) + 7 * (n - 1);
  return iso(y, m, day);
}

function lastWeekday(y, m, weekday) {
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dow(y, m, daysInMonth);
  return iso(y, m, daysInMonth - ((last - weekday + 7) % 7));
}

// Anonymous Gregorian algorithm
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { month, day };
}

function goodFriday(y) {
  const e = easterSunday(y);
  return shift(y, e.month, e.day, -2);
}

/**
 * NYSE observance for a fixed-date holiday.
 * Saturday -> preceding Friday, Sunday -> following Monday.
 * New Year's Day is the exception: NYSE does not close on Dec 31 when Jan 1
 * falls on a Saturday, so that case yields no holiday.
 */
function observedFixed(y, m, d, { noSaturdayObservance = false } = {}) {
  const w = dow(y, m, d);
  if (w === 6) return noSaturdayObservance ? null : shift(y, m, d, -1);
  if (w === 0) return shift(y, m, d, 1);
  return iso(y, m, d);
}

const _holidayCache = new Map();

/** Set of 'YYYY-MM-DD' NYSE full-closure dates for a year. */
function marketHolidays(year) {
  if (_holidayCache.has(year)) return _holidayCache.get(year);
  const set = new Set();
  const add = (v) => { if (v) set.add(v); };

  add(observedFixed(year, 1, 1, { noSaturdayObservance: true })); // New Year's Day
  add(nthWeekday(year, 1, 1, 3));                                 // MLK Jr — 3rd Mon Jan
  add(nthWeekday(year, 2, 1, 3));                                 // Washington's Birthday — 3rd Mon Feb
  add(goodFriday(year));                                          // Good Friday
  add(lastWeekday(year, 5, 1));                                   // Memorial Day — last Mon May
  if (year >= 2022) add(observedFixed(year, 6, 19));              // Juneteenth
  add(observedFixed(year, 7, 4));                                 // Independence Day
  add(nthWeekday(year, 9, 1, 1));                                 // Labor Day — 1st Mon Sep
  add(nthWeekday(year, 11, 4, 4));                                // Thanksgiving — 4th Thu Nov
  add(observedFixed(year, 12, 25));                               // Christmas

  _holidayCache.set(year, set);
  return set;
}

function isMarketHoliday(dateStr) {
  const y = Number(dateStr.slice(0, 4));
  return marketHolidays(y).has(dateStr);
}

/** True only for actual U.S. market sessions: weekday and not a full closure. */
function isTradingDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = dow(y, m, d);
  if (w === 0 || w === 6) return false;
  return !marketHolidays(y).has(dateStr);
}

/**
 * The most recent `count` trading days, newest first, ending at the ET trading
 * date of `from` (inclusive if that day is itself a session).
 */
function getTradingDays(count, from = new Date()) {
  const days = [];
  let [y, m, d] = getTradingDate(from).split('-').map(Number);
  let cursor = iso(y, m, d);
  for (let i = 0; days.length < count && i < 400; i++) {
    if (isTradingDay(cursor)) days.push(cursor);
    const [cy, cm, cd] = cursor.split('-').map(Number);
    cursor = shift(cy, cm, cd, -1);
  }
  return days;
}

module.exports = {
  ET_TZ,
  getTradingDate,
  getTradingDays,
  isTradingDay,
  isMarketHoliday,
  marketHolidays,
};
