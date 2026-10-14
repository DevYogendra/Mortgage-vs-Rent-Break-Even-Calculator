import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayPoint, PurchaseDelayProjection } from './india'
import { PurchaseDelayBars, PurchaseDelayCalculations } from './PurchaseDelayDetails'
import './PurchaseDelayChart.css'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const shortMoney = (n: number) => Math.abs(n) >= 1e7 ? `₹${number(n / 1e7)} cr` : Math.abs(n) >= 1e5 ? `₹${number(n / 1e5)} L` : money(n)
const elapsed = (month: number) => {
  if (month === 0) return 'Today'
  const years = Math.floor(month / 12), remainder = month % 12
  return [years ? `${years} ${years === 1 ? 'year' : 'years'}` : '', remainder ? `${remainder} ${remainder === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(', ')
}

type View = 'balances' | 'changes'
interface Series { label: string; color: string; dash?: string; value: (point: PurchaseDelayPoint) => number }

export default function PurchaseDelayChart({ projection, product, household, delay, presentation = 'full' }: { presentation?: 'full' | 'compact'; projection: PurchaseDelayProjection; product: IndiaProduct; household: IndiaHousehold; delay: PurchaseDelay }) {
  const { current, monthlyTimeline: points } = projection
  const [view, setView] = useState<View>('changes')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [width, setWidth] = useState(760)
  const plotRef = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(300, Math.round(entries[0].contentRect.width))))
    if (plotRef.current) observer.observe(plotRef.current)
    return () => observer.disconnect()
  }, [])
  const months = points.length - 1
  const month = selectedMonth === null ? months : Math.min(selectedMonth, months)
  const point = points[month]
  const series: Series[] = view === 'balances' ? [
    { label: 'House price', color: 'var(--chart-cost)', value: p => p.price },
    { label: 'Available purchase cash', color: 'var(--chart-effective)', dash: '7 4', value: p => p.capacity.availableCash },
  ] : [
    { label: 'Extra purchase cost', color: 'var(--chart-cost)', value: p => p.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost },
    { label: 'Added purchase cash', color: 'var(--chart-effective)', value: p => p.capacity.availableCash - current.capacity.availableCash },
    { label: 'Net purchase progress', color: 'var(--chart-soft)', dash: '5 5', value: p => (p.capacity.availableCash - current.capacity.availableCash) - (p.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost) },
  ]
  const values = points.flatMap(p => series.map(s => s.value(p)))
  const minValue = Math.min(0, ...values), maxValue = Math.max(1, ...values)
  const targetStep = (maxValue - minValue) / 4
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= targetStep) ?? 10) * magnitude)
  const yMin = Math.floor(minValue / step) * step, yMax = Math.ceil(maxValue / step) * step
  const ticks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step)
  const height = width < 480 ? 260 : 320, left = 76, right = 18, top = 20, bottom = 42
  const sx = (m: number) => left + m / Math.max(1, months) * (width - left - right)
  const sy = (value: number) => height - bottom - (value - yMin) / (yMax - yMin) * (height - top - bottom)
  const xTicks = [...new Set(Array.from({ length: width < 480 ? 3 : 5 }, (_, i) => Math.round(months * i / (width < 480 ? 2 : 4))))]
  const extraPrice = point.price - current.price
  const extraFees = point.capacity.purchaseCosts - current.capacity.purchaseCosts
  const extraCost = point.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost
  const extraCash = point.capacity.availableCash - current.capacity.availableCash
  const netProgress = extraCash - extraCost
  const offsetShare = point.savingsContributions > 0 ? Math.max(0, extraCost) / point.savingsContributions * 100 : null
  const offsetLabel = offsetShare === null ? 'No new savings' : offsetShare > 10000 ? '>10,000%' : `${number(offsetShare)}%`
  const loanChange = point.capacity.requiredLoan - current.capacity.requiredLoan
  function inspect(event: PointerEvent<SVGSVGElement>) {
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && !event.buttons) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * width / rect.width
    setSelectedMonth(Math.max(0, Math.min(months, Math.round((x - left) / (width - left - right) * months))))
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    const next = { ArrowLeft: month - 1, ArrowRight: month + 1, Home: 0, End: months }[event.key]
    if (next !== undefined) { event.preventDefault(); setSelectedMonth(Math.max(0, Math.min(months, next))) }
  }
  const views = <>
    <div className="delay-chart-views" role="group" aria-label="Timeline chart view">
      <button type="button" aria-pressed={view === 'balances'} onClick={() => setView('balances')}>Price & cash</button>
      <button type="button" aria-pressed={view === 'changes'} onClick={() => setView('changes')}>Changes since today</button>
    </div>
    <div className="delay-chart-legend">{series.map(s => <span key={s.label}><svg width="24" height="10" aria-hidden="true"><line x1="0" x2="24" y1="5" y2="5" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} /></svg>{s.label}</span>)}</div>
  </>
  const pressure = <>
    <div className="delay-chart-pressure" role="region" aria-label="Cost of waiting" aria-live="polite" aria-atomic="true">
      <p className="eyebrow">{elapsed(month)} · COST OF WAITING</p>
      <dl className="delay-pressure-metrics">
        <div><dt>New savings offset by higher purchase costs</dt><dd>{offsetLabel}</dd><small>{offsetShare === null ? 'No new savings have accumulated at this checkpoint.' : 'Purchase-cost rise ÷ new savings from income'}</small></div>
        <div><dt>Net purchase progress</dt><dd>{money(netProgress)}</dd><small>Added purchase cash − extra purchase cost</small></div>
      </dl>
      <p className="india-note">{netProgress < -.5 ? 'Your cash has fallen behind the change in purchase cost; your funding margin is smaller.' : netProgress > .5 ? 'Your added cash is ahead of the purchase-cost increase by this amount.' : 'Your added cash and purchase-cost change are keeping pace.'} {extraCost < -.5 ? 'Falling purchase costs help your progress.' : extraCost > .5 ? 'Higher purchase costs offset the savings you accumulate.' : 'Purchase costs have not increased at this checkpoint.'}</p>
    </div>
  </>
  const plot = <>
    <div ref={plotRef} className="delay-chart-plot">
      <svg viewBox={`0 0 ${width} ${height}`} tabIndex={0} role="group" aria-label="Savings and house price timeline" aria-describedby={`${id}-help`}
        onPointerDown={inspect} onPointerMove={inspect} onKeyDown={keyboard}>
        <title>House price, purchase cash, and the cost of waiting</title>
        <desc>Use the month slider or left and right arrow keys to inspect monthly amounts. The changes view compares additional purchase costs with savings and investment growth. The dashed net-progress line subtracts the extra purchase cost from added purchase cash; below zero means falling behind.</desc>
        {ticks.map(value => <g key={value}><line className={value === 0 ? 'delay-zero-line' : 'grid-line'} x1={left} x2={width - right} y1={sy(value)} y2={sy(value)} /><text className="axis-text" x={left - 10} y={sy(value) + 4} textAnchor="end">{shortMoney(value)}</text></g>)}
        {xTicks.map(m => <text key={m} className="axis-text" x={sx(m)} y={height - 22} textAnchor={m === 0 ? 'start' : m === months ? 'end' : 'middle'}>{number(m / 12)} yr</text>)}
        {series.map(s => <path key={s.label} d={points.map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(s.value(p))}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />)}
        <line className="selected-line" x1={sx(month)} x2={sx(month)} y1={top} y2={height - bottom} />
        {series.map(s => <circle key={s.label} cx={sx(month)} cy={sy(s.value(point))} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
      </svg>
    </div>
  </>
  const control = <>
    <label className="delay-month-control" htmlFor={`${id}-month`}><span>Inspect month <strong>{elapsed(month)}</strong></span>
      <input id={`${id}-month`} aria-label="Inspect month" type="range" min={0} max={months} step={1} value={month} aria-valuetext={elapsed(month)} onChange={e => setSelectedMonth(Number(e.target.value))} />
    </label>
    <p className="delay-chart-help" id={`${id}-help`}>{presentation === 'compact' ? 'Drag the slider or use arrow keys to inspect a month. Both charts and the formulas follow this selection.' : 'Hover or tap the chart, drag the slider, or use arrow keys. Home selects today; End selects your purchase date.'}</p>
  </>
  const inspector = <>
    <div className="delay-chart-inspector" role="region" aria-label="Selected month amounts" aria-live="polite" aria-atomic="true">
      <p className="eyebrow">{elapsed(month)}</p>
      <dl className="india-metrics">
        <div className="india-metric"><dt>House price</dt><dd>{money(point.price)}</dd><small>Price change: {money(extraPrice)}</small></div>
        <div className="india-metric"><dt>Extra purchase cost</dt><dd>{money(extraCost)}</dd><small>Price change + {money(extraFees)} change in upfront costs</small></div>
        <div className="india-metric"><dt>Savings set aside while waiting</dt><dd>{money(point.savingsContributions)}</dd><small>New savings from income, after rent and living expenses</small></div>
        <div className="india-metric"><dt>Investment gain / loss</dt><dd>{money(point.investmentGrowth)}</dd><small>Return on starting purchase cash and new savings</small></div>
        <div className="india-metric"><dt>Available purchase cash</dt><dd>{money(point.capacity.availableCash)}</dd><small>Starting cash + savings + returns</small></div>
        <div className="india-metric"><dt>Change in required loan</dt><dd>{money(loanChange)}</dd><small>Compared with buying today; a negative value means less borrowing</small></div>
      </dl>
      <p className="india-note">Purchase cash added: <strong>{money(extraCash)}</strong> = {money(point.savingsContributions)} saved from income + {money(point.investmentGrowth)} investment gain / loss. Starting cash of {money(current.capacity.availableCash)} was already available today.</p>
    </div>
  </>
  const notes = <>
    <p className="india-note">{delay.rentGrowth !== undefined ? `Savings set aside are the positive mortgage–rent differences, adjusted for rent increases${delay.waitingEnabled ? ', plus 90% of income increases while waiting' : ''}. Mortgage–rent deposits stop after the reference loan term.` : '“Savings set aside” uses your entered savings share.'} Net purchase progress measures cash growth after allowing for the change in purchase cost; it is not a buy-versus-rent wealth return. Higher costs can offset over 100% of new savings. This does not mean those savings have been spent. Rent is still paid, and owning would have other costs. Extra purchase cost is the change in the complete price plus upfront costs; the whole increase is not an upfront cash requirement.</p>
  </>
  const data = <>
    <details className="india-chart-data"><summary>View monthly savings and price data</summary><div className="table-scroll" role="region" aria-label="Monthly savings and price data" tabIndex={0}><table><caption>Monthly checkpoints; additional costs and cash are measured from today.</caption><thead><tr><th scope="col">Month</th><th scope="col">House price</th><th scope="col">Extra purchase cost</th><th scope="col">Savings set aside</th><th scope="col">Investment gain / loss</th><th scope="col">Available purchase cash</th><th scope="col">Added purchase cash</th><th scope="col">Net purchase progress</th><th scope="col">Change in required loan</th></tr></thead><tbody>{points.map((p, i) => <tr key={i}><th scope="row">{i}</th><td>{money(p.price)}</td><td>{money(p.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost)}</td><td>{money(p.savingsContributions)}</td><td>{money(p.investmentGrowth)}</td><td>{money(p.capacity.availableCash)}</td><td>{money(p.capacity.availableCash - current.capacity.availableCash)}</td><td>{money((p.capacity.availableCash - current.capacity.availableCash) - (p.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost))}</td><td>{money(p.capacity.requiredLoan - current.capacity.requiredLoan)}</td></tr>)}</tbody></table></div></details>
  </>
  if (presentation === 'compact') return <section className="india-delay-chart compact-delay" aria-label="Savings and house-price comparison">
    {control}
    <PurchaseDelayBars current={current} point={point} automaticSavings={delay.rentGrowth !== undefined} />
    <details className="compact-disclosure"><summary>Explore monthly timeline</summary>
      {views}{plot}{pressure}{inspector}{notes}{data}
    </details>
    <details className="compact-disclosure"><summary>How this was calculated</summary>
      <PurchaseDelayCalculations current={current} point={point} product={product} household={household} delay={delay} />
    </details>
  </section>
  return <section className="india-delay-chart" aria-labelledby={`${id}-heading`}>
    <div className="section-label"><h3 id={`${id}-heading`}>Savings vs rising house prices</h3><span>Monthly checkpoints · nominal INR</span></div>
    <p className="india-note">Follow the cash you put aside while waiting to buy and the change in what this home costs.</p>
    {views}
    {pressure}
    {plot}
    {control}
    <PurchaseDelayBars current={current} point={point} automaticSavings={delay.rentGrowth !== undefined} />
    {inspector}
    <PurchaseDelayCalculations current={current} point={point} product={product} household={household} delay={delay} />
    {notes}
    {data}
  </section>
}
