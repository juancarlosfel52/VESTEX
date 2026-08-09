// ═══════════════════════════════════════════════════════════
//  CANONICAL DUAL-ENGINE SHADOW RECORD
//  Single source of truth for the shape of a vi_predictions document
//  and for the question "is this row a valid V1-vs-V2 comparison?"
//
//  Why this module exists:
//  Two writers built this document independently — the nightly pipeline and
//  POST /api/vi/log — with different field sets and different meanings for the
//  same field names. The pipeline wrote masterScore:null with a decision
//  derived from a direction map that cannot express WAIT; the frontend wrote a
//  real Master Intelligence score. Nothing recorded whether V1 and V2 had
//  actually observed the same market snapshot, so a row assembled from two
//  different moments was indistinguishable from a valid one at read time.
//  The Jul 24 journal entry is exactly that failure: decisionV1 SELL from the
//  pipeline map, decisionV2 WAIT from Master Intelligence, hasDivergence false.
//  Three different comparisons inside one record.
//
//  The rule this module enforces:
//  A record is only comparable when V1 and V2 came from ONE Master
//  Intelligence computation over ONE market snapshot. `dualEngineSnapshot` is
//  DERIVED here, never accepted from a caller — a writer cannot assert
//  same-snapshot provenance it does not have.
// ═══════════════════════════════════════════════════════════

const VI_SCHEMA_VERSION = 2;

/**
 * V2 shadow fields the frontend is permitted to merge onto an existing doc.
 * A merge is a repair, not a snapshot — see V2_INSTRUMENT_ARTIFACT below.
 */
const V2_SHADOW_FIELDS = [
  'engineVersion', 'decisionSource', 'masterScoreV2',
  'brainScoreV1', 'brainScoreV2', 'confidenceV2',
  'decisionV2', 'divergence',
];

/**
 * Comparability classes. Only COMPLETE_DUAL_ENGINE rows may enter the
 * validated scoreboard that judges the V2 promotion gate.
 */
const VI_CLASS = {
  // V1 and V2 from one snapshot. Countable.
  COMPLETE_DUAL_ENGINE:   'COMPLETE_DUAL_ENGINE',
  // No V2 was ever recorded for this symbol-day. Permanently uncountable.
  V2_NOT_CAPTURED:        'V2_NOT_CAPTURED',
  // V2 present but V1 context missing — nothing to compare it against.
  V1_CONTEXT_INCOMPLETE:  'V1_CONTEXT_INCOMPLETE',
  // Both present but stitched together after the fact, or V1 came from the
  // pipeline direction map rather than Master Intelligence. The apparent
  // agreement or divergence is an artifact of the instrument, not a result.
  V2_INSTRUMENT_ARTIFACT: 'V2_INSTRUMENT_ARTIFACT',
};

/**
 * Classify a record's comparability. Accepts either a vi_predictions document
 * or a research_journal entry — both carry the same discriminating fields.
 *
 * Order matters: absence of V2 is checked before provenance, because a row
 * with no V2 at all is a different (and unfixable) problem from a row whose
 * V2 arrived by merge.
 */
function classifyDualEngine(p) {
  if (p.decisionV2 == null || p.masterScoreV2 == null) return VI_CLASS.V2_NOT_CAPTURED;
  if (p.v2ShadowMergedAt != null)                      return VI_CLASS.V2_INSTRUMENT_ARTIFACT;
  if (p.decisionSource === 'pipeline-direction')       return VI_CLASS.V2_INSTRUMENT_ARTIFACT;
  if (p.masterScore == null)                           return VI_CLASS.V1_CONTEXT_INCOMPLETE;
  if (p.priceAtPrediction == null)                     return VI_CLASS.V1_CONTEXT_INCOMPLETE;
  // Explicit same-snapshot assertion from a schema-v2 writer.
  if (p.dualEngineSnapshot === true)                   return VI_CLASS.COMPLETE_DUAL_ENGINE;
  // Legacy schema-v1 rows: the frontend created V1 and V2 together from a
  // single browser-side MI call, so these are genuinely same-snapshot even
  // though they predate the explicit flag.
  if (p.engineVersion != null)                         return VI_CLASS.COMPLETE_DUAL_ENGINE;
  return VI_CLASS.V1_CONTEXT_INCOMPLETE;
}

