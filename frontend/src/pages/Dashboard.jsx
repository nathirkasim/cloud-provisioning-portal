import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, {
  getMyTickets, getTemplates, createTicket, estimateCost,
  getQuota, getConsoleLink, autoCheckTicket, cancelTicket, createCustomRequest
} from '../services/api'

const STATUS_CONFIG = {
  pending_approval:     { label: 'Pending approval',     color: '#BA7517', bg: '#FAEEDA', dot: '#854F0B', pulse: false },
  approved:             { label: 'Approved',              color: '#185FA5', bg: '#D6E9FB', dot: '#185FA5', pulse: false },
  provisioning:         { label: 'Provisioning',          color: '#534AB7', bg: '#E5E3FD', dot: '#534AB7', pulse: true  },
  active:               { label: 'Active',                color: '#27500A', bg: '#D4EDB8', dot: '#3B6D11', pulse: false },
  expiring:             { label: 'Expiring soon',         color: '#791F1F', bg: '#FCEBEB', dot: '#A32D2D', pulse: true  },
  expired:              { label: 'Expired',               color: '#666',    bg: '#F0F0F0', dot: '#999',    pulse: false },
  rejected:             { label: 'Rejected',              color: '#791F1F', bg: '#FCEBEB', dot: '#A32D2D', pulse: false },
  cancelled:            { label: 'Cancelled',             color: '#888',    bg: '#F0F0F0', dot: '#AAA',    pulse: false },
  pending_manual_setup: { label: 'Awaiting admin setup',  color: '#633806', bg: '#FAEEDA', dot: '#854F0B', pulse: true  },
  in_progress:          { label: 'Admin working on it',   color: '#085041', bg: '#D2F0E7', dot: '#1D9E75', pulse: true  },
}

const BORDER_COLOR = {
  active:               '#3B6D11',
  expiring:             '#E24B4A',
  provisioning:         '#7F77DD',
  pending_approval:     '#BA7517',
  pending_manual_setup: '#BA7517',
  in_progress:          '#1D9E75',
  rejected:             '#E24B4A',
  expired:              '#CCC',
  cancelled:            '#CCC',
  approved:             '#378ADD',
}

const TEMPLATE_META = {
  web_app:             { icon: '🖥️', label: 'EC2 Web App',         tier: 1, cost: '~$0.01/hr', free: true  },
  database:            { icon: '🗄️', label: 'RDS PostgreSQL',       tier: 1, cost: '~$0.02/hr', free: false },
  serverless:          { icon: '⚡',  label: 'Lambda Serverless',    tier: 1, cost: 'free tier',  free: true  },
  s3_static_site:      { icon: '🌐', label: 'S3 Static Site',       tier: 1, cost: 'free tier',  free: true  },
  s3_storage:          { icon: '🪣', label: 'S3 Storage Bucket',    tier: 1, cost: 'free tier',  free: true  },
  sns_topic:           { icon: '📣', label: 'SNS Topic',            tier: 1, cost: 'free tier',  free: true  },
  dynamodb:            { icon: '⚡',  label: 'DynamoDB Table',       tier: 1, cost: 'free tier',  free: true  },
  ecr_repository:      { icon: '📦', label: 'ECR Repository',       tier: 1, cost: 'free tier',  free: true  },
  ecs_container:       { icon: '🐳', label: 'ECS Fargate',          tier: 1, cost: '~$9/mo',     free: false },
  elasticache_redis:   { icon: '🔴', label: 'ElastiCache Redis',    tier: 2, cost: '~$12/mo',    free: false },
  cloudfront_cdn:      { icon: '🌍', label: 'CloudFront CDN',       tier: 2, cost: '~$5/mo',     free: false },
  rds_read_replica:    { icon: '🗄️', label: 'RDS Read Replica',    tier: 2, cost: '~$15/mo',    free: false },
  secrets_manager:     { icon: '🔐', label: 'Secrets Manager',      tier: 2, cost: '~$0.40/mo',  free: false },
  waf_rules:           { icon: '🛡️', label: 'WAF Rules',            tier: 2, cost: '~$5/mo',     free: false },
  kinesis_stream:      { icon: '🌊', label: 'Kinesis Stream',       tier: 2, cost: '~$15/mo',    free: false },
  eks_cluster:         { icon: '☸️', label: 'EKS Cluster',          tier: 3, cost: '~$72/mo',    free: false },
  codepipeline:        { icon: '🔄', label: 'CodePipeline / CI-CD', tier: 3, cost: '~$1/mo',     free: false },
  opensearch:          { icon: '🔍', label: 'OpenSearch',           tier: 3, cost: '~$25/mo',    free: false },
  redshift:            { icon: '🏢', label: 'Redshift',             tier: 3, cost: '~$180/mo',   free: false },
  custom_request:      { icon: '✨', label: 'Custom Request',       tier: null, cost: 'varies',  free: false },
}

