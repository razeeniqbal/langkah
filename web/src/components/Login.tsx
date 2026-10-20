import { useEffect, useState } from 'react'
import { api, loadSession, refetchAll, ssoRedirect, type AuthStatus } from '../lib/api'
import { useUI } from '../lib/store'
import { LogoMark } from './Brand'

export function Login() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [st, setSt] = useState<AuthStatus | null>(null)
  const viewOnly = useUI((x) => x.viewOnlyAvailable)
  const reason = useUI((x) => x.signedOutReason)
  useEffect(() => { loadSession().then(setSt).catch(() => {}) }, [])
  const enter = async (path: string, body?: unknown) => {
    await api.post(path, body)
    await loadSession()
    useUI.getState().set({ authNeeded: false, signedOutReason: null })
    refetchAll()
  }
  const sso = st?.sso
  const password = st?.password ?? true
  const divider = (
    <div className="mono muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: '24px 16px' }}>
      <form
        style={{ width: 'min(380px, 100%)', display: 'grid', gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await enter('/auth/login', { password: pw })
          } catch {
            setErr('Wrong password.')
          }
        }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)', color: '#fff', ['--brand' as string]: '#fff',
          }}>
            <LogoMark size={34} />
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Langkah</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Every step moves work forward.</p>
        </div>
        {reason && <p className="muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>{reason}</p>}
        {sso && (
          <button type="button" className="btn primary" style={{ height: 44 }} onClick={() => ssoRedirect(sso.login)}>
            Sign in with madebyrazeen
          </button>
        )}
        {password && (
          <>
            {sso && divider}
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="mono muted">Password</span>
              <input className="input" type="password" autoFocus={!sso} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" style={{ height: 44 }} />
            </label>
            {err && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</span>}
            <button className={sso ? 'btn' : 'btn primary'} style={{ height: 44 }}>Sign in to edit</button>
          </>
        )}
        {viewOnly && (
          <>
            {divider}
            <button type="button" className="btn" style={{ height: 44 }}
              onClick={() => enter('/auth/view').catch(() => setErr('View only is not available.'))}>
              View only
            </button>
            <p className="muted" style={{ margin: 0, fontSize: 12.5, textAlign: 'center' }}>See every project, board and timeline without making changes.</p>
          </>
        )}
      </form>
    </div>
  )
}
