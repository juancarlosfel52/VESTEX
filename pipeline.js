// ═══════════════════════════════════════════════════════════
//  VESTEX DATA PIPELINE — with Adaptive Learning
//  Runs on Railway server — collects stock data from Alpaca,
//  stores in Firestore, generates predictions automatically.
//  Learning: signal weights + per-symbol multipliers update
//  every week based on verified prediction outcomes.
// ═══════════════════════════════════════════════════════════

const axios       = require('axios');
const admin       = require('firebase-admin');

// ── Alpaca config ──
const ALPACA_KEY    = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
const ALPACA_DATA   = 'https://data.alpaca.markets';

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID':     ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

// ── Stocks to track ──
const SYMBOLS = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN'];

// ── Default signal weights (used until enough data exists) ──
const DEFAULT_WEIGHTS = {
  sma:          2.0,   // moving average crossover
  rsi_extreme:  3.0,   // RSI < 30 or > 70
  rsi_mild:     1.0,   // RSI 30–45 or 55–70
  volume:       1.0,   // volume spike confirmation
  momentum:     1.0,   // 3-day price momentum
  // Per-symbol accuracy multipliers (0.5 to 1.2)
  symbolMultipliers: {
    AAPL: 1.0, TSLA: 1.0, GOOGL: 1.0, MSFT: 1.0, AMZN: 1.0
  }
};

// ── Firestore reference ──
let db;
function getDB() {
  if (!db) db = admin.firestore();
  return db;
}

