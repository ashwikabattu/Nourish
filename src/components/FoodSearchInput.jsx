import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api.js'

const MIN_CHARS = 2
const DEBOUNCE_MS = 350

/**
 * Text input for the food name that suggests matches from the USDA food database.
 * Typing a name that isn't in the list still works; the user just enters nutrition by hand.
 */
export default function FoodSearchInput({ value, onChange, onSelect, searchEnabled }) {
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const latest = useRef(0)
  const listId = useId()

  const query = value.trim()
  const shouldSearch = searchEnabled && query.length >= MIN_CHARS

  useEffect(() => {
    if (!shouldSearch) return
    const requestId = ++latest.current
    const timer = setTimeout(() => {
      setStatus('loading')
      api
        .searchFoods(query)
        .then((foods) => {
          if (requestId !== latest.current) return // a newer search has started
          setResults(foods)
          setActive(-1)
          setStatus('done')
        })
        .catch((err) => {
          if (requestId !== latest.current) return
          setResults([])
          setMessage(err.message)
          setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, shouldSearch])

  function handleChange(e) {
    onChange(e.target.value)
    setOpen(true)
    if (e.target.value.trim().length < MIN_CHARS) {
      latest.current++
      setResults([])
      setStatus('idle')
    }
  }

  function choose(food) {
    latest.current++
    setOpen(false)
    setResults([])
    setStatus('idle')
    onSelect(food)
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && shouldSearch && status !== 'idle'

  return (
    <div className="food-search">
      <input
        required
        maxLength={100}
        placeholder="Search foods, e.g. banana"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {showList && (
        <ul className="food-results" id={listId} role="listbox">
          {status === 'loading' && results.length === 0 && <li className="food-status">Searching…</li>}
          {status === 'error' && <li className="food-status error">{message}</li>}
          {status === 'done' && results.length === 0 && (
            <li className="food-status">No matches. You can still enter the nutrition yourself.</li>
          )}
          {results.map((food, i) => (
            <li
              key={food.fdcId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault()
                choose(food)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="food-result-name">{food.name}</span>
              <span className="muted small">
                {food.brand ?? 'Generic'} · {food.per100.calories} kcal per 100 {food.baseUnit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
