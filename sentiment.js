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
//  ANALYZE WITH CLAUDE
// ═══════════════════════════════════════════════════════════
async function analyzeSentiment(symbol, headlines) {
  const company = COMPANY_NAMES[symbol];
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');

  const prompt = `You are a financial analyst assistant for a beginner-friendly stock app called VESTEX.

Analyze these recent news headlines for ${company} (${symbol}) stock:

${headlineList}

Respond with ONLY valid JSON in this exact format:
{
  "overall": "positive" | "negative" | "neutral",
  "score": number between -100 (very bad) and 100 (very good),
  "summary": "One sentence in plain English explaining the overall news sentiment. No jargon. Write as if explaining to someone who just started investing.",
  "impact": "One sentence on how this news might affect the stock price. Keep it simple.",
  "headlines": [
    {
      "text": "headline text here",
      "sentiment": "positive" | "negative" | "neutral",
      "why": "10 words max explaining why in plain English"
    }
  ]
}

Rules:
- Use ONLY plain English — no finance jargon
- "positive" means good for the stock price
- "negative" means bad for the stock price
- "neutral" means no major impact expected
- Keep summary and impact under 20 words each`;

  const res = await axios.post(CLAUDE_API, {
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'x-api-key':         CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    timeout: 15000,
  });

  const raw  = res.data.content[0].text.trim();
  // Extract JSON even if Claude adds extra text
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('No JSON in Claude response');
  return JSON.parse(json);
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

      const analysis = await analyzeSentiment(symbol, headlines);
      results[symbol] = {
        symbol,
        company:   COMPANY_NAMES[symbol],
        ...analysis,
        headlines: analysis.headlines || headlines.map(h => ({ text: h, sentiment: 'neutral', why: '' })),
        fetchedAt: new Date().toISOString(),
      };

      console.log(`[SENTIMENT] ${symbol}: ${analysis.overall} (score: ${analysis.score})`);

      // Delay between Claude calls to be safe
      await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.error(`[SENTIMENT] Error for ${symbol}:`, e.message);
      results[symbol] = {
        symbol,
        company:  COMPANY_NAMES[symbol],
        overall:  'neutral',
        score:    0,
        summary:  'Unable to analyze news at this time.',
        impact:   'Check back later.',
        headlines: [],
        error:    e.message,
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

module.exports = { runSentimentAnalysis, storeSentiment };
