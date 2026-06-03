# Company Analysis Patterns — Brain Vault
## AI Market Intelligence Engine | Category 3

---

## 1. EARNINGS REPORTS: BEAT vs MISS

### Overview
Quarterly earnings season occurs 4x per year, roughly 2-3 weeks after each quarter ends.
About 70-75% of S&P 500 companies beat EPS estimates in a typical quarter (FactSet data, 2015-2024).
The "beat rate" is not equally distributed — management teams intentionally guide low to set beatable bars.

### Earnings Beat Mechanics
- **Definition**: Reported EPS > analyst consensus EPS
- **Typical reaction**: +0.5% to +2.0% on the day for moderate beats
- **Large beat (>10% above consensus)**: avg +3% to +5% same day
- **Beat magnitude matters more than the beat itself**
- Stocks that beat but guide down (negative forward guidance) frequently FALL despite the beat
- Historical average 1-day reaction to earnings beat: +1.4% (S&P 500 companies, 2000-2023, per academic meta-analysis)

### Earnings Miss Mechanics
- **Definition**: Reported EPS < analyst consensus EPS
- **Typical reaction**: -2.5% to -5.0% same day (asymmetric — misses punished harder than beats rewarded)
- **Large miss (>10% below consensus)**: -7% to -12% same day
- Studies show misses carry ~2.5x the price impact magnitude vs equivalent-sized beats
- Source: Skinner & Sloan (2002), "Earnings Surprises, Growth Expectations, and Stock Returns"

### Whisper Numbers
- **Definition**: Unofficial EPS estimates circulating among buy-side analysts and traders
- Typically 2-5% above published consensus for high-growth stocks
- A stock can "beat" the published estimate but miss the whisper number and still sell off
- Sites that historically tracked whisper numbers: EarningsWhispers.com
- Rule: In bull markets, whisper numbers inflate. In bear markets, they compress toward consensus.

### Beat Rate by Sector (historical average 2010-2023)
- Technology: ~75% beat rate
- Healthcare: ~72% beat rate
- Financials: ~68% beat rate
- Energy: ~60% beat rate (most volatile, commodity-dependent)
- Utilities: ~65% beat rate (stable, low surprise magnitude)

### Post-Earnings Drift (PEAD)
- After a large earnings surprise, stocks continue drifting in the same direction for 30-90 days
- PEAD is one of the most robust anomalies in academic finance (Bernard & Thomas, 1989)
- Avg drift after large positive surprise: +3% to +6% over 60 days
- Avg drift after large negative surprise: -4% to -8% over 60 days
- PEAD is stronger for smaller, less-followed companies (analyst coverage reduces inefficiency)

---

## 2. REVENUE GROWTH THRESHOLDS

### What Constitutes "Strong" Revenue Growth
Growth standards vary significantly by market cap and sector:

**Large Cap (>$10B market cap)**
- < 5% YoY: weak, typically results in multiple compression
- 5-10% YoY: market rate, in line with S&P 500 average nominal growth
- 10-15% YoY: solid, commands premium multiple
- > 15% YoY: strong, high-growth label, P/S ratio expansion likely
- > 25% YoY: exceptional, hyper-growth territory

**Mid Cap ($2B-$10B market cap)**
- < 10% YoY: below expectations for mid-cap growth story
- 10-20% YoY: acceptable
- > 25% YoY: strong, growth stock classification
- > 40% YoY: exceptional, venture-like growth at scale

**Small Cap (<$2B market cap)**
- > 30% YoY: expected for early-stage growth
- > 50% YoY: high-octane, attracts momentum traders
- > 100% YoY: viral growth phase, speculative premium

### Revenue Growth vs. Earnings Growth Priority
- Growth investors prioritize revenue growth, often tolerating losses (Salesforce, Amazon early years)
- Value investors want earnings growth with reasonable revenue growth
- 2020-2022 era showed how revenue growth multiples (P/S) can collapse: Zoom, Peloton, Shopify all traded at 30-50x P/S at peak, then reverted to 5-10x when growth slowed

