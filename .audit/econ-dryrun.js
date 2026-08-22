// VESTEX — Economic Scoreboard V1, READ-ONLY dry run
//
// Applies the economic evaluator to the LIVE production journal payload and
// reports what a backfill would produce. Writes nothing anywhere. Fetches no
// market data — every input is a value already stored in the ledger.
//
//   node .audit/econ-dryrun.js              # fetch live production
//   node .audit/econ-dryrun.js <file.json>  # replay a saved /api/journal payload

const fs = require('fs');
const {
  ECON_RULES, ECON_WINNER, buildEconomicBlock,
  buildEconomicScoreboard, buildEconomicPartitions,
} = require('../journalEconomics');

const API = 'https://vestex-production.up.railway.app/api/journal';
const COMPLETE = 'COMPLETE_DUAL_ENGINE';

async function getPayload() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  const r = await fetch(API);
  if (!r.ok) throw new Error(`journal fetch ${r.status}`);
  return r.json();
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v) => (v == null ? '  n/a' : (v > 0 ? '+' : '') + v.toFixed(2));

(async () => {
  const j = await getPayload();
  if (!j.ok) throw new Error('journal payload not ok');

  const stats = {
    daysScanned: 0, rowsScanned: 0, eligibleRows: 0,
    excludedRows: 0, excludedByClass: {},
    comparableDivergences: 0, sameDecisionRows: 0, pendingRows: 0,
    unusableRows: 0, unusableByReason: {},
    v1Wins: 0, v2Wins: 0, equals: 0,
    missingVerification: 0, missingSpy: 0,
  };

  const blocks = [];
  const resolvedDetail = [];

  for (const d of j.days || []) {
    stats.daysScanned++;
    for (const [sym, e] of Object.entries(d.entries || {})) {
      stats.rowsScanned++;
      const cls = e.comparabilityClass ?? 'V2_NOT_CAPTURED';

      if (cls !== COMPLETE) {
        stats.excludedRows++;
        stats.excludedByClass[cls] = (stats.excludedByClass[cls] || 0) + 1;
        continue;
      }
      stats.eligibleRows++;

      const b = buildEconomicBlock(e.verification7d, e.decisionV1, e.decisionV2);
      blocks.push(b);

      if (!e.verification7d) stats.missingVerification++;
      if (e.verification7d && e.verification7d.spyReturn == null) stats.missingSpy++;

      switch (b.winner) {
        case ECON_WINNER.V1_BETTER: stats.v1Wins++; stats.comparableDivergences++; break;
        case ECON_WINNER.V2_BETTER: stats.v2Wins++; stats.comparableDivergences++; break;
        case ECON_WINNER.EQUAL:     stats.equals++; stats.comparableDivergences++; break;
        case ECON_WINNER.PENDING:   stats.pendingRows++; break;
        default:
          if (b.reason === 'SAME_DECISION') stats.sameDecisionRows++;
          else {
            stats.unusableRows++;
            stats.unusableByReason[b.reason] = (stats.unusableByReason[b.reason] || 0) + 1;
          }
      }

      // Every row where the engines disagreed AND an outcome exists
      if (b.winner === ECON_WINNER.V1_BETTER || b.winner === ECON_WINNER.V2_BETTER ||
          b.winner === ECON_WINNER.EQUAL) {
        resolvedDetail.push({ date: d.date, sym, b, e });
      }
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  ECONOMIC SCOREBOARD V1 — READ-ONLY DRY RUN');
  console.log(`  rules v${ECON_RULES.version} · SPY flat band +/-${ECON_RULES.spyFlatBandPct}% ` +
              `· SELL=cash(0), never short`);
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('── Corpus ──');
  console.log(`  journal days scanned      ${stats.daysScanned}`);
  console.log(`  rows scanned              ${stats.rowsScanned}`);
  console.log(`  eligible (dual-engine)    ${stats.eligibleRows}`);
  console.log(`  excluded (not comparable) ${stats.excludedRows}  ${JSON.stringify(stats.excludedByClass)}`);
  console.log(`  same-decision rows        ${stats.sameDecisionRows}   (econ_not_comparable — engines never competed)`);
  console.log(`  pending (no outcome yet)  ${stats.pendingRows}`);
  console.log(`  malformed / unusable      ${stats.unusableRows}  ${JSON.stringify(stats.unusableByReason)}`);
  console.log(`  missing 7d verification   ${stats.missingVerification}`);
  console.log(`  missing SPY reference     ${stats.missingSpy}`);

  console.log('\n── Economic verdict ──');
  console.log(`  comparable divergences    ${stats.comparableDivergences}`);
  console.log(`  V1 economic wins          ${stats.v1Wins}`);
  console.log(`  V2 economic wins          ${stats.v2Wins}`);
  console.log(`  economic equals           ${stats.equals}`);

  const P = buildEconomicPartitions(blocks);

  console.log('\n── Regime partitions (THE SAFEGUARD) ──');
  console.log(`  ${pad('partition', 14)}${pad('n', 4)}${pad('V1w', 5)}${pad('V2w', 5)}` +
              `${pad('eq', 4)}${pad('V1cum', 9)}${pad('V2cum', 9)}${pad('V1relSPY', 10)}V2relSPY`);
  for (const k of ['ALL', 'SPY_UP', 'SPY_DOWN', 'SPY_FLAT', 'SPY_UNKNOWN']) {
    const p = P[k];
    console.log(`  ${pad(k, 14)}${pad(p.comparableObservations, 4)}` +
      `${pad(p.v1_econ_better, 5)}${pad(p.v2_econ_better, 5)}${pad(p.econ_equal, 4)}` +
      `${pad(num(p.v1CumulativeReturn) + '%', 9)}${pad(num(p.v2CumulativeReturn) + '%', 9)}` +
      `${pad(num(p.v1SpyRelativeCumulative) + '%', 10)}${num(p.v2SpyRelativeCumulative)}%`);
  }

  console.log('\n── Exposure profile ──');
  console.log(`  V2 took more exposure on  ${P.exposureProfile.v2MoreExposed} divergence(s)`);
  console.log(`  V1 took more exposure on  ${P.exposureProfile.v1MoreExposed} divergence(s)`);
  console.log(`  same exposure             ${P.exposureProfile.sameExposure}`);
  console.log(`  one-sided                 ${P.exposureProfile.oneSided}`);

  console.log(`\n── BETA WARNING: ${P.betaWarning ? 'RAISED' : 'clear'} ──`);
  if (P.betaWarning) {
    P.betaWarningReason.split('; ').forEach(r => console.log(`  ! ${r}`));
  }

  console.log('\n── Every resolved divergence, as stored (verify against the audit) ──');
  resolvedDetail.sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const { date, sym, b, e } of resolvedDetail) {
    console.log(`  ${date} ${pad(sym, 6)} V1 ${pad(b.decisionV1, 5)}${pad(e.masterScoreV1, 4)}` +
      ` -> V2 ${pad(b.decisionV2, 5)}${pad(e.masterScoreV2, 4)}` +
      ` | ret ${pad(num(b.returnPct) + '%', 9)} spy ${pad(num(b.spyReturn) + '%', 9)} ${pad(b.spyDirection, 8)}` +
      ` | V1 captured ${pad(num(b.v1CapturedReturn) + '%', 8)} V2 captured ${pad(num(b.v2CapturedReturn) + '%', 8)}` +
      ` | edge ${pad(num(b.economicEdge) + '%', 8)} -> ${b.winner}`);
  }

  console.log('\n── Per-day economic scoreboard a backfill would write ──');
  for (const d of j.days || []) {
    // Production docs have no economic block yet, so project the computed blocks
    // onto a COPY of the entries. Scoreboarding the raw doc would report every
    // row as econ_pending and say nothing about what the backfill produces.
    const projected = {};
    for (const [sym, e] of Object.entries(d.entries || {})) {
      projected[sym] = { ...e, economic7d: buildEconomicBlock(e.verification7d, e.decisionV1, e.decisionV2) };
    }
    const sb = buildEconomicScoreboard(projected);
    if (sb.comparableObservations === 0 && sb.econ_pending === 0) continue;
    console.log(`  ${d.date}  comparable=${sb.comparableObservations}` +
      ` v1=${sb.v1_econ_better} v2=${sb.v2_econ_better} eq=${sb.econ_equal}` +
      ` pending=${sb.econ_pending} notcomp=${sb.econ_not_comparable} excluded=${sb.excluded}`);
  }

  console.log('\n── Original metric, UNCHANGED (must match pre-change values) ──');
  console.log(`  totals          ${JSON.stringify(j.totals)}`);
  console.log(`  validatedTotals ${JSON.stringify(j.validatedTotals)}`);
  console.log('\nNOTHING WAS WRITTEN.\n');
})().catch(e => { console.error('DRY RUN FAILED:', e.message); process.exit(1); });
