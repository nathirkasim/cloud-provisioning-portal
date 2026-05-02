import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'

const inputSt = {
  width: '100%', fontSize: 13, padding: '9px 12px',
  border: '0.5px solid #DCDCDC', borderRadius: 7,
  background: '#FAFAFA', color: '#111', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

function StrengthBar({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const colors = ['#E0E0E0', '#E24B4A', '#BA7517', '#378ADD', '#3B6D11']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  if (!password) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 3, flex: 1 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : '#EBEBEB', transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: colors[score], fontWeight: 600, width: 40, textAlign: 'right' }}>{labels[score]}</span>
    </div>
  )
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const passMatch    = confirm && password === confirm
  const passMismatch = confirm && password !== confirm

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reset failed')
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err.message || 'Invalid or expired reset link. Please request a new one.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F3F4F6' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        input:focus { border-color: #185FA5 !important; box-shadow: 0 0 0 2px rgba(24,95,165,0.1); }
      `}</style>

      {/* Left branding panel */}
      <div style={{ width: 380, background: '#185FA5', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '40px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Cloud Portal</span>
        </div>

        <div>
          <div style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.15)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: 'white', lineHeight: 1.3, marginBottom: 12 }}>Set a new password</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
            Choose a strong password you haven't used before. It will take effect immediately after you confirm.
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'At least 8 characters long',
              'Mix of uppercase and lowercase letters',
              'At least one number',
              'A special character for extra strength',
            ].map(tip => (
              <div key={tip} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Internal developer portal · ap-south-1</div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.25s ease' }}>

          {/* Invalid token */}
          {!token ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🔗</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 8 }}>Invalid reset link</div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.6 }}>
                This link is missing the reset token. Please request a new password reset from the login page.
              </div>
              <Link to="/login" style={{ fontSize: 13, fontWeight: 600, color: '#185FA5', textDecoration: 'none', padding: '9px 20px', border: '0.5px solid #B0D0EF', borderRadius: 7, background: '#E6F1FB', display: 'inline-block' }}>
                ← Back to login
              </Link>
            </div>
          ) : success ? (
            /* Success state */
            <div style={{ textAlign: 'center', animation: 'fadeUp 0.25s ease' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#D4EDB8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#27500A" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#111', marginBottom: 8 }}>Password reset!</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 20 }}>
                Your password has been updated. Redirecting you to login in a moment…
              </div>
              <Link to="/login" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none', fontWeight: 600 }}>
                Go to login now →
              </Link>
            </div>
          ) : (
            /* Reset form */
            <>
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>Reset your password</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Enter and confirm your new password below.</div>
              </div>

              {error && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', borderRadius: 7, padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#791F1F', animation: 'slideDown 0.18s ease' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#AAA', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>New password</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'} required value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ ...inputSt, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#BBB' }}>
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                  <StrengthBar password={password} />
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#AAA', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Confirm new password</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'} required value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        ...inputSt, paddingRight: 40,
                        borderColor: passMatch ? '#3B6D11' : passMismatch ? '#E24B4A' : '#DCDCDC',
                        boxShadow: passMatch ? '0 0 0 2px rgba(59,109,17,0.1)' : passMismatch ? '0 0 0 2px rgba(226,75,74,0.1)' : 'none',
                      }}
                    />
                    <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#BBB' }}>
                      {showConfirm ? '🙈' : '👁'}
                    </button>
                  </div>
                  {passMatch    && <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 4, fontWeight: 600 }}>✓ Passwords match</div>}
                  {passMismatch && <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 4, fontWeight: 600 }}>✗ Passwords do not match</div>}
                </div>

                <button
                  type="submit" disabled={loading || passMismatch}
                  style={{
                    width: '100%', padding: '11px 0', borderRadius: 7, border: 'none',
                    fontSize: 13, fontWeight: 600, marginTop: 4,
                    cursor: loading || passMismatch ? 'not-allowed' : 'pointer',
                    background: loading || passMismatch ? '#AAA' : '#185FA5',
                    color: '#fff', transition: 'background 0.15s',
                  }}
                >
                  {loading ? 'Resetting…' : 'Set new password'}
                </button>
              </form>

              <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12, color: '#AAA' }}>
                Remembered it?{' '}
                <Link to="/login" style={{ color: '#185FA5', fontWeight: 600, textDecoration: 'none' }}>Back to login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
