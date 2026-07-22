# ENGINE V2 SHADOW — PHASE 1 IMPLEMENTATION REPORT
**Date:** 2026-07-21 (session continuing S16+)
**Commit:** `7e7bf72` — feat(engine-v2): shadow engine phase 1
**Status:** Implemented, smoke-tested, committed. NOT pushed. NOT making production decisions.

> *"No engine earns authority by sounding smarter; every engine earns authority by outperforming previous engines on the same verified historical ledger."*

---

## 1. What Was Built

Engine V2 runs as a **shadow** beside Engine V1 on every Master Intelligence computation. It changes exactly ONE thing: the Brain→MI translation layer. Everything else — the other 6 subsystems, weights, ATR penalty, decision thresholds, confidence engine — is byte-identical to V1.

**V1 stays the sole production decision-maker.** V2 is computed, logged, and explained — never acted on.

### The single variable under test
| | V1 (control) | V2 (shadow) |
|---|---|---|
| Brain input | `activePercent` (one number, ~80% info loss) | `calcBrainScoreBreakdown` (7 per-category weighted scores) |
| Formula | `activePercent/100 × 20 × conflictDamp × dirMult` | `clamp(10 + Σclamp(weighted, ±0.4) × 12.5, 0, 20)` |
| Neutral | 0 (no patterns = worst score) | 10 (no signal = midpoint, not bearish) |
| Direction | Post-hoc multiplier | Native — weighted scores are already signed by pattern direction × verified win rate |

### Design rationale
- **Neutral midpoint 10/20** — absence of Brain evidence should be neutral, not punitive. V1's 0-default structurally suppressed masterScore (part of the ~55 ceiling found in the Saturation Audit).
- **Per-category clamp ±0.4** — no single category can dominate; also the attachment point for future Trust Tiers (tier multiplies the clamp, see §8).
- **Scale K=12.5** — maps a full-clamp single category (±0.4) to ±5 pts, all seven to the full 0–20 band.
- **Identical thresholds/ATR/weights** — clean single-variable experiment. Any V1↔V2 outcome difference on the ledger is attributable to Brain translation alone.

---

## 2. Architecture / Data Flow

```
                      ┌────────────── brain.js (UNTOUCHED) ──────────────┐
                      │ calcBrainScoreBreakdown → per-category weighted  │
                      └───────────────┬──────────────────────────────────┘
                                      │ brainResult.brainVault.scoreBreakdown
        masterIntelligence.js buildMasterIntelligence()
        ┌─────────────────────────────┼─────────────────────────────┐
        │  V1 PATH (production)       │       V2 PATH (shadow)      │
        │  calcBrainScore             │  calcBrainScoreV2   [NEW]   │
        │  (activePercent × 20)       │  (breakdown → 10 + Σ×12.5)  │
        │        ↓                    │        ↓                    │
        │  masterScore → decision     │  masterScoreV2 → decisionV2 │
        │  confidence, risk, holdTime │  divergence (if decisions   │
        │  ── ALL UI + ALL ACTIONS ── │   differ: why, per-category)│
        └─────────────┬───────────────┴──────────┬──────────────────┘
                      │ return { ...v1 fields, engineV2: {...} }
                      ↓
        index.html viLogPrediction ──POST──> server.js /api/vi/log
                      ↓
        Firestore vi_predictions doc gains 8 additive fields
                      ↓
        runVIVerification (UNTOUCHED) fills verification7d/30d
                      ↓
        THE LEDGER JUDGES: same actual price outcome scores
        decisionV1 AND decisionV2 on identical verified history
```

Pipeline path (`pipeline.js`) unchanged except one additive label: `decisionSource: 'pipeline-direction'` — distinguishes pipeline direction-mapped rows from MI engine rows in future ledger queries.

---

## 3. Files Modified (112 insertions, 0 deletions)

| File | Lines | Change |
|---|---|---|
| masterIntelligence.js | +93 | `calcBrainScoreV2` + `decisionFromScore` (new fns, ~line 131); shadow block inside `buildMasterIntelligence` (V2 score, decision, divergence); additive `engineV2` return field |
| server.js | +9 | `/api/vi/log` accepts/stores 8 V2 fields, all `?? null` |
| index.html | +9 | `viLogPrediction` sends `d.engineV2.*` fields, `decisionSource:'engine-v1'` |
| pipeline.js | +1 | `decisionSource: 'pipeline-direction'` label |

**Files NOT touched:** brain.js, verification systems (both), signalPerformance, pattern registry, cron schedules, thresholds, any V1 field.

---

## 4. Database Changes (additive, no migration)

New fields on **new** `vi_predictions` docs only (historical docs untouched — reads use `?? null` semantics everywhere V2 fields would be consumed):

```
engineVersion:  'v2.0-shadow-1' | null     decisionSource: 'engine-v1' | 'pipeline-direction'
masterScoreV2:  number | null              brainScoreV1:   number | null
brainScoreV2:   number | null              confidenceV2:   number | null  (Phase 1: = V1)
decisionV2:     string | null              divergence:     object | null
```

