# PATTERN ENGINE — CONFIDENCE RANKINGS & COMBINATION RULES
## Brain Vault v1.0 | VESTEX Market Intelligence

---

## TOP 10 HIGHEST-CONFIDENCE PATTERNS

Ranked by `confidence` score from `patterns.json`. Confidence reflects a composite of historical win rate, sample size, academic backing, and actionability in real-time.

| Rank | Pattern ID | Name | Confidence | Win Rate | Category |
|------|-----------|------|-----------|----------|---------|
| 1 | PATTERN_012 | Yield Curve Inversion → Recession | 85 | 88% | Macro |
| 2 | PATTERN_024 | Earnings Miss + Guidance Cut | 84 | 18%* | Earnings |
| 3 | PATTERN_037 | VIX Spike Above 40 | 81 | 79% | Sentiment |
| 4 | PATTERN_021 | Earnings Beat + Guidance Raised | 82 | 76% | Earnings |
| 5 | PATTERN_020 | Sahm Rule Unemployment Spike | 80 | 82% | Macro |
| 6 | PATTERN_007 | Volume Climax / Capitulation | 74 | 71% | Technical |
| 7 | PATTERN_040 | Insider Cluster Buying | 73 | 66% | Sentiment |
| 8 | PATTERN_043 | Credit Spread Widening | 74 | 72% | Macro |
| 9 | PATTERN_044 | Cup and Handle Breakout | 74 | 68% | Technical |
| 10 | PATTERN_001 | Golden Cross | 72 | 68% | Technical |

*PATTERN_024 win rate of 18% means it is bearish 82% of the time — the "win rate" here reflects the probability of the stock rising after a miss+cut, which is very low. The pattern's high confidence reflects reliability of the negative outcome.

---

## TOP 10 PATTERNS BY WIN RATE

| Rank | Pattern ID | Name | Win Rate | Confidence | Notes |
|------|-----------|------|----------|-----------|-------|
| 1 | PATTERN_012 | Yield Curve Inversion | 88% | 85 | Recession prediction — 0 false positives |
| 2 | PATTERN_020 | Sahm Rule | 82% | 80 | Real-time recession indicator |
| 3 | PATTERN_037 | VIX Spike Above 40 | 79% | 81 | Contrarian buy after panic spike |
| 4 | PATTERN_021 | Earnings Beat + Guidance Raised | 76% | 82 | Best earnings outcome |
| 5 | PATTERN_032 | Santa Claus Rally | 74% | 71 | 7-day seasonal window |
| 6 | PATTERN_015 | Last Fed Rate Hike | 73% | 70 | 12-month forward returns strong |
| 7 | PATTERN_043 | Credit Spread Widening | 72% | 74 | Credit smarter than equity |
| 8 | PATTERN_007 | Volume Climax | 71% | 74 | Capitulation reversal |
| 9 | PATTERN_031 | November–April Outperformance | 69% | 69 | Halloween effect confirmed in 37 countries |
| 10 | PATTERN_008 | 52-Week High Breakout | 65% | 71 | Momentum premium |

---

## BOTTOM 5 PATTERNS (LOWEST WIN RATE — USE WITH CAUTION)

| Rank | Pattern ID | Name | Win Rate | Notes |
|------|-----------|------|----------|-------|
| 1 | PATTERN_024 | Earnings Miss + Guidance Cut | 18% (bearish) | Reliably negative |
| 2 | PATTERN_023 | Earnings Beat + Guidance Cut | 31% | "Beat and lower" — sell the guidance |
| 3 | PATTERN_025 | Earnings Miss + Guidance Maintained | 39% | Management credibility critical |
| 4 | PATTERN_026 | Revenue Beat with Margin Miss | 38% | Environment-dependent |
| 5 | PATTERN_004 | RSI Overbought Reversal | 56% | Weakest standalone technical signal |

---

## PATTERN COMBINATION RULES

