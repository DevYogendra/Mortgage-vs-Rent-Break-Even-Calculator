import { useId } from 'react'
import type { RentOnlyProjection } from './rentOnly'

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n)
const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

export default function RentOnlyResults({ projection: r, years, rentGrowth, investmentReturn, termYears, fullLoanTerm = false }: {
  projection: RentOnlyProjection; years: number; rentGrowth: number; investmentReturn: number; termYears: number; fullLoanTerm?: boolean;
}) {
  const id = useId()
  return <section className={`rental-results ${fullLoanTerm ? 'compact-loan-term-rental' : 'compact-rent-only'}`} aria-labelledby={`${id}-heading`}>
    <div className="section-label"><h2 id={`${id}-heading`}>{fullLoanTerm ? `Keep renting for the full loan term (${number(years)} ${years === 1 ? 'year' : 'years'})` : `Keep renting for ${number(years)} ${years === 1 ? 'year' : 'years'}`}</h2><span>No home purchase · nominal INR</span></div>
    <dl className="compact-waiting-metrics">
      <div><dt>Total rent paid</dt><dd>{money(r.totalRent)}</dd></div>
      <div><dt>Monthly rent in final period</dt><dd>{money(r.endingMonthlyRent)}</dd><small>{number(rentGrowth * 100)}% annual increase</small></div>
      <div><dt>Mortgage–rent difference invested</dt><dd>{money(r.totalInvested)}</dd><small>Positive monthly differences only</small></div>
      <div><dt>{fullLoanTerm ? 'Total investment net worth' : 'Ending investment balance'}</dt><dd>{money(r.portfolio)}</dd><small>Investment gain / loss: {money(r.investmentGrowth)}</small></div>
    </dl>
    <p className="india-note">Starting investment: <strong>{money(r.initialInvestment)}</strong>, from your down payment plus avoided upfront charges. Each month, invest max(₹0, {money(r.mortgagePayment)} reference mortgage payment − that month’s rent). The reference payment uses home price minus down payment; charges are paid separately. Income growth is excluded. Contributions stop after the {number(termYears)}-year loan term. When rent exceeds the mortgage payment, the contribution is ₹0.</p>
    {fullLoanTerm && <p className="india-note">This projection covers the full loan term, independently of the selected rental or waiting period. Net worth = starting funds + mortgage–rent savings invested + investment gains or losses.</p>}
    <details className="compact-disclosure"><summary>{fullLoanTerm ? 'Loan-term rent-only year-by-year calculation' : 'Rent-only year-by-year calculation'}</summary>
      <div className="table-scroll" role="region" aria-label={fullLoanTerm ? 'Loan-term rent-only annual projection' : 'Rent-only annual projection'} tabIndex={0}><table>
        <caption>Rent increases by {number(rentGrowth * 100)}% each anniversary, beginning in month 13. Investment return is {number(investmentReturn * 100)}% per year, compounded monthly before each month-end deposit. {fullLoanTerm ? 'This horizon is set by the loan term.' : 'Partial years include only the months in the selected rental or waiting period.'}</caption>
        <thead><tr><th scope="col">Year</th><th scope="col">Months</th><th scope="col">Rent increase</th><th scope="col">Monthly rent</th><th scope="col">Rent paid</th><th scope="col">Cumulative rent</th><th scope="col">Difference invested</th><th scope="col">Investment gain / loss to date</th><th scope="col">Ending investments</th></tr></thead>
        <tbody>{r.annual.map(a => <tr key={a.year}><th scope="row">{a.year}</th><td>{a.months}</td><td>{a.year === 1 ? '—' : `${number(rentGrowth * 100)}%`}</td><td>{money(a.monthlyRent)}</td><td>{money(a.rentPaid)}</td><td>{money(a.cumulativeRent)}</td><td>{money(a.invested)}</td><td>{money(a.investmentGrowth)}</td><td>{money(a.portfolio)}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={4}>Total</th><td>{money(r.totalRent)}</td><td>{money(r.totalRent)}</td><td>{money(r.totalInvested)}</td><td>{money(r.investmentGrowth)}</td><td>{money(r.portfolio)}</td></tr></tfoot>
      </table></div>
      <p className="india-note">Monthly rent in year n = today’s rent × (1 + annual rent increase)^(n − 1). Ending investments = {money(r.initialInvestment)} starting funds + total differences invested + investment gains or losses. Rent paid is an expense, shown separately from investments. This projection compares rent with principal and interest only; ownership expenses and home equity are outside this calculation.</p>
      {years === 0 && <p className="india-note">At zero years, no rent has been paid and no differences have been invested.</p>}
    </details>
  </section>
}