`divergence` (only when decisionV1 ≠ decisionV2): `{ decisionV1, decisionV2, brainScoreV1, brainScoreV2, brainDelta, masterDelta, categories (per-cat weighted/clamped/matched), note }` — permanent record of WHY the engines disagreed.

Pipeline-sourced rows have V2 fields null (pipeline has no MI context) but are now labeled by `decisionSource`.

---

## 5. Self-Review Checklist (Constitution)

| Check | Result |
|---|---|
| V1 code byte-identical? | ✅ `git diff`: 0 deletions across all 4 files; calcBrainScore, thresholds, confidence untouched |
| Historical data unchanged? | ✅ No migration, no backfill, no rewrites; skip-if-exists preserved |
| Production decisions unchanged? | ✅ `decision`, `confidence`, `risk`, `holdTime` all still derive from V1 masterScore |
| V2 logged independently? | ✅ `engineV2` block + 8 Firestore fields |
| Verification systems untouched? | ✅ Both System A and System B unmodified |
| Performance acceptable? | ✅ 7-key loop + arithmetic per prediction — microseconds; no new API calls, no new reads |
| DB compatible? | ✅ Firestore schemaless; all fields `?? null`; old docs render fine |
| Degraded inputs safe? | ✅ Tested: null brainResult → V2 neutral 10; missing breakdown → neutral 10 + note |

## 6. Smoke Tests (executed)

- Normal fixture: V1 35/WAIT, V2 44/WAIT, no divergence (correct — same band)
- Divergence fixture: V1 30/SELL, V2 46/HOLD → divergence object fired with note "V1 activePercent gave 4/20, V2 breakdown gave 20/20 (Δ16.0)" ✅
- No breakdown → brainScoreV2 = 10 neutral ✅ | Null brain → 10, no crash ✅
- Extreme weighted values (5.0/category) → clamped, capped at 20 ✅
- `node --check` all 3 JS files ✅

**Pending live verification (next session / after deploy):**
1. Deploy → hit `/api/master-intelligence?symbol=AAPL` → confirm `engineV2` block in response
2. Next viLogPrediction → confirm V2 fields in new vi_predictions doc (`GET /api/db-integrity` + Firestore console)
3. After ~1 week: query V1 vs V2 decision distribution + divergence count

---

## 7. Promotion Criteria (the ledger judges)

V2 earns authority ONLY by outperforming V1 on the same verified ledger. Suggested gate (evaluate after ≥30 dual-logged predictions with 7d verification, ideally 60+):

1. **Directional accuracy:** V2 decisions ≥ V1 decisions on verification7d hit-rate (BUY-family → up ≥1%, SELL-family → down, HOLD/WAIT → |move| behavior)
2. **Divergence quality:** on prediction days where engines disagreed, V2's call verified correct more often than V1's
3. **No new pathology:** V2 must not saturate the opposite way (e.g., everything BUY); decision distribution reviewed
4. **Sample floor:** minimum 30 verified divergent-or-not predictions; no promotion on anecdotes

Promotion itself = Phase 3 decision, user-approved, single flag flip (`decisionSource: 'engine-v2'`) — V1 keeps logging forever as the control.

## 8. Trust Tiers (PREPARED, not active)

The per-category clamp is the socket. Future: `clamp_k = BASE_CLAMP × tierMultiplier(category)` where tier derives from that category's verified win-rate history (e.g., ledger-proven categories like technical/RSI-oversold family earn 1.5×; falsified ones like EXTREME_FEAR psychology earn 0.5×). Nothing reads tiers yet; activating requires only a multiplier table + ledger query. No code stub was added — deliberately, to keep Phase 1 minimal.

## 9. Portfolio Intelligence (design only, per Constitution)

Not built. Architecture note: once V2 divergence data + verified ledger accumulate, a Portfolio layer would consume `decisionV2 + confidenceV2 + risk` to size positions — never to override entry decisions. Exit Engine explicitly out of scope.

## 10. Known Limitations

1. **confidenceV2 = confidenceV1** in Phase 1 — confidence engine consumes V1 brain internally; splitting it is Phase 2 (would touch buildConfidenceBreakdown, deferred to keep this additive-minimal)
2. **Pipeline rows carry no V2 data** — pipeline path never runs MI; V2 coverage = frontend-visit predictions only (~same coverage as masterScore field today)
3. **K=12.5 and ±0.4 clamp are designed constants, not fitted** — the whole point: the ledger will tell us if the mapping is right
4. **systemVotes/contributors/explanations remain V1-only** — UI shows V1; V2 is invisible to users by design in Phase 1
5. **Divergence stored only at prediction time** — no retroactive divergence for historical docs (correct: history is sacred)

---

## Behavior Rules for Next Claude
- V1 is **frozen forever** as scientific control — never modify calcBrainScore or thresholds
- V2 lives in masterIntelligence.js ~line 118–157 (translation) + shadow block in buildMasterIntelligence
- All V2 constants at top of the V2 block: `BRAIN_V2_CAT_CLAMP`, `BRAIN_V2_SCALE`, `ENGINE_V2_VERSION`
- Bump `ENGINE_V2_VERSION` on ANY V2 formula change so ledger rows are attributable
- Promotion requires ledger evidence per §7 + explicit user approval
