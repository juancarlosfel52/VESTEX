// ═══════════════════════════════════════════════════════════
//  VESTEX MASTER INTELLIGENCE ENGINE
//  Combines every active system into one 0-100 score +
//  plain-English decision for beginners.
// ═══════════════════════════════════════════════════════════

// ── Technical Analysis: 0–25 pts ──────────────────────────
function calcTechnicalScore(indicators) {
  if (!indicators) return { score: 0, detail: {} };
  let score = 0;
  const detail = {};

  // RSI (0-7 pts) — strictly monotonic: lower RSI = more oversold = higher score
  // RSI <25: deeply oversold (7) → <35 oversold (5) → <45 mild (3) → <55 neutral (2)
  // → <65 mild bearish lean (1) → <75 approaching overbought (0) → ≥75 overbought (0)
  const rsi = indicators.rsi;
  if (rsi != null) {
    if      (rsi < 25) { score += 7; detail.rsi = { val: rsi, pts: 7, note: 'Deeply oversold — strong reversal signal' }; }
    else if (rsi < 35) { score += 5; detail.rsi = { val: rsi, pts: 5, note: 'Oversold — buy signal' }; }
    else if (rsi < 45) { score += 3; detail.rsi = { val: rsi, pts: 3, note: 'Approaching oversold' }; }
    else if (rsi < 55) { score += 2; detail.rsi = { val: rsi, pts: 2, note: 'Neutral zone' }; }
    else if (rsi < 65) { score += 1; detail.rsi = { val: rsi, pts: 1, note: 'Mild bearish lean — above midpoint' }; }
    else if (rsi < 75) { score += 0; detail.rsi = { val: rsi, pts: 0, note: 'Approaching overbought — caution' }; }
    else               { score += 0; detail.rsi = { val: rsi, pts: 0, note: 'Overbought — pullback risk' }; }
  }

  // SMA crossover (0-6 pts)
  if (indicators.sma7 != null && indicators.sma21 != null) {
    const r = indicators.sma7 / indicators.sma21;
    if      (r > 1.03) { score += 6; detail.sma = { pts: 6, note: 'Strong golden cross — bullish trend confirmed' }; }
    else if (r > 1.01) { score += 5; detail.sma = { pts: 5, note: 'Golden cross — uptrend active' }; }
    else if (r > 1.00) { score += 3; detail.sma = { pts: 3, note: 'Short-term above long-term — mild bullish' }; }
    else if (r > 0.99) { score += 2; detail.sma = { pts: 2, note: 'Near crossover — watch closely' }; }
    else if (r > 0.97) { score += 1; detail.sma = { pts: 1, note: 'Death cross forming — caution' }; }
    else               { score += 0; detail.sma = { pts: 0, note: 'Death cross — bearish trend' }; }
  }

  // MACD (0-4 pts)
  if (indicators.macd != null) {
    if      (indicators.macd >  1.0) { score += 4; detail.macd = { val: indicators.macd, pts: 4, note: 'Strong bullish momentum' }; }
    else if (indicators.macd >  0)   { score += 3; detail.macd = { val: indicators.macd, pts: 3, note: 'Bullish momentum building' }; }
    else if (indicators.macd > -1.0) { score += 1; detail.macd = { val: indicators.macd, pts: 1, note: 'Mild bearish momentum' }; }
    else                             { score += 0; detail.macd = { val: indicators.macd, pts: 0, note: 'Strong bearish momentum' }; }
  }

  // Streak (0-4 pts)
  const streak = indicators.streak || 0;
  if      (streak >= 5)  { score += 4; detail.streak = { val: streak, pts: 4, note: `${streak}-day win streak — strong momentum` }; }
  else if (streak >= 3)  { score += 3; detail.streak = { val: streak, pts: 3, note: `${streak}-day win streak` }; }
  else if (streak >= 1)  { score += 2; detail.streak = { val: streak, pts: 2, note: `${streak}-day upward move` }; }
  else if (streak === 0) { score += 1; detail.streak = { val: streak, pts: 1, note: 'Flat — no clear direction' }; }
  else if (streak >= -2) { score += 0; detail.streak = { val: streak, pts: 0, note: `${Math.abs(streak)}-day losing streak` }; }
  else                   { score += 0; detail.streak = { val: streak, pts: 0, note: `${Math.abs(streak)}-day selling pressure` }; }

  // Volume (0-2 pts)
  if (indicators.volSpike) {
    score += 2; detail.volume = { pts: 2, note: 'Volume spike confirms move' };
  } else {
    detail.volume = { pts: 0, note: 'Normal volume — no confirmation' };
  }

  // ATR / volatility (0-2 pts)
  if (indicators.atrPct != null) {
    if      (indicators.atrPct < 1.5) { score += 2; detail.atr = { val: indicators.atrPct, pts: 2, note: 'Low volatility — stable entry' }; }
    else if (indicators.atrPct < 3.0) { score += 1; detail.atr = { val: indicators.atrPct, pts: 1, note: 'Normal volatility' }; }
    else                              { score += 0; detail.atr = { val: indicators.atrPct, pts: 0, note: 'High volatility — risky entry' }; }
  }

  return { score: Math.min(25, Math.max(0, score)), detail };
}