### RULE 1: SAME-DIRECTION MULTI-CATEGORY CONFIRMATION
When patterns from 3 or more DIFFERENT categories all point in the same direction simultaneously, treat the signal as a Tier 1 (highest priority) event. The combination of technical + macro + sentiment alignment has historically marked major turning points.

**Example:** VIX > 40 (sentiment) + Yield Curve Steepening (macro) + Volume Climax (technical) + Put/Call > 1.5 (sentiment) = March 2009, March 2020 type setup. Extremely rare, extremely powerful.

### RULE 2: CONFLICTING SIGNAL RESOLUTION
When bull and bear signals conflict, apply this hierarchy to determine which overrides:
1. **Macro patterns** (yield curve, Sahm Rule, credit spreads) override technical patterns in 75%+ of cases
2. **Earnings patterns** override technical patterns for individual stocks (fundamentals > technicals)
3. **Sentiment extremes** override seasonal patterns (fear/greed > calendar)
4. **Volume confirms everything** — if volume does not confirm a breakout, discount it by 50%

### RULE 3: CONFIDENCE ADJUSTMENT FORMULA
Base confidence from `patterns.json` is adjusted in real-time as follows:

```
adjusted_confidence = base_confidence
  + (10 × confirmed_confirming_patterns)
  - (8 × confirmed_counter_signals)
  + (5 × volume_confirmation)      // +5 if volume confirms direction
  - (10 × macro_headwind)          // -10 if macro trend opposes signal
  + (7 × insider_buying_present)   // +7 if PATTERN_040 also triggered
  - (5 × low_liquidity)            // -5 if trading near OpEx or holiday
```

### RULE 4: TIMEFRAME ALIGNMENT
A signal is only valid if the shorter timeframe is aligned with the longer timeframe:
- A daily technical buy signal is STRONGER when the weekly chart is also bullish
- A daily technical buy signal in a monthly bear trend should be treated as a short-term trade only
- Highest-conviction setups have daily, weekly, AND monthly charts all aligned

### RULE 5: THE "DON'T FIGHT THE FED" OVERRIDE
When the Federal Reserve is in aggressive policy mode (rapid hiking or cutting), Fed policy overrides ALL other patterns except the Sahm Rule. In a hiking cycle: discount all bullish technical patterns by 15 confidence points. In a cutting cycle: add 10 confidence points to all bullish technical patterns.

---

## HOW TO WEIGHT CONFLICTING PATTERNS

### SCENARIO A: Technical Bullish vs. Macro Bearish
- Golden Cross forming (bullish, PATTERN_001)
- Yield Curve Inversion in place (bearish, PATTERN_012)

**Resolution:** Macro wins for medium-term (3–12 month) signals. Technical wins for short-term (1–4 week) trades. The Golden Cross may produce a 2–4 week rally within the macro downtrend — trade it as a tactical opportunity only. Set a tighter stop loss than you would in a non-inverted-curve environment.

### SCENARIO B: Earnings Bullish vs. Sector Bearish
- Earnings Beat + Guidance Raised (PATTERN_021)
- Entire sector in death cross territory

**Resolution:** Individual company earnings catalyst is shorter-duration (1–30 days) while sector trend is longer-duration. Treat as a tactical 1–2 week trade only. Sector pressure will likely reassert itself after the earnings premium fades.

### SCENARIO C: Multiple Conflicting Technical Signals
- Bull Flag forming on daily chart
- Head and Shoulders on weekly chart
- Golden Cross on monthly chart

**Resolution:** Monthly > Weekly > Daily in timeframe hierarchy. The monthly golden cross is the most significant. The weekly H&S is a medium-term caution flag. The daily bull flag is a short-term trade. Reduce position size and tighten stops. This is a "controlled exposure" scenario — partial position only.

### SCENARIO D: Sentiment vs. Momentum Conflict
- VIX spike above 40 (buy signal, PATTERN_037)
- 52-week low breakdown (sell signal, PATTERN_009)

