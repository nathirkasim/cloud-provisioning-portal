import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login, iamLogin, getMe } from '../services/api' // Added iamLogin
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [loginType, setLoginType] = useState('portal') // 'portal' or 'iam'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessKey, setAccessKey] = useState('') // AWS Access Key
  const [secretKey, setSecretKey] = useState('') // AWS Secret Key
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const { loginUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const justRegistered = searchParams.get('registered') === 'true'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let res;
      // Handle login based on type
      if (loginType === 'portal') {
        res = await login(email, password)
      } else {
        res = await iamLogin(accessKey, secretKey)
      }

      const token = res.data.access_token
      localStorage.setItem('token', token)
      const meRes = await getMe()
      loginUser(token, meRes.data)

      if (['admin', 'approver'].includes(meRes.data.role)) {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }
 
 const handleForgotPassword = async () => {
    setForgotLoading(true)
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      })
      setForgotMessage('If that email exists, a reset link has been sent.')
    } catch (err) {
      setForgotMessage('Something went wrong. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-gray-100">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cloud Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Select your preferred login method</p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
          <button 
            onClick={() => { setLoginType('portal'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${loginType === 'portal' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            PORTAL LOGIN
          </button>
          <button 
            onClick={() => { setLoginType('iam'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${loginType === 'iam' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            AWS IAM LOGIN
          </button>
        </div>

        {/* Status Messages */}
        {justRegistered && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-xs">
            Account created successfully! Please sign in.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {loginType === 'portal' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
                  placeholder="••••••••"
                />
              </div>
            </>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg mb-4">
                <p className="text-[10px] text-orange-700 leading-tight">
                  Enter your IAM keys to enable direct one-click AWS Console access for your provisioned resources.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Access Key ID</label>
                <input
                  type="text"
                  value={accessKey}
                  onChange={e => setAccessKey(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm font-mono bg-gray-50"
                  placeholder="AKIA..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Secret Access Key</label>
                <input
                  type="password"
                  value={secretKey}
                  onChange={e => setSecretKey(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm font-mono bg-gray-50"
                  placeholder="Secret Key"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-4 rounded-xl text-white font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 text-sm ${
              loginType === 'portal' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#FF9900] hover:bg-[#ec8d00]'
            }`}
          >
            {loading ? 'Authenticating...' : loginType === 'portal' ? 'Sign In' : 'Authenticate with AWS'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          <button
            type="button"
            onClick={() => setShowForgot(!showForgot)}
            className="text-blue-600 hover:underline font-bold"
          >
            Forgot Password?
          </button>
        </p>

        {showForgot && (
          <div className="mt-4 space-y-3">
            <input
              type="email"
              placeholder="Enter your email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
            />
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {forgotLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
            {forgotMessage && (
              <p className="text-green-600 text-xs text-center">{forgotMessage}</p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-bold">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
