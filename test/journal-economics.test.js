// VESTEX — Economic Scoreboard V1 regression test
//
// The property under test: this metric must be able to distinguish decisions
// that the ORIGINAL correctness metric cannot. WAIT and HOLD share one
// holdFamily in JOURNAL_COMPARISON_RULES, so every WAIT->HOLD divergence in the
// ledger grades identically under the original rules and can never produce
// v1_better / v2_better. All 9 divergences recorded to 2026-08-21 are WAIT->HOLD.
//
// This metric asks a different question: exposed to the move, or in cash?
//
// It must ALSO refuse to flatter V2. V2 systematically converts WAIT -> HOLD
// (mean masterScore delta +5.49, zero negatives across 35 rows), i.e. it buys
// more market exposure. In a rising sample an exposure metric wins by
// construction. The regime partition is therefore part of the contract, not a
// reporting nicety, and is tested as such.

const assert = require('assert');
const {
  ECON_RULES, ECON_WINNER, EXPOSURE,
  exposureOf, capturedReturn, classifySpyDirection,
  buildEconomicBlock, buildEconomicScoreboard, buildEconomicPartitions,
} = require('../journalEconomics');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// Minimal source verification block, shaped like the real verification7d
const V = (returnPct, spyReturn = 0) => ({ returnPct, spyReturn, verifiedAt: 1_700_000_000_000 });
const blk = (v1, v2, ver) => buildEconomicBlock(ver, v1, v2, { now: 1_700_000_000_000 });

// ─────────────────────────────────────────────────────────────
//  Exposure model — the frozen action interpretation
// ─────────────────────────────────────────────────────────────

check('E1 BUY family is EXPOSED', () => {
  for (const d of ['BUY', 'STRONG BUY', 'BUY SMALL']) {
    assert.strictEqual(exposureOf(d), EXPOSURE.EXPOSED, d);
  }
});

check('E2 HOLD is EXPOSED (already in the market)', () => {
  assert.strictEqual(exposureOf('HOLD'), EXPOSURE.EXPOSED);
});

check('E3 WAIT is CASH (no new exposure)', () => {
  assert.strictEqual(exposureOf('WAIT'), EXPOSURE.CASH);
});

check('E4 SELL family is CASH — exit to cash, NEVER short', () => {
  for (const d of ['SELL', 'STRONG SELL']) {
    assert.strictEqual(exposureOf(d), EXPOSURE.CASH, d);
  }
});

check('E5 SELL captured return is 0, not -returnPct (no short exposure)', () => {
  assert.strictEqual(capturedReturn('SELL', 10), 0);
  assert.strictEqual(capturedReturn('SELL', -10), 0);
  assert.strictEqual(capturedReturn('STRONG SELL', -42), 0);
});

check('E6 captured return is binary — no leverage, no partial exposure', () => {
  assert.strictEqual(capturedReturn('HOLD', 7.5), 7.5);
  assert.strictEqual(capturedReturn('BUY', 7.5), 7.5);
  assert.strictEqual(capturedReturn('WAIT', 7.5), 0);
  assert.strictEqual(capturedReturn('SELL', 7.5), 0);
});

check('E7 unknown/null decision has no exposure and no captured return', () => {
  assert.strictEqual(exposureOf(null), null);
  assert.strictEqual(exposureOf('BANANA'), null);
  assert.strictEqual(capturedReturn(null, 5), null);
});

// ─────────────────────────────────────────────────────────────
//  Prompt test matrix A-J
// ─────────────────────────────────────────────────────────────

check('A  WAIT vs HOLD, stock +3% -> V2 econ better (0 vs +3)', () => {
  const r = blk('WAIT', 'HOLD', V(3));
  assert.strictEqual(r.v1CapturedReturn, 0);
  assert.strictEqual(r.v2CapturedReturn, 3);
  assert.strictEqual(r.economicEdge, 3);
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
});

check('B  WAIT vs HOLD, stock -6% -> V1 econ better (cash avoided the loss)', () => {
  const r = blk('WAIT', 'HOLD', V(-6));
  assert.strictEqual(r.v1CapturedReturn, 0);
  assert.strictEqual(r.v2CapturedReturn, -6);
  assert.strictEqual(r.economicEdge, -6);
  assert.strictEqual(r.winner, ECON_WINNER.V1_BETTER);
});

check('C  HOLD vs WAIT, stock +8% -> V1 econ better', () => {
  const r = blk('HOLD', 'WAIT', V(8));
  assert.strictEqual(r.v1CapturedReturn, 8);
  assert.strictEqual(r.v2CapturedReturn, 0);
  assert.strictEqual(r.winner, ECON_WINNER.V1_BETTER);
});

