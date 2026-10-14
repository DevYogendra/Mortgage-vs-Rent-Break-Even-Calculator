import { describe, expect, it } from 'vitest'
import { mortgagePayment } from '../src/engine'
import {
  evaluateDemand, evaluateHousehold, evaluatePurchaseDelay, evaluateHomebuyer, validateHomebuyer, purchaseCharges, indiaHouseholdDefaults, indiaProductDefaults,
  indiaSegmentDefaults, priceCapacityCurve, purchaseDelayDefaults, validateHousehold, validateProduct, validatePurchaseDelay, validateSegments,
} from '../src/india'
import type { HouseholdSegment, IndiaHousehold, IndiaProduct, PurchaseDelay } from '../src/india'

const product = (patch: Partial<IndiaProduct> = {}): IndiaProduct => ({ ...indiaProductDefaults, ...patch })
const household = (patch: Partial<IndiaHousehold> = {}): IndiaHousehold => ({ ...indiaHouseholdDefaults, ...patch })
const segment = (patch: Partial<HouseholdSegment> = {}): HouseholdSegment => ({ ...household(), id: 'test', name: 'Test households', count: 10, ...patch })
const delay = (patch: Partial<PurchaseDelay> = {}): PurchaseDelay => ({ ...purchaseDelayDefaults, ...patch })