**Resolution:** VIX spike is an event-driven sentiment extreme; 52-week low is a momentum trend signal. For very short-term trades (1–3 days), the VIX spike mean-reversion has a stronger statistical edge. For 1–3 month positions, the 52-week low momentum downtrend is more reliable. Most aggressive action: buy a small position on the VIX spike for the 1–5 day mean reversion, but do not build a long-term position until momentum reverses and price recaptures the 52-week low level.

---

## PATTERN SCORING TIERS FOR AI SIGNAL GENERATION

Use these tiers when the AI engine combines patterns to generate trade signals:

### TIER 1 — HIGHEST CONVICTION (Adjusted Confidence ≥ 85)
- Multiple category confirmation (3+ patterns aligned)
- Volume confirmed
- No conflicting macro signals
- **AI Action:** Full signal — present with highest urgency, include price targets, include stop levels

### TIER 2 — HIGH CONFIDENCE (Adjusted Confidence 70–84)
- 2+ patterns aligned
- Volume partially confirms
- 1 minor counter-signal present
- **AI Action:** Strong signal — present with recommended action, note the single risk factor

### TIER 3 — MODERATE CONFIDENCE (Adjusted Confidence 55–69)
- Single pattern triggered
- No confirmation from other categories
- OR: conflicting signals present with slight edge one way
- **AI Action:** Watchlist signal — flag for monitoring, do not generate a primary trade recommendation

### TIER 4 — LOW CONFIDENCE (Adjusted Confidence < 55)
- Single pattern with known low win rate
- Multiple conflicting signals
- OR: pattern in wrong market regime
- **AI Action:** Suppress or note as background context only — do not surface as a trade signal

---

## REGIME DETECTION — WHICH PATTERNS APPLY IN EACH MARKET REGIME

### BULL MARKET REGIME (S&P 500 above 200-day SMA, VIX < 20)
**Most Reliable Patterns:**
- Cup and Handle (PATTERN_044) — highest win rate in bull markets
- 52-Week High Breakout (PATTERN_008)
- Bull Flag Continuation (PATTERN_041)
- Earnings Beat + Guidance Raised (PATTERN_021)
- Support Bounce (PATTERN_010)

**Suppress in Bull Market:**
- VIX spike signals (VIX rarely reaches 40 in a bull market)
- Extreme Fear signals (rarely triggered)
- Death Cross (false alarm risk high)

---

### BEAR MARKET REGIME (S&P 500 below 200-day SMA, VIX > 25 chronic)
**Most Reliable Patterns:**
- VIX Spike Above 40 (PATTERN_037) — for tactical bounces only
- Volume Climax / Capitulation (PATTERN_007)
- RSI Oversold Bounce (PATTERN_003)
- Earnings Miss + Guidance Cut (PATTERN_024)

**Suppress in Bear Market:**
- Golden Cross (high false-signal rate in bear markets)
- January Effect (works less reliably in bear market years)
- Bull Flag (break attempts fail in downtrends)

---

### HIGH INFLATION / RATE HIKE REGIME (CPI > 4%, Fed hiking)
**Most Reliable Patterns:**
- CPI Print Below Expectations (PATTERN_017) — rate cut hope catalyst
- Credit Spread Widening (PATTERN_043)
- Yield Curve Inversion (PATTERN_012)
- Earnings Miss + Guidance Cut (PATTERN_024) — margin pressure endemic

**Pattern Distortions in this Regime:**
- RSI Overbought signals: more reliable (valuation compression reduces tolerance for stretched RSI)
- NFP miss is bullish in this regime (bad news = good news for rate cut hopes)
- Golden Cross signals: less reliable as Fed hawkishness can override technical momentum

---

### RATE CUT CYCLE / DOVISH PIVOT REGIME (Fed cutting rates)
**Most Reliable Patterns:**
- First Fed Rate Cut (PATTERN_014) — insurance cut version
- Yield Curve Steepening (PATTERN_013)
- Golden Cross (PATTERN_001)
- Santa Claus Rally (PATTERN_032) — enhanced by dovish backdrop
- Small Cap January Effect (PATTERN_028)

---

## HISTORICAL MARKET ENVIRONMENT REFERENCE