### Rule of 40 (SaaS Standard)
- Revenue growth rate + profit margin > 40 = healthy SaaS business
- Example: 30% revenue growth + 15% operating margin = 45 (strong)
- Example: 15% revenue growth + 5% operating margin = 20 (weak)
- Companies below 40 often see multiple compression in rate-rising environments

---

## 3. DEBT INCREASES & BALANCE SHEET RISK

### Debt-to-Equity (D/E) Ratio Thresholds
- D/E < 0.5: Conservative/low leverage, generally safe
- D/E 0.5-1.0: Moderate leverage, normal for most industries
- D/E 1.0-2.0: Elevated, requires monitoring against cash flows
- D/E > 2.0: High leverage, risky in rate-rising environments
- D/E > 3.0: Danger zone; typical of distressed companies or leveraged buyouts
- **Sector exception**: Banks and REITs operate with very high D/E (3-10x) by design due to business model

### Interest Coverage Ratio (ICR) Danger Zones
- **Formula**: EBIT / Interest Expense
- ICR > 5.0: Comfortable, low default risk
- ICR 3.0-5.0: Adequate but worth monitoring
- ICR 1.5-3.0: Marginal; business must perform consistently to service debt
- ICR 1.0-1.5: Danger zone; any earnings softness could cause covenant breach
- ICR < 1.0: Company is not earning enough to cover interest — acute distress signal
- Historical default rates: Companies with ICR < 1.5 default at 15-20x the rate of ICR > 3.0 companies (Altman Z-Score research)

### Net Debt / EBITDA Thresholds
- < 1x: Very low leverage
- 1x-2x: Normal leverage for stable businesses
- 2x-3x: Elevated, manageable with stable cash flows
- 3x-4x: High, triggers concern from rating agencies
- > 4x: Typically junk bond territory; Moody's/S&P may downgrade
- > 5x: LBO-level debt; equity likely worthless in stress scenario

### Sudden Debt Increase Signals
- Large debt issuance (>20% increase in total debt) in low-growth environment = red flag
- Debt used for acquisitions can be neutral if acquisition is accretive
- Debt used for buybacks when stock is overvalued = value destruction (see IBM 2010s)
- Credit rating downgrade after debt increase triggers institutional selling (index inclusion rules)

### Altman Z-Score (Bankruptcy Predictor)
- Z = 1.2(X1) + 1.4(X2) + 3.3(X3) + 0.6(X4) + 1.0(X5)
- Z > 3.0: Safe zone
- Z 1.8-3.0: Grey zone — monitoring required
- Z < 1.8: Distress zone — elevated bankruptcy risk
- Developed by Edward Altman (1968), still widely used; 72-80% accuracy 1-2 years before bankruptcy

---

## 4. LAYOFFS — HISTORICAL STOCK REACTIONS

### The Layoff Paradox
Layoff announcements produce MIXED reactions depending on context:

**Scenario A — Layoffs as Efficiency Signal (Positive)**
- Context: Company with bloated cost structure, new CEO focused on margins
- Market reads as: operational discipline, margin expansion ahead
- Historical examples:
  - Microsoft Jan 2023: announced 10,000 layoffs → stock +4.6% same day
  - Meta Nov 2022: announced 11,000 layoffs → stock +3% next day
  - Salesforce Jan 2023: 10% workforce reduction → stock +3.5%
- Avg same-day reaction to "efficiency layoffs" in tech: +2% to +5%
- Long-term: if margins improve as promised, stock continues higher

**Scenario B — Layoffs as Demand Signal (Negative)**
- Context: Revenue declining, layoffs are reaction to business slowdown
- Market reads as: demand destruction, growth story broken
- Historical examples:
  - GE 2017-2019 layoffs: stock fell -40% cumulatively over 2 years
  - Ford/GM cyclical layoffs in recessions: stock fell -10% to -25%
- Avg same-day reaction to "distress layoffs": -3% to -7%

