import type { Month, Simulation } from './engine'

export interface AuditMonth extends Month {
  year: number
  scheduledPayment: number
  extraPrincipal: number
  cashFlowDifference: number
  startingRenterPortfolio: number
  renterGrowth: number
  startingBuyerPortfolio: number
  buyerGrowth: number
}

export interface PortfolioBreakdown {
  initialCapital: number
  downPayment: number
  closingCosts: number
  downPaymentGrowth: number
  closingCostsGrowth: number
  monthlyContributions: number
  contributionGrowth: number
  endingBalance: number
}

export const modelAssumptions = [
  'All monetary values are nominal USD. Rate inputs are decimals: 0.07 means 7%.',
  'Renter capital at month zero is the down payment plus avoided nonrecoverable buyer closing costs.',
  'Mortgage interest accrues at the annual note rate divided by 12. Payments, including extra principal, stop at payoff.',
  'Effective annual investment return is after taxes and fees, converted to a monthly rate. Portfolios grow before month-end contributions.',
  'The cheaper strategy invests its entire monthly cash-flow advantage; principal reduces debt and is never counted twice as equity.',
  'Percentage ownership expenses use the original purchase price. Rent and expense escalation start in month 13 and repeat annually.',
  'PMI is fixed and stops the month after the configured loan/original-price threshold, or payoff. This is a modeling assumption, not a lender/legal determination.',
  'Tax savings are an effective incremental estimate on interest and optionally property tax, allocated monthly. Home-sale capital-gains taxes are excluded.',
  'The home is sold after the last monthly payment and contribution. Selling percentages apply to sale price; fixed selling costs are dollars.',
  'Each annual break-even horizon is solved independently. A nonpositive algebraic sale price means buying is already at least as wealthy at a zero sale price.',
  'No intermediate rounding is applied. Display formatting does not change calculations; floating-point absolute precision is limited at extreme magnitudes.',
  'Market risk, refinancing, moving costs, refundable deposits, escrow balances and the personal value of owning are outside this model.',
] as const

export interface CalculationReport {
  formatVersion: 1
  units: { currency: 'USD'; rates: 'decimal'; month: 'one-based index'; year: 'one-based period' }
  assumptions: readonly string[]
  inputs: Simulation['input']
  initial: { downPayment: number; closingCosts: number; mortgage: number; renterInvestment: number }
  rates: { monthlyMortgage: number; monthlyInvestment: number }
  scheduledPayment: number
  holdingMonths: number
  portfolios: { renter: PortfolioBreakdown; buyer: PortfolioBreakdown }
  sale: { fixedCosts: number; costRate: number; numerator: number; algebraicSalePrice: number }
  months: AuditMonth[]
  annual: Simulation['annual']
  result: Simulation['result']
}

// A read-only projection of the calculated simulation, not a second financial engine.
export function createCalculationReport(s: Simulation): CalculationReport {
  const initialRenter = s.downPayment + s.closingCosts
  const monthlyInvestment = Math.expm1(Math.log1p(s.input.investmentReturn) / 12)
  let startingRenterPortfolio = initialRenter, startingBuyerPortfolio = 0
  const months = s.months.map(m => {
    const scheduledPayment = m.startingBalance > 0 ? Math.min(s.payment, m.startingBalance + m.interest) : 0
    const row: AuditMonth = {
      ...m, year: Math.ceil(m.month / 12), scheduledPayment,
      extraPrincipal: m.payment - scheduledPayment,
      cashFlowDifference: m.buyCost - m.rentCost,
      startingRenterPortfolio,
      renterGrowth: m.renterPortfolio - m.renterContribution - startingRenterPortfolio,
      startingBuyerPortfolio,
      buyerGrowth: m.buyerPortfolio - m.buyerContribution - startingBuyerPortfolio,
    }
    startingRenterPortfolio = m.renterPortfolio
    startingBuyerPortfolio = m.buyerPortfolio
    return row
  })
  const last = months[months.length - 1]
  const growthFactor = (1 + monthlyInvestment) ** months.length
  const downPaymentGrowth = s.downPayment * (growthFactor - 1)
  const closingCostsGrowth = s.closingCosts * (growthFactor - 1)
  const renterContributions = months.reduce((v, m) => v + m.renterContribution, 0)
  const buyerContributions = months.reduce((v, m) => v + m.buyerContribution, 0)
  const fixedCosts = s.input.selling.unit === 'dollars' ? s.input.selling.value : 0
  const costRate = s.input.selling.unit === 'percent' ? s.input.selling.value : 0
  const numerator = last.renterPortfolio + last.balance - last.buyerPortfolio + fixedCosts
  return {
    formatVersion: 1,
    units: { currency: 'USD', rates: 'decimal', month: 'one-based index', year: 'one-based period' },
    assumptions: modelAssumptions,
    inputs: structuredClone(s.input),
    initial: { downPayment: s.downPayment, closingCosts: s.closingCosts, mortgage: s.initialLoan, renterInvestment: initialRenter },
    rates: { monthlyMortgage: s.input.mortgageRate / 12, monthlyInvestment },
    scheduledPayment: s.payment, holdingMonths: months.length,
    portfolios: {
      renter: { initialCapital: initialRenter, downPayment: s.downPayment, closingCosts: s.closingCosts,
        downPaymentGrowth, closingCostsGrowth, monthlyContributions: renterContributions,
        contributionGrowth: last.renterPortfolio - initialRenter - downPaymentGrowth - closingCostsGrowth - renterContributions,
        endingBalance: last.renterPortfolio },
      buyer: { initialCapital: 0, downPayment: 0, closingCosts: 0, downPaymentGrowth: 0, closingCostsGrowth: 0,
        monthlyContributions: buyerContributions, contributionGrowth: last.buyerPortfolio - buyerContributions,
        endingBalance: last.buyerPortfolio },
    },
    sale: { fixedCosts, costRate, numerator, algebraicSalePrice: numerator / (1 - costRate) },
    months, annual: structuredClone(s.annual), result: { ...s.result },
  }
}

export const monthlyCsvColumns = [
  'month', 'year', 'startingBalance', 'scheduledPayment', 'extraPrincipal', 'payment', 'interest', 'principal', 'balance',
  'propertyTax', 'insurance', 'maintenance', 'hoa', 'pmi', 'otherOwner', 'taxSaving',
  'rent', 'rentersInsurance', 'otherRenter', 'buyCost', 'rentCost', 'cashFlowDifference',
  'startingRenterPortfolio', 'renterGrowth', 'renterContribution', 'renterPortfolio',
  'startingBuyerPortfolio', 'buyerGrowth', 'buyerContribution', 'buyerPortfolio',
] as const satisfies readonly (keyof AuditMonth)[]

export function monthlyCsv(report: CalculationReport): string {
  // Every column is a numeric value. String conversion retains JS round-trip precision.
  return [monthlyCsvColumns.join(','), ...report.months.map(m => monthlyCsvColumns.map(key => String(m[key])).join(','))].join('\r\n') + '\r\n'
}

export function calculationJson(report: CalculationReport): string {
  return JSON.stringify(report, null, 2) + '\n'
}
