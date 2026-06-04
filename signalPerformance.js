// ═══════════════════════════════════════════════════════════
//  VESTEX — Signal Performance Tracker
//  Records each named signal's real-world hit rate.
//  After ≥20 verified uses, multiplier adjusts confidence.
// ═══════════════════════════════════════════════════════════

const admin = require('firebase-admin');

// ── 19 named signals with base weights ──
const SIGNAL_DEFAULTS = {
  SMA_UPTREND:               { label: 'SMA Uptrend',               baseWeight: 2.0, direction: 'UP'   },
  SMA_DOWNTREND:             { label: 'SMA Downtrend',             baseWeight: 2.0, direction: 'DOWN' },
  MACD_BULLISH:              { label: 'MACD Bullish',              baseWeight: 1.5, direction: 'UP'   },
  MACD_BEARISH:              { label: 'MACD Bearish',              baseWeight: 1.5, direction: 'DOWN' },
  RSI_DEEPLY_OVERSOLD:       { label: 'RSI Deeply Oversold',       baseWeight: 3.5, direction: 'UP'   },
  RSI_OVERSOLD:              { label: 'RSI Oversold',              baseWeight: 2.5, direction: 'UP'   },
  RSI_MILD_BULLISH:          { label: 'RSI Mild Bullish',          baseWeight: 1.0, direction: 'UP'   },
  RSI_SEVERELY_OVERBOUGHT:   { label: 'RSI Severely Overbought',   baseWeight: 3.5, direction: 'DOWN' },
  RSI_OVERBOUGHT:            { label: 'RSI Overbought',            baseWeight: 2.5, direction: 'DOWN' },
  RSI_MILD_BEARISH:          { label: 'RSI Mild Bearish',          baseWeight: 1.0, direction: 'DOWN' },
  MOMENTUM_STRONG_BULLISH:   { label: 'Momentum Strong Bullish',   baseWeight: 1.5, direction: 'UP'   },
  MOMENTUM_MILD_BULLISH:     { label: 'Momentum Mild Bullish',     baseWeight: 0.5, direction: 'UP'   },
  MOMENTUM_STRONG_BEARISH:   { label: 'Momentum Strong Bearish',   baseWeight: 1.5, direction: 'DOWN' },
  MOMENTUM_MILD_BEARISH:     { label: 'Momentum Mild Bearish',     baseWeight: 0.5, direction: 'DOWN' },
  VOLUME_SPIKE_BULLISH:      { label: 'Volume Spike Bullish',      baseWeight: 1.0, direction: 'UP'   },
  VOLUME_SPIKE_BEARISH:      { label: 'Volume Spike Bearish',      baseWeight: 1.0, direction: 'DOWN' },
  STREAK_EXHAUSTION:         { label: 'Streak Exhaustion',         baseWeight: 1.5, direction: null   }, // direction set at runtime
  STREAK_CONTINUATION_BULL:  { label: 'Streak Continuation Bull',  baseWeight: 1.0, direction: 'UP'   },
  STREAK_CONTINUATION_BEAR:  { label: 'Streak Continuation Bear',  baseWeight: 1.0, direction: 'DOWN' },
};

const MIN_USES = 20;

// ── Accuracy → multiplier table ──
function getMultiplier(accuracy, totalUses) {
  if (totalUses < MIN_USES) return 1.0;
  if (accuracy >= 70) return 1.25;
  if (accuracy >= 60) return 1.10;
  if (accuracy >= 50) return 1.00;
  if (accuracy >= 45) return 0.90;
  return 0.75;
}

// ── Load all signal records from Firestore ──
async function loadSignalWeights(db) {
  const snap = await db.collection('signalPerformance').get();
  const weights = {};

  // Seed defaults first
  for (const [key, def] of Object.entries(SIGNAL_DEFAULTS)) {
    weights[key] = { label: def.label, totalUses: 0, correct: 0, accuracy: null, multiplier: 1.0 };
  }

  // Overlay live Firestore data
  snap.forEach(doc => {
    const d = doc.data();
    const total = d.totalUses || 0;
    const corr  = d.correct   || 0;
    const acc   = total > 0 ? +(corr / total * 100).toFixed(1) : null;
    weights[doc.id] = {
      label:      d.label     || doc.id,
      totalUses:  total,
      correct:    corr,
      accuracy:   acc,
      multiplier: getMultiplier(acc || 50, total),
    };
  });

  return weights;
}

