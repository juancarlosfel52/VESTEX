// ═══════════════════════════════════════════════════════════
//  VESTEX — Backtesting Engine
//
//  Replays Brain Vault logic day-by-day through 2 years of
//  historical Alpaca bar data and verifies each prediction
//  against actual 7-day price outcomes.
//
//  Data flow:
//    Alpaca 2yr bars → sliding 40-bar window → _computeIndicators
//    → runBrainAnalysis → predicted direction → actual 7d return
//    → correct/incorrect → stored in Firestore bt_results/{sym}
//
//  Does NOT touch: vi_predictions, brain logic, scoring weights,
//  live pipeline, or any production Firestore collections.
// ═══════════════════════════════════════════════════════════
'use strict';

const axios = require('axios');
const { runBrainAnalysis } = require('./brain');

const BT_COL       = 'bt_results';
const BARS_NEEDED  = 500;   // ~2 trading years
const WINDOW       = 40;    // bars fed to brain per day
const VERIFY_DAYS  = 7;     // days forward to check outcome
const MIN_MOVE_PCT = 0.005; // 0.5% min move to call UP/DOWN, else FLAT

// ─────────────────────────────────────────────────────────
//  Indicator math — mirrors _computeIndicators in server.js
//  Copied here so backtest.js has zero dependency on server.js
// ─────────────────────────────────────────────────────────
function _ema(c, p) {
  if (c.length < p) return null;
  const k = 2 / (p + 1);
  let e = c.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < c.length; i++) e = c[i] * k + e * (1 - k);
  return +e.toFixed(4);
}