check('D  HOLD vs WAIT, stock -8% -> V2 econ better', () => {
  const r = blk('HOLD', 'WAIT', V(-8));
  assert.strictEqual(r.v1CapturedReturn, -8);
  assert.strictEqual(r.v2CapturedReturn, 0);
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
});

check('E  SELL vs HOLD, stock -10% -> V1 econ better (0 vs -10)', () => {
  const r = blk('SELL', 'HOLD', V(-10));
  assert.strictEqual(r.v1CapturedReturn, 0);
  assert.strictEqual(r.v2CapturedReturn, -10);
  assert.strictEqual(r.winner, ECON_WINNER.V1_BETTER);
});

check('F  SELL vs HOLD, stock +10% -> V2 econ better (0 vs +10)', () => {
  const r = blk('SELL', 'HOLD', V(10));
  assert.strictEqual(r.v1CapturedReturn, 0);
  assert.strictEqual(r.v2CapturedReturn, 10);
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
});

check('G  BUY vs HOLD -> different decisions, same exposure -> econ_equal', () => {
  const r = blk('BUY', 'HOLD', V(4.2));
  assert.strictEqual(r.v1CapturedReturn, 4.2);
  assert.strictEqual(r.v2CapturedReturn, 4.2);
  assert.strictEqual(r.economicEdge, 0);
  assert.strictEqual(r.winner, ECON_WINNER.EQUAL);
});

check('H  WAIT vs SELL -> different decisions, both cash -> econ_equal', () => {
  const r = blk('WAIT', 'SELL', V(9));
  assert.strictEqual(r.v1CapturedReturn, 0);
  assert.strictEqual(r.v2CapturedReturn, 0);
  assert.strictEqual(r.winner, ECON_WINNER.EQUAL);
});

check('I  HOLD vs HOLD -> econ_not_comparable, NOT econ_equal', () => {
  const r = blk('HOLD', 'HOLD', V(5));
  assert.strictEqual(r.winner, ECON_WINNER.NOT_COMPARABLE);
  assert.notStrictEqual(r.winner, ECON_WINNER.EQUAL);
});

check('I2 same decision never counts as an economic observation', () => {
  for (const d of ['BUY', 'HOLD', 'WAIT', 'SELL']) {
    assert.strictEqual(blk(d, d, V(3)).winner, ECON_WINNER.NOT_COMPARABLE, d);
  }
});

check('J  missing verification -> econ_pending', () => {
  assert.strictEqual(blk('WAIT', 'HOLD', null).winner, ECON_WINNER.PENDING);
  assert.strictEqual(blk('WAIT', 'HOLD', V(null)).winner, ECON_WINNER.PENDING);
  assert.strictEqual(blk('WAIT', 'HOLD', V(undefined)).winner, ECON_WINNER.PENDING);
});

check('J2 pending is distinguished from not_comparable by reason', () => {
  assert.strictEqual(blk('WAIT', 'HOLD', null).reason, 'NO_RETURN_DATA');
  assert.strictEqual(blk('HOLD', 'HOLD', V(3)).reason, 'SAME_DECISION');
  assert.strictEqual(blk('WAIT', null, V(3)).reason, 'MISSING_DECISION');
});

// ─────────────────────────────────────────────────────────────
//  SPY direction — canonical 0.5% band reused from pipeline.js
// ─────────────────────────────────────────────────────────────

check('S1 SPY direction uses the canonical 0.5% flat band', () => {
  assert.strictEqual(ECON_RULES.spyFlatBandPct, 0.5);
});

check('S2 SPY UP / DOWN / FLAT classification', () => {
  assert.strictEqual(classifySpyDirection(2), 'UP');
  assert.strictEqual(classifySpyDirection(-2), 'DOWN');
  assert.strictEqual(classifySpyDirection(0), 'FLAT');
  assert.strictEqual(classifySpyDirection(0.3), 'FLAT');
  assert.strictEqual(classifySpyDirection(-0.3), 'FLAT');
});

check('S3 exact threshold boundaries are FLAT (inclusive band, matches pipeline.js)', () => {
  assert.strictEqual(classifySpyDirection(0.5), 'FLAT');
  assert.strictEqual(classifySpyDirection(-0.5), 'FLAT');
  assert.strictEqual(classifySpyDirection(0.51), 'UP');
  assert.strictEqual(classifySpyDirection(-0.51), 'DOWN');
});

