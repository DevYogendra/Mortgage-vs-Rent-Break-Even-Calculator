import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FieldError, HouseholdCapacity, IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayProjection } from './india'
import NumberField from './IndiaField'
import PurchaseDelayChart from './PurchaseDelayChart'
import { evaluateRentOnly, validateRentOnly } from './rentOnly'
import RentOnlyResults from './RentOnlyResults'
import IncomeGrowthAssessment from './IncomeGrowthAssessment'
import './CompactBuyer.css'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const familiar = (n: number) => Math.abs(n) >= 1e7 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e7)} crore` : Math.abs(n) >= 1e5 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e5)} lakh` : money(n)
const funding = (c: HouseholdCapacity) => c.requiredLoan <= 1e-6 ? 'Cash purchase fits' : c.cashGap <= 1e-6 ? 'Cash + loan share fit' : 'More upfront cash needed'
const help = [
  ['Home price', 'Price before purchase charges. 1 Cr = ₹1 crore = ₹1,00,00,000.'],
  ['Comparable rent', 'Monthly rent for a similar home, used for gross rental yield and the rent-only projection.'],
  ['Annual rent increase', 'The same percentage compounds on each anniversary, starting in month 13. Enter 0% for flat rent. Rent-only invests the starting funds plus the positive mortgage-payment minus rent difference each month.'],
  ['Liquid purchase funds', 'Starting cash and accessible investments. This amount reduces the loan needed to buy, or is invested at the start when you keep renting.'],
  ['Savings', 'A fixed monthly amount saved after rent and living expenses while waiting to buy. This amount stays constant; no income growth is applied. It is excluded from the rent-only projection.'],
  ['Waiting period', 'The period for both waiting to buy and keeping on renting. 0 means today; up to 30 years in whole-month increments, such as 2.5 years.'],
  ['House-price growth', 'Annual compounded property-price change. An editable scenario, not a forecast.'],
  ['Savings return', 'Effective annual return after taxes and fees, converted to (1 + annual rate)^(1/12) − 1 for monthly compounding. Waiting to buy invests starting funds and fixed monthly savings. Rent-only invests starting funds and the positive mortgage–rent difference. Deposits follow each month’s growth.'],
  ['Loan interest', 'Annual home-loan rate, with interest calculated monthly for the EMI.'],
  ['Loan term', 'Loan duration starting at purchase, up to 50 years in whole-month increments.'],
  ['Maximum financed share', 'Maximum loan as a percentage of the property price; purchase charges cannot be financed.'],
  ['Upfront purchase charges', 'Stamp duty, registration, and other purchase costs, paid from cash separately from the property price.'],
]

