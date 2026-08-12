// VESTEX — Repair 6 regression test: honest integrity counts
//
// The defect: audit endpoints read a capped page and published the result as a
// count. One run reported exactly 1000 orphan pattern fires — that was the cap,
// not a measurement. Orphans were also computed by comparing a 1000-row pattern
// sample against a 500-row prediction sample, which manufactures orphans.
//
// These tests execute the real auditCollectAll against a mock Firestore and
// then statically assert that no audit path can publish a capped number as a
// total again.

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const NORM = SRC.replace(/\r\n/g, '\n');

// ── Extract viPaginate + the audit traversal verbatim ──
const constMatch = NORM.match(/const VI_PAGE_SIZE[\s\S]*?const VI_HORIZON_GRACE = [^\n]*\n/);
const pagMatch   = NORM.match(/async function\* viPaginate[\s\S]*?\n\}\n/);
const auditMatch = NORM.match(/const AUDIT_PAGE_SIZE[\s\S]*?\nasync function auditCollectAll[\s\S]*?\n\}\n/);
assert(constMatch, 'VI pagination constants not found');
assert(pagMatch,   'viPaginate not found');
assert(auditMatch, 'auditCollectAll not found — Repair 6 traversal missing');

function makeMockAdmin(docs) {
  const DOC_ID = Symbol('documentId');
  const sorted = docs.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let reads = 0;
  const admin = {
    firestore: Object.assign(
      () => ({
        collection: () => {
          const state = { after: null, lim: null };
          const q = {
            orderBy: (f) => { assert.strictEqual(f, DOC_ID, 'audit must order by documentId()'); return q; },
            limit: (n) => { state.lim = n; return q; },
            startAfter: (d) => { state.after = d.id; return q; },
            get: async () => {
              reads++;
              let rows = sorted;
              if (state.after) {
                const i = rows.findIndex(r => r.id > state.after);
                rows = i === -1 ? [] : rows.slice(i);
              }
              const page = rows.slice(0, state.lim);
              return {
                empty: page.length === 0,
                size:  page.length,
                docs:  page.map(r => ({ id: r.id, ref: { id: r.id }, data: () => r })),
              };
            },
          };
          return q;
        },
      }),
      { FieldPath: { documentId: () => DOC_ID } }
    ),
  };
  return { admin, reads: () => reads };
}

function loadAudit(docs) {
  const { admin, reads } = makeMockAdmin(docs);
  const factory = new Function('admin', 'console', `
    ${constMatch[0]}
    ${pagMatch[0]}
    ${auditMatch[0]}
    return { auditCollectAll, AUDIT_PAGE_SIZE, AUDIT_MAX_DOCS, AUDIT_MAX_PAGES };
  `);
  return { ...factory(admin, { warn() {}, log() {} }), reads };
}

