import { useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { Simulation } from './engine'
import { calculationJson, createCalculationReport, monthlyCsv } from './report'
import type { AuditMonth, CalculationReport as Report, PortfolioBreakdown } from './report'
import './CalculationReport.css'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value) < .005 ? 0 : value)
const rate = (value: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 6 }).format(value)
const decimal = (value: number) => Number(value.toPrecision(12)).toString()

function Formula({ title, expression, working, note }: { title: string; expression: string; working: string; note?: string }) {
  return <section className="report-formula"><h4>{title}</h4><p className="formula-expression">{expression}</p><p className="formula-working">{working}</p>{note && <p className="formula-note">{note}</p>}</section>
}

function Portfolio({ title, portfolio, isRenter }: { title: string; portfolio: PortfolioBreakdown; isRenter: boolean }) {
  const rows: [string, number][] = isRenter ? [
    ['Initial down payment invested', portfolio.downPayment],
    ['Avoided closing costs invested', portfolio.closingCosts],
    ['Gain / loss on down payment', portfolio.downPaymentGrowth],
    ['Gain / loss on closing costs', portfolio.closingCostsGrowth],
    ['Monthly savings contributed', portfolio.monthlyContributions],
    ['Gain / loss on monthly savings', portfolio.contributionGrowth],
  ] : [['Initial investment', portfolio.initialCapital], ['Monthly savings contributed', portfolio.monthlyContributions], ['Gain / loss on monthly savings', portfolio.contributionGrowth]]
  return <section className="report-portfolio"><h4>{title}</h4><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}<div className="portfolio-total"><dt>Ending investment balance</dt><dd>{money(portfolio.endingBalance)}</dd></div></dl>
    <p className="formula-note">{isRenter ? 'Initial funds compound for the entire holding period; monthly contributions compound from their deposit dates.' : 'The buyer starts with no investment account. The down payment goes into the home; savings are invested when renting costs more.'}</p></section>
}

