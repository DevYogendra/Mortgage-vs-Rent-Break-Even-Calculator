import { describe, expect, it } from 'vitest'
import { requiredIncomeGrowth, minimumTakeHome } from '../src/incomeGrowth'
import type { IncomeGrowthInputs } from '../src/incomeGrowth'

const inputs = (patch: Partial<IncomeGrowthInputs> = {}): IncomeGrowthInputs => ({
  monthlyIncome: 100000, monthlyMortgage: 70000, existingPayments: 10000, paymentShare: .4, years: 5, ...patch,
})
describe('Separate required income growth', () => {
  it('requires enough take-home income for both EMI and a mortgage at most 4× annual income', () => {
    const emiDominates = minimumTakeHome(12000000, 110000)
    expect(emiDominates.loanIncome).toBe(250000)
    expect(emiDominates.emiIncome).toBe(275000)
    expect(emiDominates.requiredMonthlyIncome).toBe(275000)
    const loanDominates = minimumTakeHome(12000000, 80000)
    expect(loanDominates.requiredMonthlyIncome).toBe(250000)
    expect(loanDominates.requiredMonthlyIncome! * 12 * 4).toBe(12000000)
    expect(80000 / loanDominates.requiredMonthlyIncome!).toBeLessThanOrEqual(.4)
    const growth = requiredIncomeGrowth(inputs({ monthlyIncome: 100000, monthlyMortgage: 80000, existingPayments: 0, mortgageAmount: 12000000 }))
    expect(growth.requiredMonthlyIncome).toBe(250000)
    expect(growth.annualGrowth).toBeCloseTo(2.5 ** .2 - 1, 12)
  })
  it('solves the income needed for mortgage and other payments at the selected limit', () => {
    const r = requiredIncomeGrowth(inputs())
    expect(r.requiredMonthlyIncome).toBe(200000)
    expect(r.annualGrowth).toBeCloseTo(2 ** .2 - 1, 12)
    expect(100000 * (1 + r.annualGrowth!) ** 5 * .4 - 10000).toBeCloseTo(70000, 8)
  })
  it('returns zero growth when current income covers the limit or no loan payments remain', () => {
    expect(requiredIncomeGrowth(inputs({ monthlyIncome: 300000 })).annualGrowth).toBe(0)
    expect(requiredIncomeGrowth(inputs({ monthlyMortgage: 0, existingPayments: 0, monthlyIncome: 0, paymentShare: 0 })).requiredMonthlyIncome).toBe(0)
  })
  it('handles zero starting income, no waiting period, and no income share for borrowing', () => {
    expect(requiredIncomeGrowth(inputs({ monthlyIncome: 0 })).status).toBe('zero-income')
    expect(requiredIncomeGrowth(inputs({ years: 0 })).status).toBe('no-time')
    const noBudget = requiredIncomeGrowth(inputs({ paymentShare: 0 }))
    expect(noBudget.status).toBe('no-budget')
    expect(noBudget.requiredMonthlyIncome).toBeNull()
    expect(noBudget.annualGrowth).toBeNull()
  })
  it('uses fractional years and rejects invalid assumptions', () => {
    expect(requiredIncomeGrowth(inputs({ years: 1.5 })).annualGrowth).toBeCloseTo(2 ** (1 / 1.5) - 1, 12)
    for (const patch of [{ monthlyIncome: NaN }, { monthlyMortgage: -1 }, { existingPayments: -1 }, { paymentShare: 1.01 }, { years: -1 }]) expect(() => requiredIncomeGrowth(inputs(patch))).toThrow()
  })
})
