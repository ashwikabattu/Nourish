const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
]

function round(n) {
  return Math.round(n * 10) / 10
}

function Bar({ value, goal, className = '' }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
  const over = value > goal
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={round(value)}>
      <div className={`bar-fill ${className} ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function recommendedText(key, recommended) {
  if (!recommended) return null
  const r = recommended[key]
  if (key === 'protein') return `Recommended: at least ${r} g`
  return `Recommended: ${r.min}–${r.max} g`
}

export default function DailySummary({ entries, goals, recommended }) {
  const totals = entries.reduce(
    (t, e) => ({
      calories: t.calories + e.calories,
      protein: t.protein + e.protein,
      carbs: t.carbs + e.carbs,
      fat: t.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const remaining = goals.calories - totals.calories

  return (
    <div className="summary">
      <div className="calories">
        <div>
          <span className="big">{totals.calories.toLocaleString()}</span>
          <span className="muted"> / {goals.calories.toLocaleString()} kcal</span>
        </div>
        <span className={remaining < 0 ? 'over-text' : 'muted'}>
          {remaining >= 0 ? `${remaining.toLocaleString()} left` : `${(-remaining).toLocaleString()} over`}
        </span>
      </div>
      <Bar value={totals.calories} goal={goals.calories} className="cal" />

      <div className="macros">
        {MACROS.map(({ key, label }) => (
          <div key={key} className="macro">
            <div className="macro-head">
              <span>{label}</span>
              <span className="muted small">
                {round(totals[key])} / {round(goals[key])} g
              </span>
            </div>
            <Bar value={totals[key]} goal={goals[key]} className={key} />
            {recommended && <div className="muted note">{recommendedText(key, recommended)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
