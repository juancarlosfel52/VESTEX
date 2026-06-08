# VESTEX Session 10 — 2026-06-08

## What Was Built

### 1. Historical Backtest Engine
**Commits:** `96847bc`, `94a92c3`

**New file:** `backtest.js`
- Fetches 2 years of daily Alpaca bars per symbol
- Slides a 40-bar window across every trading day
- Replicates `_computeIndicators()` (RSI, MACD, SMA7/21, ATR, volSpike, streak)
- Calls `runBrainAnalysis()` per day with **exact historical context**
- Verifies 7-day outcome against actual price movement (±0.5% threshold)
- Stores results in Firestore `bt_results/{sym}` — one doc per symbol
- Aggregates: overall accuracy, bull/bear accuracy, monthly breakdown, top patterns by fire count, regime breakdown

**Exact historical mode (S10 fix):**
- Fetches full CBOE VIX CSV history (~8500 days back to 1990)
- Fetches 730 days of Fear & Greed history from alternative.me
- Builds `{ 'YYYY-MM-DD': value }` maps for both
- `_buildRegimeForDate()` reconstructs exact regime per trading day with ±3 day fallback for weekends/holidays
- `brain.js` updated: accepts `regimeOverride` + `monthOverride` in `extraContext` — live system unaffected (both default to null)

**Server endpoints:**
- `GET /api/backtest/run/:symbol` — triggers full backtest (30–60s), stores result
- `GET /api/backtest/results/:symbol` — returns cached Firestore result
- `GET /api/backtest/summary` — all symbols combined
- All rate-limited with `rlAudit` (5/min)

**UI — Model Progress page, bottom panel:**
- Symbol tabs (AAPL/TSLA/GOOGL/MSFT/AMZN)
- KPI grid: Overall %, Bull %, Bear %, Trading Days
- Monthly accuracy bar chart (green ≥55%, red <45%)
- Regime breakdown table (neutral/cautious/fear/greed/euphoria/panic)
- Top 10 patterns by fire count with win rates
- `✓ Exact Historical Mode` badge showing VIX/F&G days loaded
- Results cached in Firestore — first run 30–60s, subsequent loads instant

---

### 2. Rate Limiting
**Commit:** `7d573c8`, `80477c7`

- Installed `express-rate-limit`
- Applied to: `/api/live-quotes` (20/min), `/api/chart` + `/api/history` (20/min), `/api/master-intelligence` (15/min), `/api/live-prediction` (15/min), `/api/brain-integrity` + `/api/brain-diagnostics` (5/min), `/api/vi/log` (10/min)
- Fixed `trust proxy: 1` for Railway reverse proxy (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
- Internal cron jobs and function calls unaffected — never go through HTTP

---

### 3. Legal Warning Popup
**Commit:** `94d3975`

- Full-screen dark red modal on first login per user
- Covers: U.S. Copyright Act (17 U.S.C. §101), CFAA (18 U.S.C. §1030), EU GDPR/DSM Directive, Berne Convention (181 nations)
- AI/bot extraction prohibition, 10%+ replication = actionable infringement
- IP monitoring disclosure (rate limiter enforces this)
- Checkbox required to unlock accept button
- Stored per Firebase UID: `vestex_legal_accepted_<uid>`
- Chains to beta popup after acceptance
- CSS: dark red theme, `.legal-modal`, `.legal-ip-box`, `.legal-agree`

---

### 4. Brand Name Cleanup
**Commit:** `0bf82d0`

- Removed all user-facing "Claude" / "Anthropic" references
- Replaced with "VESTEX AI" in: beta popup, news sentiment labels, MI tooltips, news footer
- Internal code comments unchanged

---

### 5. Brain Integrity False Positive Fixes
**Commit:** `4355d2e`

- Win rate source check: was iterating `registry` top-level keys (no `.source`), now checks `registry.entries[].tier`
- Pattern eval threshold: 40% → 25% (22 patterns are deliberately UNEVALUATABLE; neutral test inputs = 31% expected)
- CAT3 + CAT4 no longer falsely fail

---

### 6. Bug Fixes
**Commits:** `8743259`, `e9a01cb`

- **`viRefreshDashboard` duplicate** — sync version at line 3908 overwrote async version at line 3833. Sync version called `viVerifyPending()` without await, passed Promise as `log` → `.filter is not a function`. Removed duplicate.
- **`regKeys` ReferenceError** — `regKeys` was removed in win-rate rewrite but reference survived in brain-integrity response object. Fixed to `(registry.entries || []).length`.

---

## Architecture Notes
- `bt_results` is completely isolated from `vi_predictions` — backtest never touches live data
- `brain.js` `runBrainAnalysis()` signature unchanged for live callers — overrides only activate when explicitly passed
- Railway `trust proxy: 1` required for any IP-based middleware (rate limiting, logging)
- News sentiment (`sentimentCache`) runs on Claude API — if credits run out, `/api/news/headlines` RSS keyword fallback still works

---

## Commit Log (S10)
- `e9a01cb` — Fix ReferenceError: regKeys not defined in brain-integrity response
- `80477c7` — Fix rate limiter: trust proxy for Railway
- `8743259` — Fix viRefreshDashboard duplicate
- `94a92c3` — Backtest exact historical mode (VIX + F&G + seasonal month)
- `96847bc` — Historical Backtest Engine (initial build)
- `0bf82d0` — Remove Claude/Anthropic brand names from UI
- `94d3975` — Legal warning popup
- `7d573c8` — Rate limiting on data API endpoints
- `4355d2e` — Brain integrity false positive fixes

---

## News Sentiment Status
- Claude API credits were exhausted mid-session — sentiment went blank
- Credits restored — sentiment will auto-refresh at next 8am ET cron
- Manual refresh available: `GET /api/sentiment/refresh`
- Discussed: hash-based cache check before Claude calls to reduce cost at scale
- Discussed: 45-min refresh cycle during market hours (not yet built)
- Cost at 100 users: ~$0.50–1.50/month with hash check, Alpaca stays free (server-side cache = 1 call/60s regardless of user count)

---

## Next Session Checklist (IN ORDER)
1. **Run and verify backtest** — hit ▶ Run Backtest on AAPL, confirm results render correctly, check accuracy numbers make sense
2. **Hash-based sentiment cache** — skip Claude call if headlines unchanged since last fetch, reduces cost ~60–70%
3. **45-min news refresh** during market hours (8am–6pm ET Mon–Fri)
4. **VERIFIED badge on Brain Vault pattern rows** — `renderPredsFull()`: show green VERIFIED badge next to pattern name when `winRateSource === 'VERIFIED'`
5. **Admin page** — Firebase custom claims for owner account, view blocked IPs, registry stats, collection health
6. **Expand symbols** — SPY, NVDA, META, NFLX + update `add-sym` select and `LQ_SYMBOLS`
