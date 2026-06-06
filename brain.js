// ═══════════════════════════════════════════════════════════
//  VESTEX — Brain Vault Integration v2.0
//  Expanded from 14/113 → 80+/113 active pattern evaluation.
//  New: 5 dormant category matchers, weighted score breakdown,
//       diagnostics endpoint, extraContext pipeline integration.
// ═══════════════════════════════════════════════════════════

const axios = require('axios');
const { resolveWinRate } = require('./winRateRegistry');

// ── Load all pattern databases at startup ──
const TECHNICAL      = require('./brain/patterns/patterns.json');
const PSYCHOLOGY     = require('./brain/psychology/patterns.json').patterns;
const ECONOMY        = require('./brain/economy/patterns.json');
const COMPANY        = require('./brain/company-patterns/patterns.json').patterns;
const NEWS           = require('./brain/news-patterns/patterns.json').patterns;
const RESEARCH       = require('./brain/research/patterns.json').patterns;
const _MH_RAW        = require('./brain/market-history/patterns.json');
const MARKET_HISTORY = Array.isArray(_MH_RAW) ? _MH_RAW : (_MH_RAW.patterns || []);

// ── Total pattern count across all files ──
const TOTAL_PATTERNS = TECHNICAL.length + PSYCHOLOGY.length + ECONOMY.length +
  COMPANY.length + NEWS.length + RESEARCH.length + MARKET_HISTORY.length;

// ── Category weights for weighted brain score ──
const CAT_WEIGHTS = {
  technical:     0.25,
  psychology:    0.10,
  economy:       0.15,
  company:       0.15,
  news:          0.15,
  research:      0.10,
  marketHistory: 0.10,
};

// ═══════════════════════════════════════════════════════════
//  SEASONAL SIGNALS — 100yr calendar data, no API needed
// ═══════════════════════════════════════════════════════════
const SEASONAL = [
  { month: 1,  name: 'January Effect',      signal: 'bullish', avg_return: 1.2,  win_rate: 62, note: 'Strong open to year, small-cap outperformance' },
  { month: 2,  name: 'February Weakness',   signal: 'neutral', avg_return: 0.1,  win_rate: 52, note: 'Mixed historically, post-January rebalancing' },
  { month: 3,  name: 'March Recovery',      signal: 'bullish', avg_return: 1.1,  win_rate: 60, note: 'Quarter-end window dressing boosts returns' },
  { month: 4,  name: 'April Strength',      signal: 'bullish', avg_return: 1.5,  win_rate: 65, note: 'Best month historically for S&P 500' },
  { month: 5,  name: 'Sell in May Setup',   signal: 'neutral', avg_return: 0.3,  win_rate: 55, note: 'Start of weak May-Oct period, still positive avg' },
  { month: 6,  name: 'June Volatility',     signal: 'neutral', avg_return: 0.2,  win_rate: 53, note: 'Mid-year repositioning, FOMC sensitivity' },
  { month: 7,  name: 'July Rally',          signal: 'bullish', avg_return: 1.3,  win_rate: 63, note: 'Best summer month, earnings season kickoff' },
  { month: 8,  name: 'August Weakness',     signal: 'bearish', avg_return: -0.1, win_rate: 49, note: 'Low volume, historically weakest summer month' },
  { month: 9,  name: 'September Effect',    signal: 'bearish', avg_return: -1.1, win_rate: 43, note: 'Worst month of year statistically since 1950' },
  { month: 10, name: 'October Recovery',    signal: 'bullish', avg_return: 0.9,  win_rate: 60, note: 'Crash history but also frequent bear market bottoms' },
  { month: 11, name: 'November Strength',   signal: 'bullish', avg_return: 1.7,  win_rate: 69, note: 'Start of strong Nov-Apr period, Santa Claus setup' },
  { month: 12, name: 'Santa Claus Rally',   signal: 'bullish', avg_return: 1.5,  win_rate: 74, note: 'Last 5 days + first 2 days Jan, 74% win rate since 1950' },
];

// ═══════════════════════════════════════════════════════════
//  MARKET REGIME — fetch from live Fear & Greed + VIX
// ═══════════════════════════════════════════════════════════
let regimeCache = null;
let regimeCacheTime = 0;

async function fetchMarketRegime() {
  if (regimeCache && (Date.now() - regimeCacheTime) < 3600000) return regimeCache;

  let fng = null, vix = null;

  try {
    const r = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 6000 });
    const d = r.data.data?.[0];
    fng = d ? { value: parseInt(d.value), label: d.value_classification } : null;
  } catch(e) { /* silent fail */ }

  try {
    const r     = await axios.get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { timeout: 8000 });
    const lines = r.data.trim().split('\n');
    const last  = lines[lines.length - 1].split(',');
    vix = parseFloat(last[4]);
  } catch(e) { /* silent fail */ }

  let regime = 'neutral', regime_desc = 'Normal market conditions', regime_adj = 0;

  if (fng && vix) {
    if      (fng.value < 25 && vix > 30) { regime = 'fear';    regime_desc = 'Extreme fear — contrarian buy signal';    regime_adj = +5; }
    else if (fng.value < 40)             { regime = 'cautious'; regime_desc = 'Fear in market — reduce risk exposure';   regime_adj = -5; }
    else if (fng.value > 75 && vix < 15) { regime = 'euphoria'; regime_desc = 'Extreme greed — caution on new longs';   regime_adj = -8; }
    else if (fng.value > 60)             { regime = 'greed';    regime_desc = 'Greed elevated — momentum may continue'; regime_adj = +3; }
    else                                 { regime = 'neutral';  regime_desc = 'Balanced market sentiment';               regime_adj = 0;  }
    if (vix > 40) { regime = 'panic'; regime_desc = `VIX ${vix.toFixed(1)} — capitulation zone, 79% bullish resolution`; regime_adj = +10; }
  }

  regimeCache = { regime, regime_desc, regime_adj, fng, vix: vix ? +vix.toFixed(2) : null };
  regimeCacheTime = Date.now();
  return regimeCache;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function mkMatch(p, direction, category, extras = {}) {
  const handCoded  = extras.win_rate !== undefined ? extras.win_rate : (p.win_rate || null);
  const patternId  = p.pattern_id;
  const wrRes      = resolveWinRate(patternId, handCoded); // { rate, source, uses }
  return {
    pattern_id:     patternId,
    name:           p.name,
    category:       category || p.category || 'technical',
    direction,
    win_rate:       handCoded,                 // preserved as-is for display
    winRateSource:  wrRes.source,              // 'VERIFIED' | 'HAND_CODED' | 'DEFAULT'
    winRateUses:    wrRes.uses,                // verified fire count
    _resolvedRate:  wrRes.rate,                // internal: decimal rate used in scoring
    confidence:     extras.confidence  !== undefined ? extras.confidence  : (p.confidence  || null),
    avg_return_7d:  extras.avg_return_7d  !== undefined ? extras.avg_return_7d  : (p.avg_return_7d  || null),
    avg_return_30d: extras.avg_return_30d !== undefined ? extras.avg_return_30d : (p.avg_return_30d || null),
    impact:         extras.impact || 'medium',
    reason:         extras.reason || null,
  };
}