**Key Differentiation Rule**
- If announcement accompanies COST-CUTTING language with maintained revenue guidance = positive
- If announcement accompanies REVENUE GUIDANCE CUT = negative
- Layoff % matters: <5% workforce = routine optimization; >10% workforce = structural concern

### Sector Differences
- Tech layoffs: markets often reward (high salary base makes savings material)
- Retail/manufacturing layoffs: often negative (signals unit volume drop)
- Financial sector layoffs: mixed (often tied to deal flow cycle)

---

## 5. ACQUISITIONS — MARKET REACTIONS

### Acquirer Stock Behavior
- Academic consensus (100+ studies): acquirer stock drops 1-3% on average at announcement
- **Mergers & acquisitions Curse**: 60-70% of acquisitions fail to create shareholder value (McKinsey, KPMG studies)
- Premium paid drives acquirer drop: 40%+ premium = larger acquirer drop
- Stock-for-stock deals: acquirer drops MORE than cash deals (dilution signal + overvaluation concern)
- Cash deals: viewed more favorably; signals acquirer believes its cash > stock value

### Target Stock Behavior
- Target stock jumps average 20-30% on announcement day
- M&A premium paid historically: 25-35% above pre-announcement price (Damodaran NYU data)
- In bidding wars: premium can reach 50-60%
- Failed deal = target stock retraces most of the gain (drops back toward pre-deal price minus small premium for "in-play" optionality)

### Synergy Claims
- Companies regularly claim $X in cost synergies
- Academic research: actual synergies realized = ~50-60% of claimed synergies on average
- Revenue synergies: even harder to achieve; historical realization rate ~30-40%
- Market has learned to discount synergy claims, which is why acquirers still get punished

### Notable Historical Examples
- Amazon/Whole Foods (2017): Amazon dropped ~$1B in market cap same day; WFM +27%
- Microsoft/Activision (2022): MSFT -2.4% same day; ATVI +26%
- Exxon/Pioneer (2023): XOM -3% same day; PXD +10% (below typical premium due to no bidding war)
- Disney/Fox (2018): DIS -4% same day; FOX +17%

### Reverse Mergers / SPAC Acquisitions
- SPAC targets: initial pop of 20-50%, but 70-80% trade below $10 SPAC price within 1 year (post-2020 data)
- Reverse mergers: often used by lower-quality companies; historically underperform by -20% to -40% in first year

---

## 6. SHARE BUYBACKS

### Mechanics
- Company repurchases its own shares, reducing share count outstanding
- EPS increases even if net income is flat (fewer shares = higher per-share earnings)
- Directly returns capital to shareholders who sell; indirectly benefits holders via EPS/valuation lift

### Historical Signal Value
- Buyback announcements: avg +1.5% to +2.5% same-day reaction
- Companies that actually EXECUTE buybacks (vs. just announcing) outperform by ~2-3% per year (Ikenberry et al., 1995)
- Announced buybacks are not always executed — about 30-40% of announced buyback programs are never fully completed
- Open market repurchases (most common): more credible than Dutch tender offers in signaling undervaluation

### Best Conditions for Buybacks as Bullish Signal
1. Company has strong free cash flow (FCF > 5% of market cap)
2. Stock trades below historical P/E average
3. Debt levels are manageable (D/E < 1.5)
4. No large capex needs imminent

### Buyback Red Flags
- Buybacks funded by DEBT: destroys balance sheet, reduces financial flexibility (IBM 2010s case study)
- Buybacks during overvaluation: destroys shareholder value (many S&P companies bought back stock at highs in 2021)
- Buybacks used to offset massive stock-based compensation (SBC): neutral or negative in real terms; Apple and Google have been criticized for this

### S&P 500 Buyback Data
- S&P 500 companies spent $882B on buybacks in 2022 (record at the time)
- 2023: ~$795B in buybacks
- Energy sector: highest FCF-to-buyback ratio in 2022-2023
- Technology: highest absolute buyback dollars (Apple alone: $85-90B/year)

---

## 7. INSIDER BUYING vs. SELLING

