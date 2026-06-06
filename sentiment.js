// ═══════════════════════════════════════════════════════════
//  VESTEX SENTIMENT ENGINE
//  Fetches real news headlines, runs them through Claude API,
//  returns Good / Bad / Neutral + plain-English explanation
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const MODEL      = 'claude-haiku-4-5-20251001'; // fastest + cheapest for this task

const SYMBOLS = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN'];

const COMPANY_NAMES = {
  AAPL:  'Apple',
  TSLA:  'Tesla',
  GOOGL: 'Google',
  MSFT:  'Microsoft',
  AMZN:  'Amazon',
};

// ═══════════════════════════════════════════════════════════
//  FETCH HEADLINES — multi-source RSS (Google News primary,
//  Yahoo Finance fallback; no API key needed)
// ═══════════════════════════════════════════════════════════

// Decode HTML entities from RSS titles
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
}

// Parse titles from RSS XML — handles both CDATA and plain text
function parseTitlesFromRSS(text, skipPatterns) {
  const cdata  = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/gs)].map(m => m[1].trim());
  const plain  = [...text.matchAll(/<title>([^<]{10,})<\/title>/gs)].map(m => m[1].trim());
  const raw    = cdata.length ? cdata : plain;
  return raw
    .map(decodeEntities)
    .filter(t => !skipPatterns.some(p => t.toLowerCase().includes(p)))
    .filter(t => t.length > 15)
    .slice(0, 6);
}

async function fetchHeadlines(symbol) {
  const company = COMPANY_NAMES[symbol];
  const encoded = encodeURIComponent(`${company} stock`);

  // Source list — try in order; first success with ≥3 titles wins
  const sources = [
    {
      url:  `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`,
      skip: ['google news', 'google llc'],
    },
    {
      url:  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`,
      skip: ['yahoo finance', 'yahoo!'],
    },
    {
      url:  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}`,
      skip: ['yahoo finance', 'yahoo!'],
    },
  ];

  const HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':          'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  for (const src of sources) {
    try {
      const res    = await axios.get(src.url, { timeout: 9000, headers: HEADERS });
      const titles = parseTitlesFromRSS(res.data, src.skip);
      if (titles.length >= 3) {
        console.log(`[SENTIMENT] ${symbol}: ${titles.length} headlines from ${new URL(src.url).hostname}`);
        return titles;
      }
    } catch (e) {
      console.warn(`[SENTIMENT] ${symbol}: source ${new URL(src.url).hostname} failed —`, e.message);
    }
  }

  console.warn(`[SENTIMENT] ${symbol}: all RSS sources failed — using placeholder`);
  return [`No recent headlines available for ${company}`];
}

