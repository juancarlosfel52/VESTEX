// VESTEX — Repair 4 regression test: canonical dual-engine record
// The property under test is the steel wall: a writer must not be able to
// produce a countable record unless V1 and V2 genuinely came from one
// snapshot. Reproduces the Jul 24 mixed-provenance row directly.

const assert = require('assert');
const {
  VI_SCHEMA_VERSION, VI_CLASS, V2_SHADOW_FIELDS,
  classifyDualEngine, isComparable, evaluateSnapshotIntegrity,
  buildViPredictionRecord,
} = require('../viRecord');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

const SNAP = { price: 212.4, spy: 551.2, at: 1_700_000_000_000 };
const V1   = { masterScore: 71, decision: 'BUY', confidence: 64, systemVotes: { a: 1 } };
const V2   = {
  engineVersion: 'v2.0-shadow-1', masterScoreV2: 66, brainScoreV1: 58,
  brainScoreV2: 61, confidenceV2: 59, decisionV2: 'WAIT', divergence: true,
};

const build = (over = {}) => buildViPredictionRecord({
  symbol: 'AAPL', date: '2026-08-07', timestamp: 1_700_000_000_000,
  snapshot: SNAP, v1: V1, v2: V2,
  context: { marketRegime: 'risk_on', topPatterns: [{ name: 'x' }] },
  provenance: { source: 'pipeline', decisionSource: 'engine-v1' },
  ...over,
});

// ── The happy path ──
check('T1  complete same-snapshot record is countable', () => {
  const r = build();
  assert.strictEqual(r.dualEngineSnapshot, true);
  assert.strictEqual(r.snapshotGaps, null);
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.COMPLETE_DUAL_ENGINE);
  assert.strictEqual(isComparable(r), true);
});
check('T2  identity and schema version are canonical', () => {
  const r = build();
  assert.strictEqual(r.id, 'AAPL_2026-08-07');
  assert.strictEqual(r.schemaVersion, VI_SCHEMA_VERSION);
  assert.strictEqual(r.snapshotAt, SNAP.at);
});
check('T3  both engines are stamped against ONE price', () => {
  const r = build();
  // There is exactly one price field. Neither engine can carry its own.
  assert.strictEqual(r.priceAtPrediction, 212.4);
  assert.ok(!('priceAtPredictionV2' in r), 'a second price field would void the experiment');
  assert.ok(!('snapshotAtV2' in r), 'a second snapshot time would void the experiment');
});

// ── The steel wall: dualEngineSnapshot cannot be asserted by a caller ──
check('T4  a caller CANNOT force dualEngineSnapshot true', () => {
  const r = buildViPredictionRecord({
    symbol: 'AAPL', date: '2026-08-07',
    snapshot: {}, v1: {}, v2: null,
    dualEngineSnapshot: true,           // ignored — not a parameter
  });
  assert.strictEqual(r.dualEngineSnapshot, false, 'writer forged same-snapshot provenance');
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V2_NOT_CAPTURED);
});
check('T5  a caller CANNOT force it via provenance either', () => {
  const r = build({ v2: null, provenance: { source: 'x', decisionSource: 'engine-v1', dualEngineSnapshot: true } });
  assert.strictEqual(r.dualEngineSnapshot, false);
});

// ── Each individual gap defeats countability, and says why ──
check('T6  missing V2 -> not countable, reason recorded', () => {
  const r = build({ v2: null });
  assert.strictEqual(r.dualEngineSnapshot, false);
  assert.ok(r.snapshotGaps.includes('no_v2_result'));
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V2_NOT_CAPTURED);
});
check('T7  missing V1 masterScore -> not countable', () => {
  const r = build({ v1: { ...V1, masterScore: null } });
  assert.strictEqual(r.dualEngineSnapshot, false);
  assert.ok(r.snapshotGaps.includes('no_v1_master_score'));
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V1_CONTEXT_INCOMPLETE);
});
check('T8  missing snapshot price -> not countable', () => {
  const r = build({ snapshot: { price: null, spy: null } });
  assert.strictEqual(r.dualEngineSnapshot, false);
  assert.ok(r.snapshotGaps.includes('no_snapshot_price'));
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V1_CONTEXT_INCOMPLETE);
});
check('T9  V2 present but incomplete -> not countable', () => {
  const r = build({ v2: { ...V2, masterScoreV2: null } });
  assert.strictEqual(r.dualEngineSnapshot, false);
  assert.ok(r.snapshotGaps.includes('no_v2_master_score'));
});