describe('Down payment plus separate upfront charges and computed savings', () => {
  const p = product({ price: 100000, purchaseCostRate: .1, loanRate: 0, termYears: 10, monthlyRent: 500, appreciation: .1 })
  const h = household({ liquidFunds: 20000 })
  const d = delay({ years: 1.5, rentGrowth: .1 })

  it('uses the correct interest-bearing mortgage for the default home and down payment', () => {
    const r = evaluateHomebuyer(product(), household(), delay({ rentGrowth: .03 }))
    expect(r.current.capacity.requiredLoan).toBe(9500000)
    // Independent annuity value for ₹95 lakh at 8.5% over 240 monthly payments.
    expect(r.current.capacity.requiredEmi).toBeCloseTo(82443.2071697257, 6)
  })

  it('calculates a mortgage from price minus down payment, paying charges in addition', () => {
    const r = evaluateHomebuyer(p, h, d)
    expect(r.current.capacity.requiredLoan).toBe(80000)
    expect(r.current.capacity.requiredEmi).toBeCloseTo(80000 / 120, 10)
    expect(r.current.capacity.availableCash).toBe(30000)
    expect(r.current.capacity.purchaseCosts).toBe(10000)
    expect(r.current.capacity.totalPurchaseCost).toBe(110000)
    const higherCharges = evaluateHomebuyer({ ...p, purchaseCostRate: .2 }, h, d)
    expect(higherCharges.current.capacity.requiredLoan).toBe(80000)
    expect(higherCharges.current.capacity.requiredEmi).toBe(r.current.capacity.requiredEmi)
    expect(higherCharges.current.capacity.availableCash).toBe(40000)
  })

  it('computes savings from mortgage minus rising rent, using the same portfolio while waiting', () => {
    const r = evaluateHomebuyer(p, h, d)
    // 12 × (80000/120 − 500) + 6 × (80000/120 − 550).
    expect(r.delayed.savingsContributions).toBeCloseTo(2700, 9)
    expect(r.delayed.capacity.availableCash).toBeCloseTo(32700, 9)
    expect(r.delayed.capacity.requiredLoan).toBeCloseTo(100000 * 1.1 ** 1.5 * 1.1 - 32700, 8)
    const unrelatedIncome = evaluateHomebuyer(p, { ...h, annualIncome: 0, savingsRate: 0 }, { ...d, incomeGrowth: .5, monthlySavings: 99999 })
    expect(unrelatedIncome.delayed.savingsContributions).toBe(r.delayed.savingsContributions)
    expect(unrelatedIncome.delayed.capacity.requiredLoan).toBe(r.delayed.capacity.requiredLoan)
  })

  it('supports fixed rupee charges and scales only percentage charges with projected prices', () => {
    const r = evaluateHomebuyer({ ...p, purchaseCostAmount: 10000 }, h, d)
    expect(r.current.capacity.purchaseCosts).toBe(10000)
    expect(r.delayed.capacity.purchaseCosts).toBe(10000)
    expect(evaluateHomebuyer(p, h, d).delayed.capacity.purchaseCosts).toBeCloseTo(10000 * 1.1 ** 1.5, 8)
    expect(purchaseCharges({ ...p, price: 200000, purchaseCostAmount: 10000 })).toBe(10000)
    expect(purchaseCharges({ ...p, price: 200000 })).toBe(20000)
    expect(validateProduct({ ...p, purchaseCostAmount: -1 }).some(e => e.path === 'purchaseCostAmount')).toBe(true)
  })

  it('includes avoided charges in starting investments and returns, without counting them as savings', () => {
    const r = evaluateHomebuyer({ ...p, monthlyRent: 1000 }, h, delay({ years: 1, rentGrowth: .1, savingsReturn: .12 }))
    expect(r.delayed.savingsContributions).toBe(0)
    expect(r.delayed.investmentGrowth).toBeCloseTo(3600, 8)
    expect(r.delayed.capacity.availableCash).toBeCloseTo(33600, 8)
  })

  it('enforces down-payment limits and stops deposits at loan payoff', () => {
    expect(validateHomebuyer(p, { ...h, liquidFunds: 100001 }, d).some(e => e.path === 'liquidFunds')).toBe(true)
    expect(validateHomebuyer(p, h, { ...d, rentGrowth: -1 }).some(e => e.path === 'delay.rentGrowth')).toBe(true)
    const r = evaluateHomebuyer({ ...p, termYears: 1 }, h, delay({ years: 2, rentGrowth: 0 }))
    expect(r.delayed.savingsContributions).toBeCloseTo(80000 - 500 * 12, 8)
    expect(r.monthlyTimeline[13].savingsContributions).toBe(r.monthlyTimeline[12].savingsContributions)
  })

  it('invests 90% of income increases only while waiting and compounds anniversary increments', () => {
    const home = product({ price: 36000, purchaseCostRate: 0, loanRate: 0, termYears: 3, monthlyRent: 500, appreciation: 0 })
    const buyer = household({ liquidFunds: 0, annualIncome: 12000 })
    const assumptions = delay({ years: 1.5, waitingEnabled: true, rentGrowth: .1, incomeGrowth: .1 })
    const r = evaluateHomebuyer(home, buyer, assumptions)
    expect(r.monthlyTimeline[12].savingsContributions).toBeCloseTo(6000, 9)
    expect(r.monthlyTimeline[13].savingsContributions).toBeCloseTo(6540, 9)
    expect(r.delayed.savingsContributions).toBeCloseTo(9240, 9)
    expect(r.delayed.capacity.availableCash).toBeCloseTo(9240, 9)
    expect(r.delayed.annualIncome / 12).toBeCloseTo(1100, 9)
    const twoYears = evaluateHomebuyer(home, buyer, { ...assumptions, years: 2 })
    expect(twoYears.delayed.savingsContributions).toBeCloseTo(12480, 9)
    expect(twoYears.delayed.annualIncome / 12).toBeCloseTo(1210, 9)
    const disabled = evaluateHomebuyer(home, { ...buyer, annualIncome: NaN }, { ...assumptions, waitingEnabled: false, incomeGrowth: NaN })
    expect(disabled.delayed).toEqual(disabled.current)
    expect(disabled.delayed.savingsContributions).toBe(0)
    expect(disabled.delayed.years).toBe(0)
  })
})

describe('India knowledge-card arithmetic', () => {
  it('reproduces the exact 5× income examples and savings comparison', () => {
    for (const [appreciation, incomeShare, savingsShare] of [[.01, .05, .2], [.04, .2, .8], [.05, .25, 1]]) {
      const r = evaluateHousehold(product({ appreciation }), household())
      expect(r.incomeMultiple).toBe(5)
      expect(r.appreciationIncomeShare).toBe(incomeShare)
      expect(r.appreciationSavingsShare).toBe(savingsShare)
      expect(r.annualSavings).toBe(750000)
    }
  })
  it('calculates gross yield and supports falling prices', () => {
    const r = evaluateHousehold(product({ appreciation: -.04 }), household())
    expect(r.grossYield).toBe(.025)
    expect(r.appreciationAmount).toBe(-600000)
    expect(r.appreciationIncomeShare).toBe(-.2)
  })
  it('returns unavailable ratios for zero income or savings', () => {
    const r = evaluateHousehold(product(), household({ annualIncome: 0, liquidFunds: 30000000 }))
    expect(r.tier).toBe(1)
    expect(r.incomeMultiple).toBeNull()
    expect(r.appreciationIncomeShare).toBeNull()
    expect(r.appreciationSavingsShare).toBeNull()
    expect(evaluateHousehold(product(), household({ savingsRate: 0 })).appreciationSavingsShare).toBeNull()
  })
})

