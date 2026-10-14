import { useId, useState } from 'react'
import { requiredIncomeGrowth } from './incomeGrowth'
import NumberField from './IndiaField'
import type { FieldError } from './india'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function IncomeGrowthAssessment({ mortgage, years }: { mortgage: number; years: number }) {
  const id = useId()
  const [income, setIncome] = useState(2.5)
  const [share, setShare] = useState(.4)
  const [existing, setExisting] = useState(0)
  const errors: FieldError[] = []
  for (const [path, value, max, label] of [['income', income, 1e7, 'monthly income'], ['share', share, 1, 'loan-payment limit'], ['existing', existing, 1e12, 'existing loan payments']] as const) {
    if (!Number.isFinite(value) || value < 0 || value > max) errors.push({ path, message: `Enter a valid ${label} from 0 to ${path === 'share' ? '100%' : max.toLocaleString('en-IN')}.` })
  }
  const result = !errors.length ? requiredIncomeGrowth({ monthlyIncome: income * 1e5, monthlyMortgage: mortgage, existingPayments: existing, paymentShare: share, years }) : null
  return <details className="compact-disclosure income-growth-assessment"><summary>Income growth needed per year</summary>
    <section aria-labelledby={`${id}-heading`}><div className="section-label"><h2 id={`${id}-heading`}>A separate income check</h2><span>Purchase after {years.toLocaleString('en-IN')} years</span></div>
      <p className="india-note">Estimate the income needed for the projected mortgage payment. These fields do not change savings, rent-only investments, or the mortgage amount.</p>
      <div className="compact-input-grid">
        <NumberField label="Current monthly income" path="income" value={income} onChange={setIncome} unit="₹ lakh/mo" errors={errors} hint="After-tax household income; used only for this check." />
        <NumberField label="Loan-payment limit" path="share" value={share} onChange={setShare} rate unit="% income" errors={errors} />
        <NumberField label="Other monthly loan payments" path="existing" value={existing} onChange={setExisting} unit="₹/mo" errors={errors} />
      </div>
      {result ? <><dl className="compact-waiting-metrics income-growth-metrics" aria-live="polite">
        <div><dt>Projected monthly mortgage</dt><dd>{money(mortgage)}</dd></div>
        <div><dt>Required monthly income</dt><dd>{result.requiredMonthlyIncome === null ? 'Unavailable' : money(result.requiredMonthlyIncome)}</dd></div>
        <div><dt>Required annual income growth</dt><dd>{result.annualGrowth === null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 2 }).format(result.annualGrowth)}</dd></div>
      </dl><p className="india-note">{result.status === 'covered' ? 'Your current income already covers this loan-payment limit; no income increase is needed.' : result.status === 'zero-income' ? 'A growth percentage cannot be computed from zero income. The required monthly income is shown above.' : result.status === 'no-time' ? 'At zero waiting years, there is no time to grow income. The required monthly income must be available today.' : result.status === 'no-budget' ? 'A 0% loan-payment limit cannot cover positive loan payments.' : 'Annual growth = (required monthly income ÷ current monthly income)^(1 ÷ years) − 1. This is the constant annual growth needed, not a forecast.'} Required monthly income = (projected mortgage + other loan payments) ÷ loan-payment limit. Meeting the income limit also requires enough upfront purchase funds.</p></> : <p role="alert" className="india-note">Check the income assumptions to see the required growth.</p>}
    </section>
  </details>
}