// ═══════════════════════════════════════════════════════════
//  FETCH DAILY BARS (OHLCV) FOR ALL SYMBOLS
// ═══════════════════════════════════════════════════════════
async function fetchDailyBars(symbol, days = 30) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const url = `${ALPACA_DATA}/v2/stocks/${symbol}/bars`;
  const res  = await axios.get(url, {
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

// ═══════════════════════════════════════════════════════════
//  FETCH LATEST QUOTE
// ═══════════════════════════════════════════════════════════
async function fetchLatestQuote(symbol) {
  const url = `${ALPACA_DATA}/v2/stocks/${symbol}/quotes/latest`;
  const res  = await axios.get(url, {
    headers: ALPACA_HEADERS,
    params: { feed: 'iex' }
  });
  const q = res.data.quote;
  return {
    symbol,
    ask:  q.ap,
    bid:  q.bp,
    time: q.t,
  };
}

// ═══════════════════════════════════════════════════════════
//  INDICATORS
// ═══════════════════════════════════════════════════════════
function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

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
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function calcVolumeSpike(volumes) {
  if (volumes.length < 10) return false;
  const avgVol  = volumes.slice(-10, -1).reduce((a, b) => a + b, 0) / 9;
  const lastVol = volumes[volumes.length - 1];
  return lastVol > avgVol * 1.5;
}

// Average True Range — measures recent volatility
// High ATR = unpredictable price action = lower confidence
function calcATR(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const recent = bars.slice(-period - 1);
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high  = recent[i].high;
    const low   = recent[i].low;
    const prev  = recent[i - 1].close;
    const tr    = Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
    trSum += tr;
  }
  return +(trSum / period).toFixed(4);
}

// Streak — how many consecutive days price moved in same direction
// Strong streaks add signal weight to momentum
function calcStreak(closes) {
  if (closes.length < 2) return 0;
  let streak = 1;
  const dir  = closes[closes.length - 1] > closes[closes.length - 2] ? 1 : -1;
  for (let i = closes.length - 2; i > 0; i--) {
    const d = closes[i] > closes[i - 1] ? 1 : -1;
    if (d === dir) streak++;
    else break;
  }
  return dir * streak; // positive = up streak, negative = down streak
}

// ═══════════════════════════════════════════════════════════
//  ADAPTIVE WEIGHTS — load from Firestore
// ═══════════════════════════════════════════════════════════
async function loadModelWeights() {
  try {
    const doc = await getDB().collection('model_config').doc('weights').get();
    if (!doc.exists) return { ...DEFAULT_WEIGHTS };
    const data = doc.data();
    // Merge with defaults so any missing keys are covered
    return {
      ...DEFAULT_WEIGHTS,
      ...data,
      symbolMultipliers: {
        ...DEFAULT_WEIGHTS.symbolMultipliers,
        ...(data.symbolMultipliers || {})
      }
    };
  } catch(e) {
    console.warn('[WEIGHTS] Could not load — using defaults:', e.message);
    return { ...DEFAULT_WEIGHTS };
  }
}

// ═══════════════════════════════════════════════════════════
//  PREDICTION ENGINE — signal-weight driven
// ═══════════════════════════════════════════════════════════
function generatePrediction(bars, weights = DEFAULT_WEIGHTS, symbol = null) {
  const closes   = bars.map(b => b.close);
  const volumes  = bars.map(b => b.volume);
  const last     = closes[closes.length - 1];

  const sma7     = calcSMA(closes, 7);
  const sma21    = calcSMA(closes, 21);
  const rsi      = calcRSI(closes, 14);
  const volSpike = calcVolumeSpike(volumes);
  const atr      = calcATR(bars, 14);
  const streak   = calcStreak(closes);

  // ATR as % of price — used to adjust confidence
  const atrPct   = atr !== null ? (atr / last * 100) : null;

  // Score system — weights are adaptive
  let score = 0;
  const signals = {}; // track which signals fired and how much

  // Moving average crossover
  if (sma7 && sma21) {
    const smaPoints = sma7 > sma21 ? weights.sma : -weights.sma;
    score += smaPoints;
    signals.sma = smaPoints;
  }

  // RSI signals
  if (rsi !== null) {
    let rsiPoints = 0;
    if      (rsi < 30) rsiPoints =  weights.rsi_extreme;
    else if (rsi < 45) rsiPoints =  weights.rsi_mild;
    else if (rsi > 70) rsiPoints = -weights.rsi_extreme;
    else if (rsi > 55) rsiPoints = -weights.rsi_mild;
    score += rsiPoints;
    signals.rsi = rsiPoints;
  }

  // Volume spike confirms direction
  if (volSpike) {
    const volPoints = score > 0 ? weights.volume : -weights.volume;
    score += volPoints;
    signals.volume = volPoints;
  }

  // 3-day price momentum
  if (closes.length >= 4) {
    const momentum = (closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4] * 100;
    const momPoints = momentum > 2 ? weights.momentum : momentum < -2 ? -weights.momentum : 0;
    score += momPoints;
    signals.momentum = momPoints;
  }

  // Streak bonus — 4+ day streak adds extra signal strength
  if (Math.abs(streak) >= 4) {
    const streakPoints = streak > 0 ? weights.momentum * 0.5 : -weights.momentum * 0.5;
    score += streakPoints;
    signals.streak = streakPoints;
  }

  // Determine direction thresholds based on weight scale
  const threshold = (weights.sma + weights.rsi_extreme) / 2.5;
  let direction, targetPct;
  if      (score >=  threshold * 1.5) { direction = 'UP';   targetPct =  Math.min(3, score * 0.35); }
  else if (score >=  threshold)        { direction = 'UP';   targetPct =  Math.min(2, score * 0.25); }
  else if (score <= -threshold * 1.5) { direction = 'DOWN'; targetPct = -Math.min(3, Math.abs(score) * 0.35); }
  else if (score <= -threshold)        { direction = 'DOWN'; targetPct = -Math.min(2, Math.abs(score) * 0.25); }
  else                                 { direction = 'FLAT'; targetPct = 0; }

  // Base confidence from signal strength
  let confidence = Math.min(88, 44 + Math.abs(score) * 5);

  // ATR penalty — high volatility = lower confidence
  if (atrPct !== null) {
    if      (atrPct > 3.5) confidence -= 12;
    else if (atrPct > 2.5) confidence -= 7;
    else if (atrPct > 1.5) confidence -= 3;
    else if (atrPct < 0.8) confidence += 4; // very stable = slightly more confident
  }

  // Per-symbol accuracy multiplier
  if (symbol && weights.symbolMultipliers[symbol] !== undefined) {
    confidence = Math.round(confidence * weights.symbolMultipliers[symbol]);
  }

  confidence = Math.max(35, Math.min(90, Math.round(confidence)));

  const target7d  = +(last * (1 + targetPct / 100)).toFixed(2);
  const target30d = +(last * (1 + targetPct * 3 / 100)).toFixed(2);

  return {
    direction,
    confidence,
    targetPct:  +targetPct.toFixed(2),
    target7d,
    target30d,
    indicators: { sma7, sma21, rsi, volSpike, atr, atrPct, streak, score: +score.toFixed(2), signals },
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
    const ref = db.collection('market_data').doc(id);
    batch.set(ref, bar, { merge: true });
  });
  await batch.commit();
  console.log(`[PIPELINE] Stored ${bars.length} bars for ${symbol}`);
}

