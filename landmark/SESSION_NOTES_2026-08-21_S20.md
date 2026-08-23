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
| 2 | Economic Scoreboard V1 — built, deployed `c17a0a7`, backfilled | **DONE — see §14** |
| 3 | Lock down public mutating endpoints (`/api/v2-capture/run`, `/api/journal/resolve`, `/api/journal/run`, `/api/v2-repair`) — the §7.1 problem from S19: the express-rate-limit in-memory store does not survive Railway's replica distribution, so these are effectively unprotected. Move behind a secret. | **DONE — see §15** |
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

---

## §14 — Economic Scoreboard V1 — BUILT, DEPLOYED, BACKFILLED (2026-08-22)

**Deployed SHA `c17a0a7`** (from `5dc4ef8`). Fingerprint used to confirm the deploy:
`/api/journal` now returns `economicRules` — absent in `5dc4ef8`. Not assumed; verified.

### What it is
A second, independent metric. The original asks *"was the decision classified
correctly?"*; this asks *"exposed to the move, or in cash?"* Both are reported, neither
overwrites the other, and the key names are deliberately different (`v1_econ_better` vs
`v1_better`) so no consumer can merge them by accident.

Frozen action model — long/cash only, `journalEconomics.js` `ECON_RULES` v1:

```
EXPOSED  STRONG BUY, BUY, BUY SMALL, HOLD  ->  captured = +returnPct
CASH     WAIT, SELL, STRONG SELL           ->  captured = 0
```

**SELL = 0, not −returnPct.** The original rule models SELL as a short. This one models it
as exiting a long to cash, because VESTEX is being evaluated as a beginner-oriented
long/cash system. The two metrics genuinely disagree here and both stay on the record.

`spyRelative = capturedReturn − spyReturn`, applied identically to both exposure classes:
sitting in cash while SPY rose 2% scores −2, because sitting out a rising benchmark *is*
underperforming it. **Documented limitation:** subtracting the same `spyReturn` from two
actions on the same symbol is order-preserving, so SPY-relative cannot neutralise exposure
bias. Only the regime partition can. Test R3 pins this so nobody re-derives it later.

SPY flat band **±0.5%, reused not invented** — `pipeline.js:417-422` (canonical, same
verification path that produces `returnPct`); `backtest.js:26` agrees in fraction units.

### First result — the ruler now has markings

| Metric | Reads |
|---|---|
| Original (`validatedTotals`) | `v1_better 0, v2_better 0` — undecidable |
| Economic (`economicTotals`) | **V1 1, V2 3**, 4 comparable divergences |

| Date | Sym | V1 → V2 | ret | SPY | regime | V1 cap | V2 cap | econ winner |
|---|---|---|---|---|---|---|---|---|
| 08-13 | GOOGL | WAIT→HOLD | −1.66% | −1.94% | DOWN | 0% | −1.66% | **v1_econ_better** |
| 08-12 | TSLA  | WAIT→HOLD | +6.01% | −1.27% | DOWN | 0% | +6.01% | v2_econ_better |
| 08-12 | AAPL  | WAIT→HOLD | +3.01% | −1.27% | DOWN | 0% | +3.01% | v2_econ_better |
| 07-31 | AMZN  | WAIT→HOLD | +7.49% | +4.12% | UP   | 0% | +7.49% | v2_econ_better |

**Correction to §1 of this document:** the 08-12 window was a *falling* SPY tape
(−1.27%), not a rising one. Three of the four resolved divergences sit in SPY_DOWN, where
V2 still leads 2–1 with +7.36% cumulative captured. That is better evidence for V2 than a
purely rising sample would have been.

**08-13 GOOGL is new** — it was `pending` during the 08-21 audit and resolved overnight. It
is the **first observation where V1 beat V2 on anything**, and it arrived from the one
mechanism that can produce it: WAIT staying in cash through a decline.

### The safeguard is firing — read this before believing the 3–1

`betaWarning: true` — *"exposure profile is one-sided (V2 took more market exposure on
every divergence) — the metric is measuring exposure, not selection."*

`exposureProfile: { v2MoreExposed: 4, v1MoreExposed: 0, sameExposure: 0, oneSided: true }`

