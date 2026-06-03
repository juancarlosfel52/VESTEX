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
//  FETCH HEADLINES — Yahoo Finance RSS (free, no key)
// ═══════════════════════════════════════════════════════════
async function fetchHeadlines(symbol) {
  const company = COMPANY_NAMES[symbol];
  const rssUrl  = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;

  try {
    const res  = await axios.get(rssUrl, { timeout: 8000 });
    const text = res.data;

    // Parse titles from RSS XML
    const matches = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)];
    const titles  = matches
      .map(m => m[1].trim())
      .filter(t => !t.includes('Yahoo Finance')) // skip feed title
      .slice(0, 6); // take top 6 headlines

    return titles.length ? titles : [`No recent headlines found for ${company}`];
  } catch (e) {
    console.warn(`[SENTIMENT] RSS fetch failed for ${symbol}:`, e.message);
    return [`Unable to fetch news for ${company} at this time`];
  }
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
