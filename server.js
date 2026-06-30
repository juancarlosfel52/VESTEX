const express   = require('express');
const path      = require('path');
const cron      = require('node-cron');
const admin     = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const { runSentimentAnalysis, storeSentiment }          = require('./sentiment');
const { fetchEdgarData, fetchAllEdgarData }             = require('./edgar');
const { buildMasterIntelligence, calcMarketHealth, healthLabel } = require('./masterIntelligence');
const { analyzeCatalysts, storeCatalystEvents }         = require('./catalystEngine');
const { refreshRegistry, getRegistrySnapshot }          = require('./winRateRegistry');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Rate limiters — protect data endpoints from scrapers/bots ──
// All limits are generous enough that no real user will ever hit them.
// Cron jobs and internal function calls are unaffected (they never go through HTTP).

const _rl = (max, windowMin = 1) => rateLimit({
  windowMs:        windowMin * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { ok: false, error: 'Too many requests — slow down.' },
});

// Quotes + charts: refreshed on symbol change / period change (real usage ~2–5/min)
const rlQuotes  = _rl(20);   // /api/live-quotes
const rlChart   = _rl(20);   // /api/chart/:symbol, /api/history/:symbol
// Intelligence endpoints: user clicks through symbols (real usage ~3–5/min)
const rlMI      = _rl(15);   // /api/master-intelligence/:symbol
const rlLP      = _rl(15);   // /api/live-prediction/:symbol
// Diagnostic/audit: only opened from Model Progress tab
const rlAudit   = _rl(5);    // /api/brain-integrity, /api/brain-diagnostics
// VI write: one write per symbol per day from the browser
const rlVI      = _rl(10);   // /api/vi/log

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
    // Phase 2A: seed win rate registry from existing vi_pattern_fires on startup
    refreshRegistry(admin.firestore()).catch(e => console.warn('[WinRateRegistry] Startup seed failed:', e.message));
  } catch (e) {
    console.warn('[SERVER] Firebase init failed:', e.message);
  }
} else {
  console.warn('[SERVER] No Firebase/Alpaca env vars — pipeline disabled. App still runs.');
}

app.set('trust proxy', 1); // Railway sits behind a proxy — required for rate limiter to read real IP
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
const LQ_SYMBOLS = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'SPY'];

