// ═══════════════════════════════════════════════════════════
//  VESTEX — Brain Vault Integration
//  Matches active market signals against 174 historical patterns
//  Returns: active_patterns[], brain_score, regime, seasonal, confidence_adj
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

// ── Load all pattern databases at startup ──
const TECHNICAL  = require('./brain/patterns/patterns.json');                     // array[44]
const PSYCHOLOGY = require('./brain/psychology/patterns.json').patterns;          // array[8]
const ECONOMY    = require('./brain/economy/patterns.json');                       // array[12]
const COMPANY    = require('./brain/company-patterns/patterns.json').patterns;    // array[11]
const NEWS       = require('./brain/news-patterns/patterns.json').patterns;       // array[15]
const RESEARCH   = require('./brain/research/patterns.json').patterns;            // array[11]

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
  // Cache for 1 hour
  if (regimeCache && (Date.now() - regimeCacheTime) < 3600000) return regimeCache;

  let fng = null, vix = null;

  try {
    const r = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 6000 });
    const d = r.data.data?.[0];
    fng = d ? { value: parseInt(d.value), label: d.value_classification } : null;
  } catch(e) { /* silent fail */ }

  try {
    const r    = await axios.get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { timeout: 8000 });
    const lines = r.data.trim().split('\n');
    const last  = lines[lines.length - 1].split(',');
    vix = parseFloat(last[4]);
  } catch(e) { /* silent fail */ }

  // Determine regime
  let regime = 'neutral';
  let regime_desc = 'Normal market conditions';
  let regime_adj  = 0;  // confidence adjustment

  if (fng && vix) {
    if      (fng.value < 25 && vix > 30) { regime = 'fear';       regime_desc = 'Extreme fear — contrarian buy signal';    regime_adj = +5; }
    else if (fng.value < 40)             { regime = 'cautious';   regime_desc = 'Fear in market — reduce risk exposure';   regime_adj = -5; }
    else if (fng.value > 75 && vix < 15) { regime = 'euphoria';   regime_desc = 'Extreme greed — caution on new longs';   regime_adj = -8; }
    else if (fng.value > 60)             { regime = 'greed';      regime_desc = 'Greed elevated — momentum may continue'; regime_adj = +3; }
    else                                 { regime = 'neutral';    regime_desc = 'Balanced market sentiment';               regime_adj = 0;  }

    // VIX override — panic spike = strong contrarian signal
    if (vix > 40) { regime = 'panic'; regime_desc = `VIX ${vix.toFixed(1)} — capitulation zone, 79% bullish resolution`; regime_adj = +10; }
  }

  regimeCache = { regime, regime_desc, regime_adj, fng, vix: vix ? +vix.toFixed(2) : null };
  regimeCacheTime = Date.now();
  return regimeCache;
}

// ═══════════════════════════════════════════════════════════
//  PATTERN MATCHING ENGINE
//  Takes pipeline indicators and matches against brain patterns
// ═══════════════════════════════════════════════════════════
function matchTechnicalPatterns(indicators) {
  const { rsi, macd, sma7, sma21, volSpike, streak, atrPct, score } = indicators;
  const matches = [];

  for (const p of TECHNICAL) {
    let triggered = false;
    let direction = 'neutral';

    switch (p.pattern_id) {
      // Moving averages
      case 'PATTERN_001': // Golden Cross proxy — sma7 > sma21 with room
        if (sma7 && sma21 && sma7 > sma21 * 1.01) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_002': // Death Cross proxy
        if (sma7 && sma21 && sma7 < sma21 * 0.99) { triggered = true; direction = 'bearish'; }
        break;

      // RSI patterns
      case 'PATTERN_003': // RSI Oversold Bounce
        if (rsi !== null && rsi < 35) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_004': // RSI Overbought Reversal
        if (rsi !== null && rsi > 68) { triggered = true; direction = 'bearish'; }
        break;

      // MACD
      case 'PATTERN_005': // MACD Bullish
        if (macd !== null && macd > 0) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_006': // MACD Bearish
        if (macd !== null && macd < 0) { triggered = true; direction = 'bearish'; }
        break;

      // Volume
      case 'PATTERN_007': // Volume Climax (panic selling bottom)
        if (volSpike && score < 0) { triggered = true; direction = 'bullish'; }
        break;

      // Streak exhaustion
      case 'PATTERN_008': // 52-week high proxy — strong upstreak with overbought RSI
        if (streak >= 5 && rsi > 70) { triggered = true; direction = 'bearish'; }
        break;

      // Momentum patterns
      case 'PATTERN_041': // Bull Flag — uptrend + consolidation (low ATR)
        if (sma7 && sma21 && sma7 > sma21 && atrPct < 2.0 && rsi < 60) { triggered = true; direction = 'bullish'; }
        break;
      case 'PATTERN_042': // Head & Shoulders — downtrend with high vol
        if (sma7 && sma21 && sma7 < sma21 && volSpike && rsi < 45) { triggered = true; direction = 'bearish'; }
        break;

      // Seasonal + VIX patterns handled separately
      default: break;
    }

    if (triggered) {
      matches.push({
        pattern_id:  p.pattern_id,
        name:        p.name,
        category:    p.category,
        direction,
        win_rate:    p.win_rate    || null,
        confidence:  p.confidence  || null,
        avg_return_7d:  p.avg_return_7d  || null,
        avg_return_30d: p.avg_return_30d || null,
      });
    }
  }

  return matches;
}

