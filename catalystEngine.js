// ═══════════════════════════════════════════════════════════
//  VESTEX CATALYST EVENT LAYER
//
//  PURPOSE: Extract real, structured events from news headlines,
//  SEC filings, and macro calendars. Return a confidence modifier
//  and warnings only — NEVER touch masterScore or consensusScore.
//
//  RULE: News can only ADD/REDUCE confidence and add warnings.
//        It never drives the primary prediction direction.
//
//  Output of computeCatalystModifier:
//    confidenceDelta  — clamped ±20 pts, applied to result.confidence only
//    warnings[]       — strings shown in UI
//    activeCatalysts[]— structured catalyst events for display
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const MODEL      = 'claude-haiku-4-5-20251001';

// ── FOMC meeting dates for next 60 days (hardcoded, updated quarterly) ──
// Format: YYYY-MM-DD (second day of each 2-day meeting = decision day)
const FOMC_DATES_2026 = [
  '2026-01-29', '2026-03-18', '2026-05-07', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
];

// ── Event type taxonomy ──
const EVENT_TYPES = {
  EARNINGS:            'EARNINGS',
  FOMC_MEETING:        'FOMC_MEETING',
  PRODUCT_LAUNCH:      'PRODUCT_LAUNCH',
  MERGER_ACQUISITION:  'MERGER_ACQUISITION',
  REGULATORY_ACTION:   'REGULATORY_ACTION',
  CEO_CHANGE:          'CEO_CHANGE',
  LAYOFFS:             'LAYOFFS',
  GUIDANCE_CHANGE:     'GUIDANCE_CHANGE',
  ANALYST_UPGRADE:     'ANALYST_UPGRADE',
  ANALYST_DOWNGRADE:   'ANALYST_DOWNGRADE',
  LEGAL_ACTION:        'LEGAL_ACTION',
  PARTNERSHIP:         'PARTNERSHIP',
  SHARE_BUYBACK:       'SHARE_BUYBACK',
  DIVIDEND_CHANGE:     'DIVIDEND_CHANGE',
  MACRO_EVENT:         'MACRO_EVENT',
};

// Impact weights per event type — how much each type can shift confidence
const IMPACT_WEIGHTS = {
  EARNINGS:            18,
  FOMC_MEETING:        12,
  MERGER_ACQUISITION:  16,
  REGULATORY_ACTION:   14,
  CEO_CHANGE:          12,
  GUIDANCE_CHANGE:     15,
  ANALYST_UPGRADE:      8,
  ANALYST_DOWNGRADE:    8,
  LEGAL_ACTION:        13,
  PRODUCT_LAUNCH:       9,
  LAYOFFS:              8,
  PARTNERSHIP:          7,
  SHARE_BUYBACK:       10,
  DIVIDEND_CHANGE:      9,
  MACRO_EVENT:         10,
};

// Edgar form → event type mapping
const FORM_TYPE_MAP = {
  '8-K':    EVENT_TYPES.MERGER_ACQUISITION,  // generic material event (refined by Claude)
  '10-Q':   EVENT_TYPES.EARNINGS,
  '10-K':   EVENT_TYPES.EARNINGS,
  'SC 13G': EVENT_TYPES.SHARE_BUYBACK,
  'SC 13D': EVENT_TYPES.SHARE_BUYBACK,
  'DEF 14A': null,                           // proxy — skip
  '4':       null,                           // insider trade — skip (handled elsewhere)
};

// ─────────────────────────────────────────────────────────────
//  DATE UTILITIES
// ─────────────────────────────────────────────────────────────
function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

function isWithin(dateStr, days) {
  const d = daysFromNow(dateStr);
  return d !== null && d >= 0 && d <= days;
}