function _computeIndicators(bars) {
  if (!bars || bars.length < 5) return null;
  const cl = bars.map(b => b.close);
  const vo = bars.map(b => b.volume);
  const sma7  = cl.length >= 7  ? cl.slice(-7).reduce((a, b) => a + b, 0) / 7   : null;
  const sma21 = cl.length >= 21 ? cl.slice(-21).reduce((a, b) => a + b, 0) / 21 : null;
  const e12   = _ema(cl, 12), e26 = _ema(cl, 26);
  const macd  = e12 && e26 ? +(e12 - e26).toFixed(4) : null;
  let rsi = null;
  if (cl.length >= 15) {
    let g = 0, l = 0;
    for (let i = cl.length - 14; i < cl.length; i++) {
      const d = cl[i] - cl[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    const ag = g / 14, al = l / 14;
    rsi = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  }
  let atr = null;
  if (bars.length >= 15) {
    let sum = 0;
    const r = bars.slice(-15);
    for (let i = 1; i < r.length; i++) {
      sum += Math.max(
        r[i].high - r[i].low,
        Math.abs(r[i].high - r[i - 1].close),
        Math.abs(r[i].low  - r[i - 1].close)
      );
    }
    atr = +(sum / 14).toFixed(4);
  }
  const price   = cl[cl.length - 1];
  const atrPct  = atr && price ? +(atr / price * 100).toFixed(2) : null;
  const volSpike = vo.length >= 10
    ? vo[vo.length - 1] > vo.slice(-10, -1).reduce((a, b) => a + b, 0) / 9 * 1.5
    : false;
  let streak = 0;
  if (cl.length >= 2) {
    const dir = cl[cl.length - 1] >= cl[cl.length - 2] ? 1 : -1;
    streak = 1;
    for (let i = cl.length - 2; i > 0; i--) {
      if ((cl[i] >= cl[i - 1] ? 1 : -1) === dir) streak++;
      else break;
    }
    streak *= dir;
  }
  return {
    sma7:     sma7  ? +sma7.toFixed(2)  : null,
    sma21:    sma21 ? +sma21.toFixed(2) : null,
    rsi, macd, volSpike, atr, atrPct, streak,
    score: 0,
  };
}

// ─────────────────────────────────────────────────────────
//  Fetch 2 years of daily bars from Alpaca
// ─────────────────────────────────────────────────────────
async function _fetchBars(sym, key, secret) {
  const end   = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);

  const resp = await axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`, {
    params: {
      timeframe:  '1Day',
      start:      start.toISOString(),
      end:        end.toISOString(),
      limit:      BARS_NEEDED,
      feed:       'iex',
      adjustment: 'raw',
    },
    headers: {
      'APCA-API-KEY-ID':     key,
      'APCA-API-SECRET-KEY': secret,
    },
    timeout: 20000,
  });

  return (resp.data.bars || []).map(b => ({
    time:   b.t,
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
  }));
}

// ─────────────────────────────────────────────────────────
//  Derive predicted direction from brain_score
// ─────────────────────────────────────────────────────────
function _brainDirection(brain_score) {
  if (brain_score >  MIN_MOVE_PCT) return 'UP';
  if (brain_score < -MIN_MOVE_PCT) return 'DOWN';
  return 'FLAT';
}

// ─────────────────────────────────────────────────────────
//  runBacktest
//  Main engine. Replays all available history, verifies
//  outcomes, and stores results in Firestore bt_results.
//
//  @param {string}  sym     — e.g. 'AAPL'
//  @param {object}  db      — Firestore instance
//  @param {string}  key     — Alpaca key
//  @param {string}  secret  — Alpaca secret
//  @returns {object}        — summary object
// ─────────────────────────────────────────────────────────
async function runBacktest(sym, db, key, secret) {
  console.log(`[Backtest] Starting ${sym}...`);
  const bars = await _fetchBars(sym, key, secret);

  if (bars.length < WINDOW + VERIFY_DAYS + 5) {
    throw new Error(`Not enough bars for ${sym}: got ${bars.length}, need ${WINDOW + VERIFY_DAYS + 5}`);
  }

  const records     = [];
  const patternAgg  = {};  // { patternId: { fires, correct } }
  const monthlyAgg  = {};  // { 'YYYY-MM': { total, correct } }

  // Sliding window — start at WINDOW, stop VERIFY_DAYS before end (need future bars to verify)
  const stopAt = bars.length - VERIFY_DAYS;

  for (let i = WINDOW; i < stopAt; i++) {
    const window = bars.slice(Math.max(0, i - WINDOW), i);
    const indicators = _computeIndicators(window);
    if (!indicators) continue;

    // Run brain (regime is cached after first call — no per-day external API hits)
    let brainResult;
    try {
      brainResult = await runBrainAnalysis(indicators);
    } catch (e) {
      continue; // skip days where brain throws
    }

    const brain_score    = brainResult.brain_score ?? 0;
    const activePatterns = brainResult.active_patterns || [];
    const predicted      = _brainDirection(brain_score);

    // Verify: actual 7-day return
    const priceNow    = bars[i - 1].close;
    const priceFuture = bars[i + VERIFY_DAYS - 1].close;
    const returnPct   = (priceFuture - priceNow) / priceNow;
    const actual      = returnPct > MIN_MOVE_PCT ? 'UP' : returnPct < -MIN_MOVE_PCT ? 'DOWN' : 'FLAT';

    const correct = predicted !== 'FLAT' && predicted === actual;
    const dateStr = bars[i - 1].time.slice(0, 10);
    const monthKey = dateStr.slice(0, 7); // 'YYYY-MM'

    // Aggregate pattern stats
    activePatterns.forEach(p => {
      const pid = p.pattern_id || p.patternId || 'UNKNOWN';
      if (!patternAgg[pid]) patternAgg[pid] = { fires: 0, correct: 0, category: p.category || 'unknown' };
      patternAgg[pid].fires++;
      if (correct) patternAgg[pid].correct++;
    });

    // Aggregate monthly
    if (!monthlyAgg[monthKey]) monthlyAgg[monthKey] = { total: 0, correct: 0, up: 0, down: 0, flat: 0 };
    monthlyAgg[monthKey].total++;
    if (correct) monthlyAgg[monthKey].correct++;
    monthlyAgg[monthKey][predicted.toLowerCase()]++;

    records.push({
      date: dateStr, predicted, actual, correct,
      brain_score: +brain_score.toFixed(4),
      returnPct:   +returnPct.toFixed(4),
      patterns:    activePatterns.length,
    });
  }

  // ── Compute summary stats ──
  const nonFlat    = records.filter(r => r.predicted !== 'FLAT');
  const bullPreds  = records.filter(r => r.predicted === 'UP');
  const bearPreds  = records.filter(r => r.predicted === 'DOWN');
  const flatPreds  = records.filter(r => r.predicted === 'FLAT');

  const accuracy     = nonFlat.length > 0 ? nonFlat.filter(r => r.correct).length / nonFlat.length : 0;
  const bullAccuracy = bullPreds.length > 0 ? bullPreds.filter(r => r.correct).length / bullPreds.length : 0;
  const bearAccuracy = bearPreds.length > 0 ? bearPreds.filter(r => r.correct).length / bearPreds.length : 0;

  // Top patterns by fires (min 5 fires to show)
  const topPatterns = Object.entries(patternAgg)
    .filter(([, v]) => v.fires >= 5)
    .map(([id, v]) => ({
      patternId:   id,
      fires:       v.fires,
      correct:     v.correct,
      accuracy:    v.fires > 0 ? +(v.correct / v.fires * 100).toFixed(1) : 0,
      category:    v.category,
    }))
    .sort((a, b) => b.fires - a.fires)
    .slice(0, 20);

  // Monthly breakdown
  const monthly = Object.entries(monthlyAgg)
    .map(([month, v]) => ({
      month,
      total:    v.total,
      correct:  v.correct,
      accuracy: v.total > 0 ? +(v.correct / v.total * 100).toFixed(1) : 0,
      up:       v.up,
      down:     v.down,
      flat:     v.flat,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const summary = {
    symbol:        sym,
    runAt:         new Date().toISOString(),
    barsAvailable: bars.length,
    totalDays:     records.length,
    predictions:   nonFlat.length,
    flatCount:     flatPreds.length,
    bullCount:     bullPreds.length,
    bearCount:     bearPreds.length,
    correct:       nonFlat.filter(r => r.correct).length,
    accuracy:      +(accuracy * 100).toFixed(1),
    bullAccuracy:  +(bullAccuracy * 100).toFixed(1),
    bearAccuracy:  +(bearAccuracy * 100).toFixed(1),
    topPatterns,
    monthly,
    note:          'Seasonal weights use current month — historical months are approximated.',
  };

  // Store in Firestore (overwrites previous run for same symbol)
  if (db) {
    await db.collection(BT_COL).doc(sym).set(summary);
    console.log(`[Backtest] ${sym} stored — ${summary.predictions} predictions, ${summary.accuracy}% accuracy`);
  }

  return summary;
}

// ─────────────────────────────────────────────────────────
//  getBacktestResult — read cached result from Firestore
// ─────────────────────────────────────────────────────────
async function getBacktestResult(sym, db) {
  const doc = await db.collection(BT_COL).doc(sym).get();
  return doc.exists ? doc.data() : null;
}

// ─────────────────────────────────────────────────────────
//  getBacktestSummary — all symbols combined
// ─────────────────────────────────────────────────────────
async function getBacktestSummary(db) {
  const snap = await db.collection(BT_COL).get();
  if (snap.empty) return { symbols: [], combined: null };

  const symbols = [];
  let totalPreds = 0, totalCorrect = 0;

  snap.forEach(doc => {
    const d = doc.data();
    symbols.push({
      symbol:       d.symbol,
      accuracy:     d.accuracy,
      predictions:  d.predictions,
      bullAccuracy: d.bullAccuracy,
      bearAccuracy: d.bearAccuracy,
      runAt:        d.runAt,
    });
    totalPreds   += d.predictions   || 0;
    totalCorrect += d.correct       || 0;
  });

  const combined = {
    totalPredictions: totalPreds,
    totalCorrect,
    accuracy: totalPreds > 0 ? +(totalCorrect / totalPreds * 100).toFixed(1) : 0,
  };

  return { symbols: symbols.sort((a, b) => b.accuracy - a.accuracy), combined };
}

module.exports = { runBacktest, getBacktestResult, getBacktestSummary };
