import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { getMyTickets, getTemplates, createTicket, estimateCost } from '../services/api'

const STATUS_COLORS = {
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  provisioning: 'bg-purple-100 text-purple-800',
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
}

const STATUS_LABELS = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  provisioning: 'Provisioning...',
  active: 'Active',
  expired: 'Expired',
  rejected: 'Rejected',
}

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

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (form.template_id && form.duration_days) {
      estimateCost(form.template_id, form.duration_days)
        .then(res => setEstimate(res.data))
        .catch(() => setEstimate(null))
    }
  }, [form.template_id, form.duration_days])

  const fetchData = async () => {
    try {
      const [ticketsRes, templatesRes] = await Promise.all([getMyTickets(), getTemplates()])
      setTickets(ticketsRes.data)
      setTemplates(templatesRes.data)
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
      await createTicket({
        template_id: parseInt(form.template_id),
        title: form.title,
        justification: form.justification,
        duration_days: parseInt(form.duration_days)
      })
      setSuccess('Environment request submitted successfully!')
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

  // Stats
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Environments</h1>
            <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.full_name}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {showForm ? 'Cancel' : '+ Request Environment'}
          </button>
        </div>

        {/* Alerts */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Requests', value: stats.total, color: 'text-gray-900' },
            { label: 'Active', value: stats.active, color: 'text-green-600' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-600' },
            { label: 'Provisioning', value: stats.provisioning, color: 'text-purple-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">New Environment Request</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Environment Type</label>
                  <select
                    value={form.template_id}
                    onChange={e => setForm({ ...form, template_id: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={form.duration_days}
                    onChange={e => setForm({ ...form, duration_days: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                  placeholder="e.g. Development environment for feature X"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justification</label>
                <textarea
                  value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  required
                  rows={3}
                  placeholder="Why do you need this environment?"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                />
              </div>

              {/* Cost estimate */}
              {estimate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-800">Cost Estimate</p>
                  <div className="flex gap-6 mt-2">
                    <div>
                      <p className="text-xs text-blue-600">Total Cost</p>
                      <p className="text-lg font-bold text-blue-900">${estimate.estimated_total_cost}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">Monthly Rate</p>
                      <p className="text-lg font-bold text-blue-900">${estimate.estimated_monthly_cost}/mo</p>
                    </div>
                    {estimate.free_tier_eligible && (
                      <div className="flex items-center">
                        <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">Free Tier Eligible</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tickets Table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">My Requests</h2>
          </div>
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No environment requests yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-blue-600 text-sm font-medium hover:underline"
              >
                Create your first request
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Ticket', 'Title', 'Type', 'Duration', 'Status', 'URL', 'Created'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map(ticket => (
                  <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-gray-600">{ticket.ticket_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{ticket.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{ticket.template_id === 1 ? 'Web App' : ticket.template_id === 2 ? 'Database' : 'Serverless'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{ticket.duration_days}d</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[ticket.status]}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.environment_url ? (
                        <a href={ticket.environment_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline truncate max-w-32 block">
                          {ticket.environment_url}
                        </a>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{new Date(ticket.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