describe('Cash, EMI and financing capacity', () => {
  it('reproduces the income-backed default with independent payment value', () => {
    const r = evaluateHousehold(product(), household())
    expect(r.tier).toBe(2)
    expect(r.availableCash).toBe(5500000)
    expect(r.purchaseCosts).toBeCloseTo(1050000, 7)
    expect(r.totalPurchaseCost).toBe(16050000)
    expect(r.requiredLoan).toBe(10550000)
    // Independent 50-digit Decimal annuity calculation, rounded for comparison.
    expect(r.requiredEmi).toBeCloseTo(91555.35112006382, 6)
    expect(r.emiBudget).toBe(100000)
    expect(r.minimumUpfrontCash).toBe(4800000)
    expect(r.cashGap).toBe(0)
    expect(r.emiGap).toBe(0)
    expect(r.effectiveDemand).toBe(true)
  })
  it('supports cash purchases with no income, EMI capacity, or credit', () => {
    const r = evaluateHousehold(product({ maxLtv: 0, maxEmiShare: 0 }), household({ annualIncome: 0, liquidFunds: 16050000, creditAccess: false }))
    expect(r.tier).toBe(1)
    expect(r.requiredLoan).toBe(0)
    expect(r.requiredEmi).toBe(0)
    expect(r.effectiveDemand).toBe(true)
    expect(r.maxAffordablePrice).toBeCloseTo(15000000, 7)
  })
  it('accepts exact cash, LTV and EMI equality boundaries', () => {
    const p = product({ price: 1000, purchaseCostRate: 0, loanRate: 0, termYears: 1, maxLtv: .8, maxEmiShare: 1 })
    const h = household({ annualIncome: 800, liquidFunds: 200 })
    const r = evaluateHousehold(p, h)
    expect(r.tier).toBe(2)
    expect(r.requiredEmi).toBeCloseTo(800 / 12, 12)
    expect(r.maxAffordablePrice).toBeCloseTo(1000, 10)
    expect(evaluateHousehold({ ...p, price: 1000.01 }, h).tier).toBe(3)
  })
  it('detects a cash / LTV failure separately from an EMI failure', () => {
    const r = evaluateHousehold(product(), household({ annualIncome: 10000000, liquidFunds: 4000000 }))
    expect(r.tier).toBe(3)
    expect(r.cashGap).toBe(800000)
    expect(r.loanToValueGap).toBe(r.cashGap)
    expect(r.emiGap).toBe(0)
    expect(r.exclusions).toEqual(['cash-ltv'])
  })
  it('detects an EMI failure with enough upfront cash', () => {
    const r = evaluateHousehold(product(), household({ annualIncome: 1200000 }))
    expect(r.tier).toBe(3)
    expect(r.cashGap).toBe(0)
    expect(r.emiGap).toBeGreaterThan(0)
    expect(r.exclusions).toEqual(['emi'])
  })
  it('uses all purchase funds and deducts existing debt, clamping the EMI budget at zero', () => {
    const r = evaluateHousehold(product(), household({ liquidFunds: 4500000, existingEmi: 110000 }))
    expect(r.availableCash).toBe(4500000)
    expect(r.emiBudget).toBe(0)
    expect(r.incomeLoanCapacity).toBe(0)
    expect(r.exclusions).toEqual(['cash-ltv', 'emi'])
    expect(r.maxAffordablePrice).toBeCloseTo(4500000 / 1.07, 7)
  })
  it('handles fully financed, zero-cost purchases with no upfront funds', () => {
    const p = product({ purchaseCostRate: 0, maxLtv: 1 })
    const h = household({ liquidFunds: 0 })
    const r = evaluateHousehold(p, h)
    expect(Number.isFinite(r.maxAffordablePrice)).toBe(true)
    expect(r.maxAffordablePrice).toBeCloseTo(r.incomeLoanCapacity, 7)
    expect(evaluateHousehold(p, { ...h, annualIncome: 0 }).maxAffordablePrice).toBe(0)
  })
  it('excludes upfront fees from the LTV-financed value', () => {
    const r = evaluateHousehold(product({ purchaseCostRate: .1 }), household({ liquidFunds: 5000000 }))
    expect(r.maxLtvLoan).toBe(11250000)
    expect(r.minimumUpfrontCash).toBe(5250000)
    expect(r.cashGap).toBe(250000)
  })
  it.each([0, .085, 1])('maximum affordable price satisfies both financing limits at rate %s', loanRate => {
    const p = product({ loanRate }), h = household()
    const r = evaluateHousehold(p, h)
    const atLimit = evaluateHousehold({ ...p, price: r.maxAffordablePrice }, h)
    expect(atLimit.financiallyCapable).toBe(true)
    expect(evaluateHousehold({ ...p, price: r.maxAffordablePrice + 1 }, h).financiallyCapable).toBe(false)
    expect(r.incomeLoanCapacity).toBeCloseTo(r.emiBudget / mortgagePayment(1, loanRate, 240), 7)
  })
})

