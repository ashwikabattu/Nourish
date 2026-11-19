import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { addDays, formatLong, todayISO } from '../dates.js'
import DailySummary from './DailySummary.jsx'
import EntryForm from './EntryForm.jsx'
import EntryList from './EntryList.jsx'
import GoalsForm from './GoalsForm.jsx'
import NeedsReport from './NeedsReport.jsx'
import ProfileForm from './ProfileForm.jsx'
import WeekChart from './WeekChart.jsx'

export default function Tracker({ user, onSignOut }) {
  const [view, setView] = useState('log') // 'log' | 'needs'
  const [date, setDate] = useState(todayISO)
  const [data, setData] = useState(null) // { entries, goals, week } for `date`
  const [personal, setPersonal] = useState(null) // { profile, recommendations } or { profile: null }
  const [editingProfile, setEditingProfile] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0) // bump to refetch after a change
  const [editingGoals, setEditingGoals] = useState(false)

  const refresh = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.listEntries(date), api.summary(addDays(date, -6), date)])
      .then(([entries, summary]) => {
        if (cancelled) return
        setData({ entries, goals: summary.goals, week: summary.days })
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [date, version])

  useEffect(() => {
    api
      .getProfile()
      .then(setPersonal)
      .catch((err) => setError(err.message))
  }, [])

  async function handleDelete(id) {
    try {
      await api.deleteEntry(id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleProfileSaved({ profile, recommendations }) {
    setPersonal({ profile, recommendations })
    setEditingProfile(false)
    refresh() // goals may have changed
  }

  const isToday = date === todayISO()
  const hasProfile = Boolean(personal?.profile)

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Nourish</span>
        <div className="topbar-right">
          <span className="muted small">{user.email}</span>
          <button className="ghost small" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        <button className={view === 'log' ? 'on' : ''} aria-current={view === 'log'} onClick={() => setView('log')}>
          Food log
        </button>
        <button className={view === 'needs' ? 'on' : ''} aria-current={view === 'needs'} onClick={() => setView('needs')}>
          My needs
        </button>
      </nav>

      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}

      {view === 'needs' ? (
        !personal ? (
          <p className="loading">Loading…</p>
        ) : !hasProfile || editingProfile ? (
          <section className="card narrow">
            <h2>{hasProfile ? 'Edit your profile' : 'Personalize your goals'}</h2>
            <p className="muted small intro">
              Get daily calorie, macronutrient, vitamin, and mineral recommendations for your body, based on the
              Dietary Reference Intakes.
            </p>
            <ProfileForm
              profile={personal.profile}
              onSaved={handleProfileSaved}
              onCancel={hasProfile ? () => setEditingProfile(false) : null}
            />
          </section>
        ) : (
          <NeedsReport
            profile={personal.profile}
            recommendations={personal.recommendations}
            onEdit={() => setEditingProfile(true)}
          />
        )
      ) : (
        <>
          <nav className="date-nav" aria-label="Choose day">
            <button className="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
              ‹
            </button>
            <div className="date-label">
              <strong>{isToday ? 'Today' : formatLong(date)}</strong>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-label="Date"
              />
            </div>
            <button className="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
              ›
            </button>
            {!isToday && (
              <button className="ghost small" onClick={() => setDate(todayISO())}>
                Today
              </button>
            )}
          </nav>

          {personal && !hasProfile && (
            <section className="card setup-prompt">
              <div>
                <strong>Personalize your goals</strong>
                <p className="muted small">
                  Answer a few questions to get calorie and nutrient targets for your age, size, and activity level.
                </p>
              </div>
              <button className="primary" onClick={() => setView('needs')}>
                Get started
              </button>
            </section>
          )}

          {!data ? (
            <p className="loading">Loading…</p>
          ) : (
            <main className="grid">
              <section className="card">
                <div className="card-head">
                  <h2>Daily totals</h2>
                  <button className="ghost small" onClick={() => setEditingGoals((v) => !v)}>
                    {editingGoals ? 'Close' : 'Edit goals'}
                  </button>
                </div>
                {editingGoals ? (
                  <GoalsForm
                    goals={data.goals}
                    onSaved={() => {
                      setEditingGoals(false)
                      refresh()
                    }}
                  />
                ) : (
                  <DailySummary
                    entries={data.entries}
                    goals={data.goals}
                    recommended={personal?.recommendations?.macros}
                  />
                )}
              </section>

              <section className="card">
                <h2>Last 7 days</h2>
                <WeekChart days={data.week} goal={data.goals.calories} selected={date} onSelect={setDate} />
              </section>

              <section className="card">
                <h2>Add food</h2>
                <EntryForm date={date} onAdded={refresh} />
              </section>

              <section className="card">
                <h2>Food log</h2>
                <EntryList entries={data.entries} onDelete={handleDelete} />
              </section>
            </main>
          )}
        </>
      )}
    </div>
  )
}
