// ═══════════════════════════════════════════════════════════
//  VESTEX — SEC EDGAR Integration
//  Free API, no key required.
//  Fetches: insider trades (Form 4), recent filings (8-K, 10-Q)
//  Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

// SEC requires a descriptive User-Agent or requests get blocked
const HEADERS = {
  'User-Agent':      'VESTEX Market Intelligence vestex@vestex.app',
  'Accept-Encoding': 'gzip, deflate',
  'Accept':          'application/json',
};

// CIK numbers for tracked stocks — SEC internal company identifiers
const CIK_MAP = {
  AAPL:  '0000320193',
  TSLA:  '0001318605',
  GOOGL: '0001652044',
  MSFT:  '0000789019',
  AMZN:  '0001018724',
};

const COMPANY_NAMES = {
  AAPL:  'Apple Inc.',
  TSLA:  'Tesla, Inc.',
  GOOGL: 'Alphabet Inc.',
  MSFT:  'Microsoft Corporation',
  AMZN:  'Amazon.com, Inc.',
};

// ═══════════════════════════════════════════════════════════
//  FETCH RECENT FILINGS (8-K material events + 10-Q earnings)
// ═══════════════════════════════════════════════════════════
async function fetchRecentFilings(symbol) {
  const cik = CIK_MAP[symbol];
  if (!cik) throw new Error(`No CIK for ${symbol}`);

  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });

  const recent = res.data.filings?.recent;
  if (!recent) return [];

  const forms       = recent.form        || [];
  const dates       = recent.filingDate  || [];
  const accNums     = recent.accessionNumber || [];
  const descriptions = recent.primaryDocument || [];

  const TARGET_FORMS = ['8-K', '10-Q', '10-K', 'SC 13G', 'SC 13D'];
  const filings = [];

  for (let i = 0; i < forms.length && filings.length < 10; i++) {
    if (!TARGET_FORMS.includes(forms[i])) continue;
    filings.push({
      symbol,
      form:     forms[i],
      date:     dates[i],
      accNum:   accNums[i]?.replace(/-/g, ''),
      url:      `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accNums[i]?.replace(/-/g, '')}/${descriptions[i]}`,
      label:    formLabel(forms[i]),
      significance: formSignificance(forms[i]),
    });
  }

  return filings;
}

// ═══════════════════════════════════════════════════════════
//  FETCH INSIDER TRADES (Form 4)
//  Form 4 = statement of changes in beneficial ownership
//  Filed within 2 days of any insider buy or sell
// ═══════════════════════════════════════════════════════════
async function fetchInsiderTrades(symbol) {
  const cik = CIK_MAP[symbol];
  if (!cik) throw new Error(`No CIK for ${symbol}`);

  // Use EDGAR full-text search for recent Form 4 filings by this company
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${cik}%22&forms=4&dateRange=custom&startdt=${daysAgo(90)}&enddt=${today()}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });

  const hits = res.data.hits?.hits || [];
  const trades = [];

  for (const hit of hits.slice(0, 15)) {
    const src = hit._source || {};
    trades.push({
      symbol,
      filedAt:    src.file_date || src.period_of_report || null,
      filerName:  src.display_names?.[0]?.name || 'Unknown Insider',
      formType:   src.form_type || '4',
      url:        src.file_url_html || null,
    });
  }

  return trades;
}

// ═══════════════════════════════════════════════════════════
//  FETCH COMPANY FACTS (financials from XBRL data)
//  Revenue, net income, EPS — real numbers from SEC filings
// ═══════════════════════════════════════════════════════════
async function fetchCompanyFacts(symbol) {
  const cik = CIK_MAP[symbol];
  if (!cik) throw new Error(`No CIK for ${symbol}`);

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });

  const facts = res.data.facts?.['us-gaap'] || {};

  // Revenue
  const revKey  = facts['Revenues'] || facts['RevenueFromContractWithCustomerExcludingAssessedTax'] || null;
  const revenue = latestAnnualFact(revKey);

  // Net Income
  const niKey     = facts['NetIncomeLoss'] || null;
  const netIncome = latestAnnualFact(niKey);

  // EPS diluted
  const epsKey = facts['EarningsPerShareDiluted'] || null;
  const eps    = latestAnnualFact(epsKey);

  // Long-term debt
  const debtKey = facts['LongTermDebt'] || facts['LongTermDebtNoncurrent'] || null;
  const debt    = latestAnnualFact(debtKey);

  return {
    symbol,
    company:   COMPANY_NAMES[symbol],
    revenue:   revenue   ? formatLarge(revenue.val)   : null,
    netIncome: netIncome ? formatLarge(netIncome.val)  : null,
    eps:       eps       ? eps.val?.toFixed(2)         : null,
    debt:      debt      ? formatLarge(debt.val)       : null,
    revenueRaw:   revenue?.val   || null,
    netIncomeRaw: netIncome?.val || null,
    period:    revenue?.end || null,
    source:    'SEC EDGAR XBRL',
  };
}

