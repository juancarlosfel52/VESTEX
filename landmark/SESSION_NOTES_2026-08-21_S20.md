# VESTEX — Session Notes S20
## The 08-19 milestone audit: Day 0 matured, and the ruler was found to be broken

**Date:** 2026-08-21 (ET)
**Deployed SHA:** `5dc4ef8` (unchanged) · **Rollback SHA:** `b68b429`
**Code touched this session:** none. Read-only audit.
**Outcome:** `EXPERIMENT HEALTHY — MEASUREMENT SYSTEM INADEQUATE — PROMOTION GATE REDEFINED`

---

## §0 — READ THIS FIRST

Four facts:

1. **The shadow experiment is working.** 35/35 clean automatic dual-engine records across
   seven consecutive trading days (2026-08-12 → 2026-08-20). Zero browser dependency.
   This is the thing that took 70 days to achieve. **Do not contaminate it.**
2. **Day 0 matured and resolved.** Validated observations 5 → 10 resolved, 25 pending.
   Result: `v1_better 0, v2_better 0`.
3. **That 0–0 is not a tie — it is a measurement failure.** WAIT and HOLD are the same
   `holdFamily` in the grading rules, and **all 9 divergences ever recorded are WAIT→HOLD**.
   Divergence rows are mathematically incapable of scoring `v1_better` or `v2_better`. See §2.
4. **The 30-observation promotion gate is retired** as a sufficient condition. New gate in §7.

Work order set by the owner, this session forward: **S20 doc → evaluation protocol design →
security endpoints → journal timing → freeze and collect.** No V3. No new Brain mathematics.
No threshold changes.

---

## §1 — Day 0 matured (2026-08-12 cohort)

7d window closed. Resolver ran 2026-08-20 22:35 UTC.

| Sym | V1 | V2 | Divergent | 7d ret | SPY-rel | winner |
|---|---|---|---|---|---|---|
| AAPL  | WAIT 41 | HOLD 47 | yes | +3.01% | +4.28 | both_correct |
| TSLA  | WAIT 40 | HOLD 46 | yes | +6.01% | +7.28 | both_wrong |
| GOOGL | HOLD 48 | HOLD 53 | no  | −0.87% | +0.40 | tie |
| MSFT  | HOLD 49 | HOLD 53 | no  | −2.28% | −1.01 | tie |
| AMZN  | HOLD 51 | HOLD 55 | no  | −2.72% | −1.45 | tie |

`validatedTotals` now: `both_correct 1, both_wrong 2, tie 7, pending 25, excluded 65`
(`V2_NOT_CAPTURED 60`, `V2_INSTRUMENT_ARTIFACT 5`).

**Validated resolved observations: 10.** Pending 25 (08-13, 08-14, 08-17, 08-18, 08-19).

Note TSLA: +6.01% over 7 days and **both engines were graded wrong** — the neutral band is
5%, so a 6% move falsifies both HOLD and WAIT. The engines were not wrong about direction;
they were wrong about magnitude. The current ruler cannot express that distinction either.

---

## §2 — THE FINDING: the promotion gate cannot return a verdict

`comparisonRules` (version 1, baked into every journal doc):

```
buyFamily  : STRONG BUY, BUY, BUY SMALL      buyCorrectThreshold  :  +1%
sellFamily : SELL, STRONG SELL               sellCorrectThreshold :  −1%
holdFamily : HOLD, WAIT                      neutralBandPct       :   5%
```

**WAIT and HOLD share one family and therefore one correctness test (|ret| ≤ 5%).**

Every divergence in the ledger, all nine:

| Date | Sym | Divergence | Winner | 7d ret |
|---|---|---|---|---|
| 2026-08-19 | TSLA  | WAIT→HOLD | pending | — |
| 2026-08-17 | AAPL  | WAIT→HOLD | pending | — |
| 2026-08-17 | AMZN  | WAIT→HOLD | pending | — |
| 2026-08-17 | GOOGL | WAIT→HOLD | pending | — |
| 2026-08-14 | TSLA  | WAIT→HOLD | pending | — |
| 2026-08-13 | GOOGL | WAIT→HOLD | pending | — |
| 2026-08-12 | AAPL  | WAIT→HOLD | both_correct | +3.01% |
| 2026-08-12 | TSLA  | WAIT→HOLD | both_wrong   | +6.01% |
| 2026-07-31 | AMZN  | WAIT→HOLD | both_wrong   | +7.49% |