app.get('/api/live-quotes', rlQuotes, async (req, res) => {
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
app.get('/api/history/:symbol', rlChart, async (req, res) => {
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
app.get('/api/chart/:symbol', rlChart, async (req, res) => {
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
// Reads from vi_predictions (source of truth for all VI tracking).
// All filtering/sorting/grouping done in memory.
app.get('/api/accuracy', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    // Fetch from vi_predictions — the single source of truth
    const snap = await admin.firestore().collection(VI_COL)
      .orderBy('timestamp', 'desc').limit(500).get();

    const all = [];
    snap.forEach(doc => all.push(doc.data()));

    // Normalize: vi_predictions uses verification7d/verification30d objects
    // A prediction is "verified" if verification7d is filled in
    // A prediction is "correct" if verification7d.correct === true
    const normalize = p => ({
      symbol:     p.symbol,
      direction:  p.decision,     // vi_predictions uses 'decision' not 'direction'
      confidence: p.confidence,
      masterScore: p.masterScore,
      wasCorrect: p.verification7d !== null && p.verification7d !== undefined
                    ? (p.verification7d.correct === true)
                    : null,
      actualPct:  p.verification7d?.returnPct ?? null,
      generatedAt: p.date || new Date(p.timestamp).toISOString(),
      checkedAt:  p.verification7d?.checkedAt ?? null,
    });

    const normalized = all.map(normalize);
    const verified   = normalized.filter(p => p.wasCorrect !== null);
    const pending    = normalized.filter(p => p.wasCorrect === null);

    if (!verified.length) {
      // Compute first expected verification date from earliest pending prediction
      let firstExpected = null;
      const oldest = all.reduce((m, p) => (!m || p.timestamp < m.timestamp ? p : m), null);
      if (oldest?.timestamp) {
        const exp = new Date(oldest.timestamp + 7 * 24 * 3600 * 1000);
        firstExpected = exp.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
      return res.json({
        ok: true,
        total: all.length,
        totalVerified: 0,
        pending: pending.length,
        firstExpected,
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

    // Recent results — last 20 (mix of verified + pending), sorted newest first
    const recent = [...normalized]
      .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0))
      .slice(0, 20);

    res.json({
      ok: true,
      total:         all.length,          // total logged (verified + pending)
      totalVerified: verified.length,
      correct,
      incorrect,
      pending:       pending.length,
      accuracy:      accuracyPct,         // client reads data.accuracy
      accuracyPercent: accuracyPct,       // keep for any other callers
      recent,                             // client reads data.recent
      bySymbol,
      byDecision,
      byConfidenceBucket,
      byMasterScoreBucket,
    });

  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── In-memory sentiment cache (no Firebase needed) ──
let sentimentCache = {};
let sentimentLastRun = null;

// ── In-memory catalyst cache (per symbol) ──
const _catalystCache     = {};   // sym → { events, modifier }
const _catalystFetchedAt = {};
const CATALYST_TTL = 3600000;    // 1 hour

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

// ── API: Get sentiment — memory first, Firestore fallback, auto-refresh if empty ──
let _sentRefreshing = false;
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
      if (Object.keys(out).length) {
        sentimentCache = out; // warm memory cache from Firestore
        return res.json({ ok: true, data: out, source: 'firestore' });
      }
    } catch(e) {}
  }
  // Cache empty — trigger background refresh so next request gets real data
  if (process.env.CLAUDE_API_KEY && !_sentRefreshing) {
    _sentRefreshing = true;
    refreshSentimentCache().finally(() => { _sentRefreshing = false; });
    console.log('[SENTIMENT] Cache empty on request — triggered background refresh');
  }
  res.json({ ok: false, error: 'Sentiment loading — check back in 60 seconds' });
});

// ── API: News headlines — always works, no Claude key needed ──
// Returns raw RSS headlines with basic keyword sentiment as fallback.
// If full liveSentiment is already cached, includes that too.
app.get('/api/news/headlines', async (req, res) => {
  const axios = require('axios');
  const SYMS  = ['AAPL','TSLA','GOOGL','MSFT','AMZN'];
  const NAMES = { AAPL:'Apple', TSLA:'Tesla', GOOGL:'Google', MSFT:'Microsoft', AMZN:'Amazon' };

  function decodeEntities(str) {
    return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
              .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
  }
  function parseItems(xml, skip) {
    // Extract <item> blocks then pull title + link from each
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
    const out = [];
    for (const item of items) {
      const cdataT = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s);
      const plainT = item.match(/<title>([^<]{10,})<\/title>/s);
      const rawTitle = cdataT ? cdataT[1].trim() : plainT ? plainT[1].trim() : '';
      const title = decodeEntities(rawTitle);
      if (!title || title.length < 15) continue;
      if (skip.some(p => title.toLowerCase().includes(p))) continue;
      // Try <link> then <guid> for URL
      const linkM = item.match(/<link>(https?:\/\/[^<]+)<\/link>/) ||
                    item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
      const url = linkM ? linkM[1].trim() : null;
      out.push({ title, url });
      if (out.length >= 6) break;
    }
    return out;
  }
  function keywordSentiment(title) {
    const t = title.toLowerCase();
    const pos = ['beat','record','surge','jump','rise','gain','profit','growth','strong','buy','upgrade','bullish','high','up','positive','exceed','launch','deal','partnership'];
    const neg = ['miss','fall','drop','crash','loss','decline','weak','sell','downgrade','bearish','low','cut','layoff','lawsuit','recall','fine','fraud','concern','risk','warning'];
    const ps  = pos.filter(w => t.includes(w)).length;
    const ns  = neg.filter(w => t.includes(w)).length;
    if (ps > ns) return 'positive';
    if (ns > ps) return 'negative';
    return 'neutral';
  }

  const results = {};
  await Promise.allSettled(SYMS.map(async sym => {
    // If full Claude analysis exists, use it
    if (sentimentCache[sym]) { results[sym] = sentimentCache[sym]; return; }

    const company = NAMES[sym];
    const encoded = encodeURIComponent(`${company} stock`);
    const sources = [
      { url: `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`, skip: ['google news','google llc'] },
      { url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`, skip: ['yahoo finance','yahoo!'] },
    ];
    const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,*/*' };
    let items = [];
    for (const src of sources) {
      try {
        const r = await axios.get(src.url, { timeout: 8000, headers: HEADERS });
        items   = parseItems(r.data, src.skip);
        if (items.length >= 2) break;
      } catch(e) {}
    }
    if (!items.length) items = [{ title: `No recent headlines for ${company}`, url: null }];

    const scored    = items.map(i => ({ text: i.title, url: i.url || null, sentiment: keywordSentiment(i.title), why: '' }));
    const posCount  = scored.filter(h => h.sentiment === 'positive').length;
    const negCount  = scored.filter(h => h.sentiment === 'negative').length;
    const overall   = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';
    const score     = Math.round(((posCount - negCount) / titles.length) * 60);
    results[sym] = {
      symbol: sym, company, overall, score,
      summary:   `${titles.length} recent headlines — ${posCount} positive, ${negCount} negative, ${titles.length-posCount-negCount} neutral.`,
      impact:    'Keyword-based analysis — enable Claude AI for deeper insight.',
      headlines: scored,
      fetchedAt: new Date().toISOString(),
      source:    'rss_keywords',
    };
  }));

  res.json({ ok: true, data: results, aiEnabled: !!process.env.CLAUDE_API_KEY });
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
app.get('/api/brain-diagnostics', rlAudit, async (req, res) => {
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
app.get('/api/master-intelligence/:symbol', rlMI, async (req, res) => {
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
    const _barParams  = { timeframe:'1Day', start:start.toISOString().split('T')[0], end:end.toISOString().split('T')[0], limit:40, feed:'iex' };
    const _barHeaders = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec };

    // Phase 1+3: fetch symbol bars and SPY bars in parallel for Pattern_117 (Relative Strength)
    const [barsResp, spyBarsResp] = await Promise.all([
      axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`,   { headers: _barHeaders, params: _barParams, timeout: 12000 }),
      sym !== 'SPY'
        ? axios.get('https://data.alpaca.markets/v2/stocks/SPY/bars', { headers: _barHeaders, params: _barParams, timeout: 12000 }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const bars    = (barsResp.data.bars||[]).map(b=>({close:b.c,high:b.h,low:b.l,open:b.o,volume:b.v}));
    const spyBars = spyBarsResp ? (spyBarsResp.data?.bars||[]).map(b=>({close:b.c})) : [];
    const spyData = spyBars.length >= 10
      ? { return10d: +((spyBars[spyBars.length-1].close - spyBars[spyBars.length-10].close) / spyBars[spyBars.length-10].close * 100).toFixed(2) }
      : null;
    const indicators = _computeIndicators(bars);

    // 2. EDGAR — fetched first so earningsSurprise is available to brain analysis
    let edgar = null;
    try { edgar = await fetchEdgarData(sym); } catch(e) {}

    // 3. Brain analysis — receives edgar so PEAD and earnings-surprise patterns can fire
    let brainResult = null;
    try {
      const { runBrainAnalysis } = require('./brain');
      brainResult = await runBrainAnalysis(indicators || {rsi:null,macd:null,sma7:null,sma21:null,volSpike:false,streak:0,atrPct:null,score:0}, { edgar });
    } catch(e) { console.warn('[MI] Brain failed:', e.message); }

    // 4. Signal performance
    let signals = [];
    try {
      const { SIGNAL_DEFAULTS, loadSignalPerformanceFull } = require('./signalPerformance');
      if (pipelineReady) { signals = await loadSignalPerformanceFull(admin.firestore()); }
      else { signals = Object.entries(SIGNAL_DEFAULTS).map(([id,def])=>({id,label:def.label,totalUses:0,correct:0,accuracy:null,multiplier:1.0})); }
    } catch(e) {}

    // 5. Sentiment (in-memory cache first)
    const sentiment = sentimentCache[sym] || null;

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

    // Phase 1: Compute chart patterns and inject into brainResult so MI can see them
    // Chart patterns are directional intelligence that should flow into Master Intelligence.
    // CHART_HIGH_ATR (isVolatilityWarning) is excluded — it's handled via Pattern_125 ATR reducer.
    let brainForMI = brainResult;
    try {
      const { analyzeChartStructure } = require('./livePatternMatcher');
      const livePrice         = bars.length ? bars[bars.length - 1].close : null;
      const chartResult       = analyzeChartStructure(bars, livePrice, spyData);
      const directionalCharts = chartResult.patterns.filter(p => !p.isVolatilityWarning);
      if (brainResult && directionalCharts.length > 0) {
        brainForMI = { ...brainResult, active_patterns: [...(brainResult.active_patterns || []), ...directionalCharts] };
      }
    } catch(e) { console.warn('[MI] Chart injection failed:', e.message); }

    // 8. Build master score (brainForMI includes chart patterns)
    const result = buildMasterIntelligence(sym, indicators, brainForMI, signals, sentiment, edgar, macroSnapshot, fearGreed, vix);

    // 9. Apply Catalyst modifier — confidence only, never touches masterScore
    try {
      const now2 = Date.now();
      let catalystData = _catalystCache[sym];
      if (!catalystData || (now2 - (_catalystFetchedAt[sym] || 0) > CATALYST_TTL)) {
        const headlines      = sentiment?.headlines?.map(h => h.text || h).filter(Boolean) || [];
        const sentimentEvts  = sentiment?.events || [];
        const predDir        = result.decision?.toLowerCase().includes('buy') ? 'bullish'
                             : result.decision?.toLowerCase().includes('sell') ? 'bearish' : 'neutral';
        catalystData = await analyzeCatalysts(sym, headlines, edgar, predDir, sentimentEvts);
        _catalystCache[sym]     = catalystData;
        _catalystFetchedAt[sym] = now2;
        if (pipelineReady) storeCatalystEvents(admin.firestore(), sym, catalystData.events).catch(() => {});
      }
      if (catalystData?.modifier) {
        const { confidenceDelta, warnings, activeCatalysts } = catalystData.modifier;
        result.confidence          = Math.max(0, Math.min(100, (result.confidence || 50) + confidenceDelta));
        result.catalystWarnings    = warnings;
        result.activeCatalysts     = activeCatalysts;
        result.catalystDelta       = confidenceDelta;
      }
    } catch(e) { console.warn('[MI] Catalyst injection failed:', e.message); }

    // 10. Store to Firestore for history tracking
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
// ═══════════════════════════════════════════════════════════
//  VERIFICATION INTELLIGENCE — Firestore-backed prediction log
// ═══════════════════════════════════════════════════════════
const VI_COL     = 'vi_predictions';
const VI_PAT_COL = 'vi_pattern_fires';   // Phase 4: per-pattern validation tracking

// Phase 4: Log individual pattern fires to Firestore for forward-looking validation.
// Called from LP endpoint after each buildLivePrediction. One doc per pattern+symbol+day.
// win_rate fields will be computed from these docs once enough data accumulates.
// Helper: get current SPY price from snapshot
async function _getSpyPrice(key, sec) {
  if (!key) return null;
  try {
    const axios = require('axios');
    const r = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
      params: { symbols: 'SPY', feed: 'iex' }, timeout: 6000,
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
    });
    return r.data?.SPY?.latestTrade?.p ?? null;
  } catch(e) { return null; }
}

async function viLogPatternFires(db, sym, patterns, price, spyPrice) {
  if (!db || !patterns || !patterns.length || !price) return;
  const today = new Date().toISOString().split('T')[0];
  const batch = db.batch();
  let writes = 0;
  for (const p of patterns) {
    if (!p.pattern_id || p.direction === 'neutral') continue;
    const id     = `${p.pattern_id}_${sym}_${today}`;
    const docRef = db.collection(VI_PAT_COL).doc(id);
    const snap   = await docRef.get().catch(() => null);
    if (snap?.exists) continue;  // one entry per pattern+symbol per day
    batch.set(docRef, {
      id, patternId: p.pattern_id, patternName: p.name || p.pattern_id,
      symbol: sym, date: today, timestamp: Date.now(),
      priceAtFire: price, spyPriceAtFire: spyPrice || null,
      direction: p.direction, strength: p.strength || null,
      impact: p.impact || null, category: p.category || 'chart',
      note: p.note || null,
      verification7d: null, verification30d: null,
    });
    writes++;
    if (writes >= 10) break; // cap batch per request
  }
  if (writes > 0) await batch.commit().catch(e => console.warn('[VI-PAT] Batch write failed:', e.message));
}

// Log a prediction snapshot
app.post('/api/vi/log', rlVI, async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const d = req.body;
    if (!d?.symbol || !d?.decision) return res.json({ ok: false, error: 'Missing required fields' });
    const db     = admin.firestore();
    const today  = new Date().toISOString().split('T')[0];
    const id     = `${d.symbol}_${today}`;
    const docRef = db.collection(VI_COL).doc(id);
    const existing = await docRef.get();
    // One entry per symbol per day — don't overwrite
    if (existing.exists) return res.json({ ok: true, id, skipped: true });
    await docRef.set({
      id, symbol: d.symbol, timestamp: Date.now(), date: today,
      priceAtPrediction: d.priceAtPrediction ?? null,
      spyAtPrediction:   d.spyAtPrediction   ?? null,
      masterScore:       d.masterScore        ?? null,
      decision:          d.decision,
      confidence:        d.confidence         ?? null,
      systemVotes:       d.systemVotes        ?? null,
      topPatterns:       d.topPatterns        ?? [],
      marketRegime:      d.marketRegime       ?? null,
      // ── Sentiment at prediction time ──
      sentimentScore:    d.sentimentScore     ?? null,
      sentimentOverall:  d.sentimentOverall   ?? null,
      // ── Catalyst state at prediction time ──
      catalystDelta:     d.catalystDelta      ?? null,
      catalystEvents:    d.catalystEvents     ?? [],
      // ── Outcome slots (filled by runVIVerification) ──
      verification7d:    null,
      verification30d:   null,
    });
    res.json({ ok: true, id });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── VI resolution core — called by cron + manual endpoint ──
async function runVIVerification() {
  const axios  = require('axios');
  const key    = process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET;
  const db     = admin.firestore();
  const VI_7D  = 7  * 24 * 3600 * 1000;
  const VI_30D = 30 * 24 * 3600 * 1000;
  const now    = Date.now();

  function isCorrect(decision, ret) {
    if (['STRONG BUY','BUY','BUY SMALL'].includes(decision)) return ret > 1;
    if (['SELL','STRONG SELL'].includes(decision))           return ret < -1;
    return Math.abs(ret) <= 5;
  }
  function isDirectional(decision) {
    return ['STRONG BUY','BUY','BUY SMALL','SELL','STRONG SELL'].includes(decision);
  }

  // ── Resolve vi_predictions ──
  let verifiedCount = 0;
  const snap = await db.collection(VI_COL)
    .where('priceAtPrediction', '!=', null).limit(200).get();

  const pending = snap.docs
    .map(d => ({ ref: d.ref, data: d.data() }))
    .filter(e => !e.data.verification7d || !e.data.verification30d);

  if (pending.length > 0) {
    const syms = [...new Set(pending.map(e => e.data.symbol).concat(['SPY']))];
    let prices = {};
    try {
      const r = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
        params: { symbols: syms.join(','), feed: 'iex' },
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        timeout: 10000,
      });
      syms.forEach(s => {
        const sn = r.data[s];
        if (sn) prices[s] = sn.latestTrade?.p ?? sn.latestQuote?.bp ?? null;
      });
    } catch(e) { console.warn('[VI] Price fetch failed:', e.message); }

    const batch = db.batch();
    pending.forEach(({ ref, data: e }) => {
      const currentPrice = prices[e.symbol];
      const spyPrice     = prices['SPY'];
      if (!currentPrice) return;
      const age    = now - e.timestamp;
      const retPct = +(((currentPrice - e.priceAtPrediction) / e.priceAtPrediction) * 100).toFixed(2);
      const spyRet = (spyPrice && e.spyAtPrediction) ? +(((spyPrice - e.spyAtPrediction) / e.spyAtPrediction) * 100).toFixed(2) : null;
      const verif  = {
        priceAfter: currentPrice, returnPct: retPct, spyReturn: spyRet,
        outperformedSpy: spyRet != null ? retPct > spyRet : null,
        correct: isCorrect(e.decision, retPct),
        decisionType: isDirectional(e.decision) ? 'directional' : 'neutral',
        verifiedAt: now,
      };
      const update = {};
      if (!e.verification7d  && age >= VI_7D)  { update.verification7d  = verif; verifiedCount++; }
      if (!e.verification30d && age >= VI_30D) { update.verification30d = verif; verifiedCount++; }
      if (Object.keys(update).length) batch.update(ref, update);
    });
    await batch.commit();
  }

  // ── Resolve vi_pattern_fires ──
  let patVerified = 0;
  try {
    const patSnap = await db.collection(VI_PAT_COL)
      .where('priceAtFire', '!=', null).limit(500).get();
    const patPending = patSnap.docs
      .map(d => ({ ref: d.ref, data: d.data() }))
      .filter(e => !e.data.verification7d || !e.data.verification30d);

    if (patPending.length > 0) {
      const patSyms = [...new Set(patPending.map(e => e.data.symbol).concat(['SPY']))];
      let patPrices = {};
      try {
        const pr = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
          params: { symbols: patSyms.join(','), feed: 'iex' },
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }, timeout: 10000,
        });
        patSyms.forEach(s => { const sn = pr.data[s]; if (sn) patPrices[s] = sn.latestTrade?.p ?? sn.latestQuote?.bp ?? null; });
      } catch(e2) { /* skip */ }

      const patBatch = db.batch();
      patPending.forEach(({ ref, data: e }) => {
        const cp = patPrices[e.symbol], spyP = patPrices['SPY'];
        if (!cp) return;
        const age    = now - e.timestamp;
        const retPct = +(((cp - e.priceAtFire) / e.priceAtFire) * 100).toFixed(2);
        const spyRet = (spyP && e.spyPriceAtFire) ? +(((spyP - e.spyPriceAtFire) / e.spyPriceAtFire) * 100).toFixed(2) : null;
        const correct = e.direction === 'bullish' ? retPct > 1 : e.direction === 'bearish' ? retPct < -1 : Math.abs(retPct) <= 3;
        const verif = { priceAfter: cp, returnPct: retPct, spyReturn: spyRet, outperformedSpy: spyRet!=null?retPct>spyRet:null, correct, verifiedAt: now };
        const upd = {};
        if (!e.verification7d  && age >= VI_7D)  { upd.verification7d  = verif; patVerified++; }
        if (!e.verification30d && age >= VI_30D) { upd.verification30d = verif; patVerified++; }
        if (Object.keys(upd).length) patBatch.update(ref, upd);
      });
      await patBatch.commit();
    }
  } catch(e2) { console.warn('[VI-PAT] Verify error:', e2.message); }

  // ── Phase 3: Update Catalyst Performance from newly-verified predictions ──
  let catalystUpdated = 0;
  try {
    // Re-query docs that were just verified (have catalystEvents + a fresh verification)
    const catSnap = await db.collection(VI_COL)
      .where('catalystDelta', '!=', null).limit(300).get();
    const catDocs = catSnap.docs
      .map(d => ({ ref: d.ref, data: d.data() }))
      // Skip predictions whose catalyst stats are fully processed (permanent flags)
      .filter(({ data: e }) => Array.isArray(e.catalystEvents) && e.catalystEvents.length > 0
        && !(e.catalyst7dProcessed && e.catalyst30dProcessed));

    const catProcBatch = db.batch();
    let   catProcWrites = 0;

    for (const { ref: predRef, data: pred } of catDocs) {
      const v7  = pred.verification7d;
      const v30 = pred.verification30d;
      // Only process if at least one verification window is resolved
      if (!v7 && !v30) continue;

      // Permanent processed flags — prevent re-accumulation across cron runs
      const already7d  = pred.catalyst7dProcessed  === true;
      const already30d = pred.catalyst30dProcessed === true;

      for (const ev of pred.catalystEvents) {
        if (!ev.eventType) continue;
        const perfRef = db.collection('catalyst_performance').doc(ev.eventType);
        const perfDoc = await perfRef.get();
        const perf    = perfDoc.exists ? perfDoc.data() : {
          eventType:              ev.eventType,
          uses7d:                 0,
          wins7d:                 0,
          losses7d:               0,
          winRate7d:              null,
          avgReturn7d:            null,
          avgConfidenceDelta7d:   null,
          _sumReturn7d:           0,
          _sumDelta7d:            0,
          uses30d:                0,
          wins30d:                0,
          losses30d:              0,
          winRate30d:             null,
          avgReturn30d:           null,
          avgConfidenceDelta30d:  null,
          _sumReturn30d:          0,
          _sumDelta30d:           0,
          updatedAt:              null,
        };

        // Build dedup key — one contribution per prediction doc per event type
        const dedupKey7  = `_seen7_${pred.id}_${ev.eventType}`;
        const dedupKey30 = `_seen30_${pred.id}_${ev.eventType}`;
        if (perf[dedupKey7] && perf[dedupKey30]) continue; // already counted

        const catalystDelta = pred.catalystDelta ?? 0;

        // already7d/already30d gate: if the vi_prediction doc is permanently flagged,
        // skip accumulation for that window (secondary safety behind the perf-doc dedup keys)
        if (v7 && !already7d && !perf[dedupKey7]) {
          perf.uses7d++;
          if (v7.correct) perf.wins7d++; else perf.losses7d++;
          perf._sumReturn7d += v7.returnPct ?? 0;
          perf._sumDelta7d  += catalystDelta;
          perf.winRate7d            = perf.uses7d > 0 ? +(perf.wins7d / perf.uses7d * 100).toFixed(1) : null;
          perf.avgReturn7d          = +(perf._sumReturn7d / perf.uses7d).toFixed(2);
          perf.avgConfidenceDelta7d = +(perf._sumDelta7d  / perf.uses7d).toFixed(2);
          perf[dedupKey7] = true;
          catalystUpdated++;
        }
        if (v30 && !already30d && !perf[dedupKey30]) {
          perf.uses30d++;
          if (v30.correct) perf.wins30d++; else perf.losses30d++;
          perf._sumReturn30d += v30.returnPct ?? 0;
          perf._sumDelta30d  += catalystDelta;
          perf.winRate30d            = perf.uses30d > 0 ? +(perf.wins30d / perf.uses30d * 100).toFixed(1) : null;
          perf.avgReturn30d          = +(perf._sumReturn30d / perf.uses30d).toFixed(2);
          perf.avgConfidenceDelta30d = +(perf._sumDelta30d  / perf.uses30d).toFixed(2);
          perf[dedupKey30] = true;
          catalystUpdated++;
        }

        perf.updatedAt = new Date().toISOString();
        await perfRef.set(perf);
      }

      // Write permanent processed flags to vi_prediction (idempotent — survives cron restarts)
      const predUpdate = {};
      if (v7  && !already7d)  predUpdate.catalyst7dProcessed  = true;
      if (v30 && !already30d) predUpdate.catalyst30dProcessed = true;
      if (Object.keys(predUpdate).length) { catProcBatch.update(predRef, predUpdate); catProcWrites++; }
    }

    if (catProcWrites > 0) await catProcBatch.commit().catch(ce => console.warn('[VI-CAT] Proc flag write failed:', ce.message));
  } catch(e3) { console.warn('[VI-CAT] Catalyst performance update error:', e3.message); }

  console.log(`[VI] Resolution complete — predictions: ${verifiedCount}, pattern fires: ${patVerified}, catalyst perf updates: ${catalystUpdated}`);

  // Phase 2A: Refresh win rate registry so LPMS and Brain Vault pick up newly verified rates
  refreshRegistry(db).catch(e => console.warn('[WinRateRegistry] Post-VI refresh failed:', e.message));

  return { verified: verifiedCount, patternFiresVerified: patVerified, catalystUpdated };
}

// Run verification: fill in 7d/30d results for pending predictions
app.get('/api/vi/verify', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const result = await runVIVerification();
    res.json({ ok: true, ...result });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Phase 4: Pattern fire stats — aggregated win rates per pattern from verified fires
app.get('/api/vi/pattern-stats', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const db   = admin.firestore();
    const snap = await db.collection(VI_PAT_COL).limit(500).get();
    const docs = snap.docs.map(d => d.data());
    const stats = {};
    docs.forEach(d => {
      if (!stats[d.patternId]) stats[d.patternId] = { patternId: d.patternId, name: d.patternName, uses7d: 0, wins7d: 0, uses30d: 0, wins30d: 0, avgReturn7d: [], avgReturn30d: [] };
      const s = stats[d.patternId];
      if (d.verification7d)  { s.uses7d++;  if (d.verification7d.correct)  s.wins7d++;  s.avgReturn7d.push(d.verification7d.returnPct); }
      if (d.verification30d) { s.uses30d++; if (d.verification30d.correct) s.wins30d++; s.avgReturn30d.push(d.verification30d.returnPct); }
    });
    // Join with Win Rate Registry for authoritative stage classification
    const registry = getRegistrySnapshot();
    // Compute averages
    const result = Object.values(stats).map(s => {
      const reg = registry[s.patternId];
      // winRateSource from registry: VERIFIED, HAND_CODED, or DEFAULT
      const winRateSource = reg?.source || 'DEFAULT';
      const winRateUses   = reg?.uses   ?? 0;
      return {
        patternId:    s.patternId,
        name:         s.name,
        uses7d:       s.uses7d,
        winRate7d:    s.uses7d > 0 ? +(s.wins7d / s.uses7d * 100).toFixed(1) : null,
        avgReturn7d:  s.avgReturn7d.length > 0 ? +(s.avgReturn7d.reduce((a,b)=>a+b,0)/s.avgReturn7d.length).toFixed(2) : null,
        uses30d:      s.uses30d,
        winRate30d:   s.uses30d > 0 ? +(s.wins30d / s.uses30d * 100).toFixed(1) : null,
        avgReturn30d: s.avgReturn30d.length > 0 ? +(s.avgReturn30d.reduce((a,b)=>a+b,0)/s.avgReturn30d.length).toFixed(2) : null,
        dataQuality:  s.uses7d >= 20 ? 'validated' : s.uses7d >= 5 ? 'emerging' : 'insufficient',
        winRateSource,
        winRateUses,
      };
    }).sort((a, b) => (b.uses7d) - (a.uses7d));
    res.json({ ok: true, stats: result, totalFires: docs.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Phase 3: Catalyst performance stats — win rates per event type from verified predictions
// Returns catalyst_performance collection, sorted by 7d win rate descending.
// Data quality: uses7d >= 20 = validated, >= 5 = emerging, < 5 = insufficient.
app.get('/api/vi/catalyst-stats', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const db   = admin.firestore();
    const snap = await db.collection('catalyst_performance').limit(50).get();
    const docs = snap.docs.map(d => {
      const raw = d.data();
      // Strip internal dedup keys (_seen7_*, _seen30_*) from response
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!k.startsWith('_')) clean[k] = v;
      }
      clean.dataQuality = raw.uses7d >= 20 ? 'validated' : raw.uses7d >= 5 ? 'emerging' : 'insufficient';
      return clean;
    });
    docs.sort((a, b) => (b.uses7d || 0) - (a.uses7d || 0));
    res.json({ ok: true, stats: docs, totalEventTypes: docs.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Phase 2A: Win rate registry — current state of verified vs hand-coded vs default
// Shows which patterns have accumulated enough verified fires to use real win rates.
// Refreshed automatically after each VI verification cycle.
app.get('/api/win-rates', (req, res) => {
  res.json({ ok: true, registry: getRegistrySnapshot() });
});

// ── Brain Calendar — daily aggregated heatmap data ──
app.get('/api/brain-calendar', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const db   = admin.firestore();
    const days = parseInt(req.query.days) || 90;

    // Date range
    const now     = Date.now();
    const cutoff  = new Date(now - days * 24 * 3600 * 1000).toISOString().split('T')[0];

    // Fetch both collections in parallel
    const [predSnap, patSnap] = await Promise.all([
      db.collection(VI_COL).where('date', '>=', cutoff).get(),
      db.collection(VI_PAT_COL).where('date', '>=', cutoff).get(),
    ]);

    // Group predictions by date
    const byDate = {};

    predSnap.docs.forEach(doc => {
      const d = doc.data();
      if (!d.date) return;
      if (!byDate[d.date]) byDate[d.date] = { predictions: [], patterns: [] };
      byDate[d.date].predictions.push(d);
    });

    patSnap.docs.forEach(doc => {
      const d = doc.data();
      if (!d.date) return;
      if (!byDate[d.date]) byDate[d.date] = { predictions: [], patterns: [] };
      byDate[d.date].patterns.push(d);
    });

    // Aggregate per day
    const calendar = {};

    Object.entries(byDate).forEach(([date, { predictions, patterns }]) => {
      const preds = predictions;
      const pats  = patterns;

      // Verification counts
      const verified = preds.filter(p => p.verification7d || p.verification30d);
      const correct  = verified.filter(p => (p.verification7d || p.verification30d).correct === true);
      // v1: mixed accuracy (all decisions) — preserved for backward compat
      const verifiedAccuracy = verified.length > 0 ? +(correct.length / verified.length * 100).toFixed(1) : null;

      // v2: split accuracy — directional (BUY/SELL) vs neutral (HOLD/WAIT)
      const DIR_DECISIONS = ['STRONG BUY','BUY','BUY SMALL','SELL','STRONG SELL'];
      const dirVerified    = verified.filter(p => DIR_DECISIONS.includes(p.decision));
      const dirCorrect     = dirVerified.filter(p => (p.verification7d || p.verification30d).correct === true);
      const directionalAccuracy = dirVerified.length > 0 ? +(dirCorrect.length / dirVerified.length * 100).toFixed(1) : null;
      const neutVerified   = verified.filter(p => !DIR_DECISIONS.includes(p.decision));
      const neutCorrect    = neutVerified.filter(p => (p.verification7d || p.verification30d).correct === true);
      const neutralAccuracy = neutVerified.length > 0 ? +(neutCorrect.length / neutVerified.length * 100).toFixed(1) : null;

      // Avg master score + confidence
      const scores = preds.map(p => p.masterScore).filter(s => s != null);
      const confs  = preds.map(p => p.confidence).filter(c => c != null);
      const avgMasterScore  = scores.length ? +(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null;
      const avgConfidence   = confs.length  ? +(confs.reduce((a,b)=>a+b,0)/confs.length).toFixed(1)  : null;

      // Pattern counts
      const bullish = pats.filter(p => p.direction === 'bullish').length;
      const bearish = pats.filter(p => p.direction === 'bearish').length;

      // Catalyst count
      const catalystCount = preds.reduce((a,p) => a + (p.catalystEvents?.length || 0), 0);

      // Avg sentiment
      const sents = preds.map(p => p.sentimentScore).filter(s => s != null);
      const avgSentimentScore = sents.length ? +(sents.reduce((a,b)=>a+b,0)/sents.length).toFixed(1) : null;

      // Top pattern (most frequent)
      const patFreq = {};
      pats.forEach(p => { if (p.patternName) patFreq[p.patternName] = (patFreq[p.patternName]||0)+1; });
      const topPattern = Object.entries(patFreq).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

      // Win rate source mix
      const wrSources = { VERIFIED:0, HAND_CODED:0, DEFAULT:0 };
      preds.forEach(p => {
        (p.topPatterns||[]).forEach(tp => {
          const src = tp.winRateSource || 'DEFAULT';
          if (wrSources[src] !== undefined) wrSources[src]++;
        });
      });

      // Brain health = confidence × directionalAccuracy / 100 (v2: directional only)
      const brainHealth = (avgConfidence != null && directionalAccuracy != null)
        ? +(avgConfidence * directionalAccuracy / 100).toFixed(1)
        : (avgConfidence != null && verifiedAccuracy != null)
          ? +(avgConfidence * verifiedAccuracy / 100).toFixed(1)
          : null;

      // Best/worst symbol by return
      const symReturns = preds
        .filter(p => p.symbol && (p.verification7d||p.verification30d)?.returnPct != null)
        .map(p => ({ sym: p.symbol, ret: (p.verification7d||p.verification30d).returnPct }));
      symReturns.sort((a,b) => b.ret - a.ret);
      const bestSymbol  = symReturns[0]?.sym || null;
      const worstSymbol = symReturns[symReturns.length-1]?.sym || null;

      calendar[date] = {
        date,
        predictionsGenerated:  preds.length,
        avgMasterScore,
        avgConfidence,
        patternsFired:         pats.length,
        bullishPatterns:       bullish,
        bearishPatterns:       bearish,
        verifiedPredictions:   verified.length,
        verifiedAccuracy,                          // v1: all decisions mixed (backward compat)
        directionalVerified:   dirVerified.length, // v2
        directionalAccuracy,                       // v2: BUY/SELL only
        neutralVerified:       neutVerified.length,// v2
        neutralAccuracy,                           // v2: HOLD/WAIT only
        catalystCount,
        avgSentimentScore,
        topPattern,
        winRateSourceMix:      wrSources,
        brainHealth,
        bestSymbol,
        worstSymbol,
      };
    });

    res.json({ ok: true, calendar, days });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Get full VI report
// ── Brain Integrity Score — self-audit of system health ──
app.get('/api/brain-integrity', rlAudit, async (req, res) => {
  const now       = Date.now();
  const nowISO    = new Date(now).toISOString();
  const SYMS      = ['AAPL','TSLA','GOOGL','MSFT','AMZN'];
  const warnings  = [];
  const failed    = [];

  // ── helper: clamp 0-100 ──
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

  // ════════════════════════════════════════════════════════════
  // CAT 1 — Live Data Health (weight 20%)
  // ════════════════════════════════════════════════════════════
  let cat1 = 0;
  const quoteAge    = _lqCachedAt ? now - _lqCachedAt : Infinity;
  const quoteKeys   = Object.keys(_lqCache);
  const quoteCount  = SYMS.filter(s => _lqCache[s]?.price > 0).length;
  const spyOk       = !!(_lqCache['SPY']?.price > 0);
  const pricesValid = quoteKeys.filter(k => k !== 'SPY').every(k => typeof _lqCache[k]?.price === 'number' && _lqCache[k].price > 0);

  // Freshness: 30 pts
  if      (quoteAge < 120000)   cat1 += 30;       // < 2 min
  else if (quoteAge < 300000)   cat1 += 20;        // < 5 min
  else if (quoteAge < 900000)   cat1 += 8;         // < 15 min
  else { cat1 += 0; warnings.push('Live quotes are stale (>15 min old)'); failed.push('Quote freshness'); }

  // Coverage: 30 pts
  cat1 += Math.round(quoteCount / 5 * 30);
  if (quoteCount < 5) { warnings.push(`Only ${quoteCount}/5 symbols have live prices`); failed.push('Quote coverage'); }

  // SPY benchmark: 20 pts
  if (spyOk)  cat1 += 20;
  else { warnings.push('SPY benchmark price unavailable'); failed.push('SPY benchmark'); }

  // Price validity: 20 pts
  if (pricesValid) cat1 += 20;
  else { warnings.push('One or more quote prices are zero or invalid'); failed.push('Quote price validity'); }

  cat1 = clamp(cat1);

  // ════════════════════════════════════════════════════════════
  // CAT 2 — News + Catalyst Health (weight 15%)
  // ════════════════════════════════════════════════════════════
  let cat2 = 0;
  const sentAge     = sentimentLastRun ? now - new Date(sentimentLastRun).getTime() : Infinity;
  const sentSyms    = Object.keys(sentimentCache).filter(s => SYMS.includes(s));
  const sentHasEvts = sentSyms.filter(s => Array.isArray(sentimentCache[s]?.events) && sentimentCache[s].events.length > 0).length;
  const sentHasHL   = sentSyms.filter(s => (sentimentCache[s]?.headlines?.length || 0) >= 3).length;
  const catActive   = Object.keys(_catalystCache).filter(s => SYMS.includes(s)).length;

  // Sentiment freshness: 30 pts
  if      (sentAge < 7200000)   cat2 += 30;        // < 2 hr
  else if (sentAge < 21600000)  cat2 += 18;        // < 6 hr
  else if (sentAge < 86400000)  cat2 += 8;         // < 24 hr
  else { warnings.push('Sentiment data is older than 24 hours'); failed.push('Sentiment freshness'); }

  // Symbol coverage: 25 pts
  cat2 += Math.round(sentSyms.length / 5 * 25);
  if (sentSyms.length < 5) { warnings.push(`Sentiment missing for ${5 - sentSyms.length} symbols`); }

  // Headlines per symbol: 20 pts
  cat2 += Math.round(sentHasHL / 5 * 20);

  // Structured events present: 15 pts (unified pipeline working)
  cat2 += Math.round(sentHasEvts / 5 * 15);
  if (sentHasEvts === 0 && sentSyms.length > 0) { warnings.push('Unified event extraction returned no events (check Claude API key or prompt)'); failed.push('Structured event extraction'); }

  // Catalyst delta logged: 10 pts
  cat2 += Math.round(catActive / 5 * 10);

  cat2 = clamp(cat2);

  // ════════════════════════════════════════════════════════════
  // CAT 3 — Firestore / Memory Health (weight 15%)
  // ════════════════════════════════════════════════════════════
  let cat3 = 0;
  let viCount = 0, patCount = 0, sentFSCount = 0, catPerfCount = 0, brainAgeDays = null;

  // pipelineReady: 25 pts
  if (pipelineReady) {
    cat3 += 25;
    try {
      const db = admin.firestore();
      const [viSnap, patSnap, sentSnap, catSnap, firstPredSnap] = await Promise.all([
        db.collection(VI_COL).limit(1).get().catch(() => null),
        db.collection(VI_PAT_COL).limit(1).get().catch(() => null),
        db.collection('sentiment').limit(1).get().catch(() => null),
        db.collection('catalyst_performance').limit(1).get().catch(() => null),
        db.collection(VI_COL).orderBy('timestamp', 'asc').limit(1).get().catch(() => null),
      ]);
      viCount      = viSnap?.size  || 0;
      patCount     = patSnap?.size || 0;
      sentFSCount  = sentSnap?.size || 0;
      catPerfCount = catSnap?.size  || 0;
      if (firstPredSnap && !firstPredSnap.empty) {
        const firstDate = firstPredSnap.docs[0].data().date;
        if (firstDate) {
          const ageMs = now - new Date(firstDate + 'T00:00:00').getTime();
          brainAgeDays = Math.max(0, Math.floor(ageMs / 86400000));
        }
      }
    } catch(e) { warnings.push('Firestore query failed during integrity check'); }

    // vi_predictions: 25 pts
    if (viCount > 0) cat3 += 25;
    else { warnings.push('vi_predictions collection is empty — no predictions logged yet'); failed.push('vi_predictions logging'); }

    // vi_pattern_fires: 20 pts
    if (patCount > 0) cat3 += 20;
    else { warnings.push('vi_pattern_fires collection is empty'); failed.push('vi_pattern_fires logging'); }

    // sentiment Firestore: 15 pts
    if (sentFSCount > 0) cat3 += 15;
    else { warnings.push('Sentiment not yet persisted to Firestore'); }

    // catalyst_performance: 15 pts
    if (catPerfCount > 0) cat3 += 15;
    else { warnings.push('catalyst_performance collection is empty — accumulating'); }

  } else {
    warnings.push('Firestore pipeline is not ready (missing env vars)');
    failed.push('Firestore pipeline');
  }

  // winRateRegistry: bonus check — already in memory
  const registry  = getRegistrySnapshot();
  const regHasSrc = (registry.entries || []).some(e => e.tier);
  if (!regHasSrc && (registry.patternCount || 0) > 0) { warnings.push('Win rate registry has entries but missing source labels'); }

  cat3 = clamp(cat3);

  // ════════════════════════════════════════════════════════════
  // CAT 4 — Pattern Logic Health (weight 15%)
  // ════════════════════════════════════════════════════════════
  let cat4 = 0;
  let brainDiag = null;
  try {
    const { runBrainAnalysis } = require('./brain');
    const br = await runBrainAnalysis({ rsi: 55, macd: 0.2, sma7: 150, sma21: 148, volSpike: false, streak: 0, atrPct: 1.5, score: 0 });
    brainDiag = br?.brainVault?.diagnostics;
  } catch(e) { warnings.push('Brain diagnostics call failed: ' + e.message); failed.push('Brain diagnostics'); }

  if (brainDiag) {
    // Pattern evaluation rate: 40 pts
    const evalRate = brainDiag.activePercent || 0;
    cat4 += Math.round(Math.min(evalRate / 70, 1) * 40); // 70%+ eval = full score
    if (evalRate < 25) { warnings.push(`Only ${evalRate}% of patterns evaluated (low data coverage)`); failed.push('Pattern evaluation rate'); }

    // Pattern count matches expected: 20 pts
    const EXPECTED_PATTERNS = 113;
    if (brainDiag.loadedPatterns === EXPECTED_PATTERNS) cat4 += 20;
    else { warnings.push(`Loaded ${brainDiag.loadedPatterns} patterns, expected ${EXPECTED_PATTERNS}`); failed.push('Pattern count integrity'); }

    // Brain diagnostics accessible: 20 pts
    cat4 += 20;

    // winRateSource labels: 20 pts
    const wrReg = getRegistrySnapshot();
    const hasSourceLabels = (wrReg.entries || []).length > 0 || (wrReg.patternCount || 0) === 0;
    if (hasSourceLabels) cat4 += 20;
    else { warnings.push('Win rate source labels missing from registry'); }
  }

  cat4 = clamp(cat4);

  // ════════════════════════════════════════════════════════════
  // CAT 5 — Math Integrity (weight 15%)
  // ════════════════════════════════════════════════════════════
  let cat5 = 0;
  const mathChecks = { quotePrices: 25, sentScores: 25, catDeltas: 25, regRates: 25 };

  // Quote prices: 25 pts
  const badQuotes = SYMS.filter(s => {
    const p = _lqCache[s]?.price;
    return p !== undefined && (isNaN(p) || p <= 0);
  });
  if (badQuotes.length === 0) cat5 += 25;
  else { warnings.push(`NaN or zero price detected for: ${badQuotes.join(', ')}`); failed.push('Quote math integrity'); }

  // Sentiment scores: 25 pts
  const badSent = sentSyms.filter(s => {
    const sc = sentimentCache[s]?.score;
    return sc !== undefined && (isNaN(sc) || sc < -100 || sc > 100);
  });
  if (badSent.length === 0) cat5 += 25;
  else { warnings.push(`Sentiment score out of range for: ${badSent.join(', ')}`); failed.push('Sentiment score range'); }

  // Catalyst deltas: 25 pts
  const badCat = SYMS.filter(s => {
    const d = _catalystCache[s]?.modifier?.confidenceDelta;
    return d !== undefined && (isNaN(d) || d < -20 || d > 20);
  });
  if (badCat.length === 0) cat5 += 25;
  else { warnings.push(`Catalyst delta out of ±20 range for: ${badCat.join(', ')}`); failed.push('Catalyst delta clamping'); }

  // Win rate registry rates: 25 pts
  const badReg = Object.values(registry).filter(v => {
    const r = v?.rate;
    return r !== undefined && (isNaN(r) || r < 0 || r > 1);
  });
  if (badReg.length === 0) cat5 += 25;
  else { warnings.push(`${badReg.length} win rate registry entries have out-of-range values`); failed.push('Win rate registry math'); }

  cat5 = clamp(cat5);

  // ════════════════════════════════════════════════════════════
  // CAT 6 — Verification Health (weight 10%)
  // ════════════════════════════════════════════════════════════
  let cat6 = 0;
  let verifiedCount = 0, totalVIPreds = 0;

  if (pipelineReady) {
    // VI accessible: 30 pts
    cat6 += 30;

    // Has predictions logged: 30 pts
    if (viCount > 0) {
      cat6 += 30;
      // Attempt to count verified
      try {
        const db = admin.firestore();
        const viAll = await db.collection(VI_COL).limit(50).get().catch(() => null);
        if (viAll) {
          totalVIPreds  = viAll.size;
          verifiedCount = viAll.docs.filter(d => d.data().verification7d || d.data().verification30d).length;
        }
      } catch(e) {}

      // Has verified predictions — neutral (25 pts) if brain is too young for any window to close
      const tooYoungToVerify = brainAgeDays !== null && brainAgeDays < 7;
      if (verifiedCount > 0) cat6 += 25;
      else if (tooYoungToVerify) cat6 += 25; // pending first window — not a failure
      else { cat6 += 15; } // older than 7 days but 0 verified — partial credit

      // No fake accuracy: 15 pts — always pass (backend never shows accuracy without verified data)
      cat6 += 15;
    } else {
      // No predictions logged — only flag as failure if brain has had time to collect
      const tooYoungToLog = brainAgeDays !== null && brainAgeDays < 2;
      if (!tooYoungToLog) {
        warnings.push('No predictions logged — open Master Intelligence on any stock to start tracking');
        failed.push('VI predictions present');
      }
      // Young brain with 0 predictions: add 15 pts partial (pipeline ready, just not used yet)
      cat6 += tooYoungToLog ? 20 : 0;
    }
  } else {
    cat6 += 20; // partial: pipeline not ready but no fake accuracy shown
  }

  cat6 = clamp(cat6);

  // ════════════════════════════════════════════════════════════
  // CAT 7 — Cognitive Consistency (weight 10%)
  // ════════════════════════════════════════════════════════════
  let cat7 = 0;

  // Catalyst deltas within ±20: 40 pts (already checked in cat5, but here it's conceptual)
  const catDeltasOk = badCat.length === 0;
  if (catDeltasOk) cat7 += 40;

  // Sentiment scores within -100..100: 30 pts
  if (badSent.length === 0) cat7 += 30;

  // Win rate rates within 0..1: 30 pts
  if (badReg.length === 0) cat7 += 30;

  // Consistency warning: if sentiment positive but catalyst warning present for same symbol
  const conflicts = SYMS.filter(s => {
    const sentPos    = sentimentCache[s]?.overall === 'positive';
    const catWarns   = (_catalystCache[s]?.modifier?.warnings || []).some(w => w.includes('🔴') || w.includes('⚠'));
    return sentPos && catWarns;
  });
  if (conflicts.length > 0) {
    cat7 = Math.round(cat7 * 0.85); // slight reduction for conflicting signals
    warnings.push(`Conflicting signals detected for: ${conflicts.join(', ')} (positive sentiment but catalyst warnings)`);
  }

  cat7 = clamp(cat7);

  // ════════════════════════════════════════════════════════════
  // FINAL WEIGHTED SCORE
  // ════════════════════════════════════════════════════════════
  const categoryScores = {
    liveData:       { score: cat1, weight: 0.20, label: 'Live Data Health' },
    newsAndCatalyst:{ score: cat2, weight: 0.15, label: 'News + Catalyst Health' },
    firestore:      { score: cat3, weight: 0.15, label: 'Firestore / Memory Health' },
    patternLogic:   { score: cat4, weight: 0.15, label: 'Pattern Logic Health' },
    mathIntegrity:  { score: cat5, weight: 0.15, label: 'Math Integrity' },
    verification:   { score: cat6, weight: 0.10, label: 'Verification Health' },
    consistency:    { score: cat7, weight: 0.10, label: 'Cognitive Consistency' },
  };

  const finalScore = clamp(
    Object.values(categoryScores).reduce((acc, c) => acc + c.score * c.weight, 0)
  );

  const status = finalScore >= 90 ? 'Excellent'
               : finalScore >= 75 ? 'Reliable'
               : finalScore >= 60 ? 'Caution'
               : finalScore >= 40 ? 'Weak'
               : 'Do Not Trust';

  res.json({
    ok:            true,
    score:         finalScore,
    status,
    categoryScores,
    warnings:      [...new Set(warnings)],
    failedChecks:  [...new Set(failed)],
    meta: {
      pipelineReady,
      quoteAgeMs:        _lqCachedAt ? now - _lqCachedAt : null,
      sentimentAgeMs:    sentimentLastRun ? now - new Date(sentimentLastRun).getTime() : null,
      quotedSymbols:     quoteCount,
      sentimentSymbols:  sentSyms.length,
      eventExtrSymbols:  sentHasEvts,
      catalystSymbols:   catActive,
      viPredictions:     totalVIPreds,
      verifiedCount,
      patternCount:      brainDiag?.loadedPatterns || null,
      evalRate:          brainDiag?.activePercent  || null,
      registryEntries:   (registry.entries || []).length,
      brainAgeDays,
    },
    lastAuditAt: nowISO,
  });
});

// ═══════════════════════════════════════════════════════════
//  BACKTEST ENDPOINTS
// ═══════════════════════════════════════════════════════════
const { runBacktest, getBacktestResult, getBacktestSummary } = require('./backtest');

// Trigger backtest for one symbol — takes 30–60s, result stored in Firestore
app.get('/api/backtest/run/:symbol', rlAudit, async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  const sym    = req.params.symbol.toUpperCase();
  const key    = process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET;
  if (!key) return res.json({ ok: false, error: 'No Alpaca credentials' });
  try {
    const result = await runBacktest(sym, admin.firestore(), key, secret);
    res.json({ ok: true, result });
  } catch(e) {
    console.error('[Backtest] Error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Return cached backtest result for one symbol
app.get('/api/backtest/results/:symbol', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  const sym = req.params.symbol.toUpperCase();
  try {
    const result = await getBacktestResult(sym, admin.firestore());
    if (!result) return res.json({ ok: false, error: 'No backtest data yet — run /api/backtest/run/' + sym });
    res.json({ ok: true, result });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// All symbols combined summary
app.get('/api/backtest/summary', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const summary = await getBacktestSummary(admin.firestore());
    res.json({ ok: true, ...summary });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/vi/report', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const db   = admin.firestore();
    const snap = await db.collection(VI_COL).orderBy('timestamp', 'desc').limit(200).get();
    const log  = snap.docs.map(d => d.data());
    res.json({ ok: true, log });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  SPRINT 2 — DATABASE INTEGRITY AUDIT (read-only)
//  Checks: duplicates, missing verifications, orphan fires,
//  catalyst double-processing, timestamp consistency.
// ═══════════════════════════════════════════════════════════
app.get('/api/db-integrity', rlAudit, async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  const db = admin.firestore();
  const SYMS = ['AAPL','TSLA','GOOGL','MSFT','AMZN'];
  const now = Date.now();
  const VI_7D  = 7  * 24 * 3600 * 1000;
  const VI_30D = 30 * 24 * 3600 * 1000;
  const issues = [];
  const counts = {};

  try {
    // ── 1. vi_predictions — duplicates + missing dates ──
    const predSnap = await db.collection(VI_COL).limit(500).get();
    const preds = predSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    counts.vi_predictions = preds.length;

    // Check for duplicate symbol+date combos
    const predKeys = {};
    const predDuplicates = [];
    preds.forEach(p => {
      const key = `${p.symbol}_${p.date}`;
      if (predKeys[key]) predDuplicates.push({ key, ids: [predKeys[key], p.id] });
      else predKeys[key] = p.id;
    });
    if (predDuplicates.length) issues.push({ type: 'DUPLICATE_PREDICTIONS', count: predDuplicates.length, samples: predDuplicates.slice(0, 5) });

    // Check for missing fields
    const predsNoPrice = preds.filter(p => p.priceAtPrediction == null);
    const predsNoDate  = preds.filter(p => !p.date);
    const predsNoTs    = preds.filter(p => !p.timestamp);
    const predsNoDecision = preds.filter(p => !p.decision);
    if (predsNoPrice.length) issues.push({ type: 'PREDICTION_MISSING_PRICE', count: predsNoPrice.length, ids: predsNoPrice.slice(0,5).map(p=>p.id) });
    if (predsNoDate.length)  issues.push({ type: 'PREDICTION_MISSING_DATE', count: predsNoDate.length, ids: predsNoDate.slice(0,5).map(p=>p.id) });
    if (predsNoTs.length)    issues.push({ type: 'PREDICTION_MISSING_TIMESTAMP', count: predsNoTs.length });
    if (predsNoDecision.length) issues.push({ type: 'PREDICTION_MISSING_DECISION', count: predsNoDecision.length });

    // ── 2. Missing 7d verification where age >= 7d ──
    const missing7d = preds.filter(p => p.timestamp && (now - p.timestamp) >= VI_7D && !p.verification7d && p.priceAtPrediction != null);
    if (missing7d.length) issues.push({ type: 'MISSING_7D_VERIFICATION', count: missing7d.length, samples: missing7d.slice(0,5).map(p => ({ id: p.id, date: p.date, symbol: p.symbol, ageDays: Math.floor((now - p.timestamp)/86400000) })) });

    // ── 3. Missing 30d verification where age >= 30d ──
    const missing30d = preds.filter(p => p.timestamp && (now - p.timestamp) >= VI_30D && !p.verification30d && p.priceAtPrediction != null);
    if (missing30d.length) issues.push({ type: 'MISSING_30D_VERIFICATION', count: missing30d.length, samples: missing30d.slice(0,5).map(p => ({ id: p.id, date: p.date, symbol: p.symbol, ageDays: Math.floor((now - p.timestamp)/86400000) })) });

    // ── 4. vi_pattern_fires — duplicates ──
    const patSnap = await db.collection(VI_PAT_COL).limit(1000).get();
    const pats = patSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    counts.vi_pattern_fires = pats.length;

    const patKeys = {};
    const patDuplicates = [];
    pats.forEach(p => {
      const key = `${p.patternId}_${p.symbol}_${p.date}`;
      if (patKeys[key]) patDuplicates.push({ key, ids: [patKeys[key], p.id] });
      else patKeys[key] = p.id;
    });
    if (patDuplicates.length) issues.push({ type: 'DUPLICATE_PATTERN_FIRES', count: patDuplicates.length, samples: patDuplicates.slice(0, 5) });

    // Missing 7d verification on pattern fires
    const patMissing7d = pats.filter(p => p.timestamp && (now - p.timestamp) >= VI_7D && !p.verification7d && p.priceAtFire != null);
    if (patMissing7d.length) issues.push({ type: 'PATTERN_FIRE_MISSING_7D', count: patMissing7d.length });

    // ── 5. Orphan pattern fires — symbol+date with no matching prediction ──
    const predDateSet = new Set(preds.map(p => `${p.symbol}_${p.date}`));
    const orphanFires = pats.filter(p => !predDateSet.has(`${p.symbol}_${p.date}`));
    if (orphanFires.length) issues.push({ type: 'ORPHAN_PATTERN_FIRES', count: orphanFires.length, note: 'Pattern fires with no matching vi_prediction for that symbol+date', samples: orphanFires.slice(0,5).map(p => ({ id: p.id, symbol: p.symbol, date: p.date, pattern: p.patternId })) });

    // ── 6. signalPerformance — check all 19 expected signals exist ──
    const sigSnap = await db.collection('signalPerformance').get();
    const sigDocs = sigSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    counts.signalPerformance = sigDocs.length;

    const expectedSignals = ['SMA_UPTREND','SMA_DOWNTREND','MACD_BULLISH','MACD_BEARISH',
      'RSI_DEEPLY_OVERSOLD','RSI_OVERSOLD','RSI_MILD_BULLISH','RSI_SEVERELY_OVERBOUGHT',
      'RSI_OVERBOUGHT','RSI_MILD_BEARISH','MOMENTUM_STRONG_BULLISH','MOMENTUM_MILD_BULLISH',
      'MOMENTUM_STRONG_BEARISH','MOMENTUM_MILD_BEARISH','VOLUME_SPIKE_BULLISH',
      'VOLUME_SPIKE_BEARISH','STREAK_EXHAUSTION','STREAK_CONTINUATION_BULL','STREAK_CONTINUATION_BEAR'];
    const sigIds = new Set(sigDocs.map(s => s.id));
    const missingSignals = expectedSignals.filter(s => !sigIds.has(s));
    if (missingSignals.length) issues.push({ type: 'MISSING_SIGNAL_RECORDS', count: missingSignals.length, signals: missingSignals });

    // Signals with 0 totalUses after sufficient time
    const zeroUseSigs = sigDocs.filter(s => (s.totalUses || 0) === 0);
    if (zeroUseSigs.length) issues.push({ type: 'SIGNALS_ZERO_USES', count: zeroUseSigs.length, signals: zeroUseSigs.map(s => s.id), note: 'Expected if signal rarely fires or system is young' });

    // ── 7. catalyst_performance — check for double-processing artifacts ──
    const catSnap = await db.collection('catalyst_performance').limit(50).get();
    const catDocs = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    counts.catalyst_performance = catDocs.length;

    const catIssues = [];
    catDocs.forEach(c => {
      // Count _seen7_ keys — each should correspond to one prediction
      const seen7Keys  = Object.keys(c).filter(k => k.startsWith('_seen7_'));
      const seen30Keys = Object.keys(c).filter(k => k.startsWith('_seen30_'));
      // If uses7d > seen7Keys count, accumulation may have occurred before dedup keys existed
      if (c.uses7d > 0 && seen7Keys.length < c.uses7d) {
        catIssues.push({ eventType: c.id, uses7d: c.uses7d, dedupKeys7d: seen7Keys.length, gap: c.uses7d - seen7Keys.length });
      }
      if (c.uses30d > 0 && seen30Keys.length < c.uses30d) {
        catIssues.push({ eventType: c.id, uses30d: c.uses30d, dedupKeys30d: seen30Keys.length, gap: c.uses30d - seen30Keys.length });
      }
    });
    if (catIssues.length) issues.push({ type: 'CATALYST_POSSIBLE_DOUBLE_COUNT', count: catIssues.length, note: 'uses exceeds dedup key count — may indicate pre-fix double accumulation', details: catIssues });

    // Check vi_predictions for catalyst processed flags
    const catPredsMissing = preds.filter(p =>
      p.verification7d && Array.isArray(p.catalystEvents) && p.catalystEvents.length > 0 && !p.catalyst7dProcessed
    );
    if (catPredsMissing.length) issues.push({ type: 'CATALYST_UNPROCESSED_PREDICTIONS', count: catPredsMissing.length, note: 'Predictions with 7d verification + catalyst events but no catalyst7dProcessed flag — next cron run will process them' });

    // ── 8. Timestamp consistency ──
    const tsIssues = [];
    preds.forEach(p => {
      if (!p.timestamp || !p.date) return;
      const tsDate = new Date(p.timestamp).toISOString().split('T')[0];
      if (tsDate !== p.date) tsIssues.push({ id: p.id, timestamp: new Date(p.timestamp).toISOString(), date: p.date, mismatch: 'timestamp date != date field' });
    });
    // Verification timestamps should be after prediction timestamp
    preds.forEach(p => {
      if (p.verification7d?.verifiedAt && p.timestamp && p.verification7d.verifiedAt < p.timestamp) {
        tsIssues.push({ id: p.id, type: '7d_before_prediction', predTs: p.timestamp, verifTs: p.verification7d.verifiedAt });
      }
    });
    if (tsIssues.length) issues.push({ type: 'TIMESTAMP_INCONSISTENCY', count: tsIssues.length, samples: tsIssues.slice(0, 5) });

    // ── 9. Coverage stats ──
    const symbolCoverage = {};
    SYMS.forEach(s => {
      const symPreds = preds.filter(p => p.symbol === s);
      const symPats  = pats.filter(p => p.symbol === s);
      const symV7    = symPreds.filter(p => p.verification7d);
      symbolCoverage[s] = {
        predictions: symPreds.length,
        patternFires: symPats.length,
        verified7d: symV7.length,
        verified30d: symPreds.filter(p => p.verification30d).length,
        avgConfidence: symPreds.length ? +(symPreds.reduce((a,p) => a + (p.confidence||0), 0) / symPreds.length).toFixed(1) : null,
      };
    });

    // ── 10. Integrity Score ──
    let score = 100;
    issues.forEach(i => {
      if (i.type.includes('DUPLICATE'))     score -= Math.min(15, i.count * 3);
      if (i.type.includes('MISSING_7D'))    score -= Math.min(20, i.count * 2);
      if (i.type.includes('MISSING_30D'))   score -= Math.min(10, i.count);
      if (i.type.includes('ORPHAN'))        score -= Math.min(10, i.count);
      if (i.type.includes('DOUBLE_COUNT'))  score -= Math.min(15, i.count * 5);
      if (i.type.includes('TIMESTAMP'))     score -= Math.min(10, i.count * 2);
      if (i.type.includes('MISSING_PRICE')) score -= Math.min(10, i.count * 2);
      if (i.type.includes('MISSING_DATE'))  score -= Math.min(10, i.count * 2);
    });
    score = Math.max(0, score);
    const status = score >= 90 ? 'HEALTHY' : score >= 70 ? 'MINOR_ISSUES' : score >= 50 ? 'NEEDS_ATTENTION' : 'CRITICAL';

    res.json({
      ok: true,
      integrityScore: score,
      status,
      collections: counts,
      symbolCoverage,
      issueCount: issues.length,
      issues,
      auditedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

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
    const mhResult = calcMarketHealth(macro, fearGreed, vix, Object.keys(sentimentCache).length ? Object.values(sentimentCache)[0] : null);
    res.json({ ok: true, score: mhResult.score, label: healthLabel(mhResult.score), contributions: mhResult.contributions, fearGreed, vix });
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

app.get('/api/live-prediction/:symbol', rlLP, async (req, res) => {
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

    const _lpBarParams  = { timeframe: '1Day', start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0], limit: 252, feed: 'iex' };
    const _lpBarHeaders = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec };

    // Phase 1+3: fetch symbol + SPY bars in parallel
    const [barsResp, spyBarsRespLP] = await Promise.all([
      axios.get(`https://data.alpaca.markets/v2/stocks/${sym}/bars`, { headers: _lpBarHeaders, params: _lpBarParams, timeout: 15000 }),
      sym !== 'SPY'
        ? axios.get('https://data.alpaca.markets/v2/stocks/SPY/bars', { headers: _lpBarHeaders, params: { ..._lpBarParams, limit: 40 }, timeout: 12000 }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const bars    = (barsResp.data.bars || []).map(b => ({ close: b.c, high: b.h, low: b.l, open: b.o, volume: b.v, time: b.t }));
    const spyBarsLP = spyBarsRespLP ? (spyBarsRespLP.data?.bars||[]).map(b=>({close:b.c})) : [];
    const spyDataLP = spyBarsLP.length >= 10
      ? { return10d: +((spyBarsLP[spyBarsLP.length-1].close - spyBarsLP[spyBarsLP.length-10].close) / spyBarsLP[spyBarsLP.length-10].close * 100).toFixed(2) }
      : null;
    const indicators = _computeIndicators(bars);

    // 2. Brain analysis (with macro + sentiment context)
    // 2. EDGAR first — earningsSurprise must reach brain for PEAD to fire
    let edgar = null;
    try { edgar = await fetchEdgarData(sym); } catch(e) {}

    // 3. Brain analysis — edgar passed so PEAD pattern can evaluate
    let brainResult = null;
    try {
      const { runBrainAnalysis } = require('./brain');
      brainResult = await runBrainAnalysis(
        indicators || { rsi: null, macd: null, sma7: null, sma21: null, volSpike: false, streak: 0, atrPct: null, score: 0 },
        { symbol: sym, macroSnapshot: null, sentiment: sentimentCache[sym] || null, edgar }
      );
    } catch(e) { console.warn('[LP] Brain failed:', e.message); }

    // 4. Signal performance
    let signals = [];
    try {
      const { SIGNAL_DEFAULTS, loadSignalPerformanceFull } = require('./signalPerformance');
      signals = pipelineReady
        ? await loadSignalPerformanceFull(admin.firestore())
        : Object.entries(SIGNAL_DEFAULTS).map(([id, def]) => ({ id, label: def.label, totalUses: 0, correct: 0, accuracy: null }));
    } catch(e) {}

    // 5. Sentiment (memory cache)
    const sentiment = sentimentCache[sym] || null;

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

    // Phase 1: Inject chart patterns into a MI-only brainResult copy so MI sees chart intelligence.
    // buildLivePrediction handles chart patterns internally — using original brainResult avoids double-counting.
    let brainForMILP = brainResult;
    try {
      const { analyzeChartStructure: _acs } = require('./livePatternMatcher');
      const _lpLivePrice     = bars.length ? bars[bars.length - 1].close : null;
      const _lpChartResult   = _acs(bars, _lpLivePrice, spyDataLP);
      const _lpDirCharts     = _lpChartResult.patterns.filter(p => !p.isVolatilityWarning);
      if (brainResult && _lpDirCharts.length > 0) {
        brainForMILP = { ...brainResult, active_patterns: [...(brainResult.active_patterns || []), ..._lpDirCharts] };
      }
    } catch(e) { /* chart injection is non-critical */ }

    // 8. Master intelligence scores (brainForMILP includes chart patterns)
    const miResult = buildMasterIntelligence(sym, indicators, brainForMILP, signals, sentiment, edgar, macroSnapshot, fearGreed, vix);

    // 9. Build live prediction (original brainResult — chart patterns computed internally via spyDataLP)
    const { buildLivePrediction } = require('./livePatternMatcher');
    const result = buildLivePrediction(
      sym, bars, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix,
      miResult?.scoreBreakdown || null, spyDataLP
    );

    // Attach master intelligence score for UI context
    result.masterIntelligence = {
      masterScore:  miResult.masterScore,
      decision:     miResult.decision,
      marketHealth: miResult.marketHealth,
      scoreBreakdown: miResult.scoreBreakdown,
    };

    // Apply Catalyst modifier to LP confidence — never touches consensusScore
    try {
      const now2 = Date.now();
      let catalystData = _catalystCache[sym];
      if (!catalystData || (now2 - (_catalystFetchedAt[sym] || 0) > CATALYST_TTL)) {
        const headlines      = sentiment?.headlines?.map(h => h.text || h).filter(Boolean) || [];
        const sentimentEvts  = sentiment?.events || [];
        const predDir        = (result.direction || 'neutral').toLowerCase();
        catalystData = await analyzeCatalysts(sym, headlines, edgar, predDir, sentimentEvts);
        _catalystCache[sym]     = catalystData;
        _catalystFetchedAt[sym] = now2;
        if (pipelineReady) storeCatalystEvents(admin.firestore(), sym, catalystData.events).catch(() => {});
      }
      if (catalystData?.modifier) {
        const { confidenceDelta, warnings, activeCatalysts } = catalystData.modifier;
        result.confidence       = Math.max(0, Math.min(100, (result.confidence || 50) + confidenceDelta));
        result.catalystWarnings = (result.catalystWarnings || []).concat(warnings);
        result.activeCatalysts  = activeCatalysts;
        result.catalystDelta    = confidenceDelta;
      }
    } catch(e) { console.warn('[LP] Catalyst injection failed:', e.message); }

    // Phase 4: Log individual pattern fires for forward-looking validation framework.
    // Tracks each pattern's actual outcomes so win_rate can be computed from real data.
    if (pipelineReady) {
      const currentPrice = bars.length ? bars[bars.length-1].close : null;
      const allFiredPats = [
        ...(result.activeLivePatterns || []),
        ...(result.chartStructure?.detectedPatterns || []),
      ].filter(p => p.pattern_id && p.direction !== 'neutral');
      if (allFiredPats.length > 0 && currentPrice) {
        // Fetch SPY price for benchmark comparison at fire time
        const spySnapshot = await _getSpyPrice(key, sec).catch(() => null);
        viLogPatternFires(admin.firestore(), sym, allFiredPats, currentPrice, spySnapshot).catch(() => {});
      }
    }

    _lpCache[sym]     = result;
    _lpFetchedAt[sym] = now;

    res.json({ ok: true, data: result, source: 'live' });

  } catch(e) {
    console.error('[LP] Error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Catalysts for a symbol ──
// Returns cached catalyst events + modifier for the symbol.
// Falls back to Firestore if in-memory cache is empty.
app.get('/api/catalysts/:sym', async (req, res) => {
  const sym = (req.params.sym || '').toUpperCase();
  if (!sym) return res.json({ ok: false, error: 'sym required' });

  try {
    // Serve in-memory cache if fresh
    const now2 = Date.now();
    if (_catalystCache[sym] && (now2 - (_catalystFetchedAt[sym] || 0) < CATALYST_TTL)) {
      return res.json({ ok: true, data: _catalystCache[sym], source: 'cache' });
    }

    // Try Firestore fallback
    if (pipelineReady) {
      const doc = await admin.firestore().collection('catalyst_events').doc(sym).get();
      if (doc.exists) {
        const data = doc.data();
        return res.json({ ok: true, data, source: 'firestore' });
      }
    }

    // No data yet — return empty
    res.json({ ok: true, data: { events: [], modifier: { confidenceDelta: 0, warnings: [], activeCatalysts: [] } }, source: 'empty' });
  } catch(e) {
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

  // Daily prediction verification — Mon–Fri 6pm ET (accelerates signal accuracy data)
  cron.schedule('0 18 * * 1-5', () => {
    console.log('[CRON] Daily prediction verification triggered');
    verifyPredictions().catch(console.error);
  }, { timezone: 'America/New_York' });

  // VI resolution — daily 6:15pm ET Mon–Fri (resolves 7d/30d outcomes after market close)
  cron.schedule('15 18 * * 1-5', () => {
    console.log('[CRON] VI daily resolution triggered');
    runVIVerification().catch(console.error);
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

// ═══════════════════════════════════════════════════════════
//  PAPER TRADING — Firebase-backed, no Alpaca account needed
//  All balance mutations happen server-side only.
//  Auth: every request must carry Firebase ID token in
//  Authorization: Bearer <idToken> header.
// ═══════════════════════════════════════════════════════════
const PT_ACCOUNTS  = 'paper_accounts';
const PT_POSITIONS = 'paper_positions';
const PT_TRADES    = 'paper_trades';
const PT_STARTER   = 1_000_000;   // $1M free for new users
const PT_TOPUP_PER_DOLLAR = 50_000; // $1 real = $50K fake (future)

// Verify Firebase ID token — returns uid or throws
async function verifyIdToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Missing auth token');
  const token   = auth.slice(7);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

// Get or create paper account for uid
async function getPaperAccount(db, uid) {
  const ref = db.collection(PT_ACCOUNTS).doc(uid);
  const doc = await ref.get();
  if (doc.exists) return { ref, data: doc.data() };
  // First time — create with $1M starter balance
  const newAccount = {
    uid,
    balance:      PT_STARTER,
    totalDeposited: PT_STARTER,
    tradeCount:   0,
    createdAt:    Date.now(),
  };
  await ref.set(newAccount);
  return { ref, data: newAccount };
}

// GET /api/paper/account — balance + open positions with live P&L
app.get('/api/paper/account', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const uid = await verifyIdToken(req);
    const db  = admin.firestore();
    const { data: acct } = await getPaperAccount(db, uid);

    // Load positions
    const posSnap = await db.collection(PT_POSITIONS)
      .where('uid', '==', uid).get();
    const positions = posSnap.docs.map(d => d.data());

    // Fetch current prices for all held symbols
    const axios = require('axios');
    const key   = process.env.ALPACA_KEY;
    const sec   = process.env.ALPACA_SECRET;
    let prices  = {};
    if (positions.length && key) {
      const syms = [...new Set(positions.map(p => p.sym))];
      try {
        const r = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
          params: { symbols: syms.join(','), feed: 'iex' },
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
          timeout: 8000,
        });
        syms.forEach(s => {
          const sn = r.data[s];
          if (sn) prices[s] = sn.latestTrade?.p ?? sn.latestQuote?.bp ?? null;
        });
      } catch(e) { /* prices stay empty — show cost basis */ }
    }

    const enriched = positions.map(p => {
      const price   = prices[p.sym] ?? null;
      const curVal  = price != null ? +(price * p.shares).toFixed(2) : null;
      const pnl     = curVal != null ? +(curVal - p.totalCost).toFixed(2) : null;
      const pnlPct  = pnl != null && p.totalCost > 0 ? +(pnl / p.totalCost * 100).toFixed(2) : null;
      return { ...p, currentPrice: price, currentValue: curVal, pnl, pnlPct };
    });

    const stocksValue = enriched.reduce((s, p) => s + (p.currentValue ?? p.totalCost), 0);
    const totalValue  = +(acct.balance + stocksValue).toFixed(2);

    res.json({ ok: true, account: { ...acct, stocksValue: +stocksValue.toFixed(2), totalValue }, positions: enriched });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/paper/buy  { sym, shares }
app.post('/api/paper/buy', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const uid    = await verifyIdToken(req);
    const { sym, shares } = req.body;
    if (!sym || !shares || shares <= 0) return res.json({ ok: false, error: 'sym and shares required' });
    const cleanSym = sym.toUpperCase().trim();

    // Get live price
    const axios = require('axios');
    const key   = process.env.ALPACA_KEY;
    const sec   = process.env.ALPACA_SECRET;
    let price   = null;
    try {
      const r = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
        params: { symbols: cleanSym, feed: 'iex' },
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
        timeout: 6000,
      });
      const sn = r.data[cleanSym];
      price = sn?.latestTrade?.p ?? sn?.latestQuote?.bp ?? null;
    } catch(e) { return res.json({ ok: false, error: 'Could not fetch live price' }); }
    if (!price) return res.json({ ok: false, error: 'No live price available for ' + cleanSym });

    const cost = +(price * shares).toFixed(2);
    const db   = admin.firestore();
    const { ref: acctRef, data: acct } = await getPaperAccount(db, uid);

    if (acct.balance < cost) return res.json({ ok: false, error: `Insufficient balance. Need $${cost.toFixed(2)}, have $${acct.balance.toFixed(2)}` });

    const posId  = `${uid}_${cleanSym}`;
    const posRef = db.collection(PT_POSITIONS).doc(posId);
    const posDoc = await posRef.get();

    const batch = db.batch();

    // Update or create position
    if (posDoc.exists) {
      const p        = posDoc.data();
      const newShares = +(p.shares + shares).toFixed(8);
      const newCost   = +(p.totalCost + cost).toFixed(2);
      batch.update(posRef, { shares: newShares, totalCost: newCost, avgCost: +(newCost / newShares).toFixed(4), updatedAt: Date.now() });
    } else {
      batch.set(posRef, { uid, sym: cleanSym, shares: +shares.toFixed(8), totalCost: cost, avgCost: +price.toFixed(4), openedAt: Date.now(), updatedAt: Date.now() });
    }

    // Deduct balance + increment trade count
    batch.update(acctRef, { balance: +(acct.balance - cost).toFixed(2), tradeCount: (acct.tradeCount || 0) + 1 });

    // Log trade
    const tradeRef = db.collection(PT_TRADES).doc();
    batch.set(tradeRef, { uid, sym: cleanSym, type: 'BUY', shares: +shares.toFixed(8), price, total: cost, balanceBefore: acct.balance, balanceAfter: +(acct.balance - cost).toFixed(2), timestamp: Date.now() });

    await batch.commit();
    res.json({ ok: true, sym: cleanSym, shares, price, total: cost, newBalance: +(acct.balance - cost).toFixed(2) });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST /api/paper/sell  { sym, shares }
app.post('/api/paper/sell', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const uid    = await verifyIdToken(req);
    const { sym, shares } = req.body;
    if (!sym || !shares || shares <= 0) return res.json({ ok: false, error: 'sym and shares required' });
    const cleanSym = sym.toUpperCase().trim();

    const db     = admin.firestore();
    const posId  = `${uid}_${cleanSym}`;
    const posRef = db.collection(PT_POSITIONS).doc(posId);
    const posDoc = await posRef.get();

    if (!posDoc.exists) return res.json({ ok: false, error: 'No position in ' + cleanSym });
    const pos = posDoc.data();
    if (pos.shares < shares) return res.json({ ok: false, error: `Only have ${pos.shares} shares of ${cleanSym}` });

    // Get live price
    const axios = require('axios');
    const key   = process.env.ALPACA_KEY;
    const sec   = process.env.ALPACA_SECRET;
    let price   = null;
    try {
      const r = await axios.get('https://data.alpaca.markets/v2/stocks/snapshots', {
        params: { symbols: cleanSym, feed: 'iex' },
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': sec },
        timeout: 6000,
      });
      const sn = r.data[cleanSym];
      price = sn?.latestTrade?.p ?? sn?.latestQuote?.bp ?? null;
    } catch(e) { return res.json({ ok: false, error: 'Could not fetch live price' }); }
    if (!price) return res.json({ ok: false, error: 'No live price available for ' + cleanSym });

    const proceeds = +(price * shares).toFixed(2);
    const { ref: acctRef, data: acct } = await getPaperAccount(db, uid);

    const batch = db.batch();
    const newShares = +(pos.shares - shares).toFixed(8);

    if (newShares <= 0.00001) {
      batch.delete(posRef); // Closed position
    } else {
      const costBasisSold = +(pos.avgCost * shares).toFixed(2);
      batch.update(posRef, { shares: newShares, totalCost: +(pos.totalCost - costBasisSold).toFixed(2), updatedAt: Date.now() });
    }

    batch.update(acctRef, { balance: +(acct.balance + proceeds).toFixed(2), tradeCount: (acct.tradeCount || 0) + 1 });

    const tradeRef = db.collection(PT_TRADES).doc();
    const realizedPnl = +((price - pos.avgCost) * shares).toFixed(2);
    batch.set(tradeRef, { uid, sym: cleanSym, type: 'SELL', shares: +shares.toFixed(8), price, total: proceeds, realizedPnl, balanceBefore: acct.balance, balanceAfter: +(acct.balance + proceeds).toFixed(2), timestamp: Date.now() });

    await batch.commit();
    res.json({ ok: true, sym: cleanSym, shares, price, total: proceeds, realizedPnl, newBalance: +(acct.balance + proceeds).toFixed(2) });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET /api/paper/trades — last 50 trades for the user
app.get('/api/paper/trades', async (req, res) => {
  if (!pipelineReady) return res.json({ ok: false, error: 'Firestore not configured' });
  try {
    const uid  = await verifyIdToken(req);
    const db   = admin.firestore();
    const snap = await db.collection(PT_TRADES)
      .where('uid', '==', uid).orderBy('timestamp', 'desc').limit(50).get();
    res.json({ ok: true, trades: snap.docs.map(d => d.data()) });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

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
