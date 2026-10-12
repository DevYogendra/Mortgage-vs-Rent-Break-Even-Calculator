import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { FieldError, HouseholdCapacity, IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayProjection } from './india'
import NumberField from './IndiaField'
import PurchaseDelayChart from './PurchaseDelayChart'
import './CompactBuyer.css'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const familiar = (n: number) => Math.abs(n) >= 1e7 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e7)} crore` : Math.abs(n) >= 1e5 ? `${n < 0 ? '−' : ''}₹${number(Math.abs(n) / 1e5)} lakh` : money(n)
const tier = (c: HouseholdCapacity) => c.tier === 1 ? 'Cash purchase fits' : c.tier === 2 ? 'Cash + loan fit' : 'Beyond this budget'
const tierNames = { 1: 'Wealth-backed', 2: 'Income-backed', 3: 'Affordability-constrained' }
const reasons = { 'cash-ltv': 'Upfront cash / loan-to-value limit', emi: 'EMI exceeds available budget', need: 'No housing need', desire: 'No desire to own', credit: 'No access to credit', willingness: 'Not willing to buy today' }
const help = [
  ['Home price', 'Price before purchase charges. 1 Cr = ₹1 crore = ₹1,00,00,000.'],
  ['Comparable rent', 'Monthly rent for a similar home, used for gross rental yield.'],
  ['Take-home income', 'Combined household income after tax. 1 lakh = ₹1,00,000.'],
  ['Liquid purchase funds', 'Cash and accessible investments you can use for this purchase.'],
  ['Protected reserve', 'Emergency money kept untouched, excluded from purchase funds and investment returns.'],
  ['Existing loan payments', 'Monthly payments on your other loans, deducted from the total loan-payment budget.'],
  ['Savings', 'New income set aside after rent and living expenses. Choose a monthly amount or a share of income. Amount mode keeps the amount when income changes; percentage mode keeps the share. During waiting, this initial share grows with income. Avoided home-loan payments are not added again.'],
  ['Waiting period', '0 means buying today; up to 30 years in whole-month increments, such as 2.5 years.'],
  ['House-price growth', 'Annual compounded property-price change. An editable scenario, not a forecast.'],
  ['Savings return', 'Effective annual return after taxes and fees, converted to (1 + annual rate)^(1/12) − 1 for monthly compounding. Returns apply to available starting cash and monthly deposits; deposits are made after each month’s growth.'],
  ['Income growth', 'Annual income change on each anniversary; the savings share stays constant in the projection.'],
  ['Loan interest', 'Annual home-loan rate, with interest calculated monthly for the EMI.'],
  ['Loan term', 'Loan duration starting at purchase, up to 50 years in whole-month increments.'],
  ['Maximum financed share', 'Maximum loan as a percentage of the property price; purchase charges cannot be financed.'],
  ['Total loan-payment limit', 'Maximum share of monthly take-home income for all loan payments together.'],
  ['Upfront purchase charges', 'Stamp duty, registration, and other purchase costs, paid from cash separately from the property price.'],
]

export default function CompactBuyer({ product, setProduct, household, setHousehold, delay, setDelay, errors, projection, gates, context, reset }: {
  product: IndiaProduct; setProduct: (p: IndiaProduct) => void;
  household: IndiaHousehold; setHousehold: (h: IndiaHousehold) => void;
  delay: PurchaseDelay; setDelay: (d: PurchaseDelay) => void;
  errors: FieldError[]; projection: PurchaseDelayProjection | null;
  gates: ReactNode; context: ReactNode; reset: () => void;
}) {
  const [savingsUnit, setSavingsUnit] = useState('amount')
  const [amountDraft, setAmountDraft] = useState<number | null>(null)
  const savingsId = useId()
  const income = household.annualIncome / 12
  const monthlySavings = savingsUnit === 'amount' ? amountDraft ?? income * household.savingsRate : income * household.savingsRate
  const savingsError = errors.find(e => e.path === 'savingsRate')
  function setIncome(value: number) {
    const monthly = value * 1e5
    if (monthly === 0) {
      setAmountDraft(0)
      setHousehold({ ...household, annualIncome: 0, savingsRate: 0 })
    } else if (savingsUnit === 'amount') {
      setAmountDraft(monthlySavings)
      setHousehold({ ...household, annualIncome: monthly * 12, savingsRate: monthly > 0 ? monthlySavings / monthly : NaN })
    } else setHousehold({ ...household, annualIncome: monthly * 12 })
  }
  const field = (label: string, path: string, value: number, onChange: (v: number) => void, unit: string, rate = false) =>
    <NumberField label={label} path={path} value={value} onChange={onChange} unit={unit} rate={rate} errors={errors} />
  const pf = (key: keyof IndiaProduct, label: string, unit: string, rate = false) => field(label, key, product[key], v => setProduct({ ...product, [key]: v }), unit, rate)
  const df = (key: keyof PurchaseDelay, label: string, unit: string, rate = false) => field(label, `delay.${key}`, delay[key], v => setDelay({ ...delay, [key]: v }), unit, rate)
  const now = projection?.current, later = projection?.delayed
  const extraCost = now && later ? later.capacity.totalPurchaseCost - now.capacity.totalPurchaseCost : 0
  const progress = now && later ? later.capacity.availableCash - now.capacity.availableCash - extraCost : 0
  const rows: { label: string; value: (c: HouseholdCapacity) => ReactNode }[] = [
    { label: 'Purchase capacity', value: tier },
    { label: 'Available purchase cash', value: c => money(c.availableCash) },
    { label: 'Required monthly loan payment', value: c => money(c.requiredEmi) },
    { label: 'Maximum affordable price', value: c => familiar(c.maxAffordablePrice) },
    { label: 'Cash shortfall', value: c => money(c.cashGap) },
    { label: 'Monthly-payment shortfall', value: c => money(c.emiGap) },
  ]
  const reconciliations = [
    ['Property price', now?.price, later?.price],
    ['Upfront purchase charges', now?.capacity.purchaseCosts, later?.capacity.purchaseCosts],
    ['Total purchase cost', now?.capacity.totalPurchaseCost, later?.capacity.totalPurchaseCost],
    ['Required home loan', now?.capacity.requiredLoan, later?.capacity.requiredLoan],
    ['Maximum loan at financed-share limit', now?.capacity.maxLtvLoan, later?.capacity.maxLtvLoan],
    ['Minimum cash at financed-share limit', now?.capacity.minimumUpfrontCash, later?.capacity.minimumUpfrontCash],
    ['Available monthly loan-payment budget', now?.capacity.emiBudget, later?.capacity.emiBudget],
  ] as const
  const summaryValid = Number.isFinite(monthlySavings) && Number.isFinite(income) && income >= 0 && monthlySavings >= 0 && monthlySavings <= income
  const displayedSavings = savingsUnit === 'amount' ? monthlySavings : household.savingsRate * 100
  return <section className="compact-buyer" aria-label="Homebuyer calculator">
    <form className="compact-inputs" onSubmit={e => e.preventDefault()}>
      <div className="compact-panel-heading"><h2>Your numbers</h2><div><button className="text-button" type="button" onClick={reset}>Reset</button><a href="#buyer-results">Results ↓</a></div></div>
      <div className="compact-input-grid">
        {field('Home price', 'price', product.price / 1e7, v => setProduct({ ...product, price: v * 1e7 }), '₹ Cr')}
        {pf('monthlyRent', 'Comparable rent', '₹/mo')}
        {field('Take-home income', 'annualIncome', income / 1e5, setIncome, '₹ lakh/mo')}
        {field('Liquid purchase funds', 'liquidFunds', household.liquidFunds / 1e5, v => setHousehold({ ...household, liquidFunds: v * 1e5 }), '₹ lakh')}
        {field('Protected reserve', 'reserve', household.reserve / 1e5, v => setHousehold({ ...household, reserve: v * 1e5 }), '₹ lakh')}
        {field('Existing loan payments', 'existingEmi', household.existingEmi, v => setHousehold({ ...household, existingEmi: v }), '₹/mo')}
        <div className="field compact-savings"><label htmlFor={savingsId}>Savings</label><div className="input-wrap">
          <input id={savingsId} aria-label="Savings" type="number" step="any" disabled={savingsUnit === 'percent' && !(income > 0)} value={Number.isFinite(displayedSavings) ? Number(displayedSavings.toFixed(8)) : ''} aria-invalid={!!savingsError} aria-describedby={savingsError ? `${savingsId}-error` : undefined} onChange={e => {
            const v = e.target.value === '' ? NaN : Number(e.target.value)
            if (savingsUnit === 'amount') { setAmountDraft(v); setHousehold({ ...household, savingsRate: income > 0 ? v / income : v === 0 ? 0 : NaN }) }
            else setHousehold({ ...household, savingsRate: v / 100 })
          }} />
          <select aria-label="Savings unit" value={savingsUnit} onChange={e => { setAmountDraft(monthlySavings); setSavingsUnit(e.target.value) }}><option value="amount">₹/month</option><option value="percent">% income</option></select>
        </div>{savingsError && <small id={`${savingsId}-error`} className="india-field-error">{savingsUnit === 'amount' ? 'Enter savings from ₹0 to your monthly income.' : 'Enter a savings share from 0% to 100%.'}</small>}</div>
        {df('years', 'Waiting period', 'years')}
        {pf('appreciation', 'House-price growth', '%/year', true)}
        {df('savingsReturn', 'Savings return', '%/year', true)}
        {df('incomeGrowth', 'Income growth', '%/year', true)}
        {pf('loanRate', 'Loan interest', '%/year', true)}
        {pf('termYears', 'Loan term', 'years')}
        {pf('maxLtv', 'Maximum financed share', '%', true)}
        {pf('maxEmiShare', 'Total loan-payment limit', '% income', true)}
        {pf('purchaseCostRate', 'Upfront purchase charges', '%', true)}
      </div>
      <p className="compact-savings-summary" aria-live="polite">{income === 0 && summaryValid ? 'With zero income, new savings from income are ₹0.' : summaryValid ? <>{money(monthlySavings)}/month = {number(household.savingsRate * 100)}% of income = {familiar(monthlySavings * 12)}/year.</> : 'Enter valid income and savings to see your savings summary.'}</p>
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
        <section className="compact-comparison" aria-labelledby="capacity-comparison-heading"><h2 id="capacity-comparison-heading">Purchase capacity</h2>
          <table><caption className="sr-only">Purchasing capacity today and after waiting</caption><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value(now.capacity)}</td><td>{row.value(later.capacity)}</td></tr>)}</tbody></table>
          <p className="india-note">Maximum price excludes purchase charges. Shortfalls of ₹0 mean that limit is met. A price rise affects both cash and borrowing; it is not entirely an upfront cash requirement.</p>
        </section>
        <PurchaseDelayChart projection={projection} product={product} household={household} delay={delay} presentation="compact" />
        <details className="compact-disclosure"><summary>Loan & purchase reconciliation</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Loan reconciliation"><table><thead><tr><th scope="col">Measure</th><th scope="col">Today</th><th scope="col">After waiting</th></tr></thead><tbody>{reconciliations.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{money(a!)}</td><td>{money(b!)}</td></tr>)}</tbody></table></div></details>
        <details className="compact-disclosure"><summary>Buyer tiers & buying intentions</summary><div className="compact-tier-status"><p>Today: <strong>Tier {now.capacity.tier} · {tierNames[now.capacity.tier]}</strong> · Effective demand: {now.capacity.effectiveDemand ? 'Yes' : 'No'}</p><p>After waiting: <strong>Tier {later.capacity.tier} · {tierNames[later.capacity.tier]}</strong> · Effective demand: {later.capacity.effectiveDemand ? 'Yes' : 'No'}</p><p className="india-note">Financial capacity is separate from need, desire, credit access and willingness. Cash buyers do not require credit access.</p>{now.capacity.exclusions.length > 0 && <p className="india-note">Today: {now.capacity.exclusions.map(r => reasons[r]).join(' · ')}</p>}{later.capacity.exclusions.length > 0 && <p className="india-note">After waiting: {later.capacity.exclusions.map(r => reasons[r]).join(' · ')}</p>}{gates}</div></details>
        <details className="compact-disclosure"><summary>Rental yield & price-growth context</summary><div className="compact-context">{context}</div></details>
      </>}
    </div>
  </section>
}
