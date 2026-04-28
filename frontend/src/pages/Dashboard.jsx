import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import {
  getMyTickets, getTemplates, createTicket, estimateCost,
  getQuota, getConsoleLink, autoCheckTicket, cancelTicket, createCustomRequest
} from '../services/api'

const STATUS_COLORS = {
  pending_approval:    'bg-yellow-100 text-yellow-800',
  approved:            'bg-blue-100 text-blue-800',
  provisioning:        'bg-purple-100 text-purple-800',
  active:              'bg-green-100 text-green-800',
  expiring:            'bg-orange-100 text-orange-800',
  expired:             'bg-gray-100 text-gray-800',
  rejected:            'bg-red-100 text-red-800',
  cancelled:           'bg-gray-100 text-gray-500',
  pending_manual_setup:'bg-amber-100 text-amber-800',
  in_progress:         'bg-cyan-100 text-cyan-800',
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

// Icons and tier metadata per template_type
const TEMPLATE_META = {
  web_app:             { icon: '🖥️',  label: 'EC2 Web App',        tier: 1, tierColor: 'bg-green-100 text-green-700' },
  database:            { icon: '🗄️',  label: 'RDS Database',       tier: 1, tierColor: 'bg-green-100 text-green-700' },
  serverless:          { icon: '⚡',  label: 'Lambda Serverless',   tier: 1, tierColor: 'bg-green-100 text-green-700' },
  s3_static_site:      { icon: '🌐',  label: 'S3 Static Site',      tier: 1, tierColor: 'bg-green-100 text-green-700' },
  s3_storage:          { icon: '🪣',  label: 'S3 Storage',          tier: 1, tierColor: 'bg-green-100 text-green-700' },
  sns_topic:           { icon: '📣',  label: 'SNS Topic',           tier: 1, tierColor: 'bg-green-100 text-green-700' },
  dynamodb:            { icon: '⚡',  label: 'DynamoDB Table',      tier: 1, tierColor: 'bg-green-100 text-green-700' },
  ecr_repository:      { icon: '📦',  label: 'ECR Repository',      tier: 1, tierColor: 'bg-green-100 text-green-700' },
  ecs_container:       { icon: '🐳',  label: 'ECS Fargate',         tier: 1, tierColor: 'bg-green-100 text-green-700' },
  elasticache_redis:   { icon: '🔴',  label: 'ElastiCache Redis',   tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  cloudfront_cdn:      { icon: '🌍',  label: 'CloudFront CDN',      tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  rds_read_replica:    { icon: '🗄️',  label: 'RDS Read Replica',   tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  secrets_manager:     { icon: '🔐',  label: 'Secrets Manager',     tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  waf_rules:           { icon: '🛡️',  label: 'WAF Rules',           tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  kinesis_stream:      { icon: '🌊',  label: 'Kinesis Stream',      tier: 2, tierColor: 'bg-amber-100 text-amber-700' },
  eks_cluster:         { icon: '☸️',  label: 'EKS Cluster',         tier: 3, tierColor: 'bg-red-100 text-red-700' },
  codepipeline:        { icon: '🔄',  label: 'CodePipeline / CI-CD', tier: 3, tierColor: 'bg-red-100 text-red-700' },
  opensearch:          { icon: '🔍',  label: 'OpenSearch',          tier: 3, tierColor: 'bg-red-100 text-red-700' },
  redshift:            { icon: '🏢',  label: 'Redshift',            tier: 3, tierColor: 'bg-red-100 text-red-700' },
  custom_request:      { icon: '✨',  label: 'Custom Request',      tier: null, tierColor: 'bg-gray-100 text-gray-600' },
}

const TIER_LABELS = { 1: 'Instant', 2: '1–2 day SLA', 3: '3–5 day SLA' }

function getTemplateMeta(templateType) {
  return TEMPLATE_META[templateType] || { icon: '☁️', label: templateType || 'AWS Service', tier: null, tierColor: 'bg-gray-100 text-gray-600' }
}

// Custom resource request form
function CustomRequestForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    resource_type_name: '',
    cloud_provider: 'AWS',
    preferred_region: 'ap-south-1',
    estimated_duration_days: 14,
    estimated_usage: '',
    business_justification: '',
    urgency: 'Medium',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const AWS_REGIONS = [
    'ap-south-1','us-east-1','us-east-2','us-west-1','us-west-2',
    'eu-west-1','eu-west-2','eu-central-1','ap-southeast-1','ap-southeast-2',
    'ap-northeast-1','ca-central-1','sa-east-1',
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await createCustomRequest({ ...form, estimated_duration_days: parseInt(form.estimated_duration_days) })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">✨</span>
        <div>
          <p className="text-sm font-bold text-gray-900">Custom Resource Request</p>
          <p className="text-xs text-gray-500">Request any AWS/cloud resource not in the standard templates. An admin will review and provision manually.</p>
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Resource Type Name *</label>
            <input
              type="text"
              value={form.resource_type_name}
              onChange={e => setForm({ ...form, resource_type_name: e.target.value })}
              required
              placeholder="e.g. ElasticSearch Cluster"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Cloud Provider</label>
            <select
              value={form.cloud_provider}
              onChange={e => setForm({ ...form, cloud_provider: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
            >
              {['AWS', 'GCP', 'Azure', 'Other'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Preferred Region</label>
            <select
              value={form.preferred_region}
              onChange={e => setForm({ ...form, preferred_region: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
            >
              {AWS_REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Duration (Days)</label>
            <input
              type="number" min="1" max="365"
              value={form.estimated_duration_days}
              onChange={e => setForm({ ...form, estimated_duration_days: e.target.value })}
              required
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Urgency</label>
            <select
              value={form.urgency}
              onChange={e => setForm({ ...form, urgency: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
            >
              {['Low', 'Medium', 'High'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Estimated Usage *</label>
          <input
            type="text"
            value={form.estimated_usage}
            onChange={e => setForm({ ...form, estimated_usage: e.target.value })}
            required
            placeholder="e.g. 50GB storage, ~1000 req/day"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Business Justification *</label>
          <textarea
            value={form.business_justification}
            onChange={e => setForm({ ...form, business_justification: e.target.value })}
            required rows={3}
            placeholder="Why is this resource needed?"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 text-sm">
            {submitting ? 'Submitting Request...' : 'Submit Custom Request'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
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

  useEffect(() => {
    const hasTransient = tickets.some(t =>
      ['provisioning', 'approved', 'expiring'].includes(t.status)
    )
    if (hasTransient) {
      pollRef.current = setInterval(fetchData, 10000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [tickets])

  useEffect(() => {
    if (form.template_id && form.template_id !== 'custom' && form.duration_days) {
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

  // Split templates by tier/type for the selector
  const tier1Templates = templates.filter(t => t.tier === 1 && t.template_type !== 'custom_request')
  const tier2Templates = templates.filter(t => t.tier === 2 && t.template_type !== 'custom_request')
  const tier3Templates = templates.filter(t => t.tier === 3 && t.template_type !== 'custom_request')

  const selectedTemplate = templates.find(t => t.id === parseInt(form.template_id))
  const selectedIsManual = selectedTemplate?.is_manual

  const handleTemplateSelect = (templateId) => {
    const tpl = templates.find(t => t.id === parseInt(templateId))
    if (tpl?.template_type === 'custom_request') {
      setIsCustom(true)
      setForm({ template_id: '', title: '', justification: '', duration_days: 7 })
    } else {
      setIsCustom(false)
      setForm({ ...form, template_id: templateId })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isCustom) return
    setSubmitting(true)
    setError('')
    try {
      const res = await createTicket({
        template_id: parseInt(form.template_id),
        title: form.title,
        justification: form.justification,
        duration_days: parseInt(form.duration_days)
      })
      const newTicket = res.data
      // Only auto-check for Tier 1 auto-provision; manual tickets skip it
      if (!selectedIsManual) {
        await autoCheckTicket(newTicket.id)
      }
      setSuccess('Environment request submitted!')
      setShowForm(false)
      setIsCustom(false)
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

  const handleCustomSuccess = () => {
    setSuccess('Custom request submitted! Admin will review shortly.')
    setShowForm(false)
    setIsCustom(false)
    fetchData()
    setTimeout(() => setSuccess(''), 5000)
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
    pending: tickets.filter(t => ['pending_approval', 'pending_manual_setup', 'in_progress'].includes(t.status)).length,
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
            onClick={() => { setShowForm(!showForm); setIsCustom(false) }}
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
          <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-lg">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Provision New Resource</h2>

            {isCustom ? (
              <CustomRequestForm
                onSuccess={handleCustomSuccess}
                onCancel={() => { setIsCustom(false); setShowForm(false) }}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Service Template</label>
                  <select
                    value={form.template_id}
                    onChange={e => handleTemplateSelect(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                  >
                    <option value="">Select template...</option>
                    {tier1Templates.length > 0 && (
                      <optgroup label="⚡ Tier 1 — Instant Auto-Provisioned">
                        {tier1Templates.map(t => {
                          const meta = getTemplateMeta(t.template_type)
                          return (
                            <option key={t.id} value={t.id}>
                              {meta.icon} {t.name}{t.base_cost_usd > 0 ? ` (~$${t.base_cost_usd}/mo)` : ' (Free Tier)'}
                            </option>
                          )
                        })}
                      </optgroup>
                    )}
                    {tier2Templates.length > 0 && (
                      <optgroup label="🔧 Tier 2 — Managed Request (1–2 day SLA)">
                        {tier2Templates.map(t => {
                          const meta = getTemplateMeta(t.template_type)
                          return (
                            <option key={t.id} value={t.id}>
                              {meta.icon} {t.name}{t.base_cost_usd > 0 ? ` (~$${t.base_cost_usd}/mo)` : ''}
                            </option>
                          )
                        })}
                      </optgroup>
                    )}
                    {tier3Templates.length > 0 && (
                      <optgroup label="🏗️ Tier 3 — Enterprise (3–5 day SLA)">
                        {tier3Templates.map(t => {
                          const meta = getTemplateMeta(t.template_type)
                          return (
                            <option key={t.id} value={t.id}>
                              {meta.icon} {t.name}{t.base_cost_usd > 0 ? ` (~$${t.base_cost_usd}/mo)` : ''}
                            </option>
                          )
                        })}
                      </optgroup>
                    )}
                    <optgroup label="─────────────────────">
                      <option value="custom">✨ Others — Custom Resource Request</option>
                    </optgroup>
                  </select>
                </div>

                {/* Manual template SLA notice */}
                {selectedIsManual && selectedTemplate && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-lg">⏳</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Manual Setup Required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        This resource requires admin configuration.
                        Usually ready in <strong>{selectedTemplate.resources?.sla_days || 2} business day(s)</strong>.
                        You'll receive an email when it's live.
                      </p>
                    </div>
                  </div>
                )}

                {/* ECS cost warning */}
                {selectedTemplate?.template_type === 'ecs_container' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-lg">⚠️</span>
                    <p className="text-sm text-orange-800">
                      <strong>Not free tier eligible.</strong> ECS Fargate costs approximately <strong>~$9/month</strong>. Make sure this is approved within your budget.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
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
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">TTL (Days)</label>
                    <input
                      type="number" min="1" max="30"
                      value={form.duration_days}
                      onChange={e => setForm({ ...form, duration_days: e.target.value })}
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Business Justification</label>
                  <textarea
                    value={form.justification}
                    onChange={e => setForm({ ...form, justification: e.target.value })}
                    required rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none resize-none"
                  />
                </div>

                {estimate && !selectedIsManual && (
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
                  <button type="submit" disabled={submitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                    {submitting ? 'Initializing...' : 'Confirm Deployment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Requests Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Active Deployments</h2>
            <button onClick={fetchData} className="text-[10px] font-bold text-blue-600 hover:underline uppercase">Refresh Registry</button>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No environments yet. Create your first one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50">
                    {['Ticket ID', 'Resource Name', 'Type', 'Status', 'Action', 'Expires'].map(h => (
                      <th key={h} className="text-left px-8 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tickets.map(ticket => {
                    const templateType = ticket.template?.template_type || ticket.template_type
                    const meta = getTemplateMeta(templateType)
                    return (
                      <tr key={ticket.id} className="hover:bg-blue-50/20 transition-colors group">
                        <td className="px-8 py-5 text-xs font-mono font-bold text-blue-600 cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                          {ticket.ticket_number}
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-gray-900">{ticket.title}</p>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{meta.icon}</span>
                            <div>
                              <p className="text-[11px] font-semibold text-gray-700">{meta.label}</p>
                              {meta.tier && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${meta.tierColor}`}>
                                  {TIER_LABELS[meta.tier]}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md tracking-tighter inline-flex items-center gap-1.5 ${STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
                            {ticket.status === 'provisioning' && <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping"></span>}
                            {ticket.status === 'expiring' && <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping"></span>}
                            {ticket.status === 'pending_manual_setup' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>}
                            {ticket.status === 'in_progress' && <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></span>}
                            {STATUS_LABELS[ticket.status] || ticket.status}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          {ticket.status === 'active' ? (
                            <button
                              onClick={() => handleOpenConsole(ticket.id)}
                              className="inline-flex items-center gap-2 bg-[#FF9900] hover:bg-[#ec8d00] text-white text-[10px] font-black px-4 py-2 rounded-lg shadow-sm transition-all active:scale-95"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 19h20L12 2zm0 3l7.43 13H4.57L12 5z"/></svg>
                              LAUNCH CONSOLE
                            </button>
                          ) : ticket.status === 'pending_approval' ? (
                            <button
                              onClick={() => handleCancel(ticket.id, ticket.ticket_number)}
                              className="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black px-4 py-2 rounded-lg transition-all active:scale-95"
                            >
                              CANCEL REQUEST
                            </button>
                          ) : ticket.status === 'pending_manual_setup' || ticket.status === 'in_progress' ? (
                            <div className="flex items-center gap-2 text-amber-600">
                              <span className="text-[10px] font-bold uppercase tracking-widest">Admin Setup Pending</span>
                            </div>
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
