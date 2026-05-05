import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getPendingTickets, approveTicket, rejectTicket, getUsers, updateUserRole,
  deactivateUser, getUserQuota, updateUserQuota,
  getAuditLogs, destroyEnvironment, getAllTickets, getPortalStats,
  markInProgress, completeManualSetup
} from '../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'pending', label: 'Pending approvals', icon: '✓' },
  { id: 'manual',  label: 'Manual setup',      icon: '🔧' },
  { id: 'active',  label: 'Active envs',        icon: '▦' },
  { id: 'users',   label: 'Users',              icon: '👤' },
  { id: 'audit',   label: 'Audit log',          icon: '📋' },
  { id: 'stats',   label: 'Cost & stats',       icon: '◎' },
]

const TEMPLATE_META = {
  web_app:           { icon: '🖥️', label: 'EC2 Web App'         },
  database:          { icon: '🗄️', label: 'RDS PostgreSQL'       },
  serverless:        { icon: '⚡',  label: 'Lambda'               },
  s3_static_site:    { icon: '🌐', label: 'S3 Static Site'       },
  s3_storage:        { icon: '🪣', label: 'S3 Bucket'            },
  sns_topic:         { icon: '📣', label: 'SNS Topic'            },
  dynamodb:          { icon: '⚡',  label: 'DynamoDB'             },
  ecr_repository:    { icon: '📦', label: 'ECR Repository'       },
  ecs_container:     { icon: '🐳', label: 'ECS Fargate'          },
  elasticache_redis: { icon: '🔴', label: 'ElastiCache Redis'    },
  cloudfront_cdn:    { icon: '🌍', label: 'CloudFront CDN'       },
  rds_read_replica:  { icon: '🗄️', label: 'RDS Read Replica'    },
  secrets_manager:   { icon: '🔐', label: 'Secrets Manager'      },
  waf_rules:         { icon: '🛡️', label: 'WAF Rules'           },
  kinesis_stream:    { icon: '🌊', label: 'Kinesis Stream'       },
  eks_cluster:       { icon: '☸️', label: 'EKS Cluster'          },
  codepipeline:      { icon: '🔄', label: 'CodePipeline'         },
  opensearch:        { icon: '🔍', label: 'OpenSearch'           },
  redshift:          { icon: '🏢', label: 'Redshift'             },
  custom_request:    { icon: '✨', label: 'Custom Request'       },
}

const AUDIT_CHIP = {
  'ticket.approved':         { bg: '#E1F5EE', color: '#085041' },
  'ticket.rejected':         { bg: '#FCEBEB', color: '#791F1F' },
  'ticket.cancelled':        { bg: '#FCEBEB', color: '#791F1F' },
  'provision.started':       { bg: '#E6F1FB', color: '#0C447C' },
  'provision.completed':     { bg: '#E1F5EE', color: '#085041' },
  'provision.failed':        { bg: '#FCEBEB', color: '#791F1F' },
  'environment.destroyed':   { bg: '#FCEBEB', color: '#791F1F' },
  'manual.in_progress':      { bg: '#E6F1FB', color: '#0C447C' },
  'manual.completed':        { bg: '#E1F5EE', color: '#085041' },
  'user.role_changed':       { bg: '#FAEEDA', color: '#633806' },
  'user.login':              { bg: '#F0F0F0', color: '#666'    },
}

function getMeta(templateType) {
  return TEMPLATE_META[templateType] || { icon: '☁️', label: templateType || 'AWS Service' }
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const inputSt = {
  fontSize: 11, padding: '5px 10px',
  border: '0.5px solid #DCDCDC', borderRadius: 5,
  background: '#FAFAFA', color: '#111', outline: 'none',
  fontFamily: 'inherit',
}

const labelSt = {
  fontSize: 10, fontWeight: 700, color: '#AAA',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
}

function Pill({ children, bg, color, pulse }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: bg, color, whiteSpace: 'nowrap',
    }}>
      {pulse && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, animation: 'cpulse 1.4s ease infinite' }} />}
      {children}
    </span>
  )
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{
      padding: '12px 16px', borderBottom: '0.5px solid #E8E8E8',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <input
      type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputSt, width: 180 }}
    />
  )
}

function EmptyState({ icon, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#AAA' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{message}</div>
    </div>
  )
}

// ─── Complete modal ───────────────────────────────────────────────────────────

