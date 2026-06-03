# Academic Research Notes — Market Intelligence Brain Vault
# Category 5: Financial Academic Research
# Last Updated: 2026-06-03

---

## 1. MARKET REGIMES

### Overview
Financial markets cycle through identifiable regimes: bull (uptrend, low volatility), bear (downtrend, high volatility), and sideways/consolidation. Regime detection is critical for strategy selection — momentum works in bull regimes, mean-reversion can dominate sideways regimes, and capital preservation is paramount in bears.

### Historical Duration Statistics (S&P 500, post-WWII data)

**Bull Markets:**
- Average duration: 992 days (~2.7 years); some studies cite 61 months for secular bulls
- Average return: +115% from trough to peak
- Shortest bull: 21 months (March 2020 – January 2022)
- Longest bull: ~131 months (March 2009 – February 2020, COVID crash)
- Average frequency: one bull market roughly every 3.5–4 years

**Bear Markets:**
- Definition: -20% decline from recent peak (S&P 500 standard)
- Average duration: 289 days (~9.6 months)
- Average decline: -30% to -35%
- Recessionary bears: avg 27 months between highs, avg decline steeper
- Non-recessionary bears: avg 7 months, only 16 months between record highs
- Average frequency: one bear roughly every 3.5 years historically

**Sideways/Consolidation:**
- No universal definition; commonly defined as ±10% range over 6+ months
- Often precedes breakout in either direction
- VIX behavior during sideways: typically 15–22 range (vs. <15 bull, >25 bear)

### Regime Detection Methods

**Markov Regime-Switching Models (Hamilton 1989)**
- Two-state hidden Markov model with conditional mean/variance per state
- Identifies high-return/low-volatility (bull) vs. low-return/high-volatility (bear) states
- In-sample fit is strong; out-of-sample predictability is debated
- Key finding: regime persistence is high — once in a bull or bear, likely to stay
- Extension: duration dependence models increase transition probability as regime ages

**Technical/Rules-Based Methods**
- Pagan & Sossounov (2003): trough-to-peak window, minimum 4 months per phase
- Lunde & Timmermann (2004): 20% threshold rules remain dominant in practice
- Hierarchical Hidden Markov Models (HHMMs): capture both short- and long-term trends simultaneously; reduce misclassification of short-term fluctuations as regime changes

**Practical Signal Indicators**
- 200-day moving average cross: price above = bull regime; below = bear
- VIX level: <15 = low-vol bull; 15–25 = transitional; >30 = fear/bear
- Yield curve: inverted 2y/10y precedes recessions by 12–18 months historically
- Breadth: % of stocks above 200-day MA; <40% = weak/bear; >70% = bull

### Academic Sources
- Hamilton, J.D. (1989). "A New Approach to the Economic Analysis of Nonstationary Time Series." Econometrica.
- Pagan, A.R. & Sossounov, K.A. (2003). "A Simple Framework for Analysing Bull and Bear Markets." Journal of Applied Econometrics.
- Lunde, A. & Timmermann, A. (2004). "Duration Dependence in Stock Prices." UCSD Working Paper.
- Kirby, C. (2023). "A Closer Look at the Regime-Switching Evidence of Bull and Bear Markets." SSRN 4183191.

---

## 2. MOMENTUM INVESTING

### Jegadeesh & Titman (1993) — The Foundational Study
- **Paper:** "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency"
- **Journal:** Journal of Finance, Vol. 48(1), pp. 65–91, March 1993
- **Sample Period:** January 1965 – December 1989 (U.S. equities)
- **Method:** Form portfolios by sorting on past 3–12 month returns; hold for 3–12 months
- **Key Finding:** Buying past winners (top decile) and selling past losers (bottom decile) yields significant risk-adjusted excess returns
- **Best Strategy:** 12-1 month formation, 3-month holding: ~1% per month (~12% annualized)
- **Persistence:** Momentum profits continued into the 1990s, ruling out data-snooping bias (Jegadeesh & Titman 2001, NBER Working Paper w7159)
- **Skip-month convention:** Skip the most recent month before formation to avoid short-term reversal contamination

