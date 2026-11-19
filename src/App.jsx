import { useEffect, useState } from 'react'
import { api, clearToken, getToken, onUnauthorized } from './api.js'
import AuthForm from './components/AuthForm.jsx'
import Tracker from './components/Tracker.jsx'
import './App.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(() => Boolean(getToken()))

  useEffect(() => onUnauthorized(() => setUser(null)), [])

  useEffect(() => {
    if (!getToken()) return
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <p className="loading">Loading…</p>
  if (!user) return <AuthForm onAuthenticated={setUser} />

  return (
    <Tracker
      user={user}
      onSignOut={() => {
        clearToken()
        setUser(null)
      }}
    />
  )
}