function isComparable(p) {
  return classifyDualEngine(p) === VI_CLASS.COMPLETE_DUAL_ENGINE;
}

/**
 * Would this record satisfy the same-snapshot guarantee?
 * Returns { ok, reasons[] } so callers can log *why* a row is not countable
 * instead of silently writing an uncomparable record.
 */
function evaluateSnapshotIntegrity({ snapshot, v1, v2, provenance }) {
  const reasons = [];
  if (!v2)                            reasons.push('no_v2_result');
  if (!snapshot || snapshot.price == null) reasons.push('no_snapshot_price');
  if (!v1 || v1.masterScore == null)  reasons.push('no_v1_master_score');
  if (!v1 || v1.decision == null)     reasons.push('no_v1_decision');
  if (v2 && v2.masterScoreV2 == null) reasons.push('no_v2_master_score');
  if (v2 && v2.decisionV2 == null)    reasons.push('no_v2_decision');
  if (provenance && provenance.decisionSource === 'pipeline-direction') {
    reasons.push('v1_from_direction_map');
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Build a canonical vi_predictions document.
 *
 * `dualEngineSnapshot` is computed from the arguments — it is deliberately not
 * a parameter. The only way to produce a countable record is to actually pass
 * a complete V1 and a complete V2 taken from the same snapshot.
 *
 * Unknown values are written as explicit null rather than omitted, so a
 * missing field is always distinguishable from an absent one downstream.
 */
function buildViPredictionRecord({
  symbol,
  date,
  timestamp  = Date.now(),
  snapshot   = {},
  v1         = {},
  v2         = null,
  context    = {},
  provenance = {},
}) {
  const integrity = evaluateSnapshotIntegrity({ snapshot, v1, v2, provenance });

  return {
    // ── Identity ──
    id:        `${symbol}_${date}`,
    symbol,
    date,
    timestamp,
    schemaVersion: VI_SCHEMA_VERSION,

    // ── The one market snapshot both engines observed ──
    priceAtPrediction: snapshot.price ?? null,
    spyAtPrediction:   snapshot.spy   ?? null,
    snapshotAt:        snapshot.at    ?? timestamp,

    // ── Engine V1 (production, frozen) ──
    masterScore: v1.masterScore ?? null,
    decision:    v1.decision    ?? null,
    confidence:  v1.confidence  ?? null,
    systemVotes: v1.systemVotes ?? null,

    // ── Engine V2 (shadow — never a production decision) ──
    engineVersion: v2?.engineVersion ?? null,
    masterScoreV2: v2?.masterScoreV2 ?? null,
    brainScoreV1:  v2?.brainScoreV1  ?? null,
    brainScoreV2:  v2?.brainScoreV2  ?? null,
    confidenceV2:  v2?.confidenceV2  ?? null,
    decisionV2:    v2?.decisionV2    ?? null,
    divergence:    v2?.divergence    ?? null,

    // ── Shared context (identical for both engines by construction) ──
    topPatterns:      context.topPatterns      ?? [],
    marketRegime:     context.marketRegime     ?? null,
    sentimentScore:   context.sentimentScore   ?? null,
    sentimentOverall: context.sentimentOverall ?? null,
    catalystDelta:    context.catalystDelta    ?? null,
    catalystEvents:   context.catalystEvents   ?? [],

    // ── Provenance ──
    source:         provenance.source         ?? null,
    decisionSource: provenance.decisionSource ?? 'engine-v1',

    // ── Derived comparability — the steel wall ──
    dualEngineSnapshot: integrity.ok,
    // Recorded only when the row is NOT countable, so the ledger explains its
    // own gaps instead of leaving them to be re-diagnosed later.
    snapshotGaps: integrity.ok ? null : integrity.reasons,

    // ── Verification (filled by runVIVerification) ──
    verification7d:  null,
    verification30d: null,
  };
}

module.exports = {
  VI_SCHEMA_VERSION,
  V2_SHADOW_FIELDS,
  VI_CLASS,
  classifyDualEngine,
  isComparable,
  evaluateSnapshotIntegrity,
  buildViPredictionRecord,
};
