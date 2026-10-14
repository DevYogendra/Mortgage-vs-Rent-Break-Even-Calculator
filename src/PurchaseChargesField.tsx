import { useId } from 'react'
import { purchaseCharges } from './india'
import type { FieldError, IndiaProduct } from './india'

export default function PurchaseChargesField({ product, onChange, errors }: {
  product: IndiaProduct; onChange: (p: IndiaProduct) => void; errors: FieldError[];
}) {
  const id = useId()
  const isAmount = product.purchaseCostAmount !== undefined
  const value = isAmount ? product.purchaseCostAmount! : product.purchaseCostRate * 100
  const error = errors.find(e => e.path === (isAmount ? 'purchaseCostAmount' : 'purchaseCostRate'))
  return <div className="field purchase-charges-field"><label htmlFor={id}>Upfront purchase charges</label>
    <span className="input-wrap"><input id={id} type="number" step="any" aria-label="Upfront purchase charges" value={Number.isFinite(value) ? Number(value.toFixed(8)) : ''}
      aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      onChange={e => { const v = e.target.value === '' ? NaN : Number(e.target.value); onChange(isAmount ? { ...product, purchaseCostAmount: v } : { ...product, purchaseCostRate: v / 100 }) }} />
      <select aria-label="Upfront purchase charges unit" value={isAmount ? 'rupees' : 'percent'} disabled={!Number.isFinite(product.price) || product.price <= 0 || !Number.isFinite(value) || value < 0}
        onChange={e => { const total = purchaseCharges(product); onChange(e.target.value === 'rupees' ? { ...product, purchaseCostAmount: total } : { ...product, purchaseCostAmount: undefined, purchaseCostRate: total / product.price }) }}>
        <option value="percent">% price</option><option value="rupees">₹</option>
      </select>
    </span>{error && <small id={`${id}-error`} className="india-field-error">{error.message}</small>}
  </div>
}
