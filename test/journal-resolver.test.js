// VESTEX — Repair 2 regression test: journal unresolved resolver
// Extracts the real resolver + its dependencies from server.js and runs them
// against a mock Firestore. Proves: resolution of aged entries, idempotency
// across 3 runs, locked winners never rewritten, no fabricated outcomes, and
// that instrument-artifact rows are excluded from the validated scoreboard.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function grab(re, label) {
  const m = SRC.match(re);
  assert(m, `${label} not found in server.js`);
  return m[0];
}

const PARTS = [
  grab(/const VI_COL     = [^\n]*\n/, 'VI_COL'),
  grab(/const JOURNAL_COL           = [^\n]*\n/, 'JOURNAL_COL'),
  grab(/const JOURNAL_COMPARISON_RULES = \{[\s\S]*?\n\};\n/, 'JOURNAL_COMPARISON_RULES'),
  grab(/function journalIsCorrect[\s\S]*?\n\}\n/, 'journalIsCorrect'),
  grab(/function journalHypotheticalReturn[\s\S]*?\n\}\n/, 'journalHypotheticalReturn'),
  grab(/function journalDetermineWinner[\s\S]*?\n\}\n/, 'journalDetermineWinner'),
  grab(/function buildJournalVerificationBlock[\s\S]*?\n\}\n/, 'buildJournalVerificationBlock'),
  grab(/const JOURNAL_CLASS = VI_CLASS;\nconst journalDualEngineClass = classifyDualEngine;\n/, 'journal class delegation'),
  grab(/function buildJournalScoreboard[\s\S]*?\n\}\n/, 'buildJournalScoreboard'),
  grab(/function buildJournalValidatedScoreboard[\s\S]*?\n\}\n/, 'buildJournalValidatedScoreboard'),
  grab(/const VI_PAGE_SIZE[\s\S]*?const VI_HORIZON_GRACE = [^\n]*\n/, 'VI constants'),
  grab(/async function\* viPaginate[\s\S]*?\n\}\n/, 'viPaginate'),
  grab(/async function runJournalResolver[\s\S]*?\n\}\n(?=\n\/\/ ── Journal endpoints)/, 'runJournalResolver'),
].join('\n');

// ── Mock Firestore ──
function makeDb(store) {
  const DOC_ID = Symbol('documentId');
  const admin = {
    firestore: Object.assign(
      () => ({
        collection: (name) => {
          const st = { after: null, lim: null, whereField: null, whereVal: null };
          const q = {
            orderBy: () => q,
            limit: (n) => { st.lim = n; return q; },
            startAfter: (d) => { st.after = d.id; return q; },
            where: (f, _op, v) => { st.whereField = f; st.whereVal = v; return q; },
            get: async () => {
              let ids = Object.keys(store[name] || {}).sort();
              if (st.whereField) ids = ids.filter(id => store[name][id][st.whereField] === st.whereVal);
              if (st.after) ids = ids.filter(id => id > st.after);
              const page = st.lim ? ids.slice(0, st.lim) : ids;
              return {
                empty: page.length === 0,
                size: page.length,
                docs: page.map(id => ({
                  id,
                  data: () => JSON.parse(JSON.stringify(store[name][id])),
                  ref: {
                    id,
                    update: async (patch) => { Object.assign(store[name][id], JSON.parse(JSON.stringify(patch))); },
                  },
                })),
              };
            },
          };
          return q;
        },
      }),
      { FieldPath: { documentId: () => DOC_ID } }
    ),
  };
  return admin;
}

// Comparability now lives in ./viRecord and is shared with the writer, so the
// sandbox imports it rather than extracting a second copy. The delegation
// lines are still extracted above, which keeps this test bound to the real
// wiring: if server.js stops delegating, the grab() assertion fires.
const { VI_CLASS, classifyDualEngine } = require('../viRecord');

function load(store) {
  const admin = makeDb(store);
  const factory = new Function('admin', 'console', 'VI_CLASS', 'classifyDualEngine', `
    ${PARTS}
    return { runJournalResolver, JOURNAL_CLASS, journalDualEngineClass, buildJournalValidatedScoreboard };
  `);
  return factory(admin, { warn() {}, log() {} }, VI_CLASS, classifyDualEngine);
}

// ── Fixtures ──
const V7 = { returnPct: 3.2, spyReturn: 1.0, priceAfter: 330, verifiedAt: 1000 };

