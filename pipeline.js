// ═══════════════════════════════════════════════════════════
//  VESTEX DATA PIPELINE
//  Runs on Railway server — collects stock data from Alpaca,
//  stores in Firestore, generates predictions automatically.
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
//  INDICATORS — RSI + MOVING AVERAGES + VOLUME SPIKE
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
  return lastVol > avgVol * 1.5; // 50% above average = spike
}

// ═══════════════════════════════════════════════════════════
//  PREDICTION ENGINE
//  Returns: direction (UP/DOWN/FLAT), confidence, target price
// ═══════════════════════════════════════════════════════════
function generatePrediction(bars) {
  const closes  = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const last    = closes[closes.length - 1];

  const sma7   = calcSMA(closes, 7);
  const sma21  = calcSMA(closes, 21);
  const rsi    = calcRSI(closes, 14);
  const volSpike = calcVolumeSpike(volumes);

  // Score system: positive = bullish, negative = bearish
  let score = 0;

  // Moving average crossover
  if (sma7 && sma21) {
    if (sma7 > sma21)       score += 2;  // short MA above long = uptrend
    else if (sma7 < sma21)  score -= 2;  // short MA below long = downtrend
  }

  // RSI signals
  if (rsi !== null) {
    if (rsi < 30)        score += 3;  // oversold = likely bounce up
    else if (rsi < 45)   score += 1;
    else if (rsi > 70)   score -= 3;  // overbought = likely drop
    else if (rsi > 55)   score -= 1;
  }

  // Volume spike confirms momentum
  if (volSpike) score = score > 0 ? score + 1 : score - 1;

  // Price momentum (last 3 days)
  if (closes.length >= 4) {
    const momentum = (closes[closes.length-1] - closes[closes.length-4]) / closes[closes.length-4] * 100;
    if (momentum > 2)       score += 1;
    else if (momentum < -2) score -= 1;
  }

  // Determine direction
  let direction, confidence, targetPct;
  if      (score >= 4)  { direction = 'UP';   confidence = Math.min(90, 60 + score * 3); targetPct =  (score * 0.4); }
  else if (score >= 2)  { direction = 'UP';   confidence = Math.min(75, 50 + score * 4); targetPct =  (score * 0.3); }
  else if (score <= -4) { direction = 'DOWN'; confidence = Math.min(90, 60 + Math.abs(score) * 3); targetPct = -(Math.abs(score) * 0.4); }
  else if (score <= -2) { direction = 'DOWN'; confidence = Math.min(75, 50 + Math.abs(score) * 4); targetPct = -(Math.abs(score) * 0.3); }
  else                  { direction = 'FLAT'; confidence = 50; targetPct = 0; }

  const target7d  = +(last * (1 + targetPct / 100)).toFixed(2);
  const target30d = +(last * (1 + targetPct * 3 / 100)).toFixed(2);

  return {
    direction,
    confidence: Math.round(confidence),
    targetPct:  +targetPct.toFixed(2),
    target7d,
    target30d,
    indicators: { sma7, sma21, rsi, volSpike, score },
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
    checkedAt: null,  // filled in when we verify the prediction later
    wasCorrect: null,
  };
  // Store with date key so we can check accuracy later
  const dateKey = new Date().toISOString().split('T')[0];
  await db.collection('predictions').doc(`${symbol}_${dateKey}`).set(doc, { merge: true });
  // Also update latest prediction per symbol
  await db.collection('latest_predictions').doc(symbol).set(doc);
  console.log(`[PIPELINE] Stored prediction for ${symbol}: ${prediction.direction} (${prediction.confidence}% confidence)`);
}

async function storeQuote(symbol, quote) {
  const db = getDB();
  await db.collection('quotes').doc(symbol).set({
    ...quote,
    updatedAt: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════
//  VERIFY PAST PREDICTIONS (run weekly)
//  Checks if last week's predictions were correct
// ═══════════════════════════════════════════════════════════
async function verifyPredictions() {
  const db   = getDB();
  const week = new Date();
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

    const actualPct   = (current - pred.currentPrice) / pred.currentPrice * 100;
    const wasCorrect  =
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
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN PIPELINE — runs on schedule
// ═══════════════════════════════════════════════════════════
async function runPipeline() {
  console.log(`[PIPELINE] Starting — ${new Date().toISOString()}`);
  const results = [];

  for (const symbol of SYMBOLS) {
    try {
      // 1. Fetch 30 days of bars
      const bars = await fetchDailyBars(symbol, 30);
      if (!bars.length) { console.warn(`[PIPELINE] No bars for ${symbol}`); continue; }

      // 2. Store in Firestore
      await storeBars(symbol, bars);

      // 3. Fetch latest quote
      const quote = await fetchLatestQuote(symbol);
      await storeQuote(symbol, quote);

      // 4. Generate prediction
      const prediction = generatePrediction(bars);
      await storePrediction(symbol, prediction, bars[bars.length - 1].close);

      results.push({ symbol, status: 'ok', prediction });

      // Small delay between symbols to respect rate limits
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