describe('Effective demand and segments', () => {
  it.each([
    ['need', 'need'], ['desire', 'desire'], ['creditAccess', 'credit'], ['willingness', 'willingness'],
  ] as const)('keeps financial capacity separate from %s', (flag, reason) => {
    const r = evaluateHousehold(product(), household({ [flag]: false }))
    expect(r.tier).toBe(2)
    expect(r.financiallyCapable).toBe(true)
    expect(r.effectiveDemand).toBe(false)
    expect(r.exclusions).toEqual([reason])
  })
  it('allows cash buyers without credit but still requires the other demand gates', () => {
    const h = household({ liquidFunds: 30000000, creditAccess: false })
    expect(evaluateHousehold(product(), h).effectiveDemand).toBe(true)
    expect(evaluateHousehold(product(), { ...h, willingness: false }).effectiveDemand).toBe(false)
  })
  it('counts each segment once, including tiers and multiple exclusions', () => {
    const rows = [...structuredClone(indiaSegmentDefaults), segment({ willingness: false, desire: false })]
    const d = evaluateDemand(product(), rows)
    expect(d.total).toBe(1010)
    expect(d.capable).toBe(360)
    expect(d.effective).toBe(350)
    expect(d.tiers).toEqual({ 1: 100, 2: 260, 3: 650 })
    expect(d.segments[3].capacity.exclusions).toEqual(['desire', 'willingness'])
    expect(rows[0]).toEqual(indiaSegmentDefaults[0])
  })
  it('accepts zero-count segments and an empty pool', () => {
    expect(evaluateDemand(product(), [segment({ count: 0 })]).total).toBe(0)
    expect(evaluateDemand(product(), []).tiers).toEqual({ 1: 0, 2: 0, 3: 0 })
  })
  it('uses the exact household evaluator for every segment', () => {
    const d = evaluateDemand(product(), indiaSegmentDefaults)
    for (const row of d.segments) expect(row.capacity).toEqual(evaluateHousehold(product(), row.segment))
  })
  it('evaluates 21 prices and matches exact selected-price demand at the center', () => {
    const p = product({ price: 15000001 })
    const rows = indiaSegmentDefaults.map(s => ({ ...s, willingness: s.id !== 'income' }))
    const curve = priceCapacityCurve(p, rows), d = evaluateDemand(p, rows)
    expect(curve).toHaveLength(21)
    expect(curve[0].price).toBe(p.price * .5)
    expect(curve[20].price).toBe(p.price * 1.5)
    expect(curve[10]).toEqual({ price: p.price, capable: d.capable, effective: d.effective })
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].capable).toBeLessThanOrEqual(curve[i - 1].capable)
      expect(curve[i].effective).toBeLessThanOrEqual(curve[i].capable)
    }
    expect(curve[10].capable).toBeGreaterThan(curve[10].effective)
  })
})

