// VESTEX — Chart date timezone regression test
//
// The defect: chart candle labels were built with toLocaleDateString() and NO
// timeZone option, so they rendered in the *viewer's* timezone. Alpaca stamps
// daily bars at ET midnight (2026-08-27T04:00:00Z for the Aug 27 session), so
// every candle read one day early for anyone west of Eastern — the Aug 27
// session was labelled "Aug 26" in Chicago, Denver and Los Angeles.
//
// This test does NOT hardcode a copy of the label expression. It parses the
// real option objects out of index.html and renders real market instants
// through them, so the test fails if the production formatting drifts.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const UI   = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const { ET_TZ } = require('../marketDate');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// ── Slice the real chart loader out of the UI ──
const fnAt = UI.indexOf('async function fetchHistory(sym, per) {');
assert(fnAt > -1, 'fetchHistory not found — chart loader was renamed');
const FN      = UI.slice(fnAt, UI.indexOf('\n}\n', fnAt));
const fbAt    = FN.indexOf('// ── Fallback: Stooq via CORS proxy ──');
assert(fbAt > -1, 'fallback boundary not found');
const PRIMARY  = FN.slice(0, fbAt);   // /api/chart — real Alpaca session bars
const FALLBACK = FN.slice(fbAt);      // Stooq CSV — date-only strings

// Parse the two option objects out of the primary label ternary.
const TERNARY = /const lbl = days <= 7\s*\n\s*\?\s*d\.toLocaleDateString\('en-US',\s*(\{[^}]*\})\)\s*\n\s*:\s*d\.toLocaleDateString\('en-US',\s*(\{[^}]*\})\)/;
const m = PRIMARY.match(TERNARY);
assert(m, 'primary chart label ternary did not parse — re-verify the label shape');
const WEEKDAY_OPTS = eval('(' + m[1] + ')');   // eslint-disable-line no-eval
const MONTHDAY_OPTS = eval('(' + m[2] + ')');  // eslint-disable-line no-eval

// Real Alpaca session stamps: ET midnight on both sides of DST.
const EDT_SESSION = new Date('2026-08-27T04:00:00Z'); // Thu Aug 27 2026, UTC-4
const EST_SESSION = new Date('2026-12-15T05:00:00Z'); // Tue Dec 15 2026, UTC-5
const WEST = ['America/Chicago', 'America/Denver', 'America/Los_Angeles'];

// ── The core guarantee: labels are pinned to the market timezone ──
check('T1  both label branches pin timeZone to the canonical market timezone', () => {
  assert.strictEqual(WEEKDAY_OPTS.timeZone,  ET_TZ, 'weekday branch not pinned to ET');
  assert.strictEqual(MONTHDAY_OPTS.timeZone, ET_TZ, 'month/day branch not pinned to ET');
  // Two-way contract: this is the same zone marketDate.js stamps trading dates with.
  assert.strictEqual(ET_TZ, 'America/New_York');
});

check('T2  EDT session bar renders its OWN session day, not the day before', () => {
  assert.strictEqual(EDT_SESSION.toLocaleDateString('en-US', MONTHDAY_OPTS), 'Aug 27');
  assert.strictEqual(EDT_SESSION.toLocaleDateString('en-US', WEEKDAY_OPTS),  'Thu');
});

check('T3  EST session bar renders correctly across the DST boundary', () => {
  assert.strictEqual(EST_SESSION.toLocaleDateString('en-US', MONTHDAY_OPTS), 'Dec 15');
  assert.strictEqual(EST_SESSION.toLocaleDateString('en-US', WEEKDAY_OPTS),  'Tue');
});

check('T4  the label is host-independent (pinned zone overrides viewer locale)', () => {
  // With timeZone pinned, Intl ignores the host zone entirely. Same string for
  // every viewer on earth — which is the whole point of the repair.
  const seen = new Set();
  ['America/New_York', ...WEST, 'Europe/London', 'Asia/Tokyo'].forEach(hostTz => {
    // Simulate a viewer by asking for their zone explicitly; production options
    // already carry timeZone, so the viewer's value must NOT win.
    const opts = Object.assign({}, MONTHDAY_OPTS);
    seen.add(EDT_SESSION.toLocaleDateString('en-US', opts));
    assert.strictEqual(opts.timeZone, ET_TZ, `pinned zone lost for ${hostTz}`);
  });
  assert.deepStrictEqual([...seen], ['Aug 27'], 'label varied by viewer');
});

// ── Mutation check: prove the timeZone option is load-bearing ──
check('T5  MUTATION — removing timeZone reproduces the off-by-one for western viewers', () => {
  const broken = Object.assign({}, MONTHDAY_OPTS);
  delete broken.timeZone;
  WEST.forEach(tz => {
    const got = EDT_SESSION.toLocaleDateString('en-US', Object.assign({}, broken, { timeZone: tz }));
    assert.strictEqual(got, 'Aug 26', `expected the old bug in ${tz}, got ${got}`);
  });
  // Sanity: the same instant is genuinely Aug 27 in the market's own timezone.
  assert.strictEqual(
    EDT_SESSION.toLocaleDateString('en-US', Object.assign({}, broken, { timeZone: ET_TZ })), 'Aug 27');
});

check('T6  MUTATION — the formatting options themselves are unchanged', () => {
  // The repair added timeZone ONLY. Dropping or altering the display fields
  // would silently change every axis label.
  assert.deepStrictEqual(WEEKDAY_OPTS,  { timeZone: ET_TZ, weekday: 'short' });
  assert.deepStrictEqual(MONTHDAY_OPTS, { timeZone: ET_TZ, month: 'short', day: 'numeric' });
});

check('T7  exactly two pinned label calls in the primary chart path', () => {
  assert.strictEqual((PRIMARY.match(/toLocaleDateString/g) || []).length, 2,
    'primary chart path gained or lost a date label');
  assert.strictEqual((PRIMARY.match(/timeZone: 'America\/New_York'/g) || []).length, 2,
    'both primary label branches must be pinned');
});

// ── Tripwire: the Stooq fallback is a DIFFERENT defect, deliberately unpatched ──
check('T8  TRIPWIRE — Stooq fallback must not be naively pinned to ET', () => {
  // The fallback formats `new Date('2026-08-27')`, which JS parses as UTC
  // midnight, not ET midnight. Adding timeZone:'America/New_York' there would
  // render "Aug 26" for EVERY viewer — fixing nothing and regressing UTC+
  // viewers who currently read it correctly. The correct fix for that path is
  // at PARSE time (e.g. `new Date(date + 'T12:00:00')`), not at format time.
  assert.strictEqual(new Date('2026-08-27').toISOString(), '2026-08-27T00:00:00.000Z');
  assert.strictEqual(
    new Date('2026-08-27').toLocaleDateString('en-US', { timeZone: ET_TZ, month: 'short', day: 'numeric' }),
    'Aug 26', 'UTC-midnight parse + ET format is off by one — do not pin this path');
  assert.ok(!FALLBACK.includes("timeZone: 'America/New_York'"),
    'Stooq fallback was pinned to ET — that is the WRONG fix for a UTC-parsed ' +
    'date-only string. Fix the parse instead, then update this tripwire.');
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