### Legal Framework
- Insiders must file Form 4 with SEC within 2 business days of trade
- SEC EDGAR full-text search allows retrieval of all Form 4 filings
- Insiders = officers, directors, and >10% shareholders

### Insider Buying as Bullish Signal
- Cluster buying (multiple insiders buying simultaneously) = strong bullish signal
- Studies show insider buying predicts +7% to +10% abnormal returns over 6 months (Seyhun, 1986; Rozeff & Zaman, 1998)
- Most predictive: CEO + CFO buying together
- Most predictive size: large purchase relative to insider's existing holdings (>10% of net worth signal)
- Open market purchases are most credible (vs. option exercises)

### Insider Selling as Bearish Signal (With Caveats)
- Insider selling is far less informative than buying — insiders sell for many reasons (diversification, taxes, life events, pre-planned 10b5-1 plans)
- 10b5-1 Plans: pre-scheduled automatic selling plans; must be filed in advance when not in possession of material info
- True bearish signal: UNSCHEDULED large insider sell, especially by CEO/CFO, not under a 10b5-1 plan
- Cluster selling (multiple insiders selling in same 30-day window) = moderate bearish signal
- Historical abnormal return after cluster insider sell: -2% to -4% over 3 months

### Form 4 Key Fields (SEC EDGAR)
- Transaction Code: "P" = open market purchase (bullish); "S" = sale; "A" = award/grant; "M" = option exercise
- Only "P" (purchase) codes carry meaningful bullish signal
- "S" after "M" (exercise + immediate sale) = no signal, just cashless exercise

### Famous Insider Buying Examples
- Warren Buffett / Berkshire Hathaway insider activity in 2008-2009: major open market buys near bottom
- Jeff Bezos selling Amazon shares 2020-2021: not predictive of stock direction (pre-planned)
- Elon Musk buying Twitter 2022: Form 4 late-filing controversy; SEC fine

---

## 8. SHORT INTEREST AS CONTRARIAN INDICATOR

### Mechanics
- Short interest = number of shares sold short but not yet covered
- Short Interest Ratio (Days to Cover) = Short Interest / Average Daily Volume
- Higher days-to-cover = more fuel for short squeeze if stock rises

### Thresholds
- Short interest < 5% of float: normal, low signal value
- Short interest 5-10% of float: elevated, worth monitoring
- Short interest > 10% of float: high short interest, potential squeeze fuel
- Short interest > 20% of float: extreme; contrarian buy signal historically OR fundamentally broken company
- Short interest > 30% of float: GameStop/AMC-level extreme; squeeze risk is very real

### Short Squeeze Mechanics
- Stock rises → short sellers must buy to cover losses → additional buying pressure → more shorts squeezed
- Requires: high short interest + low float + catalyst (earnings beat, news, retail attention)
- Famous squeezes: GameStop (Jan 2021, +1,700% in weeks), Volkswagen (2008, briefly largest company by market cap), Overstock.com (2019-2020)

### Short Interest as Contrarian Signal (Academic Evidence)
- High short interest portfolios have historically UNDERPERFORMED by -1% to -2% per month (Dechow et al., 2001)
- BUT: in the short term, high short interest can precede violent short squeezes
- Tension: fundamentally, short sellers are often right about bad companies; tactically, timing squeezes is very dangerous
- Rule: High short interest is NOT automatically a buy signal — need additional catalyst or momentum indicator

### Short Interest Data Sources
- FINRA: publishes bi-monthly short interest reports (15th and last business day)
- NYSE, NASDAQ: exchange-level short interest data
- SEC EDGAR: 13F filings reveal institutional short positions for some instruments
- Ortex, S3 Partners: premium real-time short interest data providers

---

## 9. SEC EDGAR APIs — AVAILABLE DATA

### Primary EDGAR Endpoints (as of 2024)
Base URL: https://data.sec.gov

**Company Facts (XBRL Financial Data)**
- Endpoint: `GET /api/xbrl/companyfacts/{CIK}.json`
- Data: All financial metrics reported via XBRL (earnings, revenue, assets, liabilities, equity, shares, etc.)
- Coverage: Most public companies from ~2009 forward; some older data