100% intra-family. A WAIT→HOLD row can only ever resolve to both_correct, both_wrong, or
tie. `v1_better` and `v2_better` are unreachable states for the only rows where the engines
actually disagree.

**Consequence:** the ledger can reach 30 validated observations and report 0–0. That is not
evidence of equivalence. It is a ruler with no markings in the region being measured.

---

## §3 — Why this is structural, not a run of bad luck

Across all 35 validated dual rows:

```
masterScoreV2 − masterScoreV1 :  min +3   max +7   mean +5.49
negative deltas               :  0  (zero, out of 35)
brainScore V1 → V2            :  ~4.7 → ~11.2  (roughly doubles)
```

**V2 is a uniform upward shift, not a re-ranking.** No row was ever moved down. V1's live
score band is 37–54; a rigid +5.5 shift inside that band can cross exactly one decision
threshold — WAIT(35) → HOLD(45) — which is precisely the crossing the ruler grades
identically. The measurement blindness and the engine's behavior coincide perfectly, so the
blindness will persist for as long as V1 keeps scoring in the 37–54 band.

**This is the most scientifically interesting result in the audit and it must be measured,
not fixed.** Open question: is +5.49 a genuine correction of V1's known saturation (the MI
ceiling ~55 / activePercent compression documented in the Jul-21 audit), or is it a
systematic bullish bias introduced by the V2 Brain translation? The discriminating evidence
is behavior in **falling** weeks — the sample so far is dominated by rising ones.

---

## §4 — What is verified healthy

**Capture cron — clean.** 7 consecutive trading days, 08-12 → 08-20, 35 records,
`source: v2-shadow-capture`, `dualEngineSnapshot: true` (derived, not asserted),
`v2ShadowMergedAt: null` on every row = no browser was involved. `vi_predictions` 190 → 220.

**Repair 3 confirmed over a real Monday.** Every pre-repair Monday is absent from the ledger
(07-20, 07-27, 08-03, 08-10). **2026-08-17 Monday is present.** The UTC-date bug is dead,
proven in production against the exact failure case.

**Integrity 70 / MINOR_ISSUES**, `auditComplete: true`, audited 2026-08-21T14:12Z.
Collections: `vi_predictions 220`, `vi_pattern_fires 1276`, `signalPerformance 19`,
`catalyst_performance 13` — all `complete: true`.

Per-symbol verified outcomes: AAPL 44/28, TSLA 38/22, GOOGL 37/21, MSFT 36/20, AMZN 35/19
(7d/30d).

---

## §5 — New defect: the journal reads a pipeline that has not run yet

Journal cron **18:30 ET**. Pipeline **21:00 ET**. The journal builds day D's doc from
predictions for day D that do not exist for another 2.5 hours.

Evidence — journal doc timestamps (UTC):

| Date | createdAt | backfilledAt | updatedAt |
|---|---|---|---|
| 08-19 | 08-19 22:30 | — | 08-20 22:30 |
| 08-18 | 08-19 22:30 | 08-19 22:30 | 08-20 22:30 |
| 08-17 | 08-18 22:30 | 08-18 22:30 | 08-20 22:30 |
| 08-14 | 08-17 22:30 | 08-17 22:30 | 08-20 22:30 |
| 08-13 | 08-14 22:30 | 08-14 22:30 | 08-19 22:30 |

Nearly every doc carries `backfilledAt` — each day is populated by the *next* day's run.
**08-20 has 5 complete dual-engine predictions but no journal doc yet**; it will be created
by tonight's run. Nothing is lost, but the research journal permanently operates one day
behind for no reason.

08-19 is the lone exception (created same-day, no backfill) because a browser wrote an
`08-19` record before 18:30 ET — it is the only recent day with `source: frontend-mi`
present. That is the accident that made the ordering bug visible.

Also watch: 08-13's 7d window matured on 08-20, but the 08-20 22:35 resolver run did not
resolve it. Expect it tonight; if it is still pending on 08-22 the resolver's maturity
comparison needs review.

---

## §6 — Ledger debt, unchanged and correct

- `TIMESTAMP_INCONSISTENCY 162` — frozen legacy, pre-repair UTC bug. Classified, not rewritten.
- `PREDICTION_MISSING_PRICE 5` — all `*_2026-07-26`, phantom weekend date. No new instances.
- `ORPHAN_PATTERN_FIRES 277 → 284` (+7). Still accumulating slowly. Not yet diagnosed —
  logged, not chased.