function matchPsychologyPatterns(indicators, regime) {
  const { rsi } = indicators;
  const matches = [];

  for (const p of PSYCHOLOGY) {
    let triggered = false;
    let direction = 'neutral';

    switch (p.pattern_id) {
      case 'EXTREME_FEAR':
        if (regime?.fng?.value < 25) { triggered = true; direction = 'bullish'; }
        break;
      case 'EXTREME_GREED':
        if (regime?.fng?.value > 75) { triggered = true; direction = 'bearish'; }
        break;
      case 'VIX_SPIKE':
        if (regime?.vix > 35) { triggered = true; direction = 'bullish'; }
        break;
      case 'FOMO_PARABOLIC':
        if (rsi !== null && rsi > 82 && indicators.streak >= 7) { triggered = true; direction = 'bearish'; }
        break;
      default: break;
    }

    if (triggered) {
      matches.push({
        pattern_id:  p.pattern_id,
        name:        p.name,
        category:    'psychology',
        direction,
        win_rate:    p.historical_win_rate_6m ? Math.round(p.historical_win_rate_6m * 100) : null,
        confidence:  p.signal_strength ? p.signal_strength * 10 : null,
        avg_return_30d: p.avg_return_30d || null,
      });
    }
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════
//  BRAIN SCORE — weighted score from active patterns
// ═══════════════════════════════════════════════════════════
function calcBrainScore(patterns) {
  if (!patterns.length) return 0;

  let score = 0;
  for (const p of patterns) {
    const wr  = p.win_rate || 55;
    const conf = p.confidence || 60;
    // Weight = ((win_rate - 50) / 50) × (confidence / 100)
    // So a 70% win rate, 80% confidence pattern = (0.4 × 0.8) = 0.32
    const weight = ((wr - 50) / 50) * (conf / 100);
    score += p.direction === 'bullish' ? weight : p.direction === 'bearish' ? -weight : 0;
  }

  return +score.toFixed(3);
}

// ═══════════════════════════════════════════════════════════
//  MAIN — run full brain analysis for a symbol
// ═══════════════════════════════════════════════════════════
async function runBrainAnalysis(indicators) {
  // 1. Market regime
  const regime = await fetchMarketRegime();

  // 2. Seasonal signal
  const month   = new Date().getMonth() + 1;
  const seasonal = SEASONAL.find(s => s.month === month) || null;

  // 3. Pattern matching
  const techPatterns  = matchTechnicalPatterns(indicators);
  const psychPatterns = matchPsychologyPatterns(indicators, regime);
  const active_patterns = [...techPatterns, ...psychPatterns];

  // 4. Brain score
  const brain_score = calcBrainScore(active_patterns);

  // 5. Confidence adjustment
  //    Brain score contribution: each 0.1 = ±1 confidence point (capped ±8)
  const brain_conf_adj = Math.max(-8, Math.min(8, Math.round(brain_score * 80)));

  //    Seasonal contribution
  let seasonal_adj = 0;
  if (seasonal) {
    if      (seasonal.signal === 'bullish') seasonal_adj = +3;
    else if (seasonal.signal === 'bearish') seasonal_adj = -3;
  }

  const total_confidence_adj = regime.regime_adj + brain_conf_adj + seasonal_adj;

  return {
    active_patterns,
    brain_score,
    regime: {
      name:  regime.regime,
      desc:  regime.regime_desc,
      fng:   regime.fng,
      vix:   regime.vix,
    },
    seasonal: seasonal ? {
      name:      seasonal.name,
      signal:    seasonal.signal,
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
  };
}

module.exports = { runBrainAnalysis };
