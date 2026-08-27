// VESTEX — Phase B regression test: win-rate provenance and accuracy decomposition
// are reported truthfully, WITHOUT touching intelligence.
//
// The claim under test has two halves:
//   1. brain.js emits camelCase provenance (winRateSource / winRateUses / _resolvedRate).
//      masterIntelligence.js must serialize those actual fields, and must keep the
//      pre-existing `winRate` seed semantics intact so persisted records stay readable.
//   2. Displayed accuracy must separate direction calls from HOLD/WAIT outcomes, using
//      the same decision family the verifier uses.
//
// Fixtures are deliberately built so that seed != resolved and overall != directional.
// A wrong mapping cannot pass by coincidence.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const { buildMasterIntelligence } = require(path.join(ROOT, 'masterIntelligence.js'));
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'),  'utf8').replace(/\r\n/g, '\n');
const UI     = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// ── Pattern fixtures shaped exactly like brain.js mkMatch() output ──
// Seed and resolved values are far apart on purpose: reading the wrong one is visible.
const PATTERNS = [
  { pattern_id:'MH-012', name:'Verified pattern', category:'marketHistory', direction:'bullish',
    win_rate: 73, winRateSource:'VERIFIED',   winRateUses: 238, _resolvedRate: 0.471, score: 3 },
  { pattern_id:'HC-001', name:'Hand coded pattern', category:'technical', direction:'bullish',
    win_rate: 62, winRateSource:'HAND_CODED', winRateUses: 19,  _resolvedRate: 0.62,  score: 2 },
  { pattern_id:'DF-001', name:'Default pattern', category:'psychology', direction:'bearish',
    win_rate: null, winRateSource:'DEFAULT',  winRateUses: 0,   _resolvedRate: 0.55,  score: 1 },
];

function buildMI(patterns = PATTERNS) {
  return buildMasterIntelligence(
    'TEST',
    { rsi: 55, macd: 0.2, sma7: 150, sma21: 148, volSpike: false, streak: 0, atrPct: 1.5, price: 150, score: 50 },
    { brainVault: { activePercent: 50, scoreBreakdown: {} }, active_patterns: patterns },
    [], { score: 50, overall: 'neutral' }, {}, { latest_predictions: {} }, 50, 18
  );
}

const mi = buildMI();
const byId = {};
(mi.topPatterns || []).forEach(p => { byId[p.patternId] = p; });

// ── TEST 1 — resolved value is exposed and the seed field keeps its old meaning ──
check('T1  seed and resolved rate are BOTH present and are not confused', () => {
  const p = byId['MH-012'];
  assert.ok(p, 'MH-012 missing from topPatterns');
  assert.strictEqual(p.winRate, 73, 'winRate must still carry the seed value (schema stability)');
  assert.strictEqual(p.winRateResolved, 47.1, 'winRateResolved must expose _resolvedRate as a percentage');
  assert.notStrictEqual(p.winRate, p.winRateResolved, 'fixture is vacuous if seed == resolved');
});

// ── TEST 2 — winRateSource survives brain -> MI -> serialized output ──
check('T2  winRateSource survives serialization and is never silently null', () => {
  assert.strictEqual(byId['MH-012'].winRateSource, 'VERIFIED');
  assert.strictEqual(byId['HC-001'].winRateSource, 'HAND_CODED');
  assert.strictEqual(byId['DF-001'].winRateSource, 'DEFAULT');
  const nulls = mi.topPatterns.filter(p => p.winRateSource == null);
  assert.strictEqual(nulls.length, 0, `${nulls.length} pattern(s) lost provenance in serialization`);
});

// ── TEST 3 — winRateUses survives the same path with its registry semantics ──
check('T3  winRateUses survives serialization, including a legitimate zero', () => {
  assert.strictEqual(byId['MH-012'].winRateUses, 238);
  assert.strictEqual(byId['HC-001'].winRateUses, 19);
  // DEFAULT genuinely has 0 observations. `|| null` would have destroyed that fact.
  assert.strictEqual(byId['DF-001'].winRateUses, 0, 'zero observations must stay 0, not become null');
});