function MonthlyInspection({ month: m, report: r }: { month: AuditMonth; report: Report }) {
  const x = r.inputs, eligible = m.interest + (x.includePropertyTax ? m.propertyTax : 0)
  const expenseYear = m.year - 1
  return <section className="month-inspection" aria-labelledby="month-inspection-title">
    <div className="report-section-heading"><div><p className="eyebrow">TRACE A MONTH</p><h3 id="month-inspection-title">Month {m.month} calculations</h3></div><span>Year {m.year} · Month {(m.month - 1) % 12 + 1}</span></div>
    <div className="formula-grid">
      <Formula title="Mortgage interest" expression="Interest = starting loan balance × annual mortgage rate ÷ 12" working={`${money(m.startingBalance)} × ${decimal(x.mortgageRate)} ÷ 12 = ${money(m.interest)}`} />
      <Formula title="Actual mortgage payment" expression={m.startingBalance > 0 ? 'Payment = min(balance + interest, scheduled payment + requested extra)' : 'Payment = 0 after payoff'} working={m.startingBalance > 0 ? `min(${money(m.startingBalance + m.interest)}, ${money(r.scheduledPayment)} + ${money(x.extra)}) = ${money(m.payment)}` : `${money(m.payment)}`} note={`This payment includes ${money(m.scheduledPayment)} scheduled P&I and ${money(m.extraPrincipal)} actual extra principal.`} />
      <Formula title="Principal and remaining debt" expression="Principal = payment − interest; ending balance = starting balance − principal" working={`${money(m.payment)} − ${money(m.interest)} = ${money(m.principal)} principal; ${money(m.startingBalance)} − ${money(m.principal)} = ${money(m.balance)} remaining`} note="Principal builds equity by reducing debt. It is not added again to ending wealth." />
      <Formula title="Rent and expense escalation" expression="Rent = initial rent × (1 + rent growth)^completed years" working={`${money(x.rent)} × (1 + ${decimal(x.rentGrowth)})^${expenseYear} = ${money(m.rent)}`} note={`Ownership expense percentages use purchase price, then expense inflation. Inflation multiplier this month: (1 + ${decimal(x.inflation)})^${expenseYear} = ${decimal((1 + x.inflation) ** expenseYear)}. Annual dollar costs are divided by 12; PMI stays fixed until cancellation.`} />
      <Formula title="Estimated tax savings" expression={`Savings = ${x.includePropertyTax ? '(mortgage interest + property tax)' : 'mortgage interest'} × effective tax benefit`} working={`${money(eligible)} × ${decimal(x.taxBenefit)} = ${money(m.taxSaving)}`} note="Uses the calculated effective estimate; it does not apply tax-law thresholds automatically." />
      <Formula title="Buy cash outflow" expression="Buy = payment + property tax + insurance + maintenance + HOA + PMI + other − tax savings" working={`${money(m.payment)} + ${money(m.propertyTax)} + ${money(m.insurance)} + ${money(m.maintenance)} + ${money(m.hoa)} + ${money(m.pmi)} + ${money(m.otherOwner)} − ${money(m.taxSaving)} = ${money(m.buyCost)}`} />
      <Formula title="Rent cash outflow" expression="Rent cost = rent + renters insurance + other renter expenses" working={`${money(m.rent)} + ${money(m.rentersInsurance)} + ${money(m.otherRenter)} = ${money(m.rentCost)}`} />
      <Formula title="Savings invested" expression="Difference = buy cost − rent cost; renter invests max(0, difference); buyer invests max(0, −difference)" working={`${money(m.buyCost)} − ${money(m.rentCost)} = ${money(m.cashFlowDifference)}; renter contributes ${money(m.renterContribution)}, buyer contributes ${money(m.buyerContribution)}`} />
      <Formula title="Renter investment account" expression="Ending portfolio = starting portfolio × (1 + monthly return) + month-end contribution" working={`${money(m.startingRenterPortfolio)} × (1 + ${decimal(r.rates.monthlyInvestment)}) + ${money(m.renterContribution)} = ${money(m.renterPortfolio)}`} note={`This month's investment gain / loss: ${money(m.renterGrowth)}. Contributions arrive after growth.`} />
      <Formula title="Buyer investment account" expression="Ending portfolio = starting portfolio × (1 + monthly return) + month-end contribution" working={`${money(m.startingBuyerPortfolio)} × (1 + ${decimal(r.rates.monthlyInvestment)}) + ${money(m.buyerContribution)} = ${money(m.buyerPortfolio)}`} note={`This month's investment gain / loss: ${money(m.buyerGrowth)}.`} />
    </div>
  </section>
}

type View = 'mortgage' | 'housing' | 'investments'
const views: { id: View; label: string }[] = [{ id: 'mortgage', label: 'Mortgage' }, { id: 'housing', label: 'Housing costs' }, { id: 'investments', label: 'Investments' }]
const ledgerColumns: Record<View, { key: keyof AuditMonth; label: string }[]> = {
  mortgage: [
    { key: 'startingBalance', label: 'Starting balance' }, { key: 'scheduledPayment', label: 'Scheduled P&I paid' },
    { key: 'extraPrincipal', label: 'Extra principal' }, { key: 'payment', label: 'Actual payment' },
    { key: 'interest', label: 'Interest' }, { key: 'principal', label: 'Total principal' }, { key: 'balance', label: 'Ending balance' },
  ],
  housing: [
    { key: 'payment', label: 'Mortgage payment' }, { key: 'propertyTax', label: 'Property tax' },
    { key: 'insurance', label: 'Home insurance' }, { key: 'maintenance', label: 'Maintenance' }, { key: 'hoa', label: 'HOA' },
    { key: 'pmi', label: 'PMI' }, { key: 'otherOwner', label: 'Other owner' }, { key: 'taxSaving', label: 'Tax savings' },
    { key: 'buyCost', label: 'Buy total' }, { key: 'rent', label: 'Rent' }, { key: 'rentersInsurance', label: 'Renters insurance' },
    { key: 'otherRenter', label: 'Other renter' }, { key: 'rentCost', label: 'Rent total' }, { key: 'cashFlowDifference', label: 'Buy − rent' },
  ],
  investments: [
    { key: 'startingRenterPortfolio', label: 'Renter starts' }, { key: 'renterGrowth', label: 'Renter gain / loss' },
    { key: 'renterContribution', label: 'Renter invests' }, { key: 'renterPortfolio', label: 'Renter ends' },
    { key: 'startingBuyerPortfolio', label: 'Buyer starts' }, { key: 'buyerGrowth', label: 'Buyer gain / loss' },
    { key: 'buyerContribution', label: 'Buyer invests' }, { key: 'buyerPortfolio', label: 'Buyer ends' },
  ],
}

