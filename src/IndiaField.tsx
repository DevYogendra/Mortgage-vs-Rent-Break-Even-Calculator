import { useId } from 'react'
import type { FieldError } from './india'

export default function NumberField({ label, value, onChange, rate = false, unit = '₹', errors = [], path, hint, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; rate?: boolean;
  unit?: string; errors?: FieldError[]; path: string; hint?: string; disabled?: boolean;
}) {
  const id = useId(), error = errors.find(e => e.path === path)
  const displayed = value * (rate ? 100 : 1)
  return <label className="field" htmlFor={id}><span>{label}</span><span className="input-wrap">
    {!rate && unit === '₹' && <span className="input-prefix">₹</span>}
    <input id={id} aria-label={label} type="number" step="any" disabled={disabled} value={Number.isFinite(displayed) ? Number(displayed.toFixed(8)) : ''}
      onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value) / (rate ? 100 : 1))}
      aria-invalid={!!error} aria-describedby={error || hint ? `${id}-note` : undefined} />
    {(rate || unit !== '₹') && <span className="input-suffix">{rate ? '%' : unit}</span>}
  </span>{(error || hint) && <small id={`${id}-note`} className={error ? 'india-field-error' : undefined}>{error?.message || hint}</small>}</label>
}
