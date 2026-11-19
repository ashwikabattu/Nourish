import { useState } from 'react'
import { api } from '../api.js'
import { ACTIVITY_LEVELS } from '../activity.js'
import { CM_PER_INCH, KG_PER_LB, bmiOf, cmToFeetInches, kgToLb } from '../units.js'

function toFields(profile) {
  const units = profile?.units ?? 'imperial'
  if (!profile) return { sex: '', age: '', units, feet: '', inches: '', cm: '', lb: '', kg: '', activity: '' }
  const { feet, inches } = cmToFeetInches(profile.heightCm)
  return {
    sex: profile.sex,
    age: String(profile.age),
    units,
    feet: String(feet),
    inches: String(inches),
    cm: String(Math.round(profile.heightCm * 10) / 10),
    lb: String(kgToLb(profile.weightKg)),
    kg: String(Math.round(profile.weightKg * 10) / 10),
    activity: profile.activity,
  }
}

const num = (v) => (v === '' ? null : Number(v))

function heightCm(f) {
  if (f.units === 'metric') return num(f.cm)
  if (f.feet === '' || f.inches === '') return null // a blank inches box must not silently mean 0
  return (Number(f.feet || 0) * 12 + Number(f.inches || 0)) * CM_PER_INCH
}

function weightKg(f) {
  if (f.units === 'metric') return num(f.kg)
  return f.lb === '' ? null : Number(f.lb) * KG_PER_LB
}

export default function ProfileForm({ profile, onSaved, onCancel }) {
  const [f, setF] = useState(() => toFields(profile))
  const [applyToGoals, setApplyToGoals] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }))

  function switchUnits(units) {
    if (units === f.units) return
    const cm = heightCm(f)
    const kg = weightKg(f)
    const converted = toFields({
      ...profile,
      units,
      heightCm: cm ?? 0,
      weightKg: kg ?? 0,
    })
    // Keep what the user typed in the other units if it still describes the same height/weight,
    // so flipping back and forth doesn't drift (89 lb -> 40.4 kg -> 89.1 lb).
    const target = { ...f, units }
    const toInches = (n) => Math.round((n ?? 0) / CM_PER_INCH)
    const toTenths = (n) => Math.round((n ?? 0) * 10)
    const keepHeight = cm && toInches(heightCm(target)) === toInches(cm)
    const keepWeight = kg && toTenths(weightKg(target)) === toTenths(kg)
    setF((prev) => ({
      ...prev,
      units,
      ...(cm && !keepHeight ? { feet: converted.feet, inches: converted.inches, cm: converted.cm } : {}),
      ...(kg && !keepWeight ? { lb: converted.lb, kg: converted.kg } : {}),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (f.units === 'imperial' && Number(f.inches) >= 12) {
      setError('Inches must be between 0 and 11')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.saveProfile({
        sex: f.sex || null,
        age: num(f.age),
        heightCm: heightCm(f),
        weightKg: weightKg(f),
        activity: f.activity || null,
        units: f.units,
        applyToGoals,
      })
      onSaved(result)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const imperial = f.units === 'imperial'
  const liveBmi = bmiOf(heightCm(f), weightKg(f))

  return (
    <form className="profile-form" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend>Sex</legend>
        <div className="segmented">
          {['female', 'male'].map((s) => (
            <label key={s} className={f.sex === s ? 'on' : ''}>
              <input type="radio" name="sex" value={s} checked={f.sex === s} onChange={set('sex')} required />
              {s === 'female' ? 'Female' : 'Male'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="row">
        <label>
          Age
          <span className="with-unit">
            <input type="number" inputMode="numeric" min="19" max="100" step="1" required value={f.age} onChange={set('age')} />
            <span className="unit">years</span>
          </span>
        </label>
        <fieldset>
          <legend>Units</legend>
          <div className="segmented">
            {[
              ['imperial', 'ft / lb'],
              ['metric', 'cm / kg'],
            ].map(([u, label]) => (
              <label key={u} className={f.units === u ? 'on' : ''}>
                <input type="radio" name="units" value={u} checked={f.units === u} onChange={() => switchUnits(u)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="row">
        {imperial ? (
          <>
            <label>
              Height
              <span className="with-unit">
                <input type="number" inputMode="numeric" min="2" max="8" step="1" required value={f.feet} onChange={set('feet')} />
                <span className="unit">ft</span>
              </span>
            </label>
            <label>
              <span className="sr-only">Height, inches</span>&nbsp;
              <span className="with-unit">
                <input type="number" inputMode="numeric" min="0" max="11" step="1" value={f.inches} onChange={set('inches')} />
                <span className="unit">in</span>
              </span>
            </label>
            <label>
              Weight
              <span className="with-unit">
                <input type="number" inputMode="decimal" min="55" max="660" step="any" required value={f.lb} onChange={set('lb')} />
                <span className="unit">lb</span>
              </span>
            </label>
          </>
        ) : (
          <>
            <label>
              Height
              <span className="with-unit">
                <input type="number" inputMode="decimal" min="90" max="250" step="any" required value={f.cm} onChange={set('cm')} />
                <span className="unit">cm</span>
              </span>
            </label>
            <label>
              Weight
              <span className="with-unit">
                <input type="number" inputMode="decimal" min="25" max="300" step="any" required value={f.kg} onChange={set('kg')} />
                <span className="unit">kg</span>
              </span>
            </label>
          </>
        )}
      </div>

      <p className="bmi-preview" aria-live="polite">
        {liveBmi ? (
          <>
            <span className="muted small">Your BMI</span>
            <strong>{liveBmi.value.toFixed(1)}</strong>
            <span className="muted small">{liveBmi.category}</span>
          </>
        ) : (
          <span className="muted small">Enter a height and weight in range to see your BMI.</span>
        )}
      </p>

      <fieldset>
        <legend>Activity level</legend>
        <div className="activity-options">
          {ACTIVITY_LEVELS.map((a) => (
            <label key={a.value} className={`activity-option ${f.activity === a.value ? 'on' : ''}`}>
              <input
                type="radio"
                name="activity"
                value={a.value}
                checked={f.activity === a.value}
                onChange={set('activity')}
                required
              />
              <span>
                <strong>{a.label}</strong>
                <span className="muted small">{a.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="checkbox">
        <input type="checkbox" checked={applyToGoals} onChange={(e) => setApplyToGoals(e.target.checked)} />
        Set my daily calorie and macro goals from these results
      </label>

      <p className="hint">
        For adults 19 and older. Pregnancy and breastfeeding change these needs; if that applies to you, ask a
        healthcare provider instead.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : profile ? 'Save and update my needs' : 'Calculate my needs'}
        </button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
