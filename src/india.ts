import { mortgagePayment } from './engine'

// Money is nominal INR; percentage inputs are decimal rates. These are examples,
// not lender rules or city market estimates.
export interface IndiaProduct {
  price: number
  monthlyRent: number
  appreciation: number
  purchaseCostRate: number
  loanRate: number
  termYears: number
  maxLtv: number
  maxEmiShare: number
}
export interface IndiaHousehold {
  annualIncome: number
  liquidFunds: number
  existingEmi: number
  savingsRate: number
  need: boolean
  desire: boolean
  creditAccess: boolean
  willingness: boolean
}
export interface HouseholdSegment extends IndiaHousehold {
  id: string
  name: string
  count: number
}
export interface FieldError { path: string; message: string }
export type BuyerTier = 1 | 2 | 3
export type Exclusion = 'cash-ltv' | 'emi' | 'need' | 'desire' | 'credit' | 'willingness'
export interface HouseholdCapacity {
  tier: BuyerTier
  financiallyCapable: boolean
  effectiveDemand: boolean
  availableCash: number
  purchaseCosts: number
  totalPurchaseCost: number
  requiredLoan: number
  requiredEmi: number
  emiBudget: number
  maxLtvLoan: number
  incomeLoanCapacity: number
  minimumUpfrontCash: number
  cashGap: number
  loanToValueGap: number
  emiGap: number
  maxAffordablePrice: number
  exclusions: Exclusion[]
  grossYield: number
  incomeMultiple: number | null
  annualSavings: number
  appreciationAmount: number
  appreciationIncomeShare: number | null
  appreciationSavingsShare: number | null
}
export interface SegmentCapacity {
  segment: HouseholdSegment
  capacity: HouseholdCapacity
}
export interface DemandResult {
  total: number
  capable: number
  effective: number
  tiers: Record<BuyerTier, number>
  segments: SegmentCapacity[]
}
export interface PriceCapacityPoint { price: number; capable: number; effective: number }

export interface PurchaseDelay {
  years: number
  incomeGrowth: number
  savingsReturn: number
  monthlySavings?: number
}
export interface PurchaseDelayPoint {
  years: number
  price: number
  annualIncome: number
  savingsContributions: number
  investmentGrowth: number
  capacity: HouseholdCapacity
}
export interface PurchaseDelayProjection {
  current: PurchaseDelayPoint
  delayed: PurchaseDelayPoint
  timeline: PurchaseDelayPoint[]
  monthlyTimeline: PurchaseDelayPoint[]
}
export const purchaseDelayDefaults: PurchaseDelay = { years: 0, incomeGrowth: 0, savingsReturn: 0 }

export const indiaProductDefaults: IndiaProduct = {
  price: 15000000, monthlyRent: 31250, appreciation: .04, purchaseCostRate: .07,
  loanRate: .085, termYears: 20, maxLtv: .75, maxEmiShare: .4,
}
export const indiaHouseholdDefaults: IndiaHousehold = {
  annualIncome: 3000000, liquidFunds: 5500000, existingEmi: 0,
  savingsRate: .25, need: true, desire: true, creditAccess: true, willingness: true,
}
export const indiaSegmentDefaults: HouseholdSegment[] = [
  { ...indiaHouseholdDefaults, id: 'wealth', name: 'Wealth-backed example', count: 100, annualIncome: 6000000, liquidFunds: 30000000 },
  { ...indiaHouseholdDefaults, id: 'income', name: 'Income-backed example', count: 250 },
  { ...indiaHouseholdDefaults, id: 'constrained', name: 'Constrained example', count: 650, annualIncome: 1200000, liquidFunds: 1500000 },
]

