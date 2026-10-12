import { describe, expect, it } from 'vitest'
import { defaults, simulate } from '../src/engine'
import type { Inputs } from '../src/engine'
import { calculationJson, createCalculationReport, monthlyCsv, monthlyCsvColumns } from '../src/report'

const fixture = (overrides: Partial<Inputs> = {}): Inputs => ({
  ...structuredClone(defaults), price: 1200, down: { unit: 'percent', value: 1 },
  years: 1, mortgageRate: 0, term: 1, rent: 50, rentersInsurance: 0,
  investmentReturn: 0, rentGrowth: 0, inflation: 0,
  closing: { unit: 'dollars', value: 0 }, selling: { unit: 'dollars', value: 0 },
  propertyTax: { unit: 'dollars', value: 0 }, insurance: { unit: 'dollars', value: 0 },
  maintenance: { unit: 'dollars', value: 0 }, ...overrides,
})

describe('Calculation report projection', () => {
  it('preserves the original simulation and isolates its exported inputs and summaries', () => {
    const s = simulate(defaults), before = JSON.stringify(s)
    const r = createCalculationReport(s)
    expect(JSON.stringify(s)).toBe(before)
    expect(r.initial.renterInvestment).toBe(132000)
    expect(r.initial.mortgage).toBe(480000)
    expect(r.months[0].startingRenterPortfolio).toBe(132000)
    expect(r.months[0].startingBuyerPortfolio).toBe(0)
    r.inputs.price = 1; r.months[0].balance = 1; r.annual[0].balance = 1; r.result.salePrice = 1
    expect(JSON.stringify(s)).toBe(before)
  })
  it('reconciles every month and traces the prior closing portfolio', () => {
    const s = simulate(defaults), r = createCalculationReport(s)
    for (const [i, m] of r.months.entries()) {
      expect(m.startingRenterPortfolio).toBe(i === 0 ? r.initial.renterInvestment : r.months[i - 1].renterPortfolio)
      expect(m.startingBuyerPortfolio).toBe(i === 0 ? 0 : r.months[i - 1].buyerPortfolio)
      expect(m.renterGrowth).toBeCloseTo(m.startingRenterPortfolio * r.rates.monthlyInvestment, 7)
      expect(m.buyerGrowth).toBeCloseTo(m.startingBuyerPortfolio * r.rates.monthlyInvestment, 7)
      expect(m.startingRenterPortfolio + m.renterGrowth + m.renterContribution).toBeCloseTo(m.renterPortfolio, 7)
      expect(m.startingBuyerPortfolio + m.buyerGrowth + m.buyerContribution).toBeCloseTo(m.buyerPortfolio, 7)
      expect(m.startingBalance * r.rates.monthlyMortgage).toBeCloseTo(m.interest, 7)
      expect(m.startingBalance - m.principal).toBeCloseTo(m.balance, 7)
      expect(m.scheduledPayment + m.extraPrincipal).toBeCloseTo(m.payment, 7)
      expect(m.cashFlowDifference).toBe(m.buyCost - m.rentCost)
      expect(m.balance).toBe(s.months[i].balance)
    }
  })
  it('separates initial-fund returns and monthly-fund returns for gains, losses and zero return', () => {
    for (const investmentReturn of [-.1, 0, .07]) {
      const r = createCalculationReport(simulate({ ...defaults, investmentReturn }))
      for (const p of [r.portfolios.renter, r.portfolios.buyer]) {
        expect(p.initialCapital + p.downPaymentGrowth + p.closingCostsGrowth + p.monthlyContributions + p.contributionGrowth).toBeCloseTo(p.endingBalance, 7)
      }
      expect(r.portfolios.renter.downPaymentGrowth).toBeCloseTo(120000 * ((1 + investmentReturn) ** 10 - 1), 6)
      expect(r.portfolios.renter.closingCostsGrowth).toBeCloseTo(12000 * ((1 + investmentReturn) ** 10 - 1), 6)
      if (investmentReturn < 0) expect(r.portfolios.renter.contributionGrowth).toBeLessThan(0)
    }
  })
  it('distinguishes capped scheduled and extra payments at early payoff', () => {
    const r = createCalculationReport(simulate(fixture({ down: { unit: 'dollars', value: 0 }, extra: 2000 })))
    expect(r.months[0].scheduledPayment).toBe(100)
    expect(r.months[0].extraPrincipal).toBe(1100)
    expect(r.months[0].payment).toBe(1200)
    expect(r.months.slice(1).every(m => m.payment === 0 && m.extraPrincipal === 0 && m.scheduledPayment === 0)).toBe(true)
  })
  it('preserves sale algebra for fixed costs, percentage costs, negative CAGR and no threshold', () => {
    for (const selling of [{ unit: 'dollars' as const, value: 20 }, { unit: 'percent' as const, value: .06 }]) {
      const r = createCalculationReport(simulate(fixture({ selling })))
      expect(r.sale.algebraicSalePrice).toBe(r.result.salePrice)
      expect(r.result.appreciation).toBeLessThan(0)
      expect(Math.abs(r.result.difference)).toBeLessThan(.01)
    }
    const r = createCalculationReport(simulate(fixture({ rent: 200 })))
    expect(r.result.status).toBe('buy-always')
    expect(r.sale.algebraicSalePrice).toBe(-1200)
    expect(r.result.salePrice).toBe(0)
    expect(r.result.difference).toBe(1200)
  })
})

describe('Full precision exports', () => {
  const cases = [
    { name: 'default', input: defaults },
    { name: 'partial year', input: { ...defaults, years: 1.5 } },
    { name: 'cash purchase and negative CAGR', input: fixture() },
    { name: 'early payoff', input: fixture({ down: { unit: 'dollars', value: 0 }, extra: 2000 }) },
    { name: 'negative return', input: { ...defaults, investmentReturn: -.1 } },
    { name: 'buying already ahead', input: fixture({ rent: 200 }) },
  ]
  for (const c of cases) {
    it(`exports every month and preserves numbers for ${c.name}`, () => {
      const s = simulate(c.input), r = createCalculationReport(s)
      const csv = monthlyCsv(r), lines = csv.trimEnd().split('\r\n')
      expect(lines).toHaveLength(s.months.length + 1)
      expect(lines[0]).toBe(monthlyCsvColumns.join(','))
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',')
        expect(cells).toHaveLength(monthlyCsvColumns.length)
        monthlyCsvColumns.forEach((column, j) => expect(Number(cells[j])).toBe(r.months[i - 1][column]))
      }
      const json = JSON.parse(calculationJson(r))
      expect(json.formatVersion).toBe(1)
      expect(json.units.currency).toBe('USD')
      expect(json.units.rates).toBe('decimal')
      expect(json.inputs).toEqual(s.input)
      expect(json.months).toEqual(r.months)
      expect(json.annual).toEqual(s.annual)
      expect(json.result).toEqual(s.result)
      expect(json.assumptions.length).toBeGreaterThan(0)
      // Exported inputs alone reproduce the same engine result.
      expect(simulate(json.inputs).result).toEqual(s.result)
      if (c.name === 'partial year') {
        expect(json.months.at(-1).year).toBe(2)
        expect(json.annual.at(-1).months).toBe(6)
      }
    })
  }
})
