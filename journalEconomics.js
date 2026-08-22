// VESTEX — ECONOMIC SCOREBOARD V1
//
// A SECOND, INDEPENDENT evaluation metric. This is a measurement change, not an
// intelligence change. Nothing in this file scores a stock, ranks a symbol, or
// influences a decision. It grades outcomes that already happened.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The original metric (JOURNAL_COMPARISON_RULES + journalIsCorrect /
// journalHypotheticalReturn / journalDetermineWinner, all in server.js) asks:
//
//     "Was the decision classified correctly?"
//
// It puts HOLD and WAIT in one `holdFamily` and grades both with |ret| <= 5%,
// and it maps both to a hypothetical return of 0. Every V1-vs-V2 divergence in
// the ledger through 2026-08-21 — all nine of them — is WAIT -> HOLD. So the
// original metric can never return v1_better or v2_better on the only rows
// where the engines actually disagree. The gate can reach 30 observations and
// report 0-0. That is a ruler with no markings, not a tie.
//
// This metric asks a different question:
//
//     "If a user followed the V1 action versus the V2 action from the same
//      snapshot and price, which action produced the better long/cash economic
//      outcome over the window?"
//
// ── Freeze contract ─────────────────────────────────────────────────────────
// The original metric is NOT modified, extended, reinterpreted or renamed. It
// stays permanently reproducible. This module is additive and lives in its own
// file specifically so it cannot touch it. The two metrics are reported side by
// side under deliberately distinct keys (v1_econ_better vs v1_better) so no
// aggregation can ever silently merge them.
//
// ── The bias this metric could introduce, and the safeguard ────────────────
// V2 systematically raises scores: across the 35 validated dual rows at the
// 2026-08-21 audit, masterScoreV2 - masterScoreV1 was +3..+7, mean +5.49, with
// ZERO negative deltas. In V1's live 37-54 band a uniform +5.5 shift crosses
// exactly one threshold: WAIT(35) -> HOLD(45). So V2's only observed behaviour
// is buying MORE MARKET EXPOSURE.
//
// An exposure-based metric applied to a rising sample will therefore score V2
// the winner by construction. That is beta, not intelligence. Consequently
// buildEconomicPartitions() is part of this module's contract, not a reporting
// convenience: results MUST be read partitioned by SPY regime, and a sample
// with no falling-market evidence is flagged betaWarning = true.
//
// Phase 1 scope. Deliberately excluded: MFE/MAE, intraperiod drawdown,
// transaction costs, slippage, taxes, position sizing, leverage, short selling.
// MFE/MAE needs bar-series data that verification does not store.

'use strict';

// ── Frozen economic action model ───────────────────────────────────────────
// Version this on ANY change to the interpretation below. A stored block always
// records the ruleVersion that produced it.
const ECON_RULES = {
  version: 1,

  // Long/cash only. VESTEX is evaluated as a beginner-oriented long/cash
  // decision system, so there is no short exposure anywhere in this model.
  //   EXPOSED -> captured return = +returnPct
  //   CASH    -> captured return = 0
  exposedFamily: ['STRONG BUY', 'BUY', 'BUY SMALL', 'HOLD'],
  cashFamily:    ['WAIT', 'SELL', 'STRONG SELL'],

  // SELL means "exit the long to cash", NOT "go short". A short model would be
  // -returnPct; that is what the ORIGINAL metric does, and it is intentionally
  // not reproduced here. The two metrics genuinely disagree on this point and
  // both interpretations stay on the record.
  sellIsShort: false,

  // Reused canonical threshold, NOT invented here. pipeline.js:417-422 classifies
  // actual market direction with a +/-0.5% band on a percent-unit return, in the
  // same verification path that produces the returnPct this module consumes.
  // backtest.js:26 MIN_MOVE_PCT = 0.005 is the same 0.5% in fraction units.
  // Band is inclusive: |ret| <= 0.5 is FLAT, matching pipeline.js exactly.
  spyFlatBandPct: 0.5,
  spyFlatBandSource: 'pipeline.js:417-422 (canonical), backtest.js:26 (agrees)',

  // Two captured returns are called equal within this tolerance. Same-exposure
  // decisions produce bit-identical values, so this only absorbs float noise at
  // the 2-decimal precision the ledger stores.
  equalTolerancePct: 0.01,

  horizons: ['7d', '30d'],
};