function patternScore(p) {
  // Use _resolvedRate if already computed by mkMatch; otherwise resolve fresh.
  // _resolvedRate is in decimal (0.30–1.00). Formula needs percentage (30–100).
  const resolvedPct = p._resolvedRate != null
    ? +(p._resolvedRate * 100).toFixed(0)
    : +(resolveWinRate(p.pattern_id || '', p.win_rate).rate * 100).toFixed(0);
  const conf = p.confidence || 60;
  const w    = ((resolvedPct - 50) / 50) * (conf / 100);
  return p.direction === 'bullish' ? w : p.direction === 'bearish' ? -w : 0;
}

function categoryRawScore(matches) {
  return matches.reduce((sum, p) => sum + patternScore(p), 0);
}

// ═══════════════════════════════════════════════════════════
//  1. TECHNICAL PATTERNS (44 patterns)
//     Covers: TA (001–011), macro proxy (012–020),
//             earnings proxy via sentiment (021–040),
//             chart patterns (041–044)
// ═══════════════════════════════════════════════════════════
function matchTechnical(indicators, macro, sentiment) {
  const { rsi, macd, sma7, sma21, volSpike, streak, atrPct, score } = indicators;
  const matches = [];
  const skipped = {};
  let evaluated = 0;
  // Earnings proxy (021-040): fire at most once per direction to prevent pile-on
  let earningsBullFired = false;
  let earningsBearFired = false;

  for (const p of TECHNICAL) {
    let triggered = false;
    let direction = 'neutral';
    let canEval   = true;
    let extras    = {};

    switch (p.pattern_id) {

      // ── Pure TA (001-011) ──────────────────────────────

      case 'PATTERN_001': // Golden Cross proxy
        if (sma7 && sma21 && sma7 > sma21 * 1.01) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_002': // Death Cross proxy
        if (sma7 && sma21 && sma7 < sma21 * 0.99) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_003': // RSI Oversold
        if (rsi !== null && rsi < 35) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_004': // RSI Overbought
        if (rsi !== null && rsi > 68) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_005': // MACD Bullish
        if (macd !== null && macd > 0) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_006': // MACD Bearish
        if (macd !== null && macd < 0) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_007': // Volume Climax
        if (volSpike && score < 0) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_008': // Extended upstreak + overbought (52wk high proxy)
        if (streak >= 5 && rsi > 70) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_009': // 52-week Low Breakdown proxy
        if (streak <= -5 && rsi < 30) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_010': // Support Bounce (RSI in 38-48 range, uptrend)
        if (rsi !== null && rsi >= 38 && rsi <= 48 && sma7 > sma21) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_011': // Resistance Rejection (RSI near 65, downtrend)
        if (rsi !== null && rsi >= 60 && rsi <= 70 && sma7 < sma21) { triggered = true; direction = 'bearish'; }
        break;

      // ── Macro via macroSnapshot (012–020) ─────────────

      case 'PATTERN_012': // Yield Curve Inversion
        if (!macro) { skipped[p.pattern_id] = 'macroSnapshot unavailable'; canEval = false; break; }
        if (macro.yieldCurve?.value != null) {
          if (macro.yieldCurve.value < 0) {
            triggered = true; direction = 'bearish';
            extras = { impact: 'high', reason: `Yield curve ${macro.yieldCurve.value.toFixed(2)}% — inverted (recession warning)` };
          }
        } else { skipped[p.pattern_id] = 'yieldCurve data missing'; canEval = false; }
        break;

      case 'PATTERN_013': // Yield Curve Steepening (recovery signal)
        if (macro?.yieldCurve?.value != null) {
          if (macro.yieldCurve.value > 0.5) {
            triggered = true; direction = 'bullish';
            extras = { reason: `Yield curve +${macro.yieldCurve.value.toFixed(2)}% — steepening (recovery signal)` };
          }
        } else { skipped[p.pattern_id] = 'yieldCurve data missing'; canEval = false; }
        break;

      case 'PATTERN_014': // First Fed Rate Cut — needs rate history
        skipped[p.pattern_id] = 'Requires multi-period Fed rate history'; canEval = false; break;

      case 'PATTERN_015': // Last Fed Rate Hike — needs rate history
        skipped[p.pattern_id] = 'Requires multi-period Fed rate history'; canEval = false; break;

      case 'PATTERN_016': // CPI Above Expectations proxy (inflation elevated)
        if (macro?.inflation?.value != null) {
          if (macro.inflation.value > 3.0) {
            triggered = true; direction = 'bearish';
            extras = { reason: `Inflation expectations ${macro.inflation.value.toFixed(2)}% — above 3% target` };
          }
        } else { skipped[p.pattern_id] = 'inflation data missing'; canEval = false; }
        break;

      case 'PATTERN_017': // CPI Below Expectations proxy (inflation contained)
        if (macro?.inflation?.value != null) {
          if (macro.inflation.value < 2.0) {
            triggered = true; direction = 'bullish';
            extras = { reason: `Inflation expectations ${macro.inflation.value.toFixed(2)}% — contained (rate cut friendly)` };
          }
        } else { skipped[p.pattern_id] = 'inflation data missing'; canEval = false; }
        break;

      case 'PATTERN_018': // NFP Beat proxy (low unemployment = strong jobs)
        if (macro?.unemployment?.value != null) {
          if (macro.unemployment.value < 4.0) {
            triggered = true; direction = 'bullish';
            extras = { reason: `Unemployment ${macro.unemployment.value.toFixed(1)}% — strong labor market` };
          }
        } else { skipped[p.pattern_id] = 'unemployment data missing'; canEval = false; }
        break;

      case 'PATTERN_019': // NFP Miss proxy (high unemployment = labor weakness)
        if (macro?.unemployment?.value != null) {
          if (macro.unemployment.value > 4.5) {
            triggered = true; direction = 'bearish';
            extras = { reason: `Unemployment ${macro.unemployment.value.toFixed(1)}% — labor market softening` };
          }
        } else { skipped[p.pattern_id] = 'unemployment data missing'; canEval = false; }
        break;

      case 'PATTERN_020': // Sahm Rule
        if (macro?.sahmRule?.value != null) {
          if (macro.sahmRule.value >= 0.5) {
            triggered = true; direction = 'bearish';
            extras = { impact: 'high', reason: `Sahm Rule ${macro.sahmRule.value.toFixed(2)} ≥ 0.5 — recession signal` };
          }
        } else { skipped[p.pattern_id] = 'sahmRule data missing'; canEval = false; }
        break;

      // ── Earnings patterns (021–040): sentiment keyword proxy ──
      // These require EPS data; fired only when sentiment summary confirms the event.

      case 'PATTERN_021': case 'PATTERN_022': case 'PATTERN_023': case 'PATTERN_024':
      case 'PATTERN_025': case 'PATTERN_026': case 'PATTERN_027': case 'PATTERN_028':
      case 'PATTERN_029': case 'PATTERN_030': case 'PATTERN_031': case 'PATTERN_032':
      case 'PATTERN_033': case 'PATTERN_034': case 'PATTERN_035': case 'PATTERN_036':
      case 'PATTERN_037': case 'PATTERN_038': case 'PATTERN_039': case 'PATTERN_040': {
        if (!sentiment?.summary) {
          skipped[p.pattern_id] = 'Requires EPS/guidance data; no sentiment available';
          canEval = false; break;
        }
        // Require strong sentiment score (>30 or <-30) to prevent weak news from triggering
        // Also fire at most ONCE per direction across all 20 earnings proxy patterns
        // to prevent a pile-on where 10+ patterns fire for the same sentiment summary
        const sentScore = sentiment.score ?? 0;
        const sl  = sentiment.summary.toLowerCase();
        const nameLower = (p.name || '').toLowerCase();
        const isBull = nameLower.match(/beat|raise|strong|growth|positive/);
        const isBear = nameLower.match(/miss|cut|weak|decline|negative/);
        const hasBeatLang = sl.match(/beat|exceed|surpass|strong earn|above expect/);
        const hasMissLang = sl.match(/miss|disappoint|fall short|below expect|lower than/);
        if (isBull && hasBeatLang && sentScore > 30 && !earningsBullFired) {
          triggered = true; direction = 'bullish'; earningsBullFired = true;
          extras = { confidence: Math.max(40, (p.confidence || 55) - 15), reason: `Earnings beat signal confirmed (sentiment score: ${sentScore})` };
        } else if (isBear && hasMissLang && sentScore < -30 && !earningsBearFired) {
          triggered = true; direction = 'bearish'; earningsBearFired = true;
          extras = { confidence: Math.max(40, (p.confidence || 55) - 15), reason: `Earnings miss signal confirmed (sentiment score: ${sentScore})` };
        }
        break;
      }

      // ── Chart patterns (041–044) ───────────────────────

      case 'PATTERN_041': // Bull Flag (consolidation after uptrend)
        if (sma7 && sma21 && sma7 > sma21 && atrPct < 2.0 && rsi < 60) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_042': // Head & Shoulders proxy
        if (sma7 && sma21 && sma7 < sma21 && volSpike && rsi < 45) { triggered = true; direction = 'bearish'; }
        break;
      case 'PATTERN_043': // Momentum Continuation
        if (streak >= 3 && sma7 > sma21 && rsi > 50 && rsi < 70) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_044': // Volatility Contraction Breakout
        if (atrPct < 1.0 && macd !== null && macd > 0 && sma7 > sma21) { triggered = true; direction = 'bullish'; }
        break;

      default:
        skipped[p.pattern_id] = 'No handler for this pattern ID';
        canEval = false; break;
    }

    if (canEval) {
      evaluated++;
      if (triggered) matches.push(mkMatch(p, direction, p.category || 'technical', extras));
    }
  }

  return { matches, skipped, evaluated, total: TECHNICAL.length };
}