function CompleteModal({ ticket, onClose, onDone }) {
  const [form, setForm] = useState({ resource_details: '', environment_url: '', instance_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.resource_details.trim()) { setError('Resource details are required.'); return }
    setSubmitting(true)
    setError('')
    try {
      await completeManualSetup(ticket.id, {
        resource_details: form.resource_details,
        environment_url: form.environment_url || null,
        instance_id: form.instance_id || null,
      })
      onDone(`${ticket.ticket_number} marked active — user notified.`)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to complete setup') }
    finally { setSubmitting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 500, animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Complete manual setup</div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>{ticket.ticket_number} · {ticket.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#BBB', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', color: '#791F1F', padding: '7px 10px', borderRadius: 5, fontSize: 11 }}>{error}</div>}
          <div>
            <div style={labelSt}>Resource details / connection info *</div>
            <textarea
              value={form.resource_details}
              onChange={e => set('resource_details', e.target.value)}
              required rows={5}
              placeholder={`Paste all connection details here.\nEndpoint: redis-cluster.abc123.cache.amazonaws.com:6379\nARN: arn:aws:elasticache:ap-south-1:...\nAuth token: (sent via email)`}
              style={{ ...inputSt, width: '100%', resize: 'none', fontFamily: 'DM Mono, monospace', lineHeight: 1.6, fontSize: 11 }}
            />
            <div style={{ fontSize: 10, color: '#AAA', marginTop: 4 }}>This is shown verbatim to the user on their ticket page.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelSt}>URL / Endpoint (optional)</div>
              <input style={{ ...inputSt, width: '100%' }} value={form.environment_url} onChange={e => set('environment_url', e.target.value)} placeholder="https://... or redis://..." />
            </div>
            <div>
              <div style={labelSt}>Resource ID / ARN (optional)</div>
              <input style={{ ...inputSt, width: '100%' }} value={form.instance_id} onChange={e => set('instance_id', e.target.value)} placeholder="arn:aws:... or cluster-id" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button type="submit" disabled={submitting} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: '9px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Saving…' : '✓ Mark active & notify user'}
            </button>
            <button type="button" onClick={onClose} style={{ fontSize: 12, padding: '9px 14px', borderRadius: 6, background: 'transparent', color: '#666', border: '0.5px solid #DCDCDC', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab: Pending Approvals ───────────────────────────────────────────────────

function PendingTab({ tickets, onApprove, onReject, actionLoading }) {
  const [search, setSearch] = useState('')
  const [rejectOpen, setRejectOpen] = useState(null)
  const [rejectReason, setRejectReason] = useState({})

  const filtered = tickets.filter(t =>
    [t.title, t.ticket_number, t.requester_name, t.requester_email].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <SectionHeader
        title="Pending approvals"
        subtitle={`${tickets.length} request${tickets.length !== 1 ? 's' : ''} awaiting your decision`}
        right={<SearchBox value={search} onChange={setSearch} />}
      />
      {filtered.length === 0
        ? <EmptyState icon="✅" message="No pending approvals — queue is clear" />
        : filtered.map(ticket => {
            const templateType = ticket.template?.template_type || ticket.template_type
            const meta = getMeta(templateType)
            const isManual = ticket.template?.is_manual
            const isCustom = templateType === 'custom_request'
            const isRejecting = rejectOpen === ticket.id

            return (
              <div key={ticket.id} style={{ borderBottom: '0.5px solid #F0F0F0', borderLeft: `3px solid ${isManual ? '#BA7517' : '#DDD'}` }}>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                  <div>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{meta.icon}</div>
                      <span style={{ fontSize: 10, color: '#378ADD', fontFamily: 'DM Mono, monospace' }}>{ticket.ticket_number}</span>
                      <Pill bg="#FAEEDA" color="#633806">Pending approval</Pill>
                      {ticket.template?.tier && <Pill bg="#F0F0F0" color="#666">Tier {ticket.template.tier}</Pill>}
                      {isManual && <Pill bg="#FAEEDA" color="#854F0B">Manual setup</Pill>}
                      {isCustom && <Pill bg="#E5E3FD" color="#3C3489">Custom</Pill>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{ticket.title}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 3, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ticket.justification}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#AAA' }}>👤 {ticket.requester_name || ticket.requester_email || `User ${ticket.user_id}`}</span>
                      <span style={{ fontSize: 10, color: '#AAA' }}>📅 {ticket.duration_days} days</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#111', background: '#F4F4F4', padding: '1px 7px', borderRadius: 4 }}>${ticket.estimated_cost_usd} est.</span>
                      {isManual && ticket.template?.resources?.sla_days && (
                        <span style={{ fontSize: 10, color: '#854F0B', fontWeight: 600 }}>SLA: {ticket.template.resources.sla_days} business day(s)</span>
                      )}
                    </div>
                    {/* Custom request extra */}
                    {isCustom && ticket.requested_resources && (
                      <div style={{ marginTop: 10, background: '#F0F4FF', border: '0.5px solid #C9D6FF', borderRadius: 6, padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                        {[['Resource', ticket.requested_resources.resource_type_name],['Provider', ticket.requested_resources.cloud_provider],['Urgency', ticket.requested_resources.urgency],['Region', ticket.requested_resources.preferred_region],['Usage', ticket.requested_resources.estimated_usage]].filter(([,v]) => v).map(([l, v]) => (
                          <div key={l}><div style={{ fontSize: 9, fontWeight: 700, color: '#5570CC', letterSpacing: '0.05em' }}>{l}</div><div style={{ fontSize: 11, color: '#2A3A99' }}>{v}</div></div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                    <button
                      onClick={() => onApprove(ticket.id, ticket.ticket_number)}
                      disabled={actionLoading === ticket.id}
                      style={{ fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 5, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer', opacity: actionLoading === ticket.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                    >
                      {actionLoading === ticket.id ? '…' : isManual ? '✓ Approve & queue' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => setRejectOpen(isRejecting ? null : ticket.id)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 5, background: 'transparent', color: '#A32D2D', border: '0.5px solid #FBBCBC', cursor: 'pointer' }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>

                {/* Reject tray */}
                {isRejecting && (
                  <div style={{ padding: '8px 16px 12px', borderTop: '0.5px solid #F5F5F5', background: '#FAFAFA', display: 'flex', gap: 7, alignItems: 'center', animation: 'fadeUp 0.15s ease' }}>
                    <input
                      style={{ ...inputSt, flex: 1 }}
                      value={rejectReason[ticket.id] || ''}
                      onChange={e => setRejectReason(r => ({ ...r, [ticket.id]: e.target.value }))}
                      placeholder="Rejection reason (optional)"
                    />
                    <button
                      onClick={() => { onReject(ticket.id, ticket.ticket_number, rejectReason[ticket.id]); setRejectOpen(null) }}
                      disabled={actionLoading === ticket.id}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 5, background: '#A32D2D', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      Confirm reject
                    </button>
                    <button onClick={() => setRejectOpen(null)} style={{ fontSize: 11, color: '#AAA', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                )}
              </div>
            )
          })
      }
    </div>
  )
}

// ─── Tab: Manual Setup ────────────────────────────────────────────────────────

function ManualTab({ tickets, onMarkInProgress, onComplete, actionLoading }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = tickets
    .filter(t => filter === 'all' || (filter === 'waiting' ? t.status === 'pending_manual_setup' : t.status === 'in_progress'))
    .filter(t => [t.title, t.ticket_number, t.requester_name, t.requester_email].some(v => (v||'').toLowerCase().includes(search.toLowerCase())))

  const waiting = tickets.filter(t => t.status === 'pending_manual_setup').length
  const inProg  = tickets.filter(t => t.status === 'in_progress').length

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <SectionHeader
        title="Manual setup queue"
        subtitle="Approved Tier 2 / Tier 3 and custom tickets awaiting admin provisioning"
        right={
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[['all', `All (${tickets.length})`], ['waiting', `Waiting (${waiting})`], ['inprog', `In progress (${inProg})`]].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                  background: filter === id ? '#fff' : 'transparent',
                  color: filter === id ? '#111' : '#888',
                  border: filter === id ? '0.5px solid #DCDCDC' : '0.5px solid transparent',
                }}>{label}</button>
              ))}
            </div>
            <SearchBox value={search} onChange={setSearch} />
          </div>
        }
      />
      {filtered.length === 0
        ? <EmptyState icon="✅" message="Manual setup queue is clear" />
        : filtered.map(ticket => {
            const templateType = ticket.template?.template_type || ticket.template_type
            const meta = getMeta(templateType)
            const isWaiting = ticket.status === 'pending_manual_setup'
            const isInProg  = ticket.status === 'in_progress'
            const sla = ticket.template?.resources?.sla_days

            // SLA elapsed
            const approved = new Date(ticket.updated_at || ticket.created_at)
            const slaDays = sla || 2
            const slaDeadline = new Date(approved); slaDeadline.setDate(slaDeadline.getDate() + slaDays)
            const slaPct = Math.min(100, ((Date.now() - approved) / (slaDeadline - approved)) * 100)
            const slaWarn = slaPct > 70

            return (
              <div key={ticket.id} style={{ borderBottom: '0.5px solid #F0F0F0', borderLeft: `3px solid ${isInProg ? '#1D9E75' : '#BA7517'}`, background: isInProg ? '#FAFFFE' : '#fff' }}>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{meta.icon}</div>
                      <span style={{ fontSize: 10, color: '#378ADD', fontFamily: 'DM Mono, monospace' }}>{ticket.ticket_number}</span>
                      {isInProg
                        ? <Pill bg="#D2F0E7" color="#085041" pulse>In progress</Pill>
                        : <Pill bg="#FAEEDA" color="#633806" pulse>Awaiting setup</Pill>
                      }
                      {ticket.template?.tier && <Pill bg="#F0F0F0" color="#666">Tier {ticket.template.tier}</Pill>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{ticket.title}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 3, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ticket.justification}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#AAA' }}>👤 {ticket.requester_name || ticket.requester_email}</span>
                      <span style={{ fontSize: 10, color: '#AAA' }}>📅 {ticket.duration_days} days</span>
                      {sla && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: slaWarn ? '#A32D2D' : '#AAA', fontWeight: slaWarn ? 600 : 400 }}>SLA: {sla}d</span>
                          <div style={{ width: 60, height: 3, background: '#EBEBEB', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${slaPct}%`, background: slaWarn ? '#E24B4A' : '#3B6D11', borderRadius: 2 }} />
                          </div>
                          {slaWarn && <span style={{ fontSize: 9, color: '#A32D2D', fontWeight: 700 }}>⚠ SLA at risk</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                    {isWaiting && (
                      <button
                        onClick={() => onMarkInProgress(ticket.id, ticket.ticket_number)}
                        disabled={actionLoading === ticket.id}
                        style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 5, background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #B0D0EF', cursor: 'pointer' }}
                      >
                        🔧 Mark in progress
                      </button>
                    )}
                    <button
                      onClick={() => onComplete(ticket)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 5, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      ✓ Fill details & complete
                    </button>
                  </div>
                </div>
                {isInProg && (
                  <div style={{ padding: '6px 16px 10px', fontSize: 11, color: '#0F6E56', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, border: '1.5px solid #9FD9C2', borderTop: '1.5px solid #0F6E56', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    You've marked this in progress — fill in resource details to complete
                  </div>
                )}
              </div>
            )
          })
      }
    </div>
  )
}

// ─── Tab: Active Environments ─────────────────────────────────────────────────

function ActiveTab({ tickets, onDestroy, actionLoading, onView }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [confirmDestroy, setConfirmDestroy] = useState(null)

  const now = Date.now()
  const withExpiry = tickets.map(t => {
    const exp = new Date(t.created_at); exp.setDate(exp.getDate() + t.duration_days)
    const daysLeft = Math.ceil((exp - now) / 86400000)
    return { ...t, expiresAt: exp, daysLeft }
  })

  const filtered = withExpiry
    .filter(t => filter === 'all' || (filter === 'expiring' ? t.daysLeft <= 3 : false))
    .filter(t => [t.title, t.ticket_number, t.requester_name, t.requester_email].some(v => (v||'').toLowerCase().includes(search.toLowerCase())))

  const expiringSoon = withExpiry.filter(t => t.daysLeft <= 3).length

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <SectionHeader
        title="Active environments"
        subtitle={`${tickets.length} running${expiringSoon > 0 ? ` · ${expiringSoon} expiring soon` : ''}`}
        right={
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[['all',`All (${tickets.length})`],['expiring',`Expiring soon (${expiringSoon})`]].map(([id,label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                  background: filter === id ? '#fff' : 'transparent',
                  color: filter === id ? (id === 'expiring' ? '#A32D2D' : '#111') : '#888',
                  border: filter === id ? `0.5px solid ${id === 'expiring' ? '#FBBCBC' : '#DCDCDC'}` : '0.5px solid transparent',
                }}>{label}</button>
              ))}
            </div>
            <SearchBox value={search} onChange={setSearch} />
          </div>
        }
      />
      {filtered.length === 0
        ? <EmptyState icon="☁️" message="No active environments" />
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFAFA' }}>
                {['Environment','User','Endpoint','Expires','Cost','Type','Action'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.06em', borderBottom: '0.5px solid #EBEBEB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ticket => {
                const templateType = ticket.template?.template_type || ticket.template_type
                const meta = getMeta(templateType)
                const warn = ticket.daysLeft <= 3
                const pct = Math.max(0, Math.min(100, (ticket.daysLeft / ticket.duration_days) * 100))
                const isConfirming = confirmDestroy === ticket.id

                return (
                  <tr key={ticket.id} style={{ borderBottom: '0.5px solid #F0F0F0' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{meta.icon}</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
                          <div
                            onClick={() => onView(ticket.id)}
                            style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#378ADD', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#B5D4F4' }}
                          >{ticket.ticket_number}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{ticket.requester_name || '—'}</div>
                      <div style={{ fontSize: 10, color: '#AAA' }}>{ticket.requester_email || ''}</div>
                    </td>
                    <td style={{ padding: '10px 14px', maxWidth: 180 }}>
                      {ticket.environment_url
                        ? <><a href={ticket.environment_url.startsWith('http') ? ticket.environment_url : undefined} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#378ADD', fontFamily: 'DM Mono, monospace', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.environment_url}</a></>
                        : ticket.instance_id
                          ? <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#888', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.instance_id}</span>
                          : <span style={{ fontSize: 10, color: '#CCC' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: warn ? '#A32D2D' : '#555' }}>{ticket.daysLeft <= 0 ? 'Expired' : `${ticket.daysLeft}d`}</div>
                      <div style={{ width: 70, height: 3, background: '#EBEBEB', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: warn ? '#E24B4A' : '#3B6D11', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>${ticket.estimated_cost_usd || '0.00'}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {ticket.template?.is_manual
                        ? <Pill bg="#FAEEDA" color="#633806">Manual</Pill>
                        : <Pill bg="#E1F5EE" color="#085041">Terraform</Pill>
                      }
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isConfirming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 10, color: '#A32D2D', fontWeight: 600 }}>Sure?</span>
                          <button onClick={() => { onDestroy(ticket.id, ticket.ticket_number); setConfirmDestroy(null) }} disabled={actionLoading === ticket.id}
                            style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 4, background: '#A32D2D', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            {actionLoading === ticket.id ? '…' : 'Destroy'}
                          </button>
                          <button onClick={() => setConfirmDestroy(null)} style={{ fontSize: 10, color: '#AAA', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => onView(ticket.id)} style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 4, background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #B5D4F4', cursor: 'pointer' }}>View</button>
                          <button onClick={() => setConfirmDestroy(ticket.id)} style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 4, background: 'transparent', color: '#A32D2D', border: '0.5px solid #FBBCBC', cursor: 'pointer' }}>Destroy</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      }
    </div>
  )
}

// ─── Tab: Users ───────────────────────────────────────────────────────────────

function UsersTab({ users, onRoleChange, onDeactivate }) {
  const [search, setSearch] = useState('')
  const [pendingChange, setPendingChange] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [quotaData, setQuotaData] = useState({})
  const [quotaEdits, setQuotaEdits] = useState({})
  const [quotaSaving, setQuotaSaving] = useState(null)
  const [quotaMsg, setQuotaMsg] = useState({})
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)

  const toggleExpand = async (user) => {
    if (expanded === user.id) { setExpanded(null); return }
    setExpanded(user.id)
    if (!quotaData[user.id]) {
      try {
        const res = await getUserQuota(user.id)
        setQuotaData(prev => ({ ...prev, [user.id]: res.data }))
        setQuotaEdits(prev => ({ ...prev, [user.id]: { environments_limit: res.data.environments_limit, monthly_budget_usd: res.data.monthly_budget_usd } }))
      } catch { setQuotaData(prev => ({ ...prev, [user.id]: null })) }
    }
  }

  const handleQuotaSave = async (userId) => {
    setQuotaSaving(userId)
    try {
      await updateUserQuota(userId, quotaEdits[userId])
      setQuotaData(prev => ({ ...prev, [userId]: { ...prev[userId], ...quotaEdits[userId] } }))
      setQuotaMsg(prev => ({ ...prev, [userId]: { type: 'ok', text: 'Quota saved' } }))
    } catch (err) {
      setQuotaMsg(prev => ({ ...prev, [userId]: { type: 'err', text: err.response?.data?.detail || 'Failed to save' } }))
    } finally {
      setQuotaSaving(null)
      setTimeout(() => setQuotaMsg(prev => ({ ...prev, [userId]: null })), 3000)
    }
  }

  const filtered = users.filter(u =>
    [u.full_name, u.email, u.department].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
  )

  const avatarColors = ['#D6E9FB:#0C447C','#D2F0E7:#085041','#E5E3FD:#3C3489','#FDEDD6:#633806','#FCEBEB:#791F1F']
  const avatarColor = (i) => { const [bg, color] = avatarColors[i % avatarColors.length].split(':'); return { bg, color } }
  const roleColors = { developer: { bg: '#F0F0F0', color: '#666' }, approver: { bg: '#E6F1FB', color: '#0C447C' }, admin: { bg: '#E1F5EE', color: '#085041' } }

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      {/* Role change confirm modal */}
      {pendingChange && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '20px 24px', maxWidth: 360, width: '100%', margin: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 8 }}>Confirm role change</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 18, lineHeight: 1.6 }}>
              Change <strong>{pendingChange.name}</strong>'s role to <strong style={{ textTransform: 'capitalize' }}>{pendingChange.role}</strong>? This will immediately affect their portal access.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingChange(null)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 5, border: '0.5px solid #DCDCDC', color: '#666', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { onRoleChange(pendingChange.id, pendingChange.role); setPendingChange(null) }}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 5, background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
      {/* Deactivate confirm modal */}
      {confirmDeactivate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid #E0E0E0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '20px 24px', maxWidth: 360, width: '100%', margin: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#A32D2D', marginBottom: 8 }}>Deactivate user?</div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 18, lineHeight: 1.6 }}>
              <strong>{confirmDeactivate.name}</strong> will immediately lose access to the portal. Their ticket history will be preserved.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeactivate(null)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 5, border: '0.5px solid #DCDCDC', color: '#666', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { onDeactivate(confirmDeactivate.id); setConfirmDeactivate(null); setExpanded(null) }}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 5, background: '#A32D2D', color: '#fff', border: 'none', cursor: 'pointer' }}>Deactivate</button>
            </div>
          </div>
        </div>
      )}
      <SectionHeader title="User management" subtitle={`${users.length} registered users`} right={<SearchBox value={search} onChange={setSearch} />} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#FAFAFA' }}>
            {['','User','Department','Role','Status','Joined'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.06em', borderBottom: '0.5px solid #EBEBEB' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((user, i) => {
            const av = avatarColor(i)
            const rc = roleColors[user.role] || roleColors.developer
            const isExpanded = expanded === user.id
            const quota = quotaData[user.id]
            const edits = quotaEdits[user.id] || {}
            const msg = quotaMsg[user.id]
            return (
              <>
                <tr key={user.id} style={{ borderBottom: isExpanded ? 'none' : '0.5px solid #F0F0F0', background: isExpanded ? '#FAFBFF' : '#fff' }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#FAFAFA' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}
                >
                  <td style={{ padding: '10px 10px 10px 14px', width: 24 }}>
                    <button onClick={() => toggleExpand(user)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAA', fontSize: 11, padding: 2, lineHeight: 1 }}>
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: av.color, flexShrink: 0 }}>
                        {(user.full_name || user.email || 'U').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{user.full_name || '—'}</div>
                        <div style={{ fontSize: 10, color: '#AAA' }}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#666' }}>{user.department || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <select
                      value={user.role}
                      onChange={e => setPendingChange({ id: user.id, role: e.target.value, name: user.full_name || user.email })}
                      style={{ ...inputSt, background: rc.bg, color: rc.color, fontWeight: 600, borderColor: 'transparent', cursor: 'pointer' }}
                    >
                      {['developer','approver','admin'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {user.is_active
                      ? <Pill bg="#E1F5EE" color="#085041">Active</Pill>
                      : <Pill bg="#F0F0F0" color="#888">Inactive</Pill>
                    }
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#AAA' }}>{new Date(user.created_at).toLocaleDateString()}</td>
                </tr>
                {isExpanded && (
                  <tr key={`${user.id}-drawer`} style={{ borderBottom: '0.5px solid #E8E8E8' }}>
                    <td colSpan={6} style={{ padding: '0 14px 14px 48px', background: '#FAFBFF' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {/* Quota section */}
                        <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 7, padding: '12px 14px', minWidth: 280 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Resource quota</div>
                          {quota === undefined ? (
                            <div style={{ fontSize: 11, color: '#BBB' }}>Loading…</div>
                          ) : quota === null ? (
                            <div style={{ fontSize: 11, color: '#E24B4A' }}>Quota record not found</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 11, color: '#666', width: 130 }}>Env limit</label>
                                <input type="number" min="1" max="20" value={edits.environments_limit ?? quota.environments_limit}
                                  onChange={e => setQuotaEdits(prev => ({ ...prev, [user.id]: { ...prev[user.id], environments_limit: parseInt(e.target.value,10) || 1 } }))}
                                  style={{ width: 60, fontSize: 12, padding: '4px 8px', border: '0.5px solid #DCDCDC', borderRadius: 4, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}
                                />
                                <span style={{ fontSize: 10, color: '#AAA' }}>environments</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 11, color: '#666', width: 130 }}>Monthly budget</label>
                                <span style={{ fontSize: 11, color: '#666' }}>$</span>
                                <input type="number" min="0" step="10" value={edits.monthly_budget_usd ?? quota.monthly_budget_usd}
                                  onChange={e => setQuotaEdits(prev => ({ ...prev, [user.id]: { ...prev[user.id], monthly_budget_usd: parseFloat(e.target.value) || 0 } }))}
                                  style={{ width: 72, fontSize: 12, padding: '4px 8px', border: '0.5px solid #DCDCDC', borderRadius: 4, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}
                                />
                                <span style={{ fontSize: 10, color: '#AAA' }}>/mo</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                <button onClick={() => handleQuotaSave(user.id)} disabled={quotaSaving === user.id}
                                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 4, background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', opacity: quotaSaving === user.id ? 0.6 : 1 }}>
                                  {quotaSaving === user.id ? 'Saving…' : 'Save quota'}
                                </button>
                                {msg && <span style={{ fontSize: 11, color: msg.type === 'ok' ? '#085041' : '#A32D2D' }}>{msg.text}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Deactivate section */}
                        {user.is_active && (
                          <div style={{ background: '#fff', border: '0.5px solid #FBBCBC', borderRadius: 7, padding: '12px 14px', minWidth: 220 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#A32D2D', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Danger zone</div>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>Deactivating this user will revoke their portal access immediately.</div>
                            <button
                              onClick={() => setConfirmDeactivate({ id: user.id, name: user.full_name || user.email })}
                              style={{ fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 4, background: 'transparent', color: '#A32D2D', border: '0.5px solid #FBBCBC', cursor: 'pointer' }}
                            >Deactivate user</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab: Audit Log ───────────────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const PAGE = 50

  const fetchLogs = async (currentOffset, replace = false) => {
    replace ? setInitialLoading(true) : setLoadingMore(true)
    try {
      const res = await getAuditLogs({ limit: PAGE, offset: currentOffset })
      const incoming = res.data
      setLogs(prev => replace ? incoming : [...prev, ...incoming])
      setHasMore(incoming.length === PAGE)
      setOffset(currentOffset + incoming.length)
    } catch {}
    finally { replace ? setInitialLoading(false) : setLoadingMore(false) }
  }

  useEffect(() => { fetchLogs(0, true) }, [])

  const categories = {
    all: logs,
    approvals: logs.filter(l => l.action.startsWith('ticket.')),
    provisioning: logs.filter(l => l.action.startsWith('provision.') || l.action.startsWith('manual.')),
    destroy: logs.filter(l => l.action.includes('destroy')),
    users: logs.filter(l => l.action.startsWith('user.')),
  }

  const filtered = (categories[filter] || logs).filter(l =>
    [l.action, l.resource_type, String(l.resource_id)].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
      <SectionHeader
        title="Audit log"
        subtitle={initialLoading ? 'Loading…' : `${logs.length} records loaded`}
        right={
          <div style={{ display: 'flex', gap: 7 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[['all','All'],['approvals','Approvals'],['provisioning','Provisioning'],['destroy','Destroy'],['users','Users']].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  background: filter === id ? '#fff' : 'transparent', color: filter === id ? '#111' : '#888',
                  border: filter === id ? '0.5px solid #DCDCDC' : '0.5px solid transparent',
                }}>{label}</button>
              ))}
            </div>
            <SearchBox value={search} onChange={setSearch} />
          </div>
        }
      />
      {initialLoading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <div style={{ width: 20, height: 20, border: '2px solid #E0E0E0', borderTop: '2px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 11, color: '#AAA' }}>Loading audit logs…</div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" message="No audit logs found" />
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFAFA' }}>
                {['Action','Resource','Performed by','IP','Time','Details'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.06em', borderBottom: '0.5px solid #EBEBEB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const chip = AUDIT_CHIP[log.action] || { bg: '#F0F0F0', color: '#666' }
                const isExpanded = expanded === log.id
                return (
                  <>
                    <tr key={log.id} style={{ borderBottom: '0.5px solid #F0F0F0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'DM Mono, monospace', padding: '3px 7px', borderRadius: 4, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontSize: 11, color: '#666', textTransform: 'capitalize' }}>{log.resource_type}</div>
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#AAA' }}>{log.resource_id}</div>
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 11, color: '#555' }}>{log.performed_by || log.user_id || '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#AAA' }}>{log.ip_address || '—'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</div>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {log.details && (
                          <button onClick={() => setExpanded(isExpanded ? null : log.id)} style={{ fontSize: 10, color: '#378ADD', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {isExpanded ? 'Hide ▴' : 'View ▾'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${log.id}-detail`} style={{ background: '#FAFAFA', borderBottom: '0.5px solid #F0F0F0' }}>
                        <td colSpan={6} style={{ padding: '8px 14px' }}>
                          <pre style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', background: '#F4F4F4', border: '0.5px solid #E4E4E4', borderRadius: 5, padding: '8px 10px', lineHeight: 1.6, overflowX: 'auto', color: '#333', margin: 0 }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {hasMore && (
            <div style={{ padding: '12px 16px', borderTop: '0.5px solid #EBEBEB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#AAA' }}>{logs.length} records loaded</span>
              <button
                onClick={() => fetchLogs(offset)}
                disabled={loadingMore}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
                  background: '#F5F5F5', color: '#555', border: '0.5px solid #DCDCDC',
                  opacity: loadingMore ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {loadingMore
                  ? <><div style={{ width: 10, height: 10, border: '1.5px solid #CCC', borderTop: '1.5px solid #555', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Loading…</>
                  : `Load next ${PAGE}`
                }
              </button>
            </div>
          )}
          {!hasMore && logs.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '0.5px solid #EBEBEB', textAlign: 'center', fontSize: 11, color: '#CCC' }}>
              All {logs.length} records loaded
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab: Cost & Stats ────────────────────────────────────────────────────────

function StatsTab({ stats }) {
  if (!stats) return <EmptyState icon="⏳" message="Loading stats…" />
  const { overview, per_user, per_template } = stats

  const maxCost = Math.max(...(per_template || []).map(t => t.total_cost_usd), 0.01)
  const maxUserCost = Math.max(...(per_user || []).map(u => u.total_cost_usd), 0.01)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Overview stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {[
          { label: 'Total requests',  value: overview.total_tickets, color: '#111' },
          { label: 'Active now',      value: overview.active,        color: '#0F6E56' },
          { label: 'Monthly burn',    value: `$${(overview.active_cost_usd||0).toFixed(2)}`, color: '#185FA5' },
          { label: 'All-time cost',   value: `$${(overview.total_cost_usd||0).toFixed(2)}`, color: '#111' },
          { label: 'Pending',         value: overview.pending,       color: '#BA7517' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '11px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#BBB', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.color, marginTop: 4, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        {/* Spend by template */}
        <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 12 }}>Spend by service type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(per_template || []).sort((a,b) => b.total_cost_usd - a.total_cost_usd).map(t => {
              const meta = getMeta(t.template_type)
              const pct = (t.total_cost_usd / maxCost) * 100
              return (
                <div key={t.template_type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{meta.icon}</span>
                  <span style={{ fontSize: 11, color: '#666', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</span>
                  <div style={{ flex: 1, height: 5, background: '#EBEBEB', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#378ADD', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#111', width: 48, textAlign: 'right', flexShrink: 0 }}>${t.total_cost_usd.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Request outcomes */}
        <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 12 }}>Request outcomes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Active',    val: overview.active,    color: '#1D9E75', max: overview.total_tickets },
              { label: 'Pending',   val: overview.pending,   color: '#BA7517', max: overview.total_tickets },
              { label: 'Expired',   val: overview.expired,   color: '#AAA',    max: overview.total_tickets },
              { label: 'Rejected',  val: overview.rejected,  color: '#E24B4A', max: overview.total_tickets },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#888', width: 60 }}>{s.label}</span>
                <div style={{ flex: 1, height: 4, background: '#EBEBEB', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.max > 0 ? (s.val/s.max)*100 : 0}%`, background: s.color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#111', width: 24, textAlign: 'right' }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost by user */}
      <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #E8E8E8', fontSize: 12, fontWeight: 600, color: '#111' }}>Cost by user</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA' }}>
              {['User','Department','Total requests','Monthly spend','All-time spend'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.06em', borderBottom: '0.5px solid #EBEBEB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(per_user || []).sort((a,b) => b.total_cost_usd - a.total_cost_usd).map((u, i) => {
              const pct = (u.total_cost_usd / maxUserCost) * 100
              return (
                <tr key={u.email} style={{ borderBottom: '0.5px solid #F0F0F0' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#D6E9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#0C447C', flexShrink: 0 }}>
                        {(u.full_name || u.email || 'U').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{u.full_name}</div>
                        <div style={{ fontSize: 10, color: '#AAA' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: '#666' }}>{u.department || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: '#111' }}>{u.total_tickets}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: '#EBEBEB', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#378ADD', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>${(u.active_cost_usd||0).toFixed(2)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#185FA5' }}>${u.total_cost_usd.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Admin component ─────────────────────────────────────────────────────

export default function Admin() {
  const { user, logoutUser } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [manualTickets, setManualTickets] = useState([])
  const [activeTickets, setActiveTickets] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [completeModal, setCompleteModal] = useState(null)
  const [toast, setToast] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [secondsSince, setSecondsSince] = useState(0)
  const pollRef = useRef(null)
  const countRef = useRef(null)
  const POLL_INTERVAL = 30

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 5000) }

  useEffect(() => {
    fetchAll()
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL * 1000)
    return () => { clearInterval(pollRef.current); clearInterval(countRef.current) }
  }, [])

  useEffect(() => {
    clearInterval(countRef.current)
    if (!lastUpdated) return
    setSecondsSince(0)
    countRef.current = setInterval(() => setSecondsSince(s => s + 1), 1000)
    return () => clearInterval(countRef.current)
  }, [lastUpdated])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [pendingRes, usersRes, activeRes, statsRes] = await Promise.all([
        getPendingTickets(), getUsers(),
        getAllTickets({ status: 'active' }), getPortalStats(),
      ])
      const all = pendingRes.data
      setPending(all.filter(t => t.status === 'pending_approval'))
      setManualTickets(all.filter(t => ['pending_manual_setup','in_progress'].includes(t.status)))
      setUsers(usersRes.data)
      setActiveTickets(activeRes.data)
      setStats(statsRes.data)
      setLastUpdated(new Date())
    } catch { showToast('Failed to load data', 'error') }
    finally { setLoading(false) }
  }

  const handleApprove = async (id, num) => {
    setActionLoading(id)
    try { const res = await approveTicket(id); showToast(res.data.message || `${num} approved`); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to approve', 'error') }
    finally { setActionLoading(null) }
  }

  const handleReject = async (id, num, reason) => {
    setActionLoading(id)
    try { await rejectTicket(id, reason || 'Rejected by admin'); showToast(`${num} rejected`); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to reject', 'error') }
    finally { setActionLoading(null) }
  }

  const handleMarkInProgress = async (id, num) => {
    setActionLoading(id)
    try { await markInProgress(id); showToast(`${num} marked in progress`); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to update', 'error') }
    finally { setActionLoading(null) }
  }

  const handleManualDone = (msg) => { setCompleteModal(null); showToast(msg); fetchAll() }

  const handleDestroy = async (id, num) => {
    setActionLoading(id)
    try { await destroyEnvironment(id); showToast(`${num} destroy initiated`); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to destroy', 'error') }
    finally { setActionLoading(null) }
  }

  const handleRoleChange = async (userId, newRole) => {
    try { await updateUserRole(userId, newRole); showToast('Role updated'); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to update role', 'error') }
  }

  const handleDeactivate = async (userId) => {
    try { await deactivateUser(userId); showToast('User deactivated'); fetchAll() }
    catch (err) { showToast(err.response?.data?.detail || 'Failed to deactivate user', 'error') }
  }

  const badgeCount = { pending: pending.length, manual: manualTickets.length, active: activeTickets.length, users: users.length }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #E0E0E0', borderTop: '2.5px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif", background: '#F3F4F6', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes cpulse { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { transform: translateY(5px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #DDD; border-radius: 4px; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #185FA5 !important; box-shadow: 0 0 0 2px rgba(24,95,165,0.1); }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 200, background: '#fff', borderRight: '0.5px solid #E8E8E8', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px 12px', borderBottom: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#185FA5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>Cloud Portal</div>
            <div style={{ fontSize: 10, color: '#AAA' }}>Admin workspace</div>
          </div>
        </div>

        <div style={{ padding: '10px 8px', flex: 1 }}>
          <div style={{ fontSize: 10, color: '#CCC', padding: '6px 8px 3px', letterSpacing: '0.07em', fontWeight: 600 }}>QUEUE</div>
          {TABS.slice(0, 2).map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 6,
              fontSize: 12, color: tab === t.id ? '#185FA5' : '#777',
              background: tab === t.id ? '#E6F1FB' : 'transparent',
              cursor: 'pointer', marginBottom: 1, transition: 'background 0.12s',
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
              {badgeCount[t.id] > 0 && (
                <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 8, background: t.id === 'manual' ? '#FCEBEB' : '#FAEEDA', color: t.id === 'manual' ? '#791F1F' : '#633806' }}>
                  {badgeCount[t.id]}
                </span>
              )}
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#CCC', padding: '10px 8px 3px', letterSpacing: '0.07em', fontWeight: 600 }}>MANAGE</div>
          {TABS.slice(2).map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 6,
              fontSize: 12, color: tab === t.id ? '#185FA5' : '#777',
              background: tab === t.id ? '#E6F1FB' : 'transparent',
              cursor: 'pointer', marginBottom: 1, transition: 'background 0.12s',
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
              {badgeCount[t.id] > 0 && (
                <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 8, background: '#E6F1FB', color: '#0C447C' }}>
                  {badgeCount[t.id]}
                </span>
              )}
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#CCC', padding: '10px 8px 3px', letterSpacing: '0.07em', fontWeight: 600 }}>USER PANEL</div>
          <div onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 6, fontSize: 12, color: '#777', cursor: 'pointer', marginBottom: 1 }}>
            <span style={{ fontSize: 12 }}>←</span> My environments
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderTop: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D6E9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#185FA5', flexShrink: 0 }}>
            {(user?.full_name || user?.email || 'A').slice(0,2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || 'Admin'}</div>
            <div style={{ fontSize: 10, color: '#AAA' }}>admin</div>
          </div>
          <button onClick={logoutUser} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CCC', fontSize: 14, padding: 2 }}>⏏</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ padding: '12px 20px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{TABS.find(t => t.id === tab)?.label}</div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>
              Cloud Portal admin panel · ap-south-1
              {lastUpdated && (
                <span style={{ marginLeft: 8 }}>
                  · updated {secondsSince < 5 ? 'just now' : `${secondsSince}s ago`}
                  <span style={{ marginLeft: 6, color: '#CCC' }}>· next in {POLL_INTERVAL - (secondsSince % POLL_INTERVAL)}s</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={() => { fetchAll(); setSecondsSince(0) }} style={{ fontSize: 11, padding: '5px 12px', borRadius: 5, border: '0.5px solid #DCDCDC', color: '#666', background: 'transparent', cursor: 'pointer' }}>Refresh</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {toast && (
            <div style={{
              position: 'fixed', top: 16, right: 16, zIndex: 300,
              padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: toast.type === 'error' ? '#FCEBEB' : '#D4EDB8',
              color: toast.type === 'error' ? '#791F1F' : '#27500A',
              border: `0.5px solid ${toast.type === 'error' ? '#FBBCBC' : '#A8D98A'}`,
              animation: 'fadeUp 0.2s ease', boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            }}>
              {toast.msg}
            </div>
          )}

          {tab === 'pending' && <PendingTab tickets={pending} onApprove={handleApprove} onReject={handleReject} actionLoading={actionLoading} />}
          {tab === 'manual'  && <ManualTab tickets={manualTickets} onMarkInProgress={handleMarkInProgress} onComplete={setCompleteModal} actionLoading={actionLoading} />}
          {tab === 'active'  && <ActiveTab tickets={activeTickets} onDestroy={handleDestroy} actionLoading={actionLoading} onView={id => navigate(`/tickets/${id}`)} />}
          {tab === 'users'   && <UsersTab users={users} onRoleChange={handleRoleChange} onDeactivate={handleDeactivate} />}
          {tab === 'audit'   && <AuditTab />}
          {tab === 'stats'   && <StatsTab stats={stats} />}
        </div>
      </div>

      {completeModal && <CompleteModal ticket={completeModal} onClose={() => setCompleteModal(null)} onDone={handleManualDone} />}
    </div>
  )
}