const EXPOSURE = { EXPOSED: 'EXPOSED', CASH: 'CASH' };

const ECON_WINNER = {
  V1_BETTER:       'v1_econ_better',
  V2_BETTER:       'v2_econ_better',
  EQUAL:           'econ_equal',
  PENDING:         'econ_pending',
  NOT_COMPARABLE:  'econ_not_comparable',
};

const SPY_DIR = { UP: 'UP', DOWN: 'DOWN', FLAT: 'FLAT', UNKNOWN: 'UNKNOWN' };

// Why a row is not a usable economic observation. Kept distinct from `winner`
// so telemetry can tell "waiting for the market" apart from "can never count".
const ECON_REASON = {
  OK:               'OK',
  NO_RETURN_DATA:   'NO_RETURN_DATA',
  SAME_DECISION:    'SAME_DECISION',
  MISSING_DECISION: 'MISSING_DECISION',
  UNKNOWN_DECISION: 'UNKNOWN_DECISION',
};

const round2 = (n) => (n == null || !Number.isFinite(n) ? null : +n.toFixed(2));
const isNum   = (n) => typeof n === 'number' && Number.isFinite(n);
const norm    = (d) => (typeof d === 'string' ? d.trim().toUpperCase() : null);

// ── Exposure model ─────────────────────────────────────────────────────────
// Returns EXPOSED, CASH, or null for anything unrecognised. Never guesses: an
// unknown decision string must not be silently treated as cash, because that
// would fabricate a 0% outcome for a decision we failed to understand.
function exposureOf(decision) {
  const d = norm(decision);
  if (!d) return null;
  if (ECON_RULES.exposedFamily.includes(d)) return EXPOSURE.EXPOSED;
  if (ECON_RULES.cashFamily.includes(d))    return EXPOSURE.CASH;
  return null;
}

function capturedReturn(decision, returnPct) {
  const ex = exposureOf(decision);
  if (ex === null || !isNum(returnPct)) return null;
  return ex === EXPOSURE.EXPOSED ? returnPct : 0;
}

function classifySpyDirection(spyReturn) {
  if (!isNum(spyReturn)) return SPY_DIR.UNKNOWN;
  if (spyReturn >  ECON_RULES.spyFlatBandPct) return SPY_DIR.UP;
  if (spyReturn < -ECON_RULES.spyFlatBandPct) return SPY_DIR.DOWN;
  return SPY_DIR.FLAT;
}

// ── Benchmark methodology, stated explicitly ───────────────────────────────
// spyRelative = capturedReturn - spyReturn, applied identically to both
// exposure classes. A cash decision while SPY rose 2% scores -2: sitting out a
// rising benchmark IS underperformance of that benchmark, and hiding that would
// flatter every WAIT.
//
// Known and deliberate limitation: for two long/cash actions on the SAME symbol
// over the SAME window, subtracting the same spyReturn from both is
// order-preserving. SPY-relative therefore CANNOT neutralise the exposure bias
// described in the header, and the winner is decided on absolute captured
// return. Only the regime partition exposes that bias. Test R3 pins this.
function spyRelative(captured, spyReturn) {
  if (!isNum(captured) || !isNum(spyReturn)) return null;
  return round2(captured - spyReturn);
}

