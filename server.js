const express = require('express');
const path    = require('path');
const cron    = require('node-cron');
const admin   = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Firebase Admin init ──
const serviceAccount = {
  type:                        'service_account',
  project_id:                  'vestex-21694',
  private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key:                 (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email:                process.env.FIREBASE_CLIENT_EMAIL,
  client_id:                   process.env.FIREBASE_CLIENT_ID,
  auth_uri:                    'https://accounts.google.com/o/oauth2/auth',
  token_uri:                   'https://oauth2.googleapis.com/token',
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { runPipeline, verifyPredictions, SYMBOLS } = require('./pipeline');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── API: Get latest predictions ──
app.get('/api/predictions', async (req, res) => {
  try {
    const db      = admin.firestore();
    const snap    = await db.collection('latest_predictions').get();
    const results = {};
    snap.forEach(doc => { results[doc.id] = doc.data(); });
    res.json({ ok: true, data: results });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Get latest quotes ──
app.get('/api/quotes', async (req, res) => {
  try {
    const db   = admin.firestore();
    const snap = await db.collection('quotes').get();
    const out  = {};
    snap.forEach(doc => { out[doc.id] = doc.data(); });
    res.json({ ok: true, data: out });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Get price history for a symbol ──
app.get('/api/history/:symbol', async (req, res) => {
  try {
    const db   = admin.firestore();
    const sym  = req.params.symbol.toUpperCase();
    const snap = await db.collection('market_data')
      .where('symbol', '==', sym)
      .orderBy('time', 'asc')
      .limit(90)
      .get();
    const bars = [];
    snap.forEach(doc => bars.push(doc.data()));
    res.json({ ok: true, data: bars });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Get prediction accuracy stats ──
app.get('/api/accuracy', async (req, res) => {
  try {
    const db   = admin.firestore();
    const snap = await db.collection('predictions')
      .where('wasCorrect', '!=', null)
      .orderBy('wasCorrect')
      .orderBy('generatedAt', 'desc')
      .limit(100)
      .get();
    const preds = [];
    snap.forEach(doc => preds.push(doc.data()));
    const total   = preds.length;
    const correct = preds.filter(p => p.wasCorrect).length;
    res.json({ ok: true, total, correct, accuracy: total ? +(correct/total*100).toFixed(1) : null, recent: preds.slice(0,20) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Manual pipeline trigger (for testing) ──
app.post('/api/pipeline/run', async (req, res) => {
  const secret = req.headers['x-pipeline-secret'];
  if (secret !== process.env.PIPELINE_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  res.json({ ok: true, message: 'Pipeline started' });
  runPipeline().catch(console.error);
});

// ── Serve frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ═══════════════════════════════════════════════════════════
//  CRON JOBS
//  Market hours: Mon–Fri 9:30am–4pm ET
// ═══════════════════════════════════════════════════════════

// Run pipeline daily at 5pm ET (after market close) Mon–Fri
cron.schedule('0 21 * * 1-5', () => {
  console.log('[CRON] Daily pipeline triggered');
  runPipeline().catch(console.error);
}, { timezone: 'America/New_York' });

// Verify last week's predictions every Monday at 6pm ET
cron.schedule('0 18 * * 1', () => {
  console.log('[CRON] Weekly prediction verification triggered');
  verifyPredictions().catch(console.error);
}, { timezone: 'America/New_York' });

// ── Start server ──
app.listen(PORT, () => {
  console.log(`VESTEX server running on port ${PORT}`);
  console.log(`Pipeline scheduled: daily 5pm ET (Mon–Fri)`);
});