function range(errors: FieldError[], path: string, label: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    errors.push({ path, message: `${label} must be between ${min.toLocaleString('en-IN')} and ${max.toLocaleString('en-IN')}.` })
  }
}
export function validateProduct(p: IndiaProduct): FieldError[] {
  const errors: FieldError[] = []
  range(errors, 'price', 'Property price (₹)', p.price, 1, 1e12)
  range(errors, 'monthlyRent', 'Monthly rent (₹)', p.monthlyRent, 0, 1e12)
  range(errors, 'appreciation', 'Annual appreciation (%)', p.appreciation * 100, -100, 100)
  for (const [key, label] of [
    ['purchaseCostRate', 'Upfront purchase costs'], ['loanRate', 'Home-loan interest'],
    ['maxLtv', 'Maximum loan-to-value'], ['maxEmiShare', 'Maximum total EMI share'],
  ] as const) range(errors, key, `${label} (%)`, p[key] * 100, 0, 100)
  range(errors, 'termYears', 'Loan term (years)', p.termYears, 1 / 12, 50)
  if (Number.isFinite(p.termYears) && Math.abs(p.termYears * 12 - Math.round(p.termYears * 12)) > 1e-7) {
    errors.push({ path: 'termYears', message: 'Loan term must resolve to whole months (for example, 20 or 20.5 years).' })
  }
  return errors
}
export function validateHousehold(h: IndiaHousehold): FieldError[] {
  const errors: FieldError[] = []
  for (const [key, label] of [
    ['annualIncome', 'Annual after-tax income'], ['liquidFunds', 'Liquid purchase funds'],
    ['existingEmi', 'Existing monthly EMIs'],
  ] as const) range(errors, key, `${label} (₹)`, h[key], 0, 1e12)
  range(errors, 'savingsRate', 'Annual savings (%)', h.savingsRate * 100, 0, 100)
  return errors
}
export function validateSegments(segments: HouseholdSegment[]): FieldError[] {
  const errors: FieldError[] = [], ids = new Set<string>()
  for (const s of segments) {
    if (!s.id || ids.has(s.id)) errors.push({ path: 'segments', message: 'Each segment must have a unique identifier.' })
    ids.add(s.id)
    const prefix = s.name.trim() || 'Unnamed segment'
    if (!s.name.trim()) errors.push({ path: `${s.id}.name`, message: 'Enter a segment name.' })
    const rowErrors = validateHousehold(s)
    range(rowErrors, 'count', 'Household count', s.count, 0, 1e9)
    if (Number.isFinite(s.count) && !Number.isInteger(s.count)) rowErrors.push({ path: 'count', message: 'Household count must be a whole number.' })
    errors.push(...rowErrors.map(e => ({ path: `${s.id}.${e.path}`, message: `${prefix}: ${e.message}` })))
  }
  return errors
}
function assertValid(errors: FieldError[]) {
  if (errors.length) throw new Error(errors.map(e => e.message).join(' '))
}
function calculateCapacity(p: IndiaProduct, h: IndiaHousehold): HouseholdCapacity {
  const availableCash = h.liquidFunds
  const purchaseCosts = p.price * p.purchaseCostRate
  const totalPurchaseCost = p.price + purchaseCosts
  const requiredLoan = Math.max(0, totalPurchaseCost - availableCash)
  const loanMonths = Math.round(p.termYears * 12)
  const requiredEmi = mortgagePayment(requiredLoan, p.loanRate, loanMonths)
  const emiBudget = Math.max(0, h.annualIncome / 12 * p.maxEmiShare - h.existingEmi)
  // Payment is linear in principal, including the zero-interest case.
  const incomeLoanCapacity = emiBudget / mortgagePayment(1, p.loanRate, loanMonths)
  const maxLtvLoan = p.price * p.maxLtv
  const minimumUpfrontCash = totalPurchaseCost - maxLtvLoan
  const cashGap = Math.max(0, minimumUpfrontCash - availableCash)
  const loanToValueGap = Math.max(0, requiredLoan - maxLtvLoan)
  const emiGap = Math.max(0, requiredEmi - emiBudget)
  // Ignore only sub-paisa floating-point noise at equality boundaries.
  const tier: BuyerTier = requiredLoan <= 1e-6 ? 1 : cashGap <= 1e-6 && emiGap <= 1e-6 ? 2 : 3
  const exclusions: Exclusion[] = []
  if (tier === 3) {
    if (cashGap > 1e-6) exclusions.push('cash-ltv')
    if (emiGap > 1e-6) exclusions.push('emi')
  }
  if (!h.need) exclusions.push('need')
  if (!h.desire) exclusions.push('desire')
  if (requiredLoan > 1e-6 && !h.creditAccess) exclusions.push('credit')
  if (!h.willingness) exclusions.push('willingness')
  // Both inequalities must hold: loan <= EMI-supported principal and loan <= P × LTV.
  const cashFraction = 1 + p.purchaseCostRate - p.maxLtv
  const maxAffordablePrice = Math.min(
    (availableCash + incomeLoanCapacity) / (1 + p.purchaseCostRate),
    cashFraction > 0 ? availableCash / cashFraction : Infinity,
  )
  const annualSavings = h.annualIncome * h.savingsRate
  const appreciationAmount = p.price * p.appreciation
  return {
    tier, financiallyCapable: tier !== 3, effectiveDemand: exclusions.length === 0,
    availableCash, purchaseCosts, totalPurchaseCost, requiredLoan, requiredEmi, emiBudget,
    maxLtvLoan, incomeLoanCapacity, minimumUpfrontCash, cashGap, loanToValueGap, emiGap,
    maxAffordablePrice, exclusions, grossYield: 12 * p.monthlyRent / p.price,
    incomeMultiple: h.annualIncome > 0 ? p.price / h.annualIncome : null,
    annualSavings, appreciationAmount,
    appreciationIncomeShare: h.annualIncome > 0 ? appreciationAmount / h.annualIncome : null,
    appreciationSavingsShare: annualSavings > 0 ? appreciationAmount / annualSavings : null,
  }
}
export function evaluateHousehold(p: IndiaProduct, h: IndiaHousehold): HouseholdCapacity {
  assertValid([...validateProduct(p), ...validateHousehold(h)])
  return calculateCapacity(p, h)
}
function calculateDemand(p: IndiaProduct, segments: HouseholdSegment[]): DemandResult {
  const rows = segments.map(segment => ({ segment, capacity: calculateCapacity(p, segment) }))
  const result: DemandResult = { total: 0, capable: 0, effective: 0, tiers: { 1: 0, 2: 0, 3: 0 }, segments: rows }
  for (const { segment, capacity } of rows) {
    result.total += segment.count
    result.tiers[capacity.tier] += segment.count
    if (capacity.financiallyCapable) result.capable += segment.count
    if (capacity.effectiveDemand) result.effective += segment.count
  }
  return result
}
export function evaluateDemand(p: IndiaProduct, segments: HouseholdSegment[]): DemandResult {
  assertValid([...validateProduct(p), ...validateSegments(segments)])
  return calculateDemand(p, segments)
}
export function priceCapacityCurve(p: IndiaProduct, segments: HouseholdSegment[]): PriceCapacityPoint[] {
  assertValid([...validateProduct(p), ...validateSegments(segments)])
  return Array.from({ length: 21 }, (_, i) => {
    const price = p.price * (.5 + i * .05)
    const { capable, effective } = calculateDemand({ ...p, price }, segments)
    return { price, capable, effective }
  })
}