### Cross-Sectional vs. Time-Series Momentum

**Cross-Sectional (CS) Momentum — Jegadeesh & Titman style**
- Rank stocks relative to peers; long top decile, short bottom decile
- Profit comes from relative outperformance vs. universe
- Works across U.S. equities, international equities, and other asset classes

**Time-Series (TS) Momentum — Moskowitz, Ooi & Pedersen (2012)**
- AQR-based research; documented across 58 diverse futures/forward contracts
- A security's own past 12-month excess return predicts its own future return
- Works independently of cross-sectional ranking
- Dominant force: positive auto-covariance between this month's return and last year's return
- Both CS and TS momentum share this underlying source of profit
- TS momentum has advantages in trend-following and managed-futures contexts

### Momentum Crashes — Daniel & Moskowitz (2016)
- **Paper:** NBER Working Paper w20439 (2014), published Journal of Financial Economics 2016
- **Key Finding:** Despite strong average returns, momentum strategies experience infrequent but severe crashes
- **When crashes happen:** Following market rebounds after bear markets; when market volatility is high ("panic states"); after sustained market declines
- **Mechanism:** High-past-return "winner" stocks have high beta; after market crash, they underperform the rebounding low-beta losers (short leg rebounds more)
- **Mitigation:** Dynamic momentum strategy adjusting position size based on predicted mean and variance of momentum returns approximately doubles the Sharpe ratio vs. static strategy
- **Notable crash:** August–September 1932 (momentum lost ~91% in two months); also 2009 post-crisis rebound

### International & Asset Class Evidence
- Momentum works across international equity markets (Rouwenhorst 1998)
- Documented in bonds, commodities, currencies, and real estate
- Weaker in Chinese and some Asian markets
- The effect has persisted 30+ years post-publication (2023 review, Pacific-Basin Finance Journal)

---

## 3. FACTOR INVESTING

### Fama-French 3-Factor Model (1993)
- **Paper:** Fama, E.F. & French, K.R. (1993). "Common Risk Factors in the Returns on Stocks and Bonds." Journal of Financial Economics, 33, pp. 3–56.
- **Factors:**
  1. **MKT (Market Risk Premium):** Excess return of broad market over risk-free rate; captures systematic market risk (CAPM beta)
  2. **SMB (Small Minus Big):** Small-cap stocks historically outperform large-cap stocks; premium ≈ 1.5–3.5% annually in U.S. data since 1926
  3. **HML (High Minus Low):** Value stocks (high book-to-market) historically outperform growth stocks; premium ≈ 3–5% annually (varies significantly by period)
- **Explanatory power:** Three factors explain ~90% of diversified portfolio return variation in sorted portfolios
- **Interpretation debate:** Fama/French argue SMB and HML are compensation for risk; behavioral finance argues they reflect mispricing

### Fama-French 5-Factor Model (2015)
- **Paper:** Fama, E.F. & French, K.R. (2015). "A Five-Factor Asset Pricing Model." Journal of Financial Economics, 116(1), pp. 1–22.
- **Additional Factors:**
  4. **RMW (Robust Minus Weak):** Profitability factor — firms with high operating profitability earn higher returns; robust firms outperform weak firms by ~3% annually
  5. **CMA (Conservative Minus Aggressive):** Investment factor — firms investing conservatively (low asset growth) outperform high-investment firms; premium ~2–3% annually
- **Problem:** The 5-factor model makes HML partially redundant once RMW and CMA are included
- **Practical insight:** Profitable, conservatively investing value companies = strongest expected returns

### Momentum Factor (MOM / UMD)
- **Carhart (1997):** Added momentum as 4th factor to Fama-French; "Up Minus Down" (UMD) based on 12-1 month return
- **Annual premium:** Approximately 8–10% per year historically (pre-publication period); 4–6% post-publication
- **Factor interaction:** Momentum and value have historically been negatively correlated — momentum works best in trending markets, value better in mean-reverting markets