export default function CompactBuyer({ product, setProduct, household, setHousehold, delay, setDelay, errors, projection, context, reset }: {
  product: IndiaProduct; setProduct: (p: IndiaProduct) => void;
  household: IndiaHousehold; setHousehold: (h: IndiaHousehold) => void;
  delay: PurchaseDelay; setDelay: (d: PurchaseDelay) => void;
  errors: FieldError[]; projection: PurchaseDelayProjection | null;
  context: ReactNode; reset: () => void;
}) {
  const [rentGrowth, setRentGrowth] = useState(.03)
  const monthlySavings = delay.monthlySavings ?? household.annualIncome * household.savingsRate / 12
  const field = (label: string, path: string, value: number, onChange: (v: number) => void, unit: string, rate = false) =>
    <NumberField label={label} path={path} value={value} onChange={onChange} unit={unit} rate={rate} errors={errors} />
  const pf = (key: keyof IndiaProduct, label: string, unit: string, rate = false) => field(label, key, product[key], v => setProduct({ ...product, [key]: v }), unit, rate)
  const df = (key: keyof PurchaseDelay, label: string, unit: string, rate = false) => field(label, `delay.${key}`, delay[key] ?? 0, v => setDelay({ ...delay, [key]: v }), unit, rate)
  const now = projection?.current, later = projection?.delayed
  const rentalInputs = { monthlyRent: product.monthlyRent, rentGrowth, years: delay.years,
    loanAmount: now?.capacity.requiredLoan ?? 0, loanRate: product.loanRate,
    termYears: product.termYears, investmentReturn: delay.savingsReturn, initialInvestment: household.liquidFunds }
  const rentErrors = validateRentOnly(rentalInputs)
  const rental = projection && !rentErrors.length ? evaluateRentOnly(rentalInputs) : null
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
    ['Upfront purchase charges', now?.capacity.purchaseCosts, later?.capacity.purchaseCosts],
    ['Total purchase cost', now?.capacity.totalPurchaseCost, later?.capacity.totalPurchaseCost],
    ['Required home loan', now?.capacity.requiredLoan, later?.capacity.requiredLoan],
    ['Maximum loan at financed-share limit', now?.capacity.maxLtvLoan, later?.capacity.maxLtvLoan],
    ['Minimum cash at financed-share limit', now?.capacity.minimumUpfrontCash, later?.capacity.minimumUpfrontCash],
  ] as const
  const summaryValid = Number.isFinite(monthlySavings) && monthlySavings >= 0 && monthlySavings <= 1e12
  return <section className="compact-buyer" aria-label="Homebuyer calculator">
    <form className="compact-inputs" onSubmit={e => e.preventDefault()}>
      <div className="compact-panel-heading"><h2>Your numbers</h2><div><button className="text-button" type="button" onClick={reset}>Reset</button><a href="#buyer-results">Results ↓</a></div></div>
      <div className="compact-input-grid">
        {field('Home price', 'price', product.price / 1e7, v => setProduct({ ...product, price: v * 1e7 }), '₹ Cr')}
        {pf('monthlyRent', 'Comparable rent', '₹/mo')}
        <NumberField label="Annual rent increase" path="rentGrowth" value={rentGrowth} onChange={setRentGrowth} unit="%/year" rate errors={rentErrors} />
        {field('Liquid purchase funds', 'liquidFunds', household.liquidFunds / 1e5, v => setHousehold({ ...household, liquidFunds: v * 1e5 }), '₹ lakh')}
        {df('monthlySavings', 'Savings', '₹/mo')}
        {df('years', 'Waiting period', 'years')}
        {pf('appreciation', 'House-price growth', '%/year', true)}
        {df('savingsReturn', 'Savings return', '%/year', true)}
        {pf('loanRate', 'Loan interest', '%/year', true)}
        {pf('termYears', 'Loan term', 'years')}
        {pf('maxLtv', 'Maximum financed share', '%', true)}
        {pf('purchaseCostRate', 'Upfront purchase charges', '%', true)}
      </div>
      <p className="compact-savings-summary" aria-live="polite">{summaryValid ? <>{money(monthlySavings)}/month = {familiar(monthlySavings * 12)}/year saved while waiting to buy. Fixed amount; excluded from rent-only investments.</> : 'Enter valid monthly savings to see your savings summary.'}</p>
      <details className="compact-help"><summary>Help with fields</summary><dl>{help.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl></details>
    </form>
    <div id="buyer-results" className="india-results compact-results" tabIndex={-1}>
      {errors.length > 0 && <div className="validation india-validation" role="alert"><strong>Check the highlighted fields</strong><p>Results are withheld until all inputs are valid.</p></div>}
      {projection && now && later && <>
        <section className="compact-waiting" aria-labelledby="waiting-summary-heading" aria-live="polite" aria-atomic="true">
          <div className="section-label"><h2 id="waiting-summary-heading">{delay.years > 0 ? `After waiting ${number(delay.years)} ${delay.years === 1 ? 'year' : 'years'}` : 'Buying today'}</h2><span>Illustrative scenario · nominal INR</span></div>
          <dl className="compact-waiting-metrics">
            <div><dt>New savings from income</dt><dd>{familiar(later.savingsContributions)}</dd></div>
            <div><dt>Investment {later.investmentGrowth < 0 ? 'losses' : 'gains'}</dt><dd>{familiar(later.investmentGrowth)}</dd></div>
            <div><dt>Extra purchase costs</dt><dd>{familiar(extraCost)}</dd><small>Price change + change in charges</small></div>
            <div><dt>Net purchase progress</dt><dd>{familiar(progress)}</dd><small>{progress < -.5 ? 'Further from covering the purchase' : progress > .5 ? 'More towards covering the purchase' : 'No change in funding margin'}</small></div>
          </dl>
          <p className="india-note">Net progress = savings + investment gains or losses − extra purchase costs. These savings are after rent and living expenses.</p>
        </section>
        <section className="compact-comparison" aria-labelledby="capacity-comparison-heading"><h2 id="capacity-comparison-heading">Purchase funding</h2>
          <table><caption className="sr-only">Purchase funding today and after waiting</caption><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value(now.capacity)}</td><td>{row.value(later.capacity)}</td></tr>)}</tbody></table>
          <p className="india-note">Funding checks cash and the maximum financed share. Use the separate income-growth check for the monthly-payment budget. A price rise affects both cash and borrowing; it is not entirely an upfront cash requirement.</p>
        </section>
        {rental ? <RentOnlyResults projection={rental} years={delay.years} rentGrowth={rentGrowth} investmentReturn={delay.savingsReturn} termYears={product.termYears} /> : <div className="validation india-validation" role="alert"><strong>Check the annual rent increase</strong><p>Rent-only results are withheld until the rental inputs are valid.</p></div>}
        <PurchaseDelayChart projection={projection} product={product} household={household} delay={delay} presentation="compact" />
        <details className="compact-disclosure"><summary>Loan & purchase reconciliation</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Loan reconciliation"><table><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{reconciliations.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{money(a!)}</td><td>{money(b!)}</td></tr>)}</tbody></table></div></details>
        <IncomeGrowthAssessment mortgage={later.capacity.requiredEmi} years={delay.years} />
        <details className="compact-disclosure"><summary>Rental yield & price-growth context</summary><div className="compact-context">{context}</div></details>
      </>}
    </div>
  </section>
}
