# Market Psychology — Brain Vault
## AI Market Intelligence Engine | Category 4

---

## 1. FEAR & GREED INDEX (CNN Money)

### Overview
The Fear & Greed Index is a composite sentiment indicator published by CNN Business. It aggregates 7 sub-indicators into a single 0-100 score:
- 0-24: Extreme Fear
- 25-44: Fear
- 45-55: Neutral
- 56-74: Greed
- 75-100: Extreme Greed

### Seven Sub-Indicators (Equal Weight)
1. **Stock Price Momentum**: S&P 500 vs. 125-day moving average
2. **Stock Price Strength**: NYSE new 52-week highs vs. new 52-week lows
3. **Stock Price Breadth**: Volume of advancing vs. declining stocks
4. **Put/Call Ratio**: 5-day average of CBOE total put/call ratio
5. **Junk Bond Demand**: Yield spread between junk bonds and investment-grade
6. **Market Volatility (VIX)**: CBOE Volatility Index vs. 50-day moving average
7. **Safe Haven Demand**: Return differential between stocks and Treasury bonds

### Contrarian Signal Interpretation
The index works best as a CONTRARIAN tool, not a momentum tool:
- **Extreme Fear (0-24)**: Historically near market bottoms; contrarian buy signal
- **Extreme Greed (75-100)**: Historically near market tops; contrarian caution signal
- The index is NOT a precise market timer — it can remain extreme for weeks/months
- Best use: identifying sentiment extremes as one factor among many; not as sole decision tool

### Historical Correlation Data
- When index drops below 20: S&P 500 returned an average +13.5% over next 6 months (2004-2023 data)
- When index exceeds 80: S&P 500 returned an average +1.8% over next 6 months (underperformance)
- March 2020 bottom: Index reached 2 (extreme fear) — S&P 500 subsequently +100% over 18 months
- January 2022 top: Index reached 82 (extreme greed) — S&P 500 fell -20% over next 12 months
- October 2022 bottom: Index reached 11 (extreme fear) — S&P 500 +25% over next 12 months

### Limitations
- The index can stay in Extreme Fear during extended bear markets (not a pure bottom signal)
- It does not account for fundamental valuation changes
- Susceptible to regime changes (e.g., 2022: high inflation changed the base rate of fear)

---

## 2. VIX — VOLATILITY INDEX

### Definition
- **VIX** = CBOE Volatility Index; often called the "Fear Gauge"
- Measures implied 30-day volatility of S&P 500 options
- Derived from option prices across strikes and expirations; represents market's expectation of volatility
- Created in 1993 by Robert Whaley; modern methodology (VIX 2.0) adopted in 2003

### Historical VIX Ranges and Meanings
- **VIX < 12**: Extreme complacency; market is very quiet; historically precedes volatility increases
- **VIX 12-20**: Normal range; healthy bull market conditions
- **VIX 20-30**: Elevated anxiety; significant uncertainty; below "panic" threshold
- **VIX 30-40**: High fear; institutional hedging accelerating; often near short-term bottoms
- **VIX 40-60**: Panic zone; significant market dislocation; often coincides with crash conditions
- **VIX > 60**: Extreme panic; rare; occurred in 2008 (80), 2020 (89), 2010 (48), 2015 (53)

### Historical VIX Spike Events
| Event | VIX Peak | S&P 500 Drawdown | Recovery Period |
|-------|----------|------------------|-----------------|
| 2008 Financial Crisis | 89.5 | -57% | ~5.5 years |
| COVID-19 Crash (Mar 2020) | 82.7 | -34% | ~6 months |
| Euro Debt Crisis (Oct 2011) | 48.0 | -22% | ~4 months |
| China Devaluation (Aug 2015) | 53.3 | -12% | ~2 months |
| Christmas Eve Selloff (Dec 2018) | 36.1 | -20% | ~3 months |
| Inflation/Rate Shock (Oct 2022) | 34.8 | -27% | ~14 months |

### VIX as Contrarian Signal
- VIX > 40 historically: S&P 500 average 1-year forward return = +22.8% (based on 1990-2023)
- VIX > 60 historically: S&P 500 average 1-year forward return = +37.6%
- VIX < 12 historically: S&P 500 average 1-year forward return = +8.4% (below average)
- The **VIX Mean Reversion Rule**: VIX always reverts to the mean (12-20 range). Spikes above 40 are temporary.

### VIX Term Structure
- **Contango** (normal): Near-term VIX < longer-term VIX (calm market)
- **Backwardation** (stress): Near-term VIX > longer-term VIX (acute fear)
- VIX futures backwardation is a stronger fear signal than spot VIX alone
- Tools: VIX9D (9-day), VIX (30-day), VIX3M (3-month), VIX6M (6-month)

