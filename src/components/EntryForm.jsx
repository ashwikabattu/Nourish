import { useState } from 'react'
import { api } from '../api.js'
import FoodSearchInput from './FoodSearchInput.jsx'

const EMPTY = { name: '', meal: 'breakfast', calories: '', protein: '', carbs: '', fat: '' }

function NumberField({ label, unit, value, onChange, required, integer }) {
  return (
    <label>
      {label}
      <span className="with-unit">
        <input
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          min="0"
          step={integer ? '1' : '0.1'}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  )
}

/** Portion choices for a food: its listed portions, plus plain grams (or ml). */
function portionOptions(food) {
  return [...food.portions, { label: food.baseUnit, amount: 1 }]
}

function scaledNutrition(food, quantity, portion) {
  const amount = (Number(quantity) || 0) * portion.amount
  const scale = (n, digits) => {
    const f = 10 ** digits
    return String(Math.round(((n * amount) / 100) * f) / f)
  }
  return {
    calories: scale(food.per100.calories, 0),
    protein: scale(food.per100.protein, 1),
    carbs: scale(food.per100.carbs, 1),
    fat: scale(food.per100.fat, 1),
  }
}

export default function EntryForm({ date, onAdded }) {
  const [form, setForm] = useState(EMPTY)
  const [food, setFood] = useState(null) // selected USDA food, if any
  const [quantity, setQuantity] = useState('1')
  const [portionIndex, setPortionIndex] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const num = (v) => (v === '' ? 0 : Number(v))

  function selectFood(selected) {
    const options = portionOptions(selected)
    // Default to the food's first listed portion; otherwise 100 g.
    const index = selected.portions.length > 0 ? 0 : options.length - 1
    const qty = selected.portions.length > 0 ? '1' : '100'
    const name = selected.brand ? `${selected.name} (${selected.brand})` : selected.name
    setFood(selected)
    setPortionIndex(index)
    setQuantity(qty)
    setForm((f) => ({ ...f, name: name.slice(0, 100), ...scaledNutrition(selected, qty, options[index]) }))
  }

  function changeServing(nextQuantity, nextIndex) {
    setQuantity(nextQuantity)
    setPortionIndex(nextIndex)
    setForm((f) => ({ ...f, ...scaledNutrition(food, nextQuantity, portionOptions(food)[nextIndex]) }))
  }

  function clearFood() {
    setFood(null)
    setForm((f) => ({ ...EMPTY, meal: f.meal }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createEntry({
        name: form.name,
        meal: form.meal,
        calories: Math.round(num(form.calories)),
        protein: num(form.protein),
        carbs: num(form.carbs),
        fat: num(form.fat),
        date,
      })
      setFood(null)
      setForm((f) => ({ ...EMPTY, meal: f.meal }))
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="row">
        <label className="grow">
          Food
          <FoodSearchInput value={form.name} onChange={set('name')} onSelect={selectFood} searchEnabled={!food} />
        </label>
        <label>
          Meal
          <select value={form.meal} onChange={(e) => set('meal')(e.target.value)}>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </label>
      </div>

      {food && (
        <div className="serving">
          <div className="row">
            <label>
              Amount
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                required
                value={quantity}
                onChange={(e) => changeServing(e.target.value, portionIndex)}
              />
            </label>
            <label className="grow">
              Serving size
              <select value={portionIndex} onChange={(e) => changeServing(quantity, Number(e.target.value))}>
                {portionOptions(food).map((p, i) => (
                  <option key={i} value={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">
            Filled in from USDA FoodData Central. Edit any number below if your label differs.{' '}
            <button type="button" className="link inline" onClick={clearFood}>
              Clear
            </button>
          </p>
        </div>
      )}

      <div className="row numbers">
        <NumberField label="Calories" unit="kcal" required integer value={form.calories} onChange={set('calories')} />
        <NumberField label="Protein" unit="g" value={form.protein} onChange={set('protein')} />
        <NumberField label="Carbs" unit="g" value={form.carbs} onChange={set('carbs')} />
        <NumberField label="Fat" unit="g" value={form.fat} onChange={set('fat')} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add to log'}
      </button>
    </form>
  )
}
