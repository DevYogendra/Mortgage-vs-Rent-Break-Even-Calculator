import { useId } from 'react'
import type { ReactNode } from 'react'
import { mortgagePayment } from './engine'
import { minimumTakeHome } from './incomeGrowth'
import { purchaseCharges } from './india'
import type { FieldError, HouseholdCapacity, IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayProjection } from './india'
import NumberField from './IndiaField'
import PurchaseDelayChart from './PurchaseDelayChart'
import { evaluateRentOnly, validateRentOnly } from './rentOnly'
import RentOnlyResults from './RentOnlyResults'
import IncomeGrowthAssessment from './IncomeGrowthAssessment'
import PurchaseChargesField from './PurchaseChargesField'
import './CompactBuyer.css'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const familiar = (n: number) => Math.abs(n) >= 1e7 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e7)} crore` : Math.abs(n) >= 1e5 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e5)} lakh` : money(n)
const funding = (c: HouseholdCapacity) => c.requiredLoan <= 1e-6 ? 'Cash purchase fits' : c.cashGap <= 1e-6 ? 'Cash + loan share fit' : 'More upfront cash needed'
const help = [
  ['Home price', 'Price before purchase charges. 1 Cr = ₹1 crore = ₹1,00,00,000.'],
  ['Comparable rent', 'Monthly rent for a similar home, used for gross rental yield and the rent-only projection.'],
  ['Annual rent increase', 'The same percentage compounds on each anniversary, starting in month 13. Enter 0% for flat rent. Rent-only invests the starting funds plus the positive mortgage-payment minus rent difference each month.'],
  ['Down payment', 'Cash paid towards the home price. Mortgage principal = home price − down payment. Upfront charges are additional cash and do not increase the mortgage. When renting, the down payment and avoided upfront charges form the starting investment.'],
  ['Computed savings', 'Rent-only deposits max(₹0, the mortgage payment for buying today − current rent). Annual rent increases reduce the difference; deposits stop after the reference loan term. When waiting is enabled, also invest 90% of increases in take-home income above today’s income. Income increases on each anniversary.'],
  ['Waiting period', 'Enable waiting to compare buying today with a later purchase. Take-home income and annual increment are included only when waiting is enabled. The rental period remains the horizon for the rent-only comparison. Up to 30 years in whole-month increments.'],
  ['House-price growth', 'Annual compounded property-price change. An editable scenario, not a forecast.'],
  ['Investment return', 'Effective annual return after taxes and fees, converted to (1 + annual rate)^(1/12) − 1 for monthly compounding. Waiting and rent-only both invest down payment plus upfront charges at the start, then the positive mortgage–rent difference. Deposits follow each month’s growth.'],
  ['Loan interest', 'Annual home-loan rate, with interest calculated monthly for the EMI.'],
  ['Loan term', 'Loan duration starting at purchase, up to 50 years in whole-month increments.'],
  ['Minimum take-home needed', 'Assumes 20% down payment and an 80% mortgage at the entered interest rate and term. Required monthly take-home is the higher of EMI ÷ 40% and mortgage ÷ (4 × 12). The mortgage must be no more than four times annual take-home income. Upfront charges are additional cash.'],
  ['Upfront purchase charges', 'Stamp duty, registration, and other costs paid in addition to the down payment. Choose a rupee amount or percentage of the home price; switching units preserves today’s amount. A rupee amount stays fixed when the home price changes, while a percentage scales with it.'],
]