const TIER_INFO = {
  1: { label: 'Tier 1 — Instant',    desc: 'Auto-provisioned by Terraform. Usually live in under 60 seconds.', color: '#27500A', bg: '#D4EDB8' },
  2: { label: 'Tier 2 — Managed',    desc: '1–2 business day SLA. Admin-provisioned and configured for you.', color: '#633806', bg: '#FAEEDA' },
  3: { label: 'Tier 3 — Enterprise', desc: '3–5 business day SLA. Complex infra requiring architecture review.', color: '#791F1F', bg: '#FCEBEB' },
}

const AWS_REGIONS = [
  'ap-south-1','us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-central-1','ap-southeast-1','ap-southeast-2',
  'ap-northeast-1','ca-central-1','sa-east-1',
]

function getMeta(templateType) {
  return TEMPLATE_META[templateType] || { icon: '☁️', label: templateType || 'AWS Service', tier: null, cost: 'varies', free: false }
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#666', bg: '#eee', dot: '#999', pulse: false }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        animation: cfg.pulse ? 'cpulse 1.4s ease-in-out infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  )
}

function ExpiryBar({ ticket }) {
  if (ticket.status !== 'active' && ticket.status !== 'expiring') return null
  const created = new Date(ticket.created_at)
  const expires = new Date(created)
  expires.setDate(expires.getDate() + ticket.duration_days)
  const total = ticket.duration_days * 86400000
  const remaining = expires - Date.now()
  const daysLeft = Math.ceil(remaining / 86400000)
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const warn = daysLeft <= 3
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#999' }}>Expires</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: warn ? '#A32D2D' : '#666' }}>
          {daysLeft <= 0 ? 'Today' : `in ${daysLeft}d`}
        </span>
      </div>
      <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${pct}%`,
          background: warn ? '#E24B4A' : '#3B6D11', transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

function EnvironmentCard({ ticket, onConsole, onCancel, onClick }) {
  const templateType = ticket.template?.template_type || ticket.template_type
  const meta = getMeta(templateType)
  const borderColor = BORDER_COLOR[ticket.status] || '#DDD'
  const isActive = ticket.status === 'active'
  const isPending = ticket.status === 'pending_approval'
  const isManual = ticket.status === 'pending_manual_setup' || ticket.status === 'in_progress'
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={() => onClick(ticket.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff', borderRadius: 10, cursor: 'pointer',
        border: `0.5px solid ${hov ? '#C0C0C0' : '#E4E4E4'}`,
        borderLeft: `3px solid ${borderColor}`,
        padding: '14px 16px',
        boxShadow: hov ? '0 2px 12px rgba(0,0,0,0.07)' : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'start',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 8, background: '#F4F4F4',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#777' }}>{meta.label}</span>
          {meta.tier && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CCC', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#999' }}>Tier {meta.tier}</span>
            </>
          )}
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CCC', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#BBB', fontFamily: 'monospace' }}>{ticket.ticket_number}</span>
        </div>
        {ticket.environment_url && isActive && (
          <div style={{ fontSize: 10, color: '#378ADD', fontFamily: 'monospace', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.environment_url}
          </div>
        )}
        <ExpiryBar ticket={ticket} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <StatusPill status={ticket.status} />
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {isActive && (
            <button
              onClick={e => { e.stopPropagation(); onConsole(ticket.id) }}
              style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5, background: '#FF9900', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              AWS Console
            </button>
          )}
          {isPending && (
            <button
              onClick={e => { e.stopPropagation(); onCancel(ticket.id, ticket.ticket_number) }}
              style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 5, background: 'transparent', color: '#A32D2D', border: '0.5px solid #FBBCBC', cursor: 'pointer' }}
            >
              Cancel
            </button>
          )}
          {isManual && (
            <span style={{ fontSize: 10, color: '#854F0B', fontWeight: 500 }}>Admin working on it</span>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplatePicker({ templates, selected, onSelect }) {
  const [activeTier, setActiveTier] = useState(1)
  const tier1 = templates.filter(t => t.tier === 1 && t.template_type !== 'custom_request')
  const tier2 = templates.filter(t => t.tier === 2 && t.template_type !== 'custom_request')
  const tier3 = templates.filter(t => t.tier === 3 && t.template_type !== 'custom_request')
  const tierMap = { 1: tier1, 2: tier2, 3: tier3 }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '0.5px solid #EBEBEB' }}>
        {[1, 2, 3].map(t => (
          <button key={t} onClick={() => setActiveTier(t)} style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            color: activeTier === t ? '#111' : '#999', background: 'transparent', border: 'none',
            borderBottom: activeTier === t ? '2px solid #111' : '2px solid transparent', marginBottom: -0.5,
          }}>
            Tier {t}
            <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: TIER_INFO[t].bg, color: TIER_INFO[t].color }}>
              {['Instant', '1–2d', '3–5d'][t - 1]}
            </span>
          </button>
        ))}
        <button onClick={() => onSelect('custom')} style={{
          marginLeft: 'auto', padding: '8px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
          color: selected === 'custom' ? '#111' : '#999', background: 'transparent', border: 'none',
          borderBottom: selected === 'custom' ? '2px solid #111' : '2px solid transparent', marginBottom: -0.5,
        }}>
          ✨ Custom
        </button>
      </div>
      <div style={{ padding: '6px 10px', background: '#FAFAFA', borderBottom: '0.5px solid #EBEBEB', fontSize: 10, color: '#888' }}>
        {TIER_INFO[activeTier].desc}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, padding: '10px 10px 8px' }}>
        {(tierMap[activeTier] || []).map(t => {
          const meta = getMeta(t.template_type)
          const isSel = selected === String(t.id)
          return (
            <div key={t.id} onClick={() => onSelect(String(t.id))} style={{
              border: isSel ? '1.5px solid #185FA5' : '0.5px solid #E4E4E4',
              borderRadius: 7, padding: '9px 10px', cursor: 'pointer',
              background: isSel ? '#EDF4FC' : '#fff', position: 'relative',
              transition: 'border-color 0.12s, background 0.12s',
            }}>
              {isSel && (
                <div style={{ position: 'absolute', top: 6, right: 6, width: 13, height: 13, borderRadius: '50%', background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.2"><polyline points="2,5 4,8 8,2" /></svg>
                </div>
              )}
              <div style={{ fontSize: 17, marginBottom: 4 }}>{meta.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#111' }}>{meta.label}</div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{t.description || meta.cost}</div>
              <div style={{ marginTop: 5 }}>
                {meta.free
                  ? <span style={{ fontSize: 9, fontWeight: 600, background: '#D4EDB8', color: '#27500A', padding: '1px 5px', borderRadius: 3 }}>free tier</span>
                  : <span style={{ fontSize: 9, color: '#AAA' }}>{meta.cost}</span>
                }
              </div>
            </div>
          )
        })}
      </div>
      {selected && selected !== 'custom' && (() => {
        const t = templates.find(t => String(t.id) === selected)
        if (!t) return null
        const meta = getMeta(t.template_type)
        return (
          <div style={{ padding: '7px 10px', borderTop: '0.5px solid #EBEBEB', background: '#FAFAFA', fontSize: 11, color: '#666' }}>
            Selected: <strong style={{ color: '#111' }}>{meta.label}</strong> · {meta.cost}
            {t.is_manual && <span style={{ marginLeft: 6, fontSize: 10, color: '#854F0B', fontWeight: 500 }}>requires admin setup</span>}
          </div>
        )
      })()}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#999', letterSpacing: '0.05em', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

const inputSt = {
  width: '100%', fontSize: 12, padding: '7px 10px',
  border: '0.5px solid #DCDCDC', borderRadius: 6,
  background: '#FAFAFA', color: '#111', outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const btnPrimary = {
  flex: 1, fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
  background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer',
}

const btnGhost = {
  fontSize: 12, fontWeight: 500, padding: '7px 13px', borderRadius: 6,
  background: 'transparent', color: '#666', border: '0.5px solid #DCDCDC', cursor: 'pointer',
}

function CustomRequestForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    resource_type_name: '', cloud_provider: 'AWS', preferred_region: 'ap-south-1',
    estimated_duration_days: 14, estimated_usage: '', business_justification: '', urgency: 'Medium',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await createCustomRequest({ ...form, estimated_duration_days: parseInt(form.estimated_duration_days) })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>Custom Resource Request</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Request any AWS/cloud resource not in the standard templates. Admin will review and provision manually.</div>
        </div>
      </div>
      {error && <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', color: '#791F1F', padding: '7px 10px', borderRadius: 5, fontSize: 11 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Resource type name *"><input style={inputSt} required value={form.resource_type_name} onChange={e => set('resource_type_name', e.target.value)} placeholder="e.g. OpenSearch Cluster" /></Field>
        <Field label="Cloud provider"><select style={inputSt} value={form.cloud_provider} onChange={e => set('cloud_provider', e.target.value)}>{['AWS','GCP','Azure','Other'].map(p => <option key={p}>{p}</option>)}</select></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Region"><select style={inputSt} value={form.preferred_region} onChange={e => set('preferred_region', e.target.value)}>{AWS_REGIONS.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Duration (days)"><input style={inputSt} type="number" min="1" max="365" required value={form.estimated_duration_days} onChange={e => set('estimated_duration_days', e.target.value)} /></Field>
        <Field label="Urgency"><select style={inputSt} value={form.urgency} onChange={e => set('urgency', e.target.value)}>{['Low','Medium','High'].map(u => <option key={u}>{u}</option>)}</select></Field>
      </div>
      <Field label="Estimated usage *"><input style={inputSt} required value={form.estimated_usage} onChange={e => set('estimated_usage', e.target.value)} placeholder="e.g. 50GB storage, ~1000 req/day" /></Field>
      <Field label="Business justification *"><textarea style={{ ...inputSt, resize: 'none', height: 72 }} required value={form.business_justification} onChange={e => set('business_justification', e.target.value)} placeholder="Why is this resource needed?" /></Field>
      <div style={{ display: 'flex', gap: 7 }}>
        <button type="submit" disabled={submitting} style={{ ...btnPrimary, padding: '9px 14px' }}>{submitting ? 'Submitting…' : 'Submit custom request'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

export default function Dashboard() {
  const { user, logoutUser } = useAuth()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [templates, setTemplates] = useState([])
  const [quota, setQuota] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sidebarView, setSidebarView] = useState('environments')
  const [panelOpen, setPanelOpen] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [form, setForm] = useState({ title: '', justification: '', duration_days: 7 })
  const [estimate, setEstimate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const pollRef = useRef(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    finally { logoutUser(); navigate('/login') }
  }

  useEffect(() => { fetchData(); return () => clearInterval(pollRef.current) }, [])

  useEffect(() => {
    const hasTransient = tickets.some(t => ['provisioning','approved','expiring'].includes(t.status))
    clearInterval(pollRef.current)
    if (hasTransient) pollRef.current = setInterval(fetchData, 10000)
    return () => clearInterval(pollRef.current)
  }, [tickets])

  useEffect(() => {
    if (selectedTemplate && selectedTemplate !== 'custom') {
      const t = templates.find(t => t.id === parseInt(selectedTemplate))
      if (t && !t.is_manual) {
        estimateCost(parseInt(selectedTemplate), form.duration_days)
          .then(res => setEstimate(res.data)).catch(() => setEstimate(null))
      } else { setEstimate(null) }
    } else { setEstimate(null) }
  }, [selectedTemplate, form.duration_days])

  const fetchData = async () => {
    try {
      const [tr, tmr, qr] = await Promise.all([getMyTickets(), getTemplates(), getQuota()])
      setTickets(tr.data); setTemplates(tmr.data); setQuota(qr.data)
    } catch { showToast('Failed to load data', 'error') }
    finally { setLoading(false) }
  }

  const handleTemplateSelect = (val) => {
    if (val === 'custom') { setIsCustom(true); setSelectedTemplate('custom') }
    else { setIsCustom(false); setSelectedTemplate(val) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isCustom || !selectedTemplate) return
    setSubmitting(true)
    try {
      const tmpl = templates.find(t => t.id === parseInt(selectedTemplate))
      const res = await createTicket({ template_id: parseInt(selectedTemplate), title: form.title, justification: form.justification, duration_days: parseInt(form.duration_days) })
      if (!tmpl?.is_manual) await autoCheckTicket(res.data.id)
      showToast('Environment request submitted!')
      setPanelOpen(false); setSelectedTemplate(''); setForm({ title: '', justification: '', duration_days: 7 }); setEstimate(null)
      fetchData()
    } catch (err) { showToast(err.response?.data?.detail || 'Failed to submit', 'error') }
    finally { setSubmitting(false) }
  }

  const handleCustomSuccess = () => {
    showToast('Custom request submitted! Admin will review shortly.')
    setPanelOpen(false); setIsCustom(false); setSelectedTemplate(''); fetchData()
  }

  const handleOpenConsole = async (ticketId) => {
    try { const res = await getConsoleLink(ticketId); window.open(res.data.url, '_blank') }
    catch (err) { showToast(err.response?.data?.detail || 'IAM session required', 'error') }
  }

  const handleCancel = async (ticketId, ticketNumber) => {
    if (!window.confirm(`Cancel ticket ${ticketNumber}?`)) return
    try { await cancelTicket(ticketId); showToast(`${ticketNumber} cancelled`); fetchData() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to cancel', 'error') }
  }

  const activeCount    = tickets.filter(t => t.status === 'active').length
  const pendingCount   = tickets.filter(t => ['pending_approval','pending_manual_setup','in_progress'].includes(t.status)).length
  const quotaUsed      = quota?.active_environments ?? activeCount
  const quotaMax       = quota?.max_environments ?? 3
  const monthlyBurn    = quota?.monthly_cost_usd ?? 0
  const quotaPct       = Math.min(100, (quotaUsed / quotaMax) * 100)
  const selectedTmpl   = templates.find(t => t.id === parseInt(selectedTemplate))
  const selectedIsManual = selectedTmpl?.is_manual
  const hasPolling     = tickets.some(t => ['provisioning','approved','expiring'].includes(t.status))

  const filterMap = {
    all:     tickets,
    active:  tickets.filter(t => ['active','expiring'].includes(t.status)),
    pending: tickets.filter(t => ['pending_approval','pending_manual_setup','in_progress','provisioning'].includes(t.status)),
    done:    tickets.filter(t => ['expired','rejected','cancelled'].includes(t.status)),
  }
  const visible = filterMap[filter] || tickets

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 34, height: 34, border: '2.5px solid #E0E0E0', borderTop: '2.5px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
        <div style={{ fontSize: 12, color: '#888' }}>Loading your environments…</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F3F4F6', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes cpulse { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(5px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #185FA5 !important; box-shadow: 0 0 0 2px rgba(24,95,165,0.1); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #DDD; border-radius: 4px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 200, background: '#fff', borderRight: '0.5px solid #E8E8E8', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
        <div style={{ padding: '14px 12px 12px', borderBottom: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#185FA5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>Cloud Portal</div>
            <div style={{ fontSize: 10, color: '#AAA' }}>ap-south-1</div>
          </div>
        </div>
        <div style={{ padding: '10px 8px', flex: 1 }}>
          <div style={{ fontSize: 10, color: '#CCC', padding: '6px 8px 3px', letterSpacing: '0.07em', fontWeight: 600 }}>WORKSPACE</div>
          {[
            { icon: '▦', label: 'Environments', view: 'environments', badge: pendingCount || undefined },
            { icon: '⏱', label: 'Activity', view: 'activity' },
            { icon: '◎', label: 'Cost & Quota', view: 'quota' },
          ].map(item => (
            <div key={item.label} onClick={() => setSidebarView(item.view)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6,
              fontSize: 12, color: sidebarView === item.view ? '#185FA5' : '#777',
              background: sidebarView === item.view ? '#E6F1FB' : 'transparent', marginBottom: 1, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 8, background: '#FAEEDA', color: '#633806' }}>{item.badge}</span>}
            </div>
          ))}
          {['admin','approver'].includes(user?.role) && (
            <>
              <div style={{ fontSize: 10, color: '#CCC', padding: '10px 8px 3px', letterSpacing: '0.07em', fontWeight: 600 }}>ADMIN</div>
              <div onClick={() => navigate('/admin')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, fontSize: 12, color: '#777', cursor: 'pointer', marginBottom: 1 }}>
                <span style={{ fontSize: 13 }}>⚙</span> Admin panel
              </div>
            </>
          )}
        </div>
        <div style={{ padding: '10px 12px', borderTop: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            onClick={() => navigate('/profile')}
            title="Profile & Settings"
            style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F4F4'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D6E9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#185FA5', flexShrink: 0 }}>
              {(user?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || user?.email || 'User'}</div>
              <div style={{ fontSize: 10, color: '#AAA' }}>{user?.role || 'developer'}</div>
            </div>
          </div>
          <button onClick={handleLogout} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CCC', fontSize: 14, padding: 2 }}>⏏</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ padding: '12px 20px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>
              {sidebarView === 'environments' ? 'Environments' : sidebarView === 'activity' ? 'Activity' : 'Cost & Quota'}
            </div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>
              {user?.full_name ? `${user.full_name}'s workspace` : 'Your workspace'}
              {hasPolling && <span style={{ marginLeft: 8, fontSize: 10, color: '#534AB7' }}>⟳ syncing…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchData} style={btnGhost}>Refresh</button>
            {sidebarView === 'environments' && (
              <button onClick={() => { setPanelOpen(true); setSelectedTemplate(''); setIsCustom(false) }}
                style={{ ...btnPrimary, flex: 'unset', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New environment
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Toast */}
          {toast && (
            <div style={{
              position: 'fixed', top: 16, right: panelOpen ? 428 : 16, zIndex: 300,
              padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: toast.type === 'error' ? '#FCEBEB' : '#D4EDB8',
              color: toast.type === 'error' ? '#791F1F' : '#27500A',
              border: `0.5px solid ${toast.type === 'error' ? '#FBBCBC' : '#A8D98A'}`,
              animation: 'fadeUp 0.2s ease', boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            }}>
              {toast.msg}
            </div>
          )}

          {sidebarView === 'environments' && (<>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Quota', value: `${quotaUsed}/${quotaMax}`, sub: 'environments', bar: quotaPct, barColor: quotaPct > 80 ? '#E24B4A' : '#378ADD' },
              { label: 'Monthly burn', value: `$${monthlyBurn.toFixed(2)}`, sub: 'this month', valueColor: monthlyBurn > 0 ? '#0F6E56' : '#999' },
              { label: 'Pending', value: String(pendingCount), sub: pendingCount > 0 ? 'awaiting action' : 'none pending', valueColor: pendingCount > 0 ? '#BA7517' : '#999' },
              { label: 'Active', value: String(activeCount), sub: 'running now', valueColor: activeCount > 0 ? '#27500A' : '#999' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '11px 14px', animation: 'fadeUp 0.25s ease' }}>
                <div style={{ fontSize: 10, color: '#BBB', letterSpacing: '0.05em', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: s.valueColor || '#111', marginTop: 3, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#BBB', marginTop: 3 }}>{s.sub}</div>
                {s.bar != null && <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2, marginTop: 7, overflow: 'hidden' }}><div style={{ height: '100%', width: `${s.bar}%`, background: s.barColor, borderRadius: 2 }} /></div>}
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[
              { id: 'all', label: `All (${tickets.length})` },
              { id: 'active', label: `Active (${activeCount})` },
              { id: 'pending', label: `Pending (${pendingCount})` },
              { id: 'done', label: 'Closed' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                fontSize: 11, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
                fontWeight: filter === f.id ? 600 : 400,
                background: filter === f.id ? '#fff' : 'transparent',
                color: filter === f.id ? '#111' : '#999',
                border: filter === f.id ? '0.5px solid #DCDCDC' : '0.5px solid transparent',
              }}>{f.label}</button>
            ))}
          </div>

          {/* Cards */}
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', background: '#fff', borderRadius: 10, border: '0.5px solid #E8E8E8' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>☁️</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#888' }}>
                {filter === 'all' ? 'No environments yet' : `No ${filter} environments`}
              </div>
              {filter === 'all' && <div style={{ fontSize: 11, color: '#BBB', marginTop: 4 }}>Click "New environment" to get started</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visible.map(ticket => (
                <div key={ticket.id} style={{ animation: 'fadeUp 0.2s ease' }}>
                  <EnvironmentCard ticket={ticket} onConsole={handleOpenConsole} onCancel={handleCancel} onClick={id => navigate(`/tickets/${id}`)} />
                </div>
              ))}
            </div>
          )}
          </>)}
          {sidebarView === 'activity' && (
            <div style={{ animation: 'fadeUp 0.2s ease' }}>
              {tickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', background: '#fff', borderRadius: 10, border: '0.5px solid #E8E8E8' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⏱</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#888' }}>No activity yet</div>
                  <div style={{ fontSize: 11, color: '#BBB', marginTop: 4 }}>Your environment history will appear here</div>
                </div>
              ) : (
                <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #EBEBEB' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>Environment history</div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{tickets.length} total request{tickets.length !== 1 ? 's' : ''}</div>
                  </div>
                  {[...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((ticket, i, arr) => {
                    const cfg = STATUS_CONFIG[ticket.status] || { label: ticket.status, color: '#666', bg: '#eee', dot: '#999' }
                    const meta = TEMPLATE_META[ticket.template?.template_type || ticket.template_type] || { icon: '☁️' }
                    const date = new Date(ticket.created_at)
                    return (
                      <div key={ticket.id} onClick={() => navigate(`/tickets/${ticket.id}`)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
                        borderBottom: i < arr.length - 1 ? '0.5px solid #F0F0F0' : 'none',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{meta.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
                          <div style={{ fontSize: 10, color: '#AAA', marginTop: 2 }}>{date.toLocaleDateString()} · {ticket.ticket_number}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {sidebarView === 'quota' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.2s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 10, color: '#BBB', letterSpacing: '0.05em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Environment quota</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: quotaPct > 80 ? '#A32D2D' : '#111', lineHeight: 1 }}>{quotaUsed}<span style={{ fontSize: 14, color: '#AAA', fontWeight: 400 }}>/{quotaMax}</span></div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>environments used</div>
                  <div style={{ height: 5, background: '#EBEBEB', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${quotaPct}%`, background: quotaPct > 80 ? '#E24B4A' : '#378ADD', borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ fontSize: 10, color: quotaPct > 80 ? '#A32D2D' : '#AAA', marginTop: 5 }}>{quotaMax - quotaUsed} slot{quotaMax - quotaUsed !== 1 ? 's' : ''} remaining</div>
                </div>
                <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 10, color: '#BBB', letterSpacing: '0.05em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Monthly spend</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: monthlyBurn > 0 ? '#0F6E56' : '#999', lineHeight: 1 }}>${monthlyBurn.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>this month so far</div>
                  {quota?.monthly_budget_usd && (
                    <>
                      <div style={{ height: 5, background: '#EBEBEB', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100,(monthlyBurn/quota.monthly_budget_usd)*100)}%`, background: monthlyBurn/quota.monthly_budget_usd > 0.8 ? '#E24B4A' : '#1D9E75', borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#AAA', marginTop: 5 }}>Budget: ${quota.monthly_budget_usd.toFixed(2)}/mo</div>
                    </>
                  )}
                </div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #EBEBEB' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>Cost by environment</div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>Active and recent environments</div>
                </div>
                {tickets.filter(t => ['active','expiring'].includes(t.status)).length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12, color: '#BBB' }}>No active environments generating cost</div>
                ) : (
                  tickets.filter(t => ['active','expiring'].includes(t.status)).map((ticket, i, arr) => {
                    const meta = TEMPLATE_META[ticket.template?.template_type || ticket.template_type] || { icon: '☁️' }
                    const cost = parseFloat(ticket.estimated_cost_usd || 0)
                    const maxCost = Math.max(...tickets.filter(t => ['active','expiring'].includes(t.status)).map(t => parseFloat(t.estimated_cost_usd || 0)), 0.01)
                    return (
                      <div key={ticket.id} onClick={() => navigate(`/tickets/${ticket.id}`)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
                        borderBottom: i < arr.length - 1 ? '0.5px solid #F0F0F0' : 'none',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontSize: 16, width: 28, textAlign: 'center', flexShrink: 0 }}>{meta.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
                          <div style={{ height: 3, background: '#EBEBEB', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(cost/maxCost)*100}%`, background: '#378ADD', borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111', flexShrink: 0 }}>${cost.toFixed(2)}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in panel */}
      {panelOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
          <div onClick={() => setPanelOpen(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.22)' }} />
          <div style={{ width: 420, background: '#fff', boxShadow: '-4px 0 28px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.2s ease', overflowY: 'auto' }}>
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>New environment</div>
                <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>Choose a service and fill in details</div>
              </div>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#BBB', cursor: 'pointer', lineHeight: 1, padding: 2 }}>×</button>
            </div>

            <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#BBB', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>1 · Choose a service</div>
                <div style={{ border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
                  <TemplatePicker templates={templates} selected={selectedTemplate} onSelect={handleTemplateSelect} />
                </div>
              </div>

              {selectedTemplate && !isCustom && (
                <div style={{ animation: 'fadeUp 0.18s ease' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#BBB', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>2 · Request details</div>
                  {selectedIsManual && (
                    <div style={{ background: '#FAEEDA', border: '0.5px solid #F5D08A', borderRadius: 6, padding: '8px 12px', marginBottom: 12, display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 15 }}>⏳</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#633806' }}>Manual setup required</div>
                        <div style={{ fontSize: 10, color: '#854F0B', marginTop: 2 }}>Admin will configure this. SLA: {selectedTmpl?.resources?.sla_days || 2} business day(s). Email notification when live.</div>
                      </div>
                    </div>
                  )}
                  {selectedTmpl?.template_type === 'ecs_container' && (
                    <div style={{ background: '#FAEEDA', border: '0.5px solid #F5D08A', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#633806' }}>
                      ⚠️ <strong>Not free tier eligible.</strong> ECS Fargate costs ~$9/month.
                    </div>
                  )}
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <Field label="Environment title *">
                      <input style={inputSt} required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Production RDS Migration Test" />
                    </Field>
                    <Field label="Duration (days) *">
                      <input style={inputSt} type="number" min="1" max="30" required value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} />
                    </Field>
                    <Field label="Business justification *">
                      <textarea style={{ ...inputSt, resize: 'none', height: 72 }} required value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))} placeholder="Why do you need this environment?" />
                    </Field>
                    {estimate && !selectedIsManual && (
                      <div style={{ background: '#185FA5', borderRadius: 8, padding: '11px 14px', color: '#fff' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.65, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Estimated cost</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                          <span style={{ fontSize: 22, fontWeight: 700 }}>${estimate.estimated_total_cost}</span>
                          <span style={{ fontSize: 11, opacity: 0.65 }}>for {form.duration_days} days</span>
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>${estimate.estimated_monthly_cost}/mo · {estimate.free_tier_eligible ? '✓ Free tier eligible' : 'Standard pricing'}</div>
                      </div>
                    )}
                    <button type="submit" disabled={submitting} style={{ ...btnPrimary, padding: '10px 16px' }}>
                      {submitting ? 'Initialising…' : selectedIsManual ? 'Submit for admin setup' : 'Provision environment'}
                    </button>
                  </form>
                </div>
              )}

              {isCustom && (
                <div style={{ animation: 'fadeUp 0.18s ease' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#BBB', letterSpacing: '0.06em', marginBottom: 10, textTransform: 'uppercase' }}>2 · Custom request details</div>
                  <CustomRequestForm onSuccess={handleCustomSuccess} onCancel={() => { setIsCustom(false); setSelectedTemplate('') }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
