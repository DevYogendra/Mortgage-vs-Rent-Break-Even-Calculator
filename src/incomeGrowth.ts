export interface IncomeGrowthInputs {
  monthlyIncome: number
  monthlyMortgage: number
  existingPayments: number
  paymentShare: number
  years: number
  mortgageAmount?: number
}
export function minimumTakeHome(loanAmount: number, monthlyEmi: number, paymentShare = .4, existingPayments = 0) {
  if (![loanAmount, monthlyEmi, paymentShare, existingPayments].every(Number.isFinite)
    || loanAmount < 0 || monthlyEmi < 0 || existingPayments < 0 || paymentShare < 0 || paymentShare > 1) throw new Error('Enter valid mortgage and income limits.')
  const payments = monthlyEmi + existingPayments
  const emiIncome = payments === 0 ? 0 : paymentShare === 0 ? null : payments / paymentShare
  const loanIncome = loanAmount / (4 * 12)
  return { emiIncome, loanIncome, requiredMonthlyIncome: emiIncome === null ? null : Math.max(emiIncome, loanIncome) }
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
  const minimum = minimumTakeHome(x.mortgageAmount ?? 0, x.monthlyMortgage, x.paymentShare, x.existingPayments)
  if (minimum.requiredMonthlyIncome === null) return { requiredMonthlyIncome: null, annualGrowth: null, status: 'no-budget' }
  const requiredMonthlyIncome = minimum.requiredMonthlyIncome
  if (requiredMonthlyIncome <= x.monthlyIncome) return { requiredMonthlyIncome, annualGrowth: 0, status: 'covered' }
  if (x.monthlyIncome === 0) return { requiredMonthlyIncome, annualGrowth: null, status: 'zero-income' }
  if (x.years === 0) return { requiredMonthlyIncome, annualGrowth: null, status: 'no-time' }
  const rate = Math.expm1(Math.log(requiredMonthlyIncome / x.monthlyIncome) / x.years)
  return { requiredMonthlyIncome, annualGrowth: Number.isFinite(rate) ? rate : null, status: 'growth-needed' }
}
