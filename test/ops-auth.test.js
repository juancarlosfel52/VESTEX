// VESTEX — Ops authorization regression test
//
// Extracts the REAL requireOpsSecret guard out of server.js (same technique as
// journal-resolver.test.js) and exercises it against mock req/res objects, so
// the test is bound to the shipped wiring rather than a copy of it.
//
// The headline case is A2: the guard MUST reject a request that sends no secret
// while PIPELINE_SECRET is unset. The previous inline checks were written as
//   req.headers['x-pipeline-secret'] !== process.env.PIPELINE_SECRET
// which compares undefined !== undefined -> false -> ALLOW. An unset env var
// silently published the endpoint. That is the bug this file locks shut.
//
// Sections C and D are source-level assertions: they prove every mutating route
// actually carries the guard, and that no cron reaches its work over HTTP (so
// locking the HTTP surface cannot break automation).

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
  grab(/const crypto = require\('crypto'\);\n/,        'crypto require'),
  grab(/const _secretEq = [\s\S]*?\n\};\n/,            '_secretEq'),
  grab(/function requireOpsSecret[\s\S]*?\n\}\n/,      'requireOpsSecret'),
].join('\n');

// `require` is not in scope inside new Function, so it is injected — the same
// dependency-injection technique journal-resolver.test.js uses for admin/console.
const factory = new Function('require', 'process', `
  ${PARTS}
  return { requireOpsSecret, _secretEq };
`);
const { requireOpsSecret, _secretEq } = factory(require, process);

// ── Harness ──
function run({ secret, headers = {}, query = {} }) {
  const prev = process.env.PIPELINE_SECRET;
  if (secret === undefined) delete process.env.PIPELINE_SECRET;
  else process.env.PIPELINE_SECRET = secret;

  const out = { status: 200, body: null, nextCalled: false };
  const res = {
    status(c) { out.status = c; return res; },
    json(b)   { out.body = b;  return res; },
  };
  try {
    requireOpsSecret({ headers, query }, res, () => { out.nextCalled = true; });
  } finally {
    if (prev === undefined) delete process.env.PIPELINE_SECRET;
    else process.env.PIPELINE_SECRET = prev;
  }
  return out;
}

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else      { console.log(`  FAIL  ${name}`); fail++; }
};

const SEC = 'correct-horse-battery-staple';

console.log('\n── A. Fail-closed behaviour (the regression that matters) ──');

{ // A1
  const r = run({ secret: undefined, headers: { 'x-pipeline-secret': 'anything' } });
  ok('A1 unset PIPELINE_SECRET -> 503, endpoint disabled', r.status === 503 && !r.nextCalled);
}
{ // A2 — THE fail-open regression
  const r = run({ secret: undefined, headers: {} });
  ok('A2 unset secret AND no header sent -> DENIED (was fail-open)',
     !r.nextCalled && (r.status === 503 || r.status === 401));
}
{ // A3
  const r = run({ secret: '', headers: {} });
  ok('A3 empty-string PIPELINE_SECRET treated as unconfigured -> 503',
     r.status === 503 && !r.nextCalled);
}

console.log('\n── B. Authorization decisions ──');

