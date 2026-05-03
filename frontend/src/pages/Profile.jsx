import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { updateMe, changePassword } from '../services/api'

// ─── Shared style tokens (matches Dashboard / Admin exactly) ─────────────────
const inputSt = {
  width: '100%', fontSize: 12, padding: '7px 10px', fontFamily: 'inherit',
  border: '0.5px solid #DCDCDC', borderRadius: 6,
  outline: 'none', background: '#FAFAFA', color: '#111',
}
const btnPrimary = {
  fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 6,
  background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer',
}
const btnGhost = {
  fontSize: 12, padding: '7px 14px', borderRadius: 6,
  background: 'transparent', color: '#666', border: '0.5px solid #DCDCDC', cursor: 'pointer',
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: '#555' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: '#AAA' }}>{hint}</span>}
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #EBEBEB' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 300,
      padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
      background: toast.type === 'error' ? '#FCEBEB' : '#D4EDB8',
      color: toast.type === 'error' ? '#791F1F' : '#27500A',
      border: `0.5px solid ${toast.type === 'error' ? '#FBBCBC' : '#B0D98A'}`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>{toast.msg}</div>
  )
}

export default function Profile() {
  const { user, loginUser } = useAuth()
  const navigate = useNavigate()

  // Profile fields
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [department, setDepartment] = useState(user?.department || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Password fields
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')

  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const handleProfileSave = async () => {
    if (!fullName.trim()) { setProfileError('Full name is required'); return }
    setProfileSaving(true); setProfileError('')
    try {
      const res = await updateMe({ full_name: fullName.trim(), department: department.trim() })
      // Update auth context so Navbar and sidebar reflect immediately
      if (loginUser) loginUser({ ...user, full_name: res.data.full_name, department: res.data.department })
      showToast('Profile updated')
    } catch (err) {
      setProfileError(err.response?.data?.detail || 'Failed to save profile')
    } finally { setProfileSaving(false) }
  }

  const handlePasswordChange = async () => {
    setPwError('')
    if (!currentPw) { setPwError('Enter your current password'); return }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return }
    setPwSaving(true)
    try {
      await changePassword({ current_password: currentPw, new_password: newPw })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      showToast('Password changed successfully')
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password')
    } finally { setPwSaving(false) }
  }

  const avatarColors = ['#D6E9FB:#0C447C','#D2F0E7:#085041','#E5E3FD:#3C3489','#FDEDD6:#633806']
  const av = avatarColors[(user?.id || 0) % avatarColors.length].split(':')
  const initials = (user?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } } @keyframes spin { to { transform:rotate(360deg) } }`}</style>
      <Toast toast={toast} />

      {/* Topbar — same height / style as Dashboard topbar */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #E8E8E8', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAA', fontSize: 16, padding: '2px 4px', lineHeight: 1 }}>←</button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Profile & Settings</div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>Manage your account details</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: av[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: av[1] }}>
            {initials}
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>{user?.email}</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '28px auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.2s ease' }}>

        {/* Identity card */}
        <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: av[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: av[1], flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{user?.full_name || '—'}</div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: '#E6F1FB', color: '#0C447C', textTransform: 'capitalize' }}>{user?.role}</span>
              {user?.department && <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: '#F0F0F0', color: '#666' }}>{user.department}</span>}
            </div>
          </div>
        </div>

        {/* Profile details card */}
        <Card title="Profile details" subtitle="Update your display name and department">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full name *">
              <input style={inputSt} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </Field>
            <Field label="Email address" hint="Email cannot be changed — contact an admin if needed">
              <input style={{ ...inputSt, background: '#F4F4F4', color: '#AAA', cursor: 'not-allowed' }} value={user?.email || ''} readOnly />
            </Field>
            <Field label="Department">
              <input style={inputSt} value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Engineering, DevOps" />
            </Field>
            {profileError && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', color: '#791F1F', padding: '7px 10px', borderRadius: 5, fontSize: 11 }}>{profileError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <button onClick={() => { setFullName(user?.full_name || ''); setDepartment(user?.department || ''); setProfileError('') }} style={btnGhost}>Reset</button>
              <button onClick={handleProfileSave} disabled={profileSaving} style={{ ...btnPrimary, opacity: profileSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {profileSaving && <div style={{ width: 10, height: 10, border: '1.5px solid rgba(255,255,255,0.4)', borderTop: '1.5px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {profileSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Card>

        {/* Change password card */}
        <Card title="Change password" subtitle="Choose a strong password with at least 8 characters">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current password">
              <input style={inputSt} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Your current password" autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="Minimum 8 characters">
              <input style={inputSt} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <input
                style={{ ...inputSt, borderColor: confirmPw && confirmPw !== newPw ? '#E24B4A' : '#DCDCDC' }}
                type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder="Repeat new password" autoComplete="new-password"
              />
              {confirmPw && confirmPw !== newPw && <span style={{ fontSize: 10, color: '#A32D2D', marginTop: -2 }}>Passwords don't match</span>}
            </Field>
            {pwError && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', color: '#791F1F', padding: '7px 10px', borderRadius: 5, fontSize: 11 }}>{pwError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <button onClick={() => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('') }} style={btnGhost}>Clear</button>
              <button onClick={handlePasswordChange} disabled={pwSaving} style={{ ...btnPrimary, opacity: pwSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {pwSaving && <div style={{ width: 10, height: 10, border: '1.5px solid rgba(255,255,255,0.4)', borderTop: '1.5px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {pwSaving ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </div>
        </Card>

        {/* Read-only account info card */}
        <Card title="Account info" subtitle="Details managed by your portal administrator">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Role', value: user?.role, capitalize: true },
              { label: 'Account status', value: user?.is_active ? 'Active' : 'Inactive' },
              { label: 'Member since', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #F0F0F0' }}>
                <span style={{ fontSize: 12, color: '#888' }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#111', textTransform: row.capitalize ? 'capitalize' : 'none' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}