### VVIX (Volatility of Volatility)
- VVIX measures how much VIX itself is expected to move
- VVIX > 130: Very uncertain about volatility regime; often precedes major moves
- Useful secondary indicator to confirm or deny VIX signals

---

## 3. PUT/CALL RATIO

### Definition
- Measures the number of put options traded vs. call options traded
- **Bearish put**: buyer profits when stock falls
- **Bullish call**: buyer profits when stock rises
- Total P/C Ratio = Total Put Volume / Total Call Volume

### CBOE Data Sources
- CBOE Total P/C Ratio: includes equity + index options
- CBOE Equity P/C Ratio: equity options only (more sensitive to retail sentiment)
- CBOE Index P/C Ratio: index options (more institutional hedging; less contrarian signal)

### Historical Thresholds
- **Total P/C Ratio > 1.0**: More puts than calls; elevated fear; contrarian buy signal
- **Total P/C Ratio > 1.2**: Extreme fear in options market; strong contrarian signal
- **Total P/C Ratio < 0.6**: Extreme complacency; more calls than puts; contrarian caution
- **5-day moving average > 1.1**: Sustained fear; historically near short-term market bottoms
- **5-day moving average < 0.65**: Sustained greed; historically near short-term market tops

### Historical Examples
- March 2020 bottom: 5-day P/C ratio reached 1.3 → S&P 500 +65% over next 12 months
- January 2021 meme stock mania: P/C ratio fell to 0.47 → followed by significant correction
- October 2022 bottom: P/C ratio sustained above 1.1 for 3 weeks → major rally followed

### Limitations
- Put buying can be hedging by institutions (not pure fear)
- Call buying includes speculative FOMO as well as directional bets
- Single-day readings less reliable than 5-day or 10-day moving averages
- Zero-Day-to-Expiration (0DTE) options have distorted the signal since 2022

---

## 4. INVESTOR PANIC MECHANICS

### Margin Calls
- **Definition**: When margin-account investors' equity falls below maintenance margin requirement, brokers force liquidation
- Margin calls are pro-cyclical: falling markets trigger margin calls → forced selling → more price decline → more margin calls
- Cascade effect can accelerate crashes by 30-50% beyond fundamental justification
- Historical margin debt peaks often precede major market tops:
  - March 2000: NYSE margin debt peaked before dot-com crash
  - October 2007: margin debt peaked before 2008 crash
  - November 2021: margin debt reached all-time high of $936B → followed by -25% crash in 2022
- Data source: FINRA monthly margin statistics

### Panic Selling Indicators
- **TRIN (Arms Index)**: Breadth/volume ratio; TRIN > 2.0 = panic selling day; TRIN > 3.0 = climax selling
- **New Lows Surge**: NYSE new 52-week lows exceeding 500 on a single day = breadth panic
- **Down Volume > 90%**: When 90%+ of NYSE volume is in declining stocks = "90% down day" = maximum fear; historically precedes sharp bounces
- **Selling Climax**: High volume + large percentage decline in single session = institutional capitulation
- Double or triple 90% down days in close succession = textbook capitulation bottom setup

### Bank Panic / Systemic Panic
- Characterized by credit spreads widening dramatically (TED spread, LIBOR-OIS, HY spreads)
- Investment Grade spreads widen from 100bps to 200-300bps
- High Yield spreads widen from 350bps to 700-1000bps in severe panic
- Dollar strengthens sharply (flight to safety)
- Gold rises (safe haven flow)
- Short-term Treasury yields fall dramatically as investors flee to safety

---

## 5. MARKET EUPHORIA

### Definition and Characteristics
Market euphoria is a state of excessive optimism where investors collectively believe risk has been eliminated and returns will continue indefinitely. It is the mirror image of panic.

### Euphoria Indicators
**1. IPO Frenzy**
- Excessive IPO volume (100+ IPOs per quarter in US)
- IPO oversubscription ratios of 10x-50x for mediocre companies
- First-day "pop" averages exceeding 50% for any IPO
- Companies going public with no earnings, no revenue, or negative revenue
- 2020-2021 data: ~1,000 US IPOs in 2021 (record), including 613 SPACs; most underperformed significantly by 2022

**2. Retail Investor Influx**
- Robinhood and similar apps reporting record account openings
- Household stock ownership as % of total financial assets approaching historical highs
- Google Trends searches for "buy stocks" reaching multi-year peaks
- Small investor sentiment surveys (AAII) showing >50% bullish for 8+ consecutive weeks