{ // B1
  const r = run({ secret: SEC, headers: { 'x-pipeline-secret': SEC } });
  ok('B1 correct header -> next() called, no status override',
     r.nextCalled === true && r.body === null);
}
{ // B2
  const r = run({ secret: SEC, headers: { 'x-pipeline-secret': 'wrong' } });
  ok('B2 wrong header -> 401, next() NOT called', r.status === 401 && !r.nextCalled);
}
{ // B3
  const r = run({ secret: SEC, headers: {} });
  ok('B3 missing header while secret configured -> 401', r.status === 401 && !r.nextCalled);
}
{ // B4
  const r = run({ secret: SEC, query: { secret: SEC } });
  ok('B4 correct ?secret= query -> next() called', r.nextCalled === true);
}
{ // B5
  const r = run({ secret: SEC, query: { secret: 'nope' } });
  ok('B5 wrong ?secret= query -> 401', r.status === 401 && !r.nextCalled);
}
{ // B6 — length mismatch must not throw (timingSafeEqual requires equal lengths)
  let threw = null, r = null;
  try { r = run({ secret: SEC, headers: { 'x-pipeline-secret': 'short' } }); }
  catch (e) { threw = e; }
  ok('B6 length-mismatched secret -> 401, never throws', !threw && r.status === 401);
}
{ // B7
  const r = run({ secret: SEC, headers: { 'x-pipeline-secret': SEC.toUpperCase() } });
  ok('B7 comparison is case-sensitive -> 401', r.status === 401 && !r.nextCalled);
}
{ // B8 — near miss, same length, differs in one char
  const near = SEC.slice(0, -1) + 'X';
  const r = run({ secret: SEC, headers: { 'x-pipeline-secret': near } });
  ok('B8 same-length near-miss -> 401', r.status === 401 && !r.nextCalled);
}
{ // B9 — header wins over query, and a good header is not spoiled by a bad query
  const r = run({ secret: SEC, headers: { 'x-pipeline-secret': SEC }, query: { secret: 'junk' } });
  ok('B9 valid header takes precedence over bad query -> allowed', r.nextCalled === true);
}
{ // B10 — non-string offered values must not crash the guard
  let threw = null, r = null;
  try { r = run({ secret: SEC, query: { secret: ['a', 'b'] } }); }
  catch (e) { threw = e; }
  ok('B10 array/non-string secret -> 401, never throws', !threw && r.status === 401);
}
{ // B11 — _secretEq direct: type safety
  ok('B11 _secretEq rejects non-string inputs',
     _secretEq(undefined, undefined) === false &&
     _secretEq(null, null) === false &&
     _secretEq('a', undefined) === false);
}
{ // B12
  ok('B12 _secretEq accepts an exact match', _secretEq(SEC, SEC) === true);
}

console.log('\n── C. Every mutating route carries the guard ──');

// Route -> must be protected. These are the endpoints that write to Firestore,
// spend API quota, or trigger the pipeline.
const MUST_GUARD = [
  "/api/v2-capture/run",
  "/api/journal/run",
  "/api/journal/resolve",
  "/api/journal/econ-backfill",
  "/api/v2-repair",
  "/api/pipeline/run",
  "/api/sentiment/refresh",
];

for (const route of MUST_GUARD) {
  const re = new RegExp(`app\\.(?:get|post)\\('${route.replace(/\//g, '\\/')}'([^)]*)`);
  const m  = SRC.match(re);
  ok(`C ${route} declares requireOpsSecret`,
     !!m && m[1].includes('requireOpsSecret'));
}

{ // C8 — the old fail-open idiom must be gone from EXECUTABLE code.
  // Line comments are stripped first: requireOpsSecret documents the old bug
  // verbatim, and that prose must not satisfy the assertion either way.
  const code = SRC.split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
  const failOpen = /headers\['x-pipeline-secret'\]\s*!==\s*process\.env\.PIPELINE_SECRET/.test(code);
  ok('C8 legacy fail-open comparison gone from executable code', failOpen === false);
}

{ // C9 — read-only endpoints must NOT be guarded (the UI depends on them)
  const mustStayOpen = ['/api/journal', '/api/predictions', '/api/accuracy'];
  const bad = mustStayOpen.filter(r => {
    const m = SRC.match(new RegExp(`app\\.get\\('${r.replace(/\//g, '\\/')}'([^)]*)`));
    return m && m[1].includes('requireOpsSecret');
  });
  ok('C9 read-only data endpoints remain public', bad.length === 0);
}

console.log('\n── D. Automation cannot be broken by the lock ──');

{ // D1 — every cron must invoke its work in-process, not over HTTP
  const crons = SRC.match(/cron\.schedule\([\s\S]*?\{[\s\S]*?\}/g) || [];
  ok('D1 cron schedules found in source', crons.length >= 6);
  const httpCron = crons.filter(c => /axios|fetch\(|localhost/.test(c));
  ok('D2 no cron reaches its work over HTTP', httpCron.length === 0);
}

{ // D3 — the guard is middleware only; it must not appear inside the resolver
  const resolver = SRC.match(/async function runJournalResolver[\s\S]*?\n\}\n/);
  ok('D3 resolver logic itself is auth-free (callable by cron)',
     !!resolver && !/requireOpsSecret|PIPELINE_SECRET/.test(resolver[0]));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURE(S)`}  (${pass} passed)\n`);
process.exit(fail === 0 ? 0 : 1);