// ── Brain Vault: 0–20 pts ─────────────────────────────────
function calcBrainScore(brainResult) {
  if (!brainResult?.brainVault) return { score: 0, detail: {}, activePercent: 0, patterns: [] };
  const bv     = brainResult.brainVault;
  const active = brainResult.active_patterns || [];
  let score = (bv.activePercent / 100) * 20;

  // Bug fix: field is 'weighted', not 'weightedScore'
  const sb   = bv.scoreBreakdown || {};
  const bull = ['technical','psychology','research','marketHistory']
    .reduce((s, k) => s + Math.max(0, sb[k]?.weighted || 0), 0);
  const bear = ['economy']
    .reduce((s, k) => s + Math.min(0, sb[k]?.weighted || 0), 0);
  if (bull < 0.05 || bear < -0.05) score *= 0.75;

  // Direction weighting: bullish-majority patterns preserve score; bearish-majority reduces it
  const bullFired = active.filter(p => p.direction === 'bullish').length;
  const bearFired = active.filter(p => p.direction === 'bearish').length;
  const dirTotal  = bullFired + bearFired;
  if (dirTotal > 0) {
    const dirRatio = (bullFired - bearFired) / dirTotal; // -1 (all bear) to +1 (all bull)
    score *= (0.75 + 0.25 * dirRatio); // 0.5× to 1.0×
  }

  return {
    score:         Math.min(20, Math.max(0, +score.toFixed(1))),
    activePercent: bv.activePercent,
    patterns:      active.slice(0, 10),  // increased from 5 for better agreement sampling
    detail:        sb,
  };
}

// ── Signal Performance: 0–15 pts ──────────────────────────
function calcSignalScore(signals) {
  if (!signals || !signals.length)
    return { score: 0, avgAccuracy: null, detail: { note: 'Insufficient verified signal data' } };
  const withData = signals.filter(s => s.totalUses > 5 && s.accuracy != null);
  if (!withData.length) return { score: 0, avgAccuracy: null, detail: { note: 'Insufficient verified signal data' } };
  const avg = withData.reduce((s, x) => s + x.accuracy, 0) / withData.length;
  return {
    score:       Math.min(15, Math.max(0, +(avg / 100 * 15).toFixed(1))),
    avgAccuracy: +avg.toFixed(1),
    detail:      { signalCount: withData.length },
  };
}

// ── Market Regime: 0–10 pts ───────────────────────────────
function calcRegimeScore(fearGreed, vix, regime) {
  let score = 5;
  const detail = {};

  const fg = fearGreed?.value;
  if (fg != null) {
    if      (fg < 20) { score += 3; detail.fearGreed = `${fg} — Extreme Fear (contrarian buy signal)`; }
    else if (fg < 35) { score += 2; detail.fearGreed = `${fg} — Fear (opportunity)`; }
    else if (fg < 50) { score += 1; detail.fearGreed = `${fg} — Neutral-fearful`; }
    else if (fg < 65) { score -= 0; detail.fearGreed = `${fg} — Neutral-greedy`; }
    else if (fg < 80) { score -= 1; detail.fearGreed = `${fg} — Greed (caution advised)`; }
    else              { score -= 2; detail.fearGreed = `${fg} — Extreme Greed (overextended)`; }
  }

  const v = vix?.value;
  if (v != null) {
    if      (v < 12) { score += 2; detail.vix = `${v} — Very calm market`; }
    else if (v < 18) { score += 1; detail.vix = `${v} — Calm`; }
    else if (v < 25) { score += 0; detail.vix = `${v} — Normal`; }
    else if (v < 30) { score -= 1; detail.vix = `${v} — Elevated fear`; }
    else if (v < 35) { score -= 2; detail.vix = `${v} — High fear`; }
    else             { score -= 3; detail.vix = `${v} — Extreme fear`; }
  }

  detail.regime = regime?.name || '—';
  return { score: Math.min(10, Math.max(0, score)), fearGreed: fg, vix: v, detail };
}

// ── Macro Economy: 0–10 pts ───────────────────────────────
function calcMacroScore(macro) {
  if (!macro) return { score: 5, detail: { note: 'No macro data — using midpoint' } };
  let score = 5;
  const detail = {};

  const yc  = macro.yieldCurve?.value;
  const cs  = macro.creditSpread?.value;
  const inf = macro.inflation?.value;
  const ff  = macro.fedFunds?.value;
  const un  = macro.unemployment?.value;
  const sah = macro.sahmRule?.value;
  const str = macro.stressIndex?.value;

  if (yc  != null) { const p = yc>1?2:yc>0?1:yc>-0.5?-1:-3; score+=p; detail.yieldCurve=`${yc.toFixed(2)}% — ${p>0?'normal':yc<-0.5?'⚠ inverted':'flat'}`; }
  if (cs  != null) { const p = cs<3?1:cs<5?0:-2;              score+=p; detail.creditSpread=`${cs.toFixed(2)}% — ${p>=0?'tight':'⚠ wide'}`; }
  if (inf != null) { const p = inf<2.5?1:inf<3.5?0:-1;        score+=p; detail.inflation=`${inf.toFixed(2)}% — ${p>0?'anchored':'above target'}`; }
  if (ff  != null) { const p = ff<3?1:ff<4.5?0:-1;            score+=p; detail.fedFunds=`${ff.toFixed(2)}% — ${p>0?'accommodative':'restrictive'}`; }
  if (un  != null) { const p = un<4?1:un<4.5?0:-1;            score+=p; detail.unemployment=`${un.toFixed(1)}% — ${p>0?'healthy':'rising'}`; }
  if (sah != null && sah >= 0.5) { score-=2; detail.sahmRule=`⚠ Triggered (${sah.toFixed(2)}) — recession indicator active`; }
  if (str != null) { const p = str<-0.5?1:str<0.5?0:-2;       score+=p; detail.stress=`${str.toFixed(2)} — ${p>0?'calm':str>0.5?'⚠ stressed':'normal'}`; }

  return { score: Math.min(10, Math.max(0, score)), detail };
}