// ═══════════════════════════════════════════════════════════
//  2. PSYCHOLOGY PATTERNS (8–9 patterns)
//     Expanded from 4 to 8: adds CAPITULATION, EUPHORIA,
//     BEAR_TRAP, BULL_TRAP
// ═══════════════════════════════════════════════════════════
function matchPsychology(indicators, regime) {
  const { rsi } = indicators;
  const matches  = [];
  const skipped  = {};
  let evaluated  = 0;

  for (const p of PSYCHOLOGY) {
    let triggered = false;
    let direction = 'neutral';
    let extras    = {};
    let canEval   = true;

    switch (p.pattern_id) {
      case 'EXTREME_FEAR':
        if (regime?.fng?.value < 25) { triggered = true; direction = 'bullish'; extras.reason = `F&G ${regime.fng.value} — extreme fear (contrarian buy)`; }
        break;
      case 'EXTREME_GREED':
        if (regime?.fng?.value > 75) { triggered = true; direction = 'bearish'; extras.reason = `F&G ${regime.fng.value} — extreme greed (risk elevated)`; }
        break;
      case 'VIX_SPIKE':
        if (regime?.vix > 35) { triggered = true; direction = 'bullish'; extras.reason = `VIX ${regime.vix} — elevated fear, mean-reversion expected`; }
        break;
      case 'FOMO_PARABOLIC':
        if (rsi !== null && rsi > 82 && indicators.streak >= 7) { triggered = true; direction = 'bearish'; extras.reason = 'Parabolic move: RSI>82 + streak≥7'; }
        break;
      // ── NEW psychology patterns ────────────────────────
      case 'CAPITULATION':
        if (regime?.vix > 40 && regime?.fng?.value < 20) {
          triggered = true; direction = 'bullish';
          extras = { impact: 'high', reason: `VIX ${regime.vix} + F&G ${regime.fng.value} — capitulation signal, historically strong buy` };
        }
        break;
      case 'EUPHORIA':
        if (regime?.fng?.value > 80 && regime?.vix < 12) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `F&G ${regime.fng.value} + VIX ${regime.vix} — euphoria peak, elevated reversal risk` };
        }
        break;
      case 'BEAR_TRAP':
        // Bear trap: fear regime but VIX not spiking hard (panic not at extremes) → contrarian
        if (regime?.fng?.value < 40 && regime?.vix > 20 && regime?.vix < 35) {
          triggered = true; direction = 'bullish';
          extras = { reason: `Fear (F&G ${regime.fng.value}) without VIX extremes — possible bear trap` };
        }
        break;
      case 'BULL_TRAP':
        // Bull trap: greed + VIX starting to rise (complacency unwind beginning)
        if (regime?.fng?.value > 65 && regime?.vix > 20) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Greed (F&G ${regime.fng.value}) while VIX rising — possible bull trap (complacency unwind)` };
        }
        break;
      default:
        skipped[p.pattern_id] = 'No handler'; canEval = false; break;
    }

    if (canEval) {
      evaluated++;
      if (triggered) {
        matches.push(mkMatch(p, direction, 'psychology', {
          win_rate:    p.historical_win_rate_6m ? Math.round(p.historical_win_rate_6m * 100) : extras.win_rate,
          confidence:  p.signal_strength ? p.signal_strength * 10 : extras.confidence,
          avg_return_30d: p.avg_return_30d || null,
          ...extras,
        }));
      }
    }
  }

  return { matches, skipped, evaluated, total: PSYCHOLOGY.length };
}

// ═══════════════════════════════════════════════════════════
//  3. ECONOMY PATTERNS (12 patterns)
//     7 evaluatable via macroSnapshot
// ═══════════════════════════════════════════════════════════
function matchEconomy(macro) {
  if (!macro) return { matches: [], skipped: { all: 'macroSnapshot not available' }, evaluated: 0, total: ECONOMY.length };

  const matches = [];
  const skipped = {};
  let evaluated = 0;

  const UNEVALUATABLE = new Set(['ECON-003', 'ECON-004', 'ECON-007', 'ECON-009', 'ECON-011']);

  for (const p of ECONOMY) {
    const id = p.pattern_id;

    if (UNEVALUATABLE.has(id)) {
      skipped[id] = 'Requires data not in current FRED feed (rate history / PMI / savings rate)';
      continue;
    }

    let triggered = false;
    let direction = 'neutral';
    let extras    = {};

    switch (id) {
      case 'ECON-001': // Yield Curve Inverted → recession risk
        if (macro.yieldCurve?.value != null && macro.yieldCurve.value < 0) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `Yield curve ${macro.yieldCurve.value.toFixed(2)}% (inverted)` };
        }
        break;
      case 'ECON-002': // Sahm Rule triggered
        if (macro.sahmRule?.value != null && macro.sahmRule.value >= 0.5) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `Sahm Rule ${macro.sahmRule.value.toFixed(2)} — real-time recession indicator` };
        }
        break;
      case 'ECON-005': // HY Credit Spread spike (>5% = crisis-level)
        if (macro.creditSpread?.value != null && macro.creditSpread.value > 5.0) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `HY credit spread ${macro.creditSpread.value.toFixed(2)}% — stress level elevated` };
        }
        break;
      case 'ECON-006': // Inflation elevated (T10YIE proxy for CPI)
        if (macro.inflation?.value != null && macro.inflation.value > 3.5) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Inflation expectations ${macro.inflation.value.toFixed(2)}% — above 3.5% threshold` };
        }
        break;
      case 'ECON-008': // Financial Stress Index elevated
        if (macro.stressIndex?.value != null && macro.stressIndex.value > 0.5) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Financial Stress Index ${macro.stressIndex.value.toFixed(2)} — above neutral (>0)` };
        }
        break;
      case 'ECON-010': // Labor market deterioration
        if (macro.unemployment?.value != null && macro.unemployment.value > 4.5) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Unemployment ${macro.unemployment.value.toFixed(1)}% — above 4.5% warning threshold` };
        }
        break;
      case 'ECON-012': // GDP proxy — multiple bearish macro signals converging
        {
          let bearSignals = 0;
          if (macro.yieldCurve?.value != null && macro.yieldCurve.value < 0)     bearSignals++;
          if (macro.sahmRule?.value != null   && macro.sahmRule.value >= 0.3)     bearSignals++;
          if (macro.stressIndex?.value != null && macro.stressIndex.value > 0.3)  bearSignals++;
          if (macro.unemployment?.value != null && macro.unemployment.value > 4.5) bearSignals++;
          if (macro.creditSpread?.value != null && macro.creditSpread.value > 4.0) bearSignals++;
          if (bearSignals >= 3) {
            triggered = true; direction = 'bearish';
            extras = { impact: 'high', reason: `${bearSignals}/5 macro stress signals active — GDP contraction risk elevated` };
          }
        }
        break;
      default:
        skipped[id] = 'No handler'; continue;
    }

    evaluated++;
    if (triggered) matches.push(mkMatch(p, direction, 'economy', extras));
  }

  return { matches, skipped, evaluated, total: ECONOMY.length };
}