// ── Update signal performance after a prediction is verified ──
// signalsUsed: [{ name, direction }]
// actualDirection: 'UP' | 'DOWN' | 'FLAT'
// regime: string from brain (e.g. 'fear', 'neutral') — stored uppercase
async function updateSignalPerformance(db, signalsUsed, actualDirection, symbol, regime) {
  if (!signalsUsed || !signalsUsed.length) return;
  // FLAT outcomes don't count for directional signal learning
  if (actualDirection === 'FLAT') return;

  const regimeName = regime ? regime.toUpperCase() : null;
  const batch = db.batch();

  for (const sig of signalsUsed) {
    if (!SIGNAL_DEFAULTS[sig.name]) continue;

    const isCorrect = sig.direction === actualDirection;
    const ref = db.collection('signalPerformance').doc(sig.name);

    // Overall signal counts
    batch.set(ref, {
      label:     SIGNAL_DEFAULTS[sig.name].label,
      totalUses: admin.firestore.FieldValue.increment(1),
      correct:   admin.firestore.FieldValue.increment(isCorrect ? 1 : 0),
      lastUsed:  new Date().toISOString(),
    }, { merge: true });

    // Per-regime counts in subcollection
    if (regimeName) {
      const regRef = ref.collection('regimes').doc(regimeName);
      batch.set(regRef, {
        totalUses: admin.firestore.FieldValue.increment(1),
        correct:   admin.firestore.FieldValue.increment(isCorrect ? 1 : 0),
      }, { merge: true });
    }
  }

  await batch.commit();
  console.log(`[SIGNALS] Updated ${signalsUsed.length} signals for ${symbol} (regime: ${regimeName || 'unknown'})`);
}

// ── Full load including per-regime subcollections — used by API endpoint ──
async function loadSignalPerformanceFull(db) {
  const snap = await db.collection('signalPerformance').get();

  // Seed defaults
  const dataMap = {};
  for (const [key, def] of Object.entries(SIGNAL_DEFAULTS)) {
    dataMap[key] = { id: key, label: def.label, totalUses: 0, correct: 0, accuracy: null, multiplier: 1.0, regimes: {} };
  }

  const liveIds = [];
  snap.forEach(doc => {
    const d     = doc.data();
    const total = d.totalUses || 0;
    const corr  = d.correct   || 0;
    const acc   = total > 0 ? +(corr / total * 100).toFixed(1) : null;
    dataMap[doc.id] = {
      id:         doc.id,
      label:      d.label || doc.id,
      totalUses:  total,
      correct:    corr,
      accuracy:   acc,
      multiplier: getMultiplier(acc || 50, total),
      regimes:    {},
    };
    liveIds.push(doc.id);
  });

  // Fetch all regime subcollections in parallel
  if (liveIds.length > 0) {
    const regimeSnaps = await Promise.all(
      liveIds.map(id => db.collection('signalPerformance').doc(id).collection('regimes').get())
    );
    liveIds.forEach((id, i) => {
      regimeSnaps[i].forEach(rdoc => {
        const rd = rdoc.data();
        const rt = rd.totalUses || 0;
        const rc = rd.correct   || 0;
        dataMap[id].regimes[rdoc.id] = {
          totalUses: rt,
          correct:   rc,
          accuracy:  rt > 0 ? +(rc / rt * 100).toFixed(1) : null,
        };
      });
    });
  }

  return Object.values(dataMap).sort((a, b) => {
    if (a.totalUses === 0 && b.totalUses === 0) return 0;
    if (a.totalUses === 0) return 1;
    if (b.totalUses === 0) return -1;
    return (b.accuracy || 0) - (a.accuracy || 0);
  });
}

// ── Calc confidence adjustment from active signal weights ──
// Returns a point adjustment (e.g. +5 if signals are overperforming)
function calcSignalConfAdj(signalsUsed, weights) {
  if (!signalsUsed || !signalsUsed.length) return 0;
  let sum = 0, count = 0;
  for (const sig of signalsUsed) {
    const w = weights[sig.name];
    if (w && w.totalUses >= MIN_USES) {
      sum += w.multiplier;
      count++;
    }
  }
  if (count === 0) return 0;
  const avgMult = sum / count;
  // multiplier 1.25 → +5, 1.10 → +2, 1.0 → 0, 0.90 → -2, 0.75 → -5
  return Math.round((avgMult - 1.0) * 20);
}

module.exports = { SIGNAL_DEFAULTS, getMultiplier, loadSignalWeights, loadSignalPerformanceFull, updateSignalPerformance, calcSignalConfAdj };
