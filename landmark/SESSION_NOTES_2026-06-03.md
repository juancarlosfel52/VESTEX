# VESTEX — Session Notes 2026-06-03

## What Was Built
Full luxury stock market web app — single HTML file + Node.js server, deployed to Railway.

---

## Project Location
- **Local:** `C:\Users\juanc\Desktop\stock-app\`
- **GitHub:** `https://github.com/juancarlosfel52/VESTEX`
- **Railway:** Connected to GitHub repo, auto-deploys on push

## Files
| File | Purpose |
|---|---|
| `index.html` | Full frontend — login + dashboard + charts + predictions + portfolio + news |
| `server.js` | Express server + API routes + cron jobs |
| `pipeline.js` | Alpaca data fetcher + Firestore storage + prediction engine |
| `package.json` | Dependencies: express, axios, node-cron, firebase-admin |

---

## Design
- **Colors:** White `#FAF8F5`, Red `#CC0000`, Gold `#C9A84C`
- **Fonts:** Bodoni Moda (serif display) + Barlow Condensed (body)
- **Motifs:** LV monogram watermark, Greek key border, luxury sidebar with gold/red gradient
- **Mobile:** Full iOS-safe responsive — bottom nav bar, safe-area-inset, fixed topbar

---

## Auth — Firebase
- **Project:** `vestex-21694`
- **Auth domain:** `vestex-21694.firebaseapp.com`
- **Methods enabled:** Email/Password + Google
- **Frontend SDK:** Firebase v10 compat (CDN)
- **Config already wired** into `index.html`
- **Service account JSON** downloaded by user — values needed in Railway env vars

---

## Data — Stooq (Live quotes, no key needed)
- Endpoint: `https://stooq.com/q/l/?s={sym}.us&f=sd2t2ohlcv&h&e=csv`
- Used in `index.html` frontend via corsproxy.io
- Returns: Open, High, Low, Close, Volume
- Auto-refreshes every 60 seconds
- Falls back to mock data if blocked

---

## Data Pipeline — Alpaca (Backend)
- **Mode:** Paper Trading (free, no real money)
- **Data endpoint:** `https://data.alpaca.markets`
- **Auth headers:** `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY`
- **User was generating API keys at end of session** (app name: VESTEX, note: pipeline)
- Keys go into Railway as env vars — NOT in code

### Prediction Engine (pipeline.js)
- Fetches 30 days of OHLCV bars per symbol
- Calculates: RSI (14), SMA7, SMA21, Volume Spike
- Scores each signal → outputs UP/DOWN/FLAT + confidence %
- Stores predictions in Firestore → verifies accuracy 7 days later
- Cron: runs daily 5pm ET (Mon–Fri), verifies weekly on Monday

---

## Firestore Collections
| Collection | Contents |
|---|---|
| `market_data` | Daily OHLCV bars per symbol |
| `quotes` | Latest bid/ask per symbol |
| `predictions` | Daily predictions with accuracy tracking |
| `latest_predictions` | Most recent prediction per symbol |

---

## API Routes (server.js)
| Route | Returns |
|---|---|
| `GET /api/predictions` | Latest prediction per symbol |
| `GET /api/quotes` | Latest quote per symbol |
| `GET /api/history/:symbol` | 90 days of price bars |
| `GET /api/accuracy` | Model accuracy stats |
| `POST /api/pipeline/run` | Manual trigger (needs PIPELINE_SECRET header) |

---

## ⚠️ WHAT'S LEFT — Next Session

### 1. Railway Environment Variables (5 min)
User needs to add these in Railway → VESTEX service → Variables:
```
ALPACA_KEY                → from Alpaca paper trading dashboard
ALPACA_SECRET             → from Alpaca paper trading dashboard
ALPACA_BASE_URL           → https://paper-api.alpaca.markets
ALPACA_DATA_URL           → https://data.alpaca.markets
FIREBASE_PRIVATE_KEY_ID   → from service account JSON
FIREBASE_PRIVATE_KEY      → from service account JSON (long key)
FIREBASE_CLIENT_EMAIL     → from service account JSON
FIREBASE_CLIENT_ID        → from service account JSON
PIPELINE_SECRET           → any password e.g. vestex2026
```

### 2. Enable Firestore
- Firebase Console → Firestore Database → Create database → Production mode

### 3. Wire API routes into frontend
- `index.html` currently uses Stooq for live quotes
- Next: also pull `/api/predictions` from our own server to show real model predictions
- Replace mock prediction data with Firestore-stored predictions

### 4. Prediction accuracy display
- After 1 week of data: show model accuracy % on predictions page
- "Our model has been correct 68% of the time this week"

### 5. Future — Community prediction market
- Users make their own predictions
- Points leaderboard
- Compare vs VESTEX model accuracy

---

## Stocks Tracked
AAPL, TSLA, GOOGL, MSFT, AMZN

## User Notes
- User is building toward a real prediction market
- Plan: Week 1 collect data, Week 2 study patterns, Week 3 launch predictions
- User wants to eventually add Alpaca live trading (not paper)
- Mobile first — user tested on Samsung phone