### Low Volatility Anomaly
- **Puzzling finding:** Low-beta / low-volatility stocks earn higher risk-adjusted returns than high-beta stocks — violates CAPM prediction
- **History:** First documented in early 1970s (Black 1972; Haugen & Heins 1975); confirmed globally since
- **Magnitude:** Low-volatility decile outperforms high-volatility decile by ~2–4% annually risk-adjusted
- **Why it persists:** Institutional mandates favor high-beta; leverage constraints prevent arbitrage; benchmark-relative mandates create demand for risky stocks
- **Metrics:** Past 12–48 month volatility; beta to market; idiosyncratic volatility

### Factor Premium Summary Table
| Factor | Historical Annual Premium | Period | Confidence |
|--------|--------------------------|--------|------------|
| Market (MKT) | ~7–8% | 1926–present | Very High |
| Size (SMB) | ~1.5–3.5% | 1926–present | Moderate (weakened post-1980) |
| Value (HML) | ~3–5% | 1926–present | Moderate (lost 2010s, rebounding) |
| Momentum (MOM) | ~8–10% raw; ~4–6% post-pub | 1927–present | High (crash risk) |
| Profitability (RMW) | ~3% | 1963–present | High |
| Investment (CMA) | ~2–3% | 1963–present | Moderate |
| Low Volatility | ~2–4% risk-adj | 1970–present | High |

---

## 4. BEHAVIORAL FINANCE

### Shiller CAPE Ratio
- **Developer:** Robert Shiller (Yale), built on Graham & Dodd (1934) concept of normalized earnings
- **Definition:** Price / (10-year average real earnings), also called PE10
- **Predictive Power:** Strong predictor of 10-year forward stock market returns; R-squared ~37% for 10-year return prediction
- **Key finding:** High CAPE → low subsequent 10-year real returns; Low CAPE → high subsequent returns
- **Limitation:** Poor short-term timing tool — CAPE can remain elevated for years (1996–2000 gap); cannot predict market peaks with precision
- **Current concern (2025–2026):** CAPE remains historically elevated (~30+); historically this has implied below-average 10-year returns, but structural changes (tech dominance, buybacks) may partially justify higher baseline CAPE
- **Global application:** CAPE works as predictor across multiple countries (international study confirms)

### De Bondt & Thaler (1985) — Overreaction Hypothesis
- **Paper:** "Does the Stock Market Overreact?" Journal of Finance, Vol. 40(3), pp. 793–805
- **Finding:** Stocks with extremely poor 3–5 year returns (losers) subsequently outperform stocks with extremely good 3–5 year returns (winners) — long-term reversal
- **Magnitude:** Loser portfolios outperform winner portfolios by ~25% over the subsequent 3 years
- **Mechanism:** Investors overweight recent performance data in making forecasts (representativeness heuristic); they overreact to sustained good/bad news
- **Relation to value investing:** Explains why deep value (contrarian) investing works — losers are oversold, winners are overpriced
- **Note:** Different from Jegadeesh-Titman momentum — operates on 3–5 year horizon vs. 3–12 month momentum horizon

### Kahneman & Tversky — Prospect Theory (1979)
- **Paper:** "Prospect Theory: An Analysis of Decision Under Risk." Econometrica, 47(2), pp. 263–291
- **Nobel Prize:** Kahneman received 2002 Nobel Memorial Prize in Economics for this work (Tversky died 1996)
- **Core insight:** People do not evaluate outcomes in absolute terms; they evaluate outcomes relative to a reference point (usually purchase price or recent peak)
- **Loss Aversion:** Losses hurt approximately 2.0–2.5x more than equivalent gains feel good (confirmed globally in Columbia University study)
- **S-shaped value function:** Concave for gains (risk-averse above reference), convex for losses (risk-seeking below reference)
- **Probability weighting:** People overweight small probabilities (lottery effect) and underweight moderate-to-high probabilities
- **Market Implications:**
  - Disposition effect: investors hold losing positions too long, sell winners too early
  - Narrow framing: evaluating each stock in isolation rather than portfolio context
  - Momentum and mean-reversion: under-reaction to gradual news → momentum; overreaction to extreme news → long-term reversal
  - Volatility clustering: fear and panic amplify selling pressure non-linearly after losses

