export interface IncomeGrowthInputs {
  monthlyIncome: number
  monthlyMortgage: number
  existingPayments: number
  paymentShare: number
  years: number
}
export interface IncomeGrowthResult {
  requiredMonthlyIncome: number | null
  annualGrowth: number | null
  status: 'covered' | 'growth-needed' | 'zero-income' | 'no-time' | 'no-budget'
}

export function requiredIncomeGrowth(x: IncomeGrowthInputs): IncomeGrowthResult {
  if (![x.monthlyIncome, x.monthlyMortgage, x.existingPayments, x.paymentShare, x.years].every(Number.isFinite)
    || x.monthlyIncome < 0 || x.monthlyMortgage < 0 || x.existingPayments < 0
    || x.paymentShare < 0 || x.paymentShare > 1 || x.years < 0) throw new Error('Enter valid income-growth assumptions.')
  const payments = x.monthlyMortgage + x.existingPayments
  if (payments === 0) return { requiredMonthlyIncome: 0, annualGrowth: 0, status: 'covered' }
  if (x.paymentShare === 0) return { requiredMonthlyIncome: null, annualGrowth: null, status: 'no-budget' }
  const requiredMonthlyIncome = payments / x.paymentShare
  if (requiredMonthlyIncome <= x.monthlyIncome) return { requiredMonthlyIncome, annualGrowth: 0, status: 'covered' }
  if (x.monthlyIncome === 0) return { requiredMonthlyIncome, annualGrowth: null, status: 'zero-income' }
  if (x.years === 0) return { requiredMonthlyIncome, annualGrowth: null, status: 'no-time' }
  const rate = Math.expm1(Math.log(requiredMonthlyIncome / x.monthlyIncome) / x.years)
  return { requiredMonthlyIncome, annualGrowth: Number.isFinite(rate) ? rate : null, status: 'growth-needed' }
}
