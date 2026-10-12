import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FieldError, IndiaHousehold, IndiaProduct, PurchaseDelay, PurchaseDelayProjection } from './india'
import NumberField from './IndiaField'
import { PurchaseDelayBars, PurchaseDelayCalculations } from './PurchaseDelayDetails'
import './BeginnerBuyer.css'

const money = (n: number) => Number.isFinite(n) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) < .5 ? 0 : n) : 'Unavailable'
const number = (n: number) => Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'
const familiarMoney = (n: number) => Math.abs(n) >= 1e7 ? `₹${number(n / 1e7)} crore` : Math.abs(n) >= 1e5 ? `₹${number(n / 1e5)} lakh` : money(n)
export type BuyerGoal = 'afford' | 'wait'

export default function BeginnerBuyer({ product, setProduct, household, setHousehold, delay, setDelay, errors, projection, goal, advanced, further, reset }: {
  product: IndiaProduct; setProduct: (p: IndiaProduct) => void;
  household: IndiaHousehold; setHousehold: (h: IndiaHousehold) => void;
  delay: PurchaseDelay; setDelay: (d: PurchaseDelay) => void;
  errors: FieldError[]; projection: PurchaseDelayProjection | null; goal: BuyerGoal;
  advanced: ReactNode; further: ReactNode; reset: () => void;
}) {
  const [step, setStep] = useState(0)
  const [savingsDraft, setSavingsDraft] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const steps = ['The home', 'Your finances', goal === 'wait' ? 'Waiting & result' : 'Your result']
  const stagePaths = step === 0 ? ['price', 'monthlyRent'] : step === 1 ? ['annualIncome', 'liquidFunds', 'reserve', 'existingEmi', 'savingsRate'] : []
  const stageErrors = errors.filter(e => stagePaths.includes(e.path))
  function go(next: number) {
    setStep(next)
    requestAnimationFrame(() => {
      const target = next === 2 ? resultHeading.current ?? heading.current : heading.current
      target?.focus({ preventScroll: true })
      const scrollTarget = next === 2 && resultHeading.current ? resultHeading.current.closest('section') : target
      scrollTarget?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  const field = (label: string, path: string, value: number, onChange: (v: number) => void, unit = '₹', hint?: string, rate = false) =>
    <NumberField label={label} path={path} value={value} onChange={onChange} unit={unit} hint={hint} rate={rate} errors={errors} />
  const cashField = (key: 'liquidFunds' | 'reserve', label: string, hint: string) => field(label, key, household[key] / 1e5, v => setHousehold({ ...household, [key]: v * 1e5 }), 'lakh', hint)
  const monthlySavings = savingsDraft ?? household.annualIncome * household.savingsRate / 12
  const savingsErrors = errors.map(e => e.path === 'savingsRate' ? { ...e, message: 'Enter monthly savings between ₹0 and your monthly take-home income.' } : e)
  const now = projection?.current, later = projection?.delayed
  const point = goal === 'wait' ? later : now
  const capacity = point?.capacity
  const extraCost = now && point ? point.capacity.totalPurchaseCost - now.capacity.totalPurchaseCost : 0
  const extraCash = now && point ? point.capacity.availableCash - now.capacity.availableCash : 0
  const progress = extraCash - extraCost
  return <section className="beginner-buyer" aria-label="Guided homebuyer calculator">
    <div className="beginner-step-header"><ol aria-label="Calculator steps">{steps.map((label, i) => <li key={i} aria-current={i === step ? 'step' : undefined}><span>{i + 1}</span>{label}</li>)}</ol><button className="text-button" type="button" onClick={reset}>Reset examples</button></div>
    <div className={step === 2 ? 'beginner-final' : undefined}>
    {step === 2 && capacity && point && now && <section className="beginner-answer" aria-label="Your answer" aria-live="polite"><p className="eyebrow">{goal === 'wait' && delay.years > 0 ? `AFTER ${number(delay.years)} YEARS` : 'BUYING TODAY'}</p><h2 ref={resultHeading} tabIndex={-1}>{capacity.tier === 1 ? 'Your available cash covers this home.' : capacity.tier === 2 ? 'This home fits your modeled cash and loan budget.' : 'This home is beyond your modeled budget.'}</h2>
        {goal === 'wait' && delay.years > 0 && <p>You put aside <strong>{familiarMoney(point.savingsContributions)}</strong> from income. {extraCost >= 0 ? <>Buying this home costs <strong>{familiarMoney(extraCost)} more</strong>, including upfront charges.</> : <>The complete purchase cost falls by <strong>{familiarMoney(-extraCost)}</strong>.</>} {point.investmentGrowth >= .5 ? <>Investment returns add {familiarMoney(point.investmentGrowth)} to your cash. </> : point.investmentGrowth <= -.5 ? <>Investment losses reduce your cash by {familiarMoney(-point.investmentGrowth)}. </> : null} {progress >= 0 ? <>After both changes, you have <strong>{familiarMoney(progress)} more</strong> towards the purchase.</> : <>After both changes, you are <strong>{familiarMoney(-progress)} further</strong> from covering the purchase.</>}</p>}
        <dl className="india-metrics"><div className="india-metric"><dt>Home-loan payment per month (EMI)</dt><dd>{money(capacity.requiredEmi)}</dd><small>Your available loan-payment budget: {money(capacity.emiBudget)}/month</small></div><div className="india-metric"><dt>Maximum home price within this budget</dt><dd>{familiarMoney(capacity.maxAffordablePrice)}</dd><small>Price before upfront purchase charges</small></div></dl>
        {capacity.cashGap > .5 && <p>You need <strong>{familiarMoney(capacity.cashGap)}</strong> more cash to meet the limit on how much you can borrow.</p>}{capacity.emiGap > .5 && <p>The monthly loan payment exceeds your budget by <strong>{money(capacity.emiGap)}</strong>.</p>}
        {capacity.tier !== 3 && !capacity.effectiveDemand && <p className="india-note">Your finances fit, but your buying factors are not all met. {!household.creditAccess && capacity.requiredLoan > 0 && 'You need access to credit for this loan. '}{!household.need && 'Housing need is switched off. '}{!household.desire && 'Desire to own is switched off. '}{!household.willingness && 'Willingness to buy is switched off. '}Review “Ready to buy?” in Advanced settings.</p>}
        <p className="india-note">This checks purchasing capacity under your assumptions. Capacity alone does not mean a household wants or is ready to buy. Savings already account for rent; this is not a comparison of total wealth from buying versus renting.</p>
      </section>}
    <div className="beginner-layout"><form className="beginner-questions" onSubmit={e => { e.preventDefault(); if (!stageErrors.length && step < 2) go(step + 1) }}>
      <p className="eyebrow">STEP {step + 1} OF 3</p><h2 tabIndex={-1} ref={heading}>{step === 0 ? 'Which home are you considering?' : step === 1 ? 'What can your household put towards it?' : goal === 'wait' ? 'How long might you wait?' : 'Review your answers'}</h2>
      {step === 0 && <div className="beginner-fields">
        {field('Home price in crore', 'price', product.price / 1e7, v => setProduct({ ...product, price: v * 1e7 }), '₹ Cr', '1.5 Cr = ₹1,50,00,000. Enter the property price before purchase charges.')}
        {field('Rent for a similar home per month', 'monthlyRent', product.monthlyRent, v => setProduct({ ...product, monthlyRent: v }), '₹', 'Used to show rental yield. Your savings below should already account for rent.')}
      </div>}
      {step === 1 && <div className="beginner-fields">
        {field('Monthly take-home income in lakh', 'annualIncome', household.annualIncome / 12 / 1e5, v => { const income = v * 1e5; const savings = income === 0 ? 0 : monthlySavings; setSavingsDraft(savings); setHousehold({ ...household, annualIncome: income * 12, savingsRate: income > 0 ? savings / income : savings === 0 ? 0 : NaN }) }, '₹ lakh', 'Combined household income after tax. Enter 2.5 for ₹2.5 lakh per month (₹30 lakh per year).')}
        {cashField('liquidFunds', 'Savings available in lakh', 'Cash or investments you can use for the purchase; exclude assets you cannot access.')}
        {cashField('reserve', 'Money to keep untouched in lakh', 'Emergency cash you want to protect. This comes out of your available savings.')}
        {field('Existing monthly loan payments', 'existingEmi', household.existingEmi, v => setHousehold({ ...household, existingEmi: v }), '₹', 'Include payments on car, personal, and other loans. Enter 0 if you have none.')}
        <NumberField label="Monthly savings after rent and bills" path="savingsRate" value={monthlySavings} errors={savingsErrors} onChange={v => { setSavingsDraft(v); setHousehold({ ...household, savingsRate: household.annualIncome > 0 ? v * 12 / household.annualIncome : v === 0 ? 0 : NaN }) }} hint="Only money you actually put aside from income, after rent and living costs. We do not add avoided home-loan payments again." />
      </div>}
      {step === 2 && goal === 'wait' && <div className="beginner-fields">
        {field('Years you might wait', 'delay.years', delay.years, v => setDelay({ ...delay, years: v }), 'years', '0 means buying today. Enter up to 30 years, in whole-month increments (for example, 2.5).')}
        {field('Expected house-price growth per year', 'appreciation', product.appreciation, v => setProduct({ ...product, appreciation: v }), '%', 'An editable scenario, not a prediction. Try a different rate to see how the pressure changes.', true)}
      </div>}
      {step === 2 && <p className="india-note">Home: {familiarMoney(product.price)} · Take-home income: {familiarMoney(household.annualIncome / 12)}/month · Savings: {money(household.annualIncome * household.savingsRate / 12)}/month. Use Back to edit your answers.</p>}
      {stageErrors.length > 0 && step < 2 && <p className="india-field-error beginner-blocked">Correct the highlighted fields to continue.</p>}
      <div className="beginner-actions">{step > 0 && <button type="button" className="india-secondary-button" onClick={() => go(step - 1)}>Back</button>}{step < 2 && <button type="submit" className="beginner-primary" disabled={stageErrors.length > 0}>{step === 1 && goal === 'afford' ? 'See my result' : 'Continue'}</button>}{step === 2 && goal === 'wait' && <button type="button" className="beginner-primary" disabled={!capacity} onClick={() => go(2)}>View updated result</button>}</div>
    </form><aside className="beginner-assumptions" aria-label="Model assumptions"><h3>Assumptions used</h3><p>{number(product.loanRate * 100)}% loan interest · {number(product.termYears)} years<br />Up to {number(product.maxLtv * 100)}% of the home price borrowed<br />All loan payments up to {number(product.maxEmiShare * 100)}% of take-home income<br />{number(product.purchaseCostRate * 100)}% upfront purchase charges</p><p>Income growth: {number(delay.incomeGrowth * 100)}% · Savings return: {number(delay.savingsReturn * 100)}% per year.</p><details><summary>Advanced settings</summary>{advanced}</details><p className="india-note">These examples are illustrative. Your lender’s actual terms may differ.</p></aside></div>
    {errors.length > 0 && (step === 2 || errors.some(e => !stagePaths.includes(e.path))) && <div className="validation" role="alert"><strong>Check your answers</strong><ul>{errors.map((e, i) => <li key={i}>{e.path === 'savingsRate' ? savingsErrors.find(s => s.path === 'savingsRate')?.message : e.message}</li>)}</ul><p>Results are withheld. Use Back for home and finance answers, or open Advanced settings for other assumptions.</p></div>}
    {step === 2 && capacity && point && now && <div className="beginner-results">
      {goal === 'wait' && delay.years > 0 && <><PurchaseDelayBars current={now} point={point} interactive={false} /><details className="beginner-disclosure"><summary>How this was calculated</summary><PurchaseDelayCalculations current={now} point={point} product={product} household={household} delay={delay} /></details></>}
      <details className="beginner-disclosure"><summary>Explore further: timeline, buyer tiers & full results</summary><div className="india-results">{further}</div></details>
    </div>}
    </div>
  </section>
}
