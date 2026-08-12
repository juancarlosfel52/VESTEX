// VESTEX — Repair 5b regression test: server-side same-snapshot V2 capture
// Extracts the real runV2ShadowCapture from server.js and runs it against a
// mock Firestore and a stub computeMISnapshot. Proves: one MI call yields both
// engines, same-snapshot records are accepted, mixed ones are refused, reruns
// are idempotent, and valid records are never overwritten.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');

function grab(re, label) {
  const m = SRC.match(re);
  assert(m, `${label} not found in server.js`);
  return m[0];
}
const CAPTURE_SRC = grab(/async function runV2ShadowCapture[\s\S]*?\n\}\n(?=\n)/, 'runV2ShadowCapture');

const { VI_CLASS, classifyDualEngine, buildViPredictionRecord } = require('../viRecord');
const { getTradingDate, isTradingDay } = require('../marketDate');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// ── Mock Firestore with a real runTransaction ──
function makeAdmin(store) {
  const doc = (coll, id) => {
    store[coll] = store[coll] || {};
    return {
      id,
      get: async () => ({ exists: id in store[coll], data: () => store[coll][id] }),
    };
  };
  return {
    firestore: () => ({
      collection: (coll) => ({ doc: (id) => doc(coll, id) }),
      runTransaction: async (fn) => fn({
        get: async (ref) => ref.get(),
        set: (ref, val) => {
          const coll = Object.keys(store).find(c => store[c] && ref.id in store[c]) || 'vi_predictions';
          store[coll] = store[coll] || {};
          store[coll][ref.id] = JSON.parse(JSON.stringify(val));
        },
      }),
    }),
  };
}

// A realistic Master Intelligence result: V1 and V2 from ONE computation.
// `over.data` is MERGED into the base data, not substituted for it — a blind
// spread here silently blanked masterScore/engineV2 and made tests pass for
// the wrong reason.
function miResult(over = {}) {
  const { data: dataOver, ...rest } = over;
  return {
    ok: true, source: 'live',
    snapshot: { price: 212.4, spy: 551.2, at: 1_700_000_000_000 },
    ...rest,
    data: {
      symbol: 'AAPL', masterScore: 71, decision: 'BUY', confidence: 64,
      systemVotes: { technical: 'bullish' },
      scoreBreakdown: { brainVault: { score: 12.5 } },
      topPatterns: [{ name: 'P1' }],
      marketHealth: { label: 'Healthy' },
      catalystDelta: 3, activeCatalysts: [],
      engineV2: {
        engineVersion: 'v2.0-shadow-1', brainScoreV2: 15.2,
        masterScoreV2: 74, decisionV2: 'BUY', confidenceV2: 64, divergence: null,
      },
      ...(dataOver || {}),
    },
  };
}

function load(store, miFn, symbols = ['AAPL']) {
  const admin = makeAdmin(store);
  const calls = { mi: 0, syms: [] };
  const wrapped = async (sym) => { calls.mi++; calls.syms.push(sym); return miFn(sym); };
  const factory = new Function(
    'admin', 'console', 'getTradingDate', 'isTradingDay', 'SYMBOLS', 'VI_COL',
    'buildViPredictionRecord', 'classifyDualEngine', 'VI_CLASS', 'computeMISnapshot',
    `${CAPTURE_SRC}\nreturn runV2ShadowCapture;`
  );
  const fn = factory(
    admin, { warn() {}, log() {} }, () => '2026-08-07', isTradingDay, symbols,
    'vi_predictions', buildViPredictionRecord, classifyDualEngine, VI_CLASS, wrapped
  );
  return { fn, calls };
}

