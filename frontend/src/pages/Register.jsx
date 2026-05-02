import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../services/api'

const DEPARTMENTS = [
  'Engineering', 'Platform', 'DevOps', 'QA', 'Data', 'Security',
  'Product', 'Design', 'Finance', 'Marketing', 'Other',
]

const inputSt = {
  width: '100%', fontSize: 13, padding: '9px 12px',
  border: '0.5px solid #DCDCDC', borderRadius: 7,
  background: '#FAFAFA', color: '#111', outline: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#AAA', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: '#CCC' }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
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

export default function Register() {
  const [form, setForm] = useState({ full_name: '', email: '', department: '', password: '', confirmPassword: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await register({ full_name: form.full_name, email: form.email, department: form.department, password: form.password })
      navigate('/login?registered=true')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  const passMatch = form.confirmPassword && form.password === form.confirmPassword
  const passMismatch = form.confirmPassword && form.password !== form.confirmPassword

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F3F4F6' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        input:focus, select:focus { border-color: #185FA5 !important; box-shadow: 0 0 0 2px rgba(24,95,165,0.1); }
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
          <div style={{ fontSize: 28, fontWeight: 600, color: 'white', lineHeight: 1.25, marginBottom: 14 }}>
            Request AWS resources in minutes, not days
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, marginBottom: 32 }}>
            Create your account to start provisioning managed cloud environments — with cost tracking, quota limits, and admin oversight built in.
          </div>

          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { step: '1', text: 'Create your account below' },
              { step: '2', text: 'Browse service templates and submit a request' },
              { step: '3', text: 'Tier 1 resources go live in ~60 seconds' },
              { step: '4', text: 'Access your environment via the portal or AWS Console' },
            ].map(s => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0, marginTop: 1 }}>{s.step}</div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Internal developer portal · ap-south-1</div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp 0.25s ease' }}>

          <div style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>Create account</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Fill in your details to get access to the portal.</div>
          </div>

          {error && (
            <div style={{
              background: '#FCEBEB', border: '0.5px solid #FBBCBC', borderRadius: 7,
              padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#791F1F',
              animation: 'slideDown 0.18s ease',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Field label="Full name">
              <input
                type="text" required value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Nathir Mubeen"
                style={inputSt}
              />
            </Field>

            <Field label="Work email">
              <input
                type="email" required value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="you@company.com"
                style={inputSt}
              />
            </Field>

            <Field label="Department">
              <select
                required value={form.department}
                onChange={e => set('department', e.target.value)}
                style={{ ...inputSt, cursor: 'pointer', color: form.department ? '#111' : '#AAA' }}
              >
                <option value="" disabled>Select your department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>

            <Field label="Password" hint="Min. 8 characters">
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputSt, paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#BBB' }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              <StrengthBar password={form.password} />
            </Field>

            <Field label="Confirm password">
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'} required value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
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
              {passMatch && <div style={{ fontSize: 10, color: '#3B6D11', marginTop: 4, fontWeight: 600 }}>✓ Passwords match</div>}
              {passMismatch && <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 4, fontWeight: 600 }}>✗ Passwords do not match</div>}
            </Field>

            {/* Access note */}
            <div style={{ background: '#F4F4F4', borderRadius: 6, padding: '9px 12px', fontSize: 11, color: '#888', lineHeight: 1.5 }}>
              ℹ️ Your account starts with <strong style={{ color: '#555' }}>developer</strong> access. An admin can upgrade your role after registration.
            </div>

            <button
              type="submit" disabled={loading || passMismatch}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 7, border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: loading || passMismatch ? 'not-allowed' : 'pointer',
                background: loading || passMismatch ? '#AAA' : '#185FA5',
                color: '#fff', transition: 'background 0.15s', marginTop: 2,
              }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#AAA' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#185FA5', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