// ── News Sentiment: 0–10 pts ──────────────────────────────
function calcSentimentScore(sentiment) {
  if (!sentiment) return { score: 5, detail: { note: 'No sentiment data' } };
  const s = sentiment.score ?? 0;
  return {
    score:   Math.min(10, Math.max(0, +((s + 100) / 200 * 10).toFixed(1))),
    raw:     s,
    overall: sentiment.overall,
    summary: sentiment.summary,
    detail:  { raw: s, overall: sentiment.overall },
  };
}

// ── Fundamentals: 0–10 pts ────────────────────────────────
// Primary signal: earnings surprise vs consensus (Alpha Vantage).
// Fallback: static EDGAR profitability facts when no surprise data.
// No artificial baseline — zero when no real data is available.
function calcFundamentalsScore(edgar) {
  if (!edgar) return { score: 0, detail: { note: 'No fundamentals data' } };

  const detail = {};
  const es     = edgar.earningsSurprise;

  // ── Primary path: earnings surprise (real predictive signal) ──
  if (es && es.surprisePct !== null && es.direction !== 'UNKNOWN') {
    const decay = Math.pow(0.8, es.quartersAgo || 0); // staleness per quarter
    let score;

    if (es.direction === 'BEAT') {
      score = es.magnitude === 'LARGE' ? Math.round(9 * decay) : Math.round(6 * decay);
      detail.earningsSurprise = `Beat by ${es.surprisePct.toFixed(1)}% — ${es.magnitude.toLowerCase()} beat (${es.reportDate})`;
    } else if (es.direction === 'MISS') {
      score = es.magnitude === 'LARGE' ? Math.round(1 * decay) : Math.round(3 * decay);
      detail.earningsSurprise = `Missed by ${Math.abs(es.surprisePct).toFixed(1)}% — ${es.magnitude.toLowerCase()} miss (${es.reportDate})`;
    } else {
      score = Math.round(5 * decay);
      detail.earningsSurprise = `Inline with consensus ±1% (${es.reportDate})`;
    }

    if (es.daysAgo !== null) detail.peadWindow = es.peadWindow
      ? `${es.daysAgo}d since report — within PEAD drift window`
      : `${es.daysAgo}d since report — outside 60d PEAD window`;

    // Static profitability as minor overlay when surprise data exists
    const facts = edgar.facts || {};
    if (facts.netIncomeRaw != null && facts.netIncomeRaw < 0) {
      score = Math.max(0, score - 1);
      detail.netLoss = '⚠ Net loss on annual record';
    }

    return { score: Math.min(10, Math.max(0, score)), detail, earningsSurprise: es };
  }

  // ── Fallback path: static EDGAR profitability facts ──
  // No baseline — honest zero when no real earnings surprise data available
  let score = 0;
  const facts    = edgar.facts    || {};
  const insiders = edgar.insiders || [];

  if (facts.netIncomeRaw != null) {
    if (facts.netIncomeRaw > 0) { score += 2; detail.earnings = 'Profitable'; }
    else                        { score -= 1; detail.earnings = '⚠ Net loss reported'; }
  }
  if (facts.revenueRaw != null && facts.revenueRaw > 0) { score += 1; detail.revenue = 'Revenue positive'; }
  if (facts.eps != null) {
    if (facts.eps > 0) { score += 1; detail.eps = `EPS $${facts.eps} — positive`; }
    else               { score -= 1; detail.eps = `EPS $${facts.eps} — negative`; }
  }
  if (facts.debt != null && facts.netIncomeRaw != null && facts.netIncomeRaw < 0) {
    score -= 1; detail.debt = '⚠ Debt with negative income';
  }
  if (insiders.length > 0) {
    detail.insiders = `${insiders.length} insider transaction(s) — direction unavailable`;
  }
  detail.note = 'No earnings surprise data — using static EDGAR facts';

  return { score: Math.min(10, Math.max(0, score)), detail };
}