function download(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CalculationReport({ s, dirty, reportRef }: { s: Simulation; dirty: boolean; reportRef: RefObject<HTMLDetailsElement | null> }) {
  const r = useMemo(() => createCalculationReport(s), [s])
  const [selection, setSelection] = useState<{ simulation: Simulation; year: number; month: number; view: View }>({ simulation: s, year: 1, month: 1, view: 'mortgage' })
  // Recalculation resets inspection to the new simulation's first month without closing the report.
  const current = selection.simulation === s ? selection : { simulation: s, year: 1, month: 1, view: 'mortgage' as View }
  const yearMonths = r.months.filter(m => m.year === current.year)
  const selected = r.months[current.month - 1]
  const last = r.months[r.months.length - 1], loanMonths = Math.round(r.inputs.term * 12)
  const years = [...new Set(r.months.map(m => m.year))]
  const selectView = (view: View) => setSelection({ ...current, view })
  const mortgageWorking = r.initial.mortgage === 0 ? `Cash purchase: ${money(0)} monthly P&I` : r.rates.monthlyMortgage === 0
    ? `${money(r.initial.mortgage)} ÷ ${loanMonths} = ${money(r.scheduledPayment)}`
    : `${money(r.initial.mortgage)} × ${decimal(r.rates.monthlyMortgage)} ÷ [1 − (1 + ${decimal(r.rates.monthlyMortgage)})^(−${loanMonths})] = ${money(r.scheduledPayment)}`
  return <details id="calculation-report" className="calculation-report" ref={reportRef}>
    <summary><span><span className="eyebrow">FOLLOW THE NUMBERS</span><span className="report-title">Calculation report</span></span><span className="report-summary-action">Explore formulas & monthly data <span aria-hidden="true">↗</span></span></summary>
    <div className="report-content">
      <div className="report-intro"><p>{money(r.inputs.price)} purchase · {r.holdingMonths} months · {rate(r.inputs.investmentReturn)} annual investment return</p><p>Money is displayed to cents. Calculations use unrounded values; rounded steps may differ by a cent. Downloads retain full numeric precision.</p></div>
      {dirty && <p className="report-stale">These details and downloads use your last calculated assumptions. Calculate again to include your edits.</p>}
      <div className="report-downloads"><button type="button" onClick={() => download(monthlyCsv(r), 'text/csv;charset=utf-8', 'home-rent-monthly.csv')}>Download monthly CSV <span aria-hidden="true">↓</span></button><button type="button" onClick={() => download(calculationJson(r), 'application/json', 'home-rent-calculation.json')}>Download calculation JSON <span aria-hidden="true">↓</span></button><p>Includes all {r.holdingMonths} months, regardless of the ledger view.</p></div>
      <section className="report-section"><div className="report-section-heading"><div><p className="eyebrow">01 / STARTING POINT</p><h3>Capital, mortgage & compounding</h3></div></div>
        <div className="formula-grid"><Formula title="Initial mortgage" expression="Mortgage = purchase price − down payment" working={`${money(r.inputs.price)} − ${money(r.initial.downPayment)} = ${money(r.initial.mortgage)}`} />
          <Formula title="Renter's initial investment" expression="Initial investment = down payment + avoided closing costs" working={`${money(r.initial.downPayment)} + ${money(r.initial.closingCosts)} = ${money(r.initial.renterInvestment)}`} />
          <Formula title="Scheduled mortgage payment" expression={r.initial.mortgage === 0 ? 'Payment = 0 for a cash purchase' : r.rates.monthlyMortgage === 0 ? 'Payment = mortgage ÷ loan months (zero interest)' : 'Payment = mortgage × r ÷ [1 − (1 + r)^(−loan months)]'} working={mortgageWorking} note={`r = annual mortgage rate / 12 = ${decimal(r.rates.monthlyMortgage)}. Actual extra payments and payoff limits are shown in the monthly ledger.`} />
          <Formula title="Monthly investment return" expression="Monthly return = (1 + effective annual return)^(1/12) − 1" working={`(1 + ${decimal(r.inputs.investmentReturn)})^(1/12) − 1 = ${decimal(r.rates.monthlyInvestment)} (${rate(r.rates.monthlyInvestment)} per month)`} note="Both portfolios grow at this rate before each month's savings are contributed." />
        </div>
      </section>
      <section className="report-section"><div className="report-section-heading"><div><p className="eyebrow">02 / INVESTMENT GROWTH</p><h3>Where the ending portfolios come from</h3></div></div>
        <div className="portfolio-grid"><Portfolio title="Rent + invest" portfolio={r.portfolios.renter} isRenter /><Portfolio title="Buyer's investment account" portfolio={r.portfolios.buyer} isRenter={false} /></div>
        <div className="formula-grid"><Formula title="Return on the down payment" expression="Gain / loss = down payment × [(1 + monthly return)^holding months − 1]" working={`${money(r.initial.downPayment)} × [(1 + ${decimal(r.rates.monthlyInvestment)})^${r.holdingMonths} − 1] = ${money(r.portfolios.renter.downPaymentGrowth)}`} />
          <Formula title="Return on closing costs" expression="Gain / loss = avoided closing costs × [(1 + monthly return)^holding months − 1]" working={`${money(r.initial.closingCosts)} × [(1 + ${decimal(r.rates.monthlyInvestment)})^${r.holdingMonths} − 1] = ${money(r.portfolios.renter.closingCostsGrowth)}`} />
        </div>
      </section>
      <section className="report-section"><div className="report-section-heading"><div><p className="eyebrow">03 / SOLVE THE SALE PRICE</p><h3>{r.result.status === 'solved' ? 'The break-even equation' : 'Why no positive sale threshold is needed'}</h3></div></div>
        <div className="formula-grid"><Formula title="Required sale price" expression="Sale price = (renter portfolio + mortgage balance − buyer portfolio + fixed selling costs) ÷ (1 − selling rate)" working={`(${money(last.renterPortfolio)} + ${money(last.balance)} − ${money(last.buyerPortfolio)} + ${money(r.sale.fixedCosts)}) ÷ (1 − ${decimal(r.sale.costRate)}) = ${money(r.sale.algebraicSalePrice)}`} note={r.result.status === 'buy-always' ? 'The algebraic price is nonpositive. The model evaluates a zero sale price and reports buying already ahead; it does not claim a positive break-even sale.' : 'Percentage selling costs apply to the sale price. Fixed selling costs enter the numerator instead.'} />
          {r.result.status === 'solved' ? <Formula title="Required annual appreciation" expression="CAGR = (required sale price ÷ purchase price)^(12 / holding months) − 1" working={`(${money(r.result.salePrice)} ÷ ${money(r.inputs.price)})^(12 / ${r.holdingMonths}) − 1 = ${rate(r.result.appreciation)} per year`} note={r.result.appreciation < 0 ? 'A negative rate means buying can tolerate a decline to this sale price and still match renting under these assumptions.' : 'A constant compounded rate reaches the required sale price at the end of the holding period.'} /> : <Formula title="No appreciation threshold" expression="Buyer wealth at zero sale price ≥ renter wealth" working={`${money(r.result.buyerWealth)} ≥ ${money(r.result.renterWealth)}; buyer advantage ${money(r.result.difference)}`} note="No CAGR is reported for this case. The zero sale price is a boundary check, not a solved appreciation scenario." />}
          <Formula title={r.result.status === 'solved' ? 'Buyer wealth at break even' : 'Buyer wealth at zero sale price'} expression="Buyer wealth = sale price − selling costs − mortgage balance + buyer portfolio" working={`${money(r.result.salePrice)} − ${money(r.result.sellingCosts)} − ${money(last.balance)} + ${money(last.buyerPortfolio)} = ${money(r.result.buyerWealth)}`} />
          <Formula title="Wealth reconciliation" expression="Difference = buyer wealth − renter portfolio" working={`${money(r.result.buyerWealth)} − ${money(r.result.renterWealth)} = ${money(r.result.difference)}`} note={r.result.status === 'solved' ? 'The unrounded result matches the renter portfolio. Displayed appreciation is rounded; downloads contain the full result.' : 'This is the buyer advantage at the zero-price boundary, not an equality at break even.'} />
        </div>
      </section>
      <section className="report-section" aria-labelledby="monthly-ledger-title"><div className="report-section-heading"><div><p className="eyebrow">04 / MONTHLY LEDGER</p><h3 id="monthly-ledger-title">Inspect every payment and deposit</h3></div><label className="ledger-year">Year<select aria-label="Ledger year" value={current.year} onChange={e => { const year = Number(e.target.value); setSelection({ ...current, year, month: r.months.find(m => m.year === year)!.month }) }}>{years.map(year => <option key={year} value={year}>Year {year}</option>)}</select></label></div>
        <div className="ledger-tabs" role="tablist" aria-label="Monthly ledger views">{views.map((view, i) => <button key={view.id} id={`ledger-tab-${view.id}`} type="button" role="tab" aria-selected={current.view === view.id} aria-controls="ledger-panel" tabIndex={current.view === view.id ? 0 : -1} onClick={() => selectView(view.id)} onKeyDown={e => { const index = e.key === 'ArrowRight' ? (i + 1) % views.length : e.key === 'ArrowLeft' ? (i + views.length - 1) % views.length : e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : -1; if (index >= 0) { e.preventDefault(); selectView(views[index].id); requestAnimationFrame(() => document.getElementById(`ledger-tab-${views[index].id}`)?.focus()) } }}>{view.label}</button>)}</div>
        <div id="ledger-panel" role="tabpanel" aria-labelledby={`ledger-tab-${current.view}`}><div className="table-scroll ledger-scroll" tabIndex={0} role="region" aria-label="Scrollable monthly ledger"><table className="monthly-ledger"><caption>Year {current.year} · {yearMonths.length} months · USD. Select a month number for its calculation steps.</caption><thead><tr><th scope="col">Month</th>{ledgerColumns[current.view].map(c => <th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{yearMonths.map(m => <tr key={m.month} className={current.month === m.month ? 'selected-row' : ''}><th scope="row"><button type="button" aria-label={`Inspect month ${m.month}`} aria-pressed={current.month === m.month} onClick={() => setSelection({ ...current, month: m.month })}>{m.month}</button></th>{ledgerColumns[current.view].map(c => <td key={c.key}>{money(m[c.key])}</td>)}</tr>)}</tbody></table></div></div>
      </section>
      <MonthlyInspection report={r} month={selected} />
      <p className="report-model-note">Percentage ownership costs use the original purchase price and expense inflation, not the solved home value. Tax benefits use your effective estimate. These downloads are generated locally in your browser.</p>
    </div>
  </details>
}