// ── TEST 4 — DEFAULT stays identifiable ──
check('T4  DEFAULT provenance is distinguishable from missing provenance', () => {
  assert.strictEqual(byId['DF-001'].winRateSource, 'DEFAULT');
  assert.strictEqual(byId['DF-001'].winRateResolved, 55, 'DEFAULT fallback rate must still be shown');
  // A pattern with genuinely absent provenance must NOT be labelled DEFAULT by the mapper.
  const bare = buildMI([{ pattern_id:'BARE', name:'Bare', category:'technical', direction:'bullish', win_rate: 50, score: 1 }]);
  const bp   = bare.topPatterns.find(p => p.patternId === 'BARE');
  assert.strictEqual(bp.winRateSource,   null, 'absent provenance must serialize as null, not DEFAULT');
  assert.strictEqual(bp.winRateResolved, null, 'absent _resolvedRate must serialize as null, not a guess');
});

// ── TEST 5 — HAND_CODED is not promoted to VERIFIED ──
check('T5  HAND_CODED is never relabelled VERIFIED even though it carries a sample count', () => {
  const p = byId['HC-001'];
  assert.strictEqual(p.winRateSource, 'HAND_CODED');
  assert.notStrictEqual(p.winRateSource, 'VERIFIED');
  assert.strictEqual(p.winRateUses, 19, 'sub-threshold fire count must be preserved verbatim');
  // The UI badge must only print an observation count for VERIFIED, so a 19-sample
  // developer guess cannot read as evidence.
  const bStart = UI.indexOf('const wrProvenanceHtml');
  assert.ok(bStart > -1, 'wrProvenanceHtml not found in index.html');
  const badge = UI.slice(bStart, UI.indexOf('const patternsHtml', bStart));
  assert.ok(badge.includes("src === 'VERIFIED'"), 'badge must branch on VERIFIED');
  const handArm = badge.slice(badge.indexOf("src === 'HAND_CODED'"), badge.indexOf('const shown'));
  assert.ok(!/obs/.test(handArm), 'HAND_CODED badge must not advertise an observation count');
});

// ── Client-side accuracy decomposition, lifted out of index.html ──
// Loading the real source (not a copy) means deleting or breaking it fails this test.
function loadDecomposition() {
  const start = UI.indexOf('const DIRECTIONAL_DECISIONS');
  const end   = UI.indexOf('function renderAccuracyDecomposition');
  assert.ok(start > -1 && end > start, 'decomposition helpers not found in index.html');
  return new Function(UI.slice(start, end) + '; return { sumDecisionFamily, DIRECTIONAL_DECISIONS, NEUTRAL_DECISIONS };')();
}
const DEC = loadDecomposition();

// Fixture: HOLD/WAIT is strong, BUY/SELL is weak. Overall therefore flatters direction.
const BY_DECISION = {
  BUY:  { total: 30,  correct: 15, accuracy: 50.0 },
  SELL: { total: 22,  correct: 12, accuracy: 54.5 },
  HOLD: { total: 120, correct: 108, accuracy: 90.0 },
  WAIT: { total: 28,  correct: 26, accuracy: 92.9 },
};

// ── TEST 6 — overall and directional are different numbers and cannot be swapped ──
check('T6  overall accuracy != directional accuracy, and each maps to the right value', () => {
  const dir  = DEC.sumDecisionFamily(BY_DECISION, DEC.DIRECTIONAL_DECISIONS);
  const neut = DEC.sumDecisionFamily(BY_DECISION, DEC.NEUTRAL_DECISIONS);
  const allT = Object.values(BY_DECISION).reduce((s,b) => s + b.total,   0);
  const allC = Object.values(BY_DECISION).reduce((s,b) => s + b.correct, 0);
  const overall = +(allC / allT * 100).toFixed(1);

  assert.strictEqual(dir.total, 52);
  assert.strictEqual(dir.correct, 27);
  assert.strictEqual(dir.accuracy, 51.9);
  assert.strictEqual(neut.total, 148);
  assert.strictEqual(neut.correct, 134);
  assert.strictEqual(overall, 80.5);
  // The whole point of the split: the headline is 28.6 points more flattering.
  assert.ok(overall - dir.accuracy > 25, 'fixture must make the two metrics clearly different');
  assert.notStrictEqual(dir.accuracy, overall);
  assert.notStrictEqual(neut.accuracy, dir.accuracy);
});