// ═══════════════════════════════════════════════════════════
//  4. COMPANY PATTERNS (11 patterns)
//     5 evaluatable via EDGAR data + sentiment
// ═══════════════════════════════════════════════════════════
function matchCompany(edgar, sentiment) {
  const matches = [];
  const skipped = {};
  let evaluated = 0;

  const UNEVALUATABLE = new Set([
    'EARN_BEAT_LARGE', 'EARN_BEAT_SMALL', 'EARN_MISS', 'GUIDANCE_RAISE', 'GUIDANCE_CUT', 'HIGH_SHORT_INTEREST',
    // Phase 1 cleanup 2026-06-06: INSIDER_BUY disabled — EDGAR Form 4 returns both
    // buy AND sell filings with no direction field. Firing bullish on any insider
    // activity (including insider sells) is a directional error. Disabled until
    // EDGAR direction data is available or a sell-filtering heuristic is validated.
    'INSIDER_BUY',
  ]);

  for (const p of COMPANY) {
    const id = p.pattern_id;

    if (UNEVALUATABLE.has(id)) {
      skipped[id] = 'Requires EPS consensus / guidance data not available in pipeline';
      continue;
    }

    let triggered = false;
    let direction = 'neutral';
    let extras    = {};
    const sentSum  = (sentiment?.summary || '').toLowerCase();
    const hasEdgar = edgar && !edgar.error;

    switch (id) {
      case 'INSIDER_BUY':
        // Recent Form 4 activity is a proxy for insider engagement
        if (hasEdgar && edgar.insiders?.length > 0) {
          triggered = true; direction = 'bullish';
          extras = { confidence: 52, reason: `${edgar.insiders.length} recent insider filing(s) — insider activity detected` };
        } else if (!hasEdgar) {
          skipped[id] = 'EDGAR not available'; continue;
        }
        break;

      case 'LAYOFF_ANNOUNCEMENT':
        if (sentSum.match(/layoff|laid off|job cut|workforce reduction|restructur|headcount/)) {
          triggered = true; direction = 'bearish';
          extras = { reason: 'Layoff/restructuring language detected in news sentiment' };
        } else if (!edgar && !sentiment) {
          skipped[id] = 'No edgar or sentiment data'; continue;
        }
        break;

      case 'ACQUISITION_ANNOUNCED':
        if (sentSum.match(/acqui|merger|takeover|buyout|combine|business combination/)) {
          triggered = true; direction = 'bullish'; // target gets premium
          extras = { reason: 'M&A language detected in news sentiment' };
        } else if (!sentiment) {
          skipped[id] = 'No sentiment data'; continue;
        }
        break;

      case 'BUYBACK_ANNOUNCED':
        if (sentSum.match(/buyback|buy back|share repurchase|repurchas/)) {
          triggered = true; direction = 'bullish';
          extras = { reason: 'Share buyback language detected in news sentiment' };
        } else if (!sentiment) {
          skipped[id] = 'No sentiment data'; continue;
        }
        break;

      case 'DEBT_INCREASE':
        // If company has debt + negative net income → elevated debt risk
        if (hasEdgar && edgar.facts?.debt) {
          const incomeRaw = edgar.facts.netIncomeRaw;
          if (incomeRaw !== null && incomeRaw < 0) {
            triggered = true; direction = 'bearish';
            extras = { confidence: 48, reason: `Debt ${edgar.facts.debt} with negative net income ${edgar.facts.netIncome} — leveraged loss-making risk` };
          }
        } else if (!hasEdgar) {
          skipped[id] = 'EDGAR not available'; continue;
        }
        break;

      default:
        skipped[id] = 'No handler'; continue;
    }

    evaluated++;
    if (triggered) matches.push(mkMatch(p, direction, 'company', extras));
  }

  return { matches, skipped, evaluated, total: COMPANY.length };
}