### Other Key Behavioral Anomalies
- **Herding:** Investors cluster around similar decisions; amplifies trends and bubbles
- **Anchoring:** Reliance on first piece of information (e.g., 52-week high) as reference for valuation judgments
- **Availability bias:** Recent dramatic events (crash, bubble) overshadow base rates; causes mispricing after extreme events
- **Overconfidence:** Excessive trading by individual investors destroys returns (Barber & Odean 2000, 1999)

---

## 5. VOLATILITY CLUSTERING

### GARCH Models — Engle (1982) & Bollerslev (1986)
- **ARCH:** Autoregressive Conditional Heteroskedasticity — Engle (1982), Nobel Prize 2003
- **GARCH(1,1):** Most widely used; variance today depends on yesterday's squared return and yesterday's variance
- **Volatility clustering fact:** Large price moves tend to be followed by large moves (either direction); calm periods tend to persist
- **Mean reversion property:** GARCH variance always reverts to long-run unconditional variance; speed depends on sum of ARCH+GARCH coefficients (must be <1 for stationarity)
- **More than 65%** of actively traded U.S. equities show statistically significant mean-reverting volatility behavior (recent empirical study, 2018–2023 data)
- **Realized GARCH:** Outperforms conventional GARCH; incorporates realized volatility measures (intraday data) and generates closed-form VIX estimates

### VIX Behavior
- **VIX definition:** CBOE Volatility Index; measures 30-day implied volatility of S&P 500 options; represents market's expectation of future realized volatility
- **Mean-reversion:** VIX is strongly mean-reverting; historical long-run mean ~19–20; extreme spikes (>40) revert within weeks to months
- **VIX regimes:**
  - <15: Low volatility, typically bull market conditions
  - 15–25: Normal, transitional
  - 25–35: Elevated anxiety, market stress
  - >35: Fear/panic; typically near market lows
  - >40: Extreme fear; historically excellent time to buy equities (VIX spike = equity buying opportunity)
- **Volatility risk premium (VRP):** Implied volatility (VIX) is persistently higher than subsequent realized volatility — sellers of options (short volatility) earn this premium historically; VRP averages ~2–4 vol points
- **VIX and equity returns:** High VIX → negative correlation with equity returns in short term; after VIX spikes, subsequent 1–3 month returns are above average

### Implied vs. Realized Volatility Relationship
- Implied vol (VIX) is a biased predictor of realized vol — it consistently overestimates
- The overestimation is the volatility risk premium (investors pay for insurance)
- Correlation between VIX and subsequent 30-day realized vol: ~0.7–0.8
- VIX term structure (contango vs. backwardation) signals regime:
  - Contango (near < far): Normal market; low near-term fear
  - Backwardation (near > far): Acute stress; short-term fear elevated

---

## 6. SEASONAL PATTERNS

### January Effect
- **Definition:** Small-cap stocks and recent losers (tax-loss harvesting candidates) tend to outperform in January
- **Original finding:** Rozeff & Kinney (1976); Keim (1983) showed concentrated in first 5 trading days
- **Magnitude:** Small-cap stocks historically show +3 to +6% excess return in January vs. other months
- **Mechanism:** Year-end tax-loss selling drives prices down in December; rebound in January as investors re-buy
- **Status today:** Effect has weakened significantly; tax-advantaged accounts reduce tax-loss selling pressure; higher market efficiency has partially arbitraged it away
- **Statistical reliability:** Record shows both good and bad Januaries; no statistically repeatable pattern reliable enough to trade alone

### Sell in May / Halloween Effect
- **Pattern:** U.S. equities historically produce significantly higher returns from November–April vs. May–October
- **Magnitude:** November–April avg return ~7%; May–October avg return ~2% (long-term S&P 500)
- **Academic study:** Bouman & Jacobsen (2002) confirmed across 36 countries
- **Status:** Partially persists; but individual year variance is high; not consistently exploitable after transaction costs

### Day-of-Week Effect
- **Monday Effect:** U.S. stocks historically return less (or negative) on Mondays; gain the most on Fridays
- **Mechanism hypotheses:** Weekend news effect; institutional trading patterns; settlement timing
- **Modern status:** Effect has largely disappeared in recent decades for large-caps; may persist in small-caps and certain markets
- **Academic finding:** Monday returns show more persistent behavior and richer multifractal structures (2022 study)

