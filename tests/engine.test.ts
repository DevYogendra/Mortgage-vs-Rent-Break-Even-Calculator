import { describe, expect, it } from 'vitest'
import { defaults, mortgagePayment, simulate, validate, wealthAtRate } from '../src/engine'
import type { Inputs } from '../src/engine'

const cashFixture = (overrides: Partial<Inputs> = {}): Inputs => ({
  ...structuredClone(defaults), price: 1200, down: { value: 1, unit: 'percent' }, years: 1,
  closing: { value: 0, unit: 'dollars' }, selling: { value: 0, unit: 'dollars' },
  mortgageRate: 0, term: 1, propertyTax: { value: 0, unit: 'dollars' },
  insurance: { value: 0, unit: 'dollars' }, maintenance: { value: 0, unit: 'dollars' },
  rent: 0, rentersInsurance: 0, rentGrowth: 0, inflation: 0, investmentReturn: 0, ...overrides,
})
describe('Mortgage amortization', () => {
  it('matches independent standard loan payment and 10-year balance', () => {
    const s = simulate(defaults)
    expect(s.payment).toBeCloseTo(2955.4425620467, 8)
    expect(s.months.at(-1)!.balance).toBeCloseTo(404341.021790264, 6)
    expect(s.months[0].interest).toBe(2500)
    expect(s.months[0].principal).toBeCloseTo(455.4425620467, 8)
    expect(s.months.reduce((total, m) => total + m.principal, 0)).toBeCloseTo(s.initialLoan - s.months.at(-1)!.balance, 6)
  })
  it('supports zero interest and cash purchases', () => {
    expect(mortgagePayment(1200, 0, 12)).toBe(100)
    const s = simulate(cashFixture())
    expect(s.payment).toBe(0)
    expect(s.result.salePrice).toBe(1200)
    expect(s.result.appreciation).toBe(0)
  })
  it('stops payments after payoff and caps extra principal at the amount owed', () => {
    const s = simulate(cashFixture({ down: { value: 0, unit: 'dollars' }, years: 2, extra: 2000 }))
    expect(s.months[0].payment).toBe(1200)
    expect(s.months[0].principal).toBe(1200)
    expect(s.months.slice(1).every(m => m.payment === 0 && m.interest === 0 && m.balance === 0)).toBe(true)
    expect(s.months[0].renterContribution).toBe(1200)
  })
  it('stops PMI after the configured threshold is reached', () => {
    const s = simulate(cashFixture({ down: { value: .1, unit: 'percent' }, pmi: 10, pmiEnd: .8 }))
    expect(s.months[0].pmi).toBe(10)
    expect(s.months[1].pmi).toBe(10)
    expect(s.months[2].pmi).toBe(0)
  })
})
describe('Monthly timing and fair cash flow', () => {
  it('uses effective annual returns and end-of-month deposits', () => {
    const s = simulate(cashFixture({ investmentReturn: (1.01 ** 12) - 1, otherOwner: 100 }))
    const expected = 1200 * 1.01 ** 12 + 100 * ((1.01 ** 12 - 1) / .01)
    expect(s.months[0].renterPortfolio).toBeCloseTo(1312, 8)
    expect(s.result.renterWealth).toBeCloseTo(expected, 8)
    expect(s.result.salePrice).toBeCloseTo(expected, 8)
  })
  it('invests avoided closing costs at time zero', () => {
    const s = simulate(cashFixture({ closing: { value: 120, unit: 'dollars' }, investmentReturn: .07 }))
    expect(s.result.renterWealth).toBeCloseTo(1320 * 1.07, 8)
  })
  it('increases rent and expenses starting in month 13; maintains purchase-price expense basis', () => {
    const s = simulate(cashFixture({ years: 2, rent: 2700, rentGrowth: .03, propertyTax: { value: .01, unit: 'percent' }, inflation: .03 }))
    expect(s.months[11].rent).toBe(2700)
    expect(s.months[12].rent).toBe(2781)
    expect(s.months[11].propertyTax).toBe(1)
    expect(s.months[12].propertyTax).toBe(1.03)
  })
  it('invests buyer savings and permits a negative appreciation threshold', () => {
    const s = simulate(cashFixture({ rent: 50 }))
    expect(s.result.salePrice).toBe(600)
    expect(s.result.appreciation).toBe(-.5)
    expect(s.months.at(-1)!.buyerPortfolio).toBe(600)
    expect(s.result.buyerWealth).toBe(1200)
  })
  it('handles savings switching from renter to buyer after mortgage payoff', () => {
    const s = simulate(cashFixture({ down: { value: .5, unit: 'percent' }, years: 2, rent: 25 }))
    expect(s.months[0].renterContribution).toBe(25)
    expect(s.months[12].buyerContribution).toBe(25)
    expect(s.months[12].renterContribution).toBe(0)
  })
  it('estimates only selected tax savings, defaulting to zero', () => {
    const s = simulate({ ...defaults, taxBenefit: .2, includePropertyTax: true })
    expect(s.months[0].taxSaving).toBe(600)
    expect(simulate(defaults).months[0].taxSaving).toBe(0)
  })
  it('supports negative investment returns above −100%', () => {
    const s = simulate(cashFixture({ investmentReturn: -.1 }))
    expect(s.result.renterWealth).toBeCloseTo(1080, 8)
  })
})
describe('Break-even solver and summaries', () => {
  it('matches an independent annual-block annuity for the fully specified defaults', () => {
    // Default buy-minus-rent contribution is payment - 1,570 * 1.03^year.
    // Accumulate each 12-payment block using an annuity, then annual growth.
    const monthlyRate = 1.07 ** (1 / 12) - 1
    const annualAnnuity = (1.07 - 1) / monthlyRate
    const payment = 2955.4425620466936
    let portfolio = 132000 * 1.07 ** 10
    for (let year = 0; year < 10; year++) portfolio += (payment - 1570 * 1.03 ** year) * annualAnnuity * 1.07 ** (9 - year)
    const sale = (portfolio + 404341.02179026435) / .94
    const s = simulate(defaults)
    expect(s.result.renterWealth).toBeCloseTo(portfolio, 6)
    expect(s.result.salePrice).toBeCloseTo(sale, 6)
    expect(s.result.appreciation).toBeCloseTo((sale / 600000) ** .1 - 1, 10)
  })
  it('deducts sale percentage or fixed dollars correctly', () => {
    expect(simulate(cashFixture({ selling: { value: .06, unit: 'percent' } })).result.salePrice).toBeCloseTo(1200 / .94, 8)
    expect(simulate(cashFixture({ selling: { value: 120, unit: 'dollars' } })).result.salePrice).toBe(1320)
  })
  it('handles buying ahead even at zero sale price', () => {
    const s = simulate(cashFixture({ rent: 200 }))
    expect(s.result.status).toBe('buy-always')
    expect(s.result.salePrice).toBe(0)
    expect(s.result.difference).toBe(1200)
  })
  it('reconciles at the unrounded solution and reverses the winner on either side', () => {
    const s = simulate(defaults)
    expect(Math.abs(s.result.difference)).toBeLessThan(.01)
    const at = wealthAtRate(s, s.result.appreciation).at(-1)!
    expect(Math.abs(at.buyer - at.renter)).toBeLessThan(.01)
    const below = wealthAtRate(s, s.result.appreciation - .01).at(-1)!
    const above = wealthAtRate(s, s.result.appreciation + .01).at(-1)!
    expect(below.buyer).toBeLessThan(below.renter)
    expect(above.buyer).toBeGreaterThan(above.renter)
  })
  it('each annual threshold agrees with a standalone simulation of that horizon', () => {
    const s = simulate({ ...defaults, years: 10.5 })
    for (const a of s.annual) expect(a.breakEven.salePrice).toBeCloseTo(simulate({ ...defaults, years: a.year }).result.salePrice, 6)
    expect(s.annual.at(-1)!.months).toBe(6)
    expect(s.annual.reduce((v, a) => v + a.buyCost, 0)).toBeCloseTo(s.months.reduce((v, m) => v + m.buyCost, 0), 6)
  })
  it('reconciles a broad matrix of valid scenarios', () => {
    for (const years of [1 / 12, 1, 10.5, 40]) for (const investmentReturn of [-.05, 0, .07]) for (const down of [0, .2, 1]) {
      const s = simulate({ ...defaults, years, investmentReturn, down: { unit: 'percent', value: down } })
      if (s.result.status === 'solved') expect(Math.abs(s.result.difference)).toBeLessThan(.01)
      expect(s.months.every(m => m.balance >= 0 && m.buyerContribution * m.renterContribution === 0)).toBe(true)
    }
  })
  it('rejects invalid rates, missing inputs, overpayment and fractional months', () => {
    for (const changes of [{ price: 0 }, { down: { unit: 'percent' as const, value: 1.1 } }, { investmentReturn: -1 }, { rent: NaN }, { years: .1 }, { selling: { unit: 'percent' as const, value: 1 } }]) {
      expect(validate({ ...defaults, ...changes }).length).toBeGreaterThan(0)
      expect(() => simulate({ ...defaults, ...changes })).toThrow()
    }
  })
})