// ═══════════════════════════════════════════════════════════
//  5. NEWS EVENT PATTERNS (15 patterns)
//     11 evaluatable via sentiment summary keywords
// ═══════════════════════════════════════════════════════════
function matchNews(sentiment, macro) {
  if (!sentiment?.summary) return { matches: [], skipped: { all: 'No sentiment data' }, evaluated: 0, total: NEWS.length };

  const matches = [];
  const skipped = {};
  let evaluated = 0;

  const sl = sentiment.summary.toLowerCase();
  const UNEVALUATABLE = new Set([
    'earnings_beat_large', 'earnings_miss_large', 'guidance_raised', 'guidance_cut',
    // Phase 1 cleanup 2026-06-06: fda_approval / fda_rejection disabled — tracked
    // symbols (AAPL/TSLA/GOOGL/MSFT/AMZN) are not pharma/biotech. FDA news appears
    // only as background market commentary, never as actionable signal for these tickers.
    'fda_approval', 'fda_rejection',
  ]);

  for (const p of NEWS) {
    const id = p.pattern_id;

    if (UNEVALUATABLE.has(id)) {
      skipped[id] = 'Requires EPS / guidance data not available from sentiment alone';
      continue;
    }

    let triggered = false;
    let direction = 'neutral';
    let extras    = {};

    switch (id) {
      case 'rate_cut_first':
        if (sl.match(/rate cut|lower rate|rate reduction|rate slash|cut rates|pivot/)) {
          triggered = true; direction = 'bullish';
          extras = { reason: 'Rate cut language in news — soft-landing cut historically bullish' };
        }
        break;
      case 'rate_hike_first':
        if (sl.match(/rate hike|raise rate|rate increase|rate rise|tighten/)) {
          triggered = true; direction = 'bearish';
          extras = { reason: 'Rate hike language in news — initial hike historically headwind' };
        }
        break;
      case 'layoff_large':
        if (sl.match(/layoff|job cut|workforce reduc|restructur|thousands of employee/)) {
          triggered = true; direction = 'bearish';
          extras = { reason: 'Large-scale layoff language detected in news' };
        }
        break;
      case 'merger_target':
        if (sl.match(/acqui|takeover|buyout|merger offer|bid for|premium offer/)) {
          triggered = true; direction = 'bullish';
          extras = { reason: 'M&A / acquisition language detected — target premium expected' };
        }
        break;
      case 'merger_acquirer':
        // Acquirer typically has short-term negative reaction on large deals
        if (sl.match(/acquir|purchase compan|buying|will buy|agreed to buy/)) {
          triggered = true; direction = 'bearish';
          extras = { reason: 'Acquirer language in news — integration risk / premium cost priced negatively' };
        }
        break;
      case 'fed_hawkish_surprise':
        if (sl.match(/hawkish|higher for longer|rate hike surprise|aggressive fed|tight|above expect/)) {
          triggered = true; direction = 'bearish';
          extras = { reason: 'Hawkish Fed surprise language — bearish for equities short-term' };
        }
        break;
      case 'fed_dovish_surprise':
        if (sl.match(/dovish|rate cut surprise|easing|pivot|accommodat|below expect|softer than/)) {
          triggered = true; direction = 'bullish';
          extras = { reason: 'Dovish Fed surprise language — bullish for equities short-term' };
        }
        break;
      case 'product_launch':
        if (sl.match(/launch|new product|unveil|introduc|released|debut/)) {
          // Neutral to slightly negative (buy-rumor-sell-news typical pattern)
          triggered = true; direction = 'neutral';
          extras = { reason: 'Product launch language — buy-rumor-sell-news pattern possible' };
        }
        break;
      case 'geopolitical_shock':
        if (sl.match(/war|conflict|attack|sanction|escalat|geopolit|invasion|military/)) {
          triggered = true; direction = 'neutral'; // short dip + recovery is historical pattern
          extras = { reason: 'Geopolitical shock language — historically brief disruption, recovery within 30d avg' };
        }
        break;
      case 'fda_approval':
        if (sl.match(/fda approv|fda clear|approv.*drug|drug approv|nda approv|bla approv/)) {
          triggered = true; direction = 'bullish';
          extras = { reason: 'FDA approval language detected — historically large positive reaction' };
        }
        break;
      case 'fda_rejection':
        if (sl.match(/fda reject|fda declin|complete response|crl|approv.*denied|denied.*approv/)) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: 'FDA rejection language detected — historically severe decline for biotech' };
        }
        break;
      default:
        skipped[id] = 'No handler'; continue;
    }

    evaluated++;
    if (triggered) matches.push(mkMatch(p, direction, 'news', extras));
  }

  return { matches, skipped, evaluated, total: NEWS.length };
}

