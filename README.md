# Bayes at the Plate

An interactive app for learning Bayes' theorem through a baseball example. It projects a batter's end-of-season batting average, along with its uncertainty, after each 10-game window of a 160-game season.

The app is meant as a teaching tool, not a production forecasting model. It favors clear, visible math over predictive precision.

**Live app:** https://patrick-lefler.com/bayes_batting_avg_learning_app/

## What the App Shows

After each 10-game window, the Simulator tab shows four results:

1. **10-game average** — hits divided by at-bats for that window.
2. **Season average** — all hits and at-bats so far.
3. **Bayes estimate of the final average at game 160** — what we've observed so far, plus the expected hits over the remaining at-bats.
4. **Uncertainty curve** — the full probability distribution of the final average, with a 95% range, layered over the curves from earlier windows.

It also includes a step-by-step breakdown of the calculation, a season trajectory chart, and an editable game log.

The Guide & Math tab walks through the model. Its worked example updates live from whatever values you enter.

## The Model

| Piece | Specification |
|---|---|
| True talent | θ ~ Beta(α₀, β₀) |
| Observed hits | hits \| θ ~ Binomial(AB, θ) |
| Updated belief | θ ~ Beta(α₀ + H, β₀ + AB − H) |
| Remaining hits | Beta-Binomial(R, α, β) |
| Final average | (H + future hits) / (AB + R) |

**Prior.** The prior comes from two previous seasons, each discounted by a weight:

- α₀ = w₁·H₁ + w₂·H₂
- β₀ = w₁·(AB₁ − H₁) + w₂·(AB₂ − H₂)

By default, last year counts for 0.5 and two years ago for 0.4. That 5:4 ratio follows Tom Tango's Marcel system. Presets let you compare it with pooling both seasons at full weight (1.0 / 1.0) or using last year only.

**Remaining at-bats.** R assumes the batter keeps his current pace of at-bats per game. Before the season starts, the app uses his average from the prior seasons instead.

**Uncertainty.** The 95% range uses exact Beta-Binomial quantiles. The guide splits the variance into two parts:

- **Luck:** the randomness of the at-bats still to come.
- **Ignorance:** remaining doubt about the player's true talent. This part shrinks as the season goes on.

## Using the App

- Edit the hits and at-bats for either prior season, or adjust the weight sliders.
- Step through the season with the arrows or press Play. Clicking a row in the game log jumps to that window.
- Edit any 10-game window to see how much one hot or cold stretch moves the final estimate.

**Input rules:**

- Hits and at-bats must be whole numbers, with 0 ≤ hits ≤ at-bats.
- Each prior season needs at least 1 at-bat unless its weight is 0.
- α₀ and β₀ are floored at 0.5 so the Beta distribution stays valid.
- Seasons above 700 at-bats get a soft warning.

## Running Locally

There's no build step and nothing to install. Clone the repo and open `index.html` in a browser.

```
index.html   page structure and static guide content
styles.css   dark theme and layout
app.js       Beta-Binomial math, validation, SVG charts, and dynamic guide text
```

The app is plain JavaScript with hand-drawn SVG charts and no third-party libraries. Fonts load from Google Fonts. Without a connection, the browser falls back to system fonts.

## Sources and Credits

**Cited in the app**

- Tom Tango, [Marcel the Monkey Forecasting System](https://www.tangotiger.net/marcel/), the source of the 5:4 recency weighting. See also his [original description](https://tangotiger.net/archives/stud0214.shtml).
- FanGraphs Library, ["Sample Size"](https://library.fangraphs.com/principles/sample-size/), based on research by Russell Carleton. It's the source of the roughly 910 at-bat stabilization point for batting average.

**Inspiration and further reading**

- David Robinson, [Introduction to Empirical Bayes: Examples from Baseball Statistics](http://varianceexplained.org/r/empirical-bayes-book/) ([book source](https://github.com/dgrtwo/empirical-bayes-book)). His approach builds the prior from league-wide data. This app builds it from the player's own history instead.
- Bradley Efron and Carl Morris (1975), ["Data Analysis Using Stein's Estimator and Its Generalizations,"](https://doi.org/10.1080/01621459.1975.10479864) Journal of the American Statistical Association 70(350): 311–319.

**Fonts:** [Inter](https://fonts.google.com/specimen/Inter) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono), used under the SIL Open Font License.

## Disclaimer

- The default player and his seasons are illustrative and don't represent any real MLB player.
- This project isn't affiliated with or endorsed by Major League Baseball, FanGraphs, or any author cited above.
- It's an educational tool, not betting or fantasy-sports advice.

## Author

Patrick Lefler · Seeking Eureka

## License

MIT License