// ═══════════════════════════════════════════════════════════
//  EARNINGS SURPRISE — Alpha Vantage EARNINGS endpoint
//  Requires ALPHA_VANTAGE_KEY env var. Fails gracefully if absent.
//  Returns actual EPS vs consensus, surprise %, direction.
//  This is the primary signal for PEAD pattern activation.
// ═══════════════════════════════════════════════════════════
async function fetchEarningsSurprise(symbol) {
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) return null; // no key configured — skip silently

  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${key}`;
    const res = await axios.get(url, { timeout: 10000 });

    // Detect rate limit or demo key response
    if (res.data?.Note || res.data?.Information) {
      console.warn(`[EDGAR] Alpha Vantage rate limit or invalid key for ${symbol}`);
      return null;
    }

    const quarters = res.data?.quarterlyEarnings;
    if (!quarters || !quarters.length) return null;

    const q         = quarters[0]; // most recent reported quarter
    const reported  = parseFloat(q.reportedEPS);
    const estimated = parseFloat(q.estimatedEPS);
    if (isNaN(reported) || isNaN(estimated) || estimated === 0) return null;

    const surprisePct = +((reported - estimated) / Math.abs(estimated) * 100).toFixed(2);
    const direction   = surprisePct >  1 ? 'BEAT'
                      : surprisePct < -1 ? 'MISS'
                      :                   'MEET';
    const magnitude   = Math.abs(surprisePct) >= 5 ? 'LARGE'
                      : Math.abs(surprisePct) >= 1 ? 'SMALL'
                      :                              'INLINE';

    const reportDate  = q.reportedDate || null;
    const daysAgo     = reportDate
      ? Math.floor((Date.now() - new Date(reportDate).getTime()) / 86400000)
      : null;

    return {
      symbol,
      reportedEPS:  reported,
      estimatedEPS: estimated,
      surprisePct,
      direction,
      magnitude,
      reportDate,
      daysAgo,
      quartersAgo:  0,
      peadWindow:   daysAgo !== null && daysAgo >= 3 && daysAgo <= 60,
      source:       'alphavantage',
    };
  } catch(e) {
    console.warn(`[EDGAR] fetchEarningsSurprise ${symbol}:`, e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  INSTITUTIONAL INTELLIGENCE — SEC EDGAR 13F Search
//  Uses free EFTS full-text search. No API key required.
//  Returns institutional holder count + superinvestor presence.
//  Confidence modifier only — never overrides masterScore.
// ═══════════════════════════════════════════════════════════

// Known superinvestor CIKs (SEC EDGAR internal identifiers)
const SUPERINVESTOR_CIKS = new Set([
  '0001067983', // Berkshire Hathaway (Buffett)
  '0001336528', // Pershing Square (Ackman)
  '0000827054', // Appaloosa Management (Tepper)
  '0001040273', // Third Point (Loeb)
  '0001061219', // Baupost Group (Klarman)
  '0001167483', // Tiger Global (Coleman)
  '0001079114', // Greenlight Capital (Einhorn)
  '0001649339', // Scion Asset Management (Burry)
  '0001168168', // Lone Pine Capital (Mandel)
  '0001162461', // Viking Global Investors
]);

const SUPERINVESTOR_NAMES = {
  '0001067983': 'Berkshire Hathaway (Buffett)',
  '0001336528': 'Pershing Square (Ackman)',
  '0000827054': 'Appaloosa (Tepper)',
  '0001040273': 'Third Point (Loeb)',
  '0001061219': 'Baupost Group (Klarman)',
  '0001167483': 'Tiger Global (Coleman)',
  '0001079114': 'Greenlight Capital (Einhorn)',
  '0001649339': 'Scion Asset Mgmt (Burry)',
  '0001168168': 'Lone Pine Capital (Mandel)',
  '0001162461': 'Viking Global',
};

async function fetchInstitutional13F(symbol) {
  try {
    // Search EDGAR full-text for recent 13F-HR filings mentioning this symbol
    // 13F filings list holdings by ticker, so this finds funds that hold the stock
    const startdt = daysAgo(180); // last two quarters
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=13F-HR&dateRange=custom&startdt=${startdt}&enddt=${today()}`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });

    const hits = res.data?.hits?.hits || [];
    const totalFilers = res.data?.hits?.total?.value || hits.length;

    // Check if any known superinvestors are among the filers
    const foundSuperinvestors = [];
    for (const hit of hits) {
      const src  = hit._source || {};
      const names = src.display_names || [];
      for (const n of names) {
        const cikPadded = String(n.CIK || n.cik || '').padStart(10, '0');
        if (SUPERINVESTOR_CIKS.has(cikPadded)) {
          const label = SUPERINVESTOR_NAMES[cikPadded] || cikPadded;
          if (!foundSuperinvestors.includes(label)) foundSuperinvestors.push(label);
        }
      }
    }

    const superinvestorCount = foundSuperinvestors.length;

    // Confidence impact score (0–10): used as modifier, not added to masterScore
    const score = Math.min(10,
      (superinvestorCount >= 3 ? 8 : superinvestorCount >= 1 ? 5 : 0) +
      (totalFilers > 100 ? 2 : totalFilers > 30 ? 1 : 0)
    );

    return {
      symbol,
      totalFilers,
      superinvestorCount,
      superinvestors: foundSuperinvestors,
      trend:          'STABLE', // Phase 2: compare to prior quarter for ACCUMULATING/REDUCING
      score,
      note:           superinvestorCount > 0
                        ? `${superinvestorCount} superinvestor(s): ${foundSuperinvestors.join(', ')}`
                        : `${totalFilers} institutional filers — no tracked superinvestors detected`,
      source:         'sec_edgar_13f',
      fetchedAt:      new Date().toISOString(),
    };
  } catch(e) {
    console.warn(`[EDGAR] fetchInstitutional13F ${symbol}:`, e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN — fetch all EDGAR data for a symbol
// ═══════════════════════════════════════════════════════════
async function fetchEdgarData(symbol) {
  const [filings, insiders, facts, earningsSurprise, institutional] = await Promise.allSettled([
    fetchRecentFilings(symbol),
    fetchInsiderTrades(symbol),
    fetchCompanyFacts(symbol),
    fetchEarningsSurprise(symbol),
    fetchInstitutional13F(symbol),
  ]);

  return {
    symbol,
    company:          COMPANY_NAMES[symbol],
    filings:          filings.status          === 'fulfilled' ? filings.value          : [],
    insiders:         insiders.status         === 'fulfilled' ? insiders.value         : [],
    facts:            facts.status            === 'fulfilled' ? facts.value            : null,
    earningsSurprise: earningsSurprise.status === 'fulfilled' ? earningsSurprise.value : null,
    institutional:    institutional.status    === 'fulfilled' ? institutional.value    : null,
    fetchedAt:        new Date().toISOString(),
  };
}

async function fetchAllEdgarData() {
  const symbols = Object.keys(CIK_MAP);
  const results = {};
  for (const sym of symbols) {
    try {
      results[sym] = await fetchEdgarData(sym);
      await new Promise(r => setTimeout(r, 600)); // respect SEC rate limit
    } catch(e) {
      console.warn(`[EDGAR] Error for ${sym}:`, e.message);
      results[sym] = { symbol: sym, error: e.message };
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function latestAnnualFact(concept) {
  if (!concept?.units) return null;
  const units = concept.units['USD'] || concept.units['shares'] || concept.units['pure'] || null;
  if (!units) return null;
  // Filter for annual (10-K) filings only
  const annual = units.filter(u => u.form === '10-K' && u.val != null);
  if (!annual.length) return null;
  return annual.sort((a, b) => new Date(b.end) - new Date(a.end))[0];
}

function formatLarge(n) {
  if (n === null || n === undefined) return null;
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B';
  if (Math.abs(n) >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M';
  return '$' + n.toFixed(0);
}

function formLabel(form) {
  const map = {
    '8-K':    'Material Event',
    '10-Q':   'Quarterly Earnings',
    '10-K':   'Annual Report',
    'SC 13G': 'Large Shareholder',
    'SC 13D': 'Activist Investor',
  };
  return map[form] || form;
}

function formSignificance(form) {
  const map = {
    '8-K':    'high',
    '10-Q':   'high',
    '10-K':   'high',
    'SC 13G': 'medium',
    'SC 13D': 'high',
  };
  return map[form] || 'low';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

module.exports = { fetchEdgarData, fetchAllEdgarData, fetchEarningsSurprise, fetchInstitutional13F, CIK_MAP };