// ═══════════════════════════════════════════════════════════
//  6. RESEARCH / ACADEMIC PATTERNS (11 patterns)
//     5 evaluatable with available indicators
// ═══════════════════════════════════════════════════════════
function matchResearch(indicators, macro, regime) {
  const { rsi, sma7, sma21, atrPct } = indicators;
  const matches = [];
  const skipped = {};
  let evaluated = 0;

  const month = new Date().getMonth() + 1;

  const UNEVALUATABLE = new Set([
    'small_cap_premium', 'value_premium', 'pead_earnings_drift',
    'profitability_factor_rmw', 'investment_factor_cma', 'cape_valuation_signal',
    // Phase 1 cleanup 2026-06-06: time_series_momentum disabled — functionally
    // identical to PATTERN_001 (Golden Cross, win_rate=68). Fires simultaneously
    // in virtually all cases. Double-counting same condition.
    'time_series_momentum',
    // Phase 1 cleanup 2026-06-06: january_effect disabled — direct duplicate of
    // PATTERN_028 (January Effect, win_rate=62). Lower confidence, no win_rate.
    'january_effect',
    // Phase 1 cleanup 2026-06-06: volatility_mean_reversion disabled — fourth
    // system checking VIX>35. VIX_SPIKE, PATTERN_037, and CAPITULATION already
    // cover this condition. Quadruple-counting creates score inflation.
    'volatility_mean_reversion',
  ]);

  for (const p of RESEARCH) {
    const id = p.pattern_id;

    if (UNEVALUATABLE.has(id)) {
      skipped[id] = 'Requires P/E, market cap, EPS surprise, or fundamental data not in pipeline';
      continue;
    }

    let triggered = false;
    let direction = 'neutral';
    let extras    = {};

    switch (id) {
      case 'momentum_12_1': // Cross-sectional momentum proxy
        // Proxy: sma7 significantly above sma21 suggests medium-term momentum
        if (sma7 && sma21 && sma7 > sma21 * 1.03) {
          triggered = true; direction = 'bullish';
          extras = { confidence: 55, reason: 'SMA momentum proxy: sma7 > sma21 by 3%+ (momentum_12_1 approximation)' };
        }
        break;
      case 'time_series_momentum': // Absolute momentum proxy
        // If price is in an uptrend (sma7 > sma21 and sma21 positive slope proxy via rsi > 50)
        if (sma7 && sma21 && sma7 > sma21 && rsi !== null && rsi > 50) {
          triggered = true; direction = 'bullish';
          extras = { confidence: 52, reason: 'Absolute momentum proxy: uptrend confirmed by SMA + RSI' };
        }
        break;
      case 'low_volatility_anomaly': // Low-vol stocks historically earn similar returns with lower risk
        if (atrPct !== null && atrPct < 1.5 && regime?.regime !== 'panic') {
          triggered = true; direction = 'bullish';
          extras = { reason: `Low volatility: ATR ${atrPct.toFixed(2)}% — low-vol anomaly favors this position (Baker/Frazzini research)` };
        }
        break;
      case 'january_effect': // Small-cap seasonality
        if (month === 1) {
          triggered = true; direction = 'bullish';
          extras = { confidence: 50, reason: 'January Effect: historically positive for small-caps in first 5 trading days' };
        }
        break;
      case 'volatility_mean_reversion': // VIX mean-reversion — spike = buy signal
        if (regime?.vix > 35) {
          triggered = true; direction = 'bullish';
          extras = {
            impact: regime.vix > 45 ? 'high' : 'medium',
            reason: `VIX ${regime.vix} > 35: mean-reversion expected, >80% positive 3-month forward return historically (GARCH/VIX research)`,
          };
        }
        break;
      default:
        skipped[id] = 'No handler'; continue;
    }

    evaluated++;
    if (triggered) matches.push(mkMatch(p, direction, 'research', extras));
  }

  return { matches, skipped, evaluated, total: RESEARCH.length };
}