**Company Concept**
- Endpoint: `GET /api/xbrl/companyconcept/{CIK}/{taxonomy}/{tag}.json`
- Example: `/api/xbrl/companyconcept/CIK0000320193/us-gaap/EarningsPerShareDiluted.json`
- Returns time-series of a single financial metric

**Submissions (Filing History)**
- Endpoint: `GET /submissions/{CIK}.json`
- Data: All SEC filing history, form types (10-K, 10-Q, 8-K, 4, 13F, etc.), filing dates

**Full-Text Search (EFTS)**
- Endpoint: `https://efts.sec.gov/LATEST/search-index`
- Searches full text of SEC filings
- Useful for: finding layoff announcements in 8-Ks, M&A disclosures, insider transaction language

**Key Form Types**
- 10-K: Annual report (audited financials)
- 10-Q: Quarterly report (unaudited)
- 8-K: Current report (material events: earnings, M&A, layoffs, executive changes)
- Form 4: Insider transactions (within 2 days of trade)
- 13F: Institutional holdings (quarterly, filed within 45 days of quarter end)
- SC 13D/G: >5% ownership disclosures
- DEF 14A: Proxy statement (executive compensation, shareholder votes)

**Rate Limits**
- EDGAR public API: max 10 requests/second
- No API key required for public data
- User-Agent header required (identify your app)

---

## 10. GUIDANCE — RAISE vs. CUT

### Guidance Raise
- Company raises forward revenue/EPS guidance above analyst consensus
- Most powerful signal when: guidance raised by >5% and accompanied by strong current-quarter beat
- Historical avg 1-day reaction: +2% to +4%
- "Double beat": beat current quarter + raise guidance = most bullish earnings catalyst
- Studies: guidance raises have 60-day drift of +4% to +8% (continuation)

### Guidance Cut
- Company lowers forward estimates below prior guidance or analyst consensus
- "Profit warning" or "guidance cut" = highly negative
- Historical avg 1-day reaction: -5% to -12%
- Worst case: guidance cut accompanying a miss on current quarter = "double miss" = -10% to -20%
- Guidance cuts have 60-day drift of -5% to -10% (continuation)
- Sectors most prone to guidance cuts: semiconductors, industrials, consumer discretionary (cyclical demand)

### Pre-announcement Effect
- Companies often pre-announce earnings warnings before official report
- Pre-announced negative surprises: -8% to -15% at pre-announcement; then -2% to -5% more at actual report
- Pre-announced positive surprises: +3% to +6% at pre-announcement; then +1% to +3% at actual report

---

## 11. EARNINGS QUALITY INDICATORS

### Revenue Quality
- Organic revenue growth (ex-acquisitions, ex-FX) > reported growth = higher quality
- Deferred revenue growth = demand leading indicator (SaaS)
- Accounts receivable growing faster than revenue = possible stuffing or collection issues

### Earnings Quality
- Cash earnings (FCF) vs. accrual earnings: when FCF < reported EPS, quality concern
- Tax rate manipulation: unusually low tax rate boosts EPS temporarily
- Stock-based compensation (SBC) exclusion: many companies report "adjusted EPS" excluding SBC
  - Total SBC for S&P 500 in 2023: ~$300B; major distortion in "adjusted" metrics

### Red Flags in SEC Filings
- Auditor change (especially to lesser-known firm) = concern
- Going concern language in 10-K = serious distress signal
- Late filing (missed 10-K or 10-Q deadline) = operational/financial problems
- Restatements: historical restatements predict future underperformance by -20% to -40% (avg)
- Related-party transactions expanding over time = governance concern

---

*Sources: Skinner & Sloan (2002), Bernard & Thomas (1989), Seyhun (1986), Rozeff & Zaman (1998), Dechow et al. (2001), Ikenberry et al. (1995), Altman (1968), Damodaran (NYU Stern), FactSet Earnings Insight Reports 2015-2024, McKinsey M&A Research, SEC EDGAR Public Documentation.*
