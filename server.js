const express = require('express');
const path    = require('path');
const cron    = require('node-cron');
const admin   = require('firebase-admin');
const { runSentimentAnalysis, storeSentiment }          = require('./sentiment');
const { fetchEdgarData, fetchAllEdgarData }             = require('./edgar');
const { buildMasterIntelligence, calcMarketHealth, healthLabel } = require('./masterIntelligence');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Firebase Admin init — only if env vars present ──
let pipelineReady = false;
let runPipeline, verifyPredictions, SYMBOLS;

if (process.env.FIREBASE_PRIVATE_KEY && process.env.ALPACA_KEY) {
  try {
    const serviceAccount = {
      type:          'service_account',
      project_id:    'vestex-21694',
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key:   (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      client_email:  process.env.FIREBASE_CLIENT_EMAIL,
      client_id:     process.env.FIREBASE_CLIENT_ID,
      auth_uri:      'https://accounts.google.com/o/oauth2/auth',
      token_uri:     'https://oauth2.googleapis.com/token',
    };
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    ({ runPipeline, verifyPredictions, SYMBOLS } = require('./pipeline'));
    pipelineReady = true;
    console.log('[SERVER] Firebase + pipeline initialized');
  } catch (e) {
    console.warn('[SERVER] Firebase init failed:', e.message);
  }
} else {
  console.warn('[SERVER] No Firebase/Alpaca env vars — pipeline disabled. App still runs.');
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const notReady = (res) => res.json({ ok: false, error: 'Pipeline not configured yet — add env vars in Railway.' });

// ── API: Get latest predictions ──
app.get('/api/predictions', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const snap = await admin.firestore().collection('latest_predictions').get();
    const results = {};
    snap.forEach(doc => { results[doc.id] = doc.data(); });
    res.json({ ok: true, data: results });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Get latest quotes (Firestore — legacy) ──
app.get('/api/quotes', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const snap = await admin.firestore().collection('quotes').get();
    const out  = {};
    snap.forEach(doc => { out[doc.id] = doc.data(); });
    res.json({ ok: true, data: out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Live quotes — Alpaca snapshots (price + prevClose + chg + OHLCV) ──
// Uses /v2/stocks/snapshots which returns dailyBar, prevDailyBar, latestTrade in one call.
// 30-second in-memory cache so rapid page refreshes don't hammer Alpaca.
let _lqCache = {}, _lqCachedAt = 0;
const LQ_SYMBOLS = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN'];

app.get('/api/live-quotes', async (req, res) => {
  const key    = process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET;

  // Merge default symbols with any extra ones from ?syms= query param
  const extra = req.query.syms ? req.query.syms.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean) : [];
  const syms  = [...new Set([...LQ_SYMBOLS, ...extra])];

  // Invalidate cache if new symbols requested that aren't cached
  const hasNew = extra.some(s => !_lqCache[s]);
  const ageMs  = Date.now() - _lqCachedAt;

  // Serve cache if fresh (< 60s) and no new symbols requested
  if (!hasNew && ageMs < 60000 && Object.keys(_lqCache).length) {
    return res.json({ ok: true, data: _lqCache, source: 'cache', cacheAgeMs: ageMs, serverFetchedAt: new Date(_lqCachedAt).toISOString() });
  }

  if (!key) return res.json({ ok: false, error: 'No Alpaca credentials configured' });

  try {
    const axios = require('axios');
    const resp  = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
      params:  { symbols: syms.join(','), feed: 'iex' },
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      timeout: 10000,
    });

    const out = {};
    for (const sym of syms) {
      const snap     = resp.data[sym];
      if (!snap) continue;
      const trade    = snap.latestTrade;
      const quote    = snap.latestQuote;
      const daily    = snap.dailyBar;
      const prevDay  = snap.prevDailyBar;
      const price    = trade?.p ?? quote?.bp ?? null;
      const prevClose = prevDay?.c ?? null;
      const chgPct   = (price != null && prevClose) ? +((price - prevClose) / prevClose * 100).toFixed(2) : null;
      const serverFetchedAt = new Date().toISOString();
      out[sym] = {
        price,
        previousClose: prevClose,
        changePercent: chgPct,
        open:      daily?.o   ?? null,
        high:      daily?.h   ?? null,
        low:       daily?.l   ?? null,
        volume:    daily?.v   ?? null,
        timestamp: trade?.t   ?? quote?.t ?? null,
        serverFetchedAt,
        source:    'alpaca_live',
      };
    }

    _lqCache     = out;
    _lqCachedAt  = Date.now();
    res.json({ ok: true, data: out, source: 'alpaca_live', cacheAgeMs: 0, serverFetchedAt: new Date(_lqCachedAt).toISOString() });

  } catch(e) {
    // Firestore fallback — at least return stale price if pipeline has run
    // In-memory stale cache fallback (Alpaca failed but we have old data)
    if (Object.keys(_lqCache).length) {
      const staleAgeMs = Date.now() - _lqCachedAt;
      return res.json({ ok: true, data: _lqCache, source: 'stale_cache', cacheAgeMs: staleAgeMs, serverFetchedAt: new Date(_lqCachedAt).toISOString(), alpacaError: e.message });
    }
    if (pipelineReady) {
      try {
        const snap = await admin.firestore().collection('quotes').get();
        const out  = {};
        snap.forEach(doc => {
          const d = doc.data();
          out[doc.id] = {
            price:         d.bid || d.ask || null,
            previousClose: null, changePercent: null,
            open: null, high: null, low: null, volume: null,
            timestamp:     d.time || d.updatedAt || null,
            source:        'firestore_stale',
          };
        });
        if (Object.keys(out).length) return res.json({ ok: true, data: out, source: 'firestore_fallback', cacheAgeMs: null });
      } catch(fe) {}
    }
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Get price history for a symbol ──
app.get('/api/history/:symbol', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const sym  = req.params.symbol.toUpperCase();
    const snap = await admin.firestore().collection('market_data')
      .where('symbol', '==', sym).orderBy('time', 'asc').limit(90).get();
    const bars = [];
    snap.forEach(doc => bars.push(doc.data()));
    res.json({ ok: true, data: bars });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Chart data — Firestore first, Alpaca fallback ──
// Returns up to 90 daily OHLCV bars for the frontend chart.
app.get('/api/chart/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();

  // Try Firestore first (populated by nightly pipeline run)
  if (pipelineReady) {
    try {
      const snap = await admin.firestore().collection('market_data')
        .where('symbol', '==', sym).orderBy('time', 'asc').limit(90).get();
      const bars = [];
      snap.forEach(doc => bars.push(doc.data()));
      if (bars.length >= 5) {
        return res.json({ ok: true, data: bars, source: 'firestore' });
      }
    } catch(e) { /* fall through to live fetch */ }
  }

  // Alpaca live fetch (works even before first pipeline run)
  const key    = process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET;
  if (!key) return res.json({ ok: false, error: 'No Alpaca credentials configured' });

  try {
    const axios  = require('axios');
    const endDt  = new Date().toISOString();
    const startDt = new Date();
    startDt.setDate(startDt.getDate() - 95);
    const resp = await axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`, {
      params: { timeframe: '1Day', start: startDt.toISOString(), end: endDt, limit: 90, feed: 'iex' },
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      timeout: 12000,
    });
    const bars = (resp.data.bars || []).map(b => ({
      symbol: sym, time: b.t,
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
    res.json({ ok: true, data: bars, source: 'alpaca_live' });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Get prediction accuracy stats ──
// Single-field query only — no composite index required.
// All filtering/sorting/grouping done in memory.
app.get('/api/accuracy', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    // Fetch recent predictions ordered by generatedAt only (no composite index needed)
    const snap = await admin.firestore().collection('predictions')
      .orderBy('generatedAt', 'desc').limit(500).get();

    const all = [];
    snap.forEach(doc => all.push(doc.data()));

    // Split verified vs pending in memory
    const verified = all.filter(p => p.wasCorrect !== null && p.wasCorrect !== undefined);
    const pending  = all.filter(p => p.wasCorrect === null || p.wasCorrect === undefined);

    if (!verified.length) {
      return res.json({
        ok: true,
        totalVerified: 0,
        pending: pending.length,
        message: 'No verified predictions yet. Accuracy will populate after the first verification cycle.',
      });
    }

    const correct   = verified.filter(p => p.wasCorrect === true).length;
    const incorrect = verified.filter(p => p.wasCorrect === false).length;
    const accuracyPct = +(correct / verified.length * 100).toFixed(1);

    // By symbol
    const bySymbol = {};
    for (const p of verified) {
      if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { total: 0, correct: 0 };
      bySymbol[p.symbol].total++;
      if (p.wasCorrect) bySymbol[p.symbol].correct++;
    }
    Object.keys(bySymbol).forEach(sym => {
      bySymbol[sym].accuracy = +(bySymbol[sym].correct / bySymbol[sym].total * 100).toFixed(1);
    });

    // By direction
    const byDecision = {};
    for (const p of verified) {
      const dir = p.direction || 'UNKNOWN';
      if (!byDecision[dir]) byDecision[dir] = { total: 0, correct: 0 };
      byDecision[dir].total++;
      if (p.wasCorrect) byDecision[dir].correct++;
    }
    Object.keys(byDecision).forEach(d => {
      byDecision[d].accuracy = +(byDecision[d].correct / byDecision[d].total * 100).toFixed(1);
    });

    // By confidence bucket (0-49, 50-59, 60-69, 70-79, 80+)
    const byConfidenceBucket = {};
    for (const p of verified) {
      const c = p.confidence || 0;
      const bucket = c >= 80 ? '80+' : c >= 70 ? '70-79' : c >= 60 ? '60-69' : c >= 50 ? '50-59' : '0-49';
      if (!byConfidenceBucket[bucket]) byConfidenceBucket[bucket] = { total: 0, correct: 0 };
      byConfidenceBucket[bucket].total++;
      if (p.wasCorrect) byConfidenceBucket[bucket].correct++;
    }
    Object.keys(byConfidenceBucket).forEach(b => {
      byConfidenceBucket[b].accuracy = +(byConfidenceBucket[b].correct / byConfidenceBucket[b].total * 100).toFixed(1);
    });

    // By master score bucket (if available)
    const byMasterScoreBucket = {};
    for (const p of verified) {
      const ms = p.masterScore ?? null;
      if (ms === null) continue;
      const bucket = ms >= 70 ? '70-100' : ms >= 55 ? '55-69' : ms >= 40 ? '40-54' : '0-39';
      if (!byMasterScoreBucket[bucket]) byMasterScoreBucket[bucket] = { total: 0, correct: 0 };
      byMasterScoreBucket[bucket].total++;
      if (p.wasCorrect) byMasterScoreBucket[bucket].correct++;
    }
    Object.keys(byMasterScoreBucket).forEach(b => {
      byMasterScoreBucket[b].accuracy = +(byMasterScoreBucket[b].correct / byMasterScoreBucket[b].total * 100).toFixed(1);
    });

    // Recent results — last 20 verified, sorted newest first
    const recentResults = verified
      .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0))
      .slice(0, 20)
      .map(p => ({
        symbol:     p.symbol,
        direction:  p.direction,
        confidence: p.confidence,
        wasCorrect: p.wasCorrect,
        actualPct:  p.actualPct ?? null,
        generatedAt: p.generatedAt,
        checkedAt:   p.checkedAt,
      }));

    res.json({
      ok: true,
      totalVerified: verified.length,
      correct,
      incorrect,
      accuracyPercent: accuracyPct,
      pending: pending.length,
      bySymbol,
      byDecision,
      byConfidenceBucket,
      byMasterScoreBucket,
      recentResults,
    });

  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── In-memory sentiment cache (no Firebase needed) ──
let sentimentCache = {};
let sentimentLastRun = null;

async function refreshSentimentCache() {
  if (!process.env.CLAUDE_API_KEY) return;
  try {
    const results = await runSentimentAnalysis();
    sentimentCache  = results;
    sentimentLastRun = new Date().toISOString();
    console.log('[SENTIMENT] Cache refreshed —', Object.keys(results).length, 'symbols');
    // Also persist to Firestore if pipeline is ready
    if (pipelineReady) storeSentiment(admin, results).catch(console.error);
  } catch(e) {
    console.error('[SENTIMENT] Refresh failed:', e.message);
  }
}

// ── API: Get sentiment — memory first, Firestore fallback ──
app.get('/api/sentiment', async (req, res) => {
  // Return memory cache if available
  if (Object.keys(sentimentCache).length) {
    return res.json({ ok: true, data: sentimentCache, source: 'cache' });
  }
  // Firestore fallback if pipeline ready
  if (pipelineReady) {
    try {
      const snap = await admin.firestore().collection('sentiment').get();
      const out  = {};
      snap.forEach(doc => { out[doc.id] = doc.data(); });
      if (Object.keys(out).length) return res.json({ ok: true, data: out, source: 'firestore' });
    } catch(e) {}
  }
  res.json({ ok: false, error: 'Sentiment not yet loaded' });
});

// ── API: Refresh sentiment now ──
app.post('/api/sentiment/refresh', async (req, res) => {
  if (!process.env.CLAUDE_API_KEY) return res.json({ ok: false, error: 'CLAUDE_API_KEY not set' });
  if (req.headers['x-pipeline-secret'] !== process.env.PIPELINE_SECRET)
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  res.json({ ok: true, message: 'Sentiment refresh started' });
  refreshSentimentCache();
});

// ── API: Manual pipeline trigger ──
app.post('/api/pipeline/run', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  if (req.headers['x-pipeline-secret'] !== process.env.PIPELINE_SECRET)
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  res.json({ ok: true, message: 'Pipeline started' });
  runPipeline().catch(console.error);
});

// ── API: FRED proxy — hides API key server-side ──
app.get('/api/fred/:series', async (req, res) => {
  const key = process.env.FRED_API_KEY;
  if (!key) return res.json({ ok: false, error: 'FRED_API_KEY not configured' });
  try {
    const axios = require('axios');
    const resp  = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: { series_id: req.params.series.toUpperCase(), sort_order: 'desc', limit: 3, file_type: 'json', api_key: key },
      timeout: 8000
    });
    const obs    = (resp.data.observations || []);
    const latest = obs.find(o => o.value !== '.' && o.value !== '');
    res.json({ ok: true, value: latest ? parseFloat(latest.value) : null, date: latest ? latest.date : null });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: SEC EDGAR — single symbol ──
app.get('/api/edgar/:symbol', async (req, res) => {
  try {
    const sym  = req.params.symbol.toUpperCase();
    const data = await fetchEdgarData(sym);
    res.json({ ok: true, data });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API: SEC EDGAR — all symbols ──
app.get('/api/edgar', async (req, res) => {
  try {
    const data = await fetchAllEdgarData();
    res.json({ ok: true, data });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Signal Performance Leaderboard (with per-regime breakdown) ──
app.get('/api/signal-performance', async (req, res) => {
  try {
    const { SIGNAL_DEFAULTS, loadSignalPerformanceFull } = require('./signalPerformance');
    if (!pipelineReady) {
      // Return seeded defaults with empty regimes when pipeline not ready
      const signals = Object.entries(SIGNAL_DEFAULTS).map(([id, def]) => ({
        id, label: def.label, totalUses: 0, correct: 0, accuracy: null, multiplier: 1.0, regimes: {},
      }));
      return res.json({ ok: true, signals });
    }
    const signals = await loadSignalPerformanceFull(admin.firestore());
    res.json({ ok: true, signals });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Brain Vault Diagnostics ──
app.get('/api/brain-diagnostics', async (req, res) => {
  try {
    const { runBrainAnalysis } = require('./brain');
    // Run with empty indicators + no extraContext to get static diagnostics
    const result = await runBrainAnalysis({
      rsi: null, macd: null, sma7: null, sma21: null,
      volSpike: false, streak: 0, atrPct: null, score: 0,
    });
    const bv = result.brainVault;
    res.json({
      ok: true,
      activePercent:     bv.diagnostics.activePercent,
      evaluatedPatterns: bv.diagnostics.evaluatedPatterns,
      matchedPatterns:   bv.diagnostics.matchedPatterns,
      loadedPatterns:    bv.diagnostics.loadedPatterns,
      categoryBreakdown: bv.diagnostics.categoryBreakdown,
      scoreBreakdown:    bv.scoreBreakdown,
      regime:            result.regime,
      runAt:             bv.diagnostics.runAt,
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Fear & Greed Index (alternative.me — no key) ──
app.get('/api/feargreed', async (req, res) => {
  try {
    const axios = require('axios');
    const resp  = await axios.get('https://api.alternative.me/fng/?limit=7', { timeout: 8000 });
    const data  = resp.data.data || [];
    const latest = data[0];
    res.json({
      ok: true,
      value:      latest ? parseInt(latest.value) : null,
      label:      latest ? latest.value_classification : null,
      history:    data.map(d => ({ value: parseInt(d.value), label: d.value_classification, timestamp: d.timestamp })),
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── API: VIX Volatility Index (CBOE CSV — no key) ──
app.get('/api/vix', async (req, res) => {
  try {
    const axios = require('axios');
    const resp  = await axios.get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { timeout: 10000 });
    const lines = resp.data.trim().split('\n');
    // Last line = most recent trading day
    const last  = lines[lines.length - 1].split(',');
    const prev  = lines[lines.length - 2].split(',');
    const value = parseFloat(last[4]); // Close
    const prevVal = parseFloat(prev[4]);
    const chg   = +((value - prevVal) / prevVal * 100).toFixed(2);
    const date  = last[0];
    // VIX signal: <15 calm, 15-25 normal, 25-35 elevated, >35 extreme fear
    const signal = value < 15 ? 'calm' : value < 25 ? 'normal' : value < 35 ? 'elevated' : 'extreme';
    res.json({ ok: true, value: +value.toFixed(2), chg, date, signal });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  MASTER INTELLIGENCE ENGINE
// ═══════════════════════════════════════════════════════════

// ── Inline indicator computation (mirrors pipeline.js logic) ──
function _ema(c, p) {
  if (c.length < p) return null;
  const k = 2 / (p + 1);
  let e = c.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < c.length; i++) e = c[i] * k + e * (1 - k);
  return +e.toFixed(4);
}
function _computeIndicators(bars) {
  if (!bars || bars.length < 5) return null;
  const cl = bars.map(b => b.close), vo = bars.map(b => b.volume);
  const sma7  = cl.length>=7  ? cl.slice(-7).reduce((a,b)=>a+b,0)/7   : null;
  const sma21 = cl.length>=21 ? cl.slice(-21).reduce((a,b)=>a+b,0)/21 : null;
  const e12   = _ema(cl,12), e26 = _ema(cl,26);
  const macd  = e12&&e26 ? +(e12-e26).toFixed(4) : null;
  let rsi=null;
  if (cl.length>=15) {
    let g=0,l=0;
    for (let i=cl.length-14;i<cl.length;i++){const d=cl[i]-cl[i-1];if(d>0)g+=d;else l-=d;}
    const ag=g/14,al=l/14; rsi=al===0?100:+(100-100/(1+ag/al)).toFixed(2);
  }
  let atr=null;
  if (bars.length>=15){
    let sum=0; const r=bars.slice(-15);
    for(let i=1;i<r.length;i++) sum+=Math.max(r[i].high-r[i].low,Math.abs(r[i].high-r[i-1].close),Math.abs(r[i].low-r[i-1].close));
    atr=+(sum/14).toFixed(4);
  }
  const price=cl[cl.length-1], atrPct=atr&&price?+(atr/price*100).toFixed(2):null;
  const volSpike=vo.length>=10?vo[vo.length-1]>vo.slice(-10,-1).reduce((a,b)=>a+b,0)/9*1.5:false;
  let streak=0;
  if(cl.length>=2){const dir=cl[cl.length-1]>=cl[cl.length-2]?1:-1;streak=1;for(let i=cl.length-2;i>0;i--){if((cl[i]>=cl[i-1]?1:-1)===dir)streak++;else break;}streak*=dir;}
  return {sma7:sma7?+sma7.toFixed(2):null,sma21:sma21?+sma21.toFixed(2):null,rsi,macd,volSpike,atr,atrPct,streak,score:0};
}

// ── Caches: Master intelligence (5min), Fear&Greed/VIX (10min) ──
const _miCache = {}, _miFetchedAt = {};
let _fgCache = null, _fgAt = 0;
let _vixCache = null, _vixAt = 0;
const MI_TTL = 300000, FG_TTL = 600000;

async function _getFearGreed() {
  if (_fgCache && Date.now() - _fgAt < FG_TTL) return _fgCache;
  try {
    const axios = require('axios');
    const r = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 });
    const d = r.data.data?.[0];
    _fgCache = d ? { value: parseInt(d.value), label: d.value_classification } : null;
    _fgAt = Date.now();
    return _fgCache;
  } catch(e) { return _fgCache; }
}

async function _getVix() {
  if (_vixCache && Date.now() - _vixAt < FG_TTL) return _vixCache;
  try {
    const axios = require('axios');
    const r = await axios.get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { timeout: 10000 });
    const lines = r.data.trim().split('\n');
    const last  = lines[lines.length-1].split(',');
    _vixCache = { value: +parseFloat(last[4]).toFixed(2), signal: parseFloat(last[4])<15?'calm':parseFloat(last[4])<25?'normal':parseFloat(last[4])<35?'elevated':'extreme' };
    _vixAt = Date.now();
    return _vixCache;
  } catch(e) { return _vixCache; }
}

// ── API: Master Intelligence — single symbol ──
app.get('/api/master-intelligence/:symbol', async (req, res) => {
  const sym  = req.params.symbol.toUpperCase();
  const key  = process.env.ALPACA_KEY;
  const sec  = process.env.ALPACA_SECRET;
  const now  = Date.now();

  // Serve cache if fresh
  if (_miCache[sym] && now - (_miFetchedAt[sym]||0) < MI_TTL)
    return res.json({ ok: true, data: _miCache[sym], source: 'cache' });

  if (!key) return res.json({ ok: false, error: 'No Alpaca credentials configured' });

  try {
    const axios = require('axios');

    // 1. Fetch 40 days of bars → compute indicators
    const end = new Date(), start = new Date();
    start.setDate(start.getDate() - 45);
    const barsResp = await axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
      params:  { timeframe:'1Day', start:start.toISOString().split('T')[0], end:end.toISOString().split('T')[0], limit:40, feed:'iex' },
      timeout: 12000,
    });
    const bars = (barsResp.data.bars||[]).map(b=>({close:b.c,high:b.h,low:b.l,open:b.o,volume:b.v}));
    const indicators = _computeIndicators(bars);

    // 2. Brain analysis
    let brainResult = null;
    try {
      const { runBrainAnalysis } = require('./brain');
      brainResult = await runBrainAnalysis(indicators || {rsi:null,macd:null,sma7:null,sma21:null,volSpike:false,streak:0,atrPct:null,score:0});
    } catch(e) { console.warn('[MI] Brain failed:', e.message); }

    // 3. Signal performance
    let signals = [];
    try {
      const { SIGNAL_DEFAULTS, loadSignalPerformanceFull } = require('./signalPerformance');
      if (pipelineReady) { signals = await loadSignalPerformanceFull(admin.firestore()); }
      else { signals = Object.entries(SIGNAL_DEFAULTS).map(([id,def])=>({id,label:def.label,totalUses:0,correct:0,accuracy:null,multiplier:1.0})); }
    } catch(e) {}

    // 4. Sentiment (in-memory cache first)
    const sentiment = sentimentCache[sym] || null;

    // 5. EDGAR
    let edgar = null;
    try { edgar = await fetchEdgarData(sym); } catch(e) {}

    // 6. Macro snapshot — try Firestore latest prediction, else null
    let macroSnapshot = null;
    if (pipelineReady) {
      try {
        const snap = await admin.firestore().collection('latest_predictions').doc(sym).get();
        if (snap.exists) macroSnapshot = snap.data()?.macroSnapshot || null;
      } catch(e) {}
    }

    // 7. Fear & Greed + VIX (shared caches)
    const [fearGreed, vix] = await Promise.all([_getFearGreed(), _getVix()]);

    // 8. Build master score
    const result = buildMasterIntelligence(sym, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix);

    // 9. Store to Firestore for history tracking
    if (pipelineReady) {
      try {
        const db = admin.firestore();
        await db.collection('master_intelligence').doc(sym).set(result);
        await db.collection('master_intelligence_history').add({ ...result, sym });
      } catch(e) { /* non-critical */ }
    }

    _miCache[sym]     = result;
    _miFetchedAt[sym] = now;
    res.json({ ok: true, data: result, source: 'live' });

  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Market Health — all systems combined ──
app.get('/api/market-health', async (req, res) => {
  try {
    const [fearGreed, vix] = await Promise.all([_getFearGreed(), _getVix()]);
    let macro = null;
    if (pipelineReady) {
      try {
        const snap = await admin.firestore().collection('latest_predictions').limit(1).get();
        if (!snap.empty) macro = snap.docs[0].data()?.macroSnapshot || null;
      } catch(e) {}
    }
    const score = calcMarketHealth(macro, fearGreed, vix, Object.keys(sentimentCache).length ? Object.values(sentimentCache)[0] : null);
    res.json({ ok: true, score, label: healthLabel(score), fearGreed, vix });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  LIVE PATTERN PREDICTION
//  Full formula: LPMS × historicalWinRate × returnQuality ×
//  regimeCompatibility × dataConfidence → Consensus Score
// ═══════════════════════════════════════════════════════════

// Per-symbol cache — 5min TTL (same as master intelligence)
const _lpCache = {}, _lpFetchedAt = {};
const LP_TTL   = 300000;

app.get('/api/live-prediction/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const key = process.env.ALPACA_KEY;
  const sec = process.env.ALPACA_SECRET;
  const now = Date.now();

  // Serve cache if fresh
  if (_lpCache[sym] && now - (_lpFetchedAt[sym] || 0) < LP_TTL) {
    return res.json({ ok: true, data: _lpCache[sym], source: 'cache' });
  }

  if (!key) return res.json({ ok: false, error: 'No Alpaca credentials configured' });

  try {
    const axios = require('axios');

    // 1. Fetch up to 1 year of bars for chart structure analysis
    const endDt   = new Date();
    const startDt = new Date();
    startDt.setFullYear(startDt.getFullYear() - 1);

    const barsResp = await axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
      params:  { timeframe: '1Day', start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0], limit: 252, feed: 'iex' },
      timeout: 15000,
    });
    const bars = (barsResp.data.bars || []).map(b => ({
      close: b.c, high: b.h, low: b.l, open: b.o, volume: b.v, time: b.t,
    }));
    const indicators = _computeIndicators(bars);

    // 2. Brain analysis (with macro + sentiment context)
    let brainResult = null;
    try {
      const { runBrainAnalysis } = require('./brain');
      brainResult = await runBrainAnalysis(
        indicators || { rsi: null, macd: null, sma7: null, sma21: null, volSpike: false, streak: 0, atrPct: null, score: 0 },
        { symbol: sym, macroSnapshot: null, sentiment: sentimentCache[sym] || null, edgar: null }
      );
    } catch(e) { console.warn('[LP] Brain failed:', e.message); }

    // 3. Signal performance
    let signals = [];
    try {
      const { SIGNAL_DEFAULTS, loadSignalPerformanceFull } = require('./signalPerformance');
      signals = pipelineReady
        ? await loadSignalPerformanceFull(admin.firestore())
        : Object.entries(SIGNAL_DEFAULTS).map(([id, def]) => ({ id, label: def.label, totalUses: 0, correct: 0, accuracy: null }));
    } catch(e) {}

    // 4. Sentiment (memory cache)
    const sentiment = sentimentCache[sym] || null;

    // 5. EDGAR
    let edgar = null;
    try { edgar = await fetchEdgarData(sym); } catch(e) {}

    // 6. Macro snapshot (from Firestore latest prediction)
    let macroSnapshot = null;
    if (pipelineReady) {
      try {
        const snap = await admin.firestore().collection('latest_predictions').doc(sym).get();
        if (snap.exists) macroSnapshot = snap.data()?.macroSnapshot || null;
      } catch(e) {}
    }

    // 7. Fear & Greed + VIX (shared cache)
    const [fearGreed, vix] = await Promise.all([_getFearGreed(), _getVix()]);

    // 8. Master intelligence scores (pass as hints for more accurate consensus)
    const miResult = buildMasterIntelligence(sym, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix);

    // 9. Build live prediction
    const { buildLivePrediction } = require('./livePatternMatcher');
    const result = buildLivePrediction(
      sym, bars, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix,
      miResult?.scoreBreakdown || null
    );

    // Attach master intelligence score for UI context
    result.masterIntelligence = {
      masterScore:  miResult.masterScore,
      decision:     miResult.decision,
      marketHealth: miResult.marketHealth,
      scoreBreakdown: miResult.scoreBreakdown,
    };

    _lpCache[sym]     = result;
    _lpFetchedAt[sym] = now;

    res.json({ ok: true, data: result, source: 'live' });

  } catch(e) {
    console.error('[LP] Error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── Serve frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ═══════════════════════════════════════════════════════════
//  CRON JOBS
//  Market hours: Mon–Fri 9:30am–4pm ET
// ═══════════════════════════════════════════════════════════

// Only schedule cron if pipeline is ready
if (pipelineReady) {
  // Daily data + predictions — 5pm ET after market close
  cron.schedule('0 21 * * 1-5', () => {
    console.log('[CRON] Daily pipeline triggered');
    runPipeline().catch(console.error);
  }, { timezone: 'America/New_York' });

  // Weekly prediction verification — Monday 6pm ET
  cron.schedule('0 18 * * 1', () => {
    console.log('[CRON] Weekly prediction verification triggered');
    verifyPredictions().catch(console.error);
  }, { timezone: 'America/New_York' });

  // Sentiment analysis — every morning 8am ET before market open
  if (process.env.CLAUDE_API_KEY) {
    cron.schedule('0 8 * * 1-5', () => {
      console.log('[CRON] Morning sentiment analysis triggered');
      refreshSentimentCache();
    }, { timezone: 'America/New_York' });
    console.log('[SERVER] Sentiment cron scheduled: 8am ET Mon–Fri');
  }
}

// ── Start server ──
app.listen(PORT, () => {
  console.log(`VESTEX server running on port ${PORT}`);
  console.log(`Pipeline scheduled: daily 5pm ET (Mon–Fri)`);
  // Run sentiment immediately on boot if Claude key is present
  if (process.env.CLAUDE_API_KEY) {
    console.log('[SERVER] Claude API key detected — running initial sentiment analysis...');
    setTimeout(() => refreshSentimentCache(), 3000);
  }
});
