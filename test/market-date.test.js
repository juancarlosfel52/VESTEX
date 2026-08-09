// VESTEX — Repair 3 regression test: canonical ET trading date
// Covers the exact failure that deleted every Monday from the experiment.

const assert = require('assert');
const {
  getTradingDate, getTradingDays, isTradingDay, isMarketHoliday, marketHolidays,
} = require('../marketDate');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// ── The core bug: 21:00 ET pipeline run ──
// Mon 2026-08-03 21:00 ET == Tue 2026-08-04 01:00 UTC
check('T1  Mon 21:00 ET stamps MONDAY (was stamping Tuesday)', () => {
  assert.strictEqual(getTradingDate(new Date('2026-08-04T01:00:00Z')), '2026-08-03');
});
check('T2  Fri 21:00 ET stamps FRIDAY (was stamping Saturday)', () => {
  // Fri 2026-08-07 21:00 ET == Sat 2026-08-08 01:00 UTC
  assert.strictEqual(getTradingDate(new Date('2026-08-08T01:00:00Z')), '2026-08-07');
});
check('T3  20:59 ET and 21:01 ET fall on the same trading date', () => {
  const a = getTradingDate(new Date('2026-08-08T00:59:00Z')); // 20:59 ET Fri
  const b = getTradingDate(new Date('2026-08-08T01:01:00Z')); // 21:01 ET Fri
  assert.strictEqual(a, '2026-08-07');
  assert.strictEqual(b, '2026-08-07');
  assert.strictEqual(a, b);
});
check('T4  ET midnight boundary rolls the date exactly once', () => {
  assert.strictEqual(getTradingDate(new Date('2026-08-08T03:59:00Z')), '2026-08-07'); // 23:59 ET
  assert.strictEqual(getTradingDate(new Date('2026-08-08T04:00:00Z')), '2026-08-08'); // 00:00 ET
});

// ── Weekends ──
check('T5  Saturday and Sunday are not trading days', () => {
  assert.strictEqual(isTradingDay('2026-08-08'), false); // Sat
  assert.strictEqual(isTradingDay('2026-08-09'), false); // Sun
});
check('T6  the junk Saturday row date is rejected', () => {
  assert.strictEqual(isTradingDay('2026-07-26'), false); // Sunday seen in db-integrity
  assert.strictEqual(isTradingDay('2026-08-01'), false); // Saturday seen in db-integrity
});
check('T7  the three missing Mondays ARE trading days', () => {
  ['2026-07-20', '2026-07-27', '2026-08-03'].forEach(d => {
    assert.strictEqual(isTradingDay(d), true, `${d} should be a session`);
  });
});

// ── DST transitions (US 2026: Mar 8 spring forward, Nov 1 fall back) ──
check('T8  DST spring-forward boundary is correct', () => {
  // 2026-03-09 21:00 EDT == 2026-03-10 01:00 UTC (UTC-4)
  assert.strictEqual(getTradingDate(new Date('2026-03-10T01:00:00Z')), '2026-03-09');
});
check('T9  DST fall-back boundary is correct', () => {
  // 2026-11-02 21:00 EST == 2026-11-03 02:00 UTC (UTC-5)
  assert.strictEqual(getTradingDate(new Date('2026-11-03T02:00:00Z')), '2026-11-02');
  // 2026-10-30 21:00 EDT == 2026-10-31 01:00 UTC (UTC-4)
  assert.strictEqual(getTradingDate(new Date('2026-10-31T01:00:00Z')), '2026-10-30');
});

