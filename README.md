# Home / Rent — Mortgage vs Rent Break-Even Calculator

A browser-only calculator that solves for the annual home appreciation needed for buying to match renting and investing. Built with React, TypeScript, Vite, and accessible SVG charts. The financial engine is independent of React in `src/engine.ts`.

## Run locally

Requires Node.js 22.12+ or a supported newer release.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173). Run `npm run build` to generate static hosting files in `dist/`. Use `npm run preview` to preview that production build.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Tests cover amortization against independent values, effective returns, contribution timing, annual growth, cash purchases, extra principal, PMI cancellation, partial-year summaries, negative thresholds, zero-price cases, and wealth reconciliation. Browser checks cover recalculation, validation, unit conversion, scenarios, keyboard navigation, sensitivity analysis and mobile layout.

## India effective-demand tools

Use **India calculators** in the header to open three linked tools:

- **`/india` — Homebuyer capacity:** cash and EMI requirements, buyer tiers, financing gaps, maximum affordable price, gross rental yield, appreciation relative to income and savings, and buying now versus delaying purchase.
- **`/india/market` — Price vs buyer capacity:** exact-price segment results and a keyboard-accessible chart of financially capable and effective households at 21 prices from 50% to 150% of the entered price. The chart also has a data-table view.
- **`/india/builders` — Builder / sales demand:** editable representative household groups, financial tiers, effective-demand counts, and exclusion reasons.

All money is nominal INR, displayed with Indian digit grouping. Enter amounts in rupees (₹1 crore = 1,00,00,000). Defaults, household counts, interest rates, purchase costs, EMI limits, and loan-to-value limits are **illustrative, editable examples**, not sourced city estimates or lending rules. Each segment represents households with identical finances and demand factors; split differing profiles into separate, non-overlapping groups.

The shared model in `src/india.ts` reuses the existing EMI calculation:

1. Available purchase cash equals liquid funds less the protected reserve. Upfront purchase costs are paid from cash and excluded from the property value used for the loan-to-value limit.
2. Required loan equals the positive remainder of property price plus purchase costs less available cash. EMI capacity equals the positive remainder of the selected share of monthly after-tax income less existing EMIs.
3. Tier 1 covers the complete purchase cost with cash. Tier 2 requires borrowing and satisfies both cash/LTV and EMI constraints. Tier 3 fails one or both constraints. The maximum affordable price satisfies both financing limits; it excludes purchase costs from the displayed property price.
4. Financial capacity alone does not establish effective demand. Need, desire, willingness to buy, and credit access for borrowers must also be present. Cash buyers do not require credit access. Counts are scenario results, not forecasts of sales velocity, absorption, or city demand.
5. Appreciation burden is a one-year property-price change divided by annual income or annual savings. At 5× income, 1%, 4%, and 5% appreciation equal 5%, 20%, and 25% of annual income. The whole price increase is not assumed to be extra upfront cash.

The homebuyer page also supports **Years before purchase**, from 0 to 30 years in whole months (including half-years). It compares today's capacity with the delayed purchase price, accumulated funds, loan, EMI budget, cash and EMI gaps, and financial tier, with annual checkpoints and a final partial-year checkpoint. A zero delay leaves today's results unchanged.

- Price compounds as `today's price × (1 + annual appreciation)^(months / 12)`; the purchase-cost percentage applies to the projected price.
- Available purchase funds exclude the protected reserve. They grow at the effective annual savings return converted to monthly compounding, followed by savings deposited at each month-end. Income changes on each anniversary, and the savings deposit uses the income earned during that month. The entered savings share is already after rent and living expenses; rent is not deducted again.
- Annual after-tax income growth and savings returns both default to 0% and are editable. The protected reserve, existing monthly EMIs, future loan rate and term from purchase, financing limits, savings percentage, and demand factors remain fixed. This is a purchasing-capacity scenario, not a comparison of buy-now versus rent-and-invest ending wealth. Future scenarios beyond the model's monetary limits are rejected with validation errors.
- With a positive purchase delay, the interactive **Savings vs rising house prices** chart shows monthly checkpoints. **Price & cash** compares the property's price with available purchase funds; **Changes since today** compares extra purchase costs (price plus upfront charges), added cash (new savings plus investment gains/losses), and savings set aside from income. Hover, tap, use the month slider, or press arrow keys to inspect a month. An accessible monthly table contains the same amounts. Starting cash and the protected reserve are not counted as newly saved money. Not buying does not automatically make the avoided EMI available as savings; the entered savings share remains after rent and living expenses.

Valid edits recalculate immediately; invalid inputs show field errors and withhold dependent results. Each page keeps its inputs in memory and resets to examples on reload or navigation to another page. No inputs are uploaded or persisted. These tools do not calculate recurring ownership costs, tax benefits, a developer price floor, or detailed rent-versus-buy wealth outcomes. The existing US calculator and its USD reports and exports remain available at `/`.

Cloudflare Workers uses the SPA fallback configured in `wrangler.jsonc`; Cloudflare Pages uses its default SPA fallback because this app has no top-level `404.html`. No `_redirects` file is needed. Other static hosts must serve `index.html` for these paths so direct links and refresh work.

