import { useId, useState } from 'react'
import { requiredIncomeGrowth } from './incomeGrowth'
import NumberField from './IndiaField'
import type { FieldError } from './india'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function IncomeGrowthAssessment({ mortgage, loanAmount, years, monthlyIncome, projectedIncome }: { mortgage: number; loanAmount: number; years: number; monthlyIncome: number; projectedIncome: number }) {
  const id = useId()
  const [share, setShare] = useState(.4)
  const [existing, setExisting] = useState(0)
  const errors: FieldError[] = []
  for (const [path, value, max, label] of [['share', share, 1, 'loan-payment limit'], ['existing', existing, 1e12, 'existing loan payments']] as const) {
    if (!Number.isFinite(value) || value < 0 || value > max) errors.push({ path, message: `Enter a valid ${label} from 0 to ${path === 'share' ? '100%' : max.toLocaleString('en-IN')}.` })
  }
  const result = !errors.length ? requiredIncomeGrowth({ monthlyIncome, monthlyMortgage: mortgage, mortgageAmount: loanAmount, existingPayments: existing, paymentShare: share, years: Math.floor(years) }) : null
  return <details className="compact-disclosure income-growth-assessment"><summary>Income growth needed per year</summary>
    <section aria-labelledby={`${id}-heading`}><div className="section-label"><h2 id={`${id}-heading`}>A separate income check</h2><span>Purchase after {years.toLocaleString('en-IN')} years</span></div>
      <p className="india-note">Today’s monthly take-home: {money(monthlyIncome)}. Projected after waiting: {money(projectedIncome)}. Required income must cover both the EMI limit and a mortgage no larger than 4× annual take-home income. The growth requirement is for the loan projected with your entered increment; changing the increment also changes savings and the projected loan. These loan-limit fields do not change savings or the mortgage amount.</p>
      <div className="compact-input-grid">
        <NumberField label="Loan-payment limit" path="share" value={share} onChange={setShare} rate unit="% income" errors={errors} />
        <NumberField label="Other monthly loan payments" path="existing" value={existing} onChange={setExisting} unit="₹/mo" errors={errors} />
      </div>
      {result ? <><dl className="compact-waiting-metrics income-growth-metrics" aria-live="polite">
        <div><dt>Projected monthly mortgage</dt><dd>{money(mortgage)}</dd></div>
        <div><dt>Required monthly income</dt><dd>{result.requiredMonthlyIncome === null ? 'Unavailable' : money(result.requiredMonthlyIncome)}</dd></div>
        <div><dt>Required annual income growth</dt><dd>{result.annualGrowth === null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 2 }).format(result.annualGrowth)}</dd></div>
      </dl><p className="india-note">{result.status === 'covered' ? 'Your current income already covers both limits; no income increase is needed.' : result.status === 'zero-income' ? 'A growth percentage cannot be computed from zero income. The required monthly income is shown above.' : result.status === 'no-time' ? 'Before the first anniversary, no annual increment has occurred. The required income must be available today.' : result.status === 'no-budget' ? 'A 0% loan-payment limit cannot cover positive loan payments.' : 'Annual growth = (required monthly income ÷ current monthly income)^(1 ÷ completed years) − 1. Increments occur on anniversaries.'} Required monthly income is the higher of (mortgage + other loan payments) ÷ EMI limit and mortgage principal ÷ 48. Upfront cash must also cover the down payment and charges.</p></> : <p role="alert" className="india-note">Check the income assumptions to see the required growth.</p>}
    </section>
  </details>
}
