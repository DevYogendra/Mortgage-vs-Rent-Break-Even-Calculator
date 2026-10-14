import { describe, expect, it } from 'vitest'
import { evaluateRentOnly, validateRentOnly } from '../src/rentOnly'
import type { RentOnlyInputs } from '../src/rentOnly'

const inputs = (patch: Partial<RentOnlyInputs> = {}): RentOnlyInputs => ({
  monthlyRent: 500, rentGrowth: .1, years: 1.5, loanAmount: 36000,
  loanRate: 0, termYears: 3, investmentReturn: 0, initialInvestment: 0, ...patch,
})

describe('Rent only, investing the mortgage–rent difference', () => {
  it('raises rent in month 13 and reduces deposits, including a partial final year', () => {
    const r = evaluateRentOnly(inputs())
    expect(r.mortgagePayment).toBe(1000)
    expect(r.annual.map(a => a.months)).toEqual([12, 6])
    expect(r.annual[0].monthlyRent).toBe(500)
    expect(r.annual[1].monthlyRent).toBe(550)
    expect(r.annual[0].invested).toBe(6000)
    expect(r.annual[1].invested).toBe(2700)
    expect(r.totalRent).toBe(9300)
    expect(r.totalInvested).toBe(8700)
    expect(r.portfolio).toBe(8700)
    expect(r.investmentGrowth).toBe(0)
  })

  it('starts at zero and compounds effective returns before month-end deposits', () => {
    const r = evaluateRentOnly(inputs({ years: 1, investmentReturn: 1.01 ** 12 - 1 }))
    const expected = 500 * (1.01 ** 12 - 1) / .01
    expect(r.totalInvested).toBe(6000)
    expect(r.portfolio).toBeCloseTo(expected, 8)
    expect(r.investmentGrowth).toBeCloseTo(expected - 6000, 8)
  })

  it('compounds starting funds without counting them as monthly contributions or gains', () => {
    const r = evaluateRentOnly(inputs({ years: 1, initialInvestment: 50000, investmentReturn: .12 }))
    const monthlyReturn = 1.12 ** (1 / 12) - 1
    const expected = 50000 * 1.12 + 500 * (1.12 - 1) / monthlyReturn
    expect(r.initialInvestment).toBe(50000)
    expect(r.totalInvested).toBe(6000)
    expect(r.portfolio).toBeCloseTo(expected, 7)
    expect(r.investmentGrowth).toBeCloseTo(expected - 50000 - 6000, 7)
    const noDeposits = evaluateRentOnly(inputs({ initialInvestment: 50000, years: 1, monthlyRent: 1500, investmentReturn: .12 }))
    expect(noDeposits.totalInvested).toBe(0)
    expect(noDeposits.portfolio).toBeCloseTo(56000, 7)
    expect(noDeposits.investmentGrowth).toBeCloseTo(6000, 7)
    const today = evaluateRentOnly(inputs({ initialInvestment: 50000, years: 0 }))
    expect(today.portfolio).toBe(50000)
    expect(today.investmentGrowth).toBe(0)
    expect(today.totalInvested).toBe(0)
  })

  it('never invests a negative difference or adds avoided rent to the portfolio', () => {
    const r = evaluateRentOnly(inputs({ monthlyRent: 1500, investmentReturn: .1 }))
    expect(r.totalRent).toBe(27900)
    expect(r.totalInvested).toBe(0)
    expect(r.portfolio).toBe(0)
    expect(evaluateRentOnly(inputs({ loanAmount: 0 })).portfolio).toBe(0)
    const crossing = evaluateRentOnly(inputs({ monthlyRent: 900, rentGrowth: .2, years: 2 }))
    expect(crossing.annual.map(a => a.invested)).toEqual([1200, 0])
  })

  it('stops avoided-mortgage contributions after the original loan term', () => {
    const r = evaluateRentOnly(inputs({ loanAmount: 12000, termYears: 1, years: 2 }))
    expect(r.annual.map(a => a.invested)).toEqual([6000, 0])
    expect(r.portfolio).toBe(6000)
    expect(r.totalRent).toBe(12600)
    const partialTerm = evaluateRentOnly(inputs({ loanAmount: 18000, termYears: 1.5, years: 2 }))
    expect(partialTerm.totalInvested).toBe(8700)
  })

  it('supports flat or falling rent, zero duration, no rent and negative investment returns', () => {
    expect(evaluateRentOnly(inputs({ rentGrowth: 0 })).totalRent).toBe(9000)
    const falling = evaluateRentOnly(inputs({ rentGrowth: -.1 }))
    expect(falling.endingMonthlyRent).toBe(450)
    expect(falling.totalInvested).toBe(9300)
    const zero = evaluateRentOnly(inputs({ years: 0 }))
    expect(zero.annual).toEqual([])
    expect(zero.totalRent).toBe(0)
    expect(zero.portfolio).toBe(0)
    const losses = evaluateRentOnly(inputs({ monthlyRent: 0, investmentReturn: -.05 }))
    expect(losses.totalInvested).toBe(18000)
    expect(losses.investmentGrowth).toBeLessThan(0)
  })

  it('reconciles yearly rent, deposits, returns and ending portfolios for a long projection', () => {
    const r = evaluateRentOnly(inputs({ initialInvestment: 50000, years: 30, loanAmount: 2000000, loanRate: .085, termYears: 20, investmentReturn: .07 }))
    expect(r.totalRent).toBeCloseTo(r.annual.reduce((s, a) => s + a.rentPaid, 0), 5)
    expect(r.totalInvested).toBeCloseTo(r.annual.reduce((s, a) => s + a.invested, 0), 5)
    for (const a of r.annual) expect(a.portfolio).toBeCloseTo(r.initialInvestment + a.cumulativeInvested + a.investmentGrowth, 5)
  })

  it.each([
    { rentGrowth: NaN }, { rentGrowth: -1 }, { rentGrowth: 1.01 },
    { years: 1.01 }, { years: 31 }, { monthlyRent: -1 }, { loanAmount: -1 },
    { termYears: 0 }, { termYears: 1.01 }, { loanRate: Infinity }, { investmentReturn: -1 }, { initialInvestment: -1 }, { initialInvestment: NaN },
  ])('rejects invalid rental assumptions: %s', patch => {
    expect(validateRentOnly(inputs(patch)).length).toBeGreaterThan(0)
    expect(() => evaluateRentOnly(inputs(patch))).toThrow()
  })
})
