import { formatHeight, formatNumber, formatWeight } from '../units.js'
import { ACTIVITY_LEVELS } from '../activity.js'

const LIMIT_TEXT = 'As low as possible while eating a nutritionally adequate diet'

function NutrientTable({ title, nutrients }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="dri-table">
          <thead>
            <tr>
              <th>Nutrient</th>
              <th>Per day</th>
              <th>Upper limit</th>
            </tr>
          </thead>
          <tbody>
            {nutrients.map((n) => (
              <tr key={n.key}>
                <td>
                  {n.name}
                  {n.note && <div className="muted note">{n.note}</div>}
                </td>
                <td className="num">{n.amount == null ? '—' : `${formatNumber(n.amount)} ${n.unit}`}</td>
                <td className="num">
                  {n.upperLimit == null ? (
                    <span className="muted" title="Not determinable">
                      Not set
                    </span>
                  ) : (
                    `${formatNumber(n.upperLimit)} ${n.unit}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function NeedsReport({ profile, recommendations: r, onEdit }) {
  const activity = ACTIVITY_LEVELS.find((a) => a.value === profile.activity)?.label
  const { macros } = r
  const cups = Math.round(macros.waterLiters * 4.227)

  const macroRows = [
    ['Carbohydrate', `${macros.carbs.min}–${macros.carbs.max} g`, '45–65% of calories'],
    ['Fiber', `${macros.fiber} g`, '14 g per 1,000 kcal'],
    ['Protein', `${macros.protein} g`, 'Minimum: 0.8 g per kg of body weight'],
    ['Fat', `${macros.fat.min}–${macros.fat.max} g`, '20–35% of calories'],
    ['Saturated fat', LIMIT_TEXT],
    ['Trans fat', LIMIT_TEXT],
    ['Dietary cholesterol', LIMIT_TEXT],
    ['α-Linolenic acid (omega-3)', `${macros.alphaLinolenicAcid} g`],
    ['Linoleic acid (omega-6)', `${macros.linoleicAcid} g`],
  ]

  return (
    <div className="needs">
      <section className="card needs-head">
        <div>
          <h2>Your daily needs</h2>
          <p className="muted small">
            {profile.sex === 'female' ? 'Female' : 'Male'} · {profile.age} years · {formatHeight(profile.heightCm, profile.units)} ·{' '}
            {formatWeight(profile.weightKg, profile.units)} · {activity}
          </p>
        </div>
        <button className="ghost small" onClick={onEdit}>
          Edit profile
        </button>
      </section>

      <div className="stats">
        <div className="card stat">
          <span className="muted small">Estimated calories</span>
          <span className="big">{r.calories.toLocaleString()}</span>
          <span className="muted small">kcal per day</span>
        </div>
        <div className="card stat">
          <span className="muted small">Body mass index</span>
          <span className="big">{r.bmi.value.toFixed(1)}</span>
          <span className="muted small">{r.bmi.category}</span>
        </div>
        <div className="card stat">
          <span className="muted small">Water</span>
          <span className="big">{macros.waterLiters} L</span>
          <span className="muted small">about {cups} cups, from food and drinks</span>
        </div>
      </div>

      <section className="card">
        <h2>Macronutrients</h2>
        <div className="table-wrap">
          <table className="dri-table">
            <tbody>
              {macroRows.map(([name, value, note]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className={value === LIMIT_TEXT ? 'muted' : 'num'}>
                    {value}
                    {note && <div className="muted note">{note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid">
        <NutrientTable title="Vitamins" nutrients={r.vitamins} />
        <NutrientTable title="Minerals" nutrients={r.minerals} />
      </div>

      <p className="muted small footnote">
        Based on the National Academies Dietary Reference Intakes (2023 energy equations), the same source as the USDA
        DRI Calculator. “Per day” is the RDA, or the Adequate Intake where no RDA exists. The upper limit is the most
        you can take daily without likely risk of harm. These are population guidelines, not medical advice.
      </p>
    </div>
  )
}
