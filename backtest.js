// ═══════════════════════════════════════════════════════════
//  VESTEX — Backtesting Engine (Exact Historical Mode)
//
//  Replays Brain Vault logic day-by-day through 2 years of
//  historical Alpaca bar data with correct historical regime
//  (VIX + Fear & Greed per date) and correct seasonal month.
//
//  Data flow:
//    Alpaca 2yr bars → sliding 40-bar window → _computeIndicators
//    → runBrainAnalysis(indicators, { regimeOverride, monthOverride })
//    → predicted direction → actual 7d return → correct/incorrect
//    → stored in Firestore bt_results/{sym}
//
//  Does NOT touch: vi_predictions, brain logic, scoring weights,
//  live pipeline, or any production Firestore collections.
// ═══════════════════════════════════════════════════════════
'use strict';

const axios = require('axios');
const { runBrainAnalysis } = require('./brain');

const BT_COL       = 'bt_results';
const BARS_NEEDED  = 500;    // ~2 trading years
const WINDOW       = 40;     // bars fed to brain per day
const VERIFY_DAYS  = 7;      // days forward to check outcome
const MIN_MOVE_PCT = 0.005;  // 0.5% min move to call UP/DOWN, else FLAT

// ─────────────────────────────────────────────────────────
//  Indicator math — mirrors _computeIndicators in server.js
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
  const e12 = _ema(cl, 12), e26 = _ema(cl, 26);
  const macd = e12 && e26 ? +(e12 - e26).toFixed(4) : null;
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
  const price    = cl[cl.length - 1];
  const atrPct   = atr && price ? +(atr / price * 100).toFixed(2) : null;
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
    sma7: sma7 ? +sma7.toFixed(2) : null,
    sma21: sma21 ? +sma21.toFixed(2) : null,
    rsi, macd, volSpike, atr, atrPct, streak, score: 0,
  };
}