async function storePrediction(symbol, prediction, currentPrice) {
  const db  = getDB();
  const doc = {
    symbol,
    currentPrice,
    ...prediction,
    checkedAt:  null,
    wasCorrect: null,
  };
  const dateKey = new Date().toISOString().split('T')[0];
  await db.collection('predictions').doc(`${symbol}_${dateKey}`).set(doc, { merge: true });
  await db.collection('latest_predictions').doc(symbol).set(doc);
  console.log(`[PIPELINE] ${symbol}: ${prediction.direction} (${prediction.confidence}% conf, ATR ${prediction.indicators.atrPct?.toFixed(2)}%, streak ${prediction.indicators.streak})`);
}

async function storeQuote(symbol, quote) {
  const db = getDB();
  await db.collection('quotes').doc(symbol).set({
    ...quote,
    updatedAt: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════
//  VERIFY PAST PREDICTIONS + TRIGGER WEIGHT UPDATE
// ═══════════════════════════════════════════════════════════
async function verifyPredictions() {
  const db      = getDB();
  const week    = new Date();
  week.setDate(week.getDate() - 7);
  const dateKey = week.toISOString().split('T')[0];

  const outcomes = []; // collect for weight update

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

    await ref.update({
      checkedAt:   new Date().toISOString(),
      actualPct:   +actualPct.toFixed(2),
      actualPrice: current,
      wasCorrect,
    });

    console.log(`[VERIFY] ${symbol} ${pred.direction} → actual ${actualPct.toFixed(2)}% → ${wasCorrect ? 'CORRECT ✓' : 'WRONG ✗'}`);
    outcomes.push({ symbol, wasCorrect, signals: pred.indicators?.signals || {} });
  }

  if (outcomes.length > 0) {
    await updateModelWeights(outcomes);
  }
}

// ═══════════════════════════════════════════════════════════
//  ADAPTIVE WEIGHT UPDATE
//  Runs after each weekly verification.
//  - Correct prediction: slightly boost weights of signals
//    that pushed in the right direction
//  - Wrong prediction: slightly reduce those same weights
//  - Per-symbol: track rolling accuracy, apply as multiplier
// ═══════════════════════════════════════════════════════════
async function updateModelWeights(outcomes) {
  const db      = getDB();
  const weights = await loadModelWeights();

  // Learning rate — small nudge each week
  const LR = 0.05;

  // Signal key → weight key mapping
  const SIGNAL_MAP = {
    sma:      'sma',
    rsi:      null,  // handled specially (extreme vs mild)
    volume:   'volume',
    momentum: 'momentum',
    streak:   'momentum', // streak uses momentum weight
  };

  for (const { symbol, wasCorrect, signals } of outcomes) {
    const direction = wasCorrect ? 1 : -1;

    // Update signal weights
    for (const [sig, value] of Object.entries(signals)) {
      const wKey = SIGNAL_MAP[sig];

      // RSI — determine if extreme or mild based on value magnitude
      if (sig === 'rsi') {
        const absVal = Math.abs(value);
        if (absVal >= weights.rsi_extreme * 0.8) {
          weights.rsi_extreme = clampWeight(weights.rsi_extreme + direction * LR * absVal);
        } else {
          weights.rsi_mild = clampWeight(weights.rsi_mild + direction * LR * absVal);
        }
        continue;
      }

      if (!wKey) continue;
      // If signal pointed in correct direction, boost. If wrong, reduce.
      const signalWasCorrect = (value > 0 && wasCorrect) || (value < 0 && wasCorrect);
      const nudge = signalWasCorrect ? LR : -LR;
      weights[wKey] = clampWeight(weights[wKey] + nudge * Math.abs(value));
    }

    // Per-symbol multiplier — rolling accuracy
    const symRef  = db.collection('model_config').doc('symbol_accuracy');
    const symSnap = await symRef.get();
    const symData = symSnap.exists ? symSnap.data() : {};

    const prev    = symData[symbol] || { correct: 0, total: 0 };
    const updated = {
      correct: prev.correct + (wasCorrect ? 1 : 0),
      total:   prev.total + 1,
    };
    symData[symbol] = updated;
    await symRef.set(symData);

    // Only apply multiplier once we have ≥10 predictions per symbol
    if (updated.total >= 10) {
      const accuracy = updated.correct / updated.total;
      // Map accuracy 0.3–0.8 → multiplier 0.75–1.2
      const multiplier = +(0.75 + (accuracy - 0.3) * (1.2 - 0.75) / (0.8 - 0.3)).toFixed(3);
      weights.symbolMultipliers[symbol] = Math.max(0.6, Math.min(1.25, multiplier));
      console.log(`[WEIGHTS] ${symbol} accuracy ${(accuracy*100).toFixed(1)}% → multiplier ${weights.symbolMultipliers[symbol]}`);
    }
  }

  // Persist updated weights
  await db.collection('model_config').doc('weights').set({
    ...weights,
    updatedAt: new Date().toISOString(),
    updateCount: admin.firestore.FieldValue.increment(1),
  });

  console.log(`[WEIGHTS] Updated — SMA:${weights.sma.toFixed(2)} RSI_E:${weights.rsi_extreme.toFixed(2)} RSI_M:${weights.rsi_mild.toFixed(2)} VOL:${weights.volume.toFixed(2)} MOM:${weights.momentum.toFixed(2)}`);
}

function clampWeight(val) {
  // Keep weights in a sane range so no single signal dominates
  return +Math.max(0.5, Math.min(6.0, val)).toFixed(3);
}

// ═══════════════════════════════════════════════════════════
//  MAIN PIPELINE — runs on schedule
// ═══════════════════════════════════════════════════════════
async function runPipeline() {
  console.log(`[PIPELINE] Starting — ${new Date().toISOString()}`);

  // Load current adaptive weights before generating any predictions
  const weights = await loadModelWeights();
  console.log(`[PIPELINE] Weights loaded — SMA:${weights.sma} RSI_E:${weights.rsi_extreme} RSI_M:${weights.rsi_mild}`);

  const results = [];

  for (const symbol of SYMBOLS) {
    try {
      const bars = await fetchDailyBars(symbol, 30);
      if (!bars.length) { console.warn(`[PIPELINE] No bars for ${symbol}`); continue; }

      await storeBars(symbol, bars);

      const quote = await fetchLatestQuote(symbol);
      await storeQuote(symbol, quote);

      // Pass adaptive weights + symbol into prediction engine
      const prediction = generatePrediction(bars, weights, symbol);
      await storePrediction(symbol, prediction, bars[bars.length - 1].close);

      results.push({ symbol, status: 'ok', prediction });
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`[PIPELINE] Error for ${symbol}:`, err.message);
      results.push({ symbol, status: 'error', error: err.message });
    }
  }

  console.log(`[PIPELINE] Complete — processed ${results.filter(r=>r.status==='ok').length}/${SYMBOLS.length} symbols`);
  return results;
}

module.exports = { runPipeline, verifyPredictions, SYMBOLS };
