import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  evaluateDemand, evaluatePurchaseDelay, indiaHouseholdDefaults, indiaProductDefaults,
  indiaSegmentDefaults, priceCapacityCurve, purchaseDelayDefaults, validateProduct, validatePurchaseDelay, validateSegments,
} from './india'
import type {
  DemandResult, Exclusion, FieldError, HouseholdCapacity, HouseholdSegment,
  IndiaHousehold, IndiaProduct, PriceCapacityPoint, PurchaseDelay,
} from './india'
import './App.css'
import './IndiaApp.css'
import './CompactForms.css'
import ThemeSelector from './ThemeSelector'
import NumberField from './IndiaField'
import CompactBuyer from './CompactBuyer'

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

function ProductInputs({ product, setProduct, errors }: { product: IndiaProduct; setProduct: (p: IndiaProduct) => void; errors: FieldError[] }) {
  const field = (key: keyof IndiaProduct, label: string, unit: string, rate = false) => <NumberField path={key} label={label} value={product[key]} onChange={value => setProduct({ ...product, [key]: value })} rate={rate} unit={unit} errors={errors} />
  return <div className="compact-input-grid">
    <NumberField path="price" label="Property price" value={product.price / 1e7} onChange={value => setProduct({ ...product, price: value * 1e7 })} unit="₹ Cr" errors={errors} />
    {field('monthlyRent', 'Comparable monthly rent', '₹/mo')}{field('appreciation', 'Annual property appreciation', '%/yr', true)}
    {field('loanRate', 'Home-loan interest rate', '%/yr', true)}{field('termYears', 'Loan term', 'years')}
    {field('maxLtv', 'Maximum loan-to-value', '%', true)}{field('maxEmiShare', 'Maximum total EMI share of income', '%', true)}{field('purchaseCostRate', 'Upfront purchase costs', '%', true)}
  </div>
}
function BusinessHelp() {
  return <details className="compact-help compact-business-help"><summary>Help with fields</summary><dl>
    <div><dt>Property & rental yield</dt><dd>Price is in crore before purchase charges; 1.5 Cr = ₹1,50,00,000. Comparable monthly rent determines gross rental yield. Appreciation is an annual scenario, not a forecast.</dd></div>
    <div><dt>Financing & purchase costs</dt><dd>Interest is an annual loan rate; term starts at purchase. Loan-to-value limits borrowing against the property price. Upfront charges are paid in cash, outside that financed value. All loan payments together must fit the entered income share.</dd></div>
    <div><dt>Household finances</dt><dd>Take-home income uses lakh per month; liquid funds and reserves use lakh. The protected reserve is excluded from purchase cash. Existing monthly EMIs reduce the budget available for a home loan. Savings is a share of after-tax income, after rent and living expenses.</dd></div>
    <div><dt>Segments & effective buyers</dt><dd>Each segment represents households with identical finances and buying intentions. Split different profiles into separate, non-overlapping groups. Financially capable households fit the cash and EMI limits. Effective buyers also meet need, desire, willingness and credit access when borrowing; cash buyers do not require credit.</dd></div>
  </dl><p className="india-pool-help">Buyer counts are illustrative scenario estimates, not forecasts of absorption or sales velocity.</p></details>
}
function Gates({ household, onChange, suffix = '' }: { household: IndiaHousehold; onChange: (h: IndiaHousehold) => void; suffix?: string }) {
  return <div className="india-gates">{(Object.keys(gateLabels) as (keyof typeof gateLabels)[]).map(key =>
    <label className="checkbox-field" key={key}><input type="checkbox" checked={household[key]} aria-label={`${gateLabels[key]}${suffix}`} onChange={e => onChange({ ...household, [key]: e.target.checked })} /><span>{gateLabels[key]}</span></label>,
  )}</div>
}
function Metric({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="india-metric"><dt>{label}</dt><dd>{value}</dd>{note && <small>{note}</small>}</div>
}
function BuyerContext({ product, household, capacity: c }: { product: IndiaProduct; household: IndiaHousehold; capacity: HouseholdCapacity }) {
  return <>
    <p className="india-note">Financial tiers describe capacity under these financing assumptions. Tier 1 can pay in cash; Tier 2 needs borrowing and meets the cash and EMI limits; Tier 3 cannot meet those limits. Recurring ownership costs are outside this check.</p>
    <section className="india-growth"><h3>The income cost of rising prices</h3>
      <p className="india-insight">{c.incomeMultiple === null ? 'Income ratios are unavailable with zero income.' : <>This home costs <strong>{number(c.incomeMultiple)}×</strong> your annual after-tax income.</>}</p>
      <div className="table-scroll" role="region" aria-label="Appreciation burden comparison" tabIndex={0}><table className="india-growth-table"><caption>One-year price increases at today’s price</caption><thead><tr><th scope="col">Price rise</th><th scope="col">Extra price</th><th scope="col">Annual income</th><th scope="col">Annual savings</th></tr></thead><tbody>{[.01, .04, .05].map(rate => <tr key={rate}><th scope="row">{pct(rate)}</th><td>{money(product.price * rate)}</td><td>{pct(household.annualIncome > 0 ? product.price * rate / household.annualIncome : null)}</td><td>{pct(c.annualSavings > 0 ? product.price * rate / c.annualSavings : null)}</td></tr>)}</tbody></table></div>
      <p className="india-note">A price increase raises the complete purchase amount; it is not all an upfront cash requirement. Financing determines the cash and monthly-payment effects.</p>
    </section><YieldInsight product={product} />
  </>
}
function YieldInsight({ product }: { product: IndiaProduct }) {
  return <section className="india-yield"><div><p className="eyebrow">GROSS RENTAL YIELD</p><strong>{pct(12 * product.monthlyRent / product.price)}</strong></div><p>Annual comparable rent ÷ property price. A low yield can make renting attractive, but this ratio alone does not establish whether buying or renting builds more wealth.</p></section>
}
function DemandResults({ demand, product }: { demand: DemandResult; product: IndiaProduct }) {
  return <><div className="compact-pool-summary"><section className="india-result" aria-labelledby="demand-heading"><p className="eyebrow">EFFECTIVE BUYERS AT {shortMoney(product.price)}</p><h2 id="demand-heading">{number(demand.effective)} <span>households</span></h2></section>
    <dl className="india-metrics india-pool-metrics"><Metric label="Financially capable" value={number(demand.capable)} note="Tier 1 + Tier 2" /><Metric label="Capacity without effective demand" value={number(demand.capable - demand.effective)} note="A buying factor is missing" /><Metric label="Affordability-constrained" value={number(demand.tiers[3])} note="Tier 3 at this price" /></dl>
  </div><p className="compact-pool-note">Of {number(demand.total)} entered households, {number(demand.capable)} can finance this home and {number(demand.effective)} meet the buying factors. Scenario estimates, not forecasts of sales.</p></>
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
  const [selectedId, setSelectedId] = useState(() => segments[1]?.id ?? segments[0]?.id ?? '')
  const selected = segments.find(s => s.id === selectedId) ?? segments[0]
  const index = segments.indexOf(selected)
  const update = (patch: Partial<HouseholdSegment>) => setSegments(segments.map(s => s.id === selected.id ? { ...s, ...patch } : s))
  const name = selected?.name || `segment ${index + 1}`
  const fields = [
    ['count', 'Household count', false, 1, 'households'],
    ['annualIncome', 'Monthly take-home income', false, 12e5, '₹ lakh/mo'],
    ['liquidFunds', 'Liquid purchase funds', false, 1e5, '₹ lakh'], ['reserve', 'Protected cash reserve', false, 1e5, '₹ lakh'],
    ['existingEmi', 'Existing monthly EMIs', false, 1, '₹/mo'], ['savingsRate', 'Annual savings share', true, 1, '%'],
  ] as const
  const nameError = errors.find(e => e.path === `${selected?.id}.name`)
  return <section className="compact-segment-editor" aria-label="Household segments">
    <div className="compact-segment-controls"><label className="field"><span>Household segment</span><select aria-label="Household segment" value={selected?.id ?? ''} disabled={!segments.length} onChange={e => setSelectedId(e.target.value)}>{!segments.length && <option value="">No segments</option>}{segments.map((s, i) => <option key={s.id} value={s.id}>{s.name || `Segment ${i + 1}`}{errors.some(e => e.path.startsWith(`${s.id}.`)) ? ' · Check fields' : ''}</option>)}</select></label>
      <button type="button" className="india-secondary-button" onClick={() => { const id = crypto.randomUUID(); setSegments([...segments, { ...indiaHouseholdDefaults, id, name: `New segment ${segments.length + 1}`, count: 0 }]); setSelectedId(id) }}>Add segment</button>
      {selected && <button type="button" className="text-button" aria-label={`Remove ${name}`} onClick={() => setSegments(segments.filter(s => s.id !== selected.id))}>Remove segment</button>}
    </div>
    {selected && <><div className="compact-input-grid">
      <label className="field compact-segment-name"><span>Segment name</span><span className="input-wrap"><input type="text" value={selected.name} aria-label={`Segment name ${index + 1}`} aria-invalid={!!nameError} aria-describedby={nameError ? `segment-${selected.id}-error` : undefined} onChange={e => update({ name: e.target.value })} /></span>{nameError && <small className="india-field-error" id={`segment-${selected.id}-error`}>{nameError.message}</small>}</label>
      {fields.map(([key, label, rate, divisor, unit]) => <NumberField key={key} path={`${selected.id}.${key}`} label={label} ariaLabel={`${label} — ${name}`} value={selected[key] / divisor} onChange={value => update({ [key]: value * divisor })} rate={rate} unit={unit} errors={errors} />)}
    </div><details className="compact-help"><summary>Buying intentions for this segment</summary><Gates household={selected} suffix={` — ${name}`} onChange={h => update(h)} /></details></>}
    <p className="india-note">{number(segments.length)} groups · Edit one profile at a time. Split households with different finances or buying intentions into separate groups.</p>
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
  const [delay, setDelay] = useState<PurchaseDelay>(() => ({ ...purchaseDelayDefaults, years: 5 }))
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
  const editor = <SegmentEditor key={guideVersion} segments={segments} setSegments={setSegments} errors={errors} />
  function reset() {
    setProduct(structuredClone(indiaProductDefaults)); setHousehold(structuredClone(indiaHouseholdDefaults)); setSegments(structuredClone(indiaSegmentDefaults))
    setDelay({ ...purchaseDelayDefaults, years: 5 })
    setGuideVersion(v => v + 1)
  }
  return <div className={`india-app${page === 'buyer' ? ' india-homebuyer' : ' india-business'}`}><header className="site-header india-header"><a href="/" className="brand">Home<span className="brand-light"> / </span>Rent</a><span className="header-description">India · Effective demand</span><a className="india-us-link" href="/">US calculator ↗</a><ThemeSelector /></header>
    <nav className="india-nav" aria-label="India calculators">{(Object.keys(pageInfo) as IndiaPage[]).map(key => <a key={key} href={pageInfo[key].href} aria-current={key === page ? 'page' : undefined}>{pageInfo[key].title}</a>)}</nav>
    <main id="main"><div className="page-intro"><div><p className="eyebrow">INDIA / HOUSING NEED ≠ EFFECTIVE DEMAND</p><h1>{info.title}</h1><p>{page === 'buyer' ? 'Enter your finances to compare buying today with waiting.' : info.description}</p></div><span className="currency-label">INR · Household capacity</span></div>
      <div className="india-example-note"><span>Illustrative examples · all assumptions are editable</span><span>Calculated in your browser</span></div>
      {page === 'buyer' ? <CompactBuyer key={guideVersion} product={product} setProduct={setProduct} household={household} setHousehold={setHousehold} delay={delay} setDelay={setDelay} errors={errors} projection={projection} reset={reset}
        gates={<Gates household={household} onChange={setHousehold} />} context={capacity ? <BuyerContext product={product} household={household} capacity={capacity} /> : null} /> : <>
        <form className="compact-inputs" onSubmit={e => e.preventDefault()} aria-label="Property and financing inputs"><div className="compact-panel-heading"><h2>Property & financing</h2><div><button type="button" className="text-button" onClick={reset}>Reset examples</button><a href="#market-results">Results ↓</a></div></div>
          <ProductInputs product={product} setProduct={setProduct} errors={errors} />
          {page === 'builders' ? editor : <details className="compact-help"><summary>Edit household segments</summary>{editor}</details>}
          <BusinessHelp />
        </form>
        <div id="market-results" className="india-results" tabIndex={-1}>
          {errors.length > 0 && <div className="validation india-validation" role="alert"><strong>Check your assumptions</strong><ul>{errors.map((error, i) => <li key={`${error.path}-${i}`}>{error.message}</li>)}</ul><p>Results are withheld until all inputs are valid. Select a segment marked “Check fields” to fix its profile.</p></div>}
          {demand && <><DemandResults product={product} demand={demand} />{points && <CapacityChart points={points} selectedPrice={product.price} />}
            <details className="compact-disclosure"><summary>Segment results & exclusions</summary><SegmentResults demand={demand} /></details>
            <details className="compact-disclosure"><summary>Rental yield</summary><YieldInsight product={product} /></details>
          </>}
        </div>
        <nav className="compact-business-links" aria-label="Related questions"><a href="/india">Can I afford this home?</a><a href="/india?goal=wait">What happens if I wait?</a></nav>
      </>}
      <KnowledgeNotes /><footer><span>Home / Rent · India</span><p>A purchasing-capacity scenario under your assumptions.</p></footer>
    </main></div>
}
