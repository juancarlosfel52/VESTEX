# Academic Research — Practical Application Guide
# Category 5: What Still Works, What Has Been Arbitraged Away
# Last Updated: 2026-06-03

---

## FRAMEWORK: EVALUATING EXPLOITABILITY

Three conditions must be met for an academic anomaly to be exploitable in live trading:
1. **Persistence:** The effect exists post-publication and out-of-sample
2. **Capacity:** Returns survive realistic transaction costs and market impact
3. **Implementability:** The signal is observable before the return window closes

Confidence rating scale used below:
- STRONG: Effect persists post-publication, robust across multiple studies, capacity >$1B
- MODERATE: Effect exists but weakened post-publication, or limited to specific conditions
- WEAK: Largely arbitraged away, inconsistent, or transaction costs eliminate alpha
- DEAD: No longer detectable in modern markets

---

## 1. MOMENTUM (12-1 MONTH)

**Status: STRONG — Core exploitable anomaly**

### What the Research Says
Jegadeesh & Titman (1993) documented ~1% per month excess return (12% annualized) from buying past 12-month winners and selling losers. The effect survived out-of-sample (continued in 1990s per their 2001 follow-up). The anomaly works across U.S. equities, international equities, bonds, commodities, and currencies.

### What Still Works (2026)
- Momentum remains one of the most robust documented anomalies
- Time-series momentum (Moskowitz et al. 2012) adds independent signal — own past return predicts own future return
- Factor momentum (momentum of factor returns themselves) is a newer variant
- Works best in: medium-cap names with moderate analyst coverage; trending macro environments

### Conditions Required
- Works POORLY in: highly volatile/bear markets (crash risk); sideways/choppy regimes
- Requires: skip-1-month (avoid short-term reversal); formation 6–12 months; hold 1–6 months
- Momentum crashes in bear market rebounds — must have drawdown control/volatility scaling

### Implementation Guidance for AI System
- Signal: 12-month trailing return minus most recent month (12-1 formation)
- Long threshold: top 20–30% of universe by past return
- Confirmation: time-series momentum agreement (stock above 10/20-month moving avg)
- Risk off: reduce exposure when VIX > 30 OR market drawdown > 15% from recent peak
- Regime filter: only go long when broader market in bull regime (price > 200-day MA)

**Confidence: HIGH | Expected excess return: 4–8% annually after costs in current market**

---

## 2. VALUE PREMIUM (HML)

**Status: MODERATE — Real but weakened; requires patience and selectivity**

### What the Research Says
Fama-French (1993) documented 3–5% annual premium for high book-to-market (value) stocks over growth stocks. Effect persists globally across 40+ years of data. Deep value works especially well combined with quality screens (profitable value, not distressed value).

### What Still Works (2026)
- Value premium was absent for most of 2010–2020 as growth/tech dominated
- Value has shown signs of recovery post-2022 rate hikes (higher rates hurt long-duration growth stocks more)
- International value remains more compelling than U.S. value at elevated CAPE ratios
- "Quality value" (high profitability + low valuation) is the most robust variant per 5-factor model

### Implementation Guidance
- Screen for: low P/E (<15), low P/B (<1.5), low EV/EBITDA (<8x), combined with positive free cash flow
- Avoid: value traps — distressed companies with declining fundamentals
- Combine with: profitability filter (RMW factor) — profitable value beats simple value
- Rebalance: annually or semi-annually to capture premium without excessive turnover

**Confidence: MODERATE | Expected excess return: 2–4% in favorable macro, near-zero in growth regimes**

---

## 3. SIZE PREMIUM (SMB)

**Status: WEAK — Largely arbitraged; only survives with quality/momentum overlays**

### What the Research Says
Fama-French (1993) documented ~1.5–3.5% annual small-cap premium. However:
- The premium has substantially weakened post-1980 in the U.S.
- Most of the small-cap premium concentrates in micro-caps with very high transaction costs
- The raw small-cap premium largely disappears after controlling for market microstructure costs

### What Still Works (2026)
- Small-cap momentum (small caps with momentum signal) remains strong
- Small-cap value (small + cheap) is more robust than either factor alone
- January effect for small caps: some residual effect in first 5 trading days of January
- International small caps show stronger premium than U.S.