export default function CompactBuyer({ product, setProduct, household, setHousehold, delay, setDelay, errors, projection, context, reset }: {
  product: IndiaProduct; setProduct: (p: IndiaProduct) => void;
  household: IndiaHousehold; setHousehold: (h: IndiaHousehold) => void;
  delay: PurchaseDelay; setDelay: (d: PurchaseDelay) => void;
  errors: FieldError[]; projection: PurchaseDelayProjection | null;
  context: ReactNode; reset: () => void;
}) {
  const minimumId = useId()
  const waitingEnabled = delay.waitingEnabled ?? false
  const field = (label: string, path: string, value: number, onChange: (v: number) => void, unit: string, rate = false) =>
    <NumberField label={label} path={path} value={value} onChange={onChange} unit={unit} rate={rate} errors={errors} />
  const pf = (key: keyof IndiaProduct, label: string, unit: string, rate = false) => field(label, key, product[key] ?? 0, v => setProduct({ ...product, [key]: v }), unit, rate)
  const df = (key: Exclude<keyof PurchaseDelay, 'waitingEnabled'>, label: string, unit: string, rate = false) => field(label, `delay.${key}`, delay[key] ?? 0, v => setDelay({ ...delay, [key]: v }), unit, rate)
  const now = projection?.current, later = projection?.delayed
  const rentGrowth = delay.rentGrowth ?? 0
  const upfront = purchaseCharges(product)
  const monthlySavings = now ? Math.max(0, now.capacity.requiredEmi - product.monthlyRent) : 0
  const minimumValid = Number.isFinite(product.price) && product.price > 0 && product.price <= 1e12 && Number.isFinite(product.loanRate) && product.loanRate >= 0 && product.loanRate <= 1 && Number.isFinite(product.termYears) && product.termYears >= 1 / 12 && product.termYears <= 50 && Math.abs(product.termYears * 12 - Math.round(product.termYears * 12)) < 1e-7
  const assumedLoan = .8 * product.price
  const assumedEmi = minimumValid ? mortgagePayment(assumedLoan, product.loanRate, Math.round(product.termYears * 12)) : 0
  const minimumIncome = minimumValid ? minimumTakeHome(assumedLoan, assumedEmi).requiredMonthlyIncome : null
  const rentalInputs = { monthlyRent: product.monthlyRent, rentGrowth, years: delay.years,
    loanAmount: Math.max(0, product.price - household.liquidFunds), loanRate: product.loanRate,
    termYears: product.termYears, investmentReturn: delay.savingsReturn, initialInvestment: household.liquidFunds + upfront }
  const rentErrors = validateRentOnly(rentalInputs)
  const rental = !rentErrors.length && !errors.some(e => !['annualIncome', 'delay.incomeGrowth'].includes(e.path)) ? evaluateRentOnly(rentalInputs) : null
  const loanTermInputs = { ...rentalInputs, years: product.termYears }
  const loanTermRental = !validateRentOnly(loanTermInputs).length && !errors.some(e => !['annualIncome', 'delay.incomeGrowth', 'delay.years', 'appreciation'].includes(e.path)) ? evaluateRentOnly(loanTermInputs) : null
  const extraCost = now && later ? later.capacity.totalPurchaseCost - now.capacity.totalPurchaseCost : 0
  const progress = now && later ? later.capacity.availableCash - now.capacity.availableCash - extraCost : 0
  const rows: { label: string; value: (c: HouseholdCapacity) => ReactNode }[] = [
    { label: 'Purchase funding', value: funding },
    { label: 'Available purchase cash', value: c => money(c.availableCash) },
    { label: 'Required monthly loan payment', value: c => money(c.requiredEmi) },
    { label: 'Required home loan', value: c => money(c.requiredLoan) },
    { label: 'Cash shortfall', value: c => money(c.cashGap) },
    { label: 'Total purchase cost', value: c => money(c.totalPurchaseCost) },
  ]
  const reconciliations = [
    ['Property price', now?.price, later?.price],
    ['Cash towards home price', household.liquidFunds, later ? Math.min(later.price, Math.max(0, later.capacity.availableCash - later.capacity.purchaseCosts)) : undefined],
    ['Upfront purchase charges', now?.capacity.purchaseCosts, later?.capacity.purchaseCosts],
    ['Total purchase cost', now?.capacity.totalPurchaseCost, later?.capacity.totalPurchaseCost],
    ['Required home loan', now?.capacity.requiredLoan, later?.capacity.requiredLoan],
    ['Maximum loan at financed-share limit', now?.capacity.maxLtvLoan, later?.capacity.maxLtvLoan],
    ['Minimum cash at financed-share limit', now?.capacity.minimumUpfrontCash, later?.capacity.minimumUpfrontCash],
  ] as const
  return <section className="compact-buyer" aria-label="Homebuyer calculator">
    <form className="compact-inputs" onSubmit={e => e.preventDefault()}>
      <div className="compact-panel-heading"><h2>Your numbers</h2><div><button className="text-button" type="button" onClick={reset}>Reset</button><a href="#buyer-results">Results ↓</a></div></div>
      <div className="compact-input-grid">
        {field('Home price', 'price', product.price / 1e7, v => setProduct({ ...product, price: v * 1e7 }), '₹ Cr')}
        {pf('monthlyRent', 'Comparable rent', '₹/mo')}
        {df('rentGrowth', 'Annual rent increase', '%/year', true)}
        {field('Down payment', 'liquidFunds', household.liquidFunds / 1e5, v => setHousehold({ ...household, liquidFunds: v * 1e5 }), '₹ lakh')}
        {df('years', waitingEnabled ? 'Waiting period' : 'Rental period', 'years')}
        {pf('appreciation', 'House-price growth', '%/year', true)}
        {df('savingsReturn', 'Investment return', '%/year', true)}
        {pf('loanRate', 'Loan interest', '%/year', true)}
        {pf('termYears', 'Loan term', 'years')}
        <label className="field" htmlFor={minimumId}><span>Minimum take-home needed</span><span className="input-wrap"><input id={minimumId} aria-label="Minimum take-home needed" type="text" readOnly value={minimumIncome === null ? 'Unavailable' : money(minimumIncome)} /></span><small>20% down · EMI ≤40% income · loan ≤4× annual income</small></label>
        <PurchaseChargesField product={product} onChange={setProduct} errors={errors} />
        {waitingEnabled && <>
          {field('Take-home income', 'annualIncome', household.annualIncome / 12e5, v => setHousehold({ ...household, annualIncome: v * 12e5 }), '₹ lakh/mo')}
          {df('incomeGrowth', 'Annual increment', '%/year', true)}
        </>}
      </div>
      <label className="checkbox-field compact-wait-toggle"><input type="checkbox" aria-label="Include waiting period" checked={waitingEnabled} onChange={e => setDelay({ ...delay, waitingEnabled: e.target.checked })} /><span>Include waiting period</span></label>
      <details className="compact-help"><summary>Help with fields</summary><dl>{help.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl></details>
    </form>
    <div id="buyer-results" className="india-results compact-results" tabIndex={-1}>
      {errors.length > 0 && <div className="validation india-validation" role="alert"><strong>Check the highlighted fields</strong><p>Results are withheld until all inputs are valid.</p></div>}
      {projection && now && later && <>
        <section className="compact-mortgage" aria-labelledby="mortgage-heading" aria-live="polite">
          <div className="section-label"><h2 id="mortgage-heading">Your mortgage & savings today</h2><span>Charges paid separately</span></div>
          <dl className="compact-waiting-metrics">
            <div><dt>Mortgage principal</dt><dd>{money(now.capacity.requiredLoan)}</dd><small>Home price − down payment</small></div>
            <div><dt>Monthly mortgage payment</dt><dd>{money(now.capacity.requiredEmi)}</dd><small>{number(product.loanRate * 100)}% interest · {number(product.termYears)} years</small></div>
            <div><dt>Computed monthly savings</dt><dd>{money(monthlySavings)}</dd><small>max(₹0, mortgage payment − rent)</small></div>
            <div><dt>Total upfront cash</dt><dd>{money(household.liquidFunds + upfront)}</dd><small>{money(household.liquidFunds)} down payment + {money(upfront)} charges</small></div>
          </dl>
          <p className="india-note">The mortgage finances the home price after your down payment. Upfront charges are additional cash. Rent-only invests this same starting cash plus the monthly mortgage–rent difference. {waitingEnabled ? 'While waiting to buy, also invest 90% of income increases; rent increases reduce the mortgage–rent savings.' : 'Income growth is included only when waiting is enabled.'}</p>
        </section>
      </>}
      {rental && <RentOnlyResults projection={rental} years={delay.years} rentGrowth={rentGrowth} investmentReturn={delay.savingsReturn} termYears={product.termYears} />}
      {loanTermRental && <RentOnlyResults projection={loanTermRental} years={product.termYears} rentGrowth={rentGrowth} investmentReturn={delay.savingsReturn} termYears={product.termYears} fullLoanTerm />}
      {waitingEnabled && projection && now && later && <>
        <section className="compact-waiting" aria-labelledby="waiting-summary-heading" aria-live="polite" aria-atomic="true">
          <div className="section-label"><h2 id="waiting-summary-heading">{delay.years > 0 ? `After waiting ${number(delay.years)} ${delay.years === 1 ? 'year' : 'years'}` : 'Buying today'}</h2><span>Illustrative scenario · nominal INR</span></div>
          <dl className="compact-waiting-metrics">
            <div><dt>Total savings invested</dt><dd>{familiar(later.savingsContributions)}</dd><small>Mortgage–rent difference + 90% of income increases</small></div>
            <div><dt>Investment {later.investmentGrowth < 0 ? 'losses' : 'gains'}</dt><dd>{familiar(later.investmentGrowth)}</dd></div>
            <div><dt>Extra purchase costs</dt><dd>{familiar(extraCost)}</dd><small>Price change + change in charges</small></div>
            <div><dt>Net purchase progress</dt><dd>{familiar(progress)}</dd><small>{progress < -.5 ? 'Further from covering the purchase' : progress > .5 ? 'More towards covering the purchase' : 'No change in funding margin'}</small></div>
          </dl>
          <p className="india-note">Net progress = savings invested + investment gains or losses − extra purchase costs. Income increases each anniversary; 90% of the increase above today’s income is invested. Projected monthly take-home: <strong>{money(later.annualIncome / 12)}</strong>.</p>
        </section>
        <section className="compact-comparison" aria-labelledby="capacity-comparison-heading"><h2 id="capacity-comparison-heading">Purchase funding</h2>
          <table><caption className="sr-only">Purchase funding today and after waiting</caption><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value(now.capacity)}</td><td>{row.value(later.capacity)}</td></tr>)}</tbody></table>
          <p className="india-note">Funding checks cash and the maximum financed share. Use the separate income-growth check for the monthly-payment budget. A price rise affects both cash and borrowing; it is not entirely an upfront cash requirement.</p>
        </section>
        <PurchaseDelayChart projection={projection} product={product} household={household} delay={delay} presentation="compact" />
        <details className="compact-disclosure"><summary>Loan & purchase reconciliation</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Loan reconciliation"><table><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{reconciliations.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{money(a!)}</td><td>{money(b!)}</td></tr>)}</tbody></table></div></details>
        <IncomeGrowthAssessment mortgage={later.capacity.requiredEmi} loanAmount={later.capacity.requiredLoan} years={delay.years} monthlyIncome={household.annualIncome / 12} projectedIncome={later.annualIncome / 12} />
      </>}
      {rental && <details className="compact-disclosure"><summary>Rental yield & price-growth context</summary><div className="compact-context">{context}</div></details>}
    </div>
  </section>
}
