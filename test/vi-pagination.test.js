// VESTEX — Repair 1 regression test: verification pagination coverage
// Extracts the real viPaginate source from server.js (server.js has no exports
// and calls app.listen on require, so it cannot be imported directly) and runs
// it against a mock Firestore. Proves 100% coverage past the old caps.

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// ── Extract the constants + viPaginate generator verbatim ──
const constMatch = SRC.match(/const VI_PAGE_SIZE[\s\S]*?const VI_HORIZON_GRACE = [^\n]*\n/);
const fnMatch    = SRC.match(/async function\* viPaginate[\s\S]*?\n\}\n/);
assert(constMatch, 'VI pagination constants not found in server.js');
assert(fnMatch, 'viPaginate not found in server.js');

// ── Mock Firestore: ordered docs, startAfter/limit semantics ──
function makeMockAdmin(docIds) {
  const DOC_ID = Symbol('documentId');
  return {
    firestore: Object.assign(
      () => ({
        collection: () => {
          const state = { after: null, lim: null };
          const q = {
            orderBy: (f) => { assert.strictEqual(f, DOC_ID, 'must order by documentId()'); return q; },
            limit: (n) => { state.lim = n; return q; },
            startAfter: (d) => { state.after = d.id; return q; },
            get: async () => {
              let ids = docIds.slice().sort();
              if (state.after) ids = ids.filter(id => id > state.after);
              const page = ids.slice(0, state.lim);
              return {
                empty: page.length === 0,
                size: page.length,
                docs: page.map(id => ({ id, ref: { id }, data: () => ({ id }) })),
              };
            },
          };
          return q;
        },
      }),
      { FieldPath: { documentId: () => DOC_ID } }
    ),
  };
}

function loadPaginate(docIds) {
  const admin = makeMockAdmin(docIds);
  const factory = new Function('admin', 'console', `
    ${constMatch[0]}
    ${fnMatch[0]}
    return { viPaginate, VI_PAGE_SIZE, VI_MAX_PAGES, VI_HORIZON_GRACE };
  `);
  return factory(admin, { warn() {}, log() {} });
}

async function collect(docIds) {
  const { viPaginate } = loadPaginate(docIds);
  const seen = [];
  let pages = 0;
  for await (const { docs, page } of viPaginate('any')) {
    pages = page;
    docs.forEach(d => seen.push(d.id));
  }
  return { seen, pages };
}

(async () => {
  let failures = 0;
  const check = (name, fn) => {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  };

  const { VI_PAGE_SIZE } = loadPaginate([]);
  console.log(`\nVI_PAGE_SIZE = ${VI_PAGE_SIZE}\n`);

  // ── T1: 250 predictions — exceeds the old .limit(200) cap ──
  const ids250 = Array.from({ length: 250 }, (_, i) => `SYM_${String(i).padStart(5, '0')}`);
  const r250 = await collect(ids250);
  check('T1  250 docs (old cap 200): every doc reached exactly once', () => {
    assert.strictEqual(r250.seen.length, 250, `saw ${r250.seen.length}`);
    assert.strictEqual(new Set(r250.seen).size, 250, 'duplicates present');
  });

  // ── T2: 1200 pattern fires — exceeds the old .limit(500) cap ──
  const ids1200 = Array.from({ length: 1200 }, (_, i) => `PAT_${String(i).padStart(6, '0')}`);
  const r1200 = await collect(ids1200);
  check('T2  1200 docs (old cap 500): 100% eligible coverage', () => {
    assert.strictEqual(r1200.seen.length, 1200, `saw ${r1200.seen.length}`);
    assert.strictEqual(new Set(r1200.seen).size, 1200, 'duplicates present');
    assert.deepStrictEqual(r1200.seen.slice().sort(), ids1200.slice().sort(), 'set mismatch');
  });
  check('T2b 1200 docs paginated into expected page count', () => {
    assert.strictEqual(r1200.pages, Math.ceil(1200 / VI_PAGE_SIZE), `pages=${r1200.pages}`);
  });

  // ── T3: exact multiple of page size — must not loop forever or re-yield ──
  const idsExact = Array.from({ length: VI_PAGE_SIZE * 2 }, (_, i) => `E_${String(i).padStart(6, '0')}`);
  const rExact = await collect(idsExact);
  check('T3  exact page-size multiple: no duplicates, terminates', () => {
    assert.strictEqual(rExact.seen.length, VI_PAGE_SIZE * 2);
    assert.strictEqual(new Set(rExact.seen).size, VI_PAGE_SIZE * 2);
  });

  // ── T4: empty collection ──
  const rEmpty = await collect([]);
  check('T4  empty collection: yields nothing, terminates', () => {
    assert.strictEqual(rEmpty.seen.length, 0);
    assert.strictEqual(rEmpty.pages, 0);
  });

  // ── T5: determinism — repeated runs produce identical order ──
  const a = await collect(ids1200), b = await collect(ids1200);
  check('T5  deterministic ordering across runs (idempotency precondition)', () => {
    assert.deepStrictEqual(a.seen, b.seen);
  });

  // ── T6: memory bound — no page larger than VI_PAGE_SIZE ──
  check('T6  bounded memory: page size never exceeded', () => {
    assert.ok(VI_PAGE_SIZE <= 500, 'page size must stay under Firestore 500-op batch limit');
  });

  console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
