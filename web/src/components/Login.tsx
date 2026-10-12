import { useState } from 'react'
import { api, refetchAll } from '../lib/api'
import { useUI } from '../lib/store'

export function Login() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 16 }}>
      <form
        style={{ width: 'min(340px, 100%)', border: '1px solid var(--ink)', background: 'var(--surface)', padding: 20, display: 'grid', gap: 12 }}
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
        <div>
          <div className="mono muted">Workbench</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>Sign in</h1>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="mono muted">Password</span>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
        <button className="btn primary" style={{ justifyContent: 'center' }}>Open sheet</button>
      </form>
    </div>
  )
}
