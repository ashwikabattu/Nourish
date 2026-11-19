const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
]

export default function EntryList({ entries, onDelete }) {
  if (entries.length === 0) {
    return <p className="muted empty">Nothing logged for this day yet.</p>
  }

  return (
    <div className="log">
      {MEALS.map(({ key, label }) => {
        const items = entries.filter((e) => e.meal === key)
        if (items.length === 0) return null
        const subtotal = items.reduce((sum, e) => sum + e.calories, 0)
        return (
          <div key={key} className="meal">
            <div className="meal-head">
              <h3>{label}</h3>
              <span className="muted small">{subtotal.toLocaleString()} kcal</span>
            </div>
            <ul>
              {items.map((e) => (
                <li key={e.id}>
                  <div>
                    <div className="food-name">{e.name}</div>
                    <div className="muted small">
                      P {e.protein} g · C {e.carbs} g · F {e.fat} g
                    </div>
                  </div>
                  <div className="food-right">
                    <span>{e.calories.toLocaleString()} kcal</span>
                    <button className="icon" onClick={() => onDelete(e.id)} aria-label={`Delete ${e.name}`}>
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