// ═══════════════════════════════════════════════════════════
//  ANALYZE WITH CLAUDE — unified sentiment + event extraction
//  One call per symbol. Returns sentiment fields AND structured
//  investment events so catalystEngine can skip its own Claude call.
// ═══════════════════════════════════════════════════════════
async function analyzeSentiment(symbol, headlines) {
  const company      = COMPANY_NAMES[symbol];
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');

  const EVENT_TYPES_LIST = [
    'EARNINGS','PRODUCT_LAUNCH','MERGER_ACQUISITION','REGULATORY_ACTION',
    'CEO_CHANGE','LAYOFFS','GUIDANCE_CHANGE','ANALYST_UPGRADE',
    'ANALYST_DOWNGRADE','LEGAL_ACTION','PARTNERSHIP','SHARE_BUYBACK',
    'DIVIDEND_CHANGE','MACRO_EVENT','NONE',
  ].join('|');

  const prompt = `You are a financial analyst engine for VESTEX. Analyze these news headlines for ${company} (${symbol}).

Headlines:
${headlineList}

Return ONLY valid JSON in this exact format:
{
  "overall": "positive" | "negative" | "neutral",
  "score": integer -100 to 100,
  "summary": "One plain-English sentence on overall news tone. Max 20 words.",
  "impact": "One sentence on likely stock price effect. Max 20 words.",
  "headlines": [
    {
      "text": "exact headline text",
      "sentiment": "positive" | "negative" | "neutral",
      "why": "10 words max — plain English reason",
      "eventType": "${EVENT_TYPES_LIST}",
      "impactMagnitude": "low" | "medium" | "high",
      "impactDuration": "1d" | "1w" | "1m",
      "materialityScore": integer 0-100,
      "eventDate": "YYYY-MM-DD if a date is explicitly mentioned, else null",
      "confirmed": true | false
    }
  ]
}

Rules:
- eventType = NONE for general commentary, market noise, or opinion pieces
- eventType = the specific investment event if one is clearly described
- impactMagnitude: low = minor news, medium = notable, high = major event (earnings, M&A, CEO exit, regulatory)
- impactDuration: 1d = short-lived reaction, 1w = multi-day impact, 1m = sustained effect (mergers, regulatory, leadership)
- materialityScore: how much this could move the stock (0 = noise, 100 = landmark event)
- confirmed = true only if the event is stated as fact; false for rumors, speculation, or pending
- Use plain English only — no finance jargon in summary, impact, or why fields`;

  const res = await axios.post(CLAUDE_API, {
    model:      MODEL,
    max_tokens: 1400,
    messages:   [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key':         CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    timeout: 18000,
  });

  const raw  = res.data.content[0].text.trim();
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('No JSON in Claude response');
  return JSON.parse(json);
}

// ─────────────────────────────────────────────────────────────
//  Convert enriched headline objects → catalyst-compatible events[]
//  Called after Claude returns — extracts only headlines with a real eventType.
// ─────────────────────────────────────────────────────────────
function extractStructuredEvents(headlines) {
  if (!Array.isArray(headlines)) return [];

  return headlines
    .filter(h => h.eventType && h.eventType !== 'NONE')
    .map(h => {
      const dur = h.impactDuration === '1m' ? 30 : h.impactDuration === '1w' ? 7 : 1;
      const mat = typeof h.materialityScore === 'number' ? h.materialityScore : 50;
      return {
        eventType:        h.eventType,
        eventTitle:       typeof h.text === 'string' ? h.text.substring(0, 70) : 'News Event',
        eventDate:        h.eventDate || null,
        status:           h.confirmed ? 'CONFIRMED' : 'RUMORED',
        expectedDirection: h.sentiment === 'positive' ? 'BULLISH'
                         : h.sentiment === 'negative' ? 'BEARISH' : 'NEUTRAL',
        impactScore:      Math.max(1, Math.min(10, Math.round(mat / 10))),
        impactMagnitude:  h.impactMagnitude || 'low',
        impactDuration:   h.impactDuration  || '1d',
        durationDays:     dur,
        materialityScore: mat,
        summary:          h.why || '',
        source:           'news_unified',
        sourceType:       'headline',
      };
    });
}

// ═══════════════════════════════════════════════════════════
//  RUN FULL SENTIMENT ANALYSIS FOR ALL SYMBOLS
// ═══════════════════════════════════════════════════════════
async function runSentimentAnalysis() {
  if (!CLAUDE_KEY) throw new Error('CLAUDE_API_KEY not set');

  console.log('[SENTIMENT] Starting analysis for all symbols...');
  const results = {};

  for (const symbol of SYMBOLS) {
    try {
      const headlines = await fetchHeadlines(symbol);
      console.log(`[SENTIMENT] ${symbol}: ${headlines.length} headlines fetched`);

      const analysis   = await analyzeSentiment(symbol, headlines);
      const rawHeads   = analysis.headlines || headlines.map(h => ({ text: h, sentiment: 'neutral', why: '', eventType: 'NONE', impactMagnitude: 'low', impactDuration: '1d', materialityScore: 0, eventDate: null, confirmed: false }));
      const events     = extractStructuredEvents(rawHeads);

      results[symbol] = {
        symbol,
        company:   COMPANY_NAMES[symbol],
        ...analysis,
        headlines: rawHeads,
        events,           // structured investment events → fed to catalystEngine
        fetchedAt: new Date().toISOString(),
      };

      console.log(`[SENTIMENT] ${symbol}: ${analysis.overall} (score: ${analysis.score}, events: ${events.length})`);

      // Delay between Claude calls to be safe
      await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.error(`[SENTIMENT] Error for ${symbol}:`, e.message);
      results[symbol] = {
        symbol,
        company:   COMPANY_NAMES[symbol],
        overall:   'neutral',
        score:     0,
        summary:   'Unable to analyze news at this time.',
        impact:    'Check back later.',
        headlines: [],
        events:    [],
        error:     e.message,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
//  STORE TO FIRESTORE
// ═══════════════════════════════════════════════════════════
async function storeSentiment(admin, results) {
  const db    = admin.firestore();
  const batch = db.batch();
  Object.entries(results).forEach(([sym, data]) => {
    batch.set(db.collection('sentiment').doc(sym), data);
  });
  await batch.commit();
  console.log('[SENTIMENT] Stored to Firestore');
}

module.exports = { runSentimentAnalysis, storeSentiment, extractStructuredEvents };
