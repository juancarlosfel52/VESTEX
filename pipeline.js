// ═══════════════════════════════════════════════════════════
//  VESTEX DATA PIPELINE
//  Prediction engine runs on proven technical analysis logic.
//  Accuracy is tracked for display — it never modifies scores.
// ═══════════════════════════════════════════════════════════

const axios = require('axios');
const admin = require('firebase-admin');
const { runBrainAnalysis } = require('./brain');
const { loadSignalWeights, updateSignalPerformance, calcSignalConfAdj } = require('./signalPerformance');
const { fetchMacroSnapshot } = require('./macro');
const { fetchEdgarData } = require('./edgar');

const ALPACA_KEY    = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
const ALPACA_DATA   = 'https://data.alpaca.markets';

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID':     ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

const SYMBOLS = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN'];

let db;
function getDB() {
  if (!db) db = admin.firestore();
  return db;
}

// ═══════════════════════════════════════════════════════════
//  FETCH DATA
// ═══════════════════════════════════════════════════════════
async function fetchDailyBars(symbol, days = 40) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const res = await axios.get(`${ALPACA_DATA}/v2/stocks/${symbol}/bars`, {
    headers: ALPACA_HEADERS,
    params: {
      timeframe: '1Day',
      start:     start.toISOString().split('T')[0],
      end:       end.toISOString().split('T')[0],
      limit:     days,
      feed:      'iex',
    }
  });

  return (res.data.bars || []).map(b => ({
    symbol,
    time:   b.t,
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
    vwap:   b.vw || null,
  }));
}

async function fetchLatestQuote(symbol) {
  const res = await axios.get(`${ALPACA_DATA}/v2/stocks/${symbol}/quotes/latest`, {
    headers: ALPACA_HEADERS,
    params: { feed: 'iex' }
  });
  const q = res.data.quote;
  return { symbol, ask: q.ap, bid: q.bp, time: q.t };
}

// ═══════════════════════════════════════════════════════════
//  INDICATORS — all proven, fixed logic
// ═══════════════════════════════════════════════════════════

// Simple Moving Average
function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// RSI (14-day) — industry standard overbought/oversold
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }
  const avgGain = gains  / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
}

// ATR — how many dollars the stock moves per day on average
// Used to set realistic targets and reduce confidence on wild stocks
function calcATR(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const recent = bars.slice(-period - 1);
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low  - recent[i - 1].close)
    );
    trSum += tr;
  }
  return +(trSum / period).toFixed(4);
}

// Volume spike — last day traded 50%+ above 10-day average
function calcVolumeSpike(volumes) {
  if (volumes.length < 10) return false;
  const avg = volumes.slice(-10, -1).reduce((a, b) => a + b, 0) / 9;
  return volumes[volumes.length - 1] > avg * 1.5;
}

// Consecutive day streak — how many days in a row same direction
function calcStreak(closes) {
  if (closes.length < 2) return 0;
  const dir = closes[closes.length - 1] >= closes[closes.length - 2] ? 1 : -1;
  let streak = 1;
  for (let i = closes.length - 2; i > 0; i--) {
    if ((closes[i] >= closes[i - 1] ? 1 : -1) === dir) streak++;
    else break;
  }
  return dir * streak;
}

// MACD — 12/26 EMA crossover, the most widely used trend signal
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k    = 2 / (period + 1);
  let   ema  = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return +ema.toFixed(4);
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  return +(ema12 - ema26).toFixed(4);
}

