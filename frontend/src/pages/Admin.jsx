import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import {
  getPendingTickets, approveTicket, rejectTicket, getUsers, updateUserRole,
  getAuditLogs, destroyEnvironment, getAllTickets, getPortalStats,
  markInProgress, completeManualSetup
} from '../services/api'

const TAB_PENDING  = 'pending'
const TAB_MANUAL   = 'manual'
const TAB_ACTIVE   = 'active'
const TAB_USERS    = 'users'
const TAB_AUDIT    = 'audit'
const TAB_STATS    = 'stats'

const MANUAL_STATUSES = ['pending_manual_setup', 'in_progress']

const STATUS_COLORS = {
  pending_approval:     'bg-yellow-100 text-yellow-800',
  pending_manual_setup: 'bg-amber-100 text-amber-800',
  in_progress:          'bg-cyan-100 text-cyan-800',
  provisioning:         'bg-purple-100 text-purple-800',
  active:               'bg-green-100 text-green-800',
}

const STATUS_LABELS = {
  pending_approval:     'Pending Approval',
  pending_manual_setup: 'Awaiting Admin Setup',
  in_progress:          'In Progress',
  provisioning:         'Provisioning...',
  active:               'Active',
}

const TEMPLATE_META = {
  web_app:           { icon: '🖥️' }, database:       { icon: '🗄️' },
  serverless:        { icon: '⚡' }, s3_static_site:  { icon: '🌐' },
  s3_storage:        { icon: '🪣' }, sns_topic:       { icon: '📣' },
  dynamodb:          { icon: '⚡' }, ecr_repository:  { icon: '📦' },
  ecs_container:     { icon: '🐳' }, elasticache_redis:{ icon: '🔴' },
  cloudfront_cdn:    { icon: '🌍' }, rds_read_replica: { icon: '🗄️' },
  secrets_manager:   { icon: '🔐' }, waf_rules:       { icon: '🛡️' },
  kinesis_stream:    { icon: '🌊' }, eks_cluster:     { icon: '☸️' },
  codepipeline:      { icon: '🔄' }, opensearch:      { icon: '🔍' },
  redshift:          { icon: '🏢' }, custom_request:  { icon: '✨' },
}

function getIcon(templateType) {
  return TEMPLATE_META[templateType]?.icon || '☁️'
}

