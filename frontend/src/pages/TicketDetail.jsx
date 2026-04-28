import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { getTicket, extendEnvironment } from '../services/api'

const STATUS_COLORS = {
  pending_approval:     'bg-yellow-100 text-yellow-800',
  approved:             'bg-blue-100 text-blue-800',
  provisioning:         'bg-purple-100 text-purple-800',
  active:               'bg-green-100 text-green-800',
  expiring:             'bg-orange-100 text-orange-800',
  expired:              'bg-gray-100 text-gray-800',
  rejected:             'bg-red-100 text-red-800',
  cancelled:            'bg-gray-100 text-gray-500',
  pending_manual_setup: 'bg-amber-100 text-amber-800',
  in_progress:          'bg-cyan-100 text-cyan-800',
}

const STATUS_LABELS = {
  pending_approval:     'Pending Approval',
  approved:             'Approved',
  provisioning:         'Provisioning...',
  active:               'Active',
  expiring:             'Expiring...',
  expired:              'Expired',
  rejected:             'Rejected',
  cancelled:            'Cancelled',
  pending_manual_setup: 'Awaiting Admin Setup',
  in_progress:          'Admin Working On It',
}

const TEMPLATE_META = {
  web_app:           { icon: '🖥️',  label: 'EC2 Web Application' },
  database:          { icon: '🗄️',  label: 'RDS PostgreSQL' },
  serverless:        { icon: '⚡',  label: 'Lambda Serverless' },
  s3_static_site:    { icon: '🌐',  label: 'S3 Static Site' },
  s3_storage:        { icon: '🪣',  label: 'S3 Storage Bucket' },
  sns_topic:         { icon: '📣',  label: 'SNS Topic' },
  dynamodb:          { icon: '⚡',  label: 'DynamoDB Table' },
  ecr_repository:    { icon: '📦',  label: 'ECR Repository' },
  ecs_container:     { icon: '🐳',  label: 'ECS Fargate Container' },
  elasticache_redis: { icon: '🔴',  label: 'ElastiCache Redis' },
  cloudfront_cdn:    { icon: '🌍',  label: 'CloudFront CDN' },
  rds_read_replica:  { icon: '🗄️',  label: 'RDS Read Replica' },
  secrets_manager:   { icon: '🔐',  label: 'AWS Secrets Manager' },
  waf_rules:         { icon: '🛡️',  label: 'WAF v2 Rules' },
  kinesis_stream:    { icon: '🌊',  label: 'Kinesis Data Stream' },
  eks_cluster:       { icon: '☸️',  label: 'EKS Cluster' },
  codepipeline:      { icon: '🔄',  label: 'CodePipeline / CI-CD' },
  opensearch:        { icon: '🔍',  label: 'OpenSearch' },
  redshift:          { icon: '🏢',  label: 'Redshift' },
  custom_request:    { icon: '✨',  label: 'Custom Resource Request' },
}

