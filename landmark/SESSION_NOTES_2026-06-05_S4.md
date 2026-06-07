# VESTEX Session Notes — S4 — 2026-06-05

## Session Summary
Two major UI features shipped: Smart Help Tooltips (gold ? buttons across 11 locations) and the Portfolio Learning Coach (full beginner education system inside My Portfolio). Both committed and live on Railway.

---

## What Was Built

### 1. VESTEX Smart Help Tooltips (commit `a4dbc2a`)
Gold `?` circle buttons added across 11 locations. Clicking any opens a dark glass popup card.

**Popup behavior:**
- Fade + scale-in animation
- 90s auto-close with animated progress bar countdown
- Hover/touch pauses the timer
- ESC, outside click, or ✕ button all dismiss
- `role="dialog"`, `aria-modal`, focus management, `prefers-reduced-motion` respected

**10 help topics in `HELP_CONTENT` map:**
| Key | Location |
|-----|----------|
| `price_chart` | Dashboard Price History header |
| `market_health` | Market Sentiment panel + MI health bar |
| `macro_conditions` | Macro Conditions panel |
| `verify_quotes` | Topbar Verify Live Quotes button |
| `portfolio_kpis` | Portfolio page header |
| `portfolio_intel` | Portfolio Intelligence panel title |
| `prediction_card` | Each prediction card header (dynamic) |
| `brain_vault` | Brain Vault section (dynamic) |
| `live_prediction` | Live Pattern Analysis trigger (dynamic) |
| `master_intelligence` | Master Intelligence card name (dynamic) |

**CSS classes:** `.sh-btn`, `.sh-overlay`, `.sh-card`, `.sh-card-bar`, `.sh-prog-wrap`, `.sh-prog-bar`
**JS functions:** `showSmartHelp(topicKey)`, `closeSmartHelp()`, `_shStartTimer()`, `_shClearTimer()`

---

### 2. Portfolio Learning Coach (commit `296065e`)
Entire My Portfolio page upgraded into a beginner investing teacher. All data sourced from live portfolio, serverPreds, STOCKS, brain, indicators — no fake data.

**Per-position coach section (inside each pi-card):**
- Gold toggle button: `◆ Portfolio Coach — What Should I Do With TSLA?`
- Smooth max-height expand animation
- Contains 6 sub-sections:

| Sub-section | Source |
|-------------|--------|
| Suggested Action badge | `p.action` (existing) |
| Recommended Hold | `p.holdLabel` + `p.holdNote` |
| Why This Action | `piCoachData()` — uses action + confidence + pnlPct |
| What To Watch Next | `piCoachData()` — computes `cp * 1.035` / `cp * 0.965` price levels |
| What Would Change The Decision | `piCoachData()` — dynamic thresholds from confidence ± 12/15 |
| Beginner Lesson | `piCoachData()` — per action type |
| Discipline Rule | `piCoachData()` — per confidence/risk/action combo |

**Action Readiness Checklist:**
- 4 checkboxes — ALL must be checked to unlock log buttons
- Log buttons fade in (`pcFadeIn` keyframe) only when all 4 checked
- 4 actions: Planned Buy / Hold / Sell / Take Profit

**Learning Decision Log:**
- Saves to `localStorage` key: `vestex_learn_{sym}` (e.g. `vestex_learn_TSLA`)
- Entry schema: `{ date, planned, price, confidence, result:null }`
- Shows last 5 entries; stores up to 20
- Slide-in animation on new entry (`pcSlideIn` keyframe)
- Save button glows briefly (`pcBtnGlow` keyframe)

**VESTEX Portfolio Rules:**
- Collapsible section at bottom of Portfolio Intelligence
- 10 numbered investing principles
- Toggle: `vrToggleRules()` → max-height expand on `#vr-body`

**New functions added:**
- `piCoachData(pos)` — returns `{ why, watch, changes[], lesson, rule }` from live position data
- `pcRenderLog(sym)` — renders log HTML from localStorage
- `pcLoadLog(sym)` — safe JSON.parse from localStorage
- `pcToggleCoach(sym)` — expand/collapse coach wrap
- `pcChecklistChange(sym)` — reveals action buttons when all 4 checked
- `pcLogDecision(sym, planned)` — saves entry + refreshes log display + glows button
- `vrToggleRules()` — toggles VESTEX Rules section

**New CSS classes:** `.pc-coach-toggle`, `.pc-coach-chevron`, `.pc-coach-wrap`, `.pc-coach-card`, `.pc-section`, `.pc-section-lbl`, `.pc-text`, `.pc-changes`, `.pc-change-item`, `.pc-lesson`, `.pc-rule`, `.pc-checklist`, `.pc-check-item`, `.pc-action-btns`, `.pc-action-btns-row`, `.pc-log-btn`, `.pc-log-wrap`, `.pc-log-item`, `.pc-log-empty`, `.vr-wrap`, `.vr-toggle`, `.vr-chevron`, `.vr-body`, `.vr-rules`, `.vr-rule`, `.vr-rule-num`

