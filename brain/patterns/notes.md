# PATTERN ENGINE — IDENTIFICATION NOTES
## Brain Vault v1.0 | VESTEX Market Intelligence

---

## HOW TO USE THIS DOCUMENT
This reference covers how each pattern category is identified, when it works, when it fails, and how to combine patterns to improve signal confidence. Every pattern in `patterns.json` has a corresponding section below.

---

## SECTION 1: TECHNICAL PATTERNS

### PATTERN_001 — Golden Cross
**Identification:** Screen for stocks/indexes where the 50-day SMA has crossed above the 200-day SMA within the last 3 trading sessions. The cross must be verified — not just close proximity. Many screeners generate false signals when the two MAs are within 0.1% of each other.

**When It Works:**
- Bull market context (S&P 500 itself above its own 200-day SMA)
- Cross comes after a period of consolidation, not during a parabolic advance
- Volume confirms expansion on or around the crossover day
- The 200-day SMA is flattening or beginning to curl upward

**When It Fails:**
- During range-bound, choppy markets (2011, 2015–2016) — produces repeated false golden/death crosses called "whipsaws"
- When the cross occurs in a deteriorating fundamental environment (the MA is a lagging indicator)
- When the gap between the 50-day and price is extreme (>20%) — the cross is then technically correct but practically stale

**Combining with Other Patterns:**
- Golden Cross + RSI Oversold Bounce = extremely high confidence (price recovering from oversold AND long-term trend turning bullish)
- Golden Cross + Cup and Handle Breakout = institutional-grade setup (trend AND pattern confirmation)
- Golden Cross + Insider Cluster Buying = fundamental + technical convergence

---

### PATTERN_002 — Death Cross
**Identification:** The 50-day SMA crosses below the 200-day SMA. Key to confirm the 200-day itself is beginning to turn lower — a flat-to-down 200-day cross is more bearish than a death cross where the 200-day is still rising (can be a lagging signal in the latter case).

**When It Works:**
- When the broader economic cycle is deteriorating (PMI below 50, unemployment rising)
- When the death cross follows sustained distribution (high-volume down days preceding it)
- When the cross is confirmed by the sector ETF also producing a death cross

**When It Fails:**
- In V-shaped recovery events (COVID 2020 — death cross fired at almost exactly the bottom)
- When the market has already fallen 20–30% before the cross (cross is lagging, too late to short)
- When the Fed pivots aggressively dovish simultaneously

**Important Note:** The death cross is best used as a portfolio risk management tool (reduce equity exposure) rather than a tactical short signal.

---

### PATTERN_003 — RSI Oversold Bounce
**Identification:** RSI(14) must first drop below 30, then cross back above 30. The BUY trigger is the crossing back ABOVE 30, not the initial dip below. This eliminates the "catching a falling knife" problem. Use the standard 14-period RSI on closing prices.

