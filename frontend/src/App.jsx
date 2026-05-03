import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import TicketDetail from './pages/TicketDetail'
import ResetPassword from './pages/ResetPassword'
import Profile from './pages/Profile'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #E0E0E0', borderTop: '2.5px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !['admin', 'approver'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #E0E0E0', borderTop: '2.5px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const adminHome = <Navigate to="/admin" replace />
  const userHome  = <Navigate to="/dashboard" replace />
  const authHome  = user ? (['admin','approver'].includes(user.role) ? adminHome : userHome) : null

  return (
    <Routes>
      <Route path="/login"          element={!user ? <Login />    : authHome} />
      <Route path="/register"       element={!user ? <Register /> : userHome} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard"      element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/tickets/:id"    element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
      <Route path="/profile"        element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/admin"          element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      <Route path="/"               element={<Navigate to="/login" replace />} />
      <Route path="*"               element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