**3. Magazine Cover Indicator**
- When TIME, BusinessWeek, or major media feature bullish stock market covers, it signals peak sentiment
- Historical examples: BusinessWeek "Death of Equities" (1979, near market bottom), "Buy Stocks Now" covers at major tops
- Informal contrarian indicator but historically reliable at extremes

**4. P/E Extremes**
- Shiller CAPE (Cyclically Adjusted P/E) > 35: Historically in top 5% of valuations
- CAPE reached 44 in December 1999 (dot-com peak); 38 in January 2022 (current cycle peak)
- Forward P/E > 25 for S&P 500: Extreme; in 90th percentile historically
- Price-to-Sales > 3 for S&P 500: Extreme (reached 3.1 in 2021)

**5. Narrative Dominance**
- "This time is different" reasoning becomes mainstream
- Dismissal of valuation metrics ("EBITDA doesn't matter"; "P/E doesn't apply to this sector")
- Technology replacing all traditional industries is accepted as near-certainty
- Risk premium narrative collapses ("rates will always be low")

### Post-Euphoria Mean Reversion
- Historically, periods of extreme euphoria (CAPE > 35) lead to:
  - 10-year forward returns of 0-3% for equities (vs. historical 7-10%)
  - Higher probability of crashes within 18-36 months
- Dot-com (2000-2002): NASDAQ fell -78%; S&P 500 fell -49%
- Housing euphoria (2007-2009): S&P 500 fell -57%
- 2022 correction from 2021 euphoria: growth/tech indices fell -50% to -80%

---

## 6. FOMO (FEAR OF MISSING OUT)

### Definition
FOMO in markets is the behavioral drive to buy into a rising asset purely because others are profiting from it, regardless of fundamental valuation. It is driven by social proof and loss aversion (fear of missing gains is behaviorally similar to fear of losing).

### FOMO Manifestations

**Parabolic Moves**
- Stock rises >100% in <3 months without fundamental earnings change
- Volume accelerates as price rises (opposite of healthy accumulation)
- Moving averages diverge dramatically (price far above 50-day and 200-day MA)
- RSI reaches 80-90 (overbought on any standard oscillator)
- Examples: GameStop +1,700% in 3 weeks; Bitcoin +400% in Q4 2020; Palantir +400% in 4 months

**Short Squeezes**
- FOMO amplified by mechanical short covering
- Short sellers' forced buying creates fake "demand" narrative
- Retail FOMO buyers arrive after 50-100% initial move
- Most short squeezes retrace 70-90% within 1-3 months after peak
- Post-squeeze distribution: insiders and early buyers sell into FOMO demand

**Meme Stocks**
- Stock selection driven by social media (Reddit, Twitter/X, TikTok) rather than fundamentals
- GameStop (GME), AMC, Bed Bath & Beyond, Tupperware all had meme phases
- Typical meme cycle: Identification → FOMO buying → Parabolic rise → Capitulation → -70 to -90% retracement

### FOMO Indicators
- Reddit WallStreetBets mentions accelerating for a stock
- Google Trends search volume spike for a ticker
- Options flow showing massive call buying with strikes far above current price
- Stock appears in most-active/most-bought lists on retail platforms

---

## 7. CAPITULATION

### Definition
Capitulation is the point where sellers have exhausted themselves — all who wanted to sell have sold. It is the most important concept for identifying market bottoms.

### Technical Signs of Capitulation
- **Volume Climax**: Single-day volume 3-5x average daily volume on a down day
- **90% Down Day**: >90% of NYSE/NASDAQ volume in declining stocks
- **New Lows Surge**: NYSE new 52-week lows spike above 500 on one day
- **Breadth Collapse**: Advance-Decline line at extreme low readings
- **TRIN Spike**: TRIN (Arms Index) above 2.5-3.0
- **Gaps Down**: Major indices gap down 2-4% at open, often following overseas market selling

### Sentiment Signs of Capitulation
- AAII Bear Sentiment exceeds 55-60% (historically near bottoms)
- Institutional cash levels at decade highs (fund managers hoard cash)
- Put/call ratio sustained above 1.2-1.3 for 2+ weeks
- VIX spike to 40+ (discussed above)
- Analyst downgrades accelerate (lagging, not leading, but confirms)

### Volume Climax / Selling Exhaustion
- After capitulation volume spike: next 1-5 days often show dramatically less volume
- The "quiet after the storm" volume pattern signals sellers exhausted
- Does NOT mean immediate recovery — often see re-test of lows 2-6 weeks later
- Classic double-bottom pattern: First low (capitulation) → relief bounce → re-test with less volume → confirmed bottom

