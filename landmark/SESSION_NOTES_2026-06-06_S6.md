# VESTEX Session Notes — S6 — 2026-06-06

## Session Summary

Short session. Two things shipped: Win Rate Registry startup seed fix (registry was empty on every Railway boot), and a comprehensive mobile polish pass fixing 9 layout bugs across the MI card, portfolio intelligence cards, portfolio coach, bottom nav, and charts page.

All commits pushed. Railway live.

---

## What Was Built

### 1. Win Rate Registry Startup Seed (commit `a2b9ed6`)

**The bug:** `refreshRegistry(db)` was only called after `runVIVerification()` — which runs at 6:15pm ET via cron. Every Railway deploy left the registry empty until that cron hit, even if `vi_pattern_fires` had weeks of accumulated data in Firestore.

**The fix:** Added `refreshRegistry(admin.firestore())` call immediately after `pipelineReady = true` at server startup.

```js
// server.js — inside the Firebase init block
pipelineReady = true;
console.log('[SERVER] Firebase + pipeline initialized');
// Phase 2A: seed win rate registry from existing vi_pattern_fires on startup
refreshRegistry(admin.firestore()).catch(e => console.warn('[WinRateRegistry] Startup seed failed:', e.message));
```

**Effect:** Registry now populates from existing Firestore data every time Railway redeploys. Patterns that have accumulated ≥20 verified fires will automatically switch from DEFAULT (0.55) to VERIFIED win rates on next boot.

**User context:** User confirmed Railway env vars are already set (`FIREBASE_PRIVATE_KEY`, `ALPACA_KEY`). `pipelineReady = true` is active in production.

---

### 2. Mobile Polish — 9 Layout Fixes (commit `e0725f3`)

Added ~56 lines to the `@media(max-width:768px)` and `@media(max-width:400px)` blocks in `index.html`.

**All 9 fixes:**

| Bug | Fix |
|---|---|
| MI card meter (`180px 1fr`) jams into text on 375px screen | `mi-top` stacks vertically; meter centered |
| `pi-why-pts` floats alone bottom-left on mobile | `pi-why-bar-wrap` hidden (3px bar was invisible anyway but occupying grid slot, pushing pts to row 2) |
| All portfolio card inner sections had 22px side padding | Unified to 16px: `pi-pnl-item`, `pi-meter-wrap`, `pi-reason`, `pi-warnings`, `pi-why` |
| Coach section labels unreadable at `7px / letter-spacing:3px` | Bumped to `9px / letter-spacing:1.5px` |
| Coach expand panel cuts off at 2400px max-height | Bumped to 5000px — 7 sections + checklist + log was exceeding it |
| LP header decision badge + meta collide on narrow screens | Added `flex-wrap:wrap` to `.lp-header` |
| Chart page price `34px` + gap `28px` too large on mobile | `ci-price→26px`, `chart-info gap→12px`, `flex-wrap:wrap` |
| Bottom nav 7 labels clip on ≤400px phones | Icons-only on ≤400px: `font-size:0; letter-spacing:0` hides text, `.mob-icon` stays |
| MI decision badge `18px/padding:8px 22px` oversized | `14px / 6px 14px` on mobile |

**CSS classes modified (mobile only — desktop unchanged):**
`.mi-card`, `.mi-top`, `.mi-meter-wrap`, `.mi-decision-badge`, `.mi-cat-row`, `.mi-cat-name`, `.lp-header`, `.chart-info`, `.ci-price`, `.pi-card-head`, `.pi-pnl-item`, `.pi-meter-wrap`, `.pi-reason`, `.pi-warnings`, `.pi-why`, `.pi-why-bar-wrap`, `.pi-why-row`, `.pi-why-explain`, `.pc-coach-card`, `.pc-section-lbl`, `.pc-text`, `.pc-coach-wrap.open`, `.mob-nav-item`, `.mob-icon`

---

## File State After S6

| File | Status |
|---|---|
| `index.html` | Modified — ~4660 lines. 56 lines of mobile CSS added |
| `server.js` | Modified — startup seed line added inside Firebase init block |
| All other files | Unchanged from S5 |

---

## Commit History After S6

| Hash | Description |
|---|---|
| `e0725f3` | Mobile polish — 9 layout fixes |
| `a2b9ed6` | Win rate registry startup seed fix |
| `1c5df0d` | Portfolio Coach 7-question rewrite |
| `279b6e6` | Phase 2A win rate registry |
| `01f449b` | Brain Vault Cleanup Phase 1 |

---

## Production State