function journalEntry(over = {}) {
  return {
    decisionV1: 'HOLD', masterScoreV1: 45, confidenceV1: 69, brainScoreV1: 5,
    decisionV2: 'HOLD', masterScoreV2: 50, confidenceV2: 69, brainScoreV2: 9.7,
    engineVersion: 'v2.0-shadow-1',
    verification7d: null, verification30d: null,
    ...over,
  };
}

function store({ pred = {}, entries = {} } = {}) {
  return {
    research_journal: {
      '2026-07-31': {
        date: '2026-07-31',
        entries,
        scoreboard: { v1_better: 0, v2_better: 0, both_correct: 0, both_wrong: 0, tie: 0, not_comparable: 0, pending: Object.keys(entries).length },
      },
    },
    vi_predictions: pred,
  };
}

(async () => {
  let failures = 0;
  const check = (name, fn) => {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  };

  // ── T1: aged entry with verified source resolves ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: 'WAIT' }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: V7, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    const t = await runJournalResolver();
    const e = s.research_journal['2026-07-31'].entries.AAPL;
    check('T1  aged entry with verified source resolves out of pending', () => {
      assert.strictEqual(t.resolved7d, 1, 'resolved7d');
      assert.ok(e.verification7d, 'verification7d attached');
      assert.notStrictEqual(e.verification7d.winner, 'pending', `winner=${e.verification7d.winner}`);
      assert.strictEqual(e.verification7d.returnPct, 3.2);
    });
    check('T1b validated scoreboard counts it (same-snapshot, complete)', () => {
      assert.strictEqual(e.comparabilityClass, 'COMPLETE_DUAL_ENGINE', e.comparabilityClass);
      const vs = s.research_journal['2026-07-31'].validatedScoreboard;
      assert.strictEqual(vs.excluded, 0, `excluded=${vs.excluded}`);
      assert.strictEqual(vs.v1_better + vs.v2_better + vs.both_correct + vs.both_wrong + vs.tie, 1);
    });
  }

  // ── T2: idempotency across 3 runs ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: 'WAIT' }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: V7, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    const t1 = await runJournalResolver();
    const snap1 = JSON.stringify(s.research_journal['2026-07-31'].entries);
    const t2 = await runJournalResolver();
    const snap2 = JSON.stringify(s.research_journal['2026-07-31'].entries);
    const t3 = await runJournalResolver();
    const snap3 = JSON.stringify(s.research_journal['2026-07-31'].entries);
    check('T2  run 1 writes', () => assert.strictEqual(t1.docsUpdated, 1));
    check('T2b runs 2 and 3 produce zero semantic change', () => {
      assert.strictEqual(snap1, snap2, 'run 2 mutated entries');
      assert.strictEqual(snap2, snap3, 'run 3 mutated entries');
    });
    check('T2c runs 2 and 3 perform zero 7d re-resolution', () => {
      assert.strictEqual(t2.resolved7d, 0, `run2 resolved7d=${t2.resolved7d}`);
      assert.strictEqual(t3.resolved7d, 0, `run3 resolved7d=${t3.resolved7d}`);
    });
  }

  // ── T3: locked winner never rewritten even if source changes ──
  {
    const locked = journalEntry({
      decisionV2: 'WAIT',
      verification7d: { returnPct: 9.9, spyReturn: 0, spyRelative: 9.9, priceAfter: 999, winner: 'v2_better', verifiedAt: 1 },
    });
    const s = store({
      entries: { AAPL: locked },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: { returnPct: -50, spyReturn: 0, priceAfter: 1, verifiedAt: 2 }, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    await runJournalResolver();
    const e = s.research_journal['2026-07-31'].entries.AAPL;
    check('T3  locked 7d winner is never overwritten', () => {
      assert.strictEqual(e.verification7d.winner, 'v2_better');
      assert.strictEqual(e.verification7d.returnPct, 9.9, 'locked returnPct mutated');
    });
  }

  // ── T4: no source verification => stays pending, nothing fabricated ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: 'WAIT' }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: null, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    const t = await runJournalResolver();
    const e = s.research_journal['2026-07-31'].entries.AAPL;
    check('T4  unverified source: no outcome fabricated', () => {
      assert.strictEqual(t.resolved7d, 0);
      assert.strictEqual(e.verification7d, null, 'verification7d should stay null');
    });
  }

  // ── T5: missing source prediction => counted, left pending ──
  {
    const s = store({ entries: { AAPL: journalEntry() }, pred: {} });
    const { runJournalResolver } = load(s);
    const t = await runJournalResolver();
    check('T5  missing source prediction leaves entry pending', () => {
      assert.strictEqual(t.missingSource, 1);
      assert.strictEqual(t.resolved7d, 0);
      assert.strictEqual(s.research_journal['2026-07-31'].entries.AAPL.verification7d, null);
    });
  }

  // ── T6: Jul 24 shape — V2 merged onto pipeline doc => artifact, excluded ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ masterScoreV1: null, decisionV1: 'SELL', decisionV2: 'WAIT' }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'SELL', masterScore: null,
              priceAtPrediction: 321, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              decisionSource: 'pipeline-direction', v2ShadowMergedAt: 12345,
              verification7d: V7, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    await runJournalResolver();
    const e  = s.research_journal['2026-07-31'].entries.AAPL;
    const vs = s.research_journal['2026-07-31'].validatedScoreboard;
    check('T6  mixed-snapshot row classified V2_INSTRUMENT_ARTIFACT', () => {
      assert.strictEqual(e.comparabilityClass, 'V2_INSTRUMENT_ARTIFACT', e.comparabilityClass);
    });
    check('T6b artifact excluded from validated scoreboard (no invalid verdict)', () => {
      assert.strictEqual(vs.excluded, 1);
      assert.strictEqual(vs.v1_better + vs.v2_better + vs.both_correct + vs.both_wrong + vs.tie, 0,
        'artifact leaked a verdict into the promotion tally');
      assert.strictEqual(vs.excludedByClass.V2_INSTRUMENT_ARTIFACT, 1);
    });
    check('T6c legacy scoreboard still records the raw outcome (history preserved)', () => {
      assert.ok(e.verification7d, 'raw verification still attached');
    });
  }

  // ── T7: V2 absent => V2_NOT_CAPTURED, excluded, legacy = not_comparable ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: null, masterScoreV2: null }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: null, masterScoreV2: null,
              verification7d: V7, verification30d: null } },
    });
    const { runJournalResolver } = load(s);
    await runJournalResolver();
    const e  = s.research_journal['2026-07-31'].entries.AAPL;
    const sb = s.research_journal['2026-07-31'].scoreboard;
    const vs = s.research_journal['2026-07-31'].validatedScoreboard;
    check('T7  V2-less row classified V2_NOT_CAPTURED and excluded', () => {
      assert.strictEqual(e.comparabilityClass, 'V2_NOT_CAPTURED');
      assert.strictEqual(vs.excluded, 1);
    });
    check('T7b legacy scoreboard moves it pending -> not_comparable (honest)', () => {
      assert.strictEqual(sb.not_comparable, 1, JSON.stringify(sb));
      assert.strictEqual(sb.pending, 0);
    });
  }

  // ── T8: 30d resolves independently of an already-locked 7d ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: 'WAIT',
        verification7d: { returnPct: 3.2, winner: 'v1_better', verifiedAt: 1 } }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: V7, verification30d: { returnPct: -2.5, spyReturn: 1, priceAfter: 300, verifiedAt: 5000 } } },
    });
    const { runJournalResolver } = load(s);
    const t = await runJournalResolver();
    const e = s.research_journal['2026-07-31'].entries.AAPL;
    check('T8  30d resolves while locked 7d is preserved', () => {
      assert.strictEqual(t.resolved30d, 1);
      assert.strictEqual(t.resolved7d, 0, 'locked 7d was re-resolved');
      assert.strictEqual(e.verification7d.winner, 'v1_better');
      assert.ok(e.verification30d);
      assert.strictEqual(e.verification30d.returnPct, -2.5);
    });
  }

  // ── T9: dryRun writes nothing ──
  {
    const s = store({
      entries: { AAPL: journalEntry({ decisionV2: 'WAIT' }) },
      pred: { AAPL_2026_07_31: { symbol: 'AAPL', date: '2026-07-31', decision: 'HOLD', masterScore: 45,
              priceAtPrediction: 318, decisionV2: 'WAIT', masterScoreV2: 43, engineVersion: 'v2.0-shadow-1',
              verification7d: V7, verification30d: null } },
    });
    const before = JSON.stringify(s.research_journal);
    const { runJournalResolver } = load(s);
    const t = await runJournalResolver({ dryRun: true });
    check('T9  dryRun reports intent and writes nothing', () => {
      assert.strictEqual(t.docsUpdated, 1);
      assert.strictEqual(JSON.stringify(s.research_journal), before, 'dryRun mutated store');
    });
  }

  console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