const rows = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}_${String(i).padStart(6, '0')}`, n: i }));

(async () => {
  let failures = 0;
  const check = (name, fn) => {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  };
  const acheck = async (name, fn) => {
    try { await fn(); console.log(`  PASS  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  };

  const { AUDIT_PAGE_SIZE, AUDIT_MAX_DOCS, AUDIT_MAX_PAGES } = loadAudit([]);
  console.log(`\nAUDIT_PAGE_SIZE=${AUDIT_PAGE_SIZE}  AUDIT_MAX_DOCS=${AUDIT_MAX_DOCS}  AUDIT_MAX_PAGES=${AUDIT_MAX_PAGES}\n`);

  // ── Traversal truth ──
  await acheck('T1  1200 docs (old cap 500) fully traversed and marked complete', async () => {
    const { auditCollectAll } = loadAudit(rows(1200, 'P'));
    const r = await auditCollectAll('vi_predictions');
    assert.strictEqual(r.count, 1200, `count=${r.count}`);
    assert.strictEqual(new Set(r.docs.map(d => d.id)).size, 1200, 'duplicates');
    assert.strictEqual(r.complete, true);
    assert.strictEqual(r.truncated, false);
  });

  await acheck('T2  the old 1000-orphan number is no longer reachable as a cap', async () => {
    // Exactly the shape that produced the bogus report: >1000 fires.
    const { auditCollectAll } = loadAudit(rows(1000, 'F'));
    const r = await auditCollectAll('vi_pattern_fires');
    assert.strictEqual(r.count, 1000);
    assert.strictEqual(r.complete, true, '1000 must be a real total, not a cap');
    const r2 = await loadAudit(rows(1001, 'F')).auditCollectAll('vi_pattern_fires');
    assert.strictEqual(r2.count, 1001, 'must read past 1000');
  });

  await acheck('T3  empty collection is complete, not truncated', async () => {
    const { auditCollectAll } = loadAudit([]);
    const r = await auditCollectAll('vi_predictions');
    assert.strictEqual(r.count, 0);
    assert.strictEqual(r.pages, 0);
    assert.strictEqual(r.complete, true);
  });

  await acheck('T4  exact page-size multiple terminates and is marked complete', async () => {
    const { auditCollectAll } = loadAudit(rows(AUDIT_PAGE_SIZE * 3, 'X'));
    const r = await auditCollectAll('vi_predictions');
    assert.strictEqual(r.count, AUDIT_PAGE_SIZE * 3);
    assert.strictEqual(r.complete, true, 'exact multiple must not be mistaken for truncation');
  });

  await acheck('T5  exceeding AUDIT_MAX_DOCS reports truncated, NEVER complete', async () => {
    const { auditCollectAll } = loadAudit(rows(AUDIT_MAX_DOCS + 500, 'B'));
    const r = await auditCollectAll('vi_predictions');
    assert.ok(r.count >= AUDIT_MAX_DOCS, `count=${r.count}`);
    assert.strictEqual(r.complete, false, 'a partial read must never claim completeness');
    assert.strictEqual(r.truncated, true);
  });

  await acheck('T6  document cap is reached before viPaginate page guard', async () => {
    // If the page guard could fire first, viPaginate would stop silently and
    // auditCollectAll would have no way to know it was short.
    assert.ok(AUDIT_MAX_PAGES * AUDIT_PAGE_SIZE >= AUDIT_MAX_DOCS,
      'page budget must cover the document cap');
  });

  await acheck('T7  no duplicate or dropped documents across page boundaries', async () => {
    const src = rows(AUDIT_PAGE_SIZE * 2 + 7, 'D');
    const { auditCollectAll } = loadAudit(src);
    const r = await auditCollectAll('vi_predictions');
    assert.deepStrictEqual(r.docs.map(d => d.id).sort(), src.map(d => d.id).sort());
  });

  await acheck('T8  doc id is attached (duplicate + orphan checks depend on it)', async () => {
    const { auditCollectAll } = loadAudit(rows(5, 'I'));
    const r = await auditCollectAll('vi_predictions');
    assert.ok(r.docs.every(d => typeof d.id === 'string' && d.id.length), 'missing id');
    assert.ok(r.docs.every(d => typeof d.n === 'number'), 'doc data lost');
  });

  // ── /api/db-integrity: caps removed, honesty added ──
  const dbAt  = NORM.indexOf("app.get('/api/db-integrity'");
  assert(dbAt > -1, 'db-integrity route missing');
  const dbEnd = NORM.indexOf("\napp.get('/api/market-health'", dbAt);
  const DBI   = NORM.slice(dbAt, dbEnd);

  check('T9  db-integrity contains no read caps at all', () => {
    const caps = DBI.match(/\.limit\(\s*\d+\s*\)/g) || [];
    assert.deepStrictEqual(caps, [], `capped reads remain: ${caps.join(', ')}`);
  });
  check('T10 both scanned collections go through the full traversal', () => {
    assert.ok(DBI.includes('auditCollectAll(VI_COL)'),     'predictions not full-scanned');
    assert.ok(DBI.includes('auditCollectAll(VI_PAT_COL)'), 'pattern fires not full-scanned');
  });
  check('T11 every reported collection count carries a completeness flag', () => {
    const assigns = DBI.match(/counts\.\w+\s*=\s*[^;]+;/g) || [];
    assert.ok(assigns.length >= 3, `expected >=3 count assignments, saw ${assigns.length}`);
    assigns.forEach(a => assert.ok(/complete:/.test(a),
      `count published without a completeness flag: ${a.trim()}`));
  });

  check('T12 orphans are WITHHELD when either collection is partial', () => {
    assert.ok(DBI.includes('const orphanMeasurable = predScan.complete && patScan.complete;'),
      'orphan measurability gate missing');
    assert.ok(DBI.includes('ORPHAN_PATTERN_FIRES_UNMEASURABLE'), 'unmeasurable branch missing');
    // The withheld issue must carry a null count so it cannot be scored.
    const un = DBI.slice(DBI.indexOf('ORPHAN_PATTERN_FIRES_UNMEASURABLE'));
    assert.ok(/count:\s*null/.test(un.slice(0, 200)), 'withheld orphan issue must report count: null');
  });
  check('T13 a withheld (null) count cannot move the integrity score', () => {
    assert.ok(DBI.includes("if (typeof i.count !== 'number') return;"),
      'score loop must skip non-numeric counts');
    // Prove the arithmetic would otherwise poison the score.
    assert.strictEqual(Math.min(10, null * 1), 0, 'null coerces to 0 in Math.min — hence the guard');
    assert.ok(Number.isNaN(Number(undefined)), 'undefined would NaN the score entirely');
  });
  check('T14 the score itself is labelled provisional when data is partial', () => {
    assert.ok(DBI.includes('const complete = predScan.complete && patScan.complete;'), 'completeness not derived');
    assert.ok(DBI.includes("scoreBasis: complete ? 'complete' : 'provisional'"), 'scoreBasis missing');
    assert.ok(DBI.includes('auditComplete: complete'), 'auditComplete missing');
    assert.ok(DBI.includes('auditNote'), 'auditNote missing');
  });

  // ── The ET regression Repair 3 would otherwise have caused ──
  check('T15 timestamp consistency compares in ET, not UTC', () => {
    assert.ok(DBI.includes('getTradingDate(new Date(p.timestamp))'),
      'must derive the comparison date in ET');
    assert.ok(!/toISOString\(\)\.split\('T'\)\[0\][^\n]*tsDate/.test(DBI),
      'UTC date derivation still present — would flag every pipeline row');
    assert.ok(DBI.includes('TIMESTAMP_INCONSISTENCY'), 'check removed rather than fixed');
  });

  // ── /api/brain-integrity: capped .size was published as a total ──
  const biAt  = NORM.indexOf("app.get('/api/brain-integrity'");
  const biEnd = NORM.indexOf("\napp.get('/api/backtest/run", biAt);
  const BI    = NORM.slice(biAt, biEnd);

  check('T16 brain-integrity no longer counts predictions from a capped read', () => {
    assert.ok(!/VI_COL\)\.limit\(\s*50\s*\)/.test(BI), 'the .limit(50) count is back');
    assert.ok(BI.includes('auditCollectAll(VI_COL)'), 'must use the full traversal');
    assert.ok(BI.includes('totalVIPreds  = scan.count'), 'count must come from the traversal');
  });
  check('T17 brain-integrity publishes whether its counts are complete', () => {
    assert.ok(BI.includes('countsComplete'), 'countsComplete flag missing');
    assert.ok(/viPredictions:\s+totalVIPreds,\n\s+verifiedCount,\n[^\n]*\n\s+countsComplete,/.test(BI),
      'countsComplete must sit alongside the counts it qualifies');
    assert.ok(BI.includes('countsComplete = false;'), 'a failed scan must not report complete');
  });
  check('T18 presence probes stay cheap — .limit(1) is a probe, not a count', () => {
    // These are correct uses: the value is only ever tested with `> 0`.
    assert.ok(BI.includes('db.collection(VI_COL).limit(1).get()'), 'presence probe changed');
    assert.ok(BI.includes('if (viCount > 0)'), 'probe must only be used as a boolean');
    assert.ok(!/viPredictions:\s+viCount/.test(BI), 'a probe size must never be published as a count');
  });

  // ── Remaining sampled endpoints must declare that they are samples ──
  const psAt = NORM.indexOf("app.get('/api/vi/pattern-stats'");
  const PS   = NORM.slice(psAt, NORM.indexOf("\napp.get('/api/vi/catalyst-stats'", psAt));
  const csAt = NORM.indexOf("app.get('/api/vi/catalyst-stats'");
  const CS   = NORM.slice(csAt, NORM.indexOf("\napp.get('/api/win-rates'", csAt));

  check('T19 pattern-stats declares its sample instead of implying a total', () => {
    assert.ok(PS.includes('const sampled = snap.size >= PS_LIMIT;'), 'sampled not derived from the read');
    assert.ok(PS.includes('sampled,'), 'sampled not returned');
    assert.ok(PS.includes('sampleLimit: PS_LIMIT'), 'sampleLimit not returned');
    assert.ok(PS.includes('totalFires: docs.length'), 'totalFires shape changed');
  });
  check('T20 catalyst-stats declares its sample too', () => {
    assert.ok(CS.includes('const sampled = snap.size >= CS_LIMIT;'), 'sampled not derived');
    assert.ok(CS.includes('sampled,'), 'sampled not returned');
  });
  check('T21 no audit or stats endpoint hard-codes a bare numeric cap inline', () => {
    [['pattern-stats', PS, 'PS_LIMIT'], ['catalyst-stats', CS, 'CS_LIMIT']].forEach(([n, body, k]) => {
      assert.ok(body.includes(`.limit(${k})`), `${n} must read through a named, reported cap`);
    });
  });

  // ── Nothing frozen moved ──
  check('T22 no scoring, threshold or verification logic touched by this repair', () => {
    const mi = fs.readFileSync(path.join(ROOT, 'masterIntelligence.js'), 'utf8');
    assert.ok(/const ENGINE_V2_VERSION\s*=\s*['"]v2\.0-shadow-1['"]/.test(mi), 'engine version bumped');
    assert.ok(NORM.includes('function journalIsCorrect'),      'journalIsCorrect missing');
    assert.ok(NORM.includes('function journalDetermineWinner'),'journalDetermineWinner missing');
    // The integrity weighting itself is unchanged — only the guard is new.
    ['DUPLICATE', 'MISSING_7D', 'MISSING_30D', 'ORPHAN', 'DOUBLE_COUNT', 'TIMESTAMP',
     'MISSING_PRICE', 'MISSING_DATE'].forEach(t =>
      assert.ok(DBI.includes(`i.type.includes('${t}')`), `score term ${t} lost`));
    assert.ok(DBI.includes("score >= 90 ? 'HEALTHY'"), 'status thresholds changed');
  });

  console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
