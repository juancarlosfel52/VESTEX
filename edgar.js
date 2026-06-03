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
//  MAIN — fetch all EDGAR data for a symbol
// ═══════════════════════════════════════════════════════════
async function fetchEdgarData(symbol) {
  const [filings, insiders, facts] = await Promise.allSettled([
    fetchRecentFilings(symbol),
    fetchInsiderTrades(symbol),
    fetchCompanyFacts(symbol),
  ]);

  return {
    symbol,
    company:  COMPANY_NAMES[symbol],
    filings:  filings.status  === 'fulfilled' ? filings.value  : [],
    insiders: insiders.status === 'fulfilled' ? insiders.value : [],
    facts:    facts.status    === 'fulfilled' ? facts.value    : null,
    fetchedAt: new Date().toISOString(),
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

module.exports = { fetchEdgarData, fetchAllEdgarData, CIK_MAP };
