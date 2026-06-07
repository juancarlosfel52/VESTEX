# VESTEX Session Notes — S5 — 2026-06-06

## Session Summary

Four systems shipped this session: Brain Vault Cleanup Phase 1 (disabled 6 structurally broken patterns), Phase 2A Win Rate Registry (automatic verified→hand-coded→default resolution hierarchy), Catalyst Verification Architecture (carried from S4 summary), and a full Portfolio Coach rewrite replacing generic market commentary with 7 portfolio-specific decision questions.

All 4 commits pushed to Railway. Live.

---

## What Was Built

### 1. Brain Vault Cleanup Phase 1 (commit `01f449b`)

Disabled 6 patterns with structural errors or redundancy. No pattern logic changed, no patterns added.

**Patterns added to UNEVALUATABLE:**

| Pattern | Function | Reason |
|---|---|---|
| `INSIDER_BUY` | `matchCompany` | EDGAR Form 4 has no direction field — was firing bullish on insider sells |
| `time_series_momentum` | `matchResearch` | Functional duplicate of PATTERN_001 (Golden Cross, win_rate=68) |
| `january_effect` | `matchResearch` | Direct duplicate of PATTERN_028 (January Effect, win_rate=62) |
| `volatility_mean_reversion` | `matchResearch` | 4th system on VIX>35 — VIX_SPIKE + PATTERN_037 + CAPITULATION already cover it |
| `fda_approval` | `matchNews` | Tracked symbols (AAPL/TSLA/GOOGL/MSFT/AMZN) are not pharma/biotech |
| `fda_rejection` | `matchNews` | Same reason |

**UI label fixed:** `index.html` sec-sub changed from "How accurate our predictions have been this week" → "Brain Vault activity and verified prediction outcomes" — old label implied unverified accuracy.

**Signal coverage check:** Confirmed every disable is safe before touching code. Each disabled pattern had either a structural error (wrong direction data) or full coverage from a pattern with a real win_rate.

---

### 2. Phase 2A — Win Rate Registry (commit `279b6e6`)

New file: `winRateRegistry.js`. Singleton module. No Firestore import — server.js controls when it refreshes.

**Resolution hierarchy:**
1. **VERIFIED** — ≥20 verified fires in `vi_pattern_fires` (7d window) → uses real measured win rate
2. **HAND_CODED** — developer-set `pattern.win_rate` field → converted to decimal (÷100)
3. **DEFAULT** — 0.55 fallback

**Key design decisions:**
- Registry is a pure singleton — no Firestore in the module itself
- `refreshRegistry(db)` called by server.js after every `runVIVerification()` cycle
- `resolveWinRate(patternId, handCodedWinRate)` returns `{ rate, source, uses }` — source label always travels with the rate
- `_resolvedRate` stored on every `mkMatch()` output so `patternScore()` uses it without double-resolving

**Files modified:**

| File | Change |
|---|---|
| `winRateRegistry.js` | New — singleton registry, resolveWinRate, refreshRegistry, getRegistrySnapshot |
| `livePatternMatcher.js` | `computeHistoricalWinRate()` now returns `{ rate, source, uses }`. `scoreOnePattern()` attaches `winRateSource` + `winRateUses` to every output |
| `brain.js` | `mkMatch()` calls `resolveWinRate()` at fire time, stores `_resolvedRate + winRateSource + winRateUses`. `patternScore()` uses `_resolvedRate` when available |
| `server.js` | Imports registry. Calls `refreshRegistry(db)` after VI verification. Adds `GET /api/win-rates` endpoint |

**Automatic promotion:** When a pattern accumulates ≥20 verified fires, the engine promotes it to VERIFIED tier with zero code changes required.

**Inspection:** `GET /api/win-rates` returns full registry state — which patterns are ACCUMULATING vs VERIFIED, uses count, current rate.

---

### 3. Portfolio Coach Rewrite (commit `1c5df0d`)

**Old:** 5 generic sections explaining the stock (Why This Action, What To Watch, Beginner Lesson, Discipline Rule, Changes).