describe('India input validation', () => {
  it.each([
    { price: 0 }, { price: Infinity }, { monthlyRent: -1 }, { loanRate: NaN },
    { loanRate: -1 }, { maxLtv: 1.01 }, { maxEmiShare: 1.01 }, { purchaseCostRate: -1 },
    { appreciation: -1.01 }, { termYears: 0 }, { termYears: 1.01 },
  ])('rejects invalid product values: %s', patch => {
    expect(validateProduct(product(patch)).length).toBeGreaterThan(0)
    expect(() => evaluateHousehold(product(patch), household())).toThrow()
    expect(() => priceCapacityCurve(product(patch), [])).toThrow()
  })
  it.each([
    { annualIncome: -1 }, { annualIncome: NaN }, { liquidFunds: Infinity }, { existingEmi: -1 },
    { liquidFunds: -1 }, { liquidFunds: NaN }, { savingsRate: 1.01 },
  ])('rejects invalid household values: %s', patch => {
    expect(validateHousehold(household(patch)).length).toBeGreaterThan(0)
    expect(() => evaluateHousehold(product(), household(patch))).toThrow()
  })
  it('validates count, names, identifiers and row field paths', () => {
    expect(validateSegments([segment({ count: 1.5 })]).some(e => e.path === 'test.count')).toBe(true)
    expect(validateSegments([segment({ count: -1 })]).length).toBeGreaterThan(0)
    expect(validateSegments([segment({ name: ' ' })]).some(e => e.path === 'test.name')).toBe(true)
    expect(validateSegments([segment(), segment()]).some(e => e.path === 'segments')).toBe(true)
    expect(() => evaluateDemand(product(), [segment({ count: NaN })])).toThrow()
  })
})