// ═══════════════════════════════════════════════════════════
//  PREDICTION ENGINE
//  Every signal has a defined meaning and fixed point value.
//  No weights that drift. Logic is the same every day.
// ═══════════════════════════════════════════════════════════
function generatePrediction(bars, symbol = null) {
  const closes   = bars.map(b => b.close);
  const volumes  = bars.map(b => b.volume);
  const last     = closes[closes.length - 1];

  // ── Calculate all indicators ──
  const sma7     = calcSMA(closes, 7);
  const sma21    = calcSMA(closes, 21);
  const rsi      = calcRSI(closes, 14);
  const atr      = calcATR(bars, 14);
  const volSpike = calcVolumeSpike(volumes);
  const streak   = calcStreak(closes);
  const macd     = calcMACD(closes);
  const atrPct   = atr !== null ? (atr / last * 100) : null;

  let score = 0;
  const reasons = [];
  const signalsUsed = [];  // named signal tracker

  // ── TREND SIGNALS ──

  // SMA 7/21 crossover: short-term MA above long-term = uptrend
  if (sma7 !== null && sma21 !== null) {
    if (sma7 > sma21) {
      score += 2;
      reasons.push('7-day MA above 21-day MA — uptrend active');
      signalsUsed.push({ name: 'SMA_UPTREND', direction: 'UP' });
    } else {
      score -= 2;
      reasons.push('7-day MA below 21-day MA — downtrend active');
      signalsUsed.push({ name: 'SMA_DOWNTREND', direction: 'DOWN' });
    }
  }

  // MACD: positive = bullish momentum, negative = bearish
  if (macd !== null) {
    if (macd > 0) {
      score += 1.5;
      reasons.push('MACD positive — momentum favors buyers');
      signalsUsed.push({ name: 'MACD_BULLISH', direction: 'UP' });
    } else {
      score -= 1.5;
      reasons.push('MACD negative — momentum favors sellers');
      signalsUsed.push({ name: 'MACD_BEARISH', direction: 'DOWN' });
    }
  }

  // ── MOMENTUM SIGNALS ──

  // RSI: 30/70 are the classic levels used by every technician
  if (rsi !== null) {
    if (rsi < 25) {
      score += 3.5;
      reasons.push(`RSI ${rsi} — deeply oversold, strong bounce signal`);
      signalsUsed.push({ name: 'RSI_DEEPLY_OVERSOLD', direction: 'UP' });
    } else if (rsi < 35) {
      score += 2.5;
      reasons.push(`RSI ${rsi} — oversold territory, likely bounce`);
      signalsUsed.push({ name: 'RSI_OVERSOLD', direction: 'UP' });
    } else if (rsi < 45) {
      score += 1;
      reasons.push(`RSI ${rsi} — below midpoint, mild bullish lean`);
      signalsUsed.push({ name: 'RSI_MILD_BULLISH', direction: 'UP' });
    } else if (rsi > 80) {
      score -= 3.5;
      reasons.push(`RSI ${rsi} — severely overbought, pullback likely`);
      signalsUsed.push({ name: 'RSI_SEVERELY_OVERBOUGHT', direction: 'DOWN' });
    } else if (rsi > 70) {
      score -= 2.5;
      reasons.push(`RSI ${rsi} — overbought, momentum may stall`);
      signalsUsed.push({ name: 'RSI_OVERBOUGHT', direction: 'DOWN' });
    } else if (rsi > 60) {
      score -= 1;
      reasons.push(`RSI ${rsi} — above midpoint, mild bearish lean`);
      signalsUsed.push({ name: 'RSI_MILD_BEARISH', direction: 'DOWN' });
    }
  }

  // 3-day momentum: sustained move confirms direction
  if (closes.length >= 4) {
    const mom3 = (closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4] * 100;
    if (mom3 > 3) {
      score += 1.5;
      reasons.push(`+${mom3.toFixed(1)}% over 3 days — strong upward momentum`);
      signalsUsed.push({ name: 'MOMENTUM_STRONG_BULLISH', direction: 'UP' });
    } else if (mom3 > 1) {
      score += 0.5;
      reasons.push(`+${mom3.toFixed(1)}% over 3 days — mild upward momentum`);
      signalsUsed.push({ name: 'MOMENTUM_MILD_BULLISH', direction: 'UP' });
    } else if (mom3 < -3) {
      score -= 1.5;
      reasons.push(`${mom3.toFixed(1)}% over 3 days — strong downward momentum`);
      signalsUsed.push({ name: 'MOMENTUM_STRONG_BEARISH', direction: 'DOWN' });
    } else if (mom3 < -1) {
      score -= 0.5;
      reasons.push(`${mom3.toFixed(1)}% over 3 days — mild downward momentum`);
      signalsUsed.push({ name: 'MOMENTUM_MILD_BEARISH', direction: 'DOWN' });
    }
  }

  // ── VOLUME CONFIRMATION ──
  // Volume spike only matters when it confirms existing direction
  if (volSpike) {
    if (score > 0) {
      score += 1;
      reasons.push('Volume spike confirms bullish move');
      signalsUsed.push({ name: 'VOLUME_SPIKE_BULLISH', direction: 'UP' });
    } else if (score < 0) {
      score -= 1;
      reasons.push('Volume spike confirms bearish move');
      signalsUsed.push({ name: 'VOLUME_SPIKE_BEARISH', direction: 'DOWN' });
    }
  }

  // ── STREAK SIGNAL ──
  // 5+ days same direction: either exhaustion (mean reversion) or strong trend
  // We use RSI to decide which — overbought streak = exhaustion
  if (Math.abs(streak) >= 5) {
    const exhaustion = (streak > 0 && rsi !== null && rsi > 65) ||
                       (streak < 0 && rsi !== null && rsi < 35);
    if (exhaustion) {
      const exDir = streak > 0 ? 'DOWN' : 'UP';
      score -= Math.sign(streak) * 1.5;
      reasons.push(`${Math.abs(streak)}-day streak with extreme RSI — exhaustion likely`);
      signalsUsed.push({ name: 'STREAK_EXHAUSTION', direction: exDir });
    } else {
      const contDir = streak > 0 ? 'UP' : 'DOWN';
      const contName = streak > 0 ? 'STREAK_CONTINUATION_BULL' : 'STREAK_CONTINUATION_BEAR';
      score += Math.sign(streak) * 1;
      reasons.push(`${Math.abs(streak)}-day streak — strong trend continuation signal`);
      signalsUsed.push({ name: contName, direction: contDir });
    }
  }

  // ── DIRECTION DECISION ──
  // Threshold of 3 requires at least 2 agreeing signals
  let direction, targetPct;
  const absScore = Math.abs(score);

  if      (score >= 5)  { direction = 'UP';   targetPct =  Math.min(4, score * 0.4); }
  else if (score >= 3)  { direction = 'UP';   targetPct =  Math.min(2.5, score * 0.3); }
  else if (score <= -5) { direction = 'DOWN'; targetPct = -Math.min(4, absScore * 0.4); }
  else if (score <= -3) { direction = 'DOWN'; targetPct = -Math.min(2.5, absScore * 0.3); }
  else                  { direction = 'FLAT'; targetPct = 0; }

  // ── CONFIDENCE CALCULATION ──
  // Based on signal agreement strength — not sample size
  let confidence = Math.min(88, 42 + absScore * 5);

  // ATR penalty: high daily volatility = targets less reliable
  // This is honest — TSLA at 3.5% ATR is genuinely harder to predict
  if (atrPct !== null) {
    if      (atrPct > 4.0) confidence -= 15;
    else if (atrPct > 3.0) confidence -= 10;
    else if (atrPct > 2.0) confidence -= 5;
    else if (atrPct < 0.8) confidence += 5;  // very stable stock
  }

  // Signal agreement bonus: when all signals point same way, more reliable
  const bullSignals = reasons.filter(r =>
    r.includes('uptrend') || r.includes('oversold') || r.includes('bullish') ||
    r.includes('upward') || r.includes('buyers') || r.includes('confirms bullish')
  ).length;
  const bearSignals = reasons.filter(r =>
    r.includes('downtrend') || r.includes('overbought') || r.includes('bearish') ||
    r.includes('downward') || r.includes('sellers') || r.includes('confirms bearish')
  ).length;

  const totalSignals = bullSignals + bearSignals;
  const agreement    = totalSignals > 0 ? Math.abs(bullSignals - bearSignals) / totalSignals : 0;
  if (agreement > 0.8 && totalSignals >= 3) confidence += 5;  // strong consensus

  confidence = Math.max(35, Math.min(90, Math.round(confidence)));

  // ── PRICE TARGETS ──
  // Use ATR to set realistic targets — not just % of score
  // 7-day target = predicted direction × ATR × days
  const atrTarget = atr !== null
    ? +(atr * 7 * (targetPct >= 0 ? 1 : -1) * 0.6).toFixed(2)
    : +(last * targetPct / 100).toFixed(2);

  const target7d  = +(last + atrTarget).toFixed(2);
  const target30d = +(last + atrTarget * 3).toFixed(2);

  return {
    direction,
    confidence,
    targetPct:  +targetPct.toFixed(2),
    target7d,
    target30d,
    indicators: {
      sma7:     sma7    ? +sma7.toFixed(2)    : null,
      sma21:    sma21   ? +sma21.toFixed(2)   : null,
      rsi:      rsi,
      macd:     macd,
      volSpike,
      atr:      atr,
      atrPct:   atrPct  ? +atrPct.toFixed(2)  : null,
      streak,
      score:    +score.toFixed(2),
    },
    reasons,
    signalsUsed,
    generatedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════
//  STORE TO FIRESTORE
// ═══════════════════════════════════════════════════════════
async function storeBars(symbol, bars) {
  const db    = getDB();
  const batch = db.batch();
  bars.forEach(bar => {
    const id  = `${symbol}_${bar.time.split('T')[0]}`;
    batch.set(db.collection('market_data').doc(id), bar, { merge: true });
  });
  await batch.commit();
  console.log(`[PIPELINE] Stored ${bars.length} bars for ${symbol}`);
}

async function storePrediction(symbol, prediction, currentPrice) {
  const db  = getDB();
  const doc = { symbol, currentPrice, ...prediction, checkedAt: null, wasCorrect: null };
  const dateKey = new Date().toISOString().split('T')[0];
  await db.collection('predictions').doc(`${symbol}_${dateKey}`).set(doc, { merge: true });
  await db.collection('latest_predictions').doc(symbol).set(doc);

  const ind = prediction.indicators;
  console.log(`[PIPELINE] ${symbol}: ${prediction.direction} | conf:${prediction.confidence}% | RSI:${ind.rsi} | MACD:${ind.macd} | ATR%:${ind.atrPct} | streak:${ind.streak}`);
}

async function storeQuote(symbol, quote) {
  await getDB().collection('quotes').doc(symbol).set({
    ...quote, updatedAt: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════
//  VERIFY PAST PREDICTIONS
//  Tracks accuracy for display only — does not modify scoring
// ═══════════════════════════════════════════════════════════
async function verifyPredictions() {
  const db      = getDB();
  const week    = new Date();
  week.setDate(week.getDate() - 7);
  const dateKey = week.toISOString().split('T')[0];

  for (const symbol of SYMBOLS) {
    const ref = db.collection('predictions').doc(`${symbol}_${dateKey}`);
    const doc = await ref.get();
    if (!doc.exists || doc.data().wasCorrect !== null) continue;

    const pred    = doc.data();
    const bars    = await fetchDailyBars(symbol, 2);
    const current = bars[bars.length - 1]?.close;
    if (!current) continue;

    const actualPct  = (current - pred.currentPrice) / pred.currentPrice * 100;
    const wasCorrect =
      (pred.direction === 'UP'   && actualPct >  0.5) ||
      (pred.direction === 'DOWN' && actualPct < -0.5) ||
      (pred.direction === 'FLAT' && Math.abs(actualPct) <= 0.5);

    // Determine actual market direction for signal learning
    const actualDirection = actualPct > 0.5 ? 'UP' : actualPct < -0.5 ? 'DOWN' : 'FLAT';

    await ref.update({
      checkedAt:   new Date().toISOString(),
      actualPct:   +actualPct.toFixed(2),
      actualPrice: current,
      wasCorrect,
    });

    // Feed signal performance tracker (include regime from stored brain data)
    if (pred.signalsUsed && pred.signalsUsed.length) {
      const regime = pred.brain?.regime?.name || null;
      await updateSignalPerformance(getDB(), pred.signalsUsed, actualDirection, symbol, regime);
    }

    console.log(`[VERIFY] ${symbol} ${pred.direction} → actual ${actualPct.toFixed(2)}% → ${wasCorrect ? 'CORRECT ✓' : 'WRONG ✗'}`);
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN PIPELINE
// ═══════════════════════════════════════════════════════════
async function runPipeline() {
  console.log(`[PIPELINE] Starting — ${new Date().toISOString()}`);
  const results = [];

  // ── Fetch macro snapshot once — shared across all symbols ──
  // Brain regime (F&G + VIX) will be merged in after brain analysis below
  let fredSnapshot = null;
  try {
    fredSnapshot = await fetchMacroSnapshot(null); // regime filled in per-symbol below
    console.log(`[MACRO] Snapshot captured — FRED:${process.env.FRED_API_KEY ? 'yes' : 'no'}`);
  } catch(me) {
    console.warn(`[MACRO] Snapshot failed:`, me.message);
  }

  // Signal weights — load once, reuse for all symbols
  let sigWeights = {};
  try {
    sigWeights = await loadSignalWeights(getDB());
  } catch(se) {
    console.warn(`[SIGNALS] Weight load failed:`, se.message);
  }

  for (const symbol of SYMBOLS) {
    try {
      const bars = await fetchDailyBars(symbol, 40);
      if (!bars.length) { console.warn(`[PIPELINE] No bars for ${symbol}`); continue; }

      await storeBars(symbol, bars);

      const quote = await fetchLatestQuote(symbol);
      await storeQuote(symbol, quote);

      const prediction = generatePrediction(bars, symbol);

      // ── Signal performance adjustment ──
      const sigAdj = calcSignalConfAdj(prediction.signalsUsed, sigWeights);
      if (sigAdj !== 0) {
        prediction.confidence = Math.max(35, Math.min(90, prediction.confidence + sigAdj));
        console.log(`[SIGNALS] ${symbol}: signal adj ${sigAdj >= 0 ? '+' : ''}${sigAdj} → conf ${prediction.confidence}%`);
      }
      prediction.signalAdj = sigAdj;

      // ── Fetch symbol-specific context for Brain Vault ──
      let edgarData   = null;
      let sentimentData = null;
      try {
        edgarData = await fetchEdgarData(symbol);
      } catch(ee) { /* silent — edgar optional */ }
      try {
        const sentSnap = await getDB().collection('sentiment').doc(symbol).get();
        if (sentSnap.exists) sentimentData = sentSnap.data();
      } catch(se) { /* silent — sentiment optional */ }

      // ── Brain Vault analysis ──
      let brain = null;
      try {
        brain = await runBrainAnalysis(prediction.indicators, {
          symbol,
          macroSnapshot: fredSnapshot,
          sentiment:     sentimentData,
          edgar:         edgarData,
        });
        // Apply brain confidence adjustment (capped ±10)
        const adj = Math.max(-10, Math.min(10, brain.confidence_adj.total));
        prediction.confidence = Math.max(35, Math.min(90, prediction.confidence + adj));
        prediction.brain = brain;
        const bv = brain.brainVault;
        console.log(`[BRAIN] ${symbol}: ${brain.active_patterns.length} patterns active | ${bv?.diagnostics?.activePercent ?? '?'}% vault active | regime:${brain.regime.name} | score:${brain.brain_score} | adj:${adj >= 0 ? '+' : ''}${adj}`);
      } catch(be) {
        console.warn(`[BRAIN] ${symbol} analysis failed:`, be.message);
      }

      // ── Macro snapshot — merge FRED data with brain regime ──
      if (fredSnapshot) {
        prediction.macroSnapshot = {
          ...fredSnapshot,
          fearGreed: brain?.regime?.fng  ? { value: brain.regime.fng.value, label: brain.regime.fng.label } : { value: null, label: null },
          vix:       brain?.regime?.vix  != null ? { value: brain.regime.vix } : { value: null },
          regime:    brain?.regime?.name || null,
        };
      }

      await storePrediction(symbol, prediction, bars[bars.length - 1].close);

      // ── Log pattern fires to vi_pattern_fires for win-rate verification ──
      // Runs every pipeline cycle so pattern fires are recorded daily regardless of user visits.
      if (brain && brain.active_patterns && brain.active_patterns.length > 0) {
        try {
          const currentPrice = bars[bars.length - 1].close;
          const today        = new Date().toISOString().split('T')[0];
          const db2          = getDB();
          const batch        = db2.batch();
          let   writes       = 0;
          for (const p of brain.active_patterns) {
            if (!p.pattern_id || p.direction === 'neutral') continue;
            const id     = `${p.pattern_id}_${symbol}_${today}`;
            const docRef = db2.collection('vi_pattern_fires').doc(id);
            const snap   = await docRef.get().catch(() => null);
            if (snap?.exists) continue;
            batch.set(docRef, {
              id, patternId: p.pattern_id, patternName: p.name || p.pattern_id,
              symbol, date: today, timestamp: Date.now(),
              priceAtFire: currentPrice, spyPriceAtFire: null,
              direction: p.direction, strength: p.strength || null,
              impact: p.impact || null, category: p.category || 'technical',
              note: p.note || null,
              verification7d: null, verification30d: null,
              source: 'pipeline',
            });
            writes++;
            if (writes >= 10) break;
          }
          if (writes > 0) {
            await batch.commit().catch(e => console.warn('[VI-PAT-PIPE] Batch write failed:', e.message));
            console.log(`[VI-PAT-PIPE] ${symbol}: logged ${writes} pattern fires`);
          }
        } catch(pe) {
          console.warn(`[VI-PAT-PIPE] ${symbol} pattern fire log failed:`, pe.message);
        }
      }

      // ── Log vi_prediction for daily coverage ──
      // Ensures every pipeline run creates a prediction record per symbol,
      // matching the same schema as POST /api/vi/log. One per symbol per day.
      try {
        const today2    = new Date().toISOString().split('T')[0];
        const viId      = `${symbol}_${today2}`;
        const viRef     = getDB().collection('vi_predictions').doc(viId);
        const viSnap    = await viRef.get().catch(() => null);
        if (!viSnap?.exists) {
          const currentPrice = bars[bars.length - 1].close;
          // Map pipeline direction to decision label for schema parity
          const decisionMap = { UP: 'BUY', DOWN: 'SELL', FLAT: 'HOLD' };
          const topPats = (brain?.active_patterns || []).slice(0, 10).map(p => ({
            name:           p.name || p.pattern_id,
            category:       p.category || null,
            patternId:      p.pattern_id || null,
            direction:      p.direction || null,
            winRate:        p.win_rate || null,
            winRateSource:  p.win_rate_source || null,
          }));
          await viRef.set({
            id:                viId,
            symbol,
            timestamp:         Date.now(),
            date:              today2,
            priceAtPrediction: currentPrice,
            spyAtPrediction:   null,
            masterScore:       null,  // pipeline path has no MI — filled by frontend if user visits
            decision:          decisionMap[prediction.direction] || 'HOLD',
            confidence:        prediction.confidence ?? null,
            systemVotes:       null,
            topPatterns:       topPats,
            marketRegime:      brain?.regime?.name || null,
            sentimentScore:    sentimentData?.score ?? null,
            sentimentOverall:  sentimentData?.overall ?? null,
            catalystDelta:     null,
            catalystEvents:    [],
            verification7d:    null,
            verification30d:   null,
            source:            'pipeline',
            decisionSource:    'pipeline-direction', // additive — distinguishes pipeline rows from engine-v1 MI rows
          });
          console.log(`[VI-PRED-PIPE] ${symbol}: logged prediction (${prediction.direction}, conf ${prediction.confidence}%)`);
        }
      } catch(ve) {
        console.warn(`[VI-PRED-PIPE] ${symbol} prediction log failed:`, ve.message);
      }

      results.push({ symbol, status: 'ok', prediction });
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`[PIPELINE] Error for ${symbol}:`, err.message);
      results.push({ symbol, status: 'error', error: err.message });
    }
  }

  console.log(`[PIPELINE] Complete — ${results.filter(r => r.status === 'ok').length}/${SYMBOLS.length} symbols`);
  return results;
}

module.exports = { runPipeline, verifyPredictions, SYMBOLS };
