import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  evaluateDemand, evaluatePurchaseDelay, indiaHouseholdDefaults, indiaProductDefaults,
  indiaSegmentDefaults, priceCapacityCurve, purchaseDelayDefaults, validateProduct, validatePurchaseDelay, validateSegments,
} from './india'
import type {
  DemandResult, Exclusion, FieldError, HouseholdCapacity, HouseholdSegment,
  IndiaHousehold, IndiaProduct, PriceCapacityPoint, PurchaseDelay, PurchaseDelayProjection,
} from './india'
import './App.css'
import './IndiaApp.css'
import PurchaseDelayChart from './PurchaseDelayChart'
import ThemeSelector from './ThemeSelector'
import NumberField from './IndiaField'
import BeginnerBuyer from './BeginnerBuyer'
import type { BuyerGoal } from './BeginnerBuyer'

export type IndiaPage = 'buyer' | 'market' | 'builders'
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const pct = (n: number | null) => n === null ? 'Unavailable' : `${number(n * 100)}%`
const shortMoney = (n: number) => Math.abs(n) >= 1e7 ? `₹${number(n / 1e7)} cr` : Math.abs(n) >= 1e5 ? `₹${number(n / 1e5)} L` : money(n)
const tierNames = { 1: 'Wealth-backed', 2: 'Income-backed', 3: 'Affordability-constrained' }
const pageInfo = {
  buyer: { title: 'Homebuyer capacity', description: 'Check your purchasing capacity, EMI requirements, and the income cost of rising prices.', href: '/india' },
  market: { title: 'Price vs buyer capacity', description: 'Explore how product price changes the financially capable and effective buyer pools.', href: '/india/market' },
  builders: { title: 'Builder / sales demand', description: 'Count the households that can purchase this product, with this financing, today.', href: '/india/builders' },
}
const gateLabels = { need: 'Housing need', desire: 'Desire to own', creditAccess: 'Access to credit', willingness: 'Willing to buy today' }
const reasonLabels: Record<Exclusion, string> = {
  'cash-ltv': 'Upfront cash / loan-to-value limit', emi: 'EMI exceeds available budget',
  need: 'No housing need', desire: 'No desire to own', credit: 'No access to credit', willingness: 'Not willing to buy today',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="india-input-section"><h2>{title}</h2>{children}</section>
}
function ProductInputs({ product, setProduct, errors, children, financingOnly = false }: {
  product: IndiaProduct; setProduct: (p: IndiaProduct) => void; errors: FieldError[]; children?: ReactNode; financingOnly?: boolean;
}) {
  const field = (key: keyof IndiaProduct, label: string, rate = false, unit = '₹', hint?: string) =>
    <NumberField path={key} label={label} value={product[key]} onChange={value => setProduct({ ...product, [key]: value })} rate={rate} unit={unit} errors={errors} hint={hint} />
  return <>{!financingOnly && <Section title="Property">
    <NumberField path="price" label="Property price" value={product.price / 1e7} onChange={value => setProduct({ ...product, price: value * 1e7 })} unit="₹ Cr" errors={errors} hint="Enter the price in crore. 1.5 Cr = ₹1,50,00,000." />
    {field('monthlyRent', 'Comparable monthly rent')}
    {field('appreciation', 'Annual property appreciation', true)}
  </Section>}{children}<details className="india-input-section india-financing" open><summary>Financing & purchase costs</summary><div className="india-detail-fields">
    {field('purchaseCostRate', 'Upfront purchase costs', true, '%', 'Stamp duty, registration, and other nonrecoverable costs. Paid from cash, outside the financed property value.')}
    <div className="field-row">{field('loanRate', 'Home-loan interest rate', true)}{field('termYears', 'Loan term', false, 'years')}</div>
    {field('maxLtv', 'Maximum loan-to-value', true, '%', 'Editable financing assumption, not a lender eligibility determination.')}
    {field('maxEmiShare', 'Maximum total EMI share of income', true, '%', 'All loan EMIs combined, as a share of after-tax income.')}
  </div></details></>
}
function Gates({ household, onChange, suffix = '' }: { household: IndiaHousehold; onChange: (h: IndiaHousehold) => void; suffix?: string }) {
  return <div className="india-gates">{(Object.keys(gateLabels) as (keyof typeof gateLabels)[]).map(key =>
    <label className="checkbox-field" key={key}><input type="checkbox" checked={household[key]} aria-label={`${gateLabels[key]}${suffix}`} onChange={e => onChange({ ...household, [key]: e.target.checked })} /><span>{gateLabels[key]}</span></label>,
  )}</div>
}
function HouseholdInputs({ household, setHousehold, errors }: {
  household: IndiaHousehold; setHousehold: (h: IndiaHousehold) => void; errors: FieldError[];
}) {
  const field = (key: 'annualIncome' | 'liquidFunds' | 'reserve' | 'existingEmi' | 'savingsRate', label: string, rate = false, hint?: string) =>
    <NumberField path={key} label={label} value={household[key]} onChange={value => setHousehold({ ...household, [key]: value })} rate={rate} errors={errors} hint={hint} />
  return <><Section title="Your household">
    {field('annualIncome', 'Annual after-tax income')}{field('liquidFunds', 'Liquid purchase funds')}
    {field('reserve', 'Protected cash reserve', false, 'Kept aside and unavailable for this purchase.')}
    {field('existingEmi', 'Existing monthly EMIs')}
    {field('savingsRate', 'Annual savings share of income', true, 'Savings after rent and living expenses. Added to purchase funds while waiting; not deducted from the EMI budget.')}
  </Section><Section title="Effective-demand factors"><Gates household={household} onChange={setHousehold} /></Section></>
}
function PurchaseTimingInputs({ delay, setDelay, errors, advancedOnly = false, hideSavingsReturn = false }: {
  delay: PurchaseDelay; setDelay: (d: PurchaseDelay) => void; errors: FieldError[]; advancedOnly?: boolean; hideSavingsReturn?: boolean;
}) {
  const field = (key: keyof PurchaseDelay, label: string, rate: boolean, hint: string) =>
    <NumberField path={`delay.${key}`} label={label} value={delay[key]} rate={rate} unit={rate ? '%' : 'years'}
      onChange={value => setDelay({ ...delay, [key]: value })} errors={errors} hint={hint} />
  return <Section title="Purchase timing">
    {!advancedOnly && field('years', 'Years before purchase', false, '0 means buy now. Up to 30 years; half-years are supported.')}
    {field('incomeGrowth', 'Annual after-tax income growth', true, 'Income and savings rise on each anniversary. 0% keeps income unchanged.')}
    {!hideSavingsReturn && field('savingsReturn', 'Annual savings return', true, 'Annual effective return after taxes and fees on available purchase funds and new savings. The annual rate is converted for monthly compounding. 0% excludes returns.')}
  </Section>
}
function Metric({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="india-metric"><dt>{label}</dt><dd>{value}</dd>{note && <small>{note}</small>}</div>
}
function HouseholdResults({ product, household, delay, capacity: c, projection }: {
  product: IndiaProduct; household: IndiaHousehold; delay: PurchaseDelay; capacity: HouseholdCapacity; projection: PurchaseDelayProjection;
}) {
  return <>
    <section className="india-result" aria-labelledby="capacity-heading"><p className="eyebrow">PURCHASING CAPACITY TODAY AT {shortMoney(product.price)}</p>
      <h2 id="capacity-heading">Tier {c.tier} <span>{tierNames[c.tier]}</span></h2>
      <p className="india-result-text">{c.tier === 1 ? 'Your available cash covers the property and upfront purchase costs.' : c.tier === 2 ? 'Your cash and EMI budget support the purchase under these financing assumptions.' : 'This property exceeds your cash or EMI capacity under these financing assumptions.'}</p>
      <div className="india-demand-status"><strong>{c.effectiveDemand ? 'Effective demand: Yes' : 'Effective demand: No'}</strong><span>{c.effectiveDemand ? 'Capacity and all applicable demand factors are met.' : c.exclusions.map(reason => reasonLabels[reason]).join(' · ')}</span></div>
    </section>
    <section className="india-section"><div className="section-label"><h2>Purchase & borrowing</h2><span>Nominal INR · today’s assumptions</span></div>
      <dl className="india-metrics">
        <Metric label="Available purchase cash" value={money(c.availableCash)} note="Liquid funds less protected reserve" />
        <Metric label="Required home loan" value={money(c.requiredLoan)} note={`${money(c.purchaseCosts)} upfront costs included in cash requirement`} />
        <Metric label="Required monthly EMI" value={money(c.requiredEmi)} note={`Available EMI budget: ${money(c.emiBudget)}`} />
        <Metric label="Maximum affordable price" value={money(c.maxAffordablePrice)} note="Before purchase costs; cash and EMI limits together" />
      </dl>
      <dl className="india-reconciliation">
        <div><dt>Total purchase cost</dt><dd>{money(c.totalPurchaseCost)}</dd></div>
        <div><dt>Maximum loan at entered LTV</dt><dd>{money(c.maxLtvLoan)}</dd></div>
        <div><dt>Minimum cash at maximum LTV</dt><dd>{money(c.minimumUpfrontCash)}</dd></div>
        <div><dt>Upfront cash shortfall / loan above LTV limit</dt><dd>{money(c.cashGap)}</dd></div>
        <div><dt>Monthly EMI shortfall</dt><dd>{money(c.emiGap)}</dd></div>
      </dl>
      <p className="india-note">Cash and EMI capacity define the tier. Credit access and willingness determine whether that capacity becomes effective demand. Recurring ownership costs are outside this EMI check.</p>
    </section>
    <PurchaseDelayResults projection={projection} product={product} household={household} delay={delay} />
    <section className="india-section india-growth"><div className="section-label"><h2>The income cost of rising prices</h2><span>One-year change</span></div>
      <p className="india-insight">{c.incomeMultiple === null ? 'Enter a positive income to compare the property price with annual income.' : <>This home costs <strong>{number(c.incomeMultiple)}×</strong> your annual after-tax income.</>}</p>
      <dl className="india-metrics"><Metric label={`${pct(product.appreciation)} property-price change`} value={money(c.appreciationAmount)} note={`${pct(c.appreciationIncomeShare)} of annual income`} />
        <Metric label="Your annual savings" value={money(c.annualSavings)} note={c.appreciationSavingsShare === null ? 'Savings comparison unavailable' : `Price change = ${pct(c.appreciationSavingsShare)} of savings`} /></dl>
      <div className="table-scroll" role="region" aria-label="Appreciation burden comparison" tabIndex={0}><table className="india-growth-table"><caption>Property-price growth relative to your income and savings</caption><thead><tr><th scope="col">Price rise</th><th scope="col">Extra purchase price</th><th scope="col">Annual income</th><th scope="col">Annual savings</th></tr></thead><tbody>{[.01, .04, .05].map(rate => <tr key={rate}><th scope="row">{pct(rate)}</th><td>{money(product.price * rate)}</td><td>{pct(household.annualIncome > 0 ? product.price * rate / household.annualIncome : null)}</td><td>{pct(c.annualSavings > 0 ? product.price * rate / c.annualSavings : null)}</td></tr>)}</tbody></table></div>
      <p className="india-note">A price increase raises the total purchase amount. It is not all extra upfront cash: the cash and EMI effects depend on your financing. This table shows a one-year change at today’s price; the purchase-delay comparison above models waiting.</p>
    </section>
    <YieldInsight product={product} />
  </>
}
function PurchaseDelayResults({ projection, product, household, delay }: { projection: PurchaseDelayProjection; product: IndiaProduct; household: IndiaHousehold; delay: PurchaseDelay }) {
  const { current, delayed, timeline } = projection
  const now = current.capacity, later = delayed.capacity
  const horizon = `${number(delayed.years)} ${delayed.years === 1 ? 'year' : 'years'}`
  const rows: { label: string; now: ReactNode; later: ReactNode }[] = [
    { label: 'Property price', now: money(current.price), later: money(delayed.price) },
    { label: 'Annual after-tax income', now: money(current.annualIncome), later: money(delayed.annualIncome) },
    { label: 'Available purchase cash', now: money(now.availableCash), later: money(later.availableCash) },
    { label: 'Upfront purchase costs', now: money(now.purchaseCosts), later: money(later.purchaseCosts) },
    { label: 'Minimum cash at maximum LTV', now: money(now.minimumUpfrontCash), later: money(later.minimumUpfrontCash) },
    { label: 'Required home loan', now: money(now.requiredLoan), later: money(later.requiredLoan) },
    { label: 'Required monthly EMI', now: money(now.requiredEmi), later: money(later.requiredEmi) },
    { label: 'Available monthly EMI budget', now: money(now.emiBudget), later: money(later.emiBudget) },
    { label: 'Upfront cash shortfall', now: money(now.cashGap), later: money(later.cashGap) },
    { label: 'Monthly EMI shortfall', now: money(now.emiGap), later: money(later.emiGap) },
    { label: 'Maximum affordable property price', now: money(now.maxAffordablePrice), later: money(later.maxAffordablePrice) },
    { label: 'Financial tier', now: `Tier ${now.tier} · ${tierNames[now.tier]}`, later: `Tier ${later.tier} · ${tierNames[later.tier]}` },
    { label: 'Effective demand under selected factors', now: now.effectiveDemand ? 'Yes' : 'No', later: later.effectiveDemand ? 'Yes' : 'No' },
  ]
  return <section className="india-section india-delay" aria-labelledby="delay-heading"><div className="section-label"><h2 id="delay-heading">Buying now vs waiting</h2><span>{delayed.years > 0 ? `Purchase after ${horizon}` : 'Purchase delay: 0 years'}</span></div>
    {delayed.years === 0 ? <p className="india-note">Set “Years before purchase” in your assumptions to compare future prices, accumulated savings, and purchasing capacity.</p> : <>
      <p className="india-delay-answer" role="status">After {horizon}: <strong>Tier {later.tier} · {tierNames[later.tier]}</strong>. {later.exclusions.length ? later.exclusions.map(reason => reasonLabels[reason]).join(' · ') : 'Capacity and all applicable demand factors are met.'}</p>
      <dl className="india-metrics">
        <Metric label="Property price after waiting" value={money(delayed.price)} note={`${money(delayed.price - current.price)} change from today`} />
        <Metric label="Purchase cash after waiting" value={money(later.availableCash)} note="Protected reserve kept aside" />
        <Metric label="Savings added while waiting" value={money(delayed.savingsContributions)} note={`Investment gain / loss: ${money(delayed.investmentGrowth)}`} />
        <Metric label="Total purchase-cost change" value={money(later.totalPurchaseCost - now.totalPurchaseCost)} note="Property price + upfront purchase costs" />
      </dl>
      <p className="india-note">Available purchase cash changes by {money(later.availableCash - now.availableCash)}; the complete purchase cost changes by {money(later.totalPurchaseCost - now.totalPurchaseCost)}. The required loan changes by {money(later.requiredLoan - now.requiredLoan)}.</p>
      <PurchaseDelayChart projection={projection} product={product} household={household} delay={delay} />
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Buy now versus delayed purchase"><table className="india-delay-comparison"><caption>Purchasing capacity now and after {horizon}</caption><thead><tr><th scope="col">Measure</th><th scope="col">Buy now</th><th scope="col">After {horizon}</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.now}</td><td>{row.later}</td></tr>)}</tbody></table></div>
      <details className="india-delay-timeline"><summary>Year-by-year affordability</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Purchase delay timeline"><table><caption>Annual checkpoints and the final purchase date. Scroll horizontally to inspect cash and EMI gaps.</caption><thead><tr><th scope="col">Years waited</th><th scope="col">Property price</th><th scope="col">Available cash</th><th scope="col">Annual income</th><th scope="col">Required EMI</th><th scope="col">EMI budget</th><th scope="col">Cash gap</th><th scope="col">EMI gap</th><th scope="col">Tier</th></tr></thead><tbody>{timeline.map(point => <tr key={point.years}><th scope="row">{number(point.years)}</th><td>{money(point.price)}</td><td>{money(point.capacity.availableCash)}</td><td>{money(point.annualIncome)}</td><td>{money(point.capacity.requiredEmi)}</td><td>{money(point.capacity.emiBudget)}</td><td>{money(point.capacity.cashGap)}</td><td>{money(point.capacity.emiGap)}</td><td>Tier {point.capacity.tier}</td></tr>)}</tbody></table></div></details>
      <p className="india-note">Price compounds at your annual appreciation assumption. Income changes on anniversaries; savings are deposited monthly after investment growth. The savings share is after rent and living expenses, so rent is not deducted again. The protected reserve, existing EMIs, loan rate, loan term from purchase, purchase-cost percentage, and demand factors stay fixed. This is a purchase-capacity projection, not a buy-now versus rent-and-invest wealth comparison.</p>
    </>}
  </section>
}
function YieldInsight({ product }: { product: IndiaProduct }) {
  return <section className="india-yield"><div><p className="eyebrow">GROSS RENTAL YIELD</p><strong>{pct(12 * product.monthlyRent / product.price)}</strong></div><p>Annual comparable rent ÷ property price. A low yield can make renting attractive, but this ratio alone does not establish whether buying or renting builds more wealth.</p></section>
}
function DemandResults({ demand, product }: { demand: DemandResult; product: IndiaProduct }) {
  return <><section className="india-result" aria-labelledby="demand-heading"><p className="eyebrow">EFFECTIVE BUYER POOL AT {shortMoney(product.price)}</p><h2 id="demand-heading">{number(demand.effective)} <span>households</span></h2><p className="india-result-text">Of {number(demand.total)} entered households, {number(demand.capable)} have financial capacity and {number(demand.effective)} meet all applicable demand factors.</p></section>
    <dl className="india-metrics india-pool-metrics"><Metric label="Financially capable" value={number(demand.capable)} note="Tier 1 + Tier 2" /><Metric label="Effective demand" value={number(demand.effective)} note="Capacity + applicable demand factors" /><Metric label="Capacity without effective demand" value={number(demand.capable - demand.effective)} note="Need, desire, credit, or willingness missing" /><Metric label="Affordability-constrained" value={number(demand.tiers[3])} note="Tier 3 at this price" /></dl>
    <p className="india-note">Illustrative scenario counts, not forecasts of sales velocity or absorption. Each row represents households with the same profile; split groups whose finances or demand factors differ.</p></>
}
function CapacityChart({ points, selectedPrice }: { points: PriceCapacityPoint[]; selectedPrice: number }) {
  const [active, setActive] = useState<number | null>(null)
  const width = 760, height = 300, left = 65, right = 28, top = 25, bottom = 50
  const min = points[0].price, max = points.at(-1)!.price
  const yMax = Math.max(1, ...points.map(p => p.capable))
  const sx = (price: number) => left + (price - min) / (max - min) * (width - left - right)
  const sy = (n: number) => height - bottom - n / yMax * (height - top - bottom)
  const inspected = active === null ? null : points[active]
  const captionId = useId()
  return <section className="india-section"><div className="section-label"><h2>Price vs buyer capacity</h2><span>21 prices · 50–150% of entered price</span></div><div className="india-chart-legend"><span><i /> Financially capable</span><span><i /> Effective demand</span></div>
    <svg className="india-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Household capacity by property price" aria-describedby={captionId}>
      <title>Financially capable and effective households at 21 property prices</title><desc>Focus or select a point to inspect the price and household counts. Exact selected-price results are shown above.</desc>
      {[...new Set([0, 1, 2, 3, 4].map(i => Math.round(yMax * i / 4)))].map(count => <g key={count}><line className="grid-line" x1={left} x2={width - right} y1={sy(count)} y2={sy(count)} /><text className="axis-text" x={left - 12} y={sy(count) + 4} textAnchor="end">{number(count)}</text></g>)}
      {[0, 5, 10, 15, 20].map(i => <text className="axis-text" key={i} x={sx(points[i].price)} y={height - 23} textAnchor={i === 0 ? 'start' : i === 20 ? 'end' : 'middle'}>{shortMoney(points[i].price)}</text>)}
      <line className="selected-line" x1={sx(selectedPrice)} x2={sx(selectedPrice)} y1={top} y2={height - bottom} />
      {(['capable', 'effective'] as const).map(key => <path key={key} d={points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.price)},${sy(p[key])}`).join(' ')} fill="none" stroke={key === 'capable' ? 'var(--chart-capable)' : 'var(--chart-effective)'} strokeWidth={key === 'capable' ? 5 : 2.5} strokeDasharray={key === 'capable' ? '6 5' : undefined} />)}
      {points.map((p, i) => <g key={i} tabIndex={0} role="button" aria-label={`${money(p.price)}: ${number(p.capable)} capable, ${number(p.effective)} effective households`} aria-pressed={active === i} onFocus={() => setActive(i)} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i) } }} className="india-chart-point">
        <rect x={sx(p.price) - 12} y={top} width={24} height={height - bottom - top} fill="transparent" />
        <circle cx={sx(p.price)} cy={sy(p.capable)} r={active === i ? 6 : 3} fill="var(--chart-capable)" /><circle cx={sx(p.price)} cy={sy(p.effective)} r={active === i ? 5 : 2.5} fill="var(--chart-effective)" />
      </g>)}
    </svg><p className="india-chart-caption" id={captionId} aria-live="polite">{inspected ? `${money(inspected.price)} · ${number(inspected.capable)} capable · ${number(inspected.effective)} effective households` : 'Hover, focus, or select a price point to inspect household counts.'}</p>
    <details className="india-chart-data"><summary>View all 21 chart prices</summary><div className="table-scroll" role="region" aria-label="Price capacity data" tabIndex={0}><table><thead><tr><th scope="col">Property price</th><th scope="col">Financially capable</th><th scope="col">Effective demand</th></tr></thead><tbody>{points.map(p => <tr key={p.price}><th scope="row">{money(p.price)}</th><td>{number(p.capable)}</td><td>{number(p.effective)}</td></tr>)}</tbody></table></div></details>
  </section>
}
function SegmentResults({ demand }: { demand: DemandResult }) {
  return <section className="india-section"><div className="section-label"><h2>Segment results</h2><span>At the exact entered price</span></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Segment capacity results"><table className="india-segment-results"><caption>Financial capacity and effective demand by segment. Scroll horizontally to inspect financing gaps and exclusions.</caption><thead><tr><th scope="col">Segment</th><th scope="col">Households</th><th scope="col">Financial tier</th><th scope="col">Capable</th><th scope="col">Effective</th><th scope="col">Price / income</th><th scope="col">Cash gap</th><th scope="col">Monthly EMI gap</th><th scope="col">Exclusions</th></tr></thead><tbody>{demand.segments.map(({ segment: s, capacity: c }) => <tr key={s.id}><th scope="row">{s.name}</th><td>{number(s.count)}</td><td>Tier {c.tier}<small>{tierNames[c.tier]}</small></td><td>{c.financiallyCapable ? number(s.count) : '0'}</td><td>{c.effectiveDemand ? number(s.count) : '0'}</td><td>{c.incomeMultiple === null ? 'Unavailable' : `${number(c.incomeMultiple)}×`}</td><td>{money(c.cashGap)}</td><td>{money(c.emiGap)}</td><td className="india-exclusions">{c.exclusions.length ? c.exclusions.map(reason => reasonLabels[reason]).join('; ') : 'All applicable factors met'}</td></tr>)}</tbody></table></div>{demand.total === 0 && <p className="india-note">No households are entered. Add a segment or increase its count to explore demand.</p>}</section>
}
function SegmentEditor({ segments, setSegments, errors }: { segments: HouseholdSegment[]; setSegments: (s: HouseholdSegment[]) => void; errors: FieldError[] }) {
  const update = (id: string, patch: Partial<HouseholdSegment>) => setSegments(segments.map(s => s.id === id ? { ...s, ...patch } : s))
  const fields = [
    ['count', 'Household count', false], ['annualIncome', 'Annual after-tax income', false],
    ['liquidFunds', 'Liquid purchase funds', false], ['reserve', 'Protected cash reserve', false],
    ['existingEmi', 'Existing monthly EMIs', false], ['savingsRate', 'Annual savings share', true],
  ] as const
  return <section className="india-segment-editor"><div className="section-label"><h2>Household segments</h2><button type="button" className="india-secondary-button" onClick={() => setSegments([...segments, { ...indiaHouseholdDefaults, id: crypto.randomUUID(), name: `New segment ${segments.length + 1}`, count: 0 }])}>Add segment</button></div>
    <p className="india-note">Each row shares one financial profile and one set of yes/no demand factors. Use separate rows for different profiles; avoid overlapping household groups.</p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Editable household segments"><table className="india-segments-table"><caption>All amounts in rupees; counts are whole numbers. Scroll horizontally to edit finances and demand factors.</caption><thead><tr><th scope="col">Segment</th>{fields.map(([key, label]) => <th scope="col" key={key}>{label}{key !== 'count' && key !== 'savingsRate' ? ' (₹)' : key === 'savingsRate' ? ' (%)' : ''}</th>)}<th scope="col">Demand factors</th><th scope="col">Actions</th></tr></thead><tbody>{segments.map((s, index) => <tr key={s.id}><td><input type="text" value={s.name} aria-label={`Segment name ${index + 1}`} aria-invalid={errors.some(e => e.path === `${s.id}.name`)} aria-describedby={errors.some(e => e.path === `${s.id}.name`) ? `segment-${s.id}-error` : undefined} onChange={e => update(s.id, { name: e.target.value })} />{errors.filter(e => e.path === `${s.id}.name`).map(e => <small className="india-field-error" id={`segment-${s.id}-error`} key={e.path}>{e.message}</small>)}</td>
      {fields.map(([key, label, rate]) => <td key={key}><NumberField path={`${s.id}.${key}`} label={`${label} — ${s.name || `segment ${index + 1}`}`} value={s[key]} onChange={value => update(s.id, { [key]: value })} rate={rate} unit={key === 'count' ? 'homes' : '₹'} errors={errors} /></td>)}
      <td><Gates household={s} suffix={` — ${s.name || `segment ${index + 1}`}`} onChange={h => update(s.id, h)} /></td>
      <td><button className="text-button" type="button" aria-label={`Remove ${s.name || `segment ${index + 1}`}`} onClick={() => setSegments(segments.filter(row => row.id !== s.id))}>Remove</button></td>
    </tr>)}</tbody></table></div>
  </section>
}
function KnowledgeNotes() {
  return <details className="india-knowledge"><summary>Housing need ≠ effective demand <span>Knowledge-card context</span></summary><div className="india-knowledge-content">
    <section><h3>The five factors</h3><p>Effective demand requires need, desire, financial capacity, access to credit when borrowing, and willingness to buy. Housing need by itself does not imply purchasing capacity.</p><p>The three financial tiers describe the selected price and financing scenario, not a permanent classification of a household.</p></section>
    <section><h3>Why a low yield may coexist with high prices</h3><p>The supplied knowledge card highlights land, approvals, finance, taxes and charges, construction costs, and developer margin requirements as supply constraints in desirable urban locations.</p><p>These tools do not estimate a builder’s price floor or predict price corrections.</p></section>
    <section><h3>The builder’s question</h3><p>How many households can actually purchase this product at this price, with this financing structure, today?</p><p>The entered segments help explore that question. They do not establish a city’s market size, absorption, pricing power, or inventory risk without further evidence.</p></section>
  </div></details>
}

export default function IndiaApp({ page }: { page: IndiaPage }) {
  const [product, setProduct] = useState<IndiaProduct>(() => structuredClone(indiaProductDefaults))
  const [household, setHousehold] = useState<IndiaHousehold>(() => structuredClone(indiaHouseholdDefaults))
  const [goal, setGoal] = useState<BuyerGoal>(() => new URLSearchParams(window.location.search).get('goal') === 'wait' ? 'wait' : 'afford')
  const [delay, setDelay] = useState<PurchaseDelay>(() => ({ ...purchaseDelayDefaults, years: new URLSearchParams(window.location.search).get('goal') === 'wait' ? 5 : 0 }))
  const [beginner, setBeginner] = useState(true)
  const [guideVersion, setGuideVersion] = useState(0)
  const [segments, setSegments] = useState<HouseholdSegment[]>(() => structuredClone(indiaSegmentDefaults))
  const info = pageInfo[page]
  useEffect(() => {
    document.title = `Home / Rent — India ${info.title}`
    document.querySelector('meta[name="description"]')?.setAttribute('content', info.description)
  }, [info])
  const errors = page === 'buyer' ? validatePurchaseDelay(product, household, delay) : [...validateProduct(product), ...validateSegments(segments)]
  const projection = !errors.length && page === 'buyer' ? evaluatePurchaseDelay(product, household, delay) : null
  const capacity = projection?.current.capacity
  const demand = !errors.length && page !== 'buyer' ? evaluateDemand(product, segments) : null
  const points = demand && page === 'market' ? priceCapacityCurve(product, segments) : null
  const editor = <SegmentEditor segments={segments} setSegments={setSegments} errors={errors} />
  function reset() {
    setProduct(structuredClone(indiaProductDefaults)); setHousehold(structuredClone(indiaHouseholdDefaults)); setSegments(structuredClone(indiaSegmentDefaults))
    setDelay(structuredClone(purchaseDelayDefaults))
    setGuideVersion(v => v + 1)
  }
  const fullBuyerResults = capacity && projection ? <HouseholdResults product={product} household={household} delay={delay} capacity={capacity} projection={projection} /> : null
  return <div className="india-app"><header className="site-header india-header"><a href="/" className="brand">Home<span className="brand-light"> / </span>Rent</a><span className="header-description">India · Effective demand</span><a className="india-us-link" href="/">US calculator ↗</a><ThemeSelector /></header>
    <nav className="india-nav" aria-label="India calculators">{(Object.keys(pageInfo) as IndiaPage[]).map(key => <a key={key} href={pageInfo[key].href} aria-current={key === page ? 'page' : undefined}>{pageInfo[key].title}</a>)}</nav>
    <main id="main"><div className="page-intro"><div><p className="eyebrow">INDIA / HOUSING NEED ≠ EFFECTIVE DEMAND</p><h1>{info.title}</h1><p>{page === 'buyer' && beginner ? 'Answer a few questions to see what you can afford and how waiting changes the numbers.' : info.description}</p></div><span className="currency-label">INR · Household capacity</span></div>
      <div className="india-example-note"><span>Illustrative examples · all assumptions are editable</span><span>Calculated in your browser</span></div>
      <section className="india-goals" aria-label="Choose your question"><h2>What would you like to understand?</h2><div className="india-goal-links">
        {page === 'buyer' ? <><button type="button" aria-pressed={goal === 'afford'} onClick={() => { setGoal('afford'); setGuideVersion(v => v + 1) }}>Can I afford this home?</button><button type="button" aria-pressed={goal === 'wait'} onClick={() => { setGoal('wait'); if (delay.years === 0) setDelay({ ...delay, years: 5 }); setGuideVersion(v => v + 1) }}>What happens if I wait?</button></> : <><a href="/india">Can I afford this home?</a><a href="/india?goal=wait">What happens if I wait?</a></>}
        <a href="/india/market" aria-current={page === 'market' ? 'page' : undefined}>How many households can buy?</a>
      </div></section>
      {page === 'buyer' && <div className="india-view-switch" role="group" aria-label="Calculator view"><button type="button" aria-pressed={beginner} onClick={() => setBeginner(true)}>Beginner view</button><button type="button" aria-pressed={!beginner} onClick={() => setBeginner(false)}>Full calculator</button></div>}
      {page !== 'buyer' && <p className="india-pool-help"><strong>Start with the home price.</strong> “Financially capable” households have enough cash and loan-payment capacity. “Effective buyers” also need and want the home, are willing to buy, and can access credit when borrowing. {page === 'market' ? 'Change the price to see both counts move. Open “Edit household segments” to use your own buyer groups.' : 'Edit the household groups below; keep people with different finances or buying intentions in separate rows.'} Counts are scenario estimates, not forecasts of sales.</p>}
      {page === 'buyer' && beginner ? <BeginnerBuyer key={guideVersion} product={product} setProduct={setProduct} household={household} setHousehold={setHousehold} delay={delay} setDelay={setDelay} errors={errors} projection={projection} goal={goal} reset={reset}
        advanced={<><ProductInputs product={product} setProduct={setProduct} errors={errors} financingOnly /><PurchaseTimingInputs delay={delay} setDelay={setDelay} errors={errors} advancedOnly hideSavingsReturn={goal === 'wait'} /><Section title="Ready to buy?"><p className="india-note">These factors affect effective demand, separately from your financial capacity.</p><Gates household={household} onChange={setHousehold} /></Section></>} further={fullBuyerResults} /> : <><div className="india-workspace"><aside className="inputs india-inputs" aria-label="Calculator assumptions"><div className="inputs-heading"><h2>Your assumptions</h2><button type="button" className="text-button" onClick={reset}>Reset examples</button></div>
        <ProductInputs product={product} setProduct={setProduct} errors={errors}>{page === 'buyer' && <PurchaseTimingInputs delay={delay} setDelay={setDelay} errors={errors} />}</ProductInputs>{page === 'buyer' && <HouseholdInputs household={household} setHousehold={setHousehold} errors={errors} />}
        <p className="india-input-footer">Valid inputs update results immediately.</p>
      </aside><div className="india-results">
        {errors.length > 0 && <div className="validation india-validation" role="alert"><strong>Check your assumptions</strong><ul>{errors.map((error, i) => <li key={`${error.path}-${i}`}>{error.message}</li>)}</ul><p>Results are withheld until all inputs are valid.</p></div>}
        {fullBuyerResults}
        {demand && <><DemandResults product={product} demand={demand} />{points && <CapacityChart points={points} selectedPrice={product.price} />}<SegmentResults demand={demand} /><YieldInsight product={product} /></>}
        {page === 'market' && <details className="india-market-editor"><summary>Edit household segments</summary>{editor}</details>}
      </div></div>
      {page === 'builders' && editor}</>}
      <KnowledgeNotes /><footer><span>Home / Rent · India</span><p>A purchasing-capacity scenario under your assumptions.</p></footer>
    </main></div>
}
