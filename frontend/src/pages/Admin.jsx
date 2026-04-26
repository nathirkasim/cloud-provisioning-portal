import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { getPendingTickets, approveTicket, rejectTicket, getUsers, updateUserRole, getAuditLogs, destroyEnvironment, getAllTickets, getPortalStats } from '../services/api'

const TAB_PENDING = 'pending'
const TAB_ACTIVE = 'active'
const TAB_USERS = 'users'
const TAB_AUDIT = 'audit'
const TAB_STATS = 'stats'

export default function Admin() {
  const [tab, setTab] = useState(TAB_PENDING)
  const [pending, setPending] = useState([])
  const [activeTickets, setActiveTickets] = useState([])
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectReason, setRejectReason] = useState({})
  const [showReject, setShowReject] = useState(null)
  const [confirmDestroy, setConfirmDestroy] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [pendingRes, usersRes, auditRes, activeRes, statsRes] = await Promise.all([
        getPendingTickets(),
        getUsers(),
        getAuditLogs({ limit: 20 }),
        getAllTickets({ status: 'active' }),
        getPortalStats()
      ])
      setPending(pendingRes.data)
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

  const handleApprove = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      await approveTicket(id)
      setMessage(`${ticketNumber} approved — provisioning started`)
      fetchAll()
      setTimeout(() => setMessage(''), 4000)
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
      setMessage(`${ticketNumber} rejected`)
      setShowReject(null)
      fetchAll()
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDestroy = async (id, ticketNumber) => {
    setActionLoading(id)
    setError('')
    try {
      await destroyEnvironment(id)
      setMessage(`${ticketNumber} destroy initiated — environment will be removed shortly`)
      setConfirmDestroy(null)
      fetchAll()
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to destroy')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    setError('')
    try {
      await updateUserRole(userId, newRole)
      setMessage('Role updated successfully')
      fetchAll()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update role')
    }
  }

  const tabs = [
    { id: TAB_PENDING, label: `Pending (${pending.length})` },
    { id: TAB_ACTIVE, label: `Active (${activeTickets.length})` },
    { id: TAB_USERS, label: `Users (${users.length})` },
    { id: TAB_AUDIT, label: 'Audit Log' },
    { id: TAB_STATS, label: 'Cost & Stats' },
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
          <p className="text-gray-500 text-sm mt-1">Manage approvals, users, and audit logs</p>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-8">
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

        {/* Pending Approvals */}
        {tab === TAB_PENDING && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Pending Approvals</h2>
            </div>
            {pending.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No pending approvals.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pending.map(ticket => (
                  <div key={ticket.id} className="px-6 py-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono text-xs text-gray-500">{ticket.ticket_number}</span>
                          <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full">Pending</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">{ticket.title}</p>
                        <p className="text-gray-500 text-sm mt-1">{ticket.justification}</p>
                        <div className="flex gap-4 mt-3 text-xs text-gray-400">
                          <span>Duration: {ticket.duration_days} days</span>
                          <span>Cost: ${ticket.estimated_cost_usd}</span>
			  <span>Requested by: {ticket.requester_name || ticket.requester_email || `User ${ticket.user_id}`}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-6">
                        <button
                          onClick={() => handleApprove(ticket.id, ticket.ticket_number)}
                          disabled={actionLoading === ticket.id}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          {actionLoading === ticket.id ? 'Processing...' : '✓ Approve'}
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
                          type="text"
                          placeholder="Rejection reason..."
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Environments */}
        {tab === TAB_ACTIVE && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Active Environments</h2>
            </div>
            {activeTickets.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No active environments.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Ticket', 'Title', 'User', 'URL', 'Instance', 'Expires', 'Action'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeTickets.map(ticket => {
                    const expiresAt = new Date(ticket.created_at)
                    expiresAt.setDate(expiresAt.getDate() + ticket.duration_days)
                    return (
                      <tr key={ticket.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-xs font-mono text-gray-600">{ticket.ticket_number}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{ticket.title}</td>
			<td className="px-6 py-4 text-xs text-gray-500">
                          <p className="font-medium text-gray-700">{ticket.requester_name || '—'}</p>
                          <p className="text-gray-400">{ticket.requester_email || ''}</p>
                        </td>
                        <td className="px-6 py-4">
                          {ticket.environment_url ? (
                            <a href={ticket.environment_url} target="_blank" rel="noreferrer"
                              className="text-blue-600 text-xs hover:underline">{ticket.environment_url}</a>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-400">{ticket.instance_id || '—'}</td>
                        <td className="px-6 py-4 text-xs text-gray-400">{expiresAt.toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          {confirmDestroy === ticket.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setConfirmDestroy(null)}
                                className="text-xs text-gray-500 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDestroy(ticket.id, ticket.ticket_number)}
                                disabled={actionLoading === ticket.id}
                                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                              >
                                {actionLoading === ticket.id ? 'Destroying...' : 'Confirm'}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDestroy(ticket.id)}
                              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium"
                            >
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

        {/* Users Tab */}
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
                        onChange={e => handleRoleChange(user.id, e.target.value)}
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

        {/* Audit Log Tab */}
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


        {/* Stats Tab */}
        {tab === TAB_STATS && (
          <div className="space-y-6">
            {/* Overview cards */}
            {stats && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Requests', value: stats.overview.total_tickets, color: 'text-gray-900' },
                    { label: 'Active Environments', value: stats.overview.active, color: 'text-green-600' },
                    { label: 'Total Cost (all time)', value: `$${stats.overview.total_cost_usd.toFixed(2)}`, color: 'text-blue-600' },
                    { label: 'Active Cost', value: `$${stats.overview.active_cost_usd.toFixed(2)}`, color: 'text-purple-600' },
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

                {/* Per user breakdown */}
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