**Confidence: WEAK (standalone) | MODERATE (combined with momentum + value)**

---

## 4. LOW VOLATILITY ANOMALY

**Status: STRONG — Consistently documented; capacity constrained but real**

### What the Research Says
Low-beta / low-volatility stocks earn higher risk-adjusted returns than high-beta stocks — documented since the early 1970s across global markets. The effect is persistent, universal, and theoretically grounded in investor behavior (benchmark mandates, lottery preferences for high-vol stocks).

### What Still Works (2026)
- Effect is most pronounced in defensive sectors (utilities, consumer staples, healthcare)
- Works across multiple countries and asset classes
- Most exploitable via min-variance portfolio construction or low-beta tilts
- Provides drawdown protection in bear markets while sacrificing some bull market gains

### Implementation Guidance
- Screen for: 12-month trailing beta < 0.8; 12-month realized vol in bottom tertile
- Sector tilt: utilities, consumer staples, healthcare tend to be lower-volatility
- Works well in risk-off environments; underperforms in strong momentum/risk-on environments
- Combine with: dividend yield screen for income + low-vol portfolio

**Confidence: HIGH | Expected risk-adjusted improvement: 1–3% annualized Sharpe**

---

## 5. PROFITABILITY (RMW) AND INVESTMENT (CMA) FACTORS

**Status: STRONG — Most robust additions from 5-factor model**

### What the Research Says
- **RMW:** High operating profitability firms outperform weak-profit firms by ~3% annually
- **CMA:** Low-investment firms outperform high-investment firms by ~2–3% annually
- Both factors survived publication and remain in Fama-French data library

### Implementation Guidance
- Profitability screen: gross profit/assets > 30%; free cash flow positive for 3+ years
- Investment screen: avoid companies growing assets >15–20% per year without commensurate profit growth
- Best use: as overlays on value screen to avoid value traps

**Confidence: HIGH | Both factors remain in live Fama-French data through 2025**

---

## 6. POST-EARNINGS ANNOUNCEMENT DRIFT (PEAD)

**Status: STRONG — One of the most persistent anomalies in academic finance**

### What the Research Says
Bernard & Thomas (1989, 1990): Stocks continue drifting in the direction of earnings surprise for ~60 trading days. The anomaly appeared in 41 of 48 quarters studied. Raw annualized return of ~35% before costs. Effect survives in modern data, though partially reduced by faster information processing.

### What Still Works (2026)
- PEAD remains strong in mid/small-cap names with limited analyst coverage
- Text-based PEAD (earnings call transcript sentiment) adds signal beyond numeric surprise
- First 5–10 days post-announcement: highest signal quality
- PEAD is weaker in large-cap S&P 500 names where institutional response is faster

### Implementation Guidance
- Signal: EPS surprise >5% relative to consensus (positive PEAD long; negative PEAD short)
- Guidance revision: management raised guidance = stronger PEAD signal; guidance cut = stronger negative PEAD
- Analyst revision tracking: if analysts revise estimates higher post-earnings, PEAD signal strengthens
- Hold window: 30–60 trading days after announcement; stop at next earnings announcement
- Universe filter: mid-cap ($2–$15B) with 3–8 analyst estimates

**Confidence: HIGH | Expected post-cost alpha: 8–15% annualized in mid-cap universe**

---

## 7. CAPE / SHILLER PE VALUATION SIGNAL

**Status: MODERATE — Long-term predictor only; useless for short-term timing**

### What the Research Says
CAPE has ~37% R-squared for predicting 10-year forward real returns. Low CAPE (< 15) has historically preceded very strong 10-year returns. High CAPE (> 30) has historically preceded weak or negative 10-year returns.

### Current Status (2026)
- U.S. CAPE remains historically elevated; implies below-average 10-year forward returns
- Technology sector dominance may partially justify elevated CAPE (higher margins, asset-light)
- International markets have significantly lower CAPE ratios — stronger 10-year expected returns

### Implementation Guidance
- Use CAPE as long-term asset allocation signal, not timing signal
- CAPE > 35: reduce U.S. equity allocation; increase international, bonds, alternatives
- CAPE < 15: overweight equities aggressively (historically extremely bullish for 10-year returns)
- Never use CAPE alone to go short equities — it cannot predict peak timing

