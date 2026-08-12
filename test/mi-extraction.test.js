// VESTEX — Repair 5a regression test: MI route extraction is behavior-preserving
// The claim under test: computeMISnapshot() contains the former route body
// VERBATIM, and the route still emits the identical response shape. Anything
// that drifts in the scoring assembly must fail here, loudly.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT   = path.join(__dirname, '..');
const SRC    = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const GOLDEN = fs.readFileSync(path.join(__dirname, 'fixtures', 'mi-assembly.golden.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

const NORM = SRC.replace(/\r\n/g, '\n');

// Pull the frozen assembly out of the extracted function.
function extractAssembly() {
  const fnAt = NORM.indexOf('async function computeMISnapshot(sym) {');
  assert(fnAt > -1, 'computeMISnapshot not found');
  const start = NORM.indexOf("    const axios = require('axios');", fnAt);
  const end   = NORM.indexOf('    _miCache[sym]     = result;', start);
  assert(start > -1 && end > start, 'assembly boundaries not found');
  return NORM.slice(start, end).replace(/\n+$/, '');
}

// ── The core guarantee ──
check('T1  scoring assembly is BYTE-IDENTICAL to the pre-extraction golden', () => {
  const body = extractAssembly();
  if (body !== GOLDEN) {
    const a = GOLDEN.split('\n'), b = body.split('\n');
    const i = a.findIndex((l, n) => l !== b[n]);
    throw new Error(`first divergence at assembly line ${i + 1}\n  golden:    ${a[i]}\n  extracted: ${b[i]}`);
  }
  assert.strictEqual(body.split('\n').length, 104);
});
check('T2  the golden actually contains the frozen intelligence', () => {
  // Guards against a vacuous T1 if someone truncates the fixture.
  assert.ok(GOLDEN.includes('buildMasterIntelligence('), 'no MI call in golden');
  assert.strictEqual((GOLDEN.match(/buildMasterIntelligence\(/g) || []).length, 1, 'expected exactly one MI call');
  assert.ok(GOLDEN.includes('loadSignalPerformanceFull'), 'signal loader missing');
  assert.ok(GOLDEN.includes('analyzeChartStructure'),     'chart injection missing');
  assert.ok(GOLDEN.includes('analyzeCatalysts'),          'catalyst context missing');
  assert.ok(GOLDEN.includes('_getFearGreed()'),           'fear&greed missing');
  assert.ok(GOLDEN.includes('_getVix()'),                 'vix missing');
  assert.ok(GOLDEN.includes('fetchEdgarData'),            'edgar missing');
  assert.ok(GOLDEN.includes('runBrainAnalysis'),          'brain missing');
  assert.ok(GOLDEN.includes('sentimentCache[sym]'),       'sentiment handling missing');
  assert.ok(GOLDEN.includes('latest_predictions'),        'macro handling missing');
});

// ── One computation produces both engines ──
check('T3  V1 and V2 come from a SINGLE buildMasterIntelligence call', () => {
  const fnAt  = NORM.indexOf('async function computeMISnapshot(sym) {');
  const fnEnd = NORM.indexOf('\n}\n', fnAt);
  const fn    = NORM.slice(fnAt, fnEnd);
  assert.strictEqual((fn.match(/buildMasterIntelligence\(/g) || []).length, 1,
    'more than one MI call would mean V1 and V2 saw different snapshots');
});
check('T4  masterIntelligence emits V1 and V2 from one invocation', () => {
  const mi = fs.readFileSync(path.join(ROOT, 'masterIntelligence.js'), 'utf8');
  const body = mi.slice(mi.indexOf('function buildMasterIntelligence('));
  assert.ok(body.includes('calcBrainScore(brainResult)'),   'V1 brain score missing');
  assert.ok(body.includes('calcBrainScoreV2(brainResult)'), 'V2 brain score missing');
  assert.ok(body.includes('engineV2:'), 'engineV2 block missing from return');
});

// ── Signal loading: the failure mode that killed Option A ──
check('T5  MI receives the ARRAY loader, not the pipeline weight object', () => {
  assert.ok(GOLDEN.includes('loadSignalPerformanceFull'),
    'must use the array loader');
  assert.ok(!GOLDEN.includes('loadSignalWeights'),
    'loadSignalWeights returns an OBJECT — calcSignalScore would score 0');
});
check('T6  no weight-object loader reachable from the capture path', () => {
  const capAt = NORM.indexOf('async function runV2ShadowCapture(');
  const capEnd = NORM.indexOf('\n}\n', capAt);
  const cap = NORM.slice(capAt, capEnd);
  assert.ok(!cap.includes('loadSignalWeights'), 'capture must not load signal weights itself');
  assert.ok(!cap.includes('buildMasterIntelligence'), 'capture must go through computeMISnapshot');
  assert.ok(cap.includes('computeMISnapshot(sym)'), 'capture must call the canonical function');
});
check('T7  calcSignalScore still requires an array (documents why)', () => {
  const mi = fs.readFileSync(path.join(ROOT, 'masterIntelligence.js'), 'utf8');
  const fn = mi.slice(mi.indexOf('function calcSignalScore('));
  assert.ok(/if \(!signals \|\| !signals\.length\)/.test(fn),
    'signal scorer contract changed — re-verify the loader shape');
  // An object literally has no .length, so it would silently zero 15 points.
  assert.strictEqual({}.length, undefined);
});

// ── The route is a faithful wrapper ──
check('T8  route preserves the exact response shape', () => {
  const at = NORM.indexOf("app.get('/api/master-intelligence/:symbol'");
  assert(at > -1, 'route missing');
  // Slice to the handler's closing line, not the first '});' — the error
  // branch ends with '});' too and would truncate the success line.
  const route = NORM.slice(at, NORM.indexOf('\n});', at) + 4);
  assert.ok(route.includes('await computeMISnapshot(sym)'), 'route must delegate');
  assert.ok(route.includes('res.json({ ok: true, data: r.data, source: r.source })'),
    'success shape changed');
  assert.ok(route.includes('res.json({ ok: false, error: r.error })'),
    'error shape changed');
  assert.ok(!route.includes('r.snapshot'), 'internal snapshot must not leak to the API');
  assert.ok(route.includes("req.params.symbol.toUpperCase()"), 'symbol casing changed');
});
check('T9  cache semantics preserved (TTL, both cache paths)', () => {
  const fnAt = NORM.indexOf('async function computeMISnapshot(sym) {');
  const fn   = NORM.slice(fnAt, NORM.indexOf('\n}\n', fnAt));
  assert.ok(fn.includes('now - (_miFetchedAt[sym]||0) < MI_TTL'), 'TTL check changed');
  assert.ok(fn.includes("source: 'cache'"), 'cache source label changed');
  assert.ok(fn.includes("source: 'live'"),  'live source label changed');
  assert.ok(fn.includes('_miCache[sym]     = result;'), 'result cache write missing');
  assert.ok(fn.includes('_miFetchedAt[sym] = now;'),    'cache timestamp write missing');
  assert.ok(fn.includes("return { ok: false, error: 'No Alpaca credentials configured' }"),
    'missing-credentials semantics changed');
});
check('T10 error semantics preserved — returns, never throws to caller', () => {
  const fnAt = NORM.indexOf('async function computeMISnapshot(sym) {');
  const fn   = NORM.slice(fnAt, NORM.indexOf('\n}\n', fnAt));
  assert.ok(fn.includes('return { ok: false, error: e.message };'), 'catch semantics changed');
  assert.ok(!/\bres\.json\(/.test(fn), 'computeMISnapshot must not touch the response object');
  assert.ok(!/\breq\b/.test(fn), 'computeMISnapshot must not reference the request');
});

// ── Frozen intelligence untouched ──
check('T11 no scoring, threshold, weight or Brain logic changed', () => {
  const mi = fs.readFileSync(path.join(ROOT, 'masterIntelligence.js'), 'utf8');
  // Decision thresholds, verbatim.
  [[85, 'STRONG BUY'], [70, 'BUY'], [60, 'BUY SMALL'],
   [45, 'HOLD'], [35, 'WAIT'], [21, 'SELL']].forEach(([n, label]) => {
    assert.ok(mi.includes(`masterScore >= ${n}`), `threshold ${n} changed`);
    assert.ok(mi.includes(`'${label}'`), `decision label ${label} changed`);
  });
  // Subsystem maxima.
  ['max: 25', 'max: 20', 'max: 15', 'max: 10'].forEach(m =>
    assert.ok(mi.includes(m), `subsystem weight ${m} changed`));
  // ATR penalty, both engines.
  assert.strictEqual((mi.match(/Math\.min\(4, Math\.round\(\(atrPct - 2\.5\) \* 1\.2\)\)/g) || []).length, 2,
    'ATR penalty changed');
  // V2 formula: same subsystems, only the brain term differs.
  assert.ok(mi.includes('tech.score + brainV2.score + signal.score + regime.score'),
    'V2 master score formula changed');
  assert.ok(/const ENGINE_V2_VERSION\s*=\s*['"]v2\.0-shadow-1['"]/.test(mi),
    'engine version must not be bumped — V2 intelligence is unchanged');
});
check('T12 verification definitions untouched', () => {
  assert.ok(NORM.includes('function journalIsCorrect'), 'journalIsCorrect missing');
  assert.ok(NORM.includes('function journalDetermineWinner'), 'journalDetermineWinner missing');
});

// ── Production still runs on V1 ──
check('T13 production decision remains Engine V1', () => {
  const capAt = NORM.indexOf('async function runV2ShadowCapture(');
  const cap   = NORM.slice(capAt, NORM.indexOf('\n}\n', capAt));
  // V1 fills `decision`; V2 only ever fills the V2 fields.
  assert.ok(/decision:\s+d\.decision/.test(cap), 'V1 must populate the decision field');
  assert.ok(!/decision:\s+v2\./.test(cap), 'V2 must never become the production decision');
  assert.ok(cap.includes("decisionSource: 'engine-v1'"), 'decision source must stay engine-v1');
  // The capture writes to the shadow ledger only.
  assert.ok(!cap.includes('latest_predictions'), 'capture must not write production predictions');
  assert.ok(!cap.includes("collection('predictions')"), 'capture must not touch System A');
});

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