### Historical Capitulation Examples
- March 2009 bottom: S&P 500 closed at 666, 90% down days clustered, AAII bears at 70%
- March 2020 bottom: VIX 82, multiple 90% down days, massive volume
- October 2022 bottom: Sustained put/call above 1.2, AAII bears at 60%+

---

## 8. HERD BEHAVIOR

### Definition
Herd behavior in markets is the tendency of investors to follow the crowd rather than their own independent analysis. It is simultaneously a driver of trends and the cause of bubbles/crashes.

### Momentum Trading
- **Definition**: Buying assets that have risen recently because they have risen recently
- Academic evidence: Short-term momentum (1-12 months) produces positive returns in equity markets (Jegadeesh & Titman, 1993)
- The momentum anomaly: Stocks in the top decile of 12-month return continue to outperform bottom decile by ~1% per month for next 3-12 months
- **BUT**: Momentum crashes violently when market reverses (2009: momentum portfolio lost -60% in 2 months as beaten-down stocks rebounded)

### Index Inclusion Effect
- When a stock is added to a major index (S&P 500, Russell 1000, NASDAQ 100), index funds must buy it
- Average S&P 500 inclusion reaction: +3% to +8% at announcement; reverses ~50% within 6 months
- Known as the "Index Inclusion Effect" — studied by Harris & Gurel (1986), Shleifer (1986)
- Deletion effect: Stock removed from index falls -5% to -10% at announcement
- Passive investing's growth has amplified this effect significantly since 2010

### Analyst Herding
- Analysts tend to cluster around consensus estimates, rarely issuing dramatically out-of-consensus forecasts
- Career risk asymmetry: Being wrong alone is worse for an analyst career than being wrong with the crowd
- Analyst upgrades/downgrades often LAG price moves rather than lead them
- A "buy" rating from all 20+ analysts covering a stock is a bearish contrary indicator (no new buyers)
- When > 85% of analysts rate a stock "Buy", the stock typically underperforms by 3-5% over 6 months

### Social Media Herding (Modern)
- Reddit, Twitter/X, StockTwits create rapid information cascades
- Information (and misinformation) reaches retail market participants simultaneously
- Creates synchronized buying/selling waves that can overwhelm fundamental-based trading
- The 2021 meme stock phenomenon was a textbook herd behavior case study

---

## 9. SENTIMENT CYCLES

### Wall of Worry
- **Definition**: Bull markets historically "climb a wall of worry" — rising despite constant negative news
- The logic: If most investors are worried, they are under-invested → eventual buying flows have to come
- Common worries that markets historically ignored: "overvalued" narratives, geopolitical tensions, minor economic slowdowns
- The wall of worry keeps valuations in check (fear prevents euphoria)

### Bull Trap
- **Definition**: A false breakout above resistance that sucks buyers in, then reverses sharply
- Context: Most common in early bear markets or sideways markets
- Pattern: Stock/index breaks above key resistance → confirms (2-3 day close above) → reverses sharply
- Bull traps are most dangerous after prolonged bear markets where investors desperately want a recovery
- Famous bull trap: S&P 500 in summer 2022 bounced +17% then fell to new lows; Nasdaq bounced +20% then fell further

### Bear Trap
- **Definition**: A false breakdown below support that triggers selling/short selling, then reverses sharply
- Context: Most common in healthy bull markets or at major bottoms
- Pattern: Index breaks below key support → looks like collapse starting → violent reversal within 1-3 days
- Bear traps shake out weak longs and then the market rises sharply, hurting newly initiated short sellers
- The October 2022 bottom involved a brief bear trap under the June 2022 lows before reversing sharply

### Sentiment Cycle Stages (Classical Framework — Westcore Funds / Howard Marks)
1. **Despondency**: Maximum pessimism; asset prices at distressed levels; best entry point
2. **Skepticism**: Some recovery; most investors still disbelieving; wall of worry begins
3. **Hope**: Recovery narrative gaining traction; institutional allocation resumes
4. **Optimism**: Mainstream acceptance; retail money flows increase
5. **Relief**: Prior investors break even; more buying
6. **Thrill**: Euphoria building; most investors fully invested
7. **Euphoria**: Maximum optimism; best exit point; FOMO peaks
8. **Anxiety**: Small cracks in the narrative appear
9. **Denial**: "It's just a correction" narrative; investors hold hoping for recovery
10. **Fear**: Significant losses; many investors selling but trying to time recovery
11. **Capitulation**: Panic selling; maximum volume; stop-losses triggered
12. **Despondency**: Return to stage 1 (cycle repeats)

---

## 10. BEHAVIORAL BIASES