// Modal for admin to fill in resource details and mark a manual ticket as complete
function ManualCompleteModal({ ticket, onClose, onDone }) {
  const [form, setForm] = useState({
    resource_details: '',
    environment_url: '',
    instance_id: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.resource_details.trim()) {
      setError('Resource details are required.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await completeManualSetup(ticket.id, {
        resource_details: form.resource_details,
        environment_url: form.environment_url || null,
        instance_id: form.instance_id || null,
      })
      onDone(`${ticket.ticket_number} marked active — user has been notified.`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to complete setup')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Complete Manual Setup</h3>
            <p className="text-xs text-gray-400 mt-0.5">{ticket.ticket_number} — {ticket.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
              Resource Details / Connection Info *
            </label>
            <textarea
              value={form.resource_details}
              onChange={e => setForm({ ...form, resource_details: e.target.value })}
              required rows={5}
              placeholder={`Paste all connection details here.\nExamples:\n  Endpoint: redis-cluster.abc123.cache.amazonaws.com:6379\n  ARN: arn:aws:elasticache:...\n  Region: ap-south-1`}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none resize-none font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">This text will be shown to the user on their ticket. Include everything they need to connect.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">URL / Endpoint (optional)</label>
              <input
                type="text"
                value={form.environment_url}
                onChange={e => setForm({ ...form, environment_url: e.target.value })}
                placeholder="https://... or redis://..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Resource ID / ARN (optional)</label>
              <input
                type="text"
                value={form.instance_id}
                onChange={e => setForm({ ...form, instance_id: e.target.value })}
                placeholder="arn:aws:... or cluster-id"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm">
              {submitting ? 'Saving...' : '✓ Mark as Active & Notify User'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState(TAB_PENDING)
  const [pending, setPending] = useState([])        // pending_approval only
  const [manualTickets, setManualTickets] = useState([]) // pending_manual_setup + in_progress
  const [activeTickets, setActiveTickets] = useState([])
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectReason, setRejectReason] = useState({})
  const [showReject, setShowReject] = useState(null)
  const [confirmDestroy, setConfirmDestroy] = useState(null)
  const [pendingRoleChange, setPendingRoleChange] = useState(null)
  const [completeModal, setCompleteModal] = useState(null) // ticket object
  const [activeSearch, setActiveSearch] = useState('')
  const [pendingSearch, setPendingSearch] = useState('')
  const [manualSearch, setManualSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [allPendingRes, usersRes, auditRes, activeRes, statsRes] = await Promise.all([
        getPendingTickets(),       // returns pending_approval + pending_manual_setup + in_progress
        getUsers(),
        getAuditLogs({ limit: 20 }),
        getAllTickets({ status: 'active' }),
        getPortalStats()
      ])
      // Split by status
      const allPending = allPendingRes.data
      setPending(allPending.filter(t => t.status === 'pending_approval'))
      setManualTickets(allPending.filter(t => MANUAL_STATUSES.includes(t.status)))
      setUsers(usersRes.data)
      setAuditLogs(auditRes.data)
      setActiveTickets(activeRes.data)
      setStats(statsRes.data)
    } catch (err) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 5000)
  }

  const handleApprove = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      const res = await approveTicket(id)
      flash(res.data.message || `${ticketNumber} approved`)
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      await rejectTicket(id, rejectReason[id] || 'Rejected by admin')
      flash(`${ticketNumber} rejected`)
      setShowReject(null)
      setRejectReason(prev => { const n = { ...prev }; delete n[id]; return n })
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkInProgress = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      await markInProgress(id)
      flash(`${ticketNumber} marked in progress`)
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleManualDone = (msg) => {
    setCompleteModal(null)
    flash(msg)
    fetchAll()
  }

  const handleDestroy = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      await destroyEnvironment(id)
      flash(`${ticketNumber} destroy initiated — environment will be removed shortly`)
      setConfirmDestroy(null)
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to destroy')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleChangeRequest = (userId, newRole, userName) => {
    setPendingRoleChange({ userId, newRole, userName })
  }

  const handleRoleChangeConfirm = async () => {
    if (!pendingRoleChange) return
    const { userId, newRole } = pendingRoleChange
    setError('')
    try {
      await updateUserRole(userId, newRole)
      flash('Role updated successfully')
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update role')
    } finally {
      setPendingRoleChange(null)
    }
  }

  const filterTickets = (list, search) =>
    list.filter(t =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.ticket_number.toLowerCase().includes(search.toLowerCase()) ||
      (t.requester_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.requester_email || '').toLowerCase().includes(search.toLowerCase())
    )

  const tabs = [
    { id: TAB_PENDING, label: `Pending Approval (${pending.length})` },
    { id: TAB_MANUAL,  label: `Manual Setup (${manualTickets.length})${manualTickets.length > 0 ? ' 🔔' : ''}` },
    { id: TAB_ACTIVE,  label: `Active (${activeTickets.length})` },
    { id: TAB_USERS,   label: `Users (${users.length})` },
    { id: TAB_AUDIT,   label: 'Audit Log' },
    { id: TAB_STATS,   label: 'Cost & Stats' },
  ]

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

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500 text-sm mt-1">Manage approvals, manual setups, users, and audit logs</p>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">{message}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>
        )}

        {/* Role change confirmation modal */}
        {pendingRoleChange && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Confirm Role Change</h3>
              <p className="text-sm text-gray-500 mb-6">
                Change <span className="font-medium text-gray-800">{pendingRoleChange.userName}</span>'s
                role to <span className="font-medium text-gray-800 capitalize">{pendingRoleChange.newRole}</span>?
                This will immediately affect their permissions.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setPendingRoleChange(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleRoleChangeConfirm}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual complete modal */}
        {completeModal && (
          <ManualCompleteModal
            ticket={completeModal}
            onClose={() => setCompleteModal(null)}
            onDone={handleManualDone}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-8 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Pending Approvals tab ── */}
        {tab === TAB_PENDING && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Pending Approvals</h2>
              <input
                type="text" placeholder="Search..."
                value={pendingSearch} onChange={e => setPendingSearch(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            {pending.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No pending approvals.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filterTickets(pending, pendingSearch).map(ticket => {
                  const templateType = ticket.template?.template_type || ticket.template_type
                  const isManualTemplate = ticket.template?.is_manual
                  return (
                    <div key={ticket.id} className="px-6 py-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-base">{getIcon(templateType)}</span>
                            <span className="font-mono text-xs text-gray-500">{ticket.ticket_number}</span>
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full">Pending</span>
                            {isManualTemplate && (
                              <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                Manual Setup Required
                              </span>
                            )}
                            {ticket.template?.tier && (
                              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                                Tier {ticket.template.tier}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{ticket.title}</p>
                          <p className="text-gray-500 text-sm mt-1">{ticket.justification}</p>
                          <div className="flex gap-4 mt-3 text-xs text-gray-400 flex-wrap">
                            <span>Duration: {ticket.duration_days} days</span>
                            <span>Cost: ${ticket.estimated_cost_usd}</span>
                            <span>Requested by: {ticket.requester_name || ticket.requester_email || `User ${ticket.user_id}`}</span>
                            {isManualTemplate && ticket.template?.resources?.sla_days && (
                              <span className="text-amber-600 font-medium">SLA: {ticket.template.resources.sla_days} business day(s)</span>
                            )}
                          </div>
                          {/* Custom request extra fields */}
                          {templateType === 'custom_request' && ticket.requested_resources && (
                            <div className="mt-3 grid grid-cols-3 gap-2 bg-blue-50 rounded-lg p-3">
                              {[
                                ['Resource', ticket.requested_resources.resource_type_name],
                                ['Provider', ticket.requested_resources.cloud_provider],
                                ['Urgency', ticket.requested_resources.urgency],
                                ['Usage', ticket.requested_resources.estimated_usage],
                              ].map(([label, val]) => val && (
                                <div key={label}>
                                  <p className="text-[10px] text-blue-600 font-bold uppercase">{label}</p>
                                  <p className="text-xs text-blue-900">{val}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 ml-6">
                          <button
                            onClick={() => handleApprove(ticket.id, ticket.ticket_number)}
                            disabled={actionLoading === ticket.id}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {actionLoading === ticket.id ? 'Processing...' : isManualTemplate ? '✓ Approve & Queue' : '✓ Approve'}
                          </button>
                          <button
                            onClick={() => setShowReject(showReject === ticket.id ? null : ticket.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                      {showReject === ticket.id && (
                        <div className="mt-4 flex gap-2">
                          <input
                            type="text" placeholder="Rejection reason..."
                            value={rejectReason[ticket.id] || ''}
                            onChange={e => setRejectReason({ ...rejectReason, [ticket.id]: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                          <button
                            onClick={() => handleReject(ticket.id, ticket.ticket_number)}
                            disabled={actionLoading === ticket.id}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Manual Setup tab ── */}
        {tab === TAB_MANUAL && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Manual Setup Queue</h2>
                <p className="text-xs text-gray-400 mt-0.5">Approved Tier 2 / Tier 3 requests and custom requests awaiting admin provisioning</p>
              </div>
              <input
                type="text" placeholder="Search..."
                value={manualSearch} onChange={e => setManualSearch(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            {manualTickets.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-gray-400 text-sm">No manual setup tickets — queue is clear.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filterTickets(manualTickets, manualSearch).map(ticket => {
                  const templateType = ticket.template?.template_type || ticket.template_type
                  const isPending = ticket.status === 'pending_manual_setup'
                  const isInProgress = ticket.status === 'in_progress'
                  const sla = ticket.template?.resources?.sla_days
                  return (
                    <div key={ticket.id} className={`px-6 py-5 ${isInProgress ? 'bg-cyan-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-lg">{getIcon(templateType)}</span>
                            <span className="font-mono text-xs text-gray-500">{ticket.ticket_number}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[ticket.status]}`}>
                              {STATUS_LABELS[ticket.status]}
                            </span>
                            {ticket.template?.tier && (
                              <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                Tier {ticket.template.tier}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{ticket.title}</p>
                          <p className="text-gray-500 text-xs mt-1">{ticket.justification}</p>
                          <div className="flex gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                            <span>Requested by: <span className="font-medium text-gray-700">{ticket.requester_name || ticket.requester_email || `User ${ticket.user_id}`}</span></span>
                            <span>{ticket.requester_email}</span>
                            <span>Duration: {ticket.duration_days} days</span>
                            {sla && <span className="text-amber-600 font-medium">SLA: {sla} business day(s)</span>}
                            <span>Submitted: {new Date(ticket.created_at).toLocaleDateString()}</span>
                          </div>

                          {/* Show custom request details */}
                          {templateType === 'custom_request' && ticket.requested_resources && (
                            <div className="mt-3 grid grid-cols-2 gap-2 bg-blue-50 rounded-lg p-3 text-xs">
                              {[
                                ['Resource', ticket.requested_resources.resource_type_name],
                                ['Provider', ticket.requested_resources.cloud_provider],
                                ['Region', ticket.requested_resources.preferred_region],
                                ['Urgency', ticket.requested_resources.urgency],
                                ['Usage', ticket.requested_resources.estimated_usage],
                              ].map(([label, val]) => val && (
                                <div key={label}>
                                  <span className="text-[10px] text-blue-600 font-bold uppercase">{label}: </span>
                                  <span className="text-blue-900">{val}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          {isPending && (
                            <button
                              onClick={() => handleMarkInProgress(ticket.id, ticket.ticket_number)}
                              disabled={actionLoading === ticket.id}
                              className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              {actionLoading === ticket.id ? '...' : '🔧 Mark In Progress'}
                            </button>
                          )}
                          <button
                            onClick={() => setCompleteModal(ticket)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                          >
                            ✓ Fill Details & Complete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Active Environments tab ── */}
        {tab === TAB_ACTIVE && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Active Environments</h2>
              <input
                type="text" placeholder="Search..."
                value={activeSearch} onChange={e => setActiveSearch(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            {activeTickets.length === 0 ? (
              <div className="text-center py-12"><p className="text-gray-400 text-sm">No active environments.</p></div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Ticket', 'Title', 'User', 'URL / Resource', 'Expires', 'Action'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filterTickets(activeTickets, activeSearch).map(ticket => {
                    const expiresAt = new Date(ticket.created_at)
                    expiresAt.setDate(expiresAt.getDate() + ticket.duration_days)
                    const templateType = ticket.template?.template_type || ticket.template_type
                    return (
                      <tr key={ticket.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span>{getIcon(templateType)}</span>
                            <span className="text-xs font-mono text-gray-600">{ticket.ticket_number}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{ticket.title}</td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          <p className="font-medium text-gray-700">{ticket.requester_name || '—'}</p>
                          <p className="text-gray-400">{ticket.requester_email || ''}</p>
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          {ticket.environment_url ? (
                            <a href={ticket.environment_url.startsWith('http') ? ticket.environment_url : undefined}
                              target="_blank" rel="noreferrer"
                              className="text-blue-600 text-xs hover:underline break-all block truncate max-w-[200px]">
                              {ticket.environment_url}
                            </a>
                          ) : ticket.instance_id ? (
                            <span className="text-xs font-mono text-gray-500 truncate block max-w-[200px]">{ticket.instance_id}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400">{expiresAt.toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          {confirmDestroy === ticket.id ? (
                            <div className="flex gap-2">
                              <button onClick={() => setConfirmDestroy(null)}
                                className="text-xs text-gray-500 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDestroy(ticket.id, ticket.ticket_number)}
                                disabled={actionLoading === ticket.id}
                                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                                {actionLoading === ticket.id ? 'Destroying...' : 'Confirm'}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDestroy(ticket.id)}
                              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                              Destroy
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === TAB_USERS && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">User Management</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Email', 'Department', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.department}</td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={e => handleRoleChangeRequest(user.id, e.target.value, user.full_name || user.email)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="developer">Developer</option>
                        <option value="approver">Approver</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Audit Log tab ── */}
        {tab === TAB_AUDIT && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Audit Log</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Action', 'Resource', 'Resource ID', 'Details', 'IP', 'Time'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded">{log.action}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{log.resource_type}</td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-600">{log.resource_id}</td>
                    <td className="px-6 py-4 text-xs text-gray-400 max-w-xs">
                      {log.details ? (
                        <details className="cursor-pointer">
                          <summary className="truncate max-w-xs hover:text-gray-700 transition-colors">
                            {JSON.stringify(log.details).slice(0, 60)}...
                          </summary>
                          <pre className="mt-2 text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{log.ip_address || '—'}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Stats tab ── */}
        {tab === TAB_STATS && (
          <div className="space-y-6">
            {stats && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Requests',       value: stats.overview.total_tickets,           color: 'text-gray-900' },
                    { label: 'Active Environments',  value: stats.overview.active,                  color: 'text-green-600' },
                    { label: 'Total Cost (all time)', value: `$${stats.overview.total_cost_usd.toFixed(2)}`, color: 'text-blue-600' },
                    { label: 'Active Cost',           value: `$${stats.overview.active_cost_usd.toFixed(2)}`, color: 'text-purple-600' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-sm text-gray-500">{stat.label}</p>
                      <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Pending', value: stats.overview.pending, color: 'bg-yellow-100 text-yellow-800' },
                    { label: 'Expired', value: stats.overview.expired, color: 'bg-gray-100 text-gray-800' },
                    { label: 'Rejected', value: stats.overview.rejected, color: 'bg-red-100 text-red-800' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                      <p className="text-sm text-gray-500">{stat.label}</p>
                      <span className={`text-sm font-semibold px-3 py-1 rounded-full ${stat.color}`}>{stat.value}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-900">Cost by User</h2>
                  </div>
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['User', 'Department', 'Total Requests', 'Total Cost'].map(h => (
                          <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stats.per_user.map(u => (
                        <tr key={u.email} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{u.department || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{u.total_tickets}</td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-blue-600">${u.total_cost_usd.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!stats && <p className="text-gray-400 text-sm">Loading stats...</p>}
          </div>
        )}
      </div>
    </div>
  )
}