**When It Works:**
- In bull market pullbacks — stock is fundamentally strong, just technically extended lower
- When accompanied by a bottoming candlestick pattern (hammer, bullish engulfing)
- When the broader market is in an uptrend (don't fight the macro)
- When multiple oversold readings cluster (stock hits RSI 25, 28, 27 over several days before recovering)

**When It Fails:**
- During fundamental breakdowns — RSI can stay below 30 for months in a collapsing story
- In bear markets — RSI can oscillate between 20–50 without ever "bouncing" to prior levels
- When the sector is in secular decline (energy 2014–2016, retail 2018–2019)

**Variant — RSI(2) Extreme Oversold:**
For short-term traders, RSI(2) < 5 on S&P 500 ETF (SPY) has historically produced average 5-day returns of +2.8% per Connors Research backtesting. This ultra-short-period RSI is a high-win-rate mean-reversion tool on index ETFs specifically.

---

### PATTERN_004 — RSI Overbought Reversal
**Identification:** RSI(14) exceeds 70, then crosses back below 70. Same logic as oversold: the trigger is the cross back below 70, not the initial reading above it.

**Bearish Divergence Enhancement:** If price makes a new high but RSI makes a lower high (bearish divergence), win rate jumps from ~56% to ~65%. Always check for divergence when RSI is overbought.

**When It Works Best:**
- In range-bound markets where price oscillates between support and resistance
- After extended runs of 60+ days above RSI 70 (exhaustion eventually follows)
- When combined with bearish MACD crossover simultaneously

**Danger Zone — Trending Markets:**
In strong bull markets, RSI can remain above 70 for extended periods. Trying to short RSI overbought in a trending MOMO stock (2020 TSLA, 2023 NVDA) is one of the most common and costly mistakes among new traders. Use with extreme caution in momentum regimes.

---

### PATTERN_005 & 006 — MACD Crossovers
**Identification:** Standard MACD parameters are 12-period EMA, 26-period EMA, 9-period signal line. The histogram represents the difference between MACD and signal — positive histogram = MACD above signal (bullish); negative = MACD below signal (bearish).

**Zero Line Significance:**
- Below-zero bullish crossover: strongest bull signal (momentum transitioning from negative to positive)
- Above-zero bullish crossover: continuation signal (momentum already positive, accelerating further)
- Above-zero bearish crossover: strongest bear signal (momentum shifting from positive to negative)
- Below-zero bearish crossover: weakest bear signal (momentum already negative, may be capitulation)

**Timeframe Recommendations:**
- Daily MACD: reliable for 1–4 week trade timeframes
- Weekly MACD: reliable for 1–6 month position sizing
- 4-hour MACD: popular for swing traders, higher noise ratio
- 1-hour MACD: institutional algorithmic use only, high false-signal rate for discretionary traders

---

### PATTERN_007 — Volume Climax / Capitulation
**Identification:** This is one of the most visually obvious patterns when it occurs. Look for:
1. A daily bar with volume 3–5x the 20-day average
2. The bar closes in the upper 30–40% of its intraday range (reversal candle)
3. The bar occurred after a drawdown of 15%+ from recent highs

**Wyckoff Selling Climax Structure (most reliable form):**
1. Selling Climax (SC) — extreme volume, wide spread bar, closes near high
2. Automatic Rally (AR) — quick bounce as shorts cover
3. Secondary Test (ST) — price returns to near SC low on lower volume
4. Break above ST high confirms the accumulation and signals the start of recovery

**Most Powerful Version:** Capitulation bar on the major indexes (SPY, QQQ) with VIX simultaneously spiking above 40. This combination has produced 30-day average gains of +10.4% on the S&P 500.

---

### PATTERN_008 & 009 — 52-Week High Breakout / Low Breakdown
**Identification:** Use adjusted closing prices, not intraday. Screen for: last 252 trading days' maximum closing price, then check if today's close exceeds (or breaks below) that level.

**Volume Confirmation Rule:** A 52-week high breakout on below-average volume is among the most reliable short setups in markets. Failed breakouts on low volume historically mean the stock returns below the 52-week high within 5–10 days, then often falls 5–10% further as trapped buyers exit. Always require volume confirmation for a genuine breakout.

---

### PATTERN_010 & 011 — Support Bounce / Resistance Rejection
**Support Level Hierarchy (most to least significant):**
1. All-time highs (prior ATH becomes support once broken above)
2. 52-week highs (prior breakout level)
3. High-volume nodes (from Volume Profile / Market Profile analysis)
4. Fibonacci retracement levels (38.2%, 50%, 61.8%)
5. Round numbers ($50, $100, $1,000)
6. 200-day, 150-day, 50-day SMA (in that order of significance)
7. Prior swing highs/lows

**The "Three Touch Rule":** The more times a level has been tested and held, the more significant it is — but also, the more it is tested without breaking, the more likely it is to eventually break (pressure builds at key levels).

---

### PATTERN_041 — Bull Flag
**Identification on a Chart:** The flagpole is the sharp initial move. The flag body is the consolidation channel. Critical: the channel must slope downward (not flat, not upward). A flat consolidation after a sharp advance is a "pennant" pattern — similar but with converging trendlines.

**Measuring the Target:** Add the flagpole height to the breakout point. Example: stock at $100, rallies to $120 (flagpole = $20), pulls back to $113 in flag formation, breaks out above $115 flag top — target = $115 + $20 = $135.

---

### PATTERN_042 — Head and Shoulders Top
**Identification:** The H&S pattern requires patience — it takes weeks to months to form. The three key measurements:
1. Neckline: connect the two reaction lows between the three peaks (may be diagonal)
2. Target: measure from head peak to neckline, project that distance below the neckline break
3. Volume: must decline on the right shoulder vs. left shoulder for validity

**The Right Shoulder Is Everything:** If the right shoulder rallies to the same height as the left or exceeds it, the H&S is invalidated. The right shoulder must be noticeably lower for the pattern to be considered valid.

---

### PATTERN_044 — Cup and Handle
**The "Proper Base" Concept (O'Neil):**
- Minimum 7-week base period
- Cup should have a rounded, U-shaped bottom — not a sharp V
- The handle should form in the upper half of the cup, ideally in the top 15% of the entire cup's range
- Handle depth maximum 15% from cup rim to handle low
- Buy point is the highest price in the handle's upper range + $0.10

---

## SECTION 2: MACRO PATTERNS

### PATTERN_012 — Yield Curve Inversion
**Monitoring Protocol:**
- Track daily: 10-year minus 2-year Treasury spread (FRED: T10Y2Y)
- Track daily: 10-year minus 3-month spread (FRED: T10Y3M) — the "real" recession indicator per NY Fed model
- The 3-month/10-year inversion is considered by many economists (including the NY Fed's recession probability model) to be more predictive than the 2/10 spread

**Interpretation Nuance:** The curve inverting is NOT an immediate sell signal. Equities often continue to rally for 12+ months after the initial inversion. The sell signal is when the curve begins to STEEPEN BACK OUT (from inverted back toward zero) — historically this "un-inversion" has coincided with recession onset and equity market peaks.

**The Lead Time Problem:**
- Average time from initial inversion to recession: 14 months
- Average time from initial inversion to equity market peak: 9 months
- Range is wide: 6 months to 24 months — not useful for precise timing

---

### PATTERN_013 — Yield Curve Steepening
**Bull Steepener vs. Bear Steepener (critical distinction):**
- **Bull steepener:** Short rates fall faster than long rates (Fed cutting rates) — generally positive for equities, risk assets
- **Bear steepener:** Long rates rise faster than short rates (inflation expectations rising) — can be negative for equities, especially tech/growth
The 2023–2024 steepening was initially a "bear steepener" (10Y yields rising faster) which was initially equity-negative before transitioning to a bull steepener as the Fed began cutting.

---

### PATTERN_014 & 015 — Fed Rate Cuts/Hikes
**The "Pivot" Framing:**
Markets obsess over the Fed "pivot" — the point at which the Fed transitions from hiking to pausing, or pausing to cutting. The equity market often bottoms 3–6 months BEFORE the first cut, in anticipation of the pivot. The actual first cut can be anti-climactic if it's already priced in.

**Insurance Cut vs. Panic Cut (the most important distinction in all of macro):**
- Insurance cuts (1995, 1998, 2019, 2024): Economy still growing, Fed just reducing restrictiveness → average 12-month forward S&P 500 return: +18%
- Panic cuts (2001, 2007-2008): Fed cutting in response to recession/crisis already underway → average 12-month forward S&P 500 return: -15%
- Determining which type: watch the unemployment rate and ISM Manufacturing PMI at the time of the cut

---

### PATTERN_016 & 017 — CPI Prints
**Reading the "Super Core" Metric:**
Since 2022, the Fed has emphasized "super core" CPI (services ex-housing ex-energy services) as its preferred inflation gauge. A beat on headline CPI but a miss on super core may be treated as neutral-to-positive by markets — or vice versa. Always decompose the CPI report by component.

**The Shelter Lag Problem:**
OER (Owners' Equivalent Rent) in CPI lags real-time rental market data by 12–18 months. This means CPI was overstating shelter inflation in 2023 long after real rents had peaked. Markets learned to discount the shelter component — a beat in CPI driven entirely by sticky shelter may actually be ignored.

---

### PATTERN_018 & 019 — NFP Reports
**Key Report Components to Monitor Beyond Headline:**
1. Unemployment rate (U-3) and underemployment rate (U-6) — U-6 is broader measure
2. Labor force participation rate — rising participation can push up unemployment without job losses
3. Average hourly earnings (wage inflation proxy) — the Fed watches this closely
4. Average weekly hours worked — a leading indicator (employers cut hours before laying off)
5. Temporary help services employment — leading indicator (temps are cut first in slowdowns)

**Revision Risk:** The initial NFP print is subject to two rounds of revisions. The second revision (published two months later) has historically diverged from the initial print by an average of ±65,000 jobs. The 2024 annual benchmark revision revealed that prior-year job creation was overstated by 818,000 — the largest revision in 15 years.

---

### PATTERN_020 — Sahm Rule
**Real-Time Calculation:**
1. Get the last 3 months of unemployment rate data
2. Calculate the 3-month average
3. Find the minimum unemployment rate reading from the prior 12 months
4. Subtract: (3-month average) minus (12-month low)
5. If result ≥ 0.50, Sahm Rule has triggered

**The 2024 Controversy:**
When the Sahm Rule triggered in July 2024, Claudia Sahm herself publicly argued it may be a false positive due to a large increase in labor supply (immigration) rather than layoffs. This highlights a key limitation: the rule was calibrated on demand-side recessions (layoffs), not supply-side unemployment increases.

---

## SECTION 3: EARNINGS PATTERNS

### EARNINGS REACTION FRAMEWORK — How to Read Any Earnings Report

**The Whisper Number Problem:** The official consensus is public — but institutions have a "whisper" number based on primary research, channel checks, and private estimates. A company can "beat" consensus but miss the whisper, causing a sell-off. If a stock rallies 15%+ into earnings on a "priced for perfection" multiple, the actual beat needed to cause a rally is much larger than the nominal consensus beat.

**The Rule of 3Ps:**
Every earnings report should be evaluated across 3 dimensions:
1. **Past:** Did they beat/miss the quarter just reported? (EPS, Revenue, Margins)
2. **Present:** What is guidance for next quarter?
3. **Prospects:** Is the full-year guidance up, flat, or down?

**Quality of Beat Hierarchy (best to worst):**
1. Revenue beat + Margin expansion + EPS beat + Guidance raised
2. Revenue beat + EPS beat + Guidance raised
3. Revenue beat + EPS beat + Guidance maintained
4. EPS beat only (revenue miss) + Guidance raised
5. EPS beat + Guidance maintained
6. EPS beat + Guidance cut ("beat and lower")
7. EPS miss + Guidance maintained
8. EPS miss + Guidance cut (worst — double miss)

---

### PATTERN_021 to 027 — Earnings Pattern Details

**Sandbagging Culture:** Companies like Apple, Google, and Microsoft have historically set guidance conservatively — always assuming they'll raise it. When these companies maintain guidance after a beat, it's actually treated positively because the street knows they'll beat again. Context of the company's guidance history is critical.

**Post-Earnings Drift (PEAD):** Academic research (Ball & Brown, 1968; Bernard & Thomas, 1990) established that stocks with large earnings surprises continue drifting in the direction of the surprise for 60 days after the report. This means the day-of reaction does not capture all the alpha from an earnings beat — positions held through the drift period can capture additional returns.

**The "Buy the Rumor, Sell the News" Dynamic:** When a stock has rallied >15% in the 30 days before earnings on heavy volume, the actual earnings result is often a sell regardless of its quality. The move was pricing in perfection — delivering perfection is not a further catalyst to buy.

---

## SECTION 4: SEASONAL PATTERNS

### SEASONAL PATTERN CALENDAR

| Month | Key Pattern | Historical Bias |
|-------|------------|----------------|
| January | January Effect (small cap), SOTU rally | +2.1% avg for S&P |
| February | Post-Santa hangover | -0.1% avg |
| March | Q1 OpEx, quarter-end rebalancing | +1.3% avg |
| April | Tax season selling pressure, Q1 earnings | +1.5% avg |
| May | Sell in May kicks in, summer volume drop | +0.2% avg |
| June | Q2 OpEx, Fed meeting | +0.1% avg |
| July | Summer rally, low volume drift higher | +1.2% avg |
| August | Back-to-school institutional return | -0.1% avg |
| September | Historically worst month | -0.9% avg |
| October | "Crash month" reputation but often bottoms form | +0.5% avg |
| November | Post-election, Thanksgiving rally | +1.8% avg |
| December | Santa Claus rally, window dressing | +1.5% avg |

*Data: S&P 500 average monthly returns 1928–2023, based on LPL Financial / Stock Trader's Almanac research*

---

### ELECTION YEAR SEASONALITY
Presidential election years have a distinct seasonal pattern that overrides the standard calendar:
- Q1 typically soft (uncertainty about policies)
- Q2 election year rally begins as likely winner becomes clearer
- Q3–Q4 strong as election outcome becomes priced in
- Post-election year (year 1 of presidency) is historically the weakest of the 4-year presidential cycle
- Mid-term election year (year 2) is typically weakest H1, strong H2 recovery

---

## SECTION 5: SENTIMENT PATTERNS

### THE SENTIMENT EXTREMES FRAMEWORK

**Sentiment vs. Positioning (important distinction):**
- Sentiment surveys (AAII Bull/Bear, CNN Fear & Greed) measure what investors FEEL
- Positioning data (COT report, fund flows, options data) measures what investors ARE ACTUALLY DOING
- When sentiment AND positioning are both extreme, the signal is most reliable
- When sentiment is bearish but positioning is still long (just hedged), the washout is incomplete

**The "Wall of Worry" Principle:**
Bull markets are often described as climbing a "wall of worry" — they advance precisely because investors are skeptical and underinvested. When everyone is positioned long and sentiment is euphoric, there is no buying left to push prices higher — only selling remains. This is the structural reason why sentiment extremes work as contrarian signals.

---

### PATTERN_037 — VIX Spike Above 40
**Reading the VIX Term Structure (VIX vs. VIX3M):**
- Normal: VIX (1-month vol) < VIX3M (3-month vol) — "contango" — markets calm
- Inverted/Backwardation: VIX > VIX3M — acute near-term fear
- When VIX spikes above 40 AND the term structure is in steep backwardation (VIX >> VIX3M), the panic is most acute and the contrarian buy signal is most reliable
- When VIX is above 40 but term structure is flat or in contango, the fear may be more persistent

**VIX Mean Reversion Speed:**
- Average time for VIX to return from above 40 to below 20: 28 calendar days
- Fastest reversion: 2020 spike (VIX 82 on March 18 → below 30 by May 1 = 43 days)
- Slowest reversion: 2008 spike — VIX stayed above 30 for 5 months (Oct 2008 – Feb 2009)

---

### PATTERN_039 — Short Squeeze
**Data Sources and Monitoring:**
- FINRA short interest data: published bi-monthly (15th and last business day of month), 4-day lag
- S3 Partners, Ortex, IHS Markit: real-time short interest data (subscription required)
- Cost to borrow rate: when the cost to borrow shares short exceeds 50% annualized, short squeeze risk is extreme (shorts pay huge daily carry, incentivizing early cover)

**Squeeze Types:**
1. **Fundamental squeeze:** Positive earnings/catalyst forces short covering permanently → most lasting gains
2. **Technical squeeze:** Price rallies triggering stop losses in short positions → technical, may partially fade
3. **Social media-driven squeeze (meme stocks):** Retail coordinated buying → explosive but usually fully fades as retail exits
4. **Gamma squeeze:** Large call option buying forces market makers to buy stock as calls go in-the-money → can self-reinforce rapidly

---

## SECTION 6: COMBINING PATTERNS FOR HIGHER CONFIDENCE

### COMBINATION MATRIX (ADDITIVE CONFIDENCE BOOST)

When combining patterns from different categories, add the following confidence boosts:

| Combination | Confidence Boost |
|------------|-----------------|
| Technical + Macro alignment | +8 to +12 points |
| Technical + Earnings catalyst | +10 to +15 points |
| Technical + Sentiment extreme | +7 to +10 points |
| Macro + Sentiment alignment | +6 to +9 points |
| 3+ patterns all aligned | +15 to +20 points |
| Conflicting signals | -10 to -20 points |

### HIGHEST-CONVICTION COMBINATION SETUPS

**Setup A: The "Perfect Storm" Bull Setup**
- Golden Cross (PATTERN_001)
- RSI Oversold Bounce from 30 (PATTERN_003)
- Cup and Handle Breakout (PATTERN_044)
- Insider Cluster Buying (PATTERN_040)
- VIX declining from elevated level
- Combined confidence: ~88–92

**Setup B: The "Macro Bottom" Buy**
- VIX Spike Above 40 (PATTERN_037)
- Extreme Fear < 20 (PATTERN_035)
- Volume Climax / Capitulation (PATTERN_007)
- Put/Call Ratio > 1.5 (PATTERN_038)
- Yield Curve Steepening beginning (PATTERN_013)
- Combined confidence: ~87–91

**Setup C: The "Earnings Momentum" Setup**
- Earnings Beat + Guidance Raised (PATTERN_021)
- 52-Week High Breakout (PATTERN_008)
- Bull Flag Continuation (PATTERN_041)
- Low VIX, low Fear & Greed index
- Combined confidence: ~85–89

**Setup D: The "Risk Off" Bear Setup**
- Death Cross confirmed (PATTERN_002)
- Yield Curve Inversion (PATTERN_012)
- Sahm Rule triggered (PATTERN_020)
- Extreme Greed > 80 (PATTERN_036)
- Credit spread widening (PATTERN_043)
- Combined confidence: ~89–93

---

## SECTION 7: PATTERN FAILURE MODES

### Why Patterns Fail — The Meta-Analysis

**1. Regime Change:** Patterns calibrated in one market regime (low-rate ZIRP) may not work in another (high-rate). RSI overbought signals that worked in 2015–2019 failed repeatedly in 2020–2021 as ZIRP-driven momentum overrode normal overbought conditions.

**2. Market Efficiency / Crowding:** As a pattern becomes widely known, it is arbitraged away. The January Effect has weakened since the 1980s precisely because professional traders began front-running it in December. Pattern alpha decays over time as institutional capital learns to exploit it.

**3. Event Risk Override:** Any pattern can be overridden by a sudden, unexpected macro or fundamental event (COVID, 9/11, Fed surprise). Patterns reflect probabilistic tendencies, not certainties.

**4. Lag vs. Lead:** Most technical patterns (moving averages, MACD) are lagging indicators — they confirm trends after they start. Using lagging indicators to make forward predictions requires combining them with leading indicators (credit spreads, yield curve, ISM PMI) for higher-quality signals.

**5. Sample Size Problems:** Seasonal patterns (Santa Claus Rally, September Effect) are based on 70–90 data points. This is statistically thin — random variation can produce "patterns" that have no predictive value. Always prefer patterns with 500+ occurrences for statistical reliability.

---

## APPENDIX: DATA SOURCES

| Pattern Category | Primary Data Source |
|-----------------|-------------------|
| Technical (price/volume) | Alpaca Markets API, Yahoo Finance, Polygon.io |
| Moving Averages / RSI / MACD | Computed from OHLCV data (not third-party) |
| Yield Curve | FRED (Federal Reserve Bank of St. Louis) — T10Y2Y, T10Y3M |
| CPI / NFP / Unemployment | BLS.gov, FRED |
| VIX / Put-Call Ratio | CBOE data feed |
| Fear & Greed Index | CNN Business API |
| Short Interest | FINRA bi-monthly release, S3 Partners |
| Insider Transactions | SEC EDGAR Form 4 filings |
| Credit Spreads | ICE BofA via FRED — BAMLH0A0HYM2 (HY OAS) |
| Earnings Data | Earnings Whispers, FactSet, Alpaca earnings endpoint |