### Loss Aversion
- **Kahneman & Tversky (1979) Prospect Theory**: Losses feel approximately 2x as painful as equivalent gains feel pleasurable
- Market implication: Investors hold losing positions too long (hoping to break even) and sell winners too early
- Creates asymmetric market behavior: downside moves are faster and more violent than upside recoveries
- Disposition Effect: Investors sell winners and hold losers (opposite of what maximizes returns)
- Portfolio implication: High tax-lot losses ("underwater positions") reduce portfolio rebalancing efficiency

### Anchoring
- **Definition**: Over-reliance on the first number encountered when making decisions
- Market manifestations:
  - "My stock was at $100, it's a bargain at $60" (ignoring that $60 may still be expensive)
  - IPO price becomes an anchor for valuation (irrelevant to fundamental value)
  - All-time highs become anchors for resistance in charts
  - 52-week highs/lows are anchor points that create self-fulfilling technical levels
- The 52-week high effect: Stocks near 52-week highs tend to outperform (anchoring creates artificial resistance; breakouts are powerful)

### Recency Bias
- **Definition**: Overweighting recent events and underweighting historical base rates
- Bull market manifestation: "Markets always recover" → takes on too much risk
- Bear market manifestation: "The next crash is coming" → stays in cash too long
- Investors consistently underestimate reversion to mean because recent trend feels permanent
- DALBAR study (annual): Average equity investor returns consistently 3-5% below S&P 500 index due to recency-driven market timing decisions

### Confirmation Bias
- **Definition**: Seeking information that confirms existing beliefs; ignoring contradictory evidence
- Market manifestation: Investors in a stock only read bullish research; dismiss short seller reports
- Message boards amplify confirmation bias (echo chambers)
- Traders hold losing positions too long because they keep finding reasons to stay
- Counteraction: Actively seek out the strongest bearish case for any position held

### Availability Heuristic
- **Definition**: Overweighting easily recalled (available) examples when estimating probability
- Market manifestation: After a crash, investors overprice crash insurance (VIX stays elevated)
- After a long bull market, investors underprice crash risk
- "Availability cascade": A narrative repeated in media feels more probable than it is

### Overconfidence
- Studies (Barber & Odean, 2000): Individual investors trade too frequently due to overconfidence
- High-trading individual investors underperform low-trading investors by ~6.5% per year
- Men exhibit higher overconfidence in financial decisions than women (same study)
- Professional fund managers: 80-90% underperform their benchmark over 15+ year periods (S&P SPIVA data)

### Mental Accounting
- **Thaler (1985)**: People treat money differently based on its origin or intended use
- Market manifestation: "House money effect" — investors take larger risks with profit than principal
- Treating a portfolio gain as "house money" leads to excessive risk-taking near market tops
- Treating a portfolio loss as "real money" leads to excessive risk aversion near market bottoms (precisely when risk is lowest)

---

## 11. CONTRARIAN INVESTING FRAMEWORK

### The Core Principle
When a majority of market participants are positioned one way, the market has often already moved to price in that view. The future excess return comes from the minority view being right.

### Measuring Extremes
- **AAII Survey**: Weekly survey of individual investor sentiment
  - Bull-Bear spread of -20 or worse: Historically bullish (contrarian buy)
  - Bull-Bear spread of +30 or better: Historically bearish (contrarian caution)
  - The AAII survey showed 60%+ bears in late 2022 — followed by a strong 2023 rally
- **NAAIM Exposure Index**: Active investment managers' equity exposure
  - Below 30: Managers are defensively positioned → markets often rally
  - Above 90: Managers are fully invested → limited new buying power
- **Investor Intelligence Survey**: Newsletter writers' sentiment
  - Bears > 50%: Strong contrarian buy signal historically
  - Bulls > 60%: Contrarian caution signal

### Sentiment vs. Positioning
- Sentiment surveys measure what people SAY they think
- Positioning data (options, futures, flows) measures what people have DONE
- The most powerful contrarian signal: negative sentiment + defensive positioning (cash, puts, short exposure)
- When everyone is positioned defensively, any positive news produces outsized rally (short covering + new buying)

---

*Sources: Kahneman & Tversky (1979) Prospect Theory, Bernard & Thomas (1989), Jegadeesh & Titman (1993), Barber & Odean (2000), Harris & Gurel (1986), Shleifer (1986), Robert Whaley VIX research, CBOE VIX historical data, AAII Sentiment Survey archives, DALBAR Quantitative Analysis of Investor Behavior 2023, Howard Marks "The Most Important Thing," CNN Fear & Greed Index methodology, FactSet data 2020-2024, FINRA Margin Statistics.*
