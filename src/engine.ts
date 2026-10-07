export type Amount = { value: number; unit: 'dollars' | 'percent' }
export interface Inputs {
  price: number; down: Amount; years: number; closing: Amount; selling: Amount
  mortgageRate: number; term: number; extra: number; pmi: number; pmiEnd: number
  propertyTax: Amount; insurance: Amount; maintenance: Amount; hoa: number
  otherOwner: number; inflation: number; rent: number; rentGrowth: number
  rentersInsurance: number; otherRenter: number; investmentReturn: number
  taxBenefit: number; includePropertyTax: boolean
}
export const defaults: Inputs = {
  price: 600000, down: { value: .2, unit: 'percent' }, years: 10,
  closing: { value: .02, unit: 'percent' }, selling: { value: .06, unit: 'percent' },
  mortgageRate: .0625, term: 30, extra: 0, pmi: 0, pmiEnd: .8,
  propertyTax: { value: .01, unit: 'percent' }, insurance: { value: 1800, unit: 'dollars' },
  maintenance: { value: .01, unit: 'percent' }, hoa: 0, otherOwner: 0,
  inflation: .03, rent: 2700, rentGrowth: .03, rentersInsurance: 20,
  otherRenter: 0, investmentReturn: .07, taxBenefit: 0, includePropertyTax: false,
}
export const amount = (a: Amount, price: number) => a.unit === 'percent' ? a.value * price : a.value
export function validate(x: Inputs): string[] {
  const errors: string[] = []
  const range = (name: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || value < min || value > max) errors.push(`${name} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`)
  }
  range('Purchase price', x.price, 1, 1e9)
  range('Holding period', x.years, 1 / 12, 50)
  if (Number.isFinite(x.years) && Math.abs(x.years * 12 - Math.round(x.years * 12)) > 1e-7) errors.push('Holding period must resolve to whole months (for example, 10 or 10.5 years).')
  range('Mortgage term', x.term, 1, 50)
  if (!Number.isInteger(x.term * 12)) errors.push('Mortgage term must resolve to whole months.')
  range('Mortgage rate (%)', x.mortgageRate * 100, 0, 100)
  range('Investment return (%)', x.investmentReturn * 100, -99, 100)
  range('Rent growth (%)', x.rentGrowth * 100, -99, 100)
  range('Expense inflation (%)', x.inflation * 100, -99, 100)
  range('Effective tax benefit (%)', x.taxBenefit * 100, 0, 100)
  range('PMI cancellation threshold (%)', x.pmiEnd * 100, 0, 100)
  for (const [key, label] of [['down','Down payment'],['closing','Buyer closing costs'],['selling','Selling costs'],['propertyTax','Property tax'],['insurance','Insurance'],['maintenance','Maintenance']] as const) {
    const a = x[key]
    range(label, a.value, 0, a.unit === 'percent' ? 1 : 1e9)
  }
  if (amount(x.down, x.price) > x.price) errors.push('Down payment cannot exceed the purchase price.')
  if (x.selling.unit === 'percent' && x.selling.value >= 1) errors.push('Selling costs must be less than 100% of the sale price.')
  for (const [key, label] of [['extra','Extra principal'],['pmi','PMI'],['hoa','HOA'],['otherOwner','Other owner expenses'],['rent','Monthly rent'],['rentersInsurance','Renters insurance'],['otherRenter','Other renter expenses']] as const) range(label, x[key], 0, 1e8)
  return errors
}
export interface Month {
  month: number; startingBalance: number; payment: number; interest: number; principal: number
  balance: number; propertyTax: number; insurance: number; maintenance: number; hoa: number
  pmi: number; otherOwner: number; taxSaving: number; rent: number; rentersInsurance: number
  otherRenter: number; buyCost: number; rentCost: number; renterContribution: number
  buyerContribution: number; renterPortfolio: number; buyerPortfolio: number
}
export interface BreakEven {
  status: 'solved' | 'buy-always'; salePrice: number; appreciation: number
  sellingCosts: number; equity: number; buyerWealth: number; renterWealth: number; difference: number
}
export interface Annual {
  year: number; months: number; balance: number; monthlyRent: number; buyCost: number
  rentCost: number; renterContribution: number; buyerContribution: number; breakEven: BreakEven
}
export interface Simulation {
  input: Inputs; downPayment: number; closingCosts: number; initialLoan: number
  payment: number; months: Month[]; annual: Annual[]; result: BreakEven
}
export function mortgagePayment(loan: number, rate: number, months: number): number {
  if (loan === 0) return 0
  if (rate === 0) return loan / months
  const r = rate / 12
  return loan * r / -Math.expm1(-months * Math.log1p(r))
}
function breakEven(x: Inputs, m: Month): BreakEven {
  const fixed = x.selling.unit === 'dollars' ? x.selling.value : 0
  const sellingRate = x.selling.unit === 'percent' ? x.selling.value : 0
  const numerator = m.renterPortfolio + m.balance - m.buyerPortfolio + fixed
  const salePrice = Math.max(0, numerator / (1 - sellingRate))
  const sellingCosts = salePrice * sellingRate + fixed
  const equity = salePrice - sellingCosts - m.balance
  const buyerWealth = equity + m.buyerPortfolio
  return {
    status: numerator <= 0 ? 'buy-always' : 'solved', salePrice,
    appreciation: salePrice === 0 ? -1 : Math.expm1(Math.log(salePrice / x.price) / (m.month / 12)),
    sellingCosts, equity, buyerWealth, renterWealth: m.renterPortfolio,
    difference: buyerWealth - m.renterPortfolio,
  }
}
export function simulate(input: Inputs): Simulation {
  const errors = validate(input)
  if (errors.length) throw new Error(errors.join(' '))
  const x = structuredClone(input)
  const downPayment = amount(x.down, x.price), closingCosts = amount(x.closing, x.price)
  const initialLoan = x.price - downPayment
  const payment = mortgagePayment(initialLoan, x.mortgageRate, Math.round(x.term * 12))
  const monthlyReturn = Math.expm1(Math.log1p(x.investmentReturn) / 12)
  let balance = initialLoan, renterPortfolio = downPayment + closingCosts, buyerPortfolio = 0
  // Cancellation uses the modeled balance / original purchase price. Once stopped, PMI stays off.
  let pmiActive = initialLoan > 0 && initialLoan / x.price > x.pmiEnd
  const months: Month[] = [], annual: Annual[] = []
  const horizon = Math.round(x.years * 12)
  for (let month = 1; month <= horizon; month++) {
    const startingBalance = balance, interest = balance * x.mortgageRate / 12
    const actualPayment = balance > 0 ? Math.min(balance + interest, payment + x.extra) : 0
    const principal = Math.max(0, actualPayment - interest)
    balance = Math.max(0, balance - principal)
    if (balance < 1e-7) balance = 0
    const inflation = (1 + x.inflation) ** Math.floor((month - 1) / 12)
    const propertyTax = amount(x.propertyTax, x.price) / 12 * inflation
    const insurance = amount(x.insurance, x.price) / 12 * inflation
    const maintenance = amount(x.maintenance, x.price) / 12 * inflation
    const hoa = x.hoa * inflation, otherOwner = x.otherOwner * inflation
    const pmi = pmiActive ? x.pmi : 0
    if (balance / x.price <= x.pmiEnd || balance === 0) pmiActive = false
    const taxSaving = (interest + (x.includePropertyTax ? propertyTax : 0)) * x.taxBenefit
    const rent = x.rent * (1 + x.rentGrowth) ** Math.floor((month - 1) / 12)
    const rentersInsurance = x.rentersInsurance * inflation, otherRenter = x.otherRenter * inflation
    const buyCost = actualPayment + propertyTax + insurance + maintenance + hoa + pmi + otherOwner - taxSaving
    const rentCost = rent + rentersInsurance + otherRenter
    const renterContribution = Math.max(0, buyCost - rentCost)
    const buyerContribution = Math.max(0, rentCost - buyCost)
    renterPortfolio = renterPortfolio * (1 + monthlyReturn) + renterContribution
    buyerPortfolio = buyerPortfolio * (1 + monthlyReturn) + buyerContribution
    const m: Month = { month, startingBalance, payment: actualPayment, interest, principal, balance,
      propertyTax, insurance, maintenance, hoa, pmi, otherOwner, taxSaving, rent, rentersInsurance,
      otherRenter, buyCost, rentCost, renterContribution, buyerContribution, renterPortfolio, buyerPortfolio }
    months.push(m)
    if (month % 12 === 0 || month === horizon) {
      const period = months.slice(Math.floor((month - 1) / 12) * 12)
      const sum = (key: 'buyCost' | 'rentCost' | 'renterContribution' | 'buyerContribution') => period.reduce((s, row) => s + row[key], 0)
      annual.push({ year: month / 12, months: period.length, balance, monthlyRent: rent,
        buyCost: sum('buyCost'), rentCost: sum('rentCost'), renterContribution: sum('renterContribution'),
        buyerContribution: sum('buyerContribution'), breakEven: breakEven(x, m) })
    }
  }
  return { input: x, downPayment, closingCosts, initialLoan, payment, months, annual,
    result: breakEven(x, months[months.length - 1]) }
}
export function wealthAtRate(s: Simulation, appreciation: number) {
  if (!Number.isFinite(appreciation) || appreciation <= -1) throw new Error('Appreciation must be greater than −100%.')
  return s.annual.map(a => {
    const m = s.months[Math.round(a.year * 12) - 1]
    const value = s.input.price * (1 + appreciation) ** a.year
    const sell = s.input.selling.unit === 'percent' ? value * s.input.selling.value : s.input.selling.value
    return { year: a.year, buyer: value - sell - m.balance + m.buyerPortfolio, renter: m.renterPortfolio }
  })
}