- **Railway env vars:** Set. `pipelineReady = true`.
- **Win Rate Registry:** Now seeds on startup from `vi_pattern_fires`. Check `GET /api/win-rates` after next deploy to see how many patterns have verified fire counts.
- **VI verification cron:** 6:15pm ET Mon–Fri — resolves 7d/30d outcomes and refreshes registry.
- **Portfolio Coach:** 7-question rewrite live. Cross-portfolio ranking + concentration analysis active.
- **Mobile:** 9 bugs fixed. All major pages should render cleanly on 375px+ screens.

---

## What To Check Next Session

1. **Hit `/api/win-rates`** — see how many patterns have accumulated fires and what their current tier is (ACCUMULATING vs VERIFIED). This tells us how mature the registry is.
2. **Check `/api/vi/pattern-stats`** — per-pattern fire counts and 7d win rates.
3. **Check `/api/vi/catalyst-stats`** — catalyst event type performance.
4. **Mobile test** — open on actual phone and check: MI card stacks, bottom nav icons-only on small screen, coach sections expand fully, portfolio cards aligned.

---

## Next Session Options (priority order)

### Option A — Show `winRateSource` in UI
Every scored pattern now carries `winRateSource: 'VERIFIED' | 'HAND_CODED' | 'DEFAULT'` and `winRateUses`. Show this in Brain Vault and Live Pattern cards. E.g., a small badge: `VERIFIED (23 fires)` in green next to the win rate percentage.

### Option B — Paper Trading Module
$100K simulated balance in localStorage. Buy/Sell buttons per prediction card. P&L tracking vs SPY benchmark. Would use the Portfolio tab and integrate with portfolio coach.

### Option C — Expand Tracked Symbols
Add NVDA, META, SPY, NFLX beyond AAPL/TSLA/GOOGL/MSFT/AMZN. Each new symbol needs to be added to the `STOCKS` map in index.html and the server pipeline. Server already supports dynamic symbols via `?syms=` param.

### Option D — Catalyst Stats UI
`GET /api/vi/catalyst-stats` is live but has no frontend. Build a simple table on the Model Progress page showing per-event-type win rates as they accumulate.

### Option E — Mobile: further polish
- Prediction cards: check if `mi-stabs` (symbol tabs in MI page) scrolls correctly
- Portfolio: test coach expand on actual iPhone
- Dashboard KPI values might overflow on very small screens

---

## Standing Rules (never violate)

- **Do not add new patterns**
- **Do not change pattern logic**
- **Do not change LPMS formula**
- **Do not touch masterScore, consensusScore computation paths**
- **Catalyst = confidence modifier only (±20 pts max)**
- **Single-file rule: index.html stays one file**
- **`vi_pattern_fires` field is `patternId` (camelCase) — not `pattern_id`**

---

## Claude Behavior Patterns This Session

### What worked well
- **Reading all mobile CSS blocks before writing** — there were 5 separate `@media` blocks. Grepping for `@media` first gave the full map before touching anything.
- **Identifying the `pi-why-pts` row-wrap bug from CSS alone** — desktop was `18px 130px 1fr 62px 42px` (5 cols), mobile override was `18px 1fr auto auto` (4 cols), 5 items = 5th wraps. No guessing needed.
- **One consolidated patch** — added one clean `/* MOBILE POLISH — S5 */` block rather than scattering fixes across existing blocks. Easier to read and revert.
- **Hiding `pi-why-bar-wrap` rather than fighting the grid** — the bar is visually invisible on mobile anyway (3px height, 0px auto width). Removing it from flow was cleaner than trying to fit it in a 4-col layout.
- **Registry startup seed was a 2-line fix** — diagnosed correctly (cron-only refresh), single targeted edit, done.

### Patterns to repeat
- Before any mobile CSS work: grep `@media` to get line numbers of all breakpoint blocks — understand what's already handled vs what's missing
- For grid layout bugs on mobile: count children vs column count. If children > columns, items wrap — that's usually the bug.
- When adding mobile CSS: label the block with a comment and date so future sessions can find it quickly
- `max-height` on expand panels: count the actual content. 7 sections × ~200px avg + checklist (~300px) + log (~200px) + coach card padding = ~1800–2500px minimum. Always add 2× buffer.

### Mistakes to avoid
- Don't assume the existing mobile CSS is complete — it was written incrementally and misses most of the portfolio intelligence components
- Don't touch `font-size` on `.mob-nav-item` text without also zeroing `letter-spacing` — letter-spacing on 0-size text still adds whitespace
- When the user says "keys are already set" — don't re-explain Railway setup. Diagnose what else could be blocking the feature and fix it.