**New:** 7 portfolio-specific sections explaining what to DO with the stock inside the user's portfolio.

**`piCoachData(pos, allPositions)` now returns:**

| Field | Content |
|---|---|
| `verdict` / `verdictColor` | ADD / ADD SMALL / HOLD / AVOID / TRIM / TRIM EXIT — with action color |
| `ownIt` | Action-specific advice for existing holders with P&L context baked in |
| `cash` | Explicit yes/no with concrete sizing guidance per action tier |
| `improve[]` | Specific confidence thresholds, price levels, regime conditions — ▲ green |
| `worsen[]` | Downgrade triggers in same format — ▼ red |
| `impact` | Concentration % of total portfolio value, P&L drag/contribution note, sizing warning |
| `rank` | Ranked #N of N by actual return. Falls back to confidence rank if no P&L data |

**Call site:** `piCoachData(p, positions)` — `positions` is the full array from `renderPortfolioIntelligence()`, enabling cross-position ranking and concentration math.

**Concentration logic:** Computes `thisValue / totalPortVal * 100`. Labels: >35% = concentrated, >20% = significant, ≤20% = moderate. Adds add/trim note based on action + threshold.

**Ranking logic:** Sorts all positions by `profitLossPct` descending. Returns rank label: "your best-performing" / "one of your stronger" / "mid-tier" / "one of your weaker" / "your weakest". Falls back to confidence sort if P&L unavailable.

---

## File State After S5

| File | Status |
|---|---|
| `index.html` | Modified — ~4600 lines. Coach rewrite + UI label fix |
| `brain.js` | Modified — 6 UNEVALUATABLE additions + winRateRegistry require |
| `livePatternMatcher.js` | Modified — resolveWinRate wired into computeHistoricalWinRate + scoreOnePattern |
| `server.js` | Modified — refreshRegistry hook + /api/win-rates endpoint |
| `winRateRegistry.js` | New file |
| `catalystEngine.js` | No changes this session |
| `masterIntelligence.js` | No changes this session |

---

## Commit History After S5

| Hash | Description |
|---|---|
| `1c5df0d` | Portfolio Coach rewrite — 7 portfolio-specific questions |
| `279b6e6` | Phase 2A win rate registry |
| `01f449b` | Brain Vault Cleanup Phase 1 — 6 patterns disabled + UI label |
| Previous S4 commits | Smart Help Tooltips, Portfolio Learning Coach initial build |

---

## Architecture Notes

### Win Rate Resolution (permanent)
Every pattern that fires now carries `winRateSource: 'VERIFIED' | 'HAND_CODED' | 'DEFAULT'` and `winRateUses: number`. These travel through:
- `scoreOnePattern()` output (livePatternMatcher.js)
- `mkMatch()` output (brain.js)
- Any UI that consumes LP or Brain Vault results can display the source label

### Brain Vault UNEVALUATABLE Sets (3 locations)
- `matchCompany` — contains: EARN_BEAT_LARGE, EARN_BEAT_SMALL, EARN_MISS, GUIDANCE_RAISE, GUIDANCE_CUT, HIGH_SHORT_INTEREST, INSIDER_BUY
- `matchResearch` — contains: small_cap_premium, value_premium, pead_earnings_drift, profitability_factor_rmw, investment_factor_cma, cape_valuation_signal, time_series_momentum, january_effect, volatility_mean_reversion
- `matchNews` — contains: earnings_beat_large, earnings_miss_large, guidance_raised, guidance_cut, fda_approval, fda_rejection

### DEFAULT_WIN_RATE = 0.55
Still used as the Tier 3 fallback in `winRateRegistry.js`. Also kept in `livePatternMatcher.js` for the filter at line 770 (`p.components.winRate > DEFAULT_WIN_RATE`). Both references are intentional.

---

