import { useState, useEffect, useRef} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { getTicket, extendEnvironment } from '../services/api'

const STATUS_COLORS = {
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  provisioning: 'bg-purple-100 text-purple-800',
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  expired: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
}

const STATUS_LABELS = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  provisioning: 'Provisioning...',
  active: 'Active',
  expiring: 'Expiring...',
  expired: 'Expired',
  rejected: 'Rejected',
}

const TEMPLATE_NAMES = { 1: 'Web Application', 2: 'Database Server', 3: 'Serverless API' }
const TEMPLATE_ICONS = { 1: 'Web', 2: 'DB', 3: 'Fn' }

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [extending, setExtending] = useState(false)
  const [extendDays, setExtendDays] = useState(7)
  const [showExtend, setShowExtend] = useState(false)
  const [success, setSuccess] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    const load = () => {
      getTicket(id)
        .then(res => setTicket(res.data))
        .catch(() => setError('Ticket not found'))
        .finally(() => setLoading(false))
    }
    load()
    return () => clearInterval(pollRef.current)
  }, [id])

  useEffect(() => {
    if (!ticket) return
    const isTransient = ['provisioning', 'approved', 'expiring'].includes(ticket.status)
    if (isTransient) {
      pollRef.current = setInterval(() => {
        getTicket(id)
          .then(res => setTicket(res.data))
          .catch(() => {})
      }, 10000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [ticket?.status, id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <p className="text-gray-400">{error || 'Ticket not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-blue-600 text-sm hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }
  
  const handleExtend = async () => {
    setExtending(true)
    try {
      const res = await extendEnvironment(id, extendDays)
      setSuccess(res.data.message)
      setShowExtend(false)
      getTicket(id).then(r => setTicket(r.data))
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to extend environment')
    } finally {
      setExtending(false)
    }
  }

  const expiresAt = new Date(ticket.created_at)
  expiresAt.setDate(expiresAt.getDate() + ticket.duration_days)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-8">

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          Back to Dashboard
        </button>
	{success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">{success}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>}

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-xs font-bold">
                {TEMPLATE_ICONS[ticket.template_id] || 'CL'}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
                <p className="text-sm text-gray-500 font-mono mt-1">{ticket.ticket_number}</p>
              </div>
            </div>
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
        </div>

        {/* Your original style - modified to show the Deep Link and ID */}
        {ticket.status === 'active' && ticket.environment_url && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-800">Environment is Live</p>
                <p className="text-green-600 text-xs mt-1 font-mono">{ticket.instance_id}</p>
                <p className="text-green-500 text-[10px] mt-0.5 truncate max-w-md">{ticket.environment_url}</p>
              </div>

              <a href={ticket.environment_url} target="_blank" rel="noreferrer" className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                Open Console
              </a>
            </div>
          </div>
        )}
        
	{ticket.status === 'active' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Extend Environment</p>
                <p className="text-xs text-gray-400 mt-0.5">Add more days to keep this environment alive</p>
               </div>
               <button
                 onClick={() => setShowExtend(!showExtend)}
                 className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold px-4 py-2 rounded-lg transition-colors"
               >
                 {showExtend ? 'Cancel' : '+ Extend'}
               </button>
             </div>
             {showExtend && (
               <div className="mt-4 flex items-center gap-3">
                 <input
                   type="number"
                   min="1"
                   max="30"
                   value={extendDays}
                   onChange={e => setExtendDays(parseInt(e.target.value))}
                   className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">additional days</span>
                <button
                  onClick={handleExtend}
                  disabled={extending}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {extending ? 'Extending...' : 'Confirm Extension'}
                </button>
              </div>
            )}
         </div>
       )}

        {ticket.status === 'provisioning' && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
            <div>
              <p className="text-sm font-semibold text-purple-800">Provisioning in progress...</p>
              <p className="text-xs text-purple-600 mt-0.5">Your environment is being set up on AWS. This takes about 30 seconds.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Request Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Environment Type</p>
                <p className="text-sm font-medium text-gray-900">{TEMPLATE_NAMES[ticket.template_id] || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-sm font-medium text-gray-900">{ticket.duration_days} days</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Estimated Cost</p>
                <p className="text-sm font-medium text-gray-900">${ticket.estimated_cost_usd}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Requested</p>
                <p className="text-sm font-medium text-gray-900">{new Date(ticket.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Expires</p>
                <p className="text-sm font-medium text-gray-900">{expiresAt.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Infrastructure</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Instance ID</p>
                <p className="text-sm font-mono text-gray-900">{ticket.instance_id || 'Not provisioned yet'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Console Link</p>
                <p className="text-[10px] text-blue-600 break-all">{ticket.environment_url || 'Not provisioned yet'}</p>
              </div>
              {ticket.provisioning_output && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Provisioning Output</p>
                  <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-32 text-gray-600">
                    {JSON.stringify(ticket.provisioning_output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Justification</h2>
          <p className="text-sm text-gray-600">{ticket.justification}</p>
        </div>

      </div>
    </div>
  )
}
