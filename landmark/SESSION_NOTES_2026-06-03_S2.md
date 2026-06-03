# VESTEX — Session 2 Notes 2026-06-03

## Session Summary
Major session — added Firebase auth, Claude AI sentiment, Alpaca pipeline, beta popup, model progress tab, 100-year seasonal prediction weights, fixed Railway crash.

---

## Current State — What's Live on Railway

### ✓ Working Right Now (no env vars needed)
- Login — email/password + Google (Firebase auth live)
- Beta popup on first login — disclaimer + fake money callout
- Live prices — Stooq API (no key, real data, 60s refresh)
- Price charts — 1W/1M/3M/1Y per stock
- Predictions — RSI + moving avg + seasonal 100yr weights + CAPE risk
- Portfolio tracker — add/remove stocks, real P&L
- Model Progress tab — accuracy bar, star rating, signal cards
- News — curated mock headlines (Good/Bad/Neutral)
- Mobile — iOS safe, bottom nav, responsive

### ✗ Needs Railway Env Vars to Activate
- Alpaca data pipeline (daily OHLCV collection)
- Firestore storage (prediction accuracy tracking)
- Claude AI news sentiment (real headlines analyzed)
- Model Progress accuracy bar filling with real data

---

## Files
| File | Purpose |
|---|---|
| `index.html` | Full frontend — all pages, auth, Firebase config |
| `server.js` | Express + API routes + cron jobs (guarded — won't crash without env vars) |
| `pipeline.js` | Alpaca fetcher + RSI/SMA/volume indicators + prediction engine |
| `sentiment.js` | Claude Haiku sentiment — Yahoo RSS headlines → Good/Bad/Neutral |
| `package.json` | express, axios, node-cron, firebase-admin |
| `landmark/` | Session notes |

---

## Firebase
- **Project:** vestex-21694
- **Auth domain:** vestex-21694.firebaseapp.com
- **Config:** Already wired into index.html (web SDK)
- **Service account JSON:** Downloaded by user — NOT in repo
- **Auth methods:** Email/Password + Google — both enabled

---

## Prediction Engine (pipeline.js + index.html calcPred)

### Signals Used
| Signal | Source | Weight |
|---|---|---|
| RSI (14-day) | Alpaca daily bars | High |
| SMA 7 vs SMA 21 crossover | Alpaca daily bars | High |
| Volume spike (50% above 10-day avg) | Alpaca daily bars | Medium |
| Seasonal weight | 100-year Dow Jones research | Medium |
| CAPE ratio (41.44 current) | Hard-coded from research | Low |

### Seasonal Weights (from 100yr research)
- Nov/Apr = strongest → boost UP predictions
- Sep = worst month (-1.06% avg) → penalty on UP predictions
- May-Oct = "sell in May" weakness → reduced confidence

### Firestore Collections
- `market_data` — daily OHLCV bars
- `quotes` — latest bid/ask
- `predictions` — daily predictions + wasCorrect tracking
- `latest_predictions` — most recent per symbol
- `sentiment` — Claude AI news analysis per symbol

---

## API Routes (server.js)
| Route | Returns |
|---|---|
| GET /api/predictions | Latest prediction per symbol |
| GET /api/quotes | Latest quote per symbol |
| GET /api/history/:symbol | 90 days price bars |
| GET /api/accuracy | Model accuracy stats (feeds progress bar) |
| GET /api/sentiment | Claude-analyzed news per symbol |
| POST /api/sentiment/refresh | Manual sentiment refresh |
| POST /api/pipeline/run | Manual pipeline trigger |

---

## Cron Schedule (server.js)
| Job | Schedule | Purpose |
|---|---|---|
| runPipeline | 5pm ET Mon–Fri | Fetch Alpaca data + generate predictions |
| verifyPredictions | 6pm ET Monday | Check last week's predictions for accuracy |
| runSentimentAnalysis | 8am ET Mon–Fri | Claude reads news headlines |

---

## Security Issues Resolved
- API key accidentally committed in `VESTEX KEY.txt` — removed from repo
- `.gitignore` updated to exclude `VESTEX KEY.txt`
- Old key revoked by user, new key created
- New Claude key added directly to Railway Variables (safe)
- GitHub push protection unblocked by user

---

## Railway Environment Variables Needed
```
ALPACA_KEY                → Alpaca paper trading API key ID
ALPACA_SECRET             → Alpaca paper trading secret key
ALPACA_BASE_URL           → https://paper-api.alpaca.markets
ALPACA_DATA_URL           → https://data.alpaca.markets
FIREBASE_PRIVATE_KEY_ID   → from service account JSON
FIREBASE_PRIVATE_KEY      → from service account JSON (long key)
FIREBASE_CLIENT_EMAIL     → from service account JSON
FIREBASE_CLIENT_ID        → from service account JSON
PIPELINE_SECRET           → any password (e.g. vestex2026)
CLAUDE_API_KEY            → ✓ ALREADY ADDED
```

---

## ⚠️ NEXT SESSION PRIORITIES

### 1. Add Railway Env Vars (10 min)
User has:
- ✓ Claude API key (already in Railway)
- ✓ Firebase service account JSON downloaded
- ✓ Alpaca account created, was generating paper trading keys at end of session
User still needs to add: ALPACA_KEY, ALPACA_SECRET, all FIREBASE_ vars, PIPELINE_SECRET

### 2. Enable Firestore
Firebase Console → Firestore Database → Create database → Production mode

### 3. Wire /api/accuracy into progress bar
Progress bar currently shows 0 / demo data
Once Firestore is live it auto-populates from real predictions

### 4. Wire /api/predictions into frontend
Replace calcPred() mock with real server predictions from Firestore

### 5. Back-test with historical data
Alpaca has 5 years of history — pull it day 1, run model against it
Know accuracy BEFORE users see predictions

### 6. Paper trading module
$100K fake money via Alpaca paper trading
Users connect Alpaca account → buy/sell through VESTEX
No real money, no risk

---

## Roadmap (user's plan)
- Week 1 — collect real data via Alpaca pipeline
- Week 2 — study patterns, back-test, improve model
- Week 3 — launch public predictions with real accuracy score
- Future — community prediction leaderboard
- Future — Alpaca live trading integration
- Future — expand to more than 5 stocks

## Stocks Tracked
AAPL, TSLA, GOOGL, MSFT, AMZN

## Design
- Colors: White #FAF8F5, Red #CC0000, Gold #C9A84C
- Fonts: Bodoni Moda (serif) + Barlow Condensed (body)
- Motifs: LV monogram watermark, Greek key border
- Mobile: iOS-safe, bottom nav, safe-area-inset
