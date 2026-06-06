// ═══════════════════════════════════════════════════════════
//  VESTEX — Live Pattern Matching Prediction Engine v1.0
//
//  Formula:
//    Live Pattern Match Score =
//      currentPatternStrength
//      × historicalWinRate
//      × averageReturnQuality
//      × regimeCompatibility
//      × dataConfidence
//
//  Consensus Prediction Score = weighted evidence from 7 systems.
//  Conflict detection reduces confidence when systems disagree.
//  Agreement across 3+ systems boosts confidence.
// ═══════════════════════════════════════════════════════════
'use strict';

const DEFAULT_WIN_RATE = 0.55;

// ── Technical indicator strength: how deeply is the condition met? ──
// Returns 0.0–1.0 based on how far the live value is into the trigger zone.
function _techDepth(patternId, ind) {
  if (!ind) return null;
  const { rsi, macd, sma7, sma21, streak } = ind;
  switch (patternId) {
    case 'PATTERN_001': return (sma7 && sma21) ? Math.min(1, Math.max(0.05, (sma7 / sma21 - 1.0) / 0.06)) : null;
    case 'PATTERN_002': return (sma7 && sma21) ? Math.min(1, Math.max(0.05, (1.0 - sma7 / sma21) / 0.06)) : null;
    case 'PATTERN_003': return rsi != null     ? Math.min(1, Math.max(0.05, (35 - rsi) / 25)) : null;
    case 'PATTERN_004': return rsi != null     ? Math.min(1, Math.max(0.05, (rsi - 68) / 27)) : null;
    case 'PATTERN_005': return macd != null    ? Math.min(1, Math.max(0.05, macd / 2.5))      : null;
    case 'PATTERN_006': return macd != null    ? Math.min(1, Math.max(0.05, -macd / 2.5))     : null;
    case 'PATTERN_008': return streak          ? Math.min(1, Math.max(0.05, (streak - 4) / 4))  : null;
    case 'PATTERN_009': return streak          ? Math.min(1, Math.max(0.05, (-streak - 4) / 4)) : null;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────
//  1. currentPatternStrength  (0.0 → 1.0)
//     How strongly the trigger condition is currently met.
// ─────────────────────────────────────────────────────────
function computeCurrentStrength(pattern, indicators) {
  const techDepth = _techDepth(pattern.pattern_id, indicators);
  if (techDepth !== null) return +techDepth.toFixed(3);

  // Use explicit confidence field (0–100 → 0–1)
  if (pattern.confidence != null) return +Math.min(1, pattern.confidence / 100).toFixed(3);

  // Map impact level
  const impactMap = { high: 0.92, medium: 0.70, low: 0.45 };
  return impactMap[pattern.impact] || 0.62;
}

// ─────────────────────────────────────────────────────────
//  2. historicalWinRate  (0.30 → 1.00)
//     Fraction of times this pattern led to the correct move historically.
// ─────────────────────────────────────────────────────────
function computeHistoricalWinRate(pattern) {
  const wr = pattern.win_rate;
  if (wr == null) return DEFAULT_WIN_RATE;
  return +Math.min(1, Math.max(0.30, wr / 100)).toFixed(3);
}

// ─────────────────────────────────────────────────────────
//  3. averageReturnQuality  (0.0 → 1.0)
//     Normalized quality of historical returns.
//     -5% → 0.0,  0% → 0.50,  +5% → 1.0
// ─────────────────────────────────────────────────────────
function computeReturnQuality(pattern) {
  const ret = pattern.avg_return_7d ?? pattern.avg_return_30d ?? null;
  if (ret == null) return 0.52; // slightly above neutral (patterns exist for a reason)
  return +Math.min(1, Math.max(0, (ret + 5) / 10)).toFixed(3);
}

// ─────────────────────────────────────────────────────────
//  4. regimeCompatibility  (0.50 → 1.30)
//     Does current market regime amplify or dampen this pattern?
//     Bullish patterns are stronger in fear; bearish stronger in greed.
// ─────────────────────────────────────────────────────────
function computeRegimeCompat(pattern, fearGreed, vix) {
  const dir = pattern.direction;
  const fg  = fearGreed?.value ?? 50;
  const v   = vix?.value ?? 20;

  if (dir === 'bullish') {
    if (fg < 20 && v > 30) return 1.30; // extreme fear = max contrarian upside
    if (fg < 28)           return 1.20;
    if (fg < 42)           return 1.08;
    if (fg < 60)           return 1.00; // neutral
    if (fg < 76)           return 0.82; // greed — crowded trade risk
    return 0.62;                         // extreme greed = most crowded
  }

  if (dir === 'bearish') {
    if (fg > 80)           return 1.25; // extreme greed = max confirmation for bears
    if (fg > 65)           return 1.12;
    if (fg > 50)           return 1.00; // neutral
    if (fg > 34)           return 0.88; // mild fear
    if (fg > 20)           return 0.74; // fear — selling may already be priced in
    return 0.55;                         // extreme fear + bearish = contrarian fade
  }

  return 1.00; // neutral pattern
}

// ─────────────────────────────────────────────────────────
//  5. dataConfidence  (0.40 → 1.00)
//     How complete is the data we have for this specific pattern type?
// ─────────────────────────────────────────────────────────
function computeDataConf(pattern, indicators, macro, sentiment, edgar) {
  switch (pattern.category) {
    case 'technical': {
      if (!indicators) return 0.40;
      const hasCore = indicators.rsi != null && indicators.macd != null && indicators.sma7 != null;
      return hasCore ? 1.00 : 0.62;
    }
    case 'economy': {
      if (!macro) return 0.40;
      const populated = Object.values(macro).filter(v => v?.value != null).length;
      return +Math.min(1.0, 0.40 + populated * 0.07).toFixed(2);
    }
    case 'news': {
      if (!sentiment?.summary) return 0.40;
      return sentiment.score != null ? 1.00 : 0.72;
    }
    case 'company': {
      if (!edgar || edgar.error) return 0.40;
      return 0.88;
    }
    case 'psychology':
    case 'research':
      return indicators ? 0.82 : 0.48;
    case 'marketHistory':
      return (macro && indicators) ? 0.95 : macro ? 0.68 : 0.50;
    default:
      return 0.68;
  }
}

// ─────────────────────────────────────────────────────────
//  Per-pattern LPMS computation
// ─────────────────────────────────────────────────────────
function scoreOnePattern(pattern, indicators, macro, sentiment, edgar, fearGreed, vix) {
  const strength   = computeCurrentStrength(pattern, indicators);
  const winRate    = computeHistoricalWinRate(pattern);
  const retQuality = computeReturnQuality(pattern);
  const regimeComp = computeRegimeCompat(pattern, fearGreed, vix);
  const dataConf   = computeDataConf(pattern, indicators, macro, sentiment, edgar);

  const lpms = +(strength * winRate * retQuality * regimeComp * dataConf).toFixed(4);

  return {
    pattern_id: pattern.pattern_id,
    name:       pattern.name,
    category:   pattern.category,
    direction:  pattern.direction,
    reason:     pattern.reason || null,
    lpms,
    winRatePct: +(winRate * 100).toFixed(0),
    components: { strength, winRate, retQuality, regimeComp, dataConf },
  };
}

// ─────────────────────────────────────────────────────────
//  Aggregate LPMS across all active patterns
//  Net range in practice: roughly -4 to +4
//  Normalized to 0–10: (netScore + 4) / 8 × 10
// ─────────────────────────────────────────────────────────
function computeLPMS(activePatterns, indicators, macro, sentiment, edgar, fearGreed, vix) {
  if (!activePatterns || !activePatterns.length) {
    return { score: 5.0, bullStrength: 0, bearStrength: 0, netScore: 0, patternCount: 0, bullCount: 0, bearCount: 0, scoredPatterns: [] };
  }

  const scored = activePatterns.map(p =>
    scoreOnePattern(p, indicators, macro, sentiment, edgar, fearGreed, vix)
  );

  const bulls = scored.filter(p => p.direction === 'bullish');
  const bears = scored.filter(p => p.direction === 'bearish');
  const bullStrength = +bulls.reduce((s, p) => s + p.lpms, 0).toFixed(4);
  const bearStrength = +bears.reduce((s, p) => s + p.lpms, 0).toFixed(4);
  const netScore     = +(bullStrength - bearStrength).toFixed(4);
  const score        = +Math.min(10, Math.max(0, (netScore + 4) / 8 * 10)).toFixed(2);

  return {
    score,
    bullStrength,
    bearStrength,
    netScore,
    patternCount:   scored.length,
    bullCount:      bulls.length,
    bearCount:      bears.length,
    scoredPatterns: scored.sort((a, b) => b.lpms - a.lpms),
  };
}

// ─────────────────────────────────────────────────────────
//  Chart Structure Analysis
//  Detects tradeable chart patterns from OHLCV bar data.
//  Works with 20–252 daily bars.
// ─────────────────────────────────────────────────────────
function analyzeChartStructure(bars, livePrice, spyData = null) {
  const patterns = [];
  const signals  = {};

  if (!bars || bars.length < 15) {
    return { patterns, signals, note: 'Insufficient bar data for chart analysis' };
  }

  const closes = bars.map(b => b.close);
  const highs  = bars.map(b => b.high);
  const lows   = bars.map(b => b.low);
  const vols   = bars.map(b => b.volume);
  const price  = livePrice || closes[closes.length - 1];

  // Period high/low (full bar range available)
  const periodHigh = Math.max(...highs);
  const periodLow  = Math.min(...lows);
  const pctFromHigh = (periodHigh - price) / periodHigh * 100;
  const pctFromLow  = (price - periodLow) / periodLow * 100;

  signals.periodHigh  = +periodHigh.toFixed(2);
  signals.periodLow   = +periodLow.toFixed(2);
  signals.pctFromHigh = +pctFromHigh.toFixed(2);
  signals.pctFromLow  = +pctFromLow.toFixed(2);

  // ── Pattern: Fresh 45-Day ATH — no overhead resistance (Pattern_122) ──
  // NOTE: "ATH" here means 45-day period high only — not a multi-year or 5-year ATH
  if (pctFromHigh <= 2.5) {
    patterns.push({
      pattern_id: 'CHART_45D_ATH',
      name: 'Price at 45-Day High — No Overhead Resistance',
      category: 'chart',
      direction: 'bullish',
      strength: +(1.0 - (pctFromHigh / 2.5) * 0.25).toFixed(3),
      note: `${pctFromHigh.toFixed(1)}% off 45-day high — making new period highs, no sellers above in this window`,
      win_rate: null, avg_return_7d: null, impact: 'high',
    });
  }

  // ── Pattern: Blow-Off Top — spike then reversal ──
  if (bars.length >= 12) {
    const pre7High  = Math.max(...highs.slice(-12, -5));
    const last5High = Math.max(...highs.slice(-5));
    const spikeUp   = (last5High - pre7High) / pre7High * 100;
    const peakToNow = (price - last5High) / last5High * 100;

    if (spikeUp > 5.5 && peakToNow < -2.8) {
      patterns.push({
        pattern_id: 'CHART_BLOWOFF_TOP',
        name: 'Blow-Off Top / Failed Breakout',
        category: 'chart',
        direction: 'bearish',
        strength: +Math.min(1, spikeUp / 15).toFixed(3),
        note: `+${spikeUp.toFixed(1)}% spike then ${peakToNow.toFixed(1)}% reversal — distribution in progress`,
        win_rate: 71, avg_return_7d: -2.8, impact: 'high',
      });
    }
  }

  // ── Pattern: Return to Prior Resistance ──
  if (pctFromHigh > 2.5 && pctFromHigh <= 9.0 && bars.length >= 20) {
    const peakIdx      = highs.indexOf(periodHigh);
    const barsSincePeak = bars.length - 1 - peakIdx;
    if (barsSincePeak > 7 && barsSincePeak < bars.length * 0.85) {
      const pullbackLow = Math.min(...lows.slice(peakIdx));
      const pullbackPct = (periodHigh - pullbackLow) / periodHigh * 100;
      if (pullbackPct > 4) {
        patterns.push({
          pattern_id: 'CHART_RETURN_TO_RESISTANCE',
          name: 'Return to Prior Resistance Zone',
          category: 'chart',
          direction: 'bearish',
          strength: 0.68,
          note: `Approaching resistance $${periodHigh.toFixed(2)} — prior high hit ${barsSincePeak} bars ago, ${pullbackPct.toFixed(1)}% pullback since`,
          win_rate: 62, avg_return_7d: -1.6, impact: 'medium',
        });
      }
    }
  }

  // ── Pattern: Distribution — lower highs + heavy down volume ──
  if (bars.length >= 12) {
    const last12 = bars.slice(-12);
    let lowerHighs = 0;
    for (let i = 1; i < last12.length; i++) {
      if (last12[i].high < last12[i - 1].high) lowerHighs++;
    }
    const downDayVols = last12.filter(b => b.close < b.open).map(b => b.volume);
    const upDayVols   = last12.filter(b => b.close >= b.open).map(b => b.volume);
    const avgDown = downDayVols.length ? downDayVols.reduce((a, b) => a + b, 0) / downDayVols.length : 0;
    const avgUp   = upDayVols.length   ? upDayVols.reduce((a, b) => a + b, 0) / upDayVols.length   : 1;

    if (lowerHighs >= 7 && avgDown > avgUp * 1.25) {
      patterns.push({
        pattern_id: 'CHART_DISTRIBUTION',
        name: 'Distribution Under Supply',
        category: 'chart',
        direction: 'bearish',
        strength: +Math.min(1, (avgDown / avgUp - 1) * 1.8).toFixed(3),
        note: `${lowerHighs}/11 lower-highs + ${(avgDown / avgUp).toFixed(1)}x heavier volume on down days`,
        win_rate: 64, avg_return_7d: -2.1, impact: 'medium',
      });
    }
  }

  // ── Pattern: Higher Lows (20-Day) — Pattern_123 ──
  // NOTE: "Multi-Year Higher Lows" label was misleading — this checks 20 daily bars (~4 weeks only)
  if (bars.length >= 22) {
    const recent20Lows = lows.slice(-20);
    let higherLows = 0;
    for (let i = 1; i < recent20Lows.length; i++) {
      if (recent20Lows[i] > recent20Lows[i - 1]) higherLows++;
    }
    if (higherLows >= 12 && pctFromHigh <= 12) {
      patterns.push({
        pattern_id: 'CHART_HIGHER_LOWS_20D',
        name: 'Higher Lows (20-Day Window) — Short-Term Accumulation',
        category: 'chart',
        direction: 'bullish',
        strength: +Math.min(1, higherLows / 19).toFixed(3),
        note: `${higherLows}/19 higher lows in 20-day window — consistent demand at each dip`,
        win_rate: null, avg_return_7d: null, impact: 'medium',
      });
    }
  }

  // ── Pattern: Short-Term V-Recovery — Pattern_124 ──
  // NOTE: "Post-Crash Full Recovery" was misleading — this detects any 25%+ drawdown+recovery
  //       within the current bar window (max 45-252 days depending on endpoint), not a macro crash
  if (bars.length >= 30) {
    const crashLow     = Math.min(...lows.slice(0, -15));
    const crashLowIdx  = lows.slice(0, -15).indexOf(crashLow);
    const precrashHigh = Math.max(...highs.slice(0, crashLowIdx + 1));
    const crashDepth   = (precrashHigh - crashLow) / precrashHigh * 100;
    const recovery     = (price - crashLow) / (precrashHigh - crashLow) * 100;

    if (crashDepth > 25 && recovery > 50 && recovery < 105) {
      patterns.push({
        pattern_id: 'CHART_SHORT_TERM_VRECOVERY',
        name: 'V-Recovery in Progress (Window Drawdown)',
        category: 'chart',
        direction: 'bullish',
        strength: +Math.min(1, recovery / 100).toFixed(3),
        note: `Down ${crashDepth.toFixed(0)}% within window, now ${recovery.toFixed(0)}% recovered from that low — selling pressure easing`,
        win_rate: null, avg_return_7d: null, impact: 'high',
      });
    }
  }

  // ── Volatility warning — ATR/Price > 2.5% ──
  if (bars.length >= 14) {
    let atrSum = 0;
    const recent15 = bars.slice(-15);
    for (let i = 1; i < recent15.length; i++) {
      atrSum += Math.max(
        recent15[i].high - recent15[i].low,
        Math.abs(recent15[i].high - recent15[i - 1].close),
        Math.abs(recent15[i].low  - recent15[i - 1].close)
      );
    }
    const atr    = atrSum / 14;
    const atrPct = (atr / price) * 100;
    signals.atrPct = +atrPct.toFixed(2);

    if (atrPct > 2.5) {
      patterns.push({
        pattern_id: 'CHART_HIGH_ATR',
        name: 'High Volatility Stock',
        category: 'chart',
        direction: 'neutral',
        strength: +Math.min(1, (atrPct - 2.5) / 3).toFixed(3),
        note: `ATR = ${atrPct.toFixed(1)}% of price — signals less reliable, reduce position size`,
        win_rate: 50, avg_return_7d: 0, impact: 'low',
        isVolatilityWarning: true,
      });
    }
  }

  // ── Pattern: Relative Strength Outlier (Pattern_117) ──
  // Requires SPY comparison data. Direction: bullish if outperforming, bearish if underperforming.
  // win_rate intentionally null — pending Verification Intelligence validation.
  if (spyData?.return10d != null && bars.length >= 10) {
    const stockReturn10d = (price - closes[closes.length - 10]) / closes[closes.length - 10] * 100;
    const relStrength    = +(stockReturn10d - spyData.return10d).toFixed(2);
    const absRel         = Math.abs(relStrength);

    if (absRel >= 5) {
      patterns.push({
        pattern_id:      'CHART_REL_STRENGTH',
        name:            relStrength > 0 ? 'Relative Strength Outlier — Outperforming SPY' : 'Relative Weakness Outlier — Underperforming SPY',
        category:        'chart',
        direction:       relStrength > 0 ? 'bullish' : 'bearish',
        strength:        +Math.min(1, absRel / 20).toFixed(3),
        note:            `${relStrength > 0 ? '+' : ''}${relStrength.toFixed(1)}% vs SPY over 10 trading days — ${relStrength > 0 ? 'outperforming the market' : 'underperforming the market'}`,
        win_rate:        null,  // not hardcoded — pending VI validation
        avg_return_7d:   null,
        impact:          absRel >= 10 ? 'high' : 'medium',
        relStrength,
        stockReturn10d:  +stockReturn10d.toFixed(2),
        spyReturn10d:    +spyData.return10d.toFixed(2),
      });
    }
  }

  // ── Trend direction and volume meta-signals ──
  if (closes.length >= 22) {
    const first10avg = closes.slice(-22, -12).reduce((a, b) => a + b, 0) / 10;
    const last10avg  = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const trendPct   = (last10avg - first10avg) / first10avg * 100;
    signals.trendPct = +trendPct.toFixed(2);
    signals.trendDir = trendPct > 2 ? 'uptrend' : trendPct < -2 ? 'downtrend' : 'sideways';
  }

  if (vols.length >= 12) {
    const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const priorVol  = vols.slice(-12, -5).reduce((a, b) => a + b, 0) / 7;
    signals.volumeTrend = recentVol > priorVol * 1.3 ? 'rising' : recentVol < priorVol * 0.7 ? 'falling' : 'stable';
    signals.volRatio    = +(recentVol / priorVol).toFixed(2);
  }

  return { patterns, signals };
}

// ─────────────────────────────────────────────────────────
//  Conflict detection
//  Compares 7 independent systems for directional agreement.
// ─────────────────────────────────────────────────────────
function detectConflicts(systems) {
  const actionable = systems.filter(s => s.direction !== 'neutral' && s.strength > 0.25);
  const bulls = actionable.filter(s => s.direction === 'bullish');
  const bears = actionable.filter(s => s.direction === 'bearish');

  const conflicts  = [];
  const agreements = [];

  // Tech vs Macro conflict
  const techBull  = systems.find(s => s.name === 'technical'    && s.direction === 'bullish');
  const macroBear = systems.find(s => s.name === 'macro'        && s.direction === 'bearish' && s.strength > 0.55);
  if (techBull && macroBear) conflicts.push('Technical indicators are bullish but macroeconomic conditions are bearish — macro risk overrides near-term charts');

  // Sentiment vs Chart conflict
  const sentBear    = systems.find(s => s.name === 'sentiment' && s.direction === 'bearish');
  const chartBull   = systems.find(s => s.name === 'chart'     && s.direction === 'bullish');
  const patternBull = systems.find(s => s.name === 'patterns'  && s.direction === 'bullish');
  if (sentBear && (chartBull || patternBull)) conflicts.push('Chart patterns are bullish but news sentiment is negative — wait for sentiment confirmation');

  const sentBull    = systems.find(s => s.name === 'sentiment' && s.direction === 'bullish');
  const patternBear = systems.find(s => s.name === 'patterns'  && s.direction === 'bearish');
  if (sentBull && patternBear) conflicts.push('News sentiment is positive but price patterns indicate distribution — narrative diverges from price action');

  // Strong tech bearish vs strong fundamentals bullish
  const techBear  = systems.find(s => s.name === 'technical'    && s.direction === 'bearish' && s.strength > 0.55);
  const fundBull  = systems.find(s => s.name === 'fundamentals' && s.direction === 'bullish');
  if (techBear && fundBull) conflicts.push('Fundamentals are strong but price momentum is negative — may be a temporary pullback in a quality stock');

  // Regime vs patterns conflict
  const regimeBear   = systems.find(s => s.name === 'regime'   && s.direction === 'bearish' && s.strength > 0.6);
  const patternBull2 = systems.find(s => s.name === 'patterns' && s.direction === 'bullish' && s.strength > 0.5);
  if (regimeBear && patternBull2) conflicts.push('Market regime is bearish (high VIX / fear) but individual patterns are bullish — macro headwind reduces reliability');

  // Agreements
  if (bulls.length >= 3) {
    agreements.push(`${bulls.length} independent systems confirm bullish: ${bulls.map(s => s.name).join(', ')}`);
  }
  if (bears.length >= 3) {
    agreements.push(`${bears.length} independent systems confirm bearish: ${bears.map(s => s.name).join(', ')}`);
  }

  const dominant =
    bulls.length > bears.length ? 'bullish' :
    bears.length > bulls.length ? 'bearish' : 'neutral';

  return {
    conflicts,
    agreements,
    conflictCount:   conflicts.length,
    agreementCount:  agreements.length,
    bullSystemCount: bulls.length,
    bearSystemCount: bears.length,
    dominantDirection: dominant,
  };
}

// ─────────────────────────────────────────────────────────
//  Consensus Score  (0–100)
//  Weights: livePatterns 28%, technical 20%, macro 14%,
//           regime 12%, sentiment 10%, fundamentals 8%, history 8%
// ─────────────────────────────────────────────────────────
function computeConsensusScore(lpms, techNorm, macroNorm, regimeNorm, sentNorm, fundNorm, histNorm, conflictResult) {
  const W = {
    livePatterns: 0.28,
    technical:    0.20,
    macro:        0.14,
    regime:       0.12,
    sentiment:    0.10,
    fundamentals: 0.08,
    history:      0.08,
  };

  const normPatterns = lpms.score / 10;

  let raw = (
    W.livePatterns * normPatterns +
    W.technical    * techNorm     +
    W.macro        * macroNorm    +
    W.regime       * regimeNorm   +
    W.sentiment    * sentNorm     +
    W.fundamentals * fundNorm     +
    W.history      * histNorm
  ) * 100;

  // Conflict penalty — each disagreement reduces score toward neutral
  raw -= conflictResult.conflictCount * 4.5;

  // Agreement bonus — 3+ systems aligned = market is clear
  if (conflictResult.bullSystemCount >= 3) raw += 5;
  if (conflictResult.bearSystemCount >= 3) raw -= 5;

  return +Math.min(100, Math.max(0, raw).toFixed(1));
}

// ─────────────────────────────────────────────────────────
//  Final Decision + Hold Time
// ─────────────────────────────────────────────────────────
function mapDecision(consensusScore, conflictResult, lpms) {
  // No validated pattern match — don't force a prediction
  if (Math.abs(lpms.netScore) < 0.12 && consensusScore > 42 && consensusScore < 60) {
    return 'HOLD';
  }
  // Strong conflict forces neutrality
  if (conflictResult.conflictCount >= 3) return 'HOLD';
  if (conflictResult.conflictCount >= 2 && consensusScore > 44 && consensusScore < 70) return 'HOLD';

  if      (consensusScore >= 83) return 'STRONG BUY';
  else if (consensusScore >= 68) return 'BUY';
  else if (consensusScore >= 57) return 'BUY SMALL';
  else if (consensusScore >= 45) return 'HOLD';
  else if (consensusScore >= 36) return 'WAIT';
  else if (consensusScore >= 22) return 'SELL';
  else                           return 'STRONG SELL';
}

const HOLD_TIMES = {
  'STRONG BUY':  '30–90 Days',
  'BUY':         '14–60 Days',
  'BUY SMALL':   '7–30 Days',
  'HOLD':        'Monitor Weekly',
  'WAIT':        'Wait for Entry Signal',
  'SELL':        'Exit Position',
  'STRONG SELL': 'Exit Immediately',
};

// ─────────────────────────────────────────────────────────
//  Risk Assessment
// ─────────────────────────────────────────────────────────
function assessRisk(consensusScore, indicators, vix, conflictCount) {
  let pts = 0;
  const v   = vix?.value;
  const atr = indicators?.atrPct;
  if (consensusScore < 35)  pts += 2;
  if (v && v > 35)          pts += 2;
  if (v && v > 25)          pts += 1;
  if (atr && atr > 3.5)     pts += 2;
  if (atr && atr > 2.0)     pts += 1;
  if (conflictCount >= 2)   pts += 1;
  return pts >= 5 ? 'Very High' : pts >= 3 ? 'High' : pts >= 1 ? 'Medium' : 'Low';
}

// ─────────────────────────────────────────────────────────
//  Confidence  (22–93%)
// ─────────────────────────────────────────────────────────
function computeConfidence(dataCount, consensusScore, lpms, conflictCount, agreementCount) {
  const dataBase       = Math.round(dataCount / 8 * 28);     // 0–28 from data completeness
  const agreementBase  = Math.max(0, 26 - conflictCount * 8 + agreementCount * 5); // 0–26
  const conviction     = Math.round(Math.abs(consensusScore - 50) / 50 * 20);      // 0–20
  const patternBonus   = Math.round(Math.min(3.5, Math.abs(lpms.netScore)) * 4);   // 0–14
  return Math.min(93, Math.max(22, dataBase + agreementBase + conviction + patternBonus));
}

// ─────────────────────────────────────────────────────────
//  Top Reasons (max 7 bullets)
// ─────────────────────────────────────────────────────────
function buildTopReasons(lpms, chartStructure, macro, sentiment, fearGreed, vix, brainResult) {
  const reasons = [];

  // Top 3 active live patterns
  for (const p of lpms.scoredPatterns.slice(0, 3)) {
    const wrLabel = p.winRatePct ? ` (${p.winRatePct}% historical win rate)` : '';
    reasons.push(`[${(p.category || 'chart').toUpperCase()}] ${p.name}${wrLabel}${p.reason ? ' — ' + p.reason : ''}`);
  }

  // Chart patterns (non-volatility)
  for (const cp of chartStructure.patterns.filter(p => !p.isVolatilityWarning).slice(0, 2)) {
    reasons.push(`[CHART] ${cp.name} — ${cp.note}`);
  }

  // Macro notable signals
  if (macro?.yieldCurve?.value != null && Math.abs(macro.yieldCurve.value) > 0.4) {
    const yc = macro.yieldCurve.value;
    reasons.push(`[MACRO] Yield curve ${yc >= 0 ? '+' : ''}${yc.toFixed(2)}% — ${yc < 0 ? '⚠ inverted (recession indicator)' : 'steepening (recovery signal)'}`);
  }

  // Sentiment
  if (sentiment?.overall && sentiment.overall !== 'neutral') {
    reasons.push(`[SENTIMENT] News is ${sentiment.overall} (score ${sentiment.score?.toFixed(0) ?? '?'}/100)`);
  }

  // Fear & Greed extreme
  if (fearGreed?.value != null) {
    const fg = fearGreed.value;
    if (fg < 28) reasons.push(`[REGIME] Extreme Fear (F&G=${fg}) — historically a contrarian buy opportunity`);
    else if (fg > 74) reasons.push(`[REGIME] Extreme Greed (F&G=${fg}) — market overextended, caution on new longs`);
  }

  // Seasonal
  const seasonal = brainResult?.seasonal;
  if (seasonal) {
    reasons.push(`[SEASONAL] ${seasonal.name} — ${seasonal.note} (${seasonal.win_rate}% win rate historically)`);
  }

  return reasons.slice(0, 7);
}

// ─────────────────────────────────────────────────────────
//  Warnings
// ─────────────────────────────────────────────────────────
function buildPredictionWarnings(indicators, chartStructure, macro, vix, fearGreed, conflictResult) {
  const warns = [];

  for (const c of conflictResult.conflicts) {
    warns.push({ text: c, level: 'medium' });
  }

  const blowoff = chartStructure.patterns.find(p => p.pattern_id === 'CHART_BLOWOFF_TOP');
  if (blowoff) warns.push({ text: `Blow-off top detected — ${blowoff.note}`, level: 'high' });

  const highAtr = chartStructure.patterns.find(p => p.pattern_id === 'CHART_HIGH_ATR');
  if (highAtr) warns.push({ text: `High volatility (ATR ${chartStructure.signals.atrPct}%) — reduce position size`, level: 'medium' });

  if (macro?.yieldCurve?.value < -0.3) warns.push({ text: `Yield curve inverted ${macro.yieldCurve.value.toFixed(2)}% — recession risk elevated`, level: 'high' });
  if (macro?.sahmRule?.value >= 0.5)   warns.push({ text: `Sahm Rule triggered (${macro.sahmRule.value.toFixed(2)}) — labor market weakening`, level: 'high' });
  if (macro?.creditSpread?.value > 5)  warns.push({ text: `Credit spreads wide ${macro.creditSpread.value.toFixed(2)}% — risk appetite falling`, level: 'medium' });
  if (vix?.value > 30)                 warns.push({ text: `VIX ${vix.value.toFixed(1)} — elevated market fear, smaller positions`, level: 'medium' });
  if (fearGreed?.value > 82)           warns.push({ text: `Extreme greed (${fearGreed.value}) — avoid chasing new highs`, level: 'medium' });
  if (indicators?.rsi > 78)            warns.push({ text: `RSI ${indicators.rsi.toFixed(0)} — severely overbought, pullback risk`, level: 'medium' });

  return warns;
}

// ═══════════════════════════════════════════════════════════
//  MAIN EXPORT
//  buildLivePrediction — assembles the complete prediction.
//
//  Parameters:
//    symbol       — stock ticker
//    bars         — array of daily OHLCV bars (20–252 ideal)
//    indicators   — computed indicators {rsi,macd,sma7,sma21,volSpike,streak,atrPct}
//    brainResult  — output from brain.js runBrainAnalysis()
//    signals      — signal performance array from signalPerformance.js
//    sentiment    — Claude sentiment output {score,overall,summary}
//    edgar        — SEC fundamentals from edgar.js
//    macroSnapshot — FRED macro values
//    fearGreed    — {value, label}
//    vix          — {value, signal}
//    miScores     — optional: scoreBreakdown from masterIntelligence.js (improves accuracy)
// ═══════════════════════════════════════════════════════════
function buildLivePrediction(symbol, bars, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix, miScores, spyData = null) {

  // ── 1. Chart structure ──
  const livePrice      = bars?.length ? bars[bars.length - 1].close : null;
  const chartStructure = analyzeChartStructure(bars || [], livePrice, spyData);

  // ── 2. All active patterns: Brain Vault + chart-derived (directional only) ──
  const brainPatterns   = brainResult?.active_patterns || [];
  const chartPatterns   = chartStructure.patterns.filter(p => !p.isVolatilityWarning);
  const allPatterns     = [...brainPatterns, ...chartPatterns];

  // ── 3. LPMS formula ──
  const lpms = computeLPMS(allPatterns, indicators, macroSnapshot, sentiment, edgar, fearGreed, vix);

  // ── Pattern_125: High ATR Conviction Reducer ──
  // CHART_HIGH_ATR is excluded from pattern scoring (direction=neutral) but it DOES
  // reduce LPMS conviction — high-volatility stocks have less reliable pattern signals.
  const atrPct = chartStructure.signals.atrPct ?? indicators?.atrPct ?? 0;
  if (atrPct > 2.5) {
    const originalScore = lpms.score;
    const atrFactor     = +Math.max(0.72, 1 - (atrPct - 2.5) * 0.07).toFixed(3);
    lpms.score          = +Math.max(0, (lpms.score * atrFactor)).toFixed(2);
    lpms.atrReducer     = { atrPct, factor: atrFactor, originalScore: +originalScore.toFixed(2),
      note: `Pattern_125 applied: ATR ${atrPct.toFixed(1)}% reduced LPMS by ${((1 - atrFactor) * 100).toFixed(1)}%` };
  }

  // ── 4. Normalize component scores (0–1 each) ──
  // Use masterIntelligence scores if available; otherwise compute proxies.
  let techNorm, macroNorm, regimeNorm, sentNorm, fundNorm;

  if (miScores) {
    techNorm   = (miScores.technical?.score    ?? 12) / 25;
    macroNorm  = (miScores.macro?.score        ?? 5)  / 10;
    regimeNorm = (miScores.regime?.score       ?? 5)  / 10;
    sentNorm   = (miScores.sentiment?.score    ?? 5)  / 10;
    fundNorm   = (miScores.fundamentals?.score ?? 5)  / 10;
  } else {
    // Proxy scores
    const rsi  = indicators?.rsi ?? 50;
    const macd = indicators?.macd ?? 0;
    techNorm   = Math.min(1, Math.max(0, (rsi < 50 ? 0.65 : 0.35) + (macd > 0 ? 0.15 : -0.05)));

    const yc   = macroSnapshot?.yieldCurve?.value;
    const inf  = macroSnapshot?.inflation?.value;
    macroNorm  = 0.50;
    if (yc  != null) macroNorm += yc > 0.5 ? 0.12 : yc > 0 ? 0.04 : yc > -0.5 ? -0.08 : -0.18;
    if (inf != null) macroNorm += inf < 2.5 ? 0.06 : inf < 3.5 ? 0 : -0.08;
    macroNorm  = Math.min(1, Math.max(0, macroNorm));

    const fg   = fearGreed?.value ?? 50;
    regimeNorm = Math.min(1, Math.max(0, fg < 50 ? 0.5 + (50 - fg) / 100 : 0.5 - (fg - 50) / 100));
    sentNorm   = sentiment?.score != null ? (sentiment.score + 100) / 200 : 0.5;
    fundNorm   = edgar && !edgar.error ? 0.65 : 0.5;
  }

  // Signal accuracy history
  const withHistory  = (signals || []).filter(s => s.totalUses > 5 && s.accuracy != null);
  const histNorm     = withHistory.length
    ? withHistory.reduce((s, x) => s + x.accuracy, 0) / withHistory.length / 100
    : 0.50;

  // ── 5. System directions for conflict detection ──
  const systems = [
    { name: 'patterns',      direction: lpms.netScore > 0.18 ? 'bullish' : lpms.netScore < -0.18 ? 'bearish' : 'neutral', strength: +Math.min(1, Math.abs(lpms.netScore) / 3).toFixed(2) },
    { name: 'technical',     direction: techNorm  > 0.58 ? 'bullish' : techNorm  < 0.42 ? 'bearish' : 'neutral', strength: +Math.abs(techNorm  - 0.5).toFixed(2) * 2 },
    { name: 'macro',         direction: macroNorm > 0.55 ? 'bullish' : macroNorm < 0.45 ? 'bearish' : 'neutral', strength: +Math.abs(macroNorm - 0.5).toFixed(2) * 2 },
    { name: 'sentiment',     direction: sentNorm  > 0.56 ? 'bullish' : sentNorm  < 0.44 ? 'bearish' : 'neutral', strength: +Math.abs(sentNorm  - 0.5).toFixed(2) * 2 },
    { name: 'regime',        direction: regimeNorm > 0.56 ? 'bullish' : regimeNorm < 0.44 ? 'bearish' : 'neutral', strength: +Math.abs(regimeNorm - 0.5).toFixed(2) * 2 },
    { name: 'fundamentals',  direction: fundNorm > 0.60 ? 'bullish' : 'neutral', strength: +Math.max(0, fundNorm - 0.5).toFixed(2) },
    { name: 'chart',         direction: chartStructure.signals.trendDir === 'uptrend' ? 'bullish' : chartStructure.signals.trendDir === 'downtrend' ? 'bearish' : 'neutral', strength: 0.5 },
  ];

  // ── 6. Conflict detection ──
  const conflictResult = detectConflicts(systems);

  // ── 7. Consensus score ──
  const consensusScore = computeConsensusScore(
    lpms, techNorm, macroNorm, regimeNorm, sentNorm, fundNorm, histNorm, conflictResult
  );

  // ── 8. Final decision ──
  const finalDecision = mapDecision(consensusScore, conflictResult, lpms);
  const holdTime      = HOLD_TIMES[finalDecision] || 'Monitor';

  // ── 9. Confidence + Risk ──
  const dataCount  = [indicators, brainResult, sentiment, edgar, macroSnapshot, fearGreed, vix, (bars?.length > 0) || false].filter(Boolean).length;
  const confidence = computeConfidence(dataCount, consensusScore, lpms, conflictResult.conflictCount, conflictResult.agreementCount);
  const risk       = assessRisk(consensusScore, indicators, vix, conflictResult.conflictCount);

  // ── 10. Reasons, warnings, evidence ──
  const topReasons  = buildTopReasons(lpms, chartStructure, macroSnapshot, sentiment, fearGreed, vix, brainResult);
  const warnings    = buildPredictionWarnings(indicators, chartStructure, macroSnapshot, vix, fearGreed, conflictResult);
  const historicalEvidence = lpms.scoredPatterns
    .filter(p => p.components.winRate > DEFAULT_WIN_RATE)
    .map(p => ({
      pattern: p.name,
      category: p.category,
      winRate: p.winRatePct + '%',
      lpms: p.lpms,
    }));

  return {
    symbol,
    generatedAt: new Date().toISOString(),

    // ── Primary outputs ──
    livePatternMatchScore: lpms.score,
    consensusScore,
    finalDecision,
    confidence,
    risk,
    holdTime,

    // ── Pattern breakdown ──
    activeLivePatterns: lpms.scoredPatterns.slice(0, 12),
    patternSummary: {
      total:        lpms.patternCount,
      bullish:      lpms.bullCount,
      bearish:      lpms.bearCount,
      bullStrength: lpms.bullStrength,
      bearStrength: lpms.bearStrength,
      netScore:     lpms.netScore,
    },

    // ── Chart structure ──
    chartStructure: {
      detectedPatterns: chartStructure.patterns,
      signals:          chartStructure.signals,
    },

    // ── Evidence ──
    historicalEvidence,
    conflictingEvidence: conflictResult.conflicts,
    systemAgreements:    conflictResult.agreements,

    // ── Explanations ──
    topReasons,
    warnings,

    // ── System votes (for UI rendering) ──
    systemVotes: systems.map(s => ({
      system:    s.name,
      direction: s.direction,
      strength:  s.strength,
    })),
  };
}

module.exports = { buildLivePrediction, analyzeChartStructure };