function purchaseDelayScenario(p: IndiaProduct, h: IndiaHousehold, delay: PurchaseDelay): {
  errors: FieldError[]; projection: PurchaseDelayProjection | null;
} {
  const errors = [...validateProduct(p), ...validateHousehold(h)]
  range(errors, 'delay.years', 'Years before purchase', delay.years, 0, 30)
  if (Number.isFinite(delay.years) && Math.abs(delay.years * 12 - Math.round(delay.years * 12)) > 1e-7) {
    errors.push({ path: 'delay.years', message: 'Purchase delay must resolve to whole months (for example, 3 or 3.5 years).' })
  }
  range(errors, 'delay.incomeGrowth', 'Annual after-tax income growth (%)', delay.incomeGrowth * 100, -99, 100)
  range(errors, 'delay.savingsReturn', 'Annual savings return (%)', delay.savingsReturn * 100, -99, 100)
  if (delay.monthlySavings !== undefined) range(errors, 'delay.monthlySavings', 'Monthly savings while waiting (₹)', delay.monthlySavings, 0, 1e12)
  if (errors.length) return { errors, projection: null }

  const timeline: PurchaseDelayPoint[] = [], monthlyTimeline: PurchaseDelayPoint[] = []
  const initialCash = h.liquidFunds
  const monthlyReturn = Math.expm1(Math.log1p(delay.savingsReturn) / 12)
  const months = Math.round(delay.years * 12)
  let cash = initialCash, savingsContributions = 0
  function snapshot(month: number): boolean {
    const years = month / 12
    const projectedProduct = { ...p, price: p.price * (1 + p.appreciation) ** years }
    const projectedHousehold = {
      ...h, liquidFunds: cash,
      annualIncome: h.annualIncome * (1 + delay.incomeGrowth) ** Math.floor(years),
    }
    // Keep projected scenarios within the same monetary limits as today's inputs.
    const projectedErrors = [...validateProduct(projectedProduct), ...validateHousehold(projectedHousehold)]
    if (projectedErrors.length) {
      errors.push(...projectedErrors.map(e => ({
        path: e.path === 'price' && projectedProduct.price < 1 ? 'appreciation' : 'delay.years',
        message: `After ${years.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${years === 1 ? 'year' : 'years'} of waiting: ${e.message} Adjust the delay or growth assumptions.`,
      })))
      return false
    }
    const point: PurchaseDelayPoint = {
      years, price: projectedProduct.price, annualIncome: projectedHousehold.annualIncome,
      savingsContributions, investmentGrowth: cash - initialCash - savingsContributions,
      capacity: calculateCapacity(projectedProduct, projectedHousehold),
    }
    monthlyTimeline.push(point)
    if (month % 12 === 0 || month === months) timeline.push(point)
    return true
  }
  if (!snapshot(0)) return { errors, projection: null }
  for (let month = 1; month <= months; month++) {
    // Savings are after rent and living costs. The homebuyer page supplies a fixed
    // monthly amount; legacy share-based callers use anniversary income growth.
    // Investment growth precedes month-end saving.
    const annualIncome = h.annualIncome * (1 + delay.incomeGrowth) ** Math.floor((month - 1) / 12)
    const contribution = delay.monthlySavings ?? annualIncome * h.savingsRate / 12
    cash = cash * (1 + monthlyReturn) + contribution
    savingsContributions += contribution
    if (!snapshot(month)) return { errors, projection: null }
  }
  return { errors, projection: { current: timeline[0], delayed: timeline.at(-1)!, timeline, monthlyTimeline } }
}
export function validatePurchaseDelay(p: IndiaProduct, h: IndiaHousehold, delay: PurchaseDelay): FieldError[] {
  return purchaseDelayScenario(p, h, delay).errors
}
export function evaluatePurchaseDelay(p: IndiaProduct, h: IndiaHousehold, delay: PurchaseDelay): PurchaseDelayProjection {
  const scenario = purchaseDelayScenario(p, h, delay)
  assertValid(scenario.errors)
  return scenario.projection!
}