## Standing Rules (never violate)
- **Do not add new patterns**
- **Do not change pattern logic**
- **Do not change LPMS formula**
- **Do not touch masterScore, consensusScore computation paths**
- **Catalyst is a confidence modifier only (±20 pts max) — never touches masterScore**
- **Single-file rule: index.html stays one file**

---

## Next Session Options (priority order)

### Option A — Railway Env Vars + Firestore (blocks VI accumulation)
Without `FIREBASE_PRIVATE_KEY` + `ALPACA_KEY` set in Railway, `pipelineReady = false` and the win rate registry never accumulates real data. This is the blocker for Phase 2A to activate.
1. Add env vars in Railway dashboard
2. Test `/api/win-rates` returns data
3. Watch VI verification cycle run at 6:15pm ET

### Option B — Feed Verified Win Rates Into Display
Once Phase 2A is running, show `winRateSource` label on each pattern in the Brain Vault and Live Pattern cards. "VERIFIED (23 fires)" vs "HAND CODED" vs "DEFAULT".

### Option C — Paper Trading Module
- $100K simulated balance in localStorage
- Buy/Sell buttons per prediction card
- Portfolio of simulated positions with P&L tracking vs SPY

### Option D — Expand Tracked Symbols
- Add NVDA, META, SPY, NFLX beyond current 5
- Symbols must be added to `STOCKS` map + server pipeline

### Option E — Catalyst Stats UI
`GET /api/vi/catalyst-stats` is live but has no frontend. Show per-event-type win rates as they accumulate.

---

## Claude Behavior Patterns This Session

### What worked well
- **Audit before build:** Every major change started with a full read of the affected function. No edits made on assumed structure.
- **Hierarchy-first design:** Win Rate Registry was designed as a 3-tier hierarchy before any code was written. The architecture was the decision — code was just the implementation.
- **Signal coverage check before disabling patterns:** Confirmed every replacement pattern existed and had a real win_rate before touching UNEVALUATABLE sets. Never disabled blindly.
- **Singleton pattern for registry:** Keeping Firestore out of `winRateRegistry.js` entirely and having server.js own the refresh cycle was the right boundary. Brain.js and livePatternMatcher.js stay pure.
- **`_resolvedRate` on mkMatch output:** Stored the resolved decimal on the pattern object so `patternScore()` doesn't call `resolveWinRate()` twice. Small but correct.
- **allPositions passed as argument:** Instead of accessing a global, `piCoachData` takes `allPositions` as a parameter. Makes it testable and makes the data flow explicit.

### Patterns to repeat
- Read the exact UNEVALUATABLE sets before editing — there are 3 separate sets in 3 separate functions in brain.js
- When disabling patterns: document the reason in a comment at the exact line. Future Claude sessions will need to understand why.
- For cross-position computations: pass the full positions array as an argument rather than closing over a global
- Compute `verdictColor` and `verdict` together in the same `if/else` block — keeps them in sync
- Build improve[] and worsen[] as arrays, join in template with `.map().join('')` — cleaner than long string concatenation
- For registry/cache modules: always include a `getRegistrySnapshot()` function so state can be inspected via API without reading code

### Mistakes to avoid
- Do not read `vi_pattern_fires` docs expecting `pattern_id` field — the actual field name is `patternId` (camelCase, set at line 796 in server.js)
- Do not pass `positions` from outer scope to `piCoachData` via closure — pass it explicitly so the dependency is visible
- When the summary triggers mid-task: check which edits were made and which are still pending before writing new code. The summary said INSIDER_BUY was done — confirmed via Grep before editing matchResearch.
- Do not change `p.holdLabel` / `p.holdNote` display in coach card — these come from `piCalcPosition` and are computed correctly. The coach rewrite removed them from the header, which was intentional.

### User working style
- Gives multi-step specs as "Execute Phase X" — expects all steps in one pass, no confirmation per step
- "Do not add patterns / change logic / change LPMS" is a standing rule, not a per-session instruction
- "Push it" = immediate `git push origin main`, no recap needed
- Landmark + session notes requested at end of each session — write them, then update MEMORY.md
