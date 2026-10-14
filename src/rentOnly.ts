import { mortgagePayment } from './engine'
import type { FieldError } from './india'

export interface RentOnlyInputs {
  monthlyRent: number
  rentGrowth: number
  years: number
  loanAmount: number
  loanRate: number
  termYears: number
  investmentReturn: number
  initialInvestment: number
}
export interface RentOnlyYear {
  year: number
  months: number
  monthlyRent: number
  monthlyMortgage: number
  monthlyInvestment: number
  rentPaid: number
  cumulativeRent: number
  invested: number
  cumulativeInvested: number
  investmentGrowth: number
  portfolio: number
}
export interface RentOnlyProjection {
  initialInvestment: number
  mortgagePayment: number
  annual: RentOnlyYear[]
  totalRent: number
  totalInvested: number
  investmentGrowth: number
  portfolio: number
  endingMonthlyRent: number
}

export function validateRentOnly(x: RentOnlyInputs): FieldError[] {
  const errors: FieldError[] = []
  const range = (path: string, label: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || value < min || value > max) errors.push({ path, message: `${label} must be between ${min} and ${max}.` })
  }
  range('monthlyRent', 'Monthly rent (₹)', x.monthlyRent, 0, 1e12)
  range('rentGrowth', 'Annual rent increase (%)', x.rentGrowth * 100, -99, 100)
  range('delay.years', 'Rental period (years)', x.years, 0, 30)
  range('loanAmount', 'Reference home loan (₹)', x.loanAmount, 0, 2e12)
  range('liquidFunds', 'Starting investment (₹)', x.initialInvestment, 0, 1e12)
  range('loanRate', 'Loan interest (%)', x.loanRate * 100, 0, 100)
  range('termYears', 'Loan term (years)', x.termYears, 1 / 12, 50)
  range('delay.savingsReturn', 'Investment return (%)', x.investmentReturn * 100, -99, 100)
  for (const [path, value] of [['delay.years', x.years], ['termYears', x.termYears]] as const) {
    if (Number.isFinite(value) && Math.abs(value * 12 - Math.round(value * 12)) > 1e-7) errors.push({ path, message: 'Enter a period in whole months (for example, 2 or 2.5 years).' })
  }
  return errors
}

export function evaluateRentOnly(input: RentOnlyInputs): RentOnlyProjection {
  const errors = validateRentOnly(input)
  if (errors.length) throw new Error(errors.map(e => e.message).join(' '))
  const x = { ...input }
  const loanMonths = Math.round(x.termYears * 12)
  const payment = mortgagePayment(x.loanAmount, x.loanRate, loanMonths)
  const monthlyReturn = Math.expm1(Math.log1p(x.investmentReturn) / 12)
  const months = Math.round(x.years * 12)
  const annual: RentOnlyYear[] = []
  let portfolio = x.initialInvestment, totalRent = 0, totalInvested = 0
  let periodRent = 0, periodInvested = 0, periodMonths = 0, rent = x.monthlyRent
  for (let month = 1; month <= months; month++) {
    rent = x.monthlyRent * (1 + x.rentGrowth) ** Math.floor((month - 1) / 12)
    // Compare with today's fixed-rate loan. No avoided EMI remains after its term.
    const mortgage = month <= loanMonths ? payment : 0
    const contribution = Math.max(0, mortgage - rent)
    portfolio = portfolio * (1 + monthlyReturn) + contribution
    totalRent += rent
    totalInvested += contribution
    periodRent += rent
    periodInvested += contribution
    periodMonths++
    if (![portfolio, totalRent, totalInvested].every(Number.isFinite)) throw new Error('Rental projection exceeds the supported numeric range.')
    if (month % 12 === 0 || month === months) {
      annual.push({ year: Math.ceil(month / 12), months: periodMonths, monthlyRent: rent,
        monthlyMortgage: mortgage, monthlyInvestment: contribution, rentPaid: periodRent,
        cumulativeRent: totalRent, invested: periodInvested, cumulativeInvested: totalInvested,
        investmentGrowth: portfolio - x.initialInvestment - totalInvested, portfolio })
      periodRent = 0; periodInvested = 0; periodMonths = 0
    }
  }
  return { initialInvestment: x.initialInvestment, mortgagePayment: payment, annual, totalRent, totalInvested,
    investmentGrowth: portfolio - x.initialInvestment - totalInvested, portfolio, endingMonthlyRent: rent }
}