// ── Per-entry economic evaluation ──────────────────────────────────────────
// `src` is an existing verification block (verification7d / verification30d).
// It is read, never mutated. Nothing here recomputes a price or a return.
function buildEconomicBlock(src, decisionV1, decisionV2, { now = Date.now() } = {}) {
  const d1  = norm(decisionV1);
  const d2  = norm(decisionV2);
  const ret = src && src.returnPct;
  const spy = src && src.spyReturn;

  const base = {
    ruleVersion:  ECON_RULES.version,
    decisionV1:   d1,
    decisionV2:   d2,
    exposureV1:   exposureOf(d1),
    exposureV2:   exposureOf(d2),
    returnPct:    isNum(ret) ? ret : null,
    spyReturn:    isNum(spy) ? spy : null,
    spyDirection: classifySpyDirection(spy),
    v1CapturedReturn: null,
    v2CapturedReturn: null,
    v1SpyRelative:    null,
    v2SpyRelative:    null,
    economicEdge:     null,
    winner:           ECON_WINNER.NOT_COMPARABLE,
    reason:           ECON_REASON.OK,
    calculatedAt:     now,
  };

  // A decision is missing entirely — legacy pre-shadow row. Can never count.
  if (!d1 || !d2) return { ...base, reason: ECON_REASON.MISSING_DECISION };

  // A decision string we do not model. Refuse rather than assume.
  if (base.exposureV1 === null || base.exposureV2 === null) {
    return { ...base, reason: ECON_REASON.UNKNOWN_DECISION };
  }

  // Same decision = the engines never competed. NOT an economic tie.
  if (d1 === d2) return { ...base, reason: ECON_REASON.SAME_DECISION };

  // Different decisions, but the outcome has not happened yet.
  if (!isNum(ret)) {
    return { ...base, winner: ECON_WINNER.PENDING, reason: ECON_REASON.NO_RETURN_DATA };
  }

  const c1   = capturedReturn(d1, ret);
  const c2   = capturedReturn(d2, ret);
  const edge = round2(c2 - c1); // positive = V2 captured more

  let winner;
  if (Math.abs(edge) <= ECON_RULES.equalTolerancePct) winner = ECON_WINNER.EQUAL;
  else if (edge > 0)                                  winner = ECON_WINNER.V2_BETTER;
  else                                                winner = ECON_WINNER.V1_BETTER;

  return {
    ...base,
    v1CapturedReturn: round2(c1),
    v2CapturedReturn: round2(c2),
    v1SpyRelative:    spyRelative(c1, spy),
    v2SpyRelative:    spyRelative(c2, spy),
    economicEdge:     edge,
    winner,
    reason:           ECON_REASON.OK,
  };
}

// ── Day scoreboard ─────────────────────────────────────────────────────────
// Counts ONLY COMPLETE_DUAL_ENGINE rows, the same comparability gate the
// original validated scoreboard uses. Two definitions of "countable" would
// eventually disagree, and the disagreement would decide the promotion gate.
const COMPLETE_DUAL_ENGINE = 'COMPLETE_DUAL_ENGINE';

function buildEconomicScoreboard(entries, { horizon = 'economic7d' } = {}) {
  const sb = {
    ruleVersion: ECON_RULES.version,
    v1_econ_better: 0, v2_econ_better: 0, econ_equal: 0,
    econ_pending: 0, econ_not_comparable: 0,
    excluded: 0, excludedByClass: {},
    comparableObservations: 0,
  };

  for (const sym of Object.keys(entries || {})) {
    const e   = entries[sym] || {};
    const cls = e.comparabilityClass ?? 'V2_NOT_CAPTURED';

    if (cls !== COMPLETE_DUAL_ENGINE) {
      sb.excluded++;
      sb.excludedByClass[cls] = (sb.excludedByClass[cls] || 0) + 1;
      continue;
    }

    const w = e[horizon]?.winner;
    if (w && sb[w] !== undefined) sb[w]++;
    else sb.econ_pending++; // no block yet (pre-backfill doc) = not yet measured

    if (w === ECON_WINNER.V1_BETTER || w === ECON_WINNER.V2_BETTER ||
        w === ECON_WINNER.EQUAL) sb.comparableObservations++;
  }
  return sb;
}

// ── Regime partitions — THE BETA SAFEGUARD ─────────────────────────────────
// Never present an aggregate economic result without these. If every V2 win
// came from a rising tape, that must be visible in the same object.
function _emptyPartition() {
  return {
    comparableObservations: 0,
    v1_econ_better: 0, v2_econ_better: 0, econ_equal: 0,
    v1CumulativeReturn: 0, v2CumulativeReturn: 0,
    v1AverageReturn: null, v2AverageReturn: null,
    v1SpyRelativeCumulative: 0, v2SpyRelativeCumulative: 0,
    v1SpyRelativeAverage: null, v2SpyRelativeAverage: null,
  };
}

