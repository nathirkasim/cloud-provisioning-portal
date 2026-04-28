import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { getMyTickets, getTemplates, createTicket, estimateCost, getQuota, getConsoleLink, autoCheckTicket, cancelTicket } from '../services/api'

const STATUS_COLORS = {
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  provisioning: 'bg-purple-100 text-purple-800',
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  expired: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  provisioning: 'Provisioning...',
  active: 'Active',
  expiring: 'Expiring...',
  expired: 'Expired',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const TEMPLATE_NAMES = { 1: 'Web App', 2: 'Database', 3: 'Serverless' }

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ template_id: '', title: '', justification: '', duration_days: 7 })
  const [estimate, setEstimate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [quota, setQuota] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    fetchData()
    return () => clearInterval(pollRef.current)
  }, [])

  // Auto-refresh every 10 seconds if any ticket is provisioning
  useEffect(() => {
    const hasProvisioning = tickets.some(t =>
      ['provisioning', 'approved', 'expiring'].includes(t.status)
    )
    if (hasProvisioning) {
      pollRef.current = setInterval(fetchData, 10000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [tickets])

  useEffect(() => {
    if (form.template_id && form.duration_days) {
      estimateCost(form.template_id, form.duration_days)
        .then(res => setEstimate(res.data))
        .catch(() => setEstimate(null))
    }
  }, [form.template_id, form.duration_days])

  const fetchData = async () => {
    try {
      const [ticketsRes, templatesRes, quotaRes] = await Promise.all([
        getMyTickets(),
        getTemplates(),
        getQuota()
      ])
      setTickets(ticketsRes.data)
      setTemplates(templatesRes.data)
      setQuota(quotaRes.data)
    } catch (err) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await createTicket({
        template_id: parseInt(form.template_id),
        title: form.title,
        justification: form.justification,
        duration_days: parseInt(form.duration_days)
      })
      const newTicketId = res.data.id
      await autoCheckTicket(newTicketId)
      setSuccess('Environment request submitted!')
      setShowForm(false)
      setForm({ template_id: '', title: '', justification: '', duration_days: 7 })
      setEstimate(null)
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenConsole = async (ticketId) => {
    try {
      const res = await getConsoleLink(ticketId)
      window.open(res.data.url, '_blank')
    } catch (err) {
      setError(err.response?.data?.detail || 'IAM session required for console access.')
      setTimeout(() => setError(''), 5000)
    }
  }

  const handleCancel = async (ticketId, ticketNumber) => {
    if (!window.confirm(`Cancel ticket ${ticketNumber}? This cannot be undone.`)) return
    try {
      await cancelTicket(ticketId)
      setSuccess(`Ticket ${ticketNumber} cancelled`)
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel ticket')
    }
  }

  const stats = {
    total: tickets.length,
    active: tickets.filter(t => t.status === 'active').length,
    pending: tickets.filter(t => t.status === 'pending_approval').length,
    provisioning: tickets.filter(t => t.status === 'provisioning').length,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Cloud Infrastructure</h1>
            <p className="text-gray-500 text-sm mt-1">Operator: {user?.full_name}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
          >
            {showForm ? 'Cancel Request' : '+ New Environment'}
          </button>
        </div>

        {/* Alerts */}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm font-medium">{success}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm font-medium">{error}</div>}

        {/* Auto-refresh notice */}
        {tickets.some(t => ['provisioning', 'approved', 'expiring'].includes(t.status)) && (
          <div className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-lg mb-6 text-xs flex items-center gap-3 font-bold uppercase tracking-wider">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
            Syncing with Cloud Provider — Page auto-refreshes...
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Resources</p>
            <p className="text-3xl font-black mt-2 text-gray-900">
              {quota ? `${quota.active_environments}/${quota.max_environments}` : stats.total}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Monthly Burn</p>
            <p className="text-3xl font-black mt-2 text-green-600">
              ${quota ? quota.monthly_cost_usd.toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pending</p>
            <p className="text-3xl font-black mt-2 text-yellow-500">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Active</p>
            <p className="text-3xl font-black mt-2 text-blue-600">{stats.active}</p>
          </div>
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Provision New Resource</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Service Template</label>
                  <select
                    value={form.template_id}
                    onChange={e => setForm({ ...form, template_id: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                  >
                    <option value="">Select template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">TTL (Days)</label>
                  <input
                    type="number"
                    min="1" max="30"
                    value={form.duration_days}
                    onChange={e => setForm({ ...form, duration_days: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Deployment Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                  placeholder="e.g. Production RDS Migration Test"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Business Justification</label>
                <textarea
                  value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none resize-none"
                />
              </div>

              {estimate && (
                <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-inner">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Projected Infrastructure Cost</p>
                  <div className="flex items-end gap-1 mt-1">
                    <span className="text-3xl font-black">${estimate.estimated_total_cost}</span>
                    <span className="text-xs mb-1 opacity-80">for {form.duration_days} days</span>
                  </div>
                  <p className="text-[10px] opacity-60 mt-2">
                    ${estimate.estimated_monthly_cost} / month  •  {estimate.free_tier_eligible ? '✓ Free Tier Eligible' : 'Standard pricing'}
                  </p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                  {submitting ? 'Initializing...' : 'Confirm Deployment'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Requests Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Active Deployments</h2>
            <button onClick={fetchData} className="text-[10px] font-bold text-blue-600 hover:underline uppercase">Refresh Registry</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  {['Ticket ID', 'Resource Name', 'Status', 'Console Access', 'Expires'].map(h => (
                    <th key={h} className="text-left px-8 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tickets.map(ticket => (
                  <tr key={ticket.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-8 py-5 text-xs font-mono font-bold text-blue-600 cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                      {ticket.ticket_number}
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-gray-900">{ticket.title}</p>
                      <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{TEMPLATE_NAMES[ticket.template_id] || 'AWS Service'}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md tracking-tighter ${STATUS_COLORS[ticket.status]}`}>
                        {ticket.status === 'provisioning' && <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full mr-2 animate-ping"></span>}
                        {ticket.status === 'expiring' && <span className="inline-block w-1.5 h-1.5 bg-orange-500 rounded-full mr-2 animate-ping"></span>}
                        {STATUS_LABELS[ticket.status]}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {ticket.status === 'active' ? (
                        <button
                          onClick={() => handleOpenConsole(ticket.id)}
                          className="inline-flex items-center gap-2 bg-[#FF9900] hover:bg-[#ec8d00] text-white text-[10px] font-black px-4 py-2 rounded-lg shadow-sm transition-all active:scale-95"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 19h20L12 2zm0 3l7.43 13H4.57L12 5z"/>
                          </svg>
                          LAUNCH CONSOLE
                        </button>
                      ) : ticket.status === 'pending_approval' ? (
                        <button
                          onClick={() => handleCancel(ticket.id, ticket.ticket_number)}
                          className="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black px-4 py-2 rounded-lg transition-all active:scale-95"
                        >
                          CANCEL REQUEST
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-300">
                          <div className="w-1.5 h-1.5 bg-gray-200 rounded-full"></div>
                          <span className="text-[10px] font-bold italic uppercase tracking-widest">Locked</span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-5 text-[10px] font-bold">
                      {(() => {
                        if (ticket.status !== 'active') {
                          return <span className="text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</span>
                        }
                        const expiresAt = new Date(ticket.created_at)
                        expiresAt.setDate(expiresAt.getDate() + ticket.duration_days)
                        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))
                        if (daysLeft <= 0) return <span className="text-red-600">Expired</span>
                        if (daysLeft === 1) return <span className="text-red-500">Expires today</span>
                        if (daysLeft <= 3) return <span className="text-orange-500">Expires in {daysLeft} days</span>
                        return <span className="text-gray-400">Expires in {daysLeft} days</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