// ─────────────────────────────────────────────────────────────
//  1. EXTRACT EVENTS FROM NEWS HEADLINES
//  If preExtractedEvents are provided (from unified sentiment call),
//  use them directly — no second Claude call needed.
//  Falls back to its own Claude call only when no pre-extracted data exists.
// ─────────────────────────────────────────────────────────────
async function extractEventsFromHeadlines(symbol, company, headlines, preExtractedEvents) {
  // Fast path: unified sentiment already extracted events — use them, skip Claude call
  if (Array.isArray(preExtractedEvents) && preExtractedEvents.length > 0) {
    console.log(`[CATALYST] ${symbol}: using ${preExtractedEvents.length} pre-extracted events from sentiment (skipping Claude call)`);
    return preExtractedEvents;
  }

  if (!CLAUDE_KEY || !headlines || headlines.length === 0) return [];

  const headlineList = headlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join('\n');

  const prompt = `You are a financial event extraction engine for VESTEX.

Extract ONLY real, factual events from these news headlines for ${company} (${symbol}).
Do NOT infer or speculate. Only extract events explicitly mentioned.

Headlines:
${headlineList}

Return ONLY a JSON array. Each element must match this schema:
{
  "eventType": one of [EARNINGS, PRODUCT_LAUNCH, MERGER_ACQUISITION, REGULATORY_ACTION, CEO_CHANGE, LAYOFFS, GUIDANCE_CHANGE, ANALYST_UPGRADE, ANALYST_DOWNGRADE, LEGAL_ACTION, PARTNERSHIP, SHARE_BUYBACK, DIVIDEND_CHANGE, MACRO_EVENT],
  "eventTitle": "Short title (max 8 words)",
  "eventDate": "YYYY-MM-DD if date is mentioned, else null",
  "status": one of [CONFIRMED, RUMORED, PENDING, SCHEDULED, COMPLETED, CANCELLED, UNKNOWN],
  "expectedDirection": one of [BULLISH, BEARISH, NEUTRAL],
  "impactScore": integer 1-10,
  "impactMagnitude": "low" | "medium" | "high",
  "impactDuration": "1d" | "1w" | "1m",
  "durationDays": integer (1 for 1d, 7 for 1w, 30 for 1m),
  "materialityScore": integer 0-100,
  "confirmed": true | false,
  "summary": "One plain-English sentence. No jargon. Max 20 words."
}

Rules:
- Return [] if no real events are found
- impactScore 8-10 = major (earnings, acquisitions, CEO exits)
- impactScore 5-7 = moderate (launches, analyst calls, partnerships)
- impactScore 1-4 = minor (routine filings, minor notes)
- Do NOT extract general market commentary as events
- Do NOT return markdown, only the JSON array`;

  try {
    const res = await axios.post(CLAUDE_API, {
      model:      MODEL,
      max_tokens: 700,
      messages:   [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key':         CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      timeout: 12000,
    });

    const raw  = res.data.content[0].text.trim();
    const json = raw.match(/\[[\s\S]*\]/)?.[0];
    if (!json) return [];
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    console.warn(`[CATALYST] Claude extraction failed for ${symbol}:`, e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
//  2. EXTRACT EVENTS FROM EDGAR FILINGS
// ─────────────────────────────────────────────────────────────
function extractEventsFromEdgar(symbol, edgar) {
  if (!edgar || !edgar.filings || edgar.filings.length === 0) return [];

  const events = [];

  for (const filing of edgar.filings.slice(0, 10)) {
    const form = (filing.form || '').toUpperCase().trim();

    // Skip forms we don't classify
    if (FORM_TYPE_MAP[form] === null) continue;

    let eventType = FORM_TYPE_MAP[form];
    if (!eventType) continue;

    // Refine 8-K classification by label keywords
    if (form === '8-K' && filing.label) {
      const lbl = filing.label.toLowerCase();
      if (lbl.includes('earnings') || lbl.includes('results') || lbl.includes('revenue'))
        eventType = EVENT_TYPES.EARNINGS;
      else if (lbl.includes('merger') || lbl.includes('acqui'))
        eventType = EVENT_TYPES.MERGER_ACQUISITION;
      else if (lbl.includes('ceo') || lbl.includes('officer') || lbl.includes('director'))
        eventType = EVENT_TYPES.CEO_CHANGE;
      else if (lbl.includes('layoff') || lbl.includes('workforce') || lbl.includes('restructur'))
        eventType = EVENT_TYPES.LAYOFFS;
      else if (lbl.includes('legal') || lbl.includes('lawsuit') || lbl.includes('complaint'))
        eventType = EVENT_TYPES.LEGAL_ACTION;
      else if (lbl.includes('dividend'))
        eventType = EVENT_TYPES.DIVIDEND_CHANGE;
      else if (lbl.includes('buyback') || lbl.includes('repurchase'))
        eventType = EVENT_TYPES.SHARE_BUYBACK;
      else if (lbl.includes('guidance') || lbl.includes('outlook') || lbl.includes('forecast'))
        eventType = EVENT_TYPES.GUIDANCE_CHANGE;
      else if (lbl.includes('partner') || lbl.includes('agreement') || lbl.includes('deal'))
        eventType = EVENT_TYPES.PARTNERSHIP;
      else if (lbl.includes('regulator') || lbl.includes('ftc') || lbl.includes('doj') || lbl.includes('sec '))
        eventType = EVENT_TYPES.REGULATORY_ACTION;
    }

    const impactScore = eventType === EVENT_TYPES.EARNINGS         ? 9
                      : eventType === EVENT_TYPES.MERGER_ACQUISITION ? 8
                      : eventType === EVENT_TYPES.CEO_CHANGE          ? 7
                      : eventType === EVENT_TYPES.REGULATORY_ACTION   ? 7
                      : eventType === EVENT_TYPES.LEGAL_ACTION         ? 6
                      : 5;

    // Duration by event type: earnings/filings decay faster; legal/M&A linger
    const durationDays = eventType === EVENT_TYPES.MERGER_ACQUISITION ? 30
                       : eventType === EVENT_TYPES.LEGAL_ACTION        ? 30
                       : eventType === EVENT_TYPES.REGULATORY_ACTION   ? 14
                       : eventType === EVENT_TYPES.CEO_CHANGE           ? 14
                       : eventType === EVENT_TYPES.GUIDANCE_CHANGE      ? 7
                       : eventType === EVENT_TYPES.EARNINGS             ? 3
                       : 3;

    events.push({
      eventType,
      eventTitle:        filing.label || `${form} Filing`,
      eventDate:         filing.date  || null,
      status:            'CONFIRMED',
      expectedDirection: eventType === EVENT_TYPES.EARNINGS    ? 'NEUTRAL'
                       : eventType === EVENT_TYPES.LEGAL_ACTION ? 'BEARISH'
                       : eventType === EVENT_TYPES.LAYOFFS       ? 'BEARISH'
                       : eventType === EVENT_TYPES.SHARE_BUYBACK ? 'BULLISH'
                       : 'NEUTRAL',
      impactScore,
      impactMagnitude:   impactScore >= 8 ? 'high' : impactScore >= 5 ? 'medium' : 'low',
      impactDuration:    durationDays >= 14 ? '1m' : durationDays >= 7 ? '1w' : '1d',
      durationDays,
      materialityScore:  impactScore * 10,
      confirmed:         true,
      summary:           `${form} filing on ${filing.date || 'unknown date'}.`,
      source:            'edgar',
      sourceType:        'sec_filing',
    });
  }

  return events;
}

// ─────────────────────────────────────────────────────────────
//  3. FED CALENDAR EVENTS
// ─────────────────────────────────────────────────────────────
function getFedCalendarEvents() {
  const now   = Date.now();
  const in60d = now + 60 * 86400000;

  return FOMC_DATES_2026
    .filter(d => {
      const t = new Date(d).getTime();
      return t >= now && t <= in60d;
    })
    .map(d => ({
      eventType:         EVENT_TYPES.FOMC_MEETING,
      eventTitle:        'FOMC Rate Decision',
      eventDate:         d,
      status:            'SCHEDULED',
      expectedDirection: 'NEUTRAL',
      impactScore:       8,
      summary:           'Federal Reserve interest rate decision — high volatility expected.',
      source:            'fed_calendar',
    }));
}

// ─────────────────────────────────────────────────────────────
//  4. DEDUPLICATE EVENTS
//    Same eventType within 3 days of each other = keep highest impactScore
// ─────────────────────────────────────────────────────────────
function deduplicateEvents(events) {
  const seen   = {};
  const result = [];

  for (const ev of events) {
    const dateKey = ev.eventDate ? ev.eventDate.substring(0, 7) : 'nodate'; // YYYY-MM
    const key     = `${ev.eventType}_${dateKey}`;

    if (!seen[key] || ev.impactScore > seen[key].impactScore) {
      seen[key] = ev;
    }
  }

  return Object.values(seen);
}

// ─────────────────────────────────────────────────────────────
//  5. COMPUTE CATALYST MODIFIER
//    Returns confidenceDelta (±20 max), warnings[], activeCatalysts[]
//    predictionDirection: 'bullish' | 'bearish' | 'neutral'
// ─────────────────────────────────────────────────────────────
function computeCatalystModifier(events, predictionDirection) {
  if (!events || events.length === 0) {
    return { confidenceDelta: 0, warnings: [], activeCatalysts: [] };
  }

  const dir    = (predictionDirection || 'neutral').toLowerCase();
  let   delta  = 0;
  const warns  = [];
  const active = [];

  for (const ev of events) {
    const days          = daysFromNow(ev.eventDate);
    const baseWeight    = IMPACT_WEIGHTS[ev.eventType] || 8;
    const hasDate       = ev.eventDate !== null && ev.eventDate !== undefined;
    const isConfirmed   = ev.status === 'CONFIRMED' || ev.status === 'SCHEDULED';
    const evDir         = (ev.expectedDirection || 'NEUTRAL').toLowerCase();

    // Impact decay: closer = stronger; past events decay over their durationDays window
    const dur = ev.durationDays || 3; // fallback 3 days for events without duration
    let timeFactor = 0.3; // no date or far future
    if (hasDate && days !== null) {
      if (days >= 0 && days <= 7)   timeFactor = 1.0;
      else if (days <= 14)          timeFactor = 0.7;
      else if (days <= 30)          timeFactor = 0.5;
      else if (days <= 60)          timeFactor = 0.3;
      // past events: linear decay over durationDays window
      else if (days < 0 && -days <= dur) {
        timeFactor = Math.max(0.05, 0.5 * (1 - (-days / dur)));
      }
      else if (days < 0)            timeFactor = 0; // outside event's impact window — expired
    } else if (!hasDate) {
      timeFactor = 0.25; // no date = low weight
    }

    // Rumored event = weaker impact; confirmed/scheduled = full impact
    const confirmFactor = isConfirmed ? 1.0 : 0.35;

    const rawImpact = (ev.impactScore / 10) * baseWeight * timeFactor * confirmFactor;

    let contribution = 0;

    if (evDir === 'bullish') {
      if (dir === 'bullish')       contribution = +rawImpact;   // supports prediction
      else if (dir === 'bearish')  contribution = +rawImpact * 0.5; // mixed signal, slight boost
    } else if (evDir === 'bearish') {
      if (dir === 'bearish')       contribution = +rawImpact;   // supports prediction
      else if (dir === 'bullish') {
        contribution = -rawImpact;                              // headwind — reduce confidence
        if (isConfirmed && ev.impactScore >= 7) {
          warns.push(`⚠ ${ev.eventTitle}: potential headwind against bullish prediction.`);
        }
      }
    } else {
      // Neutral direction — FOMC, scheduled earnings etc: reduce confidence near event
      if (hasDate && days !== null && days <= 7) {
        contribution = -rawImpact * 0.3;
        if (ev.impactScore >= 7) {
          warns.push(`⚠ ${ev.eventTitle} in ${days} day${days === 1 ? '' : 's'} — high volatility expected.`);
        }
      }
    }

    // Major confirmed bearish events always add warning
    if (evDir === 'bearish' && isConfirmed && ev.impactScore >= 8) {
      warns.push(`🔴 ${ev.eventTitle}: confirmed high-impact negative event.`);
    }

    // Major event within 7 days: reduce prediction confidence unless strongly supported
    // IMPORTANT: must update contribution here so active[].contribution matches applied delta
    if (isConfirmed && ev.impactScore >= 8 && hasDate && days !== null && days <= 7) {
      const magnitude = ev.impactScore >= 9 ? 0.6 : 0.4;
      const suppress  = -rawImpact * magnitude;
      contribution    = suppress;   // ← sync contribution so stored value matches applied delta
      delta          += suppress;
      warns.push(`⏳ Major event in ${days}d (${ev.eventTitle}) — prediction confidence reduced pending outcome.`);
    } else {
      delta += contribution;
    }

    active.push({
      ...ev,
      daysUntil:    days,
      contribution: Math.round(contribution * 10) / 10,   // now always matches applied delta
    });
  }

  // Clamp to ±20
  const confidenceDelta = Math.max(-20, Math.min(20, Math.round(delta)));

  // Deduplicate identical warnings
  const uniqueWarns = [...new Set(warns)];

  return {
    confidenceDelta,
    warnings:        uniqueWarns,
    activeCatalysts: active,
  };
}

// ─────────────────────────────────────────────────────────────
//  6. STORE CATALYST EVENTS TO FIRESTORE
// ─────────────────────────────────────────────────────────────
async function storeCatalystEvents(db, symbol, events) {
  if (!db || !events || events.length === 0) return;
  try {
    await db.collection('catalyst_events').doc(symbol).set({
      symbol,
      events,
      updatedAt: new Date().toISOString(),
    });
  } catch(e) {
    console.warn(`[CATALYST] Firestore store failed for ${symbol}:`, e.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  7. MAIN — analyzeCatalysts(symbol, headlines, edgar)
//    Returns { events[], modifier: { confidenceDelta, warnings[], activeCatalysts[] } }
// ─────────────────────────────────────────────────────────────
// sentimentEvents: pre-extracted structured events from the unified sentiment call.
// When provided, the headline Claude call is skipped entirely (one fewer API call per symbol).
async function analyzeCatalysts(symbol, headlines, edgar, predictionDirection, sentimentEvents) {
  const company = {
    AAPL: 'Apple', TSLA: 'Tesla', GOOGL: 'Google', MSFT: 'Microsoft', AMZN: 'Amazon',
  }[symbol] || symbol;

  try {
    // Gather events from all sources in parallel
    const [newsEvents, fedEvents] = await Promise.all([
      (CLAUDE_KEY || (Array.isArray(sentimentEvents) && sentimentEvents.length > 0))
        ? extractEventsFromHeadlines(symbol, company, headlines || [], sentimentEvents || [])
        : Promise.resolve([]),
      Promise.resolve(getFedCalendarEvents()),
    ]);

    const edgarEvents = extractEventsFromEdgar(symbol, edgar);

    // Tag sources
    const tagged = [
      ...newsEvents.map(e  => ({ ...e, source: 'news',         sourceType: 'headline' })),
      ...edgarEvents.map(e => ({ ...e, source: 'edgar',        sourceType: 'sec_filing' })),
      ...fedEvents.map(e   => ({ ...e, source: 'fed_calendar', sourceType: 'macro' })),
    ];

    const events   = deduplicateEvents(tagged);
    const modifier = computeCatalystModifier(events, predictionDirection || 'neutral');

    console.log(`[CATALYST] ${symbol}: ${events.length} events → delta ${modifier.confidenceDelta > 0 ? '+' : ''}${modifier.confidenceDelta}, ${modifier.warnings.length} warnings`);

    return { events, modifier };

  } catch(e) {
    console.error(`[CATALYST] analyzeCatalysts failed for ${symbol}:`, e.message);
    return {
      events:   [],
      modifier: { confidenceDelta: 0, warnings: [], activeCatalysts: [] },
    };
  }
}

module.exports = {
  analyzeCatalysts,
  computeCatalystModifier,
  storeCatalystEvents,
  extractEventsFromEdgar,
  getFedCalendarEvents,
};
