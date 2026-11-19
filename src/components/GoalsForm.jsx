import { useState } from 'react'
import { api } from '../api.js'

const FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', step: '1' },
  { key: 'protein', label: 'Protein', unit: 'g', step: '0.1' },
  { key: 'carbs', label: 'Carbs', unit: 'g', step: '0.1' },
  { key: 'fat', label: 'Fat', unit: 'g', step: '0.1' },
]

export default function GoalsForm({ goals, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(({ key }) => [key, String(goals[key])])))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.updateGoals(Object.fromEntries(FIELDS.map(({ key }) => [key, Number(form[key])])))
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="goals-form" onSubmit={handleSubmit}>
      <div className="row numbers">
        {FIELDS.map(({ key, label, unit, step }) => (
          <label key={key}>
            {label}
            <span className="with-unit">
              <input
                type="number"
                min="0"
                step={step}
                required
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              <span className="unit">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save goals'}
      </button>
    </form>
  )
}
