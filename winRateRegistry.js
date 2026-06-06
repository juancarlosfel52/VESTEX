// ═══════════════════════════════════════════════════════════
//  VESTEX — Win Rate Registry  (Phase 2A)
//
//  Resolution hierarchy:
//   1. VERIFIED   — ≥20 verified fires in vi_pattern_fires (7d window)
//   2. HAND_CODED — developer-set pattern.win_rate field
//   3. DEFAULT    — 0.55 fallback
//
//  This module is a singleton. Firestore is never imported here —
//  server.js calls refreshRegistry(db) after each VI verification
//  cycle, populating the in-memory cache.
//
//  brain.js and livePatternMatcher.js call resolveWinRate() directly.
//  When ≥20 fires accumulate for a pattern, the engine automatically
//  promotes it to the VERIFIED tier with no additional code changes.
// ═══════════════════════════════════════════════════════════
'use strict';

const MIN_VERIFIED_FIRES = 20;
const DEFAULT_WIN_RATE   = 0.55; // decimal

// { [patternId]: { rate: number (decimal), uses: number, lastUpdated: ms } }
let _cache        = {};
let _lastRefreshed = 0;

// ─────────────────────────────────────────────────────────
//  resolveWinRate
//  Returns the win rate to use plus its source label.
//
//  @param {string}      patternId
//  @param {number|null} handCodedWinRate  — pattern.win_rate as percentage (e.g. 68)
//  @returns {{ rate: number, source: 'VERIFIED'|'HAND_CODED'|'DEFAULT', uses: number }}
// ─────────────────────────────────────────────────────────
function resolveWinRate(patternId, handCodedWinRate) {
  const cached = _cache[patternId];

  // Tier 1 — VERIFIED
  if (cached && cached.uses >= MIN_VERIFIED_FIRES) {
    return { rate: cached.rate, source: 'VERIFIED', uses: cached.uses };
  }

  // Tier 2 — HAND_CODED
  if (handCodedWinRate != null && !isNaN(handCodedWinRate)) {
    const rate = +Math.min(1, Math.max(0.30, handCodedWinRate / 100)).toFixed(3);
    return { rate, source: 'HAND_CODED', uses: cached?.uses ?? 0 };
  }

  // Tier 3 — DEFAULT
  return { rate: DEFAULT_WIN_RATE, source: 'DEFAULT', uses: cached?.uses ?? 0 };
}

// ─────────────────────────────────────────────────────────
//  refreshRegistry
//  Aggregates 7d verification outcomes per patternId from
//  vi_pattern_fires and rebuilds the in-memory cache.
//  Called by server.js after each runVIVerification() call.
//
//  @param {FirebaseFirestore.Firestore} db
// ─────────────────────────────────────────────────────────
async function refreshRegistry(db) {
  try {
    const snap = await db.collection('vi_pattern_fires')
      .where('verification7d', '!=', null)
      .limit(2000)
      .get();

    if (snap.empty) {
      console.log('[WinRateRegistry] No verified pattern fires yet — cache unchanged');
      return;
    }

    // Aggregate wins/total per patternId
    const agg = {};
    snap.docs.forEach(doc => {
      const d  = doc.data();
      const id = d.patternId;
      if (!id) return;
      const v7 = d.verification7d;
      if (!v7 || v7.correct == null) return;
      if (!agg[id]) agg[id] = { wins: 0, total: 0 };
      agg[id].total++;
      if (v7.correct) agg[id].wins++;
    });

    // Build new cache
    const next = {};
    Object.entries(agg).forEach(([id, { wins, total }]) => {
      next[id] = {
        rate:        +Math.min(1, Math.max(0.30, wins / total)).toFixed(3),
        uses:        total,
        lastUpdated: Date.now(),
      };
    });

    _cache        = next;
    _lastRefreshed = Date.now();

    const qualified = Object.values(next).filter(v => v.uses >= MIN_VERIFIED_FIRES).length;
    const tracked   = Object.keys(next).length;
    console.log(`[WinRateRegistry] Refreshed — ${tracked} patterns tracked, ${qualified} qualified for VERIFIED tier (min ${MIN_VERIFIED_FIRES} fires)`);
  } catch (e) {
    console.warn('[WinRateRegistry] Refresh failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────
//  getRegistrySnapshot
//  Returns a read-only view of the current cache.
//  Used by GET /api/win-rates.
// ─────────────────────────────────────────────────────────
function getRegistrySnapshot() {
  return {
    lastRefreshed:    _lastRefreshed || null,
    minFiresRequired: MIN_VERIFIED_FIRES,
    patternCount:     Object.keys(_cache).length,
    qualifiedCount:   Object.values(_cache).filter(v => v.uses >= MIN_VERIFIED_FIRES).length,
    entries: Object.entries(_cache).map(([id, v]) => ({
      patternId:      id,
      verifiedRatePct: +(v.rate * 100).toFixed(1),
      uses:           v.uses,
      tier:           v.uses >= MIN_VERIFIED_FIRES ? 'VERIFIED' : 'ACCUMULATING',
      lastUpdated:    v.lastUpdated,
    })).sort((a, b) => b.uses - a.uses),
  };
}

module.exports = { resolveWinRate, refreshRegistry, getRegistrySnapshot, MIN_VERIFIED_FIRES, DEFAULT_WIN_RATE };
