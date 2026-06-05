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
  const bv = brainResult.brainVault;
  let score = (bv.activePercent / 100) * 20;

  // Direction modifier from score breakdown
  const sb = bv.scoreBreakdown || {};
  const bull = ['technical','psychology','research','marketHistory']
    .reduce((s, k) => s + Math.max(0, sb[k]?.weightedScore || 0), 0);
  const bear = ['economy']
    .reduce((s, k) => s + Math.min(0, sb[k]?.weightedScore || 0), 0);
  if (bull < 0.05 || bear < -0.05) score *= 0.75;

  return {
    score:         Math.min(20, Math.max(0, +score.toFixed(1))),
    activePercent: bv.activePercent,
    patterns:      (brainResult.active_patterns || []).slice(0, 5),
    detail:        sb,
  };
}

// ── Signal Performance: 0–15 pts ──────────────────────────
function calcSignalScore(signals) {
  if (!signals || !signals.length)
    return { score: 7.5, avgAccuracy: null, detail: { note: 'No data — using midpoint' } };
  const withData = signals.filter(s => s.totalUses > 5 && s.accuracy != null);
  if (!withData.length) return { score: 7.5, avgAccuracy: null, detail: {} };
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
function calcFundamentalsScore(edgar) {
  if (!edgar) return { score: 5, detail: { note: 'No EDGAR data' } };
  let score = 5;
  const detail = {};
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
    // EDGAR search does not return transaction type (buy vs sell) — score neutral
    // until direction data is available; don't add bullish bias for unknown transactions
    detail.insiders = `${insiders.length} insider transaction(s) recorded — direction unavailable`;
  }

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

  const masterScore = Math.min(100, Math.max(0, Math.round(
    tech.score + brain.score + signal.score + regime.score +
    macro.score + sent.score + fund.score
  )));

  let decision, holdTime;
  if      (masterScore >= 85) { decision = 'STRONG BUY';  holdTime = '30–90 Days'; }
  else if (masterScore >= 70) { decision = 'BUY';          holdTime = '14–60 Days'; }
  else if (masterScore >= 60) { decision = 'BUY SMALL';    holdTime = '7–30 Days'; }
  else if (masterScore >= 45) { decision = 'HOLD';          holdTime = 'Monitor Weekly'; }
  else if (masterScore >= 35) { decision = 'WAIT';          holdTime = 'Wait for Entry'; }
  else if (masterScore >= 21) { decision = 'SELL';          holdTime = 'Exit Position'; }
  else                        { decision = 'STRONG SELL';  holdTime = 'Exit Immediately'; }

  // Confidence: based on data completeness + signal agreement (not just presence)
  // Data completeness: each source adds up to 10 pts (max 35 base)
  const dataCount = [indicators, brainResult, sentiment, edgar, macroSnapshot, fearGreed, vix].filter(Boolean).length;
  const dataBase  = Math.round(dataCount / 7 * 35); // 0–35 pts

  // Signal agreement: how much do all 7 components agree vs diverge?
  // Normalize each to 0–1 scale, compute std deviation — low spread = high agreement
  const components = [
    tech.score   / 25,
    brain.score  / 20,
    signal.score / 15,
    regime.score / 10,
    macro.score  / 10,
    sent.score   / 10,
    fund.score   / 10,
  ];
  const mean   = components.reduce((a, b) => a + b, 0) / components.length;
  const stdDev = Math.sqrt(components.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / components.length);
  // Low stdDev (signals agree) → high agreement bonus; high stdDev → low bonus
  const agreementBonus = Math.round((1 - Math.min(1, stdDev * 3)) * 30); // 0–30 pts

  // Score conviction: strong score (far from 50) adds up to 25 pts
  const conviction = Math.round(Math.abs(masterScore - 50) / 50 * 25); // 0–25 pts

  const confidence = Math.min(92, Math.max(25, dataBase + agreementBonus + conviction));

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
  }));
  const explanation = buildExplanation(symbol, masterScore, decision, tech, brain, sent, macro, regime);
  const warnings    = buildWarnings(indicators, macroSnapshot, edgar, vix, fearGreed, masterScore);

  return {
    symbol, masterScore, decision, confidence, risk, holdTime,
    scoreBreakdown: {
      technical:    { score: tech.score,   max: 25, detail: tech.detail },
      brainVault:   { score: brain.score,  max: 20, detail: brain.detail, activePercent: brain.activePercent },
      signalPerf:   { score: signal.score, max: 15, detail: signal.detail, avgAccuracy: signal.avgAccuracy },
      regime:       { score: regime.score, max: 10, detail: regime.detail },
      macro:        { score: macro.score,  max: 10, detail: macro.detail },
      sentiment:    { score: sent.score,   max: 10, detail: sent.detail },
      fundamentals: { score: fund.score,   max: 10, detail: fund.detail },
    },
    marketHealth: { score: mhScore, label: healthLabel(mhScore), color: scoreColor(mhScore), contributions: mhResult.contributions },
    topPatterns, explanation, warnings,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildMasterIntelligence, calcMarketHealth, healthLabel, scoreColor };
