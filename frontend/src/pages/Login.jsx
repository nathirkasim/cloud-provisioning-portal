import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login, iamLogin, getMe } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [tab, setTab] = useState('portal')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState('')
  const { loginUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const justRegistered = searchParams.get('registered') === 'true'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = tab === 'portal'
        ? await login(email, password)
        : await iamLogin(accessKey, secretKey)
      const token = res.data.access_token
      localStorage.setItem('token', token)
      const meRes = await getMe()
      loginUser(token, meRes.data)
      navigate(['admin','approver'].includes(meRes.data.role) ? '/admin' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials and try again.')
    } finally { setLoading(false) }
  }

  const handleForgot = async () => {
    setForgotLoading(true)
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      setForgotMsg('If that email is registered, a reset link has been sent.')
    } catch { setForgotMsg('Something went wrong. Please try again.') }
    finally { setForgotLoading(false) }
  }

  const isIam = tab === 'iam'
  const accent = isIam ? '#FF9900' : '#185FA5'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif",
      background: '#F3F4F6',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        input:focus { outline: none; }
      `}</style>

      {/* Left panel — branding */}
      <div style={{
        width: 380, background: '#185FA5', flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '40px 36px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Cloud Portal</span>
        </div>

        {/* Center copy */}
        <div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'white', lineHeight: 1.25, marginBottom: 14 }}>
            Provision cloud resources in seconds
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, marginBottom: 32 }}>
            Request managed AWS environments — EC2, RDS, Lambda, S3, EKS and more — without touching the console. Admin-approved, cost-tracked, auto-expired.
          </div>

          {/* Feature chips */}
          {[
            { icon: '⚡', text: 'Tier 1 resources live in under 60 seconds' },
            { icon: '💰', text: 'Per-environment cost tracking and quotas' },
            { icon: '🔐', text: 'IAM-federated one-click console access' },
            { icon: '📋', text: 'Full audit log of all provisioning actions' },
          ].map(f => (
            <div key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Internal developer portal · ap-south-1
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.25s ease' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>Sign in</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Welcome back. Choose your login method.</div>
          </div>

          {/* Registered banner */}
          {justRegistered && (
            <div style={{
              background: '#D4EDB8', border: '0.5px solid #A8D98A', borderRadius: 7,
              padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#27500A', fontWeight: 500,
              animation: 'slideDown 0.2s ease',
            }}>
              ✓ Account created — you can sign in now
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'flex', background: '#F0F0F0', borderRadius: 8, padding: 3, marginBottom: 24, gap: 3 }}>
            {[
              { id: 'portal', label: 'Portal login' },
              { id: 'iam',    label: 'AWS IAM login' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setError('') }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
                  borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: tab === t.id ? '#fff' : 'transparent',
                  color: tab === t.id ? (t.id === 'iam' ? '#C06A00' : '#185FA5') : '#888',
                  boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* IAM explainer */}
          {isIam && (
            <div style={{
              background: '#FFF8EC', border: '0.5px solid #F5D08A', borderRadius: 7,
              padding: '11px 14px', marginBottom: 20, animation: 'slideDown 0.18s ease',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#854F0B', marginBottom: 4 }}>What is IAM login?</div>
              <div style={{ fontSize: 11, color: '#A36210', lineHeight: 1.6 }}>
                IAM login federates your AWS credentials with the portal, enabling <strong style={{ color: '#854F0B' }}>one-click AWS Console access</strong> for any active resource you provision.
                Your keys are used only to generate a short-lived STS session token — they are not stored.
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: '#C07A20', background: 'rgba(255,153,0,0.08)', borderRadius: 4, padding: '5px 8px' }}>
                🔒 Required IAM permissions: <code style={{ fontFamily: 'monospace' }}>sts:GetFederationToken</code>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: '#FCEBEB', border: '0.5px solid #FBBCBC', borderRadius: 7,
              padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#791F1F',
              animation: 'slideDown 0.18s ease',
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {tab === 'portal' ? (
              <>
                <Field label="Email">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="you@company.com"
                    style={inputSt}
                    onFocus={e => e.target.style.borderColor = accent}
                    onBlur={e => e.target.style.borderColor = '#DCDCDC'}
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="••••••••"
                    style={inputSt}
                    onFocus={e => e.target.style.borderColor = accent}
                    onBlur={e => e.target.style.borderColor = '#DCDCDC'}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Access Key ID">
                  <input
                    type="text" value={accessKey} onChange={e => setAccessKey(e.target.value)} required
                    placeholder="AKIA..."
                    style={{ ...inputSt, fontFamily: 'DM Mono, monospace' }}
                    onFocus={e => e.target.style.borderColor = accent}
                    onBlur={e => e.target.style.borderColor = '#DCDCDC'}
                  />
                </Field>
                <Field label="Secret Access Key">
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={secretKey} onChange={e => setSecretKey(e.target.value)} required
                      placeholder="Secret key"
                      style={{ ...inputSt, fontFamily: 'DM Mono, monospace', paddingRight: 44 }}
                      onFocus={e => e.target.style.borderColor = accent}
                      onBlur={e => e.target.style.borderColor = '#DCDCDC'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#AAA',
                      }}
                    >
                      {showSecret ? '🙈' : '👁'}
                    </button>
                  </div>
                </Field>
              </>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 7, border: 'none',
                fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#AAA' : accent, color: '#fff',
                transition: 'background 0.15s, opacity 0.15s', marginTop: 2,
              }}
            >
              {loading ? 'Authenticating…' : isIam ? 'Authenticate with AWS' : 'Sign in'}
            </button>
          </form>

          {/* Forgot password */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button
              onClick={() => { setForgotOpen(o => !o); setForgotMsg('') }}
              style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Forgot password?
            </button>
          </div>

          {forgotOpen && (
            <div style={{ marginTop: 12, animation: 'slideDown 0.18s ease', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                placeholder="your@email.com"
                style={inputSt}
              />
              <button
                onClick={handleForgot} disabled={forgotLoading}
                style={{ padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, background: '#185FA5', color: '#fff', cursor: 'pointer', opacity: forgotLoading ? 0.6 : 1 }}
              >
                {forgotLoading ? 'Sending…' : 'Send reset link'}
              </button>
              {forgotMsg && <div style={{ fontSize: 11, color: '#27500A', textAlign: 'center' }}>{forgotMsg}</div>}
            </div>
          )}

          {/* Register */}
          <div style={{ marginTop: 22, textAlign: 'center', fontSize: 12, color: '#AAA' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#185FA5', fontWeight: 600, textDecoration: 'none' }}>Create one</Link>
          </div>

        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#AAA', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

const inputSt = {
  width: '100%', fontSize: 13, padding: '9px 12px',
  border: '0.5px solid #DCDCDC', borderRadius: 7,
  background: '#FAFAFA', color: '#111', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
}