function InfoRow({ label, value, mono, link, copyable }) {
  const [copied, setCopied] = useState(false)
  if (!value) return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-300 italic">Not available</p>
    </div>
  )
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        {link ? (
          <a href={value} target="_blank" rel="noreferrer"
            className="text-sm text-blue-600 hover:underline break-all font-medium">{value}</a>
        ) : (
          <p className={`text-sm text-gray-900 break-all ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
        )}
        {copyable && (
          <button onClick={handleCopy}
            className="shrink-0 text-[10px] text-gray-400 hover:text-blue-600 border border-gray-200 px-1.5 py-0.5 rounded transition-colors">
            {copied ? '✓' : 'copy'}
          </button>
        )}
      </div>
    </div>
  )
}

// Per-template resource info panel shown when ticket is active
function ResourcePanel({ ticket }) {
  const out = ticket.provisioning_output || {}
  const type = ticket.template_type || ticket.template?.template_type

  const v = (key) => {
    const val = out[key]
    if (val && typeof val === 'object' && 'value' in val) return val.value
    return val
  }

  const panels = {
    web_app: () => (
      <>
        <InfoRow label="Instance ID" value={ticket.instance_id} mono copyable />
        <InfoRow label="Public URL" value={ticket.environment_url} link />
        <InfoRow label="Public IP" value={v('web_app_public_ip')} mono />
      </>
    ),
    database: () => (
      <>
        <InfoRow label="DB Instance ID" value={ticket.instance_id} mono copyable />
        <InfoRow label="Endpoint" value={ticket.environment_url} mono copyable />
        <p className="text-xs text-gray-400 mt-1">Connect via psql or your preferred client. Password was auto-generated — check the email confirmation.</p>
      </>
    ),
    serverless: () => (
      <>
        <InfoRow label="Function Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="API Endpoint" value={ticket.environment_url} link />
      </>
    ),
    s3_static_site: () => (
      <>
        <InfoRow label="Bucket Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Website URL" value={ticket.environment_url} link />
        <p className="text-xs text-amber-700 mt-2 bg-amber-50 rounded-lg px-3 py-2">
          📋 Upload your files to the bucket. The <code>index.html</code> placeholder was auto-created.
        </p>
      </>
    ),
    s3_storage: () => (
      <>
        <InfoRow label="Bucket Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Bucket ARN" value={ticket.environment_url} mono copyable />
        <p className="text-xs text-gray-500 mt-2">Private bucket with versioning enabled. All public access is blocked.</p>
      </>
    ),
    sns_topic: () => (
      <>
        <InfoRow label="Topic Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Topic ARN" value={ticket.environment_url} mono copyable />
      </>
    ),
    dynamodb: () => (
      <>
        <InfoRow label="Table Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Table ARN" value={ticket.environment_url} mono copyable />
        <p className="text-xs text-gray-500 mt-2">On-demand billing. String hash key provisioned. Free tier: 25GB storage.</p>
      </>
    ),
    ecr_repository: () => (
      <>
        <InfoRow label="Repository Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Repository URL" value={ticket.environment_url} mono copyable />
        {ticket.environment_url && (
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-1">Docker Push Command</p>
            <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto text-gray-700 select-all">
              {`docker tag <image> ${ticket.environment_url}:latest\ndocker push ${ticket.environment_url}:latest`}
            </pre>
          </div>
        )}
      </>
    ),
    ecs_container: () => (
      <>
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-orange-700 font-medium">⚠️ Not free tier — ~$9/month while running</p>
        </div>
        <InfoRow label="Cluster Name" value={ticket.instance_id} mono copyable />
        <InfoRow label="Service URL" value={ticket.environment_url} link />
        {!ticket.environment_url && (
          <p className="text-xs text-gray-500 mt-2">Public IP is assigned at runtime. It may take a minute after provisioning for the task to start and the IP to appear.</p>
        )}
      </>
    ),
  }

  const renderFn = panels[type]
  if (renderFn) {
    return (
      <div className="space-y-3">
        {renderFn()}
      </div>
    )
  }

  // Generic fallback for auto types not explicitly mapped
  return (
    <div className="space-y-3">
      <InfoRow label="Resource ID" value={ticket.instance_id} mono copyable />
      <InfoRow label="Endpoint / URL" value={ticket.environment_url} link={ticket.environment_url?.startsWith('http')} mono />
    </div>
  )
}

// Panel shown for manual tickets (Tier 2 / Tier 3)
function ManualStatusPanel({ ticket }) {
  const status = ticket.status
  const out = ticket.provisioning_output || {}
  const resourceDetails = out.resource_details

  if (status === 'pending_manual_setup') {
    const sla = ticket.template?.resources?.sla_days || 2
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⏳</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Awaiting Admin Setup</p>
            <p className="text-xs text-amber-700 mt-1">
              Your request has been approved and is in the admin queue.
              Expected SLA: <strong>{sla} business day(s)</strong>.
              You'll receive an email when your resource is live with connection details.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'in_progress') {
    return (
      <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-600 mt-0.5 shrink-0"></div>
          <div>
            <p className="text-sm font-semibold text-cyan-800">Admin Is Working On It</p>
            <p className="text-xs text-cyan-700 mt-1">
              An admin has picked up your request and is actively provisioning the resource.
              You'll be notified by email when it's ready.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'active' && resourceDetails) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-green-800">✅ Resource is Live</p>
          {ticket.environment_url && (
            <a href={ticket.environment_url} target="_blank" rel="noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
              Open Resource
            </a>
          )}
        </div>
        <div className="space-y-2">
          {ticket.environment_url && (
            <InfoRow label="URL / Endpoint" value={ticket.environment_url} link />
          )}
          {ticket.instance_id && (
            <InfoRow label="Resource ID / ARN" value={ticket.instance_id} mono copyable />
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1">Connection Details (from Admin)</p>
            <pre className="text-[11px] bg-white border border-green-200 rounded-lg p-3 overflow-auto max-h-48 text-gray-700 whitespace-pre-wrap">
              {resourceDetails}
            </pre>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// Panel for custom resource requests
function CustomRequestPanel({ ticket }) {
  const resources = ticket.requested_resources || {}
  if (ticket.template_type !== 'custom_request' && ticket.template?.template_type !== 'custom_request') return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
      <p className="text-sm font-semibold text-blue-800 mb-3">✨ Custom Resource Request Details</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Resource Type', resources.resource_type_name],
          ['Cloud Provider', resources.cloud_provider],
          ['Preferred Region', resources.preferred_region],
          ['Urgency', resources.urgency],
          ['Estimated Usage', resources.estimated_usage],
        ].map(([label, value]) => value && (
          <div key={label}>
            <p className="text-[10px] text-blue-600 uppercase font-bold">{label}</p>
            <p className="text-sm text-blue-900 font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

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
    const isTransient = ['provisioning', 'approved', 'expiring', 'pending_manual_setup', 'in_progress'].includes(ticket.status)
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

  const templateType = ticket.template_type || ticket.template?.template_type
  const meta = TEMPLATE_META[templateType] || { icon: '☁️', label: templateType || 'AWS Service' }
  const isManual = ticket.template?.is_manual || ['pending_manual_setup', 'in_progress'].includes(ticket.status)
  const isCustom = templateType === 'custom_request'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-8">

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          ← Back to Dashboard
        </button>

        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">{success}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>}

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl">
                {meta.icon}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
                <p className="text-sm text-gray-500 font-mono mt-0.5">{ticket.ticket_number}</p>
                <p className="text-xs text-gray-400 mt-0.5">{meta.label}</p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[ticket.status] || ticket.status}
            </span>
          </div>
        </div>

        {/* Custom request details */}
        {isCustom && <CustomRequestPanel ticket={ticket} />}

        {/* Manual setup status banners */}
        {isManual && (ticket.status === 'pending_manual_setup' || ticket.status === 'in_progress') && (
          <ManualStatusPanel ticket={ticket} />
        )}

        {/* Manual ticket resource details (when active) */}
        {isManual && ticket.status === 'active' && <ManualStatusPanel ticket={ticket} />}

        {/* Auto-provisioned active environment */}
        {!isManual && ticket.status === 'active' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <p className="text-sm font-semibold text-green-800 mb-4">✅ Environment is Live</p>
            <ResourcePanel ticket={ticket} />
          </div>
        )}

        {/* Provisioning spinner */}
        {ticket.status === 'provisioning' && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600 shrink-0"></div>
            <div>
              <p className="text-sm font-semibold text-purple-800">Provisioning in progress...</p>
              <p className="text-xs text-purple-600 mt-0.5">Your environment is being set up on AWS. This takes about 30–60 seconds. Page auto-refreshes.</p>
            </div>
          </div>
        )}

        {/* Extend panel */}
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
                  type="number" min="1" max="30"
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

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Request Details</h2>
            <div className="space-y-3">
              <InfoRow label="Environment Type" value={meta.label} />
              <InfoRow label="Duration" value={`${ticket.duration_days} days`} />
              <InfoRow label="Estimated Cost" value={`$${ticket.estimated_cost_usd}`} />
              <InfoRow label="Requested" value={new Date(ticket.created_at).toLocaleString()} />
              <InfoRow label="Expires" value={expiresAt.toLocaleString()} />
              {ticket.requester_name && <InfoRow label="Requested By" value={ticket.requester_name} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Infrastructure</h2>
            <div className="space-y-3">
              {!isManual && ticket.status === 'active' ? (
                <ResourcePanel ticket={ticket} />
              ) : (
                <>
                  <InfoRow label="Resource ID" value={ticket.instance_id} mono />
                  <InfoRow label="Endpoint / URL" value={ticket.environment_url}
                    link={ticket.environment_url?.startsWith('http')} mono />
                </>
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