check('S4 missing SPY data -> UNKNOWN, never silently FLAT', () => {
  assert.strictEqual(classifySpyDirection(null), 'UNKNOWN');
  assert.strictEqual(classifySpyDirection(undefined), 'UNKNOWN');
  assert.strictEqual(classifySpyDirection(NaN), 'UNKNOWN');
});

check('S5 missing SPY data does not block the economic verdict', () => {
  const r = blk('WAIT', 'HOLD', { returnPct: 3, spyReturn: null });
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
  assert.strictEqual(r.spyDirection, 'UNKNOWN');
  assert.strictEqual(r.v1SpyRelative, null);
  assert.strictEqual(r.v2SpyRelative, null);
});

// ─────────────────────────────────────────────────────────────
//  SPY-relative formula — documented, not hidden
// ─────────────────────────────────────────────────────────────

check('R1 spyRelative = capturedReturn - spyReturn, for BOTH exposure classes', () => {
  const r = blk('WAIT', 'HOLD', V(3, 2));
  assert.strictEqual(r.v1SpyRelative, -2); // cash while SPY rose 2% = underperformed by 2
  assert.strictEqual(r.v2SpyRelative, 1);  // 3 - 2
});

check('R2 cash in a falling market outperforms the benchmark', () => {
  const r = blk('WAIT', 'HOLD', V(-4, -3));
  assert.strictEqual(r.v1SpyRelative, 3);  // 0 - (-3)
  assert.strictEqual(r.v2SpyRelative, -1); // -4 - (-3)
});

check('R3 SPY-relative does NOT change the winner — absolute captured return decides', () => {
  // Documented limitation: benchmark-relative ranking of two long/cash actions on the
  // same symbol is order-preserving, so it cannot neutralise the exposure bias.
  // Only the regime partition can. This test pins that fact.
  const r = blk('WAIT', 'HOLD', V(3, 99));
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
});

// ─────────────────────────────────────────────────────────────
//  Equality tolerance
// ─────────────────────────────────────────────────────────────

check('T1 equality tolerance is explicit and frozen', () => {
  assert.strictEqual(typeof ECON_RULES.equalTolerancePct, 'number');
  assert.strictEqual(ECON_RULES.equalTolerancePct, 0.01);
});

check('T2 edge within tolerance is econ_equal', () => {
  const r = buildEconomicBlock(
    { returnPct: 0.005, spyReturn: 0 }, 'WAIT', 'HOLD', { now: 1 });
  assert.strictEqual(r.winner, ECON_WINNER.EQUAL);
});

check('T3 edge just outside tolerance is a win', () => {
  const r = buildEconomicBlock(
    { returnPct: 0.02, spyReturn: 0 }, 'WAIT', 'HOLD', { now: 1 });
  assert.strictEqual(r.winner, ECON_WINNER.V2_BETTER);
});

// ─────────────────────────────────────────────────────────────
//  Malformed / legacy / adversarial rows
// ─────────────────────────────────────────────────────────────

check('M1 null V2 decision (legacy pre-shadow row) -> not_comparable, no throw', () => {
  const r = blk('HOLD', null, V(3));
  assert.strictEqual(r.winner, ECON_WINNER.NOT_COMPARABLE);
  assert.strictEqual(r.reason, 'MISSING_DECISION');
});

check('M2 both decisions null -> not_comparable, no throw', () => {
  assert.strictEqual(blk(null, null, V(3)).winner, ECON_WINNER.NOT_COMPARABLE);
});

check('M3 unrecognised decision string -> not_comparable, never guessed', () => {
  const r = blk('WAIT', 'MAYBE', V(3));
  assert.strictEqual(r.winner, ECON_WINNER.NOT_COMPARABLE);
  assert.strictEqual(r.reason, 'UNKNOWN_DECISION');
});

check('M4 string return is rejected, not coerced', () => {
  const r = blk('WAIT', 'HOLD', { returnPct: '3', spyReturn: 0 });
  assert.strictEqual(r.winner, ECON_WINNER.PENDING);
});

check('M5 undefined verification object -> pending, no throw', () => {
  assert.doesNotThrow(() => blk('WAIT', 'HOLD', undefined));
});

check('M6 case and whitespace in decisions are normalised', () => {
  assert.strictEqual(exposureOf(' hold '), EXPOSURE.EXPOSED);
  assert.strictEqual(exposureOf('wait'), EXPOSURE.CASH);
});

check('M7 block always records ruleVersion and calculatedAt for audit provenance', () => {
  const r = blk('WAIT', 'HOLD', V(3));
  assert.strictEqual(r.ruleVersion, ECON_RULES.version);
  assert.strictEqual(r.calculatedAt, 1_700_000_000_000);
});

