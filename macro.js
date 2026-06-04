// ═══════════════════════════════════════════════════════════
//  VESTEX — Macro Snapshot
//  Fetches a point-in-time macro snapshot for pipeline runs.
//  Stored inside every prediction so accuracy checks know
//  which economic environment the model was operating under.
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// Same series the frontend displays — keeps snapshot consistent
const FRED_SERIES = [
  { key: 'yieldCurve',    id: 'T10Y2Y',        label: 'Yield Curve (10Y−2Y)'   },
  { key: 'treasury10y',   id: 'DGS10',          label: '10-Year Treasury'       },
  { key: 'creditSpread',  id: 'BAMLH0A0HYM2',  label: 'HY Credit Spread'       },
  { key: 'inflation',     id: 'T10YIE',         label: 'Inflation Expectations' },
  { key: 'stressIndex',   id: 'STLFSI4',        label: 'Financial Stress Index' },
  { key: 'fedFunds',      id: 'FEDFUNDS',       label: 'Fed Funds Rate'         },
  { key: 'unemployment',  id: 'UNRATE',         label: 'Unemployment Rate'      },
  { key: 'sahmRule',      id: 'SAHMCURRENT',    label: 'Sahm Rule Indicator'    },
];

async function fetchOneSeries(id, apiKey) {
  const res = await axios.get(FRED_BASE, {
    params: { series_id: id, sort_order: 'desc', limit: 3, file_type: 'json', api_key: apiKey },
    timeout: 8000,
  });
  const obs    = res.data.observations || [];
  const latest = obs.find(o => o.value !== '.' && o.value !== '');
  return latest
    ? { value: parseFloat(latest.value), date: latest.date }
    : { value: null, date: null };
}

// ── Fetch all FRED series + accept external F&G and VIX ──
// Returns a flat snapshot object ready to embed in a prediction doc.
async function fetchMacroSnapshot(regime) {
  const apiKey = process.env.FRED_API_KEY;
  const snapshot = { capturedAt: new Date().toISOString() };

  // FRED — parallel fetch, fail silently per series
  if (apiKey) {
    const results = await Promise.allSettled(
      FRED_SERIES.map(s => fetchOneSeries(s.id, apiKey))
    );
    FRED_SERIES.forEach((s, i) => {
      const r = results[i];
      snapshot[s.key] = (r.status === 'fulfilled')
        ? { label: s.label, value: r.value.value, date: r.value.date }
        : { label: s.label, value: null, date: null };
    });
  } else {
    FRED_SERIES.forEach(s => {
      snapshot[s.key] = { label: s.label, value: null, date: null };
    });
  }

  // Fear & Greed + VIX — passed in from brain regime (already fetched, no extra API call)
  snapshot.fearGreed = regime?.fng
    ? { value: regime.fng.value, label: regime.fng.label }
    : { value: null, label: null };

  snapshot.vix = regime?.vix != null
    ? { value: regime.vix }
    : { value: null };

  snapshot.regime = regime?.regime || null;

  return snapshot;
}

module.exports = { fetchMacroSnapshot };
