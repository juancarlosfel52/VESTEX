# VESTEX Session Notes — S3 — 2026-06-04

## What Was Done

### 1. Brain Vault Evaluation (carried in from S2)
- Final score: **77.9% active (88/113 patterns)**
- Category breakdown: technical 42/44, psychology 8/8, economy 7/12, company 5/11, news 11/15, research 5/11, market-history 10/12
- Model Progress tab updated with real eval score

### 2. Dark/Light Theme Toggle
- `🌙` button in topbar toggles `body.dark-mode`
- CSS variables flip: sidebar/topbar go black; all card surfaces invert
- Persisted to `localStorage`

### 3. Chart Glow Animation
- `buildChart()` adds `chart-glow-up` (green) or `chart-glow-dn` (red) class to canvas
- CSS `box-shadow` keyframe pulses based on direction

### 4. Live Quotes Pipeline (`/api/live-quotes`)
- New endpoint hitting Alpaca `/v2/stocks/snapshots` (price + prevClose + changePercent + OHLCV in one call)
- 60s in-memory cache (`_lqCache` / `_lqCachedAt`)
- Sources: `alpaca_live` → `cache` → `stale_cache` → `firestore_fallback` — never mislabels stale as live
- `serverFetchedAt` added to every response so client knows when server last called Alpaca

### 5. Verify Live Quotes Audit Modal
- `◈ Verify Live Quotes` button in topbar
- Per-symbol table: Live Price, Prev Close, Chg $, Chg %, OHLCV, Trade Time, **Cache Age**, Source, Status/DOM check
- Status (LIVE/CACHED/STALE/ERROR) based on **`cacheAgeMs`** not trade timestamp
- Trade age shown as informational only (old outside market hours = normal, not a bug)
- Shows `serverFetchedAt` in verdict bar

### 6. Master Intelligence System (`masterIntelligence.js`)
- New file: `buildMasterIntelligence()` — 0-100 score from 7 category scorers:
  - Technical 25pts, Brain 20pts, Signals 15pts, Regime 10pts, Macro 10pts, Sentiment 10pts, Fundamentals 10pts
- Decision scale: STRONG BUY(≥85) / BUY(≥70) / BUY SMALL(≥60) / HOLD(≥45) / WAIT(≥35) / SELL(≥21) / STRONG SELL(<21)
- `calcMarketHealth()` — global 0-100 from macro+FG+VIX+sentiment
- `/api/master-intelligence/:symbol` — 5min cache, stores to Firestore `master_intelligence` collection
- `/api/market-health` — global health score
- Master Intelligence tab in frontend: animated SVG meter, count-up score, sequential bar animations, decision cards

### 7. Stale Cache + DOM Mismatch Fix (S3 main work)
**Root cause 1 — False STALE in verify modal:**
- `verifyLiveQuotes()` was computing age from `q.timestamp` (last actual trade) — this can be 9+ hours old when market is closed → false STALE
- Fix: status now uses `cacheAgeMs` from API response (server fetch age)

**Root cause 2 — DOM chg% mismatch (TSLA -0.24% API vs +0.02% DOM):**
- `fetchHistory()` had a line overwriting `STOCKS[sym].chg` with bar-delta `(last-prev)/prev*100`
- After `fetchQuotes()` set correct changePercent from Alpaca snapshots, the batch history fetch in `init()` re-rendered with wrong bar-delta values
- Fix: removed the chg overwrite from `fetchHistory()` entirely; removed the batch history `Promise.allSettled` from `init()` that triggered the re-render

**Verified in production:**
```
AAPL  LIVE  16s cache  ✓ MATCH
TSLA  LIVE  16s cache  ✓ MATCH
GOOGL LIVE  16s cache  ✓ MATCH
MSFT  LIVE  16s cache  ✓ MATCH
AMZN  LIVE  16s cache  ✓ MATCH
```

---

## File State After S3

### `server.js`
- `/api/live-quotes` — 60s TTL cache, `serverFetchedAt` on all responses, `stale_cache` source on Alpaca failure fallback
- `/api/chart/:symbol` — Firestore first, Alpaca fallback
- `/api/master-intelligence/:symbol` — 5min cache, Firestore store
- `/api/market-health`
- `/api/brain-diagnostics`
- Shared caches: `_lqCache`(60s), `_miCache`(5min), `_fgCache`/`_vixCache`(10min)

### `masterIntelligence.js` (NEW)
- `buildMasterIntelligence(sym, indicators, brainResult, signals, sentiment, edgar, macroSnapshot, fearGreed, vix)`
- `calcMarketHealth(macro, fg, vix, sentiment)`
- `healthLabel(score)`, `scoreColor(score)`

### `index.html`
- Dark mode: `body.dark-mode`, `toggleTheme()`, localStorage
- Chart glow: `chart-glow-up` / `chart-glow-dn` CSS classes
- `fetchQuotes()` → calls `/api/live-quotes`, maps all fields including `chg = r.changePercent`
- `fetchHistory()` — NO longer overwrites `STOCKS[sym].chg`
- `init()` — NO batch history fetch / re-render after fetchQuotes
- `verifyLiveQuotes()` — status from `cacheAgeMs`, shows both cache age + trade age
- Master Intelligence page: `renderMasterPage()`, `renderMasterSym(sym)`, `miMeterSVG(score,color)`
- Auto-refresh quotes every 60s

---

## Next Session Checklist (IN ORDER)
1. Railway env vars: ALPACA_KEY, ALPACA_SECRET, ALPACA_BASE_URL, ALPACA_DATA_URL, FIREBASE_PRIVATE_KEY_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_CLIENT_ID, PIPELINE_SECRET
2. Enable Firestore — Firebase Console → Firestore Database → Create database
3. Trigger pipeline manually to back-test 5 years of Alpaca history
4. Wire `/api/predictions` + `/api/accuracy` into frontend (replace mock data in overview cards)
5. Build paper trading module ($100K fake money via Alpaca)
6. Add more tracked symbols beyond the core 5 (AAPL/TSLA/GOOGL/MSFT/AMZN)

---

## Key Architecture Rules

- **chg% source of truth**: always from `/api/live-quotes` → `changePercent`. Never compute from bars.
- **Cache age = freshness**: `cacheAgeMs` in API response is what matters. `q.timestamp` = last trade (can be hours old outside market hours — that is normal).
- **Source labels**: `alpaca_live` (fresh fetch) → `cache` (within 60s) → `stale_cache` (Alpaca failed, serving old in-memory) → `firestore_fallback` (no memory cache)
- **Railway auto-deploys** from `main` branch push — no manual deploy step needed
- **Firebase project**: `vestex-21694`
- **GitHub**: `juancarlosfel52/VESTEX`
