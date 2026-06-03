const express = require('express');
const path    = require('path');
const cron    = require('node-cron');
const admin   = require('firebase-admin');
const { runSentimentAnalysis, storeSentiment } = require('./sentiment');
const { fetchEdgarData, fetchAllEdgarData }    = require('./edgar');

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

// ── API: Get latest quotes ──
app.get('/api/quotes', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const snap = await admin.firestore().collection('quotes').get();
    const out  = {};
    snap.forEach(doc => { out[doc.id] = doc.data(); });
    res.json({ ok: true, data: out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
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

// ── API: Get prediction accuracy stats ──
app.get('/api/accuracy', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const snap = await admin.firestore().collection('predictions')
      .where('wasCorrect', '!=', null).orderBy('wasCorrect')
      .orderBy('generatedAt', 'desc').limit(100).get();
    const preds = [];
    snap.forEach(doc => preds.push(doc.data()));
    const total   = preds.length;
    const correct = preds.filter(p => p.wasCorrect).length;
    res.json({ ok: true, total, correct, accuracy: total ? +(correct/total*100).toFixed(1) : null, recent: preds.slice(0,20) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Get sentiment ──
app.get('/api/sentiment', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  try {
    const snap = await admin.firestore().collection('sentiment').get();
    const out  = {};
    snap.forEach(doc => { out[doc.id] = doc.data(); });
    res.json({ ok: true, data: out });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── API: Refresh sentiment now ──
app.post('/api/sentiment/refresh', async (req, res) => {
  if (!pipelineReady) return notReady(res);
  if (req.headers['x-pipeline-secret'] !== process.env.PIPELINE_SECRET)
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  res.json({ ok: true, message: 'Sentiment refresh started' });
  runSentimentAnalysis()
    .then(results => storeSentiment(admin, results))
    .catch(console.error);
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
      runSentimentAnalysis()
        .then(results => storeSentiment(admin, results))
        .catch(console.error);
    }, { timezone: 'America/New_York' });
    console.log('[SERVER] Sentiment cron scheduled: 8am ET Mon–Fri');
  }
}

// ── Start server ──
app.listen(PORT, () => {
  console.log(`VESTEX server running on port ${PORT}`);
  console.log(`Pipeline scheduled: daily 5pm ET (Mon–Fri)`);
});