// ─────────────────────────────────────────────────────────
//  _fetchVixHistory
//  Parses full CBOE VIX history CSV → { 'YYYY-MM-DD': vixClose }
// ─────────────────────────────────────────────────────────
async function _fetchVixHistory() {
  try {
    const r = await axios.get(
      'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
      { timeout: 15000 }
    );
    const lines = r.data.trim().split('\n');
    const map   = {};
    // CSV format: DATE,OPEN,HIGH,LOW,CLOSE  (header row first)
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 5) continue;
      const rawDate = parts[0].trim(); // 'MM/DD/YYYY'
      const close   = parseFloat(parts[4]);
      if (isNaN(close)) continue;
      // Normalize to YYYY-MM-DD
      const [m, d, y] = rawDate.split('/');
      if (!m || !d || !y) continue;
      const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      map[iso] = close;
    }
    console.log(`[Backtest] VIX history loaded — ${Object.keys(map).length} days`);
    return map;
  } catch(e) {
    console.warn('[Backtest] VIX history fetch failed:', e.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────
//  _fetchFngHistory
//  alternative.me supports up to 500 days of F&G history
//  Returns { 'YYYY-MM-DD': { value, label } }
// ─────────────────────────────────────────────────────────
async function _fetchFngHistory() {
  try {
    const r = await axios.get(
      'https://api.alternative.me/fng/?limit=730&format=json',
      { timeout: 10000 }
    );
    const map = {};
    (r.data.data || []).forEach(d => {
      // timestamp is Unix seconds
      const date = new Date(parseInt(d.timestamp) * 1000).toISOString().slice(0, 10);
      map[date]  = { value: parseInt(d.value), label: d.value_classification };
    });
    console.log(`[Backtest] F&G history loaded — ${Object.keys(map).length} days`);
    return map;
  } catch(e) {
    console.warn('[Backtest] F&G history fetch failed:', e.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────
//  _buildRegimeForDate
//  Reconstructs the market regime for a specific historical date
//  using the VIX and F&G maps. Falls back gracefully if missing.
// ─────────────────────────────────────────────────────────
function _buildRegimeForDate(date, vixMap, fngMap) {
  const vix = vixMap[date] || null;
  const fng = fngMap[date] || null;

  // If we have no data for this date, try ±3 days (weekends/holidays)
  let resolvedVix = vix, resolvedFng = fng;
  if (!resolvedVix || !resolvedFng) {
    for (let offset = 1; offset <= 3; offset++) {
      const d = new Date(date);
      d.setDate(d.getDate() - offset);
      const alt = d.toISOString().slice(0, 10);
      if (!resolvedVix && vixMap[alt]) resolvedVix = vixMap[alt];
      if (!resolvedFng && fngMap[alt]) resolvedFng = fngMap[alt];
      if (resolvedVix && resolvedFng) break;
    }
  }

  let regime = 'neutral', regime_desc = 'Normal market conditions', regime_adj = 0;

  if (resolvedFng && resolvedVix) {
    const fv = resolvedFng.value;
    if      (fv < 25 && resolvedVix > 30) { regime = 'fear';    regime_desc = 'Extreme fear';    regime_adj = +5; }
    else if (fv < 40)                     { regime = 'cautious'; regime_desc = 'Fear in market';  regime_adj = -5; }
    else if (fv > 75 && resolvedVix < 15) { regime = 'euphoria'; regime_desc = 'Extreme greed';  regime_adj = -8; }
    else if (fv > 60)                     { regime = 'greed';    regime_desc = 'Greed elevated';  regime_adj = +3; }
    if (resolvedVix > 40) { regime = 'panic'; regime_desc = `VIX ${resolvedVix.toFixed(1)} — capitulation`; regime_adj = +10; }
  }

  return {
    regime,
    regime_desc,
    regime_adj,
    fng:  resolvedFng ? { value: resolvedFng.value, label: resolvedFng.label } : null,
    vix:  resolvedVix ? +resolvedVix.toFixed(2) : null,
  };
}

// ─────────────────────────────────────────────────────────
//  _fetchBars — 2 years of daily OHLCV from Alpaca
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
    time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  }));
}

// ─────────────────────────────────────────────────────────
//  _brainDirection — map brain_score to UP/DOWN/FLAT
// ─────────────────────────────────────────────────────────
function _brainDirection(brain_score) {
  if (brain_score >  MIN_MOVE_PCT) return 'UP';
  if (brain_score < -MIN_MOVE_PCT) return 'DOWN';
  return 'FLAT';
}

// ─────────────────────────────────────────────────────────
//  runBacktest — main engine
// ─────────────────────────────────────────────────────────
async function runBacktest(sym, db, key, secret) {
  console.log(`[Backtest] Starting ${sym} — fetching historical data...`);

  // Fetch all three data sources in parallel
  const [bars, vixMap, fngMap] = await Promise.all([
    _fetchBars(sym, key, secret),
    _fetchVixHistory(),
    _fetchFngHistory(),
  ]);

  if (bars.length < WINDOW + VERIFY_DAYS + 5) {
    throw new Error(`Not enough bars for ${sym}: got ${bars.length}, need ${WINDOW + VERIFY_DAYS + 5}`);
  }

  console.log(`[Backtest] ${sym} — ${bars.length} bars, replaying...`);

  const records    = [];
  const patternAgg = {};  // { patternId: { fires, correct, category } }
  const monthlyAgg = {};  // { 'YYYY-MM': { total, correct, up, down, flat } }

  const stopAt = bars.length - VERIFY_DAYS;

  for (let i = WINDOW; i < stopAt; i++) {
    const window     = bars.slice(Math.max(0, i - WINDOW), i);
    const indicators = _computeIndicators(window);
    if (!indicators) continue;

    const dateStr      = bars[i - 1].time.slice(0, 10); // 'YYYY-MM-DD'
    const monthOverride = parseInt(dateStr.slice(5, 7)); // correct historical month

    // Build exact historical regime for this date
    const regimeOverride = _buildRegimeForDate(dateStr, vixMap, fngMap);

    let brainResult;
    try {
      brainResult = await runBrainAnalysis(indicators, { regimeOverride, monthOverride });
    } catch(e) {
      continue;
    }

    const brain_score    = brainResult.brain_score ?? 0;
    const activePatterns = brainResult.active_patterns || [];
    const predicted      = _brainDirection(brain_score);

    // 7-day outcome
    const priceNow    = bars[i - 1].close;
    const priceFuture = bars[i + VERIFY_DAYS - 1].close;
    const returnPct   = (priceFuture - priceNow) / priceNow;
    const actual      = returnPct > MIN_MOVE_PCT ? 'UP' : returnPct < -MIN_MOVE_PCT ? 'DOWN' : 'FLAT';
    const correct     = predicted !== 'FLAT' && predicted === actual;
    const monthKey    = dateStr.slice(0, 7);

    // Pattern aggregation
    activePatterns.forEach(p => {
      const pid = p.pattern_id || p.patternId || 'UNKNOWN';
      if (!patternAgg[pid]) patternAgg[pid] = { fires: 0, correct: 0, category: p.category || 'unknown' };
      patternAgg[pid].fires++;
      if (correct) patternAgg[pid].correct++;
    });

    // Monthly aggregation
    if (!monthlyAgg[monthKey]) monthlyAgg[monthKey] = { total: 0, correct: 0, up: 0, down: 0, flat: 0 };
    monthlyAgg[monthKey].total++;
    if (correct) monthlyAgg[monthKey].correct++;
    monthlyAgg[monthKey][predicted.toLowerCase()]++;

    records.push({
      date: dateStr, predicted, actual, correct,
      brain_score: +brain_score.toFixed(4),
      returnPct:   +returnPct.toFixed(4),
      regime:      regimeOverride.regime,
      patterns:    activePatterns.length,
    });
  }

  // ── Summary stats ──
  const nonFlat   = records.filter(r => r.predicted !== 'FLAT');
  const bullPreds = records.filter(r => r.predicted === 'UP');
  const bearPreds = records.filter(r => r.predicted === 'DOWN');
  const flatPreds = records.filter(r => r.predicted === 'FLAT');

  const accuracy     = nonFlat.length > 0   ? nonFlat.filter(r => r.correct).length / nonFlat.length   : 0;
  const bullAccuracy = bullPreds.length > 0  ? bullPreds.filter(r => r.correct).length / bullPreds.length : 0;
  const bearAccuracy = bearPreds.length > 0  ? bearPreds.filter(r => r.correct).length / bearPreds.length : 0;

  // Regime breakdown
  const regimes = ['neutral','cautious','fear','greed','euphoria','panic'];
  const regimeBreakdown = {};
  regimes.forEach(rg => {
    const recs = nonFlat.filter(r => r.regime === rg);
    regimeBreakdown[rg] = {
      total:    recs.length,
      correct:  recs.filter(r => r.correct).length,
      accuracy: recs.length > 0 ? +(recs.filter(r => r.correct).length / recs.length * 100).toFixed(1) : null,
    };
  });

  const topPatterns = Object.entries(patternAgg)
    .filter(([, v]) => v.fires >= 5)
    .map(([id, v]) => ({
      patternId: id,
      fires:     v.fires,
      correct:   v.correct,
      accuracy:  +(v.correct / v.fires * 100).toFixed(1),
      category:  v.category,
    }))
    .sort((a, b) => b.fires - a.fires)
    .slice(0, 20);

  const monthly = Object.entries(monthlyAgg)
    .map(([month, v]) => ({
      month,
      total:    v.total,
      correct:  v.correct,
      accuracy: v.total > 0 ? +(v.correct / v.total * 100).toFixed(1) : 0,
      up: v.up, down: v.down, flat: v.flat,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const summary = {
    symbol:          sym,
    runAt:           new Date().toISOString(),
    historyMode:     true,  // flag: exact historical regime + month used
    barsAvailable:   bars.length,
    vixDaysLoaded:   Object.keys(vixMap).length,
    fngDaysLoaded:   Object.keys(fngMap).length,
    totalDays:       records.length,
    predictions:     nonFlat.length,
    flatCount:       flatPreds.length,
    bullCount:       bullPreds.length,
    bearCount:       bearPreds.length,
    correct:         nonFlat.filter(r => r.correct).length,
    accuracy:        +(accuracy * 100).toFixed(1),
    bullAccuracy:    +(bullAccuracy * 100).toFixed(1),
    bearAccuracy:    +(bearAccuracy * 100).toFixed(1),
    regimeBreakdown,
    topPatterns,
    monthly,
  };

  if (db) {
    await db.collection(BT_COL).doc(sym).set(summary);
    console.log(`[Backtest] ${sym} stored — ${summary.predictions} predictions, ${summary.accuracy}% accuracy (exact historical mode)`);
  }

  return summary;
}

// ─────────────────────────────────────────────────────────
//  getBacktestResult / getBacktestSummary
// ─────────────────────────────────────────────────────────
async function getBacktestResult(sym, db) {
  const doc = await db.collection(BT_COL).doc(sym).get();
  return doc.exists ? doc.data() : null;
}

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
      historyMode:  d.historyMode || false,
      runAt:        d.runAt,
    });
    totalPreds   += d.predictions || 0;
    totalCorrect += d.correct     || 0;
  });

  const combined = {
    totalPredictions: totalPreds,
    totalCorrect,
    accuracy: totalPreds > 0 ? +(totalCorrect / totalPreds * 100).toFixed(1) : 0,
  };

  return { symbols: symbols.sort((a, b) => b.accuracy - a.accuracy), combined };
}

module.exports = { runBacktest, getBacktestResult, getBacktestSummary };