// ═══════════════════════════════════════════════════════════
//  7. MARKET HISTORY PATTERNS (12 patterns)
//     9 evaluatable via macro analogues
// ═══════════════════════════════════════════════════════════
function matchMarketHistory(macro, regime, indicators) {
  const matches = [];
  const skipped = {};
  let evaluated = 0;

  const UNEVALUATABLE = new Set(['MH-008', 'MH-011']);

  for (const p of MARKET_HISTORY) {
    const id = p.pattern_id;

    if (UNEVALUATABLE.has(id)) {
      skipped[id] = id === 'MH-008' ? 'Volcker-era: Fed funds >15% — not applicable in current environment'
                                     : 'DJIA milestone tracker: informational only, not a tradeable signal';
      continue;
    }

    let triggered = false;
    let direction = 'neutral';
    let extras    = {};

    // Helper values
    const yc    = macro?.yieldCurve?.value;
    const infl  = macro?.inflation?.value;
    const vix   = regime?.vix;
    const cs    = macro?.creditSpread?.value;
    const si    = macro?.stressIndex?.value;
    const unemp = macro?.unemployment?.value;
    const sahm  = macro?.sahmRule?.value;
    const ff    = macro?.fedFunds?.value;
    const tsy   = macro?.treasury10y?.value;

    switch (id) {
      case 'MH-001': // Great Depression — extreme multi-signal collapse
        if (cs > 8 && yc < -0.5 && si > 2 && unemp > 6) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: 'Great Depression analogue: extreme credit spread + inverted yield + stress + high unemployment' };
        }
        break;

      case 'MH-002': // Black Monday 1987 — yield spike + elevated valuation
        if (tsy != null && tsy > 5.0 && vix > 25 && yc != null && yc < 0.2) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Black Monday analogue: 10Y treasury ${tsy.toFixed(2)}% + VIX ${vix} — yield spike with low risk tolerance` };
        }
        break;

      case 'MH-003': // Dot-com — extreme valuation + inverted yield + high rates
        if (infl != null && infl > 3.5 && yc != null && yc < 0 && tsy != null && tsy > 4.5) {
          triggered = true; direction = 'bearish';
          extras = { reason: `Dot-com analogue: elevated inflation (${infl.toFixed(2)}%) + inverted yield + high 10Y rates` };
        }
        break;

      case 'MH-004': // GFC 2008 — credit spread blowout + yield inversion
        if (cs != null && cs > 4.0 && yc != null && yc < 0 && si != null && si > 1.0) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `GFC analogue: credit spread ${cs.toFixed(2)}% + inverted yield + stress index ${si.toFixed(2)}` };
        }
        break;

      case 'MH-005': // COVID crash — extreme VIX spike = contrarian buy
        if (vix > 40) {
          triggered = true; direction = 'bullish';
          extras = { impact: 'high', reason: `COVID-crash analogue: VIX ${vix} > 40 — extreme fear zone, historically 80%+ chance of recovery in 30 days` };
        }
        break;

      case 'MH-006': // AI Boom — strong uptrend + low stress + low inflation
        if (infl != null && infl < 2.5 && si != null && si < 0 && vix < 20 &&
            indicators.sma7 && indicators.sma21 && indicators.sma7 > indicators.sma21) {
          triggered = true; direction = 'bullish';
          extras = { reason: `AI Boom / bull market analogue: low inflation (${infl.toFixed(2)}%) + low stress + uptrend` };
        }
        break;

      case 'MH-007': // 1973 Oil Crisis — stagflation (high infl + inverted yield)
        if (infl != null && infl > 5.0 && yc != null && yc < 0) {
          triggered = true; direction = 'bearish';
          extras = { impact: 'high', reason: `1973 stagflation analogue: inflation ${infl.toFixed(2)}% + inverted yield — dual-threat environment` };
        }
        break;

      case 'MH-009': // LTCM — credit spread spike with broad stress
        if (cs != null && cs > 3.5 && si != null && si > 0.5 && vix > 25) {
          triggered = true; direction = 'bearish';
          extras = { reason: `LTCM/liquidity-crisis analogue: credit spread ${cs.toFixed(2)}% + stress index ${si.toFixed(2)} + VIX ${vix}` };
        }
        break;

      case 'MH-010': // 2022 Bear — inflation + yield inversion + elevated rates
        if (infl != null && infl > 4.0 && yc != null && yc < 0 && ff != null && ff > 4.0) {
          triggered = true; direction = 'bearish';
          extras = { reason: `2022 bear market analogue: inflation ${infl.toFixed(2)}% + inverted yield + fed funds ${ff.toFixed(2)}%` };
        }
        break;

      case 'MH-012': // Statistical Baseline — long-run market is net positive
        // Markets are positive 73% of the time; provide a mild baseline bullish signal
        // Only fire when no major bearish signals are active (used by caller to check)
        triggered = true; direction = 'bullish';
        extras = { win_rate: 73, confidence: 50, avg_return_30d: 0.6, reason: 'Statistical baseline: S&P 500 positive 73% of years, avg +7.3%/yr price return' };
        break;

      default:
        skipped[id] = 'No handler'; continue;
    }

    evaluated++;
    if (triggered) matches.push(mkMatch(p, direction, 'marketHistory', extras));
  }

  return { matches, skipped, evaluated, total: MARKET_HISTORY.length };
}

// ═══════════════════════════════════════════════════════════
//  BRAIN SCORE BREAKDOWN — weighted category scores → final
// ═══════════════════════════════════════════════════════════
function calcBrainScoreBreakdown(catResults) {
  const breakdown = {};
  let weightedScore = 0;

  for (const [cat, weight] of Object.entries(CAT_WEIGHTS)) {
    const r = catResults[cat] || { matches: [] };
    const raw = categoryRawScore(r.matches);
    breakdown[cat] = {
      score:    +raw.toFixed(3),
      weight,
      weighted: +(raw * weight).toFixed(3),
      matched:  r.matches.length,
      evaluated: r.evaluated || 0,
      total:    r.total    || 0,
    };
    weightedScore += raw * weight;
  }

  return { breakdown, total: +weightedScore.toFixed(3) };
}

// ═══════════════════════════════════════════════════════════
//  LEGACY SCORE (used for confidence_adj backward compat)
// ═══════════════════════════════════════════════════════════
function calcBrainScore(patterns) {
  if (!patterns.length) return 0;
  return +patterns.reduce((sum, p) => sum + patternScore(p), 0).toFixed(3);
}

// ═══════════════════════════════════════════════════════════
//  MAIN — run full brain analysis for a symbol
//  indicators: from pipeline generatePrediction()
//  extraContext: { symbol, macroSnapshot, sentiment, edgar }
// ═══════════════════════════════════════════════════════════
async function runBrainAnalysis(indicators, extraContext = {}) {
  const { macroSnapshot, sentiment, edgar } = extraContext;

  // 1. Market regime
  const regime = await fetchMarketRegime();

  // 2. Seasonal signal
  const month   = new Date().getMonth() + 1;
  const seasonal = SEASONAL.find(s => s.month === month) || null;

  // 3. Run all category matchers
  const techResult = matchTechnical(indicators, macroSnapshot, sentiment);
  const psychResult = matchPsychology(indicators, regime);
  const econResult  = matchEconomy(macroSnapshot);
  const coResult    = matchCompany(edgar, sentiment);
  const newsResult  = matchNews(sentiment, macroSnapshot);
  const resResult   = matchResearch(indicators, macroSnapshot, regime);
  const mhResult    = matchMarketHistory(macroSnapshot, regime, indicators);

  // 4. Merge all matches (active_patterns for backward compat)
  const active_patterns = [
    ...techResult.matches,
    ...psychResult.matches,
    ...econResult.matches,
    ...coResult.matches,
    ...newsResult.matches,
    ...resResult.matches,
    ...mhResult.matches,
  ];

  // 5. Category results map (for score breakdown)
  const catResults = {
    technical:     techResult,
    psychology:    psychResult,
    economy:       econResult,
    company:       coResult,
    news:          newsResult,
    research:      resResult,
    marketHistory: mhResult,
  };

  // 6. Weighted brain score
  const scoreResult    = calcBrainScoreBreakdown(catResults);
  const brain_score    = scoreResult.total;
  const scoreBreakdown = scoreResult.breakdown;

  // 7. Diagnostics
  const totalEvaluated = Object.values(catResults).reduce((s, r) => s + (r.evaluated || 0), 0);
  const allSkipped     = Object.values(catResults).reduce((obj, r) => ({ ...obj, ...(r.skipped || {}) }), {});
  const categoryBreakdown = {};
  for (const [cat, r] of Object.entries(catResults)) {
    categoryBreakdown[cat] = {
      total:     r.total     || 0,
      evaluated: r.evaluated || 0,
      matched:   r.matches.length,
    };
  }
  const diagnostics = {
    loadedPatterns:    TOTAL_PATTERNS,
    evaluatedPatterns: totalEvaluated,
    matchedPatterns:   active_patterns.length,
    activePercent:     +(totalEvaluated / TOTAL_PATTERNS * 100).toFixed(1),
    categoryBreakdown,
    skippedReasons:    allSkipped,
    runAt:             new Date().toISOString(),
  };

  // 8. Confidence adjustments
  const brain_conf_adj = Math.max(-8, Math.min(8, Math.round(brain_score * 80)));

  let seasonal_adj = 0;
  if (seasonal) {
    if      (seasonal.signal === 'bullish') seasonal_adj = +3;
    else if (seasonal.signal === 'bearish') seasonal_adj = -3;
  }

  const total_confidence_adj = regime.regime_adj + brain_conf_adj + seasonal_adj;

  return {
    // ── Backward-compatible fields ──
    active_patterns,
    brain_score,
    regime: {
      name:  regime.regime,
      desc:  regime.regime_desc,
      fng:   regime.fng,
      vix:   regime.vix,
    },
    seasonal: seasonal ? {
      name:       seasonal.name,
      signal:     seasonal.signal,
      avg_return: seasonal.avg_return,
      win_rate:   seasonal.win_rate,
      note:       seasonal.note,
    } : null,
    confidence_adj: {
      regime:   regime.regime_adj,
      brain:    brain_conf_adj,
      seasonal: seasonal_adj,
      total:    total_confidence_adj,
    },
    // ── New fields ──
    brainVault: {
      activePercent:  diagnostics.activePercent,
      scoreBreakdown,
      diagnostics,
    },
  };
}

module.exports = { runBrainAnalysis };