### Other Seasonality
- **September Effect:** Historically the worst month for U.S. equities; avg negative return in September
- **Year-end rally:** December and early January tend to be positive; "Santa Claus rally" documented
- **Pre-holiday:** Day before market holidays historically positive (reduced volume, optimism bias)

---

## 7. POST-EARNINGS ANNOUNCEMENT DRIFT (PEAD)

### Original Discovery
- **Ball & Brown (1968):** First documented that earnings announcement effects persist beyond the announcement day
- **Bernard & Thomas (1989, 1990):** Formalized PEAD as a persistent market anomaly
  - "Earnings Information and the Drift in Stock Prices" (1989)
  - "Evidence That Stock Prices Do Not Fully Reflect the Implications of Current Earnings for Future Earnings" (1990)

### Key Quantitative Findings
- **Sample:** 1974–1985, 48 quarters analyzed
- **Drift appeared in:** 41 of 48 quarters
- **Duration:** Abnormal returns continue for roughly 60 trading days (~3 months) post-announcement
- **Magnitude:** Zero-investment portfolios (long top SUE decile, short bottom SUE decile) generated ~8–9% per quarter, ~35% annualized (before transaction costs)
- **SUE (Standardized Unexpected Earnings):** (Actual EPS – Expected EPS) / Std Dev of past forecast errors
- **Bidirectional:** Both positive and negative earnings surprises produce drift in the same direction

### Why PEAD Persists (Bernard & Thomas Explanation)
- Investors fail to recognize the full implications of current earnings for future earnings
- Markets under-react to earnings announcements — information is absorbed gradually
- Analyst forecast revisions lag actual earnings direction for multiple quarters
- Investor attention is limited; small-cap stocks with less coverage show larger PEAD

### Modern Variants
- **Text-based PEAD (Philadelphia Fed, 2021):** Using sentiment from earnings call transcripts enhances PEAD signals beyond numeric EPS surprise
- **Investor attention effect:** Stocks with high media attention show faster drift (information absorbed quicker); low-attention stocks show prolonged drift
- **Transaction cost reality:** PEAD is real but harder to exploit in liquid large-caps after trading costs; most alpha in mid/small-cap names

### Practical Parameters
- Formation: rank stocks by SUE (or simple EPS beat/miss %)
- Hold: 60 trading days (approximately 3 calendar months)
- Skip: immediately after announcement (elevated bid-ask spreads, option-pricing gaps)
- Best in: mid-caps, low analyst coverage names, stocks far from consensus

---

## SUMMARY OF KEY PAPERS (Quick Reference)

| Paper | Authors | Year | Key Claim |
|-------|---------|------|-----------|
| Returns to Buying Winners and Selling Losers | Jegadeesh & Titman | 1993 | 12-1 month momentum works, ~1%/month |
| Common Risk Factors in Stock/Bond Returns | Fama & French | 1993 | 3-factor model; size + value premiums |
| A Five-Factor Asset Pricing Model | Fama & French | 2015 | Add profitability (RMW) + investment (CMA) |
| Does the Stock Market Overreact? | De Bondt & Thaler | 1985 | Contrarian: 3–5 yr losers beat winners |
| Prospect Theory | Kahneman & Tversky | 1979 | Loss aversion 2–2.5x; S-shaped utility |
| Time Series Momentum | Moskowitz, Ooi & Pedersen | 2012 | Own past return predicts own future return |
| Momentum Crashes | Daniel & Moskowitz | 2016/NBER w20439 | Momentum crashes in bear rebounds |
| PEAD Evidence | Bernard & Thomas | 1989, 1990 | Drift ~60 days; 35% annualized raw |
| Profitability of Momentum | Jegadeesh & Titman | 2001/NBER w7159 | Momentum persists post-1993 |
| ARCH | Engle | 1982 | Volatility clustering model |
| Duration Dependence in Bull/Bear | Lunde & Timmermann | 2004 | Regime duration affects transition probs |