V2 has **never once** been less exposed than V1. That is the +5.49 signature: V2 only ever
converts WAIT→HOLD, so this metric is currently measuring *"does holding beat cash"*, which
in a generally rising market is close to asking *"does the market go up"*. The warning
clears only when V2 is observed taking **less** exposure than V1 on some row — i.e. a
HOLD→WAIT or anything→SELL divergence. None exist yet.

So: **V2 leads 3–1 and that lead is not yet evidence of intelligence.** Both facts must
travel together, which is why `economicPartitions` ships in the same API response as
`economicTotals`.

### Freeze proof
- `brain.js`, `masterIntelligence.js`, `viRecord.js`, `pipeline.js`, `winRateRegistry.js`,
  `signalPerformance.js`, `catalystEngine.js`, `marketDate.js` — **SHA256 identical** to `5dc4ef8`.
- `JOURNAL_COMPARISON_RULES`, `journalIsCorrect`, `journalHypotheticalReturn`,
  `journalDetermineWinner` — **zero-diff**.
- `server.js`: +149/−1. The single deleted line is the `/api/journal` `res.json`, extended
  while retaining `totals`, `validatedTotals` and `days` verbatim.
- **170/170 tests** (117 original unchanged + 53 new). V1/V2 regression **zero differing
  paths** across 250 fixtures *with the clock frozen* — unfrozen it reports 11 false
  `generatedAt` diffs, exactly as §12 warns. Day 0 assertion still **15/15**.
- Live `validatedTotals` before and after the backfill: identical.

### Backfill
`GET /api/journal/econ-backfill` (`?dryRun=1`). Derives from stored values only — fetches
no market data, recomputes no price. Writes only `entries.<sym>.economic7d/economic30d`,
`economicScoreboard`, `economicRules`, `economicBackfilledAt`.

Dry run (deployed) → `docsUpdated: 0`, verdict 1/3/0/8/28, matching the local read-only run
`.audit/econ-dryrun.js` exactly. Real run → **21/21 docs, 0 write failures**. Second run →
`docsEligible: 0, alreadyCurrent: 105` — idempotent, converges.

Note this dry run reads Firestore fully before reporting, deliberately unlike
`runV2ShadowCapture`'s dry run which returns early and mislabels outcomes (§7.3).

### Why the resolver alone was not enough
`runJournalResolver` only visits entries whose *original* verification is still pending, so
an already-resolved row is never revisited and would never have received an economic block.
Hence the separate backfill pass. Both writers now attach the metric, and
`test/journal-resolver.test.js` injects the real module rather than a copy — if the resolver
stops attaching it, that test breaks.

### Still open after this sprint
1. **§7.1 security** — `/api/v2-capture/run`, `/api/journal/resolve`, `/api/journal/run`,
   `/api/v2-repair`, and now `/api/journal/econ-backfill` are publicly reachable and mutate
   data. `rlAudit` is attached but express-rate-limit's in-memory store does not survive
   Railway's replicas, so it protects nothing. The econ-backfill endpoint is idempotent and
   additive, so the exposure it adds is quota/noise, not corruption — but this is the next
   item.
2. **§5 journal cron ordering** — still 18:30 ET reading a 21:00 ET pipeline.
3. **§7.2 / §7.3 / §7.4** cosmetic bundle — still deferred.
4. **30d economic blocks** are written but every one is `econ_pending`; no 30d verification
   has matured for a dual-engine row yet.

---

## §15 — Ops endpoints locked — DEPLOYED (2026-08-22)

Commit `c8c7dc0`. `server.js` + `test/ops-auth.test.js` only. Closes §10 row 3 / S19 §7.1.

### The exposure, confirmed not assumed

Before the fix, an unauthenticated request from the open internet to
`/api/journal/econ-backfill?dryRun=1` returned **HTTP 200** with a full telemetry body.
That is the proof the endpoints were live, not a code reading. `rlAudit` was attached, but
express-rate-limit's default store is per-process memory: Railway's replicas each get a
fresh counter, so a 5/min cap becomes 5/min/replica and authenticates nobody.

### A second bug found while fixing the first

`/api/pipeline/run` and `/api/sentiment/refresh` already had guards, written as