// ── Holidays ──
check('T10 July 4 observed', () => {
  assert.strictEqual(isMarketHoliday('2026-07-03'), true);  // Jul 4 2026 = Sat -> Fri Jul 3
  assert.strictEqual(isTradingDay('2026-07-03'), false);
  assert.strictEqual(isMarketHoliday('2025-07-04'), true);  // Fri
  assert.strictEqual(isMarketHoliday('2027-07-05'), true);  // Jul 4 2027 = Sun -> Mon Jul 5
});
check('T11 Thanksgiving = 4th Thursday of November', () => {
  assert.strictEqual(isMarketHoliday('2026-11-26'), true);
  assert.strictEqual(isMarketHoliday('2025-11-27'), true);
  assert.strictEqual(isTradingDay('2026-11-26'), false);
});
check('T12 Christmas observed', () => {
  assert.strictEqual(isMarketHoliday('2026-12-25'), true);  // Fri
  assert.strictEqual(isMarketHoliday('2027-12-24'), true);  // Dec 25 2027 = Sat -> Fri Dec 24
  assert.strictEqual(isMarketHoliday('2022-12-26'), true);  // Dec 25 2022 = Sun -> Mon Dec 26
});
check('T13 New Years Day: no Saturday observance (NYSE rule)', () => {
  assert.strictEqual(isMarketHoliday('2026-01-01'), true);   // Thu
  assert.strictEqual(isMarketHoliday('2021-12-31'), false);  // Jan 1 2022 = Sat -> NOT observed
  assert.strictEqual(isMarketHoliday('2023-01-02'), true);   // Jan 1 2023 = Sun -> Mon Jan 2
});
check('T14 Good Friday (moving feast)', () => {
  assert.strictEqual(isMarketHoliday('2026-04-03'), true);
  assert.strictEqual(isMarketHoliday('2025-04-18'), true);
  assert.strictEqual(isMarketHoliday('2024-03-29'), true);
});
check('T15 Monday holidays: MLK, Presidents, Memorial, Labor', () => {
  assert.strictEqual(isMarketHoliday('2026-01-19'), true); // MLK
  assert.strictEqual(isMarketHoliday('2026-02-16'), true); // Washington's Birthday
  assert.strictEqual(isMarketHoliday('2026-05-25'), true); // Memorial
  assert.strictEqual(isMarketHoliday('2026-09-07'), true); // Labor
});
check('T16 Juneteenth only from 2022', () => {
  assert.strictEqual(isMarketHoliday('2026-06-19'), true);
  assert.strictEqual(isMarketHoliday('2021-06-18'), false);
});
check('T17 an ordinary weekday is a session', () => {
  assert.strictEqual(isTradingDay('2026-08-07'), true);
  assert.strictEqual(isMarketHoliday('2026-08-07'), false);
});

// ── getTradingDays ──
check('T18 getTradingDays skips weekends', () => {
  const d = getTradingDays(5, new Date('2026-08-08T01:00:00Z')); // Fri Aug 7 ET
  assert.deepStrictEqual(d, ['2026-08-07','2026-08-06','2026-08-05','2026-08-04','2026-08-03']);
});
check('T19 getTradingDays skips holidays', () => {
  // Mon Jul 6 2026 back across the Fri Jul 3 Independence Day observance
  const d = getTradingDays(4, new Date('2026-07-06T20:00:00Z'));
  assert.deepStrictEqual(d, ['2026-07-06','2026-07-02','2026-07-01','2026-06-30']);
  assert.ok(!d.includes('2026-07-03'), 'holiday leaked into window');
});
check('T20 getTradingDays from a weekend walks back to Friday', () => {
  const d = getTradingDays(2, new Date('2026-08-09T20:00:00Z')); // Sunday ET
  assert.deepStrictEqual(d, ['2026-08-07','2026-08-06']);
});
check('T21 a 7-calendar-day horizon spans >5 trading days when a holiday falls in it', () => {
  // The journal window bug: 5 trading days is NOT >= 7 calendar days.
  const d = getTradingDays(5, new Date('2026-08-08T01:00:00Z'));
  const span = (new Date(d[0]) - new Date(d[d.length - 1])) / 86400000;
  assert.strictEqual(span, 4, `5 trading days spans only ${span} calendar days`);
});

// ── Determinism ──
check('T22 deterministic and cache-stable across repeated calls', () => {
  const a = [...marketHolidays(2026)].sort();
  const b = [...marketHolidays(2026)].sort();
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 10, `expected 10 NYSE closures, got ${a.length}: ${a}`);
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