function _accumulate(p, b) {
  p.comparableObservations++;
  if (p[b.winner] !== undefined) p[b.winner]++;
  p.v1CumulativeReturn = round2(p.v1CumulativeReturn + (b.v1CapturedReturn || 0));
  p.v2CumulativeReturn = round2(p.v2CumulativeReturn + (b.v2CapturedReturn || 0));
  if (isNum(b.v1SpyRelative)) p.v1SpyRelativeCumulative = round2(p.v1SpyRelativeCumulative + b.v1SpyRelative);
  if (isNum(b.v2SpyRelative)) p.v2SpyRelativeCumulative = round2(p.v2SpyRelativeCumulative + b.v2SpyRelative);
}

function _finalize(p) {
  const n = p.comparableObservations;
  if (n > 0) {
    p.v1AverageReturn = round2(p.v1CumulativeReturn / n);
    p.v2AverageReturn = round2(p.v2CumulativeReturn / n);
    p.v1SpyRelativeAverage = round2(p.v1SpyRelativeCumulative / n);
    p.v2SpyRelativeAverage = round2(p.v2SpyRelativeCumulative / n);
  }
  return p;
}

function buildEconomicPartitions(blocks) {
  const out = {
    ruleVersion: ECON_RULES.version,
    ALL: _emptyPartition(),
    SPY_UP: _emptyPartition(),
    SPY_DOWN: _emptyPartition(),
    SPY_FLAT: _emptyPartition(),
    SPY_UNKNOWN: _emptyPartition(),
    exposureProfile: { v2MoreExposed: 0, v1MoreExposed: 0, sameExposure: 0, oneSided: false },
    betaWarning: false,
    betaWarningReason: null,
  };

  const COMPARABLE = [ECON_WINNER.V1_BETTER, ECON_WINNER.V2_BETTER, ECON_WINNER.EQUAL];

  for (const b of (blocks || [])) {
    if (!b || !COMPARABLE.includes(b.winner)) continue;

    _accumulate(out.ALL, b);
    const key = 'SPY_' + (b.spyDirection || SPY_DIR.UNKNOWN);
    if (out[key]) _accumulate(out[key], b);

    // Which engine took more market exposure on this row
    if (b.exposureV1 === b.exposureV2) out.exposureProfile.sameExposure++;
    else if (b.exposureV2 === EXPOSURE.EXPOSED) out.exposureProfile.v2MoreExposed++;
    else out.exposureProfile.v1MoreExposed++;
  }

  for (const k of ['ALL', 'SPY_UP', 'SPY_DOWN', 'SPY_FLAT', 'SPY_UNKNOWN']) _finalize(out[k]);

  const ep = out.exposureProfile;
  const directional = ep.v1MoreExposed + ep.v2MoreExposed;
  ep.oneSided = directional > 0 && (ep.v1MoreExposed === 0 || ep.v2MoreExposed === 0);

  // The verdict is unsafe to read while either condition holds.
  const reasons = [];
  if (out.SPY_DOWN.comparableObservations === 0 && out.ALL.comparableObservations > 0) {
    reasons.push('no comparable observations in a SPY_DOWN regime — an exposure-based ' +
                 'result cannot be distinguished from beta');
  }
  if (ep.oneSided) {
    const side = ep.v2MoreExposed === 0 ? 'V1' : 'V2';
    reasons.push(`exposure profile is one-sided (${side} took more market exposure on ` +
                 `every divergence) — the metric is measuring exposure, not selection`);
  }
  if (reasons.length) {
    out.betaWarning = true;
    out.betaWarningReason = reasons.join('; ');
  }
  return out;
}

module.exports = {
  ECON_RULES, ECON_WINNER, ECON_REASON, EXPOSURE, SPY_DIR,
  exposureOf, capturedReturn, classifySpyDirection, spyRelative,
  buildEconomicBlock, buildEconomicScoreboard, buildEconomicPartitions,
};
