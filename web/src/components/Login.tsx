import { useState } from 'react'
import { api, refetchAll } from '../lib/api'
import { useUI } from '../lib/store'
import { LogoMark, Wordmark } from './Brand'

export function Login() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 16 }}>
      <form
        style={{
          width: 'min(380px, 100%)', border: '1px solid var(--line)', borderRadius: 'var(--r-3)',
          background: 'var(--surface)', padding: 28, display: 'grid', gap: 18, boxShadow: 'var(--shadow)',
        }}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await api.post('/auth/login', { password: pw })
            useUI.getState().set({ authNeeded: false })
            refetchAll()
          } catch {
            setErr('Wrong password.')
          }
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={34} />
          <Wordmark />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>Sign in</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every step moves work forward.</p>
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="mono muted">Password</span>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
        <button className="btn primary" style={{ height: 42 }}>Sign in</button>
      </form>
    </div>
  )
}
