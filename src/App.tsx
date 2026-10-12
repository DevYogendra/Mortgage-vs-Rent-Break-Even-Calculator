import { useMemo, useRef, useState } from 'react'
import { amount, defaults, simulate, validate, wealthAtRate } from './engine'
import type { Amount, Inputs, Month, Simulation } from './engine'
import './App.css'
import './CompactBuyer.css'
import './CompactForms.css'
import CalculationReport from './CalculationReport'
import ThemeSelector from './ThemeSelector'

const dollars = (n: number, decimals = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Math.abs(n) < .5 * 10 ** -decimals ? 0 : n)
const percent = (n: number) => new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const shortMoney = (n: number) => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : `$${Math.round(n / 1000)}k`
type NumericKey = { [K in keyof Inputs]: Inputs[K] extends number ? K : never }[keyof Inputs]
type AmountKey = 'down' | 'closing' | 'selling' | 'propertyTax' | 'insurance' | 'maintenance'
function NumericField({ label, value, onChange, suffix, prefix, hint, id, error }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; prefix?: string; hint?: string; id: string; error?: string
}) {
  return <label className="field" htmlFor={id}><span>{label}</span><span className="input-wrap">
    {prefix && <span className="input-prefix">{prefix}</span>}
    <input id={id} aria-label={label} type="number" step="any" value={Number.isFinite(value) ? Number(value.toFixed(8)) : ''} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-hint` : undefined} />
    {suffix && <span className="input-suffix">{suffix}</span>}</span>{(error || hint) && <small id={`${id}-hint`} className={error ? 'india-field-error' : undefined}>{error || hint}</small>}</label>
}
function AmountField({ label, value, price, onChange, id, hint, error }: { label: string; value: Amount; price: number; onChange: (a: Amount) => void; id: string; hint?: string; error?: string }) {
  const isPercent = value.unit === 'percent'
  return <div className="amount-field"><NumericField label={label} id={id} value={isPercent ? value.value * 100 : value.value} onChange={n => onChange({ ...value, value: isPercent ? n / 100 : n })} prefix={isPercent ? undefined : '$'} hint={hint} error={error} />
    <select aria-label={`${label} unit`} value={value.unit} onChange={e => { const unit = e.target.value as Amount['unit']; const total = amount(value, price); onChange({ unit, value: unit === 'percent' ? (price > 0 ? total / price : 0) : total }) }}>
      <option value="percent">% {id === 'selling' ? 'sale' : 'price'}</option><option value="dollars">Dollars</option></select></div>
}
type Series = { label: string; color: string; values: { x: number; y: number }[] }
function Chart({ series, selected, formatY, label }: { series: Series[]; selected?: number; formatY: (n: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null)
  const all = series.flatMap(s => s.values)
  if (!all.length) return <div className="chart-empty">Buying is already ahead at every tested horizon, even with a zero sale price.</div>
  const width = 760, height = 260, left = 67, right = 24, top = 24, bottom = 36
  const xMax = Math.max(1, ...all.map(p => p.x))
  const lowest = Math.min(0, ...all.map(p => p.y)), highest = Math.max(0, ...all.map(p => p.y))
  const pad = Math.max((highest - lowest) * .13, highest === 0 ? .01 : Math.abs(highest) * .05)
  const yMin = lowest - pad, yMax = highest + pad
  const sx = (x: number) => left + x / xMax * (width - left - right)
  const sy = (y: number) => top + (yMax - y) / (yMax - yMin) * (height - top - bottom)
  const nearest = active === null ? [] : series.map(s => ({ label: s.label, point: s.values.find(p => p.x === active) })).filter(s => s.point)
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}><title>{label}</title>
    {[0, 1, 2, 3, 4].map(i => { const y = yMin + (yMax - yMin) * i / 4; return <g key={i}><line x1={left} y1={sy(y)} x2={width - right} y2={sy(y)} className="grid-line" /><text x={left - 12} y={sy(y) + 4} textAnchor="end" className="axis-text">{formatY(y)}</text></g> })}
    {Array.from(new Set([1, Math.round(xMax / 4), Math.round(xMax / 2), Math.round(xMax * .75), xMax])).filter(x => x > 0).map(x => <text key={x} x={sx(x)} y={height - 8} textAnchor="middle" className="axis-text">{x} yr</text>)}
    {selected && selected <= xMax && <line x1={sx(selected)} y1={top} x2={sx(selected)} y2={height - bottom} className="selected-line" />}
    {series.map(s => <g key={s.label}><path d={s.values.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')} stroke={s.color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {s.values.map(p => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={p.x === selected || p.x === active ? 6 : 3.5} fill={s.color} stroke="var(--surface)" strokeWidth="2" tabIndex={0} role="button" aria-label={`${s.label}, ${p.x} years: ${formatY(p.y)}`} className="chart-point" onMouseEnter={() => setActive(p.x)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(p.x)} onBlur={() => setActive(null)} onClick={() => setActive(p.x)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(p.x) } }} />)}</g>)}
  </svg><div className="chart-caption" aria-live="polite">{nearest.length ? `${active} years · ${nearest.map(s => `${s.label}: ${formatY(s.point!.y)}`).join(' · ')}` : 'Hover or focus a point to inspect a year.'}</div></div>
}
function sensitivity(s: Simulation) {
  const x = s.input, changeAmount = (a: Amount, factor: number): Amount => ({ ...a, value: a.value * factor })
  const factors: { label: string; lower: Inputs; upper: Inputs; low: string; high: string }[] = [
    { label: 'Mortgage rate', lower: { ...x, mortgageRate: Math.max(0, x.mortgageRate - .01) }, upper: { ...x, mortgageRate: Math.min(1, x.mortgageRate + .01) }, low: '−1 pp', high: '+1 pp' },
    { label: 'Investment return', lower: { ...x, investmentReturn: Math.max(-.99, x.investmentReturn - .02) }, upper: { ...x, investmentReturn: Math.min(1, x.investmentReturn + .02) }, low: '−2 pp', high: '+2 pp' },
    { label: 'Rent growth', lower: { ...x, rentGrowth: Math.max(-.99, x.rentGrowth - .01) }, upper: { ...x, rentGrowth: Math.min(1, x.rentGrowth + .01) }, low: '−1 pp', high: '+1 pp' },
    { label: 'Holding period', lower: { ...x, years: Math.max(1 / 12, x.years - 2) }, upper: { ...x, years: Math.min(50, x.years + 2) }, low: '−2 years', high: '+2 years' },
    { label: 'Maintenance', lower: { ...x, maintenance: changeAmount(x.maintenance, .75) }, upper: { ...x, maintenance: changeAmount(x.maintenance, 1.25) }, low: '−25%', high: '+25%' },
    { label: 'Property tax', lower: { ...x, propertyTax: changeAmount(x.propertyTax, .75) }, upper: { ...x, propertyTax: changeAmount(x.propertyTax, 1.25) }, low: '−25%', high: '+25%' },
    { label: 'Down payment', lower: { ...x, down: { unit: 'percent', value: Math.max(0, s.downPayment / x.price - .05) } }, upper: { ...x, down: { unit: 'percent', value: Math.min(1, s.downPayment / x.price + .05) } }, low: '−5 pp', high: '+5 pp' },
    { label: 'Transaction costs', lower: { ...x, closing: changeAmount(x.closing, .75), selling: changeAmount(x.selling, .75) }, upper: { ...x, closing: changeAmount(x.closing, 1.25), selling: changeAmount(x.selling, 1.25) }, low: '−25%', high: '+25%' },
  ]
  const calc = (i: Inputs) => { if (validate(i).length) return 'Outside range'; const r = simulate(i).result; return r.status === 'buy-always' ? 'Already ahead' : percent(r.appreciation) }
  return factors.map(f => ({ ...f, lowerResult: calc(f.lower), upperResult: calc(f.upper) }))
}
function Breakdown({ s }: { s: Simulation }) {
  const sum = (key: keyof Month) => s.months.reduce((total, m) => total + m[key], 0)
  const last = s.months[s.months.length - 1], renterContributions = sum('renterContribution'), buyerContributions = sum('buyerContribution')
  const sections = [
    { title: 'Mortgage', rows: [['Initial mortgage', s.initialLoan], ['Scheduled monthly principal & interest', s.payment], ['Interest, first 12 months', s.months.slice(0, 12).reduce((v, m) => v + m.interest, 0)], ['Principal, first 12 months', s.months.slice(0, 12).reduce((v, m) => v + m.principal, 0)], ['Total interest paid', sum('interest')], ['Total principal repaid', sum('principal')], ['Balance at sale', last.balance]] },
    { title: 'Ownership over the holding period', rows: [['Property taxes', sum('propertyTax')], ['Homeowners insurance', sum('insurance')], ['Maintenance', sum('maintenance')], ['HOA', sum('hoa')], ['PMI', sum('pmi')], ['Other owner expenses', sum('otherOwner')], ['Estimated tax savings', sum('taxSaving')]] },
    { title: 'Rent & investment', rows: [['Total rent paid', sum('rent')], ['Renters insurance & other costs', sum('rentersInsurance') + sum('otherRenter')], ['Renter initial investment', s.downPayment + s.closingCosts], ['Renter monthly contributions, total', renterContributions], ['Renter investment gains / losses', last.renterPortfolio - s.downPayment - s.closingCosts - renterContributions], ['Buyer monthly contributions, total', buyerContributions], ['Buyer investment gains / losses', last.buyerPortfolio - buyerContributions], ['Buyer investment balance', last.buyerPortfolio]] },
    { title: s.result.status === 'solved' ? 'Sale at break even' : 'Zero sale-price boundary', rows: [['Evaluated sale price', s.result.salePrice], ['Selling costs', s.result.sellingCosts], ['Remaining mortgage', last.balance], ['Net sale proceeds', s.result.equity]] },
  ]
  return <details className="breakdown"><summary>Full calculation breakdown <span>View totals ↗</span></summary><div className="breakdown-grid">{sections.map(section => <section key={section.title}><h3>{section.title}</h3><dl>{section.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{dollars(Number(value))}</dd></div>)}</dl></section>)}</div></details>
}
function USResults({ s }: { s: Simulation }) {
  const reportRef = useRef<HTMLDetailsElement>(null)
  const [tab, setTab] = useState<'holding' | 'scenario' | 'sensitivity'>('holding')
  const [scenario, setScenario] = useState({ simulation: s, rate: s.result.status === 'solved' ? s.result.appreciation : 0 })
  const scenarioRate = scenario.simulation === s ? scenario.rate : s.result.status === 'solved' ? s.result.appreciation : 0
  const setScenarioRate = (rate: number) => setScenario({ simulation: s, rate })
  const x = s.input, first = s.months[0], last = s.months[s.months.length - 1], result = s.result
  const chartSimulation = useMemo(() => simulate({ ...s.input, years: Math.max(30, s.input.years) }), [s])
  const sensitivityRows = useMemo(() => sensitivity(s), [s])
  const scenarioValid = Number.isFinite(scenarioRate) && scenarioRate > -1 && scenarioRate <= 1
  const scenarios = useMemo(() => scenarioValid ? wealthAtRate(s, scenarioRate) : [], [s, scenarioRate, scenarioValid]), finalScenario = scenarios.at(-1)
  return <div className="results compact-us-results" aria-label="Calculation results">
        <section className="result-panel" aria-live="polite"><div className="result-top"><p className="eyebrow">REQUIRED HOME APPRECIATION</p><span className="period-label">{x.years}-year holding period</span></div>{result.status === 'solved' ? <><div className="big-result">{percent(result.appreciation)}<span>/ year</span></div><p className="result-explanation">Your home needs to reach <strong>{dollars(result.salePrice)}</strong> after {x.years} years for buying to break even.</p><div className="result-rule"><span>Above {percent(result.appreciation)} favors buying.</span><span>Below favors renting + investing.</span></div></> : <><div className="no-threshold">Buying is already ahead.</div><p className="result-explanation">Even a zero sale price leaves the buyer at least as wealthy under these assumptions. There is no positive sale-price threshold.</p></>}<div className="result-assumptions">{dollars(x.price)} home <span>·</span> {percent(s.downPayment / x.price)} down <span>·</span> {percent(x.mortgageRate)} mortgage <span>·</span> {percent(x.investmentReturn)} investment return</div><a className="show-calculations" href="#calculation-report" aria-controls="calculation-report" onClick={e => { e.preventDefault(); const report = reportRef.current; if (report) { report.open = true; requestAnimationFrame(() => { report.querySelector('summary')?.focus({ preventScroll: true }); report.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }) } }}>Show calculations <span aria-hidden="true">↓</span></a></section>
        <section className="cash-comparison"><div className="section-label"><h2>Monthly cash flow</h2><span>First month · principal included</span></div><div className="cash-columns"><div><span>Buy</span><strong>{dollars(first.buyCost)}</strong><small>After estimated tax savings</small></div><div><span>Rent</span><strong>{dollars(first.rentCost)}</strong><small>Rent + renter expenses</small></div><div className="cash-difference"><span>{first.buyCost >= first.rentCost ? 'Renter invests' : 'Buyer invests'}</span><strong>{dollars(Math.abs(first.buyCost - first.rentCost))}<em>/ mo</em></strong><small>The first month’s savings</small></div></div></section>
        <section className="ending-wealth"><div className="section-label"><h2>{result.status === 'solved' ? 'Ending wealth at break even' : 'Ending wealth with a zero sale price'}</h2><span>After sale · {x.years} years</span></div><div className="wealth-columns"><div><span>Buy</span><strong>{dollars(result.buyerWealth)}</strong><small>{dollars(result.equity)} net proceeds + {dollars(last.buyerPortfolio)} invested</small></div><span className="equals" aria-hidden="true">{result.status === 'solved' ? '=' : '≥'}</span><div><span>Rent + invest</span><strong>{dollars(result.renterWealth)}</strong><small>Initial capital + monthly savings + returns</small></div></div><p className="reconciliation">{result.status === 'solved' ? `Unrounded calculation difference: ${dollars(result.difference, 2)}` : `Buyer advantage: ${dollars(result.difference)}`}</p></section>
        <section className="analysis"><div className="analysis-tabs" role="tablist" aria-label="Analysis views">{([['holding', 'Holding period'], ['scenario', 'Try appreciation'], ['sensitivity', 'Sensitivity']] as const).map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={e => { const ids = ['holding', 'scenario', 'sensitivity'] as const; const index = ids.indexOf(id); const next = e.key === 'ArrowRight' ? ids[(index + 1) % 3] : e.key === 'ArrowLeft' ? ids[(index + 2) % 3] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[2] : null; if (next) { e.preventDefault(); setTab(next); requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus()) } }}>{label}</button>)}</div>
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'holding' && <><div className="chart-heading"><div><h2>Time changes the equation.</h2><p>Required annual appreciation at each sale horizon.</p></div><span className="chart-legend"><i /> Break-even rate</span></div><Chart selected={x.years} label="Required annual appreciation versus years held" formatY={n => `${(n * 100).toFixed(1)}%`} series={[{ label: 'Required appreciation', color: 'var(--chart-green)', values: chartSimulation.annual.filter(a => a.breakEven.status === 'solved').map(a => ({ x: a.year, y: a.breakEven.appreciation })) }]} /><div className="chart-footnote">Each point is a separate sale scenario, including selling costs at that year.</div></>}
          {tab === 'scenario' && <><div className="chart-heading"><div><h2>What if appreciation is different?</h2><p>Ending wealth after selling, under your selected rate.</p></div></div><div className="scenario-controls"><NumericField id="scenario" label="Home appreciation" value={scenarioRate * 100} onChange={n => setScenarioRate(n / 100)} suffix="%" /><div className="rate-presets">{[0, .01, .02, .03, .04, .05].map(rate => <button key={rate} onClick={() => setScenarioRate(rate)} aria-pressed={Math.abs(rate - scenarioRate) < 1e-7}>{Math.round(rate * 100)}%</button>)}</div></div>{!scenarioValid ? <p role="alert" className="validation">Enter an appreciation rate greater than −100% and no more than 100%.</p> : <><div className="scenario-answer">At {percent(scenarioRate)}, <strong>{Math.abs(finalScenario!.buyer - finalScenario!.renter) < 1 ? 'the strategies break even' : `${finalScenario!.buyer > finalScenario!.renter ? 'buying' : 'renting'} finishes ${dollars(Math.abs(finalScenario!.buyer - finalScenario!.renter))} ahead`}</strong> after {x.years} years.</div><div className="multi-legend"><span><i style={{ background: 'var(--chart-green)' }} />Buy</span><span><i style={{ background: 'var(--chart-brown)' }} />Rent + invest</span></div><Chart label="Buyer and renter wealth over time at selected appreciation" formatY={shortMoney} selected={x.years} series={[{ label: 'Buy', color: 'var(--chart-green)', values: scenarios.map(a => ({ x: a.year, y: a.buyer })) }, { label: 'Rent + invest', color: 'var(--chart-brown)', values: scenarios.map(a => ({ x: a.year, y: a.renter })) }]} /></>}</>}
          {tab === 'sensitivity' && <><div className="chart-heading"><div><h2>Which assumptions move the result?</h2><p>Change one factor at a time. All other assumptions stay fixed.</p></div></div><div className="table-scroll"><table className="sensitivity-table"><thead><tr><th>Assumption</th><th>Lower input</th><th>Higher input</th></tr></thead><tbody>{sensitivityRows.map(row => <tr key={row.label}><td>{row.label}</td><td><strong>{row.lowerResult}</strong><small>{row.low}</small></td><td><strong>{row.upperResult}</strong><small>{row.high}</small></td></tr>)}</tbody></table></div><p className="chart-footnote">Base result: {result.status === 'solved' ? percent(result.appreciation) : 'Buying already ahead'}. pp = percentage points. Changes are capped at supported limits.</p></>}
        </div></section>
      <details className="compact-disclosure us-annual"><summary>Year-by-year comparison</summary><section className="annual-section"><div className="section-label"><div><p className="eyebrow">YEAR BY YEAR</p><h2>Your holding-period comparison</h2></div><span>Costs and contributions are totals for each period.</span></div><div className="table-scroll"><table className="annual-table"><thead><tr><th>Year</th><th>Mortgage balance</th><th>Monthly rent</th><th>Buy cash outflow</th><th>Rent cash outflow</th><th>Renter invests</th><th>Buyer invests</th><th>Break-even sale price</th><th>Required / yr</th></tr></thead><tbody>{s.annual.map(a => <tr key={a.year} className={a.year === x.years ? 'selected-row' : ''}><td>{Number(a.year.toFixed(2))}{a.months < 12 && <small>{a.months} months</small>}</td><td>{dollars(a.balance)}</td><td>{dollars(a.monthlyRent)}</td><td>{dollars(a.buyCost)}</td><td>{dollars(a.rentCost)}</td><td>{dollars(a.renterContribution)}</td><td>{dollars(a.buyerContribution)}</td><td>{a.breakEven.status === 'solved' ? dollars(a.breakEven.salePrice) : 'Already ahead'}</td><td>{a.breakEven.status === 'solved' ? percent(a.breakEven.appreciation) : '—'}</td></tr>)}</tbody></table></div></section>
      </details>
      <CalculationReport s={s} dirty={false} reportRef={reportRef} />
      <Breakdown s={s} /><details className="model-notes"><summary>How the model works & what’s included <span>Read assumptions ↗</span></summary><div className="notes-grid">
        <section><h3>A fair cash-flow comparison</h3><p>The renter invests the down payment and avoided buyer closing costs at the start. Each month, whichever strategy costs less invests the savings at month-end. Mortgage principal, including extra payments, reduces the loan balance; it is never counted twice as equity.</p><p>The fixed mortgage rate is divided by 12. Investment return is an effective annual rate converted to monthly compounding. Rent and other expenses increase on each anniversary, starting in month 13. The home is sold after the final monthly payment and investment contribution.</p></section>
        <section><h3>Expenses & taxes</h3><p>Percentage ownership expenses use the original purchase price, then grow by expense inflation independently of appreciation. HOA, other owner expenses, renters insurance and other renter costs use the same inflation rate. PMI stays fixed until its configured cancellation threshold or payoff.</p><p>Tax savings are a user-provided effective estimate on mortgage interest, with property tax optionally included. The rate must reflect incremental savings over renting and deduction limits. Savings are allocated monthly. No tax-law calculation is performed; home-sale capital-gains taxes are excluded.</p></section>
        <section><h3>What the result means</h3><p>All values are nominal US dollars. Ending wealth covers assets and debt associated with these two strategies, rather than your entire household balance sheet. Both investment accounts use the same constant return after taxes and fees. Market risk, refinancing, moving costs, refundable deposits, escrow balances, and the personal value of owning are outside this model.</p><p>Each annual break-even sale price is solved independently. Annual appreciation assumes a constant compounded rate. Above the threshold favors buying because only sale proceeds change with home value in this model.</p></section>
      </div></details>  </div>
}
export default function App() {
  const [draft, setDraft] = useState<Inputs>(() => structuredClone(defaults))
  const errors = useMemo(() => validate(draft), [draft])
  const simulation = useMemo(() => errors.length ? null : simulate(draft), [draft, errors])
  const update = <K extends keyof Inputs>(key: K, value: Inputs[K]) => setDraft(old => ({ ...old, [key]: value }))
  const errorNames: Record<NumericKey | AmountKey, string> = {
    price: 'Purchase price', years: 'Holding period', term: 'Mortgage term', mortgageRate: 'Mortgage rate',
    investmentReturn: 'Investment return', rentGrowth: 'Rent growth', inflation: 'Expense inflation', taxBenefit: 'Effective tax benefit', pmiEnd: 'PMI cancellation threshold',
    down: 'Down payment', closing: 'Buyer closing costs', selling: 'Selling costs', propertyTax: 'Property tax', insurance: 'Insurance', maintenance: 'Maintenance',
    extra: 'Extra principal', pmi: 'PMI must', hoa: 'HOA', otherOwner: 'Other owner expenses', rent: 'Monthly rent', rentersInsurance: 'Renters insurance', otherRenter: 'Other renter expenses',
  }
  const fieldError = (key: NumericKey | AmountKey) => errors.find(e => e.startsWith(errorNames[key]))
  const num = (key: NumericKey, label: string, unit: string, rate = false) => <NumericField id={key} label={label} value={draft[key] * (rate ? 100 : 1)} onChange={n => update(key, n / (rate ? 100 : 1))} suffix={unit === '$' ? undefined : unit} prefix={unit === '$' ? '$' : undefined} error={fieldError(key)} />
  const amt = (key: AmountKey, label: string) => <AmountField id={key} label={label} value={draft[key]} price={draft.price} onChange={a => update(key, a)} error={fieldError(key)} />
  return <div className="compact-us"><header className="site-header"><a href="#main" className="brand"><svg width="27" height="28" viewBox="0 0 27 28" fill="none" aria-hidden="true"><path d="M3 13L13.5 3L24 13V25H3V13Z" stroke="currentColor" strokeWidth="2" /><path d="M9 25V16H18V25" stroke="currentColor" strokeWidth="2" /></svg><span>Home<span className="brand-light"> / </span>Rent</span></a><span className="header-description">Mortgage vs rent break-even calculator</span><a className="india-link" href="/india">India calculators ↗</a><span className="private-label"><span /> Calculated in your browser</span><ThemeSelector /></header>
    <main id="main"><div className="page-intro"><div><p className="eyebrow">THE COST OF YOUR NEXT MOVE</p><h1>Rent or buy? Run the numbers.</h1><p>Find the home appreciation needed to match renting and investing the difference.</p></div><span className="currency-label">USD · Monthly model</span></div>
      <form className="compact-inputs" noValidate onSubmit={e => e.preventDefault()} aria-label="US calculator inputs">
        <div className="compact-panel-heading"><h2>Your numbers</h2><div><button type="button" className="text-button" onClick={() => setDraft(structuredClone(defaults))}>Reset</button><a href="#us-results">Results ↓</a></div></div>
        <div className="compact-input-grid">
          {num('price', 'Purchase price', '$')}{amt('down', 'Down payment')}{num('years', 'Years in the home', 'years')}
          {num('mortgageRate', 'Mortgage interest rate', '%/yr', true)}{num('term', 'Mortgage term', 'years')}
          {amt('propertyTax', 'Annual property tax')}{amt('insurance', 'Annual homeowners insurance')}{amt('maintenance', 'Annual maintenance')}
          {num('rent', 'Current monthly rent', '$/mo')}{num('rentGrowth', 'Annual rent increase', '%/yr', true)}{num('rentersInsurance', 'Monthly renters insurance', '$/mo')}{num('otherRenter', 'Other monthly renter expenses', '$/mo')}
          {num('investmentReturn', 'Annual investment return', '%/yr', true)}{num('inflation', 'Expense inflation', '%/yr', true)}{amt('closing', 'Buyer closing costs')}{amt('selling', 'Selling costs')}
          {num('hoa', 'Monthly HOA', '$/mo')}{num('extra', 'Extra monthly principal', '$/mo')}{num('pmi', 'Monthly PMI', '$/mo')}{num('pmiEnd', 'PMI stops at loan / price', '%', true)}{num('otherOwner', 'Other monthly owner expenses', '$/mo')}
          {num('taxBenefit', 'Tax savings from mortgage interest', '%', true)}
          <label className="checkbox-field compact-tax-option"><input type="checkbox" checked={draft.includePropertyTax} onChange={e => update('includePropertyTax', e.target.checked)} /><span>Apply tax benefit to property tax too</span></label>
        </div>
        <p className="compact-savings-summary">Initial purchase cash: {Number.isFinite(amount(draft.down, draft.price) + amount(draft.closing, draft.price)) ? dollars(amount(draft.down, draft.price) + amount(draft.closing, draft.price)) : '—'} · Down payment + closing costs. Valid inputs update results automatically.</p>
        <details className="compact-help"><summary>Help with fields</summary><dl>
          <div><dt>Price, down payment & transaction costs</dt><dd>Use the price before closing costs. Amount fields accept dollars or a percentage of purchase price; selling costs use the eventual sale price. Switching units converts the amount at the entered purchase price. Closing costs are nonrecoverable costs, excluding prepaid insurance and escrow.</dd></div>
          <div><dt>Mortgage & holding period</dt><dd>Loan term begins at purchase; the holding period is how long you stay before selling. Both support whole-month increments, up to 50 years. The mortgage rate is annual and divided by 12. Extra principal reduces debt and counts in monthly buyer expenses.</dd></div>
          <div><dt>Annual ownership costs</dt><dd>Property tax, homeowners insurance and maintenance are annual amounts or shares of original price. Expense inflation applies on each anniversary to these costs, HOA, other owner expenses, renters insurance and other renter costs.</dd></div>
          <div><dt>Rent & investment return</dt><dd>Enter monthly rent and renter expenses; annual rent increases begin in month 13. Investment return is an effective annual rate after taxes and fees, converted for monthly compounding. Each strategy invests its monthly savings.</dd></div>
          <div><dt>PMI</dt><dd>Monthly PMI stays fixed. It stops the month after the balance reaches the selected percentage of original price, or after payoff. A 0% threshold keeps PMI until payoff.</dd></div>
          <div><dt>Tax savings</dt><dd>If $10,000 in mortgage interest saves $1,000 more tax than renting, enter 10%. Use 0% if unsure. The checkbox applies the same effective benefit to property tax. No tax-law calculation is performed.</dd></div>
        </dl></details>
      </form>
      <div id="us-results" tabIndex={-1}>
        {errors.length > 0 && <div className="validation compact-validation" role="alert"><strong>Check the highlighted fields</strong><p>Results and downloads are withheld until all inputs are valid.</p></div>}
        {simulation && <USResults s={simulation} />}
      </div>
      <footer><span>Home / Rent</span><p>A financial projection under your assumptions.</p><span>Built for a clearer decision.</span></footer>
    </main></div>
}
