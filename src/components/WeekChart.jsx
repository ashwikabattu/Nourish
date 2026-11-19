import { weekdayShort } from '../dates.js'

export default function WeekChart({ days, goal, selected, onSelect }) {
  const max = Math.max(goal, ...days.map((d) => d.calories)) * 1.1
  const goalPct = (goal / max) * 100

  return (
    <div className="week">
      <div className="week-plot">
        <div className="goal-line" style={{ bottom: `${goalPct}%` }}>
          <span>{goal.toLocaleString()} goal</span>
        </div>
        {days.map((d) => (
          <button
            key={d.date}
            className={`week-col ${d.date === selected ? 'selected' : ''}`}
            onClick={() => onSelect(d.date)}
            aria-label={`${weekdayShort(d.date)} ${d.date}: ${d.calories} kcal`}
            title={`${d.calories.toLocaleString()} kcal`}
          >
            <span
              className={`week-bar ${d.calories > goal ? 'over' : ''}`}
              style={{ height: `${(d.calories / max) * 100}%` }}
            />
          </button>
        ))}
      </div>
      <div className="week-labels">
        {days.map((d) => (
          <span key={d.date} className={d.date === selected ? 'selected' : ''}>
            {weekdayShort(d.date)}
          </span>
        ))}
      </div>
    </div>
  )
}