**Confidence: HIGH for 10-year return prediction | LOW for 1–2 year market timing**

---

## 8. VOLATILITY MEAN-REVERSION (VIX)

**Status: STRONG — Highly reliable tactical signal**

### What the Research Says
VIX is strongly mean-reverting around a long-run mean of ~19–20. Extreme VIX spikes (> 40) historically revert within weeks to months. The volatility risk premium (VRP) — implied vol persistently exceeds realized vol — is consistently collectible by selling options.

### What Still Works (2026)
- VIX > 40: Historically excellent signal to buy equities (capitulation indicator)
- VIX term structure backwardation: acute stress indicator; fade the fear near historical VIX peaks
- Contango environment: favorable for short-volatility strategies (VXX decay)
- VRP selling: systematic option premium selling has Sharpe > 1 historically, but with crash tail risk

### Implementation Guidance for AI System
- VIX spike signal: VIX > 35 = increase equity allocation 10%; VIX > 45 = max allocation buy signal
- Regime signal: VIX < 15 = low-vol bull regime; prioritize momentum strategies
- VIX > 25 = reduce momentum; increase quality/defensive exposure
- After VIX spike above 40: 1-month forward S&P 500 return historically above +5%

**Confidence: HIGH | VIX > 40 signal: 80%+ hit rate for positive 3-month forward returns historically**

---

## 9. JANUARY EFFECT

**Status: WEAK — Mostly arbitraged away in large caps; residual in small-caps**

### What the Research Says
Small caps outperform in January due to tax-loss selling reversal. Original magnitude was 3–6% excess return. Modern effect is substantially diminished due to:
- Growth of tax-advantaged accounts (401k, IRA) reducing year-end selling pressure
- More market participants aware of the effect and front-running it
- The effect now mostly appears in micro-caps (<$300M) with thin liquidity

**Confidence: WEAK | Not recommended as standalone signal**

---

## 10. BEHAVIORAL BIASES — EXPLOITABLE PATTERNS

### Loss Aversion (Kahneman-Tversky)
- **Disposition effect:** Investors hold losers too long → underpriced losers; sell winners too fast → momentum continuation
- **Exploit:** Momentum in winners is extended; oversold losers may be irrationally cheap (value setup)

### Overreaction (De Bondt-Thaler) — Long Horizon
- **Exploit:** Deep contrarian buying of 3–5 year extreme losers (not momentum losers)
- **Works best:** After multi-year bear markets in specific sectors; beaten-down sectors with intact underlying economics
- **Risk:** Timing is unpredictable; requires patient capital

---

## ARBITRAGED / DEAD PATTERNS (Do Not Rely On)

| Pattern | Status | Why Dead |
|---------|--------|----------|
| Day-of-week effect (Monday/Friday) | DEAD | HFT + modern market structure eliminated it |
| Raw January effect in large caps | DEAD | Tax-advantaged accounts + front-running |
| Simple P/B value screen | WEAK | Intangibles revolution; book value less meaningful |
| Short-term reversal (<1 week) | DEAD | Liquidity provision by market makers captures it |
| Earnings whisper number | WEAK | Widely known; priced in within seconds |

---

## COMBINED SIGNAL FRAMEWORK (For AI Market Intelligence System)

### Signal Stack Priority
1. **Regime First:** Determine bull/bear/sideways using 200-day MA + VIX level + breadth
2. **Macro Overlay:** CAPE for long-term allocation; yield curve for recession probability
3. **Factor Tilt:** In bull regimes → momentum + quality; in bear regimes → low-vol + value
4. **Event Signals:** PEAD after earnings; volatility spikes as contrarian buy signals
5. **Seasonality:** Minor adjustment — avoid being aggressively long September; favor November–April

### Regime-Factor Matrix
| Regime | Best Factors | Avoid |
|--------|-------------|-------|
| Bull (VIX <15, market >200MA) | Momentum, Growth | Value, Low-vol |
| Transition/Late Bull (VIX 15-25) | Quality, Momentum | Pure Momentum (crash risk rising) |
| Bear / High Vol (VIX >30) | Low-vol, Quality, Cash | Momentum, High-beta |
| Recovery (VIX falling from >40) | Momentum, Small-cap, PEAD plays | None (buy everything quality) |