---

## §7 — The promotion gate is redefined

The old gate — *30 validated observations* — is retired as a sufficient condition. §2 proves
count alone is satisfiable with zero discriminating evidence.

V2 may be judged only when **all three** hold:

1. **30+ matured validated dual observations** (unchanged floor), AND
2. **a meaningful number of actionable divergences** — divergences that cross a decision
   family boundary, not intra-family WAIT→HOLD, AND
3. **sufficient economic-comparison observations** under the new metric in §8.

Verdict handling, decided in advance so the result cannot be rationalized later:

- V2 wins → begin discussing *controlled* promotion. Not automatic promotion.
- V1 wins → V1 stays. V1 remains the permanent control regardless.
- Neither wins → V2 taught us something at zero cost to production. Acceptable outcome.
- **V2 turns out to be "V1 + ~5.5 points" → recalibrate V2.** Do not report a uniform
  offset as superior intelligence.

---

## §8 — Next: second metric, additive (DESIGNED NEXT SESSION, NOT BUILT)

Rule: **do not retroactively change the original grading.** `comparisonRules.version 1`
stays exactly as it is, and every existing verification stays exactly as it is. The
correctness metric is preserved and a second, economic metric is added alongside it.

The question the second metric must answer:

> If someone followed V1 versus V2 from the *same timestamp at the same price*, which action
> produced the better outcome over 7 days?

Candidate measures: return captured, downside avoided, SPY-relative performance,
maximum favorable / maximum adverse excursion.

Both metrics are reported. Neither overwrites the other. Design comes before any code.

---

## §9 — Standing freeze

Frozen, no exceptions: V1 (`calcBrainScore`, thresholds, confidence engine, verification
systems), V2 Brain translation and `ENGINE_V2_VERSION`, Brain Vault patterns, LPMS,
`consensusScore` / `masterScore` weights, pattern weighting, UNEVALUATABLE sets, and
production decision authority (V1 keeps it).

Measurement, security, and scheduling are the only surfaces open for work. Any change on
those surfaces must ship with proof that intelligence code is untouched — the frozen-clock
regression in `.audit/v1v2-regression.js` is that proof.

---

## §10 — Approved work queue

| # | Work | Status |
|---|---|---|
| 1 | S20 audit documented | this file |
| 2 | Design the economic-outcome metric (§8) — design only, no code | next |
| 3 | Lock down public mutating endpoints (`/api/v2-capture/run`, `/api/journal/resolve`, `/api/journal/run`, `/api/v2-repair`) — the §7.1 problem from S19: the express-rate-limit in-memory store does not survive Railway's replica distribution, so these are effectively unprotected. Move behind a secret. | queued |
| 4 | Fix journal cron ordering so it runs after the pipeline (§5). No historical rewrites. | queued |
| 5 | Cosmetic bundle S19 §7.2 / §7.3 / §7.4 | deferred — lowest priority |
| 6 | Freeze and collect. Another month of market behavior. | standing |

Explicitly **not** doing: V3, new Brain mathematics, threshold changes, reacting to a single
AAPL result, or "improving" V2 because it looks bullish.

---

## §11 — Reproduce this audit

```
node .audit/day0-assert.js 2026-08-12
curl -s https://vestex-production.up.railway.app/api/journal        # validatedTotals + 30 days
curl -s https://vestex-production.up.railway.app/api/vi/report      # last 200 predictions
curl -s https://vestex-production.up.railway.app/api/db-integrity   # integrity 70
```

`/api/journal` uses `limit(30)`; it returned 20 docs, so 20 is the true journal total and
absent dates are genuinely absent rather than truncated. That check is what turned the
missing 08-20 doc from a suspicion into a finding.

---

## §12 — Process notes worth keeping

- **A 0–0 scoreboard is a claim about the ruler, not about the engines.** Before reading any
  null result as equivalence, verify the metric can represent the difference being tested.
- **Check whether the disagreement space and the blind spot overlap.** Here 100% of
  divergences landed exactly where grading is identical. That coincidence was the whole
  finding, and a summary statistic (`v1_better 0`) concealed it.
- **`limit()` versus true totals, again.** S19 fixed caps published as totals; this session
  the same question decided whether 08-20 was missing or merely unreturned. Always confirm
  which one you are looking at.
- **A defect can hide behind an accident.** The journal ordering bug was invisible until a
  browser write on 08-19 produced one same-day doc among a run of backfilled ones.
