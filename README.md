# Home / Rent — Mortgage vs Rent Break-Even Calculator

A browser-only calculator that solves for the annual home appreciation needed for buying to match renting and investing. Built with React, TypeScript, Vite, and accessible SVG charts. The financial engine is independent of React in `src/engine.ts`.

## Run locally

Requires Node.js 22.12+ or a supported newer release.

```sh
 

Open the URL printed by Vite (usually http://localhost:5173). Run `npm run build` to generate static hosting files in `dist/`. Use `npm run preview` to preview that production build.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Tests cover amortization against independent values, effective returns, contribution timing, annual growth, cash purchases, extra principal, PMI cancellation, partial-year summaries, negative thresholds, zero-price cases, and wealth reconciliation. Browser checks cover recalculation, validation, unit conversion, scenarios, keyboard navigation, sensitivity analysis and mobile layout.

## Included

- House price, dollar/percentage down payment, and holding periods up to 50 years in whole months.
- Fixed-rate mortgage with custom term, cash purchases, zero interest, extra principal, and configurable PMI cancellation.
- Dollar/percentage annual property tax, insurance and maintenance; monthly HOA and miscellaneous costs.
- Rent growth, renters insurance, expense inflation, effective investment return, and estimated tax savings.
- Dollar/percentage closing and selling costs, with selling percentages applied to actual sale price.
- Required appreciation and sale value, monthly cash flow, ending wealth, holding-period chart, appreciation scenarios, sensitivity analysis, annual comparisons and full calculation breakdown.

## Model contract

1. Renter capital at month zero equals down payment plus avoided buyer closing costs. Closing costs exclude refundable escrow and prepaid costs already included in the monthly model.
2. Mortgage interest accrues at annual note rate / 12. Payment is capped at principal plus accrued interest; payments stop after payoff. Extra principal is included in buyer cash outflow.
3. Investment return is effective annual return after taxes and fees. Monthly rate is `(1 + annualReturn)^(1/12) - 1`. Portfolios grow first; savings are invested at month-end.
4. The cheaper strategy invests its monthly advantage. Both strategies use the same household cash budget. Principal builds equity through the reduced mortgage balance and is never added again to ending wealth.
5. Percentage expenses use original purchase price, then grow with expense inflation independently of appreciation. Rent and expense growth begin in month 13, repeating on each anniversary. HOA, other owner costs, renters insurance and other renter costs also use expense inflation.
6. PMI is a fixed user-supplied monthly dollar amount. It stops in the month after the modeled balance reaches the selected share of original purchase price, or after payoff. This is a modeling assumption, not a legal/lender cancellation determination. A 0% threshold keeps PMI until payoff.
7. Tax benefits default to zero. The effective estimate applies to mortgage interest and optionally property tax; the rate must reflect eligibility, deduction limits and incremental benefit over renting. Savings are allocated monthly. Advanced tax-law calculations and home-sale capital-gains tax are excluded.
8. Sale follows the final monthly payments and contributions. Buyer wealth equals sale price minus selling costs minus mortgage balance plus buyer investments. Renter wealth is the renter portfolio. All figures are nominal USD and represent wealth associated with the two strategies.
9. Expenses do not depend on appreciation, so the analytical solution is `salePrice = (renterPortfolio + mortgageBalance - buyerPortfolio + fixedSellingCosts) / (1 - sellingCostRate)`. CAGR uses exact holding months / 12. Every annual horizon is solved independently.
10. A nonpositive analytical sale price means buying is already at least as wealthy at a zero sale value. The UI reports this instead of inventing a positive threshold. Negative CAGR with a positive sale price is valid.

No intermediate rounding is applied. Displayed appreciation is rounded to two decimal percentage points; reconciliation and scenarios use the unrounded solution. Tested ordinary scenarios reconcile well within $1. Floating-point absolute precision is limited at extreme magnitudes.

## Reproducible default example

| Assumption | Value |
|---|---:|
| Purchase price / down payment | $600,000 / 20% |
| Mortgage rate / term / holding period | 6.25% / 30 years / 10 years |
| Buyer closing / selling costs | 2% / 6% |
| Annual property tax / maintenance | 1% / 1% of original price |
| Annual homeowners insurance | $1,800 |
| Monthly rent / renters insurance | $2,700 / $20 |
| Rent growth / expense inflation | 3% / 3% |
| Effective annual investment return | 7% |
| Tax benefit, HOA, PMI, extra principal, miscellaneous costs | 0 |

Result: **4.39% required annual appreciation**, **$922,013 required sale value**, **$462,351 ending wealth for each strategy**. Mortgage payment is $2,955.44 monthly; balance after 120 payments is $404,341.02. The first-month renter investment is $1,385.44.

## Scope

No backend, accounts, external financial APIs or stored financial inputs. Fonts load from Google Fonts with sans-serif fallbacks. Calculations run locally; inputs reset on reload. Market forecasts, refinancing, moving costs, refundable deposits, advanced taxes, reverse-price mode and public deployment are outside this MVP.