---

## Bug Fixed (from S3 carryover)
- `toUpperCase` crash on AAPL live pattern analysis — all 6 chart pattern objects in `analyzeChartStructure` were missing `category` field. Fixed: added `category:'chart'` + safety guard `(p.category||'chart').toUpperCase()`
- Portfolio invested value showing $27.29 — user had entered data backwards. Fixed: inline edit on Invested cell, click to correct, auto-recalculates `shares = invested / buy`

---

## File State After S4

| File | Status |
|------|--------|
| `index.html` | Modified — ~4500+ lines. Contains all CSS, HTML, and JS in one file |
| `livePatternMatcher.js` | No changes this session |
| `server.js` | No changes this session |
| `masterIntelligence.js` | No changes this session |
| `brain.js` | No changes this session |

---

## Current Commit History
- `296065e` — Portfolio Learning Coach
- `a4dbc2a` — Smart Help Tooltips
- `f9323fa` — Portfolio inline invested edit
- `69ef771` — toUpperCase crash fix (category field on chart patterns)

---

## Architecture: index.html Structure
Single-file app. Key sections in order:
1. `<style>` — all CSS (~400 lines after S4 additions)
2. HTML pages: `#page-dashboard`, `#page-charts`, `#page-predictions`, `#page-portfolio`, `#page-news`, `#page-progress`, `#page-master`
3. `<script>` — all JS (begins ~line 1660)
   - `STOCKS`, `portfolio`, `serverPreds` — module-level state
   - `renderPortfolio()` → calls `renderPortfolioIntelligence()`
   - `renderPortfolioIntelligence()` — builds full PI section including cards
   - `piCalcPosition(holding)` — computes all position data for a holding
   - `piCoachData(pos)` — NEW: computes coach content
   - `pc*` functions — NEW: coach interactivity
   - `renderPredsFull()` — builds prediction cards (dynamic HTML with `${}`)
   - `fetchLivePrediction(sym)` / `renderLivePrediction(sym, d)` — live pattern UI
   - `buildLivePrediction()` — in `livePatternMatcher.js` (imported)
   - `showSmartHelp(topicKey)` / `closeSmartHelp()` — NEW: help system
   - `HELP_CONTENT` map — NEW: 10 help topics

---

## Next Session Options (priority order)

### Option A — Railway Env Vars + Firestore (backend)
Required to make predictions persistent and production-ready:
1. User adds env vars in Railway dashboard
2. Enable Firestore in Firebase Console
3. Run pipeline to back-test 5Y data
4. Wire `/api/predictions` + `/api/accuracy` into frontend

### Option B — Paper Trading Module
- $100K fake balance in localStorage
- Buy/Sell buttons per prediction card
- Portfolio of simulated positions
- P&L tracking vs SPY benchmark

### Option C — More Symbols
- Expand beyond AAPL/TSLA/GOOGL/MSFT/AMZN
- Add NVDA, SPY, META, NFLX
- Auto-discover from portfolio additions

### Option D — Smart Alerts
- Set price target alerts
- Stored in localStorage
- Banner notification when target hit on next price refresh

---

## Claude Behavior Patterns This Session

### What worked well
- Reading `piCalcPosition` and `renderPortfolioIntelligence` in full before writing any code — prevented field name mistakes
- Using Plan subagent to get exact existing line content before editing (avoids mismatch in Edit tool)
- Building `piCoachData` as a separate pure function instead of cramming logic into the card template — keeps `renderPortfolioIntelligence` readable
- Using `max-height` CSS transition for smooth expand/collapse instead of JS animation — simpler and more reliable
- Defining `coachSection` as a resolved template string variable before the `return` statement — avoids deeply nested backtick issues

### Patterns to repeat
- For large card/template changes: compute all variables first (`const coach`, `const logHtml`, `const chgItems`), then compose the `coachSection` string, then insert `${coachSection}` into the return template. Keeps nesting flat.
- For dynamic HTML in `renderPredsFull` / `renderPortfolioIntelligence`: always check what variables are in scope before writing `${}` expressions
- Plan subagent for "read exact text" tasks before doing Edit — prevents the Edit tool failing on mismatched old_string
- Auto-push after confirmed working commit (user preference: show command first, auto-push only if "take over" said — but user said "push it now" both times this session, meaning push immediately on request)

### Mistakes to avoid
- Never add `category` field to pattern objects after the fact — add it at definition time in `analyzeChartStructure`
- When user says portfolio value is wrong: read the `piCalcPosition` function first before assuming a calculation bug — the issue was input data, not code
- Don't split a single-file app into multiple files unless explicitly requested

---