(async () => {
  // ── T1: the happy path ──
  {
    const store = {};
    const { fn, calls } = load(store, () => miResult());
    const t = await fn();
    check('T1  same-snapshot record is created', () => {
      assert.strictEqual(t.created, 1, JSON.stringify(t));
      assert.strictEqual(t.skippedNotComparable, 0);
      const rec = store.vi_predictions['AAPL_2026-08-07'];
      assert.ok(rec, 'record not written');
      assert.strictEqual(rec.dualEngineSnapshot, true);
      assert.strictEqual(classifyDualEngine(rec), VI_CLASS.COMPLETE_DUAL_ENGINE);
    });
    check('T2  exactly ONE MI call produced both engines', () => {
      assert.strictEqual(calls.mi, 1, `expected 1 MI call, got ${calls.mi}`);
      const rec = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(rec.masterScore, 71);
      assert.strictEqual(rec.masterScoreV2, 74);
    });
    check('T3  V1 score/decision/confidence pass through unchanged', () => {
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.masterScore, 71);
      assert.strictEqual(r.decision,    'BUY');
      assert.strictEqual(r.confidence,  64);
      assert.deepStrictEqual(r.systemVotes, { technical: 'bullish' });
    });
    check('T4  V2 score/decision pass through unchanged', () => {
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.masterScoreV2, 74);
      assert.strictEqual(r.decisionV2,    'BUY');
      assert.strictEqual(r.confidenceV2,  64);
      assert.strictEqual(r.engineVersion, 'v2.0-shadow-1');
      assert.strictEqual(r.brainScoreV2,  15.2);
      assert.strictEqual(r.brainScoreV1,  12.5, 'V1 brain score must come from the same breakdown');
    });
    check('T5  both engines share ONE price', () => {
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.priceAtPrediction, 212.4);
      assert.strictEqual(r.spyAtPrediction,   551.2);
      assert.strictEqual(r.snapshotAt,        1_700_000_000_000);
    });
    check('T6  production decision source stays engine-v1', () => {
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.decisionSource, 'engine-v1');
      assert.strictEqual(r.decision, 'BUY');       // V1
      assert.notStrictEqual(r.decision, r.decisionV2 === 'BUY' ? undefined : r.decisionV2);
      assert.strictEqual(r.source, 'v2-shadow-capture');
    });
  }

  // ── T7-T9: idempotency and non-destruction ──
  {
    const store = {};
    const { fn } = load(store, () => miResult());
    await fn();
    const after1 = JSON.parse(JSON.stringify(store.vi_predictions['AAPL_2026-08-07']));
    const t2 = await fn();
    const t3 = await fn();
    check('T7  second and third runs are idempotent', () => {
      assert.strictEqual(t2.created, 0, 'recreated an existing record');
      assert.strictEqual(t2.skippedAlreadyValid, 1, JSON.stringify(t2));
      assert.strictEqual(t3.skippedAlreadyValid, 1);
    });
    check('T8  a valid dual-engine record is never overwritten', () => {
      assert.deepStrictEqual(store.vi_predictions['AAPL_2026-08-07'], after1);
    });
    check('T9  rerun does not overwrite even when MI output changes', () => {
      // Market moved; the captured session must stay frozen.
      const moved = () => miResult({ snapshot: { price: 999, spy: 999, at: 2 },
        data: { masterScore: 12, decision: 'SELL',
                engineV2: { engineVersion: 'v2.0-shadow-1', brainScoreV2: 1,
                            masterScoreV2: 9, decisionV2: 'STRONG SELL', confidenceV2: 20, divergence: {} } } });
      const { fn: fn2 } = load(store, moved);
      return fn2().then(() => {
        const r = store.vi_predictions['AAPL_2026-08-07'];
        assert.strictEqual(r.masterScore, 71, 'captured session was mutated');
        assert.strictEqual(r.priceAtPrediction, 212.4);
      });
    });
  }

  // ── T10-T12: mixed / incomplete snapshots are refused ──
  {
    const store = {};
    const { fn } = load(store, () => miResult({ snapshot: { price: null, spy: null, at: 1 } }));
    const t = await fn();
    check('T10 record with no snapshot price is refused, not written', () => {
      assert.strictEqual(t.created, 0);
      assert.strictEqual(t.skippedNotComparable, 1, JSON.stringify(t));
      assert.strictEqual(store.vi_predictions?.['AAPL_2026-08-07'], undefined,
        'an uncomparable record must not reach the ledger');
      assert.ok(t.gaps.no_snapshot_price >= 1, 'gap reason not recorded');
    });
  }
  {
    const store = {};
    const { fn } = load(store, () => miResult({ data: { engineV2: null } }));
    const t = await fn();
    check('T11 MI result with no V2 block is refused', () => {
      assert.strictEqual(t.created, 0);
      assert.strictEqual(t.skippedNotComparable, 1);
      assert.ok(t.gaps.no_v2_result >= 1);
    });
  }
  {
    const store = {};
    const { fn } = load(store, () => ({ ok: false, error: 'No Alpaca credentials configured' }));
    const t = await fn();
    check('T12 MI failure is counted, never fabricated', () => {
      assert.strictEqual(t.miFailures, 1);
      assert.strictEqual(t.created, 0);
      assert.strictEqual(Object.keys(store.vi_predictions || {}).length, 0);
    });
  }

  // ── T13-T14: upgrading the pipeline fallback ──
  {
    const store = {
      vi_predictions: {
        'AAPL_2026-08-07': {
          id: 'AAPL_2026-08-07', symbol: 'AAPL', date: '2026-08-07',
          masterScore: null, decision: 'SELL', priceAtPrediction: 200,
          decisionSource: 'pipeline-direction', source: 'pipeline',
          dualEngineSnapshot: false,
          verification7d: { winner: 'v1_better' }, verification30d: null,
        },
      },
    };
    const { fn } = load(store, () => miResult());
    const t = await fn();
    check('T13 pipeline fallback row is upgraded to a same-snapshot record', () => {
      assert.strictEqual(t.upgraded, 1, JSON.stringify(t));
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.dualEngineSnapshot, true);
      assert.strictEqual(r.masterScore, 71);
      assert.strictEqual(r.decisionSource, 'engine-v1');
      assert.strictEqual(r.upgradedFrom, 'pipeline-direction');
      assert.ok(r.upgradedAt > 0);
    });
    check('T14 upgrade preserves already-resolved verification outcomes', () => {
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.deepStrictEqual(r.verification7d, { winner: 'v1_better' });
      assert.strictEqual(r.verification30d, null);
    });
  }

  // ── T15: multi-symbol ──
  {
    const store = {};
    const { fn, calls } = load(store, (s) => miResult({ data: { symbol: s } }), ['AAPL', 'MSFT', 'NVDA']);
    const t = await fn();
    check('T15 one MI call per symbol, one record each', () => {
      assert.strictEqual(calls.mi, 3);
      assert.deepStrictEqual(calls.syms, ['AAPL', 'MSFT', 'NVDA']);
      assert.strictEqual(t.created, 3);
      ['AAPL', 'MSFT', 'NVDA'].forEach(s =>
        assert.ok(store.vi_predictions[`${s}_2026-08-07`], `${s} missing`));
    });
  }

  // ── T16: dry run ──
  {
    const store = {};
    const { fn } = load(store, () => miResult());
    const t = await fn({ dryRun: true });
    check('T16 dryRun reports intent and writes nothing', () => {
      assert.strictEqual(t.created, 1);
      assert.strictEqual(t.dryRun, true);
      assert.strictEqual(Object.keys(store.vi_predictions || {}).length, 0);
    });
  }

  // ── T17: divergence is recorded, not acted on ──
  {
    const store = {};
    const div = () => miResult({ data: { engineV2: {
      engineVersion: 'v2.0-shadow-1', brainScoreV2: 18, masterScoreV2: 61,
      decisionV2: 'BUY SMALL', confidenceV2: 64,
      divergence: { decisionV1: 'BUY', decisionV2: 'BUY SMALL' } } } });
    const { fn } = load(store, div);
    const t = await fn();
    check('T17 divergence recorded; V1 still drives the decision field', () => {
      assert.strictEqual(t.divergences, 1);
      const r = store.vi_predictions['AAPL_2026-08-07'];
      assert.strictEqual(r.decision,   'BUY');        // V1 unchanged
      assert.strictEqual(r.decisionV2, 'BUY SMALL');  // V2 shadow only
      assert.ok(r.divergence);
    });
  }

  // ── T18: non-session guard ──
  {
    const store = {};
    const admin = makeAdmin(store);
    const factory = new Function(
      'admin', 'console', 'getTradingDate', 'isTradingDay', 'SYMBOLS', 'VI_COL',
      'buildViPredictionRecord', 'classifyDualEngine', 'VI_CLASS', 'computeMISnapshot',
      `${CAPTURE_SRC}\nreturn runV2ShadowCapture;`
    );
    // 2026-08-08 is a Saturday.
    const fn = factory(admin, { warn() {}, log() {} }, () => '2026-08-08', isTradingDay,
      ['AAPL'], 'vi_predictions', buildViPredictionRecord, classifyDualEngine, VI_CLASS,
      async () => { throw new Error('MI must not be called on a non-session'); });
    const t = await fn();
    check('T18 no capture on a non-session day', () => {
      assert.strictEqual(t.skipped, 'not_a_trading_day');
      assert.strictEqual(Object.keys(store.vi_predictions || {}).length, 0);
    });
  }

  console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