```js
if (req.headers['x-pipeline-secret'] !== process.env.PIPELINE_SECRET) return 401;
```

With `PIPELINE_SECRET` unset that is `undefined !== undefined` → `false` → **allow**. An
unset env var silently published the pipeline trigger. These were the two endpoints that
looked protected and were not.

### What shipped

One middleware, `requireOpsSecret`, reusing the `x-pipeline-secret` / `PIPELINE_SECRET`
convention already in the file rather than inventing a second scheme.

- **Fail-closed by design.** Unconfigured secret → **503, endpoint disabled**. This is the
  deliberate inversion of the bug above: a missing secret must never unlock anything.
- `crypto.timingSafeEqual` with a length pre-check. Non-string and length-mismatched input
  return 401 rather than throwing (`timingSafeEqual` throws on unequal lengths).
- Header preferred; `?secret=` accepted for hand-run audits — it lands in access logs, so
  rotate if used that way.

Seven routes now guarded: `/api/v2-capture/run`, `/api/journal/run`,
`/api/journal/resolve`, `/api/journal/econ-backfill`, `/api/v2-repair`,
`/api/pipeline/run`, `/api/sentiment/refresh`.

### Why this could not break automation

All seven crons call their functions **in-process** (`runPipeline`, `runV2ShadowCapture`,
`verifyPredictions`, `runVIVerification`, `runResearchJournal`, `runJournalResolver`,
`refreshSentimentCache`). None traverses HTTP, so locking the HTTP surface cannot stop a
scheduled job. Asserted in tests D1–D3, not merely reasoned about. `index.html` references
none of the seven routes, so no UI path breaks either.

### Verified in production after deploy

| Check | Result |
|---|---|
| 7 mutating routes, unauthenticated | **401 on all 7** |
| `/api/journal`, `/predictions`, `/accuracy`, `/win-rates`, `/market-health` | **200 on all 5** |
| `validatedTotals` | unchanged: 0/0/2/2, tie 11, pending 25, excluded 65 |
| `economicTotals` | unchanged: 1/3/0, pending 8, notcomp 28 |
| `betaWarning` | still `true`, still one-sided (v2MoreExposed 4 / v1 0) |

**401 rather than 503 proved `PIPELINE_SECRET` was already configured in Railway** — no env
var had to be added. That distinction is the reason the guard returns two different codes.

### Freeze proof

Nine intelligence/measurement modules (`brain.js`, `masterIntelligence.js`, `viRecord.js`,
`winRateRegistry.js`, `signalPerformance.js`, `catalystEngine.js`, `marketDate.js`,
`pipeline.js`, `journalEconomics.js`) and `index.html` are **zero-diff vs `c17a0a7`**.
`JOURNAL_COMPARISON_RULES` and the `journalIsCorrect` / `journalHypotheticalReturn` /
`journalDetermineWinner` trio are byte-identical. `server.js` was the only file changed.
Suite **197/197** (170 baseline + 27 new).

### Test note worth keeping

`test/ops-auth.test.js` extracts the real guard from `server.js` via regex + `new Function`,
the same technique as `journal-resolver.test.js`, so it stays bound to shipped wiring rather
than a copy. Two gotchas hit while writing it:

1. `require` is not in scope inside `new Function` — it must be injected as a parameter,
   exactly as that file injects `admin` / `console`.
2. Assertion C8 (the fail-open idiom must be gone) initially failed on the *comment* inside
   `requireOpsSecret` that documents the old bug verbatim. Fixed by stripping `//` lines
   before matching, then **negative-controlled**: the regex fires on reintroduced code and
   ignores the comment. A regression lock that cannot fail is not a lock.

### Still open

1. **§5 journal cron ordering** — 18:30 ET still reads a 21:00 ET pipeline. Next item.
2. **§7.2 / §7.3 / §7.4** cosmetic bundle — still deferred.
3. **30d economic blocks** — all written, all `econ_pending`.
4. Rate limiting remains per-replica. Now largely moot on the mutating routes (the secret
   does the real work), but `/api/live-quotes`, `/api/chart` etc. are still only softly
   capped against scrapers. Not urgent, worth knowing.