check('M8 block carries its own decision copies (self-contained provenance)', () => {
  const r = blk('WAIT', 'HOLD', V(3));
  assert.strictEqual(r.decisionV1, 'WAIT');
  assert.strictEqual(r.decisionV2, 'HOLD');
});

check('M9 idempotent — same input yields identical output', () => {
  const a = blk('WAIT', 'HOLD', V(3, 1));
  const b = blk('WAIT', 'HOLD', V(3, 1));
  assert.deepStrictEqual(a, b);
});

check('M10 pure — the source verification block is never mutated', () => {
  const src = V(3, 1);
  const snapshot = JSON.parse(JSON.stringify(src));
  blk('WAIT', 'HOLD', src);
  assert.deepStrictEqual(src, snapshot);
});

// ─────────────────────────────────────────────────────────────
//  Scoreboard — comparability gate
// ─────────────────────────────────────────────────────────────

const ENTRY = (cls, v1, v2, ver) => ({
  comparabilityClass: cls, decisionV1: v1, decisionV2: v2,
  economic7d: blk(v1, v2, ver),
});

check('SB1 only COMPLETE_DUAL_ENGINE rows are counted', () => {
  const sb = buildEconomicScoreboard({
    AAPL: ENTRY('COMPLETE_DUAL_ENGINE', 'WAIT', 'HOLD', V(3)),
    TSLA: ENTRY('V2_NOT_CAPTURED',      'WAIT', 'HOLD', V(3)),
    MSFT: ENTRY('V2_INSTRUMENT_ARTIFACT','WAIT', 'HOLD', V(3)),
  });
  assert.strictEqual(sb.v2_econ_better, 1);
  assert.strictEqual(sb.excluded, 2);
});

check('SB2 scoreboard tallies every winner category', () => {
  const sb = buildEconomicScoreboard({
    A: ENTRY('COMPLETE_DUAL_ENGINE', 'WAIT', 'HOLD', V(3)),   // v2 better
    B: ENTRY('COMPLETE_DUAL_ENGINE', 'WAIT', 'HOLD', V(-3)),  // v1 better
    C: ENTRY('COMPLETE_DUAL_ENGINE', 'BUY',  'HOLD', V(3)),   // equal
    D: ENTRY('COMPLETE_DUAL_ENGINE', 'HOLD', 'HOLD', V(3)),   // not comparable
    E: ENTRY('COMPLETE_DUAL_ENGINE', 'WAIT', 'HOLD', null),   // pending
  });
  assert.strictEqual(sb.v1_econ_better, 1);
  assert.strictEqual(sb.v2_econ_better, 1);
  assert.strictEqual(sb.econ_equal, 1);
  assert.strictEqual(sb.econ_not_comparable, 1);
  assert.strictEqual(sb.econ_pending, 1);
  assert.strictEqual(sb.comparableObservations, 3);
});

check('SB3 rows with no economic block are tolerated (pre-backfill docs)', () => {
  assert.doesNotThrow(() => buildEconomicScoreboard({
    A: { comparabilityClass: 'COMPLETE_DUAL_ENGINE', decisionV1: 'HOLD' },
  }));
});

// ─────────────────────────────────────────────────────────────
//  Regime partition — the beta safeguard, contractual
// ─────────────────────────────────────────────────────────────

check('P1 partitions split by SPY direction', () => {
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', V(3, 2)),    // UP,   v2 better
    blk('WAIT', 'HOLD', V(4, 1.5)),  // UP,   v2 better
    blk('WAIT', 'HOLD', V(-5, -2)),  // DOWN, v1 better
    blk('WAIT', 'HOLD', V(1, 0.2)),  // FLAT, v2 better
  ]);
  assert.strictEqual(p.ALL.v2_econ_better, 3);
  assert.strictEqual(p.SPY_UP.v2_econ_better, 2);
  assert.strictEqual(p.SPY_DOWN.v1_econ_better, 1);
  assert.strictEqual(p.SPY_FLAT.v2_econ_better, 1);
});

check('P2 partitions report cumulative and average captured return', () => {
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', V(4, 1)),
    blk('WAIT', 'HOLD', V(6, 1)),
  ]);
  assert.strictEqual(p.SPY_UP.v1CumulativeReturn, 0);
  assert.strictEqual(p.SPY_UP.v2CumulativeReturn, 10);
  assert.strictEqual(p.SPY_UP.v1AverageReturn, 0);
  assert.strictEqual(p.SPY_UP.v2AverageReturn, 5);
});

