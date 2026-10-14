import { useId } from 'react'
import type { IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayPoint } from './india'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const pct = (n: number) => `${number(n * 100)}%`
const shortMoney = (n: number) => Math.abs(n) >= 1e7 ? `₹${number(n / 1e7)} cr` : Math.abs(n) >= 1e5 ? `₹${number(n / 1e5)} L` : money(n)
const monthLabel = (point: PurchaseDelayPoint) => `Month ${Math.round(point.years * 12)} · ${number(point.years)} years`

export function PurchaseDelayBars({ current, point, interactive = true }: { current: PurchaseDelayPoint; point: PurchaseDelayPoint; interactive?: boolean }) {
  const id = useId()
  const priceChange = point.price - current.price
  const bars = [
    { label: 'New savings from income', value: point.savingsContributions, color: 'var(--chart-effective)' },
    { label: 'House-price change', value: priceChange, color: 'var(--chart-cost)' },
  ]
  const minValue = Math.min(0, ...bars.map(b => b.value)), maxValue = Math.max(1, ...bars.map(b => b.value))
  const targetStep = (maxValue - minValue) / 4, magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= targetStep) ?? 10) * magnitude)
  const min = Math.floor(minValue / step) * step, max = Math.ceil(maxValue / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step)
  const position = (value: number) => (value - min) / (max - min) * 100
  return <section className="delay-bar-section" aria-labelledby={`${id}-heading`}>
    <div className="section-label"><h3 id={`${id}-heading`}>Savings vs house-price increase</h3><span>{monthLabel(point)}</span></div>
    <p className="india-note">Cumulative amounts since today. {interactive ? 'Move the month slider above to update both charts.' : 'Change the waiting period above to update these amounts. Explore further to inspect individual months.'}</p>
    <div className="delay-bars" role="img" aria-label={`Savings versus house-price change at month ${Math.round(point.years * 12)}: new savings from income ${money(point.savingsContributions)}; house-price change ${money(priceChange)}.`}>
      {bars.map(bar => <div className="delay-bar-row" key={bar.label}>
        <div className="delay-bar-label"><span>{bar.label}</span><strong>{money(bar.value)}</strong></div>
        <div className="delay-bar-track"><span className="delay-bar-zero" style={{ left: `${position(0)}%` }} /><span className="delay-bar-fill" style={{ backgroundColor: bar.color, left: `${position(Math.min(0, bar.value))}%`, width: `${Math.abs(bar.value) / (max - min) * 100}%` }} /></div>
      </div>)}
      <div className="delay-bar-axis" aria-hidden="true">{ticks.map((tick, i) => <span key={tick} style={{ left: `${position(tick)}%`, transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{shortMoney(tick)}</span>)}</div>
    </div>
    <p className="india-note">Savings are new income contributions after rent and living expenses. The house-price bar shows the property-price change; investment returns and upfront charges enter the detailed calculation below.</p>
  </section>
}

export function PurchaseDelayCalculations({ current, point, product, household, delay }: {
  current: PurchaseDelayPoint; point: PurchaseDelayPoint; product: IndiaProduct; household: IndiaHousehold; delay: PurchaseDelay;
}) {
  const id = useId(), months = Math.round(point.years * 12)
  const startingCash = current.capacity.availableCash
  const priceChange = point.price - current.price
  const feeChange = point.capacity.purchaseCosts - current.capacity.purchaseCosts
  const extraCost = point.capacity.totalPurchaseCost - current.capacity.totalPurchaseCost
  const addedCash = point.capacity.availableCash - startingCash
  const netProgress = addedCash - extraCost
  const offsetPercent = point.savingsContributions > 0 ? Math.max(0, extraCost) / point.savingsContributions * 100 : null
  const monthlyReturn = Math.expm1(Math.log1p(delay.savingsReturn) / 12)
  const fixedSavings = delay.monthlySavings !== undefined
  const startingMonthlySavings = delay.monthlySavings ?? household.annualIncome * household.savingsRate / 12
  const savingsPeriods = Array.from({ length: Math.ceil(months / 12) }, (_, year) => {
    const count = Math.min(12, months - year * 12)
    const income = household.annualIncome * (1 + delay.incomeGrowth) ** year
    const monthly = delay.monthlySavings ?? income * household.savingsRate / 12
    return { year: year + 1, count, income, monthly, total: monthly * count }
  })
  const rows: { label: string; formula: string; result: string }[] = [
    { label: 'Starting purchase cash', formula: `${money(household.liquidFunds)} liquid purchase funds`, result: money(startingCash) },
    { label: 'House price at this month', formula: `${money(current.price)} × (1 + ${pct(product.appreciation)})^(${months} ÷ 12)`, result: money(point.price) },
    { label: 'House-price change', formula: `${money(point.price)} − ${money(current.price)}`, result: money(priceChange) },
    { label: 'Extra upfront purchase costs', formula: `${money(priceChange)} × ${pct(product.purchaseCostRate)}`, result: money(feeChange) },
    { label: 'Extra total purchase cost', formula: `${money(priceChange)} price change + ${money(feeChange)} change in upfront costs`, result: money(extraCost) },
    { label: 'Starting monthly savings', formula: fixedSavings ? `${money(startingMonthlySavings)} fixed monthly amount entered for waiting to buy` : `${money(household.annualIncome / 12)} monthly take-home income × ${pct(household.savingsRate)}`, result: money(startingMonthlySavings) },
    { label: 'New savings from income', formula: fixedSavings || delay.incomeGrowth === 0 ? `${money(startingMonthlySavings)} per month × ${months} months` : `Sum of monthly savings over ${months} months; see contributions by year below`, result: money(point.savingsContributions) },
    { label: 'Investment gain / loss', formula: `${money(point.capacity.availableCash)} ending cash − ${money(startingCash)} starting cash − ${money(point.savingsContributions)} new savings`, result: money(point.investmentGrowth) },
    { label: 'Added purchase cash', formula: `${money(point.savingsContributions)} new savings + ${money(point.investmentGrowth)} investment gain / loss`, result: money(addedCash) },
    { label: 'Available purchase cash', formula: `${money(startingCash)} starting cash + ${money(addedCash)} added cash`, result: money(point.capacity.availableCash) },
    { label: 'Net purchase progress', formula: `${money(addedCash)} added cash − ${money(extraCost)} extra purchase cost`, result: money(netProgress) },
    { label: 'New savings offset by higher costs', formula: offsetPercent !== null ? `${money(Math.max(0, extraCost))} purchase-cost rise ÷ ${money(point.savingsContributions)} new savings × 100` : 'No new income savings at this checkpoint; ratio unavailable', result: offsetPercent === null ? 'Unavailable' : offsetPercent > 10000 ? '>10,000%' : `${number(offsetPercent)}%` },
    { label: 'Required home loan', formula: `max(0, ${money(point.capacity.totalPurchaseCost)} total purchase cost − ${money(point.capacity.availableCash)} available cash)`, result: money(point.capacity.requiredLoan) },
  ]
  return <section className="delay-calculations" aria-labelledby={`${id}-heading`}>
    <div className="section-label"><h3 id={`${id}-heading`}>Detailed calculation</h3><span>{monthLabel(point)}</span></div>
    <div className="table-scroll" role="region" aria-label="Detailed waiting calculation" tabIndex={0}><table className="delay-calculation-table"><caption>Substituted values for the selected month. Displayed amounts are rounded to rupees; calculations retain full precision.</caption><thead><tr><th scope="col">Measure</th><th scope="col">Calculation</th><th scope="col">Result</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.formula}</td><td>{row.result}</td></tr>)}</tbody></table></div>
    <p className="india-note">Entered annual savings return: <strong>{pct(delay.savingsReturn)} per year</strong>, after taxes and fees. For monthly compounding, the equivalent monthly rate = (1 + {pct(delay.savingsReturn)})^(1 ÷ 12) − 1 = <strong>{(monthlyReturn * 100).toLocaleString('en-IN', { maximumFractionDigits: 6 })}%</strong>. Twelve monthly growth factors compound to your entered annual rate. Each month, purchase cash = previous month’s cash × (1 + monthly rate) + that month’s savings. Deposits occur at month-end.</p>
    <details className="delay-savings-periods"><summary>Savings contributions by year</summary><div className="table-scroll" role="region" aria-label="Savings contributions by year" tabIndex={0}><table><caption>{fixedSavings ? `Fixed savings of ${money(startingMonthlySavings)} per month; no progressive income increase is included.` : `Income increases on anniversaries. Annual savings share: ${pct(household.savingsRate)}.`} A partial final year includes only the months waited.</caption><thead><tr><th scope="col">Year of waiting</th>{!fixedSavings && <th scope="col">Annual after-tax income</th>}<th scope="col">Monthly calculation</th><th scope="col">Months saved</th><th scope="col">Savings contributed</th></tr></thead><tbody>{savingsPeriods.map(period => <tr key={period.year}><th scope="row">{period.year}</th>{!fixedSavings && <td>{money(period.income)}</td>}<td>{fixedSavings ? `${money(period.monthly)} per month × ${period.count} months` : `${money(period.income)} × ${pct(household.savingsRate)} ÷ 12 = ${money(period.monthly)}`}</td><td>{period.count}</td><td>{money(period.total)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={fixedSavings ? 3 : 4}>Total new savings from income</th><td>{money(point.savingsContributions)}</td></tr></tfoot></table></div>{months === 0 && <p className="india-note">Today is the starting point; no monthly deposits have been made yet.</p>}</details>
  </section>
}