// ── TEST 7 — directional family mirrors the verifier's own definition ──
check('T7  displayed directional set matches isDirectional() in server.js', () => {
  const m = SERVER.match(/function isDirectional\(decision\)\s*\{\s*return\s*(\[[^\]]*\])/);
  assert.ok(m, 'isDirectional() not found in server.js');
  const serverSet = new Function('return ' + m[1])();
  assert.deepStrictEqual([...DEC.DIRECTIONAL_DECISIONS].sort(), [...serverSet].sort(),
    'UI directional family drifted from the grader');
  // And the two families must not overlap, or observations would be double counted.
  const overlap = DEC.DIRECTIONAL_DECISIONS.filter(d => DEC.NEUTRAL_DECISIONS.includes(d));
  assert.deepStrictEqual(overlap, [], 'a decision cannot be both directional and neutral');
});

// ── TEST 8 — empty buckets degrade safely ──
check('T8  zero-observation buckets produce no NaN / Infinity / undefined', () => {
  for (const input of [{}, null, undefined, { BUY: { total: 0, correct: 0 } }, { HOLD: {} }]) {
    for (const fam of [DEC.DIRECTIONAL_DECISIONS, DEC.NEUTRAL_DECISIONS]) {
      const s = DEC.sumDecisionFamily(input, fam);
      assert.strictEqual(s.accuracy, null, 'empty family must yield null, not a number');
      assert.strictEqual(s.total, 0);
      assert.strictEqual(s.correct, 0);
      assert.ok(Number.isFinite(s.total) && Number.isFinite(s.correct), 'counts must stay finite');
    }
  }
  // Unknown decision labels must be ignored rather than crashing or leaking in.
  const s = DEC.sumDecisionFamily({ MYSTERY: { total: 99, correct: 99 } }, DEC.DIRECTIONAL_DECISIONS);
  assert.strictEqual(s.total, 0, 'unknown decision labels must not enter the directional bucket');
});

// ── TEST 9 — the display fix did NOT leak into confidence ──
// Historical Validation is a known BEHAVIORAL defect held back from this phase. It reads
// brain.patterns[].winRate (a field mkMatch never emits), so it must still pin to the
// neutral default of 5 points. If a future display edit changes this, confidence moves
// and the frozen experiment is contaminated.
check('T9  Historical Validation remains pinned at the neutral 5 pts (behavioral freeze)', () => {
  const hv = (mi.confidenceBreakdown || []).find(b => b.label === 'Historical Validation');
  assert.ok(hv, 'Historical Validation missing from confidence breakdown');
  assert.strictEqual(hv.pts, 5, 'confidence moved — the display patch leaked into scoring');
  assert.ok(/neutral default/i.test(hv.note), 'note should still report the neutral default');
});

// ── TEST 10 — no seed-rate leakage into the scoring path ──
check('T10 topPatterns is an output-only projection (no scoring field mutated)', () => {
  // The mapper must not write back onto the brain pattern objects.
  PATTERNS.forEach(p => {
    assert.ok(!('winRateResolved' in p), 'mapper mutated the brain pattern object');
    assert.strictEqual(typeof p._resolvedRate, 'number', '_resolvedRate must remain untouched');
  });
  assert.strictEqual(PATTERNS[0]._resolvedRate, 0.471);
  assert.strictEqual(PATTERNS[0].win_rate, 73);
  // And the serialized rate must be a clean number, never a string or NaN.
  mi.topPatterns.forEach(p => {
    if (p.winRateResolved !== null) {
      assert.strictEqual(typeof p.winRateResolved, 'number');
      assert.ok(Number.isFinite(p.winRateResolved), 'winRateResolved must be finite');
      assert.ok(p.winRateResolved >= 0 && p.winRateResolved <= 100, 'resolved rate out of percent range');
    }
  });
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