check('P3 partitions report SPY-relative aggregates', () => {
  const p = buildEconomicPartitions([blk('WAIT', 'HOLD', V(3, 2))]);
  assert.strictEqual(p.SPY_UP.v1SpyRelativeCumulative, -2);
  assert.strictEqual(p.SPY_UP.v2SpyRelativeCumulative, 1);
});

check('P4 THE SAFEGUARD — an all-rising sample is flagged as beta-explainable', () => {
  // Exactly the real ledger shape as of 2026-08-21: every resolved divergence is
  // WAIT->HOLD in a rising tape. V2 "wins" purely by holding more exposure.
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', V(3.01, 1)),
    blk('WAIT', 'HOLD', V(6.01, 1)),
    blk('WAIT', 'HOLD', V(7.49, 1)),
  ]);
  assert.strictEqual(p.ALL.v2_econ_better, 3);
  assert.strictEqual(p.SPY_DOWN.comparableObservations, 0);
  assert.strictEqual(p.betaWarning, true);
  assert.match(p.betaWarningReason, /no .*SPY_DOWN|down/i);
});

check('P5 warning clears once falling-market evidence exists on both sides', () => {
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', V(3, 1)),
    blk('WAIT', 'HOLD', V(4, 1)),
    blk('WAIT', 'HOLD', V(-5, -2)),
    blk('WAIT', 'HOLD', V(-6, -2)),
    blk('HOLD', 'WAIT', V(-3, -2)),
  ]);
  assert.strictEqual(p.SPY_DOWN.comparableObservations, 3);
  assert.strictEqual(p.betaWarning, false);
});

check('P6 a one-sided exposure profile is reported even with DOWN evidence', () => {
  // V2 more exposed on every single row = the +5.49 signature. Must stay visible.
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', V(3, 1)),
    blk('WAIT', 'HOLD', V(-4, -2)),
  ]);
  assert.strictEqual(p.exposureProfile.v2MoreExposed, 2);
  assert.strictEqual(p.exposureProfile.v1MoreExposed, 0);
  assert.strictEqual(p.exposureProfile.oneSided, true);
});

check('P7 non-comparable and pending rows never enter a partition', () => {
  const p = buildEconomicPartitions([
    blk('HOLD', 'HOLD', V(3, 1)),
    blk('WAIT', 'HOLD', null),
  ]);
  assert.strictEqual(p.ALL.comparableObservations, 0);
  assert.strictEqual(p.ALL.v2_econ_better, 0);
});

check('P8 UNKNOWN spy rows are counted in ALL but in no regime partition', () => {
  const p = buildEconomicPartitions([
    blk('WAIT', 'HOLD', { returnPct: 3, spyReturn: null }),
  ]);
  assert.strictEqual(p.ALL.comparableObservations, 1);
  assert.strictEqual(p.SPY_UP.comparableObservations, 0);
  assert.strictEqual(p.SPY_UNKNOWN.comparableObservations, 1);
});

// ─────────────────────────────────────────────────────────────
//  The whole point: the original ruler cannot do this
// ─────────────────────────────────────────────────────────────

check('X1 WAIT->HOLD is undecidable under the original holdFamily rule', () => {
  // Mirrors server.js journalIsCorrect for the hold family: |ret| <= 5.
  const origIsCorrect = (d, r) => Math.abs(r) <= 5; // both HOLD and WAIT
  for (const ret of [3.01, 6.01, 7.49, -2.28]) {
    assert.strictEqual(origIsCorrect('WAIT', ret), origIsCorrect('HOLD', ret),
      `original rule separates WAIT/HOLD at ${ret} — assumption broken`);
  }
  // The new metric separates all of them.
  const winners = [3.01, 6.01, 7.49, -2.28].map(r => blk('WAIT', 'HOLD', V(r)).winner);
  assert.deepStrictEqual(winners, [
    ECON_WINNER.V2_BETTER, ECON_WINNER.V2_BETTER,
    ECON_WINNER.V2_BETTER, ECON_WINNER.V1_BETTER,
  ]);
});

check('X2 the new metric never writes into the original namespace', () => {
  const r = blk('WAIT', 'HOLD', V(3));
  for (const k of ['v1Correct', 'v2Correct', 'v1HypotheticalReturn',
                   'v2HypotheticalReturn', 'winner7d', 'comparisonRulesVersion']) {
    assert.strictEqual(k in r && k !== 'winner', false, `leaked original field ${k}`);
  }
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