## US calculator features

- House price, dollar/percentage down payment, and holding periods up to 50 years in whole months.
- Fixed-rate mortgage with custom term, cash purchases, zero interest, extra principal, and configurable PMI cancellation.
- Dollar/percentage annual property tax, insurance and maintenance; monthly HOA and miscellaneous costs.
- Rent growth, renters insurance, expense inflation, effective investment return, and estimated tax savings.
- Dollar/percentage closing and selling costs, with selling percentages applied to actual sale price.
- Required appreciation and sale value, monthly cash flow, ending wealth, holding-period chart, appreciation scenarios, sensitivity analysis, annual comparisons and full calculation breakdown.
- An explorable calculation report with substituted formulas, a year-filtered monthly ledger, portfolio growth by source, and full-precision CSV/JSON downloads.

## Explore and export calculations

Select **Show calculations** below the main result to open the report. It shows initial capital, mortgage and return formulas, investment growth by source, the sale-price equation, and wealth reconciliation. Choose a ledger year and the Mortgage, Housing costs or Investments view, then select a month number to trace that month's steps.

The renter breakdown separates invested down payment, avoided closing costs, gains/losses on each, monthly savings contributions and their gains/losses. The buyer breakdown shows savings invested when ownership is cheaper. All displayed money uses cents; internal calculations remain unrounded. Rounded intermediate steps can differ by a cent.

- **Download monthly CSV** exports every simulated month, not just the visible year or columns. `month` is a one-based index; `year` is the one-based annual period, including a final partial year. All other columns are USD amounts, with raw numeric precision and no currency symbols or thousands separators. Starting portfolios, growth and ending contributions make each account independently reconcilable. `scheduledPayment` is scheduled P&I actually paid after payoff limits; `extraPrincipal` is the actual additional principal paid.
- **Download calculation JSON** exports `formatVersion: 1`, calculated inputs, rate and currency units, model assumptions, initial capital, rates, portfolio components, sale algebra, all monthly records, annual summaries and the final result. Input percentage values and rates are decimals (`0.07` means 7%). Money is USD. `result.status: "buy-always"` identifies a zero-sale-price boundary check; the engine's `appreciation: -1` in that case is a sentinel, not a solved annual appreciation rate. The report does not display a CAGR for that case.

Downloads use the last successfully calculated inputs. If you edit an input, calculate again to refresh the report and downloads. Export generation happens entirely in the browser; no financial inputs are uploaded. JSON is intended for investigation and reproduction, not an import feature.

## Cloudflare Workers + GitHub

For an existing Worker deployment, keep the Worker named `mortgage-vs-rent-break-even-calculator` and configure its Git build with:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler@4.149.0 deploy --config wrangler.jsonc` |
| Environment variable | `NODE_VERSION=24.14.1` |

The root `wrangler.jsonc` serves the built `dist` directory as static assets and sets `assets.not_found_handling` to `single-page-application`. This returns the application HTML for navigation to `/india`, `/india/market`, and `/india/builders`, preserving the requested URL. No Worker script or backend is required. Do not add `/india/* /index.html 200` to `_redirects`: use the native SPA fallback instead, avoiding HTML canonicalization redirect loops.

To verify the Worker configuration locally without publishing:

```sh
npm run build
npx wrangler@4.149.0 deploy --config wrangler.jsonc --dry-run
npx wrangler@4.149.0 dev --config wrangler.jsonc --local
```

Open each calculator route directly in a browser, refresh it, and check that CSS and JavaScript load. Publishing is a separate step: pushing a fix to the production branch triggers the connected Cloudflare build. Retrying a failed build before the fix is pushed will deploy the old code again.

Official references: [Workers SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

## Cloudflare Pages + GitHub

This calculator is a static React/Vite application. Cloudflare Pages can host its built assets on the free tier, with a `pages.dev` address and HTTPS. No server or database is required. Account connection and publishing are separate from this local implementation.

1. Sign in to Cloudflare and open **Workers & Pages**. Create a **Pages** application with Git integration if you want Pages hosting instead of the Worker setup above.
2. Authorize Cloudflare's GitHub integration for `DevYogendra/Mortgage-vs-Rent-Break-Even-Calculator` and select that repository.
3. Configure the build:

| Setting | Value |
|---|---|
| Framework preset | React (Vite) |
| Production branch | `main` |
| Root directory | Leave blank: repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION=24.14.1` (production and preview) |

4. Save and deploy. Cloudflare installs the repository dependencies and builds the site. Use the assigned `<project-name>.pages.dev` address; a custom domain is optional.
5. Verify that the calculator loads, its default example matches the values below, and both downloads work. Subsequent pushes to `main` deploy automatically. Use preview deployment links to check changes before publishing them to the production branch.

Before pushing a release, run `npm test`, `npm run test:ui` and `npm run build`. A failed Pages build should be investigated in its deployment logs before retrying. This project does not need account secrets in its frontend, Pages Functions, database bindings or a GitHub Actions deployment workflow.

Official references: [Cloudflare Pages](https://www.cloudflare.com/products/pages/), [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [React/Vite build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Node build version](https://developers.cloudflare.com/pages/configuration/build-image/).

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