### S&P 500 Drawdown + Recovery Pattern (1929–2024)
| Event | Peak-to-Trough Drawdown | Patterns That Called It |
|-------|------------------------|------------------------|
| Great Depression (1929–1932) | -89% | Yield curve, credit spreads, volume climax |
| 1973–74 Oil Crisis | -48% | Yield curve inversion, September effect |
| Black Monday 1987 | -34% (1 day) | Volume climax, VIX spike (CBOE just opened) |
| Dot-com Crash 2000–2002 | -49% | RSI overbought divergence, MACD bearish, H&S top |
| Financial Crisis 2007–2009 | -57% | Yield curve inversion (2006), credit spreads (mid-2007), Sahm Rule |
| COVID Crash 2020 | -34% in 23 days | VIX > 82, volume climax at bottom — March 23 exact bottom |
| 2022 Bear Market | -27% | Yield curve inversion (Mar 2022), MACD bearish weekly, death cross |

### Key Pattern Validation Across History
- **Yield Curve Inversion → Recession:** 8/8 times since 1955 (100% historically, though timing varies)
- **VIX > 40 → 30-day positive return:** 38/48 instances since 1990 (79% win rate)
- **Sahm Rule → Recession:** 11/11 times since 1970 (100%, excluding disputed 2024 trigger)
- **Golden Cross → 12-month positive return:** 68% of instances, average +10.5%
- **Santa Claus Rally failure → negative full year:** 7/7 times it failed in modern era (2000, 2008, 2022 most notable)

---

## QUICK REFERENCE — PATTERN IDs BY CATEGORY

### TECHNICAL (11 patterns)
PATTERN_001 Golden Cross | PATTERN_002 Death Cross | PATTERN_003 RSI Oversold Bounce
PATTERN_004 RSI Overbought Reversal | PATTERN_005 MACD Bullish Crossover
PATTERN_006 MACD Bearish Crossover | PATTERN_007 Volume Climax
PATTERN_008 52-Week High Breakout | PATTERN_009 52-Week Low Breakdown
PATTERN_010 Support Bounce | PATTERN_011 Resistance Rejection
PATTERN_041 Bull Flag | PATTERN_042 Head and Shoulders Top | PATTERN_044 Cup and Handle

### MACRO (9 patterns)
PATTERN_012 Yield Curve Inversion | PATTERN_013 Yield Curve Steepening
PATTERN_014 First Fed Rate Cut | PATTERN_015 Last Fed Rate Hike
PATTERN_016 CPI Beat | PATTERN_017 CPI Miss | PATTERN_018 NFP Beat
PATTERN_019 NFP Miss | PATTERN_020 Sahm Rule | PATTERN_043 Credit Spread Widening

### EARNINGS (7 patterns)
PATTERN_021 Beat + Raise | PATTERN_022 Beat + Maintain | PATTERN_023 Beat + Cut
PATTERN_024 Miss + Cut | PATTERN_025 Miss + Maintain | PATTERN_026 Revenue Beat / Margin Miss
PATTERN_027 Revenue Miss / EPS Beat

### SEASONAL (7 patterns)
PATTERN_028 January Effect | PATTERN_029 Sell in May | PATTERN_030 September Effect
PATTERN_031 November–April | PATTERN_032 Santa Claus Rally
PATTERN_033 Quarterly OpEx | PATTERN_034 End of Quarter Window Dressing

### SENTIMENT (6 patterns)
PATTERN_035 Extreme Fear | PATTERN_036 Extreme Greed
PATTERN_037 VIX Spike > 40 | PATTERN_038 Put/Call Ratio Extreme
PATTERN_039 Short Squeeze | PATTERN_040 Insider Cluster Buying

**TOTAL: 44 patterns across 5 categories**

---

*Last updated: 2026-06-03 | VESTEX Brain Vault v1.0*
*Source research: Ned Davis Research, LPL Financial, FactSet, Sentimentrader, Stock Trader's Almanac, CBOE, BLS, Federal Reserve FRED, academic citations in notes.md*