// ── The actual Jul 24 failure ──
check('T10 pipeline-direction V1 can never be countable (the Jul 24 row)', () => {
  // decisionV1 SELL came from the direction map, decisionV2 WAIT came from MI.
  // Two different computations, one record.
  const r = build({
    v1: { masterScore: null, decision: 'SELL', confidence: 55, systemVotes: null },
    provenance: { source: 'pipeline', decisionSource: 'pipeline-direction' },
  });
  assert.strictEqual(r.dualEngineSnapshot, false);
  assert.ok(r.snapshotGaps.includes('v1_from_direction_map'));
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V2_INSTRUMENT_ARTIFACT);
});
check('T11 even a FULL V1 is rejected if provenance is the direction map', () => {
  const r = build({ provenance: { source: 'pipeline', decisionSource: 'pipeline-direction' } });
  assert.strictEqual(r.dualEngineSnapshot, false, 'direction-map V1 must never count');
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V2_INSTRUMENT_ARTIFACT);
});
check('T12 a merged-after-the-fact row is an instrument artifact', () => {
  const r = { ...build(), v2ShadowMergedAt: Date.now() };
  assert.strictEqual(classifyDualEngine(r), VI_CLASS.V2_INSTRUMENT_ARTIFACT);
  assert.strictEqual(isComparable(r), false);
});

// ── Legacy rows must keep their meaning ──
check('T13 legacy schema-v1 frontend row is still COMPLETE_DUAL_ENGINE', () => {
  // No dualEngineSnapshot flag, but V1+V2 came from one browser MI call.
  const legacy = {
    masterScore: 70, decision: 'BUY', priceAtPrediction: 200,
    masterScoreV2: 65, decisionV2: 'HOLD',
    engineVersion: 'v2.0-shadow-1', decisionSource: 'engine-v1',
  };
  assert.strictEqual(classifyDualEngine(legacy), VI_CLASS.COMPLETE_DUAL_ENGINE);
});
check('T14 legacy row with no V2 is still V2_NOT_CAPTURED', () => {
  const legacy = { masterScore: 70, decision: 'BUY', priceAtPrediction: 200 };
  assert.strictEqual(classifyDualEngine(legacy), VI_CLASS.V2_NOT_CAPTURED);
});

// ── Shape guarantees ──
check('T15 unknown values are explicit null, never undefined', () => {
  const r = buildViPredictionRecord({ symbol: 'X', date: '2026-08-07' });
  for (const [k, v] of Object.entries(r)) {
    assert.notStrictEqual(v, undefined, `${k} is undefined (Firestore rejects undefined)`);
  }
  assert.strictEqual(r.verification7d, null);
  assert.strictEqual(r.verification30d, null);
  assert.deepStrictEqual(r.topPatterns, []);
  assert.deepStrictEqual(r.catalystEvents, []);
});
check('T16 record is JSON-serializable (Firestore-safe)', () => {
  const r = build();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), r);
});
check('T17 every V2 shadow field has a home in the canonical record', () => {
  const r = build();
  V2_SHADOW_FIELDS.forEach(f => assert.ok(f in r, `${f} missing from canonical record`));
});
check('T18 deterministic — same inputs produce an identical record', () => {
  assert.deepStrictEqual(build(), build());
});

// ── evaluateSnapshotIntegrity directly ──
check('T19 integrity reports every gap, not just the first', () => {
  const { ok, reasons } = evaluateSnapshotIntegrity({ snapshot: {}, v1: {}, v2: null, provenance: {} });
  assert.strictEqual(ok, false);
  assert.ok(reasons.includes('no_v2_result'));
  assert.ok(reasons.includes('no_snapshot_price'));
  assert.ok(reasons.includes('no_v1_master_score'));
  assert.ok(reasons.includes('no_v1_decision'));
  assert.ok(reasons.length >= 4, `expected multiple reasons, got ${reasons}`);
});
check('T20 a WAIT decision survives (direction map could not express it)', () => {
  const r = build({ v1: { ...V1, decision: 'WAIT' } });
  assert.strictEqual(r.decision, 'WAIT');
  assert.strictEqual(r.dualEngineSnapshot, true);
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