// ── Market Health: 0–100 ──────────────────────────────────
function calcMarketHealth(macro, fearGreed, vix, sentiment) {
  let score = 50;
  const contributions = [];

  // ── Macro Conditions ──
  const yc  = macro?.yieldCurve?.value;
  const cs  = macro?.creditSpread?.value;
  const str = macro?.stressIndex?.value;
  const sah = macro?.sahmRule?.value;
  const inf = macro?.inflation?.value;
  const ff  = macro?.fedFunds?.value;

  let macroPts = 0;
  if (yc  != null) macroPts += yc>0.5?8:yc>0?4:yc>-0.5?-6:-12;
  if (cs  != null) macroPts += cs<3?8:cs<4.5?3:cs<6?-8:-15;
  if (str != null) macroPts += str<-0.5?8:str<0.5?2:str<1?-8:-15;
  if (sah != null && sah >= 0.5) macroPts -= 12;
  if (inf != null) macroPts += inf<2.5?4:inf<3.5?0:-6;
  if (ff  != null) macroPts += ff<3?4:ff<4.5?0:-4;
  score += macroPts;
  if (yc != null || cs != null || str != null) {
    const note = macroPts >= 10 ? 'Yield curve, credit spread & stress index all supportive'
               : macroPts >= 0  ? 'Mixed macro signals — some positives offset by caution'
               : 'Macro stress detected — yield curve or credit conditions elevated';
    contributions.push({ label: 'Macro Conditions', pts: macroPts, note });
  }

  // ── VIX Volatility ──
  const v = vix?.value;
  if (v != null) {
    const vixPts = v<13?10:v<18?5:v<23?0:v<30?-8:v<40?-15:-20;
    score += vixPts;
    const note = v<13?'Very low VIX — calm, low-risk environment'
               : v<18?'Low VIX — stable market conditions'
               : v<23?'Moderate VIX — normal range, no concern'
               : v<30?'Elevated VIX — some market stress'
               : v<40?'High VIX — significant uncertainty'
               : 'Extreme VIX — crisis-level volatility';
    contributions.push({ label: 'VIX Volatility', pts: vixPts, note });
  }

  // ── Fear & Greed — CONTRARIAN logic ──
  const fg = fearGreed?.value;
  if (fg != null) {
    let fgPts;
    if      (fg < 20) fgPts = 8;
    else if (fg < 35) fgPts = 4;
    else if (fg < 50) fgPts = 2;
    else if (fg < 65) fgPts = -2;
    else if (fg < 80) fgPts = -5;
    else              fgPts = -10;
    score += fgPts;
    const contrarian = fg < 35;
    const note = fg < 20 ? 'Extreme Fear — treated as contrarian buy signal; panic historically precedes recoveries'
               : fg < 35 ? 'Fear — mild contrarian positive; investors are cautious, not euphoric'
               : fg < 65 ? 'Neutral — no contrarian signal in either direction'
               : fg < 80 ? 'Greed — slight caution, market may be overbought'
               : 'Extreme Greed — market likely overextended, elevated reversal risk';
    contributions.push({ label: 'Fear & Greed', pts: fgPts, note, contrarian });
  }

  // ── News Sentiment ──
  const sentScore = sentiment?.score;
  if (sentScore != null) {
    const sentPts = Math.round((sentScore / 100) * 5);
    score += sentPts;
    const note = sentScore >= 60 ? 'Positive news flow across tracked stocks'
               : sentScore >= 40 ? 'Neutral news sentiment'
               : 'Negative news flow — watch for continued pressure';
    contributions.push({ label: 'News Sentiment', pts: sentPts, note });
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  return { score: finalScore, contributions };
}

function healthLabel(s) {
  return s>=81?'STRONG':s>=61?'HEALTHY':s>=41?'CAUTIOUS':s>=21?'WEAK':'SEVERE RISK';
}

function scoreColor(s) {
  return s>=85?'#22A05A':s>=70?'#4aa870':s>=60?'#8BC34A':s>=45?'#C9A84C':s>=35?'#e07b39':'#CC0000';
}

// ── Plain English Explanation ─────────────────────────────
function buildExplanation(sym, score, decision, tech, brain, sent, macro, regime) {
  const lines = [];
  if      (score >= 85) lines.push(`${sym} is showing very strong bullish signals across nearly every system.`);
  else if (score >= 70) lines.push(`${sym} has strong positive signals — multiple systems agree on upside.`);
  else if (score >= 60) lines.push(`${sym} has more positive signals than negative — a careful buy case exists.`);
  else if (score >= 45) lines.push(`${sym} signals are mixed. Holding your current position or waiting is prudent.`);
  else if (score >= 35) lines.push(`${sym} is showing weakness across systems. Wait for a better entry point.`);
  else                  lines.push(`${sym} has strong negative signals from multiple systems. Consider reducing exposure.`);

  if (tech.score >= 18)  lines.push('Technical indicators are bullish — price trend, momentum, and volume confirm upside.');
  else if (tech.score <= 8) lines.push('Technical indicators are weak — price trend does not currently support buying.');

  if (brain.activePercent >= 70) lines.push('Brain Vault has matched many historical patterns, adding confidence.');
  if (sent.overall === 'positive') lines.push('Recent news sentiment is positive, which has historically supported price increases.');
  else if (sent.overall === 'negative') lines.push('Recent news has been negative — watch for continued downward pressure.');

  if (macro.score >= 8)  lines.push('Macro conditions are healthy — the broader economy is supportive of growth stocks.');
  else if (macro.score <= 3) lines.push('Macro risks are elevated — yield curve or credit conditions warrant caution.');

  if (regime.fearGreed != null && regime.fearGreed < 25) lines.push('The market is in extreme fear — historically this has been a good time to buy quality stocks.');
  if (regime.vix != null && regime.vix > 30) lines.push('High VIX shows market uncertainty — use smaller position sizes than normal.');

  return lines.join(' ');
}

// ── Warnings ──────────────────────────────────────────────
function buildWarnings(indicators, macro, edgar, vix, fearGreed, score) {
  const warns = [];
  if (indicators?.atrPct > 3)         warns.push({ text: `High volatility — ATR ${indicators.atrPct.toFixed(1)}% of price`, level: 'medium' });
  if (indicators?.rsi > 75)            warns.push({ text: `RSI ${indicators.rsi.toFixed(0)} — stock is overbought`, level: 'medium' });
  if (indicators?.rsi < 25)            warns.push({ text: `RSI ${indicators.rsi.toFixed(0)} — deeply oversold, watch for bounce`, level: 'low' });
  if (indicators?.streak <= -4)        warns.push({ text: `${Math.abs(indicators.streak)}-day losing streak — momentum is bearish`, level: 'medium' });
  if (macro?.yieldCurve?.value < -0.3) warns.push({ text: `Yield curve inverted (${macro.yieldCurve.value.toFixed(2)}%) — recession indicator active`, level: 'high' });
  if (macro?.sahmRule?.value >= 0.5)   warns.push({ text: `Sahm Rule triggered (${macro.sahmRule.value.toFixed(2)}) — labor market weakening`, level: 'high' });
  if (macro?.creditSpread?.value > 5)  warns.push({ text: `Credit spreads wide (${macro.creditSpread.value.toFixed(2)}%) — risk appetite falling`, level: 'medium' });
  if (vix?.value > 30)                 warns.push({ text: `VIX ${vix.value.toFixed(1)} — elevated market fear`, level: 'medium' });
  if (fearGreed?.value > 80)           warns.push({ text: `Extreme greed (${fearGreed.value}) — market may be overextended`, level: 'medium' });
  if (edgar?.facts?.netIncomeRaw < 0)  warns.push({ text: 'Company reported a net loss in latest SEC filing', level: 'medium' });
  if (score < 35 && score > 15)        warns.push({ text: 'Multiple systems show weakness — consider reducing exposure', level: 'high' });
  return warns;
}

// ── Master Assembly ───────────────────────────────────────
function buildMasterIntelligence(symbol, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix) {
  const tech   = calcTechnicalScore(indicators);
  const brain  = calcBrainScore(brainResult);
  const signal = calcSignalScore(signals);
  const regime = calcRegimeScore(fearGreed, vix, brainResult?.regime);
  const macro  = calcMacroScore(macroSnapshot);
  const sent   = calcSentimentScore(sentiment);
  const fund   = calcFundamentalsScore(edgar);

  let masterScore = Math.min(100, Math.max(0, Math.round(
    tech.score + brain.score + signal.score + regime.score +
    macro.score + sent.score + fund.score
  )));

  // Pattern_125: High ATR reduces score certainty (small modifier — TSLA-level ATR ~4% → -2pts max)
  const atrPct = indicators?.atrPct;
  if (atrPct > 2.5) {
    masterScore = Math.max(0, masterScore - Math.min(4, Math.round((atrPct - 2.5) * 1.2)));
  }

  let decision, holdTime;
  if      (masterScore >= 85) { decision = 'STRONG BUY';  holdTime = '30–90 Days'; }
  else if (masterScore >= 70) { decision = 'BUY';          holdTime = '14–60 Days'; }
  else if (masterScore >= 60) { decision = 'BUY SMALL';    holdTime = '7–30 Days'; }
  else if (masterScore >= 45) { decision = 'HOLD';          holdTime = 'Monitor Weekly'; }
  else if (masterScore >= 35) { decision = 'WAIT';          holdTime = 'Wait for Entry'; }
  else if (masterScore >= 21) { decision = 'SELL';          holdTime = 'Exit Position'; }
  else                        { decision = 'STRONG SELL';  holdTime = 'Exit Immediately'; }

  // Confidence: rebuilt with Phase 2 engine
  const dataCount = [indicators, brainResult, sentiment, edgar, macroSnapshot, fearGreed, vix].filter(Boolean).length;
  const confResult  = buildConfidenceBreakdown(tech, brain, signal, regime, macro, sent, fund, indicators, masterScore, dataCount);

  // Institutional confidence modifier (Task 3 — Phase 2)
  // 13F data is 45 days delayed — influences conviction only, never masterScore
  const inst = edgar?.institutional;
  if (inst) {
    if (inst.superinvestorCount >= 3)      confResult.finalConfidence = Math.min(92, confResult.finalConfidence + 6);
    else if (inst.superinvestorCount >= 1) confResult.finalConfidence = Math.min(92, confResult.finalConfidence + 3);
    if (inst.trend === 'REDUCING')         confResult.finalConfidence = Math.max(20, confResult.finalConfidence - 5);
  }

  const confidence  = confResult.finalConfidence;

  let risk;
  const v = vix?.value, ap = indicators?.atrPct;
  if      (masterScore < 25 || (v && v > 35) || (ap && ap > 4))   risk = 'Very High';
  else if (masterScore < 40 || (v && v > 25) || (ap && ap > 2.5)) risk = 'High';
  else if (masterScore < 60 || (ap && ap > 1.5))                  risk = 'Medium';
  else                                                              risk = 'Low';

  const mhResult    = calcMarketHealth(macroSnapshot, fearGreed, vix, sentiment);
  const mhScore     = mhResult.score;
  const topPatterns = brain.patterns.map(p => ({
    name: p.name, category: p.category,
    winRate: p.win_rate || null, impact: p.score || null, reason: p.reason || '',
    avgReturn: p.avg_return || null, uses: p.uses || null,
  }));

  const scoreBreakdown = {
    technical:    { score: tech.score,   max: 25, detail: tech.detail },
    brainVault:   { score: brain.score,  max: 20, detail: brain.detail, activePercent: brain.activePercent },
    signalPerf:   { score: signal.score, max: 15, detail: signal.detail, avgAccuracy: signal.avgAccuracy },
    regime:       { score: regime.score, max: 10, detail: regime.detail },
    macro:        { score: macro.score,  max: 10, detail: macro.detail },
    sentiment:    { score: sent.score,   max: 10, detail: sent.detail },
    fundamentals: { score: fund.score,   max: 10, detail: fund.detail },
  };

  const systemVotes          = buildSystemVotes(tech, brain, signal, regime, macro, sent, fund);
  const decisionExplanation  = buildDecisionExplanation(symbol, masterScore, decision, tech, brain, sent, macro, regime, indicators);
  const contributors         = buildContributors(scoreBreakdown);
  const consistencyNote      = buildConsistencyNote(brain, masterScore, confidence);
  const explanation          = buildExplanation(symbol, masterScore, decision, tech, brain, sent, macro, regime);
  const warnings             = buildWarnings(indicators, macroSnapshot, edgar, vix, fearGreed, masterScore);
  // Institutional warning injection
  if (inst?.trend === 'REDUCING') warnings.push('⚠ Institutional holders reducing exposure this quarter (13F data)');
  if (inst?.superinvestorCount > 0) warnings.push(`Smart money: ${inst.note}`);

  return {
    symbol, masterScore, decision, confidence, risk, holdTime,
    scoreBreakdown,
    contributors,
    systemVotes,
    decisionExplanation,
    confidenceBreakdown: confResult.breakdown,
    consistencyNote,
    marketHealth: { score: mhScore, label: healthLabel(mhScore), color: scoreColor(mhScore), contributions: mhResult.contributions },
    topPatterns, explanation, warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ── Phase 2: Confidence Breakdown Engine ─────────────────────
function buildConfidenceBreakdown(tech, brain, signal, regime, macro, sent, fund, indicators, masterScore, dataCount) {
  const breakdown = [];
  let total = 20; // minimum base

  // 1. Data Completeness (0–15)
  const dataPts = Math.round(dataCount / 7 * 15);
  breakdown.push({ label: 'Data Completeness', pts: dataPts, note: `${dataCount}/7 data sources available` });
  total += dataPts;

  // 2. Pattern Agreement (0–20): patterns firing + direction alignment
  const patternCount = brain.patterns.length;
  let patternAgreePts = 0;
  if (patternCount > 0) {
    // Bug fix: use p.direction ('bullish'/'bearish'/'neutral') not p.impact (string) or p.score (undefined)
    const bullishPats = brain.patterns.filter(p => p.direction === 'bullish').length;
    const bearishPats = brain.patterns.filter(p => p.direction === 'bearish').length;
    patternAgreePts = Math.round((bullishPats / patternCount) * Math.min(20, patternCount * 4));
  } else if (brain.activePercent > 0) {
    patternAgreePts = Math.min(10, Math.round(brain.activePercent / 100 * 12));
  }
  const bullishPatsCounted = brain.patterns.filter(p => p.direction === 'bullish').length;
  const pctAgree = patternCount > 0 ? Math.round(bullishPatsCounted / patternCount * 100) : 0;
  breakdown.push({ label: 'Pattern Agreement', pts: patternAgreePts, note: patternCount > 0 ? `${patternCount} active patterns — ${pctAgree}% bullish alignment` : 'No named patterns active' });
  total += patternAgreePts;

  // 3. Historical Validation (0–15): avg win rate of active patterns
  const patternsWithHistory = brain.patterns.filter(p => p.winRate != null && p.winRate > 0);
  let histPts = 5;
  if (patternsWithHistory.length > 0) {
    const avgWR = patternsWithHistory.reduce((s,p) => s + p.winRate, 0) / patternsWithHistory.length;
    histPts = Math.round((avgWR / 100) * 15);
    breakdown.push({ label: 'Historical Validation', pts: histPts, note: `${patternsWithHistory.length} patterns validated — avg ${avgWR.toFixed(0)}% win rate` });
  } else {
    breakdown.push({ label: 'Historical Validation', pts: histPts, note: 'No win rate history — neutral default applied' });
  }
  total += histPts;

  // 4. Technical Strength (0–10)
  const techPts = Math.round((tech.score / 25) * 10);
  const techNote = tech.score >= 18 ? 'Strong multi-indicator alignment'
                 : tech.score >= 12 ? 'Moderate technical signals'
                 : 'Weak technicals — limited confirmation';
  breakdown.push({ label: 'Technical Strength', pts: techPts, note: techNote });
  total += techPts;

  // 5. Macro Alignment (0–8)
  const macroPts = Math.round((macro.score / 10) * 8);
  const macroNote = macro.score >= 7 ? 'Macro conditions support the direction'
                  : macro.score >= 5 ? 'Macro neutral to mildly supportive'
                  : 'Macro headwinds — caution warranted';
  breakdown.push({ label: 'Macro Alignment', pts: macroPts, note: macroNote });
  total += macroPts;

  // 6. Sentiment Alignment (0–5)
  const sentPts = Math.round((sent.score / 10) * 5);
  breakdown.push({ label: 'Sentiment Alignment', pts: sentPts, note: sent.overall === 'positive' ? 'News sentiment supports bullish direction' : sent.overall === 'negative' ? 'Negative sentiment conflicts with bullish score' : 'Sentiment neutral' });
  total += sentPts;

  // Penalties
  // Pattern_125 — High ATR Conviction Reducer (fires at 2.5%, matches CHART_HIGH_ATR threshold)
  if (indicators?.atrPct > 2.5) {
    const vPen = -Math.min(12, Math.round((indicators.atrPct - 1.5) * 2.2));
    breakdown.push({ label: 'Pattern_125 — High ATR Conviction Reducer', pts: vPen,
      note: `ATR ${indicators.atrPct.toFixed(1)}% — high volatility reduces signal reliability; pattern thresholds are harder to interpret`, penalty: true });
    total += vPen;
  }
  if (sent.overall === 'negative' && tech.score >= 14) {
    const sPen = -5;
    breakdown.push({ label: 'Sentiment Conflict', pts: sPen, note: 'Technical bullish but news sentiment negative — mixed signals', penalty: true });
    total += sPen;
  }
  if (patternCount >= 3 && Math.abs(masterScore - 50) < 8) {
    const iPen = -4;
    breakdown.push({ label: 'Score Inconsistency', pts: iPen, note: 'Strong patterns active but aggregate score near neutral — conflicting systems detected', penalty: true });
    total += iPen;
  }

  return { breakdown, finalConfidence: Math.min(92, Math.max(20, Math.round(total))) };
}

// ── Phase 4: System Voting Engine ────────────────────────────
function buildSystemVotes(tech, brain, signal, regime, macro, sent, fund) {
  const systems = [
    { name: 'Technical Analysis', score: tech.score,   max: 25 },
    { name: 'Brain Vault',        score: brain.score,  max: 20 },
    { name: 'Signal History',     score: signal.score, max: 15 },
    { name: 'Market Regime',      score: regime.score, max: 10 },
    { name: 'Macro Economy',      score: macro.score,  max: 10 },
    { name: 'News Sentiment',     score: sent.score,   max: 10 },
    { name: 'Fundamentals',       score: fund.score,   max: 10 },
  ];
  const votes = { BUY: 0, HOLD: 0, SELL: 0 };
  const withVotes = systems.map(s => {
    const pct = s.score / s.max;
    const vote = pct >= 0.62 ? 'BUY' : pct >= 0.38 ? 'HOLD' : 'SELL';
    votes[vote]++;
    return { ...s, vote, pct: +(pct * 100).toFixed(0) };
  });
  const topCount = Math.max(votes.BUY, votes.HOLD, votes.SELL);
  const consensus = votes.BUY === topCount ? 'BUY' : votes.SELL === topCount ? 'SELL' : 'HOLD';
  const agreementPct = Math.round(topCount / systems.length * 100);
  return { votes, systems: withVotes, agreementPct, consensus };
}

// ── Phase 3: Decision Explanation Engine ─────────────────────
function buildDecisionExplanation(sym, masterScore, decision, tech, brain, sent, macro, regime, indicators) {
  const bullish = [], bearish = [];

  // Technical evidence
  const sma = tech.detail?.sma;
  if (sma?.pts >= 5)      bullish.push(`Golden Cross — short-term MA crossed above long-term MA (${sma.note})`);
  else if (sma?.pts === 0) bearish.push(`Death Cross — short-term MA below long-term MA (bearish trend)`);

  const macd = tech.detail?.macd;
  if (macd?.pts >= 3)      bullish.push(`MACD Bullish — upward momentum building (MACD ${macd.val?.toFixed(2)})`);
  else if (macd?.pts === 0) bearish.push(`MACD Bearish — downward momentum (MACD ${macd.val?.toFixed(2)})`);

  const rsi = tech.detail?.rsi;
  if (rsi?.pts >= 5)      bullish.push(`RSI ${rsi.val?.toFixed(0)} — oversold, high reversal probability`);
  else if (rsi?.pts === 0 && rsi?.val > 70) bearish.push(`RSI ${rsi.val?.toFixed(0)} — overbought, pullback risk elevated`);

  const streak = tech.detail?.streak;
  if (streak?.pts >= 3)      bullish.push(`${streak.val}-day win streak — sustained buying momentum`);
  else if (streak?.pts === 0 && streak?.val < -3) bearish.push(`${Math.abs(streak.val)}-day losing streak — selling pressure persistent`);

  if (tech.detail?.volume?.pts >= 2) bullish.push('Volume spike — institutional participation confirms the move');

  // Brain vault patterns
  // Bug fix: classify by p.direction ('bullish'/'bearish'/'neutral'), not p.impact (string) or p.score (undefined)
  // Bug fix: win rate field is p.win_rate, not p.winRate
  brain.patterns.forEach(p => {
    const wr = (typeof p.win_rate === 'number') ? ` (${p.win_rate.toFixed(0)}% win rate)` : '';
    if (p.direction === 'bullish')      bullish.push(`${p.name}${wr} — ${p.reason || 'active historical pattern'}`);
    else if (p.direction === 'bearish') bearish.push(`${p.name} — bearish pattern active${wr}`);
    // neutral patterns: omit from both lists
  });

  // Regime
  if (regime.fearGreed != null && regime.fearGreed < 20) bullish.push(`Extreme Fear (${regime.fearGreed}) — historically a contrarian buy signal at market lows`);
  else if (regime.fearGreed != null && regime.fearGreed > 80) bearish.push(`Extreme Greed (${regime.fearGreed}) — market overextended, mean-reversion risk`);
  if (regime.vix != null && regime.vix > 30) bearish.push(`VIX ${regime.vix} — elevated uncertainty, smaller positions recommended`);

  // Macro
  if (macro.score >= 7) bullish.push('Macro conditions healthy — yield curve, credit spreads, and inflation all supportive');
  else if (macro.score <= 3) bearish.push('Macro headwinds — yield curve inversion or credit stress detected');

  // Sentiment
  if (sent.overall === 'positive') bullish.push('Positive news sentiment — market narrative supports price appreciation');
  else if (sent.overall === 'negative') bearish.push('Negative news flow — headlines creating downward pressure');

  // Reasoning
  const bCount = bullish.length, rCount = bearish.length;
  let reasoning = '';
  if      (decision === 'STRONG BUY')  reasoning = `All major systems are aligned bullish. ${bCount} bullish factors with ${rCount} concerns. This is the highest-conviction setup VESTEX can generate.`;
  else if (decision === 'BUY')          reasoning = `Strong bullish majority across systems. ${bCount} factors support upside vs ${rCount} opposing. Multiple systems confirm the direction.`;
  else if (decision === 'BUY SMALL')    reasoning = `Bullish signals exist but ${rCount > 0 ? 'some systems conflict' : 'data coverage is incomplete'}. A small position captures the opportunity while limiting downside if conditions shift.`;
  else if (decision === 'HOLD')         reasoning = `${bCount} bullish factors are present, but confirmation is not yet strong enough to justify adding. ${rCount > 0 ? `${rCount} conflicting signals reduce conviction.` : 'Waiting for confirmation is the disciplined approach.'}`;
  else if (decision === 'WAIT')         reasoning = `Signals are too mixed or weak (${bCount} bullish vs ${rCount} bearish). No clear statistical edge. Staying flat prevents entering at the wrong moment.`;
  else if (decision === 'SELL')         reasoning = `Bearish evidence (${rCount} factors) outweighs bullish (${bCount} factors). Reducing exposure protects capital for better setups ahead.`;
  else                                  reasoning = `Multiple systems showing strong negative signals. Exiting position and waiting for stabilization is the priority.`;

  // What would change the decision
  const upThresh  = decision === 'HOLD' ? 60 : decision === 'BUY SMALL' ? 70 : decision === 'WAIT' ? 45 : decision === 'SELL' ? 35 : 85;
  const dnThresh  = decision === 'HOLD' ? 44 : decision === 'BUY SMALL' ? 59 : decision === 'BUY' ? 59 : decision === 'WAIT' ? 34 : 20;
  const upDecision = decision === 'HOLD' ? 'BUY SMALL' : decision === 'BUY SMALL' ? 'BUY' : decision === 'WAIT' ? 'HOLD' : decision === 'SELL' ? 'WAIT' : 'N/A';
  const dnDecision = decision === 'HOLD' ? 'WAIT' : decision === 'BUY SMALL' ? 'HOLD' : decision === 'BUY' ? 'BUY SMALL' : decision === 'WAIT' ? 'SELL' : 'STRONG SELL';

  return {
    bullishEvidence: bullish,
    bearishEvidence: bearish,
    reasoning,
    whatWouldChange: {
      toUpgrade:   `${upDecision} if master score exceeds ${upThresh} with confidence above ${Math.round(upThresh * 0.9)}% — watch for volume confirmation and pattern activation`,
      toDowngrade: `${dnDecision} if score falls below ${dnThresh} or bearish patterns activate — ${rCount > 0 ? 'existing concerns could amplify' : 'current warnings are the key downside triggers'}`,
    }
  };
}

// ── Phase 1: Score Contributors ───────────────────────────────
function buildContributors(scoreBreakdown) {
  const defs = [
    { key: 'technical',    label: 'Technical Analysis', max: 25 },
    { key: 'brainVault',   label: 'Brain Vault',        max: 20 },
    { key: 'signalPerf',   label: 'Signal Performance', max: 15 },
    { key: 'regime',       label: 'Market Regime',      max: 10 },
    { key: 'macro',        label: 'Macro Economy',      max: 10 },
    { key: 'sentiment',    label: 'Sentiment',          max: 10 },
    { key: 'fundamentals', label: 'Fundamentals',       max: 10 },
  ];
  const positive = [], negative = [], neutral = [];
  defs.forEach(({ key, label, max }) => {
    const val = scoreBreakdown[key];
    if (!val) return;
    const pct = val.score / max;
    const item = { name: label, pts: val.score, maxPts: max, pct: Math.round(pct * 100) };
    if      (pct >= 0.62) positive.push(item);
    else if (pct >= 0.38) neutral.push(item);
    else                  negative.push(item);
  });
  positive.sort((a,b) => b.pts - a.pts);
  negative.sort((a,b) => a.pts - b.pts);
  return { positive, negative, neutral };
}

// ── Phase 6: Score Consistency Audit ─────────────────────────
function buildConsistencyNote(brain, masterScore, confidence) {
  if (brain.patterns.length >= 3 && confidence < 50 && masterScore >= 45 && masterScore < 65) {
    return `${brain.patterns.length} active patterns but confidence is ${confidence}% — conflicting systems are limiting certainty. This occurs when strong technical patterns exist but macro, sentiment, or signal history data is incomplete or opposing.`;
  }
  if (brain.patterns.length === 0 && masterScore >= 65) {
    return `Score of ${masterScore} with no active Brain Vault patterns — driven by technical and macro signals. Historical pattern validation would increase confidence further.`;
  }
  if (brain.activePercent < 30 && masterScore >= 60) {
    return `Only ${brain.activePercent.toFixed(0)}% of Brain Vault active, yet score is ${masterScore}. Technical and macro signals are carrying the weight. Pattern confirmation would strengthen this setup.`;
  }
  return null;
}

module.exports = { buildMasterIntelligence, calcMarketHealth, healthLabel, scoreColor };