describe('Delayed property purchases', () => {
  const p = product({ price: 100000, appreciation: .1, purchaseCostRate: .05, loanRate: 0, termYears: 10, maxLtv: .8 })
  const h = household({ annualIncome: 24000, liquidFunds: 10000, savingsRate: .5 })

  it('supports fixed monthly savings independent of income or income growth', () => {
    const d = delay({ years: 1.5, monthlySavings: 1000, incomeGrowth: .5 })
    const a = evaluatePurchaseDelay(p, h, d)
    const b = evaluatePurchaseDelay(p, { ...h, annualIncome: 0, savingsRate: 0 }, d)
    expect(a.delayed.savingsContributions).toBe(18000)
    expect(b.delayed.capacity.availableCash).toBe(a.delayed.capacity.availableCash)
    expect(validatePurchaseDelay(p, h, delay({ monthlySavings: -1 })).some(e => e.path === 'delay.monthlySavings')).toBe(true)
    expect(validatePurchaseDelay(p, h, delay({ monthlySavings: NaN })).some(e => e.path === 'delay.monthlySavings')).toBe(true)
  })

  it('zero delay preserves today’s inputs and capacity exactly', () => {
    const result = evaluatePurchaseDelay(p, h, delay())
    expect(result.timeline).toHaveLength(1)
    expect(result.monthlyTimeline).toEqual(result.timeline)
    expect(result.current.capacity).toEqual(evaluateHousehold(p, h))
    expect(result.delayed).toEqual(result.current)
    expect(result.delayed.savingsContributions).toBe(0)
    expect(result.delayed.investmentGrowth).toBe(0)
    expect(p.price).toBe(100000)
    expect(h.liquidFunds).toBe(10000)
  })
  it('compounds prices and costs, adds savings, and recomputes cash and EMI capacity', () => {
    const result = evaluatePurchaseDelay(p, h, delay({ years: 2 }))
    expect(result.current.capacity.tier).toBe(3)
    expect(result.timeline.map(row => row.years)).toEqual([0, 1, 2])
    expect(result.delayed.price).toBeCloseTo(121000, 8)
    expect(result.delayed.savingsContributions).toBe(24000)
    expect(result.delayed.investmentGrowth).toBe(0)
    const c = result.delayed.capacity
    expect(c.availableCash).toBe(34000)
    expect(c.totalPurchaseCost).toBeCloseTo(127050, 8)
    expect(c.minimumUpfrontCash).toBeCloseTo(30250, 8)
    expect(c.requiredLoan).toBeCloseTo(93050, 8)
    expect(c.requiredEmi).toBeCloseTo(93050 / 120, 8)
    expect(c.emiBudget).toBe(800)
    expect(c.tier).toBe(2)
  })
  it('applies income growth on anniversaries and saves from the income earned in each year', () => {
    const result = evaluatePurchaseDelay(p, h, delay({ years: 2, incomeGrowth: .1 }))
    for (const [index, income] of [24000, 26400, 29040].entries()) expect(result.timeline[index].annualIncome).toBeCloseTo(income, 8)
    expect(result.delayed.savingsContributions).toBeCloseTo(25200, 8)
    expect(result.delayed.capacity.availableCash).toBeCloseTo(35200, 8)
    expect(result.delayed.capacity.emiBudget).toBeCloseTo(968, 8)
  })
  it('includes a partial-year endpoint with monthly saving and fractional-year price growth', () => {
    const result = evaluatePurchaseDelay(p, h, delay({ years: 1.5, incomeGrowth: .1 }))
    expect(result.timeline.map(row => row.years)).toEqual([0, 1, 1.5])
    expect(result.delayed.price).toBeCloseTo(100000 * 1.1 ** 1.5, 8)
    expect(result.delayed.savingsContributions).toBeCloseTo(18600, 8)
    expect(result.delayed.capacity.availableCash).toBeCloseTo(28600, 8)
    expect(result.delayed.annualIncome).toBeCloseTo(26400, 8)
  })
  it('compounds all liquid purchase funds', () => {
    const result = evaluatePurchaseDelay(p, { ...h, savingsRate: 0 }, delay({ years: 2, savingsReturn: .21 }))
    expect(result.delayed.capacity.availableCash).toBeCloseTo(14641, 8)
    expect(result.delayed.investmentGrowth).toBeCloseTo(4641, 8)
    expect(result.delayed.savingsContributions).toBe(0)
  })
  it('uses effective monthly returns and month-end contributions', () => {
    const result = evaluatePurchaseDelay(p, h, delay({ years: 1, savingsReturn: 1.01 ** 12 - 1 }))
    const expected = 10000 * 1.01 ** 12 + 1000 * (1.01 ** 12 - 1) / .01
    expect(result.delayed.capacity.availableCash).toBeCloseTo(expected, 7)
    expect(result.delayed.savingsContributions).toBe(12000)
    expect(result.delayed.investmentGrowth).toBeCloseTo(expected - 22000, 7)
  })
  it('can become unaffordable when prices outpace saving', () => {
    const result = evaluatePurchaseDelay(product({ appreciation: .1 }), household(), delay({ years: 3 }))
    expect(result.current.capacity.tier).toBe(2)
    expect(result.delayed.price).toBeCloseTo(19965000, 6)
    expect(result.delayed.capacity.availableCash).toBe(7750000)
    expect(result.delayed.capacity.requiredLoan).toBeCloseTo(13612550, 6)
    expect(result.delayed.capacity.tier).toBe(3)
    expect(result.delayed.capacity.emiGap).toBeGreaterThan(0)
  })
  it('retains demand gates and exempts a future cash buyer from credit access', () => {
    const result = evaluatePurchaseDelay({ ...p, appreciation: 0 }, { ...h, creditAccess: false }, delay({ years: 10 }))
    expect(result.current.capacity.effectiveDemand).toBe(false)
    expect(result.delayed.capacity.tier).toBe(1)
    expect(result.delayed.capacity.effectiveDemand).toBe(true)
    const unwilling = evaluatePurchaseDelay(p, { ...h, willingness: false }, delay({ years: 2 }))
    expect(unwilling.delayed.capacity.exclusions).toEqual(['willingness'])
  })
  it('does not deduct rent twice from savings already net of living costs', () => {
    const lowerRent = evaluatePurchaseDelay({ ...p, monthlyRent: 1000 }, h, delay({ years: 2 }))
    const higherRent = evaluatePurchaseDelay({ ...p, monthlyRent: 5000 }, h, delay({ years: 2 }))
    expect(lowerRent.delayed.capacity.availableCash).toBe(higherRent.delayed.capacity.availableCash)
  })
  it('supports zero income, zero savings, negative returns and the 30-year boundary', () => {
    const cashBuyer = evaluatePurchaseDelay(p, { ...h, annualIncome: 0, liquidFunds: 300000, savingsRate: 0 }, delay({ years: 2 }))
    expect(cashBuyer.delayed.capacity.tier).toBe(1)
    expect(cashBuyer.delayed.capacity.incomeMultiple).toBeNull()
    const losses = evaluatePurchaseDelay(p, { ...h, savingsRate: 0 }, delay({ years: 2, savingsReturn: -.99 }))
    expect(losses.delayed.capacity.availableCash).toBeCloseTo(1, 8)
    expect(losses.delayed.investmentGrowth).toBeCloseTo(-9999, 8)
    const long = evaluatePurchaseDelay({ ...p, appreciation: 0 }, h, delay({ years: 30 }))
    expect(long.timeline).toHaveLength(31)
    expect(long.monthlyTimeline).toHaveLength(361)
    expect(long.delayed.capacity.availableCash).toBe(370000)
  })
  it('exposes every month for chart inspection without changing the annual checkpoints', () => {
    const result = evaluatePurchaseDelay(p, h, delay({ years: 1.5, incomeGrowth: .1 }))
    expect(result.monthlyTimeline).toHaveLength(19)
    expect(result.monthlyTimeline[0]).toBe(result.current)
    expect(result.monthlyTimeline[18]).toBe(result.delayed)
    expect(result.timeline).toEqual([result.monthlyTimeline[0], result.monthlyTimeline[12], result.monthlyTimeline[18]])
    const first = result.monthlyTimeline[1]
    expect(first.years).toBe(1 / 12)
    expect(first.price).toBeCloseTo(100000 * 1.1 ** (1 / 12), 8)
    expect(first.savingsContributions).toBe(1000)
    expect(first.capacity.availableCash).toBe(11000)
    expect(result.monthlyTimeline[13].savingsContributions).toBeCloseTo(13100, 8)
  })
  it('reconciles extra costs, savings and returns at every month, including falling prices and cash purchases', () => {
    const result = evaluatePurchaseDelay({ ...p, appreciation: -.1 }, { ...h, liquidFunds: 300000 }, delay({ years: 2, savingsReturn: -.05 }))
    for (const point of result.monthlyTimeline) {
      const extraPrice = point.price - result.current.price
      const extraFees = point.capacity.purchaseCosts - result.current.capacity.purchaseCosts
      expect(point.capacity.totalPurchaseCost - result.current.capacity.totalPurchaseCost).toBeCloseTo(extraPrice + extraFees, 7)
      expect(point.capacity.availableCash - result.current.capacity.availableCash).toBeCloseTo(point.savingsContributions + point.investmentGrowth, 7)
      expect(point.capacity.requiredLoan).toBe(0)
      expect(point.capacity.requiredLoan - result.current.capacity.requiredLoan).toBe(0)
    }
    expect(result.delayed.investmentGrowth).toBeLessThan(0)
    expect(result.delayed.savingsContributions).toBe(24000)
    expect(result.delayed.price).toBeCloseTo(81000, 8)
  })
  it.each([
    { years: -1 }, { years: NaN }, { years: 31 }, { years: 1.01 },
    { incomeGrowth: -1 }, { incomeGrowth: Infinity }, { savingsReturn: -1 }, { savingsReturn: 1.01 },
  ])('rejects invalid purchase-delay assumptions: %s', patch => {
    expect(validatePurchaseDelay(p, h, delay(patch)).length).toBeGreaterThan(0)
    expect(() => evaluatePurchaseDelay(p, h, delay(patch))).toThrow()
  })
  it('rejects zero or out-of-range projected property prices instead of exposing invalid results', () => {
    expect(validatePurchaseDelay({ ...p, appreciation: -1 }, h, delay({ years: 1 }))[0].path).toBe('appreciation')
    expect(() => evaluatePurchaseDelay({ ...p, appreciation: -1 }, h, delay({ years: 1 }))).toThrow()
    expect(validatePurchaseDelay({ ...p, price: 1e12 }, h, delay({ years: 1 })).some(e => e.path === 'delay.years')).toBe(true)
    expect(() => evaluatePurchaseDelay({ ...p, price: 1e12 }, h, delay({ years: 1 }))).toThrow()
  })
})
